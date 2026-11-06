#!/bin/bash
cd "$(dirname "$0")"

MODEL="Qwen3-4B-Instruct-2507-Q4_K_M.gguf"

./llamafile-0.10.6.exe --server --jinja -c 16384 --mlock --parallel 1 --model "$MODEL"
