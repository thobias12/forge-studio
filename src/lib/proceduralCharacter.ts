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
    name: 'Crypt Skeleton', species: 'skeleton', height: 1.03, bulk: 1.02, shoulders: 1.08, headScale: 0.98,
    armLength: 1.02, legLength: 1.01, asymmetry: 0.14, armor: 'scrap', headwear: 'none', weapon: 'sword',
    primary: '#b8b19c', secondary: '#242a2f', accent: '#6e3c3f',
  },
  zombie: {
    name: 'Crypt Zombie', species: 'zombie', height: 1.05, bulk: 1.18, shoulders: 1.12, headScale: 1.02,
    armLength: 1.04, legLength: 0.98, asymmetry: 0.38, armor: 'none', headwear: 'none', weapon: 'axe',
    primary: '#596a59', secondary: '#3f302b', accent: '#6e3c37',
  },
  bandit: {
    name: 'Dungeon Bandit', species: 'bandit', height: 1.02, bulk: 1.08, shoulders: 1.1, headScale: 0.95,
    armLength: 1, legLength: 1, asymmetry: 0.07, armor: 'scrap', headwear: 'hood', weapon: 'sword',
    primary: '#95705b', secondary: '#293540', accent: '#76532f',
  },
}

export function cloneForgeCharacterConfig(species: ForgeCharacterSpecies): ForgeCharacterConfig {
  return { ...FORGE_CHARACTER_PRESETS[species] }
}

export function createProceduralCharacter(config: ForgeCharacterConfig): ForgeCharacterBuild {
  const root = new THREE.Group()
  root.name = safeNodeName(config.name || 'ForgeCharacter')
  root.userData.forgeCharacter = {
    format: 'ForgeCharacter', version: 2, rig: 'ForgeHumanoidV1', species: config.species,
    artStyle: 'dark-arpg', archetypeVersion: 2,
    collisionCapsule: { radius: 0.32 * config.bulk, height: BASE_HEIGHT * config.height },
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

  if (config.species === 'skeleton') addSkeletonArchetype(root, bones, skeleton, index, mats, dims, config)
  else if (config.species === 'zombie') addZombieArchetype(root, bones, skeleton, index, mats, dims, config)
  else addBanditArchetype(root, bones, skeleton, index, mats, dims, config)
  addGear(root, bones, skeleton, index, mats, dims, config)
  addWeapon(bones, mats, config)

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
    if (mesh.isMesh) triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position?.count ? mesh.geometry.attributes.position.count / 3 : 0
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
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of list) {
      materials.add(material)
      const mapped = material as THREE.Material & { map?: THREE.Texture | null; roughnessMap?: THREE.Texture | null }
      if (mapped.map) textures.add(mapped.map)
      if (mapped.roughnessMap) textures.add(mapped.roughnessMap)
    }
  })
  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
  root.removeFromParent()
}

type Dims = {
  height: number; hipsY: number; torso: number; shoulderX: number; upperArm: number; lowerArm: number;
  upperLeg: number; lowerLeg: number; headR: number; limbR: number; torsoW: number; torsoD: number
}

type Materials = {
  body: THREE.MeshStandardMaterial; bodyDark: THREE.MeshStandardMaterial; cloth: THREE.MeshStandardMaterial;
  clothDark: THREE.MeshStandardMaterial; leather: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial; eye: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial; boneDark: THREE.MeshStandardMaterial
}

function dimensions(config: ForgeCharacterConfig): Dims {
  const height = BASE_HEIGHT * config.height
  const scale = height / BASE_HEIGHT
  return {
    height,
    hipsY: 0.89 * scale * config.legLength,
    torso: 0.56 * scale,
    shoulderX: 0.32 * config.shoulders * config.bulk,
    upperArm: 0.36 * scale * config.armLength,
    lowerArm: 0.34 * scale * config.armLength,
    upperLeg: 0.42 * scale * config.legLength,
    lowerLeg: 0.43 * scale * config.legLength,
    headR: 0.14 * scale * config.headScale,
    limbR: 0.078 * config.bulk,
    torsoW: 0.48 * config.bulk * config.shoulders,
    torsoD: 0.27 * config.bulk,
  }
}

