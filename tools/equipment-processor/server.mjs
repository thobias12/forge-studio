import { createServer } from 'node:http'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const work = resolve(here, 'work')
const mannequins = join(work, 'mannequins')
const jobsDir = join(work, 'jobs')
const generatorsDir = join(work, 'generators')
const generatorRepo = join(generatorsDir, 'triposr')
const generatorVenv = join(generatorRepo, '.forge-venv')
const bootstrapVenv = join(generatorsDir, '.forge-uv-bootstrap')
const managedPythonDir = join(generatorsDir, '.forge-python')
const generatorReadyMarker = join(generatorVenv, '.forge-ready-v4')
const processor = join(here, 'processor.py')
const port = Number(process.env.FORGE_EQUIPMENT_PROCESSOR_PORT || 47831)
const backgroundJobs = new Map()

await mkdir(mannequins, { recursive: true })
await mkdir(jobsDir, { recursive: true })
await mkdir(generatorsDir, { recursive: true })

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
      const generator = await generatorHealth()
      sendJson(res, 200, {
        ok: true,
        version: 6,
        blenderAvailable: Boolean(blender),
        blenderPath: blender,
        mannequins: {
          female: await exists(mannequinPath('female')),
          male: await exists(mannequinPath('male')),
        },
        generator,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/generator/setup') {
      const active = [...backgroundJobs.values()].find(
        (job) => job.kind === 'setup' && (job.status === 'queued' || job.status === 'running'),
      )
      if (active) {
        sendJson(res, 202, { jobId: active.id })
        return
      }

      const ready = await isGeneratorReady()
      if (ready) {
        const job = createJob('setup', 'Local 3D generator is already installed.')
        job.status = 'completed'
        job.progress = 100
        backgroundJobs.set(job.id, job)
        sendJson(res, 200, { jobId: job.id })
        return
      }

      const job = createJob('setup', 'Preparing local 3D generator…')
      backgroundJobs.set(job.id, job)
      void setupGenerator(job)
      sendJson(res, 202, { jobId: job.id })
      return
    }

    if (req.method === 'POST' && url.pathname === '/generator/generate') {
      if (!await isGeneratorReady()) {
        throw new HttpError(
          409,
          'The local 3D generator is not installed yet. Use Install Local Generator in Equipment Lab first.',
        )
      }

      const bytes = await bodyBytes(req, 30 * 1024 * 1024)
      const contentType = String(req.headers['content-type'] || '')
      if (!contentType.startsWith('image/')) {
        throw new HttpError(400, 'Local 3D generation requires a PNG, JPG or WEBP reference image.')
      }

      const quality = generationQuality(url.searchParams.get('quality'))
      const id = randomUUID()
      const extension = imageExtension(contentType, req.headers['x-forge-filename'])
      const input = join(jobsDir, id + '-reference' + extension)
      const outputDir = join(jobsDir, id + '-generated')
      await mkdir(outputDir, { recursive: true })
      await writeFile(input, bytes)

      const job = createJob('generate', 'Queued local image-to-3D generation.')
      job.id = id
      job.quality = quality
      job.inputPath = input
      job.outputDir = outputDir
      backgroundJobs.set(job.id, job)
      void generate3D(job)

      sendJson(res, 202, { jobId: job.id })
      return
    }

    const jobMatch = url.pathname.match(/^\/jobs\/([^/]+)$/)
    if (req.method === 'GET' && jobMatch) {
      const job = backgroundJobs.get(decodeURIComponent(jobMatch[1]))
      if (!job) throw new HttpError(404, 'Equipment Processor job was not found.')
      sendJson(res, 200, publicJob(job))
      return
    }

    const resultMatch = url.pathname.match(/^\/jobs\/([^/]+)\/result$/)
    if (req.method === 'GET' && resultMatch) {
      const job = backgroundJobs.get(decodeURIComponent(resultMatch[1]))
      if (!job) throw new HttpError(404, 'Equipment Processor job was not found.')
      if (job.status !== 'completed' || !job.resultPath) {
        throw new HttpError(409, 'The generated 3D model is not ready yet.')
      }
      const result = await readFile(job.resultPath)
      res.statusCode = 200
      res.setHeader('Content-Type', 'model/gltf-binary')
      res.setHeader('Content-Length', String(result.length))
      res.end(result)
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
      if (!blender) {
        throw new HttpError(
          503,
          'Blender was not found. Install Blender or set BLENDER_PATH before starting the processor.',
        )
      }

      const body = bodyType(url.searchParams.get('body'))
      const slot = slotType(url.searchParams.get('slot'))
      const fit = fitType(url.searchParams.get('fit'))
      const clearance = clamp(url.searchParams.get('clearanceMm'), 1, 20, 4)
      const polyLimit = Math.round(clamp(url.searchParams.get('polyLimit'), 2000, 150000, 25000))
      const mannequin = mannequinPath(body)

      if (!await exists(mannequin)) {
        throw new HttpError(409, 'The Skillbound ' + body + ' mannequin has not been uploaded yet.')
      }

      const bytes = await bodyBytes(req)
      validGlb(bytes, 'equipment')

      const id = randomUUID()
      const input = join(jobsDir, id + '-input.glb')
      const output = join(jobsDir, id + '-processed.glb')
      await writeFile(input, bytes)

      const run = await runCommand(
        blender,
        [
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
        ],
        { label: 'Blender Equipment Processor' },
      )

      if (!await exists(output)) {
        throw new HttpError(500, 'Blender finished without producing a processed GLB.')
      }

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
  console.log('Local 3D: TripoSR adapter')
  console.log('Keep this window open while using Forge Equipment Lab.')
  console.log('')
})

