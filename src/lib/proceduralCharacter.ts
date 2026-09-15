import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export type ForgeCharacterSpecies = 'skeleton' | 'zombie' | 'bandit'
export type ForgeCharacterWeapon = 'none' | 'sword' | 'axe' | 'mace'
export type ForgeCharacterArmor = 'none' | 'scrap' | 'heavy'
export type ForgeCharacterHeadwear = 'none' | 'hood' | 'helmet'

export type ForgeCharacterConfig = {
  name: string
  species: ForgeCharacterSpecies
  height: number
  bulk: number
  shoulders: number
  headScale: number
  armLength: number
  legLength: number
  asymmetry: number
  armor: ForgeCharacterArmor
  headwear: ForgeCharacterHeadwear
  weapon: ForgeCharacterWeapon
  primary: string
  secondary: string
  accent: string
}

export type ForgeCharacterBuild = {
  root: THREE.Group
  skeleton: THREE.Skeleton
  bones: Record<string, THREE.Bone>
  clips: THREE.AnimationClip[]
  stats: { bones: number; skinnedMeshes: number; triangles: number }
}

const BASE_HEIGHT = 1.8

export const FORGE_CHARACTER_PRESETS: Record<ForgeCharacterSpecies, ForgeCharacterConfig> = {
  skeleton: {
    name: 'Crypt Skeleton', species: 'skeleton', height: 1.04, bulk: 1.12, shoulders: 1.13, headScale: 0.98,
    armLength: 1.01, legLength: 0.99, asymmetry: 0.13, armor: 'scrap', headwear: 'none', weapon: 'sword',
    primary: '#ada58f', secondary: '#20262b', accent: '#673539',
  },
  zombie: {
    name: 'Crypt Zombie', species: 'zombie', height: 1.04, bulk: 1.25, shoulders: 1.16, headScale: 1.01,
    armLength: 1.05, legLength: 0.95, asymmetry: 0.42, armor: 'none', headwear: 'none', weapon: 'axe',
    primary: '#536453', secondary: '#392b28', accent: '#653632',
  },
  bandit: {
    name: 'Dungeon Bandit', species: 'bandit', height: 1.02, bulk: 1.13, shoulders: 1.15, headScale: 0.94,
    armLength: 1, legLength: 0.99, asymmetry: 0.06, armor: 'scrap', headwear: 'hood', weapon: 'sword',
    primary: '#8f6854', secondary: '#24313b', accent: '#704d2b',
  },
}

export function cloneForgeCharacterConfig(species: ForgeCharacterSpecies): ForgeCharacterConfig {
  return { ...FORGE_CHARACTER_PRESETS[species] }
}

export function createProceduralCharacter(config: ForgeCharacterConfig): ForgeCharacterBuild {
  const root = new THREE.Group()
  root.name = safeNodeName(config.name || 'ForgeCharacter')
  root.userData.forgeCharacter = {
    format: 'ForgeCharacter', version: 3, rig: 'ForgeHumanoidV1', species: config.species,
    artStyle: 'dark-arpg-poe', archetypeVersion: 3,
    collisionCapsule: { radius: 0.33 * config.bulk, height: BASE_HEIGHT * config.height },
    sockets: { weapon: 'Hand_R', offhand: 'Hand_L', head: 'Head', chest: 'Chest' },
  }

  const dims = dimensions(config)
  const bones = createRig(dims)
  root.add(bones.Root)
  root.updateMatrixWorld(true)
  const boneList = orderedBones(bones)
  const skeleton = new THREE.Skeleton(boneList)
  skeleton.calculateInverses()
  const index = new Map(boneList.map((bone, i) => [bone.name, i]))
  const mats = materials(config)

  if (config.species === 'skeleton') addSkeleton(root, bones, skeleton, index, mats, dims, config)
  else if (config.species === 'zombie') addZombie(root, bones, skeleton, index, mats, dims, config)
  else addBandit(root, bones, skeleton, index, mats, dims, config)

  addGear(root, bones, skeleton, index, mats, dims, config)
  addWeapon(bones.Hand_R, mats, config)

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
  })
  root.updateMatrixWorld(true)

  const clips = createAnimationClips(config)
  let skinnedMeshes = 0
  let triangles = 0
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes += 1
    if (mesh.isMesh && mesh.geometry.attributes.position) triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3
  })
  return { root, skeleton, bones, clips, stats: { bones: boneList.length, skinnedMeshes, triangles: Math.round(triangles) } }
}

export async function exportProceduralCharacterGlb(config: ForgeCharacterConfig): Promise<Blob> {
  const build = createProceduralCharacter(config)
  build.root.updateMatrixWorld(true)
  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      build.root,
      (data) => data instanceof ArrayBuffer ? resolve(data) : reject(new Error('Forge expected a binary GLB export.')),
      reject,
      { binary: true, animations: build.clips, trs: true, onlyVisible: true, includeCustomExtensions: true },
    )
  })
  disposeForgeCharacter(build.root)
  return new Blob([result], { type: 'model/gltf-binary' })
}

export function disposeForgeCharacter(root?: THREE.Object3D) {
  if (!root) return
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    list.forEach((material) => materials.add(material))
  })
  materials.forEach((material) => material.dispose())
  root.removeFromParent()
}

type Dims = {
  height: number; hipsY: number; torso: number; shoulderX: number; upperArm: number; lowerArm: number
  upperLeg: number; lowerLeg: number; headR: number; limbR: number; torsoW: number; torsoD: number
}

type Materials = {
  body: THREE.MeshStandardMaterial; bodyDark: THREE.MeshStandardMaterial; cloth: THREE.MeshStandardMaterial
  clothDark: THREE.MeshStandardMaterial; leather: THREE.MeshStandardMaterial; leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial; metalDark: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial
  eye: THREE.MeshStandardMaterial; socket: THREE.MeshStandardMaterial; bone: THREE.MeshStandardMaterial; boneDark: THREE.MeshStandardMaterial
}

