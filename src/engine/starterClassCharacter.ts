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
  leather: THREE.MeshStandardMaterial
  leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  accent: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
  hair: THREE.MeshStandardMaterial
}

export function createStarterClassCharacter(
  config: ForgeCharacterConfig,
  starterClass: SkillboundStarterClass,
): ForgeCharacterBuild {
  const source = config as StarterClassCharacterConfig
  const build = createProceduralCharacter({
    ...config,
    species: 'bandit',
    armor: 'none',
    headwear: 'none',
    weapon: 'none',
    asymmetry: starterClass === 'duskstrider' ? Math.max(config.asymmetry, 0.06) : config.asymmetry,
  })

  const palette = makePalette(config, starterClass)
  const scale = config.height
  const bulk = config.bulk

  if (starterClass === 'duskstrider') buildDuskstrider(build, palette, scale, bulk)
  else if (starterClass === 'thornwarden') buildThornwarden(build, palette, scale, bulk)
  else buildVoidweaver(build, palette, scale, bulk)

  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    format: 'ForgeCharacter',
    version: 6,
    archetypeVersion: 6,
    starterClass,
    conceptTarget: starterClass,
    source: 'SkillboundStarterClass',
    artStyle: 'skillbound-dark-fantasy-concept-v1',
    assembly: 'rig-compatible-layered-procedural',
    weaponPolicy: 'external-item-forge',
    previewWeapon: false,
    mocapFacingYaw: Math.PI,
    conceptColors: {
      primary: source.primary,
      secondary: source.secondary,
      accent: source.accent,
    },
  }

  build.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })
  build.root.updateMatrixWorld(true)
  build.stats = recount(build)
  return build
}

function makePalette(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): Palette {
  const secondary = new THREE.Color(config.secondary)
  const accent = new THREE.Color(config.accent)
  const defaults = starterClass === 'duskstrider'
    ? { metal: '#6d675f', glow: '#6fd6ff', hair: '#171719' }
    : starterClass === 'thornwarden'
      ? { metal: '#766a50', glow: '#a8c46b', hair: '#2a211d' }
      : { metal: '#756d82', glow: '#9a77ff', hair: '#15131c' }

  return {
    cloth: standard(secondary, 0.93),
    clothDark: standard(secondary.clone().multiplyScalar(0.48), 0.98),
    leather: standard(accent.clone().multiplyScalar(0.76), 0.82),
    leatherDark: standard(accent.clone().multiplyScalar(0.38), 0.93),
    metal: standard(new THREE.Color(defaults.metal), 0.42, 0.66),
    metalDark: standard(new THREE.Color(defaults.metal).multiplyScalar(0.43), 0.64, 0.52),
    accent: standard(accent, 0.72),
    glow: new THREE.MeshStandardMaterial({
      color: defaults.glow,
      emissive: defaults.glow,
      emissiveIntensity: starterClass === 'voidweaver' ? 3.1 : 1.7,
      roughness: 0.22,
      metalness: 0.08,
    }),
    hair: standard(new THREE.Color(defaults.hair), 0.92),
  }
}

function standard(color: THREE.Color | string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: false })
}

