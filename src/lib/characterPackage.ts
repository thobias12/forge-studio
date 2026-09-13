import type { HumanoidBoneKey } from './retarget'

export type CharacterSlot =
  | 'helmet'
  | 'chest'
  | 'glovesLeft'
  | 'glovesRight'
  | 'legs'
  | 'bootsLeft'
  | 'bootsRight'
  | 'weaponLeft'
  | 'weaponRight'
  | 'back'

export type CharacterTransform = {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type CharacterAttachmentPackage = {
  id: string
  name: string
  slot: CharacterSlot
  targetBone: HumanoidBoneKey
  file: string
  mime: string
  data: string
  transform: CharacterTransform
}

export type ForgeCharacterPackage = {
  format: 'forge-character-package'
  version: 1
  name: string
  createdAt: string
  base: {
    file: string
    mime: string
    data: string
  }
  rig: {
    mapped: Record<string, string>
    missing: string[]
  }
  attachments: CharacterAttachmentPackage[]
}

export const CHARACTER_SLOT_BONES: Record<CharacterSlot, HumanoidBoneKey> = {
  helmet: 'head',
  chest: 'chest',
  glovesLeft: 'leftHand',
  glovesRight: 'rightHand',
  legs: 'hips',
  bootsLeft: 'leftFoot',
  bootsRight: 'rightFoot',
  weaponLeft: 'leftHand',
  weaponRight: 'rightHand',
  back: 'chest',
}

export const CHARACTER_SLOT_LABELS: Record<CharacterSlot, string> = {
  helmet: 'Helmet / Hood',
  chest: 'Chest',
  glovesLeft: 'Left Glove',
  glovesRight: 'Right Glove',
  legs: 'Legs',
  bootsLeft: 'Left Boot',
  bootsRight: 'Right Boot',
  weaponLeft: 'Left Hand Item',
  weaponRight: 'Right Hand Item',
  back: 'Back',
}

export const DEFAULT_CHARACTER_TRANSFORM: CharacterTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

export async function createCharacterPackage(
  name: string,
  baseFile: Blob,
  baseFilename: string,
  rig: { mapped: Record<string, string>; missing: string[] },
  attachments: Array<{
    id: string
    name: string
    slot: CharacterSlot
    targetBone: HumanoidBoneKey
    file: Blob
    filename: string
    transform: CharacterTransform
  }>,
): Promise<ForgeCharacterPackage> {
  return {
    format: 'forge-character-package',
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    base: {
      file: safeFile(baseFilename, 'character.glb'),
      mime: baseFile.type || 'model/gltf-binary',
      data: await blobToDataUrl(baseFile),
    },
    rig,
    attachments: await Promise.all(attachments.map(async (item) => ({
      id: item.id,
      name: item.name,
      slot: item.slot,
      targetBone: item.targetBone,
      file: safeFile(item.filename, `${item.slot}.glb`),
      mime: item.file.type || 'model/gltf-binary',
      data: await blobToDataUrl(item.file),
      transform: item.transform,
    }))),
  }
}

export function characterPackageBlob(character: ForgeCharacterPackage) {
  return new Blob([JSON.stringify(character, null, 2)], { type: 'application/x-forge-character+json' })
}

export async function parseCharacterPackage(blob: Blob): Promise<ForgeCharacterPackage | undefined> {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<ForgeCharacterPackage>
    if (parsed.format !== 'forge-character-package' || parsed.version !== 1 || !parsed.name || !parsed.base || !Array.isArray(parsed.attachments)) return undefined
    return parsed as ForgeCharacterPackage
  } catch {
    return undefined
  }
}

export function characterPackageDataToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(',', 2)
  if (!header || payload === undefined) throw new Error('Invalid embedded character asset.')
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/octet-stream'
  const binary = header.includes(';base64') ? atob(payload) : decodeURIComponent(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function characterSlug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge-character'
}

function safeFile(name: string, fallback: string) {
  const clean = name.trim().replace(/[^a-z0-9._-]+/gi, '-')
  return clean || fallback
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not encode character asset.'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode character asset.'))
    reader.readAsDataURL(blob)
  })
}
