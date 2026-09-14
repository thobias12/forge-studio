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
    name: 'Crypt Skeleton', species: 'skeleton', height: 1, bulk: 0.9, shoulders: 1, headScale: 1,
    armLength: 1, legLength: 1, asymmetry: 0.12, armor: 'scrap', headwear: 'none', weapon: 'sword',
    primary: '#c6c0aa', secondary: '#313941', accent: '#79464a',
  },
  zombie: {
    name: 'Crypt Zombie', species: 'zombie', height: 1.04, bulk: 1.12, shoulders: 1.06, headScale: 1.04,
    armLength: 1.03, legLength: 0.98, asymmetry: 0.32, armor: 'none', headwear: 'none', weapon: 'axe',
    primary: '#667565', secondary: '#493a35', accent: '#7d4941',
  },
  bandit: {
    name: 'Dungeon Bandit', species: 'bandit', height: 1, bulk: 1.02, shoulders: 1.04, headScale: 0.98,
    armLength: 1, legLength: 1, asymmetry: 0.05, armor: 'scrap', headwear: 'hood', weapon: 'sword',
    primary: '#a77f66', secondary: '#384552', accent: '#8a633e',
  },
}

export function cloneForgeCharacterConfig(species: ForgeCharacterSpecies): ForgeCharacterConfig {
  return { ...FORGE_CHARACTER_PRESETS[species] }
}

export function createProceduralCharacter(config: ForgeCharacterConfig): ForgeCharacterBuild {
  const root = new THREE.Group()
  root.name = safeNodeName(config.name || 'ForgeCharacter')
  root.userData.forgeCharacter = {
    format: 'ForgeCharacter', version: 1, rig: 'ForgeHumanoidV1', species: config.species,
    collisionCapsule: { radius: 0.31 * config.bulk, height: BASE_HEIGHT * config.height },
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
  if (config.species === 'skeleton') addSkeletonBody(root, bones, skeleton, index, mats, dims, config)
  else addFleshyBody(root, bones, skeleton, index, mats, dims, config)
  addGear(root, bones, skeleton, index, mats, dims, config)
  addWeapon(root, bones, skeleton, index, mats, dims, config)

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
  })
  root.updateMatrixWorld(true)

  const clips = createAnimationClips(config)
  let skinnedMeshes = 0
  let triangles = 0
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    skinnedMeshes += 1
    const geometry = mesh.geometry
    triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
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
    for (const material of list) materials.add(material)
  })
  materials.forEach((material) => material.dispose())
  root.removeFromParent()
}

type Dims = {
  height: number; hipsY: number; torso: number; shoulderX: number; upperArm: number; lowerArm: number;
  upperLeg: number; lowerLeg: number; headR: number; limbR: number; torsoW: number; torsoD: number
}

type Materials = {
  body: THREE.MeshStandardMaterial; bodyDark: THREE.MeshStandardMaterial; cloth: THREE.MeshStandardMaterial;
  clothDark: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial; bone: THREE.MeshStandardMaterial
}

function dimensions(config: ForgeCharacterConfig): Dims {
  const height = BASE_HEIGHT * config.height
  const legFactor = config.legLength
  const armFactor = config.armLength
  const upperLeg = 0.42 * height / BASE_HEIGHT * legFactor
  const lowerLeg = 0.43 * height / BASE_HEIGHT * legFactor
  const torso = 0.56 * height / BASE_HEIGHT
  return {
    height,
    hipsY: 0.89 * height / BASE_HEIGHT * legFactor,
    torso,
    shoulderX: 0.31 * config.shoulders * config.bulk,
    upperArm: 0.36 * height / BASE_HEIGHT * armFactor,
    lowerArm: 0.34 * height / BASE_HEIGHT * armFactor,
    upperLeg,
    lowerLeg,
    headR: 0.14 * height / BASE_HEIGHT * config.headScale,
    limbR: 0.075 * config.bulk,
    torsoW: 0.46 * config.bulk * config.shoulders,
    torsoD: 0.25 * config.bulk,
  }
}

