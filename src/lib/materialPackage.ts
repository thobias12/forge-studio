import type { TextureChannel } from './textureProcessing'

export type MaterialParameters = {
  repeat: number
  roughness: number
  metalness: number
  normalStrength: number
}

export type ForgeMaterialPackage = {
  format: 'forge-material-package'
  version: 1
  name: string
  createdAt: string
  parameters: MaterialParameters
  channels: Partial<Record<TextureChannel, {
    file: string
    mime: string
    data: string
  }>>
}

const CHANNEL_FILES: Record<TextureChannel, string> = {
  baseColor: 'baseColor.png',
  normal: 'normal.png',
  roughness: 'roughness.png',
  ao: 'ao.png',
}

export async function createMaterialPackage(
  name: string,
  channels: Partial<Record<TextureChannel, Blob>>,
  parameters: MaterialParameters,
): Promise<ForgeMaterialPackage> {
  const encoded: ForgeMaterialPackage['channels'] = {}
  for (const channel of Object.keys(CHANNEL_FILES) as TextureChannel[]) {
    const blob = channels[channel]
    if (!blob) continue
    encoded[channel] = {
      file: CHANNEL_FILES[channel],
      mime: blob.type || 'image/png',
      data: await blobToDataUrl(blob),
    }
  }

  return {
    format: 'forge-material-package',
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    parameters,
    channels: encoded,
  }
}

export function materialPackageBlob(material: ForgeMaterialPackage) {
  return new Blob([JSON.stringify(material, null, 2)], { type: 'application/x-forge-material+json' })
}

export async function parseMaterialPackage(blob: Blob): Promise<ForgeMaterialPackage | undefined> {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<ForgeMaterialPackage>
    if (parsed.format !== 'forge-material-package' || parsed.version !== 1 || !parsed.name || !parsed.channels || !parsed.parameters) return undefined
    return parsed as ForgeMaterialPackage
  } catch {
    return undefined
  }
}

export function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(',', 2)
  if (!header || payload === undefined) throw new Error('Invalid embedded material texture.')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/octet-stream'
  const binary = header.includes(';base64') ? atob(payload) : decodeURIComponent(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function materialSlug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge-material'
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not encode material texture.'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode material texture.'))
    reader.readAsDataURL(blob)
  })
}
