import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getRoomConnection, type DungeonConnection, type DungeonMarker, type DungeonRoom, type ForgeDungeonPackage } from '../lib/dungeonPackage'

export type DungeonTool = 'select' | 'room' | 'corridor' | 'door' | 'enemy' | 'loot' | 'checkpoint' | 'portal' | 'trigger' | 'light' | 'erase'

type Props = {
  value: ForgeDungeonPackage
  tool: DungeonTool
  selectedRoomId?: string
  selectedMarkerId?: string
  corridorStartId?: string
  topDown: boolean
  playtest: boolean
  onGroundClick: (point: { x: number; z: number }) => void
  onRoomClick: (roomId: string) => void
  onMarkerClick: (markerId: string) => void
  onRoomMove: (roomId: string, x: number, z: number, freeMove: boolean) => void
}

type RoomVisual = { group: THREE.Group; floor: THREE.Mesh }
type MarkerVisual = { object: THREE.Object3D }
type RoomOpening = DungeonConnection & { corridorId: string }
type DragState = { roomId: string; offsetX: number; offsetZ: number; pointerId: number }

const roomColors: Record<DungeonRoom['type'], number> = {
  entrance: 0x5588aa, combat: 0x8a6f55, treasure: 0xb8933d, elite: 0xa05b35,
  shrine: 0x568b77, boss: 0x8c3f4d, secret: 0x624b7c, utility: 0x616a72,
}

