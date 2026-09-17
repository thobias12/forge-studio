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
  duskstrider: { height: .97, bulk: .82, shoulders: .91, headScale: 1.02, armLength: .97, legLength: 1 },
  thornwarden: { height: .98, bulk: .79, shoulders: .89, headScale: 1.03, armLength: .99, legLength: 1.02 },
  voidweaver: { height: .98, bulk: .77, shoulders: .87, headScale: 1.04, armLength: .98, legLength: 1.01 },
}

export function createStarterClassCharacter(config: ForgeCharacterConfig, starterClass: SkillboundStarterClass): ForgeCharacterBuild {
  const styled = styledConfig(config, starterClass)
  const build = createProceduralCharacter(styled)
  stripOldVisuals(build.root)
  const palette = paletteFor(config, starterClass)

  buildSharedBody(build, palette, styled)
  if (starterClass === 'duskstrider') duskstrider(build, palette)
  else if (starterClass === 'thornwarden') thornwarden(build, palette)
  else voidweaver(build, palette)

  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    version: 8,
    archetypeVersion: 8,
    starterClass,
    artStyle: 'compact-topdown-outfit-first-v3',
    visualRebuild: true,
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
    headScale: clamp(p.headScale + (config.headScale - 1) * .05, p.headScale - .02, p.headScale + .02),
    armLength: clamp(p.armLength + (config.armLength - 1) * .06, p.armLength - .02, p.armLength + .02),
    legLength: clamp(p.legLength + (config.legLength - 1) * .06, p.legLength - .02, p.legLength + .02),
  }
}

function paletteFor(config: ForgeCharacterConfig, cls: SkillboundStarterClass): Palette {
  const skin = new THREE.Color(config.primary)
  const wantedCloth = new THREE.Color(config.secondary)
  const wantedAccent = new THREE.Color(config.accent)
  const d = cls === 'duskstrider'
    ? ['#253638','#17272a','#5b493c','#72877e','#b68a55','#c7d9cf','#352920']
    : cls === 'thornwarden'
      ? ['#334637','#1f3027','#594936','#68796c','#b39a62','#a9c896','#3b2d20']
      : ['#302a48','#1c1a2f','#4a3d45','#756f86','#a88f68','#b4a6ff','#2b2332']
  const cloth = new THREE.Color(d[0]).lerp(wantedCloth, .35)
  const clothDark = new THREE.Color(d[1]).lerp(wantedCloth.clone().multiplyScalar(.55), .25)
  const leather = new THREE.Color(d[2]).lerp(wantedAccent, .28)
  const metal = new THREE.Color(d[3])
  const trim = new THREE.Color(d[4]).lerp(wantedAccent, .16)
  return {
    skin: mat(skin), hair: mat(new THREE.Color(d[6])), cloth: mat(cloth), clothDark: mat(clothDark),
    leather: mat(leather), leatherDark: mat(leather.clone().multiplyScalar(.55)),
    metal: mat(metal, .62, .25), metalDark: mat(metal.clone().multiplyScalar(.52), .75, .18), trim: mat(trim, .82),
    eye: new THREE.MeshStandardMaterial({ color: '#d4b261', emissive: '#3b2d13', emissiveIntensity: .35, roughness: .65, flatShading: true }),
    glow: new THREE.MeshStandardMaterial({ color: d[5], emissive: d[5], emissiveIntensity: cls === 'voidweaver' ? 1.7 : .6, roughness: .4, flatShading: true }),
  }
}

function mat(color: THREE.Color | string, roughness = .98, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true })
}

