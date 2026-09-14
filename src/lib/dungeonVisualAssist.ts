import * as THREE from 'three'

let installed = false
let decorating = false

export function installDungeonVisualAssist() {
  if (installed) return
  installed = true

  const originalAdd = THREE.Object3D.prototype.add

  THREE.Object3D.prototype.add = function dungeonVisualAdd(this: THREE.Object3D, ...objects: THREE.Object3D[]) {
    const result = originalAdd.apply(this, objects)
    if (decorating || !isMapStudioActive()) return result

    decorating = true
    try {
      for (const object of objects) decorateAddedObject(this, object, originalAdd)
    } finally {
      decorating = false
    }
    return result
  }
}

function isMapStudioActive() {
  return window.location.hash.toLowerCase().includes('maps') || Boolean(document.querySelector('.map-studio-page'))
}

function decorateAddedObject(parent: THREE.Object3D, object: THREE.Object3D, originalAdd: THREE.Object3D['add']) {
  if (object.userData?.forgeVisualAssist) return

  if (object instanceof THREE.PointLight) {
    softenWarmPointLight(object)
    return
  }

  if (object instanceof THREE.Points) {
    softenAtmospherePoints(object)
    return
  }

  if (!(object instanceof THREE.Mesh)) return

  softenEmissiveMesh(object)
  softenRitualRing(object)

  if (object.userData?.roomId && object.geometry instanceof THREE.BoxGeometry) {
    decorateRoomStonework(parent, object, originalAdd)
  }

  if (object.userData?.propId) {
    decorateBuiltinProp(parent, object, originalAdd)
  }
}

function softenWarmPointLight(light: THREE.PointLight) {
  const { r, g, b } = light.color
  if (r < 0.72 || g < 0.18 || g > 0.78 || b > 0.52) return
  light.intensity *= 0.76
  light.distance = Math.max(light.distance * 1.38, 9.5)
  light.decay = Math.min(light.decay, 1.65)
}

function softenAtmospherePoints(points: THREE.Points) {
  const material = points.material
  if (!(material instanceof THREE.PointsMaterial) || !material.transparent) return
  if (material.size < 0.15) {
    material.opacity *= 0.56
    material.size *= 0.82
  } else if (material.size > 0.8) {
    material.opacity *= 0.74
  }
}

function softenEmissiveMesh(mesh: THREE.Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue
    if (material.emissiveIntensity <= 2.5) continue
    const { r, g, b } = material.emissive
    if (r < 0.65 || g < 0.12 || b > 0.55) continue
    material.emissiveIntensity = Math.min(material.emissiveIntensity, 2.05)
  }
}

function softenRitualRing(mesh: THREE.Mesh) {
  if (!(mesh.geometry instanceof THREE.RingGeometry)) return
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) {
    if (!(material instanceof THREE.MeshBasicMaterial)) continue
    if (material.blending !== THREE.AdditiveBlending) continue
    material.opacity = Math.min(material.opacity, 0.2)
  }
}

function decorateRoomStonework(parent: THREE.Object3D, mesh: THREE.Mesh, originalAdd: THREE.Object3D['add']) {
  const size = geometrySize(mesh.geometry)
  if (!size) return
  const thin = Math.min(size.x, size.z)
  const span = Math.max(size.x, size.z)
  const horizontal = size.x >= size.z

  // Corridor/door lintels are easy to identify from their short height and high position.
  if (mesh.position.y > 1.8 && size.y > 0.28 && size.y < 1.35 && thin < 0.55 && span > 1.2 && span < 4.6) {
    addStoneArch(parent, mesh, size, horizontal, originalAdd)
    return
  }

  // Full-height room walls get shallow recessed stone bays and pilasters.
  if (size.y > 2.15 && thin < 0.55 && span > 2.35) {
    addWallBay(parent, mesh, size, horizontal, originalAdd)
  }
}

