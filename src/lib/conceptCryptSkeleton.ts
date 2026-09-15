import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { createProceduralCharacter, disposeForgeCharacter, type ForgeCharacterBuild, type ForgeCharacterConfig } from './proceduralCharacter'

type BoneMap = Record<string, THREE.Bone>
type MaterialSet = {
  bone: THREE.MeshStandardMaterial
  boneDark: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  clothDark: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
  leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  socket: THREE.MeshStandardMaterial
}

export function createConceptCharacter(config: ForgeCharacterConfig): ForgeCharacterBuild {
  if (config.species !== 'skeleton') return createProceduralCharacter(config)

  const base = createProceduralCharacter({ ...config, armor: 'none', headwear: 'none', weapon: 'none' })
  clearVisibleMeshes(base.root)

  const mats = makeMaterials(config)
  const index = new Map(base.skeleton.bones.map((bone, i) => [bone.name, i]))
  const p = worldPositions(base.bones)
  buildCryptSkeleton(base.root, base.bones, base.skeleton, index, p, mats, config)

  base.root.userData.forgeCharacter = {
    ...base.root.userData.forgeCharacter,
    format: 'ForgeCharacter',
    version: 5,
    archetypeVersion: 5,
    source: 'ConceptForge',
    conceptTarget: 'CryptSkeletonApprovedV2',
    assembly: 'curated-modular',
  }

  let skinnedMeshes = 0
  let triangles = 0
  base.root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes += 1
    if (mesh.isMesh && mesh.geometry?.attributes.position) {
      triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  base.stats = { bones: base.skeleton.bones.length, skinnedMeshes, triangles: Math.round(triangles) }
  base.root.updateMatrixWorld(true)
  return base
}

export async function exportConceptCharacterGlb(config: ForgeCharacterConfig): Promise<Blob> {
  const build = createConceptCharacter(config)
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

function clearVisibleMeshes(root: THREE.Object3D) {
  const remove: THREE.Object3D[] = []
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    remove.push(mesh)
    mesh.geometry?.dispose()
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    list.forEach((material) => materials.add(material))
  })
  remove.forEach((object) => object.removeFromParent())
  materials.forEach((material) => material.dispose())
}

function makeMaterials(config: ForgeCharacterConfig): MaterialSet {
  const bone = new THREE.Color(config.primary)
  const cloth = new THREE.Color(config.secondary)
  const accent = new THREE.Color(config.accent)
  const metal = new THREE.Color('#55514d')
  return {
    bone: standard(bone, 0.9),
    boneDark: standard(bone.clone().multiplyScalar(0.5), 1),
    cloth: standard(cloth, 0.97),
    clothDark: standard(cloth.clone().multiplyScalar(0.44), 1),
    leather: standard(accent.clone().multiplyScalar(0.72), 0.9),
    leatherDark: standard(accent.clone().multiplyScalar(0.34), 0.98),
    metal: standard(metal.clone().multiplyScalar(1.08), 0.5, 0.58),
    metalDark: standard(metal.clone().multiplyScalar(0.36), 0.72, 0.48),
    socket: standard(new THREE.Color('#07090b'), 1),
  }
}

function standard(color: THREE.Color, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
}

function buildCryptSkeleton(
  root: THREE.Group,
  bones: BoneMap,
  skeleton: THREE.Skeleton,
  index: Map<string, number>,
  p: Record<string, THREE.Vector3>,
  m: MaterialSet,
  config: ForgeCharacterConfig,
) {
  const scale = config.height
  const shoulderWidth = p.UpperArm_R.distanceTo(p.UpperArm_L)
  const headR = 0.14 * scale * config.headScale
  const boneR = 0.046 * config.bulk

  addSpine(root, p, skeleton, index, m, scale)
  addConceptPelvis(root, p.Hips, shoulderWidth, skeleton, index, m, scale)
  addConceptRibcage(root, p, shoulderWidth, skeleton, index, m, scale)
  addConceptSkull(root, p.Head.clone().add(new THREE.Vector3(0, headR * 0.46, -0.016)), headR, skeleton, index, m)
  addBoneBetween(root, p.Neck.clone().add(new THREE.Vector3(0, -0.025, 0)), p.Head.clone().add(new THREE.Vector3(0, headR * 0.18, 0)), 0.04, 0.033, m.bone, 'Neck', skeleton, index, 8)

  addArm(root, p, -1, boneR, skeleton, index, m)
  addArm(root, p, 1, boneR, skeleton, index, m)
  addLeg(root, p, -1, boneR * 1.1, skeleton, index, m, scale)
  addLeg(root, p, 1, boneR * 1.1, skeleton, index, m, scale)

  addCowl(root, p, shoulderWidth, skeleton, index, m, scale)
  addWaistKit(root, p, shoulderWidth, skeleton, index, m, scale)
  addArmor(root, p, shoulderWidth, skeleton, index, m, scale)
  addHarness(root, p, shoulderWidth, skeleton, index, m, scale)
  addConceptSword(root, p.Hand_R, skeleton, index, m, scale)
}