function createJob(kind, message) {
  return {
    id: randomUUID(),
    kind,
    status: 'queued',
    progress: 0,
    message,
    error: undefined,
    resultPath: undefined,
    createdAt: new Date().toISOString(),
  }
}

function publicJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    resultReady: Boolean(job.resultPath && job.status === 'completed'),
  }
}

async function setupGenerator(job) {
  try {
    job.status = 'running'
    job.progress = 4
    job.message = 'Preparing compatible Python runtime…'

    if (!await exists(join(generatorRepo, 'run.py'))) {
      job.progress = 10
      job.message = 'Downloading the free TripoSR generator…'
      await runCommand(
        'git',
        [
          'clone',
          '--depth', '1',
          'https://github.com/VAST-AI-Research/TripoSR.git',
          generatorRepo,
        ],
        { label: 'TripoSR clone' },
      )
    }

    const venvPython = generatorPythonPath()
    if (!await exists(venvPython)) {
      await ensureGeneratorPython(job)
    }

    job.progress = 30
    job.message = 'Checking Python package installer…'
    await ensurePipAvailable(
      venvPython,
    )

    job.progress = 32
    job.message = 'Preparing Python packages…'
    await runCommand(
      venvPython,
      [
        '-m', 'pip', 'install',
        '--upgrade',
        'pip',
        'setuptools',
        'wheel',
      ],
      { label: 'pip bootstrap' },
    )

    job.progress = 43
    job.message = 'Installing NVIDIA PyTorch runtime…'
    if (process.platform === 'win32') {
      await runCommand(
        venvPython,
        [
          '-m', 'pip', 'install',
          'torch==2.11.0',
          'torchvision==0.26.0',
          '--index-url',
          'https://download.pytorch.org/whl/cu128',
        ],
        { label: 'PyTorch CUDA 12.8' },
      )
    } else {
      await runCommand(
        venvPython,
        [
          '-m', 'pip', 'install',
          'torch',
          'torchvision',
        ],
        { label: 'PyTorch' },
      )
    }

    job.progress = 58
    job.message = 'Preparing Windows-safe TripoSR dependencies…'
    const forgeRequirements =
      await prepareForgeTripoRequirements()

    job.progress = 62
    job.message = 'Installing TripoSR dependencies…'
    await runCommand(
      venvPython,
      [
        '-m', 'pip', 'install',
        '-r', forgeRequirements,
      ],
      { label: 'TripoSR requirements' },
    )

    job.progress = 74
    job.message = 'Installing portable marching-cubes fallback…'
    await installTorchMcubesFallback()

    job.progress = 80
    job.message = 'Repairing required runtime packages…'
    await ensureGeneratorRuntimeDependencies(
      venvPython,
      job,
    )

    job.progress = 92
    job.message = 'Validating TripoSR + GPU access…'
    const smoke = await validateGeneratorRuntime(
      venvPython,
    )

    await writeFile(
      generatorReadyMarker,
      JSON.stringify(
        {
          validatedAt:
            new Date().toISOString(),
          python:
            '3.11',
          backend:
            'TripoSR',
        },
        null,
        2,
      ),
      'utf8',
    )

    job.status = 'completed'
    job.progress = 100
    job.message = smoke.stdout.includes('FORGE_CUDA=True')
      ? 'Local 3D generator installed and NVIDIA GPU detected.'
      : 'Local 3D generator installed. CUDA was not detected, so generation will use CPU and be much slower.'
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
    job.message = 'Local 3D generator setup failed.'
  }
}