function dimensions(config: ForgeCharacterConfig): Dims {
  const scale = config.height
  return {
    height: BASE_HEIGHT * scale,
    hipsY: 0.89 * scale * config.legLength,
    torso: 0.57 * scale,
    shoulderX: 0.325 * config.shoulders * config.bulk,
    upperArm: 0.355 * scale * config.armLength,
    lowerArm: 0.325 * scale * config.armLength,
    upperLeg: 0.41 * scale * config.legLength,
    lowerLeg: 0.41 * scale * config.legLength,
    headR: 0.14 * scale * config.headScale,
    limbR: 0.082 * config.bulk,
    torsoW: 0.5 * config.bulk * config.shoulders,
    torsoD: 0.28 * config.bulk,
  }
}

function createRig(d: Dims): Record<string, THREE.Bone> {
  const bone = (name: string, x = 0, y = 0, z = 0) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); return b }
  const Root = bone('Root')
  const Hips = bone('Hips', 0, d.hipsY, 0)
  const Spine = bone('Spine', 0, d.torso * 0.31, 0)
  const Chest = bone('Chest', 0, d.torso * 0.43, -0.012)
  const Neck = bone('Neck', 0, d.torso * 0.28, -0.022)
  const Head = bone('Head', 0, d.headR * 0.82, -0.014)
  Root.add(Hips); Hips.add(Spine); Spine.add(Chest); Chest.add(Neck); Neck.add(Head)

  const UpperArm_L = bone('UpperArm_L', -d.shoulderX, d.torso * 0.08, 0)
  const LowerArm_L = bone('LowerArm_L', -d.upperArm, -0.018, 0)
  const Hand_L = bone('Hand_L', -d.lowerArm, 0, 0)
  const UpperArm_R = bone('UpperArm_R', d.shoulderX, d.torso * 0.08, 0)
  const LowerArm_R = bone('LowerArm_R', d.upperArm, -0.018, 0)
  const Hand_R = bone('Hand_R', d.lowerArm, 0, 0)
  Chest.add(UpperArm_L, UpperArm_R); UpperArm_L.add(LowerArm_L); LowerArm_L.add(Hand_L); UpperArm_R.add(LowerArm_R); LowerArm_R.add(Hand_R)

  const hipOffset = 0.15 * d.torsoW / 0.5
  const UpperLeg_L = bone('UpperLeg_L', -hipOffset, -0.055, 0)
  const LowerLeg_L = bone('LowerLeg_L', 0, -d.upperLeg, 0.025)
  const Foot_L = bone('Foot_L', 0, -d.lowerLeg, 0.065)
  const UpperLeg_R = bone('UpperLeg_R', hipOffset, -0.055, 0)
  const LowerLeg_R = bone('LowerLeg_R', 0, -d.upperLeg, 0.025)
  const Foot_R = bone('Foot_R', 0, -d.lowerLeg, 0.065)
  Hips.add(UpperLeg_L, UpperLeg_R); UpperLeg_L.add(LowerLeg_L); LowerLeg_L.add(Foot_L); UpperLeg_R.add(LowerLeg_R); LowerLeg_R.add(Foot_R)
  return { Root, Hips, Spine, Chest, Neck, Head, UpperArm_L, LowerArm_L, Hand_L, UpperArm_R, LowerArm_R, Hand_R, UpperLeg_L, LowerLeg_L, Foot_L, UpperLeg_R, LowerLeg_R, Foot_R }
}

function orderedBones(bones: Record<string, THREE.Bone>) {
  const result: THREE.Bone[] = []
  bones.Root.traverse((node) => { if ((node as THREE.Bone).isBone) result.push(node as THREE.Bone) })
  return result
}

function materials(config: ForgeCharacterConfig): Materials {
  const body = new THREE.Color(config.primary)
  const cloth = new THREE.Color(config.secondary)
  const accent = new THREE.Color(config.accent)
  const bone = config.species === 'skeleton' ? body.clone() : new THREE.Color('#aaa28c')
  const steel = new THREE.Color('#4b5052')
  return {
    body: mat(body, 0.9), bodyDark: mat(body.clone().multiplyScalar(0.55), 0.98),
    cloth: mat(cloth, 0.98), clothDark: mat(cloth.clone().multiplyScalar(0.48), 1),
    leather: mat(accent.clone().multiplyScalar(0.78), 0.9), leatherDark: mat(accent.clone().multiplyScalar(0.45), 0.96),
    metal: mat(steel, 0.52, 0.52), metalDark: mat(steel.clone().multiplyScalar(0.45), 0.68, 0.4),
    accent: mat(accent, 0.84),
    eye: new THREE.MeshStandardMaterial({ color: config.species === 'zombie' ? 0xb5c875 : 0xc99348, emissive: config.species === 'zombie' ? 0x3f5424 : 0x432c12, emissiveIntensity: 0.8, roughness: 0.45, flatShading: true }),
    socket: mat(new THREE.Color('#111416'), 1), bone: mat(bone, 0.95), boneDark: mat(bone.clone().multiplyScalar(0.5), 1),
  }
}

function mat(color: THREE.Color, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
}

function addSkeleton(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  addLimb(root, p.Hips.clone().add(new THREE.Vector3(0, -0.04, 0.03)), p.Spine, 0.062, 0.046, m.boneDark, 'Hips', skeleton, index)
  addLimb(root, p.Spine, p.Neck.clone().add(new THREE.Vector3(0, -0.02, 0)), 0.045, 0.032, m.boneDark, 'Spine', skeleton, index)
  addSkeletonPelvis(root, p.Hips, d, m, skeleton, index)
  addSkeletonChest(root, p, d, m, skeleton, index)
  addSkull(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.5, -0.018)), d.headR * 1.02, m, skeleton, index)
  addLimb(root, p.Neck.clone().add(new THREE.Vector3(0, -0.035, 0)), p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.18, 0)), 0.04, 0.032, m.bone, 'Neck', skeleton, index)
  addSkeletonLimbs(root, p, d, m, config, skeleton, index)
}

