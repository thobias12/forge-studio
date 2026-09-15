import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getAsset } from '../lib/library'
import { itemVisual, resolveItemModelAssetId } from '../engine/itemPresentation'
import { isWearableArmor, itemClassification, wearableAnchor, type ForgeItemEquipSlot } from '../engine/itemTaxonomy'
import type { ForgeItemDefinition, ForgeItemTransform } from '../engine/forgeProject'

type Mode = 'inventory' | 'drop' | 'equipped'
type InventoryCameraPreset = 'three-quarter' | 'front' | 'side'

export default function ItemModelPreview({ item, mode }: { item: ForgeItemDefinition; mode: Mode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('Loading preview…')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let frame = 0
    let objectUrl = ''

    const scene = new THREE.Scene()
    if (mode !== 'inventory') scene.background = new THREE.Color(0x0b1017)
    const presentation = new THREE.Group()
    presentation.name = 'ItemPresentation'
    scene.add(presentation)

    const camera = new THREE.PerspectiveCamera(mode === 'inventory' ? 31 : 38, 1, 0.01, 120)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: mode === 'inventory' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, mode === 'inventory' ? 0 : 1)
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.rotateSpeed = 0.65
    controls.zoomSpeed = 0.8

    scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x141922, 1.75))
    const key = new THREE.DirectionalLight(0xffffff, 2.8)
    key.position.set(4, 7, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x739dce, 1.1)
    rim.position.set(-5, 3, -4)
    scene.add(rim)

    if (mode === 'drop' || mode === 'equipped') {
      const grid = new THREE.GridHelper(6, 12, 0x2c3a4b, 0x18212c)
      grid.position.y = -0.001
      scene.add(grid)
    }

    let mannequin: THREE.Group | undefined
    if (mode === 'equipped') {
      mannequin = createMannequin()
      presentation.add(mannequin)
    }

    const resize = () => {
      const width = Math.max(80, host.clientWidth)
      const height = Math.max(80, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }
    tick()

    const load = async () => {
      try {
        const visual = itemVisual(item)
        const assetId = resolveItemModelAssetId(item, mode)
        const classification = itemClassification(item)
        if (!assetId) {
          setMessage('Assign a master model')
          if (mode === 'equipped' && classification.itemType === 'armor') frameWearableCamera(camera, controls, classification.equipSlot)
          else frameCamera(camera, controls, mode, mannequin, visual.inventory.cameraPreset)
          return
        }
        const asset = await getAsset(assetId)
        if (!asset) {
          setMessage('Model is missing from Shared Library')
          if (mode === 'equipped' && classification.itemType === 'armor') frameWearableCamera(camera, controls, classification.equipSlot)
          else frameCamera(camera, controls, mode, mannequin, visual.inventory.cameraPreset)
          return
        }
        objectUrl = URL.createObjectURL(asset.blob)
        const gltf = await new GLTFLoader().loadAsync(objectUrl)
        if (disposed) return
        const root = gltf.scene
        presentation.add(root)

        if (mode === 'inventory') {
          applyTransform(root, { position: [0, 0, 0], rotation: visual.inventory.rotation, scale: visual.inventory.scale })
        } else if (mode === 'drop') {
          const transform = visual.drop.transform
          applyTransform(root, {
            ...transform,
            position: [transform.position[0], transform.position[1] + visual.drop.groundOffset, transform.position[2]],
          })
        } else if (isWearableArmor(item)) {
          const transform = visual.equipped.transform
          const base = wearableAnchor(classification.equipSlot)
          applyTransform(root, {
            ...transform,
            position: [base[0] + transform.position[0], base[1] + transform.position[1], base[2] + transform.position[2]],
          })
        } else {
          const transform = visual.equipped.transform
          const socketBase = socketPosition(visual.equipped.socket)
          applyTransform(root, {
            ...transform,
            position: [socketBase[0] + transform.position[0], socketBase[1] + transform.position[1], socketBase[2] + transform.position[2]],
          })
        }

        normalizeObjectPivot(root, mode)
        if (mode === 'equipped' && isWearableArmor(item)) frameWearableCamera(camera, controls, classification.equipSlot)
        else frameCamera(camera, controls, mode, mode === 'equipped' ? presentation : root, visual.inventory.cameraPreset)
        setMessage('')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not render model')
      }
    }
    void load()

    return () => {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach((material) => material.dispose())
        }
      })
    }
  }, [item, mode])

  return <div className={`item-model-preview ${mode}`} ref={hostRef}>{message && <div className="item-preview-message">{message}</div>}</div>
}