async function generate3D(job) {
  try {
    job.status = 'running'
    job.progress = 5
    job.message = 'Validating local 3D generator…'

    const venvPython = generatorPythonPath()
    try {
      await validateGeneratorRuntime(
        venvPython,
      )
    } catch (error) {
      await rm(
        generatorReadyMarker,
        { force: true },
      )
      throw new Error(
        'The local 3D generator installation is incomplete. Forge marked it for repair. Click Install Free Local Generator, then try again.\n'
        + (
          error instanceof Error
            ? error.message
            : String(error)
        ),
      )
    }

    job.progress = 8
    job.message = 'Starting local AI 3D generator…'
    const resolution = {
      draft: '192',
      standard: '256',
      high: '320',
    }[job.quality || 'standard']

    const run = await runCommand(
      venvPython,
      [
        join(generatorRepo, 'run.py'),
        job.inputPath,
        '--output-dir', job.outputDir,
        '--model-save-format', 'glb',
        '--mc-resolution', resolution,
        '--foreground-ratio', '0.85',
        '--chunk-size', '4096',
      ],
      {
        cwd: generatorRepo,
        label: 'TripoSR generation',
        onLine: (line) => updateGenerationProgress(job, line),
      },
    )

    const result = join(job.outputDir, '0', 'mesh.glb')
    if (!await exists(result)) {
      throw new Error(
        'The local 3D generator finished without creating mesh.glb.\n' + run.stdout.slice(-1800),
      )
    }

    validGlb(await readFile(result), 'generated equipment')
    job.resultPath = result
    job.status = 'completed'
    job.progress = 100
    job.message = 'Raw 3D model generated locally. Ready for Skillbound fitting.'
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
    job.message = 'Local image-to-3D generation failed.'
  }
}

function updateGenerationProgress(job, line) {
  const value = line.toLowerCase()
  if (value.includes('initializing model')) {
    job.progress = Math.max(job.progress, 12)
    job.message = 'Loading local 3D model…'
  } else if (value.includes('processing images')) {
    job.progress = Math.max(job.progress, 28)
    job.message = 'Preparing reference image…'
  } else if (value.includes('running model')) {
    job.progress = Math.max(job.progress, 42)
    job.message = 'Generating 3D shape on your GPU…'
  } else if (value.includes('extracting mesh')) {
    job.progress = Math.max(job.progress, 78)
    job.message = 'Extracting game mesh…'
  } else if (value.includes('exporting mesh')) {
    job.progress = Math.max(job.progress, 91)
    job.message = 'Exporting raw GLB…'
  }
}

