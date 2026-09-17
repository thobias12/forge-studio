import * as THREE from 'three'
import {
  createProceduralCharacter,
  type ForgeCharacterBuild,
  type ForgeCharacterConfig,
} from '../lib/proceduralCharacter'

export type SkillboundStarterClass = 'duskstrider' | 'thornwarden' | 'voidweaver'

type Palette = {
  skin: THREE.MeshStandardMaterial
  hair: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  clothDark: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
  leatherDark: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  trim: THREE.MeshStandardMaterial
  eye: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
}

type BodyPreset = Pick<ForgeCharacterConfig, 'height' | 'bulk' | 'shoulders' | 'headScale' | 'armLength' | 'legLength'>
type Axis = 'x' | 'y' | 'z'
type Station = { at: number; a: number; b: number; o1?: number; o2?: number }

const BODY: Record<SkillboundStarterClass, BodyPreset> = {
  duskstrider: { height: .98, bulk: .79, shoulders: .86, headScale: .99, armLength: .94, legLength: 1 },
  thornwarden: { height: .99, bulk: .78, shoulders: .85, headScale: 1, armLength: .95, legLength: 1.02 },
  voidweaver: { height: .99, bulk: .76, shoulders: .83, headScale: 1.01, armLength: .94, legLength: 1.01 },
}

export function createProceduralStarterHumanoidV2(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): ForgeCharacterBuild {
  const styled = styledConfig(config, starterClass)
  const build = createProceduralCharacter(styled)
  stripOldVisuals(build.root)
  const palette = paletteFor(config, starterClass)

  buildBaseBody(build, palette, styled, starterClass)
  if (starterClass === 'duskstrider') buildDuskstrider(build, palette)
  else if (starterClass === 'thornwarden') buildThornwarden(build, palette)
  else buildVoidweaver(build, palette)

  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    version: 11,
    archetypeVersion: 11,
    starterClass,
    artStyle: 'evergrow-procedural-humanoid-v2',
    generatorId: 'ProceduralHumanoidV2',
    generatorVersion: 1,
    recipe: starterClass,
    generatedFromCode: true,
    visualRebuild: true,
    seamlessAssembly: true,
    headStyle: 'profile-loft-head-v1',
    bodyStyle: 'profile-loft-humanoid-v1',
    weaponPolicy: 'external-item-forge',
    previewWeapon: false,
    mocapFacingYaw: Math.PI,
  }

  build.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    // The previous low-poly starter models received their own shadow map and produced
    // moving hatch-like artifacts on back-facing polygons. Keep casting world shadows,
    // but do not self-receive them on these generated hero meshes.
    object.receiveShadow = false
    object.frustumCulled = false
  })
  build.root.updateMatrixWorld(true)
  build.stats = recount(build)
  return build
}

function styledConfig(config: ForgeCharacterConfig, cls: SkillboundStarterClass): ForgeCharacterConfig {
  const p = BODY[cls]
  return {
    ...config,
    species: 'bandit',
    armor: 'none',
    headwear: 'none',
    weapon: 'none',
    asymmetry: 0,
    height: clamp(p.height + (config.height - 1) * .05, p.height - .015, p.height + .015),
    bulk: clamp(p.bulk + (config.bulk - 1) * .035, p.bulk - .015, p.bulk + .015),
    shoulders: clamp(p.shoulders + (config.shoulders - 1) * .035, p.shoulders - .015, p.shoulders + .015),
    headScale: clamp(p.headScale + (config.headScale - 1) * .035, p.headScale - .012, p.headScale + .012),
    armLength: clamp(p.armLength + (config.armLength - 1) * .045, p.armLength - .015, p.armLength + .015),
    legLength: clamp(p.legLength + (config.legLength - 1) * .045, p.legLength - .015, p.legLength + .015),
  }
}

