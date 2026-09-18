import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  sampleTerrainHeight,
  type GeneratedRegion,
  type GeneratedWorldPath,
  type GeneratedWorldPoi,
} from '../engine/guidedWorld'

type Props = {
  region: GeneratedRegion
  showRoute: boolean
  showBranches: boolean
  showLandmarks: boolean
  showBiome: boolean
}

type ViewState = {
  renderer?: THREE.WebGLRenderer
  scene?: THREE.Scene
  camera?: THREE.PerspectiveCamera
  controls?: OrbitControls
  root?: THREE.Group
  route?: THREE.Group
  branches?: THREE.Group
  landmarks?: THREE.Group
  biome?: THREE.Group
  observer?: ResizeObserver
  raf?: number
}

export default function WorldForgeViewport({ region, showRoute, showBranches, showLandmarks, showBiome }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ViewState>({})

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'world-forge-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1510)
    scene.fog = new THREE.FogExp2(0x101b15, .008)

    const camera = new THREE.PerspectiveCamera(42, 1, .1, 1200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.enablePan = true
    controls.rotateSpeed = .62
    controls.zoomSpeed = .82
    controls.maxPolarAngle = Math.PI * .47
    controls.minPolarAngle = Math.PI * .14

    scene.add(new THREE.HemisphereLight(0xcad8c1, 0x182018, 1.85))
    const sun = new THREE.DirectionalLight(0xffe0b3, 2.65)
    sun.position.set(-45, 70, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -130
    sun.shadow.camera.right = 130
    sun.shadow.camera.top = 130
    sun.shadow.camera.bottom = -130
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x70977d, .75)
    fill.position.set(50, 30, -60)
    scene.add(fill)

    stateRef.current = { renderer, scene, camera, controls }

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    stateRef.current.observer = observer
    resize()

    const frame = () => {
      controls.update()
      renderer.render(scene, camera)
      stateRef.current.raf = requestAnimationFrame(frame)
    }
    stateRef.current.raf = requestAnimationFrame(frame)

    return () => {
      if (stateRef.current.raf) cancelAnimationFrame(stateRef.current.raf)
      observer.disconnect()
      controls.dispose()
      disposeGroup(stateRef.current.root)
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = {}
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state.scene || !state.camera || !state.controls) return

    if (state.root) {
      state.scene.remove(state.root)
      disposeGroup(state.root)
    }

    const built = buildRegionScene(region)
    state.root = built.root
    state.route = built.route
    state.branches = built.branches
    state.landmarks = built.landmarks
    state.biome = built.biome
    state.scene.add(built.root)

    const width = region.bounds.maxX - region.bounds.minX
    const depth = region.bounds.maxZ - region.bounds.minZ
    const centerX = (region.bounds.minX + region.bounds.maxX) / 2
    const centerZ = (region.bounds.minZ + region.bounds.maxZ) / 2
    const span = Math.max(width, depth)
    state.controls.target.set(centerX, 0, centerZ)
    state.camera.position.set(centerX + span * .56, span * .62, centerZ + span * .65)
    state.camera.lookAt(centerX, 0, centerZ)
    state.controls.minDistance = Math.max(18, span * .16)
    state.controls.maxDistance = span * 1.7
    state.controls.update()

    built.route.visible = showRoute
    built.branches.visible = showBranches
    built.landmarks.visible = showLandmarks
    built.biome.visible = showBiome
  }, [region])

  useEffect(() => {
    if (stateRef.current.route) stateRef.current.route.visible = showRoute
  }, [showRoute])

  useEffect(() => {
    if (stateRef.current.branches) stateRef.current.branches.visible = showBranches
  }, [showBranches])

  useEffect(() => {
    if (stateRef.current.landmarks) stateRef.current.landmarks.visible = showLandmarks
  }, [showLandmarks])

  useEffect(() => {
    if (stateRef.current.biome) stateRef.current.biome.visible = showBiome
  }, [showBiome])

  return <div className="world-forge-map world-forge-map-3d" ref={hostRef}>
    <div className="world-forge-map-legend">
      <span><i className="main"/>Main road</span>
      <span><i className="branch"/>Side trails</span>
      <span><i className="landmark"/>POIs</span>
      <span><i className="biome"/>Biome dressing</span>
    </div>
    <div className="world-forge-camera-hint">LMB rotate · RMB pan · Wheel zoom</div>
  </div>
}