async function generatorHealth() {
  const activeSetup = [...backgroundJobs.values()].find(
    (job) => job.kind === 'setup' && (job.status === 'queued' || job.status === 'running'),
  )
  const python = await findAnyPythonLauncher()
  const installed = await exists(join(generatorRepo, 'run.py'))
  const ready = await isGeneratorReady()

  return {
    backend: 'triposr',
    label: 'Local TripoSR',
    installed,
    ready,
    setupRunning: Boolean(activeSetup),
    pythonAvailable: Boolean(python),
    message: ready
      ? 'Free local image-to-3D is ready.'
      : activeSetup
        ? activeSetup.message
        : python
          ? 'Forge will prepare its own compatible Python 3.11 runtime automatically.'
          : installed
            ? 'Generator files exist but no Python runtime is available to bootstrap them.'
            : 'Install once to enable free local image-to-3D.',
  }
}

async function isGeneratorReady() {
  return await exists(join(generatorRepo, 'run.py'))
    && await exists(generatorPythonPath())
    && await exists(generatorReadyMarker)
}

function generatorPythonPath() {
  return process.platform === 'win32'
    ? join(generatorVenv, 'Scripts', 'python.exe')
    : join(generatorVenv, 'bin', 'python')
}

async function ensurePipAvailable(
  venvPython,
) {
  try {
    await runCommand(
      venvPython,
      [
        '-m', 'pip', '--version',
      ],
      {
        label: 'pip check',
        quiet: true,
      },
    )
    return
  } catch {
    // uv venvs can be created without pip unless seeded.
  }

  await runCommand(
    venvPython,
    [
      '-m', 'ensurepip',
      '--upgrade',
    ],
    { label: 'pip repair' },
  )

  await runCommand(
    venvPython,
    [
      '-m', 'pip', '--version',
    ],
    { label: 'pip validation' },
  )
}

async function prepareForgeTripoRequirements() {
  const upstreamPath =
    join(
      generatorRepo,
      'requirements.txt',
    )
  const forgePath =
    join(
      generatorRepo,
      '.forge-requirements.txt',
    )
  const upstream =
    await readFile(
      upstreamPath,
      'utf8',
    )

  const filtered =
    upstream
      .split(/\r?\n/)
      .filter(
        (line) =>
          !line
            .toLowerCase()
            .includes(
              'torchmcubes',
            ),
      )
      .filter(Boolean)
      .map(
        (line) =>
          line.trim() === 'rembg'
            ? 'rembg[cpu]'
            : line,
      )

  // Windows-safe marching-cubes implementation used by Forge's
  // torchmcubes compatibility module.
  filtered.push(
    'scikit-image==0.24.0',
  )

  await writeFile(
    forgePath,
    filtered.join('\n') + '\n',
    'utf8',
  )
  return forgePath
}

async function installTorchMcubesFallback() {
  const moduleDir =
    join(
      generatorRepo,
      'torchmcubes',
    )
  await mkdir(
    moduleDir,
    { recursive: true },
  )

  const moduleSource = [
    '"""Forge Windows compatibility layer for TripoSR torchmcubes."""',
    'import numpy as np',
    'import torch',
    'from skimage.measure import marching_cubes as _marching_cubes',
    '',
    'def marching_cubes(volume, threshold):',
    '    """Return torch tensors with the API TripoSR expects."""',
    '    array = volume.detach().to(device="cpu", dtype=torch.float32).contiguous().numpy()',
    '    vertices, faces, _normals, _values = _marching_cubes(',
    '        array,',
    '        level=float(threshold),',
    '        allow_degenerate=False,',
    '    )',
    '    vertices = np.ascontiguousarray(vertices, dtype=np.float32)',
    '    faces = np.ascontiguousarray(faces, dtype=np.int64)',
    '    return torch.from_numpy(vertices), torch.from_numpy(faces)',
    '',
    'def grid_interp(*_args, **_kwargs):',
    '    raise NotImplementedError("Forge TripoSR compatibility layer only implements marching_cubes.")',
    '',
  ].join('\n')

  await writeFile(
    join(
      moduleDir,
      '__init__.py',
    ),
    moduleSource,
    'utf8',
  )
}

