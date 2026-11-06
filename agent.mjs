#!/usr/bin/env node
// Lokal kodagent för llamafile / llama.cpp-server.
// Ger modellen verktyg för att lista, läsa, söka och (med ditt godkännande) skriva filer
// – men BARA inom den mapp du anger.
//
// Användning:
//   node agent.mjs ~/kod/mitt-projekt
//   LLM_URL=http://localhost:8080/v1 node agent.mjs .
//
// Kräver Node 18+ (inga npm-paket behövs).

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

// realpath, så jämförelserna i safe() stämmer även om själva projektmappen nås via en symlänk
const ROOT = await fs.realpath(path.resolve(process.argv[2] || process.cwd()))
const API = (process.env.LLM_URL || 'http://localhost:8080/v1').replace(/\/$/, '')
const MAX_READ = 40_000 // tecken per fil, så kontextfönstret inte sprängs
const MAX_STEPS = 15 // max verktygsanrop per fråga
const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', 'coverage', '.DS_Store'])

// ---------- Säkerhet: allt måste ligga inom ROOT ----------
// Kontrollerar den verkliga sökvägen, så att symlänkar inte kan leda ut ur projektet.
async function safe(p = '.') {
  const deny = () => new Error(`Åtkomst nekad: ${p} ligger utanför ${ROOT}`)
  const inside = (f) => f === ROOT || f.startsWith(ROOT + path.sep)

  const full = path.resolve(ROOT, p)
  if (!inside(full)) throw deny()

  // Filer som ska skapas finns inte än: gå uppåt till närmaste del som finns
  let existing = full
  const missing = []
  while (true) {
    try {
      const real = await fs.realpath(existing)
      if (!inside(real)) throw deny()
      return path.join(real, ...missing)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
      // Brusten symlänk: en skrivning skulle följa länken till dess mål
      if (await fs.lstat(existing).catch(() => null)) throw deny()
      missing.unshift(path.basename(existing))
      existing = path.dirname(existing)
    }
  }
}
const rel = (full) => path.relative(ROOT, full) || '.'

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (IGNORE.has(e.name) || e.name.startsWith('._') || e.isSymbolicLink()) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else yield full
  }
}