function createRig(d: Dims): Record<string, THREE.Bone> {
  const bone = (name: string, x = 0, y = 0, z = 0) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); return b }
  const Root = bone('Root')
  const Hips = bone('Hips', 0, d.hipsY, 0)
  const Spine = bone('Spine', 0, d.torso * 0.32, 0)
  const Chest = bone('Chest', 0, d.torso * 0.43, -0.012)
  const Neck = bone('Neck', 0, d.torso * 0.3, -0.018)
  const Head = bone('Head', 0, d.headR * 0.9, -0.012)
  Root.add(Hips); Hips.add(Spine); Spine.add(Chest); Chest.add(Neck); Neck.add(Head)

  const UpperArm_L = bone('UpperArm_L', -d.shoulderX, d.torso * 0.11, 0)
  const LowerArm_L = bone('LowerArm_L', -d.upperArm, -0.018, 0)
  const Hand_L = bone('Hand_L', -d.lowerArm, 0, 0)
  const UpperArm_R = bone('UpperArm_R', d.shoulderX, d.torso * 0.11, 0)
  const LowerArm_R = bone('LowerArm_R', d.upperArm, -0.018, 0)
  const Hand_R = bone('Hand_R', d.lowerArm, 0, 0)
  Chest.add(UpperArm_L, UpperArm_R); UpperArm_L.add(LowerArm_L); LowerArm_L.add(Hand_L); UpperArm_R.add(LowerArm_R); LowerArm_R.add(Hand_R)

  const hipOffset = 0.145 * d.torsoW / 0.48
  const UpperLeg_L = bone('UpperLeg_L', -hipOffset, -0.055, 0)
  const LowerLeg_L = bone('LowerLeg_L', 0, -d.upperLeg, 0.02)
  const Foot_L = bone('Foot_L', 0, -d.lowerLeg, 0.065)
  const UpperLeg_R = bone('UpperLeg_R', hipOffset, -0.055, 0)
  const LowerLeg_R = bone('LowerLeg_R', 0, -d.upperLeg, 0.02)
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
  const bodyColor = new THREE.Color(config.primary)
  const secondary = new THREE.Color(config.secondary)
  const accent = new THREE.Color(config.accent)
  const boneColor = config.species === 'skeleton' ? bodyColor : new THREE.Color('#b8b19c')
  const metal = new THREE.Color('#555a5d')
  return {
    body: new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9, metalness: 0.01, flatShading: true }),
    bodyDark: new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.58), roughness: 0.97, flatShading: true }),
    cloth: new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.98, flatShading: true }),
    clothDark: new THREE.MeshStandardMaterial({ color: secondary.clone().multiplyScalar(0.54), roughness: 1, flatShading: true }),
    leather: new THREE.MeshStandardMaterial({ color: accent.clone().multiplyScalar(0.78), roughness: 0.88, metalness: 0.015, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: metal, roughness: 0.55, metalness: 0.5, flatShading: true }),
    metalDark: new THREE.MeshStandardMaterial({ color: metal.clone().multiplyScalar(0.48), roughness: 0.68, metalness: 0.42, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.84, metalness: 0.03, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: config.species === 'zombie' ? 0xb6c77a : 0xd4a95b, emissive: config.species === 'zombie' ? 0x445628 : 0x4d3415, emissiveIntensity: 0.72, roughness: 0.5 }),
    bone: new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.94, flatShading: true }),
    boneDark: new THREE.MeshStandardMaterial({ color: boneColor.clone().multiplyScalar(0.56), roughness: 1, flatShading: true }),
  }
}

function addSkeletonArchetype(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  addTaperedLimb(root, p.Hips.clone().add(new THREE.Vector3(0, -0.06, 0)), p.Spine, 0.055, 0.042, m.boneDark, 'Hips', skeleton, index)
  addTaperedLimb(root, p.Spine, p.Neck, 0.042, 0.032, m.boneDark, 'Spine', skeleton, index)
  addPelvis(root, p.Hips, d, m, skeleton, index)
  addSkeletonRibcage(root, p, d, m, skeleton, index)
  addTaperedLimb(root, p.Chest.clone().add(new THREE.Vector3(-0.02, 0.03, 0)), p.UpperArm_L, 0.045, 0.034, m.bone, 'Chest', skeleton, index)
  addTaperedLimb(root, p.Chest.clone().add(new THREE.Vector3(0.02, 0.03, 0)), p.UpperArm_R, 0.045, 0.034, m.bone, 'Chest', skeleton, index)
  addSkull(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.5, -0.01)), d.headR * 1.04, m, 'Head', skeleton, index)
  addTaperedLimb(root, p.Neck.clone().add(new THREE.Vector3(0, -0.01, 0)), p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.22, 0)), 0.038, 0.032, m.bone, 'Neck', skeleton, index)
  addSkeletalLimbs(root, bones, skeleton, index, m, d, config)
}

function addPelvis(root: THREE.Group, hips: THREE.Vector3, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addBox(root, hips.clone().add(new THREE.Vector3(0, -0.005, 0)), new THREE.Vector3(d.torsoW * 0.46, 0.12, d.torsoD * 0.62), m.boneDark, 'Hips', skeleton, index)
  for (const side of [-1, 1]) addBox(root, hips.clone().add(new THREE.Vector3(side * d.torsoW * 0.25, 0.035, 0)), new THREE.Vector3(d.torsoW * 0.28, 0.16, d.torsoD * 0.58), m.bone, 'Hips', skeleton, index, new THREE.Euler(0.05, 0, side * -0.28))
}