function buildDuskstrider(build: ForgeCharacterBuild, m: Palette, s: number, b: number) {
  const { bones } = build

  // Compact layered torso and crossing road-leather harness.
  add(bones.Chest, new THREE.BoxGeometry(0.42 * b, 0.38 * s, 0.2 * b), m.clothDark, [0, -0.1 * s, 0.005], [0.03, 0, 0], undefined, 'Duskstrider_Tunic')
  add(bones.Chest, new THREE.BoxGeometry(0.34 * b, 0.3 * s, 0.225 * b), m.leather, [0, -0.07 * s, -0.018], [0.01, 0, 0.02], undefined, 'Duskstrider_LeatherCore')
  add(bones.Chest, new THREE.BoxGeometry(0.055, 0.48 * s, 0.035), m.leatherDark, [-0.04, -0.08 * s, -0.13], [0, 0, 0.62], undefined, 'Duskstrider_CrossStrapA')
  add(bones.Chest, new THREE.BoxGeometry(0.052, 0.45 * s, 0.035), m.leatherDark, [0.07, -0.08 * s, -0.137], [0, 0, -0.55], undefined, 'Duskstrider_CrossStrapB')

  // Hood, cowl and signature faded scarf.
  add(bones.Head, new THREE.SphereGeometry(0.205 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.82), m.clothDark, [0, 0.07 * s, 0.018], [0.12, 0, 0], [1.1, 1.1, 1.02], 'Duskstrider_Hood')
  add(bones.Neck, new THREE.TorusGeometry(0.17 * b, 0.052, 8, 22), m.accent, [0, -0.01, 0], [Math.PI / 2, 0, 0], [1.08, 0.88, 1], 'Duskstrider_Scarf')
  add(bones.Chest, new THREE.BoxGeometry(0.12, 0.55 * s, 0.028), m.accent, [-0.17, -0.31 * s, 0.13], [0.08, 0.08, -0.11], [1, 1, 1], 'Duskstrider_ScarfTail')

  // Tattered asymmetrical travel cloak: several independent panels read better in motion than one slab.
  const cloakPanels = [
    [-0.19, -0.28, 0.13, 0.18, 0.66, -0.08],
    [0.01, -0.31, 0.145, 0.22, 0.72, 0.02],
    [0.2, -0.27, 0.13, 0.16, 0.6, 0.11],
  ] as const
  cloakPanels.forEach(([x, y, z, w, h, rz], index) => {
    add(bones.Chest, new THREE.BoxGeometry(w * b, h * s, 0.028), index === 1 ? m.cloth : m.clothDark, [x * b, y * s, z], [0.08, 0, rz], undefined, `Duskstrider_Cloak_${index}`)
  })

  // Belt kit, satchel and cool-blue relic from the concept art.
  add(bones.Hips, new THREE.TorusGeometry(0.245 * b, 0.026, 6, 18), m.leatherDark, [0, 0.035, 0], [Math.PI / 2, 0, 0], [1.25, 0.9, 1], 'Duskstrider_Belt')
  add(bones.Hips, new THREE.BoxGeometry(0.19, 0.16, 0.095), m.leather, [0.29 * b, -0.03, 0.09], [0.02, 0, -0.08], undefined, 'Duskstrider_Satchel')
  add(bones.Hips, new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), m.metal, [-0.22, -0.035, -0.03], [0, 0, 0.08], undefined, 'Duskstrider_RelicChain')
  add(bones.Hips, new THREE.IcosahedronGeometry(0.05, 1), m.glow, [-0.22, -0.11, -0.03], undefined, [0.72, 1.08, 0.72], 'Duskstrider_Relic')
  add(bones.Hips, new THREE.TorusGeometry(0.064, 0.012, 6, 14), m.metal, [-0.22, -0.11, -0.03], [Math.PI / 2, 0, 0], undefined, 'Duskstrider_RelicCage')

  addArmGuards(bones, m.leatherDark, m.metalDark, s, 0.92)
  addBootGuards(bones, m.leatherDark, m.metalDark, s, 0.92)
  addShoulderCap(bones.Chest, -1, m.leather, m.metalDark, s, b, 0.88, 'Duskstrider')
}