async function ensureGeneratorRuntimeDependencies(
  venvPython,
  job,
) {
  // TripoSR's run.py imports numpy directly, but the upstream
  // requirements file does not list it. rembg also requires an
  // explicit ONNX backend extra. Install both deterministically.
  await runCommand(
    venvPython,
    [
      '-m', 'pip', 'install',
      'numpy==1.26.4',
      'onnxruntime',
    ],
    { label: 'TripoSR runtime repair' },
  )

  const packageForModule = {
    numpy: 'numpy==1.26.4',
    PIL: 'Pillow==10.1.0',
    rembg: 'rembg[cpu]',
    onnxruntime: 'onnxruntime',
    xatlas: 'xatlas==0.0.9',
    omegaconf: 'omegaconf==2.3.0',
    einops: 'einops==0.7.0',
    transformers: 'transformers==4.35.0',
    trimesh: 'trimesh==4.0.5',
    imageio: 'imageio[ffmpeg]',
    gradio: 'gradio',
    moderngl: 'moderngl==5.10.0',
    skimage: 'scikit-image==0.24.0',
    torchmcubes: 'scikit-image==0.24.0',
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await validateGeneratorRuntime(
        venvPython,
      )
      return
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error)
      const missing =
        message.match(
          /No module named ['"]([^'"]+)['"]/,
        )?.[1]?.split('.')?.[0]
      const pkg =
        missing
          ? packageForModule[missing]
          : undefined

      if (!pkg) {
        throw error
      }

      job.message =
        'Repairing missing Python package: '
        + missing
        + '…'
      await runCommand(
        venvPython,
        [
          '-m', 'pip', 'install',
          pkg,
        ],
        {
          label:
            'TripoSR repair '
            + missing,
        },
      )
    }
  }

  throw new Error(
    'TripoSR runtime validation did not stabilize after dependency repair.',
  )
}

async function validateGeneratorRuntime(
  venvPython,
) {
  return await runCommand(
    venvPython,
    [
      '-c',
      [
        'import numpy',
        'import onnxruntime',
        'import rembg',
        'import torch',
        'import xatlas',
        'import torchmcubes',
        'from PIL import Image',
        'from tsr.system import TSR',
        'assert callable(torchmcubes.marching_cubes)',
        'print("FORGE_RUNTIME_OK")',
        'print("FORGE_CUDA=" + str(torch.cuda.is_available()))',
        'print("FORGE_GPU=" + (torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"))',
      ].join('; '),
    ],
    {
      cwd: generatorRepo,
      label: 'TripoSR runtime validation',
    },
  )
}

