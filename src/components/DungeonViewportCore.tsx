import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { getRoomConnection, type DungeonConnection, type DungeonMarker, type DungeonRoom, type DungeonWall } from '../lib/dungeonPackage'
import { dungeonProps, type DungeonProp, type DungeonWithProps, type PropLibraryAsset } from '../lib/dungeonProps'
import { dungeonAtmosphere, dungeonLightingProfile, roomAccent, tintRoomFloor, type DungeonAtmosphere } from '../lib/dungeonAtmosphere'
import { addDungeonMasonryV3, addDungeonRoomOverlayV3, dungeonContainsPointV3, dungeonFloorHeightV3, dungeonRoomAtV3, dungeonRoomContainsV3 } from '../lib/dungeonForgeV3'

export type DungeonTool = 'select' | 'room' | 'wall' | 'corridor' | 'door' | 'enemy' | 'loot' | 'checkpoint' | 'portal' | 'trigger' | 'light' | 'prop' | 'erase'
export type ResizeSide = 'north' | 'south' | 'east' | 'west'

type Props = {
  value: DungeonWithProps
  tool: DungeonTool
  selectedRoomId?: string
  selectedMarkerId?: string
  selectedPropId?: string
  selectedWallId?: string
  corridorStartId?: string
  topDown: boolean
  playtest: boolean
  libraryAssets: PropLibraryAsset[]
  onGroundClick: (point: { x: number; z: number }) => void
  onRoomClick: (roomId: string) => void
  onMarkerClick: (markerId: string) => void
  onPropClick: (propId: string) => void
  onWallClick: (wallId: string) => void
  onRoomMove: (roomId: string, x: number, z: number, freeMove: boolean) => void
  onRoomResize: (roomId: string, side: ResizeSide, x: number, z: number, freeMove: boolean) => void
  onPropMove: (propId: string, x: number, z: number, freeMove: boolean) => void
  onRoomDraw: (rect: { x: number; z: number; width: number; depth: number }) => void
  onWallDraw: (segment: { x1: number; z1: number; x2: number; z2: number }) => void
}

type RoomOpening = DungeonConnection & { corridorId: string }
type DragState =
  | { kind: 'room'; id: string; offsetX: number; offsetZ: number; pointerId: number }
  | { kind: 'prop'; id: string; offsetX: number; offsetZ: number; pointerId: number }
  | { kind: 'resize'; id: string; side: ResizeSide; pointerId: number }
  | { kind: 'draw-room'; x: number; z: number; pointerId: number }
  | { kind: 'draw-wall'; x: number; z: number; pointerId: number }
type FlickerLight = { light: THREE.PointLight; base: number; phase: number; speed: number }