function buildRegionScene(region: GeneratedRegion) {
  const root = new THREE.Group()
  root.name = 'WorldForge2Region'

  const terrain = buildTerrain(region)
  root.add(terrain)

  const stream = buildStream(region)
  if (stream) root.add(stream)

  const route = new THREE.Group()
  route.name = 'MainRoutes'
  const branches = new THREE.Group()
  branches.name = 'BranchRoutes'
  for (const path of region.paths) {
    const mesh = makePathRibbon(region, path)
    ;(path.kind === 'main' ? route : branches).add(mesh)
  }
  root.add(route, branches)

  const biome = new THREE.Group()
  biome.name = 'BiomeDressing'
  addDressing(region, biome)
  root.add(biome)

  const landmarks = new THREE.Group()
  landmarks.name = 'Landmarks'
  for (const poi of region.pois) landmarks.add(makePoi(region, poi))
  addEntryExitMarkers(region, landmarks)
  root.add(landmarks)

  return { root, route, branches, landmarks, biome }
}

function buildTerrain(region: GeneratedRegion) {
  const { terrain, bounds } = region
  const resolution = terrain.resolution
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * (bounds.maxZ - bounds.minZ)
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * (bounds.maxX - bounds.minX)
      const height = terrain.heights[zIndex * resolution + xIndex] ?? 0
      positions.push(x, height, z)

      const normalized = THREE.MathUtils.clamp((height + 2.5) / 7, 0, 1)
      if (height < terrain.waterLevel + .45) color.set(0x263d2e)
      else if (normalized > .72) color.set(0x54604a)
      else if (normalized > .52) color.set(0x3b4e36)
      else color.set(0x2c442f)
      const variation = .88 + hashUnit(`${xIndex}:${zIndex}:${region.layerSeeds.terrain}`) * .18
      colors.push(color.r * variation, color.g * variation, color.b * variation)
    }
  }

  for (let z = 0; z < resolution - 1; z += 1) {
    for (let x = 0; x < resolution - 1; x += 1) {
      const a = z * resolution + x
      const b = a + 1
      const c = (z + 1) * resolution + x + 1
      const d = (z + 1) * resolution + x
      indices.push(a, d, b, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'GeneratedTerrain'
  mesh.receiveShadow = true
  return mesh
}

function buildStream(region: GeneratedRegion) {
  const points = region.terrain.stream
  if (points.length < 2) return undefined
  const width = 2.3 + Math.min(2.2, region.terrain.stream.length * .03)
  const geometry = makeRibbonGeometry(points, width, () => region.terrain.waterLevel + .045)
  const material = new THREE.MeshStandardMaterial({
    color: 0x315f63,
    roughness: .28,
    metalness: .05,
    transparent: true,
    opacity: .82,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'GeneratedStream'
  mesh.receiveShadow = true
  return mesh
}

function makePathRibbon(region: GeneratedRegion, path: GeneratedWorldPath) {
  const geometry = makeRibbonGeometry(
    path.points,
    path.width,
    (x, z) => sampleTerrainHeight(region, x, z) + .055,
  )
  const material = new THREE.MeshStandardMaterial({
    color: path.kind === 'main' ? 0x6b5940 : 0x4f4938,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = path.kind === 'main' ? 'MainRoad' : 'SideTrail'
  mesh.receiveShadow = true
  return mesh
}

function makeRibbonGeometry(
  points: Array<{ x: number; z: number }>,
  width: number,
  heightAt: (x: number, z: number) => number,
) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  points.forEach((point, index) => {
    const prev = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next.x - prev.x
    const dz = next.z - prev.z
    const length = Math.max(.001, Math.hypot(dx, dz))
    const nx = -dz / length
    const nz = dx / length
    const half = width / 2

    const leftX = point.x + nx * half
    const leftZ = point.z + nz * half
    const rightX = point.x - nx * half
    const rightZ = point.z - nz * half
    positions.push(
      leftX, heightAt(leftX, leftZ), leftZ,
      rightX, heightAt(rightX, rightZ), rightZ,
    )
    uvs.push(0, index / Math.max(1, points.length - 1), 1, index / Math.max(1, points.length - 1))

    if (index < points.length - 1) {
      const a = index * 2
      const b = a + 1
      const c = a + 3
      const d = a + 2
      indices.push(a, d, b, b, d, c)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addDressing(region: GeneratedRegion, group: THREE.Group) {
  const trees = region.dressing.filter((item) => item.type === 'tree')
  const rocks = region.dressing.filter((item) => item.type === 'rock')
  const ferns = region.dressing.filter((item) => item.type === 'fern')
  const logs = region.dressing.filter((item) => item.type === 'fallen-log')
  const stumps = region.dressing.filter((item) => item.type === 'stump')

  if (trees.length) {
    const trunkGeometry = new THREE.CylinderGeometry(.22, .34, 3, 6)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x382c22, roughness: 1 })
    const crownGeometry = new THREE.ConeGeometry(1.45, 4.2, 7)
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x203b28, roughness: 1 })
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length)
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, trees.length)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    trees.forEach((item, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0))
      scale.set(item.scale, item.scale * (1 + item.variant * .04), item.scale)
      matrix.compose(new THREE.Vector3(item.x, item.y + 1.45 * item.scale, item.z), quaternion, scale)
      trunks.setMatrixAt(index, matrix)

      const crownScale = item.scale * (.9 + item.variant * .055)
      scale.set(crownScale, crownScale, crownScale)
      matrix.compose(new THREE.Vector3(item.x, item.y + 4.05 * item.scale, item.z), quaternion, scale)
      crowns.setMatrixAt(index, matrix)
    })
    trunks.castShadow = true
    trunks.receiveShadow = true
    crowns.castShadow = true
    group.add(trunks, crowns)
  }

  if (rocks.length) {
    const geometry = new THREE.DodecahedronGeometry(.7, 0)
    const material = new THREE.MeshStandardMaterial({ color: 0x566057, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, rocks.length)
    setInstances(mesh, rocks, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .35 * item.scale, item.z),
      rotation: new THREE.Euler(item.rotation * .2, item.rotation, item.rotation * .13),
      scale: new THREE.Vector3(item.scale * 1.15, item.scale * .68, item.scale),
    }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  if (ferns.length) {
    const geometry = new THREE.ConeGeometry(.38, .72, 5)
    const material = new THREE.MeshStandardMaterial({ color: 0x31583a, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, ferns.length)
    setInstances(mesh, ferns, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .31 * item.scale, item.z),
      rotation: new THREE.Euler(0, item.rotation, 0),
      scale: new THREE.Vector3(item.scale, item.scale, item.scale),
    }))
    group.add(mesh)
  }

  if (logs.length) {
    const geometry = new THREE.CylinderGeometry(.25, .32, 2.4, 7)
    geometry.rotateZ(Math.PI / 2)
    const material = new THREE.MeshStandardMaterial({ color: 0x443328, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, logs.length)
    setInstances(mesh, logs, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .22, item.z),
      rotation: new THREE.Euler(.05, item.rotation, .08),
      scale: new THREE.Vector3(item.scale, item.scale, item.scale),
    }))
    mesh.castShadow = true
    group.add(mesh)
  }

  if (stumps.length) {
    const geometry = new THREE.CylinderGeometry(.38, .48, .65, 7)
    const material = new THREE.MeshStandardMaterial({ color: 0x49362a, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, stumps.length)
    setInstances(mesh, stumps, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .28 * item.scale, item.z),
      rotation: new THREE.Euler(0, item.rotation, 0),
      scale: new THREE.Vector3(item.scale, item.scale, item.scale),
    }))
    mesh.castShadow = true
    group.add(mesh)
  }
}