function buildThornwarden(build: ForgeCharacterBuild, m: Palette, s: number, b: number) {
  const { bones } = build

  // Fitted hunter armor with layered scale/leaf plates.
  add(bones.Chest, new THREE.BoxGeometry(0.4 * b, 0.4 * s, 0.2 * b), m.leatherDark, [0, -0.1 * s, 0.01], undefined, undefined, 'Thornwarden_Core')
  for (let row = 0; row < 4; row += 1) {
    const y = 0.04 * s - row * 0.085 * s
    for (const side of [-1, 1]) {
      add(bones.Chest, new THREE.ConeGeometry(0.09 * b, 0.14 * s, 4), row % 2 ? m.leather : m.metalDark, [side * 0.1 * b, y, -0.115], [Math.PI / 2, 0, side * 0.18], [1.05, 0.62, 0.55], `Thornwarden_Scale_${row}_${side}`)
    }
  }

  // Forest mantle and split leaf cloak.
  add(bones.Neck, new THREE.TorusGeometry(0.19 * b, 0.06, 7, 20), m.clothDark, [0, -0.01, 0.015], [Math.PI / 2, 0, 0], [1.18, 0.92, 1], 'Thornwarden_Mantle')
  const cloak = [
    [-0.2, -0.3, 0.14, 0.18, 0.7, -0.08],
    [0, -0.34, 0.155, 0.2, 0.77, 0],
    [0.2, -0.3, 0.14, 0.18, 0.68, 0.08],
  ] as const
  cloak.forEach(([x, y, z, w, h, rz], index) => {
    add(bones.Chest, new THREE.ConeGeometry(w * b, h * s, 4), index === 1 ? m.cloth : m.clothDark, [x * b, y * s, z], [0, 0, Math.PI + rz], [0.72, 1, 0.22], `Thornwarden_Cloak_${index}`)
  })

  // Thorn/antler shoulder language and a brass warden brooch.
  addShoulderCap(bones.Chest, -1, m.leather, m.metal, s, b, 1.04, 'Thornwarden')
  addShoulderCap(bones.Chest, 1, m.clothDark, m.metalDark, s, b, 0.82, 'Thornwarden')
  for (const side of [-1, 1]) {
    add(bones.Chest, new THREE.CylinderGeometry(0.012, 0.017, 0.24 * s, 6), m.metal, [side * 0.22 * b, 0.08 * s, 0.02], [0.22, 0, side * 0.58], undefined, `Thornwarden_Thorn_${side}`)
  }
  add(bones.Chest, new THREE.TorusGeometry(0.052, 0.012, 6, 14), m.metal, [-0.12, 0.02, -0.14], [Math.PI / 2, 0, 0], undefined, 'Thornwarden_Brooch')

  // Quiver + arrows create the class silhouette even when the equipped bow is external Item Forge content.
  add(bones.Chest, new THREE.CylinderGeometry(0.075, 0.085, 0.48 * s, 10), m.leatherDark, [0.22 * b, -0.2 * s, 0.18], [0.08, 0, -0.22], undefined, 'Thornwarden_Quiver')
  for (let i = 0; i < 5; i += 1) {
    const x = 0.185 * b + (i % 3) * 0.026
    const z = 0.17 + (i % 2) * 0.02
    add(bones.Chest, new THREE.CylinderGeometry(0.006, 0.006, 0.55 * s, 5), m.metalDark, [x, 0.07 * s + i * 0.008, z], [0.06, 0, -0.18], undefined, `Thornwarden_Arrow_${i}`)
    add(bones.Chest, new THREE.ConeGeometry(0.024, 0.065, 4), m.accent, [x, 0.36 * s + i * 0.008, z], [0, 0, Math.PI], undefined, `Thornwarden_Fletching_${i}`)
  }

  addArmGuards(bones, m.leather, m.metal, s, 1.05)
  addBootGuards(bones, m.leatherDark, m.metal, s, 1.0)
  add(bones.Hips, new THREE.TorusGeometry(0.25 * b, 0.025, 6, 18), m.leatherDark, [0, 0.035, 0], [Math.PI / 2, 0, 0], [1.22, 0.9, 1], 'Thornwarden_Belt')
  add(bones.Hips, new THREE.BoxGeometry(0.16, 0.14, 0.085), m.leather, [-0.29 * b, -0.03, 0.08], undefined, undefined, 'Thornwarden_FieldPouch')
}

function buildVoidweaver(build: ForgeCharacterBuild, m: Palette, s: number, b: number) {
  const { bones } = build

  // Narrow armored scholar silhouette over long layered robes.
  add(bones.Chest, new THREE.BoxGeometry(0.38 * b, 0.42 * s, 0.19 * b), m.clothDark, [0, -0.11 * s, 0.01], undefined, undefined, 'Voidweaver_Core')
  add(bones.Chest, new THREE.BoxGeometry(0.27 * b, 0.29 * s, 0.215 * b), m.leatherDark, [0, -0.04 * s, -0.02], [0.02, 0, 0], undefined, 'Voidweaver_ArmoredVest')
  add(bones.Neck, new THREE.TorusGeometry(0.18 * b, 0.058, 8, 22), m.cloth, [0, 0, 0.005], [Math.PI / 2, 0, 0], [1.16, 0.92, 1], 'Voidweaver_Cowl')

  // Celestial chest geometry / rune ring.
  add(bones.Chest, new THREE.TorusGeometry(0.08, 0.012, 6, 18), m.metal, [0, -0.02 * s, -0.13], [Math.PI / 2, 0, 0], undefined, 'Voidweaver_ChestSigil')
  add(bones.Chest, new THREE.IcosahedronGeometry(0.027, 1), m.glow, [0, -0.02 * s, -0.145], undefined, undefined, 'Voidweaver_ChestGem')

  // Split robe avoids visually welding the legs together while keeping the concept-art length.
  const robePanels = [
    [-0.19, -0.35, -0.02, 0.18, 0.7, -0.03],
    [0, -0.38, -0.06, 0.17, 0.78, 0],
    [0.19, -0.35, -0.02, 0.18, 0.7, 0.03],
  ] as const
  robePanels.forEach(([x, y, z, w, h, rz], index) => {
    add(bones.Hips, new THREE.BoxGeometry(w * b, h * s, 0.035), index === 1 ? m.cloth : m.clothDark, [x * b, y * s, z], [0.02, 0, rz], undefined, `Voidweaver_Robe_${index}`)
  })
  for (const side of [-1, 1]) {
    add(bones.Hips, new THREE.BoxGeometry(0.085, 0.6 * s, 0.028), m.accent, [side * 0.12, -0.29 * s, -0.09], [0.02, 0, side * 0.04], undefined, `Voidweaver_RuneSash_${side}`)
  }

  // Structured shoulder pieces and engraved-looking bracers.
  addShoulderCap(bones.Chest, -1, m.clothDark, m.metal, s, b, 1.08, 'Voidweaver')
  addShoulderCap(bones.Chest, 1, m.clothDark, m.metal, s, b, 1.08, 'Voidweaver')
  addArmGuards(bones, m.leatherDark, m.metal, s, 1.0)
  addBootGuards(bones, m.clothDark, m.metalDark, s, 0.88)

  // Grimoire, talisman and a restrained floating void focus over the off-hand shoulder.
  add(bones.Hips, new THREE.BoxGeometry(0.19, 0.24, 0.065), m.leatherDark, [0.29 * b, -0.04, 0.06], [0.04, -0.08, -0.08], undefined, 'Voidweaver_Grimoire')
  add(bones.Hips, new THREE.TorusGeometry(0.05, 0.008, 6, 16), m.metal, [0.29 * b, -0.04, 0.022], [Math.PI / 2, 0, 0], undefined, 'Voidweaver_GrimoireSeal')
  add(bones.Hips, new THREE.IcosahedronGeometry(0.022, 1), m.glow, [0.29 * b, -0.04, -0.025], undefined, undefined, 'Voidweaver_GrimoireGem')

  const orbX = -0.34 * b
  add(bones.Chest, new THREE.IcosahedronGeometry(0.057, 2), m.glow, [orbX, 0.17 * s, 0.03], undefined, undefined, 'Voidweaver_VoidOrb')
  add(bones.Chest, new THREE.TorusGeometry(0.087, 0.008, 6, 22), m.metal, [orbX, 0.17 * s, 0.03], [1.1, 0.3, 0.1], undefined, 'Voidweaver_OrbRingA')
  add(bones.Chest, new THREE.TorusGeometry(0.105, 0.006, 6, 22), m.glow, [orbX, 0.17 * s, 0.03], [0.2, 1.1, 0.5], undefined, 'Voidweaver_OrbRingB')
  for (let i = 0; i < 3; i += 1) {
    const angle = i / 3 * Math.PI * 2
    add(bones.Chest, new THREE.TetrahedronGeometry(0.025, 0), m.metalDark, [orbX + Math.cos(angle) * 0.13, 0.17 * s + Math.sin(angle) * 0.07, 0.03 + Math.sin(angle) * 0.05], [angle, angle * 0.5, 0], undefined, `Voidweaver_OrbitShard_${i}`)
  }
}

