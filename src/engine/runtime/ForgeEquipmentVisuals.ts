import { attachGeneratedArmor, isGeneratedArmor } from '../skillboundItemModels'
import { recipeForItem } from '../skillboundItems'
import * as THREE from 'three'
import { itemVisual } from '../itemPresentation'
import { itemClassification } from '../itemTaxonomy'
import type {
  ForgeItemDefinition,
} from '../forgeProject'
import type { ForgeEquipmentSlot } from '../equipment'
import { disposeBoundObject } from './ForgeAssetRuntime'
import {
  bindRuntimeItemModel,
  findRuntimeItemSocket,
} from './ForgeItemRuntime'

export type ForgeEquipmentVisualContext = {
  characterRoot?: THREE.Object3D
  fallbackParent: THREE.Object3D
  anchors: Map<ForgeEquipmentSlot, THREE.Group>
}

export async function bindEquipmentVisualModel(
  context: ForgeEquipmentVisualContext,
  item: ForgeItemDefinition,
  slot: ForgeEquipmentSlot,
) {
  const recipe = recipeForItem(item)
  if (recipe && isGeneratedArmor(recipe)) {
    const model = context.characterRoot ? attachGeneratedArmor(context.characterRoot, item) : undefined
    if (!model) throw new Error('Generated armor needs the existing skinned character body.')
    return model
  }
  const target = equipmentVisualTarget(
    context,
    item,
    slot,
  )
  let model = await bindRuntimeItemModel(
    target,
    item,
    'equipped',
  )
  if (!model) {
    model = createFallbackEquipmentModel(item, slot)
    target.add(model)
  }
  if (recipe && (slot === 'Amulet' || slot === 'Charm')) model.position.set(0, -.08, .16)
  return model
}

export function clearEquipmentVisualModels(
  models:
    | Map<ForgeEquipmentSlot, THREE.Object3D>
    | undefined,
) {
  models?.forEach((model) => {
    model.parent?.remove(model)
    disposeBoundObject(model)
  })
  models?.clear()
}

export function clearEquipmentVisualAnchors(
  anchors:
    | Map<ForgeEquipmentSlot, THREE.Group>
    | undefined,
) {
  anchors?.forEach((anchor) => {
    anchor.removeFromParent()
  })
  anchors?.clear()
}

function equipmentVisualTarget(
  context: ForgeEquipmentVisualContext,
  item: ForgeItemDefinition,
  slot: ForgeEquipmentSlot,
) {
  const character = context.characterRoot
  if (character) {
    if (slot === 'MainHand') {
      const socket = itemVisual(item).equipped.socket
      const target = findRuntimeItemSocket(
        character,
        socket,
      )
      if (target) return target
    }
    if (slot === 'OffHand') {
      const target = findRuntimeItemSocket(
        character,
        'LeftHand',
      )
      if (target) return target
    }
    const target = findNamedTarget(
      character,
      slotAliases(slot),
    )
    if (target) return target
  }

  let anchor = context.anchors.get(slot)
  if (!anchor) {
    anchor = new THREE.Group()
    anchor.name = `__forge_equipment_anchor_${slot}`
    anchor.position.set(...fallbackPosition(slot))
    context.fallbackParent.add(anchor)
    context.anchors.set(slot, anchor)
  }
  return anchor
}

function findNamedTarget(
  root: THREE.Object3D,
  aliases: string[],
) {
  let best: THREE.Object3D | undefined
  root.traverse((child) => {
    if (best) return
    const name = child.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
    if (
      name &&
      aliases.some(
        (alias) =>
          name === alias ||
          name.endsWith(alias) ||
          name.includes(alias),
      )
    ) {
      best = child
    }
  })
  return best
}

function slotAliases(slot: ForgeEquipmentSlot) {
  if (slot === 'Amulet' || slot === 'Charm' || slot === 'Cape') return ['spine03', 'chest', 'spine2']
  if (slot === 'Waist') return ['pelvis', 'hips']
  if (slot === 'Ring') return ['handl', 'lefthand']
  if (slot === 'Head') {
    return ['head', 'mixamorighead', 'neck']
  }
  if (
    slot === 'Chest' ||
    slot === 'Hands'
  ) {
    return [
      'upperchest',
      'chest',
      'spine2',
      'spine1',
      'spine',
    ]
  }
  if (slot === 'Legs' || slot === 'Feet') {
    return ['hips', 'pelvis', 'mixamorighips']
  }
  return []
}

