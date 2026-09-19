import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getAsset, saveAsset, type LibraryAsset } from './library'

export type CharacterAssetRole = 'body' | 'head' | 'hair'
export type CharacterAssetCompatibility = 'ready' | 'warning' | 'invalid'
export type CharacterAssetRig = 'ForgeHumanoidV1' | 'SkillboundHumanoidV1' | 'unknown'
export type SkillboundBodyType = 'male' | 'female'

export const OFFICIAL_SKILLBOUND_BASE_IDS: Record<SkillboundBodyType, string> = {
  male: 'skillbound-male-base-v1',
  female: 'skillbound-female-base-v1',
}

const OFFICIAL_SKILLBOUND_BASES: Record<
  SkillboundBodyType,
  { id: string; name: string }
> = {
  male: {
    id: OFFICIAL_SKILLBOUND_BASE_IDS.male,
    name: 'Skillbound Male Base v1',
  },
  female: {
    id: OFFICIAL_SKILLBOUND_BASE_IDS.female,
    name: 'Skillbound Female Base v1',
  },
}

export type CharacterAssetInspection = {
  role: CharacterAssetRole
  compatibility: CharacterAssetCompatibility
  meshCount: number
  skinnedMeshCount: number
  materialCount: number
  triangleCount: number
  boneNames: string[]
  coreBonesFound: number
  coreBonesTotal: number
  rig: CharacterAssetRig
  bounds: { x: number; y: number; z: number }
  messages: string[]
}

const CORE_BONES = [
  'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'UpperArm_L', 'LowerArm_L', 'Hand_L',
  'UpperArm_R', 'LowerArm_R', 'Hand_R',
  'UpperLeg_L', 'LowerLeg_L', 'Foot_L',
  'UpperLeg_R', 'LowerLeg_R', 'Foot_R',
] as const

const SKILLBOUND_CORE_BONES = [
  'pelvis', 'spine_01', 'spine_03', 'neck_01', 'head',
  'upperarm_L', 'lowerarm_L', 'hand_L',
  'upperarm_R', 'lowerarm_R', 'hand_R',
  'thigh_L', 'calf_L', 'foot_L',
  'thigh_R', 'calf_R', 'foot_R',
] as const

export async function inspectCharacterAsset(blob: Blob, role: CharacterAssetRole): Promise<CharacterAssetInspection> {
  const gltf = await parseGlb(blob)
  const boneNames = new Set<string>()
  const materials = new Set<THREE.Material>()
  let meshCount = 0
  let skinnedMeshCount = 0
  let triangleCount = 0

  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Bone) boneNames.add(object.name)
    if (!(object instanceof THREE.Mesh)) return
    meshCount += 1
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshCount += 1
    const geometry = object.geometry
    if (geometry?.attributes.position) {
      triangleCount += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
    }
    const list = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of list) if (material) materials.add(material)
  })

  const box = new THREE.Box3().setFromObject(gltf.scene)
  const size = box.getSize(new THREE.Vector3())
  const forgeCoreBonesFound =
    CORE_BONES.filter((name) => boneNames.has(name)).length
  const skillboundCoreBonesFound =
    SKILLBOUND_CORE_BONES.filter((name) => boneNames.has(name)).length
  const rig: CharacterAssetRig =
    forgeCoreBonesFound === CORE_BONES.length
      ? 'ForgeHumanoidV1'
      : skillboundCoreBonesFound === SKILLBOUND_CORE_BONES.length
        ? 'SkillboundHumanoidV1'
        : 'unknown'
  const coreBonesFound = Math.max(
    forgeCoreBonesFound,
    skillboundCoreBonesFound,
  )
  const messages: string[] = []
  let compatibility: CharacterAssetCompatibility = 'ready'

  if (meshCount === 0) {
    compatibility = 'invalid'
    messages.push('No mesh geometry was found in this GLB.')
  }

  if (role === 'body') {
    if (skinnedMeshCount === 0) {
      compatibility = 'warning'
      messages.push('Body has no skinned mesh. It can be stored, but it will need rigging before animation.')
    }
    if (rig === 'unknown') {
      compatibility =
        compatibility === 'invalid'
          ? 'invalid'
          : 'warning'
      messages.push(
        `Known humanoid rig bones: ${coreBonesFound}/${CORE_BONES.length} found. Retargeting or bone mapping may be needed.`,
      )
    } else {
      messages.push(`${rig} core bone names detected.`)
    }
    if (size.y < .5 || size.y > 5) {
      compatibility = compatibility === 'invalid' ? 'invalid' : 'warning'
      messages.push('Body scale is outside the normal Forge character range; auto-normalization may be needed.')
    }
  } else {
    if (skinnedMeshCount > 0 && coreBonesFound === 0) {
      compatibility = compatibility === 'invalid' ? 'invalid' : 'warning'
      messages.push('This part contains skinning but no Forge core bone names. Static head-bone attachment will be used as a fallback.')
    }
    messages.push(role === 'head'
      ? 'Head assets should be authored around the Head bone origin.'
      : 'Hair assets should be authored around the Head bone origin.')
  }

  if (messages.length === 0) messages.push('Asset is ready for Character Creator use.')

  disposeScene(gltf.scene)

  return {
    role,
    compatibility,
    meshCount,
    skinnedMeshCount,
    materialCount: materials.size,
    triangleCount: Math.round(triangleCount),
    boneNames: [...boneNames].sort(),
    coreBonesFound,
    coreBonesTotal: CORE_BONES.length,
    rig,
    bounds: {
      x: round(size.x),
      y: round(size.y),
      z: round(size.z),
    },
    messages,
  }
}

