import * as THREE from 'three'
import {
  propPrefabBounds,
  type PropMaterialPreset,
  type PropPart,
  type PropPrefab,
} from '../lib/propPrefab'

export type PropVisualOptions = {
  includeLights?: boolean
  showCollision?: boolean
  farProxy?: boolean
}

export function buildPropVisual(
  prefab: PropPrefab,
  options: PropVisualOptions = {},
) {
  const root = new THREE.Group()
  root.name = `PropPrefab_${prefab.id}`
  root.userData.forgePropPrefabId = prefab.id
  root.userData.forgePropPrefabName = prefab.name
  root.userData.forgePropCategory = prefab.category
  root.userData.forgePropPivot = [...prefab.pivot]
  root.userData.forgePropLod = { ...prefab.lod }

  if (options.farProxy) {
    root.add(buildPropFarProxy(prefab))
    return root
  }

  const content = new THREE.Group()
  content.name = 'PropContent'
  content.position.set(
    -prefab.pivot[0],
    -prefab.pivot[1],
    -prefab.pivot[2],
  )
  root.add(content)

  for (const part of prefab.parts) {
    const object = buildPropPartObject(part, {
      includeLights: options.includeLights !== false,
    })
    content.add(object)

    if (options.showCollision && part.collision) {
      const collision = buildPartCollisionWire(part)
      content.add(collision)
    }
  }

  return root
}

export function buildPropPartObject(
  part: PropPart,
  options: { includeLights?: boolean } = {},
) {
  const root = new THREE.Group()
  root.name = `PropPart_${part.kind}`
  root.userData.propPartId = part.id
  root.userData.forgePropPartKind = part.kind
  root.userData.forgePropPartCollision = part.collision
  root.userData.forgePropPartGroup = part.group
  root.position.set(...part.position)
  root.rotation.set(...part.rotation)
  root.scale.set(...part.scale)

  const material = propMaterial(part)
  const mesh = new THREE.Mesh(propGeometry(part.kind), material)
  mesh.name = `${part.name}_Mesh`
  mesh.userData.propPartId = part.id
  mesh.userData.forgePropPartCollision = part.collision
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)

  if (part.kind === 'wheel') {
    addWheelSpokes(root, part)
  }

  if (
    part.material === 'ember' &&
    options.includeLights !== false
  ) {
    const light = new THREE.PointLight(
      0xff7b35,
      .9,
      5.5,
    )
    light.name = 'PropEmissiveLight'
    light.userData.forgeEnvironmentLightBase = .9
    light.userData.propPartId = part.id
    root.add(light)
  }

  return root
}

export function buildPropFarProxy(prefab: PropPrefab) {
  const bounds = propPrefabBounds(prefab)
  const root = new THREE.Group()
  root.name = 'PropFarProxy'

  const material = new THREE.MeshStandardMaterial({
    color: averagePropColor(prefab),
    roughness: .95,
    metalness: .04,
  })
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(.1, bounds.width),
      Math.max(.1, bounds.height),
      Math.max(.1, bounds.depth),
    ),
    material,
  )
  box.position.set(
    -prefab.pivot[0],
    Math.max(.05, bounds.height * .5 - prefab.pivot[1]),
    -prefab.pivot[2],
  )
  box.castShadow = true
  box.receiveShadow = true
  root.add(box)
  return root
}

export function buildPropPivotMarker() {
  const root = new THREE.Group()
  root.name = 'PropPivotMarker'

  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(.085, 10, 7),
    new THREE.MeshBasicMaterial({
      color: 0xf2d47e,
      depthTest: false,
    }),
  )
  origin.renderOrder = 95
  root.add(origin)

  const axes = [
    { color: 0xdc6e68, rotation: [0, 0, -Math.PI / 2] as [number, number, number] },
    { color: 0x69c785, rotation: [0, 0, 0] as [number, number, number] },
    { color: 0x6f91d4, rotation: [Math.PI / 2, 0, 0] as [number, number, number] },
  ]
  for (const axis of axes) {
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(.015, .015, .65, 5),
      new THREE.MeshBasicMaterial({
        color: axis.color,
        depthTest: false,
        transparent: true,
        opacity: .9,
      }),
    )
    line.position.y = .325
    line.rotation.set(...axis.rotation)
    line.renderOrder = 94
    root.add(line)
  }
  return root
}