function addSpine(root: THREE.Group, p: Record<string, THREE.Vector3>, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  addBoneBetween(root, p.Hips.clone().add(new THREE.Vector3(0, 0.02, 0.03)), p.Spine, 0.06 * scale, 0.046 * scale, m.boneDark, 'Hips', skeleton, index, 8)
  addBoneBetween(root, p.Spine, p.Chest, 0.048 * scale, 0.038 * scale, m.boneDark, 'Spine', skeleton, index, 8)
  addBoneBetween(root, p.Chest.clone().add(new THREE.Vector3(0, -0.04, -0.025)), p.Neck, 0.04 * scale, 0.03 * scale, m.boneDark, 'Chest', skeleton, index, 8)
  for (let i = 0; i < 5; i += 1) {
    const y = THREE.MathUtils.lerp(p.Spine.y + 0.03 * scale, p.Neck.y - 0.04 * scale, i / 4)
    addIco(root, new THREE.Vector3(0, y, 0.015), 0.045 * scale, m.boneDark, 'Spine', skeleton, index, new THREE.Vector3(0.8, 0.65, 0.72), 1)
  }
}

function addConceptPelvis(root: THREE.Group, hips: THREE.Vector3, width: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  addFrustum(root, hips.clone().add(new THREE.Vector3(0, 0.005, 0.018)), width * 0.42, 0.16 * scale, width * 0.28, 0.12 * scale, 0.13 * scale, m.boneDark, 'Hips', skeleton, index)
  for (const side of [-1, 1]) {
    addFrustum(root, hips.clone().add(new THREE.Vector3(side * width * 0.2, 0.045 * scale, -0.005)), width * 0.25, 0.15 * scale, width * 0.13, 0.1 * scale, 0.19 * scale, m.bone, 'Hips', skeleton, index, new THREE.Euler(0.04, side * 0.08, side * -0.34))
    addIco(root, hips.clone().add(new THREE.Vector3(side * width * 0.23, -0.035 * scale, 0.01)), 0.065 * scale, m.boneDark, 'Hips', skeleton, index, new THREE.Vector3(1.1, 0.85, 0.9), 1)
  }
}

function addConceptRibcage(root: THREE.Group, p: Record<string, THREE.Vector3>, width: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  const bottom = p.Spine.y + 0.07 * scale
  const top = p.Chest.y + 0.09 * scale
  addBoneBetween(root, new THREE.Vector3(0, bottom - 0.02, -0.055), new THREE.Vector3(0, top + 0.04, -0.06), 0.032 * scale, 0.025 * scale, m.boneDark, 'Chest', skeleton, index, 7)
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5
    const y = THREE.MathUtils.lerp(bottom, top, t)
    const ribW = width * (0.3 + Math.sin(t * Math.PI) * 0.13)
    const depth = (0.13 + Math.sin(t * Math.PI) * 0.025) * scale
    for (const side of [-1, 1]) {
      const sternum = new THREE.Vector3(side * 0.012, y, -0.06)
      const frontSide = new THREE.Vector3(side * ribW * 0.58, y + 0.005, -depth)
      const lateral = new THREE.Vector3(side * ribW, y + 0.012, -0.005)
      const back = new THREE.Vector3(side * ribW * 0.58, y + 0.002, depth * 0.5)
      addBoneBetween(root, sternum, frontSide, 0.018 * scale, 0.015 * scale, m.bone, 'Chest', skeleton, index, 7)
      addBoneBetween(root, frontSide, lateral, 0.016 * scale, 0.014 * scale, m.bone, 'Chest', skeleton, index, 7)
      addBoneBetween(root, lateral, back, 0.015 * scale, 0.012 * scale, m.boneDark, 'Chest', skeleton, index, 7)
    }
  }
  addBoneBetween(root, p.Chest.clone().add(new THREE.Vector3(-0.025, 0.025, 0)), p.UpperArm_L.clone().add(new THREE.Vector3(0.045, 0, 0)), 0.048 * scale, 0.032 * scale, m.bone, 'Chest', skeleton, index, 8)
  addBoneBetween(root, p.Chest.clone().add(new THREE.Vector3(0.025, 0.025, 0)), p.UpperArm_R.clone().add(new THREE.Vector3(-0.045, 0, 0)), 0.048 * scale, 0.032 * scale, m.bone, 'Chest', skeleton, index, 8)
}