function addSkeletonPelvis(root: THREE.Group, hips: THREE.Vector3, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, hips.clone().add(new THREE.Vector3(0, 0.005, 0.02)), d.torsoW * 0.46, d.torsoD * 0.55, d.torsoW * 0.34, d.torsoD * 0.48, 0.13, m.boneDark, 'Hips', skeleton, index)
  for (const side of [-1, 1]) {
    addFrustum(root, hips.clone().add(new THREE.Vector3(side * d.torsoW * 0.27, 0.045, 0)), d.torsoW * 0.22, d.torsoD * 0.5, d.torsoW * 0.13, d.torsoD * 0.42, 0.19, m.bone, 'Hips', skeleton, index, new THREE.Euler(0.04, side * 0.05, side * -0.3))
  }
}

function addSkeletonChest(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const chestY = p.Spine.y + d.torso * 0.3
  addLimb(root, new THREE.Vector3(0, chestY - 0.18, -d.torsoD * 0.22), new THREE.Vector3(0, chestY + 0.22, -d.torsoD * 0.22), 0.032, 0.027, m.boneDark, 'Chest', skeleton, index)
  addLimb(root, p.Chest.clone().add(new THREE.Vector3(-0.025, 0.025, 0)), p.UpperArm_L.clone().add(new THREE.Vector3(0.045, 0, 0)), 0.05, 0.034, m.bone, 'Chest', skeleton, index)
  addLimb(root, p.Chest.clone().add(new THREE.Vector3(0.025, 0.025, 0)), p.UpperArm_R.clone().add(new THREE.Vector3(-0.045, 0, 0)), 0.05, 0.034, m.bone, 'Chest', skeleton, index)
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4
    const y = chestY - 0.16 + t * 0.31
    const width = d.torsoW * (0.41 + Math.sin(t * Math.PI) * 0.08)
    const depth = d.torsoD * (0.45 + Math.sin(t * Math.PI) * 0.08)
    for (const side of [-1, 1]) {
      const sternum = new THREE.Vector3(side * 0.018, y, -d.torsoD * 0.2)
      const lateral = new THREE.Vector3(side * width * 0.56, y + 0.012, depth * 0.08)
      const front = new THREE.Vector3(side * width * 0.39, y - 0.005, -depth * 0.72)
      addLimb(root, sternum, lateral, 0.021, 0.018, m.bone, 'Chest', skeleton, index)
      addLimb(root, lateral, front, 0.019, 0.015, m.bone, 'Chest', skeleton, index)
    }
  }
}

function addSkeletonLimbs(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, config: ForgeCharacterConfig, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const arm = d.limbR * 0.72
  const leg = d.limbR * 0.82
  const a = config.asymmetry
  addLimb(root, p.UpperArm_L, p.LowerArm_L, arm * 1.08, arm * 0.78, m.bone, 'UpperArm_L', skeleton, index)
  addLimb(root, p.LowerArm_L, p.Hand_L, arm * 0.82, arm * 0.58, m.bone, 'LowerArm_L', skeleton, index)
  addLimb(root, p.UpperArm_R, p.LowerArm_R, arm * (1.06 - a * 0.05), arm * 0.78, m.bone, 'UpperArm_R', skeleton, index)
  addLimb(root, p.LowerArm_R, p.Hand_R, arm * 0.82, arm * 0.58, m.bone, 'LowerArm_R', skeleton, index)
  addLimb(root, p.UpperLeg_L, p.LowerLeg_L, leg * 1.12, leg * 0.82, m.bone, 'UpperLeg_L', skeleton, index)
  addLimb(root, p.LowerLeg_L, p.Foot_L, leg * 0.88, leg * 0.62, m.bone, 'LowerLeg_L', skeleton, index)
  addLimb(root, p.UpperLeg_R, p.LowerLeg_R, leg * 1.1, leg * 0.82, m.bone, 'UpperLeg_R', skeleton, index)
  addLimb(root, p.LowerLeg_R, p.Foot_R, leg * 0.88, leg * 0.62, m.bone, 'LowerLeg_R', skeleton, index)
  for (const [name, point, radius] of [['LowerArm_L', p.LowerArm_L, arm * 0.86], ['LowerArm_R', p.LowerArm_R, arm * 0.86], ['LowerLeg_L', p.LowerLeg_L, leg * 0.82], ['LowerLeg_R', p.LowerLeg_R, leg * 0.82]] as Array<[string, THREE.Vector3, number]>) addIco(root, point, radius, m.boneDark, name, skeleton, index, new THREE.Vector3(1, 0.8, 1))
  addSkeletonHand(root, p.Hand_L, -1, d, m, 'Hand_L', skeleton, index)
  addSkeletonHand(root, p.Hand_R, 1, d, m, 'Hand_R', skeleton, index)
  addFoot(root, p.Foot_L, d, m.bone, 'Foot_L', skeleton, index, 0.8)
  addFoot(root, p.Foot_R, d, m.bone, 'Foot_R', skeleton, index, 0.8)
}

function addSkeletonHand(root: THREE.Group, point: THREE.Vector3, side: number, d: Dims, m: Materials, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, point.clone().add(new THREE.Vector3(side * 0.02, -0.015, 0)), 0.09, 0.07, 0.06, 0.05, 0.09, m.bone, bone, skeleton, index)
  for (let i = -1; i <= 1; i += 1) addFrustum(root, point.clone().add(new THREE.Vector3(side * 0.07, -0.04 + i * 0.025, -0.005)), 0.05, 0.015, 0.035, 0.012, 0.018, m.bone, bone, skeleton, index, new THREE.Euler(0, 0, side * -0.08))
}