export function propMaterial(part: PropPart) {
  const preset = propMaterialPreset(part.material)
  const color = part.color
    ? new THREE.Color(part.color)
    : new THREE.Color(preset.color)

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: preset.emissive,
    emissiveIntensity: preset.emissiveIntensity,
    roughness: preset.roughness,
    metalness: preset.metalness,
    transparent: preset.transparent,
    opacity: preset.opacity,
    depthWrite: preset.depthWrite,
  })
  material.userData.forgePropMaterial = part.material
  return material
}

export function propMaterialPreset(
  material: PropMaterialPreset,
) {
  if (material === 'dark-stone') {
    return preset(0x41453f, 1, 0)
  }
  if (material === 'wood') {
    return preset(0x62472f, .96, 0)
  }
  if (material === 'dark-wood') {
    return preset(0x403025, 1, 0)
  }
  if (material === 'iron') {
    return preset(0x59615f, .5, .62)
  }
  if (material === 'bronze') {
    return preset(0x826343, .55, .48)
  }
  if (material === 'cloth') {
    return preset(0x75654b, 1, 0)
  }
  if (material === 'leather') {
    return preset(0x694735, .92, 0)
  }
  if (material === 'bone') {
    return preset(0xbab29a, .92, 0)
  }
  if (material === 'earth') {
    return preset(0x514535, 1, 0)
  }
  if (material === 'moss') {
    return preset(0x456142, 1, 0)
  }
  if (material === 'rope') {
    return preset(0x9b8056, 1, 0)
  }
  if (material === 'glass') {
    return {
      ...preset(0x9db7b3, .2, .08),
      transparent: true,
      opacity: .42,
      depthWrite: false,
    }
  }
  if (material === 'ember') {
    return {
      ...preset(0xffa653, .38, 0),
      emissive: 0xff5d23,
      emissiveIntensity: 1.8,
    }
  }
  return preset(0x6b6e65, 1, 0)
}

export function propGeometry(kind: PropPart['kind']) {
  if (kind === 'cylinder' || kind === 'post') {
    return new THREE.CylinderGeometry(.5, .54, 1, 8)
  }
  if (kind === 'sphere') {
    return new THREE.SphereGeometry(.5, 10, 7)
  }
  if (kind === 'rock') {
    return new THREE.DodecahedronGeometry(.5, 0)
  }
  if (kind === 'cone') {
    return new THREE.ConeGeometry(.5, 1, 7)
  }
  if (kind === 'wheel') {
    return new THREE.TorusGeometry(.38, .085, 7, 16)
  }
  if (kind === 'ring') {
    return new THREE.TorusGeometry(.4, .055, 6, 18)
  }
  return new THREE.BoxGeometry(1, 1, 1)
}

export function disposePropVisual(root?: THREE.Object3D) {
  if (!root) return
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.LineSegments
    ) {
      geometries.add(object.geometry)
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material]
      list.forEach((material) => materials.add(material))
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

function buildPartCollisionWire(part: PropPart) {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const edges = new THREE.EdgesGeometry(geometry)
  geometry.dispose()

  const lines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: 0xff775f,
      transparent: true,
      opacity: .48,
      depthTest: false,
    }),
  )
  lines.name = `Collision_${part.id}`
  lines.userData.propCollisionOverlay = true
  lines.position.set(...part.position)
  lines.rotation.set(...part.rotation)
  lines.scale.set(...part.scale)
  lines.renderOrder = 93
  return lines
}

function addWheelSpokes(root: THREE.Group, part: PropPart) {
  const spokeMaterial = propMaterial({
    ...part,
    color: undefined,
    material:
      part.material === 'iron' || part.material === 'bronze'
        ? part.material
        : 'dark-wood',
  })
  for (let index = 0; index < 6; index += 1) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(.56, .035, .035),
      spokeMaterial,
    )
    spoke.rotation.z = index / 6 * Math.PI
    spoke.castShadow = true
    root.add(spoke)
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(.08, .08, .13, 7),
    spokeMaterial,
  )
  hub.rotation.x = Math.PI / 2
  hub.castShadow = true
  root.add(hub)
}

function averagePropColor(prefab: PropPrefab) {
  if (!prefab.parts.length) return 0x62685f
  const color = new THREE.Color(0, 0, 0)
  for (const part of prefab.parts) {
    const partColor = part.color
      ? new THREE.Color(part.color)
      : new THREE.Color(propMaterialPreset(part.material).color)
    color.add(partColor)
  }
  color.multiplyScalar(1 / prefab.parts.length)
  return color.getHex()
}

function preset(
  color: number,
  roughness: number,
  metalness: number,
) {
  return {
    color,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness,
    metalness,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  }
}