export default function DungeonViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props }, [props])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const initialAtmosphere = dungeonAtmosphere(props.value.theme)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(initialAtmosphere.background)
    scene.fog = new THREE.FogExp2(initialAtmosphere.fog, props.value.settings.fogDensity * initialAtmosphere.fogMultiplier)

    const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 520)
    camera.position.set(38, 46, 44)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = initialAtmosphere.exposure
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), initialAtmosphere.bloomStrength, initialAtmosphere.bloomRadius, initialAtmosphere.bloomThreshold)
    composer.addPass(renderPass)
    composer.addPass(bloomPass)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(4, 0, 0)
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minDistance = 5
    controls.maxDistance = 175
    controls.update()

    const ambient = new THREE.HemisphereLight(initialAtmosphere.sky, initialAtmosphere.ground, initialAtmosphere.ambient)
    scene.add(ambient)
    // Authoring fill keeps masonry legible in the editor without flattening the
    // darker Walk/ARPG presentation.
    const editorFill = new THREE.AmbientLight(0xb99878, 0)
    scene.add(editorFill)
    const key = new THREE.DirectionalLight(initialAtmosphere.key, initialAtmosphere.keyIntensity)
    key.position.set(16, 24, 10)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -85
    key.shadow.camera.right = 85
    key.shadow.camera.top = 85
    key.shadow.camera.bottom = -85
    key.shadow.camera.near = 1
    key.shadow.camera.far = 150
    key.shadow.bias = -0.0005
    scene.add(key)

    const grid = new THREE.GridHelper(200, 200, 0x385064, 0x1b2833)
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const material of gridMaterials) {
      material.transparent = true
      material.opacity = 0.18
    }
    scene.add(grid)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide }))
    ground.rotation.x = -Math.PI / 2
    ground.name = '__ground'
    scene.add(ground)

    const dungeonGroup = new THREE.Group()
    scene.add(dungeonGroup)
    const drawPreview = new THREE.Group()
    scene.add(drawPreview)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const keys = new Set<string>()
    const loader = new GLTFLoader()
    const flickerLights: FlickerLight[] = []
    const atmospherePoints: THREE.Points[] = []
    const cutawayNodes: THREE.Object3D[] = []
    const cutawayFactor = new Map<THREE.Object3D, number>()
    let drag: DragState | undefined
    let dragPreviewPoint: { x: number; z: number; freeMove: boolean } | undefined
    let yaw = 0
    let pitch = 0
    let wasPlaytest = false
    let walkInitialized = false
    let lastFrame = performance.now()
    let lastSignature = ''
    let lastFrameKey = ''

    const fitEditorCamera = (value: DungeonWithProps) => {
      if (!value.rooms.length) return
      const bounds = dungeonWorldBounds(value)
      const span = Math.max(bounds.width, bounds.depth)
      const distance = THREE.MathUtils.clamp(span * 0.49 + 11, 23, 82)
      const height = THREE.MathUtils.clamp(distance * 0.7, 19, 58)
      controls.target.set(bounds.x, 0, bounds.z)
      camera.position.set(bounds.x + distance * 0.5, height, bounds.z + distance * 0.61)
      camera.fov = 45
      camera.updateProjectionMatrix()
      const gridSize = THREE.MathUtils.clamp(span + 24, 46, 150)
      grid.position.set(bounds.x, 0, bounds.z)
      grid.scale.set(gridSize / 200, 1, gridSize / 200)
      controls.update()
    }

    const applyAtmosphere = (value: DungeonWithProps) => {
      const atmosphere = dungeonAtmosphere(value.theme)
      const lighting = dungeonLightingProfile(atmosphere, value.settings)
      scene.background = new THREE.Color(atmosphere.background)
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(atmosphere.fog)
        scene.fog.density = lighting.fogDensity
      }
      ambient.color.setHex(atmosphere.sky)
      ambient.groundColor.setHex(atmosphere.ground)
      ambient.intensity = lighting.ambientIntensity
      editorFill.intensity = lighting.fillIntensity
      key.color.setHex(atmosphere.key)
      key.intensity = lighting.keyIntensity
      renderer.toneMappingExposure = lighting.exposure
      bloomPass.strength = lighting.bloomStrength
      bloomPass.radius = atmosphere.bloomRadius
      bloomPass.threshold = atmosphere.bloomThreshold
      return atmosphere
    }

    const inheritedValue = (object: THREE.Object3D, key: string) => {
      let current: THREE.Object3D | null = object
      while (current && current !== dungeonGroup.parent) {
        const value = current.userData[key]
        if (value !== undefined) return value
        current = current.parent
      }
      return undefined
    }

    const inheritedWallSides = (object: THREE.Object3D | null): ResizeSide[] => {
      let current = object
      while (current && current !== dungeonGroup.parent) {
        const many = current.userData.wallSides
        if (Array.isArray(many) && many.length) return many as ResizeSide[]
        const single = current.userData.wallSide as ResizeSide | undefined
        if (single) return [single]
        current = current.parent
      }
      return []
    }

    const refreshCutawayNodes = () => {
      cutawayNodes.length = 0
      dungeonGroup.traverse((object) => {
        const roomId = inheritedValue(object, 'roomId')
        const sides = inheritedWallSides(object)
        if (!roomId || !sides.length) return
        const parentRoomId = object.parent ? inheritedValue(object.parent, 'roomId') : undefined
        const parentSides = object.parent ? inheritedWallSides(object.parent) : []
        if (parentRoomId === roomId && parentSides.length) return
        if (object === dungeonGroup) return
        cutawayNodes.push(object)
      })
    }

    const ensureCutawayTransform = (object: THREE.Object3D) => {
      if (object.userData.forgeCutawayBaseY === undefined) {
        object.userData.forgeCutawayBaseY = object.position.y
        object.userData.forgeCutawayBaseScaleY = object.scale.y
      }
      object.traverse((child) => {
        const light = child as THREE.PointLight
        if (!light.isPointLight) return
        if (light.userData.forgeCutawayBaseIntensity === undefined) {
          light.userData.forgeCutawayBaseIntensity = light.intensity
        }
      })
    }

    const setCutawayNodeFactor = (object: THREE.Object3D, factor: number) => {
      ensureCutawayTransform(object)
      const baseY = Number(object.userData.forgeCutawayBaseY ?? object.position.y)
      const baseScaleY = Number(object.userData.forgeCutawayBaseScaleY ?? object.scale.y)
      object.position.y = baseY * factor
      object.scale.y = baseScaleY * factor
      object.traverse((child) => {
        const light = child as THREE.PointLight
        if (!light.isPointLight) return
        const baseIntensity = Number(light.userData.forgeCutawayBaseIntensity ?? light.intensity)
        light.intensity = baseIntensity * THREE.MathUtils.lerp(0.12, 1, factor)
      })
    }

    const roomCutawaySides = (room: DungeonRoom) => {
      const dx = camera.position.x - room.x
      const dz = camera.position.z - room.z
      const angle = -THREE.MathUtils.degToRad(room.rotation)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const localX = dx * cos - dz * sin
      const localZ = dx * sin + dz * cos
      return new Set<ResizeSide>([
        localX >= 0 ? 'east' : 'west',
        localZ >= 0 ? 'south' : 'north',
      ])
    }

    const updateEditorCutaways = (dt: number) => {
      const state = propsRef.current
      const roomMap = new Map(state.value.rooms.map((room) => [room.id, room]))
      const sideCache = new Map<string, Set<ResizeSide>>()

      for (const object of cutawayNodes) {
        const roomId = String(inheritedValue(object, 'roomId') ?? '')
        const room = roomMap.get(roomId)
        if (!room) continue

        let target = 1
        if (!state.playtest) {
          let cutSides = sideCache.get(roomId)
          if (!cutSides) {
            cutSides = roomCutawaySides(room)
            sideCache.set(roomId, cutSides)
          }
          const objectSides = inheritedWallSides(object)
          if (objectSides.some((side) => cutSides!.has(side))) {
            const targetHeight = roomId === state.selectedRoomId ? 1.22 : 1.02
            target = THREE.MathUtils.clamp(targetHeight / Math.max(1, room.height), 0.16, 0.42)
          }
        }

        const current = cutawayFactor.get(object) ?? 1
        const speed = target < current ? 14 : 10
        const next = THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * dt))
        setCutawayNodeFactor(object, next)
        if (next >= 0.998 && target === 1) cutawayFactor.delete(object)
        else cutawayFactor.set(object, next)
      }
    }

    const rebuild = () => {
      while (dungeonGroup.children.length) disposeObject(dungeonGroup.children.pop()!)
      flickerLights.length = 0
      atmospherePoints.length = 0
      cutawayNodes.length = 0
      cutawayFactor.clear()
      const state = propsRef.current
      const current = state.value
      const immersive = state.playtest
      const atmosphere = applyAtmosphere(current)
      const frameKey = `${current.seed}:${current.rooms.length}:${current.corridors.length}:${current.walls?.length ?? 0}`
      if (!immersive && frameKey !== lastFrameKey) {
        lastFrameKey = frameKey
        fitEditorCamera(current)
      }
      const useV3 = current.theme === 'crypt'
      const roomMap = new Map(current.rooms.map((item) => [item.id, item]))
      const openings = new Map<string, RoomOpening[]>()
      const addOpening = (roomId: string, opening: RoomOpening) => openings.set(roomId, [...(openings.get(roomId) ?? []), opening])

      for (const edge of current.corridors) {
        const fromRoom = roomMap.get(edge.fromRoomId)
        const toRoom = roomMap.get(edge.toRoomId)
        if (!fromRoom || !toRoom) continue
        const from = getRoomConnection(fromRoom, toRoom, edge.width)
        const to = getRoomConnection(toRoom, fromRoom, edge.width)
        addOpening(fromRoom.id, { ...from, corridorId: edge.id })
        addOpening(toRoom.id, { ...to, corridorId: edge.id })
        if (!useV3) addCorridor(dungeonGroup, from, to, edge.width, atmosphere, immersive)
      }

      if (useV3) {
        addDungeonMasonryV3(dungeonGroup, current, atmosphere, flickerLights, immersive ? 'walk' : 'editor')
      }

      for (const roomValue of current.rooms) {
        if (useV3) {
          if (!immersive) addDungeonRoomOverlayV3(
            dungeonGroup,
            roomValue,
            roomValue.id === state.selectedRoomId,
            roomValue.id === state.corridorStartId,
          )
          continue
        }
        const roomOpenings = openings.get(roomValue.id) ?? []
        addRoom(
          dungeonGroup,
          roomValue,
          current.settings.wallThickness,
          roomOpenings,
          !immersive && roomValue.id === state.selectedRoomId,
          !immersive && roomValue.id === state.corridorStartId,
          immersive,
          atmosphere,
          flickerLights,
          false,
        )
      }
      for (const wallValue of current.walls ?? []) {
        addManualWall(
          dungeonGroup,
          wallValue,
          atmosphere,
          !immersive && wallValue.id === state.selectedWallId,
        )
      }

      const assetMap = new Map(state.libraryAssets.map((item) => [item.id, item]))
      for (const prop of dungeonProps(current)) {
        addDungeonProp(dungeonGroup, prop, assetMap.get(prop.assetRef), prop.id === state.selectedPropId && !immersive, immersive, loader, atmosphere, flickerLights)
      }
      for (const item of current.markers) addMarker(dungeonGroup, item, item.id === state.selectedMarkerId && !immersive, immersive)
      addAtmosphereParticles(dungeonGroup, current, atmosphere, immersive, atmospherePoints)
      refreshCutawayNodes()
    }
    rebuild()

    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      composer.setSize(rect.width, rect.height)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
    }
    const groundPoint = (event: PointerEvent) => {
      updatePointer(event)
      return raycaster.intersectObject(ground, false)[0]?.point
    }

    const requestWalkLock = () => {
      if (!propsRef.current.playtest || document.pointerLockElement === renderer.domElement) return
      try {
        const result = renderer.domElement.requestPointerLock()
        if (result && typeof (result as Promise<void>).catch === 'function') void (result as Promise<void>).catch(() => undefined)
      } catch { /* user gesture may be required */ }
    }

    const getPreferredPropHit = (hits: THREE.Intersection[]) => {
      const propHit = hits.find((hit) => hit.object.userData.propId)
      if (!propHit) return undefined
      const blocker = hits.find((hit) => !hit.object.userData.propId && (hit.object.userData.roomId || hit.object.userData.wallId || hit.object.userData.markerId))
      if (!blocker || propHit.distance <= blocker.distance + 0.7) return propHit
      return undefined
    }

    const clearDrawPreview = () => {
      while (drawPreview.children.length) disposeObject(drawPreview.children.pop()!)
    }

    const showDrawPreview = (kind: 'room' | 'wall', x1: number, z1: number, x2: number, z2: number) => {
      clearDrawPreview()
      const material = new THREE.MeshBasicMaterial({
        color: kind === 'room' ? 0x71c8ef : 0xe8ad65,
        transparent: true,
        opacity: .34,
        depthWrite: false,
      })
      if (kind === 'room') {
        const width = Math.max(.2, Math.abs(x2 - x1))
        const depth = Math.max(.2, Math.abs(z2 - z1))
        const preview = new THREE.Mesh(new THREE.BoxGeometry(width, .08, depth), material)
        preview.position.set((x1 + x2) / 2, .34, (z1 + z2) / 2)
        drawPreview.add(preview)
      } else {
        const dx = x2 - x1, dz = z2 - z1
        const length = Math.hypot(dx, dz)
        if (length < .05) return
        const preview = new THREE.Mesh(new THREE.BoxGeometry(.34, .12, length), material)
        preview.position.set((x1 + x2) / 2, .42, (z1 + z2) / 2)
        preview.rotation.y = Math.atan2(dx, dz)
        drawPreview.add(preview)
      }
    }

    const snapEditorPoint = (x: number, z: number, freeMove: boolean) => {
      const state = propsRef.current
      const step = freeMove || !state.value.settings.snap ? 0.1 : state.value.gridSize
      return {
        x: Math.round(x / step) * step,
        z: Math.round(z / step) * step,
      }
    }

    const previewRoomMove = (roomId: string, x: number, z: number, freeMove: boolean) => {
      const point = snapEditorPoint(x, z, freeMove)
      for (const child of dungeonGroup.children) {
        if (child.userData.roomRoot !== true || child.userData.roomId !== roomId) continue
        child.position.x = point.x
        child.position.z = point.z
      }
    }

    const previewPropMove = (propId: string, x: number, z: number, freeMove: boolean) => {
      const point = snapEditorPoint(x, z, freeMove)
      const root = dungeonGroup.children.find((child) => child.userData.propRoot === true && child.userData.propId === propId)
      if (!root) return
      root.position.x = point.x
      root.position.z = point.z
    }

    const previewRoomResize = (roomId: string, side: ResizeSide, worldX: number, worldZ: number, freeMove: boolean) => {
      const room = propsRef.current.value.rooms.find((item) => item.id === roomId)
      if (!room) return
      const angle = THREE.MathUtils.degToRad(room.rotation)
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const dx = worldX - room.x, dz = worldZ - room.z
      let lx = dx * cos - dz * sin, lz = dx * sin + dz * cos
      const step = freeMove || !propsRef.current.value.settings.snap ? 0.1 : propsRef.current.value.gridSize
      lx = Math.round(lx / step) * step
      lz = Math.round(lz / step) * step
      let width = room.width, depth = room.depth, shiftX = 0, shiftZ = 0
      if (side === 'east') { const fixed = -room.width / 2, boundary = Math.max(fixed + 3, lx); width = boundary - fixed; shiftX = (boundary + fixed) / 2 }
      if (side === 'west') { const fixed = room.width / 2, boundary = Math.min(fixed - 3, lx); width = fixed - boundary; shiftX = (boundary + fixed) / 2 }
      if (side === 'south') { const fixed = -room.depth / 2, boundary = Math.max(fixed + 3, lz); depth = boundary - fixed; shiftZ = (boundary + fixed) / 2 }
      if (side === 'north') { const fixed = room.depth / 2, boundary = Math.min(fixed - 3, lz); depth = fixed - boundary; shiftZ = (boundary + fixed) / 2 }
      width = Math.max(3, Math.round(width / step) * step)
      depth = Math.max(3, Math.round(depth / step) * step)
      const worldShiftX = shiftX * cos + shiftZ * sin
      const worldShiftZ = -shiftX * sin + shiftZ * cos

      clearDrawPreview()
      const material = new THREE.MeshBasicMaterial({ color: 0x71c8ef, transparent: true, opacity: .27, depthWrite: false })
      const preview = new THREE.Mesh(new THREE.BoxGeometry(width, .09, depth), material)
      preview.position.set(room.x + worldShiftX, room.floorLevel + .36, room.z + worldShiftZ)
      preview.rotation.y = angle
      drawPreview.add(preview)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const state = propsRef.current
      if (state.playtest) { requestWalkLock(); event.preventDefault(); return }
      if (state.tool !== 'select') {
        controls.enabled = false
        event.stopImmediatePropagation()
      }

      if (state.tool === 'room' || state.tool === 'wall') {
        const point = groundPoint(event)
        if (!point) return
        drag = {
          kind: state.tool === 'room' ? 'draw-room' : 'draw-wall',
          x: point.x,
          z: point.z,
          pointerId: event.pointerId,
        }
        renderer.domElement.setPointerCapture(event.pointerId)
        controls.enabled = false
        showDrawPreview(state.tool, point.x, point.z, point.x, point.z)
        event.preventDefault()
        return
      }

      updatePointer(event)
      const hits = raycaster.intersectObjects([dungeonGroup, ground], true)
      const resizeHit = hits.find((hit) => hit.object.userData.resizeSide && hit.object.userData.roomId)
      if (state.tool === 'select' && resizeHit) {
        drag = { kind: 'resize', id: String(resizeHit.object.userData.roomId), side: resizeHit.object.userData.resizeSide as ResizeSide, pointerId: event.pointerId }
        renderer.domElement.setPointerCapture(event.pointerId)
        controls.enabled = false
        renderer.domElement.style.cursor = 'nwse-resize'
        event.preventDefault()
        return
      }

      const preferredProp = state.tool === 'select' ? getPreferredPropHit(hits) : undefined
      const hit = preferredProp ?? hits.find((candidate) => candidate.object.userData.propId || candidate.object.userData.wallId || candidate.object.userData.roomId || candidate.object.userData.markerId || candidate.object.userData.dungeonSurface || candidate.object.name === '__ground')
      if (!hit) return
      const surfaceRoom = hit.object.userData.dungeonSurface
        ? dungeonRoomAtV3(state.value, hit.point.x, hit.point.z)
        : undefined
      const roomId = (hit.object.userData.roomId as string | undefined) ?? surfaceRoom?.id
      const markerId = hit.object.userData.markerId as string | undefined
      const propId = hit.object.userData.propId as string | undefined
      const wallId = hit.object.userData.wallId as string | undefined

      if (state.tool === 'select' && wallId) {
        state.onWallClick(wallId)
        event.preventDefault()
        return
      }
      if (state.tool === 'select' && propId) {
        const item = dungeonProps(state.value).find((candidate) => candidate.id === propId)
        const point = groundPoint(event)
        if (item && point) {
          state.onPropClick(propId)
          drag = { kind: 'prop', id: propId, offsetX: point.x - item.x, offsetZ: point.z - item.z, pointerId: event.pointerId }
          renderer.domElement.setPointerCapture(event.pointerId)
          controls.enabled = false
          renderer.domElement.style.cursor = 'grabbing'
          event.preventDefault()
          return
        }
      }
      if (state.tool === 'select' && roomId) {
        const item = state.value.rooms.find((candidate) => candidate.id === roomId)
        const point = groundPoint(event)
        if (item && point) {
          state.onRoomClick(roomId)
          drag = { kind: 'room', id: roomId, offsetX: point.x - item.x, offsetZ: point.z - item.z, pointerId: event.pointerId }
          renderer.domElement.setPointerCapture(event.pointerId)
          controls.enabled = false
          renderer.domElement.style.cursor = 'grabbing'
          event.preventDefault()
          return
        }
      }
      if (state.tool === 'prop') { state.onGroundClick({ x: hit.point.x, z: hit.point.z }); return }
      if (wallId) state.onWallClick(wallId)
      else if (markerId) state.onMarkerClick(markerId)
      else if (roomId) state.onRoomClick(roomId)
      else state.onGroundClick({ x: hit.point.x, z: hit.point.z })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (drag) {
        const point = groundPoint(event)
        if (!point) return
        dragPreviewPoint = { x: point.x, z: point.z, freeMove: event.shiftKey }
        if (drag.kind === 'room') previewRoomMove(drag.id, point.x - drag.offsetX, point.z - drag.offsetZ, event.shiftKey)
        else if (drag.kind === 'prop') previewPropMove(drag.id, point.x - drag.offsetX, point.z - drag.offsetZ, event.shiftKey)
        else if (drag.kind === 'resize') previewRoomResize(drag.id, drag.side, point.x, point.z, event.shiftKey)
        else showDrawPreview(drag.kind === 'draw-room' ? 'room' : 'wall', drag.x, drag.z, point.x, point.z)
        event.preventDefault()
        return
      }
      if (propsRef.current.playtest) {
        renderer.domElement.style.cursor = document.pointerLockElement === renderer.domElement ? 'none' : 'crosshair'
        return
      }
      updatePointer(event)
      const hits = raycaster.intersectObjects(dungeonGroup.children, true)
      const propHit = getPreferredPropHit(hits)
      const surfaceHit = hits.find((hit) => hit.object.userData.dungeonSurface)
      const surfaceRoom = surfaceHit ? dungeonRoomAtV3(propsRef.current.value, surfaceHit.point.x, surfaceHit.point.z) : undefined
      if (hits.some((hit) => hit.object.userData.resizeSide)) renderer.domElement.style.cursor = 'nwse-resize'
      else if (propsRef.current.tool === 'select' && (propHit || surfaceRoom || hits.some((hit) => hit.object.userData.roomId || hit.object.userData.wallId))) renderer.domElement.style.cursor = 'grab'
      else renderer.domElement.style.cursor = propsRef.current.tool === 'select' ? 'default' : 'crosshair'
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return
      const currentDrag = drag
      const pointerPoint = groundPoint(event)
      const point = pointerPoint ?? (dragPreviewPoint ? new THREE.Vector3(dragPreviewPoint.x, 0, dragPreviewPoint.z) : undefined)
      const freeMove = event.shiftKey || dragPreviewPoint?.freeMove === true
      if (renderer.domElement.hasPointerCapture(currentDrag.pointerId)) renderer.domElement.releasePointerCapture(currentDrag.pointerId)
      drag = undefined
      dragPreviewPoint = undefined
      controls.enabled = propsRef.current.tool === 'select'
      renderer.domElement.style.cursor = propsRef.current.tool === 'select' ? 'default' : 'crosshair'

      if (point && currentDrag.kind === 'room') {
        propsRef.current.onRoomMove(currentDrag.id, point.x - currentDrag.offsetX, point.z - currentDrag.offsetZ, freeMove)
      } else if (point && currentDrag.kind === 'prop') {
        propsRef.current.onPropMove(currentDrag.id, point.x - currentDrag.offsetX, point.z - currentDrag.offsetZ, freeMove)
      } else if (point && currentDrag.kind === 'resize') {
        propsRef.current.onRoomResize(currentDrag.id, currentDrag.side, point.x, point.z, freeMove)
      } else if (point && currentDrag.kind === 'draw-room') {
        propsRef.current.onRoomDraw({
          x: (currentDrag.x + point.x) / 2,
          z: (currentDrag.z + point.z) / 2,
          width: Math.abs(point.x - currentDrag.x),
          depth: Math.abs(point.z - currentDrag.z),
        })
      } else if (point && currentDrag.kind === 'draw-wall') {
        propsRef.current.onWallDraw({
          x1: currentDrag.x,
          z1: currentDrag.z,
          x2: point.x,
          z2: point.z,
        })
      }
      clearDrawPreview()
      event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!propsRef.current.playtest || document.pointerLockElement !== renderer.domElement) return
      yaw -= event.movementX * 0.0022
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -Math.PI * 0.47, Math.PI * 0.47)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!propsRef.current.playtest) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        keys.add(event.code)
        event.preventDefault()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code)
    const onBlur = () => keys.clear()
    const onLockChange = () => {
      renderer.domElement.style.cursor = propsRef.current.playtest && document.pointerLockElement === renderer.domElement ? 'none' : propsRef.current.playtest ? 'crosshair' : 'default'
      if (document.pointerLockElement !== renderer.domElement) keys.clear()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown, true)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const enterWalkMode = () => {
      const current = propsRef.current.value
      const entrance = current.rooms.find((item) => item.type === 'entrance') ?? current.rooms[0]
      if (!entrance) return
      camera.fov = 74
      camera.updateProjectionMatrix()
      camera.position.set(entrance.x, entrance.floorLevel + 1.68, entrance.z)
      const edge = current.corridors.find((item) => item.fromRoomId === entrance.id || item.toRoomId === entrance.id)
      const otherId = edge ? (edge.fromRoomId === entrance.id ? edge.toRoomId : edge.fromRoomId) : undefined
      const other = current.rooms.find((item) => item.id === otherId)
      yaw = other ? Math.atan2(-(other.x - entrance.x), -(other.z - entrance.z)) : 0
      pitch = 0
      walkInitialized = true
      controls.enabled = false
      grid.visible = false
    }
    const leaveWalkMode = () => {
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      keys.clear()
      walkInitialized = false
      camera.fov = 48
      camera.updateProjectionMatrix()
      camera.rotation.set(0, 0, 0)
      controls.enabled = true
      fitEditorCamera(propsRef.current.value)
      grid.visible = true
    }
    const updateWalk = (dt: number) => {
      const current = propsRef.current.value
      camera.rotation.set(pitch, yaw, 0)
      const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
      const rightAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      if (!forwardAmount && !rightAmount) return
      const move = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(forwardAmount).add(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(rightAmount))
      if (move.lengthSq() > 1) move.normalize()
      move.multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.8 : 3.8) * dt)
      const tx = camera.position.x + move.x
      const tz = camera.position.z + move.z
      if (canWalkAt(current, tx, camera.position.z)) camera.position.x = tx
      if (canWalkAt(current, camera.position.x, tz)) camera.position.z = tz
      camera.position.y = floorHeightAt(current, camera.position.x, camera.position.z) + 1.68
    }

    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
      lastFrame = now
      const state = propsRef.current
      if (state.playtest !== wasPlaytest) {
        if (state.playtest) enterWalkMode()
        else leaveWalkMode()
        wasPlaytest = state.playtest
      }
      const signature = JSON.stringify([
        state.value.theme,
        state.value.rooms,
        state.value.corridors,
        state.value.markers,
        state.value.walls ?? [],
        dungeonProps(state.value),
        state.value.settings,
        state.selectedRoomId,
        state.selectedMarkerId,
        state.selectedPropId,
        state.selectedWallId,
        state.corridorStartId,
        state.playtest,
        state.libraryAssets.map((asset) => asset.id),
      ])
      if (signature !== lastSignature) {
        lastSignature = signature
        rebuild()
      }
      grid.visible = !state.playtest
      if (state.playtest) {
        if (!walkInitialized) enterWalkMode()
        controls.enabled = false
        updateWalk(dt)
      } else {
        if (state.topDown && !drag) {
          const center = dungeonCenter(state.value.rooms)
          camera.position.lerp(new THREE.Vector3(center.x, 68, center.z + 0.01), 0.09)
          controls.target.lerp(new THREE.Vector3(center.x, 0, center.z), 0.09)
        }
        controls.enabled = !drag && state.tool === 'select'
        if (!drag && state.tool === 'select') controls.update()
      }

      const seconds = now * 0.001
      for (const entry of flickerLights) {
        const noise = Math.sin(seconds * entry.speed + entry.phase) * 0.13 + Math.sin(seconds * entry.speed * 2.31 + entry.phase * 0.47) * 0.06
        entry.light.intensity = entry.base * (1 + noise)
      }
      atmospherePoints.forEach((cloud, index) => {
        cloud.rotation.y += dt * (index % 2 === 0 ? 0.012 : -0.007)
        cloud.position.y = Math.sin(seconds * 0.22 + index) * 0.025
      })
      updateEditorCutaways(dt)

      composer.render()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      controls.dispose()
      disposeObject(dungeonGroup)
      clearDrawPreview()
      drawPreview.removeFromParent()
      ground.geometry.dispose()
      disposeMaterial(ground.material as THREE.Material)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="dungeon-viewport-canvas">
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    {props.playtest && <div className="map-walk-overlay"><div className="map-crosshair" /><div className="map-walk-help"><strong>FIRST PERSON WALK</strong><span>Click for mouse look · WASD move · Shift sprint · Esc releases mouse</span></div></div>}
  </div>
}

