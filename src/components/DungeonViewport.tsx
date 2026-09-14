import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getRoomConnection, type DungeonConnection, type DungeonMarker, type DungeonRoom } from '../lib/dungeonPackage'
import { dungeonProps, type DungeonProp, type DungeonWithProps, type PropLibraryAsset } from '../lib/dungeonProps'

export type DungeonTool = 'select' | 'room' | 'corridor' | 'door' | 'enemy' | 'loot' | 'checkpoint' | 'portal' | 'trigger' | 'light' | 'prop' | 'erase'
export type ResizeSide = 'north' | 'south' | 'east' | 'west'

type Props = {
  value: DungeonWithProps
  tool: DungeonTool
  selectedRoomId?: string
  selectedMarkerId?: string
  selectedPropId?: string
  corridorStartId?: string
  topDown: boolean
  playtest: boolean
  libraryAssets: PropLibraryAsset[]
  onGroundClick: (point: { x: number; z: number }) => void
  onRoomClick: (roomId: string) => void
  onMarkerClick: (markerId: string) => void
  onPropClick: (propId: string) => void
  onRoomMove: (roomId: string, x: number, z: number, freeMove: boolean) => void
  onRoomResize: (roomId: string, side: ResizeSide, x: number, z: number, freeMove: boolean) => void
  onPropMove: (propId: string, x: number, z: number, freeMove: boolean) => void
}

type RoomOpening = DungeonConnection & { corridorId: string }
type DragState =
  | { kind: 'room'; id: string; offsetX: number; offsetZ: number; pointerId: number }
  | { kind: 'prop'; id: string; offsetX: number; offsetZ: number; pointerId: number }
  | { kind: 'resize'; id: string; side: ResizeSide; pointerId: number }

const roomColors: Record<DungeonRoom['type'], number> = {
  entrance: 0x5588aa, combat: 0x8a6f55, treasure: 0xb8933d, elite: 0xa05b35,
  shrine: 0x568b77, boss: 0x8c3f4d, secret: 0x624b7c, utility: 0x616a72,
}

