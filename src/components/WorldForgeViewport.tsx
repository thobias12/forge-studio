import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  buildRiverOccupancyMask,
  riverOccupancySample,
  sampleStreamHeight,
  sampleTerrainHeight,
  streamRenderContinuityIssues,
  streamRenderProfile,
  streamWaterSurfaceRows,
  worldBoundaryBackdropHeight,
  sampleTerrainSurface,
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
  showBoundary: boolean
  showRiverDebug: boolean
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
  boundary?: THREE.Group
  riverDebug?: THREE.Group
  observer?: ResizeObserver
  raf?: number
}

export default function WorldForgeViewport({ region, showRoute, showBranches, showLandmarks, showBiome, showBoundary, showRiverDebug }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ViewState>({})

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'world-forge-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x17231a)
    scene.fog = new THREE.FogExp2(0x1a281e, .0064)

    const camera = new THREE.PerspectiveCamera(42, 1, .1, 1200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.enablePan = true
    controls.rotateSpeed = .62
    controls.zoomSpeed = .82
    controls.maxPolarAngle = Math.PI * .47
    controls.minPolarAngle = Math.PI * .14

    scene.add(new THREE.HemisphereLight(0xd7e3d2, 0x253026, 2.25))
    const sun = new THREE.DirectionalLight(0xffe4ba, 3.1)
    sun.position.set(-45, 70, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -130
    sun.shadow.camera.right = 130
    sun.shadow.camera.top = 130
    sun.shadow.camera.bottom = -130
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x86a891, 1.05)
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
    state.boundary = built.boundary
    state.riverDebug = built.riverDebug
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
    built.boundary.visible = showBoundary
    built.riverDebug.visible = showRiverDebug
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

  useEffect(() => {
    if (stateRef.current.boundary) stateRef.current.boundary.visible = showBoundary
  }, [showBoundary])

  useEffect(() => {
    if (stateRef.current.riverDebug) stateRef.current.riverDebug.visible = showRiverDebug
  }, [showRiverDebug])

  return <div className="world-forge-map world-forge-map-3d" ref={hostRef}>
    <div className="world-forge-map-legend">
      <span><i className="main"/>Main road</span>
      <span><i className="branch"/>Side trails</span>
      <span><i className="landmark"/>POIs</span>
      <span><i className="biome"/>Biome dressing</span>
    </div>
    {showRiverDebug && <div className="world-forge-river-debug-legend">
      <span><i className="raw"/>Raw frozen hydrology</span>
      <span><i className="profile"/>Render profile</span>
      <span><i className="rows"/>Water row centers</span>
      <span><i className="mask"/>River occupancy</span>
      <span><i className="bounds"/>Terrain bounds</span>
      <span><i className="start"/>START</span>
      <span><i className="end"/>END</span>
    </div>}
    <div className="world-forge-camera-hint">LMB rotate · RMB pan · Wheel zoom</div>
  </div>
}

function buildRegionScene(region: GeneratedRegion) {
  const root = new THREE.Group()
  root.name = 'WorldForge2Region'

  const backdrop = buildBoundaryBackdrop(region)
  root.add(backdrop)

  const terrain = buildTerrain(region)
  root.add(terrain)

  const boundary = buildTerrainBoundaryDebug(region)
  boundary.visible = false
  root.add(boundary)

  const stream = buildStream(region)
  if (stream) root.add(stream)

  const riverDebug = buildRiverDiagnostics(region)
  riverDebug.visible = false
  root.add(riverDebug)

  const route = new THREE.Group()
  route.name = 'MainRoutes'
  const branches = new THREE.Group()
  branches.name = 'BranchRoutes'
  for (const path of region.paths) {
    const mesh = makePathRibbon(region, path)
    ;(path.kind === 'main' ? route : branches).add(mesh)
  }


  for (const crossing of region.crossings) {
    const crossingMesh = makeCrossing(region, crossing)
    route.add(crossingMesh)
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

  return { root, route, branches, landmarks, biome, boundary, riverDebug }
}

function buildRiverDiagnostics(region: GeneratedRegion) {
  const group = new THREE.Group()
  group.name = 'RiverDiagnostics'

  const raw = region.terrain.stream
  const rawHeights = region.terrain.streamHeights
  const profile = streamRenderProfile(region)
  const surface = streamWaterSurfaceRows(region, 5, .065)
  const occupancyMask = buildRiverOccupancyMask(
    region.terrain.stream,
    region.terrain.streamWidths,
  )

  if (occupancyMask.points.length > 1) {
    const left: THREE.Vector3[] = []
    const right: THREE.Vector3[] = []
    for (const point of occupancyMask.points) {
      const sample = riverOccupancySample(occupancyMask, point.x, point.z)
      const nx = -sample.tangentZ
      const nz = sample.tangentX
      const y = sampleTerrainHeight(region, point.x, point.z) + 1.02
      left.push(new THREE.Vector3(
        point.x + nx * sample.radius,
        y,
        point.z + nz * sample.radius,
      ))
      right.push(new THREE.Vector3(
        point.x - nx * sample.radius,
        y,
        point.z - nz * sample.radius,
      ))
    }
    group.add(makeRiverDebugLine(left, 0xff9f43))
    group.add(makeRiverDebugLine(right, 0xff9f43))
  }

  if (raw.length > 1) {
    const rawPoints = raw.map((point, index) => new THREE.Vector3(
      point.x,
      Math.max(
        (rawHeights[index] ?? region.terrain.waterLevel) + .8,
        sampleTerrainHeight(region, point.x, point.z) + .8,
      ),
      point.z,
    ))
    group.add(makeRiverDebugLine(rawPoints, 0xff3ccf))

    group.add(makeRiverEndpointMarker(
      rawPoints[0],
      0x63ff85,
      'sphere',
    ))
    group.add(makeRiverEndpointMarker(
      rawPoints[rawPoints.length - 1],
      0xff5b5b,
      'sphere',
    ))
  }

  if (profile.points.length > 1) {
    const renderPoints = profile.points.map((point, index) => new THREE.Vector3(
      point.x,
      (surface.rows[index]?.y ?? profile.heights[index] ?? region.terrain.waterLevel) + .46,
      point.z,
    ))
    group.add(makeRiverDebugLine(renderPoints, 0x35e8ff))

    group.add(makeRiverEndpointMarker(
      renderPoints[0],
      0x63ff85,
      'box',
    ))
    group.add(makeRiverEndpointMarker(
      renderPoints[renderPoints.length - 1],
      0xff5b5b,
      'box',
    ))
  }

  if (surface.rows.length) {
    const positions: number[] = []
    for (const row of surface.rows) {
      positions.push(row.x, row.y + .7, row.z)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: 0xffe85b,
      size: .62,
      sizeAttenuation: true,
      depthTest: false,
      transparent: true,
      opacity: .95,
    })
    const dots = new THREE.Points(geometry, material)
    dots.renderOrder = 94
    group.add(dots)
  }

  const boundsPoints = [
    new THREE.Vector3(region.bounds.minX, 1.8, region.bounds.minZ),
    new THREE.Vector3(region.bounds.maxX, 1.8, region.bounds.minZ),
    new THREE.Vector3(region.bounds.maxX, 1.8, region.bounds.maxZ),
    new THREE.Vector3(region.bounds.minX, 1.8, region.bounds.maxZ),
  ]
  const boundsGeometry = new THREE.BufferGeometry().setFromPoints(boundsPoints)
  const boundsMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    transparent: true,
    opacity: .95,
  })
  const boundsLine = new THREE.LineLoop(boundsGeometry, boundsMaterial)
  boundsLine.renderOrder = 95
  group.add(boundsLine)

  return group
}