function addManualWall(parent: THREE.Group, wall: DungeonWall, atmosphere: DungeonAtmosphere, selected: boolean) {
  const dx = wall.x2 - wall.x1
  const dz = wall.z2 - wall.z1
  const length = Math.hypot(dx, dz)
  if (length < .1) return
  const root = new THREE.Group()
  root.position.set((wall.x1 + wall.x2) / 2, 0, (wall.z1 + wall.z2) / 2)
  root.rotation.y = Math.atan2(dx, dz)
  root.userData.wallId = wall.id
  parent.add(root)

  const dark = new THREE.MeshStandardMaterial({ color: selected ? 0x426f82 : atmosphere.wallDark, roughness: .96 })
  const brick = new THREE.MeshStandardMaterial({ color: selected ? 0x78bfd9 : atmosphere.wall, roughness: .92, metalness: .01 })
  const core = new THREE.Mesh(new THREE.BoxGeometry(wall.thickness, wall.height, length), dark)
  core.position.y = wall.height / 2
  core.castShadow = true
  core.receiveShadow = true
  core.userData.wallId = wall.id
  core.userData.arpgOccluder = true
  root.add(core)

  const rows = Math.max(3, Math.floor(wall.height / .52))
  const rowHeight = wall.height / rows
  const blocks: Array<{ z: number; y: number; length: number; shade: number }> = []
  const random = seededWallRandom(wall.id)
  for (let row = 0; row < rows; row += 1) {
    let cursor = -length / 2 - (row % 2 ? .55 : .05)
    while (cursor < length / 2) {
      const blockLength = .85 + random() * .85
      const center = cursor + blockLength / 2
      if (center > -length / 2 && center < length / 2) blocks.push({
        z: center,
        y: row * rowHeight + rowHeight / 2,
        length: Math.min(blockLength * .94, length),
        shade: .78 + random() * .2,
      })
      cursor += blockLength + .055
    }
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.InstancedMesh(geometry, brick, blocks.length)
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color(0xffffff)
  blocks.forEach((block, index) => {
    dummy.position.set(0, block.y, block.z)
    dummy.scale.set(wall.thickness + .08, rowHeight * .82, block.length)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, tint.clone().multiplyScalar(block.shade))
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.wallId = wall.id
  mesh.userData.arpgOccluder = true
  root.add(mesh)
}

function seededWallRandom(seedText: string) {
  let seed = 2166136261
  for (let index = 0; index < seedText.length; index += 1) seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619)
  return () => {
    seed += 0x6D2B79F5
    let value = seed
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function addRoom(parent: THREE.Group, room: DungeonRoom, wallThickness: number, openings: RoomOpening[], selected: boolean, corridorStart: boolean, immersive: boolean, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  group.userData.roomId = room.id
  group.userData.roomRoot = true
  parent.add(group)

  const floorColor = selected ? new THREE.Color(0x6f9fba) : corridorStart ? new THREE.Color(0x8f78b6) : tintRoomFloor(atmosphere.floor, room.type, atmosphere)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: 0.96,
    metalness: 0.01,
    emissive: crypt ? new THREE.Color(atmosphere.floor).multiplyScalar(0.1) : new THREE.Color(0x000000),
    emissiveIntensity: crypt ? 0.28 : 0,
  })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.18, room.depth), floorMaterial)
  floor.position.y = 0.09
  floor.userData.roomId = room.id
  floor.receiveShadow = true
  group.add(floor)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: selected ? 0x718a91 : atmosphere.wall, roughness: 0.92, metalness: 0.01 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.96 })
  for (const side of ['north', 'south', 'west', 'east'] as ResizeSide[]) {
    addWallWithOpenings(group, room, side, openings.filter((item) => item.side === side), Math.max(0.12, wallThickness), wallMaterial, darkMaterial)
  }
  addFloorSeams(group, room, atmosphere)
  addCornerStonework(group, room, wallMaterial, darkMaterial)
  if (!crypt) addRoomMoodLighting(group, room, atmosphere, flickerLights)

  if (immersive) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.16, room.depth), darkMaterial)
    ceiling.position.y = room.height - 0.08
    ceiling.receiveShadow = true
    ceiling.castShadow = true
    group.add(ceiling)
  }
  if (selected && !immersive) addRoomHandles(group, room)
  if (!immersive) {
    const label = makeLabel(room.name, room.type.toUpperCase())
    label.position.set(0, room.height + 0.6, 0)
    group.add(label)
  }
}

