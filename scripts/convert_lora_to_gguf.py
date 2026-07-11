#!/usr/bin/env python3
"""
将 PEFT safetensors 格式的 LoRA 适配器转换为 GGUF 格式。
不依赖 torch/transformers，仅用 safetensors(numpy) + gguf。

用法: python convert_lora_to_gguf.py
输入: local-models/litex/adapter_model.safetensors
输出: resources/local-models/litex-lora.gguf
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from safetensors.numpy import load_file
import gguf

# ─── 路径 ───────────────────────────────────────────────────
LORA_DIR = Path(r"d:\code\DAFWorkspace\local-models\litex")
SAFETENSORS_PATH = LORA_DIR / "adapter_model.safetensors"
CONFIG_PATH = LORA_DIR / "adapter_config.json"
OUTPUT_PATH = Path(r"d:\code\DAFWorkspace\resources\local-models\litex-lora.gguf")

# ─── PEFT → GGUF 张量名映射 ─────────────────────────────────
# PEFT: base_model.model.model.layers.{N}.self_attn.{module}.lora_{A,B}.weight
# GGUF: blk.{N}.{gguf_module}.weight.lora_{a,b}
MODULE_MAP = {
    "q_proj":    "attn_q",
    "k_proj":    "attn_k",
    "v_proj":    "attn_v",
    "o_proj":    "attn_output",
    "gate_proj": "ffn_gate",
    "up_proj":   "ffn_up",
    "down_proj": "ffn_down",
}

# 正则：提取 layer index 和 module name
TENSOR_RE = re.compile(
    r"base_model\.model\.model\.layers\.(\d+)\."
    r"(?:self_attn|mlp)\."
    r"(\w+)\."
    r"lora_([AB])\.weight"
)


def convert_tensor_name(peft_name: str) -> str | None:
    """将 PEFT 张量名转换为 GGUF 张量名。"""
    m = TENSOR_RE.match(peft_name)
    if not m:
        return None
    layer_idx, module, ab = m.group(1), m.group(2), m.group(3)
    gguf_module = MODULE_MAP.get(module)
    if gguf_module is None:
        print(f"  [WARN] 未知 module: {module}，跳过")
        return None
    lora_ab = "lora_a" if ab == "A" else "lora_b"
    return f"blk.{layer_idx}.{gguf_module}.weight.{lora_ab}"


def main():
    # 读取 adapter_config.json
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)
    lora_alpha = config.get("lora_alpha", 32)
    lora_rank = config.get("r", 24)
    target_modules = config.get("target_modules", [])
    print(f"LoRA config: alpha={lora_alpha}, rank={lora_rank}, modules={target_modules}")

    # 读取 safetensors
    print(f"Loading safetensors: {SAFETENSORS_PATH}")
    tensors = load_file(str(SAFETENSORS_PATH))
    print(f"Loaded {len(tensors)} tensors")

    # 创建 GGUF writer
    # Qwen3 在 llama.cpp 中使用 "qwen3" 架构，LoRA 必须与基座模型架构一致
    writer = gguf.GGUFWriter(str(OUTPUT_PATH), "qwen3")

    # 写入元数据
    # 注意：llama.cpp 的 llama_adapter_lora_init_impl 通过 gguf_get_val_f32() 读取 alpha，
    # 底层 get_val<float>() 会断言 type == GGUF_TYPE_FLOAT32。
    # 若用 add_uint32 写入，C++ 侧断言失败 → 原生崩溃 (0xC0000409)。
    # rank 在 C++ 侧不读取（从张量形状推断），用 uint32 安全。
    writer.add_string("general.name", "litex-lora")
    writer.add_string("general.description", "litex LoRA adapter for Qwen3-4B-Instruct-2507")
    writer.add_string("general.type", "adapter")
    writer.add_string("adapter.type", "lora")
    writer.add_float32("adapter.lora.alpha", float(lora_alpha))
    writer.add_uint32("adapter.lora.rank", lora_rank)

    # 转换并添加张量
    converted = 0
    skipped = 0
    for peft_name, tensor_data in sorted(tensors.items()):
        gguf_name = convert_tensor_name(peft_name)
        if gguf_name is None:
            skipped += 1
            continue

        # safetensors 的 numpy 数量 → 确保是 float32
        if tensor_data.dtype != np.float32:
            tensor_data = tensor_data.astype(np.float32)

        # GGUF 中 lora_a 形状 (rank, in_features)，lora_b 形状 (out_features, rank)
        # 与 PyTorch 的 Linear 权重一致，无需转置
        writer.add_tensor(gguf_name, tensor_data)
        converted += 1

    print(f"Converted: {converted}, Skipped: {skipped}")

    # 写入文件
    print(f"Writing GGUF to: {OUTPUT_PATH}")
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()

    file_size = OUTPUT_PATH.stat().st_size
    print(f"Done! Output size: {file_size / 1024 / 1024:.1f} MB ({file_size} bytes)")


if __name__ == "__main__":
    main()