export default function DungeonViewport(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props }, [props])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1015)
    scene.fog = new THREE.FogExp2(0x0b1015, props.value.settings.fogDensity)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 300)
    camera.position.set(26, 30, 32)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
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
    const keys = new Set<string>()
    const loader = new GLTFLoader()
    let drag: DragState | undefined
    let yaw = 0
    let pitch = 0
    let wasPlaytest = false
    let walkInitialized = false
    let lastFrame = performance.now()
    let lastSignature = ''

    const rebuild = () => {
      while (dungeonGroup.children.length) disposeObject(dungeonGroup.children.pop()!)
      const state = propsRef.current
      const current = state.value
      const immersive = state.playtest
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = current.settings.fogDensity
      ambient.intensity = 0.6 + current.settings.ambientLight * 2.2
      const roomMap = new Map(current.rooms.map((item) => [item.id, item]))
      const openings = new Map<string, RoomOpening[]>()
      const addOpening = (roomId: string, opening: RoomOpening) => openings.set(roomId, [...(openings.get(roomId) ?? []), opening])

      for (const edge of current.corridors) {
        const fromRoom = roomMap.get(edge.fromRoomId), toRoom = roomMap.get(edge.toRoomId)
        if (!fromRoom || !toRoom) continue
        const from = getRoomConnection(fromRoom, toRoom, edge.width)
        const to = getRoomConnection(toRoom, fromRoom, edge.width)
        addOpening(fromRoom.id, { ...from, corridorId: edge.id })
        addOpening(toRoom.id, { ...to, corridorId: edge.id })
        addCorridor(dungeonGroup, from, to, edge.width)
      }
      for (const roomValue of current.rooms) addRoom(dungeonGroup, roomValue, current.settings.wallThickness, openings.get(roomValue.id) ?? [], !immersive && roomValue.id === state.selectedRoomId, !immersive && roomValue.id === state.corridorStartId, immersive)

      const assetMap = new Map(state.libraryAssets.map((item) => [item.id, item]))
      for (const prop of dungeonProps(current)) addDungeonProp(dungeonGroup, prop, assetMap.get(prop.assetRef), prop.id === state.selectedPropId && !immersive, immersive, loader)
      for (const item of current.markers) addMarker(dungeonGroup, item, item.id === state.selectedMarkerId && !immersive, immersive)
    }
    rebuild()

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
      } catch { /* user gesture may be required */ }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const state = propsRef.current
      if (state.playtest) { requestWalkLock(); event.preventDefault(); return }
      updatePointer(event)
      const hits = raycaster.intersectObjects([dungeonGroup, ground], true)
      const resizeHit = hits.find((hit) => hit.object.userData.resizeSide && hit.object.userData.roomId)
      if (state.tool === 'select' && resizeHit) {
        drag = { kind: 'resize', id: String(resizeHit.object.userData.roomId), side: resizeHit.object.userData.resizeSide as ResizeSide, pointerId: event.pointerId }
        renderer.domElement.setPointerCapture(event.pointerId); controls.enabled = false; renderer.domElement.style.cursor = 'nwse-resize'; event.preventDefault(); return
      }
      const hit = hits.find((candidate) => candidate.object.userData.propId || candidate.object.userData.roomId || candidate.object.userData.markerId || candidate.object.name === '__ground')
      if (!hit) return
      const roomId = hit.object.userData.roomId as string | undefined
      const markerId = hit.object.userData.markerId as string | undefined
      const propId = hit.object.userData.propId as string | undefined

      if (state.tool === 'select' && propId) {
        const item = dungeonProps(state.value).find((candidate) => candidate.id === propId)
        const point = groundPoint(event)
        if (item && point) {
          state.onPropClick(propId)
          drag = { kind: 'prop', id: propId, offsetX: point.x - item.x, offsetZ: point.z - item.z, pointerId: event.pointerId }
          renderer.domElement.setPointerCapture(event.pointerId); controls.enabled = false; renderer.domElement.style.cursor = 'grabbing'; event.preventDefault(); return
        }
      }
      if (state.tool === 'select' && roomId) {
        const item = state.value.rooms.find((candidate) => candidate.id === roomId)
        const point = groundPoint(event)
        if (item && point) {
          state.onRoomClick(roomId)
          drag = { kind: 'room', id: roomId, offsetX: point.x - item.x, offsetZ: point.z - item.z, pointerId: event.pointerId }
          renderer.domElement.setPointerCapture(event.pointerId); controls.enabled = false; renderer.domElement.style.cursor = 'grabbing'; event.preventDefault(); return
        }
      }
      if (state.tool === 'prop') { state.onGroundClick({ x: hit.point.x, z: hit.point.z }); return }
      if (markerId) state.onMarkerClick(markerId)
      else if (roomId) state.onRoomClick(roomId)
      else state.onGroundClick({ x: hit.point.x, z: hit.point.z })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (drag) {
        const point = groundPoint(event)
        if (!point) return
        if (drag.kind === 'room') propsRef.current.onRoomMove(drag.id, point.x - drag.offsetX, point.z - drag.offsetZ, event.shiftKey)
        else if (drag.kind === 'prop') propsRef.current.onPropMove(drag.id, point.x - drag.offsetX, point.z - drag.offsetZ, event.shiftKey)
        else propsRef.current.onRoomResize(drag.id, drag.side, point.x, point.z, event.shiftKey)
        event.preventDefault(); return
      }
      if (propsRef.current.playtest) { renderer.domElement.style.cursor = document.pointerLockElement === renderer.domElement ? 'none' : 'crosshair'; return }
      updatePointer(event)
      const hits = raycaster.intersectObjects(dungeonGroup.children, true)
      if (hits.some((hit) => hit.object.userData.resizeSide)) renderer.domElement.style.cursor = 'nwse-resize'
      else if (propsRef.current.tool === 'select' && hits.some((hit) => hit.object.userData.roomId || hit.object.userData.propId)) renderer.domElement.style.cursor = 'grab'
      else renderer.domElement.style.cursor = propsRef.current.tool === 'select' ? 'default' : 'crosshair'
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return
      if (renderer.domElement.hasPointerCapture(drag.pointerId)) renderer.domElement.releasePointerCapture(drag.pointerId)
      drag = undefined; controls.enabled = true; renderer.domElement.style.cursor = 'default'; event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!propsRef.current.playtest || document.pointerLockElement !== renderer.domElement) return
      yaw -= event.movementX * 0.0022
      pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -Math.PI * 0.47, Math.PI * 0.47)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!propsRef.current.playtest) return
      if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)) { keys.add(event.code); event.preventDefault() }
    }
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code)
    const onBlur = () => keys.clear()
    const onLockChange = () => { renderer.domElement.style.cursor = propsRef.current.playtest && document.pointerLockElement === renderer.domElement ? 'none' : propsRef.current.playtest ? 'crosshair' : 'default'; if (document.pointerLockElement !== renderer.domElement) keys.clear() }

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
      camera.fov = 74; camera.updateProjectionMatrix(); camera.position.set(entrance.x, entrance.floorLevel + 1.68, entrance.z)
      const edge = current.corridors.find((item) => item.fromRoomId === entrance.id || item.toRoomId === entrance.id)
      const otherId = edge ? (edge.fromRoomId === entrance.id ? edge.toRoomId : edge.fromRoomId) : undefined
      const other = current.rooms.find((item) => item.id === otherId)
      yaw = other ? Math.atan2(-(other.x - entrance.x), -(other.z - entrance.z)) : 0
      pitch = 0; walkInitialized = true; controls.enabled = false; grid.visible = false
    }
    const leaveWalkMode = () => {
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      keys.clear(); walkInitialized = false; camera.fov = 48; camera.updateProjectionMatrix(); camera.rotation.set(0,0,0); camera.position.set(26,30,32); controls.target.set(4,0,0); controls.enabled = true; controls.update(); grid.visible = true
    }
    const updateWalk = (dt: number) => {
      const current = propsRef.current.value
      camera.rotation.set(pitch, yaw, 0)
      const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
      const rightAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      if (!forwardAmount && !rightAmount) return
      const move = new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)).multiplyScalar(forwardAmount).add(new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)).multiplyScalar(rightAmount))
      if (move.lengthSq() > 1) move.normalize()
      move.multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.8 : 3.8) * dt)
      const tx = camera.position.x + move.x, tz = camera.position.z + move.z
      if (canWalkAt(current, tx, camera.position.z)) camera.position.x = tx
      if (canWalkAt(current, camera.position.x, tz)) camera.position.z = tz
      camera.position.y = floorHeightAt(current, camera.position.x, camera.position.z) + 1.68
    }

    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now
      const state = propsRef.current
      if (state.playtest !== wasPlaytest) { if (state.playtest) enterWalkMode(); else leaveWalkMode(); wasPlaytest = state.playtest }
      const signature = JSON.stringify([state.value.rooms, state.value.corridors, state.value.markers, dungeonProps(state.value), state.value.settings, state.selectedRoomId, state.selectedMarkerId, state.selectedPropId, state.corridorStartId, state.playtest, state.libraryAssets.map((asset) => asset.id)])
      if (signature !== lastSignature) { lastSignature = signature; rebuild() }
      grid.visible = !state.playtest
      if (state.playtest) { if (!walkInitialized) enterWalkMode(); controls.enabled = false; updateWalk(dt) }
      else {
        if (state.topDown && !drag) { const center = dungeonCenter(state.value.rooms); camera.position.lerp(new THREE.Vector3(center.x,42,center.z + 0.01),0.09); controls.target.lerp(new THREE.Vector3(center.x,0,center.z),0.09) }
        controls.enabled = !drag; if (!drag) controls.update()
      }
      renderer.render(scene,camera); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown); renderer.domElement.removeEventListener('pointermove', onPointerMove); renderer.domElement.removeEventListener('pointerup', onPointerUp); renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('pointerlockchange', onLockChange); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur)
      controls.dispose(); disposeObject(dungeonGroup); ground.geometry.dispose(); (ground.material as THREE.Material).dispose(); renderer.dispose(); renderer.domElement.remove()
    }
  }, [])

  return <div className="dungeon-viewport-canvas"><div ref={hostRef} style={{ position:'absolute', inset:0 }} />{props.playtest && <div className="map-walk-overlay"><div className="map-crosshair" /><div className="map-walk-help"><strong>FIRST PERSON WALK</strong><span>Click for mouse look · WASD move · Shift sprint · Esc releases mouse</span></div></div>}</div>
}