function addWallWithOpenings(group: THREE.Group, room: DungeonRoom, side: ResizeSide, openings: RoomOpening[], thickness: number, material: THREE.Material, darkMaterial: THREE.Material) {
  const horizontal = side === 'north' || side === 'south'
  const total = horizontal ? room.width : room.depth
  const half = total / 2
  const intervals = mergeIntervals(openings.map((opening) => ({ start: Math.max(-half, opening.offset - opening.openingWidth / 2), end: Math.min(half, opening.offset + opening.openingWidth / 2) })))
  const doorHeight = Math.min(2.45, Math.max(1.9, room.height - 0.4))
  let cursor = -half
  for (const interval of intervals) {
    addWallSegment(group, room, side, cursor, interval.start, thickness, room.height, material, darkMaterial)
    const openingLength = interval.end - interval.start
    if (openingLength > 0.05 && room.height > doorHeight + 0.12) {
      const lintelHeight = room.height - doorHeight
      const center = (interval.start + interval.end) / 2
      const lintel = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(openingLength, lintelHeight, thickness), material) : new THREE.Mesh(new THREE.BoxGeometry(thickness, lintelHeight, openingLength), material)
      if (horizontal) lintel.position.set(center, doorHeight + lintelHeight / 2, (side === 'south' ? 1 : -1) * room.depth / 2)
      else lintel.position.set((side === 'east' ? 1 : -1) * room.width / 2, doorHeight + lintelHeight / 2, center)
      lintel.userData.roomId = room.id
      lintel.userData.wallSide = side
      lintel.castShadow = true
      lintel.receiveShadow = true
      group.add(lintel)
    }
    cursor = interval.end
  }
  addWallSegment(group, room, side, cursor, half, thickness, room.height, material, darkMaterial)
}

