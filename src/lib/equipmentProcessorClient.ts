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

export type EquipmentGeneratorHealth = {
  backend: 'triposr'
  label: string
  installed: boolean
  ready: boolean
  setupRunning?: boolean
  pythonAvailable?: boolean
  message?: string
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
  const response = await fetch(
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

export async function startLocalGeneratorSetup() {
  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL + '/generator/setup',
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
  },
) {
  const query =
    new URLSearchParams({
      quality: options.quality,
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
  const response = await fetch(
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
  const response = await fetch(
    EQUIPMENT_PROCESSOR_URL +
      '/jobs/' +
      encodeURIComponent(jobId) +
      '/result',
    {
      cache: 'no-store',
    },
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