function addRoom(parent: THREE.Group, room: DungeonRoom, wallThickness: number, openings: RoomOpening[], selected: boolean, corridorStart: boolean, immersive: boolean) {
  const group = new THREE.Group(); group.position.set(room.x, room.floorLevel, room.z); group.rotation.y = THREE.MathUtils.degToRad(room.rotation); parent.add(group)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width,0.18,room.depth), new THREE.MeshStandardMaterial({ color: selected ? 0x6f9fba : corridorStart ? 0x8f78b6 : roomColors[room.type], roughness:0.92 }))
  floor.position.y = 0.09; floor.userData.roomId = room.id; group.add(floor)
  const wallMaterial = new THREE.MeshStandardMaterial({ color:selected ? 0x9cc8df : 0x39434b, roughness:0.95 })
  for (const side of ['north','south','west','east'] as ResizeSide[]) addWallWithOpenings(group, room, side, openings.filter((item) => item.side === side), Math.max(0.12,wallThickness), wallMaterial)
  if (selected && !immersive) addRoomHandles(group, room)
  if (!immersive) { const label = makeLabel(room.name, room.type.toUpperCase()); label.position.set(0,room.height + 0.6,0); group.add(label) }
}

function addWallWithOpenings(group: THREE.Group, room: DungeonRoom, side: ResizeSide, openings: RoomOpening[], thickness: number, material: THREE.Material) {
  const horizontal = side === 'north' || side === 'south', total = horizontal ? room.width : room.depth, half = total / 2
  const intervals = mergeIntervals(openings.map((opening) => ({ start:Math.max(-half, opening.offset - opening.openingWidth/2), end:Math.min(half, opening.offset + opening.openingWidth/2) })))
  const doorHeight = Math.min(2.45, Math.max(1.9, room.height - 0.4)); let cursor = -half
  for (const interval of intervals) {
    addWallSegment(group,room,side,cursor,interval.start,thickness,room.height,material)
    const openingLength = interval.end - interval.start
    if (openingLength > 0.05 && room.height > doorHeight + 0.12) {
      const lintelHeight = room.height - doorHeight, center = (interval.start + interval.end) / 2
      const lintel = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(openingLength,lintelHeight,thickness),material) : new THREE.Mesh(new THREE.BoxGeometry(thickness,lintelHeight,openingLength),material)
      if (horizontal) lintel.position.set(center,doorHeight + lintelHeight/2,(side === 'south' ? 1 : -1) * room.depth/2); else lintel.position.set((side === 'east' ? 1 : -1) * room.width/2,doorHeight + lintelHeight/2,center)
      lintel.userData.roomId = room.id; group.add(lintel)
    }
    cursor = interval.end
  }
  addWallSegment(group,room,side,cursor,half,thickness,room.height,material)
}
function addWallSegment(group: THREE.Group, room: DungeonRoom, side: ResizeSide, start: number, end: number, thickness: number, height: number, material: THREE.Material) {
  const length = end - start; if (length <= 0.04) return; const horizontal = side === 'north' || side === 'south'; const center = (start + end)/2
  const wall = horizontal ? new THREE.Mesh(new THREE.BoxGeometry(length,height,thickness),material) : new THREE.Mesh(new THREE.BoxGeometry(thickness,height,length),material)
  if (horizontal) wall.position.set(center,height/2,(side === 'south' ? 1 : -1) * room.depth/2); else wall.position.set((side === 'east' ? 1 : -1) * room.width/2,height/2,center)
  wall.userData.roomId = room.id; group.add(wall)
}
function mergeIntervals(intervals: Array<{start:number;end:number}>) { const sorted = intervals.filter((i) => i.end > i.start).sort((a,b) => a.start-b.start), result:Array<{start:number;end:number}>=[]; for (const i of sorted) { const last=result[result.length-1]; if(!last || i.start > last.end + 0.05) result.push({...i}); else last.end=Math.max(last.end,i.end) } return result }