function addWallSegment(group: THREE.Group, room: DungeonRoom, side: ResizeSide, start: number, end: number, thickness: number, height: number, material: THREE.Material, darkMaterial: THREE.Material) {
  const length = end - start
  if (length <= 0.04) return
  const horizontal = side === 'north' || side === 'south'
  const center = (start + end) / 2
  const wall = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material) : new THREE.Mesh(new THREE.BoxGeometry(thickness, height, length), material)
  if (horizontal) wall.position.set(center, height / 2, (side === 'south' ? 1 : -1) * room.depth / 2)
  else wall.position.set((side === 'east' ? 1 : -1) * room.width / 2, height / 2, center)
  wall.userData.roomId = room.id
  wall.userData.wallSide = side
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)

  const base = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(length, 0.28, thickness + 0.07), darkMaterial) : new THREE.Mesh(new THREE.BoxGeometry(thickness + 0.07, 0.28, length), darkMaterial)
  base.position.copy(wall.position)
  base.position.y = 0.14
  base.userData.roomId = room.id
  base.userData.wallSide = side
  group.add(base)
  const cap = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(length, 0.14, thickness + 0.045), darkMaterial) : new THREE.Mesh(new THREE.BoxGeometry(thickness + 0.045, 0.14, length), darkMaterial)
  cap.position.copy(wall.position)
  cap.position.y = height - 0.16
  cap.userData.roomId = room.id
  cap.userData.wallSide = side
  group.add(cap)
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  const sorted = intervals.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start)
  const result: Array<{ start: number; end: number }> = []
  for (const interval of sorted) {
    const last = result[result.length - 1]
    if (!last || interval.start > last.end + 0.05) result.push({ ...interval })
    else last.end = Math.max(last.end, interval.end)
  }
  return result
}

