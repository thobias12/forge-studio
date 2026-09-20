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

export type EquipmentProcessorHealth = {
  ok: boolean
  version: number
  blenderAvailable: boolean
  blenderPath?: string
  mannequins?: Partial<Record<EquipmentLabBody, boolean>>
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
  try {
    const payload =
      await response.json() as {
        error?: string
      }
    return payload.error || fallback
  } catch {
    const text =
      await response.text()
    return text || fallback
  }
}
