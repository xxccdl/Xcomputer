#!/usr/bin/env python3
"""Check the exact architecture string for Qwen3."""
import gguf

# Print the architecture name strings
print("=== MODEL_ARCH_NAMES ===")
arch_names = gguf.MODEL_ARCH_NAMES
for arch, name in arch_names.items():
    if 'qwen' in name.lower() or 'llama' == name:
        print(f"  {arch} -> '{name}'")

# Check if GGUFWriter accepts arch as string
print("\n=== GGUFWriter signature ===")
import inspect
sig = inspect.signature(gguf.GGUFWriter.__init__)
print(f"  {sig}")
