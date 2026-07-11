#!/usr/bin/env python3
"""Check safetensors tensor shapes vs GGUF tensor shapes."""
from safetensors.numpy import load_file
import gguf
import json

# Read safetensors
tensors = load_file(r'd:\code\DAFWorkspace\local-models\litex\adapter_model.safetensors')
print(f"Total safetensors tensors: {len(tensors)}")

# Read config
with open(r'd:\code\DAFWorkspace\local-models\litex\adapter_config.json', 'r') as f:
    config = json.load(f)
print(f"Config: alpha={config.get('lora_alpha')}, rank={config.get('r')}, modules={config.get('target_modules')}")

# Show a few safetensors tensors
print("\n--- Safetensors Tensors (first 8) ---")
for name in sorted(tensors.keys())[:8]:
    t = tensors[name]
    print(f"  {name}: shape={t.shape} dtype={t.dtype}")

# Read GGUF
reader = gguf.GGUFReader(r'd:\code\DAFWorkspace\resources\local-models\litex-lora.gguf')
print(f"\n--- GGUF Tensors (first 8) ---")
for tensor in reader.tensors[:8]:
    print(f"  {tensor.name}: shape={tensor.shape} type={tensor.tensor_type}")

# Compare specific tensors
print("\n--- Shape Comparison (blk.0.attn_q) ---")
for suffix in ['lora_a', 'lora_b']:
    safetensor_key = f"base_model.model.model.layers.0.self_attn.q_proj.lora_{'A' if suffix == 'lora_a' else 'B'}.weight"
    gguf_name = f"blk.0.attn_q.weight.{suffix}"
    if safetensor_key in tensors:
        st_shape = tensors[safetensor_key].shape
    else:
        st_shape = "NOT FOUND"
    gguf_shape = None
    for t in reader.tensors:
        if t.name == gguf_name:
            gguf_shape = t.shape
            break
    print(f"  {suffix}:")
    print(f"    safetensors ({safetensor_key}): {st_shape}")
    print(f"    gguf        ({gguf_name}): {gguf_shape}")
    if st_shape != "NOT FOUND" and gguf_shape is not None:
        if list(st_shape) == list(gguf_shape):
            print(f"    MATCH: shapes are identical (NO transpose was applied)")
        elif list(st_shape)[::-1] == list(gguf_shape):
            print(f"    TRANSPOSED: gguf shape is reversed from safetensors")
        else:
            print(f"    MISMATCH: shapes don't match in either order")

# Base model shape for reference
base_reader = gguf.GGUFReader(r"C:\Users\65411\AppData\Roaming\xcomputer\local-models\Qwen3-4B-Instruct-2507-Q4_K_M.gguf")
print("\n--- Base Model Tensor (blk.0.attn_q.weight) ---")
for t in base_reader.tensors:
    if t.name == "blk.0.attn_q.weight":
        print(f"  {t.name}: shape={t.shape} type={t.tensor_type}")
        break