export default function DungeonViewport({ value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick, onRoomMove }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick, onRoomMove })
  useEffect(() => { propsRef.current = { value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick, onRoomMove } }, [value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick, onRoomMove])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1015)
    scene.fog = new THREE.FogExp2(0x0b1015, value.settings.fogDensity)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 300)
    camera.position.set(26, 30, 32)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.domElement.style.cursor = 'default'
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(4, 0, 0)
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minDistance = 5
    controls.maxDistance = 90
    controls.update()

    const ambient = new THREE.HemisphereLight(0xcbd9e6, 0x16191d, 1.25)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(0xd6e8ff, 2.5)
    key.position.set(15, 25, 12)
    scene.add(key)
    const grid = new THREE.GridHelper(100, 100, 0x385064, 0x1b2833)
    scene.add(grid)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide }))
    ground.rotation.x = -Math.PI / 2
    ground.name = '__ground'
    scene.add(ground)
    const dungeonGroup = new THREE.Group()
    scene.add(dungeonGroup)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const roomVisuals = new Map<string, RoomVisual>()
    const markerVisuals = new Map<string, MarkerVisual>()
    const keys = new Set<string>()
    let drag: DragState | undefined
    let yaw = 0
    let pitch = 0
    let wasPlaytest = false
    let walkInitialized = false
    let lastFrame = performance.now()

    const rebuild = () => {
      while (dungeonGroup.children.length) disposeObject(dungeonGroup.children.pop()!)
      roomVisuals.clear()
      markerVisuals.clear()
      const current = propsRef.current.value
      const immersive = propsRef.current.playtest
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = current.settings.fogDensity
      ambient.intensity = 0.6 + current.settings.ambientLight * 2.2

      const roomMap = new Map(current.rooms.map((item) => [item.id, item]))
      const openingMap = new Map<string, RoomOpening[]>()
      const addOpening = (roomId: string, opening: RoomOpening) => openingMap.set(roomId, [...(openingMap.get(roomId) ?? []), opening])
      for (const edge of current.corridors) {
        const from = roomMap.get(edge.fromRoomId)
        const to = roomMap.get(edge.toRoomId)
        if (!from || !to) continue
        const fromConnection = getRoomConnection(from, to, edge.width)
        const toConnection = getRoomConnection(to, from, edge.width)
        addOpening(from.id, { ...fromConnection, corridorId: edge.id })
        addOpening(to.id, { ...toConnection, corridorId: edge.id })
        addCorridor(dungeonGroup, fromConnection, toConnection, edge.width)
      }
      for (const roomValue of current.rooms) {
        const visual = addRoom(dungeonGroup, roomValue, current.settings.wallThickness, openingMap.get(roomValue.id) ?? [], !immersive && roomValue.id === propsRef.current.selectedRoomId, !immersive && roomValue.id === propsRef.current.corridorStartId, immersive)
        roomVisuals.set(roomValue.id, visual)
      }
      for (const item of current.markers) {
        const visual = addMarker(dungeonGroup, item, !immersive && item.id === propsRef.current.selectedMarkerId, immersive)
        markerVisuals.set(item.id, visual)
      }
    }
    rebuild()

    let lastSignature = ''
    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
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
      } catch { /* Pointer lock may be denied until the next user gesture. */ }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (propsRef.current.playtest) {
        requestWalkLock()
        event.preventDefault()
        return
      }
      updatePointer(event)
      const hits = raycaster.intersectObjects([dungeonGroup, ground], true)
      const hit = hits.find((candidate) => candidate.object.userData.roomId || candidate.object.userData.markerId || candidate.object.name === '__ground')
      if (!hit) return
      const roomId = hit.object.userData.roomId as string | undefined
      const markerId = hit.object.userData.markerId as string | undefined
      if (roomId && propsRef.current.tool === 'select') {
        const roomValue = propsRef.current.value.rooms.find((item) => item.id === roomId)
        const point = groundPoint(event)
        if (roomValue && point) {
          propsRef.current.onRoomClick(roomId)
          drag = { roomId, offsetX: point.x - roomValue.x, offsetZ: point.z - roomValue.z, pointerId: event.pointerId }
          renderer.domElement.setPointerCapture(event.pointerId)
          renderer.domElement.style.cursor = 'grabbing'
          controls.enabled = false
          event.preventDefault()
          return
        }
      }
      if (markerId) propsRef.current.onMarkerClick(markerId)
      else if (roomId) propsRef.current.onRoomClick(roomId)
      else propsRef.current.onGroundClick({ x: hit.point.x, z: hit.point.z })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (drag) {
        const point = groundPoint(event)
        if (!point) return
        propsRef.current.onRoomMove(drag.roomId, point.x - drag.offsetX, point.z - drag.offsetZ, event.shiftKey)
        event.preventDefault()
        return
      }
      if (propsRef.current.playtest) {
        renderer.domElement.style.cursor = document.pointerLockElement === renderer.domElement ? 'none' : 'crosshair'
        return
      }
      updatePointer(event)
      const hit = raycaster.intersectObjects(dungeonGroup.children, true).find((candidate) => candidate.object.userData.roomId || candidate.object.userData.markerId)
      renderer.domElement.style.cursor = propsRef.current.tool === 'select' && hit?.object.userData.roomId ? 'grab' : isPlaceTool(propsRef.current.tool) ? 'crosshair' : 'default'
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return
      if (renderer.domElement.hasPointerCapture(drag.pointerId)) renderer.domElement.releasePointerCapture(drag.pointerId)
      drag = undefined
      renderer.domElement.style.cursor = 'grab'
      controls.enabled = !propsRef.current.playtest
      event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!propsRef.current.playtest || document.pointerLockElement !== renderer.domElement) return
      const sensitivity = 0.0022
      yaw -= event.movementX * sensitivity
      pitch -= event.movementY * sensitivity
      pitch = THREE.MathUtils.clamp(pitch, -Math.PI * 0.47, Math.PI * 0.47)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!propsRef.current.playtest) return
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        keys.add(event.code)
        event.preventDefault()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.code) }
    const onBlur = () => keys.clear()
    const onLockChange = () => {
      renderer.domElement.style.cursor = propsRef.current.playtest && document.pointerLockElement === renderer.domElement ? 'none' : propsRef.current.playtest ? 'crosshair' : 'default'
      if (document.pointerLockElement !== renderer.domElement) keys.clear()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
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
      if (other) yaw = Math.atan2(-(other.x - entrance.x), -(other.z - entrance.z))
      else yaw = 0
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
      camera.position.set(26, 30, 32)
      controls.target.set(4, 0, 0)
      controls.enabled = true
      controls.update()
      grid.visible = true
    }

    const updateWalk = (dt: number) => {
      const current = propsRef.current.value
      camera.rotation.set(pitch, yaw, 0)
      const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
      const rightAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      if (!forwardAmount && !rightAmount) return
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
      const move = forward.multiplyScalar(forwardAmount).add(right.multiplyScalar(rightAmount))
      if (move.lengthSq() > 1) move.normalize()
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
      move.multiplyScalar((sprint ? 6.8 : 3.8) * dt)
      const targetX = camera.position.x + move.x
      const targetZ = camera.position.z + move.z
      if (canWalkAt(current, targetX, camera.position.z)) camera.position.x = targetX
      if (canWalkAt(current, camera.position.x, targetZ)) camera.position.z = targetZ
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
      const signature = JSON.stringify([state.value.rooms, state.value.corridors, state.value.markers, state.value.settings, state.selectedRoomId, state.selectedMarkerId, state.corridorStartId, state.playtest])
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
          camera.position.lerp(new THREE.Vector3(center.x, 42, center.z + 0.01), 0.09)
          controls.target.lerp(new THREE.Vector3(center.x, 0, center.z), 0.09)
        }
        controls.enabled = !drag
        if (!drag) controls.update()
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
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
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="dungeon-viewport-canvas">
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    {playtest && <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, transform: 'translate(-50%,-50%)' }}>
        <span style={{ position: 'absolute', left: 6, top: 0, width: 2, height: 14, background: 'rgba(235,247,255,.78)', boxShadow: '0 0 6px rgba(0,0,0,.8)' }} />
        <span style={{ position: 'absolute', left: 0, top: 6, width: 14, height: 2, background: 'rgba(235,247,255,.78)', boxShadow: '0 0 6px rgba(0,0,0,.8)' }} />
      </div>
      <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '8px 10px', border: '1px solid rgba(94,132,158,.55)', borderRadius: 7, background: 'rgba(7,12,17,.84)', color: '#dce8f1', fontSize: 10, lineHeight: 1.45, backdropFilter: 'blur(6px)' }}>
        <strong style={{ display: 'block', fontSize: 10, letterSpacing: '.08em' }}>FIRST PERSON WALK</strong>
        <span style={{ color: '#91aabd' }}>Click viewport for mouse look · WASD move · Shift sprint · Esc releases mouse</span>
      </div>
    </div>}
  </div>
}

