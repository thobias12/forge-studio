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

const BODY: Record<SkillboundStarterClass, Pick<ForgeCharacterConfig, 'height' | 'bulk' | 'shoulders' | 'headScale' | 'armLength' | 'legLength'>> = {
  duskstrider: { height: .97, bulk: .82, shoulders: .91, headScale: .98, armLength: .97, legLength: 1 },
  thornwarden: { height: .98, bulk: .79, shoulders: .89, headScale: .99, armLength: .99, legLength: 1.02 },
  voidweaver: { height: .98, bulk: .77, shoulders: .87, headScale: 1, armLength: .98, legLength: 1.01 },
}

export function createStarterClassCharacter(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): ForgeCharacterBuild {
  const styled = styledConfig(config, starterClass)
  const build = createProceduralCharacter(styled)
  stripOldVisuals(build.root)
  const palette = paletteFor(config, starterClass)

  buildSharedBody(build, palette, styled, starterClass)
  if (starterClass === 'duskstrider') duskstrider(build, palette)
  else if (starterClass === 'thornwarden') thornwarden(build, palette)
  else voidweaver(build, palette)

  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    version: 9,
    archetypeVersion: 9,
    starterClass,
    artStyle: 'compact-topdown-unified-hero-v4',
    visualRebuild: true,
    seamlessAssembly: true,
    headStyle: 'tapered-stylized-face-v2',
    weaponPolicy: 'external-item-forge',
    previewWeapon: false,
    mocapFacingYaw: Math.PI,
  }
  build.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
  })
  build.root.updateMatrixWorld(true)
  build.stats = recount(build)
  return build
}

function styledConfig(config: ForgeCharacterConfig, cls: SkillboundStarterClass): ForgeCharacterConfig {
  const p = BODY[cls]
  return {
    ...config,
    species: 'bandit', armor: 'none', headwear: 'none', weapon: 'none', asymmetry: 0,
    height: clamp(p.height + (config.height - 1) * .06, p.height - .02, p.height + .02),
    bulk: clamp(p.bulk + (config.bulk - 1) * .04, p.bulk - .02, p.bulk + .02),
    shoulders: clamp(p.shoulders + (config.shoulders - 1) * .04, p.shoulders - .02, p.shoulders + .02),
    headScale: clamp(p.headScale + (config.headScale - 1) * .04, p.headScale - .015, p.headScale + .015),
    armLength: clamp(p.armLength + (config.armLength - 1) * .06, p.armLength - .02, p.armLength + .02),
    legLength: clamp(p.legLength + (config.legLength - 1) * .06, p.legLength - .02, p.legLength + .02),
  }
}

function paletteFor(config: ForgeCharacterConfig, cls: SkillboundStarterClass): Palette {
  const skin = new THREE.Color(config.primary)
  const wantedCloth = new THREE.Color(config.secondary)
  const wantedAccent = new THREE.Color(config.accent)
  const d = cls === 'duskstrider'
    ? ['#314548','#203338','#5b493c','#72877e','#b68a55','#c7d9cf','#352920']
    : cls === 'thornwarden'
      ? ['#3b503f','#29392f','#594936','#68796c','#b39a62','#a9c896','#34291f']
      : ['#37304f','#26223b','#4a3d45','#756f86','#a88f68','#b4a6ff','#27212f']
  const cloth = new THREE.Color(d[0]).lerp(wantedCloth, .28)
  const clothDark = new THREE.Color(d[1]).lerp(cloth, .26)
  const leather = new THREE.Color(d[2]).lerp(wantedAccent, .24)
  const metal = new THREE.Color(d[3])
  const trim = new THREE.Color(d[4]).lerp(wantedAccent, .14)
  return {
    skin: mat(skin),
    hair: mat(new THREE.Color(d[6])),
    cloth: mat(cloth),
    clothDark: mat(clothDark),
    leather: mat(leather),
    leatherDark: mat(leather.clone().multiplyScalar(.62)),
    metal: mat(metal, .62, .25),
    metalDark: mat(metal.clone().multiplyScalar(.56), .75, .18),
    trim: mat(trim, .82),
    eye: new THREE.MeshStandardMaterial({ color: '#211b17', roughness: .9, metalness: 0, flatShading: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshStandardMaterial({ color: d[5], emissive: d[5], emissiveIntensity: cls === 'voidweaver' ? 1.55 : .5, roughness: .42, flatShading: true, side: THREE.DoubleSide }),
  }
}

function mat(color: THREE.Color | string, roughness = .98, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, side: THREE.DoubleSide })
}

