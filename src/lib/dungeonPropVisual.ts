import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

export function createDungeonLibraryPropPlaceholder(
  color = 0x637788,
) {
  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(.8, .8, .8),
    new THREE.MeshStandardMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: .5,
    }),
  )
  placeholder.position.y = .4
  return placeholder
}

export async function loadDungeonLibraryPropVisual(
  target: THREE.Object3D,
  blob: Blob,
  scale: number,
  propId?: string,
) {
  const url = URL.createObjectURL(blob)
  try {
    const gltf = await loader.loadAsync(url)
    if (!target.parent) {
      disposeDungeonPropVisual(gltf.scene)
      return undefined
    }

    const model = gltf.scene
    const box = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    box.getSize(size)
    const max = Math.max(size.x, size.y, size.z, .001)
    model.scale.setScalar((1.6 / max) * scale)

    const fitted = new THREE.Box3().setFromObject(model)
    model.position.y -= fitted.min.y
    model.traverse((child) => {
      if (propId) child.userData.propId = propId
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    target.add(model)
    return model
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function disposeDungeonPropVisual(
  object: THREE.Object3D,
) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose?.()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    materials.forEach((material) => material.dispose?.())
  })
  object.removeFromParent()
}