function makeRiverDebugLine(points: THREE.Vector3[], color: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: .96,
  })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = 93
  return line
}

function makeRiverEndpointMarker(
  position: THREE.Vector3,
  color: number,
  shape: 'sphere' | 'box',
) {
  const geometry = shape === 'sphere'
    ? new THREE.SphereGeometry(.72, 12, 8)
    : new THREE.BoxGeometry(1.15, 1.15, 1.15)
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
    opacity: .98,
  })
  const marker = new THREE.Mesh(geometry, material)
  marker.position.copy(position)
  marker.renderOrder = 96
  return marker
}

function buildTerrainBoundaryDebug(region: GeneratedRegion) {
  const group = new THREE.Group()
  group.name = 'TerrainBoundaryDebug'

  const samplesPerEdge = 28
  const points: THREE.Vector3[] = []
  const pushEdge = (
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ) => {
    for (let index = 0; index < samplesPerEdge; index += 1) {
      const t = index / samplesPerEdge
      const x = THREE.MathUtils.lerp(fromX, toX, t)
      const z = THREE.MathUtils.lerp(fromZ, toZ, t)
      points.push(new THREE.Vector3(x, sampleTerrainHeight(region, x, z) + .32, z))
    }
  }

  const { minX, maxX, minZ, maxZ } = region.bounds
  pushEdge(minX, minZ, maxX, minZ)
  pushEdge(maxX, minZ, maxX, maxZ)
  pushEdge(maxX, maxZ, minX, maxZ)
  pushEdge(minX, maxZ, minX, minZ)

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color: 0x69e7d0,
    transparent: true,
    opacity: .9,
    depthTest: false,
  })
  const line = new THREE.LineLoop(geometry, material)
  line.renderOrder = 50
  group.add(line)
  return group
}