function createRig(d: Dims): Record<string, THREE.Bone> {
  const bone = (name: string, x = 0, y = 0, z = 0) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); return b }
  const Root = bone('Root')
  const Hips = bone('Hips', 0, d.hipsY, 0)
  const Spine = bone('Spine', 0, d.torso * 0.34, 0)
  const Chest = bone('Chest', 0, d.torso * 0.42, 0)
  const Neck = bone('Neck', 0, d.torso * 0.32, 0)
  const Head = bone('Head', 0, d.headR * 0.9, 0)
  Root.add(Hips); Hips.add(Spine); Spine.add(Chest); Chest.add(Neck); Neck.add(Head)

  const UpperArm_L = bone('UpperArm_L', -d.shoulderX, d.torso * 0.12, 0)
  const LowerArm_L = bone('LowerArm_L', -d.upperArm, -0.015, 0)
  const Hand_L = bone('Hand_L', -d.lowerArm, 0, 0)
  const UpperArm_R = bone('UpperArm_R', d.shoulderX, d.torso * 0.12, 0)
  const LowerArm_R = bone('LowerArm_R', d.upperArm, -0.015, 0)
  const Hand_R = bone('Hand_R', d.lowerArm, 0, 0)
  Chest.add(UpperArm_L, UpperArm_R); UpperArm_L.add(LowerArm_L); LowerArm_L.add(Hand_L); UpperArm_R.add(LowerArm_R); LowerArm_R.add(Hand_R)

  const UpperLeg_L = bone('UpperLeg_L', -0.14 * d.torsoW / 0.46, -0.06, 0)
  const LowerLeg_L = bone('LowerLeg_L', 0, -d.upperLeg, 0)
  const Foot_L = bone('Foot_L', 0, -d.lowerLeg, 0.055)
  const UpperLeg_R = bone('UpperLeg_R', 0.14 * d.torsoW / 0.46, -0.06, 0)
  const LowerLeg_R = bone('LowerLeg_R', 0, -d.upperLeg, 0)
  const Foot_R = bone('Foot_R', 0, -d.lowerLeg, 0.055)
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
  const boneColor = config.species === 'skeleton' ? bodyColor : new THREE.Color('#c7c0aa')
  return {
    body: new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.82, metalness: 0.01, flatShading: true }),
    bodyDark: new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.68), roughness: 0.9, flatShading: true }),
    cloth: new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.94, flatShading: true }),
    clothDark: new THREE.MeshStandardMaterial({ color: secondary.clone().multiplyScalar(0.62), roughness: 0.97, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x59616a, roughness: 0.5, metalness: 0.55, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.78, metalness: 0.05, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: config.species === 'zombie' ? 0xb8d58a : 0xd9b66f, emissive: config.species === 'zombie' ? 0x516b37 : 0x5f4420, emissiveIntensity: 0.8, roughness: 0.45 }),
    bone: new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.88, flatShading: true }),
  }
}

function addSkeletonBody(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  addCylinder(root, p.Hips.clone().add(new THREE.Vector3(0, -0.06, 0)), p.Spine, 0.06, m.bone, 'Hips', skeleton, index)
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(0.34 * config.bulk, 0.15, 0.18), m.bone, 'Hips', skeleton, index, new THREE.Euler(0, 0, 0))
  for (let i = 0; i < 5; i += 1) {
    const y = p.Spine.y + 0.08 + i * 0.075
    const radius = (0.24 - Math.abs(i - 2) * 0.015) * config.bulk
    addTorus(root, new THREE.Vector3(0, y, 0), radius, 0.023, m.bone, 'Chest', skeleton, index, new THREE.Euler(Math.PI / 2, 0, 0))
  }
  addCylinder(root, p.Spine, p.Neck, 0.038, m.bone, 'Spine', skeleton, index)
  addSkull(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.55, 0)), d.headR * 1.1, m, 'Head', skeleton, index)

  addLimbSet(root, bones, skeleton, index, m.bone, d, true)
  addJoint(root, p.UpperArm_L, d.limbR * 0.9, m.bone, 'UpperArm_L', skeleton, index)
  addJoint(root, p.UpperArm_R, d.limbR * 0.9, m.bone, 'UpperArm_R', skeleton, index)
  addJoint(root, p.LowerArm_L, d.limbR * 0.75, m.bone, 'LowerArm_L', skeleton, index)
  addJoint(root, p.LowerArm_R, d.limbR * 0.75, m.bone, 'LowerArm_R', skeleton, index)
  addJoint(root, p.UpperLeg_L, d.limbR * 1.05, m.bone, 'UpperLeg_L', skeleton, index)
  addJoint(root, p.UpperLeg_R, d.limbR * 1.05, m.bone, 'UpperLeg_R', skeleton, index)
}