function addRoomHandles(group: THREE.Group, room: DungeonRoom) {
  const material = new THREE.MeshBasicMaterial({ color:0x8ed8ff, depthTest:false })
  const positions: Array<[ResizeSide,number,number]> = [['north',0,-room.depth/2],['south',0,room.depth/2],['west',-room.width/2,0],['east',room.width/2,0]]
  for (const [side,x,z] of positions) { const handle = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.22,0.55),material); handle.position.set(x,0.32,z); handle.userData.roomId=room.id; handle.userData.resizeSide=side; group.add(handle) }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5,0.67,28), new THREE.MeshBasicMaterial({ color:0x8ed8ff,transparent:true,opacity:0.75,side:THREE.DoubleSide,depthWrite:false })); ring.rotation.x=-Math.PI/2; ring.position.y=0.22; ring.userData.roomId=room.id; group.add(ring)
}

function addCorridor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number) { const floorMat=new THREE.MeshStandardMaterial({color:0x4b4843,roughness:1}), wallMat=new THREE.MeshStandardMaterial({color:0x323a40,roughness:1}), mid={x:to.x,z:from.z}; addCorridorSegment(parent,from.x,from.z,mid.x,mid.z,width,floorMat,wallMat); addCorridorSegment(parent,mid.x,mid.z,to.x,to.z,width,floorMat,wallMat) }
function addCorridorSegment(parent:THREE.Group,x1:number,z1:number,x2:number,z2:number,width:number,floorMat:THREE.Material,wallMat:THREE.Material) { const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz); if(length<0.25)return; const angle=Math.atan2(dx,dz), floor=new THREE.Mesh(new THREE.BoxGeometry(width,0.14,length),floorMat); floor.position.set((x1+x2)/2,0.07,(z1+z2)/2); floor.rotation.y=angle; parent.add(floor); for(const side of [-1,1]){const wall=new THREE.Mesh(new THREE.BoxGeometry(0.24,1,length),wallMat); wall.position.set(floor.position.x+Math.cos(angle)*(width/2+0.12)*side,0.5,floor.position.z-Math.sin(angle)*(width/2+0.12)*side); wall.rotation.y=angle; parent.add(wall)} }

