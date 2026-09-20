import { createServer } from 'node:http'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = resolve(here, 'work')
const mannequins = join(work, 'mannequins')
const jobs = join(work, 'jobs')
const processor = join(here, 'processor.py')
const port = Number(process.env.FORGE_EQUIPMENT_PROCESSOR_PORT || 47831)

await mkdir(mannequins, { recursive: true })
await mkdir(jobs, { recursive: true })

const blender = await findBlender()

createServer(async (req, res) => {
  try {
    cors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1')

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        version: 1,
        blenderAvailable: Boolean(blender),
        blenderPath: blender,
        mannequins: {
          female: await exists(mannequinPath('female')),
          male: await exists(mannequinPath('male')),
        },
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/mannequin') {
      const body = bodyType(url.searchParams.get('body'))
      const bytes = await bodyBytes(req)
      validGlb(bytes, 'mannequin')
      await writeFile(mannequinPath(body), bytes)
      sendJson(res, 200, { ok: true, body, bytes: bytes.length })
      return
    }

    if (req.method === 'POST' && url.pathname === '/process') {
      if (!blender) throw new HttpError(503, 'Blender was not found. Install Blender or set BLENDER_PATH before starting the processor.')

      const body = bodyType(url.searchParams.get('body'))
      const slot = slotType(url.searchParams.get('slot'))
      const fit = fitType(url.searchParams.get('fit'))
      const clearance = clamp(url.searchParams.get('clearanceMm'), 1, 20, 4)
      const polyLimit = Math.round(clamp(url.searchParams.get('polyLimit'), 2000, 150000, 25000))
      const mannequin = mannequinPath(body)

      if (!await exists(mannequin)) throw new HttpError(409, 'The Skillbound ' + body + ' mannequin has not been uploaded yet.')

      const bytes = await bodyBytes(req)
      validGlb(bytes, 'equipment')

      const id = randomUUID()
      const input = join(jobs, id + '-input.glb')
      const output = join(jobs, id + '-processed.glb')
      await writeFile(input, bytes)

      const run = await runBlender(blender, [
        '--background',
        '--python', processor,
        '--',
        '--input', input,
        '--mannequin', mannequin,
        '--output', output,
        '--body', body,
        '--slot', slot,
        '--fit', fit,
        '--clearance-mm', String(clearance),
        '--poly-limit', String(polyLimit),
      ])

      if (!await exists(output)) throw new HttpError(500, 'Blender finished without producing a processed GLB.')

      const result = await readFile(output)
      let metadata = { body, slot, fit, clearanceMm: clearance, polyLimit }
      try {
        metadata = JSON.parse(await readFile(output + '.json', 'utf8'))
      } catch {
        metadata.blenderLog = run.stdout.slice(-1200)
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'model/gltf-binary')
      res.setHeader('Content-Length', String(result.length))
      res.setHeader('X-Forge-Metadata', encodeURIComponent(JSON.stringify(metadata)))
      res.end(result)
      return
    }

    sendJson(res, 404, { error: 'Unknown Equipment Processor route.' })
  } catch (error) {
    console.error('[equipment-processor]', error)
    sendJson(
      res,
      error instanceof HttpError ? error.status : 500,
      { error: error instanceof Error ? error.message : String(error) },
    )
  }
}).listen(port, '127.0.0.1', () => {
  console.log('')
  console.log('Forge Equipment Processor')
  console.log('http://127.0.0.1:' + port)
  console.log('Blender: ' + (blender || 'NOT FOUND'))
  console.log('Keep this window open while using Forge Equipment Lab.')
  console.log('')
})

function mannequinPath(body) {
  return join(mannequins, body + '.glb')
}

function bodyType(value) {
  return value === 'male' ? 'male' : 'female'
}

function slotType(value) {
  const allowed = new Set(['chest','head','legs','boots','gloves','waist','back','main-hand','off-hand'])
  return allowed.has(value) ? value : 'chest'
}

function fitType(value) {
  return value === 'tight' || value === 'loose' ? value : 'normal'
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

async function bodyBytes(req) {
  const chunks = []
  let size = 0
  const max = 200 * 1024 * 1024
  for await (const chunk of req) {
    size += chunk.length
    if (size > max) throw new HttpError(413, 'GLB is larger than the 200 MB processor limit.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function validGlb(bytes, label) {
  if (bytes.length < 12 || bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
    throw new HttpError(400, 'The ' + label + ' upload is not a valid .glb file.')
  }
}

function cors(req, res) {
  const origin = req.headers.origin
  if (!origin || allowedOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Forge-Filename')
  res.setHeader('Access-Control-Expose-Headers', 'X-Forge-Metadata')
  res.setHeader('Cache-Control', 'no-store')
}

function allowedOrigin(origin) {
  return origin === 'https://thobias12.github.io'
    || /^http:\/\/localhost:\d+$/.test(origin)
    || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
}

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(data)
}

async function runBlender(executable, args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
      } else {
        reject(new Error('Blender processor failed with exit code ' + code + '.\n' + stderr.slice(-5000) + '\n' + stdout.slice(-2500)))
      }
    })
  })
}

async function findBlender() {
  if (process.env.BLENDER_PATH && await canLaunch(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH

  const candidates = []
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\Blender Foundation'
    if (existsSync(root)) {
      try {
        const entries = await readdir(root)
        entries.sort().reverse().forEach((entry) => candidates.push(join(root, entry, 'blender.exe')))
      } catch {}
    }
  }
  if (process.platform === 'darwin') candidates.push('/Applications/Blender.app/Contents/MacOS/Blender')
  candidates.push('blender')

  for (const candidate of candidates) {
    if (await canLaunch(candidate)) return candidate
  }
  return undefined
}

async function canLaunch(executable) {
  if ((executable.includes('/') || executable.includes('\\')) && !await exists(executable)) return false
  return await new Promise((resolvePromise) => {
    const child = spawn(executable, ['--version'], { windowsHide: true })
    const timer = setTimeout(() => {
      child.kill()
      resolvePromise(false)
    }, 5000)
    child.on('error', () => {
      clearTimeout(timer)
      resolvePromise(false)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolvePromise(code === 0)
    })
  })
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