function addShoulderCap(
  chest: THREE.Bone,
  side: -1 | 1,
  cloth: THREE.Material,
  metal: THREE.Material,
  s: number,
  b: number,
  size: number,
  prefix: string,
) {
  const x = side * 0.28 * b
  add(chest, new THREE.SphereGeometry(0.13 * size, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58), cloth, [x, 0.08 * s, 0.005], [0, 0, side * 0.16], [1.25, 0.72, 1.1], `${prefix}_ShoulderCloth_${side}`)
  add(chest, new THREE.BoxGeometry(0.16 * size, 0.055, 0.22 * size), metal, [x, 0.095 * s, -0.01], [0.02, side * 0.08, side * 0.13], undefined, `${prefix}_ShoulderPlate_${side}`)
}

function addArmGuards(
  bones: Record<string, THREE.Bone>,
  leather: THREE.Material,
  metal: THREE.Material,
  s: number,
  size: number,
) {
  for (const side of [-1, 1] as const) {
    const bone = side === 1 ? bones.LowerArm_R : bones.LowerArm_L
    const x = side * 0.17 * s
    add(bone, new THREE.CylinderGeometry(0.072 * size, 0.055 * size, 0.25 * s, 8), leather, [x, 0, 0], [0, 0, Math.PI / 2], undefined, `ForearmWrap_${side}`)
    add(bone, new THREE.BoxGeometry(0.18 * s, 0.018, 0.11 * size), metal, [x, -0.066, -0.01], [0, 0, 0], undefined, `ForearmPlate_${side}`)
  }
}

function addBootGuards(
  bones: Record<string, THREE.Bone>,
  cloth: THREE.Material,
  metal: THREE.Material,
  s: number,
  size: number,
) {
  for (const side of [-1, 1] as const) {
    const bone = side === 1 ? bones.LowerLeg_R : bones.LowerLeg_L
    add(bone, new THREE.CylinderGeometry(0.095 * size, 0.075 * size, 0.3 * s, 8), cloth, [0, -0.19 * s, 0], undefined, [1, 1, 0.9], `ShinWrap_${side}`)
    add(bone, new THREE.BoxGeometry(0.12 * size, 0.24 * s, 0.045), metal, [0, -0.18 * s, -0.08], [0.03, 0, 0], undefined, `ShinPlate_${side}`)
  }
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