function addSkeletonRibcage(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const baseY = p.Spine.y + 0.105
  for (let i = 0; i < 5; i += 1) {
    const y = baseY + i * d.torso * 0.125
    const width = (0.225 + Math.sin((i / 4) * Math.PI) * 0.055) * d.torsoW / 0.48
    addTorus(root, new THREE.Vector3(0, y, 0), width, 0.021 + i * 0.001, m.bone, 'Chest', skeleton, index, new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(1, 0.72, 0.78))
  }
  addTaperedLimb(root, new THREE.Vector3(0, baseY - 0.02, -d.torsoD * 0.18), new THREE.Vector3(0, baseY + d.torso * 0.56, -d.torsoD * 0.18), 0.032, 0.026, m.boneDark, 'Chest', skeleton, index)
}

function addSkeletalLimbs(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  const arm = d.limbR * 0.58
  const leg = d.limbR * 0.66
  addTaperedLimb(root, p.UpperArm_L, p.LowerArm_L, arm * 1.05, arm * 0.8, m.bone, 'UpperArm_L', skeleton, index)
  addTaperedLimb(root, p.LowerArm_L, p.Hand_L, arm * 0.8, arm * 0.58, m.bone, 'LowerArm_L', skeleton, index)
  addTaperedLimb(root, p.UpperArm_R, p.LowerArm_R, arm * (1 - config.asymmetry * 0.05), arm * 0.78, m.bone, 'UpperArm_R', skeleton, index)
  addTaperedLimb(root, p.LowerArm_R, p.Hand_R, arm * 0.8, arm * 0.58, m.bone, 'LowerArm_R', skeleton, index)
  addTaperedLimb(root, p.UpperLeg_L, p.LowerLeg_L, leg * 1.08, leg * 0.82, m.bone, 'UpperLeg_L', skeleton, index)
  addTaperedLimb(root, p.LowerLeg_L, p.Foot_L, leg * 0.82, leg * 0.58, m.bone, 'LowerLeg_L', skeleton, index)
  addTaperedLimb(root, p.UpperLeg_R, p.LowerLeg_R, leg * 1.08, leg * 0.82, m.bone, 'UpperLeg_R', skeleton, index)
  addTaperedLimb(root, p.LowerLeg_R, p.Foot_R, leg * 0.82, leg * 0.58, m.bone, 'LowerLeg_R', skeleton, index)
  for (const [name, point, radius] of [['LowerArm_L', p.LowerArm_L, arm * 0.82], ['LowerArm_R', p.LowerArm_R, arm * 0.82], ['LowerLeg_L', p.LowerLeg_L, leg * 0.78], ['LowerLeg_R', p.LowerLeg_R, leg * 0.78]] as Array<[string, THREE.Vector3, number]>) addJoint(root, point, radius, m.boneDark, name, skeleton, index)
  addSkeletonHand(root, p.Hand_L, -1, m, 'Hand_L', skeleton, index, d)
  addSkeletonHand(root, p.Hand_R, 1, m, 'Hand_R', skeleton, index, d)
  addBootLikeFoot(root, p.Foot_L, m.bone, 'Foot_L', skeleton, index, d, 0.72)
  addBootLikeFoot(root, p.Foot_R, m.bone, 'Foot_R', skeleton, index, d, 0.72)
}

function addSkeletonHand(root: THREE.Group, point: THREE.Vector3, side: number, m: Materials, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, d: Dims) {
  addSphere(root, point.clone().add(new THREE.Vector3(side * 0.035, -0.012, 0)), d.limbR * 0.58, m.bone, bone, skeleton, index, new THREE.Vector3(0.9, 0.72, 0.72))
  for (let i = -1; i <= 1; i += 1) addBox(root, point.clone().add(new THREE.Vector3(side * (0.075 + Math.abs(i) * 0.006), -0.045 + i * 0.025, -0.01)), new THREE.Vector3(0.055, 0.018, 0.018), m.bone, bone, skeleton, index)
}

function addZombieArchetype(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  const asym = config.asymmetry
  addTorso(root, midpoint(p.Hips, p.Chest).add(new THREE.Vector3(0.015, 0.02, 0.015)), d.torso * 0.74, d.torsoW * 0.5, d.torsoW * 0.37, d.torsoD * 0.56, m.body, 'Spine', skeleton, index, new THREE.Euler(0.08 + asym * 0.08, 0, -0.04 - asym * 0.1))
  addTorso(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(-0.01, 0.035, -0.01)), d.torso * 0.56, d.torsoW * 0.57, d.torsoW * 0.42, d.torsoD * 0.64, m.cloth, 'Chest', skeleton, index, new THREE.Euler(0.1, 0, asym * 0.08))
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, -0.105, 0.01)), new THREE.Vector3(d.torsoW * 0.72, 0.2, d.torsoD * 0.92), m.clothDark, 'Hips', skeleton, index, new THREE.Euler(0.02, 0, -0.03))
  addTaperedLimb(root, p.Neck.clone().add(new THREE.Vector3(0, -0.04, 0)), p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.2, -0.01)), d.limbR * 0.8, d.limbR * 0.68, m.bodyDark, 'Neck', skeleton, index)
  addFleshyHead(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.5, -0.025)), d.headR * 1.02, m, config, 'Head', skeleton, index, true)
  addFleshyLimbs(root, bones, skeleton, index, m, d, config, true)
  addTornCloth(root, p, d, m, skeleton, index, asym)
  addWound(root, p.Chest.clone().add(new THREE.Vector3(d.torsoW * 0.23, -0.02, -d.torsoD * 0.54)), d, m, skeleton, index)
}