function addConceptSkull(root: THREE.Group, center: THREE.Vector3, r: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet) {
  addIco(root, center.clone().add(new THREE.Vector3(0, r * 0.17, 0.035)), r * 1.02, m.bone, 'Head', skeleton, index, new THREE.Vector3(0.9, 1.02, 0.88), 2)
  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.38, -r * 0.2)), r * 1.0, r * 0.7, r * 0.66, r * 0.48, r * 0.48, m.bone, 'Head', skeleton, index, new THREE.Euler(0.05, 0, 0))

  for (const side of [-1, 1]) {
    addIco(root, center.clone().add(new THREE.Vector3(side * r * 0.34, r * 0.08, -r * 0.77)), r * 0.215, m.socket, 'Head', skeleton, index, new THREE.Vector3(1.05, 0.74, 0.4), 1)
    addFrustum(root, center.clone().add(new THREE.Vector3(side * r * 0.38, r * 0.28, -r * 0.68)), r * 0.46, r * 0.16, r * 0.26, r * 0.12, r * 0.17, m.boneDark, 'Head', skeleton, index, new THREE.Euler(-0.05, side * 0.08, side * 0.2))
    addFrustum(root, center.clone().add(new THREE.Vector3(side * r * 0.5, -r * 0.16, -r * 0.51)), r * 0.32, r * 0.2, r * 0.17, r * 0.14, r * 0.37, m.boneDark, 'Head', skeleton, index, new THREE.Euler(0, side * -0.2, side * 0.15))
    addBoneBetween(root, center.clone().add(new THREE.Vector3(side * r * 0.44, -r * 0.24, -r * 0.55)), center.clone().add(new THREE.Vector3(side * r * 0.32, -r * 0.55, -r * 0.42)), r * 0.09, r * 0.065, m.bone, 'Head', skeleton, index, 5)
  }

  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.03, -r * 0.9)), r * 0.21, r * 0.16, r * 0.09, r * 0.1, r * 0.31, m.boneDark, 'Head', skeleton, index)
  addFrustum(root, center.clone().add(new THREE.Vector3(0, -r * 0.65, -r * 0.24)), r * 0.76, r * 0.54, r * 0.54, r * 0.38, r * 0.27, m.boneDark, 'Head', skeleton, index, new THREE.Euler(-0.08, 0, 0))
  addBox(root, center.clone().add(new THREE.Vector3(0, -r * 0.49, -r * 0.7)), new THREE.Vector3(r * 0.72, r * 0.06, r * 0.07), m.boneDark, 'Head', skeleton, index, new THREE.Euler(0.04, 0, 0))
  for (let i = -3; i <= 3; i += 1) {
    addBox(root, center.clone().add(new THREE.Vector3(i * r * 0.13, -r * 0.55, -r * 0.73)), new THREE.Vector3(r * 0.072, r * 0.16, r * 0.07), m.bone, 'Head', skeleton, index, new THREE.Euler(0.03, 0, i * 0.018))
  }
}

function addArm(root: THREE.Group, p: Record<string, THREE.Vector3>, side: number, r: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet) {
  const upper = side < 0 ? p.UpperArm_L : p.UpperArm_R
  const elbow = side < 0 ? p.LowerArm_L : p.LowerArm_R
  const hand = side < 0 ? p.Hand_L : p.Hand_R
  const upperBone = side < 0 ? 'UpperArm_L' : 'UpperArm_R'
  const lowerBone = side < 0 ? 'LowerArm_L' : 'LowerArm_R'
  const handBone = side < 0 ? 'Hand_L' : 'Hand_R'
  addBoneBetween(root, upper, elbow, r * 1.05, r * 0.75, m.bone, upperBone, skeleton, index, 8)
  addIco(root, elbow, r * 0.92, m.boneDark, lowerBone, skeleton, index, new THREE.Vector3(1.0, 0.8, 0.85), 1)
  addBoneBetween(root, elbow, hand, r * 0.78, r * 0.55, m.bone, lowerBone, skeleton, index, 8)
  addHandBones(root, hand, side, r, handBone, skeleton, index, m)
}