async function ensureGeneratorPython(job) {
  const compatible = await findCompatiblePythonLauncher()
  if (compatible) {
    job.progress = 18
    job.message = 'Creating isolated Python 3.11 environment…'
    await runCommand(
      compatible.command,
      [
        ...compatible.prefix,
        '-m', 'venv',
        generatorVenv,
      ],
      { label: 'Python venv' },
    )
    return
  }

  const bootstrap = await findAnyPythonLauncher()
  if (!bootstrap) {
    throw new Error(
      'No Python runtime was found. Install Python from python.org once, then Forge can manage the compatible 3D-generator runtime itself.',
    )
  }

  job.progress = 12
  job.message = 'Python ' + bootstrap.version + ' detected · preparing private Python 3.11…'

  const bootstrapPython = bootstrapPythonPath()
  if (!await exists(bootstrapPython)) {
    await runCommand(
      bootstrap.command,
      [
        ...bootstrap.prefix,
        '-m', 'venv',
        bootstrapVenv,
      ],
      { label: 'Forge Python bootstrap' },
    )
  }

  job.progress = 17
  job.message = 'Installing private Python runtime manager…'
  await runCommand(
    bootstrapPython,
    [
      '-m', 'pip', 'install',
      '--upgrade',
      'pip',
      'uv',
    ],
    { label: 'Forge uv bootstrap' },
  )

  const uv = uvExecutablePath()
  if (!await exists(uv)) {
    throw new Error(
      'Forge installed the Python runtime manager but could not locate uv.',
    )
  }

  job.progress = 23
  job.message = 'Downloading Forge-managed Python 3.11…'
  await mkdir(managedPythonDir, { recursive: true })
  await runCommand(
    uv,
    [
      'venv',
      '--python', '3.11',
      '--managed-python',
      '--seed',
      generatorVenv,
    ],
    {
      label: 'Forge managed Python 3.11',
      env: {
        UV_PYTHON_INSTALL_DIR: managedPythonDir,
      },
    },
  )

  if (!await exists(generatorPythonPath())) {
    throw new Error(
      'Forge downloaded Python 3.11 but the generator environment was not created correctly.',
    )
  }
}

function bootstrapPythonPath() {
  return process.platform === 'win32'
    ? join(bootstrapVenv, 'Scripts', 'python.exe')
    : join(bootstrapVenv, 'bin', 'python')
}

function uvExecutablePath() {
  return process.platform === 'win32'
    ? join(bootstrapVenv, 'Scripts', 'uv.exe')
    : join(bootstrapVenv, 'bin', 'uv')
}

async function findCompatiblePythonLauncher() {
  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', prefix: ['-3.11'] },
        { command: 'py', prefix: ['-3.10'] },
        { command: 'py', prefix: ['-3.9'] },
        { command: 'py', prefix: ['-3.8'] },
        { command: 'python', prefix: [] },
      ]
    : [
        { command: 'python3.11', prefix: [] },
        { command: 'python3.10', prefix: [] },
        { command: 'python3.9', prefix: [] },
        { command: 'python3.8', prefix: [] },
        { command: 'python3', prefix: [] },
      ]

  return await findPythonFromCandidates(
    candidates,
    (major, minor) =>
      major === 3 &&
      minor >= 8 &&
      minor <= 11,
  )
}

async function findAnyPythonLauncher() {
  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', prefix: ['-3.14'] },
        { command: 'py', prefix: ['-3.13'] },
        { command: 'py', prefix: ['-3.12'] },
        { command: 'py', prefix: ['-3.11'] },
        { command: 'py', prefix: ['-3.10'] },
        { command: 'python', prefix: [] },
      ]
    : [
        { command: 'python3.14', prefix: [] },
        { command: 'python3.13', prefix: [] },
        { command: 'python3.12', prefix: [] },
        { command: 'python3.11', prefix: [] },
        { command: 'python3.10', prefix: [] },
        { command: 'python3', prefix: [] },
      ]

  return await findPythonFromCandidates(
    candidates,
    (major, minor) =>
      major === 3 &&
      minor >= 8,
  )
}

async function findPythonFromCandidates(
  candidates,
  accepts,
) {
  for (const candidate of candidates) {
    try {
      const result = await runCommand(
        candidate.command,
        [...candidate.prefix, '--version'],
        { timeoutMs: 5000, quiet: true },
      )
      const version = (result.stdout + result.stderr).match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/)
      if (!version) continue
      const major = Number(version[1])
      const minor = Number(version[2])
      if (!accepts(major, minor)) continue
      return {
        ...candidate,
        version: [
          version[1],
          version[2],
          version[3],
        ].filter(Boolean).join('.'),
      }
    } catch {
      // Try the next Python launcher.
    }
  }

  return undefined
}

