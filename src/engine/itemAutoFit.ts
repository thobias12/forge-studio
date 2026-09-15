import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getAsset } from '../lib/library'
import type { ForgeItemDefinition, ForgeItemVisualDefinition } from './forgeProject'
import { itemVisual, resolveItemModelAssetId } from './itemPresentation'
import { itemClassification, wearableTargetSize } from './itemTaxonomy'

export type ItemAutoFitPreset =
  | 'one-handed-sword'
  | 'dagger'
  | 'heavy-weapon'
  | 'staff'
  | 'bow'
  | 'shield'
  | 'focus'
  | 'armor-helmet'
  | 'armor-chest'
  | 'armor-gloves'
  | 'armor-legs'
  | 'armor-boots'
  | 'generic-weapon'
  | 'generic-item'
export type ItemAutoFitScope = 'all' | 'inventory' | 'drop' | 'equipped'

export type ItemAutoFitProfile = {
  preset: ItemAutoFitPreset
  label: string
  size: [number, number, number]
  longestAxis: 'x' | 'y' | 'z'
  longest: number
  triangles: number
  source: string
}

export type ItemAutoFitResult = {
  profile: ItemAutoFitProfile
  visual: ForgeItemVisualDefinition
}

export async function autoFitItemPresentation(item: ForgeItemDefinition, scope: ItemAutoFitScope = 'all'): Promise<ItemAutoFitResult> {
  const assetId = resolveItemModelAssetId(item, 'inventory')
  if (!assetId) throw new Error('Create or assign a master model before using Auto Setup.')
  const asset = await getAsset(assetId)
  if (!asset) throw new Error('The selected master model is missing from the Shared Library.')

  const objectUrl = URL.createObjectURL(asset.blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(objectUrl)
    const root = gltf.scene
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    if (box.isEmpty()) throw new Error('Forge could not measure this master model.')

    const size3 = box.getSize(new THREE.Vector3())
    const min = box.min.clone()
    const max = box.max.clone()
    const center = box.getCenter(new THREE.Vector3())
    const dimensions: [number, number, number] = [size3.x, size3.y, size3.z]
    const longestIndex = dimensions.indexOf(Math.max(...dimensions))
    const longestAxis = (['x', 'y', 'z'] as const)[longestIndex]
    const longest = Math.max(dimensions[longestIndex], 0.001)
    const second = [...dimensions].sort((a, b) => b - a)[1] || longest
    const aspect = longest / Math.max(second, 0.001)
    const preset = detectPreset(item, aspect)
    const triangles = countTriangles(root)
    const profile: ItemAutoFitProfile = {
      preset,
      label: presetLabel(preset),
      size: dimensions.map((value) => round(value)) as [number, number, number],
      longestAxis,
      longest: round(longest),
      triangles,
      source: asset.source ?? 'Shared Library',
    }

    const current = itemVisual(item)
    const inventory = recommendedInventory(preset, longestAxis)
    const drop = recommendedDrop(preset, longestAxis, longest)
    const equipped = recommendedEquipped(item, preset, longestAxis, longest, size3, min, max, center)

    const visual: ForgeItemVisualDefinition = {
      ...current,
      inventory: scope === 'all' || scope === 'inventory'
        ? { ...current.inventory, ...inventory, iconAssetId: current.inventory.iconAssetId }
        : current.inventory,
      drop: scope === 'all' || scope === 'drop'
        ? { ...current.drop, useMaster: true, transform: drop.transform, groundOffset: drop.groundOffset }
        : current.drop,
      equipped: scope === 'all' || scope === 'equipped'
        ? { ...current.equipped, useMaster: true, socket: equipped.socket, transform: equipped.transform }
        : current.equipped,
    }

    return { profile, visual }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function detectPreset(item: ForgeItemDefinition, aspect: number): ItemAutoFitPreset {
  const classification = itemClassification(item)
  if (classification.itemType === 'armor') {
    if (classification.subtype === 'helmet') return 'armor-helmet'
    if (classification.subtype === 'gloves') return 'armor-gloves'
    if (classification.subtype === 'legs') return 'armor-legs'
    if (classification.subtype === 'boots') return 'armor-boots'
    return 'armor-chest'
  }
  if (classification.itemType === 'offhand') return classification.subtype === 'focus' ? 'focus' : 'shield'
  if (classification.itemType !== 'weapon') return 'generic-item'

  if (classification.subtype === 'dagger') return 'dagger'
  if (classification.subtype === 'axe' || classification.subtype === 'mace') return 'heavy-weapon'
  if (classification.subtype === 'staff' || classification.subtype === 'spear') return 'staff'
  if (classification.subtype === 'bow') return 'bow'
  if (classification.subtype === 'sword') return 'one-handed-sword'
  if (aspect > 4.2) return 'one-handed-sword'
  if (aspect > 2.4) return 'generic-weapon'
  return 'heavy-weapon'
}

function recommendedInventory(preset: ItemAutoFitPreset, longestAxis: 'x' | 'y' | 'z') {
  const armor = isArmorPreset(preset)
  const axisRotation = armor || preset === 'shield' || preset === 'focus' ? [0, 0, 0] as [number, number, number] : orientLongestAxisToY(longestAxis)
  const flourish: [number, number, number] = preset === 'shield'
    ? [0, -24, 0]
    : preset === 'focus'
      ? [8, -24, 8]
      : armor
        ? [4, -22, 0]
        : preset === 'bow'
          ? [4, -22, -18]
          : preset === 'heavy-weapon'
            ? [8, -24, -34]
            : [0, -28, -42]
  return {
    cameraPreset: 'three-quarter' as const,
    rotation: addRotation(axisRotation, flourish),
    scale: 1,
    autoIcon: true,
  }
}

function recommendedDrop(preset: ItemAutoFitPreset, longestAxis: 'x' | 'y' | 'z', longest: number) {
  const targetLength = preset === 'staff' || preset === 'bow'
    ? 1.8
    : preset === 'shield'
      ? 1.0
      : preset === 'focus'
        ? .65
        : preset === 'dagger'
          ? .75
          : isArmorPreset(preset)
            ? armorDropLength(preset)
            : preset === 'generic-item'
              ? .7
              : 1.35
  const scale = clamp(targetLength / longest, 0.12, 4)
  const rotation = isArmorPreset(preset) || preset === 'shield' || preset === 'focus'
    ? [90, 0, -8] as [number, number, number]
    : orientLongestAxisToGround(longestAxis)
  return {
    transform: {
      position: [0, 0, 0] as [number, number, number],
      rotation: addRotation(rotation, isArmorPreset(preset) ? [0, 12, 0] : [0, 9, -7]),
      scale: round(scale, 4),
    },
    groundOffset: isArmorPreset(preset) ? 0.025 : preset === 'shield' ? 0.035 : 0.045,
  }
}

function recommendedEquipped(
  item: ForgeItemDefinition,
  preset: ItemAutoFitPreset,
  longestAxis: 'x' | 'y' | 'z',
  longest: number,
  size: THREE.Vector3,
  min: THREE.Vector3,
  max: THREE.Vector3,
  center: THREE.Vector3,
) {
  if (isArmorPreset(preset)) return recommendedWearable(item, size, center)

  const targetLength = preset === 'staff' ? 1.75 : preset === 'bow' ? 1.45 : preset === 'shield' ? 0.9 : preset === 'focus' ? .58 : preset === 'dagger' ? 0.72 : preset === 'generic-item' ? .65 : 1.28
  const scale = clamp(targetLength / longest, 0.12, 4)
  const rotation = preset === 'shield' || preset === 'focus'
    ? orientShield(longestAxis)
    : orientLongestAxisToY(longestAxis)
  const socket = preset === 'shield' || preset === 'focus' ? 'LeftHand' as const : 'RightHand' as const
  const anchor = gripAnchor(preset, longestAxis, min, max, center)
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotation[0]),
    THREE.MathUtils.degToRad(rotation[1]),
    THREE.MathUtils.degToRad(rotation[2]),
    'XYZ',
  )
  const offset = anchor.clone().multiplyScalar(scale).applyEuler(euler).multiplyScalar(-1)
  if (preset !== 'shield' && preset !== 'focus') offset.y -= 0.02

  return {
    socket,
    transform: {
      position: [round(offset.x, 4), round(offset.y, 4), round(offset.z, 4)] as [number, number, number],
      rotation,
      scale: round(scale, 4),
    },
  }
}

