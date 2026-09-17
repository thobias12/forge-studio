import * as THREE from 'three'
import {
  createProceduralCharacter,
  type ForgeCharacterBuild,
  type ForgeCharacterConfig,
} from '../lib/proceduralCharacter'

export type SkillboundStarterClass = 'duskstrider' | 'thornwarden' | 'voidweaver'
export type StarterClassCharacterConfig = ForgeCharacterConfig & { starterClass?: SkillboundStarterClass }

type Palette = {
  skin: THREE.MeshStandardMaterial
  skinShadow: THREE.MeshStandardMaterial
  hair: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  clothDark: THREE.MeshStandardMaterial
  clothLight: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
  leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  trim: THREE.MeshStandardMaterial
  eye: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
}

type BodyStyle = {
  height: number
  bulk: number
  shoulders: number
  headScale: number
  armLength: number
  legLength: number
}

const CLASS_BODY: Record<SkillboundStarterClass, BodyStyle> = {
  duskstrider: { height: 0.97, bulk: 0.82, shoulders: 0.91, headScale: 1.02, armLength: 0.97, legLength: 1.00 },
  thornwarden: { height: 0.98, bulk: 0.79, shoulders: 0.89, headScale: 1.03, armLength: 0.99, legLength: 1.02 },
  voidweaver: { height: 0.98, bulk: 0.77, shoulders: 0.87, headScale: 1.04, armLength: 0.98, legLength: 1.01 },
}

export function createStarterClassCharacter(
  config: ForgeCharacterConfig,
  starterClass: SkillboundStarterClass,
): ForgeCharacterBuild {
  const styled = stylizeConfig(config, starterClass)
  const build = createProceduralCharacter(styled)

  // v1.54 is a hard visual rebuild. Keep ForgeHumanoidV1 bones + animation clips,
  // throw away every previous procedural body/gear mesh, then build a new low-poly
  // top-down character directly on the rig.
  removeLegacyMeshes(build.root)

  const palette = makePalette(config, starterClass)
  buildBaseCharacter(build, palette, styled)

  if (starterClass === 'duskstrider') buildDuskstrider(build, palette)
  else if (starterClass === 'thornwarden') buildThornwarden(build, palette)
  else buildVoidweaver(build, palette)

  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    format: 'ForgeCharacter',
    version: 8,
    archetypeVersion: 8,
    starterClass,
    conceptTarget: starterClass,
    source: 'SkillboundStarterClass',
    artStyle: 'compact-topdown-outfit-first-v3',
    assembly: 'rig-compatible-rigid-lowpoly',
    visualRebuild: true,
    weaponPolicy: 'external-item-forge',
    previewWeapon: false,
    mocapFacingYaw: Math.PI,
  }

  build.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
    object.frustumCulled = false
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.flatShading = true
        material.needsUpdate = true
      }
    })
  })

  build.root.updateMatrixWorld(true)
  build.stats = recount(build)
  return build
}

function stylizeConfig(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): ForgeCharacterConfig {
  const p = CLASS_BODY[starterClass]
  return {
    ...config,
    species: 'bandit',
    armor: 'none',
    headwear: 'none',
    weapon: 'none',
    height: clamp(p.height + (config.height - 1) * 0.08, p.height - 0.02, p.height + 0.025),
    bulk: clamp(p.bulk + (config.bulk - 1) * 0.05, p.bulk - 0.02, p.bulk + 0.025),
    shoulders: clamp(p.shoulders + (config.shoulders - 1) * 0.05, p.shoulders - 0.02, p.shoulders + 0.025),
    headScale: clamp(p.headScale + (config.headScale - 1) * 0.06, p.headScale - 0.02, p.headScale + 0.02),
    armLength: clamp(p.armLength + (config.armLength - 1) * 0.08, p.armLength - 0.02, p.armLength + 0.02),
    legLength: clamp(p.legLength + (config.legLength - 1) * 0.08, p.legLength - 0.02, p.legLength + 0.02),
    asymmetry: 0,
  }
}