function addLeg(root: THREE.Group, p: Record<string, THREE.Vector3>, side: number, r: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  const upper = side < 0 ? p.UpperLeg_L : p.UpperLeg_R
  const knee = side < 0 ? p.LowerLeg_L : p.LowerLeg_R
  const foot = side < 0 ? p.Foot_L : p.Foot_R
  const upperBone = side < 0 ? 'UpperLeg_L' : 'UpperLeg_R'
  const lowerBone = side < 0 ? 'LowerLeg_L' : 'LowerLeg_R'
  const footBone = side < 0 ? 'Foot_L' : 'Foot_R'
  addBoneBetween(root, upper, knee, r * 1.15, r * 0.82, m.bone, upperBone, skeleton, index, 8)
  addIco(root, knee, r * 1.02, m.boneDark, lowerBone, skeleton, index, new THREE.Vector3(1.05, 0.82, 0.9), 1)
  addBoneBetween(root, knee, foot, r * 0.9, r * 0.62, m.bone, lowerBone, skeleton, index, 8)
  addFootBones(root, foot, side, r, footBone, skeleton, index, m, scale)
}

function addHandBones(root: THREE.Group, hand: THREE.Vector3, side: number, r: number, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet) {
  addIco(root, hand.clone().add(new THREE.Vector3(side * 0.02, -0.005, 0)), r * 0.75, m.bone, boneName, skeleton, index, new THREE.Vector3(0.85, 0.65, 0.65), 1)
  for (let i = -1; i <= 2; i += 1) {
    const start = hand.clone().add(new THREE.Vector3(side * 0.02, -0.02 + i * r * 0.42, -0.005))
    const end = start.clone().add(new THREE.Vector3(side * r * 1.75, -r * 0.22, -0.01))
    addBoneBetween(root, start, end, r * 0.18, r * 0.12, m.bone, boneName, skeleton, index, 6)
  }
}

function addFootBones(root: THREE.Group, foot: THREE.Vector3, side: number, r: number, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  addFrustum(root, foot.clone().add(new THREE.Vector3(0, -0.025, -0.055)), r * 2.1, 0.24 * scale, r * 1.7, 0.17 * scale, 0.095 * scale, m.boneDark, boneName, skeleton, index, new THREE.Euler(-0.08, 0, 0))
  for (let i = -1; i <= 1; i += 1) {
    addBox(root, foot.clone().add(new THREE.Vector3(i * r * 0.55, -0.055, -0.17 * scale)), new THREE.Vector3(r * 0.34, r * 0.28, 0.12 * scale), m.bone, boneName, skeleton, index)
  }
}

function addCowl(root: THREE.Group, p: Record<string, THREE.Vector3>, width: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  addTorus(root, p.Neck.clone().add(new THREE.Vector3(0, 0.02 * scale, 0)), width * 0.29, 0.045 * scale, m.clothDark, 'Chest', skeleton, index, new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(1.0, 0.7, 0.82))
  addClothStrip(root, p.Chest.clone().add(new THREE.Vector3(-width * 0.2, 0.035 * scale, -0.08)), 0.16 * scale, 0.45 * scale, m.cloth, 'Chest', skeleton, index, -0.17)
  addClothStrip(root, p.Chest.clone().add(new THREE.Vector3(width * 0.21, 0.005 * scale, -0.065)), 0.13 * scale, 0.35 * scale, m.clothDark, 'Chest', skeleton, index, 0.13)
  addClothStrip(root, p.Chest.clone().add(new THREE.Vector3(-width * 0.05, 0.015 * scale, 0.09)), 0.18 * scale, 0.32 * scale, m.clothDark, 'Chest', skeleton, index, 0.04)
}