function addSkull(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addIco(root, center.clone().add(new THREE.Vector3(0, r * 0.08, 0.015)), r, m.bone, 'Head', skeleton, index, new THREE.Vector3(0.86, 0.97, 0.84))
  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.64, -r * 0.16)), r * 1.1, r * 0.72, r * 0.82, r * 0.58, r * 0.55, m.bone, 'Head', skeleton, index, new THREE.Euler(0.04, 0, 0))
  for (const side of [-1, 1]) {
    addFrustum(root, center.clone().add(new THREE.Vector3(side * r * 0.55, -r * 0.12, -r * 0.42)), r * 0.36, r * 0.28, r * 0.26, r * 0.2, r * 0.36, m.boneDark, 'Head', skeleton, index, new THREE.Euler(0, side * -0.2, side * 0.18))
    addIco(root, new THREE.Vector3(center.x + side * r * 0.33, center.y + r * 0.12, center.z - r * 0.76), r * 0.18, m.socket, 'Head', skeleton, index, new THREE.Vector3(1.05, 0.78, 0.42))
    addFrustum(root, new THREE.Vector3(center.x + side * r * 0.32, center.y + r * 0.37, center.z - r * 0.67), r * 0.52, r * 0.22, r * 0.42, r * 0.18, r * 0.12, m.boneDark, 'Head', skeleton, index, new THREE.Euler(0.05, 0, side * 0.08))
  }
  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.08, -r * 0.87)), r * 0.22, r * 0.18, r * 0.12, r * 0.14, r * 0.34, m.boneDark, 'Head', skeleton, index)
  for (let i = -2; i <= 2; i += 1) addFrustum(root, center.clone().add(new THREE.Vector3(i * r * 0.19, -r * 0.48, -r * 0.65)), r * 0.13, r * 0.1, r * 0.11, r * 0.08, r * 0.2, m.bone, 'Head', skeleton, index)
}

function addZombie(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  const a = config.asymmetry
  addFrustum(root, midpoint(p.Hips, p.Chest).add(new THREE.Vector3(0.02, 0.03, 0.015)), d.torsoW * 0.88, d.torsoD * 0.96, d.torsoW * 0.58, d.torsoD * 0.8, d.torso * 0.72, m.body, 'Spine', skeleton, index, new THREE.Euler(0.13 + a * 0.06, 0, -0.05 - a * 0.08))
  addFrustum(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(-0.015, 0.045, -0.01)), d.torsoW * 1.04, d.torsoD * 1.05, d.torsoW * 0.74, d.torsoD * 0.9, d.torso * 0.56, m.cloth, 'Chest', skeleton, index, new THREE.Euler(0.1, 0, a * 0.08))
  addFrustum(root, p.Hips.clone().add(new THREE.Vector3(0, -0.07, 0.015)), d.torsoW * 0.72, d.torsoD * 0.86, d.torsoW * 0.62, d.torsoD * 0.78, 0.22, m.clothDark, 'Hips', skeleton, index, new THREE.Euler(0.02, 0, -0.04))
  addLimb(root, p.Neck.clone().add(new THREE.Vector3(0, -0.045, 0.02)), p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.14, -0.04)), d.limbR * 0.9, d.limbR * 0.72, m.bodyDark, 'Neck', skeleton, index)
  addZombieHead(root, p.Head.clone().add(new THREE.Vector3(-0.01, d.headR * 0.46, -0.045)), d.headR, m, skeleton, index)
  addZombieLimbs(root, p, d, m, config, skeleton, index)
  addZombieClothing(root, p, d, m, a, skeleton, index)
  addWound(root, p.Chest.clone().add(new THREE.Vector3(d.torsoW * 0.22, -0.02, -d.torsoD * 0.54)), d, m, skeleton, index)
}

function addZombieHead(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addIco(root, center.clone().add(new THREE.Vector3(0, r * 0.08, 0)), r, m.body, 'Head', skeleton, index, new THREE.Vector3(0.9, 1.02, 0.87))
  addFrustum(root, center.clone().add(new THREE.Vector3(0.02, -r * 0.57, -r * 0.18)), r * 1.05, r * 0.72, r * 0.72, r * 0.58, r * 0.5, m.bodyDark, 'Head', skeleton, index, new THREE.Euler(0.08, 0.05, -0.08))
  for (const side of [-1, 1]) {
    addFrustum(root, new THREE.Vector3(center.x + side * r * 0.36, center.y + r * 0.34, center.z - r * 0.7), r * 0.48, r * 0.2, r * 0.38, r * 0.16, r * 0.13, m.bodyDark, 'Head', skeleton, index, new THREE.Euler(0.04, 0, side * 0.12))
    addIco(root, new THREE.Vector3(center.x + side * r * 0.33, center.y + r * 0.13, center.z - r * 0.78), r * 0.105, m.eye, 'Head', skeleton, index, new THREE.Vector3(1, 0.8, 0.5))
  }
  addFrustum(root, center.clone().add(new THREE.Vector3(-r * 0.04, -r * 0.02, -r * 0.87)), r * 0.18, r * 0.16, r * 0.12, r * 0.13, r * 0.28, m.bodyDark, 'Head', skeleton, index, new THREE.Euler(0.1, 0, -0.06))
  addFrustum(root, center.clone().add(new THREE.Vector3(r * 0.09, -r * 0.47, -r * 0.68)), r * 0.7, r * 0.13, r * 0.55, r * 0.1, r * 0.09, m.accent, 'Head', skeleton, index, new THREE.Euler(0.05, 0, -0.1))
}