function addFleshyBody(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  const asym = config.asymmetry
  addBox(root, midpoint(p.Hips, p.Chest).add(new THREE.Vector3(0, 0.04, 0)), new THREE.Vector3(d.torsoW, d.torso * 0.72, d.torsoD), m.body, 'Spine', skeleton, index, new THREE.Euler(0, 0, config.species === 'zombie' ? -0.04 - asym * 0.08 : 0))
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(d.torsoW * 0.82, 0.2, d.torsoD * 0.9), m.bodyDark, 'Hips', skeleton, index)
  addHead(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.55, 0)), d.headR, m, config, 'Head', skeleton, index)
  addLimbSet(root, bones, skeleton, index, m.body, d, false, config)

  addBox(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(d.torsoW * 1.06, d.torso * 0.55, d.torsoD * 1.08), m.cloth, 'Spine', skeleton, index, new THREE.Euler(0, 0, config.species === 'zombie' ? asym * 0.08 : 0))
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, -0.11, 0)), new THREE.Vector3(d.torsoW * 0.78, 0.18, d.torsoD * 1.02), m.clothDark, 'Hips', skeleton, index)

  if (config.species === 'zombie') {
    addBox(root, p.Chest.clone().add(new THREE.Vector3(d.torsoW * 0.3, -0.03, -d.torsoD * 0.54)), new THREE.Vector3(d.torsoW * 0.2, 0.2, 0.025), m.accent, 'Chest', skeleton, index, new THREE.Euler(0, 0, 0.24))
    addCylinder(root, p.UpperArm_L, midpoint(p.UpperArm_L, p.LowerArm_L), d.limbR * 1.22, m.cloth, 'UpperArm_L', skeleton, index)
  }
}

function addLimbSet(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, material: THREE.Material, d: Dims, skeletal: boolean, config?: ForgeCharacterConfig) {
  const p = positions(bones)
  const armR = d.limbR * (skeletal ? 0.5 : 1)
  const legR = d.limbR * (skeletal ? 0.58 : 1.12)
  const asym = config?.asymmetry ?? 0
  addCylinder(root, p.UpperArm_L, p.LowerArm_L, armR * (1 + asym * 0.08), material, 'UpperArm_L', skeleton, index)
  addCylinder(root, p.LowerArm_L, p.Hand_L, armR * 0.88, material, 'LowerArm_L', skeleton, index)
  addCylinder(root, p.UpperArm_R, p.LowerArm_R, armR * (1 - asym * 0.06), material, 'UpperArm_R', skeleton, index)
  addCylinder(root, p.LowerArm_R, p.Hand_R, armR * 0.88, material, 'LowerArm_R', skeleton, index)
  addCylinder(root, p.UpperLeg_L, p.LowerLeg_L, legR, material, 'UpperLeg_L', skeleton, index)
  addCylinder(root, p.LowerLeg_L, p.Foot_L, legR * 0.82, material, 'LowerLeg_L', skeleton, index)
  addCylinder(root, p.UpperLeg_R, p.LowerLeg_R, legR * (1 - asym * 0.06), material, 'UpperLeg_R', skeleton, index)
  addCylinder(root, p.LowerLeg_R, p.Foot_R, legR * 0.82, material, 'LowerLeg_R', skeleton, index)
  addBox(root, p.Hand_L.clone().add(new THREE.Vector3(-0.045, 0, 0)), new THREE.Vector3(0.12, 0.1, 0.09), material, 'Hand_L', skeleton, index)
  addBox(root, p.Hand_R.clone().add(new THREE.Vector3(0.045, 0, 0)), new THREE.Vector3(0.12, 0.1, 0.09), material, 'Hand_R', skeleton, index)
  addBox(root, p.Foot_L.clone().add(new THREE.Vector3(0, -0.03, 0.1)), new THREE.Vector3(0.15, 0.1, 0.28), material, 'Foot_L', skeleton, index)
  addBox(root, p.Foot_R.clone().add(new THREE.Vector3(0, -0.03, 0.1)), new THREE.Vector3(0.15, 0.1, 0.28), material, 'Foot_R', skeleton, index)
}