function makePalette(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): Palette {
  const skin = new THREE.Color(config.primary)
  const requestedCloth = new THREE.Color(config.secondary)
  const requestedAccent = new THREE.Color(config.accent)

  const classDefaults = starterClass === 'duskstrider'
    ? { cloth: '#253638', clothDark: '#17272a', leather: '#5b493c', metal: '#72877e', trim: '#b68a55', glow: '#c7d9cf', hair: '#352920' }
    : starterClass === 'thornwarden'
      ? { cloth: '#334637', clothDark: '#1f3027', leather: '#594936', metal: '#68796c', trim: '#b39a62', glow: '#a9c896', hair: '#3b2d20' }
      : { cloth: '#302a48', clothDark: '#1c1a2f', leather: '#4a3d45', metal: '#756f86', trim: '#a88f68', glow: '#b4a6ff', hair: '#2b2332' }

  const cloth = new THREE.Color(classDefaults.cloth).lerp(requestedCloth, 0.38)
  const clothDark = new THREE.Color(classDefaults.clothDark).lerp(requestedCloth.clone().multiplyScalar(0.55), 0.28)
  const leather = new THREE.Color(classDefaults.leather).lerp(requestedAccent, 0.3)
  const metal = new THREE.Color(classDefaults.metal)
  const trim = new THREE.Color(classDefaults.trim).lerp(requestedAccent, 0.18)

  return {
    skin: mat(skin, 0.9),
    skinShadow: mat(skin.clone().multiplyScalar(0.72), 0.96),
    hair: mat(new THREE.Color(classDefaults.hair), 0.98),
    cloth: mat(cloth, 0.98),
    clothDark: mat(clothDark, 1),
    clothLight: mat(cloth.clone().lerp(new THREE.Color('#d0d0bd'), 0.18), 0.96),
    leather: mat(leather, 0.98),
    leatherDark: mat(leather.clone().multiplyScalar(0.56), 1),
    metal: mat(metal, 0.62, 0.25),
    metalDark: mat(metal.clone().multiplyScalar(0.52), 0.76, 0.18),
    trim: mat(trim, 0.82, 0.06),
    eye: new THREE.MeshStandardMaterial({ color: '#d4b261', emissive: '#3b2d13', emissiveIntensity: 0.35, roughness: 0.65, flatShading: true }),
    glow: new THREE.MeshStandardMaterial({ color: classDefaults.glow, emissive: classDefaults.glow, emissiveIntensity: starterClass === 'voidweaver' ? 1.75 : 0.65, roughness: 0.4, flatShading: true }),
  }
}

function mat(color: THREE.Color | string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
}