function paletteFor(config: ForgeCharacterConfig, cls: SkillboundStarterClass): Palette {
  const skin = new THREE.Color(config.primary)
  const wantedCloth = new THREE.Color(config.secondary)
  const wantedAccent = new THREE.Color(config.accent)
  const d = cls === 'duskstrider'
    ? ['#314548', '#203338', '#5b493c', '#72877e', '#b68a55', '#c7d9cf', '#352920']
    : cls === 'thornwarden'
      ? ['#3b503f', '#29392f', '#594936', '#68796c', '#b39a62', '#a9c896', '#34291f']
      : ['#37304f', '#26223b', '#4a3d45', '#756f86', '#a88f68', '#b4a6ff', '#27212f']
  const cloth = new THREE.Color(d[0]).lerp(wantedCloth, .28)
  const clothDark = new THREE.Color(d[1]).lerp(cloth, .24)
  const leather = new THREE.Color(d[2]).lerp(wantedAccent, .22)
  const metal = new THREE.Color(d[3])
  const trim = new THREE.Color(d[4]).lerp(wantedAccent, .12)
  return {
    skin: mat(skin),
    hair: mat(new THREE.Color(d[6])),
    cloth: mat(cloth),
    clothDark: mat(clothDark),
    leather: mat(leather),
    leatherDark: mat(leather.clone().multiplyScalar(.62)),
    metal: mat(metal, .62, .25),
    metalDark: mat(metal.clone().multiplyScalar(.56), .76, .18),
    trim: mat(trim, .84),
    eye: mat('#191412', .94),
    glow: new THREE.MeshStandardMaterial({
      color: d[5], emissive: d[5], emissiveIntensity: cls === 'voidweaver' ? 1.5 : .45,
      roughness: .44, metalness: 0, flatShading: true, side: THREE.FrontSide,
    }),
  }
}

function mat(color: THREE.Color | string, roughness = .98, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, side: THREE.FrontSide })
}

function buildBaseBody(build: ForgeCharacterBuild, m: Palette, c: ForgeCharacterConfig, cls: SkillboundStarterClass) {
  const b = build.bones
  const h = c.height
  const upperArm = .355 * h * c.armLength
  const lowerArm = .325 * h * c.armLength
  const upperLeg = .41 * h * c.legLength
  const lowerLeg = .41 * h * c.legLength
  const shoulderRoot = .325 * c.shoulders * c.bulk
  const headR = .14 * h * c.headScale
  const bodyScale = c.bulk / .79

  // Pelvis -> abdomen -> chest is built as three fitted generated profiles around the
  // three rig sections. There are no flat shoulder blocks and no coplanar shells.
  addGenerated(b.Hips, loft('y', [
    { at: -.045, a: .135 * bodyScale, b: .073 * bodyScale },
    { at: .045, a: .154 * bodyScale, b: .082 * bodyScale },
    { at: .155, a: .143 * bodyScale, b: .076 * bodyScale },
  ], 8), m.clothDark, 'V2_Pelvis')

  addGenerated(b.Spine, loft('y', [
    { at: -.035, a: .137 * bodyScale, b: .074 * bodyScale },
    { at: .085, a: .148 * bodyScale, b: .078 * bodyScale },
    { at: .205, a: .165 * bodyScale, b: .083 * bodyScale },
    { at: .255, a: .171 * bodyScale, b: .084 * bodyScale },
  ], 8), m.cloth, 'V2_Abdomen')

  const chestHalf = Math.max(.175, shoulderRoot * .78)
  addGenerated(b.Chest, loft('y', [
    { at: -.095, a: .162 * bodyScale, b: .083 * bodyScale },
    { at: -.015, a: chestHalf, b: .088 * bodyScale },
    { at: .065, a: chestHalf * .96, b: .086 * bodyScale },
    { at: .135, a: .132 * bodyScale, b: .072 * bodyScale },
  ], 8), m.cloth, 'V2_Chest')

  addGenerated(b.Neck, loft('y', [
    { at: -.035, a: .055, b: .05 },
    { at: .07, a: .051, b: .047 },
  ], 8), m.skin, 'V2_Neck')

  buildHead(b.Head, m, headR, cls)

  // Belt is a generated closed band outside the pelvis profile.
  addGenerated(b.Hips, loft('y', [
    { at: .115, a: .158 * bodyScale, b: .086 * bodyScale },
    { at: .153, a: .159 * bodyScale, b: .087 * bodyScale },
  ], 8), m.leatherDark, 'V2_Belt')
  addGenerated(b.Hips, panelPrism(.045, .05, .018, .038, .05), m.trim, 'V2_Buckle', [0, .134, -.096 * bodyScale])

  for (const s of [-1, 1] as const) {
    const upperArmBone = s < 0 ? b.UpperArm_L : b.UpperArm_R
    const lowerArmBone = s < 0 ? b.LowerArm_L : b.LowerArm_R
    const handBone = s < 0 ? b.Hand_L : b.Hand_R
    const upperLegBone = s < 0 ? b.UpperLeg_L : b.UpperLeg_R
    const lowerLegBone = s < 0 ? b.LowerLeg_L : b.LowerLeg_R
    const footBone = s < 0 ? b.Foot_L : b.Foot_R

    buildArm(upperArmBone, lowerArmBone, handBone, m, upperArm, lowerArm, s)
    buildLeg(upperLegBone, lowerLegBone, footBone, m, upperLeg, lowerLeg, s)
  }
}

