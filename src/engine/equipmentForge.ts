import {
  listAssets,
  saveAsset,
  type LibraryAsset,
} from '../lib/library'
import type { SkillboundBodyType } from '../lib/characterAssetRegistry'
import type { ProceduralEquipmentRecipe } from './equipmentForgeProcedural'
import type { EquipmentForgeV3Recipe } from './equipmentForgeV3/types'

export const EQUIPMENT_FORGE_SLOTS = [
  'Head',
  'Chest',
  'Gloves',
  'Legs',
  'Boots',
  'Waist',
  'Cape',
  'MainHand',
  'OffHand',
] as const

export type EquipmentForgeSlot =
  typeof EQUIPMENT_FORGE_SLOTS[number]

export const EQUIPMENT_FORGE_SLOT_LABELS:
  Record<EquipmentForgeSlot, string> = {
    Head: 'Head',
    Chest: 'Chest',
    Gloves: 'Gloves',
    Legs: 'Legs',
    Boots: 'Boots',
    Waist: 'Waist',
    Cape: 'Cape / Back',
    MainHand: 'Main Hand',
    OffHand: 'Off Hand',
  }

export type EquipmentMaterialOverride = {
  color: string
  roughness: number
  metalness: number
}

export type EquipmentMaterialOverrides =
  Record<string, Record<string, EquipmentMaterialOverride>>

export type EquipmentForgePresetData = {
  format: 'forge-equipment-preset'
  version: 1
  id: string
  name: string
  bodyAssetId: string
  bodyType?: SkillboundBodyType
  slots: Partial<Record<EquipmentForgeSlot, string>>
  materialOverrides: EquipmentMaterialOverrides
  proceduralRecipe?: ProceduralEquipmentRecipe
  v3Recipe?: EquipmentForgeV3Recipe
  createdAt: string
}

const SLOT_FILENAMES:
  Partial<Record<EquipmentForgeSlot, string>> = {
    Chest: 'EQ_Chest.glb',
    Gloves: 'EQ_Gloves.glb',
    Legs: 'EQ_Legs.glb',
    Boots: 'EQ_Boots.glb',
    Waist: 'EQ_Waist.glb',
    Cape: 'EQ_Cape.glb',
    Head: 'EQ_Head.glb',
  }

export function equipmentAssetSlot(
  asset: LibraryAsset,
): EquipmentForgeSlot | undefined {
  const tag = asset.tags.find((entry) =>
    entry.startsWith('equipment-slot:'),
  )
  const slot = tag?.slice('equipment-slot:'.length)
  return EQUIPMENT_FORGE_SLOTS.includes(
    slot as EquipmentForgeSlot,
  )
    ? slot as EquipmentForgeSlot
    : undefined
}

export function equipmentAssetBodyType(
  asset: LibraryAsset,
): SkillboundBodyType | undefined {
  const tag = asset.tags.find((entry) =>
    entry.startsWith('body-type:'),
  )
  const value = tag?.slice('body-type:'.length)
  return value === 'male' || value === 'female'
    ? value
    : undefined
}

export function isEquipmentForgeAsset(
  asset: LibraryAsset,
) {
  return (
    asset.kind === 'glb' &&
    asset.tags.includes('equipment-forge')
  )
}

export async function listEquipmentForgeAssets() {
  const assets = await listAssets()
  return assets.filter(isEquipmentForgeAsset)
}

export async function importEquipmentForgeGlb(
  file: File,
  slot: EquipmentForgeSlot,
  bodyType?: SkillboundBodyType,
) {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    throw new Error(
      'Equipment Forge currently imports self-contained .glb files.',
    )
  }

  const id = [
    'equipment',
    bodyType ?? 'universal',
    slot.toLowerCase(),
    safeSlug(file.name.replace(/\.glb$/i, '')),
  ].join('-')

  return await saveAsset({
    id,
    name: displayName(file.name),
    category: 'props',
    kind: 'glb',
    mime: file.type || 'model/gltf-binary',
    tags: [
      'equipment-forge',
      `equipment-slot:${slot}`,
      ...(bodyType ? [`body-type:${bodyType}`] : []),
      'rig:SkillboundHumanoidV1',
    ],
    favorite: false,
    source: 'Equipment Forge import',
    blob: file,
  })
}

export async function importSkillboundEquipmentPack(
  file: File,
) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error(
      'Choose a Skillbound equipment .zip pack.',
    )
  }

  const bodyType = inferBodyType(file.name)
  const entries = await extractEquipmentGlbs(file)
  const imported: LibraryAsset[] = []
  const packSlug = safeSlug(
    file.name.replace(/\.zip$/i, ''),
  )

  for (const slot of EQUIPMENT_FORGE_SLOTS) {
    const blob = entries[slot]
    if (!blob) continue
    const id = [
      'equipment',
      packSlug,
      slot.toLowerCase(),
    ].join('-')
    const asset = await saveAsset({
      id,
      name: `${displayName(
        file.name.replace(/\.zip$/i, ''),
      )} · ${EQUIPMENT_FORGE_SLOT_LABELS[slot]}`,
      category: 'props',
      kind: 'glb',
      mime: 'model/gltf-binary',
      tags: [
        'equipment-forge',
        'equipment-pack',
        `equipment-pack:${packSlug}`,
        `equipment-slot:${slot}`,
        ...(bodyType ? [`body-type:${bodyType}`] : []),
        'rig:SkillboundHumanoidV1',
      ],
      favorite: false,
      source: file.name,
      blob,
    })
    imported.push(asset)
  }

  if (!imported.length) {
    throw new Error(
      'No recognized Equipment Forge slot GLBs were found in that ZIP.',
    )
  }

  return imported
}

