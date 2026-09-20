import { buildGeneratedItemModel, disposeGeneratedModel } from './skillboundItemModels'
import { recipeForItem } from './skillboundItems'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getAsset } from '../lib/library'
import type { ForgeItemDefinition, ForgeItemVisualDefinition } from './forgeProject'

const DEFAULT_TRANSFORM = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1 }

export function defaultItemVisual(masterAssetId?: string): ForgeItemVisualDefinition {
  return {
    masterAssetId,
    inventory: {
      autoIcon: true,
      cameraPreset: 'three-quarter',
      rotation: [0, -28, -42],
      scale: 1,
    },
    drop: {
      useMaster: true,
      transform: { ...DEFAULT_TRANSFORM, position: [0, 0, 0], rotation: [82, 10, -8] },
      groundOffset: 0.05,
    },
    equipped: {
      useMaster: true,
      socket: 'RightHand',
      transform: { ...DEFAULT_TRANSFORM, position: [0, 0, 0], rotation: [0, 0, 0] },
    },
  }
}

export function itemVisual(item: ForgeItemDefinition): ForgeItemVisualDefinition {
  const fallback = defaultItemVisual(item.modelAssetId)
  if (!item.visual) return fallback
  return {
    ...fallback,
    ...item.visual,
    masterAssetId: item.visual.masterAssetId ?? item.modelAssetId,
    inventory: { ...fallback.inventory, ...item.visual.inventory },
    drop: {
      ...fallback.drop,
      ...item.visual.drop,
      transform: { ...fallback.drop.transform, ...item.visual.drop.transform },
    },
    equipped: {
      ...fallback.equipped,
      ...item.visual.equipped,
      transform: { ...fallback.equipped.transform, ...item.visual.equipped.transform },
    },
  }
}

export function resolveItemModelAssetId(item: ForgeItemDefinition, mode: 'inventory' | 'drop' | 'equipped') {
  const visual = itemVisual(item)
  const master = visual.masterAssetId ?? item.modelAssetId
  if (mode === 'drop' && !visual.drop.useMaster) return visual.drop.modelAssetId ?? master
  if (mode === 'equipped' && !visual.equipped.useMaster) return visual.equipped.modelAssetId ?? master
  return master
}

export async function renderItemIconBlob(item: ForgeItemDefinition, size = 256): Promise<Blob> {
  const assetId = resolveItemModelAssetId(item, 'inventory')
  const generated = recipeForItem(item) ? await buildGeneratedItemModel(item) : undefined
  const asset = !generated && assetId ? await getAsset(assetId) : undefined
  if (!generated && !asset) throw new Error('Assign a model or Skillbound recipe before generating an icon.')
  const objectUrl = asset ? URL.createObjectURL(asset.blob) : undefined
  let model: THREE.Object3D | undefined = generated
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(size, size, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)

  try {
    const scene = new THREE.Scene()
    const root = generated ?? (await new GLTFLoader().loadAsync(objectUrl!)).scene
    model = root
    scene.add(root)
    scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x1b2028, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.1)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8eb9ff, 1.2)
    rim.position.set(-4, 2, -4)
    scene.add(rim)

    const visual = itemVisual(item)
    root.rotation.set(...visual.inventory.rotation.map((value) => THREE.MathUtils.degToRad(value)) as [number, number, number])
    root.scale.setScalar(visual.inventory.scale)

    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    const size3 = box.getSize(new THREE.Vector3())
    root.position.sub(center)

    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
    const span = Math.max(size3.x, size3.y, size3.z, 0.1)
    const distance = span * 2.35
    const preset = visual.inventory.cameraPreset
    if (preset === 'front') camera.position.set(0, 0.05 * span, distance)
    else if (preset === 'side') camera.position.set(distance, 0.05 * span, 0)
    else camera.position.set(distance * 0.7, distance * 0.45, distance * 0.85)
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)
    return await new Promise<Blob>((resolve, reject) => {
      renderer.domElement.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Forge could not encode the item icon.')), 'image/png')
    })
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    if (model) disposeGeneratedModel(model)
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