function addStoneArch(parent: THREE.Object3D, lintel: THREE.Mesh, size: THREE.Vector3, horizontal: boolean, originalAdd: THREE.Object3D['add']) {
  const baseMaterial = stoneMaterialFrom(lintel, 0.78)
  const span = horizontal ? size.x : size.z
  const wallThickness = horizontal ? size.z : size.x
  const radius = Math.max(0.55, span / 2 - 0.08)
  const doorTop = lintel.position.y - size.y / 2
  const inward = horizontal ? -Math.sign(lintel.position.z || 1) : -Math.sign(lintel.position.x || 1)
  const faceOffset = wallThickness / 2 + 0.055

  const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.115, 7, 22, Math.PI), baseMaterial)
  arch.userData.forgeVisualAssist = true
  arch.position.copy(lintel.position)
  arch.position.y = doorTop
  arch.scale.y = 0.43
  if (horizontal) arch.position.z += inward * faceOffset
  else {
    arch.rotation.y = Math.PI / 2
    arch.position.x += inward * faceOffset
  }
  arch.castShadow = true
  arch.receiveShadow = true

  const jambHeight = Math.max(1.7, doorTop)
  const jambWidth = 0.18
  const jambDepth = wallThickness + 0.1
  const jambA = new THREE.Mesh(
    horizontal ? new THREE.BoxGeometry(jambWidth, jambHeight, jambDepth) : new THREE.BoxGeometry(jambDepth, jambHeight, jambWidth),
    baseMaterial,
  )
  jambA.userData.forgeVisualAssist = true
  jambA.position.copy(lintel.position)
  jambA.position.y = jambHeight / 2
  const jambB = jambA.clone()
  jambB.userData.forgeVisualAssist = true
  if (horizontal) {
    jambA.position.x -= radius
    jambB.position.x += radius
    jambA.position.z += inward * faceOffset
    jambB.position.z += inward * faceOffset
  } else {
    jambA.position.z -= radius
    jambB.position.z += radius
    jambA.position.x += inward * faceOffset
    jambB.position.x += inward * faceOffset
  }
  jambA.castShadow = jambB.castShadow = true
  jambA.receiveShadow = jambB.receiveShadow = true

  const keystone = new THREE.Mesh(
    horizontal ? new THREE.BoxGeometry(0.28, 0.34, jambDepth + 0.04) : new THREE.BoxGeometry(jambDepth + 0.04, 0.34, 0.28),
    stoneMaterialFrom(lintel, 0.62),
  )
  keystone.userData.forgeVisualAssist = true
  keystone.position.copy(lintel.position)
  keystone.position.y = doorTop + radius * 0.43
  if (horizontal) keystone.position.z += inward * (faceOffset + 0.015)
  else keystone.position.x += inward * (faceOffset + 0.015)
  keystone.castShadow = true
  keystone.receiveShadow = true

  originalAdd.call(parent, arch, jambA, jambB, keystone)
}

function addWallBay(parent: THREE.Object3D, wall: THREE.Mesh, size: THREE.Vector3, horizontal: boolean, originalAdd: THREE.Object3D['add']) {
  const span = horizontal ? size.x : size.z
  if (span < 2.8) return
  const wallThickness = horizontal ? size.z : size.x
  const inward = horizontal ? -Math.sign(wall.position.z || 1) : -Math.sign(wall.position.x || 1)
  const baySpan = Math.min(2.25, span * 0.55)
  const faceOffset = wallThickness / 2 + 0.035
  const dark = stoneMaterialFrom(wall, 0.53)
  const trim = stoneMaterialFrom(wall, 0.74)

  const panel = new THREE.Mesh(
    horizontal ? new THREE.BoxGeometry(baySpan, 1.2, 0.055) : new THREE.BoxGeometry(0.055, 1.2, baySpan),
    dark,
  )
  panel.userData.forgeVisualAssist = true
  panel.position.copy(wall.position)
  panel.position.y = Math.min(1.35, size.y * 0.43)
  if (horizontal) panel.position.z += inward * faceOffset
  else panel.position.x += inward * faceOffset
  panel.receiveShadow = true

  const pilasterGeometry = horizontal
    ? new THREE.BoxGeometry(0.13, 1.72, 0.1)
    : new THREE.BoxGeometry(0.1, 1.72, 0.13)
  const p1 = new THREE.Mesh(pilasterGeometry, trim)
  p1.userData.forgeVisualAssist = true
  p1.position.copy(panel.position)
  p1.position.y = 0.86
  const p2 = p1.clone()
  p2.userData.forgeVisualAssist = true
  if (horizontal) {
    p1.position.x -= baySpan / 2 + 0.08
    p2.position.x += baySpan / 2 + 0.08
  } else {
    p1.position.z -= baySpan / 2 + 0.08
    p2.position.z += baySpan / 2 + 0.08
  }
  p1.castShadow = p2.castShadow = true

  const sill = new THREE.Mesh(
    horizontal ? new THREE.BoxGeometry(baySpan + 0.3, 0.12, 0.12) : new THREE.BoxGeometry(0.12, 0.12, baySpan + 0.3),
    trim,
  )
  sill.userData.forgeVisualAssist = true
  sill.position.copy(panel.position)
  sill.position.y = 0.72
  sill.castShadow = true

  originalAdd.call(parent, panel, p1, p2, sill)
}