function buildBoundaryBackdrop(region: GeneratedRegion) {
  const width = region.bounds.maxX - region.bounds.minX
  const depth = region.bounds.maxZ - region.bounds.minZ
  const centerX = (region.bounds.minX + region.bounds.maxX) / 2
  const centerZ = (region.bounds.minZ + region.bounds.maxZ) / 2
  const palette = editorBiomePalette(region.biome)
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 90, depth + 90),
    new THREE.MeshStandardMaterial({ color: palette.low, roughness: 1, metalness: 0 }),
  )
  backdrop.rotation.x = -Math.PI / 2
  backdrop.position.set(centerX, worldBoundaryBackdropHeight(region), centerZ)
  backdrop.receiveShadow = true
  backdrop.name = 'WorldBoundaryBackdrop'
  return backdrop
}

function buildTerrain(region: GeneratedRegion) {
  const { terrain, bounds } = region
  const resolution = terrain.resolution
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()
  const palette = editorBiomePalette(region.biome)
  const surfacePalette = editorSurfacePalette(region.biome)
  const forestFloorColor = new THREE.Color(surfacePalette.forestFloor)
  const mossColor = new THREE.Color(surfacePalette.moss)
  const soilColor = new THREE.Color(surfacePalette.soil)
  const meadowColor = new THREE.Color(surfacePalette.meadow)
  const scrubColor = new THREE.Color(surfacePalette.scrub)
  const rockyColor = new THREE.Color(surfacePalette.rocky)

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * (bounds.maxZ - bounds.minZ)
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * (bounds.maxX - bounds.minX)
      const height = terrain.heights[zIndex * resolution + xIndex] ?? 0
      positions.push(x, height, z)

      const normalized = THREE.MathUtils.clamp((height + 2.5) / 7, 0, 1)
      if (height < terrain.waterLevel + .45) color.set(palette.low)
      else if (normalized > .72) color.set(palette.high)
      else if (normalized > .52) color.set(palette.mid)
      else color.set(palette.ground)

      const surface = sampleTerrainSurface(region, x, z)
      color.lerp(forestFloorColor, surface.forestFloor * .27)
      color.lerp(mossColor, surface.moss * .22)
      color.lerp(meadowColor, surface.meadow * .31)
      color.lerp(scrubColor, surface.scrub * .2)
      color.lerp(rockyColor, surface.rocky * .29)
      color.lerp(soilColor, Math.max(surface.soil * .24, surface.poiWear * .68, surface.roadWear * .42))
      const variation = .96 + (surface.medium - .5) * .08 + (surface.fine - .5) * .06
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
  if (region.terrain.stream.length < 2) return undefined

  const group = new THREE.Group()
  group.name = 'GeneratedStream'

  {
    const issues = streamRenderContinuityIssues(region)
    if (issues.length) console.warn('[World Forge] River continuity', issues)
  }

  const water = new THREE.Mesh(
    makeTerrainSafeWaterGeometry(region),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: 0x123f40,
      emissiveIntensity: .12,
      roughness: .46,
      metalness: 0,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    }),
  )
  water.castShadow = false
  water.receiveShadow = false
  water.renderOrder = 20
  water.frustumCulled = false
  group.add(water)
  return group
}

