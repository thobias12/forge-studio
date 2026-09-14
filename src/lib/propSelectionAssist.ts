import * as THREE from 'three'

let installed = false

export function installPropSelectionAssist() {
  if (installed) return
  installed = true

  const originalMeshRaycast = THREE.Mesh.prototype.raycast

  THREE.Mesh.prototype.raycast = function propFriendlyRaycast(
    raycaster: THREE.Raycaster,
    intersects: THREE.Intersection[],
  ) {
    const before = intersects.length
    originalMeshRaycast.call(this, raycaster, intersects)

    if (!this.userData?.propId) return

    // If the real mesh already produced a hit, keep Three.js' precise result.
    for (let index = before; index < intersects.length; index += 1) {
      if (intersects[index]?.object === this) return
    }

    const geometry = this.geometry
    if (!geometry) return
    if (!geometry.boundingSphere) geometry.computeBoundingSphere()
    if (!geometry.boundingSphere) return

    const sphere = geometry.boundingSphere.clone().applyMatrix4(this.matrixWorld)

    // Tiny/thin dungeon props (torches, rubble, spikes, etc.) are otherwise
    // frustrating to reselect from an angled editor camera. This only affects
    // editor raycasting; it does not change visuals or gameplay collision.
    sphere.radius = Math.max(sphere.radius, 0.72)

    const point = raycaster.ray.intersectSphere(sphere, new THREE.Vector3())
    if (!point) return

    const distance = raycaster.ray.origin.distanceTo(point)
    if (distance < raycaster.near || distance > raycaster.far) return

    // Nudge assisted prop hits slightly forward so a room floor directly below
    // the prop does not steal the click when both are valid intersections.
    intersects.push({
      distance: Math.max(raycaster.near, distance - 0.18),
      point: point.clone(),
      object: this,
      face: null,
      faceIndex: undefined,
    } as THREE.Intersection)
  }
}