function buildHead(head: THREE.Bone, m: Palette, r: number, cls: SkillboundStarterClass) {
  addGenerated(head, loft('y', [
    { at: -r * .74, a: r * .54, b: r * .46, o2: -.014 },
    { at: -r * .48, a: r * .78, b: r * .67, o2: -.01 },
    { at: -r * .05, a: r * .94, b: r * .78 },
    { at: r * .5, a: r, b: r * .82, o2: .012 },
    { at: r * .84, a: r * .77, b: r * .69, o2: .018 },
    { at: r * .94, a: r * .42, b: r * .42, o2: .018 },
  ], 8), m.skin, 'V2_Head', [0, .01, -.004])

  const front = -r * .80
  for (const s of [-1, 1] as const) {
    addGenerated(head, panelPrism(r * .17, r * .075, r * .035, r * .16, r * .07), m.eye,
      `V2_Eye_${s}`, [s * r * .34, r * .12, front])
  }
  addGenerated(head, wedgeNose(r), m.skin, 'V2_Nose', [0, -r * .04, front - r * .015])

  if (cls === 'thornwarden') {
    addGenerated(head, loft('y', [
      { at: r * .45, a: r * .95, b: r * .77 },
      { at: r * .72, a: r * 1.02, b: r * .82, o2: .025 },
      { at: r * .96, a: r * .58, b: r * .57, o2: .02 },
    ], 8), m.hair, 'V2_HairCrown')
    addGenerated(head, panelPrism(r * 1.06, r * .16, r * .045, r * .94, r * .14), m.hair,
      'V2_HairFringe', [0, r * .46, -r * .73], [-.08, 0, 0])
  }
}