function applyTransform(root: THREE.Object3D, transform: ForgeItemTransform) {
  const [x, y, z] = transform.position
  const [rx, ry, rz] = transform.rotation.map((value) => THREE.MathUtils.degToRad(value)) as [number, number, number]
  root.position.set(x, y, z)
  root.rotation.set(rx, ry, rz)
  root.scale.setScalar(transform.scale)
}

function normalizeObjectPivot(root: THREE.Object3D, mode: Mode) {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  if (mode === 'inventory') root.position.sub(center)
  if (mode === 'drop') root.position.y -= box.min.y
}

function frameCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, mode: Mode, target?: THREE.Object3D, inventoryPreset: InventoryCameraPreset = 'three-quarter') {
  const box = target ? new THREE.Box3().setFromObject(target) : new THREE.Box3(new THREE.Vector3(-.5, 0, -.5), new THREE.Vector3(.5, 1.8, .5))
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.y, size.z, mode === 'equipped' ? 1.8 : .5)
  controls.target.copy(center)

  if (mode === 'inventory') {
    if (inventoryPreset === 'front') camera.position.set(center.x, center.y + span * .03, center.z + span * 2.05)
    else if (inventoryPreset === 'side') camera.position.set(center.x + span * 2.05, center.y + span * .03, center.z)
    else camera.position.set(center.x + span * 1.18, center.y + span * .68, center.z + span * 1.58)
  } else if (mode === 'drop') camera.position.set(center.x + span * 1.15, center.y + span * .82, center.z + span * 1.28)
  else camera.position.set(center.x + span * 1.02, center.y + span * .34, center.z + span * 1.72)

  camera.lookAt(center)
  controls.update()
}

function frameWearableCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, slot: ForgeItemEquipSlot) {
  const [x, y, z] = wearableAnchor(slot)
  const center = new THREE.Vector3(x, y, z)
  const span = slot === 'Head' ? .72 : slot === 'Chest' ? 1.05 : slot === 'Hands' ? 1.35 : slot === 'Legs' ? 1.08 : .85
  controls.target.copy(center)
  camera.position.set(center.x + span * .86, center.y + span * .16, center.z + span * 1.58)
  camera.lookAt(center)
  controls.update()
}

function socketPosition(socket: string): [number, number, number] {
  if (socket === 'LeftHand') return [-.58, 1.12, 0]
  if (socket === 'Back') return [0, 1.45, .2]
  if (socket === 'HipLeft') return [-.34, .82, .05]
  if (socket === 'HipRight') return [.34, .82, .05]
  return [.58, 1.12, 0]
}

function createMannequin() {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: 0x465361, roughness: .78, metalness: .05, transparent: true, opacity: .82 })
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x607080, roughness: .72, transparent: true, opacity: .82 })
  const add = (geometry: THREE.BufferGeometry, position: [number, number, number], rotation?: [number, number, number], materialOverride = material) => {
    const mesh = new THREE.Mesh(geometry, materialOverride)
    mesh.position.set(...position)
    if (rotation) mesh.rotation.set(...rotation)
    group.add(mesh)
  }
  add(new THREE.CapsuleGeometry(.22, .46, 6, 10), [0, 1.28, 0])
  add(new THREE.SphereGeometry(.18, 16, 12), [0, 1.82, 0])
  add(new THREE.CapsuleGeometry(.08, .48, 5, 8), [-.37, 1.3, 0], [0, 0, -.18])
  add(new THREE.CapsuleGeometry(.08, .48, 5, 8), [.37, 1.3, 0], [0, 0, .18])
  add(new THREE.SphereGeometry(.09, 10, 8), [-.58, 1.12, 0], undefined, jointMaterial)
  add(new THREE.SphereGeometry(.09, 10, 8), [.58, 1.12, 0], undefined, jointMaterial)
  add(new THREE.CapsuleGeometry(.09, .58, 5, 8), [-.15, .55, 0])
  add(new THREE.CapsuleGeometry(.09, .58, 5, 8), [.15, .55, 0])
  add(new THREE.BoxGeometry(.16, .1, .28), [-.15, .08, -.08], undefined, jointMaterial)
  add(new THREE.BoxGeometry(.16, .1, .28), [.15, .08, -.08], undefined, jointMaterial)
  group.position.y = .05
  return group
}