function decorateBuiltinProp(parent: THREE.Object3D, mesh: THREE.Mesh, originalAdd: THREE.Object3D['add']) {
  if (mesh.geometry instanceof THREE.CylinderGeometry) {
    const size = geometrySize(mesh.geometry)
    if (size && size.y > 1.55 && size.x < 1.3 && size.z < 1.3) {
      upgradePillar(parent, mesh, size, originalAdd)
    }
  }

  if (mesh.geometry instanceof THREE.CapsuleGeometry) {
    upgradeEffigy(parent, mesh, originalAdd)
  }
}

function upgradePillar(parent: THREE.Object3D, shaft: THREE.Mesh, size: THREE.Vector3, originalAdd: THREE.Object3D['add']) {
  const material = stoneMaterialFrom(shaft, 0.78)
  const radius = Math.max(size.x, size.z) * 0.54
  const bandGeometry = new THREE.CylinderGeometry(radius, radius, 0.13, 10)
  const lower = new THREE.Mesh(bandGeometry, material)
  lower.userData.forgeVisualAssist = true
  lower.position.copy(shaft.position)
  lower.position.y -= size.y * 0.29
  const upper = lower.clone()
  upper.userData.forgeVisualAssist = true
  upper.position.y = shaft.position.y + size.y * 0.29

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius * 1.08, 0.24, 10), material)
  neck.userData.forgeVisualAssist = true
  neck.position.copy(shaft.position)
  neck.position.y = shaft.position.y + size.y * 0.39

  lower.castShadow = upper.castShadow = neck.castShadow = true
  lower.receiveShadow = upper.receiveShadow = neck.receiveShadow = true
  originalAdd.call(parent, lower, upper, neck)
}

function upgradeEffigy(parent: THREE.Object3D, body: THREE.Mesh, originalAdd: THREE.Object3D['add']) {
  const material = stoneMaterialFrom(body, 0.68)
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.85, 0.18), material)
  back.userData.forgeVisualAssist = true
  back.position.set(body.position.x, body.position.y + 0.1, body.position.z + 0.19)
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.34), material)
  shoulders.userData.forgeVisualAssist = true
  shoulders.position.set(body.position.x, body.position.y + 0.52, body.position.z - 0.02)
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.48, 8), material)
  hood.userData.forgeVisualAssist = true
  hood.position.set(body.position.x, body.position.y + 1.08, body.position.z)
  hood.rotation.z = Math.PI
  const armA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.18), material)
  armA.userData.forgeVisualAssist = true
  armA.position.set(body.position.x - 0.27, body.position.y + 0.08, body.position.z - 0.14)
  armA.rotation.z = -0.12
  const armB = armA.clone()
  armB.userData.forgeVisualAssist = true
  armB.position.x = body.position.x + 0.27
  armB.rotation.z = 0.12
  for (const part of [back, shoulders, hood, armA, armB]) {
    part.castShadow = true
    part.receiveShadow = true
  }
  originalAdd.call(parent, back, shoulders, hood, armA, armB)
}

function stoneMaterialFrom(mesh: THREE.Mesh, shade: number) {
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  if (source instanceof THREE.MeshStandardMaterial) {
    const material = source.clone()
    material.color.multiplyScalar(shade)
    material.roughness = Math.max(material.roughness, 0.9)
    material.metalness = 0
    return material
  }
  return new THREE.MeshStandardMaterial({ color: 0x3e4540, roughness: 0.95 })
}

function geometrySize(geometry: THREE.BufferGeometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  if (!geometry.boundingBox) return undefined
  return geometry.boundingBox.getSize(new THREE.Vector3())
}