function addBanditArchetype(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  addTorso(root, midpoint(p.Hips, p.Chest).add(new THREE.Vector3(0, 0.025, 0)), d.torso * 0.73, d.torsoW * 0.5, d.torsoW * 0.38, d.torsoD * 0.56, m.body, 'Spine', skeleton, index)
  addTorso(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.025, 0)), d.torso * 0.61, d.torsoW * 0.57, d.torsoW * 0.44, d.torsoD * 0.64, m.cloth, 'Chest', skeleton, index)
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, -0.09, 0)), new THREE.Vector3(d.torsoW * 0.78, 0.19, d.torsoD * 0.96), m.clothDark, 'Hips', skeleton, index)
  addTaperedLimb(root, p.Neck.clone().add(new THREE.Vector3(0, -0.035, 0)), p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.2, 0)), d.limbR * 0.8, d.limbR * 0.67, m.bodyDark, 'Neck', skeleton, index)
  addFleshyHead(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.5, 0)), d.headR, m, config, 'Head', skeleton, index, false)
  addFleshyLimbs(root, bones, skeleton, index, m, d, config, false)
  addBanditClothing(root, p, d, m, skeleton, index)
}

function addTorso(root: THREE.Group, center: THREE.Vector3, height: number, topHalfWidth: number, bottomHalfWidth: number, depth: number, material: THREE.Material, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler()) {
  const geometry = new THREE.CylinderGeometry(topHalfWidth, bottomHalfWidth, height, 6, 1, false)
  const scale = new THREE.Vector3(1, 1, depth / Math.max(0.001, (topHalfWidth + bottomHalfWidth)))
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), scale)
  addRigidMesh(root, geometry, matrix, material, bone, skeleton, index)
}

function addFleshyLimbs(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig, zombie: boolean) {
  const p = positions(bones)
  const a = config.asymmetry
  const arm = d.limbR * (zombie ? 1.12 : 1.03)
  const leg = d.limbR * (zombie ? 1.22 : 1.15)
  addTaperedLimb(root, p.UpperArm_L, p.LowerArm_L, arm * (1.12 + a * 0.08), arm * 0.92, m.body, 'UpperArm_L', skeleton, index)
  addTaperedLimb(root, p.LowerArm_L, p.Hand_L, arm * 0.94, arm * 0.72, m.bodyDark, 'LowerArm_L', skeleton, index)
  addTaperedLimb(root, p.UpperArm_R, p.LowerArm_R, arm * (1.08 - a * 0.06), arm * 0.9, m.body, 'UpperArm_R', skeleton, index)
  addTaperedLimb(root, p.LowerArm_R, p.Hand_R, arm * 0.92, arm * 0.72, m.bodyDark, 'LowerArm_R', skeleton, index)
  addTaperedLimb(root, p.UpperLeg_L, p.LowerLeg_L, leg * 1.12, leg * 0.92, m.bodyDark, 'UpperLeg_L', skeleton, index)
  addTaperedLimb(root, p.LowerLeg_L, p.Foot_L, leg * 0.94, leg * 0.74, m.body, 'LowerLeg_L', skeleton, index)
  addTaperedLimb(root, p.UpperLeg_R, p.LowerLeg_R, leg * (1.1 - a * 0.04), leg * 0.9, m.bodyDark, 'UpperLeg_R', skeleton, index)
  addTaperedLimb(root, p.LowerLeg_R, p.Foot_R, leg * 0.92, leg * 0.72, m.body, 'LowerLeg_R', skeleton, index)
  addHand(root, p.Hand_L, -1, zombie ? m.bodyDark : m.body, 'Hand_L', skeleton, index, d, zombie)
  addHand(root, p.Hand_R, 1, zombie ? m.bodyDark : m.body, 'Hand_R', skeleton, index, d, zombie)
  addBootLikeFoot(root, p.Foot_L, zombie ? m.bodyDark : m.leather, 'Foot_L', skeleton, index, d, zombie ? 0.9 : 1.06)
  addBootLikeFoot(root, p.Foot_R, zombie ? m.bodyDark : m.leather, 'Foot_R', skeleton, index, d, zombie ? 0.9 : 1.06)
  if (!zombie) {
    addBracer(root, midpoint(p.LowerArm_L, p.Hand_L), m.leather, 'LowerArm_L', skeleton, index, d)
    addBracer(root, midpoint(p.LowerArm_R, p.Hand_R), m.leather, 'LowerArm_R', skeleton, index, d)
  }
}