function addRoom(parent: THREE.Group, roomValue: DungeonRoom, wallThickness: number, openings: RoomOpening[], selected: boolean, corridorStart: boolean, immersive: boolean): RoomVisual {
  const group = new THREE.Group()
  group.position.set(roomValue.x, roomValue.floorLevel, roomValue.z)
  group.rotation.y = THREE.MathUtils.degToRad(roomValue.rotation)
  parent.add(group)
  const baseColor = roomColors[roomValue.type]
  const floorMaterial = new THREE.MeshStandardMaterial({ color: selected ? 0x6f9fba : corridorStart ? 0x8f78b6 : baseColor, roughness: 0.92, metalness: 0.02 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(roomValue.width, 0.18, roomValue.depth), floorMaterial)
  floor.position.y = 0.09
  floor.userData.roomId = roomValue.id
  group.add(floor)
  const wallMaterial = new THREE.MeshStandardMaterial({ color: selected ? 0x9cc8df : 0x39434b, roughness: 0.95 })
  const t = Math.max(0.12, wallThickness)
  for (const side of ['north', 'south', 'west', 'east'] as const) addWallWithOpenings(group, roomValue, side, openings.filter((item) => item.side === side), t, wallMaterial)
  if (selected && !immersive) addMoveGizmo(group, roomValue)
  if (!immersive) {
    const label = makeLabel(roomValue.name, roomValue.type.toUpperCase())
    label.position.set(0, roomValue.height + 0.6, 0)
    group.add(label)
  }
  return { group, floor }
}

function addWallWithOpenings(group: THREE.Group, roomValue: DungeonRoom, side: RoomOpening['side'], openings: RoomOpening[], thickness: number, material: THREE.Material) {
  const horizontal = side === 'north' || side === 'south'
  const totalLength = horizontal ? roomValue.width : roomValue.depth
  const half = totalLength / 2
  const intervals = mergeIntervals(openings.map((opening) => ({ start: Math.max(-half, opening.offset - opening.openingWidth / 2), end: Math.min(half, opening.offset + opening.openingWidth / 2) })))
  const wallHeight = roomValue.height
  const doorHeight = Math.min(2.45, Math.max(1.9, wallHeight - 0.4))
  let cursor = -half
  for (const interval of intervals) {
    addWallSegment(group, roomValue, side, cursor, interval.start, thickness, wallHeight, material)
    const openingLength = Math.max(0, interval.end - interval.start)
    if (openingLength > 0.05 && wallHeight > doorHeight + 0.12) {
      const lintelHeight = wallHeight - doorHeight
      const center = (interval.start + interval.end) / 2
      const lintel = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(openingLength, lintelHeight, thickness), material) : new THREE.Mesh(new THREE.BoxGeometry(thickness, lintelHeight, openingLength), material)
      if (horizontal) lintel.position.set(center, doorHeight + lintelHeight / 2, (side === 'south' ? 1 : -1) * roomValue.depth / 2)
      else lintel.position.set((side === 'east' ? 1 : -1) * roomValue.width / 2, doorHeight + lintelHeight / 2, center)
      lintel.userData.roomId = roomValue.id
      group.add(lintel)
    }
    cursor = interval.end
  }
  addWallSegment(group, roomValue, side, cursor, half, thickness, wallHeight, material)
}