function fallbackPosition(
  slot: ForgeEquipmentSlot,
): [number, number, number] {
  if (slot === 'MainHand') return [0.58, 1.12, 0]
  if (slot === 'OffHand') return [-0.58, 1.12, 0]
  if (slot === 'Head') return [0, 1.82, 0]
  if (slot === 'Chest') return [0, 1.35, 0]
  if (slot === 'Hands') return [0, 1.24, 0]
  if (slot === 'Legs') return [0, 0.72, 0]
  return [0, 0.32, 0]
}

function createFallbackEquipmentModel(
  item: ForgeItemDefinition,
  slot: ForgeEquipmentSlot,
) {
  const group = new THREE.Group()
  group.name = `__forge_fallback_equipment_${item.id}`
  const color = new THREE.Color(
    item.color || '#8e8a80',
  )
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.12,
  })
  const dark = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.58),
    roughness: 0.82,
    metalness: 0.08,
  })
  const add = (
    geometry: THREE.BufferGeometry,
    position: [number, number, number],
    rotation?: [number, number, number],
    source = material,
  ) => {
    const mesh = new THREE.Mesh(geometry, source)
    mesh.position.set(...position)
    if (rotation) mesh.rotation.set(...rotation)
    mesh.castShadow = true
    group.add(mesh)
  }

  const subtype = itemClassification(item).subtype
  if (slot === 'MainHand') {
    if (subtype === 'bow') {
      add(
        new THREE.TorusGeometry(
          0.62,
          0.045,
          6,
          22,
          Math.PI * 1.25,
        ),
        [0, 0.02, 0],
        [0, 0, Math.PI * 0.38],
      )
      add(
        new THREE.BoxGeometry(0.025, 1.08, 0.025),
        [0, 0.02, 0],
        undefined,
        dark,
      )
    } else if (
      subtype === 'staff' ||
      subtype === 'spear'
    ) {
      add(
        new THREE.CylinderGeometry(
          0.035,
          0.045,
          1.72,
          8,
        ),
        [0, 0.45, 0],
        undefined,
        dark,
      )
      add(
        new THREE.OctahedronGeometry(0.14),
        [0, 1.32, 0],
      )
    } else {
      add(
        new THREE.BoxGeometry(0.1, 1.08, 0.08),
        [0, 0.46, 0],
      )
      add(
        new THREE.BoxGeometry(0.38, 0.07, 0.11),
        [0, -0.06, 0],
        undefined,
        dark,
      )
    }
  } else if (slot === 'OffHand') {
    add(
      new THREE.CylinderGeometry(
        0.42,
        0.42,
        0.09,
        18,
      ),
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
    )
    add(
      new THREE.SphereGeometry(0.11, 10, 8),
      [0, 0, -0.08],
      undefined,
      dark,
    )
  } else if (slot === 'Head') {
    add(
      new THREE.SphereGeometry(
        0.36,
        16,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.62,
      ),
      [0, 0.05, 0],
    )
  } else if (slot === 'Chest') {
    add(
      new THREE.BoxGeometry(0.72, 0.72, 0.4),
      [0, -0.02, 0],
    )
    add(
      new THREE.BoxGeometry(0.82, 0.12, 0.46),
      [0, 0.34, 0],
      undefined,
      dark,
    )
  } else if (slot === 'Hands') {
    add(
      new THREE.BoxGeometry(0.2, 0.3, 0.22),
      [-0.55, -0.08, 0],
    )
    add(
      new THREE.BoxGeometry(0.2, 0.3, 0.22),
      [0.55, -0.08, 0],
    )
  } else if (slot === 'Legs') {
    add(
      new THREE.BoxGeometry(0.22, 0.72, 0.28),
      [-0.16, -0.34, 0],
    )
    add(
      new THREE.BoxGeometry(0.22, 0.72, 0.28),
      [0.16, -0.34, 0],
    )
  } else if (slot === 'Feet') {
    add(
      new THREE.BoxGeometry(0.24, 0.18, 0.42),
      [-0.16, -0.72, -0.08],
    )
    add(
      new THREE.BoxGeometry(0.24, 0.18, 0.42),
      [0.16, -0.72, -0.08],
    )
  }

  return group
}