function addGear(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  const p = positions(bones)
  if (config.armor !== 'none') {
    const heavy = config.armor === 'heavy'
    addBox(root, midpoint(p.Spine, p.Chest).add(new THREE.Vector3(0, 0.06, -d.torsoD * 0.54)), new THREE.Vector3(d.torsoW * (heavy ? 0.96 : 0.78), d.torso * (heavy ? 0.46 : 0.31), 0.055), heavy ? m.metal : m.accent, 'Chest', skeleton, index, new THREE.Euler(0.03, 0, 0))
    for (const side of [-1, 1]) {
      const name = side < 0 ? 'UpperArm_L' : 'UpperArm_R'
      const shoulder = side < 0 ? p.UpperArm_L : p.UpperArm_R
      addBox(root, shoulder.clone().add(new THREE.Vector3(side * 0.015, 0.03, 0)), new THREE.Vector3(0.18, heavy ? 0.13 : 0.09, heavy ? 0.25 : 0.18), heavy ? m.metal : m.accent, name, skeleton, index, new THREE.Euler(0, 0, side * 0.08))
    }
  }

  if (config.headwear === 'hood') {
    addSphere(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.58, 0.015)), d.headR * 1.28, m.clothDark, 'Head', skeleton, index, new THREE.Vector3(1, 1.08, 1))
    addSphere(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.54, -d.headR * 0.52)), d.headR * 0.72, m.cloth, 'Head', skeleton, index, new THREE.Vector3(1.1, 1.15, 0.65))
  } else if (config.headwear === 'helmet') {
    addSphere(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.72, 0)), d.headR * 1.17, m.metal, 'Head', skeleton, index, new THREE.Vector3(1, 0.72, 1))
    addBox(root, p.Head.clone().add(new THREE.Vector3(0, d.headR * 0.4, -d.headR * 0.88)), new THREE.Vector3(d.headR * 1.65, d.headR * 0.42, 0.035), m.metal, 'Head', skeleton, index)
  }

  if (config.species === 'bandit') addBox(root, p.Hips.clone().add(new THREE.Vector3(0, 0.04, -d.torsoD * 0.55)), new THREE.Vector3(d.torsoW * 0.95, 0.07, 0.04), m.accent, 'Hips', skeleton, index)
}