function addWallSegment(group: THREE.Group, roomValue: DungeonRoom, side: RoomOpening['side'], start: number, end: number, thickness: number, wallHeight: number, material: THREE.Material) {
  const length = end - start
  if (length <= 0.04) return
  const horizontal = side === 'north' || side === 'south'
  const wall = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(length, wallHeight, thickness), material) : new THREE.Mesh(new THREE.BoxGeometry(thickness, wallHeight, length), material)
  const center = (start + end) / 2
  if (horizontal) wall.position.set(center, wallHeight / 2, (side === 'south' ? 1 : -1) * roomValue.depth / 2)
  else wall.position.set((side === 'east' ? 1 : -1) * roomValue.width / 2, wallHeight / 2, center)
  wall.userData.roomId = roomValue.id
  group.add(wall)
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

function addMoveGizmo(group: THREE.Group, roomValue: DungeonRoom) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28), new THREE.MeshBasicMaterial({ color: 0x8ed8ff, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.22
  group.add(ring)
  const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.24, 0), Math.min(2.2, roomValue.width * 0.28), 0xff6d6d, 0.38, 0.2)
  const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.24, 0), Math.min(2.2, roomValue.depth * 0.28), 0x66a8ff, 0.38, 0.2)
  for (const helper of [xArrow, zArrow]) helper.traverse((child) => { child.userData.roomId = roomValue.id })
  group.add(xArrow, zArrow)
}

function addCorridor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number) {
  const corridorMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4843, roughness: 1 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x323a40, roughness: 1 })
  const y = 0.07
  const mid = { x: to.x, z: from.z }
  addCorridorSegment(parent, from.x, from.z, mid.x, mid.z, width, y, corridorMaterial, wallMaterial)
  addCorridorSegment(parent, mid.x, mid.z, to.x, to.z, width, y, corridorMaterial, wallMaterial)
}