function addDungeonProp(parent: THREE.Group, prop: DungeonProp, asset: PropLibraryAsset | undefined, selected: boolean, immersive: boolean, loader: GLTFLoader) {
  const group = new THREE.Group(); group.position.set(prop.x,prop.y,prop.z); group.rotation.y=THREE.MathUtils.degToRad(prop.rotationY); group.userData.propId=prop.id; parent.add(group)
  if (prop.source === 'builtin') addBuiltinProp(group,prop)
  else {
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.8), new THREE.MeshStandardMaterial({color:0x637788,wireframe:true,transparent:true,opacity:0.5})); placeholder.position.y=0.4; placeholder.userData.propId=prop.id; group.add(placeholder)
    if (asset) {
      const url=URL.createObjectURL(asset.blob)
      loader.load(url,(gltf)=>{URL.revokeObjectURL(url); if(!group.parent)return; group.remove(placeholder); disposeObject(placeholder); const model=gltf.scene.clone(true); const box=new THREE.Box3().setFromObject(model),size=new THREE.Vector3(); box.getSize(size); const max=Math.max(size.x,size.y,size.z,0.001); model.scale.setScalar((1.6/max)*prop.scale); const fitted=new THREE.Box3().setFromObject(model); model.position.y-=fitted.min.y; model.traverse((child)=>{child.userData.propId=prop.id}); group.add(model)},undefined,()=>URL.revokeObjectURL(url))
    }
  }
  if (selected && !immersive) { const ring=new THREE.Mesh(new THREE.RingGeometry(0.55*prop.scale,0.72*prop.scale,28),new THREE.MeshBasicMaterial({color:0xffd36b,side:THREE.DoubleSide,transparent:true,opacity:0.9,depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=0.03; ring.userData.propId=prop.id; group.add(ring) }
  if (!immersive) { const label=makeLabel(prop.name,'PROP'); label.position.y=2.2*Math.max(0.7,prop.scale); label.userData.propId=prop.id; group.add(label) }
}
function addBuiltinProp(group:THREE.Group,prop:DungeonProp){const s=prop.scale, stone=new THREE.MeshStandardMaterial({color:0x60666b,roughness:0.95}), wood=new THREE.MeshStandardMaterial({color:0x6a4a32,roughness:0.9}), metal=new THREE.MeshStandardMaterial({color:0x4e5559,roughness:0.65,metalness:0.35}); const tag=(o:THREE.Object3D)=>o.traverse((c)=>{c.userData.propId=prop.id}); let objects:THREE.Object3D[]=[]; switch(prop.assetRef){case'pillar':{const a=new THREE.Mesh(new THREE.CylinderGeometry(0.38*s,0.45*s,2.6*s,10),stone);a.position.y=1.3*s; const b=new THREE.Mesh(new THREE.BoxGeometry(0.95*s,0.22*s,0.95*s),stone);b.position.y=0.11*s; const c=b.clone();c.position.y=2.49*s;objects=[a,b,c];break}case'torch':{const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.05*s,0.06*s,0.8*s,8),wood);stem.position.y=0.55*s;stem.rotation.z=0.25;const flame=new THREE.Mesh(new THREE.SphereGeometry(0.12*s,10,8),new THREE.MeshBasicMaterial({color:0xffa43a}));flame.position.set(0.1*s,1.0*s,0);const light=new THREE.PointLight(0xff9a45,2.2*s,7*s,2);light.position.copy(flame.position);objects=[stem,flame,light];break}case'statue':{const base=new THREE.Mesh(new THREE.BoxGeometry(0.9*s,0.4*s,0.9*s),stone);base.position.y=0.2*s;const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.3*s,1.1*s,5,8),stone);body.position.y=1.25*s;const head=new THREE.Mesh(new THREE.SphereGeometry(0.28*s,12,9),stone);head.position.y=2.15*s;objects=[base,body,head];break}case'barrel':{const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.42*s,0.42*s,0.9*s,12),wood);barrel.position.y=0.45*s;const band1=new THREE.Mesh(new THREE.TorusGeometry(0.43*s,0.035*s,6,16),metal);band1.rotation.x=Math.PI/2;band1.position.y=0.25*s;const band2=band1.clone();band2.position.y=0.66*s;objects=[barrel,band1,band2];break}case'crate':{const crate=new THREE.Mesh(new THREE.BoxGeometry(0.9*s,0.9*s,0.9*s),wood);crate.position.y=0.45*s;objects=[crate];break}case'rubble':{for(let i=0;i<6;i++){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry((0.15+Math.random()*0.15)*s,0),stone);rock.position.set((Math.random()-0.5)*1.2*s,rock.geometry.boundingSphere?.radius??0.15,(Math.random()-0.5)*1.2*s);rock.rotation.set(Math.random(),Math.random(),Math.random());objects.push(rock)}break}default:{for(let i=-2;i<=2;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(0.12*s,0.8*s,6),metal);spike.position.set(i*0.25*s,0.4*s,0);objects.push(spike)}break}} for(const o of objects){tag(o);group.add(o)}}

