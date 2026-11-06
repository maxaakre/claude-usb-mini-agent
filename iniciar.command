#!/bin/bash
cd "$(dirname "$0")"

MODEL="Qwen3-4B-Instruct-2507-Q4_K_M.gguf"

# Hittar både llamafile.exe och versionsnamn som llamafile-0.10.6.exe
ENGINE="$(ls llamafile*.exe 2>/dev/null | head -n 1)"
if [ -z "$ENGINE" ]; then
  echo "Hittar ingen llamafile*.exe i $PWD" >&2
  exit 1
fi

# exec: llamafile tar över skriptets PID, så kod.command kan stänga servern
exec "./$ENGINE" --server --jinja -c 16384 --mlock --parallel 1 --model "$MODEL"