function buildArm(
  upper: THREE.Bone,
  lower: THREE.Bone,
  hand: THREE.Bone,
  m: Palette,
  upperLength: number,
  lowerLength: number,
  side: -1 | 1,
) {
  const upperStations: Station[] = side < 0
    ? [
        { at: -upperLength * 1.025, a: .052, b: .047 },
        { at: -upperLength * .62, a: .059, b: .052 },
        { at: -upperLength * .12, a: .068, b: .058 },
        { at: .018, a: .074, b: .061 },
      ]
    : [
        { at: -.018, a: .074, b: .061 },
        { at: upperLength * .12, a: .068, b: .058 },
        { at: upperLength * .62, a: .059, b: .052 },
        { at: upperLength * 1.025, a: .052, b: .047 },
      ]
  addGenerated(upper, loft('x', upperStations, 7), m.cloth, `V2_UpperArm_${side}`)

  const lowerStations: Station[] = side < 0
    ? [
        { at: -lowerLength * 1.025, a: .041, b: .038 },
        { at: -lowerLength * .58, a: .05, b: .044 },
        { at: -.018, a: .057, b: .049 },
      ]
    : [
        { at: .018, a: .057, b: .049 },
        { at: lowerLength * .58, a: .05, b: .044 },
        { at: lowerLength * 1.025, a: .041, b: .038 },
      ]
  addGenerated(lower, loft('x', lowerStations, 7), m.clothDark, `V2_Forearm_${side}`)

  const cuffStart = lowerLength * .72
  const cuffEnd = lowerLength * 1.015
  const cuffStations: Station[] = side < 0
    ? [
        { at: -cuffEnd, a: .049, b: .045 },
        { at: -cuffStart, a: .058, b: .051 },
      ]
    : [
        { at: cuffStart, a: .058, b: .051 },
        { at: cuffEnd, a: .049, b: .045 },
      ]
  addGenerated(lower, loft('x', cuffStations, 7), m.leather, `V2_ArmCuff_${side}`)

  const handStations: Station[] = side < 0
    ? [
        { at: -.105, a: .034, b: .035 },
        { at: -.035, a: .042, b: .039 },
        { at: .012, a: .039, b: .038 },
      ]
    : [
        { at: -.012, a: .039, b: .038 },
        { at: .035, a: .042, b: .039 },
        { at: .105, a: .034, b: .035 },
      ]
  addGenerated(hand, loft('x', handStations, 6), m.leatherDark, `V2_Glove_${side}`)
}

function buildLeg(
  upper: THREE.Bone,
  lower: THREE.Bone,
  foot: THREE.Bone,
  m: Palette,
  upperLength: number,
  lowerLength: number,
  side: -1 | 1,
) {
  addGenerated(upper, loft('y', [
    { at: -upperLength * 1.025, a: .061, b: .052, o2: .008 },
    { at: -upperLength * .62, a: .071, b: .059, o2: .008 },
    { at: -upperLength * .1, a: .081, b: .066, o2: .004 },
    { at: .018, a: .084, b: .068 },
  ], 7), m.clothDark, `V2_Thigh_${side}`)

  addGenerated(lower, loft('y', [
    { at: -lowerLength * 1.03, a: .045, b: .038, o2: .008 },
    { at: -lowerLength * .72, a: .057, b: .046, o2: .006 },
    { at: -lowerLength * .48, a: .064, b: .05, o2: .002 },
    { at: -lowerLength * .12, a: .058, b: .047 },
    { at: .018, a: .06, b: .049 },
  ], 7), m.clothDark, `V2_Shin_${side}`)

  // Boot is generated as an outer fitted profile, not a second cuboid leg.
  addGenerated(lower, loft('y', [
    { at: -lowerLength * 1.035, a: .053, b: .044, o2: .008 },
    { at: -lowerLength * .8, a: .057, b: .047, o2: .005 },
    { at: -lowerLength * .58, a: .059, b: .049 },
    { at: -lowerLength * .535, a: .061, b: .05 },
  ], 7), m.leather, `V2_BootShaft_${side}`)
  addGenerated(lower, loft('y', [
    { at: -lowerLength * .59, a: .064, b: .053 },
    { at: -lowerLength * .505, a: .064, b: .053 },
  ], 7), m.leatherDark, `V2_BootCuff_${side}`)

  addGenerated(foot, loft('z', [
    { at: -.162, a: .048, b: .023, o2: -.029 },
    { at: -.09, a: .054, b: .03, o2: -.022 },
    { at: -.015, a: .052, b: .035, o2: -.014 },
    { at: .055, a: .045, b: .031, o2: -.015 },
  ], 7), m.leatherDark, `V2_BootFoot_${side}`)
  addGenerated(foot, footSole(.108, .205, .016), m.leatherDark, `V2_BootSole_${side}`, [0, -.052, -.052])
}

