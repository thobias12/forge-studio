import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { saveAsset, type LibraryAsset } from './library'

export type CharacterAssetRole = 'body' | 'head' | 'hair'
export type CharacterAssetCompatibility = 'ready' | 'warning' | 'invalid'

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
  const coreBonesFound = CORE_BONES.filter((name) => boneNames.has(name)).length
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
    if (coreBonesFound < CORE_BONES.length) {
      compatibility = compatibility === 'invalid' ? 'invalid' : 'warning'
      messages.push(`ForgeHumanoidV1 bone names: ${coreBonesFound}/${CORE_BONES.length} found. Retargeting or bone mapping may be needed.`)
    } else {
      messages.push('ForgeHumanoidV1 core bone names detected.')
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
      ...(role === 'body' && inspection.coreBonesFound === inspection.coreBonesTotal ? ['rig:ForgeHumanoidV1'] : []),
    ],
    source: 'Forge Character Creator',
    blob: file,
  })

  return { asset, inspection }
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