function addCorridorSegment(parent: THREE.Group, x1: number, z1: number, x2: number, z2: number, width: number, y: number, floorMaterial: THREE.Material, wallMaterial: THREE.Material) {
  const dx = x2 - x1, dz = z2 - z1
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.25) return
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, length), floorMaterial)
  floor.position.set((x1 + x2) / 2, y, (z1 + z2) / 2)
  floor.rotation.y = Math.atan2(dx, dz)
  parent.add(floor)
  const sideOffset = width / 2 + 0.12
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.0, length), wallMaterial)
    const angle = Math.atan2(dx, dz)
    wall.position.set(floor.position.x + Math.cos(angle) * sideOffset * side, 0.5, floor.position.z - Math.sin(angle) * sideOffset * side)
    wall.rotation.y = angle
    parent.add(wall)
  }
}

function addMarker(parent: THREE.Group, markerValue: DungeonMarker, selected: boolean, immersive: boolean): MarkerVisual {
  const group = new THREE.Group()
  group.position.set(markerValue.x, markerValue.y, markerValue.z)
  const color = markerColor(markerValue.type)

  if (immersive && ['enemy', 'loot', 'checkpoint', 'trigger'].includes(markerValue.type)) {
    parent.add(group)
    return { object: group }
  }

  let object: THREE.Object3D
  if (markerValue.type === 'portal') {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 10, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
    mesh.rotation.y = Math.PI / 2
    object = mesh
  } else if (markerValue.type === 'trigger') {
    object = new THREE.Mesh(new THREE.CylinderGeometry(markerValue.radius ?? 2, markerValue.radius ?? 2, 0.08, 24), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.72 }))
  } else if (markerValue.type === 'door') {
    const doorGroup = new THREE.Group()
    doorGroup.rotation.y = THREE.MathUtils.degToRad(Number(markerValue.data.yaw ?? 0))
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x4b382b, roughness: 0.85 })
    const panelMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06 })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.25, 1.65), panelMaterial)
    panel.position.y = 1.13
    if (!Boolean(markerValue.data.locked)) {
      panel.rotation.y = Math.PI / 2
      panel.position.x = 0.82
      panel.position.z = -0.78
    }
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.55, 0.22), frameMaterial)
    left.position.set(0, 1.27, -0.94)
    const right = left.clone(); right.position.z = 0.94
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 2.1), frameMaterial)
    top.position.set(0, 2.45, 0)
    doorGroup.add(panel, left, right, top)
    object = doorGroup
  } else if (markerValue.type === 'light') {
    object = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color }))
    const light = new THREE.PointLight(String(markerValue.data.color ?? color), Number(markerValue.data.intensity ?? 2.2), 7, 2)
    light.position.y = 1.6
    group.add(light)
  } else {
    object = new THREE.Mesh(markerValue.type === 'enemy' ? new THREE.OctahedronGeometry(0.42) : new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22 }))
  }
  object.traverse((child) => { child.userData.markerId = markerValue.id })
  if (selected) object.scale.setScalar(1.25)
  group.add(object)
  if (!immersive) {
    const label = makeLabel(markerValue.name, markerValue.type.toUpperCase())
    label.position.y = markerValue.type === 'door' ? 3.0 : 1.05
    group.add(label)
  }
  parent.add(group)
  return { object: group }
}

function canWalkAt(value: ForgeDungeonPackage, x: number, z: number) {
  const playerRadius = 0.3
  if (!value.rooms.some((roomValue) => pointInsideRoom(roomValue, x, z, playerRadius)) && !pointInsideCorridor(value, x, z, playerRadius)) return false
  for (const item of value.markers) {
    if (item.type !== 'door' || !Boolean(item.data.locked)) continue
    if (pointInsideDoor(item, x, z, playerRadius)) return false
  }
  return true
}