function buildSharedBody(build: ForgeCharacterBuild, m: Palette, c: ForgeCharacterConfig, cls: SkillboundStarterClass) {
  const b = build.bones
  const h = c.height
  const upperArm = .355 * h * c.armLength
  const lowerArm = .325 * h * c.armLength
  const upperLeg = .41 * h * c.legLength
  const lowerLeg = .41 * h * c.legLength
  const shoulderX = .325 * c.shoulders * c.bulk
  const headR = .14 * h * c.headScale

  // New head: tapered jaw/cheeks, flatter face and lower placement so it seats into the collar.
  add(b.Head, stylizedHead(headR), m.skin, [0, .012, -.014], undefined, [1, 1, .84], 'Hero_Head')
  buildFace(b.Head, m, headR)
  if (cls === 'thornwarden') buildShortHair(b.Head, m, headR)

  // One continuous torso shell from belt line to collar. This replaces the stacked chest shells from v1.54.
  add(b.Spine, frustum(.35, .175, .285, .15, .48), m.cloth, [0, .19, -.002], undefined, undefined, 'Hero_TorsoShell')
  add(b.Hips, frustum(.285, .15, .305, .155, .22), m.clothDark, [0, .105, 0], undefined, undefined, 'Hero_WaistShell')
  add(b.Hips, new THREE.BoxGeometry(.31, .045, .175), m.leatherDark, [0, .145, 0], undefined, undefined, 'Hero_Belt')
  add(b.Hips, new THREE.BoxGeometry(.045, .055, .026), m.trim, [0, .145, -.101], undefined, undefined, 'Hero_Buckle')

  for (const s of [-1, 1] as const) {
    const upperArmBone = s < 0 ? b.UpperArm_L : b.UpperArm_R
    const lowerArmBone = s < 0 ? b.LowerArm_L : b.LowerArm_R
    const handBone = s < 0 ? b.Hand_L : b.Hand_R
    const upperLegBone = s < 0 ? b.UpperLeg_L : b.UpperLeg_R
    const lowerLegBone = s < 0 ? b.LowerLeg_L : b.LowerLeg_R
    const footBone = s < 0 ? b.Foot_L : b.Foot_R
    const rz = s < 0 ? Math.PI / 2 : -Math.PI / 2

    // Shoulder bridge deliberately overlaps both torso and sleeve, hiding the shoulder joint.
    add(b.Chest, new THREE.BoxGeometry(.15, .105, .17), m.cloth,
      [s * (shoulderX - .035), .038, -.002], [0, s * .04, s * -.08], undefined, `Hero_ShoulderBridge_${s}`)

    // Use the rig's exact limb lengths, plus a small overlap at elbows/wrists to remove floating seams.
    add(upperArmBone, new THREE.CylinderGeometry(.057, .069, upperArm * 1.055, 7), m.cloth,
      [s * upperArm * .5, -.009, 0], [0, 0, rz], undefined, `Hero_Sleeve_${s}`)
    add(lowerArmBone, new THREE.CylinderGeometry(.048, .059, lowerArm * 1.055, 7), m.clothDark,
      [s * lowerArm * .5, 0, 0], [0, 0, rz], undefined, `Hero_Forearm_${s}`)
    add(lowerArmBone, new THREE.CylinderGeometry(.061, .064, .09, 7), m.leather,
      [s * lowerArm * .84, 0, 0], [0, 0, rz], undefined, `Hero_Cuff_${s}`)
    add(handBone, new THREE.BoxGeometry(.095, .078, .082), m.leather,
      [s * .032, 0, 0], undefined, undefined, `Hero_Glove_${s}`)

    // Legs also use exact rig segment lengths so thighs/shins meet instead of hovering apart.
    add(upperLegBone, new THREE.CylinderGeometry(.069, .083, upperLeg * 1.045, 7), m.clothDark,
      [0, -upperLeg * .5, .012], undefined, [.98, 1, .93], `Hero_Thigh_${s}`)
    add(lowerLegBone, new THREE.CylinderGeometry(.058, .069, lowerLeg * 1.04, 7), m.clothDark,
      [0, -lowerLeg * .5, .03], undefined, [.98, 1, .93], `Hero_Shin_${s}`)
    add(lowerLegBone, frustum(.115, .135, .125, .145, lowerLeg * .62), m.leather,
      [0, -lowerLeg * .67, .035], undefined, undefined, `Hero_BootShaft_${s}`)
    add(footBone, frustum(.125, .215, .115, .18, .11), m.leatherDark,
      [0, -.025, -.075], [-.055, 0, 0], undefined, `Hero_Boot_${s}`)
  }
}