function addWaistKit(root: THREE.Group, p: Record<string, THREE.Vector3>, width: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, 0.02, -0.11 * scale)), new THREE.Vector3(width * 0.64, 0.075 * scale, 0.075 * scale), m.leatherDark, 'Hips', skeleton, index)
  addBox(root, p.Hips.clone().add(new THREE.Vector3(0, 0.01, -0.155 * scale)), new THREE.Vector3(width * 0.18, 0.095 * scale, 0.03 * scale), m.metalDark, 'Hips', skeleton, index)
  for (let i = -2; i <= 2; i += 1) {
    const x = i * width * 0.095
    const h = (0.34 + (Math.abs(i) % 2) * 0.09 + (i === 0 ? 0.08 : 0)) * scale
    addClothStrip(root, p.Hips.clone().add(new THREE.Vector3(x, -h * 0.49, -0.068)), width * (i === 0 ? 0.16 : 0.125), h, i % 2 ? m.clothDark : m.cloth, 'Hips', skeleton, index, i * 0.034)
  }
  addClothStrip(root, p.Hips.clone().add(new THREE.Vector3(-width * 0.16, -0.18 * scale, 0.075)), width * 0.19, 0.42 * scale, m.clothDark, 'Hips', skeleton, index, -0.08)
  for (const side of [-1, 1]) {
    addFrustum(root, p.Hips.clone().add(new THREE.Vector3(side * width * 0.26, -0.07 * scale, -0.02)), width * 0.21, 0.085 * scale, width * 0.13, 0.065 * scale, 0.2 * scale, m.leather, 'Hips', skeleton, index, new THREE.Euler(0.02, 0, side * 0.18))
  }
}

function addArmor(root: THREE.Group, p: Record<string, THREE.Vector3>, width: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  for (const side of [-1, 1]) {
    const shoulder = side < 0 ? p.UpperArm_L : p.UpperArm_R
    const boneName = side < 0 ? 'UpperArm_L' : 'UpperArm_R'
    const size = side < 0 ? 1.08 : 0.8
    addFrustum(root, shoulder.clone().add(new THREE.Vector3(side * 0.025, 0.035, 0.012)), 0.28 * scale * size, 0.22 * scale * size, 0.19 * scale * size, 0.14 * scale * size, 0.08 * scale, m.leatherDark, boneName, skeleton, index, new THREE.Euler(0.06, side * -0.12, side * 0.22))
    for (let layer = 0; layer < 3; layer += 1) {
      const outward = side * (0.014 + layer * 0.025)
      addFrustum(
        root,
        shoulder.clone().add(new THREE.Vector3(outward, 0.075 - layer * 0.045, -0.012 + layer * 0.01)),
        (0.27 - layer * 0.025) * scale * size,
        (0.2 - layer * 0.018) * scale * size,
        (0.16 - layer * 0.018) * scale * size,
        (0.13 - layer * 0.014) * scale * size,
        0.065 * scale,
        layer === 0 ? m.metal : m.metalDark,
        boneName,
        skeleton,
        index,
        new THREE.Euler(0.08 + layer * 0.03, side * -0.16, side * (0.18 + layer * 0.1)),
      )
    }
    if (side < 0) {
      addFrustum(root, shoulder.clone().add(new THREE.Vector3(side * 0.17 * scale, 0.12 * scale, 0.005)), 0.055 * scale, 0.05 * scale, 0.012 * scale, 0.012 * scale, 0.25 * scale, m.metalDark, boneName, skeleton, index, new THREE.Euler(0, 0, side * 0.48))
    }
  }

  addBracerStack(root, p, -1, skeleton, index, m, scale)
  addBracerStack(root, p, 1, skeleton, index, m, scale)
  addGreave(root, p, -1, skeleton, index, m, scale)
  addGreave(root, p, 1, skeleton, index, m, scale)
}

function addHarness(root: THREE.Group, p: Record<string, THREE.Vector3>, width: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  const chestY = p.Chest.y - 0.02 * scale
  const top = new THREE.Vector3(-width * 0.27, chestY + 0.17 * scale, -0.155 * scale)
  const bottom = new THREE.Vector3(width * 0.22, p.Hips.y + 0.12 * scale, -0.145 * scale)
  addBoneBetween(root, top, bottom, 0.035 * scale, 0.03 * scale, m.leather, 'Chest', skeleton, index, 6)
  addBox(root, new THREE.Vector3(width * 0.04, chestY - 0.01 * scale, -0.175 * scale), new THREE.Vector3(0.095 * scale, 0.095 * scale, 0.025 * scale), m.metalDark, 'Chest', skeleton, index, new THREE.Euler(0, 0, 0.12))
}

