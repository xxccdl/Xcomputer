#!/usr/bin/env python3
"""
Inspect the raw binary format of the LoRA GGUF file.
Reads tensor info headers manually to check the type field.
"""
import struct
from pathlib import Path

GGUF_PATH = Path(r"d:\code\DAFWorkspace\resources\local-models\litex-lora.gguf")

# GGUF magic = "GGUF" = 0x46554747
GGUF_MAGIC = 0x46554747

# GGUF value types
GGUF_TYPE_NAMES = {
    0: "UINT8", 1: "INT8", 2: "UINT16", 3: "INT16",
    4: "UINT32", 5: "INT32", 6: "FLOAT32", 7: "BOOL",
    8: "STRING", 9: "ARRAY", 10: "UINT64", 11: "INT64",
    12: "FLOAT64",
}

# GGML type names (for tensor types)
GGML_TYPE_NAMES = {
    0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1",
    6: "Q5_0", 7: "Q5_1", 8: "Q8_0", 9: "Q8_1",
    10: "Q2_K", 11: "Q3_K", 12: "Q4_K", 13: "Q5_K",
    14: "Q6_K", 15: "Q8_K", 16: "IQ2_XXS", 17: "IQ2_XS",
    24: "I8", 25: "I16", 26: "I32", 27: "I64",
    28: "F64", 30: "BF16",
}

def read_gguf_raw(path):
    with open(path, "rb") as f:
        data = f.read()

    offset = 0

    # 1. Magic (4 bytes)
    magic = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    print(f"Magic: 0x{magic:08X} ({'GGUF' if magic == GGUF_MAGIC else 'UNKNOWN'})")

    # 2. Version (4 bytes)
    version = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    print(f"Version: {version}")

    # 3. Tensor count (8 bytes, uint64)
    tensor_count = struct.unpack_from("<Q", data, offset)[0]
    offset += 8
    print(f"Tensor count: {tensor_count}")

    # 4. KV count (8 bytes, uint64)
    kv_count = struct.unpack_from("<Q", data, offset)[0]
    offset += 8
    print(f"KV count: {kv_count}")

    # 5. Read KV pairs
    print(f"\n=== KV Metadata (offset {offset}) ===")
    for i in range(kv_count):
        # Key: length (uint64) + bytes
        key_len = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        key = data[offset:offset+key_len].decode('utf-8', errors='replace')
        offset += key_len

        # Value type (uint32)
        vtype = struct.unpack_from("<I", data, offset)[0]
        offset += 4

        type_name = GGUF_TYPE_NAMES.get(vtype, f"UNKNOWN({vtype})")

        if vtype == 8:  # STRING
            val_len = struct.unpack_from("<Q", data, offset)[0]
            offset += 8
            val = data[offset:offset+val_len].decode('utf-8', errors='replace')
            offset += val_len
            print(f"  [{i}] {key} = \"{val}\" (type={type_name})")
        elif vtype == 4:  # UINT32
            val = struct.unpack_from("<I", data, offset)[0]
            offset += 4
            print(f"  [{i}] {key} = {val} (type={type_name})")
        elif vtype == 5:  # INT32
            val = struct.unpack_from("<i", data, offset)[0]
            offset += 4
            print(f"  [{i}] {key} = {val} (type={type_name})")
        elif vtype == 7:  # BOOL
            val = data[offset]
            offset += 1
            print(f"  [{i}] {key} = {bool(val)} (type={type_name})")
        elif vtype == 6:  # FLOAT32
            val = struct.unpack_from("<f", data, offset)[0]
            offset += 4
            print(f"  [{i}] {key} = {val} (type={type_name})")
        elif vtype == 10:  # UINT64
            val = struct.unpack_from("<Q", data, offset)[0]
            offset += 8
            print(f"  [{i}] {key} = {val} (type={type_name})")
        elif vtype == 2:  # UINT16
            val = struct.unpack_from("<H", data, offset)[0]
            offset += 2
            print(f"  [{i}] {key} = {val} (type={type_name})")
        elif vtype == 0:  # UINT8
            val = data[offset]
            offset += 1
            print(f"  [{i}] {key} = {val} (type={type_name})")
        elif vtype == 9:  # ARRAY
            arr_type = struct.unpack_from("<I", data, offset)[0]
            offset += 4
            arr_len = struct.unpack_from("<Q", data, offset)[0]
            offset += 8
            arr_type_name = GGUF_TYPE_NAMES.get(arr_type, f"UNKNOWN({arr_type})")
            print(f"  [{i}] {key} = ARRAY[{arr_type_name}] len={arr_len} (skipping)")
            # Skip array data based on type
            elem_sizes = {0:1, 1:1, 2:2, 3:2, 4:4, 5:4, 6:4, 7:1, 10:8, 11:8, 12:8}
            if arr_type == 8:  # STRING array
                for _ in range(arr_len):
                    slen = struct.unpack_from("<Q", data, offset)[0]
                    offset += 8
                    offset += slen
            elif arr_type in elem_sizes:
                offset += arr_len * elem_sizes[arr_type]
            else:
                print(f"    (Cannot skip array type {arr_type}, stopping)")
                return
        else:
            print(f"  [{i}] {key} = ??? (type={type_name}, unhandled, stopping)")
            return

    # 6. Read tensor info
    print(f"\n=== Tensor Info (offset {offset}) ===")
    for i in range(min(tensor_count, 5)):
        ti_start = offset

        # Name: length (uint64) + bytes
        name_len = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        name = data[offset:offset+name_len].decode('utf-8', errors='replace')
        offset += name_len

        # n_dims (uint32)
        n_dims = struct.unpack_from("<I", data, offset)[0]
        offset += 4

        # dims (n_dims * uint64)
        dims = []
        for d in range(n_dims):
            dim = struct.unpack_from("<Q", data, offset)[0]
            offset += 8
            dims.append(dim)

        # type (uint32) — THIS IS THE CRITICAL FIELD
        tensor_type = struct.unpack_from("<I", data, offset)[0]
        offset += 4

        # offset (uint64)
        tensor_offset = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        type_name = GGML_TYPE_NAMES.get(tensor_type, f"UNKNOWN({tensor_type})")
        print(f"  [{i}] \"{name}\"")
        print(f"      n_dims={n_dims}, dims={dims}, type={tensor_type}({type_name}), offset={tensor_offset}")
        print(f"      raw bytes at type field: {data[offset-12:offset-8].hex()}")

    print(f"\n  ... ({tensor_count - 5} more tensors)")
    print(f"\n  Tensor info section ends at offset {offset}")
    print(f"  Total file size: {len(data)}")

if __name__ == "__main__":
    read_gguf_raw(GGUF_PATH)