function addHand(root: THREE.Group, point: THREE.Vector3, side: number, material: THREE.Material, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, d: Dims, zombie: boolean) {
  addSphere(root, point.clone().add(new THREE.Vector3(side * 0.035, -0.012, 0)), d.limbR * (zombie ? 0.92 : 0.82), material, bone, skeleton, index, new THREE.Vector3(1.05, 0.82, 0.8))
  if (zombie) for (let i = -1; i <= 1; i += 1) addBox(root, point.clone().add(new THREE.Vector3(side * 0.082, -0.045 + i * 0.028, -0.018)), new THREE.Vector3(0.07, 0.022, 0.018), material, bone, skeleton, index)
}

function addBootLikeFoot(root: THREE.Group, point: THREE.Vector3, material: THREE.Material, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, d: Dims, scale = 1) {
  addBox(root, point.clone().add(new THREE.Vector3(0, -0.03, -0.045)), new THREE.Vector3(d.limbR * 1.7 * scale, 0.095 * scale, 0.3 * scale), material, bone, skeleton, index, new THREE.Euler(-0.08, 0, 0))
}

function addBracer(root: THREE.Group, center: THREE.Vector3, material: THREE.Material, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, d: Dims) {
  addSphere(root, center, d.limbR * 1.05, material, bone, skeleton, index, new THREE.Vector3(0.9, 1.6, 0.9))
}

function addTornCloth(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>, asym: number) {
  addBox(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(-d.torsoW * 0.27, -0.02, -d.torsoD * 0.58)), new THREE.Vector3(d.torsoW * 0.24, d.torso * 0.34, 0.035), m.clothDark, 'Spine', skeleton, index, new THREE.Euler(0.03, 0, -0.12 - asym * 0.1))
  addBox(root, p.Hips.clone().add(new THREE.Vector3(d.torsoW * 0.2, -0.18, -0.02)), new THREE.Vector3(d.torsoW * 0.24, 0.28, d.torsoD * 0.72), m.cloth, 'Hips', skeleton, index, new THREE.Euler(0.04, 0, 0.12))
  addBox(root, p.Hips.clone().add(new THREE.Vector3(-d.torsoW * 0.19, -0.2, 0.015)), new THREE.Vector3(d.torsoW * 0.21, 0.33, d.torsoD * 0.66), m.clothDark, 'Hips', skeleton, index, new THREE.Euler(-0.03, 0, -0.18))
}

function addWound(root: THREE.Group, center: THREE.Vector3, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addBox(root, center, new THREE.Vector3(d.torsoW * 0.2, 0.18, 0.024), m.accent, 'Chest', skeleton, index, new THREE.Euler(0.12, 0, 0.28))
  addBox(root, center.clone().add(new THREE.Vector3(-0.055, 0.02, -0.012)), new THREE.Vector3(0.018, 0.13, 0.018), m.bodyDark, 'Chest', skeleton, index, new THREE.Euler(0, 0, -0.35))
}

function addBanditClothing(root: THREE.Group, p: Record<string, THREE.Vector3>, d: Dims, m: Materials, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, -0.015, -d.torsoD * 0.55)), new THREE.Vector3(d.torsoW * 0.92, 0.075, 0.045), m.leather, 'Hips', skeleton, index)
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, -0.18, -0.015)), new THREE.Vector3(d.torsoW * 0.68, 0.3, d.torsoD * 0.78), m.clothDark, 'Hips', skeleton, index)
  addBox(root, p.Chest.clone().add(new THREE.Vector3(0, 0.01, -d.torsoD * 0.6)), new THREE.Vector3(d.torsoW * 0.72, 0.08, 0.035), m.leather, 'Chest', skeleton, index, new THREE.Euler(0, 0, -0.15))
}

function addGear(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  if (config.armor !== 'none') {
    const heavy = config.armor === 'heavy'
    const plateMaterial = heavy ? m.metal : m.leather
    addTorso(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.055, -0.018)), d.torso * (heavy ? 0.48 : 0.34), d.torsoW * (heavy ? 0.54 : 0.47), d.torsoW * (heavy ? 0.44 : 0.4), d.torsoD * (heavy ? 0.69 : 0.64), plateMaterial, 'Chest', skeleton, index, new THREE.Euler(0.03, 0, 0))
    if (heavy) addBox(root, p.Chest.clone().add(new THREE.Vector3(0, 0.02, -d.torsoD * 0.66)), new THREE.Vector3(d.torsoW * 0.45, 0.15, 0.04), m.metalDark, 'Chest', skeleton, index)
    for (const side of [-1, 1]) {
      const name = side < 0 ? 'UpperArm_L' : 'UpperArm_R'
      const shoulder = side < 0 ? p.UpperArm_L : p.UpperArm_R
      addSphere(root, shoulder.clone().add(new THREE.Vector3(side * 0.018, 0.025, 0)), d.limbR * (heavy ? 1.7 : 1.45), plateMaterial, name, skeleton, index, new THREE.Vector3(1.25, 0.7, heavy ? 1.35 : 1.1))
    }
  }
  if (config.headwear === 'hood') {
    addSphere(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.48, 0.025)), d.headR * 1.22, m.clothDark, 'Head', skeleton, index, new THREE.Vector3(1, 1.08, 1.02))
    addTorus(root, p.Neck.clone().add(new THREE.Vector3(0, -0.015, 0)), d.headR * 1.05, d.headR * 0.18, m.cloth, 'Neck', skeleton, index, new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(1, 0.75, 1))
  } else if (config.headwear === 'helmet') {
    addSphere(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.62, 0)), d.headR * 1.13, m.metal, 'Head', skeleton, index, new THREE.Vector3(1, 0.78, 1.02))
    addBox(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.33, -d.headR * 0.9)), new THREE.Vector3(d.headR * 1.5, d.headR * 0.33, 0.035), m.metalDark, 'Head', skeleton, index)
  }
}