function addBracerStack(root: THREE.Group, p: Record<string, THREE.Vector3>, side: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  const elbow = side < 0 ? p.LowerArm_L : p.LowerArm_R
  const hand = side < 0 ? p.Hand_L : p.Hand_R
  const boneName = side < 0 ? 'LowerArm_L' : 'LowerArm_R'
  const center = elbow.clone().lerp(hand, 0.58)
  addFrustum(root, center, 0.13 * scale, 0.12 * scale, 0.095 * scale, 0.09 * scale, 0.19 * scale, m.metalDark, boneName, skeleton, index, new THREE.Euler(0, 0, side * 0.05))
  addBox(root, center.clone().add(new THREE.Vector3(0, 0, -0.07 * scale)), new THREE.Vector3(0.14 * scale, 0.16 * scale, 0.025 * scale), m.metal, boneName, skeleton, index, new THREE.Euler(0, 0, side * 0.04))
  addBox(root, center.clone().add(new THREE.Vector3(0, -0.07 * scale, -0.073 * scale)), new THREE.Vector3(0.12 * scale, 0.025 * scale, 0.03 * scale), m.leather, boneName, skeleton, index)
}

function addGreave(root: THREE.Group, p: Record<string, THREE.Vector3>, side: number, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  const knee = side < 0 ? p.LowerLeg_L : p.LowerLeg_R
  const foot = side < 0 ? p.Foot_L : p.Foot_R
  const boneName = side < 0 ? 'LowerLeg_L' : 'LowerLeg_R'
  const center = knee.clone().lerp(foot, 0.54)
  addFrustum(root, center, 0.16 * scale, 0.13 * scale, 0.11 * scale, 0.1 * scale, 0.29 * scale, m.metalDark, boneName, skeleton, index)
  addBox(root, center.clone().add(new THREE.Vector3(0, 0.02, -0.077 * scale)), new THREE.Vector3(0.17 * scale, 0.24 * scale, 0.026 * scale), m.metal, boneName, skeleton, index)
  addIco(root, knee.clone().add(new THREE.Vector3(0, 0, -0.04)), 0.09 * scale, m.metal, boneName, skeleton, index, new THREE.Vector3(1.0, 0.72, 0.52), 1)
}

function addConceptSword(root: THREE.Group, hand: THREE.Vector3, skeleton: THREE.Skeleton, index: Map<string, number>, m: MaterialSet, scale: number) {
  const gripTop = hand.clone().add(new THREE.Vector3(0.015 * scale, 0.045 * scale, -0.01 * scale))
  const gripBottom = gripTop.clone().add(new THREE.Vector3(0.015 * scale, -0.2 * scale, -0.012 * scale))
  const bladeStart = gripBottom.clone().add(new THREE.Vector3(0.015 * scale, -0.08 * scale, 0))
  const bladeEnd = bladeStart.clone().add(new THREE.Vector3(0.12 * scale, -0.82 * scale, 0.035 * scale))
  const direction = bladeEnd.clone().sub(bladeStart).normalize()
  const guardCenter = gripBottom.clone().add(new THREE.Vector3(0, -0.025 * scale, 0))

  addBoneBetween(root, gripTop, gripBottom, 0.034 * scale, 0.03 * scale, m.leatherDark, 'Hand_R', skeleton, index, 8)
  addBox(root, guardCenter, new THREE.Vector3(0.31 * scale, 0.045 * scale, 0.075 * scale), m.metalDark, 'Hand_R', skeleton, index, new THREE.Euler(0.02, -0.04, -0.05))
  addBoneBetween(root, bladeStart, bladeEnd, 0.07 * scale, 0.034 * scale, m.metal, 'Hand_R', skeleton, index, 4)
  addFrustum(root, bladeEnd.clone().add(direction.clone().multiplyScalar(0.055 * scale)), 0.055 * scale, 0.034 * scale, 0.008 * scale, 0.01 * scale, 0.12 * scale, m.metal, 'Hand_R', skeleton, index, new THREE.Euler(0.06, 0, -0.12))
  addIco(root, gripTop.clone().add(new THREE.Vector3(-0.005 * scale, 0.045 * scale, 0)), 0.055 * scale, m.metalDark, 'Hand_R', skeleton, index, new THREE.Vector3(0.85, 1.15, 0.85), 0)
}

function addClothStrip(root: THREE.Group, center: THREE.Vector3, width: number, height: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, tilt: number) {
  const geometry = makeTatteredPanel(width, height, 0.018, tilt)
  const matrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
  addRigid(root, geometry, matrix, material, boneName, skeleton, index)
}