function mannequinPath(body) {
  return join(mannequins, body + '.glb')
}

function bodyType(value) {
  return value === 'male' ? 'male' : 'female'
}

function slotType(value) {
  const allowed = new Set([
    'chest',
    'head',
    'legs',
    'boots',
    'gloves',
    'waist',
    'back',
    'main-hand',
    'off-hand',
  ])
  return allowed.has(value) ? value : 'chest'
}

function fitType(value) {
  return value === 'tight' || value === 'loose' ? value : 'normal'
}

function generationQuality(value) {
  return value === 'draft' || value === 'high' ? value : 'standard'
}

function imageExtension(contentType, filename) {
  const supplied = typeof filename === 'string' ? extname(filename).toLowerCase() : ''
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(supplied)) return supplied
  if (contentType.includes('jpeg')) return '.jpg'
  if (contentType.includes('webp')) return '.webp'
  return '.png'
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

async function bodyBytes(req, max = 200 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > max) {
      throw new HttpError(413, 'Upload is larger than the Equipment Processor limit.')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function validGlb(bytes, label) {
  if (
    bytes.length < 12
    || bytes[0] !== 0x67
    || bytes[1] !== 0x6c
    || bytes[2] !== 0x54
    || bytes[3] !== 0x46
  ) {
    throw new HttpError(400, 'The ' + label + ' upload is not a valid .glb file.')
  }
}

function cors(req, res) {
  const origin = req.headers.origin
  if (!origin || allowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  }
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

async function runCommand(
  executable,
  args,
  {
    cwd,
    label = executable,
    onLine,
    timeoutMs = 0,
    quiet = false,
    env,
  } = {},
) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        ...env,
      },
    })
    let stdout = ''
    let stderr = ''
    let stdoutRemainder = ''
    let stderrRemainder = ''
    let settled = false
    let timer

    const consume = (chunk, isError) => {
      const text = chunk.toString()
      if (isError) stderr += text
      else stdout += text

      let combined = (isError ? stderrRemainder : stdoutRemainder) + text
      const lines = combined.split(/\r?\n/)
      const remainder = lines.pop() || ''
      if (isError) stderrRemainder = remainder
      else stdoutRemainder = remainder

      for (const line of lines) {
        if (!quiet) console.log('[' + label + '] ' + line)
        onLine?.(line)
      }
    }

    child.stdout.on('data', (chunk) => consume(chunk, false))
    child.stderr.on('data', (chunk) => consume(chunk, true))

    child.on('error', (error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      reject(error)
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (code === 0) {
        resolvePromise({ stdout, stderr })
      } else {
        reject(
          new Error(
            label
            + ' failed with exit code '
            + code
            + '.\n'
            + stderr.slice(-6000)
            + '\n'
            + stdout.slice(-3000),
          ),
        )
      }
    })

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill()
        reject(new Error(label + ' timed out.'))
      }, timeoutMs)
    }
  })
}

async function findBlender() {
  if (process.env.BLENDER_PATH && await canLaunch(process.env.BLENDER_PATH)) {
    return process.env.BLENDER_PATH
  }

  const candidates = []
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\Blender Foundation'
    if (existsSync(root)) {
      try {
        const entries = await readdir(root)
        entries
          .sort()
          .reverse()
          .forEach((entry) => candidates.push(join(root, entry, 'blender.exe')))
      } catch {
        // Fall through to PATH.
      }
    }
  }
  if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender')
  }
  candidates.push('blender')

  for (const candidate of candidates) {
    if (await canLaunch(candidate)) return candidate
  }
  return undefined
}

async function canLaunch(executable) {
  if (
    (executable.includes('/') || executable.includes('\\'))
    && !await exists(executable)
  ) {
    return false
  }

  try {
    await runCommand(
      executable,
      ['--version'],
      { timeoutMs: 5000, quiet: true },
    )
    return true
  } catch {
    return false
  }
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