function addWeapon(bones: Record<string, THREE.Bone>, m: Materials, config: ForgeCharacterConfig) {
  if (config.weapon === 'none') return
  const hand = bones.Hand_R
  const group = new THREE.Group()
  group.name = 'WeaponSocket_Attachment'
  group.position.set(0.02, -0.015, -0.02)
  hand.add(group)
  const wood = m.leather
  if (config.weapon === 'sword') {
    const blade = mesh(new THREE.BoxGeometry(0.62, 0.052, 0.04), m.metal); blade.position.set(0.39, 0, 0); blade.rotation.z = 0.02
    const tip = mesh(new THREE.ConeGeometry(0.045, 0.16, 4), m.metal); tip.rotation.z = -Math.PI / 2; tip.position.set(0.78, 0, 0)
    const guard = mesh(new THREE.BoxGeometry(0.055, 0.29, 0.065), m.metalDark); guard.position.set(0.055, 0, 0)
    const grip = mesh(new THREE.CylinderGeometry(0.027, 0.032, 0.22, 6), wood); grip.rotation.z = -Math.PI / 2; grip.position.set(-0.07, 0, 0)
    group.add(blade, tip, guard, grip)
  } else if (config.weapon === 'axe') {
    const handle = mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.68, 6), wood); handle.rotation.z = -Math.PI / 2; handle.position.set(0.31, 0, 0)
    const head = mesh(new THREE.BoxGeometry(0.18, 0.3, 0.07), m.metal); head.position.set(0.66, 0.09, 0); head.rotation.z = 0.18
    const back = mesh(new THREE.BoxGeometry(0.13, 0.12, 0.065), m.metalDark); back.position.set(0.62, -0.13, 0)
    group.add(handle, head, back)
  } else {
    const handle = mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.62, 6), wood); handle.rotation.z = -Math.PI / 2; handle.position.set(0.28, 0, 0)
    const head = mesh(new THREE.DodecahedronGeometry(0.13, 0), m.metal); head.position.set(0.63, 0, 0); head.scale.set(1.05, 1.2, 1.05)
    group.add(handle, head)
  }
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material) { const result = new THREE.Mesh(geometry, material); result.castShadow = true; result.receiveShadow = true; return result }

function addFleshyHead(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, config: ForgeCharacterConfig, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>, zombie: boolean) {
  addSphere(root, center.clone().add(new THREE.Vector3(0, r * 0.04, 0)), r, m.body, bone, skeleton, index, new THREE.Vector3(0.9, 1.08, 0.92))
  addBox(root, center.clone().add(new THREE.Vector3(0, -r * 0.58, -r * 0.08)), new THREE.Vector3(r * 1.08, r * 0.42, r * 0.78), zombie ? m.bodyDark : m.body, bone, skeleton, index, new THREE.Euler(0.06, 0, zombie ? -0.08 : 0))
  addBox(root, center.clone().add(new THREE.Vector3(0, r * 0.23, -r * 0.82)), new THREE.Vector3(r * 1.18, r * 0.18, r * 0.1), zombie ? m.bodyDark : m.leather, bone, skeleton, index, new THREE.Euler(-0.05, 0, 0))
  addBox(root, center.clone().add(new THREE.Vector3(0, -r * 0.02, -r * 0.94)), new THREE.Vector3(r * 0.18, r * 0.3, r * 0.14), zombie ? m.bodyDark : m.body, bone, skeleton, index, new THREE.Euler(-0.14, 0, 0))
  const eyeY = center.y + r * 0.12, eyeZ = center.z - r * 0.88
  for (const side of [-1, 1]) addSphere(root, new THREE.Vector3(center.x + side * r * 0.34, eyeY + (zombie && side > 0 ? -r * 0.05 : 0), eyeZ), r * (zombie ? 0.09 : 0.075), m.eye, bone, skeleton, index, new THREE.Vector3(1, 0.82, 0.42))
  if (zombie) addBox(root, center.clone().add(new THREE.Vector3(r * 0.28, -r * 0.38, -r * 0.79)), new THREE.Vector3(r * 0.48, r * 0.09, r * 0.08), m.accent, bone, skeleton, index, new THREE.Euler(0, 0, -0.24))
}