function addMarker(parent:THREE.Group,item:DungeonMarker,selected:boolean,immersive:boolean){const group=new THREE.Group();group.position.set(item.x,item.y,item.z);parent.add(group); if(immersive&&['enemy','loot','checkpoint','trigger'].includes(item.type))return; const color=markerColor(item.type); let object:THREE.Object3D; if(item.type==='door'){const dg=new THREE.Group();dg.rotation.y=THREE.MathUtils.degToRad(Number(item.data.yaw??0));const frame=new THREE.MeshStandardMaterial({color:0x4b382b,roughness:0.85}),panelMat=new THREE.MeshStandardMaterial({color,roughness:0.78});const panel=new THREE.Mesh(new THREE.BoxGeometry(0.16,2.25,1.65),panelMat);panel.position.y=1.13;if(!Boolean(item.data.locked)){panel.rotation.y=Math.PI/2;panel.position.x=0.82;panel.position.z=-0.78}const left=new THREE.Mesh(new THREE.BoxGeometry(0.24,2.55,0.22),frame);left.position.set(0,1.27,-0.94);const right=left.clone();right.position.z=0.94;const top=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.24,2.1),frame);top.position.set(0,2.45,0);dg.add(panel,left,right,top);object=dg}else if(item.type==='portal'){const m=new THREE.Mesh(new THREE.TorusGeometry(0.7,0.12,10,28),new THREE.MeshBasicMaterial({color}));m.rotation.y=Math.PI/2;object=m}else if(item.type==='light'){object=new THREE.Mesh(new THREE.SphereGeometry(0.18,12,8),new THREE.MeshBasicMaterial({color}));const light=new THREE.PointLight(String(item.data.color??color),Number(item.data.intensity??2.2),7,2);light.position.y=1.6;group.add(light)}else if(item.type==='trigger')object=new THREE.Mesh(new THREE.CylinderGeometry(item.radius??2,item.radius??2,0.08,24),new THREE.MeshBasicMaterial({color,wireframe:true}));else object=new THREE.Mesh(item.type==='enemy'?new THREE.OctahedronGeometry(0.42):new THREE.SphereGeometry(0.34,14,10),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.2})); object.traverse((c)=>{c.userData.markerId=item.id});if(selected)object.scale.setScalar(1.25);group.add(object);if(!immersive){const label=makeLabel(item.name,item.type.toUpperCase());label.position.y=item.type==='door'?3:1.05;label.userData.markerId=item.id;group.add(label)}}