function buildDuskstrider(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  addGenerated(b.Neck, loft('y', [
    { at: -.055, a: .118, b: .085 },
    { at: .025, a: .135, b: .096 },
    { at: .07, a: .112, b: .084 },
  ], 8), m.clothDark, 'Dusk_Cowl')
  addGenerated(b.Head, hoodShell(.142, .27), m.clothDark, 'Dusk_Hood', [0, .035, .012])
  addGenerated(b.Head, hoodCrown(.142), m.clothDark, 'Dusk_HoodCrown', [0, .145, .014])

  addGenerated(b.UpperArm_L, loft('x', [
    { at: -.11, a: .077, b: .066 },
    { at: -.015, a: .085, b: .07 },
  ], 7), m.metal, 'Dusk_ShoulderGuard_L')
  addGenerated(b.Spine, strapPrism(.035, .33, .016), m.leather, 'Dusk_ChestStrap', [-.045, .16, -.091], [0, 0, .34])
  addGenerated(b.Chest, capePanel(.34, .45, .018, .92), m.clothDark, 'Dusk_Cape', [0, -.19, .104], [.04, 0, 0])
  addGenerated(b.Hips, panelPrism(.064, .082, .035, .057, .075), m.leatherDark, 'Dusk_Pouch', [.13, .045, .035], [0, .08, -.04])
}

function buildThornwarden(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  addGenerated(b.Neck, loft('y', [
    { at: -.045, a: .112, b: .08 },
    { at: .025, a: .132, b: .094 },
    { at: .065, a: .105, b: .078 },
  ], 8), m.clothDark, 'Thorn_Mantle')
  addGenerated(b.Chest, capePanel(.30, .34, .016, .9), m.clothDark, 'Thorn_Cape', [0, -.14, .104], [.035, 0, 0])
  addGenerated(b.Spine, panelPrism(.225, .225, .018, .205, .21), m.leather, 'Thorn_ChestPanel', [0, .17, -.096], [.015, 0, 0])
  addGenerated(b.Spine, strapPrism(.03, .29, .014), m.leatherDark, 'Thorn_Strap', [.038, .17, -.109], [0, 0, -.27])

  addGenerated(b.Chest, loft('y', [
    { at: -.29, a: .042, b: .039 },
    { at: .04, a: .05, b: .044 },
  ], 7), m.leatherDark, 'Thorn_Quiver', [.135, -.08, .145], [.04, 0, -.22])
  for (let i = 0; i < 3; i += 1) {
    addGenerated(b.Chest, loft('y', [
      { at: -.12, a: .004, b: .004 },
      { at: .25, a: .004, b: .004 },
    ], 5), m.metalDark, `Thorn_Arrow_${i}`, [.11 + i * .018, .02, .15], [.04, 0, -.22])
  }
}

function buildVoidweaver(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  addGenerated(b.Neck, loft('y', [
    { at: -.055, a: .118, b: .085 },
    { at: .025, a: .137, b: .098 },
    { at: .075, a: .113, b: .084 },
  ], 8), m.clothDark, 'Void_Cowl')
  addGenerated(b.Head, hoodShell(.145, .28), m.clothDark, 'Void_Hood', [0, .036, .012])
  addGenerated(b.Head, hoodCrown(.145), m.clothDark, 'Void_HoodCrown', [0, .148, .014])

  // One continuous robe profile replaces the overlapping skirt/panel stack.
  addGenerated(b.Hips, loft('y', [
    { at: -.47, a: .185, b: .092, o2: .01 },
    { at: -.28, a: .174, b: .088, o2: .008 },
    { at: -.08, a: .158, b: .082, o2: .004 },
    { at: .08, a: .145, b: .078 },
  ], 8), m.cloth, 'Void_Robe')
  addGenerated(b.Spine, strapPrism(.031, .23, .014), m.trim, 'Void_RuneStripe', [0, .18, -.101])
  addGenerated(b.Chest, new THREE.OctahedronGeometry(.026, 0), m.glow, 'Void_RuneGem', [0, -.01, -.112])
  addGenerated(b.Hips, panelPrism(.09, .115, .03, .083, .108), m.leatherDark, 'Void_Grimoire', [.135, .03, .055], [.02, -.08, -.04])
}

