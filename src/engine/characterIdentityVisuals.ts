import * as THREE from 'three'
import type { ForgeCharacterBuild } from '../lib/proceduralCharacter'
import type { CharacterIdentityRecipe, FacePreset } from '../lib/characterCreator'

export function applyCharacterIdentityVisuals(build: ForgeCharacterBuild, identity: CharacterIdentityRecipe) {
  applyFacePreset(build, identity.appearance.facePreset)
  applyBodyFeatures(build, identity)
  applyEyeColor(build.root, identity.appearance.eyeColor)
  addHair(build.bones.Head, identity)
  addFacialHair(build.bones.Head, identity)
  build.root.userData.characterIdentity = {
    format: identity.format,
    version: identity.version,
    id: identity.id,
    classId: identity.classId,
    seed: identity.seed,
    appearance: { ...identity.appearance },
    body: { ...identity.body },
  }
}

function applyFacePreset(build: ForgeCharacterBuild, preset: FacePreset) {
  const scale = preset === 'angular'
    ? [1, 1.035, .95]
    : preset === 'narrow'
      ? [.92, 1.025, .96]
      : preset === 'broad'
        ? [1.075, .985, 1.025]
        : [1, 1, 1]
  build.bones.Head.scale.set(scale[0], scale[1], scale[2])
}

function applyBodyFeatures(build: ForgeCharacterBuild, identity: CharacterIdentityRecipe) {
  const chest = identity.body.chest
  const waist = identity.body.waist
  const hips = identity.body.hips

  build.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object.name === 'V2_Chest') {
      object.scale.x *= chest
      object.scale.z *= .96 + (chest - 1) * .45
    } else if (object.name === 'V2_Abdomen') {
      object.scale.x *= waist
      object.scale.z *= .97 + (waist - 1) * .35
    } else if (object.name === 'V2_Pelvis') {
      object.scale.x *= hips
      object.scale.z *= .98 + (hips - 1) * .3
    }
  })
}

function applyEyeColor(root: THREE.Object3D, color: string) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith('V2_Eye_')) return
    const current = Array.isArray(object.material) ? object.material[0] : object.material
    if (!(current instanceof THREE.MeshStandardMaterial)) return
    const replacement = current.clone()
    replacement.color.set(color)
    replacement.roughness = .72
    object.material = replacement
  })
}

function addHair(head: THREE.Bone, identity: CharacterIdentityRecipe) {
  const style = identity.appearance.hairStyle
  if (style === 'none') return
  const material = hairMaterial(identity.appearance.hairColor)

  if (style === 'cropped') {
    add(head, new THREE.IcosahedronGeometry(.142, 1), material, 'Identity_Hair_Cropped', [0, .126, .013], [0, 0, 0], [1.02, .55, .91])
    return
  }

  if (style === 'swept') {
    add(head, new THREE.IcosahedronGeometry(.145, 1), material, 'Identity_Hair_Swept_Crown', [0, .132, .018], [0, 0, -.04], [1.04, .6, .93])
    add(head, new THREE.BoxGeometry(.17, .055, .045), material, 'Identity_Hair_Swept_Fringe', [-.025, .085, -.125], [-.08, .12, -.12])
    return
  }

  if (style === 'undercut') {
    add(head, new THREE.BoxGeometry(.145, .06, .175), material, 'Identity_Hair_Undercut', [0, .135, .008], [0, 0, 0], [1, 1, .92])
    add(head, new THREE.BoxGeometry(.105, .045, .07), material, 'Identity_Hair_Undercut_Fringe', [.02, .095, -.117], [-.05, -.08, .04])
    return
  }

  if (style === 'long') {
    add(head, new THREE.IcosahedronGeometry(.146, 1), material, 'Identity_Hair_Long_Crown', [0, .13, .018], [0, 0, 0], [1.05, .62, .94])
    add(head, new THREE.BoxGeometry(.19, .25, .045), material, 'Identity_Hair_Long_Back', [0, -.035, .115], [.05, 0, 0], [1, 1, 1])
    add(head, new THREE.BoxGeometry(.04, .17, .065), material, 'Identity_Hair_Long_L', [-.105, -.005, .025], [0, 0, -.04])
    add(head, new THREE.BoxGeometry(.04, .17, .065), material, 'Identity_Hair_Long_R', [.105, -.005, .025], [0, 0, .04])
    return
  }

  add(head, new THREE.IcosahedronGeometry(.144, 1), material, 'Identity_Hair_Tied_Crown', [0, .13, .018], [0, 0, 0], [1.03, .58, .92])
  add(head, new THREE.SphereGeometry(.045, 7, 5), material, 'Identity_Hair_Tied_Knot', [0, .08, .145])
  add(head, new THREE.CylinderGeometry(.018, .035, .19, 6), material, 'Identity_Hair_Tied_Tail', [0, -.035, .16], [.2, 0, 0])
}

function addFacialHair(head: THREE.Bone, identity: CharacterIdentityRecipe) {
  const style = identity.appearance.facialHairStyle
  if (style === 'none') return
  const material = hairMaterial(identity.appearance.facialHairColor)

  if (style === 'stubble') {
    const stubble = new THREE.MeshStandardMaterial({
      color: identity.appearance.facialHairColor,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: .58,
      side: THREE.FrontSide,
    })
    add(head, chinGeometry(.122, .075, .025), stubble, 'Identity_Beard_Stubble', [0, -.092, -.116])
    return
  }

  if (style === 'short') {
    add(head, chinGeometry(.13, .105, .045), material, 'Identity_Beard_Short', [0, -.105, -.12])
    add(head, new THREE.BoxGeometry(.075, .025, .02), material, 'Identity_Moustache_Short', [0, -.035, -.137])
    return
  }

  add(head, chinGeometry(.145, .17, .06), material, 'Identity_Beard_Full', [0, -.135, -.118])
  add(head, new THREE.BoxGeometry(.09, .03, .022), material, 'Identity_Moustache_Full', [0, -.034, -.14])
}

function chinGeometry(width: number, height: number, depth: number) {
  const bottom = width * .42
  const v = new Float32Array([
    -width / 2, height / 2, -depth / 2,
    width / 2, height / 2, -depth / 2,
    bottom / 2, -height / 2, -depth / 2,
    -bottom / 2, -height / 2, -depth / 2,
    -width / 2, height / 2, depth / 2,
    width / 2, height / 2, depth / 2,
    bottom / 2, -height / 2, depth / 2,
    -bottom / 2, -height / 2, depth / 2,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(v, 3))
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ])
  geometry.computeVertexNormals()
  return geometry
}

function hairMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: .96,
    metalness: 0,
    flatShading: true,
    side: THREE.FrontSide,
  })
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = false
  parent.add(mesh)
  return mesh
}