function setInstances(
  mesh: THREE.InstancedMesh,
  items: GeneratedRegion['dressing'],
  transform: (item: GeneratedRegion['dressing'][number]) => {
    position: THREE.Vector3
    rotation: THREE.Euler
    scale: THREE.Vector3
  },
) {
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  items.forEach((item, index) => {
    const value = transform(item)
    quaternion.setFromEuler(value.rotation)
    matrix.compose(value.position, quaternion, value.scale)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}

function makePoi(region: GeneratedRegion, poi: GeneratedWorldPoi) {
  const group = new THREE.Group()
  group.name = `POI_${poi.type}`
  const y = sampleTerrainHeight(region, poi.x, poi.z)
  group.position.set(poi.x, y, poi.z)
  group.rotation.y = poi.rotation

  const stone = new THREE.MeshStandardMaterial({ color: 0x656b61, roughness: 1 })
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x454a43, roughness: 1 })
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5d5842, roughness: 1 })

  if (poi.type === 'ruins') {
    addBox(group, [-2.3, .85, 0], [.65, 1.7, 5], stone, [0, .16, 0])
    addBox(group, [1.8, .55, 1.25], [.65, 1.1, 3], darkStone, [0, -.25, 0])
    addBox(group, [0, .25, -1.8], [4.5, .5, .65], darkStone, [0, .08, 0])
  } else if (poi.type === 'camp' || poi.type === 'settlement') {
    const tents = poi.type === 'settlement' ? 4 : 2
    for (let i = 0; i < tents; i += 1) {
      const angle = i / tents * Math.PI * 2
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.1, 4), cloth)
      tent.position.set(Math.cos(angle) * 2.8, 1, Math.sin(angle) * 2.8)
      tent.rotation.y = Math.PI / 4 + angle
      tent.castShadow = true
      group.add(tent)
    }
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .08, 12), new THREE.MeshStandardMaterial({ color: 0x6a3823, emissive: 0xff7a2d, emissiveIntensity: .7 }))
    fire.position.y = .08
    group.add(fire)
  } else if (poi.type === 'shrine') {
    addBox(group, [0, .3, 0], [2.2, .6, 1.8], darkStone)
    addBox(group, [0, 1.4, 0], [.7, 2.2, .55], stone)
    const glow = new THREE.PointLight(0xd6c58a, 1.6, 8)
    glow.position.y = 2.6
    group.add(glow)
  } else if (poi.type === 'standing-stones') {
    for (let i = -1; i <= 1; i += 1) addBox(group, [i * 1.55, 1.35 + Math.abs(i) * .12, i === 0 ? 0 : .35], [.75, 2.7, .7], stone, [0, i * .11, i * .05])
  } else if (poi.type === 'beast-den') {
    const outer = new THREE.Mesh(new THREE.TorusGeometry(1.8, .55, 7, 12, Math.PI), darkStone)
    outer.rotation.x = Math.PI / 2
    outer.position.y = 1.1
    outer.castShadow = true
    group.add(outer)
    addBox(group, [0, .2, .45], [3.7, .4, 2.6], darkStone)
  } else if (poi.type === 'graveyard') {
    for (let i = 0; i < 8; i += 1) {
      const col = i % 4
      const row = Math.floor(i / 4)
      addBox(group, [-2.2 + col * 1.45, .55, -1 + row * 2], [.45, 1.1, .2], stone, [0, (i % 3 - 1) * .08, 0])
    }
  } else if (poi.type === 'watchtower') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 2.15, 5.8, 7), stone)
    tower.position.y = 2.8
    tower.castShadow = true
    group.add(tower)
    const broken = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, .45, 7), darkStone)
    broken.position.y = 5.55
    group.add(broken)
  } else if (poi.type === 'dungeon') {
    addBox(group, [-1.55, 1.35, 0], [.75, 2.7, .8], stone)
    addBox(group, [1.55, 1.35, 0], [.75, 2.7, .8], stone)
    addBox(group, [0, 2.75, 0], [3.85, .7, .85], darkStone)
    const darkness = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.3), new THREE.MeshBasicMaterial({ color: 0x080b09, side: THREE.DoubleSide }))
    darkness.position.set(0, 1.15, .43)
    group.add(darkness)
  }

  const label = makeLabelSprite(poi.label)
  label.position.set(0, Math.max(3.5, poi.radius * .58), 0)
  group.add(label)
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return group
}