function addWeapon(root: THREE.Group, bones: Record<string, THREE.Bone>, skeleton: THREE.Skeleton, index: Map<string, number>, m: Materials, d: Dims, config: ForgeCharacterConfig) {
  if (config.weapon === 'none') return
  const p = positions(bones)
  const hand = p.Hand_R.clone().add(new THREE.Vector3(0.08, -0.02, 0))
  const bone = 'Hand_R'
  if (config.weapon === 'sword') {
    addBox(root, hand.clone().add(new THREE.Vector3(0.22, -0.18, 0)), new THREE.Vector3(0.055, 0.52, 0.045), m.metal, bone, skeleton, index, new THREE.Euler(0, 0, -0.38))
    addBox(root, hand.clone().add(new THREE.Vector3(0.02, -0.02, 0)), new THREE.Vector3(0.28, 0.045, 0.07), m.accent, bone, skeleton, index, new THREE.Euler(0, 0, -0.38))
  } else if (config.weapon === 'axe') {
    addCylinder(root, hand.clone().add(new THREE.Vector3(0.1, -0.12, 0)), hand.clone().add(new THREE.Vector3(0.38, -0.62, 0)), 0.025, m.clothDark, bone, skeleton, index)
    addBox(root, hand.clone().add(new THREE.Vector3(0.41, -0.61, 0)), new THREE.Vector3(0.28, 0.18, 0.05), m.metal, bone, skeleton, index, new THREE.Euler(0, 0, -0.12))
  } else {
    addCylinder(root, hand.clone().add(new THREE.Vector3(0.1, -0.1, 0)), hand.clone().add(new THREE.Vector3(0.34, -0.55, 0)), 0.027, m.clothDark, bone, skeleton, index)
    addSphere(root, hand.clone().add(new THREE.Vector3(0.38, -0.61, 0)), 0.12, m.metal, bone, skeleton, index, new THREE.Vector3(0.9, 1.15, 0.9))
  }
}

function addHead(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, config: ForgeCharacterConfig, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addSphere(root, center, r, m.body, bone, skeleton, index, new THREE.Vector3(0.9, 1.1, 0.92))
  const eyeY = center.y + r * 0.14
  const eyeZ = center.z - r * 0.82
  for (const side of [-1, 1]) addSphere(root, new THREE.Vector3(center.x + side * r * 0.36, eyeY, eyeZ), r * 0.105, m.eye, bone, skeleton, index)
  if (config.species === 'zombie') addBox(root, center.clone().add(new THREE.Vector3(r * 0.35, -r * 0.24, -r * 0.75)), new THREE.Vector3(r * 0.45, r * 0.1, r * 0.08), m.accent, bone, skeleton, index, new THREE.Euler(0, 0, -0.18))
}

function addSkull(root: THREE.Group, center: THREE.Vector3, r: number, m: Materials, bone: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  addSphere(root, center, r, m.bone, bone, skeleton, index, new THREE.Vector3(0.88, 1.02, 0.9))
  const socketY = center.y + r * 0.08
  for (const side of [-1, 1]) addSphere(root, new THREE.Vector3(center.x + side * r * 0.34, socketY, center.z - r * 0.78), r * 0.17, m.clothDark, bone, skeleton, index, new THREE.Vector3(1, 0.8, 0.35))
  addBox(root, center.clone().add(new THREE.Vector3(0, -r * 0.72, -r * 0.12)), new THREE.Vector3(r * 1.15, r * 0.33, r * 0.72), m.bone, bone, skeleton, index, new THREE.Euler(0.04, 0, 0))
}

function addCylinder(root: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  const direction = end.clone().sub(start)
  const length = Math.max(0.02, direction.length())
  const geometry = new THREE.CylinderGeometry(radius * 0.88, radius, length, 7, 1, false)
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

function addTorus(root: THREE.Group, center: THREE.Vector3, radius: number, tube: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler()) {
  const geometry = new THREE.TorusGeometry(radius, tube, 5, 14)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 0.72, 1))
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

function positions(bones: Record<string, THREE.Bone>) {
  const result: Record<string, THREE.Vector3> = {}
  bones.Root.updateMatrixWorld(true)
  for (const [name, bone] of Object.entries(bones)) result[name] = bone.getWorldPosition(new THREE.Vector3())
  return result
}