function pointInsideRoom(roomValue: DungeonRoom, x: number, z: number, margin: number) {
  const dx = x - roomValue.x
  const dz = z - roomValue.z
  const angle = -THREE.MathUtils.degToRad(roomValue.rotation)
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  return Math.abs(localX) <= Math.max(0.2, roomValue.width / 2 - margin) && Math.abs(localZ) <= Math.max(0.2, roomValue.depth / 2 - margin)
}

function pointInsideCorridor(value: ForgeDungeonPackage, x: number, z: number, margin: number) {
  const roomMap = new Map(value.rooms.map((item) => [item.id, item]))
  for (const edge of value.corridors) {
    const fromRoom = roomMap.get(edge.fromRoomId), toRoom = roomMap.get(edge.toRoomId)
    if (!fromRoom || !toRoom) continue
    const from = getRoomConnection(fromRoom, toRoom, edge.width)
    const to = getRoomConnection(toRoom, fromRoom, edge.width)
    const midX = to.x, midZ = from.z
    if (pointInsideAxisSegment(x, z, from.x, from.z, midX, midZ, edge.width, margin) || pointInsideAxisSegment(x, z, midX, midZ, to.x, to.z, edge.width, margin)) return true
  }
  return false
}

function pointInsideAxisSegment(x: number, z: number, x1: number, z1: number, x2: number, z2: number, width: number, margin: number) {
  const halfWidth = Math.max(0.25, width / 2 - margin)
  const endPad = margin + 0.28
  if (Math.abs(z2 - z1) < 0.05) return x >= Math.min(x1, x2) - endPad && x <= Math.max(x1, x2) + endPad && Math.abs(z - z1) <= halfWidth
  if (Math.abs(x2 - x1) < 0.05) return z >= Math.min(z1, z2) - endPad && z <= Math.max(z1, z2) + endPad && Math.abs(x - x1) <= halfWidth
  return false
}

function pointInsideDoor(item: DungeonMarker, x: number, z: number, margin: number) {
  const dx = x - item.x, dz = z - item.z
  const angle = -THREE.MathUtils.degToRad(Number(item.data.yaw ?? 0))
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  return Math.abs(localX) <= 0.2 + margin && Math.abs(localZ) <= 0.9 + margin
}

function floorHeightAt(value: ForgeDungeonPackage, x: number, z: number) {
  const roomValue = value.rooms.find((item) => pointInsideRoom(item, x, z, 0))
  return roomValue?.floorLevel ?? 0
}

function makeLabel(title: string, subtitle: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(7,12,17,.82)'
  ctx.beginPath(); ctx.roundRect(8, 8, 496, 112, 18); ctx.fill()
  ctx.fillStyle = '#e9f2f9'; ctx.font = '600 32px system-ui'; ctx.textAlign = 'center'; ctx.fillText(title.slice(0, 28), 256, 56)
  ctx.fillStyle = '#87a2b7'; ctx.font = '600 18px system-ui'; ctx.fillText(subtitle, 256, 88)
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(4.6, 1.15, 1)
  return sprite
}

function markerColor(type: DungeonMarker['type']) { return ({ door: 0xa57743, enemy: 0xe45c5c, loot: 0xe3b64b, checkpoint: 0x65d08a, portal: 0xa675ff, trigger: 0xff9448, light: 0xffd179 } as const)[type] }
function dungeonCenter(rooms: DungeonRoom[]) { if (!rooms.length) return { x: 0, z: 0 }; return { x: rooms.reduce((sum, roomValue) => sum + roomValue.x, 0) / rooms.length, z: rooms.reduce((sum, roomValue) => sum + roomValue.z, 0) / rooms.length } }
function isPlaceTool(tool: DungeonTool) { return tool !== 'select' }
function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else if (material) material.dispose()
    if (material && !Array.isArray(material) && material instanceof THREE.SpriteMaterial) material.map?.dispose()
  })
  object.removeFromParent()
}
