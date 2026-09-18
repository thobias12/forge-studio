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
import {
  buildWorldAmbientVisuals,
  updateWorldAmbientVisuals,
  type WorldAmbientVisuals,
} from '../engine/worldAmbient'
import {
  FORGE_WORLD_SCALE,
  forgeBridgeDimensions,
  forgePoiClearsDressing,
  forgePoiPresentationRotation,
  forgePoiVisualScale,
  forgeTreePresentationScale,
} from '../engine/worldScale'

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
  ambient?: WorldAmbientVisuals
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

    const hemisphere = new THREE.HemisphereLight(0xd7e3d2, 0x253026, 2.25)
    hemisphere.name = 'WorldMoodHemisphere'
    scene.add(hemisphere)
    const sun = new THREE.DirectionalLight(0xffe4ba, 3.1)
    sun.name = 'WorldMoodSun'
    sun.position.set(-45, 70, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -130
    sun.shadow.camera.right = 130
    sun.shadow.camera.top = 130
    sun.shadow.camera.bottom = -130
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x86a891, 1.05)
    fill.name = 'WorldMoodFill'
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
      if (stateRef.current.ambient) {
        updateWorldAmbientVisuals(
          stateRef.current.ambient,
          performance.now() / 1000,
        )
      }
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

    if (state.renderer) applyEditorMood(state.scene, state.renderer, region.mood)

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
    state.ambient = built.ambient
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
  const ambient = buildWorldAmbientVisuals(region)
  biome.add(ambient.group)
  root.add(biome)

  const landmarks = new THREE.Group()
  landmarks.name = 'Landmarks'
  for (const poi of region.pois) landmarks.add(makePoi(region, poi))
  addEntryExitMarkers(region, landmarks)
  root.add(landmarks)

  return {
    root,
    route,
    branches,
    landmarks,
    biome,
    boundary,
    riverDebug,
    ambient,
  }
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
  const palette = editorMoodPalette(editorBiomePalette(region.biome), region.mood)
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
  const palette = editorMoodPalette(editorBiomePalette(region.biome), region.mood)
  const surfacePalette = editorMoodPalette(editorSurfacePalette(region.biome), region.mood)
  const forestFloorColor = new THREE.Color(surfacePalette.forestFloor)
  const mossColor = new THREE.Color(surfacePalette.moss)
  const soilColor = new THREE.Color(surfacePalette.soil)
  const meadowColor = new THREE.Color(surfacePalette.meadow)
  const scrubColor = new THREE.Color(surfacePalette.scrub)
  const rockyColor = new THREE.Color(surfacePalette.rocky)
  const moodStyle = editorMoodStyle(region.mood)
  const moodTerrainTint = new THREE.Color(moodStyle.terrainTint)

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
      color.lerp(forestFloorColor, surface.forestFloor * .34)
      color.lerp(mossColor, surface.moss * .31)
      color.lerp(meadowColor, surface.meadow * .42)
      color.lerp(scrubColor, surface.scrub * .27)
      color.lerp(rockyColor, surface.rocky * .38)
      color.lerp(soilColor, Math.max(surface.soil * .24, surface.poiWear * .68, surface.roadWear * .42))
      color.lerp(moodTerrainTint, moodStyle.terrainTintStrength)
      const variation = moodStyle.terrainBrightness * (.96 + (surface.medium - .5) * .08 + (surface.fine - .5) * .06)
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
      color: path.kind === 'main' ? 0x5b4d38 : 0x4b4938,
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
  const visibleDressing = region.dressing.filter(
    (item) => !forgePoiClearsDressing(region.pois, item.x, item.z),
  )
  const trees = visibleDressing.filter((item) => item.type === 'tree')
  const deadTrees = visibleDressing.filter((item) => item.type === 'dead-tree')
  const rocks = visibleDressing.filter((item) => item.type === 'rock')
  const ferns = visibleDressing.filter((item) => item.type === 'fern')
  const logs = visibleDressing.filter((item) => item.type === 'fallen-log')
  const stumps = visibleDressing.filter((item) => item.type === 'stump')
  const grasses = visibleDressing.filter((item) => item.type === 'grass')
  const shrubs = visibleDressing.filter((item) => item.type === 'shrub')
  const reeds = visibleDressing.filter((item) => item.type === 'reeds')
  const bankPatches = visibleDressing.filter((item) => item.type === 'bank-patch')
  const leafPatches = visibleDressing.filter((item) => item.type === 'leaf-patch')
  const flowerPatches = visibleDressing.filter((item) => item.type === 'flower-patch')
  const mudPatches = visibleDressing.filter((item) => item.type === 'mud-patch')
  const corruptScars = visibleDressing.filter((item) => item.type === 'corrupt-scar')
  const rockOutcrops = visibleDressing.filter((item) => item.type === 'rock-outcrop')
  const hedges = visibleDressing.filter((item) => item.type === 'hedge')
  const rootClusters = visibleDressing.filter((item) => item.type === 'root-cluster')
  const palette = editorMoodPalette(editorBiomePalette(region.biome), region.mood)
  const surfacePalette = editorMoodPalette(editorSurfacePalette(region.biome), region.mood)
  const treeVariantColors = editorTreeVariantColors(region.biome, palette.tree).map((color) => applyEditorMoodColor(color, region.mood))
  const groundCoverColors = editorMoodPalette(editorGroundCoverColors(region.biome, palette.fern), region.mood)
  const corruptTrees = region.biome.toLowerCase().includes('corrupt')

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

  const addGroundPatches = (
    items: typeof leafPatches,
    color: number | THREE.Color,
    widthScale: number,
    depthScale: number,
  ) => {
    if (!items.length) return
    const geometry = new THREE.CircleGeometry(1, 9)
    geometry.rotateX(-Math.PI / 2)
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, items.length)
    setInstances(mesh, items, (item) => ({
      position: new THREE.Vector3(item.x, item.y + .031, item.z),
      rotation: new THREE.Euler(0, item.rotation, 0),
      scale: new THREE.Vector3(
        item.scale * widthScale * (1 + item.variant * .07),
        1,
        item.scale * depthScale * (1 + (item.variant % 2) * .08),
      ),
    }))
    mesh.receiveShadow = true
    mesh.renderOrder = 2
    group.add(mesh)
  }

  addGroundPatches(leafPatches, 0x75502f, 1.45, .68)
  addGroundPatches(
    mudPatches,
    new THREE.Color(surfacePalette.soil)
      .lerp(new THREE.Color(palette.low), .48)
      .multiplyScalar(.72),
    1.82,
    .9,
  )
  if (corruptScars.length) {
    const scarGeometry = new THREE.CircleGeometry(1, 7)
    scarGeometry.rotateX(-Math.PI / 2)
    const scarMaterial = new THREE.MeshStandardMaterial({
      color: 0x342439,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const pieces = new THREE.InstancedMesh(
      scarGeometry,
      scarMaterial,
      corruptScars.length * 3,
    )
    const spikeGeometry = new THREE.ConeGeometry(.12, .58, 5)
    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f3158,
      roughness: 1,
    })
    const spikes = new THREE.InstancedMesh(
      spikeGeometry,
      spikeMaterial,
      corruptScars.length * 2,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let pieceCursor = 0
    let spikeCursor = 0

    corruptScars.forEach((item) => {
      for (let piece = 0; piece < 3; piece += 1) {
        const angle = item.rotation + piece * 2.17 + item.variant * .13
        const radius = piece === 0 ? 0 : (.34 + piece * .12) * item.scale
        quaternion.setFromEuler(
          new THREE.Euler(0, angle + piece * .27, 0),
        )
        scale.set(
          item.scale * (1.05 + piece * .2),
          1,
          item.scale * (.28 + (piece % 2) * .16),
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + Math.cos(angle) * radius,
            item.y + .032 + piece * .002,
            item.z + Math.sin(angle) * radius,
          ),
          quaternion,
          scale,
        )
        pieces.setMatrixAt(pieceCursor++, matrix)
      }

      for (let spike = 0; spike < 2; spike += 1) {
        const angle = item.rotation + .75 + spike * 2.75 + item.variant * .19
        const radius = (.38 + spike * .2) * item.scale
        quaternion.setFromEuler(
          new THREE.Euler(
            (spike ? -.12 : .09),
            angle,
            (spike ? .14 : -.1),
          ),
        )
        const spikeScale = item.scale * (.72 + spike * .18)
        scale.set(spikeScale, spikeScale, spikeScale)
        matrix.compose(
          new THREE.Vector3(
            item.x + Math.cos(angle) * radius,
            item.y + .24 * spikeScale,
            item.z + Math.sin(angle) * radius,
          ),
          quaternion,
          scale,
        )
        spikes.setMatrixAt(spikeCursor++, matrix)
      }
    })

    pieces.receiveShadow = true
    pieces.renderOrder = 2
    spikes.castShadow = true
    group.add(pieces, spikes)
  }

  if (flowerPatches.length) {
    const flowerGeometry = new THREE.DodecahedronGeometry(.085, 0)
    const warmMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2b85e,
      roughness: 1,
    })
    const coolMaterial = new THREE.MeshStandardMaterial({
      color: 0x8d77b5,
      roughness: 1,
    })
    const warm = new THREE.InstancedMesh(
      flowerGeometry,
      warmMaterial,
      flowerPatches.length * 3,
    )
    const cool = new THREE.InstancedMesh(
      flowerGeometry,
      coolMaterial,
      flowerPatches.length * 2,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let warmCursor = 0
    let coolCursor = 0
    flowerPatches.forEach((item) => {
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = item.rotation + petal * 2.399
        const radius = (.16 + (petal % 3) * .11) * item.scale
        const size = item.scale * (.72 + (petal % 2) * .18)
        quaternion.setFromEuler(new THREE.Euler(0, angle, 0))
        scale.setScalar(size)
        matrix.compose(
          new THREE.Vector3(
            item.x + Math.cos(angle) * radius,
            item.y + .08 + (petal % 2) * .025,
            item.z + Math.sin(angle) * radius,
          ),
          quaternion,
          scale,
        )
        if (petal < 3) warm.setMatrixAt(warmCursor++, matrix)
        else cool.setMatrixAt(coolCursor++, matrix)
      }
    })
    group.add(warm, cool)
  }

  if (rockOutcrops.length) {
    const geometry = new THREE.DodecahedronGeometry(.72, 0)
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.rock).multiplyScalar(.9),
      roughness: 1,
    })
    const totalPieces = rockOutcrops.reduce(
      (sum, item) => sum + 5 + item.variant,
      0,
    )
    const pieces = new THREE.InstancedMesh(
      geometry,
      material,
      totalPieces,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let cursor = 0
    rockOutcrops.forEach((item) => {
      const pieceCount = 5 + item.variant
      for (let piece = 0; piece < pieceCount; piece += 1) {
        const ring = piece === 0 ? 0 : 1 + Math.floor((piece - 1) / 3)
        const angle =
          item.rotation +
          piece * 2.18 +
          item.variant * .19 +
          ring * .27
        const radius =
          piece === 0
            ? 0
            : (.46 + ring * .34 + (piece % 3) * .08) * item.scale
        const size =
          item.scale *
          (piece === 0
            ? 1.18
            : .5 + ((piece + item.variant) % 4) * .11)
        quaternion.setFromEuler(
          new THREE.Euler(
            (piece % 3 - 1) * .1,
            angle,
            ((piece + item.variant) % 4 - 1.5) * .11,
          ),
        )
        scale.set(
          size * (1.02 + (piece % 2) * .14),
          size * (.52 + ((piece + 1) % 3) * .12),
          size * (.9 + (piece % 3) * .08),
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + Math.cos(angle) * radius,
            item.y + .28 * size,
            item.z + Math.sin(angle) * radius,
          ),
          quaternion,
          scale,
        )
        pieces.setMatrixAt(cursor++, matrix)
      }
    })
    pieces.castShadow = true
    pieces.receiveShadow = true
    group.add(pieces)
  }

  if (hedges.length) {
    const geometry = new THREE.DodecahedronGeometry(.55, 0)
    const hedgeColor = new THREE.Color(palette.tree)
      .lerp(new THREE.Color(palette.fern), .55)
    const material = new THREE.MeshStandardMaterial({
      color: hedgeColor,
      roughness: 1,
    })
    const pieces = new THREE.InstancedMesh(
      geometry,
      material,
      hedges.length * 4,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let cursor = 0
    hedges.forEach((item) => {
      const cos = Math.cos(item.rotation)
      const sin = Math.sin(item.rotation)
      for (let piece = 0; piece < 4; piece += 1) {
        const along = (piece - 1.5) * .68 * item.scale
        quaternion.setFromEuler(
          new THREE.Euler(0, item.rotation + (piece % 2) * .16, 0),
        )
        scale.set(
          item.scale * .82,
          item.scale * (.58 + (piece % 2) * .08),
          item.scale * .7,
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + cos * along,
            item.y + .34 * item.scale,
            item.z + sin * along,
          ),
          quaternion,
          scale,
        )
        pieces.setMatrixAt(cursor++, matrix)
      }
    })
    pieces.castShadow = true
    group.add(pieces)
  }

  if (rootClusters.length) {
    const geometry = new THREE.CylinderGeometry(.07, .13, 2.15, 5)
    geometry.rotateZ(Math.PI / 2)
    const material = new THREE.MeshStandardMaterial({
      color: 0x423027,
      roughness: 1,
    })
    const roots = new THREE.InstancedMesh(
      geometry,
      material,
      rootClusters.length * 3,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let cursor = 0
    rootClusters.forEach((item) => {
      for (let root = 0; root < 3; root += 1) {
        const angle =
          item.rotation +
          root * (1.72 + item.variant * .04) +
          (root === 2 ? .35 : 0)
        const radius = root * .16 * item.scale
        quaternion.setFromEuler(
          new THREE.Euler(
            (root - 1) * .08,
            angle,
            (root % 2 ? -.08 : .1),
          ),
        )
        scale.set(
          item.scale * (.72 + root * .12),
          item.scale * (.72 + root * .08),
          item.scale * (.72 + root * .12),
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + Math.cos(angle) * radius,
            item.y + .1 + root * .025,
            item.z + Math.sin(angle) * radius,
          ),
          quaternion,
          scale,
        )
        roots.setMatrixAt(cursor++, matrix)
      }
    })
    roots.castShadow = true
    group.add(roots)
  }

  if (trees.length) {
    const trunkGeometry = new THREE.CylinderGeometry(.19, .34, 3.45, 7)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x382c22, roughness: 1 })
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    trees.forEach((item, index) => {
      const displayScale = forgeTreePresentationScale(item.scale)
      quaternion.setFromEuler(
        new THREE.Euler(
          corruptTrees ? (item.variant - 1.5) * .035 : 0,
          item.rotation,
          corruptTrees ? (item.variant % 2 ? -.045 : .045) : 0,
        ),
      )
      scale.set(
        displayScale * (.9 + item.variant * .02),
        displayScale * (1 + item.variant * .025),
        displayScale * (.9 + item.variant * .02),
      )
      matrix.compose(
        new THREE.Vector3(item.x, item.y + 1.66 * displayScale, item.z),
        quaternion,
        scale,
      )
      trunks.setMatrixAt(index, matrix)
    })
    trunks.castShadow = true
    trunks.receiveShadow = true
    group.add(trunks)

    const buckets = [0, 1, 2, 3].map((variant) =>
      trees.filter((item) => item.variant === variant)
    )
    const lowerGeometries: THREE.BufferGeometry[] = [
      new THREE.ConeGeometry(1.52, 2.75, 7),
      new THREE.ConeGeometry(1.72, 2.35, 8),
      new THREE.DodecahedronGeometry(1.18, 0),
      new THREE.ConeGeometry(1.34, 2.95, 7),
    ]
    const middleGeometries: THREE.BufferGeometry[] = [
      new THREE.ConeGeometry(1.18, 2.45, 7),
      new THREE.ConeGeometry(1.32, 2.15, 8),
      new THREE.DodecahedronGeometry(1.04, 0),
      new THREE.ConeGeometry(1.04, 2.55, 7),
    ]
    const upperGeometries: THREE.BufferGeometry[] = [
      new THREE.ConeGeometry(.82, 2.15, 7),
      new THREE.ConeGeometry(.9, 1.92, 8),
      new THREE.DodecahedronGeometry(.82, 0),
      new THREE.ConeGeometry(.7, 2.2, 7),
    ]
    const accentGeometries: THREE.BufferGeometry[] = [
      new THREE.ConeGeometry(.78, .88, 6),
      new THREE.ConeGeometry(.92, .72, 7),
      new THREE.DodecahedronGeometry(.66, 0),
      new THREE.ConeGeometry(.7, .96, 6),
    ]
    buckets.forEach((items, variant) => {
      if (!items.length) return
      const variantColor = new THREE.Color(
        treeVariantColors[variant] ?? palette.tree,
      )
      const lowerMaterial = new THREE.MeshStandardMaterial({
        color: variantColor.clone().multiplyScalar(.9),
        roughness: 1,
      })
      const middleMaterial = new THREE.MeshStandardMaterial({
        color: variantColor,
        roughness: 1,
      })
      const upperMaterial = new THREE.MeshStandardMaterial({
        color: variantColor.clone().multiplyScalar(1.1),
        roughness: 1,
      })
      const lower = new THREE.InstancedMesh(
        lowerGeometries[variant],
        lowerMaterial,
        items.length,
      )
      const middle = new THREE.InstancedMesh(
        middleGeometries[variant],
        middleMaterial,
        items.length,
      )
      const upper = new THREE.InstancedMesh(
        upperGeometries[variant],
        upperMaterial,
        items.length,
      )
      const accent = new THREE.InstancedMesh(
        accentGeometries[variant],
        middleMaterial,
        items.length,
      )

      items.forEach((item, index) => {
        const displayScale = forgeTreePresentationScale(item.scale)
        const broadleaf = variant === 2
        const cos = Math.cos(item.rotation)
        const sin = Math.sin(item.rotation)
        const worldOffset = (localX: number, localZ: number) => ({
          x: cos * localX - sin * localZ,
          z: sin * localX + cos * localZ,
        })
        const tierJitter =
          (.055 + variant * .015) *
          displayScale *
          (corruptTrees ? 1.5 : 1)
        const lowerOffset = broadleaf
          ? worldOffset(-.22 * displayScale, .05 * displayScale)
          : worldOffset(
              (variant % 2 ? -1 : 1) * tierJitter,
              (variant < 2 ? 1 : -1) * tierJitter * .55,
            )
        quaternion.setFromEuler(
          new THREE.Euler(
            broadleaf ? (corruptTrees ? .05 : 0) : (variant - 1.5) * (corruptTrees ? .028 : .012),
            item.rotation - .08 - variant * .018,
            broadleaf
              ? (corruptTrees ? -.06 : 0)
              : (variant % 2 ? -1 : 1) * (corruptTrees ? .055 : .018),
          ),
        )
        scale.set(
          displayScale * (broadleaf ? 1 : 1.05),
          displayScale * (broadleaf ? 1.06 : .96),
          displayScale * (broadleaf ? 1 : .94),
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + lowerOffset.x,
            item.y + (broadleaf ? 3.7 : 3.32) * displayScale,
            item.z + lowerOffset.z,
          ),
          quaternion,
          scale,
        )
        lower.setMatrixAt(index, matrix)

        const middleOffset = broadleaf
          ? worldOffset(.3 * displayScale, -.12 * displayScale)
          : worldOffset(
              (variant % 2 ? 1 : -1) * tierJitter * 1.5,
              (variant < 2 ? -1 : 1) * tierJitter,
            )
        const middleScale = broadleaf ? .94 : .78
        quaternion.setFromEuler(
          new THREE.Euler(
            broadleaf ? (corruptTrees ? -.04 : 0) : (1.5 - variant) * (corruptTrees ? .032 : .016),
            item.rotation + .11 + variant * .026,
            broadleaf
              ? (corruptTrees ? .07 : 0)
              : (variant % 2 ? 1 : -1) * (corruptTrees ? .06 : .022),
          ),
        )
        scale.set(
          displayScale * middleScale * (broadleaf ? 1 : 1.04),
          displayScale * middleScale * (broadleaf ? 1.08 : .94),
          displayScale * middleScale * (broadleaf ? 1 : .92),
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + middleOffset.x,
            item.y + (broadleaf ? 4.25 : 4.25) * displayScale,
            item.z + middleOffset.z,
          ),
          quaternion,
          scale,
        )
        middle.setMatrixAt(index, matrix)

        const upperOffset = broadleaf
          ? worldOffset(.04 * displayScale, .26 * displayScale)
          : worldOffset(
              (variant % 3 - 1) * tierJitter * 1.1,
              (variant % 2 ? -.7 : .8) * tierJitter,
            )
        const upperScale = broadleaf ? .78 : .57
        quaternion.setFromEuler(
          new THREE.Euler(
            broadleaf ? (corruptTrees ? .06 : 0) : (variant - 1.5) * (corruptTrees ? .04 : .02),
            item.rotation - .16 + variant * .035,
            broadleaf
              ? (corruptTrees ? -.075 : 0)
              : (variant % 2 ? -1 : 1) * (corruptTrees ? .072 : .026),
          ),
        )
        scale.set(
          displayScale * upperScale * (broadleaf ? 1 : 1.02),
          displayScale * upperScale * (broadleaf ? 1.08 : .92),
          displayScale * upperScale * (broadleaf ? 1 : .9),
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + upperOffset.x,
            item.y + (broadleaf ? 4.75 : 5.03) * displayScale,
            item.z + upperOffset.z,
          ),
          quaternion,
          scale,
        )
        upper.setMatrixAt(index, matrix)

        const accentOffset = broadleaf
          ? worldOffset(.42 * displayScale, .18 * displayScale)
          : worldOffset(
              (variant % 2 ? -.42 : .38) * displayScale,
              (variant < 2 ? .28 : -.24) * displayScale,
            )
        quaternion.setFromEuler(
          new THREE.Euler(
            broadleaf ? .08 : (variant % 2 ? -.08 : .06),
            item.rotation + .32 + variant * .11,
            broadleaf ? -.06 : (variant % 2 ? .12 : -.1),
          ),
        )
        const accentScale = broadleaf ? .72 : .66 + variant * .035
        scale.set(
          displayScale * accentScale * (broadleaf ? 1.05 : 1.18),
          displayScale * accentScale * (broadleaf ? .92 : .78),
          displayScale * accentScale,
        )
        matrix.compose(
          new THREE.Vector3(
            item.x + accentOffset.x,
            item.y + (broadleaf ? 4.12 : 3.92 + variant * .06) * displayScale,
            item.z + accentOffset.z,
          ),
          quaternion,
          scale,
        )
        accent.setMatrixAt(index, matrix)
      })

      lower.castShadow = true
      middle.castShadow = true
      upper.castShadow = true
      accent.castShadow = true
      group.add(lower, middle, upper, accent)
    })
  }

  if (deadTrees.length) {
    const lowerTrunkGeometry = new THREE.CylinderGeometry(.18, .34, 2.55, 6)
    const upperTrunkGeometry = new THREE.CylinderGeometry(.11, .22, 2.35, 6)
    const branchGeometry = new THREE.CylinderGeometry(.045, .11, 1.15, 5)
    const deadWood = new THREE.MeshStandardMaterial({
      color: 0x493b31,
      roughness: 1,
    })
    const lowerTrunks = new THREE.InstancedMesh(
      lowerTrunkGeometry,
      deadWood,
      deadTrees.length,
    )
    const upperTrunks = new THREE.InstancedMesh(
      upperTrunkGeometry,
      deadWood,
      deadTrees.length,
    )
    const branchA = new THREE.InstancedMesh(
      branchGeometry,
      deadWood,
      deadTrees.length,
    )
    const branchB = new THREE.InstancedMesh(
      branchGeometry,
      deadWood,
      deadTrees.length,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    deadTrees.forEach((item, index) => {
      const leanYaw = item.rotation + .5 + item.variant * .43
      const lowerLean = .035 + item.variant * .012
      quaternion.setFromEuler(
        new THREE.Euler(
          Math.sin(leanYaw) * lowerLean,
          item.rotation,
          Math.cos(leanYaw) * lowerLean,
        ),
      )
      scale.set(item.scale, item.scale, item.scale)
      matrix.compose(
        new THREE.Vector3(item.x, item.y + 1.18 * item.scale, item.z),
        quaternion,
        scale,
      )
      lowerTrunks.setMatrixAt(index, matrix)

      const bend = .16 + item.variant * .025
      const upperX = Math.cos(leanYaw) * bend * item.scale
      const upperZ = Math.sin(leanYaw) * bend * item.scale
      quaternion.setFromEuler(
        new THREE.Euler(
          Math.sin(leanYaw) * (.1 + item.variant * .014),
          item.rotation + .08 * (item.variant - 1.5),
          Math.cos(leanYaw) * (.1 + item.variant * .014),
        ),
      )
      matrix.compose(
        new THREE.Vector3(
          item.x + upperX,
          item.y + 3.18 * item.scale,
          item.z + upperZ,
        ),
        quaternion,
        scale,
      )
      upperTrunks.setMatrixAt(index, matrix)

      const aYaw = item.rotation + .42 + item.variant * .31
      quaternion.setFromEuler(
        new THREE.Euler(.08, aYaw, .72 + item.variant * .035),
      )
      scale.set(
        item.scale * (.82 + item.variant * .04),
        item.scale,
        item.scale * (.82 + item.variant * .04),
      )
      matrix.compose(
        new THREE.Vector3(
          item.x + upperX + Math.cos(aYaw) * .24 * item.scale,
          item.y + 2.68 * item.scale,
          item.z + upperZ + Math.sin(aYaw) * .24 * item.scale,
        ),
        quaternion,
        scale,
      )
      branchA.setMatrixAt(index, matrix)

      const bYaw = item.rotation + 2.08 - item.variant * .17
      quaternion.setFromEuler(
        new THREE.Euler(-.06, bYaw, -1.02 + item.variant * .045),
      )
      scale.set(item.scale * .72, item.scale * .88, item.scale * .72)
      matrix.compose(
        new THREE.Vector3(
          item.x + upperX + Math.cos(bYaw) * .18 * item.scale,
          item.y + 3.68 * item.scale,
          item.z + upperZ + Math.sin(bYaw) * .18 * item.scale,
        ),
        quaternion,
        scale,
      )
      branchB.setMatrixAt(index, matrix)
    })

    lowerTrunks.castShadow = true
    lowerTrunks.receiveShadow = true
    upperTrunks.castShadow = true
    upperTrunks.receiveShadow = true
    branchA.castShadow = true
    branchB.castShadow = true
    group.add(lowerTrunks, upperTrunks, branchA, branchB)
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
    const material = new THREE.MeshStandardMaterial({ color: groundCoverColors.fern, roughness: 1 })
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
    const material = new THREE.MeshStandardMaterial({ color: groundCoverColors.grass, roughness: 1 })
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
    const material = new THREE.MeshStandardMaterial({ color: groundCoverColors.shrub, roughness: 1 })
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
    const material = new THREE.MeshStandardMaterial({ color: groundCoverColors.reeds, roughness: 1 })
    const bladesPerCluster = 6
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      reeds.length * bladesPerCluster,
    )
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    let cursor = 0
    for (const item of reeds) {
      for (let blade = 0; blade < bladesPerCluster; blade += 1) {
        const angle = item.rotation + blade * 1.37 + item.variant * .16
        const radius = .1 + (blade % 3) * .09
        quaternion.setFromEuler(
          new THREE.Euler(
            0,
            angle,
            (blade - (bladesPerCluster - 1) / 2) * .022,
          ),
        )
        scale.set(
          item.scale * (.9 + (blade % 2) * .08),
          item.scale * (.74 + (blade % 4) * .1),
          item.scale * (.9 + (blade % 3) * .05),
        )
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
    const { width: bridgeWidth, length } = forgeBridgeDimensions(crossing.width)
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
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(
          length,
          FORGE_WORLD_SCALE.bridgeRailThickness,
          .12,
        ),
        railMaterial,
      )
      rail.position.set(
        0,
        FORGE_WORLD_SCALE.bridgeRailHeight,
        side * bridgeWidth * .54,
      )
      rail.castShadow = true
      group.add(rail)

      for (const x of [-length * .42, 0, length * .42]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(.13, FORGE_WORLD_SCALE.bridgePostHeight, .13),
          railMaterial,
        )
        post.position.set(
          x,
          FORGE_WORLD_SCALE.bridgePostHeight * .5,
          side * bridgeWidth * .54,
        )
        post.castShadow = true
        group.add(post)
      }
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
  const poiVisualScale = forgePoiVisualScale(poi.type)
  const poiRotation = forgePoiPresentationRotation(region.nodes, poi)
  group.position.set(poi.x, y, poi.z)
  group.rotation.y = poiRotation
  group.scale.setScalar(poiVisualScale)

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
    const tentRandom = seededVisualRandom(`${poi.id}:tent-layout`)
    for (let i = 0; i < tents; i += 1) {
      const baseAngle = i / tents * Math.PI * 2 + .35
      const angle = baseAngle + (tentRandom() - .5) * .3
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.2, 4), cloth)
      const baseRadius = poi.type === 'settlement' ? 4.5 : 3.7
      const tentRadius = baseRadius + (tentRandom() - .5) * .9
      tent.position.set(
        Math.cos(angle) * tentRadius,
        1.05,
        Math.sin(angle) * tentRadius,
      )
      tent.rotation.y =
        Math.PI / 4 +
        angle +
        (tentRandom() - .5) * .34
      tent.castShadow = true
      group.add(tent)
    }
    const fire = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .1, 12), new THREE.MeshStandardMaterial({ color: 0x6a3823, emissive: 0xff7a2d, emissiveIntensity: .9 }))
    fire.position.y = .09
    group.add(fire)
    for (let i = 0; i < 4; i += 1) {
      const benchAngle =
        i / 4 * Math.PI * 2 +
        .45 +
        (tentRandom() - .5) * .12
      const benchRadius = 1.45 + (tentRandom() - .5) * .18
      addBox(
        group,
        [
          Math.cos(benchAngle) * benchRadius,
          .22,
          Math.sin(benchAngle) * benchRadius,
        ],
        [1.15, .22, .28],
        wood,
        [0, -benchAngle + (tentRandom() - .5) * .08, 0],
      )
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
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.95, 7, 8), stone)
    tower.position.y = 3.35
    tower.castShadow = true
    group.add(tower)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 1.78, .5, 8), darkStone)
    upper.position.y = 6.62
    group.add(upper)
    for (let i = 0; i < 8; i += 1) {
      if (i === 2 || i === 3) continue
      const angle = i / 8 * Math.PI * 2
      addBox(group, [Math.cos(angle) * 1.58, 7.08, Math.sin(angle) * 1.58], [.5, .68, .5], darkStone, [0, -angle, 0])
    }
    const doorwayRecess = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 1.72, .18),
      new THREE.MeshStandardMaterial({ color: 0x161914, roughness: 1 }),
    )
    doorwayRecess.position.set(0, .96, 1.98)
    group.add(doorwayRecess)
    addBox(group, [-.63, 1.02, 2.05], [.2, 1.95, .28], darkStone)
    addBox(group, [.63, 1.02, 2.05], [.2, 1.95, .28], darkStone)
    addBox(group, [0, 1.95, 2.05], [1.46, .22, .3], darkStone)
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
  const labelScaleCompensation = 1 / poiVisualScale
  label.position.set(
    0,
    Math.max(3.5, poi.radius * .58) * labelScaleCompensation,
    0,
  )
  label.scale.multiplyScalar(labelScaleCompensation)
  group.add(label)
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = !object.userData.forgePoiGround
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
  const jitter = (amount = .24) => (random() - .5) * amount

  type GroundProfile = {
    core: number
    edge: number
    width: number
    depth: number
    coreOpacity: number
    edgeOpacity: number
  }

  const groundProfiles: Record<string, GroundProfile> = {
    ruins: {
      core: 0x49483a,
      edge: 0x46503b,
      width: 3.9,
      depth: 3.6,
      coreOpacity: .46,
      edgeOpacity: .22,
    },
    graveyard: {
      core: 0x414333,
      edge: 0x42513a,
      width: 3.65,
      depth: 3.45,
      coreOpacity: .48,
      edgeOpacity: .2,
    },
    camp: {
      core: 0x5a4127,
      edge: 0x4b5131,
      width: 3.7,
      depth: 3.35,
      coreOpacity: .54,
      edgeOpacity: .24,
    },
    settlement: {
      core: 0x5b432a,
      edge: 0x4c5232,
      width: 4.7,
      depth: 4.2,
      coreOpacity: .56,
      edgeOpacity: .25,
    },
    shrine: {
      core: 0x46503d,
      edge: 0x40573e,
      width: 2.85,
      depth: 2.6,
      coreOpacity: .3,
      edgeOpacity: .16,
    },
    'standing-stones': {
      core: 0x46503d,
      edge: 0x40573e,
      width: 3.45,
      depth: 3.25,
      coreOpacity: .3,
      edgeOpacity: .16,
    },
    'beast-den': {
      core: 0x453526,
      edge: 0x3f4a31,
      width: 3.45,
      depth: 2.9,
      coreOpacity: .58,
      edgeOpacity: .24,
    },
    watchtower: {
      core: 0x484536,
      edge: 0x43503a,
      width: 3.1,
      depth: 2.9,
      coreOpacity: .44,
      edgeOpacity: .2,
    },
    dungeon: {
      core: 0x42423a,
      edge: 0x414f3a,
      width: 3.55,
      depth: 3.15,
      coreOpacity: .5,
      edgeOpacity: .22,
    },
  }

  const profile = groundProfiles[poi.type] ?? groundProfiles.ruins

  const irregularGroundGeometry = (phase: number, points = 11) => {
    const shape = new THREE.Shape()
    for (let index = 0; index < points; index += 1) {
      const angle = index / points * Math.PI * 2
      const wobble =
        .83 +
        .12 * Math.sin(index * 2.31 + phase) +
        .08 * Math.sin(index * 4.17 + phase * 1.7)
      const x = Math.cos(angle) * wobble
      const y = Math.sin(angle) * wobble
      if (index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }

  const addGroundPatch = (
    x: number,
    z: number,
    width: number,
    depth: number,
    color: number,
    opacity: number,
    rotation: number,
    phase: number,
    renderOrder: number,
  ) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const patch = new THREE.Mesh(irregularGroundGeometry(phase), material)
    patch.rotation.x = -Math.PI / 2
    patch.rotation.z = rotation
    patch.position.set(x, .034 + renderOrder * .002, z)
    patch.scale.set(width, depth, 1)
    patch.receiveShadow = true
    patch.userData.forgePoiGround = true
    patch.renderOrder = renderOrder
    group.add(patch)
  }

  const addWornArc = (
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    length: number,
    color: number,
    opacity: number,
    rotation = 0,
  ) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(
        innerRadius,
        outerRadius,
        16,
        1,
        startAngle,
        length,
      ),
      material,
    )
    arc.rotation.x = -Math.PI / 2
    arc.rotation.z = rotation
    arc.position.y = .045
    arc.receiveShadow = true
    arc.userData.forgePoiGround = true
    arc.renderOrder = 4
    group.add(arc)
  }

  // Keep the darkest wear under the actual landmark and bias it away from the
  // local +Z entrance so the generated access path remains visually readable.
  addGroundPatch(
    0,
    -.45,
    profile.width,
    profile.depth * .84,
    profile.core,
    profile.coreOpacity,
    -.06,
    .4,
    2,
  )
  addGroundPatch(
    -profile.width * .34,
    .08,
    profile.width * .58,
    profile.depth * .6,
    profile.edge,
    profile.edgeOpacity,
    .28,
    1.7,
    3,
  )
  addGroundPatch(
    profile.width * .35,
    -.02,
    profile.width * .56,
    profile.depth * .57,
    profile.edge,
    profile.edgeOpacity * .92,
    -.34,
    2.9,
    3,
  )
  addGroundPatch(
    -.08,
    -profile.depth * .58,
    profile.width * .7,
    profile.depth * .42,
    profile.edge,
    profile.edgeOpacity * .78,
    .12,
    4.2,
    3,
  )

  // Two light side patches frame the entrance instead of painting over the
  // centreline. The branch/road underneath therefore stays visible.
  addGroundPatch(
    -profile.width * .48,
    profile.depth * .64,
    profile.width * .3,
    profile.depth * .28,
    profile.edge,
    profile.edgeOpacity * .56,
    .18,
    5.3,
    3,
  )
  addGroundPatch(
    profile.width * .48,
    profile.depth * .64,
    profile.width * .3,
    profile.depth * .28,
    profile.edge,
    profile.edgeOpacity * .52,
    -.22,
    6.1,
    3,
  )

  const addBlendTuft = (
    x: number,
    z: number,
    scale: number,
    rotation: number,
  ) => {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(.11, .48, 4),
      green,
    )
    tuft.position.set(x, .23 * scale, z)
    tuft.rotation.set(.05, rotation, -.08)
    tuft.scale.set(scale, scale, scale * .72)
    tuft.castShadow = false
    group.add(tuft)
  }

  const tuftAngles = [
    -.25,
    .38,
    2.15,
    2.75,
    3.55,
    4.05,
  ]
  tuftAngles.forEach((angle, index) => {
    const radiusX = profile.width * (.86 + (index % 2) * .07)
    const radiusZ = profile.depth * (.83 + ((index + 1) % 2) * .08)
    addBlendTuft(
      Math.cos(angle) * radiusX,
      Math.sin(angle) * radiusZ - .12,
      .72 + (index % 3) * .12,
      angle + .3,
    )
  })

  const addRockAt = (x: number, z: number, scale = 1) => {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.34 + random() * .18, 0),
      random() > .42 ? stone : darkStone,
    )
    mesh.position.set(x + jitter(), .18, z + jitter())
    mesh.scale.set(scale * (1 + random() * .2), scale * (.55 + random() * .22), scale)
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }

  const addShrubAt = (x: number, z: number, scale = 1) => {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.42 + random() * .13, 0),
      green,
    )
    mesh.position.set(x + jitter(), .32, z + jitter())
    mesh.scale.set(scale, scale * .68, scale)
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }

  const addTimberAt = (
    x: number,
    z: number,
    rotation: number,
    length = 2.25,
    scale = 1,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.12 * scale, .17 * scale, length, 6),
      wood,
    )
    mesh.rotation.set(0, rotation, Math.PI / 2)
    mesh.position.set(x + jitter(.16), .17 * scale, z + jitter(.16))
    group.add(mesh)
  }

  const addFence = (
    x: number,
    z: number,
    rotation: number,
    length = 2.4,
  ) => {
    addBox(group, [x, .42, z], [length, .12, .12], wood, [0, rotation, 0])
    for (const side of [-1, 1]) {
      addBox(
        group,
        [
          x + Math.cos(rotation) * length * .42 * side,
          .42,
          z - Math.sin(rotation) * length * .42 * side,
        ],
        [.11, .82, .11],
        wood,
      )
    }
  }

  const addCrateStack = (x: number, z: number, rotation = 0) => {
    const positions = [
      [0, .32, 0],
      [.62, .32, .08],
      [.28, .88, .02],
    ] as const
    positions.forEach(([dx, y, dz], index) => {
      addBox(
        group,
        [x + dx, y, z + dz],
        [.58, .58, .58],
        wood,
        [0, rotation + (index - 1) * .07, 0],
      )
    })
  }

  const addMarkerPair = (
    z: number,
    gap: number,
    material: THREE.MeshStandardMaterial,
    height = 1.5,
  ) => {
    for (const side of [-1, 1]) {
      addBox(group, [side * gap, height * .5, z], [.27, height, .27], material)
    }
  }

  if (poi.type === 'ruins') {
    // Foundation fragments and gateway wear make the ruin feel embedded without
    // expanding the soft blend back into a large POI disk.
    addGroundPatch(-1.15, 2.15, 1.25, .92, profile.core, .19, -.08, 7.2, 4)
    addGroundPatch(1.15, 2.12, 1.2, .88, profile.core, .17, .1, 8.1, 4)
    addBox(group, [-1.35, .08, -.55], [1.55, .16, 1.05], darkStone, [0, .16, 0])
    addBox(group, [1.05, .07, -1.25], [1.25, .14, .92], stone, [0, -.23, 0])
    addBox(group, [2.05, .07, 1.45], [1.05, .14, .72], darkStone, [0, .31, 0])

    // Collapse and rubble follow the surviving walls instead of forming a ring.
    addRockAt(-4.15, -2.5, 1.05)
    addRockAt(-3.6, -3.05, .82)
    addRockAt(3.65, -2.35, 1.15)
    addRockAt(4.05, -1.55, .72)
    addRockAt(-3.85, 2.1, .76)
    addTimberAt(2.7, -3.45, .18, 3.1, 1.1)
    addTimberAt(3.25, -3.05, -.1, 2.55, .9)
    addBox(group, [-3.95, .38, -.15], [2.5, .76, .42], darkStone, [.06, .18, -.13])
    addBox(group, [2.85, .28, 3.55], [2.1, .56, .4], stone, [0, -.12, 0])
    addShrubAt(-4.6, -3.3, .9)
    addShrubAt(4.5, -2.8, 1.05)
    addMarkerPair(5.05, 1.75, darkStone, 1.65)
  } else if (poi.type === 'watchtower') {
    // Tight base wear, low entry steps and guard-yard details visually anchor
    // the tower while keeping its overall footprint restrained.
    addGroundPatch(0, -.15, 2.2, 2.05, profile.core, .24, .04, 7.6, 4)
    addBox(group, [0, .09, 2.48], [1.35, .18, .62], stone)
    addBox(group, [0, .045, 2.9], [1.75, .09, .7], darkStone)
    addRockAt(-2.05, -.85, .58)
    addRockAt(2.15, -.65, .52)

    // A small guard yard, not a random debris halo.
    addFence(-4.15, .2, Math.PI / 2, 3)
    addFence(4.15, .25, Math.PI / 2, 3)
    addFence(-3.05, -3.7, .12, 2.25)
    addCrateStack(-3.45, -2.45, .12)
    addTimberAt(3.35, -2.9, .08, 2.8, 1)
    addTimberAt(3.55, -2.48, -.04, 2.35, .88)
    addRockAt(-2.6, 3.7, .78)
    addRockAt(2.75, 3.55, .9)
    addShrubAt(-4.1, -3.65, .9)
    addMarkerPair(4.8, 1.62, wood, 1.55)
  } else if (poi.type === 'graveyard') {
    // A very light inner wear patch and stone threshold are enough here; the
    // enclosure/rows already provide strong readability.
    addGroundPatch(0, 1.65, 1.55, 1.05, profile.core, .12, -.04, 7.9, 4)
    addBox(group, [0, .06, 3.02], [1.75, .12, .52], stone)

    // Keep the grave rows readable; age the back corners and entrance instead.
    addShrubAt(-4.5, -2.85, 1.05)
    addShrubAt(4.45, -2.7, .92)
    addShrubAt(-4.55, 2.15, .82)
    addRockAt(-4.1, -3.4, .74)
    addRockAt(4.15, -3.25, .88)
    addBox(group, [0, .78, -4.25], [.72, 1.56, .56], darkStone)
    addBox(group, [0, 1.56, -4.25], [1.4, .22, .5], stone)
    addFence(-4.2, 4.15, .08, 2.15)
    addFence(4.2, 4.15, -.08, 2.15)
    addMarkerPair(4.65, 2.42, darkStone, 1.7)
  } else if (poi.type === 'camp' || poi.type === 'settlement') {
    const settlement = poi.type === 'settlement'

    // Concentrate the strongest wear at the fire rather than darkening the
    // entire camp footprint.
    addGroundPatch(
      0,
      0,
      settlement ? 1.35 : 1.15,
      settlement ? 1.2 : 1.02,
      0x302b24,
      settlement ? .4 : .45,
      .08,
      8.4,
      4,
    )

    addCrateStack(-3.25, -2.75, .18)
    if (settlement) addCrateStack(-4.65, -1.4, -.16)
    addTimberAt(3.35, -2.65, .12, 2.9, 1)
    addTimberAt(3.62, -2.18, -.08, 2.55, .92)
    addTimberAt(3.08, -1.78, .04, 2.25, .82)
    addFence(-4.45, 1.25, Math.PI / 2 + .08, settlement ? 3 : 2.25)
    addFence(4.45, 1.15, Math.PI / 2 - .08, settlement ? 3 : 2.25)
    if (settlement) {
      addFence(-3.15, -4.45, .08, 2.6)
      addFence(3.15, -4.45, -.08, 2.6)
    }
    addShrubAt(-4.35, -3.5, .8)
    addShrubAt(4.45, -3.25, .85)
    addMarkerPair(settlement ? 5.7 : 4.7, settlement ? 2.05 : 1.65, wood, 1.5)
  } else if (poi.type === 'shrine' || poi.type === 'standing-stones') {
    if (poi.type === 'standing-stones') {
      // A broken, low-opacity ritual ring and a few chips create a readable
      // sacred centre without reintroducing a hard circular ground decal.
      addGroundPatch(0, -.05, 2.15, 1.95, profile.core, .12, .1, 8.8, 4)
      addWornArc(1.62, 1.92, .2, 2.15, profile.core, .22, .05)
      addWornArc(1.62, 1.92, 3.05, 1.75, profile.edge, .18, -.08)
      for (let index = 0; index < 4; index += 1) {
        const angle = .55 + index * 1.42
        const radius = 1.25 + (index % 2) * .45
        addRockAt(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          .32 + (index % 2) * .08,
        )
      }
    }

    const ring = poi.type === 'standing-stones' ? 4.7 : 4.15
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2 + .2
      addRockAt(Math.cos(angle) * ring, Math.sin(angle) * ring, .58 + (index % 2) * .13)
    }
    addBox(group, [-1.25, .18, 3.55], [.65, .36, .65], stone)
    addBox(group, [1.25, .18, 3.55], [.65, .36, .65], stone)
    addShrubAt(-4.25, -2.6, .72)
    addShrubAt(4.15, -2.45, .72)
    addMarkerPair(4.35, 1.5, stone, 1.25)
  } else if (poi.type === 'beast-den') {
    addRockAt(-3.25, .85, 1.2)
    addRockAt(-2.85, -.35, .82)
    addRockAt(3.15, .75, 1.1)
    addRockAt(2.7, -.65, .78)
    addTimberAt(-3.45, -2.2, -.3, 2.8, 1)
    addTimberAt(3.25, -2.3, .22, 2.45, .9)
    addShrubAt(-3.8, -2.9, .85)
    addShrubAt(3.65, -2.75, .78)
  } else if (poi.type === 'dungeon') {
    // Broken approach stones deliberately frame the portal.
    for (const side of [-1, 1]) {
      addBox(group, [side * 3.2, .75, 3.45], [.5, 1.5, .5], darkStone, [0, 0, side * .08])
      addBox(group, [side * 4.05, .48, 1.75], [.58, .96, .52], stone, [0, 0, -side * .11])
      addRockAt(side * 3.9, -2.15, .9)
      addShrubAt(side * 4.25, -2.75, .7)
    }
    addRockAt(-2.85, -3.2, .72)
    addRockAt(2.7, -3.35, .78)
    addMarkerPair(4.85, 1.95, darkStone, 1.65)
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


function editorMoodStyle(mood: GeneratedRegion['mood']) {
  if (mood === 'dark') {
    return {
      background: 0x101813,
      fog: 0x142019,
      fogDensity: .0072,
      exposure: .96,
      hemisphere: 1.62,
      sun: 2.15,
      fill: .62,
      terrainTint: 0x243226,
      terrainTintStrength: .14,
      terrainBrightness: .82,
      colorBrightness: .82,
      colorTint: 0x263229,
      colorTintStrength: .08,
    }
  }
  if (mood === 'deadwood') {
    return {
      background: 0x141713,
      fog: 0x1b2119,
      fogDensity: .0069,
      exposure: 1,
      hemisphere: 1.78,
      sun: 2.28,
      fill: .68,
      terrainTint: 0x443f2f,
      terrainTintStrength: .12,
      terrainBrightness: .86,
      colorBrightness: .84,
      colorTint: 0x4a4332,
      colorTintStrength: .1,
    }
  }
  if (mood === 'bleak') {
    return {
      background: 0x1b211f,
      fog: 0x242b27,
      fogDensity: .0066,
      exposure: 1.03,
      hemisphere: 1.88,
      sun: 2.36,
      fill: .72,
      terrainTint: 0x59605a,
      terrainTintStrength: .12,
      terrainBrightness: .91,
      colorBrightness: .9,
      colorTint: 0x5d625d,
      colorTintStrength: .12,
    }
  }
  return {
    background: 0x17231a,
    fog: 0x1a281e,
    fogDensity: .0064,
    exposure: 1.22,
    hemisphere: 2.25,
    sun: 3.1,
    fill: 1.05,
    terrainTint: 0x000000,
    terrainTintStrength: 0,
    terrainBrightness: 1,
    colorBrightness: 1,
    colorTint: 0x000000,
    colorTintStrength: 0,
  }
}

function applyEditorMood(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  mood: GeneratedRegion['mood'],
) {
  const style = editorMoodStyle(mood)
  scene.background = new THREE.Color(style.background)
  scene.fog = new THREE.FogExp2(style.fog, style.fogDensity)
  renderer.toneMappingExposure = style.exposure

  const hemisphere = scene.getObjectByName('WorldMoodHemisphere')
  if (hemisphere instanceof THREE.HemisphereLight) hemisphere.intensity = style.hemisphere
  const sun = scene.getObjectByName('WorldMoodSun')
  if (sun instanceof THREE.DirectionalLight) sun.intensity = style.sun
  const fill = scene.getObjectByName('WorldMoodFill')
  if (fill instanceof THREE.DirectionalLight) fill.intensity = style.fill
}

function applyEditorMoodColor(
  value: number,
  mood: GeneratedRegion['mood'],
) {
  const style = editorMoodStyle(mood)
  return new THREE.Color(value)
    .multiplyScalar(style.colorBrightness)
    .lerp(new THREE.Color(style.colorTint), style.colorTintStrength)
    .getHex()
}

function editorMoodPalette<T extends Record<string, number>>(
  palette: T,
  mood: GeneratedRegion['mood'],
): T {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [
      key,
      applyEditorMoodColor(value, mood),
    ]),
  ) as T
}

function editorBiomePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { ground: 0x5a4d32, low: 0x3c4933, mid: 0x66573b, high: 0x74654a, tree: 0x73502b, fern: 0x596137, rock: 0x67645b }
  if (value.includes('highland')) return { ground: 0x4b5148, low: 0x39453f, mid: 0x5d655b, high: 0x747a70, tree: 0x2d402e, fern: 0x4a5b3d, rock: 0x737a73 }
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) return { ground: 0x24352d, low: 0x172f2a, mid: 0x2d4739, high: 0x415346, tree: 0x1b3024, fern: 0x315f42, rock: 0x4b5751 }
  if (value.includes('corrupt')) return { ground: 0x413444, low: 0x302b3d, mid: 0x554258, high: 0x6a526e, tree: 0x342d3b, fern: 0x5b3c63, rock: 0x75657a }
  if (value.includes('farmland') || value.includes('meadow') || value.includes('grassland')) return { ground: 0x6a633f, low: 0x506040, mid: 0x77704a, high: 0x8b8258, tree: 0x425838, fern: 0x637043, rock: 0x777468 }
  return { ground: 0x28412c, low: 0x203929, mid: 0x354b33, high: 0x526049, tree: 0x183824, fern: 0x2e6039, rock: 0x596159 }
}