function canWalkAt(value:DungeonWithProps,x:number,z:number){const r=0.3;if(!value.rooms.some((room)=>pointInsideRoom(room,x,z,r))&&!pointInsideCorridor(value,x,z,r))return false;for(const item of value.markers)if(item.type==='door'&&Boolean(item.data.locked)&&pointInsideDoor(item,x,z,r))return false;for(const prop of dungeonProps(value))if(prop.collision&&Math.hypot(x-prop.x,z-prop.z)<propCollisionRadius(prop)+r)return false;return true}
function propCollisionRadius(prop:DungeonProp){const base=prop.assetRef==='pillar'?0.45:prop.assetRef==='statue'?0.5:prop.assetRef==='rubble'?0.25:prop.assetRef==='spikes'?0.55:0.45;return base*prop.scale}
function pointInsideRoom(room:DungeonRoom,x:number,z:number,margin:number){const dx=x-room.x,dz=z-room.z,a=-THREE.MathUtils.degToRad(room.rotation),c=Math.cos(a),s=Math.sin(a),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.abs(lx)<=Math.max(0.2,room.width/2-margin)&&Math.abs(lz)<=Math.max(0.2,room.depth/2-margin)}
function pointInsideCorridor(value:DungeonWithProps,x:number,z:number,margin:number){const map=new Map(value.rooms.map((r)=>[r.id,r]));for(const edge of value.corridors){const a=map.get(edge.fromRoomId),b=map.get(edge.toRoomId);if(!a||!b)continue;const from=getRoomConnection(a,b,edge.width),to=getRoomConnection(b,a,edge.width),mx=to.x,mz=from.z;if(pointInsideAxisSegment(x,z,from.x,from.z,mx,mz,edge.width,margin)||pointInsideAxisSegment(x,z,mx,mz,to.x,to.z,edge.width,margin))return true}return false}
function pointInsideAxisSegment(x:number,z:number,x1:number,z1:number,x2:number,z2:number,width:number,margin:number){const hw=Math.max(0.25,width/2-margin),pad=margin+0.28;if(Math.abs(z2-z1)<0.05)return x>=Math.min(x1,x2)-pad&&x<=Math.max(x1,x2)+pad&&Math.abs(z-z1)<=hw;if(Math.abs(x2-x1)<0.05)return z>=Math.min(z1,z2)-pad&&z<=Math.max(z1,z2)+pad&&Math.abs(x-x1)<=hw;return false}
function pointInsideDoor(item:DungeonMarker,x:number,z:number,margin:number){const dx=x-item.x,dz=z-item.z,a=-THREE.MathUtils.degToRad(Number(item.data.yaw??0)),c=Math.cos(a),s=Math.sin(a),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.abs(lx)<=0.2+margin&&Math.abs(lz)<=0.9+margin}
function floorHeightAt(value:DungeonWithProps,x:number,z:number){return value.rooms.find((room)=>pointInsideRoom(room,x,z,0))?.floorLevel??0}
function makeLabel(title:string,subtitle:string){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(7,12,17,.82)';ctx.beginPath();ctx.roundRect(8,8,496,112,18);ctx.fill();ctx.fillStyle='#e9f2f9';ctx.font='600 32px system-ui';ctx.textAlign='center';ctx.fillText(title.slice(0,28),256,56);ctx.fillStyle='#87a2b7';ctx.font='600 18px system-ui';ctx.fillText(subtitle,256,88);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(4.6,1.15,1);return sprite}
function markerColor(type:DungeonMarker['type']){return({door:0xa57743,enemy:0xe45c5c,loot:0xe3b64b,checkpoint:0x65d08a,portal:0xa675ff,trigger:0xff9448,light:0xffd179}as const)[type]}
function dungeonCenter(rooms:DungeonRoom[]){if(!rooms.length)return{x:0,z:0};return{x:rooms.reduce((s,r)=>s+r.x,0)/rooms.length,z:rooms.reduce((s,r)=>s+r.z,0)/rooms.length}}
function disposeObject(object:THREE.Object3D){object.traverse((child)=>{const mesh=child as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();const material=mesh.material;if(Array.isArray(material))material.forEach((m)=>m.dispose());else if(material)material.dispose();if(material&&!Array.isArray(material)&&material instanceof THREE.SpriteMaterial)material.map?.dispose()});object.removeFromParent()}