function addSkull(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addSphere(root, center.clone().add(new THREE.Vector3(0, r * 0.1, 0.03)), r, m.bone, bone, skeleton, index, new THREE.Vector3(0.9, 1.02, 0.92))
  addBox(root, center.clone().add(new THREE.Vector3(0, -r * 0.59, -r * 0.04)), new THREE.Vector3(r * 1.05, r * 0.38, r * 0.7), m.boneDark, bone, skeleton, index, new THREE.Euler(0.06, 0, 0))
  addBox(root, center.clone().add(new THREE.Vector3(0, r * 0.23, -r * 0.78)), new THREE.Vector3(r * 1.28, r * 0.17, r * 0.11), m.boneDark, bone, skeleton, index)
  const socketY = center.y + r * 0.08
  for (const side of [-1, 1]) {
    addSphere(root, new THREE.Vector3(center.x + side * r * 0.34, socketY, center.z - r * 0.79), r * 0.17, m.clothDark, bone, skeleton, index, new THREE.Vector3(1, 0.82, 0.38))
    addBox(root, new THREE.Vector3(center.x + side * r * 0.42, center.y - r * 0.18, center.z - r * 0.68), new THREE.Vector3(r * 0.28, r * 0.12, r * 0.12), m.bone, bone, skeleton, index, new THREE.Euler(0, 0, side * 0.25))
  }
  addBox(root, center.clone().add(new THREE.Vector3(0, -r * 0.05, -r * 0.94)), new THREE.Vector3(r * 0.13, r * 0.25, r * 0.12), m.boneDark, bone, skeleton, index, new THREE.Euler(-0.1, 0, 0))
  for (let i = -2; i <= 2; i += 1) addBox(root, center.clone().add(new THREE.Vector3(i * r * 0.16, -r * 0.65, -r * 0.43)), new THREE.Vector3(r * 0.1, r * 0.12, r * 0.08), m.bone, bone, skeleton, index)
}

function addTaperedLimb(root: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radiusStart: number, radiusEnd: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const direction = end.clone().sub(start), length = Math.max(0.02, direction.length())
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, length, 6, 1, false)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
  const matrix = new THREE.Matrix4().compose(midpoint(start, end), quaternion, new THREE.Vector3(1, 1, 1))
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function addBox(root: THREE.Group, center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler()) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z, 1, 1, 1)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1))
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function addSphere(root: THREE.Group, center: THREE.Vector3, radius: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, scale = new THREE.Vector3(1, 1, 1)) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale)
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function addJoint(root: THREE.Group, center: THREE.Vector3, radius: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) { addSphere(root, center, radius, material, boneName, skeleton, index) }

function addTorus(root: THREE.Group, center: THREE.Vector3, radius: number, tube: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 0.72, 1)) {
  const geometry = new THREE.TorusGeometry(radius, tube, 5, 14)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), scale)
  addRigidMesh(root, geometry, matrix, material, boneName, skeleton, index)
}

function addRigidMesh(root: THREE.Group, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  geometry.applyMatrix4(matrix)
  const count = geometry.attributes.position.count, boneIndex = index.get(boneName) ?? 0
  const skinIndices = new Uint16Array(count * 4), skinWeights = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) { skinIndices[i * 4] = boneIndex; skinWeights[i * 4] = 1 }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4)); geometry.computeVertexNormals()
  const skinned = new THREE.SkinnedMesh(geometry, material); skinned.name = `${boneName}_Part_${root.children.length}`; skinned.frustumCulled = false; root.add(skinned); skinned.bind(skeleton, new THREE.Matrix4()); return skinned
}

function positions(bones: Record<string, THREE.Bone>) { const result: Record<string, THREE.Vector3> = {}; bones.Root.updateMatrixWorld(true); for (const [name, bone] of Object.entries(bones)) result[name] = bone.getWorldPosition(new THREE.Vector3()); return result }

