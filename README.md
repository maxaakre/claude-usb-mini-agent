# CLAUDEUSB – Local AI on a USB stick

A portable, fully local AI assistant that runs from a USB stick. The model runs on your own computer – nothing is sent to the internet, and your code never leaves the machine.

It consists of two parts:

1. **The server** – runs the AI model and provides both a web chat and an OpenAI-compatible API.
2. **The agent** – a small Node script that lets the model read, search and (with your approval) modify files in a project folder.

---

## Required downloads

The model files are too large to ship with the scripts, so they must be downloaded separately and placed in the root of the stick (next to `iniciar.command`).

| What | Where to download | File |
|---|---|---|
| **AI model (required)** | [unsloth/Qwen3-4B-Instruct-2507-GGUF](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/tree/main) | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` (~2.5 GB) |
| **AI engine (required)** | [llamafile releases](https://github.com/mozilla-ai/llamafile/releases) – pick the latest | `llamafile-<version>` – add `.exe` to the name, e.g. `llamafile.exe` |

On the Hugging Face page, open **Files and versions** and download the file ending in **`Q4_K_M.gguf`**. Or download it straight to the stick from Terminal:

```bash
cd /Volumes/CLAUDEUSB
curl -L -o Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
V=$(curl -s https://api.github.com/repos/mozilla-ai/llamafile/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
curl -L -o llamafile.exe \
  https://github.com/mozilla-ai/llamafile/releases/download/$V/llamafile-$V
chmod +x llamafile.exe
```

> On the llamafile releases page, download the asset named just **`llamafile-<version>`** (e.g. `llamafile-0.10.6`) – not `llamafile-thin`, `localscore` or the other tools. The name must start with `llamafile` and end with `.exe`, for example `llamafile.exe` or `llamafile-0.10.6.exe`. The start scripts find the file by that pattern, and `.exe` lets it run on Windows. Keep only one version on the stick.
>
> Download the **`.gguf`** file – not the `.safetensors` files from the original Qwen repository, which llamafile can't read.

---

## Quick start

### Work with code (the model can access a project)

```bash
cd /path/to/your/repo
kod
```

`kod` works on the folder you are standing in. It needs this line in `~/.zshrc`:

```bash
alias kod='/Volumes/CLAUDEUSB/kod.command'
```

You can also pass a folder: `kod /path/to/your/repo`. Wait until the `Du>` prompt appears and type your question. Quit with `exit` – this also shuts down the server.

### Switch between repos

You don't need to start the server yourself. `kod` checks if the server is running and only starts it if needed.

**Simplest: restart with `kod`**

```bash
exit                # in the agent, also shuts down the server
cd /path/to/another/repo
kod                 # starts the server again
```

The downside is that the model reloads every time you switch repo.

**Faster: keep the server running**

1. Start the server in its own terminal and leave it open:

   ```bash
   cd /Volumes/CLAUDEUSB && ./iniciar.command
   ```

2. Run `kod` in another terminal:

   ```bash
   cd /path/to/another/repo
   kod
   ```

Now `kod` reuses the running server, and `exit` only closes the agent. The model does not reload. When you are done, stop the server with `Ctrl+C` in its terminal.

**Several repos at the same time:** use the faster way. Otherwise the server shuts down when you exit the `kod` that started it, and the other agents stop working.

### Just chat in the browser

```bash
/Volumes/CLAUDEUSB/iniciar.command
```

(or double-click `iniciar.command` in Finder), then open **http://localhost:8080**. Stop it with `Ctrl+C` in Terminal.

> The web chat has **no** file access. If you want the model to read your code, you must use the agent (`kod.command`).

---

## Contents of the stick

| File | What it does |
|---|---|
| `llamafile*.exe` | The AI engine itself (llama.cpp packaged as a single file that runs on Mac, Windows and Linux). |
| `qwen3-4b-thinking-2507.Q4_K_M.gguf` | Model that "thinks" before answering – slower but better at code review and bug hunting. |
| `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | Model without thinking – answers quickly, good for explanations and simple questions. |
| `iniciar.command` | Starts the server on Mac. This is where you choose which model is used. |
| `iniciar.bat` | Starts the server on Windows. |
| `kod.command` | Starts the server (if it isn't already running) and then the agent against a project folder. |
| `agent.mjs` | The code agent – gives the model tools to read and modify files. |
| `server.log` | The server's log when started via `kod.command`. Look here if something goes wrong. |

---

## How it's built

### 1. The stick – formatted as exFAT

The stick was originally FAT32, which can't handle files larger than 4 GB. AI models are often larger than that, so it was reformatted to **exFAT**, which supports large files and works on both Mac and Windows:

```bash
diskutil eraseDisk ExFAT CLAUDEUSB MBR /dev/disk12
```

> Find the disk number (`disk12`) with `diskutil list` – look for the disk marked `external, physical` and about 31 GB. **Always double-check the number before erasing.**

### 2. The engine – llamafile

[llamafile](https://github.com/mozilla-ai/llamafile) from Mozilla is llama.cpp packaged as a single executable that works across operating systems. It runs the model and starts a server with:

- a **web chat** at `http://localhost:8080`
- an **OpenAI-compatible API** at `http://localhost:8080/v1`

On Macs with Apple Silicon the GPU (Metal) is used automatically.

### 3. The models – GGUF files

Models are downloaded from [Hugging Face](https://huggingface.co) in **GGUF** format (not `.safetensors`, which is for Python). `Q4_K_M` is a quantization level that gives a good balance between size and quality.

### 4. The start script – `iniciar.command`

```bash
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
```

| Flag | Meaning |
|---|---|
| `--server` | Starts the web chat + API instead of a terminal chat. |
| `--jinja` | Enables tool calling (required for the agent). |
| `-c 16384` | Context window of 16,384 tokens – how much text/code fits in one conversation. |
| `--mlock` | Loads the whole model into RAM up front instead of continuously reading from the slow stick. |
| `--parallel 1` | One request at a time – saves memory. |

`exec` replaces the script with llamafile, so they share one process. That is what lets `kod.command` shut the server down.

### 5. The agent – `agent.mjs`

A Node script (Node 18+, no npm packages) that talks to the server through the API and gives the model four tools:

| Tool | What it does |
|---|---|
| `list_files` | Lists files and folders. |
| `read_file` | Reads a file (max 40,000 characters – longer files are cut off). |
| `search` | Searches for text across all files. |
| `write_file` | Writes a file – **shows the content and requires you to answer `j` (yes)** first. Refuses to overwrite files over 40,000 characters, because the model can't see all of them. |

How it works:

1. You ask a question.
2. The model decides which tools it needs and calls them (shown as grey `↳` lines).
3. The results are sent back to the model, which continues until it has an answer (max 15 steps per question).

**Security:** the agent can only access files **inside** the folder you specify. Attempts to reach outside it (e.g. `../../` or a symlink that points out of the folder) are denied. `search` and recursive listing skip symlinks. Folders such as `node_modules`, `.git`, `dist` and `build` are ignored.

The project's full file list is included in the model's instructions, so it knows right away which files exist.

> The agent's interface is in Swedish: `Du>` means "You>", `AI>` is the answer, and `Godkänn? (j/n)` means "Approve? (y/n)" – answer `j` or `y` to approve.

### 6. All-in-one – `kod.command`

```bash
#!/bin/bash
PROJEKT="$(cd "${1:-$PWD}" && pwd)" || exit 1
cd "$(dirname "$0")"

TIMEOUT=300 # sekunder – modellen läses från ett långsamt USB-minne

# Klar = status ok och ett modell-API. En server som laddar svarar 503,
# och en annan app på porten saknar /v1/models.
server_ready() {
  curl -s --max-time 2 localhost:8080/health | grep -Eq '"status" *: *"ok"' &&
    curl -s --max-time 2 localhost:8080/v1/models | grep -Eq '"object" *: *"list"'
}

if ! server_ready; then
  echo "Startar modellen..."
  ./iniciar.command > server.log 2>&1 &
  SERVER_PID=$!
  trap "kill $SERVER_PID 2>/dev/null" EXIT
  until server_ready; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "Servern kunde inte starta (är port 8080 upptagen?). Slutet av server.log:" >&2
      tail -n 20 server.log >&2
      exit 1
    fi
    if [ "$SECONDS" -ge "$TIMEOUT" ]; then
      echo "Servern blev inte klar på $TIMEOUT sekunder. Slutet av server.log:" >&2
      tail -n 20 server.log >&2
      exit 1
    fi
    sleep 1
  done
fi
node agent.mjs "$PROJEKT"
```

Checks whether the server is already running, otherwise starts it in the background, waits until the model has loaded and then starts the agent. If the server stops or isn't ready within 5 minutes, `kod` shows the end of `server.log` and quits. When the agent exits, a server started by `kod` is shut down.

---

## Switching models

Open the start script and change the `MODEL` line:

```bash
nano /Volumes/CLAUDEUSB/iniciar.command
```

Save with `Ctrl+O`, `Enter`, `Ctrl+X`. Then restart the server.

| Task | Use |
|---|---|
| Quick questions, explaining code | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` |
| Code review, finding bugs | `qwen3-4b-thinking-2507.Q4_K_M.gguf` |

**Larger models** give clearly better results for code if the computer has enough RAM:

| RAM | Suggestion |
|---|---|
| 16 GB | Qwen3.5 9B or Gemma 4 12B (Q4) |
| 24–32 GB | Qwen 3.6 27B (Q4, approx. 16–18 GB) |
| 32 GB+ | MoE coding model with ~3B active parameters, e.g. Qwen3-Coder-30B-A3B – large but fast |

---

## Is it like Claude Code?

Same basic idea, but a much simpler version.

| | `agent.mjs` | Claude Code |
|---|---|---|
| Model | Qwen3 4B – local, small | Claude – much stronger at code |
| Tools | Read, list, search, write files | Also runs commands (tests, builds, git), precise edits and more |
| Changes | Rewrites the whole file | Changes only the lines needed |
| Planning | None | Breaks larger tasks into steps |
| Context | ~16k tokens – a few files at a time | Much larger, whole codebases |
| Cost / privacy | Free, code never leaves your computer | Subscription, code is sent to Anthropic |

Good for: explaining files, finding things in the code, small changes, basic code review.
Not good for: larger tasks spanning many files, architectural decisions.

If you want something closer to Claude Code but still local, **opencode** and **Aider** can point at the same server (`http://localhost:8080/v1`).

---

## Using the API in your own code

The server is OpenAI-compatible:

```ts
const res = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain ref vs reactive in Vue 3' }],
  }),
})
const data = await res.json()
console.log(data.choices[0].message.content)
```

Or with the OpenAI SDK: `new OpenAI({ baseURL: 'http://localhost:8080/v1', apiKey: 'local' })`.

Editor extensions such as **Continue** or **Cline** in VS Code can also use the server – choose "OpenAI-compatible" and enter `http://localhost:8080/v1`.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `no such file or directory` | The file isn't where you think. Run `ls -la /Volumes/CLAUDEUSB`. |
| macOS blocks the file | Right-click → **Open**, or run `xattr -c llamafile*.exe *.gguf`. |
| The model says it can't access files | You're typing in the web chat – use `kod.command` instead. Or ask explicitly: *"Read package.json"*. |
| No grey `↳` lines in the agent | Check that `--jinja` is in `iniciar.command`. |
| `command not found: #` in Terminal | Harmless – zsh doesn't treat `#` as a comment when pasting. |
| Slow startup | The model is read from the stick. Copy the files to `~/llm/` on the internal disk for faster startup. |
| `Servern kunde inte starta` | Read the log lines `kod` prints. Port 8080 may be in use: run `lsof -i :8080` to see by what. |
| Anything else | Check `server.log`. |

### Warnings in the server log that can be ignored

- `control-looking token ... was not control-type` – known, harmless issue in the model file.
- `server default port will be changed to :9931` – applies to future versions.
- `CORS is set to allow all origins` – websites could technically call your local model while the server is running. Shut the server down when you're not using it.

---

## Windows

1. Double-click `iniciar.bat`.
2. Open `http://localhost:8080`.
3. For the agent: install Node.js and run `node agent.mjs C:\path\to\project` in a terminal.

> If you change the model in `iniciar.command`, you must also change it in `iniciar.bat`.

Tip: run `dot_clean /Volumes/CLAUDEUSB` on the Mac before moving the stick to Windows to remove macOS's hidden `._` files.