function makeTatteredPanel(width: number, height: number, depth: number, tilt: number) {
  const segments = 5
  const front: number[] = []
  const back: number[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const x = (t - 0.5) * width
    const topY = height / 2 + x * tilt
    const bottomY = -height / 2 + (i % 2 === 0 ? height * 0.08 : -height * 0.05) + x * tilt
    front.push(x, topY, -depth / 2, x, bottomY, -depth / 2)
    back.push(x, topY, depth / 2, x, bottomY, depth / 2)
  }
  const verts = new Float32Array([...front, ...back])
  const idx: number[] = []
  const row = (segments + 1) * 2
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a,b,c, c,b,d)
    const A = row + a, B = row + b, C = row + c, D = row + d
    idx.push(A,C,B, C,D,B)
  }
  for (let i = 0; i <= segments; i += 1) {
    const a = i * 2, b = a + 1, A = row + a, B = row + b
    idx.push(a,A,b, A,B,b)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geometry.setIndex(idx)
  geometry.computeVertexNormals()
  return geometry
}

function worldPositions(bones: BoneMap) {
  bones.Root.updateMatrixWorld(true)
  const result: Record<string, THREE.Vector3> = {}
  Object.entries(bones).forEach(([name, bone]) => { result[name] = bone.getWorldPosition(new THREE.Vector3()) })
  return result
}

function addBoneBetween(root: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radiusStart: number, radiusEnd: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, sides = 7) {
  const direction = end.clone().sub(start)
  const length = Math.max(0.02, direction.length())
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, length, sides, 1, false)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  const matrix = new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(0.5), q, new THREE.Vector3(1,1,1))
  addRigid(root, geometry, matrix, material, boneName, skeleton, index)
}

function addFrustum(root: THREE.Group, center: THREE.Vector3, topW: number, topD: number, bottomW: number, bottomD: number, height: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler()) {
  const geometry = makeFrustum(topW, topD, bottomW, bottomD, height)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1,1,1))
  addRigid(root, geometry, matrix, material, boneName, skeleton, index)
}

function makeFrustum(topW: number, topD: number, bottomW: number, bottomD: number, height: number) {
  const y0 = -height/2, y1 = height/2
  const v = new Float32Array([
    -bottomW/2,y0,-bottomD/2, bottomW/2,y0,-bottomD/2, bottomW/2,y0,bottomD/2, -bottomW/2,y0,bottomD/2,
    -topW/2,y1,-topD/2, topW/2,y1,-topD/2, topW/2,y1,topD/2, -topW/2,y1,topD/2,
  ])
  const idx = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(v,3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function addIco(root: THREE.Group, center: THREE.Vector3, radius: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, scale: THREE.Vector3, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale)
  addRigid(root, geometry, matrix, material, boneName, skeleton, index)
}

function addTorus(root: THREE.Group, center: THREE.Vector3, radius: number, tube: number, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation: THREE.Euler, scale: THREE.Vector3) {
  const geometry = new THREE.TorusGeometry(radius, tube, 6, 18)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), scale)
  addRigid(root, geometry, matrix, material, boneName, skeleton, index)
}

function addBox(root: THREE.Group, center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>, rotation = new THREE.Euler()) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  const matrix = new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1,1,1))
  addRigid(root, geometry, matrix, material, boneName, skeleton, index)
}

function addRigid(root: THREE.Group, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, material: THREE.Material, boneName: string, skeleton: THREE.Skeleton, index: Map<string, number>) {
  geometry.applyMatrix4(matrix)
  const count = geometry.attributes.position.count
  const boneIndex = index.get(boneName) ?? 0
  const skinIndices = new Uint16Array(count * 4)
  const skinWeights = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) {
    skinIndices[i * 4] = boneIndex
    skinWeights[i * 4] = 1
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))
  geometry.computeVertexNormals()
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = `Concept_${boneName}_${root.children.length}`
  mesh.frustumCulled = false
  root.add(mesh)
  mesh.bind(skeleton, new THREE.Matrix4())
  return mesh
}

function childBox(parent: THREE.Object3D, center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
  mesh.name = name
  mesh.position.copy(center)
  parent.add(mesh)
}

function childFrustum(parent: THREE.Object3D, center: THREE.Vector3, topW: number, topD: number, bottomW: number, bottomD: number, height: number, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(makeFrustum(topW, topD, bottomW, bottomD, height), material)
  mesh.name = name
  mesh.position.copy(center)
  parent.add(mesh)
}