export async function saveEquipmentForgePreset(
  input: Omit<
    EquipmentForgePresetData,
    'format' | 'version' | 'id' | 'createdAt'
  >,
) {
  const preset: EquipmentForgePresetData = {
    format: 'forge-equipment-preset',
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  }

  const blob = new Blob(
    [JSON.stringify(preset, null, 2)],
    { type: 'application/x-forge-equipment-preset+json' },
  )

  const asset = await saveAsset({
    id: `equipment-preset-${preset.id}`,
    name: preset.name,
    category: 'characters',
    kind: 'file',
    mime: blob.type,
    tags: [
      'equipment-forge-preset',
      'outfit-preset',
      ...(preset.bodyType
        ? [`body-type:${preset.bodyType}`]
        : []),
    ],
    favorite: false,
    source: 'Equipment Forge',
    blob,
  })

  return { asset, preset }
}

export async function listEquipmentForgePresets() {
  const assets = await listAssets()
  return assets.filter((asset) =>
    asset.tags.includes('equipment-forge-preset'),
  )
}

export async function parseEquipmentForgePreset(
  asset: LibraryAsset,
) {
  const raw = JSON.parse(
    await asset.blob.text(),
  ) as EquipmentForgePresetData
  if (
    raw?.format !== 'forge-equipment-preset' ||
    raw.version !== 1
  ) {
    throw new Error(
      'That library item is not a supported Equipment Forge preset.',
    )
  }
  return raw
}

async function extractEquipmentGlbs(
  file: Blob,
): Promise<
  Partial<Record<EquipmentForgeSlot, Blob>>
> {
  const bytes = new Uint8Array(
    await file.arrayBuffer(),
  )
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  )
  const decoder = new TextDecoder()
  const result:
    Partial<Record<EquipmentForgeSlot, Blob>> = {}
  let offset = 0

  while (offset + 30 <= bytes.byteLength) {
    const signature = view.getUint32(offset, true)
    if (signature !== 0x04034b50) break

    const flags = view.getUint16(offset + 6, true)
    const compression =
      view.getUint16(offset + 8, true)
    const compressedSize =
      view.getUint32(offset + 18, true)
    const nameLength =
      view.getUint16(offset + 26, true)
    const extraLength =
      view.getUint16(offset + 28, true)

    if (flags & 0x08) {
      throw new Error(
        'This ZIP uses streaming data descriptors, which the current Equipment Forge importer does not support.',
      )
    }

    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.byteLength) {
      throw new Error(
        'The equipment ZIP appears to be truncated.',
      )
    }

    const name = decoder.decode(
      bytes.subarray(nameStart, nameEnd),
    )
    const slot = slotForArchiveName(name)
    if (slot) {
      const compressed =
        bytes.slice(dataStart, dataEnd)
      const data = await inflateZipEntry(
        compressed,
        compression,
      )
      if (
        data.byteLength < 12 ||
        data[0] !== 0x67 ||
        data[1] !== 0x6c ||
        data[2] !== 0x54 ||
        data[3] !== 0x46
      ) {
        throw new Error(
          `${name} is not a valid binary glTF file.`,
        )
      }
      result[slot] = new Blob(
        [copyBytesToArrayBuffer(data)],
        { type: 'model/gltf-binary' },
      )
    }

    offset = dataEnd
  }

  return result
}

function slotForArchiveName(
  name: string,
): EquipmentForgeSlot | undefined {
  const normalized = name.replace(/\\/g, '/')
  for (const [
    slot,
    filename,
  ] of Object.entries(SLOT_FILENAMES) as [
    EquipmentForgeSlot,
    string,
  ][]) {
    if (
      normalized.endsWith(
        `/Slots/${filename}`,
      ) ||
      normalized.endsWith(`/${filename}`)
    ) {
      return slot
    }
  }
  return undefined
}

async function inflateZipEntry(
  compressed: Uint8Array,
  compression: number,
) {
  if (compression === 0) return compressed
  if (compression !== 8) {
    throw new Error(
      `Unsupported ZIP compression method ${compression}.`,
    )
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot unpack this equipment ZIP. Use a current Chrome, Edge, Firefox, or Safari release.',
    )
  }

  const stream = new Blob([
    copyBytesToArrayBuffer(compressed),
  ])
    .stream()
    .pipeThrough(
      new DecompressionStream('deflate-raw'),
    )
  return new Uint8Array(
    await new Response(stream).arrayBuffer(),
  )
}

function inferBodyType(
  filename: string,
): SkillboundBodyType | undefined {
  const lower = filename.toLowerCase()
  if (lower.includes('female')) return 'female'
  if (lower.includes('male')) return 'male'
  return undefined
}

function displayName(value: string) {
  return value
    .replace(/\.(glb|zip)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    )
}

function safeSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
    'asset'
  )
}

function copyBytesToArrayBuffer(
  bytes: Uint8Array,
): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
