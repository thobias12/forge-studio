import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getAsset } from '../../lib/library'
import { itemVisual, resolveItemModelAssetId } from '../itemPresentation'
import type { ForgeItemDefinition, ForgeItemSocket, ForgeItemTransform } from '../forgeProject'

export type ForgeRuntimeItemMode = 'drop' | 'equipped'

export async function bindRuntimeItemModel(target: THREE.Object3D, item: ForgeItemDefinition, mode: ForgeRuntimeItemMode) {
  const assetId = resolveItemModelAssetId(item, mode)
  if (!assetId) return undefined
  const asset = await getAsset(assetId)
  if (!asset) return undefined

  const url = URL.createObjectURL(asset.blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const root = gltf.scene
    root.name = `__forge_runtime_item_${item.id}`
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
    })

    const visual = itemVisual(item)
    if (mode === 'drop') {
      applyRuntimeItemTransform(root, visual.drop.transform)
      root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(root)
      if (!box.isEmpty()) root.position.y += visual.drop.groundOffset - box.min.y
    } else {
      applyRuntimeItemTransform(root, visual.equipped.transform)
    }

    target.add(root)
    return root
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function applyRuntimeItemTransform(root: THREE.Object3D, transform: ForgeItemTransform) {
  root.position.set(...transform.position)
  root.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation[0]),
    THREE.MathUtils.degToRad(transform.rotation[1]),
    THREE.MathUtils.degToRad(transform.rotation[2]),
  )
  root.scale.setScalar(transform.scale)
}

export function findRuntimeItemSocket(characterRoot: THREE.Object3D, socket: ForgeItemSocket) {
  const aliases = socketAliases(socket)
  let best: THREE.Object3D | undefined
  characterRoot.traverse((child) => {
    if (best) return
    const name = normalizeNodeName(child.name)
    if (name && aliases.some((alias) => name === alias || name.endsWith(alias) || name.includes(alias))) best = child
  })
  return best
}

export function fallbackSocketPosition(socket: ForgeItemSocket): [number, number, number] {
  if (socket === 'LeftHand') return [-0.58, 1.12, 0]
  if (socket === 'Back') return [0, 1.45, 0.2]
  if (socket === 'HipLeft') return [-0.34, 0.82, 0.05]
  if (socket === 'HipRight') return [0.34, 0.82, 0.05]
  return [0.58, 1.12, 0]
}

function socketAliases(socket: ForgeItemSocket) {
  if (socket === 'RightHand') return ['righthand', 'handr', 'rhand', 'mixamorigrighthand']
  if (socket === 'LeftHand') return ['lefthand', 'handl', 'lhand', 'mixamoriglefthand']
  if (socket === 'Back') return ['upperchest', 'chest', 'spine2', 'spine1', 'spine']
  if (socket === 'HipLeft') return ['lefthip', 'hipl', 'pelvis', 'hips']
  return ['righthip', 'hipr', 'pelvis', 'hips']
}

function normalizeNodeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}