export async function registerCharacterAsset(
  file: File,
  role: CharacterAssetRole,
  displayName = file.name.replace(/\.(glb|gltf)$/i, '').replace(/[-_]+/g, ' '),
) {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    throw new Error('Character Creator assets currently require a self-contained .glb file.')
  }

  const inspection = await inspectCharacterAsset(file, role)
  if (inspection.compatibility === 'invalid') {
    throw new Error(inspection.messages.join(' '))
  }

  const asset = await saveAsset({
    name: displayName,
    category: 'characters',
    kind: 'glb',
    mime: file.type || 'model/gltf-binary',
    tags: [
      'character-creator-part',
      `character-role:${role}`,
      `compatibility:${inspection.compatibility}`,
      ...(role === 'body' && inspection.rig !== 'unknown'
        ? [`rig:${inspection.rig}`]
        : []),
    ],
    source: 'Forge Character Creator',
    blob: file,
  })

  return { asset, inspection }
}


export async function loadOfficialSkillboundBaseAssets(): Promise<LibraryAsset[]> {
  const installed = await Promise.all(
    (Object.keys(OFFICIAL_SKILLBOUND_BASES) as SkillboundBodyType[])
      .map(async (bodyType) => {
        const definition = OFFICIAL_SKILLBOUND_BASES[bodyType]
        const asset = await getAsset(definition.id).catch(() => undefined)
        return asset && isOfficialSkillboundFoundationAsset(asset, bodyType)
          ? asset
          : undefined
      }),
  )
  return installed.filter(
    (asset): asset is LibraryAsset => Boolean(asset),
  )
}

export async function importOfficialSkillboundFoundationPack(
  file: File,
): Promise<LibraryAsset[]> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error(
      'Choose the Skillbound-Base-Characters-v1.zip foundation pack.',
    )
  }

  const entries = await extractSkillboundFoundationGlbs(file)
  const assets: LibraryAsset[] = []

  for (const bodyType of ['male', 'female'] as const) {
    const definition = OFFICIAL_SKILLBOUND_BASES[bodyType]
    const blob = entries[bodyType]
    if (!blob) {
      throw new Error(
        `The foundation pack is missing ${definition.name}.glb.`,
      )
    }

    const inspection = await inspectCharacterAsset(blob, 'body')
    if (
      inspection.compatibility === 'invalid' ||
      inspection.rig !== 'SkillboundHumanoidV1'
    ) {
      throw new Error(
        `${definition.name} did not match the SkillboundHumanoidV1 foundation rig. ${inspection.messages.join(' ')}`,
      )
    }

    const asset = await saveAsset({
      id: definition.id,
      name: definition.name,
      category: 'characters',
      kind: 'glb',
      mime: 'model/gltf-binary',
      tags: officialSkillboundBaseTags(bodyType),
      favorite: true,
      source: 'Skillbound Character Standard v1 · Astra foundation pack',
      blob,
    })
    assets.push(asset)
  }

  return assets
}

function officialSkillboundBaseTags(
  bodyType: SkillboundBodyType,
) {
  return [
    'character-creator-part',
    'character-role:body',
    'compatibility:ready',
    'rig:SkillboundHumanoidV1',
    'official:skillbound',
    `body-type:${bodyType}`,
    'secondary-motion:breast-bones',
    'forward:+z',
  ]
}

