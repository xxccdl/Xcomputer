#!/usr/bin/env python3
"""Verify the generated LoRA GGUF file."""
import gguf

path = r"d:\code\DAFWorkspace\resources\local-models\litex-lora.gguf"
reader = gguf.GGUFReader(path)

print("=== Metadata ===")
for name, field in reader.fields.items():
    # Read the first part as the value
    parts = field.parts
    if len(parts) == 0:
        continue
    try:
        if field.types[0] == gguf.GGUFValueType.STRING:
            # String: parts[0] is the offset, rest is data
            val = bytes(parts[1]).decode('utf-8', errors='replace') if len(parts) > 1 else ''
            print(f"  {name}: {val}")
        elif field.types[0] == gguf.GGUFValueType.UINT32:
            import numpy as np
            val = int(np.frombuffer(parts[1].tobytes() if len(parts) > 1 else b'\x00\x00\x00\x00', dtype=np.uint32)[0]) if len(parts) > 1 else 0
            print(f"  {name}: {val}")
    except Exception as e:
        print(f"  {name}: <error: {e}>")

print(f"\n=== Tensors ({len(reader.tensors)}) ===")
for tensor in reader.tensors[:10]:
    print(f"  {tensor.name}: shape={tensor.shape} type={tensor.tensor_type}")
if len(reader.tensors) > 10:
    print(f"  ... and {len(reader.tensors) - 10} more")