function addZombieLimbs(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, config: ForgeCharacterConfig, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const a = config.asymmetry
  const arm = d.limbR * 1.25
  const leg = d.limbR * 1.36
  addLimb(root, p.UpperArm_L, p.LowerArm_L, arm * (1.18 + a * 0.08), arm * 0.98, m.body, 'UpperArm_L', skeleton, index)
  addLimb(root, p.LowerArm_L, p.Hand_L, arm * 1.04, arm * 0.8, m.bodyDark, 'LowerArm_L', skeleton, index)
  addLimb(root, p.UpperArm_R, p.LowerArm_R, arm * (1.05 - a * 0.06), arm * 0.9, m.body, 'UpperArm_R', skeleton, index)
  addLimb(root, p.LowerArm_R, p.Hand_R, arm * 0.98, arm * 0.74, m.bodyDark, 'LowerArm_R', skeleton, index)
  addLimb(root, p.UpperLeg_L, p.LowerLeg_L, leg * 1.08, leg * 0.88, m.bodyDark, 'UpperLeg_L', skeleton, index)
  addLimb(root, p.LowerLeg_L, p.Foot_L, leg * 0.94, leg * 0.74, m.body, 'LowerLeg_L', skeleton, index)
  addLimb(root, p.UpperLeg_R, p.LowerLeg_R, leg * (1.0 - a * 0.04), leg * 0.84, m.bodyDark, 'UpperLeg_R', skeleton, index)
  addLimb(root, p.LowerLeg_R, p.Foot_R, leg * 0.9, leg * 0.7, m.body, 'LowerLeg_R', skeleton, index)
  addHand(root, p.Hand_L, -1, d, m.bodyDark, 'Hand_L', true, skeleton, index)
  addHand(root, p.Hand_R, 1, d, m.bodyDark, 'Hand_R', true, skeleton, index)
  addFoot(root, p.Foot_L, d, m.bodyDark, 'Foot_L', skeleton, index, 1)
  addFoot(root, p.Foot_R, d, m.bodyDark, 'Foot_R', skeleton, index, 0.94)
}

function addZombieClothing(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, asym: number, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(-d.torsoW * 0.23, -0.02, -d.torsoD * 0.54)), d.torsoW * 0.28, 0.05, d.torsoW * 0.2, 0.04, d.torso * 0.36, m.clothDark, 'Spine', skeleton, index, new THREE.Euler(0.02, 0, -0.16 - asym * 0.08))
  addFrustum(root, p.Hips.clone().add(new THREE.Vector3(d.torsoW * 0.19, -0.2, -0.01)), d.torsoW * 0.25, d.torsoD * 0.7, d.torsoW * 0.17, d.torsoD * 0.55, 0.34, m.cloth, 'Hips', skeleton, index, new THREE.Euler(0.03, 0, 0.15))
  addFrustum(root, p.Hips.clone().add(new THREE.Vector3(-d.torsoW * 0.18, -0.22, 0.02)), d.torsoW * 0.22, d.torsoD * 0.66, d.torsoW * 0.14, d.torsoD * 0.5, 0.38, m.clothDark, 'Hips', skeleton, index, new THREE.Euler(-0.02, 0, -0.2))
  addFrustum(root, p.UpperArm_L.clone().add(new THREE.Vector3(0.04, -0.02, 0)), d.limbR * 2.7, d.limbR * 2.2, d.limbR * 2, d.limbR * 1.8, 0.22, m.cloth, 'UpperArm_L', skeleton, index, new THREE.Euler(0, 0, 0.1))
}

function addWound(root: THREE.Group, center: THREE.Vector3, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, center, d.torsoW * 0.2, 0.025, d.torsoW * 0.12, 0.02, 0.18, m.accent, 'Chest', skeleton, index, new THREE.Euler(0.12, 0, 0.28))
  addLimb(root, center.clone().add(new THREE.Vector3(-0.045, 0.07, -0.01)), center.clone().add(new THREE.Vector3(0.035, -0.07, -0.012)), 0.012, 0.009, m.bodyDark, 'Chest', skeleton, index)
}

function addBandit(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  addFrustum(root, midpoint(p.Hips, p.Chest).add(new THREE.Vector3(0, 0.025, 0)), d.torsoW * 0.9, d.torsoD * 0.9, d.torsoW * 0.62, d.torsoD * 0.74, d.torso * 0.7, m.body, 'Spine', skeleton, index)
  addFrustum(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.035, -0.005)), d.torsoW * 1.06, d.torsoD * 1.03, d.torsoW * 0.72, d.torsoD * 0.82, d.torso * 0.59, m.cloth, 'Chest', skeleton, index)
  addFrustum(root, p.Hips.clone().add(new THREE.Vector3(0, -0.065, 0)), d.torsoW * 0.75, d.torsoD * 0.82, d.torsoW * 0.64, d.torsoD * 0.72, 0.23, m.clothDark, 'Hips', skeleton, index)
  addLimb(root, p.Neck.clone().add(new THREE.Vector3(0, -0.04, 0)), p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.16, 0)), d.limbR * 0.86, d.limbR * 0.7, m.bodyDark, 'Neck', skeleton, index)
  addBanditHead(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.46, -0.01)), d.headR, m, skeleton, index)
  addBanditLimbs(root, p, d, m, skeleton, index)
  addBanditClothing(root, p, d, m, skeleton, index)
}

function addBanditHead(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addIco(root, center, r, m.body, 'Head', skeleton, index, new THREE.Vector3(0.88, 1, 0.86))
  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.52, -r * 0.16)), r * 0.9, r * 0.68, r * 0.7, r * 0.56, r * 0.42, m.bodyDark, 'Head', skeleton, index)
  for (const side of [-1, 1]) {
    addFrustum(root, new THREE.Vector3(center.x + side * r * 0.34, center.y + r * 0.3, center.z - r * 0.7), r * 0.42, r * 0.18, r * 0.34, r * 0.15, r * 0.11, m.bodyDark, 'Head', skeleton, index, new THREE.Euler(0.03, 0, side * 0.09))
    addIco(root, new THREE.Vector3(center.x + side * r * 0.31, center.y + r * 0.1, center.z - r * 0.78), r * 0.07, m.eye, 'Head', skeleton, index, new THREE.Vector3(0.8, 0.6, 0.35))
  }
  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.02, -r * 0.85)), r * 0.16, r * 0.14, r * 0.1, r * 0.11, r * 0.26, m.bodyDark, 'Head', skeleton, index)
}