function addEntryExitMarkers(region: GeneratedRegion, group: THREE.Group) {
  for (const kind of ['entry', 'exit'] as const) {
    const node = region.nodes.find((item) => item.kind === kind)
    if (!node) continue
    const y = sampleTerrainHeight(region, node.x, node.z)
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(.55, .8, 2.4, 8),
      new THREE.MeshStandardMaterial({
        color: kind === 'entry' ? 0x4e8b63 : 0x9a7f4d,
        emissive: kind === 'entry' ? 0x183523 : 0x3a2b13,
        emissiveIntensity: .45,
        roughness: .8,
      }),
    )
    marker.position.set(node.x, y + 1.1, node.z)
    marker.castShadow = true
    group.add(marker)
    const label = makeLabelSprite(node.label)
    label.position.set(node.x, y + 3.15, node.z)
    group.add(label)
  }
}

function addBox(
  group: THREE.Group,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  group.add(mesh)
  return mesh
}

function makeLabelSprite(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 72
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.font = '700 28px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 7
  context.strokeStyle = 'rgba(8,12,9,.9)'
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillStyle = '#e2e9df'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(7.4, 1.4, 1)
  return sprite
}

function disposeGroup(root?: THREE.Object3D) {
  if (!root) return
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return
    if (object instanceof THREE.Mesh) object.geometry?.dispose()
    const list = Array.isArray(object.material) ? object.material : [object.material]
    list.forEach((material) => {
      if (!material) return
      if (material instanceof THREE.SpriteMaterial) material.map?.dispose()
      materials.add(material)
    })
  })
  materials.forEach((material) => material.dispose())
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}
