#!/usr/bin/env python3
"""Inspect LoRA safetensors file: list tensor names, shapes, and adapter config."""
import json
import sys
from pathlib import Path
from safetensors.torch import safe_open

lora_dir = Path(r"d:\code\DAFWorkspace\local-models\litex")
safetensors_path = lora_dir / "adapter_model.safetensors"
config_path = lora_dir / "adapter_config.json"

# Print adapter config
with open(config_path, "r", encoding="utf-8") as f:
    config = json.load(f)
print("=== Adapter Config ===")
print(json.dumps(config, indent=2))

# Print tensor info
print("\n=== Tensors ===")
with safe_open(str(safetensors_path), framework="pt") as f:
    keys = list(f.keys())
    print(f"Total tensors: {len(keys)}")
    for k in sorted(keys)[:30]:
        t = f.get_tensor(k)
        print(f"  {k}: {t.shape} dtype={t.dtype}")
    if len(keys) > 30:
        print(f"  ... and {len(keys) - 30} more")
        # Show a few more from the end
        for k in sorted(keys)[-5:]:
            t = f.get_tensor(k)
            print(f"  {k}: {t.shape} dtype={t.dtype}")
