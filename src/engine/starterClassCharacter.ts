import * as THREE from 'three'
import {
  createProceduralCharacter,
  type ForgeCharacterBuild,
  type ForgeCharacterConfig,
} from '../lib/proceduralCharacter'

export type SkillboundStarterClass = 'duskstrider' | 'thornwarden' | 'voidweaver'
export type StarterClassCharacterConfig = ForgeCharacterConfig & { starterClass?: SkillboundStarterClass }

type Palette = {
  cloth: THREE.MeshStandardMaterial
  clothDark: THREE.MeshStandardMaterial
  clothLight: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
  leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  accent: THREE.MeshStandardMaterial
  accentDark: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
}

type StyleProfile = {
  bulk: number
  shoulders: number
  head: number
  arms: number
  legs: number
}

const STYLE: Record<SkillboundStarterClass, StyleProfile> = {
  duskstrider: { bulk: 0.78, shoulders: 0.88, head: 1.09, arms: 0.98, legs: 1.03 },
  thornwarden: { bulk: 0.75, shoulders: 0.85, head: 1.10, arms: 1.00, legs: 1.05 },
  voidweaver: { bulk: 0.72, shoulders: 0.82, head: 1.11, arms: 1.00, legs: 1.03 },
}

export function createStarterClassCharacter(
  config: ForgeCharacterConfig,
  starterClass: SkillboundStarterClass,
): ForgeCharacterBuild {
  const styled = stylizeConfig(config, starterClass)
  const build = createProceduralCharacter(styled)
  const palette = makePalette(config, starterClass)

  addSharedSilhouette(build, palette, starterClass)
  if (starterClass === 'duskstrider') buildDuskstrider(build, palette)
  else if (starterClass === 'thornwarden') buildThornwarden(build, palette)
  else buildVoidweaver(build, palette)

  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    format: 'ForgeCharacter',
    version: 7,
    archetypeVersion: 7,
    starterClass,
    conceptTarget: starterClass,
    source: 'SkillboundStarterClass',
    artStyle: 'compact-topdown-lowpoly-v2',
    styleReference: 'Evergrow-inspired proportions translated independently to 3D',
    assembly: 'rig-compatible-layered-procedural',
    weaponPolicy: 'external-item-forge',
    previewWeapon: false,
    mocapFacingYaw: Math.PI,
  }

  build.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
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
  const p = STYLE[starterClass]
  return {
    ...config,
    species: 'bandit',
    armor: 'none',
    headwear: 'none',
    weapon: 'none',
    bulk: clamp(p.bulk + (config.bulk - 1) * 0.16, p.bulk - 0.05, p.bulk + 0.06),
    shoulders: clamp(p.shoulders + (config.shoulders - 1) * 0.14, p.shoulders - 0.05, p.shoulders + 0.06),
    headScale: clamp(p.head + (config.headScale - 1) * 0.18, p.head - 0.04, p.head + 0.04),
    armLength: clamp(p.arms + (config.armLength - 1) * 0.25, p.arms - 0.04, p.arms + 0.04),
    legLength: clamp(p.legs + (config.legLength - 1) * 0.25, p.legs - 0.04, p.legs + 0.04),
    asymmetry: Math.min(config.asymmetry, starterClass === 'duskstrider' ? 0.05 : 0.025),
  }
}

function makePalette(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): Palette {
  const cloth = new THREE.Color(config.secondary)
  const accent = new THREE.Color(config.accent)
  const steel = starterClass === 'voidweaver'
    ? new THREE.Color('#625d72')
    : starterClass === 'thornwarden'
      ? new THREE.Color('#5a6a5c')
      : new THREE.Color('#64776f')
  const glow = starterClass === 'voidweaver' ? '#a99cff' : starterClass === 'thornwarden' ? '#a4c58a' : '#9fc7d2'

  return {
    cloth: mat(cloth, 0.96),
    clothDark: mat(cloth.clone().multiplyScalar(0.56), 1),
    clothLight: mat(cloth.clone().lerp(new THREE.Color('#d7d6c7'), 0.22), 0.94),
    leather: mat(accent.clone().multiplyScalar(0.82), 0.95),
    leatherDark: mat(accent.clone().multiplyScalar(0.46), 1),
    metal: mat(steel, 0.64, 0.28),
    metalDark: mat(steel.clone().multiplyScalar(0.5), 0.8, 0.18),
    accent: mat(accent, 0.94),
    accentDark: mat(accent.clone().multiplyScalar(0.55), 1),
    glow: new THREE.MeshStandardMaterial({
      color: glow,
      emissive: glow,
      emissiveIntensity: starterClass === 'voidweaver' ? 1.8 : 0.8,
      roughness: 0.45,
      metalness: 0,
      flatShading: true,
    }),
  }
}

