import * as THREE from 'three'
import {
  buildConformedTunic,
  findPrimaryBodyMesh,
} from './conform'
import {
  maskBodyUnderTunic,
  type BodyMaskRestore,
} from './bodyMasking'
import {
  equipmentForgeV3Template,
  normalizeEquipmentForgeV3Recipe,
} from './templateRegistry'
import type {
  EquipmentForgeV3Recipe,
} from './types'

type V3RootData = {
  meshes: THREE.SkinnedMesh[]
  restoreMask?: BodyMaskRestore
  materials: THREE.Material[]
}

export function buildEquipmentForgeV3Visual(
  bodyRoot: THREE.Object3D,
  input: EquipmentForgeV3Recipe,
) {
  disposeEquipmentForgeV3Visual(
    bodyRoot,
  )

  const recipe =
    normalizeEquipmentForgeV3Recipe(
      input,
    )
  const template =
    equipmentForgeV3Template(
      recipe.template,
    )

  const source =
    findPrimaryBodyMesh(bodyRoot)

  if (!source) {
    throw new Error(
      'Equipment Forge V3 could not find the skinned Skillbound body mesh.',
    )
  }

  const cloth =
    new THREE.MeshStandardMaterial({
      name: 'EFV3 Cloth',
      color: recipe.materials.cloth,
      roughness: .86,
      metalness: 0,
      side: THREE.DoubleSide,
    })
  const trim =
    new THREE.MeshStandardMaterial({
      name: 'EFV3 Trim',
      color: recipe.materials.trim,
      roughness: .72,
      metalness: .02,
      side: THREE.DoubleSide,
    })
  const leather =
    new THREE.MeshStandardMaterial({
      name: 'EFV3 Leather',
      color: recipe.materials.leather,
      roughness: .7,
      metalness: .01,
      side: THREE.DoubleSide,
    })
  const accent =
    new THREE.MeshStandardMaterial({
      name: 'EFV3 Accent',
      color: recipe.materials.accent,
      roughness: .78,
      metalness: 0,
      side: THREE.DoubleSide,
    })

  const root =
    new THREE.Group()
  root.name =
    '__equipment_forge_v3'
  root.userData.equipmentForgeV3 =
    true
  bodyRoot.add(root)

  const data: V3RootData = {
    meshes: [],
    materials: [
      cloth,
      trim,
      leather,
      accent,
    ],
  }

  if (
    template.id ===
    'tunic_fitted'
  ) {
    const result =
      buildConformedTunic(
        source,
        recipe,
        cloth,
        trim,
        leather,
        accent,
      )

    data.meshes.push(
      ...result.meshes,
    )

    if (template.maskBody) {
      data.restoreMask =
        maskBodyUnderTunic(
          source,
          result.frame,
          recipe.length,
          recipe.sleeve,
        )
    }
  }

  root.userData.v3Data = data
  return root
}

export function disposeEquipmentForgeV3Visual(
  bodyRoot: THREE.Object3D,
) {
  const root =
    bodyRoot.getObjectByName(
      '__equipment_forge_v3',
    ) as THREE.Group | undefined

  if (!root) return

  const data =
    root.userData.v3Data as
      | V3RootData
      | undefined

  data?.restoreMask?.()

  for (const mesh of data?.meshes ?? []) {
    mesh.removeFromParent()
    mesh.geometry.dispose()
  }
  for (
    const material of
      data?.materials ?? []
  ) {
    material.dispose()
  }

  root.removeFromParent()
}