function loft(axis: Axis, stations: Station[], sides = 8) {
  const ordered = [...stations].sort((a, b) => a.at - b.at)
  const vertices: number[] = []
  const indices: number[] = []

  for (const station of ordered) {
    for (let side = 0; side < sides; side += 1) {
      const angle = side / sides * Math.PI * 2
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      const o1 = station.o1 ?? 0
      const o2 = station.o2 ?? 0
      if (axis === 'x') vertices.push(station.at, o1 + c * station.a, o2 + s * station.b)
      else if (axis === 'y') vertices.push(o1 + c * station.a, station.at, o2 + s * station.b)
      else vertices.push(o1 + c * station.a, o2 + s * station.b, station.at)
    }
  }

  for (let ring = 0; ring < ordered.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides
      const a = ring * sides + side
      const b = ring * sides + next
      const c = (ring + 1) * sides + next
      const d = (ring + 1) * sides + side
      indices.push(a, b, c, a, c, d)
    }
  }

  const startCenter = vertices.length / 3
  const start = ordered[0]
  pushAxisPoint(vertices, axis, start.at, start.o1 ?? 0, start.o2 ?? 0)
  const endCenter = vertices.length / 3
  const end = ordered[ordered.length - 1]
  pushAxisPoint(vertices, axis, end.at, end.o1 ?? 0, end.o2 ?? 0)
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides
    indices.push(startCenter, next, side)
    const base = (ordered.length - 1) * sides
    indices.push(endCenter, base + side, base + next)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function pushAxisPoint(vertices: number[], axis: Axis, at: number, o1: number, o2: number) {
  if (axis === 'x') vertices.push(at, o1, o2)
  else if (axis === 'y') vertices.push(o1, at, o2)
  else vertices.push(o1, o2, at)
}

