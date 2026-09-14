import * as THREE from 'three'

let installed = false
let styling = false
let stoneColorSource: HTMLCanvasElement | undefined
let stoneRoughnessSource: HTMLCanvasElement | undefined

export function installReferenceDungeonLook() {
  if (installed) return
  installed = true

  const previousAdd = THREE.Object3D.prototype.add
  THREE.Object3D.prototype.add = function referenceDungeonAdd(this: THREE.Object3D, ...objects: THREE.Object3D[]) {
    const result = previousAdd.apply(this, objects)
    if (styling || !isMapStudioActive() || !isCryptActive()) return result

    styling = true
    try {
      for (const object of objects) styleObject(this, object, previousAdd)
    } finally {
      styling = false
    }
    return result
  }
}

function isMapStudioActive() {
  return window.location.hash.toLowerCase().includes('maps') || Boolean(document.querySelector('.map-studio-page'))
}

function isCryptActive() {
  return document.documentElement.dataset.forgeDungeonTheme === 'crypt'
}

function styleObject(parent: THREE.Object3D, object: THREE.Object3D, previousAdd: THREE.Object3D['add']) {
  if (object.userData?.referenceDungeonLook) return

  if (object instanceof THREE.HemisphereLight) {
    object.color.setHex(0x607a92)
    object.groundColor.setHex(0x10161c)
    object.intensity *= 1.18
    return
  }

  if (object instanceof THREE.DirectionalLight) {
    object.color.setHex(0x7995b0)
    object.intensity *= 1.08
    return
  }

  if (object instanceof THREE.PointLight) {
    stylePointLight(object)
    return
  }

  if (object instanceof THREE.Points) {
    const material = object.material
    if (material instanceof THREE.PointsMaterial && material.transparent) material.opacity *= 0.62
    return
  }

  if (!(object instanceof THREE.Mesh)) return
  styleWarmEmissive(object)

  if (!(object.geometry instanceof THREE.BoxGeometry)) {
    styleStoneProp(object)
    return
  }

  const size = geometrySize(object.geometry)
  if (!size) return

  const isFloor = size.y <= 0.24 && size.x > 0.75 && size.z > 0.75 && object.position.y < 0.45
  if (isFloor) {
    styleWetFloor(parent, object, size, previousAdd)
    return
  }

  const thinAxis = Math.min(size.x, size.z)
  if (size.y > 0.45 && thinAxis < 0.7) styleStoneWall(object, size)
}

function stylePointLight(light: THREE.PointLight) {
  const c = light.color
  const warm = c.r > 0.68 && c.g > 0.18 && c.g < 0.8 && c.b < 0.52
  if (!warm) return

  // dungeonVisualAssist already softens these once, so compensate here rather
  // than accidentally dimming the same torch twice.
  light.color.setHex(0xff9d5c)
  light.intensity *= 1.34
  light.distance = Math.max(light.distance, 12.5)
  light.decay = Math.min(light.decay, 1.38)
}

function styleWarmEmissive(mesh: THREE.Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  let warm = false
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue
    const e = material.emissive
    if (e.r > 0.68 && e.g > 0.12 && e.g < 0.78 && e.b < 0.54) {
      warm = true
      material.emissive.setHex(0xff9650)
      material.emissiveIntensity = Math.min(material.emissiveIntensity, 1.8)
      material.roughness = Math.max(material.roughness, 0.36)
    }
  }
  if (warm && mesh.geometry instanceof THREE.SphereGeometry) {
    mesh.scale.x *= 0.62
    mesh.scale.z *= 0.62
    mesh.scale.y *= 1.08
  }
}

function styleWetFloor(parent: THREE.Object3D, floor: THREE.Mesh, size: THREE.Vector3, previousAdd: THREE.Object3D['add']) {
  const source = Array.isArray(floor.material) ? floor.material[0] : floor.material
  if (!(source instanceof THREE.MeshStandardMaterial)) return

  const material = source.clone()
  const targetStone = new THREE.Color(0x465563)
  material.color.lerp(targetStone, 0.42)
  material.roughness = 0.47
  material.metalness = 0.018
  material.map = makeStoneTexture(false, Math.max(1, size.x / 2.4), Math.max(1, size.z / 2.4))
  material.roughnessMap = makeStoneTexture(true, Math.max(1, size.x / 2.4), Math.max(1, size.z / 2.4))
  material.bumpMap = material.roughnessMap
  material.bumpScale = 0.018
  material.needsUpdate = true
  floor.material = material
  floor.receiveShadow = true

  if (Math.max(size.x, size.z) < 2.2) return
  const puddleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x314455,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 0.95,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  })
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.58, 22), puddleMaterial)
  puddle.userData.referenceDungeonLook = true
  puddle.rotation.x = -Math.PI / 2
  puddle.rotation.z = floor.rotation.y
  puddle.position.copy(floor.position)
  puddle.position.y += size.y / 2 + 0.008
  puddle.position.x += Math.min(size.x * 0.18, 0.72)
  puddle.position.z -= Math.min(size.z * 0.12, 0.48)
  puddle.scale.set(Math.min(2.1, Math.max(0.9, size.x * 0.2)), Math.min(1.25, Math.max(0.55, size.z * 0.12)), 1)
  puddle.receiveShadow = true
  previousAdd.call(parent, puddle)
}