function addBanditLimbs(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const arm = d.limbR * 1.1
  const leg = d.limbR * 1.24
  addLimb(root, p.UpperArm_L, p.LowerArm_L, arm * 1.14, arm * 0.92, m.body, 'UpperArm_L', skeleton, index)
  addLimb(root, p.LowerArm_L, p.Hand_L, arm * 0.98, arm * 0.75, m.body, 'LowerArm_L', skeleton, index)
  addLimb(root, p.UpperArm_R, p.LowerArm_R, arm * 1.14, arm * 0.92, m.body, 'UpperArm_R', skeleton, index)
  addLimb(root, p.LowerArm_R, p.Hand_R, arm * 0.98, arm * 0.75, m.body, 'LowerArm_R', skeleton, index)
  addLimb(root, p.UpperLeg_L, p.LowerLeg_L, leg * 1.15, leg * 0.92, m.bodyDark, 'UpperLeg_L', skeleton, index)
  addLimb(root, p.LowerLeg_L, p.Foot_L, leg * 0.98, leg * 0.74, m.body, 'LowerLeg_L', skeleton, index)
  addLimb(root, p.UpperLeg_R, p.LowerLeg_R, leg * 1.15, leg * 0.92, m.bodyDark, 'UpperLeg_R', skeleton, index)
  addLimb(root, p.LowerLeg_R, p.Foot_R, leg * 0.98, leg * 0.74, m.body, 'LowerLeg_R', skeleton, index)
  addHand(root, p.Hand_L, -1, d, m.body, 'Hand_L', false, skeleton, index)
  addHand(root, p.Hand_R, 1, d, m.body, 'Hand_R', false, skeleton, index)
  addFoot(root, p.Foot_L, d, m.leatherDark, 'Foot_L', skeleton, index, 1.14)
  addFoot(root, p.Foot_R, d, m.leatherDark, 'Foot_R', skeleton, index, 1.14)
  addBracer(root, midpoint(p.LowerArm_L, p.Hand_L), d, m.leather, 'LowerArm_L', skeleton, index)
  addBracer(root, midpoint(p.LowerArm_R, p.Hand_R), d, m.leather, 'LowerArm_R', skeleton, index)
}

function addBanditClothing(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, p.Hips.clone().add(new THREE.Vector3(0, -0.02, -d.torsoD * 0.48)), d.torsoW * 0.9, 0.045, d.torsoW * 0.82, 0.04, 0.08, m.leather, 'Hips', skeleton, index)
  addFrustum(root, p.Hips.clone().add(new THREE.Vector3(0, -0.2, 0)), d.torsoW * 0.68, d.torsoD * 0.7, d.torsoW * 0.56, d.torsoD * 0.6, 0.34, m.clothDark, 'Hips', skeleton, index)
  addFrustum(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.02, -d.torsoD * 0.5)), d.torsoW * 0.7, 0.045, d.torsoW * 0.46, 0.035, d.torso * 0.36, m.leather, 'Chest', skeleton, index, new THREE.Euler(0.03, 0, -0.12))
}

function addGear(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  if (config.armor !== 'none') {
    const heavy = config.armor === 'heavy'
    const armorMat = heavy ? m.metal : m.leather
    addFrustum(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.055, -d.torsoD * 0.48)), d.torsoW * (heavy ? 0.9 : 0.72), d.torsoD * 0.2, d.torsoW * (heavy ? 0.62 : 0.48), d.torsoD * 0.16, d.torso * (heavy ? 0.48 : 0.32), armorMat, 'Chest', skeleton, index, new THREE.Euler(0.05, 0, 0))
    if (heavy) addFrustum(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, -0.12, d.torsoD * 0.48)), d.torsoW * 0.72, d.torsoD * 0.18, d.torsoW * 0.56, d.torsoD * 0.15, d.torso * 0.28, m.metalDark, 'Spine', skeleton, index, new THREE.Euler(-0.04, 0, 0))
    for (const side of [-1, 1]) {
      const shoulder = side < 0 ? p.UpperArm_L : p.UpperArm_R
      const bone = side < 0 ? 'UpperArm_L' : 'UpperArm_R'
      addFrustum(root, shoulder.clone().add(new THREE.Vector3(side * 0.015, 0.03, 0)), heavy ? 0.24 : 0.2, heavy ? 0.25 : 0.21, heavy ? 0.15 : 0.13, heavy ? 0.18 : 0.16, heavy ? 0.2 : 0.15, armorMat, bone, skeleton, index, new THREE.Euler(0, side * -0.12, side * 0.2))
    }
  }

  if (config.headwear === 'hood') {
    addIco(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.45, 0.02)), d.headR * 1.18, m.clothDark, 'Head', skeleton, index, new THREE.Vector3(1.05, 1.08, 1.02))
    addFrustum(root, p.Neck.clone().add(new THREE.Vector3(0, 0.02, 0.02)), d.torsoW * 0.5, d.torsoD * 0.72, d.torsoW * 0.32, d.torsoD * 0.55, 0.16, m.cloth, 'Neck', skeleton, index)
  } else if (config.headwear === 'helmet') {
    addIco(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.48, 0)), d.headR * 1.12, m.metal, 'Head', skeleton, index, new THREE.Vector3(1.02, 0.9, 1.02))
    addFrustum(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.17, -d.headR * 0.77)), d.headR * 1.45, 0.035, d.headR * 1.28, 0.03, d.headR * 0.35, m.metalDark, 'Head', skeleton, index)
  }
}