function buildBaseCharacter(build: ForgeCharacterBuild, m: Palette, config: ForgeCharacterConfig) {
  const { bones } = build
  const h = config.height
  const upperArm = 0.335 * h * config.armLength
  const lowerArm = 0.305 * h * config.armLength
  const upperLeg = 0.39 * h * config.legLength
  const lowerLeg = 0.38 * h * config.legLength

  // Head: compact, faceted and readable. Neck is intentionally hidden by the outfit.
  add(bones.Head, new THREE.IcosahedronGeometry(0.142 * h * config.headScale, 1), m.skin,
    [0, 0.067, -0.012], undefined, [0.94, 1.02, 0.9], 'Hero_Head')
  add(bones.Head, new THREE.SphereGeometry(0.142 * h * config.headScale, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.48), m.hair,
    [0, 0.118, 0.004], [0.02, 0, 0], [0.96, 0.72, 0.96], 'Hero_HairCap')

  // Small brows/eyes preserve the Evergrow-like tiny-face read without making a realistic portrait.
  for (const side of [-1, 1] as const) {
    add(bones.Head, new THREE.BoxGeometry(0.038, 0.012, 0.014), m.hair,
      [side * 0.047, 0.082, -0.126], [0, side * -0.05, side * -0.05], undefined, `Hero_Brow_${side}`)
    add(bones.Head, new THREE.BoxGeometry(0.016, 0.013, 0.011), m.eye,
      [side * 0.047, 0.057, -0.135], undefined, undefined, `Hero_Eye_${side}`)
  }

  // Outfit-first torso: a single tapered tunic volume replaces exposed mannequin anatomy.
  add(bones.Spine, taperedBox(0.275, 0.15, 0.37, 0.17, 0.31), m.cloth,
    [0, 0.105, 0], undefined, undefined, 'Hero_Tunic')
  add(bones.Chest, taperedBox(0.37, 0.17, 0.31, 0.155, 0.19), m.cloth,
    [0, -0.075, 0], undefined, undefined, 'Hero_UpperTunic')
  add(bones.Hips, taperedBox(0.255, 0.145, 0.29, 0.15, 0.16), m.clothDark,
    [0, 0.075, 0], undefined, undefined, 'Hero_WaistCloth')
  add(bones.Hips, new THREE.BoxGeometry(0.29, 0.035, 0.165), m.leatherDark,
    [0, 0.13, 0], undefined, undefined, 'Hero_BeltBase')
  add(bones.Hips, new THREE.BoxGeometry(0.045, 0.055, 0.025), m.trim,
    [0, 0.13, -0.096], undefined, undefined, 'Hero_BeltBuckle')

  // Sleeves and trousers fully cover the old bare limbs. Segments deliberately overlap at joints.
  for (const side of [-1, 1] as const) {
    const upperArmBone = side < 0 ? bones.UpperArm_L : bones.UpperArm_R
    const lowerArmBone = side < 0 ? bones.LowerArm_L : bones.LowerArm_R
    const handBone = side < 0 ? bones.Hand_L : bones.Hand_R
    const upperLegBone = side < 0 ? bones.UpperLeg_L : bones.UpperLeg_R
    const lowerLegBone = side < 0 ? bones.LowerLeg_L : bones.LowerLeg_R
    const footBone = side < 0 ? bones.Foot_L : bones.Foot_R

    add(upperArmBone, new THREE.CylinderGeometry(0.055, 0.068, upperArm * 0.95, 6), m.cloth,
      [side * upperArm * 0.47, 0, 0], [0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2], undefined, `Hero_UpperSleeve_${side}`)
    add(lowerArmBone, new THREE.CylinderGeometry(0.046, 0.058, lowerArm * 0.93, 6), m.clothDark,
      [side * lowerArm * 0.46, 0, 0], [0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2], undefined, `Hero_ForeSleeve_${side}`)
    add(lowerArmBone, new THREE.CylinderGeometry(0.058, 0.061, 0.075, 6), m.leather,
      [side * lowerArm * 0.78, 0, 0], [0, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2], undefined, `Hero_Cuff_${side}`)
    add(handBone, new THREE.BoxGeometry(0.082, 0.07, 0.075), m.leather,
      [side * 0.032, -0.004, -0.002], undefined, undefined, `Hero_Glove_${side}`)

    add(upperLegBone, new THREE.CylinderGeometry(0.066, 0.082, upperLeg * 0.97, 6), m.clothDark,
      [0, -upperLeg * 0.48, 0], undefined, [0.98, 1, 0.92], `Hero_Thigh_${side}`)
    add(lowerLegBone, new THREE.CylinderGeometry(0.055, 0.067, lowerLeg * 0.91, 6), m.clothDark,
      [0, -lowerLeg * 0.45, 0], undefined, [0.98, 1, 0.92], `Hero_Shin_${side}`)
    add(lowerLegBone, taperedBox(0.105, 0.125, 0.12, 0.14, 0.18), m.leather,
      [0, -lowerLeg * 0.70, -0.005], undefined, undefined, `Hero_BootCuff_${side}`)
    add(footBone, taperedBox(0.12, 0.205, 0.11, 0.17, 0.105), m.leatherDark,
      [0, -0.025, -0.085], [-0.07, 0, 0], undefined, `Hero_Boot_${side}`)
  }

  // Shoulder cloth bridges the torso and arm so the model reads as a designed outfit, not a puppet.
  for (const side of [-1, 1] as const) {
    add(bones.Chest, new THREE.SphereGeometry(0.09, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.58), m.clothDark,
      [side * 0.195, 0.035, 0], [0, 0, side * 0.12], [1.15, 0.65, 0.98], `Hero_ShoulderCloth_${side}`)
  }
}