function styleStoneWall(mesh: THREE.Mesh, size: THREE.Vector3) {
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  if (!(source instanceof THREE.MeshStandardMaterial)) return

  const material = source.clone()
  material.color.lerp(new THREE.Color(0x4a5967), 0.38)
  material.roughness = Math.min(0.9, Math.max(0.78, material.roughness))
  material.metalness = 0
  const repeatX = size.x > size.z ? Math.max(1, size.x / 2.15) : 1.2
  const repeatY = Math.max(1, size.y / 1.75)
  material.map = makeStoneTexture(false, repeatX, repeatY)
  material.bumpMap = makeStoneTexture(true, repeatX, repeatY)
  material.bumpScale = 0.013
  material.needsUpdate = true
  mesh.material = material
}

function styleStoneProp(mesh: THREE.Mesh) {
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  if (!(source instanceof THREE.MeshStandardMaterial)) return
  if (source.metalness > 0.18 || source.emissiveIntensity > 0.25) return
  const c = source.color
  if (c.r > 0.55 && c.r > c.b * 1.25) return
  source.color.lerp(new THREE.Color(0x53616d), 0.26)
  source.roughness = Math.min(0.9, Math.max(0.74, source.roughness))
}

function makeStoneTexture(roughness: boolean, repeatX: number, repeatY: number) {
  const source = roughness ? getRoughnessCanvas() : getColorCanvas()
  const texture = new THREE.CanvasTexture(source)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = 4
  texture.colorSpace = roughness ? THREE.NoColorSpace : THREE.SRGBColorSpace
  return texture
}

function getColorCanvas() {
  if (stoneColorSource) return stoneColorSource
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  // Keep the albedo texture close to white: it should add variation, not
  // multiply the already-dark crypt material into near-black.
  ctx.fillStyle = '#e2e7ea'
  ctx.fillRect(0, 0, 256, 256)
  const random = seeded(0x51a7c0de)
  for (let i = 0; i < 900; i += 1) {
    const v = 188 + Math.floor(random() * 63)
    ctx.fillStyle = `rgba(${v},${Math.min(255, v + 4)},${Math.min(255, v + 8)},${0.025 + random() * 0.07})`
    const s = 1 + random() * 4
    ctx.fillRect(random() * 256, random() * 256, s, s)
  }
  ctx.strokeStyle = 'rgba(31,42,51,.16)'
  ctx.lineWidth = 1.2
  for (let i = 0; i < 14; i += 1) {
    let x = random() * 256, y = random() * 256
    ctx.beginPath(); ctx.moveTo(x, y)
    for (let j = 0; j < 4; j += 1) { x += (random() - 0.5) * 38; y += 10 + random() * 28; ctx.lineTo(x, y) }
    ctx.stroke()
  }
  stoneColorSource = canvas
  return canvas
}

function getRoughnessCanvas() {
  if (stoneRoughnessSource) return stoneRoughnessSource
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#b8b8b8'
  ctx.fillRect(0, 0, 256, 256)
  const random = seeded(0x0ddba11)
  for (let i = 0; i < 360; i += 1) {
    const wet = random() > 0.82
    const v = wet ? 62 + random() * 44 : 142 + random() * 74
    ctx.fillStyle = `rgba(${v},${v},${v},${0.09 + random() * 0.16})`
    ctx.beginPath()
    ctx.ellipse(random() * 256, random() * 256, 3 + random() * 20, 2 + random() * 12, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  stoneRoughnessSource = canvas
  return canvas
}

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function geometrySize(geometry: THREE.BufferGeometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  if (!geometry.boundingBox) return undefined
  return geometry.boundingBox.getSize(new THREE.Vector3())
}
