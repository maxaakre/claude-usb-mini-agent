@echo off
cd /d "%~dp0"

set "MODEL=Qwen3-4B-Instruct-2507-Q4_K_M.gguf"

rem Hittar bade llamafile.exe och versionsnamn som llamafile-0.10.6.exe
set "ENGINE="
for %%f in (llamafile*.exe) do if not defined ENGINE set "ENGINE=%%f"
if not defined ENGINE (
  echo Hittar ingen llamafile*.exe i %CD%
  pause
  exit /b 1
)

"%ENGINE%" --server --jinja -c 16384 --mlock --parallel 1 --model "%MODEL%"
pause