function recommendedWearable(item: ForgeItemDefinition, size: THREE.Vector3, center: THREE.Vector3) {
  const classification = itemClassification(item)
  const target = wearableTargetSize(classification.equipSlot)
  const ratios = [target[0] / Math.max(size.x, .001), target[1] / Math.max(size.y, .001), target[2] / Math.max(size.z, .001)]
    .filter((value) => Number.isFinite(value) && value > 0)
  const scale = clamp(Math.min(...ratios), .12, 5)
  const offset = center.clone().multiplyScalar(-scale)
  return {
    socket: 'Back' as const,
    transform: {
      position: [round(offset.x, 4), round(offset.y, 4), round(offset.z, 4)] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: round(scale, 4),
    },
  }
}

function gripAnchor(preset: ItemAutoFitPreset, axis: 'x' | 'y' | 'z', min: THREE.Vector3, max: THREE.Vector3, center: THREE.Vector3) {
  if (preset === 'shield' || preset === 'focus' || preset === 'bow' || preset === 'generic-item') return center.clone()
  const amount = preset === 'staff' ? 0.28 : preset === 'dagger' ? 0.22 : 0.18
  const anchor = center.clone()
  const low = min[axis]
  const high = max[axis]
  anchor[axis] = low + (high - low) * amount
  return anchor
}