function isOfficialSkillboundFoundationAsset(
  asset: LibraryAsset,
  bodyType: SkillboundBodyType,
) {
  return (
    asset.kind === 'glb' &&
    asset.category === 'characters' &&
    asset.id === OFFICIAL_SKILLBOUND_BASE_IDS[bodyType] &&
    asset.tags.includes('official:skillbound')
  )
}

async function extractSkillboundFoundationGlbs(
  file: Blob,
): Promise<Partial<Record<SkillboundBodyType, Blob>>> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  )
  const decoder = new TextDecoder()
  const result: Partial<Record<SkillboundBodyType, Blob>> = {}
  let offset = 0

  while (offset + 30 <= bytes.byteLength) {
    const signature = view.getUint32(offset, true)
    if (signature !== 0x04034b50) break

    const flags = view.getUint16(offset + 6, true)
    const compression = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)

    if (flags & 0x08) {
      throw new Error(
        'This ZIP uses streaming data descriptors, which this Forge importer does not support.',
      )
    }

    const nameStart = offset + 30
    const nameEnd = nameStart + nameLength
    const dataStart = nameEnd + extraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.byteLength) {
      throw new Error('The Skillbound foundation ZIP appears to be truncated.')
    }

    const name = decoder.decode(bytes.subarray(nameStart, nameEnd))
    const bodyType: SkillboundBodyType | undefined =
      name.endsWith('/Skillbound-Male-Base-v1.glb')
        ? 'male'
        : name.endsWith('/Skillbound-Female-Base-v1.glb')
          ? 'female'
          : undefined

    if (bodyType) {
      const compressed = bytes.slice(dataStart, dataEnd)
      const data = await inflateZipEntry(compressed, compression)
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
      result[bodyType] = new Blob(
        [data],
        { type: 'model/gltf-binary' },
      )
    }

    offset = dataEnd
    if (result.male && result.female) break
  }

  if (!result.male || !result.female) {
    throw new Error(
      'Could not find both Skillbound-Male-Base-v1.glb and Skillbound-Female-Base-v1.glb in that ZIP.',
    )
  }

  return result
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
      'This browser cannot unpack the foundation ZIP. Use a current Chrome, Edge, Firefox, or Safari release.',
    )
  }

  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function skillboundBodyTypeFromAsset(
  asset?: LibraryAsset,
): SkillboundBodyType | undefined {
  if (!asset) return undefined
  if (asset.id === OFFICIAL_SKILLBOUND_BASE_IDS.male) return 'male'
  if (asset.id === OFFICIAL_SKILLBOUND_BASE_IDS.female) return 'female'
  const tag = asset.tags.find((entry) => entry.startsWith('body-type:'))
  const value = tag?.slice('body-type:'.length)
  return value === 'male' || value === 'female' ? value : undefined
}

export function characterAssetRole(asset: LibraryAsset): CharacterAssetRole | undefined {
  const tag = asset.tags.find((entry) => entry.startsWith('character-role:'))
  const role = tag?.slice('character-role:'.length)
  return role === 'body' || role === 'head' || role === 'hair' ? role : undefined
}

export function isCharacterCreatorAsset(asset: LibraryAsset, role?: CharacterAssetRole) {
  if (asset.kind !== 'glb' || asset.category !== 'characters') return false
  if (!asset.tags.includes('character-creator-part')) return false
  return role ? characterAssetRole(asset) === role : true
}

export function characterAssetCompatibility(asset: LibraryAsset): CharacterAssetCompatibility {
  const tag = asset.tags.find((entry) => entry.startsWith('compatibility:'))
  const value = tag?.slice('compatibility:'.length)
  return value === 'ready' || value === 'warning' || value === 'invalid' ? value : 'warning'
}

export async function loadCharacterAssetScene(blob: Blob) {
  return await parseGlb(blob)
}

async function parseGlb(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  const loader = new GLTFLoader()
  return await new Promise<Awaited<ReturnType<GLTFLoader['parseAsync']>>>((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf) => resolve(gltf as Awaited<ReturnType<GLTFLoader['parseAsync']>>),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}

function disposeScene(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry?.dispose()
    const list = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of list) if (material) materials.add(material)
  })
  for (const material of materials) material.dispose()
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
