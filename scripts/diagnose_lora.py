#!/usr/bin/env python3
"""Comprehensive LoRA GGUF diagnosis: compare LoRA tensor names with base model."""
import gguf
import numpy as np
from pathlib import Path

LORA_PATH = Path(r"d:\code\DAFWorkspace\resources\local-models\litex-lora.gguf")
# Base model path — check common locations
import os
base_candidates = [
    Path(os.environ.get("APPDATA", "")) / "xcomputer" / "local-models" / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    Path(os.environ.get("LOCALAPPDATA", "")) / "xcomputer" / "local-models" / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
]
BASE_PATH = None
for p in base_candidates:
    if p.exists():
        BASE_PATH = p
        break

print("=" * 60)
print("LoRA GGUF Diagnosis")
print("=" * 60)

# ─── Read LoRA GGUF ───────────────────────────────────────
print(f"\nLoRA file: {LORA_PATH}")
print(f"LoRA size: {LORA_PATH.stat().st_size / 1024 / 1024:.1f} MB")
reader = gguf.GGUFReader(str(LORA_PATH))

print(f"\n--- LoRA Metadata ---")
for name, field in reader.fields.items():
    # Use gguf reader's built-in method to get value
    val = None
    try:
        if len(field.parts) > 0:
            t = field.types[0]
            if t == gguf.GGUFValueType.STRING:
                # String: last part contains the bytes
                val = bytes(field.parts[-1]).decode('utf-8', errors='replace')
            elif t == gguf.GGUFValueType.UINT32:
                val = int(field.parts[-1][0]) if len(field.parts[-1]) > 0 else None
            elif t == gguf.GGUFValueType.ARRAY:
                val = f"[array of {len(field.parts)} parts]"
            else:
                val = f"[type={t}]"
    except Exception as e:
        val = f"<error: {e}>"
    print(f"  {name}: {val}")

print(f"\n--- LoRA Tensors ({len(reader.tensors)}) ---")
lora_tensor_names = set()
for tensor in reader.tensors:
    lora_tensor_names.add(tensor.name)
    if tensor.name.startswith("blk.0."):
        print(f"  {tensor.name}: shape={tensor.shape} type={tensor.tensor_type} dtype={tensor.tensor_type}")

# Show unique module types (strip layer index)
print(f"\n--- LoRA Unique Tensor Name Patterns ---")
import re
patterns = set()
for name in sorted(lora_tensor_names):
    pattern = re.sub(r'blk\.\d+\.', 'blk.N.', name)
    patterns.add(pattern)
for p in sorted(patterns):
    print(f"  {p}")

# ─── Read Base Model GGUF (just tensor names) ─────────────
if BASE_PATH:
    print(f"\n{'=' * 60}")
    print(f"Base model: {BASE_PATH}")
    print(f"Base size: {BASE_PATH.stat().st_size / 1024 / 1024:.1f} MB")
    base_reader = gguf.GGUFReader(str(BASE_PATH))

    print(f"\n--- Base Model Metadata (key fields) ---")
    for name in ['general.architecture', 'general.name', 'tokenizer.ggml.model']:
        if name in base_reader.fields:
            field = base_reader.fields[name]
            try:
                val = bytes(field.parts[-1]).decode('utf-8', errors='replace')
                print(f"  {name}: {val}")
            except:
                print(f"  {name}: <read error>")

    print(f"\n--- Base Model Tensors ({len(base_reader.tensors)}) ---")
    base_tensor_names = set()
    for tensor in base_reader.tensors:
        base_tensor_names.add(tensor.name)
        if tensor.name.startswith("blk.0."):
            print(f"  {tensor.name}: shape={tensor.shape} type={tensor.tensor_type}")

    print(f"\n--- Base Model Unique Tensor Name Patterns ---")
    base_patterns = set()
    for name in sorted(base_tensor_names):
        pattern = re.sub(r'blk\.\d+\.', 'blk.N.', name)
        base_patterns.add(pattern)
    for p in sorted(base_patterns):
        print(f"  {p}")

    # ─── Compare ──────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print("Compatibility Check")
    print("=" * 60)

    # For each LoRA tensor, check if the corresponding base model tensor exists
    # LoRA tensor: blk.N.attn_q.weight.lora_a → base tensor: blk.N.attn_q.weight
    print(f"\n--- LoRA → Base Model Tensor Matching ---")
    matched = 0
    unmatched = 0
    for lora_name in sorted(lora_tensor_names):
        # Strip .lora_a / .lora_b to get base tensor name
        base_name = re.sub(r'\.lora_[ab]$', '', lora_name)
        if base_name in base_tensor_names:
            matched += 1
        else:
            unmatched += 1
            if unmatched <= 5:
                print(f"  UNMATCHED: {lora_name} → expected base: {base_name}")

    print(f"\n  Matched: {matched}")
    print(f"  Unmatched: {unmatched}")

    # Check shape compatibility for a few tensors
    print(f"\n--- Shape Compatibility (blk.0) ---")
    base_tensors_by_name = {t.name: t for t in base_reader.tensors}
    for lora_tensor in reader.tensors:
        if not lora_tensor.name.startswith("blk.0."):
            continue
        base_name = re.sub(r'\.lora_[ab]$', '', lora_tensor.name)
        if base_name in base_tensors_by_name:
            base_t = base_tensors_by_name[base_name]
            print(f"  {lora_tensor.name}: lora_shape={lora_tensor.shape}")
            print(f"    → {base_name}: base_shape={base_t.shape}")
else:
    print("\n[WARN] Base model not found in standard locations")
    print("Checked:")
    for p in base_candidates:
        print(f"  {p}")