function createAnimationClips(config: ForgeCharacterConfig) {
  const zombie = config.species === 'zombie', skeleton = config.species === 'skeleton'
  const leftRest = zombie ? 54 : skeleton ? 60 : 62, rightRest = zombie ? -66 : skeleton ? -60 : -62, chestLean = zombie ? 10 : skeleton ? 2 : 4
  const idle = new THREE.AnimationClip('Idle', 2.6, [
    qTrack('Hips', [0, 1.3, 2.6], [[0, 0, -1], [1.5, 0, 1], [0, 0, -1]]),
    qTrack('Chest', [0, 1.3, 2.6], [[chestLean, 0, -2], [chestLean + 2, 0, 2], [chestLean, 0, -2]]),
    qTrack('Neck', [0, 1.3, 2.6], [[zombie ? -8 : -2, 0, 0], [zombie ? -5 : 1, 2, 0], [zombie ? -8 : -2, 0, 0]]),
    qTrack('UpperArm_L', [0, 1.3, 2.6], [[-4, 0, leftRest], [2, 0, leftRest + 4], [-4, 0, leftRest]]),
    qTrack('LowerArm_L', [0, 1.3, 2.6], [[0, 0, 18], [0, 0, 23], [0, 0, 18]]),
    qTrack('UpperArm_R', [0, 1.3, 2.6], [[4, 0, rightRest], [-2, 0, rightRest - 4], [4, 0, rightRest]]),
    qTrack('LowerArm_R', [0, 1.3, 2.6], [[0, 0, -18], [0, 0, -23], [0, 0, -18]]),
    qTrack('UpperLeg_L', [0, 1.3, 2.6], [[zombie ? 5 : 2, 0, -2], [zombie ? 3 : 1, 0, -1], [zombie ? 5 : 2, 0, -2]]),
    qTrack('UpperLeg_R', [0, 1.3, 2.6], [[zombie ? -2 : 1, 0, 2], [0, 0, 1], [zombie ? -2 : 1, 0, 2]]),
    qTrack('LowerLeg_L', [0, 1.3, 2.6], [[6,0,0],[9,0,0],[6,0,0]]), qTrack('LowerLeg_R', [0, 1.3, 2.6], [[7,0,0],[5,0,0],[7,0,0]]),
    qTrack('Head', [0, 1.3, 2.6], [[0, -4, zombie ? -5 : 0], [1, 5, zombie ? 4 : 0], [0, -4, zombie ? -5 : 0]]),
  ])
  const walk = new THREE.AnimationClip('Walk', 1.05, [
    qTrack('UpperLeg_L', [0,.26,.52,.78,1.05], [[31,0,-2],[3,0,0],[-27,0,2],[1,0,0],[31,0,-2]]), qTrack('UpperLeg_R', [0,.26,.52,.78,1.05], [[-27,0,2],[1,0,0],[31,0,-2],[3,0,0],[-27,0,2]]),
    qTrack('LowerLeg_L', [0,.26,.52,.78,1.05], [[5,0,0],[30,0,0],[7,0,0],[10,0,0],[5,0,0]]), qTrack('LowerLeg_R', [0,.26,.52,.78,1.05], [[7,0,0],[10,0,0],[5,0,0],[30,0,0],[7,0,0]]),
    qTrack('UpperArm_L', [0,.52,1.05], [[-22,0,leftRest],[19,0,leftRest],[-22,0,leftRest]]), qTrack('UpperArm_R', [0,.52,1.05], [[20,0,rightRest],[-21,0,rightRest],[20,0,rightRest]]),
    qTrack('LowerArm_L', [0,.52,1.05], [[0,0,18],[0,0,24],[0,0,18]]), qTrack('LowerArm_R', [0,.52,1.05], [[0,0,-18],[0,0,-24],[0,0,-18]]),
    qTrack('Chest', [0,.26,.52,.78,1.05], [[chestLean,-3,-2],[chestLean+1,0,0],[chestLean,3,2],[chestLean+1,0,0],[chestLean,-3,-2]]),
  ])
  const attack = new THREE.AnimationClip('Attack', 0.82, [
    qTrack('Hips', [0,.18,.42,.82], [[0,0,0],[0,-12,-5],[0,16,6],[0,0,0]]), qTrack('Chest', [0,.18,.42,.82], [[chestLean,0,0],[chestLean-8,-26,-5],[chestLean+7,28,9],[chestLean,0,0]]),
    qTrack('UpperArm_R', [0,.18,.42,.82], [[0,0,rightRest],[-42,-20,-142],[36,12,-24],[0,0,rightRest]]), qTrack('LowerArm_R', [0,.18,.42,.82], [[0,0,-18],[-28,0,-42],[-10,0,-5],[0,0,-18]]),
    qTrack('UpperArm_L', [0,.42,.82], [[0,0,leftRest],[-14,0,leftRest+20],[0,0,leftRest]]), qTrack('LowerArm_L', [0,.42,.82], [[0,0,18],[0,0,28],[0,0,18]]),
  ])
  const death = new THREE.AnimationClip('Death', 1.5, [
    qTrack('Hips', [0,.48,1.5], [[0,0,0],[5,0,-20],[14,3,-88]]), qTrack('Chest', [0,.48,1.5], [[chestLean,0,0],[24,0,8],[44,0,16]]), qTrack('Head', [0,.48,1.5], [[0,0,0],[-18,8,0],[-38,12,14]]),
    qTrack('UpperArm_L', [0,.48,1.5], [[0,0,leftRest],[22,0,leftRest+24],[38,0,leftRest+40]]), qTrack('UpperArm_R', [0,.48,1.5], [[0,0,rightRest],[-18,0,rightRest-24],[-32,0,rightRest-40]]), qTrack('LowerLeg_L', [0,.48,1.5], [[6,0,0],[18,0,0],[34,0,0]]),
  ])
  return [idle, walk, attack, death]
}

function qTrack(name: string, times: number[], rotations: Array<[number, number, number]>) { const values: number[] = []; rotations.forEach(([x, y, z]) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'XYZ')); values.push(q.x, q.y, q.z, q.w) }); return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values) }
function midpoint(a: THREE.Vector3, b: THREE.Vector3) { return a.clone().add(b).multiplyScalar(0.5) }
function safeNodeName(value: string) { return value.trim().replace(/[^a-z0-9_-]+/gi, '_') || 'ForgeCharacter' }