function addWeapon(hand: THREE.Bone, m: Materials, config: ForgeCharacterConfig) {
  if (config.weapon === 'none') return
  const group = new THREE.Group()
  group.name = 'WeaponSocket_R'
  group.position.set(0.035, -0.015, -0.015)
  group.rotation.set(0.05, 0, 0.08)
  hand.add(group)
  if (config.weapon === 'sword') {
    childBox(group, new THREE.Vector3(0, -0.11, 0), new THREE.Vector3(0.055, 0.22, 0.055), m.leatherDark, 'SwordGrip')
    childBox(group, new THREE.Vector3(0, -0.23, 0), new THREE.Vector3(0.29, 0.045, 0.075), m.accent, 'SwordGuard')
    childFrustum(group, new THREE.Vector3(0, -0.61, 0), 0.095, 0.055, 0.055, 0.035, 0.76, m.metal, 'SwordBlade')
    childFrustum(group, new THREE.Vector3(0, -1.0, 0), 0.055, 0.035, 0.01, 0.015, 0.12, m.metal, 'SwordTip')
  } else if (config.weapon === 'axe') {
    childBox(group, new THREE.Vector3(0, -0.39, 0), new THREE.Vector3(0.06, 0.82, 0.06), m.leatherDark, 'AxeHandle')
    childFrustum(group, new THREE.Vector3(-0.12, -0.78, 0), 0.34, 0.09, 0.2, 0.065, 0.28, m.metal, 'AxeHead', new THREE.Euler(0, 0, Math.PI / 2))
    childBox(group, new THREE.Vector3(0.08, -0.78, 0), new THREE.Vector3(0.18, 0.11, 0.07), m.metalDark, 'AxePoll')
  } else {
    childBox(group, new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.065, 0.82, 0.065), m.leatherDark, 'MaceHandle')
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), m.metal)
    head.name = 'MaceHead'; head.position.set(0, -0.83, 0); group.add(head)
    for (let i = 0; i < 4; i += 1) childFrustum(group, new THREE.Vector3(Math.cos(i * Math.PI / 2) * 0.17, -0.83, Math.sin(i * Math.PI / 2) * 0.17), 0.08, 0.08, 0.015, 0.015, 0.18, m.metalDark, `MaceSpike${i}`, new THREE.Euler(0, 0, Math.PI / 2))
  }
}

function addHand(root: THREE.Group, point: THREE.Vector3, side: number, d: Dims, material: THREE.Material, bone: string, claws: boolean, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, point.clone().add(new THREE.Vector3(side * 0.03, -0.015, 0)), d.limbR * 1.3, d.limbR * 0.95, d.limbR * 0.95, d.limbR * 0.72, 0.12, material, bone, skeleton, index)
  if (claws) for (let i = -1; i <= 1; i += 1) addFrustum(root, point.clone().add(new THREE.Vector3(side * 0.09, -0.055 + i * 0.027, -0.015)), 0.065, 0.02, 0.02, 0.014, 0.09, material, bone, skeleton, index, new THREE.Euler(0, 0, side * -0.12))
}

function addFoot(root: THREE.Group, point: THREE.Vector3, d: Dims, material: THREE.Material, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, scale: number) {
  addFrustum(root, point.clone().add(new THREE.Vector3(0, -0.025, -0.065)), d.limbR * 1.8 * scale, 0.31 * scale, d.limbR * 1.55 * scale, 0.2 * scale, 0.12 * scale, material, bone, skeleton, index, new THREE.Euler(-0.08, 0, 0))
}

function addBracer(root: THREE.Group, center: THREE.Vector3, d: Dims, material: THREE.Material, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addFrustum(root, center, d.limbR * 2.05, d.limbR * 1.75, d.limbR * 1.7, d.limbR * 1.5, 0.16, material, bone, skeleton, index)
}

function addLimb(root: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radiusStart: number, radiusEnd: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const direction = end.clone().sub(start)
  const length = Math.max(0.02, direction.length())
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, length, 6, 1, false)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  const matrix = new THREE.Matrix4().compose(midpoint(start, end), q, new THREE.Vector3(1, 1, 1))
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function addFrustum(root: THREE.Group, center: THREE.Vector3, topW: number, topD: number, bottomW: number, bottomD: number, height: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler(), topOffset = new THREE.Vector2()) {
  const geometry = makeFrustumGeometry(topW, topD, bottomW, bottomD, height, topOffset)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1))
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function makeFrustumGeometry(topW: number, topD: number, bottomW: number, bottomD: number, height: number, topOffset = new THREE.Vector2()) {
  const y0 = -height / 2, y1 = height / 2
  const v = new Float32Array([
    -bottomW/2,y0,-bottomD/2, bottomW/2,y0,-bottomD/2, bottomW/2,y0,bottomD/2, -bottomW/2,y0,bottomD/2,
    -topW/2+topOffset.x,y1,-topD/2+topOffset.y, topW/2+topOffset.x,y1,-topD/2+topOffset.y, topW/2+topOffset.x,y1,topD/2+topOffset.y, -topW/2+topOffset.x,y1,topD/2+topOffset.y,
  ])
  const idx = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(v, 3)); geometry.setIndex(idx); geometry.computeVertexNormals()
  return geometry
}

function addIco(root: THREE.Group, center: THREE.Vector3, radius: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, scale = new THREE.Vector3(1,1,1)) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale)
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function addRigidMesh(root: THREE.Group, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  geometry.applyMatrix4(matrix)
  const count = geometry.attributes.position.count
  const boneIndex = index.get(boneName) ?? 0
  const skinIndices = new Uint16Array(count * 4)
  const skinWeights = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) { skinIndices[i * 4] = boneIndex; skinWeights[i * 4] = 1 }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))
  geometry.computeVertexNormals()
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = `${boneName}_Part_${root.children.length}`
  mesh.frustumCulled = false
  root.add(mesh)
  mesh.bind(skeleton, new THREE.Matrix4())
  return mesh
}

function childBox(parent: THREE.Object3D, center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  mesh.name = name; mesh.position.copy(center); parent.add(mesh); return mesh
}

function childFrustum(parent: THREE.Object3D, center: THREE.Vector3, topW: number, topD: number, bottomW: number, bottomD: number, height: number, material: THREE.Material, name: string, rotation = new THREE.Euler()) {
  const mesh = new THREE.Mesh(makeFrustumGeometry(topW, topD, bottomW, bottomD, height), material)
  mesh.name = name; mesh.position.copy(center); mesh.rotation.copy(rotation); parent.add(mesh); return mesh
}