function buildSharedBody(build: ForgeCharacterBuild, m: Palette, c: ForgeCharacterConfig) {
  const b = build.bones
  const h = c.height
  const ua = .335 * h * c.armLength, la = .305 * h * c.armLength
  const ul = .39 * h * c.legLength, ll = .38 * h * c.legLength

  // Faceted face with tiny readable features. No visible long neck.
  add(b.Head, new THREE.IcosahedronGeometry(.142 * h * c.headScale, 1), m.skin, [0,.067,-.012], undefined, [.94,1.02,.9], 'Hero_Head')
  add(b.Head, new THREE.SphereGeometry(.142 * h * c.headScale, 8, 4, 0, Math.PI * 2, 0, Math.PI * .48), m.hair, [0,.118,.004], [.02,0,0], [.96,.72,.96], 'Hero_Hair')
  for (const s of [-1,1] as const) {
    add(b.Head, new THREE.BoxGeometry(.038,.012,.014), m.hair, [s*.047,.082,-.126], [0,s*-.05,s*-.05], undefined, `Hero_Brow_${s}`)
    add(b.Head, new THREE.BoxGeometry(.016,.013,.011), m.eye, [s*.047,.057,-.135], undefined, undefined, `Hero_Eye_${s}`)
  }

  // One continuous outfit silhouette instead of bare mannequin blocks.
  add(b.Spine, frustum(.275,.15,.37,.17,.31), m.cloth, [0,.105,0], undefined, undefined, 'Hero_Tunic')
  add(b.Chest, frustum(.37,.17,.31,.155,.19), m.cloth, [0,-.075,0], undefined, undefined, 'Hero_UpperTunic')
  add(b.Hips, frustum(.255,.145,.29,.15,.16), m.clothDark, [0,.075,0], undefined, undefined, 'Hero_Waist')
  add(b.Hips, new THREE.BoxGeometry(.29,.035,.165), m.leatherDark, [0,.13,0], undefined, undefined, 'Hero_Belt')
  add(b.Hips, new THREE.BoxGeometry(.045,.055,.025), m.trim, [0,.13,-.096], undefined, undefined, 'Hero_Buckle')

  for (const s of [-1,1] as const) {
    const upperArm = s < 0 ? b.UpperArm_L : b.UpperArm_R
    const lowerArm = s < 0 ? b.LowerArm_L : b.LowerArm_R
    const hand = s < 0 ? b.Hand_L : b.Hand_R
    const upperLeg = s < 0 ? b.UpperLeg_L : b.UpperLeg_R
    const lowerLeg = s < 0 ? b.LowerLeg_L : b.LowerLeg_R
    const foot = s < 0 ? b.Foot_L : b.Foot_R
    const rz = s < 0 ? Math.PI / 2 : -Math.PI / 2

    add(upperArm, new THREE.CylinderGeometry(.055,.068,ua*.95,6), m.cloth, [s*ua*.47,0,0], [0,0,rz], undefined, `Hero_Sleeve_${s}`)
    add(lowerArm, new THREE.CylinderGeometry(.046,.058,la*.93,6), m.clothDark, [s*la*.46,0,0], [0,0,rz], undefined, `Hero_Forearm_${s}`)
    add(lowerArm, new THREE.CylinderGeometry(.058,.061,.075,6), m.leather, [s*la*.78,0,0], [0,0,rz], undefined, `Hero_Cuff_${s}`)
    add(hand, new THREE.BoxGeometry(.082,.07,.075), m.leather, [s*.032,-.004,-.002], undefined, undefined, `Hero_Glove_${s}`)

    add(upperLeg, new THREE.CylinderGeometry(.066,.082,ul*.97,6), m.clothDark, [0,-ul*.48,0], undefined, [.98,1,.92], `Hero_Thigh_${s}`)
    add(lowerLeg, new THREE.CylinderGeometry(.055,.067,ll*.91,6), m.clothDark, [0,-ll*.45,0], undefined, [.98,1,.92], `Hero_Shin_${s}`)
    add(lowerLeg, frustum(.105,.125,.12,.14,.18), m.leather, [0,-ll*.70,-.005], undefined, undefined, `Hero_BootCuff_${s}`)
    add(foot, frustum(.12,.205,.11,.17,.105), m.leatherDark, [0,-.025,-.085], [-.07,0,0], undefined, `Hero_Boot_${s}`)

    add(b.Chest, new THREE.SphereGeometry(.09,7,4,0,Math.PI*2,0,Math.PI*.58), m.clothDark, [s*.195,.035,0], [0,0,s*.12], [1.15,.65,.98], `Hero_Shoulder_${s}`)
  }
}

function duskstrider(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  add(b.Neck, new THREE.CylinderGeometry(.145,.165,.085,7), m.clothDark, [0,-.005,.015], undefined, [1,1,.82], 'Dusk_Cowl')
  add(b.Head, new THREE.SphereGeometry(.152,8,5,0,Math.PI*2,0,Math.PI*.60), m.clothDark, [0,.112,.018], [.02,0,0], [1.03,.86,1.03], 'Dusk_Hood')
  add(b.Chest, frustum(.15,.14,.105,.115,.055), m.metal, [-.205,.055,-.005], [.02,.08,-.06], undefined, 'Dusk_ShoulderPlate')
  add(b.Chest, new THREE.BoxGeometry(.04,.27,.022), m.leather, [-.055,-.09,-.096], [0,0,.40], undefined, 'Dusk_Strap')
  cape(b.Chest, m.clothDark, m.trim, .47, .31, 'Dusk')
  add(b.Hips, new THREE.BoxGeometry(.07,.09,.045), m.leatherDark, [.145,.055,.02], [0,.08,-.04], undefined, 'Dusk_Pouch')
}