function mat(color: THREE.Color | string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
}

/** Shared Evergrow-like read: narrow clothes, tapered limbs and small equipment masses. */
function addSharedSilhouette(build: ForgeCharacterBuild, m: Palette, starterClass: SkillboundStarterClass) {
  const { bones } = build
  const main = starterClass === 'voidweaver' ? m.clothDark : m.cloth

  // Slim fitted tunic; deliberately narrower than the underlying torso so its silhouette stays compact.
  add(bones.Chest, taperedBox(0.30, 0.16, 0.25, 0.145, 0.29), main, [0, -0.105, -0.012], undefined, undefined, 'Starter_FittedTorso')
  add(bones.Hips, taperedBox(0.255, 0.15, 0.225, 0.14, 0.105), m.leatherDark, [0, 0.005, -0.01], undefined, undefined, 'Starter_Waist')

  // Small sleeves, cuffs, trousers and boots follow the bones instead of widening the shoulders.
  for (const side of [-1, 1] as const) {
    const upperArm = side < 0 ? bones.UpperArm_L : bones.UpperArm_R
    const lowerArm = side < 0 ? bones.LowerArm_L : bones.LowerArm_R
    const upperLeg = side < 0 ? bones.UpperLeg_L : bones.UpperLeg_R
    const lowerLeg = side < 0 ? bones.LowerLeg_L : bones.LowerLeg_R

    add(upperArm, new THREE.CylinderGeometry(0.058, 0.067, 0.245, 6), main,
      [side * 0.145, 0, 0], [0, 0, Math.PI / 2], undefined, `Starter_Sleeve_${side}`)
    add(lowerArm, new THREE.CylinderGeometry(0.047, 0.057, 0.17, 6), m.leatherDark,
      [side * 0.115, 0, 0], [0, 0, Math.PI / 2], undefined, `Starter_Cuff_${side}`)
    add(upperLeg, new THREE.CylinderGeometry(0.067, 0.077, 0.285, 6), m.clothDark,
      [0, -0.17, 0], undefined, [0.96, 1, 0.92], `Starter_Trouser_${side}`)
    add(lowerLeg, new THREE.CylinderGeometry(0.058, 0.064, 0.23, 6), m.leatherDark,
      [0, -0.18, 0], undefined, [0.96, 1, 0.9], `Starter_Boot_${side}`)
  }
}

function buildDuskstrider(build: ForgeCharacterBuild, m: Palette) {
  const { bones } = build

  // One tiny shoulder plate, never a full pauldron pair.
  add(bones.Chest, taperedBox(0.14, 0.13, 0.105, 0.105, 0.055), m.metal,
    [-0.205, 0.055, -0.005], [0, 0.08, -0.07], undefined, 'Duskstrider_Shoulder')

  // Compact hood cap and low cowl: the face stays readable.
  add(bones.Head, new THREE.SphereGeometry(0.154, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.56), m.clothDark,
    [0, 0.115, 0.025], [0.04, 0, 0], [1.02, 0.9, 1.02], 'Duskstrider_HoodTop')
  add(bones.Neck, new THREE.CylinderGeometry(0.145, 0.16, 0.075, 6), m.clothDark,
    [0, -0.005, 0.015], undefined, [1, 1, 0.78], 'Duskstrider_Cowl')

  // Evergrow-style strong read: one muted cape color with a split hem, not stacked armor clutter.
  addCapePair(bones.Chest, m.accentDark, m.accent, 0.43, 0.145, 0.16, 'Duskstrider')
  add(bones.Hips, new THREE.BoxGeometry(0.22, 0.035, 0.045), m.leather,
    [0, 0.025, -0.105], undefined, undefined, 'Duskstrider_Belt')
  add(bones.Hips, new THREE.BoxGeometry(0.07, 0.085, 0.045), m.leatherDark,
    [0.13, -0.035, 0.035], [0, 0.08, -0.05], undefined, 'Duskstrider_Pouch')
}