function makePathRibbon(region: GeneratedRegion, path: GeneratedWorldPath) {
  const widths = path.widths.length === path.points.length ? path.widths : path.points.map(() => path.width)
  const road = new THREE.Mesh(
    makeRibbonGeometry(path.points, widths, (x, z) => sampleTerrainHeight(region, x, z) + (path.kind === 'main' ? .052 : .047)),
    new THREE.MeshStandardMaterial({
      color: path.kind === 'main' ? 0x594f3e : 0x41463a,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  road.name = path.kind === 'main' ? 'MainRoad' : 'SideTrail'
  road.receiveShadow = true
  return road
}

function makeRibbonGeometry(
  points: Array<{ x: number; z: number }>,
  widths: number[],
  heightAt: (x: number, z: number) => number,
) {
  const sections = buildRibbonSections(points, widths)
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  sections.forEach((section, index) => {
    const leftX = section.x + section.offsetX
    const leftZ = section.z + section.offsetZ
    const rightX = section.x - section.offsetX
    const rightZ = section.z - section.offsetZ

    positions.push(
      leftX, heightAt(leftX, leftZ), leftZ,
      rightX, heightAt(rightX, rightZ), rightZ,
    )
    const v = index / Math.max(1, sections.length - 1)
    uvs.push(0, v, 1, v)

    if (index < sections.length - 1) {
      const a = index * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeTerrainSafeWaterGeometry(region: GeneratedRegion) {
  const surface = streamWaterSurfaceRows(region, 9, .085)
  const rows = surface.rows
  const lanes = surface.laneCount
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const deepWater = new THREE.Color(0x377c7d)
  const bankWater = new THREE.Color(editorBiomePalette(region.biome).low).lerp(new THREE.Color(0x668f83), .58)
  const sheenWater = new THREE.Color(0x78aaa2)
  const waterColor = new THREE.Color()

  rows.forEach((row, rowIndex) => {
    row.points.forEach((point, laneIndex) => {
      const u = laneIndex / Math.max(1, lanes - 1)
      const v = rowIndex / Math.max(1, rows.length - 1)
      const edge = Math.pow(Math.abs(u * 2 - 1), 1.55)
      const flowWave = Math.sin(rowIndex * .31 + laneIndex * .46)
        + Math.sin(rowIndex * .12 - laneIndex * .24 + 1.35)
      const sheen = Math.max(0, flowWave * .5) * (.07 - edge * .025)

      positions.push(point.x, point.y, point.z)
      uvs.push(u, v)
      waterColor.copy(deepWater).lerp(bankWater, edge * .78).lerp(sheenWater, sheen)
      colors.push(waterColor.r, waterColor.g, waterColor.b)
    })
  })

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    for (let laneIndex = 0; laneIndex < lanes - 1; laneIndex += 1) {
      const a = rowIndex * lanes + laneIndex
      const b = a + 1
      const c = (rowIndex + 1) * lanes + laneIndex
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildRibbonSections(
  points: Array<{ x: number; z: number }>,
  widths: number[],
) {
  const sections: Array<{
    x: number
    z: number
    offsetX: number
    offsetZ: number
    sourceIndex: number
  }> = []

  if (!points.length) return sections
  if (points.length === 1) {
    const half = (widths[0] ?? 1) / 2
    sections.push({ x: points[0].x, z: points[0].z, offsetX: half, offsetZ: 0, sourceIndex: 0 })
    return sections
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const half = Math.max(.04, (widths[index] ?? widths[0] ?? 1) / 2)

    if (index === 0 || index === points.length - 1) {
      const other = index === 0 ? points[1] : points[index - 1]
      const direction = index === 0
        ? normalizeRibbon2(other.x - point.x, other.z - point.z)
        : normalizeRibbon2(point.x - other.x, point.z - other.z)
      sections.push({
        x: point.x,
        z: point.z,
        offsetX: -direction.z * half,
        offsetZ: direction.x * half,
        sourceIndex: index,
      })
      continue
    }

    const previous = points[index - 1]
    const next = points[index + 1]
    const incomingLength = Math.max(.001, Math.hypot(point.x - previous.x, point.z - previous.z))
    const outgoingLength = Math.max(.001, Math.hypot(next.x - point.x, next.z - point.z))
    const incoming = normalizeRibbon2(point.x - previous.x, point.z - previous.z)
    const outgoing = normalizeRibbon2(next.x - point.x, next.z - point.z)
    const dot = THREE.MathUtils.clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1)
    const incomingNormal = { x: -incoming.z, z: incoming.x }
    const outgoingNormal = { x: -outgoing.z, z: outgoing.x }

    // Acute corners get two short cross-sections. This creates a true bevel
    // instead of a long miter triangle that can spike or cross the opposite edge.
    if (dot < .78) {
      const bevelDistance = Math.max(
        .08,
        Math.min(
          half * .72,
          incomingLength * .28,
          outgoingLength * .28,
        ),
      )
      const cornerHalf = dot < -.15 ? half * .78 : half

      sections.push({
        x: point.x - incoming.x * bevelDistance,
        z: point.z - incoming.z * bevelDistance,
        offsetX: incomingNormal.x * cornerHalf,
        offsetZ: incomingNormal.z * cornerHalf,
        sourceIndex: index,
      })
      sections.push({
        x: point.x + outgoing.x * bevelDistance,
        z: point.z + outgoing.z * bevelDistance,
        offsetX: outgoingNormal.x * cornerHalf,
        offsetZ: outgoingNormal.z * cornerHalf,
        sourceIndex: index,
      })
      continue
    }

    const miter = normalizeRibbon2(
      incomingNormal.x + outgoingNormal.x,
      incomingNormal.z + outgoingNormal.z,
    )
    const denominator = Math.max(
      .58,
      Math.abs(miter.x * outgoingNormal.x + miter.z * outgoingNormal.z),
    )
    const scale = Math.min(
      half / denominator,
      half * 1.16,
      Math.min(incomingLength, outgoingLength) * .34,
    )

    sections.push({
      x: point.x,
      z: point.z,
      offsetX: miter.x * Math.max(half * .82, scale),
      offsetZ: miter.z * Math.max(half * .82, scale),
      sourceIndex: index,
    })
  }

  return sections
}

function normalizeRibbon2(x: number, z: number) {
  const length = Math.max(.00001, Math.hypot(x, z))
  return { x: x / length, z: z / length }
}

function addDressing(region: GeneratedRegion, group: THREE.Group) {
  const trees = region.dressing.filter((item) => item.type === 'tree')
  const rocks = region.dressing.filter((item) => item.type === 'rock')
  const ferns = region.dressing.filter((item) => item.type === 'fern')
  const logs = region.dressing.filter((item) => item.type === 'fallen-log')
  const stumps = region.dressing.filter((item) => item.type === 'stump')
  const grasses = region.dressing.filter((item) => item.type === 'grass')
  const shrubs = region.dressing.filter((item) => item.type === 'shrub')
  const reeds = region.dressing.filter((item) => item.type === 'reeds')
  const bankPatches = region.dressing.filter((item) => item.type === 'bank-patch')
  const palette = editorBiomePalette(region.biome)
  const surfacePalette = editorSurfacePalette(region.biome)

  if (bankPatches.length) {
    const geometry = new THREE.CircleGeometry(1, 10)
    geometry.rotateX(-Math.PI / 2)
    const bankColor = new THREE.Color(surfacePalette.soil)
      .lerp(new THREE.Color(palette.low), .34)
      .multiplyScalar(.82)
    const material = new THREE.MeshStandardMaterial({
      color: bankColor,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, bankPatches.length)
    setInstances(mesh, bankPatches, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .028, item.z),
      rotation: new THREE.Euler(0, item.rotation, 0),
      scale: new THREE.Vector3(
        item.scale * (1.38 + item.variant * .11),
        1,
        item.scale * (.42 + (item.variant % 2) * .08),
      ),
    }))
    mesh.receiveShadow = true
    mesh.renderOrder = 2
    group.add(mesh)
  }

  if (trees.length) {
    const trunkGeometry = new THREE.CylinderGeometry(.22, .34, 3, 6)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x382c22, roughness: 1 })
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    trees.forEach((item, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0))
      scale.set(item.scale * (.94 + item.variant * .025), item.scale * (1 + item.variant * .035), item.scale * (.94 + item.variant * .025))
      matrix.compose(new THREE.Vector3(item.x, item.y + 1.45 * item.scale, item.z), quaternion, scale)
      trunks.setMatrixAt(index, matrix)
    })
    trunks.castShadow = true
    trunks.receiveShadow = true
    group.add(trunks)

    const buckets = [0, 1, 2, 3].map((variant) => trees.filter((item) => item.variant === variant))
    const geometries: THREE.BufferGeometry[] = [
      new THREE.ConeGeometry(1.38, 4.35, 7),
      new THREE.ConeGeometry(1.62, 3.65, 8),
      new THREE.DodecahedronGeometry(1.42, 0),
      new THREE.ConeGeometry(1.2, 4.7, 6),
    ]
    const crownMaterial = new THREE.MeshStandardMaterial({ color: palette.tree, roughness: 1 })

    buckets.forEach((items, variant) => {
      if (!items.length) return
      const crowns = new THREE.InstancedMesh(geometries[variant], crownMaterial, items.length)
      items.forEach((item, index) => {
        quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0))
        const yScale = variant === 2 ? 1.38 : 1
        scale.set(item.scale, item.scale * yScale, item.scale)
        matrix.compose(
          new THREE.Vector3(item.x, item.y + (variant === 2 ? 3.85 : 4.05) * item.scale, item.z),
          quaternion,
          scale,
        )
        crowns.setMatrixAt(index, matrix)
      })
      crowns.castShadow = true
      group.add(crowns)
    })
  }

  if (rocks.length) {
    const geometry = new THREE.DodecahedronGeometry(.7, 0)
    const material = new THREE.MeshStandardMaterial({ color: palette.rock, roughness: 1 })
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
    const material = new THREE.MeshStandardMaterial({ color: palette.fern, roughness: 1 })
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

  if (grasses.length) {
    const geometry = new THREE.ConeGeometry(.22, .62, 5)
    const material = new THREE.MeshStandardMaterial({ color: 0x58704a, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, grasses.length)
    setInstances(mesh, grasses, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .23 * item.scale, item.z),
      rotation: new THREE.Euler(0, item.rotation, 0),
      scale: new THREE.Vector3(item.scale * .9, item.scale, item.scale * .9),
    }))
    group.add(mesh)
  }

  if (shrubs.length) {
    const geometry = new THREE.DodecahedronGeometry(.48, 0)
    const material = new THREE.MeshStandardMaterial({ color: 0x2f4c33, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, shrubs.length)
    setInstances(mesh, shrubs, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .35 * item.scale, item.z),
      rotation: new THREE.Euler(0, item.rotation, 0),
      scale: new THREE.Vector3(item.scale * 1.15, item.scale * .72, item.scale),
    }))
    mesh.castShadow = true
    group.add(mesh)
  }

  if (reeds.length) {
    const geometry = new THREE.CylinderGeometry(.035, .06, 1.05, 5)
    const material = new THREE.MeshStandardMaterial({ color: 0x607453, roughness: 1 })
    const mesh = new THREE.InstancedMesh(geometry, material, reeds.length * 3)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let cursor = 0
    for (const item of reeds) {
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = item.rotation + blade * 2.1
        const radius = .12 + blade * .07
        quaternion.setFromEuler(new THREE.Euler(0, angle, (blade - 1) * .05))
        scale.set(item.scale, item.scale * (.8 + blade * .12), item.scale)
        matrix.compose(
          new THREE.Vector3(
            item.x + Math.cos(angle) * radius,
            item.y + .45 * item.scale,
            item.z + Math.sin(angle) * radius,
          ),
          quaternion,
          scale,
        )
        mesh.setMatrixAt(cursor++, matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
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

function makeCrossing(region: GeneratedRegion, crossing: GeneratedRegion['crossings'][number]) {
  const group = new THREE.Group()
  group.name = `Crossing_${crossing.kind}`
  const streamY = sampleStreamHeight(region, crossing.x, crossing.z)
  const y = crossing.kind === 'bridge'
    ? Math.max(streamY + .32, sampleTerrainHeight(region, crossing.x, crossing.z) + .1)
    : streamY + .07
  group.position.set(crossing.x, y, crossing.z)
  group.rotation.y = -crossing.rotation

  if (crossing.kind === 'bridge') {
    const plankMaterial = new THREE.MeshStandardMaterial({ color: 0x67503a, roughness: .95 })
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x49382b, roughness: 1 })
    const bridgeWidth = crossing.width * .92
    const length = Math.max(4.2, crossing.width * 1.35)
    const plankCount = Math.max(6, Math.round(length / .5))
    for (let index = 0; index < plankCount; index += 1) {
      const x = -length / 2 + (index + .5) * (length / plankCount)
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(length / plankCount * .9, .11, bridgeWidth),
        plankMaterial,
      )
      plank.position.set(x, 0, 0)
      plank.castShadow = true
      group.add(plank)
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, .16, .12), railMaterial)
      rail.position.set(0, .3, side * bridgeWidth * .54)
      rail.castShadow = true
      group.add(rail)
    }
  } else {
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x77766b, roughness: 1 })
    const count = 7
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1) - .5
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.42 + (index % 2) * .08, 0), stoneMaterial)
      stone.position.set(t * crossing.width * 1.8, .06 + (index % 2) * .025, Math.sin(index * 1.7) * .24)
      stone.scale.set(1.15, .5, .9)
      stone.rotation.y = index * .7
      group.add(stone)
    }
  }
  return group
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
  const wood = new THREE.MeshStandardMaterial({ color: 0x513c2c, roughness: 1 })
  const green = new THREE.MeshStandardMaterial({ color: 0x2f4b34, roughness: 1 })
  if (poi.type === 'ruins') {
    // Broken perimeter and gateway make the ruins read as a location from the ARPG camera.
    addBox(group, [-3.15, .9, .4], [.6, 1.8, 4.8], stone, [0, .08, 0])
    addBox(group, [3, .65, -.9], [.6, 1.3, 3.4], darkStone, [0, -.12, 0])
    addBox(group, [-1.75, .7, -2.65], [2.8, 1.4, .55], stone, [0, .02, 0])
    addBox(group, [2.25, .38, 2.45], [2.7, .76, .6], darkStone, [0, -.08, 0])
    addBox(group, [-.95, 1.45, 2.8], [.62, 2.9, .65], stone)
    addBox(group, [1.05, 1.15, 2.8], [.62, 2.3, .65], stone)
    addBox(group, [.05, 2.55, 2.8], [2.65, .5, .7], darkStone)
  } else if (poi.type === 'camp' || poi.type === 'settlement') {
    const tents = poi.type === 'settlement' ? 5 : 3
    for (let i = 0; i < tents; i += 1) {
      const angle = i / tents * Math.PI * 2 + .35
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.2, 4), cloth)
      const tentRadius = poi.type === 'settlement' ? 4.5 : 3.7
      tent.position.set(Math.cos(angle) * tentRadius, 1.05, Math.sin(angle) * tentRadius)
      tent.rotation.y = Math.PI / 4 + angle
      tent.castShadow = true
      group.add(tent)
    }
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .1, 12), new THREE.MeshStandardMaterial({ color: 0x6a3823, emissive: 0xff7a2d, emissiveIntensity: .9 }))
    fire.position.y = .09
    group.add(fire)
    for (let i = 0; i < 4; i += 1) {
      const angle = i / 4 * Math.PI * 2 + .45
      addBox(group, [Math.cos(angle) * 1.45, .22, Math.sin(angle) * 1.45], [1.15, .22, .28], wood, [0, -angle, 0])
    }
    addBox(group, [-2.1, .5, 1.2], [1.4, 1, .7], wood, [0, .22, 0])
  } else if (poi.type === 'shrine') {
    addBox(group, [0, .18, .4], [3.4, .36, 3], darkStone)
    addBox(group, [0, .5, .25], [2.5, .34, 2.2], stone)
    addBox(group, [0, 1.9, -.2], [.72, 2.8, .62], stone)
    addBox(group, [-1.3, 1.15, -.25], [.45, 2.3, .45], darkStone)
    addBox(group, [1.3, 1.15, -.25], [.45, 2.3, .45], darkStone)
    addBox(group, [0, 2.25, -.25], [3, .42, .48], darkStone)
    const glow = new THREE.PointLight(0xd6c58a, 1.8, 9)
    glow.position.y = 2.8
    group.add(glow)
  } else if (poi.type === 'standing-stones') {
    for (let i = 0; i < 7; i += 1) {
      const angle = i / 7 * Math.PI * 2
      const radius = i === 0 ? 0 : 3
      const height = i === 0 ? 3.8 : 2.4 + (i % 3) * .35
      addBox(
        group,
        [Math.cos(angle) * radius, height * .5, Math.sin(angle) * radius],
        [i === 0 ? .9 : .7, height, .65],
        i % 2 ? stone : darkStone,
        [0, angle * .23, (i % 3 - 1) * .055],
      )
    }
  } else if (poi.type === 'beast-den') {
    const outer = new THREE.Mesh(new THREE.TorusGeometry(2.35, .72, 8, 14, Math.PI), darkStone)
    outer.rotation.x = Math.PI / 2
    outer.position.y = 1.35
    outer.castShadow = true
    group.add(outer)
    addBox(group, [0, .24, .75], [4.8, .48, 3.5], darkStone)
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.35), new THREE.MeshBasicMaterial({ color: 0x070907, side: THREE.DoubleSide }))
    mouth.position.set(0, 1.05, .62)
    group.add(mouth)
  } else if (poi.type === 'graveyard') {
    for (let i = 0; i < 12; i += 1) {
      const col = i % 4
      const row = Math.floor(i / 4)
      addBox(group, [-2.25 + col * 1.5, .55, -1.8 + row * 1.75], [.42, 1.1 + (i % 2) * .2, .2], stone, [0, (i % 3 - 1) * .08, 0])
    }
    for (const side of [-1, 1]) {
      addBox(group, [side * 3.45, .5, 0], [.12, 1, 6.4], wood)
    }
    addBox(group, [0, .5, -3.15], [6.8, 1, .12], wood)
    addBox(group, [-2.25, .5, 3.15], [2.2, 1, .12], wood)
    addBox(group, [2.25, .5, 3.15], [2.2, 1, .12], wood)
  } else if (poi.type === 'watchtower') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 2.25, 7, 8), stone)
    tower.position.y = 3.35
    tower.castShadow = true
    group.add(tower)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.05, .58, 8), darkStone)
    upper.position.y = 6.65
    group.add(upper)
    for (let i = 0; i < 8; i += 1) {
      if (i === 2 || i === 3) continue
      const angle = i / 8 * Math.PI * 2
      addBox(group, [Math.cos(angle) * 1.78, 7.2, Math.sin(angle) * 1.78], [.7, .85, .7], darkStone, [0, -angle, 0])
    }
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.85), new THREE.MeshBasicMaterial({ color: 0x090b09, side: THREE.DoubleSide }))
    doorway.position.set(0, .98, 2.18)
    group.add(doorway)
    addBox(group, [-2.8, .7, -1.6], [.55, 1.4, 3.4], darkStone, [0, .38, .18])
  } else if (poi.type === 'dungeon') {
    addBox(group, [-1.7, 1.5, 0], [.82, 3, .9], stone)
    addBox(group, [1.7, 1.5, 0], [.82, 3, .9], stone)
    addBox(group, [0, 3.05, 0], [4.2, .72, .95], darkStone)
    addBox(group, [0, .18, 1.6], [4.5, .36, 2.2], darkStone)
    const darkness = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 2.55), new THREE.MeshBasicMaterial({ color: 0x080b09, side: THREE.DoubleSide }))
    darkness.position.set(0, 1.28, .49)
    group.add(darkness)
  }

  addPoiEnvironment(group, poi, stone, darkStone, wood, green)

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