function orientLongestAxisToY(axis: 'x' | 'y' | 'z'): [number, number, number] {
  if (axis === 'x') return [0, 0, 90]
  if (axis === 'z') return [-90, 0, 0]
  return [0, 0, 0]
}

function orientLongestAxisToGround(axis: 'x' | 'y' | 'z'): [number, number, number] {
  if (axis === 'y') return [90, 0, 0]
  if (axis === 'z') return [0, 0, 0]
  return [0, 0, 0]
}

function orientShield(axis: 'x' | 'y' | 'z'): [number, number, number] {
  if (axis === 'x') return [0, 0, 90]
  if (axis === 'z') return [-90, 0, 0]
  return [0, 0, 0]
}

function addRotation(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function countTriangles(root: THREE.Object3D) {
  let triangles = 0
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const geometry = mesh.geometry
    if (!geometry) return
    const index = geometry.getIndex()
    const positions = geometry.getAttribute('position')
    triangles += index ? index.count / 3 : (positions?.count ?? 0) / 3
  })
  return Math.round(triangles)
}

function presetLabel(preset: ItemAutoFitPreset) {
  if (preset === 'one-handed-sword') return 'One-handed sword'
  if (preset === 'dagger') return 'Dagger / knife'
  if (preset === 'heavy-weapon') return 'One-handed heavy weapon'
  if (preset === 'staff') return 'Staff / polearm'
  if (preset === 'bow') return 'Bow'
  if (preset === 'shield') return 'Shield'
  if (preset === 'focus') return 'Offhand focus'
  if (preset === 'armor-helmet') return 'Helmet armor'
  if (preset === 'armor-chest') return 'Chest armor'
  if (preset === 'armor-gloves') return 'Gloves armor'
  if (preset === 'armor-legs') return 'Leg armor'
  if (preset === 'armor-boots') return 'Boot armor'
  if (preset === 'generic-item') return 'General item'
  return 'Generic weapon'
}

function isArmorPreset(preset: ItemAutoFitPreset) {
  return preset.startsWith('armor-')
}

function armorDropLength(preset: ItemAutoFitPreset) {
  if (preset === 'armor-chest') return .92
  if (preset === 'armor-legs') return .82
  if (preset === 'armor-boots' || preset === 'armor-gloves') return .62
  return .58
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