function footSole(width: number, length: number, height: number) {
  const heelZ = length * .27
  const toeZ = -length * .73
  const hwHeel = width * .42
  const hwToe = width * .5
  const y0 = -height / 2
  const y1 = height / 2
  const v = new Float32Array([
    -hwToe, y0, toeZ, hwToe, y0, toeZ, hwHeel, y0, heelZ, -hwHeel, y0, heelZ,
    -hwToe, y1, toeZ, hwToe, y1, toeZ, hwHeel, y1, heelZ, -hwHeel, y1, heelZ,
  ])
  return indexedGeometry(v, [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
}

function panelPrism(width: number, height: number, depth: number, bottomWidth = width, bottomHeight = height) {
  const topY = height / 2
  const bottomY = -bottomHeight / 2
  const z0 = -depth / 2
  const z1 = depth / 2
  const tw = width / 2
  const bw = bottomWidth / 2
  const v = new Float32Array([
    -bw, bottomY, z0, bw, bottomY, z0, tw, topY, z0, -tw, topY, z0,
    -bw, bottomY, z1, bw, bottomY, z1, tw, topY, z1, -tw, topY, z1,
  ])
  return indexedGeometry(v, [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0])
}

function strapPrism(width: number, height: number, depth: number) {
  return panelPrism(width, height, depth, width * .92, height)
}

function wedgeNose(r: number) {
  const w = r * .08
  const h = r * .11
  const d = r * .08
  const v = new Float32Array([
    -w, -h, 0, w, -h, 0, w * .7, h, 0, -w * .7, h, 0,
    0, -h * .65, -d, 0, h * .55, -d * .76,
  ])
  return indexedGeometry(v, [0, 1, 4, 1, 2, 4, 2, 5, 4, 2, 3, 5, 3, 0, 5, 0, 4, 5, 0, 3, 2, 0, 2, 1])
}

function capePanel(width: number, height: number, depth: number, bottomScale: number) {
  const topW = width * .78
  const bottomW = width * bottomScale
  const yTop = height * .12
  const yBottom = -height * .88
  const z0 = -depth / 2
  const z1 = depth / 2
  const v = new Float32Array([
    -bottomW / 2, yBottom, z0, bottomW / 2, yBottom, z0, topW / 2, yTop, z0, -topW / 2, yTop, z0,
    -bottomW / 2, yBottom, z1, bottomW / 2, yBottom, z1, topW / 2, yTop, z1, -topW / 2, yTop, z1,
  ])
  return indexedGeometry(v, [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0])
}

function hoodShell(r: number, height: number) {
  const segments = 9
  const start = -Math.PI / 4
  const end = Math.PI * 5 / 4
  const rings = [
    { y: -height * .35, w: r * 1.08, d: r * .96 },
    { y: height * .05, w: r * 1.16, d: r * 1.04 },
    { y: height * .38, w: r * .92, d: r * .9 },
  ]
  const vertices: number[] = []
  const indices: number[] = []
  const perRing = segments + 1
  const layers = 2

  for (let layer = 0; layer < layers; layer += 1) {
    const inset = layer === 0 ? 0 : .018
    for (const ring of rings) {
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments
        const angle = THREE.MathUtils.lerp(start, end, t)
        vertices.push(
          Math.cos(angle) * Math.max(.01, ring.w - inset),
          ring.y,
          Math.sin(angle) * Math.max(.01, ring.d - inset),
        )
      }
    }
  }

  const layerSize = rings.length * perRing
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = ring * perRing + i
      const b = a + 1
      const c = (ring + 1) * perRing + i + 1
      const d = c - 1
      indices.push(a, b, c, a, c, d)

      const ia = layerSize + a
      const ib = layerSize + b
      const ic = layerSize + c
      const id = layerSize + d
      indices.push(ia, ic, ib, ia, id, ic)
    }
  }

  for (let ring = 0; ring < rings.length; ring += 1) {
    const outerA = ring * perRing
    const outerB = ring * perRing + segments
    const innerA = layerSize + outerA
    const innerB = layerSize + outerB
    if (ring < rings.length - 1) {
      const outerANext = (ring + 1) * perRing
      const outerBNext = (ring + 1) * perRing + segments
      const innerANext = layerSize + outerANext
      const innerBNext = layerSize + outerBNext
      indices.push(outerA, outerANext, innerANext, outerA, innerANext, innerA)
      indices.push(outerB, innerBNext, outerBNext, outerB, innerB, innerBNext)
    }
  }

  for (let i = 0; i < segments; i += 1) {
    const outerBottom = i
    const outerBottomNext = i + 1
    const innerBottom = layerSize + i
    const innerBottomNext = layerSize + i + 1
    indices.push(outerBottom, innerBottomNext, outerBottomNext, outerBottom, innerBottom, innerBottomNext)

    const topBase = (rings.length - 1) * perRing
    const outerTop = topBase + i
    const outerTopNext = topBase + i + 1
    const innerTop = layerSize + outerTop
    const innerTopNext = layerSize + outerTopNext
    indices.push(outerTop, outerTopNext, innerTopNext, outerTop, innerTopNext, innerTop)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function hoodCrown(r: number) {
  return loft('y', [
    { at: -.018, a: r * .91, b: r * .88 },
    { at: .055, a: r * .72, b: r * .72, o2: .008 },
  ], 8)
}

function indexedGeometry(vertices: Float32Array, indices: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addGenerated(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  parent.add(mesh)
  return mesh
}

function stripOldVisuals(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object) })
  const materials = new Set<THREE.Material>()
  meshes.forEach((mesh) => {
    mesh.removeFromParent()
    mesh.geometry?.dispose()
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    list.forEach((material) => { if (material) materials.add(material) })
  })
  materials.forEach((material) => material.dispose())
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