function buildThornwarden(build: ForgeCharacterBuild, m: Palette) {
  const { bones } = build

  // Short hunter mantle and half-cape, kept close to the body.
  add(bones.Chest, taperedBox(0.31, 0.155, 0.27, 0.145, 0.095), m.clothDark,
    [0, 0.03, 0.025], undefined, undefined, 'Thornwarden_Mantle')
  addCapePair(bones.Chest, m.clothDark, m.cloth, 0.315, 0.12, 0.13, 'Thornwarden')

  // Quiver is the single ranged silhouette cue; only three arrows are needed at gameplay scale.
  add(bones.Chest, new THREE.CylinderGeometry(0.043, 0.05, 0.34, 7), m.leatherDark,
    [0.145, -0.13, 0.14], [0, 0, -0.22], undefined, 'Thornwarden_Quiver')
  for (let i = 0; i < 3; i += 1) {
    const x = 0.125 + i * 0.019
    add(bones.Chest, new THREE.CylinderGeometry(0.004, 0.004, 0.39, 5), m.metalDark,
      [x, 0.055 + i * 0.006, 0.145], [0, 0, -0.22], undefined, `Thornwarden_Arrow_${i}`)
    add(bones.Chest, new THREE.ConeGeometry(0.014, 0.045, 4), m.accent,
      [x + 0.075, 0.22 + i * 0.004, 0.145], [0, 0, -0.22], undefined, `Thornwarden_Fletching_${i}`)
  }
  add(bones.Hips, new THREE.BoxGeometry(0.21, 0.032, 0.042), m.leather,
    [0, 0.024, -0.104], undefined, undefined, 'Thornwarden_Belt')
}

function buildVoidweaver(build: ForgeCharacterBuild, m: Palette) {
  const { bones } = build

  // Narrow high collar instead of shoulder armor.
  for (const side of [-1, 1] as const) {
    add(bones.Neck, taperedBox(0.075, 0.08, 0.055, 0.07, 0.12), m.cloth,
      [side * 0.055, 0.025, 0.01], [0, 0, side * 0.16], undefined, `Voidweaver_Collar_${side}`)
  }

  // Two slim robe strips preserve visible leg separation from the top-down camera.
  add(bones.Hips, taperedBox(0.095, 0.045, 0.115, 0.038, 0.43), m.cloth,
    [-0.064, -0.25, -0.025], [0.025, 0, -0.015], undefined, 'Voidweaver_Robe_L')
  add(bones.Hips, taperedBox(0.095, 0.045, 0.115, 0.038, 0.43), m.clothDark,
    [0.064, -0.25, -0.025], [0.025, 0, 0.015], undefined, 'Voidweaver_Robe_R')
  add(bones.Chest, new THREE.BoxGeometry(0.032, 0.20, 0.018), m.accent,
    [0, -0.11, -0.102], undefined, undefined, 'Voidweaver_RuneStripe')
  add(bones.Chest, new THREE.OctahedronGeometry(0.026, 0), m.glow,
    [0, -0.015, -0.125], undefined, undefined, 'Voidweaver_RuneGem')

  // Tiny bound book at the hip: readable up close, negligible silhouette cost in combat.
  add(bones.Hips, new THREE.BoxGeometry(0.095, 0.12, 0.032), m.leatherDark,
    [0.135, -0.045, 0.045], [0.02, -0.08, -0.04], undefined, 'Voidweaver_Grimoire')
  add(bones.Hips, new THREE.BoxGeometry(0.045, 0.012, 0.036), m.glow,
    [0.135, -0.045, 0.025], [0.02, -0.08, -0.04], undefined, 'Voidweaver_GrimoireMark')
}

function addCapePair(
  chest: THREE.Bone,
  dark: THREE.Material,
  light: THREE.Material,
  height: number,
  topWidth: number,
  bottomWidth: number,
  prefix: string,
) {
  const gap = 0.012
  add(chest, taperedBox(topWidth, 0.022, bottomWidth, 0.026, height), dark,
    [-topWidth * 0.48 - gap, -height * 0.48, 0.135], [0.055, 0, -0.025], undefined, `${prefix}_Cape_L`)
  add(chest, taperedBox(topWidth, 0.022, bottomWidth, 0.026, height * 0.94), light,
    [topWidth * 0.48 + gap, -height * 0.45, 0.137], [0.05, 0, 0.025], undefined, `${prefix}_Cape_R`)
}

function taperedBox(topW: number, topD: number, bottomW: number, bottomD: number, height: number) {
  const y0 = -height / 2
  const y1 = height / 2
  const vertices = new Float32Array([
    -bottomW / 2, y0, -bottomD / 2, bottomW / 2, y0, -bottomD / 2, bottomW / 2, y0, bottomD / 2, -bottomW / 2, y0, bottomD / 2,
    -topW / 2, y1, -topD / 2, topW / 2, y1, -topD / 2, topW / 2, y1, topD / 2, -topW / 2, y1, topD / 2,
  ])
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  name = 'StarterClassPart',
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