function buildFace(head: THREE.Bone, m: Palette, r: number) {
  const front = -r * .88
  for (const s of [-1, 1] as const) {
    add(head, new THREE.BoxGeometry(r * .19, r * .095, r * .055), m.eye,
      [s * r * .34, r * .12, front], undefined, undefined, `Hero_Eye_${s}`)
  }
  add(head, new THREE.BoxGeometry(r * .085, r * .12, r * .055), m.skin,
    [0, -r * .05, front - r * .015], [0, 0, .04], undefined, 'Hero_Nose')
}

function buildShortHair(head: THREE.Bone, m: Palette, r: number) {
  add(head, frustum(r * 1.28, r * 1.08, r * 1.52, r * 1.28, r * .42), m.hair,
    [0, r * .68, r * .05], [0, 0, -.015], undefined, 'Hero_HairCrown')
  add(head, new THREE.BoxGeometry(r * 1.2, r * .22, r * .12), m.hair,
    [0, r * .49, -r * .78], [0, 0, -.06], undefined, 'Hero_HairFringe')
}

function duskstrider(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  // Hood is now a frame around the new head instead of another sphere layered over it.
  add(b.Neck, frustum(.255, .18, .29, .205, .105), m.clothDark, [0, .002, .018], undefined, undefined, 'Dusk_Cowl')
  add(b.Head, frustum(.19, .155, .235, .19, .075), m.clothDark, [0, .115, .018], undefined, undefined, 'Dusk_HoodTop')
  for (const s of [-1, 1] as const) {
    add(b.Head, new THREE.BoxGeometry(.036, .18, .16), m.clothDark,
      [s * .116, .018, .016], [0, s * .05, s * -.04], undefined, `Dusk_HoodSide_${s}`)
  }
  add(b.Chest, frustum(.15, .14, .11, .115, .06), m.metal, [-.205, .06, -.008], [.02, .08, -.06], undefined, 'Dusk_ShoulderPlate')
  add(b.Spine, new THREE.BoxGeometry(.035, .31, .02), m.leather, [-.05, .17, -.095], [0, 0, .38], undefined, 'Dusk_Strap')
  cape(b.Chest, m.clothDark, m.trim, .47, .31, 'Dusk')
  add(b.Hips, new THREE.BoxGeometry(.07, .09, .045), m.leatherDark, [.145, .055, .02], [0, .08, -.04], undefined, 'Dusk_Pouch')
}

function thornwarden(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  add(b.Neck, frustum(.245, .165, .285, .19, .095), m.clothDark, [0, -.002, .018], undefined, undefined, 'Thorn_Mantle')
  cape(b.Chest, m.clothDark, m.cloth, .36, .285, 'Thorn')
  // Chest overlay is clearly offset from the torso surface to prevent z-fighting or "invisible" patches.
  add(b.Spine, frustum(.235, .018, .215, .018, .22), m.leather, [0, .19, -.103], [.015, 0, 0], undefined, 'Thorn_ChestPanel')
  add(b.Spine, new THREE.BoxGeometry(.032, .29, .018), m.leatherDark, [.04, .19, -.116], [0, 0, -.29], undefined, 'Thorn_Strap')
  add(b.Chest, new THREE.CylinderGeometry(.043, .052, .34, 7), m.leatherDark, [.135, -.13, .145], [.04, 0, -.24], undefined, 'Thorn_Quiver')
  for (let i = 0; i < 3; i += 1) {
    add(b.Chest, new THREE.CylinderGeometry(.004, .004, .39, 5), m.metalDark, [.115 + i * .019, .065 + i * .004, .15], [.04, 0, -.24], undefined, `Thorn_Arrow_${i}`)
    add(b.Chest, new THREE.ConeGeometry(.013, .04, 4), m.trim, [.19 + i * .019, .225 + i * .004, .15], [.04, 0, -.24], undefined, `Thorn_Fletching_${i}`)
  }
}