function addPoiEnvironment(
  group: THREE.Group,
  poi: GeneratedWorldPoi,
  stone: THREE.MeshStandardMaterial,
  darkStone: THREE.MeshStandardMaterial,
  wood: THREE.MeshStandardMaterial,
  green: THREE.MeshStandardMaterial,
) {
  const random = seededVisualRandom(poi.id)
  const addRock = (radius: number, scale = 1) => {
    const angle = random() * Math.PI * 2
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.28 + random() * .32, 0), random() > .45 ? stone : darkStone)
    mesh.position.set(Math.cos(angle) * radius, .16 + random() * .12, Math.sin(angle) * radius)
    mesh.scale.set(scale * (1 + random() * .35), scale * (.55 + random() * .3), scale)
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }
  const addShrub = (radius: number) => {
    const angle = random() * Math.PI * 2
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.42 + random() * .2, 0), green)
    mesh.position.set(Math.cos(angle) * radius, .35, Math.sin(angle) * radius)
    mesh.scale.y = .7
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }
  const addTimber = (radius: number) => {
    const angle = random() * Math.PI * 2
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 1.6 + random() * 1.4, 6), wood)
    mesh.rotation.z = Math.PI / 2
    mesh.rotation.y = random() * Math.PI
    mesh.position.set(Math.cos(angle) * radius, .16, Math.sin(angle) * radius)
    group.add(mesh)
  }

  if (poi.type === 'ruins' || poi.type === 'watchtower') {
    for (let i = 0; i < 12; i += 1) addRock(3 + random() * 3.2, .8 + random() * .55)
    for (let i = 0; i < 5; i += 1) addShrub(4 + random() * 2.7)
    for (let i = 0; i < 3; i += 1) addTimber(3.8 + random() * 2.2)
  } else if (poi.type === 'graveyard') {
    for (let i = -2; i <= 2; i += 1) {
      addBox(group, [i * 1.25, .28, -2.6], [.09, .55, 1.05], wood, [0, .02 * i, 0])
    }
    for (let i = 0; i < 7; i += 1) addShrub(3.8 + random() * 2.5)
  } else if (poi.type === 'camp' || poi.type === 'settlement') {
    for (let i = 0; i < (poi.type === 'settlement' ? 7 : 5); i += 1) addTimber(3.1 + random() * 2.8)
    for (let i = 0; i < (poi.type === 'settlement' ? 5 : 4); i += 1) {
      const angle = random() * Math.PI * 2
      addBox(
        group,
        [Math.cos(angle) * (3 + random() * 2.5), .32, Math.sin(angle) * (3 + random() * 2.5)],
        [.6, .6, .6],
        wood,
        [0, random() * Math.PI, 0],
      )
    }
  } else if (poi.type === 'shrine' || poi.type === 'standing-stones') {
    for (let i = 0; i < 10; i += 1) addRock(3.1 + random() * 2, .65 + random() * .32)
    for (let i = 0; i < 5; i += 1) addShrub(3.8 + random() * 2.1)
  } else if (poi.type === 'beast-den') {
    for (let i = 0; i < 7; i += 1) addRock(2.2 + random() * 2.1, .8 + random() * .4)
    for (let i = 0; i < 3; i += 1) addTimber(2.5 + random() * 2)
  } else if (poi.type === 'dungeon') {
    for (let i = 0; i < 7; i += 1) addRock(2.8 + random() * 2.1, .75 + random() * .45)
    for (let i = 0; i < 2; i += 1) addShrub(3.8 + random() * 1.5)
  }
}

