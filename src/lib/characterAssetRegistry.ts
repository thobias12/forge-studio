import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { saveAsset, type LibraryAsset } from './library'

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
  { id: string; name: string; file: string }
> = {
  male: {
    id: OFFICIAL_SKILLBOUND_BASE_IDS.male,
    name: 'Skillbound Male Base v1',
    file: 'assets/characters/skillbound-base-v1/Skillbound-Male-Base-v1.glb',
  },
  female: {
    id: OFFICIAL_SKILLBOUND_BASE_IDS.female,
    name: 'Skillbound Female Base v1',
    file: 'assets/characters/skillbound-base-v1/Skillbound-Female-Base-v1.glb',
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
  return await Promise.all(
    (Object.keys(OFFICIAL_SKILLBOUND_BASES) as SkillboundBodyType[])
      .map(async (bodyType) => {
        const definition = OFFICIAL_SKILLBOUND_BASES[bodyType]
        const response = await fetch(
          `${import.meta.env.BASE_URL}${definition.file}`,
        )
        if (!response.ok) {
          throw new Error(
            `Could not load ${definition.name} (${response.status}).`,
          )
        }
        const blob = await response.blob()
        const timestamp = '2026-09-19T00:00:00.000Z'
        return {
          id: definition.id,
          name: definition.name,
          category: 'characters' as const,
          kind: 'glb' as const,
          mime: 'model/gltf-binary',
          size: blob.size,
          createdAt: timestamp,
          updatedAt: timestamp,
          tags: [
            'character-creator-part',
            'character-role:body',
            'compatibility:ready',
            'rig:SkillboundHumanoidV1',
            'official:skillbound',
            `body-type:${bodyType}`,
            'secondary-motion:breast-bones',
            'forward:+z',
          ],
          favorite: true,
          source: 'Skillbound Character Standard v1 · official foundation',
          blob,
        } satisfies LibraryAsset
      }),
  )
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
