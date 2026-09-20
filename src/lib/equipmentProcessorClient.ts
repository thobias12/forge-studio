export type EquipmentLabBody = 'female' | 'male'
export type EquipmentLabSlot =
  | 'chest'
  | 'head'
  | 'legs'
  | 'boots'
  | 'gloves'
  | 'waist'
  | 'back'
  | 'main-hand'
  | 'off-hand'

export type EquipmentGeneratorBackend =
  | 'spar3d'
  | 'triposr'

export type EquipmentGeneratorHealth = {
  backend: EquipmentGeneratorBackend
  label: string
  installed: boolean
  ready: boolean
  setupRunning?: boolean
  pythonAvailable?: boolean
  needsAccessToken?: boolean
  modelAccessUrl?: string
  tokenUrl?: string
  license?: string
  message?: string
  legacy?: {
    backend: 'triposr'
    ready: boolean
  }
}

export type EquipmentProcessorHealth = {
  ok: boolean
  version: number
  blenderAvailable: boolean
  blenderPath?: string
  mannequins?: Partial<Record<EquipmentLabBody, boolean>>
  generator?: EquipmentGeneratorHealth
}

export type EquipmentGeneratorJob = {
  id: string
  kind: 'setup' | 'generate'
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  error?: string
  resultReady?: boolean
}

export type EquipmentProcessOptions = {
  bodyType: EquipmentLabBody
  slot: EquipmentLabSlot
  fit: 'tight' | 'normal' | 'loose'
  clearanceMm: number
  polyLimit: number
  fileName: string
}

export type EquipmentProcessResult = {
  blob: Blob
  metadata?: Record<string, unknown>
}

export const EQUIPMENT_PROCESSOR_URL =
  'http://127.0.0.1:47831'

export async function checkEquipmentProcessor(
  signal?: AbortSignal,
): Promise<EquipmentProcessorHealth> {
  const response = await fetchProcessorRead(
    EQUIPMENT_PROCESSOR_URL + '/health',
    {
      cache: 'no-store',
      signal,
    },
  )

  if (!response.ok) {
    throw new Error(
      'Equipment Processor returned ' +
        response.status +
        '.',
    )
  }

  return await response.json() as
    EquipmentProcessorHealth
}

export async function saveGeneratorAccessToken(
  token: string,
) {
  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL +
      '/generator/access-token',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'text/plain; charset=utf-8',
      },
      body: token,
    },
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Could not save the local generator access token.',
      ),
    )
  }
}

export async function startLocalGeneratorSetup(
  backend:
    EquipmentGeneratorBackend =
      'spar3d',
) {
  const query =
    new URLSearchParams({
      backend,
    })

  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL +
      '/generator/setup?' +
      query.toString(),
    {
      method: 'POST',
    },
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Could not start local 3D generator setup.',
      ),
    )
  }

  return await response.json() as {
    jobId: string
  }
}

export async function startLocal3DGeneration(
  image: Blob,
  options: {
    fileName: string
    quality: 'draft' | 'standard' | 'high'
    backend?: EquipmentGeneratorBackend
  },
) {
  const query =
    new URLSearchParams({
      quality: options.quality,
      backend:
        options.backend ??
        'spar3d',
    })

  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL +
      '/generator/generate?' +
      query.toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type':
          image.type || 'image/png',
        'X-Forge-Filename':
          options.fileName,
      },
      body: image,
    },
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Could not start local 3D generation.',
      ),
    )
  }

  return await response.json() as {
    jobId: string
  }
}

export async function getEquipmentProcessorJob(
  jobId: string,
): Promise<EquipmentGeneratorJob> {
  const response = await fetchProcessorRead(
    EQUIPMENT_PROCESSOR_URL +
      '/jobs/' +
      encodeURIComponent(jobId),
    {
      cache: 'no-store',
    },
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Could not read Equipment Processor job.',
      ),
    )
  }

  return await response.json() as
    EquipmentGeneratorJob
}

export async function getLocal3DGenerationResult(
  jobId: string,
) {
  const response = await fetchProcessorRead(
    EQUIPMENT_PROCESSOR_URL +
      '/jobs/' +
      encodeURIComponent(jobId) +
      '/result',
    {
      cache: 'no-store',
    },
    8,
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Local 3D model is not ready.',
      ),
    )
  }

  return await response.blob()
}

export async function uploadEquipmentMannequin(
  bodyType: EquipmentLabBody,
  blob: Blob,
) {
  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL +
      '/mannequin?body=' +
      encodeURIComponent(bodyType),
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'model/gltf-binary',
      },
      body: blob,
    },
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Could not upload the Skillbound mannequin.',
      ),
    )
  }
}

export async function processEquipment(
  raw: Blob,
  options: EquipmentProcessOptions,
): Promise<EquipmentProcessResult> {
  const query =
    new URLSearchParams({
      body: options.bodyType,
      slot: options.slot,
      fit: options.fit,
      clearanceMm:
        String(options.clearanceMm),
      polyLimit:
        String(options.polyLimit),
    })

  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL +
      '/process?' +
      query.toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'model/gltf-binary',
        'X-Forge-Filename':
          options.fileName,
      },
      body: raw,
    },
  )

  if (!response.ok) {
    throw new Error(
      await readProcessorError(
        response,
        'Equipment processing failed.',
      ),
    )
  }

  const metadataHeader =
    response.headers.get(
      'X-Forge-Metadata',
    )
  let metadata:
    | Record<string, unknown>
    | undefined

  if (metadataHeader) {
    try {
      metadata =
        JSON.parse(
          decodeURIComponent(
            metadataHeader,
          ),
        ) as Record<
          string,
          unknown
        >
    } catch {
      metadata = undefined
    }
  }

  return {
    blob: await response.blob(),
    metadata,
  }
}

async function fetchProcessorRead(
  url: string,
  init: RequestInit = {},
  retries = 4,
) {
  let lastError:
    | unknown
    | undefined

  for (
    let attempt = 0;
    attempt <= retries;
    attempt += 1
  ) {
    try {
      return await fetch(
        url,
        init,
      )
    } catch (cause) {
      if (
        init.signal?.aborted
      ) {
        throw cause
      }

      lastError = cause

      if (
        attempt >= retries
      ) {
        break
      }

      const delayMs =
        Math.min(
          3000,
          450 *
          2 ** attempt,
        )

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            delayMs,
          ),
      )
    }
  }

  throw new Error(
    'Temporarily lost the local Equipment Processor connection. ' +
    'Forge retried automatically but localhost:47831 is still unavailable. ' +
    (
      lastError instanceof Error
        ? '(' +
          lastError.message +
          ')'
        : ''
    ),
  )
}

async function readProcessorError(
  response: Response,
  fallback: string,
) {
  const text =
    await response.text()

  if (!text) {
    return fallback
  }

  try {
    const payload =
      JSON.parse(text) as {
        error?: string
      }
    return payload.error || fallback
  } catch {
    return text
  }
}