function buildDuskstrider(build: ForgeCharacterBuild, m: Palette) {
  const { bones } = build

  add(bones.Neck, new THREE.CylinderGeometry(0.145, 0.165, 0.085, 7), m.clothDark,
    [0, -0.005, 0.015], undefined, [1, 1, 0.82], 'Duskstrider_Cowl')
  add(bones.Head, new THREE.SphereGeometry(0.152, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.60), m.clothDark,
    [0, 0.112, 0.018], [0.02, 0, 0], [1.03, 0.86, 1.03], 'Duskstrider_Hood')

  // One small metal shoulder cue, matching the compact asymmetrical ARPG silhouette.
  add(bones.Chest, taperedBox(0.15, 0.14, 0.105, 0.115, 0.055), m.metal,
    [-0.205, 0.055, -0.005], [0.02, 0.08, -0.06], undefined, 'Duskstrider_ShoulderPlate')
  add(bones.Chest, new THREE.BoxGeometry(0.04, 0.27, 0.022), m.leather,
    [-0.055, -0.09, -0.096], [0, 0, 0.40], undefined, 'Duskstrider_ChestStrap')

  addCape(bones.Chest, m.clothDark, m.accent ?? m.trim, 0.47, 0.31, 'Duskstrider')
  add(bones.Hips, new THREE.BoxGeometry(0.07, 0.09, 0.045), m.leatherDark,
    [0.145, 0.055, 0.02], [0, 0.08, -0.04], undefined, 'Duskstrider_Pouch')
}

function buildThornwarden(build: ForgeCharacterBuild, m: Palette) {
  const { bones } = build

  add(bones.Neck, taperedBox(0.24, 0.16, 0.19, 0.14, 0.085), m.clothDark,
    [0, -0.012, 0.015], undefined, undefined, 'Thornwarden_Mantle')
  addCape(bones.Chest, m.clothDark, m.cloth, 0.36, 0.285, 'Thornwarden')

  // Narrow chest overlay provides a hunter silhouette without plate bulk.
  add(bones.Chest, taperedBox(0.245, 0.025, 0.205, 0.02, 0.23), m.leather,
    [0, -0.10, -0.095], [0.02, 0, 0], undefined, 'Thornwarden_LeatherBib')
  add(bones.Chest, new THREE.BoxGeometry(0.035, 0.28, 0.018), m.leatherDark,
    [0.045, -0.105, -0.113], [0, 0, -0.30], undefined, 'Thornwarden_ChestStrap')

  // Compact quiver is the dominant ranged read from above.
  add(bones.Chest, new THREE.CylinderGeometry(0.043, 0.052, 0.34, 7), m.leatherDark,
    [0.135, -0.13, 0.145], [0.04, 0, -0.24], undefined, 'Thornwarden_Quiver')
  for (let i = 0; i < 3; i += 1) {
    add(bones.Chest, new THREE.CylinderGeometry(0.004, 0.004, 0.39, 5), m.metalDark,
      [0.115 + i * 0.019, 0.065 + i * 0.004, 0.15], [0.04, 0, -0.24], undefined, `Thornwarden_Arrow_${i}`)
    add(bones.Chest, new THREE.ConeGeometry(0.013, 0.04, 4), m.trim,
      [0.19 + i * 0.019, 0.225 + i * 0.004, 0.15], [0.04, 0, -0.24], undefined, `Thornwarden_Fletching_${i}`)
  }
}

