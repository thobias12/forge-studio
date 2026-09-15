import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { createConceptCharacter } from '../lib/conceptCryptSkeleton'
import { disposeForgeCharacter, type ForgeCharacterBuild, type ForgeCharacterConfig } from '../lib/proceduralCharacter'

export function createConceptForgeCharacter(config: ForgeCharacterConfig): ForgeCharacterBuild {
  const build = createConceptCharacter({ ...config, weapon: 'none' })
  stripLegacyConceptWeapon(build)
  build.root.userData.forgeCharacter = {
    ...build.root.userData.forgeCharacter,
    conceptForgeVersion: 2,
    weaponPolicy: 'external-item-forge',
    previewWeapon: false,
  }
  build.stats = recount(build)
  build.root.updateMatrixWorld(true)
  return build
}

export async function exportConceptForgeCharacterGlb(config: ForgeCharacterConfig): Promise<Blob> {
  const build = createConceptForgeCharacter(config)
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

function stripLegacyConceptWeapon(build: ForgeCharacterBuild) {
  if (build.root.userData.forgeCharacter?.conceptTarget !== 'CryptSkeletonApprovedV2') return
  const handParts = build.root.children.filter((child) => child.name.startsWith('Concept_Hand_R_'))
  // The old curated Crypt Skeleton appended five sword parts after the actual hand geometry.
  // Keeping this compatibility shim here lets Concept Forge 2 export clean characters without
  // rewriting the approved skeleton mesh recipe. Item Forge is now the weapon authority.
  const legacyWeaponParts = handParts.slice(-5)
  legacyWeaponParts.forEach((object) => {
    object.removeFromParent()
    disposeObject(object)
  })
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

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material?.dispose())
  })
}