function addFloorSeams(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere) {
  const positions: number[] = []
  const spacing = room.type === 'boss' ? 1.5 : 1
  for (let x = -room.width / 2 + spacing; x < room.width / 2; x += spacing) positions.push(x, 0.195, -room.depth / 2, x, 0.195, room.depth / 2)
  for (let z = -room.depth / 2 + spacing; z < room.depth / 2; z += spacing) positions.push(-room.width / 2, 0.195, z, room.width / 2, 0.195, z)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: atmosphere.seam, transparent: true, opacity: 0.48 }))
  group.add(lines)
}

function addCornerStonework(group: THREE.Group, room: DungeonRoom, material: THREE.Material, darkMaterial: THREE.Material) {
  const inset = 0.14
  const corners: Array<[number, number]> = [
    [-room.width / 2 + inset, -room.depth / 2 + inset], [room.width / 2 - inset, -room.depth / 2 + inset],
    [-room.width / 2 + inset, room.depth / 2 - inset], [room.width / 2 - inset, room.depth / 2 - inset],
  ]
  for (const [x, z] of corners) {
    const wallSides: ResizeSide[] = [x < 0 ? 'west' : 'east', z < 0 ? 'north' : 'south']
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.38, room.height, 0.38), material)
    column.position.set(x, room.height / 2, z)
    column.userData.roomId = room.id
    column.userData.wallSides = wallSides
    column.castShadow = true
    column.receiveShadow = true
    group.add(column)
    for (const y of [0.16, room.height - 0.18]) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.55), darkMaterial)
      block.position.set(x, y, z)
      block.userData.roomId = room.id
      block.userData.wallSides = wallSides
      group.add(block)
    }
  }
}

function addRoomMoodLighting(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[]) {
  const torchY = Math.min(1.75, room.height * 0.56)
  const positions: Array<[number, number, number]> = [
    [-room.width / 2 + 0.32, torchY, -room.depth * 0.24],
    [room.width / 2 - 0.32, torchY, room.depth * 0.24],
  ]
  positions.forEach(([x, y, z], index) => addSconce(group, x, y, z, atmosphere, flickerLights, index === 0 || room.type === 'boss' || room.type === 'elite'))

  const accent = roomAccent(room.type, atmosphere)
  if (accent !== undefined) {
    const intensity = room.type === 'boss' ? 3.0 : room.type === 'elite' ? 2.1 : 1.65
    const distance = room.type === 'boss' ? Math.max(room.width, room.depth) * 0.85 : 6.5
    const accentLight = new THREE.PointLight(accent, intensity, distance, 2)
    accentLight.position.set(0, room.type === 'boss' ? 1.15 : 1.6, 0)
    group.add(accentLight)
    if (room.type === 'boss' || room.type === 'shrine') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(room.type === 'boss' ? 1.55 : 0.85, room.type === 'boss' ? 2.15 : 1.18, 48),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: room.type === 'boss' ? 0.34 : 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.205
      group.add(ring)
    }
  }
}

function addSconce(group: THREE.Group, x: number, y: number, z: number, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], lightEnabled: boolean) {
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.08), new THREE.MeshStandardMaterial({ color: 0x332821, roughness: 0.8, metalness: 0.28 }))
  bracket.position.set(x, y - 0.24, z)
  bracket.rotation.z = x < 0 ? -0.28 : 0.28
  bracket.castShadow = true
  group.add(bracket)
  const flameMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: 3.8, roughness: 0.25 })
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.105, 9, 7), flameMaterial)
  flame.scale.y = 1.45
  flame.position.set(x + (x < 0 ? 0.08 : -0.08), y + 0.13, z)
  group.add(flame)
  if (lightEnabled) {
    const light = new THREE.PointLight(atmosphere.torch, atmosphere.torchIntensity, 7.8, 2)
    light.position.copy(flame.position)
    group.add(light)
    flickerLights.push({ light, base: atmosphere.torchIntensity, phase: Math.random() * Math.PI * 2, speed: 6.4 + Math.random() * 2.8 })
  }
}

function addRoomHandles(group: THREE.Group, room: DungeonRoom) {
  const material = new THREE.MeshBasicMaterial({ color: 0x8ed8ff, depthTest: false })
  const positions: Array<[ResizeSide, number, number]> = [['north', 0, -room.depth / 2], ['south', 0, room.depth / 2], ['west', -room.width / 2, 0], ['east', room.width / 2, 0]]
  for (const [side, x, z] of positions) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), material)
    handle.position.set(x, 0.32, z)
    handle.userData.roomId = room.id
    handle.userData.resizeSide = side
    group.add(handle)
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.67, 28), new THREE.MeshBasicMaterial({ color: 0x8ed8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.22
  ring.userData.roomId = room.id
  group.add(ring)
}

function addCorridor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number, atmosphere: DungeonAtmosphere, immersive: boolean) {
  const floorMat = new THREE.MeshStandardMaterial({ color: atmosphere.corridorFloor, roughness: 0.97 })
  const wallMat = new THREE.MeshStandardMaterial({ color: atmosphere.corridorWall, roughness: 0.94 })
  const ceilingMat = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.98 })
  const mid = { x: to.x, z: from.z }
  addCorridorSegment(parent, from.x, from.z, mid.x, mid.z, width, floorMat, wallMat, ceilingMat, immersive)
  addCorridorSegment(parent, mid.x, mid.z, to.x, to.z, width, floorMat, wallMat, ceilingMat, immersive)
}

function addCorridorSegment(parent: THREE.Group, x1: number, z1: number, x2: number, z2: number, width: number, floorMat: THREE.Material, wallMat: THREE.Material, ceilingMat: THREE.Material, immersive: boolean) {
  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.hypot(dx, dz)
  if (length < 0.25) return
  const angle = Math.atan2(dx, dz)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, length), floorMat)
  floor.position.set((x1 + x2) / 2, 0.07, (z1 + z2) / 2)
  floor.rotation.y = angle
  floor.receiveShadow = true
  parent.add(floor)

  const wallHeight = immersive ? 2.75 : 1.1
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.24, wallHeight, length), wallMat)
    wall.position.set(floor.position.x + Math.cos(angle) * (width / 2 + 0.12) * side, wallHeight / 2, floor.position.z - Math.sin(angle) * (width / 2 + 0.12) * side)
    wall.rotation.y = angle
    wall.castShadow = true
    wall.receiveShadow = true
    parent.add(wall)
  }
  if (immersive) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.14, length), ceilingMat)
    ceiling.position.set(floor.position.x, 2.78, floor.position.z)
    ceiling.rotation.y = angle
    ceiling.castShadow = true
    ceiling.receiveShadow = true
    parent.add(ceiling)
  }
}