function createAnimationClips(config: ForgeCharacterConfig) {
  const zombie = config.species === 'zombie'
  const leftRest = zombie ? 62 : 70
  const rightRest = zombie ? -74 : -70
  const idle = new THREE.AnimationClip('Idle', 2.4, [
    qTrack('Chest', [0, 1.2, 2.4], [[0, 0, -2], [2, 0, 2], [0, 0, -2]]),
    qTrack('UpperArm_L', [0, 1.2, 2.4], [[-3, 0, leftRest], [3, 0, leftRest + 3], [-3, 0, leftRest]]),
    qTrack('LowerArm_L', [0, 1.2, 2.4], [[0, 0, 10], [0, 0, 14], [0, 0, 10]]),
    qTrack('UpperArm_R', [0, 1.2, 2.4], [[3, 0, rightRest], [-3, 0, rightRest - 3], [3, 0, rightRest]]),
    qTrack('LowerArm_R', [0, 1.2, 2.4], [[0, 0, -10], [0, 0, -14], [0, 0, -10]]),
    qTrack('Head', [0, 1.2, 2.4], [[0, -3, 0], [0, 4, 0], [0, -3, 0]]),
  ])
  const walk = new THREE.AnimationClip('Walk', 1, [
    qTrack('UpperLeg_L', [0, .25, .5, .75, 1], [[28,0,0],[0,0,0],[-28,0,0],[0,0,0],[28,0,0]]),
    qTrack('UpperLeg_R', [0, .25, .5, .75, 1], [[-28,0,0],[0,0,0],[28,0,0],[0,0,0],[-28,0,0]]),
    qTrack('LowerLeg_L', [0, .25, .5, .75, 1], [[4,0,0],[28,0,0],[4,0,0],[8,0,0],[4,0,0]]),
    qTrack('LowerLeg_R', [0, .25, .5, .75, 1], [[4,0,0],[8,0,0],[4,0,0],[28,0,0],[4,0,0]]),
    qTrack('UpperArm_L', [0,.5,1], [[-22,0,leftRest],[22,0,leftRest],[-22,0,leftRest]]),
    qTrack('UpperArm_R', [0,.5,1], [[22,0,rightRest],[-22,0,rightRest],[22,0,rightRest]]),
    qTrack('LowerArm_L', [0,.5,1], [[0,0,12],[0,0,18],[0,0,12]]),
    qTrack('LowerArm_R', [0,.5,1], [[0,0,-12],[0,0,-18],[0,0,-12]]),
    qTrack('Chest', [0,.25,.5,.75,1], [[0,-3,0],[0,0,0],[0,3,0],[0,0,0],[0,-3,0]]),
  ])
  const attack = new THREE.AnimationClip('Attack', 0.85, [
    qTrack('Chest', [0,.18,.46,.85], [[0,0,0],[-7,-20,-4],[5,22,8],[0,0,0]]),
    qTrack('UpperArm_R', [0,.18,.46,.85], [[0,0,rightRest],[-38,-20,-138],[38,8,-28],[0,0,rightRest]]),
    qTrack('LowerArm_R', [0,.18,.46,.85], [[0,0,-10],[-24,0,-35],[-12,0,-4],[0,0,-10]]),
    qTrack('UpperArm_L', [0,.46,.85], [[0,0,leftRest],[-10,0,leftRest+18],[0,0,leftRest]]),
  ])
  const death = new THREE.AnimationClip('Death', 1.45, [
    qTrack('Hips', [0,.45,1.45], [[0,0,0],[4,0,-18],[12,2,-82]]),
    qTrack('Chest', [0,.45,1.45], [[0,0,0],[20,0,5],[38,0,14]]),
    qTrack('Head', [0,.45,1.45], [[0,0,0],[-14,8,0],[-34,10,12]]),
    qTrack('UpperArm_L', [0,.45,1.45], [[0,0,leftRest],[20,0,leftRest+22],[34,0,leftRest+36]]),
    qTrack('UpperArm_R', [0,.45,1.45], [[0,0,rightRest],[-16,0,rightRest-22],[-28,0,rightRest-36]]),
  ])
  return [idle, walk, attack, death]
}

function qTrack(name: string, times: number[], rotations: Array<[number, number, number]>) {
  const values: number[] = []
  rotations.forEach(([x, y, z]) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z), 'XYZ'))
    values.push(q.x, q.y, q.z, q.w)
  })
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values)
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3) { return a.clone().add(b).multiplyScalar(0.5) }
function safeNodeName(value: string) { return value.trim().replace(/[^a-z0-9_-]+/gi, '_') || 'ForgeCharacter' }
