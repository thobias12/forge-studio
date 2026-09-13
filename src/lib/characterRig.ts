import * as THREE from 'three'
import {
  CORE_BONE_KEYS,
  FINGER_BONE_KEYS,
  HUMANOID_BONE_KEYS,
  mapHumanoidRig,
  type HumanoidBoneKey,
  type RigInfo,
} from './retarget'

export type CharacterRig = Partial<Record<HumanoidBoneKey, THREE.Object3D>>

export type CharacterRigResult = {
  rig: CharacterRig
  info: RigInfo
  fallbackMappedCount: number
}

export function mapCharacterRig(root: THREE.Object3D): CharacterRigResult {
  const boneMapped = mapHumanoidRig(root)
  const rig: CharacterRig = { ...boneMapped.rig }
  const candidates = collectNamedNodes(root)
  let fallbackMappedCount = 0

  for (const key of HUMANOID_BONE_KEYS) {
    if (rig[key]) continue
    const node = findFallbackNode(key, candidates)
    if (!node) continue
    rig[key] = node
    fallbackMappedCount += 1
  }

  const mapped: Partial<Record<HumanoidBoneKey, string>> = {}
  for (const key of HUMANOID_BONE_KEYS) {
    const node = rig[key]
    if (node) mapped[key] = node.name || key
  }

  const coreMappedCount = CORE_BONE_KEYS.filter((key) => rig[key]).length
  const fingerMappedCount = FINGER_BONE_KEYS.filter((key) => rig[key]).length
  const info: RigInfo = {
    totalBones: Math.max(boneMapped.info.totalBones, Object.keys(mapped).length),
    mappedCount: Object.keys(mapped).length,
    coreMappedCount,
    fingerMappedCount,
    coreTotal: CORE_BONE_KEYS.length,
    mapped,
    missing: CORE_BONE_KEYS.filter((key) => !rig[key]),
  }

  return { rig, info, fallbackMappedCount }
}

function collectNamedNodes(root: THREE.Object3D) {
  const result: Array<{ node: THREE.Object3D; normalized: string }> = []
  root.traverse((node) => {
    if (!node.name || (node as THREE.Mesh).isMesh) return
    const normalized = normalize(node.name)
    if (normalized) result.push({ node, normalized })
  })
  return result
}

function findFallbackNode(key: HumanoidBoneKey, nodes: Array<{ node: THREE.Object3D; normalized: string }>) {
  const aliases = fallbackAliases(key)

  for (const alias of aliases) {
    const exact = nodes.find((entry) => entry.normalized === alias)
    if (exact) return exact.node
  }

  let best: { node: THREE.Object3D; score: number } | undefined
  for (const entry of nodes) {
    for (const alias of aliases) {
      if (!entry.normalized.endsWith(alias) && !entry.normalized.startsWith(alias)) continue
      const score = alias.length - Math.abs(entry.normalized.length - alias.length) * 0.05
      if (!best || score > best.score) best = { node: entry.node, score }
    }
  }
  return best?.node
}

function fallbackAliases(key: HumanoidBoneKey) {
  const normalizedKey = normalize(key)
  const aliases = [normalizedKey]

  if (key === 'hips') aliases.push('pelvis', 'rootpelvis')
  if (key === 'spine') aliases.push('spine1', 'spine01', 'lowerback')
  if (key === 'chest') aliases.push('upperchest', 'spine2', 'spine02', 'spine3', 'spine03')
  if (key === 'leftToes') aliases.push('lefttoebase', 'lefttoe', 'lefttoes')
  if (key === 'rightToes') aliases.push('righttoebase', 'righttoe', 'righttoes')

  const finger = /^(left|right)(thumb|index|middle|ring|pinky)([123])$/.exec(key)
  if (finger) aliases.push(`${finger[1]}hand${finger[2]}${finger[3]}`)

  return [...new Set(aliases)]
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/mixamorig/g, '')
    .replace(/bip001/g, '')
    .replace(/bip01/g, '')
    .replace(/armature/g, '')
    .replace(/[^a-z0-9]/g, '')
}