function thornwarden(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  add(b.Neck, frustum(.24,.16,.19,.14,.085), m.clothDark, [0,-.012,.015], undefined, undefined, 'Thorn_Mantle')
  cape(b.Chest, m.clothDark, m.cloth, .36, .285, 'Thorn')
  add(b.Chest, frustum(.245,.025,.205,.02,.23), m.leather, [0,-.10,-.095], [.02,0,0], undefined, 'Thorn_Bib')
  add(b.Chest, new THREE.BoxGeometry(.035,.28,.018), m.leatherDark, [.045,-.105,-.113], [0,0,-.30], undefined, 'Thorn_Strap')
  add(b.Chest, new THREE.CylinderGeometry(.043,.052,.34,7), m.leatherDark, [.135,-.13,.145], [.04,0,-.24], undefined, 'Thorn_Quiver')
  for (let i=0;i<3;i+=1) {
    add(b.Chest, new THREE.CylinderGeometry(.004,.004,.39,5), m.metalDark, [.115+i*.019,.065+i*.004,.15], [.04,0,-.24], undefined, `Thorn_Arrow_${i}`)
    add(b.Chest, new THREE.ConeGeometry(.013,.04,4), m.trim, [.19+i*.019,.225+i*.004,.15], [.04,0,-.24], undefined, `Thorn_Fletching_${i}`)
  }
}

function voidweaver(build: ForgeCharacterBuild, m: Palette) {
  const b = build.bones
  add(b.Neck, new THREE.CylinderGeometry(.14,.165,.105,7), m.clothDark, [0,-.002,.012], undefined, [1,1,.82], 'Void_Cowl')
  add(b.Head, new THREE.SphereGeometry(.15,8,5,0,Math.PI*2,0,Math.PI*.54), m.clothDark, [0,.115,.02], [.02,0,0], [1.02,.82,1.02], 'Void_Hood')
  add(b.Hips, frustum(.29,.15,.38,.17,.34), m.cloth, [0,-.10,.01], [.02,0,0], undefined, 'Void_RobeSkirt')
  add(b.Hips, frustum(.105,.04,.125,.035,.42), m.clothDark, [-.073,-.31,-.095], [.03,0,-.02], undefined, 'Void_Robe_L')
  add(b.Hips, frustum(.105,.04,.125,.035,.42), m.clothDark, [.073,-.31,-.095], [.03,0,.02], undefined, 'Void_Robe_R')
  add(b.Chest, new THREE.BoxGeometry(.035,.22,.018), m.trim, [0,-.11,-.102], undefined, undefined, 'Void_RuneStripe')
  add(b.Chest, new THREE.OctahedronGeometry(.026,0), m.glow, [0,-.012,-.125], undefined, undefined, 'Void_RuneGem')
  add(b.Hips, new THREE.BoxGeometry(.095,.12,.034), m.leatherDark, [.14,.04,.055], [.02,-.08,-.04], undefined, 'Void_Grimoire')
}

function cape(chest: THREE.Bone, dark: THREE.Material, light: THREE.Material, height: number, width: number, prefix: string) {
  const y = .045-height/2, z=.115
  add(chest, frustum(width*.46,.025,width*.52,.03,height), dark, [-width*.13,y,z], [.05,.02,-.025], undefined, `${prefix}_Cape_L`)
  add(chest, frustum(width*.46,.025,width*.52,.03,height*.96), light, [width*.13,y+.01,z+.002], [.05,-.02,.025], undefined, `${prefix}_Cape_R`)
  add(chest, new THREE.BoxGeometry(width*.9,.035,.03), dark, [0,.03,z-.01], undefined, undefined, `${prefix}_CapeCollar`)
}

function stripOldVisuals(root: THREE.Object3D) {
  const meshes: THREE.Mesh[]=[]
  root.traverse((o)=>{ if(o instanceof THREE.Mesh) meshes.push(o) })
  meshes.forEach((mesh)=>{
    mesh.removeFromParent(); mesh.geometry?.dispose()
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material]
    materials.forEach((material)=>material?.dispose())
  })
}

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number,number,number], rotation: [number,number,number]=[0,0,0], scale: [number,number,number]=[1,1,1], name='Part') {
  const mesh=new THREE.Mesh(geometry,material)
  mesh.name=name; mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scale.set(...scale)
  parent.add(mesh); return mesh
}

function frustum(topW:number,topD:number,bottomW:number,bottomD:number,height:number) {
  const y0=-height/2,y1=height/2
  const v=new Float32Array([
    -bottomW/2,y0,-bottomD/2, bottomW/2,y0,-bottomD/2, bottomW/2,y0,bottomD/2, -bottomW/2,y0,bottomD/2,
    -topW/2,y1,-topD/2, topW/2,y1,-topD/2, topW/2,y1,topD/2, -topW/2,y1,topD/2,
  ])
  const idx=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(v,3)); g.setIndex(idx); g.computeVertexNormals(); return g
}

function recount(build: ForgeCharacterBuild) {
  let skinnedMeshes=0,triangles=0
  build.root.traverse((o)=>{
    const mesh=o as THREE.Mesh
    if((mesh as THREE.SkinnedMesh).isSkinnedMesh)skinnedMeshes+=1
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return
    triangles+=mesh.geometry.index?mesh.geometry.index.count/3:mesh.geometry.attributes.position.count/3
  })
  return {bones:build.skeleton.bones.length,skinnedMeshes,triangles:Math.round(triangles)}
}

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}