function positions(bones: Record<string, THREE.Bone>) {
  const result: Record<string, THREE.Vector3> = {}
  bones.Root.updateMatrixWorld(true)
  for (const [name, bone] of Object.entries(bones)) result[name] = bone.getWorldPosition(new THREE.Vector3())
  return result
}

function createAnimationClips(config: ForgeCharacterConfig) {
  const zombie = config.species === 'zombie'
  const skeleton = config.species === 'skeleton'
  const leftRest = zombie ? 48 : skeleton ? 56 : 52
  const rightRest = -leftRest
  const chestLean = zombie ? 12 : skeleton ? 4 : 6
  const knee = zombie ? 12 : 7
  const idle = new THREE.AnimationClip('Idle', 2.4, [
    qTrack('Chest', [0,1.2,2.4], [[chestLean,0,-2],[chestLean+2,1,2],[chestLean,0,-2]]),
    qTrack('Neck', [0,1.2,2.4], [[zombie?-9:-3,0,0],[zombie?-6:1,3,0],[zombie?-9:-3,0,0]]),
    qTrack('Head', [0,1.2,2.4], [[0,-3,0],[1,4,0],[0,-3,0]]),
    qTrack('UpperArm_L', [0,1.2,2.4], [[zombie?12:3,0,leftRest],[zombie?15:5,0,leftRest+3],[zombie?12:3,0,leftRest]]),
    qTrack('UpperArm_R', [0,1.2,2.4], [[zombie?-5:-3,0,rightRest],[zombie?-8:-5,0,rightRest-3],[zombie?-5:-3,0,rightRest]]),
    qTrack('LowerArm_L', [0,1.2,2.4], [[0,0,22],[0,0,27],[0,0,22]]),
    qTrack('LowerArm_R', [0,1.2,2.4], [[0,0,-22],[0,0,-27],[0,0,-22]]),
    qTrack('UpperLeg_L', [0,1.2,2.4], [[-knee,0,-2],[-knee+2,0,1],[-knee,0,-2]]),
    qTrack('UpperLeg_R', [0,1.2,2.4], [[-knee,0,2],[-knee+1,0,-1],[-knee,0,2]]),
    qTrack('LowerLeg_L', [0,1.2,2.4], [[knee+5,0,0],[knee+3,0,0],[knee+5,0,0]]),
    qTrack('LowerLeg_R', [0,1.2,2.4], [[knee+5,0,0],[knee+4,0,0],[knee+5,0,0]]),
  ])
  const walk = new THREE.AnimationClip('Walk', 0.92, [
    qTrack('UpperLeg_L', [0,.23,.46,.69,.92], [[30,0,0],[0,0,0],[-28,0,0],[0,0,0],[30,0,0]]),
    qTrack('UpperLeg_R', [0,.23,.46,.69,.92], [[-28,0,0],[0,0,0],[30,0,0],[0,0,0],[-28,0,0]]),
    qTrack('LowerLeg_L', [0,.23,.46,.69,.92], [[5,0,0],[31,0,0],[5,0,0],[10,0,0],[5,0,0]]),
    qTrack('LowerLeg_R', [0,.23,.46,.69,.92], [[5,0,0],[10,0,0],[5,0,0],[31,0,0],[5,0,0]]),
    qTrack('UpperArm_L', [0,.46,.92], [[-22,0,leftRest],[20,0,leftRest],[-22,0,leftRest]]),
    qTrack('UpperArm_R', [0,.46,.92], [[20,0,rightRest],[-22,0,rightRest],[20,0,rightRest]]),
    qTrack('Chest', [0,.23,.46,.69,.92], [[chestLean,-4,-2],[chestLean+2,0,0],[chestLean,4,2],[chestLean+2,0,0],[chestLean,-4,-2]]),
  ])
  const attack = new THREE.AnimationClip('Attack', 0.82, [
    qTrack('Chest', [0,.18,.42,.82], [[chestLean,0,0],[chestLean-8,-24,-5],[chestLean+7,24,9],[chestLean,0,0]]),
    qTrack('UpperArm_R', [0,.18,.42,.82], [[0,0,rightRest],[-44,-18,-145],[38,10,-24],[0,0,rightRest]]),
    qTrack('LowerArm_R', [0,.18,.42,.82], [[0,0,-22],[-30,0,-45],[-8,0,-6],[0,0,-22]]),
    qTrack('UpperArm_L', [0,.42,.82], [[0,0,leftRest],[-14,0,leftRest+20],[0,0,leftRest]]),
    qTrack('LowerArm_L', [0,.42,.82], [[0,0,22],[0,0,30],[0,0,22]]),
  ])
  const death = new THREE.AnimationClip('Death', 1.5, [
    qTrack('Hips', [0,.48,1.5], [[0,0,0],[5,0,-20],[14,3,-88]]),
    qTrack('Chest', [0,.48,1.5], [[chestLean,0,0],[24,0,8],[44,0,16]]),
    qTrack('Head', [0,.48,1.5], [[0,0,0],[-18,8,0],[-38,12,14]]),
    qTrack('UpperArm_L', [0,.48,1.5], [[0,0,leftRest],[22,0,leftRest+24],[38,0,leftRest+40]]),
    qTrack('UpperArm_R', [0,.48,1.5], [[0,0,rightRest],[-18,0,rightRest-24],[-32,0,rightRest-40]]),
    qTrack('LowerLeg_L', [0,.48,1.5], [[6,0,0],[18,0,0],[34,0,0]]),
  ])
  return [idle, walk, attack, death]
}

function qTrack(name: string, times: number[], rotations: Array<[number, number, number]>) {
  const values: number[] = []
  rotations.forEach(([x,y,z]) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'XYZ'))
    values.push(q.x,q.y,q.z,q.w)
  })
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values)
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3) { return a.clone().add(b).multiplyScalar(0.5) }
function safeNodeName(value: string) { return value.trim().replace(/[^a-z0-9_-]+/gi, '_') || 'ForgeCharacter' }