function buildVoidweaver(build: ForgeCharacterBuild, m: Palette) {
  const { bones } = build

  add(bones.Neck, new THREE.CylinderGeometry(0.14, 0.165, 0.105, 7), m.clothDark,
    [0, -0.002, 0.012], undefined, [1, 1, 0.82], 'Voidweaver_Cowl')
  add(bones.Head, new THREE.SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.54), m.clothDark,
    [0, 0.115, 0.02], [0.02, 0, 0], [1.02, 0.82, 1.02], 'Voidweaver_Hood')

  // Strong robe read: skirt around the hips plus split front panels, while still exposing leg separation.
  add(bones.Hips, taperedBox(0.29, 0.15, 0.38, 0.17, 0.34), m.cloth,
    [0, -0.10, 0.01], [0.02, 0, 0], undefined, 'Voidweaver_RobeSkirt')
  add(bones.Hips, taperedBox(0.105, 0.04, 0.125, 0.035, 0.42), m.clothDark,
    [-0.073, -0.31, -0.095], [0.03, 0, -0.02], undefined, 'Voidweaver_FrontRobe_L')
  add(bones.Hips, taperedBox(0.105, 0.04, 0.125, 0.035, 0.42), m.clothDark,
    [0.073, -0.31, -0.095], [0.03, 0, 0.02], undefined, 'Voidweaver_FrontRobe_R')

  add(bones.Chest, new THREE.BoxGeometry(0.035, 0.22, 0.018), m.trim,
    [0, -0.11, -0.102], undefined, undefined, 'Voidweaver_RuneStripe')
  add(bones.Chest, new THREE.OctahedronGeometry(0.026, 0), m.glow,
    [0, -0.012, -0.125], undefined, undefined, 'Voidweaver_RuneGem')
  add(bones.Hips, new THREE.BoxGeometry(0.095, 0.12, 0.034), m.leatherDark,
    [0.14, 0.04, 0.055], [0.02, -0.08, -0.04], undefined, 'Voidweaver_Grimoire')
  add(bones.Hips, new THREE.BoxGeometry(0.046, 0.012, 0.038), m.glow,
    [0.14, 0.04, 0.034], [0.02, -0.08, -0.04], undefined, 'Voidweaver_GrimoireMark')
}

function addCape(
  chest: THREE.Bone,
  dark: THREE.Material,
  light: THREE.Material,
  height: number,
  width: number,
  prefix: string,
) {
  const topY = 0.045
  const centerY = topY - height / 2
  const z = 0.115
  add(chest, taperedBox(width * 0.46, 0.025, width * 0.52, 0.03, height), dark,
    [-width * 0.13, centerY, z], [0.05, 0.02, -0.025], undefined, `${prefix}_Cape_L`)
  add(chest, taperedBox(width * 0.46, 0.025, width * 0.52, 0.03, height * 0.96), light,
    [width * 0.13, centerY + 0.01, z + 0.002], [0.05, -0.02, 0.025], undefined, `${prefix}_Cape_R`)
  add(chest, new THREE.BoxGeometry(width * 0.9, 0.035, 0.03), dark,
    [0, topY - 0.015, z - 0.01], undefined, undefined, `${prefix}_CapeCollar`)
}

function removeLegacyMeshes(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  meshes.forEach((mesh) => {
    mesh.removeFromParent()
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => material?.dispose())
  })
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  name = 'StarterCharacterPart',
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function taperedBox(topW: number, topD: number, bottomW: number, bottomD: number, height: number) {
  const y0 = -height / 2
  const y1 = height / 2
  const vertices = new Float32Array([
    -bottomW / 2, y0, -bottomD / 2,
    bottomW / 2, y0, -bottomD / 2,
    bottomW / 2, y0, bottomD / 2,
    -bottomW / 2, y0, bottomD / 2,
    -topW / 2, y1, -topD / 2,
    topW / 2, y1, -topD / 2,
    topW / 2, y1, topD / 2,
    -topW / 2, y1, topD / 2,
  ])
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function recount(build: ForgeCharacterBuild) {
  let skinnedMeshes = 0
  let triangles = 0
  build.root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes += 1
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3
  })
  return { bones: build.skeleton.bones.length, skinnedMeshes, triangles: Math.round(triangles) }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