function addDungeonProp(parent: THREE.Group, prop: DungeonProp, asset: PropLibraryAsset | undefined, selected: boolean, immersive: boolean, loader: GLTFLoader, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[]) {
  const group = new THREE.Group()
  group.position.set(prop.x, prop.y, prop.z)
  group.rotation.y = THREE.MathUtils.degToRad(prop.rotationY)
  group.userData.propId = prop.id
  group.userData.propRoot = true
  parent.add(group)

  if (prop.source === 'builtin') addBuiltinProp(group, prop, atmosphere, flickerLights)
  else {
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x637788, wireframe: true, transparent: true, opacity: 0.5 }))
    placeholder.position.y = 0.4
    placeholder.userData.propId = prop.id
    group.add(placeholder)
    if (asset) {
      const url = URL.createObjectURL(asset.blob)
      loader.load(url, (gltf) => {
        URL.revokeObjectURL(url)
        if (!group.parent) return
        group.remove(placeholder)
        disposeObject(placeholder)
        const model = gltf.scene.clone(true)
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        box.getSize(size)
        const max = Math.max(size.x, size.y, size.z, 0.001)
        model.scale.setScalar((1.6 / max) * prop.scale)
        const fitted = new THREE.Box3().setFromObject(model)
        model.position.y -= fitted.min.y
        model.traverse((child) => {
          child.userData.propId = prop.id
          const mesh = child as THREE.Mesh
          if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
        })
        group.add(model)
      }, undefined, () => URL.revokeObjectURL(url))
    }
  }

  if (!immersive) addPropSelectionProxy(group, prop, selected)
  if (selected && !immersive) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62 * Math.max(0.75, prop.scale), 0.82 * Math.max(0.75, prop.scale), 28), new THREE.MeshBasicMaterial({ color: 0xffd36b, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.035
    ring.userData.propId = prop.id
    group.add(ring)
  }
  if (!immersive) {
    const label = makeLabel(prop.name, 'PROP')
    label.position.y = 2.2 * Math.max(0.7, prop.scale)
    label.userData.propId = prop.id
    group.add(label)
  }
}

function addPropSelectionProxy(group: THREE.Group, prop: DungeonProp, selected: boolean) {
  const height = prop.assetRef === 'pillar' || prop.assetRef === 'statue' ? 2.6 : prop.assetRef === 'torch' ? 1.45 : prop.assetRef === 'rubble' || prop.assetRef === 'spikes' ? 0.85 : 1.25
  const width = prop.assetRef === 'torch' ? 0.95 : prop.assetRef === 'rubble' || prop.assetRef === 'spikes' ? 1.4 : 1.15
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd36b,
    transparent: true,
    opacity: selected ? 0.06 : 0,
    wireframe: selected,
    depthWrite: false,
    depthTest: false,
  })
  material.colorWrite = selected
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(width * Math.max(0.7, prop.scale), height * Math.max(0.7, prop.scale), width * Math.max(0.7, prop.scale)), material)
  proxy.position.y = height * Math.max(0.7, prop.scale) / 2
  proxy.userData.propId = prop.id
  proxy.userData.selectionProxy = true
  proxy.renderOrder = 100
  group.add(proxy)
}

function addBuiltinProp(group: THREE.Group, prop: DungeonProp, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[]) {
  const s = prop.scale
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.95 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x60442f, roughness: 0.9 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x4e5559, roughness: 0.65, metalness: 0.35 })
  const tag = (object: THREE.Object3D) => object.traverse((child) => {
    child.userData.propId = prop.id
    const mesh = child as THREE.Mesh
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
  })
  const objects: THREE.Object3D[] = []
  switch (prop.assetRef) {
    case 'pillar': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * s, 0.45 * s, 2.6 * s, 10), stone)
      body.position.y = 1.3 * s
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.95 * s, 0.22 * s, 0.95 * s), stone)
      base.position.y = 0.11 * s
      const cap = base.clone(); cap.position.y = 2.49 * s
      objects.push(body, base, cap)
      break
    }
    case 'torch': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.8 * s, 8), wood)
      stem.position.y = 0.55 * s
      stem.rotation.z = 0.25
      const flameMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: 4.5, roughness: 0.2 })
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), flameMaterial)
      flame.scale.y = 1.35
      flame.position.set(0.1 * s, 1.02 * s, 0)
      const light = new THREE.PointLight(atmosphere.torch, atmosphere.torchIntensity * 1.15, 8.5 * s, 2)
      light.position.copy(flame.position)
      flickerLights.push({ light, base: atmosphere.torchIntensity * 1.15, phase: Math.random() * Math.PI * 2, speed: 6.8 + Math.random() * 2 })
      objects.push(stem, flame, light)
      break
    }
    case 'statue': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.4 * s, 0.9 * s), stone)
      base.position.y = 0.2 * s
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * s, 1.1 * s, 5, 8), stone)
      body.position.y = 1.25 * s
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 12, 9), stone)
      head.position.y = 2.15 * s
      objects.push(base, body, head)
      break
    }
    case 'barrel': {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 0.9 * s, 12), wood)
      barrel.position.y = 0.45 * s
      const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.43 * s, 0.035 * s, 6, 16), metal)
      band1.rotation.x = Math.PI / 2
      band1.position.y = 0.25 * s
      const band2 = band1.clone(); band2.position.y = 0.66 * s
      objects.push(barrel, band1, band2)
      break
    }
    case 'crate': {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.9 * s, 0.9 * s), wood)
      crate.position.y = 0.45 * s
      objects.push(crate)
      break
    }
    case 'rubble': {
      for (let i = 0; i < 6; i += 1) {
        const radius = (0.15 + Math.random() * 0.15) * s
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), stone)
        rock.position.set((Math.random() - 0.5) * 1.2 * s, radius, (Math.random() - 0.5) * 1.2 * s)
        rock.rotation.set(Math.random(), Math.random(), Math.random())
        objects.push(rock)
      }
      break
    }
    default: {
      for (let i = -2; i <= 2; i += 1) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.8 * s, 6), metal)
        spike.position.set(i * 0.25 * s, 0.4 * s, 0)
        objects.push(spike)
      }
      break
    }
  }
  for (const object of objects) { tag(object); group.add(object) }
}

function addAtmosphereParticles(parent: THREE.Group, value: DungeonWithProps, atmosphere: DungeonAtmosphere, immersive: boolean, target: THREE.Points[]) {
  if (!value.rooms.length) return
  const minX = Math.min(...value.rooms.map((room) => room.x - room.width / 2)) - 2
  const maxX = Math.max(...value.rooms.map((room) => room.x + room.width / 2)) + 2
  const minZ = Math.min(...value.rooms.map((room) => room.z - room.depth / 2)) - 2
  const maxZ = Math.max(...value.rooms.map((room) => room.z + room.depth / 2)) + 2
  const random = seededRandom(value.seed || 1)

  const dustPositions: number[] = []
  const dustCount = Math.min(280, Math.max(70, value.rooms.length * 30))
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions.push(minX + random() * (maxX - minX), 0.35 + random() * 2.6, minZ + random() * (maxZ - minZ))
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3))
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: atmosphere.dust, size: immersive ? 0.045 : 0.034, transparent: true, opacity: immersive ? 0.42 : 0.25, depthWrite: false, sizeAttenuation: true }))
  parent.add(dust)
  target.push(dust)

  const mistTexture = makeSoftParticleTexture()
  const mistPositions: number[] = []
  const mistCount = Math.min(150, Math.max(45, value.rooms.length * 16))
  for (let i = 0; i < mistCount; i += 1) {
    mistPositions.push(minX + random() * (maxX - minX), 0.14 + random() * 0.48, minZ + random() * (maxZ - minZ))
  }
  const mistGeometry = new THREE.BufferGeometry()
  mistGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mistPositions, 3))
  const mist = new THREE.Points(mistGeometry, new THREE.PointsMaterial({ map: mistTexture, color: atmosphere.mist, size: immersive ? 2.25 : 1.55, transparent: true, opacity: immersive ? 0.105 : 0.05, depthWrite: false, sizeAttenuation: true }))
  parent.add(mist)
  target.push(mist)
}

function makeSoftParticleTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.82)')
  gradient.addColorStop(0.32, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function addMarker(parent: THREE.Group, item: DungeonMarker, selected: boolean, immersive: boolean) {
  const group = new THREE.Group()
  group.position.set(item.x, item.y, item.z)
  parent.add(group)
  if (immersive && ['enemy', 'loot', 'checkpoint', 'trigger'].includes(item.type)) return
  const color = markerColor(item.type)
  let object: THREE.Object3D
  if (item.type === 'door') {
    const doorGroup = new THREE.Group()
    doorGroup.rotation.y = THREE.MathUtils.degToRad(Number(item.data.yaw ?? 0))
    const frame = new THREE.MeshStandardMaterial({ color: 0x4b382b, roughness: 0.85 })
    const panelMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.78 })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.25, 1.65), panelMaterial)
    panel.position.y = 1.13
    if (!Boolean(item.data.locked)) { panel.rotation.y = Math.PI / 2; panel.position.x = 0.82; panel.position.z = -0.78 }
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.55, 0.22), frame)
    left.position.set(0, 1.27, -0.94)
    const right = left.clone(); right.position.z = 0.94
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 2.1), frame)
    top.position.set(0, 2.45, 0)
    doorGroup.add(panel, left, right, top)
    object = doorGroup
  } else if (item.type === 'portal') {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 10, 28), new THREE.MeshBasicMaterial({ color }))
    mesh.rotation.y = Math.PI / 2
    object = mesh
  } else if (item.type === 'light') {
    object = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color }))
    const light = new THREE.PointLight(String(item.data.color ?? color), Number(item.data.intensity ?? 2.2), 7, 2)
    light.position.y = 1.6
    group.add(light)
  } else if (item.type === 'trigger') {
    object = new THREE.Mesh(new THREE.CylinderGeometry(item.radius ?? 2, item.radius ?? 2, 0.08, 24), new THREE.MeshBasicMaterial({ color, wireframe: true }))
  } else {
    object = new THREE.Mesh(item.type === 'enemy' ? new THREE.OctahedronGeometry(0.42) : new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }))
  }
  object.traverse((child) => { child.userData.markerId = item.id })
  if (selected) object.scale.setScalar(1.25)
  group.add(object)
  if (!immersive) {
    const label = makeLabel(item.name, item.type.toUpperCase())
    label.position.y = item.type === 'door' ? 3 : 1.05
    label.userData.markerId = item.id
    group.add(label)
  }
}

function canWalkAt(value: DungeonWithProps, x: number, z: number) {
  const radius = 0.3
  const inside = value.theme === 'crypt'
    ? dungeonContainsPointV3(value, x, z, radius)
    : value.rooms.some((room) => pointInsideRoom(room, x, z, radius)) || pointInsideCorridor(value, x, z, radius)
  if (!inside) return false
  for (const item of value.markers) if (item.type === 'door' && Boolean(item.data.locked) && pointInsideDoor(item, x, z, radius)) return false
  for (const wall of value.walls ?? []) if (pointNearWall(wall, x, z, radius)) return false
  for (const prop of dungeonProps(value)) if (prop.collision && Math.hypot(x - prop.x, z - prop.z) < propCollisionRadius(prop) + radius) return false
  return true
}
function pointNearWall(wall: DungeonWall, x: number, z: number, margin: number) {
  const dx = wall.x2 - wall.x1
  const dz = wall.z2 - wall.z1
  const lenSq = dx * dx + dz * dz
  const t = lenSq > .0001 ? Math.max(0, Math.min(1, ((x - wall.x1) * dx + (z - wall.z1) * dz) / lenSq)) : 0
  const px = wall.x1 + dx * t
  const pz = wall.z1 + dz * t
  return Math.hypot(x - px, z - pz) <= wall.thickness / 2 + margin
}
function propCollisionRadius(prop: DungeonProp) { const base = prop.assetRef === 'pillar' ? 0.45 : prop.assetRef === 'statue' ? 0.5 : prop.assetRef === 'rubble' ? 0.25 : prop.assetRef === 'spikes' ? 0.55 : 0.45; return base * prop.scale }
function pointInsideRoom(room: DungeonRoom, x: number, z: number, margin: number) { return dungeonRoomContainsV3(room, x, z, margin) }
function pointInsideCorridor(value: DungeonWithProps, x: number, z: number, margin: number) { const map = new Map(value.rooms.map((room) => [room.id, room])); for (const edge of value.corridors) { const a = map.get(edge.fromRoomId), b = map.get(edge.toRoomId); if (!a || !b) continue; const from = getRoomConnection(a, b, edge.width), to = getRoomConnection(b, a, edge.width), midX = to.x, midZ = from.z; if (pointInsideAxisSegment(x, z, from.x, from.z, midX, midZ, edge.width, margin) || pointInsideAxisSegment(x, z, midX, midZ, to.x, to.z, edge.width, margin)) return true } return false }
function pointInsideAxisSegment(x: number, z: number, x1: number, z1: number, x2: number, z2: number, width: number, margin: number) { const halfWidth = Math.max(0.25, width / 2 - margin), pad = margin + 0.28; if (Math.abs(z2 - z1) < 0.05) return x >= Math.min(x1, x2) - pad && x <= Math.max(x1, x2) + pad && Math.abs(z - z1) <= halfWidth; if (Math.abs(x2 - x1) < 0.05) return z >= Math.min(z1, z2) - pad && z <= Math.max(z1, z2) + pad && Math.abs(x - x1) <= halfWidth; return false }
function pointInsideDoor(item: DungeonMarker, x: number, z: number, margin: number) { const dx = x - item.x, dz = z - item.z, angle = -THREE.MathUtils.degToRad(Number(item.data.yaw ?? 0)), cos = Math.cos(angle), sin = Math.sin(angle), localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos; return Math.abs(localX) <= 0.2 + margin && Math.abs(localZ) <= 0.9 + margin }
function floorHeightAt(value: DungeonWithProps, x: number, z: number) { return value.theme === 'crypt' ? dungeonFloorHeightV3(value, x, z) : value.rooms.find((room) => pointInsideRoom(room, x, z, 0))?.floorLevel ?? 0 }
function dungeonWorldBounds(value: DungeonWithProps) {
  const minX = Math.min(
    ...value.rooms.map((room) => room.x - room.width / 2),
    ...(value.walls ?? []).flatMap((wall) => [wall.x1, wall.x2]),
  )
  const maxX = Math.max(
    ...value.rooms.map((room) => room.x + room.width / 2),
    ...(value.walls ?? []).flatMap((wall) => [wall.x1, wall.x2]),
  )
  const minZ = Math.min(
    ...value.rooms.map((room) => room.z - room.depth / 2),
    ...(value.walls ?? []).flatMap((wall) => [wall.z1, wall.z2]),
  )
  const maxZ = Math.max(
    ...value.rooms.map((room) => room.z + room.depth / 2),
    ...(value.walls ?? []).flatMap((wall) => [wall.z1, wall.z2]),
  )
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    width: Math.max(8, maxX - minX),
    depth: Math.max(8, maxZ - minZ),
  }
}
function makeLabel(title: string, subtitle: string) { const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const context = canvas.getContext('2d')!; context.fillStyle = 'rgba(7,12,17,.82)'; context.beginPath(); context.roundRect(8, 8, 496, 112, 18); context.fill(); context.fillStyle = '#e9f2f9'; context.font = '600 32px system-ui'; context.textAlign = 'center'; context.fillText(title.slice(0, 28), 256, 56); context.fillStyle = '#87a2b7'; context.font = '600 18px system-ui'; context.fillText(subtitle, 256, 88); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); sprite.scale.set(4.6, 1.15, 1); return sprite }
function markerColor(type: DungeonMarker['type']) { return ({ door: 0xa57743, enemy: 0xe45c5c, loot: 0xe3b64b, checkpoint: 0x65d08a, portal: 0xa675ff, trigger: 0xff9448, light: 0xffd179 } as const)[type] }
function dungeonCenter(rooms: DungeonRoom[]) { if (!rooms.length) return { x: 0, z: 0 }; return { x: rooms.reduce((sum, room) => sum + room.x, 0) / rooms.length, z: rooms.reduce((sum, room) => sum + room.z, 0) / rooms.length } }

function disposeMaterial(material: THREE.Material) {
  const withMaps = material as THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null; emissiveMap?: THREE.Texture | null }
  withMaps.map?.dispose()
  withMaps.alphaMap?.dispose()
  withMaps.emissiveMap?.dispose()
  material.dispose()
}
function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
  object.removeFromParent()
}