function editorGroundCoverColors(biome: string, fallbackFern: number) {
  const value = biome.toLowerCase()
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) {
    return {
      fern: 0x2b4b38,
      grass: 0x4b5a42,
      shrub: 0x294237,
      reeds: 0x67734e,
    }
  }
  if (value.includes('corrupt')) {
    return {
      fern: 0x514557,
      grass: 0x625e4b,
      shrub: 0x403b45,
      reeds: 0x665d4d,
    }
  }
  return {
    fern: fallbackFern,
    grass: 0x58704a,
    shrub: 0x2f4c33,
    reeds: 0x607453,
  }
}

function editorTreeVariantColors(biome: string, fallback: number) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) {
    return [0x8d552d, 0xb06f31, 0x71402a, 0x45503a]
  }
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) {
    return [0x1b3024, 0x263c2d, 0x304735, 0x1d3528]
  }
  if (value.includes('corrupt')) {
    return [0x342d3b, 0x403344, 0x2d3039, 0x4b394c]
  }
  return [fallback, fallback, fallback, fallback]
}

function editorSurfacePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { forestFloor: 0x473d2c, moss: 0x62613a, soil: 0x6a5538, meadow: 0x6b6840, scrub: 0x564b31, rocky: 0x6e6759 }
  if (value.includes('highland')) return { forestFloor: 0x41483f, moss: 0x55604c, soil: 0x625b49, meadow: 0x606c4d, scrub: 0x4d5641, rocky: 0x747a70 }
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) return { forestFloor: 0x1c3028, moss: 0x2d6044, soil: 0x3b4135, meadow: 0x395a42, scrub: 0x274839, rocky: 0x4d5a53 }
  if (value.includes('corrupt')) return { forestFloor: 0x352d3b, moss: 0x55405d, soil: 0x604b56, meadow: 0x624e66, scrub: 0x49374f, rocky: 0x5a4d60 }
  if (value.includes('farmland') || value.includes('meadow') || value.includes('grassland')) return { forestFloor: 0x505039, moss: 0x607042, soil: 0x79613f, meadow: 0x85804d, scrub: 0x66603d, rocky: 0x7b796b }
  return { forestFloor: 0x203625, moss: 0x365c38, soil: 0x5b503b, meadow: 0x4b6743, scrub: 0x304b34, rocky: 0x62685f }
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}