function seededVisualRandom(value: string) {
  let state = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let result = Math.imul(state ^ state >>> 15, 1 | state)
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result
    return ((result ^ result >>> 14) >>> 0) / 4294967296
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
  sprite.scale.set(6.25, 1.14, 1)
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

function editorBiomePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { ground: 0x5a4d32, low: 0x3c4933, mid: 0x66573b, high: 0x74654a, tree: 0x73502b, fern: 0x596137, rock: 0x67645b }
  if (value.includes('highland')) return { ground: 0x46513e, low: 0x35443a, mid: 0x56604d, high: 0x74786a, tree: 0x30442f, fern: 0x495c3b, rock: 0x767b70 }
  if (value.includes('marsh')) return { ground: 0x303d31, low: 0x253b35, mid: 0x3d4b3e, high: 0x50584a, tree: 0x26372d, fern: 0x35543c, rock: 0x596158 }
  if (value.includes('corrupt')) return { ground: 0x3a303d, low: 0x2d2939, mid: 0x493b4c, high: 0x59495c, tree: 0x342d3b, fern: 0x49374f, rock: 0x655868 }
  if (value.includes('farmland')) return { ground: 0x5b553a, low: 0x46523b, mid: 0x686044, high: 0x756f53, tree: 0x405235, fern: 0x53613b, rock: 0x6d6c5f }
  return { ground: 0x2c442f, low: 0x263d2e, mid: 0x3b4e36, high: 0x54604a, tree: 0x203b28, fern: 0x31583a, rock: 0x596159 }
}

function editorSurfacePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { forestFloor: 0x473d2c, moss: 0x62613a, soil: 0x6a5538, meadow: 0x6b6840, scrub: 0x564b31, rocky: 0x6e6759 }
  if (value.includes('highland')) return { forestFloor: 0x3f4939, moss: 0x59654a, soil: 0x625a47, meadow: 0x596849, scrub: 0x4b563f, rocky: 0x73786d }
  if (value.includes('marsh')) return { forestFloor: 0x26372e, moss: 0x3f5a43, soil: 0x4a4938, meadow: 0x496047, scrub: 0x31493a, rocky: 0x5a6259 }
  if (value.includes('corrupt')) return { forestFloor: 0x322b37, moss: 0x4b3b50, soil: 0x57464f, meadow: 0x57475a, scrub: 0x403344, rocky: 0x6a5e6d }
  if (value.includes('farmland')) return { forestFloor: 0x4b4c34, moss: 0x5a653e, soil: 0x6c5a3c, meadow: 0x727047, scrub: 0x5c5838, rocky: 0x6e6d61 }
  return { forestFloor: 0x253a29, moss: 0x3c5738, soil: 0x5d523d, meadow: 0x506447, scrub: 0x344a35, rocky: 0x62685f }
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}
