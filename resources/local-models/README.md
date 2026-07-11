# Local Models Resources

This directory is packaged into the app's `resources/local-models/` via electron-builder `extraResources`.

## litex-lora.gguf

The litex LoRA adapter (GGUF format) should be placed here as `litex-lora.gguf`.

The LoRA is currently stored at the repo root in `local-models/litex/adapter_model.safetensors` (safetensors format, 189 MB).
It needs to be converted to GGUF via llama.cpp's `convert_lora_to_gguf.py` before being placed here.

When `litex-lora.gguf` is absent, `LocalModelManager` runs the base model (Qwen3-4B) without LoRA — the app still works.