// ---------- Verktyg ----------
const tools = {
  list_files: {
    description: 'Listar filer och mappar. recursive=true listar hela trädet (max 300 filer).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relativ sökväg, t.ex. "." eller "src"' },
        recursive: { type: 'boolean' },
      },
    },
    async run({ path: p = '.', recursive = false }) {
      const dir = await safe(p)
      if (recursive) {
        const out = []
        for await (const f of walk(dir)) {
          out.push(rel(f))
          if (out.length >= 300) { out.push('… (avklippt)'); break }
        }
        return out.join('\n') || '(tom)'
      }
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries
        .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith('._'))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n') || '(tom)'
    },
  },

  read_file: {
    description: 'Läser innehållet i en textfil.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    async run({ path: p }) {
      const text = await fs.readFile(await safe(p), 'utf8')
      if (text.length <= MAX_READ) return text
      return text.slice(0, MAX_READ) + `\n… (avklippt: visar ${MAX_READ} av ${text.length} tecken, filen kan inte skrivas över)`
    },
  },

  search: {
    description: 'Söker efter text (skiftlägesokänsligt) i alla filer. Returnerar fil:rad: innehåll.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string', description: 'Mapp att söka i, standard "."' },
      },
      required: ['query'],
    },
    async run({ query, path: p = '.' }) {
      const q = query.toLowerCase()
      const hits = []
      for await (const f of walk(await safe(p))) {
        let text
        try {
          const stat = await fs.stat(f)
          if (stat.size > 1_000_000) continue
          text = await fs.readFile(f, 'utf8')
        } catch { continue }
        if (text.includes('\u0000')) continue // binärfil
        text.split('\n').forEach((line, i) => {
          if (line.toLowerCase().includes(q)) hits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 200)}`)
        })
        if (hits.length >= 100) break
      }
      return hits.slice(0, 100).join('\n') || 'Inga träffar.'
    },
  },

  write_file: {
    description: 'Skapar eller skriver över en fil med nytt innehåll. Användaren måste godkänna.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: 'Hela filens nya innehåll' },
      },
      required: ['path', 'content'],
    },
    async run({ path: p, content }) {
      const full = await safe(p)
      // read_file visar bara början av stora filer, så en överskrivning skulle radera resten
      const old = await fs.readFile(full, 'utf8').catch((e) => {
        if (e.code === 'ENOENT') return ''
        throw e
      })
      if (old.length > MAX_READ) {
        return `Nekat: ${rel(full)} är för stor (${old.length} tecken). Agenten ser bara de första ${MAX_READ} tecknen, så resten skulle raderas.`
      }
      console.log(`\n\x1b[33m--- Modellen vill skriva ${rel(full)} (${content.length} tecken) ---\x1b[0m`)
      console.log(content.length > 2000 ? content.slice(0, 2000) + '\n…' : content)
      const ok = (await rl.question('\x1b[33mGodkänn? (j/n) \x1b[0m')).trim().toLowerCase()
      if (ok !== 'j' && ok !== 'y') return 'Användaren nekade skrivningen.'
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, content, 'utf8')
      return `Skrev ${rel(full)}.`
    },
  },
}

const toolSpec = Object.entries(tools).map(([name, t]) => ({
  type: 'function',
  function: { name, description: t.description, parameters: t.parameters },
}))

// ---------- Chattloop ----------
// Lägg in filträdet direkt i systemprompten, så modellen vet vad som finns även utan verktygsanrop
const tree = await tools.list_files.run({ path: '.', recursive: true }).catch(() => '(kunde inte lista)')

const messages = [
  {
    role: 'system',
    content:
      `Du är en kodassistent som körs lokalt på användarens dator. Du HAR åtkomst till projektmappen ` +
      `${ROOT} via verktygen list_files, read_file, search och write_file. Säg aldrig att du saknar åtkomst ` +
      `till filer – anropa verktygen istället. Läs alltid relevanta filer med read_file innan du svarar om koden. ` +
      `Alla sökvägar är relativa till projektroten. Använd write_file bara när användaren ber om ändringar. ` +
      `Svara på samma språk som användaren.\n\nFiler i projektet:\n${tree}`,
  },
]

// Visar en snurra tills den returnerade funktionen anropas. Bara i en riktig terminal.
function startSpinner() {
  if (!stdout.isTTY) return () => {}
  const frames = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  const started = Date.now()
  let frame = 0
  const timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000)
    // \r går till radens början, \x1b[K rensar resten av raden
    stdout.write(`\r\x1b[90m${frames[frame++ % frames.length]} Tänker... ${seconds}s\x1b[0m\x1b[K`)
  }, 100)
  return () => {
    clearInterval(timer)
    stdout.write('\r\x1b[K')
  }
}

async function chat() {
  const stopSpinner = startSpinner()
  try {
    const res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local', messages, tools: toolSpec, temperature: 0.6 }),
    })
    if (!res.ok) throw new Error(`Servern svarade ${res.status}: ${await res.text()}`)
    return (await res.json()).choices[0].message
  } finally {
    stopSpinner()
  }
}

const rl = readline.createInterface({ input: stdin, output: stdout })
rl.on('close', () => process.exit(0))

console.log(`\x1b[36mKodagent – mapp: ${ROOT}\nServer: ${API}\nSkriv din fråga (eller "exit").\x1b[0m`)

while (true) {
  const q = (await rl.question('\n\x1b[32mDu> \x1b[0m')).trim()
  if (!q) continue
  if (q === 'exit' || q === 'quit') break
  const turnStart = messages.length
  messages.push({ role: 'user', content: q })

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const msg = await chat()
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })

      if (!msg.tool_calls?.length) {
        console.log(`\n\x1b[35mAI>\x1b[0m ${msg.content?.trim()}`)
        break
      }

      for (const call of msg.tool_calls) {
        const name = call.function.name
        let args = {}
        let result
        try {
          args = JSON.parse(call.function.arguments || '{}')
          console.log(`\x1b[90m  ↳ ${name}(${JSON.stringify(args).slice(0, 120)})\x1b[0m`)
          if (!tools[name]) throw new Error(`Okänt verktyg: ${name}`)
          result = await tools[name].run(args)
        } catch (e) {
          result = `Fel: ${e.message}`
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) })
      }
      if (step === MAX_STEPS - 1) console.log('\x1b[31m(Avbröt efter för många verktygsanrop)\x1b[0m')
    }
  } catch (e) {
    console.error(`\x1b[31m${e.message}\x1b[0m`)
    messages.length = turnStart // ta bort hela frågan, så inga verktygsanrop blir utan svar
  }
}

rl.close()