function voidweaver(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  add(b.Neck, frustum(.25, .18, .29, .205, .115), m.clothDark, [0, .002, .018], undefined, undefined, 'Void_Cowl')
  add(b.Head, frustum(.195, .16, .24, .195, .08), m.clothDark, [0, .115, .02], undefined, undefined, 'Void_HoodTop')
  for (const s of [-1, 1] as const) {
    add(b.Head, new THREE.BoxGeometry(.038, .19, .165), m.clothDark,
      [s * .118, .015, .02], [0, s * .045, s * -.035], undefined, `Void_HoodSide_${s}`)
  }
  add(b.Hips, frustum(.29, .15, .385, .175, .36), m.cloth, [0, -.105, .01], [.015, 0, 0], undefined, 'Void_RobeSkirt')
  add(b.Hips, frustum(.108, .045, .128, .04, .42), m.clothDark, [-.075, -.31, -.095], [.03, 0, -.02], undefined, 'Void_Robe_L')
  add(b.Hips, frustum(.108, .045, .128, .04, .42), m.clothDark, [.075, -.31, -.095], [.03, 0, .02], undefined, 'Void_Robe_R')
  add(b.Spine, new THREE.BoxGeometry(.032, .22, .018), m.trim, [0, .19, -.105], undefined, undefined, 'Void_RuneStripe')
  add(b.Chest, new THREE.OctahedronGeometry(.026, 0), m.glow, [0, -.012, -.128], undefined, undefined, 'Void_RuneGem')
  add(b.Hips, new THREE.BoxGeometry(.095, .12, .034), m.leatherDark, [.14, .04, .055], [.02, -.08, -.04], undefined, 'Void_Grimoire')
}

function cape(chest: THREE.Bone, dark: THREE.Material, light: THREE.Material, height: number, width: number, prefix: string) {
  const y = .045 - height / 2
  const z = .112
  add(chest, frustum(width * .47, .028, width * .53, .032, height), dark, [-width * .13, y, z], [.045, .02, -.02], undefined, `${prefix}_Cape_L`)
  add(chest, frustum(width * .47, .028, width * .53, .032, height * .96), light, [width * .13, y + .01, z + .002], [.045, -.02, .02], undefined, `${prefix}_Cape_R`)
  add(chest, new THREE.BoxGeometry(width * .92, .045, .045), dark, [0, .032, z - .008], undefined, undefined, `${prefix}_CapeCollar`)
}

function stylizedHead(r: number) {
  const points = [
    new THREE.Vector2(0, -r * .78),
    new THREE.Vector2(r * .55, -r * .75),
    new THREE.Vector2(r * .9, -r * .45),
    new THREE.Vector2(r, r * .02),
    new THREE.Vector2(r * .92, r * .52),
    new THREE.Vector2(r * .7, r * .86),
    new THREE.Vector2(0, r * .96),
  ]
  const geometry = new THREE.LatheGeometry(points, 8)
  geometry.computeVertexNormals()
  return geometry
}

function stripOldVisuals(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o) })
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
  name = 'Part',
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  parent.add(mesh)
  return mesh
}

function frustum(topW: number, topD: number, bottomW: number, bottomD: number, height: number) {
  const y0 = -height / 2
  const y1 = height / 2
  const v = new Float32Array([
    -bottomW / 2, y0, -bottomD / 2, bottomW / 2, y0, -bottomD / 2, bottomW / 2, y0, bottomD / 2, -bottomW / 2, y0, bottomD / 2,
    -topW / 2, y1, -topD / 2, topW / 2, y1, -topD / 2, topW / 2, y1, topD / 2, -topW / 2, y1, topD / 2,
  ])
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(v, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function recount(build: ForgeCharacterBuild) {
  let skinnedMeshes = 0
  let triangles = 0
  build.root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes += 1
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3
  })
  return { bones: build.skeleton.bones.length, skinnedMeshes, triangles: Math.round(triangles) }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
