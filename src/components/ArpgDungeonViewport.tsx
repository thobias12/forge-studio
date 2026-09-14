import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { getRoomConnection, type DungeonConnection, type DungeonMarker, type DungeonRoom } from '../lib/dungeonPackage'
import { dungeonProps, type DungeonProp, type DungeonWithProps } from '../lib/dungeonProps'
import { dungeonAtmosphere, roomAccent, tintRoomFloor, type DungeonAtmosphere } from '../lib/dungeonAtmosphere'

type Props = { value: DungeonWithProps }
type RoomOpening = DungeonConnection & { corridorId: string }
type FlickerLight = { light: THREE.PointLight; base: number; phase: number; speed: number }
type Side = 'north' | 'south' | 'east' | 'west'

const CAMERA_OFFSET = new THREE.Vector3(5.1, 10.2, 6.4)
const CAMERA_FOV = 35
const CAMERA_LOOK_AHEAD = 1.15
const CAMERA_FOLLOW_RATE = 10.5
const CAMERA_FOCUS_RATE = 8.5
const WALK_SPEED = 4.2
const SPRINT_SPEED = 7.2
const OCCLUDER_OPACITY = 0.16

export default function ArpgDungeonViewport({ value }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const initialAtmosphere = dungeonAtmosphere(valueRef.current.theme)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(initialAtmosphere.background)
    scene.fog = new THREE.FogExp2(initialAtmosphere.fog, valueRef.current.settings.fogDensity * initialAtmosphere.fogMultiplier)

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.08, 220)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = initialAtmosphere.exposure
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight(initialAtmosphere.sky, initialAtmosphere.ground, initialAtmosphere.ambient * 1.18)
    scene.add(ambient)
    const key = new THREE.DirectionalLight(initialAtmosphere.key, initialAtmosphere.keyIntensity * 0.9)
    key.position.set(12, 22, 9)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -36
    key.shadow.camera.right = 36
    key.shadow.camera.top = 36
    key.shadow.camera.bottom = -36
    key.shadow.camera.near = 1
    key.shadow.camera.far = 76
    key.shadow.bias = -0.0005
    scene.add(key)

    const world = new THREE.Group()
    scene.add(world)
    const avatar = createAvatar()
    avatar.scale.setScalar(1.08)
    scene.add(avatar)

    const keys = new Set<string>()
    const occlusionRay = new THREE.Raycaster()
    const playerPosition = new THREE.Vector3()
    const cameraFocus = new THREE.Vector3()
    const cameraForward = new THREE.Vector3(-CAMERA_OFFSET.x, 0, -CAMERA_OFFSET.z).normalize()
    const cameraRight = new THREE.Vector3(-cameraForward.z, 0, cameraForward.x)
    const flickerLights: FlickerLight[] = []
    const fadedOccluders = new Map<THREE.Mesh, number>()
    let playerInitialized = false
    let lastFrame = performance.now()
    let lastSignature = ''

    const applyAtmosphere = (current: DungeonWithProps) => {
      const atmosphere = dungeonAtmosphere(current.theme)
      const crypt = current.theme === 'crypt'
      scene.background = new THREE.Color(atmosphere.background)
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(atmosphere.fog)
        scene.fog.density = current.settings.fogDensity * atmosphere.fogMultiplier * (crypt ? 0.9 : 1)
      }
      ambient.color.setHex(atmosphere.sky)
      ambient.groundColor.setHex(atmosphere.ground)
      ambient.intensity = atmosphere.ambient * (crypt ? 1.02 + current.settings.ambientLight * 0.72 : 0.9 + current.settings.ambientLight * 0.7)
      key.color.setHex(atmosphere.key)
      key.intensity = atmosphere.keyIntensity * (crypt ? 0.84 : 0.9)
      renderer.toneMappingExposure = atmosphere.exposure * (crypt ? 1.025 : 1)
      return atmosphere
    }

    const focusTarget = () => playerPosition.clone()
      .addScaledVector(cameraForward, CAMERA_LOOK_AHEAD)
      .add(new THREE.Vector3(0, 0.82, 0))

    const spawnPlayer = (current: DungeonWithProps) => {
      const entrance = current.rooms.find((room) => room.type === 'entrance') ?? current.rooms[0]
      if (!entrance) return
      playerPosition.set(entrance.x, entrance.floorLevel, entrance.z)
      avatar.position.copy(playerPosition)
      avatar.visible = true
      cameraFocus.copy(focusTarget())
      camera.position.copy(playerPosition).add(CAMERA_OFFSET)
      camera.lookAt(cameraFocus)
      playerInitialized = true
    }

    const rebuild = () => {
      fadedOccluders.clear()
      while (world.children.length) disposeObject(world.children.pop()!)
      flickerLights.length = 0
      const current = valueRef.current
      const atmosphere = applyAtmosphere(current)
      const crypt = current.theme === 'crypt'
      const roomMap = new Map(current.rooms.map((room) => [room.id, room]))
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
        addCorridor(world, from, to, edge.width, atmosphere, crypt, `${edge.id}-${current.seed}`)
      }

      for (const room of current.rooms) {
        addRoom(world, room, current.settings.wallThickness, openings.get(room.id) ?? [], atmosphere, flickerLights, crypt)
      }
      for (const prop of dungeonProps(current)) addProp(world, prop, atmosphere, flickerLights)
      for (const marker of current.markers) addMarker(world, marker)
      if (!playerInitialized || !canWalkAt(current, playerPosition.x, playerPosition.z)) spawnPlayer(current)
    }

    rebuild()

    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const onKeyDown = (event: KeyboardEvent) => {
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return
      keys.add(event.code)
      event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code)
    const onBlur = () => keys.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const updatePlayer = (dt: number) => {
      const current = valueRef.current
      const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
      const rightAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      if (forwardAmount || rightAmount) {
        const move = cameraForward.clone().multiplyScalar(forwardAmount).add(cameraRight.clone().multiplyScalar(rightAmount))
        if (move.lengthSq() > 1) move.normalize()
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED
        move.multiplyScalar(speed * dt)
        const nextX = playerPosition.x + move.x
        const nextZ = playerPosition.z + move.z
        if (canWalkAt(current, nextX, playerPosition.z)) playerPosition.x = nextX
        if (canWalkAt(current, playerPosition.x, nextZ)) playerPosition.z = nextZ
        avatar.rotation.y = Math.atan2(move.x, move.z)
      }

      playerPosition.y = floorHeightAt(current, playerPosition.x, playerPosition.z)
      avatar.position.lerp(playerPosition, 1 - Math.exp(-20 * dt))
      const desiredCamera = playerPosition.clone().add(CAMERA_OFFSET)
      camera.position.lerp(desiredCamera, 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt))
      cameraFocus.lerp(focusTarget(), 1 - Math.exp(-CAMERA_FOCUS_RATE * dt))
      camera.lookAt(cameraFocus)
    }

    const ensureIndependentFadeMaterial = (mesh: THREE.Mesh) => {
      if (mesh.userData.arpgFadeMaterial) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.userData.arpgFadeMaterial = true
      mesh.userData.arpgOriginalCastShadow = mesh.castShadow
    }

    const setOccluderOpacity = (mesh: THREE.Mesh, opacity: number) => {
      ensureIndependentFadeMaterial(mesh)
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const transparent = opacity < 0.995
      for (const material of materials) {
        if (material.transparent !== transparent) {
          material.transparent = transparent
          material.needsUpdate = true
        }
        material.opacity = opacity
        material.depthWrite = !transparent
      }
      mesh.castShadow = transparent ? false : Boolean(mesh.userData.arpgOriginalCastShadow)
    }

    const occludersBetweenCameraAndPlayer = () => {
      const hits = new Set<THREE.Mesh>()
      const targetOffsets = [-0.56, 0, 0.56]
      const targets = targetOffsets.map((offset) => playerPosition.clone().addScaledVector(cameraRight, offset).add(new THREE.Vector3(0, 0.78, 0)))
      targets.push(playerPosition.clone().add(new THREE.Vector3(0, 1.35, 0)))
      for (const target of targets) {
        const direction = target.clone().sub(camera.position)
        const distance = direction.length()
        if (distance < 0.1) continue
        direction.normalize()
        occlusionRay.set(camera.position, direction)
        occlusionRay.near = 0.08
        occlusionRay.far = Math.max(0.1, distance - 0.38)
        for (const hit of occlusionRay.intersectObjects(world.children, true)) {
          const mesh = hit.object as THREE.Mesh
          if (!mesh.isMesh || !mesh.userData.arpgOccluder) continue
          hits.add(mesh)
          if (hits.size >= 14) break
        }
      }
      return hits
    }

    const updateOcclusion = (dt: number) => {
      const blocked = occludersBetweenCameraAndPlayer()
      const fadeOut = 1 - Math.exp(-13 * dt)
      const fadeIn = 1 - Math.exp(-8 * dt)
      for (const mesh of blocked) {
        const current = fadedOccluders.get(mesh) ?? 1
        const next = THREE.MathUtils.lerp(current, OCCLUDER_OPACITY, fadeOut)
        setOccluderOpacity(mesh, next)
        fadedOccluders.set(mesh, next)
      }
      for (const [mesh, current] of [...fadedOccluders.entries()]) {
        if (blocked.has(mesh)) continue
        const next = THREE.MathUtils.lerp(current, 1, fadeIn)
        if (next >= 0.995) {
          setOccluderOpacity(mesh, 1)
          fadedOccluders.delete(mesh)
        } else {
          setOccluderOpacity(mesh, next)
          fadedOccluders.set(mesh, next)
        }
      }
    }

    let frame = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
      lastFrame = now
      const current = valueRef.current
      const signature = JSON.stringify([current.theme, current.rooms, current.corridors, current.markers, dungeonProps(current), current.settings])
      if (signature !== lastSignature) {
        lastSignature = signature
        rebuild()
      }
      if (!playerInitialized) spawnPlayer(current)
      updatePlayer(dt)
      const seconds = now * 0.001
      for (const entry of flickerLights) {
        const noise = Math.sin(seconds * entry.speed + entry.phase) * 0.09 + Math.sin(seconds * entry.speed * 2.17 + entry.phase * 0.41) * 0.035
        entry.light.intensity = entry.base * (1 + noise)
      }
      updateOcclusion(dt)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      disposeObject(world)
      disposeObject(avatar)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="dungeon-viewport-canvas map-arpg-active">
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    <div className="map-arpg-overlay"><div className="map-walk-help"><strong>ARPG CAMERA</strong><span>WASD move · Shift sprint · Crypt environment pass · foreground walls fade</span></div></div>
  </div>
}

function markOccluder(mesh: THREE.Mesh) {
  mesh.userData.arpgOccluder = true
  return mesh
}

function addRoom(parent: THREE.Group, room: DungeonRoom, wallThickness: number, openings: RoomOpening[], atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  parent.add(group)

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.width, 0.18, room.depth),
    new THREE.MeshStandardMaterial({ color: tintRoomFloor(atmosphere.floor, room.type, atmosphere), roughness: crypt ? 0.78 : 0.62, metalness: 0.025 }),
  )
  floor.position.y = 0.09
  floor.receiveShadow = true
  group.add(floor)

  if (crypt) addCryptFloor(group, room, atmosphere)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: crypt ? 0.92 : 0.86, metalness: 0.01 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.96 })
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    addWallWithOpenings(group, room, side, openings.filter((opening) => opening.side === side), Math.max(0.12, wallThickness), wallMaterial, darkMaterial, crypt)
  }

  const inset = 0.17
  const corners: Array<[number, number]> = [
    [-room.width / 2 + inset, -room.depth / 2 + inset], [room.width / 2 - inset, -room.depth / 2 + inset],
    [-room.width / 2 + inset, room.depth / 2 - inset], [room.width / 2 - inset, room.depth / 2 - inset],
  ]
  for (const [x, z] of corners) {
    if (crypt) addCryptPillar(group, x, z, room.height, atmosphere)
    else {
      const column = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.36, room.height, 0.36), darkMaterial))
      column.position.set(x, room.height / 2, z)
      column.castShadow = true
      column.receiveShadow = true
      group.add(column)
    }
  }

  if (crypt) addCryptRoomDressing(group, room, atmosphere, flickerLights)
  addRoomLights(group, room, atmosphere, flickerLights, crypt)
}

function addWallWithOpenings(group: THREE.Group, room: DungeonRoom, side: Side, openings: RoomOpening[], thickness: number, material: THREE.Material, darkMaterial: THREE.Material, crypt: boolean) {
  const horizontal = side === 'north' || side === 'south'
  const total = horizontal ? room.width : room.depth
  const half = total / 2
  const intervals = mergeIntervals(openings.map((opening) => ({ start: Math.max(-half, opening.offset - opening.openingWidth / 2), end: Math.min(half, opening.offset + opening.openingWidth / 2) })))
  const doorHeight = Math.min(2.45, Math.max(1.9, room.height - 0.4))
  let cursor = -half
  for (const interval of intervals) {
    addWallSegment(group, room, side, cursor, interval.start, thickness, room.height, material, darkMaterial, crypt)
    const openingLength = interval.end - interval.start
    if (openingLength > 0.05 && room.height > doorHeight + 0.12) {
      const lintelHeight = room.height - doorHeight
      const center = (interval.start + interval.end) / 2
      const lintel = markOccluder(horizontal
        ? new THREE.Mesh(new THREE.BoxGeometry(openingLength, lintelHeight, thickness), material)
        : new THREE.Mesh(new THREE.BoxGeometry(thickness, lintelHeight, openingLength), material))
      placeOnSide(lintel, room, side, center, doorHeight + lintelHeight / 2, 0)
      lintel.castShadow = true
      lintel.receiveShadow = true
      group.add(lintel)
      if (crypt) addCryptDoorArch(group, room, side, center, openingLength, doorHeight, thickness, material, darkMaterial)
    }
    cursor = interval.end
  }
  addWallSegment(group, room, side, cursor, half, thickness, room.height, material, darkMaterial, crypt)
}

function addWallSegment(group: THREE.Group, room: DungeonRoom, side: Side, start: number, end: number, thickness: number, height: number, material: THREE.Material, darkMaterial: THREE.Material, crypt: boolean) {
  const length = end - start
  if (length <= 0.04) return
  const horizontal = side === 'north' || side === 'south'
  const center = (start + end) / 2
  const wall = markOccluder(horizontal
    ? new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material)
    : new THREE.Mesh(new THREE.BoxGeometry(thickness, height, length), material))
  placeOnSide(wall, room, side, center, height / 2, 0)
  wall.castShadow = true
  wall.receiveShadow = true
  group.add(wall)

  const base = markOccluder(horizontal
    ? new THREE.Mesh(new THREE.BoxGeometry(length, 0.28, thickness + 0.1), darkMaterial)
    : new THREE.Mesh(new THREE.BoxGeometry(thickness + 0.1, 0.28, length), darkMaterial))
  placeOnSide(base, room, side, center, 0.14, -0.025)
  base.receiveShadow = true
  group.add(base)

  if (crypt && length > 1.5) addCryptWallBay(group, room, side, start, end, height, thickness, darkMaterial)
}

function placeOnSide(object: THREE.Object3D, room: DungeonRoom, side: Side, along: number, y: number, normalOffset: number) {
  if (side === 'north') object.position.set(along, y, -room.depth / 2 + normalOffset)
  if (side === 'south') object.position.set(along, y, room.depth / 2 - normalOffset)
  if (side === 'west') object.position.set(-room.width / 2 + normalOffset, y, along)
  if (side === 'east') object.position.set(room.width / 2 - normalOffset, y, along)
  if (side === 'west' || side === 'east') object.rotation.y = Math.PI / 2
}

function addCryptFloor(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere) {
  const random = seededRandom(stringSeed(`floor-${room.id}`))
  const tileBase = new THREE.BoxGeometry(1, 0.055, 1)
  const material = new THREE.MeshStandardMaterial({ color: atmosphere.floor, roughness: 0.79, metalness: 0.025 })
  const tiles: Array<{ x: number; z: number; sx: number; sz: number; y: number; r: number; shade: number }> = []
  const step = room.type === 'boss' ? 1.18 : 1.02
  for (let x = -room.width / 2 + step * 0.5; x < room.width / 2; x += step) {
    for (let z = -room.depth / 2 + step * 0.5; z < room.depth / 2; z += step) {
      if (random() < 0.055) continue
      tiles.push({
        x: x + (random() - 0.5) * 0.1,
        z: z + (random() - 0.5) * 0.1,
        sx: step * (0.86 + random() * 0.12),
        sz: step * (0.86 + random() * 0.12),
        y: 0.192 + random() * 0.018,
        r: (random() - 0.5) * 0.035,
        shade: 0.78 + random() * 0.28,
      })
    }
  }
  if (tiles.length) {
    const instances = new THREE.InstancedMesh(tileBase, material, tiles.length)
    const dummy = new THREE.Object3D()
    const baseColor = new THREE.Color(atmosphere.floor)
    tiles.forEach((tile, index) => {
      dummy.position.set(tile.x, tile.y, tile.z)
      dummy.rotation.set(0, tile.r, 0)
      dummy.scale.set(tile.sx, 1, tile.sz)
      dummy.updateMatrix()
      instances.setMatrixAt(index, dummy.matrix)
      instances.setColorAt(index, baseColor.clone().multiplyScalar(tile.shade))
    })
    instances.receiveShadow = true
    instances.castShadow = false
    group.add(instances)
  }

  const puddleCount = room.type === 'boss' ? 3 : room.type === 'entrance' ? 0 : 1 + Math.floor(random() * 2)
  for (let i = 0; i < puddleCount; i += 1) {
    const radius = 0.45 + random() * 0.65
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
      new THREE.MeshStandardMaterial({ color: 0x101923, roughness: 0.17, metalness: 0.08, transparent: true, opacity: 0.42, depthWrite: false }),
    )
    puddle.rotation.x = -Math.PI / 2
    puddle.scale.y = 0.55 + random() * 0.35
    puddle.position.set((random() - 0.5) * room.width * 0.55, 0.226, (random() - 0.5) * room.depth * 0.55)
    group.add(puddle)
  }
}

function addCryptWallBay(group: THREE.Group, room: DungeonRoom, side: Side, start: number, end: number, height: number, thickness: number, darkMaterial: THREE.Material) {
  const length = end - start
  const horizontal = side === 'north' || side === 'south'
  const bayCount = Math.max(1, Math.floor(length / 3.2))
  const spacing = length / bayCount
  for (let i = 0; i < bayCount; i += 1) {
    const center = start + spacing * (i + 0.5)
    const insetWidth = Math.min(1.7, spacing * 0.64)
    const panel = markOccluder(horizontal
      ? new THREE.Mesh(new THREE.BoxGeometry(insetWidth, Math.min(1.75, height * 0.52), 0.055), darkMaterial)
      : new THREE.Mesh(new THREE.BoxGeometry(0.055, Math.min(1.75, height * 0.52), insetWidth), darkMaterial))
    placeOnSide(panel, room, side, center, height * 0.52, thickness * 0.52 + 0.018)
    panel.receiveShadow = true
    group.add(panel)

    for (const offset of [-insetWidth * 0.56, insetWidth * 0.56]) {
      const pilaster = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.2, Math.min(2.25, height * 0.72), 0.2), darkMaterial))
      placeOnSide(pilaster, room, side, center + offset, Math.min(2.25, height * 0.72) / 2, -0.08)
      pilaster.castShadow = true
      group.add(pilaster)
    }
  }
}

function addCryptDoorArch(group: THREE.Group, room: DungeonRoom, side: Side, center: number, openingWidth: number, doorHeight: number, thickness: number, material: THREE.Material, darkMaterial: THREE.Material) {
  const jambHeight = Math.min(doorHeight * 0.78, 1.8)
  const half = openingWidth / 2 + 0.17
  for (const sign of [-1, 1]) {
    const jamb = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.26, jambHeight, thickness + 0.18), material))
    if (side === 'west' || side === 'east') jamb.geometry.rotateY(Math.PI / 2)
    placeOnSide(jamb, room, side, center + sign * half, jambHeight / 2, -0.07)
    jamb.castShadow = true
    jamb.receiveShadow = true
    group.add(jamb)
    const foot = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, thickness + 0.24), darkMaterial))
    if (side === 'west' || side === 'east') foot.geometry.rotateY(Math.PI / 2)
    placeOnSide(foot, room, side, center + sign * half, 0.12, -0.09)
    group.add(foot)
  }

  const radius = Math.max(0.7, openingWidth * 0.52)
  const archCenterY = Math.min(doorHeight - 0.14, 2.05)
  const stones = 9
  for (let i = 0; i < stones; i += 1) {
    const t = i / (stones - 1)
    const angle = Math.PI * t
    const along = center + Math.cos(angle) * radius
    const y = archCenterY + Math.sin(angle) * radius * 0.53
    const stone = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, thickness + 0.22), i === Math.floor(stones / 2) ? darkMaterial : material))
    if (side === 'west' || side === 'east') stone.geometry.rotateY(Math.PI / 2)
    placeOnSide(stone, room, side, along, y, -0.09)
    stone.rotation.z = (Math.PI / 2 - angle) * 0.46
    if (side === 'west' || side === 'east') stone.rotation.x = -(Math.PI / 2 - angle) * 0.46
    stone.castShadow = true
    stone.receiveShadow = true
    group.add(stone)
  }
}

function addCryptPillar(group: THREE.Group, x: number, z: number, height: number, atmosphere: DungeonAtmosphere) {
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.93 })
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.97 })
  const shaftHeight = Math.max(1.2, height - 0.62)
  const shaft = markOccluder(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.29, shaftHeight, 8), stone))
  shaft.position.set(x, 0.31 + shaftHeight / 2, z)
  shaft.castShadow = true
  shaft.receiveShadow = true
  group.add(shaft)
  const base = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.68), dark))
  base.position.set(x, 0.14, z)
  group.add(base)
  const plinth = markOccluder(new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.43, 0.18, 8), stone))
  plinth.position.set(x, 0.37, z)
  group.add(plinth)
  const capital = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.62), dark))
  capital.position.set(x, Math.max(0.7, height - 0.22), z)
  group.add(capital)
  const neck = markOccluder(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.27, 0.2, 8), stone))
  neck.position.set(x, Math.max(0.62, height - 0.44), z)
  group.add(neck)
}

function addCryptRoomDressing(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[]) {
  const random = seededRandom(stringSeed(`dress-${room.id}`))
  const edgeX = Math.max(1.2, room.width / 2 - 1.25)
  const edgeZ = Math.max(1.2, room.depth / 2 - 1.25)

  if (room.type === 'entrance') {
    addBrazier(group, -edgeX * 0.62, -edgeZ * 0.55, atmosphere, flickerLights, 0.82)
    addBrazier(group, edgeX * 0.62, -edgeZ * 0.55, atmosphere, flickerLights, 0.82)
    addStoneBench(group, 0, edgeZ * 0.72, atmosphere, 0)
  } else if (room.type === 'combat') {
    addSarcophagus(group, -edgeX * 0.82, -edgeZ * 0.15, atmosphere, Math.PI / 2)
    if (room.width > 7) addSarcophagus(group, edgeX * 0.82, edgeZ * 0.2, atmosphere, Math.PI / 2)
    addRubbleCluster(group, edgeX * 0.5, -edgeZ * 0.58, atmosphere, random)
    addBonePile(group, -edgeX * 0.35, edgeZ * 0.62, atmosphere, random)
  } else if (room.type === 'elite') {
    addSarcophagus(group, 0, edgeZ * 0.5, atmosphere, 0, 1.15)
    addBrazier(group, -edgeX * 0.66, 0, atmosphere, flickerLights, 1.0)
    addBrazier(group, edgeX * 0.66, 0, atmosphere, flickerLights, 1.0)
    addBonePile(group, 0, -edgeZ * 0.58, atmosphere, random)
  } else if (room.type === 'treasure') {
    addAltar(group, 0, edgeZ * 0.5, atmosphere, 0)
    addCandleCluster(group, -0.75, edgeZ * 0.28, atmosphere, flickerLights, 5)
    addCandleCluster(group, 0.75, edgeZ * 0.28, atmosphere, flickerLights, 4)
    addUrns(group, -edgeX * 0.72, edgeZ * 0.58, atmosphere, random)
    addUrns(group, edgeX * 0.72, edgeZ * 0.58, atmosphere, random)
  } else if (room.type === 'shrine') {
    addAltar(group, 0, edgeZ * 0.45, atmosphere, 0, 1.12)
    addCandleCluster(group, -1.0, 0.1, atmosphere, flickerLights, 6)
    addCandleCluster(group, 1.0, 0.1, atmosphere, flickerLights, 6)
    addStoneBench(group, -edgeX * 0.45, -edgeZ * 0.25, atmosphere, Math.PI / 2)
    addStoneBench(group, edgeX * 0.45, -edgeZ * 0.25, atmosphere, Math.PI / 2)
  } else if (room.type === 'boss') {
    addBossDais(group, atmosphere)
    addBrazier(group, -edgeX * 0.72, -edgeZ * 0.68, atmosphere, flickerLights, 1.15)
    addBrazier(group, edgeX * 0.72, -edgeZ * 0.68, atmosphere, flickerLights, 1.15)
    addBrazier(group, -edgeX * 0.72, edgeZ * 0.68, atmosphere, flickerLights, 1.15)
    addBrazier(group, edgeX * 0.72, edgeZ * 0.68, atmosphere, flickerLights, 1.15)
    addSarcophagus(group, -edgeX * 0.75, 0, atmosphere, Math.PI / 2, 1.18)
    addSarcophagus(group, edgeX * 0.75, 0, atmosphere, Math.PI / 2, 1.18)
  } else if (room.type === 'secret') {
    addSarcophagus(group, 0, edgeZ * 0.32, atmosphere, 0, 0.95, true)
    addRubbleCluster(group, -edgeX * 0.5, -edgeZ * 0.45, atmosphere, random, 1.25)
    addRubbleCluster(group, edgeX * 0.45, -edgeZ * 0.2, atmosphere, random, 0.9)
    addUrns(group, edgeX * 0.58, edgeZ * 0.55, atmosphere, random)
  } else {
    addStoneBench(group, 0, edgeZ * 0.55, atmosphere, 0)
    addUrns(group, -edgeX * 0.55, edgeZ * 0.5, atmosphere, random)
  }
}

function addRoomLights(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) {
  const y = Math.min(1.72, room.height * 0.55)
  const positions: Array<[number, number, number]> = [[-room.width / 2 + 0.38, y, -room.depth * 0.22], [room.width / 2 - 0.38, y, room.depth * 0.22]]
  positions.forEach(([x, py, z], index) => {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), new THREE.MeshStandardMaterial({ color: 0x28221f, roughness: 0.72, metalness: 0.34 }))
    bracket.position.set(x, py - 0.22, z)
    bracket.rotation.z = x < 0 ? -0.34 : 0.34
    group.add(bracket)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: 0.66, metalness: 0.28 }))
    cup.position.set(x, py, z)
    group.add(cup)
    const flameMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: crypt ? 2.05 : 2.4, roughness: 0.3 })
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flameMaterial)
    flame.scale.set(0.78, 1.55, 0.78)
    flame.position.set(x, py + 0.13, z)
    group.add(flame)
    if (index === 0 || room.type === 'boss' || room.type === 'elite') {
      const base = atmosphere.torchIntensity * (crypt ? 0.66 : 0.88)
      const light = new THREE.PointLight(atmosphere.torch, base, crypt ? 11.5 : 9.5, crypt ? 1.55 : 1.75)
      light.position.copy(flame.position)
      group.add(light)
      flickerLights.push({ light, base, phase: Math.random() * Math.PI * 2, speed: 5.2 + Math.random() * 1.6 })
    }
  })

  if (crypt) {
    const fill = new THREE.PointLight(atmosphere.sky, room.type === 'boss' ? 0.62 : room.type === 'entrance' ? 0.42 : 0.34, Math.max(room.width, room.depth) * 0.82, 1.55)
    fill.position.set(0, Math.min(1.9, room.height * 0.58), 0)
    group.add(fill)
  }

  const accent = roomAccent(room.type, atmosphere)
  if (accent !== undefined) {
    const light = new THREE.PointLight(accent, room.type === 'boss' ? 1.45 : 0.72, room.type === 'boss' ? Math.max(room.width, room.depth) * 0.82 : 5.8, 1.9)
    light.position.set(0, 1.15, 0)
    group.add(light)
  }
}

function addCorridor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number, atmosphere: DungeonAtmosphere, crypt: boolean, seedKey: string) {
  const floorMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.corridorFloor, roughness: crypt ? 0.8 : 0.68, metalness: 0.02 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.corridorWall, roughness: crypt ? 0.93 : 0.88 })
  const mid = { x: to.x, z: from.z }
  addCorridorSegment(parent, from.x, from.z, mid.x, mid.z, width, floorMaterial, wallMaterial, crypt, `${seedKey}-a`)
  addCorridorSegment(parent, mid.x, mid.z, to.x, to.z, width, floorMaterial, wallMaterial, crypt, `${seedKey}-b`)
}

function addCorridorSegment(parent: THREE.Group, x1: number, z1: number, x2: number, z2: number, width: number, floorMaterial: THREE.Material, wallMaterial: THREE.Material, crypt: boolean, seedKey: string) {
  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.hypot(dx, dz)
  if (length < 0.25) return
  const angle = Math.atan2(dx, dz)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, length), floorMaterial)
  floor.position.set((x1 + x2) / 2, 0.07, (z1 + z2) / 2)
  floor.rotation.y = angle
  floor.receiveShadow = true
  parent.add(floor)
  if (crypt) addCryptCorridorFloor(parent, floor.position.x, floor.position.z, width, length, angle, floorMaterial, seedKey)

  for (const side of [-1, 1]) {
    const wall = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.55, length), wallMaterial))
    wall.position.set(floor.position.x + Math.cos(angle) * (width / 2 + 0.11) * side, 1.275, floor.position.z - Math.sin(angle) * (width / 2 + 0.11) * side)
    wall.rotation.y = angle
    wall.castShadow = true
    wall.receiveShadow = true
    parent.add(wall)
    if (crypt && length > 3) {
      const count = Math.floor(length / 3.2)
      for (let i = 0; i < count; i += 1) {
        const along = -length / 2 + (i + 0.5) * (length / count)
        const buttress = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.15, 0.42), wallMaterial))
        buttress.position.copy(wall.position)
        buttress.position.x += Math.sin(angle) * along
        buttress.position.z += Math.cos(angle) * along
        buttress.position.y = 1.075
        buttress.rotation.y = angle
        buttress.castShadow = true
        parent.add(buttress)
      }
    }
  }
}

function addCryptCorridorFloor(parent: THREE.Group, cx: number, cz: number, width: number, length: number, angle: number, material: THREE.Material, seedKey: string) {
  const random = seededRandom(stringSeed(seedKey))
  const tileSize = 0.95
  const across = Math.max(1, Math.floor(width / tileSize))
  const along = Math.max(1, Math.floor(length / tileSize))
  const geometry = new THREE.BoxGeometry(1, 0.045, 1)
  const instanced = new THREE.InstancedMesh(geometry, material, across * along)
  const dummy = new THREE.Object3D()
  let index = 0
  for (let a = 0; a < across; a += 1) {
    for (let l = 0; l < along; l += 1) {
      const localX = (a - (across - 1) / 2) * (width / across)
      const localZ = (l - (along - 1) / 2) * (length / along)
      dummy.position.set(
        cx + Math.cos(angle) * localX + Math.sin(angle) * localZ,
        0.155 + random() * 0.012,
        cz - Math.sin(angle) * localX + Math.cos(angle) * localZ,
      )
      dummy.rotation.set(0, angle + (random() - 0.5) * 0.025, 0)
      dummy.scale.set((width / across) * (0.86 + random() * 0.08), 1, (length / along) * (0.86 + random() * 0.08))
      dummy.updateMatrix()
      instanced.setMatrixAt(index++, dummy.matrix)
    }
  }
  instanced.receiveShadow = true
  parent.add(instanced)
}

function addSarcophagus(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, rotation = 0, scale = 1, broken = false) {
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.93 })
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.97 })
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = rotation + (broken ? -0.18 : 0)
  root.scale.setScalar(scale)
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.34, 2.05), dark); base.position.y = 0.17
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.46, 1.82), stone); body.position.y = 0.5
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.18, 1.96), stone); lid.position.set(broken ? 0.18 : 0, broken ? 0.76 : 0.77, broken ? 0.08 : 0); lid.rotation.z = broken ? 0.12 : 0
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 1.3), dark); crest.position.set(0, 0.89, 0)
  for (const mesh of [base, body, lid, crest]) { mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh) }
  group.add(root)
}

function addAltar(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, rotation = 0, scale = 1) {
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.91 })
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.97 })
  const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rotation; root.scale.setScalar(scale)
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.95), dark); base.position.y = 0.1
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.68, 0.66), stone); stem.position.y = 0.54
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.16, 0.9), stone); top.position.y = 0.96
  for (const mesh of [base, stem, top]) { mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh) }
  group.add(root)
}

function addStoneBench(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, rotation = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.95 })
  const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rotation
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.46), mat); seat.position.y = 0.48
  const legA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.36), mat); legA.position.set(-0.5, 0.225, 0)
  const legB = legA.clone(); legB.position.x = 0.5
  root.add(seat, legA, legB); group.add(root)
}

function addBrazier(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], scale = 1) {
  const root = new THREE.Group(); root.position.set(x, 0, z); root.scale.setScalar(scale)
  const metal = new THREE.MeshStandardMaterial({ color: 0x343436, roughness: 0.58, metalness: 0.48 })
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.24, 0.18, 10), metal); bowl.position.y = 0.9
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.75, 8), metal); stem.position.y = 0.47
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.1, 8), metal); foot.position.y = 0.05
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 7), new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: 2.25, roughness: 0.25 }))
  flame.position.y = 1.08; flame.scale.set(1, 1.45, 1)
  root.add(bowl, stem, foot, flame)
  group.add(root)
  const base = atmosphere.torchIntensity * 0.54 * scale
  const light = new THREE.PointLight(atmosphere.torch, base, 10.5 * scale, 1.6)
  light.position.set(x, 1.05 * scale, z)
  group.add(light)
  flickerLights.push({ light, base, phase: Math.random() * Math.PI * 2, speed: 5 + Math.random() * 1.5 })
}

function addCandleCluster(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], count: number) {
  const random = seededRandom(stringSeed(`candles-${x}-${z}-${count}`))
  const wax = new THREE.MeshStandardMaterial({ color: 0xc8bea7, roughness: 0.86 })
  const flameMat = new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: 1.8, roughness: 0.3 })
  for (let i = 0; i < count; i += 1) {
    const px = x + (random() - 0.5) * 0.75
    const pz = z + (random() - 0.5) * 0.55
    const h = 0.18 + random() * 0.25
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 7), wax); candle.position.set(px, h / 2, pz)
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), flameMat); flame.position.set(px, h + 0.04, pz); flame.scale.y = 1.5
    group.add(candle, flame)
  }
  const base = atmosphere.torchIntensity * 0.16
  const light = new THREE.PointLight(atmosphere.torch, base, 3.8, 1.8); light.position.set(x, 0.52, z); group.add(light)
  flickerLights.push({ light, base, phase: Math.random() * Math.PI * 2, speed: 4.5 + Math.random() })
}

function addUrns(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, random: () => number) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(atmosphere.wall).multiplyScalar(0.72), roughness: 0.94 })
  const count = 2 + Math.floor(random() * 3)
  for (let i = 0; i < count; i += 1) {
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + random() * 0.05, 0.16 + random() * 0.06, 0.35 + random() * 0.2, 9), mat)
    urn.position.set(x + (random() - 0.5) * 0.7, urn.geometry.parameters.height / 2, z + (random() - 0.5) * 0.7)
    urn.castShadow = true
    group.add(urn)
  }
}

function addBonePile(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, random: () => number) {
  const bone = new THREE.MeshStandardMaterial({ color: 0xa49b82, roughness: 0.92 })
  for (let i = 0; i < 7; i += 1) {
    const piece = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22 + random() * 0.16, 3, 6), bone)
    piece.position.set(x + (random() - 0.5) * 0.85, 0.07 + random() * 0.05, z + (random() - 0.5) * 0.7)
    piece.rotation.set((random() - 0.5) * 1.2, random() * Math.PI, Math.PI / 2 + (random() - 0.5) * 0.8)
    group.add(piece)
  }
}

function addRubbleCluster(group: THREE.Group, x: number, z: number, atmosphere: DungeonAtmosphere, random: () => number, scale = 1) {
  const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color(atmosphere.wall).multiplyScalar(0.76), roughness: 0.97 })
  for (let i = 0; i < 8; i += 1) {
    const radius = (0.1 + random() * 0.18) * scale
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), stone)
    rock.position.set(x + (random() - 0.5) * 1.2 * scale, radius * 0.65, z + (random() - 0.5) * 1.0 * scale)
    rock.rotation.set(random(), random(), random())
    rock.castShadow = true
    group.add(rock)
  }
}

function addBossDais(group: THREE.Group, atmosphere: DungeonAtmosphere) {
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.94 })
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.88 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.4, 0.16, 32), dark); base.position.y = 0.08
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.1, 32), stone); top.position.y = 0.21
  group.add(base, top)
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 48), new THREE.MeshBasicMaterial({ color: 0x71312f, transparent: true, opacity: 0.2, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.27; group.add(ring)
}

function addProp(parent: THREE.Group, prop: DungeonProp, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[]) {
  const group = new THREE.Group()
  group.position.set(prop.x, prop.y, prop.z)
  group.rotation.y = THREE.MathUtils.degToRad(prop.rotationY)
  group.scale.setScalar(prop.scale)
  parent.add(group)

  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.9 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x4f565c, roughness: 0.65, metalness: 0.32 })
  const add = (object: THREE.Object3D, occluder = false) => {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (occluder) mesh.userData.arpgOccluder = true
    })
    group.add(object)
  }

  if (prop.source === 'library') {
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), stone)
    placeholder.position.y = 0.4
    add(placeholder)
    return
  }

  if (prop.assetRef === 'pillar') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.35, 8), stone); shaft.position.y = 1.3
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.24, 0.96), stone); base.position.y = 0.12
    const capital = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.22, 0.78), stone); capital.position.y = 2.48
    add(shaft, true); add(base, true); add(capital, true)
  } else if (prop.assetRef === 'torch') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 8), wood); stem.position.y = 0.55; stem.rotation.z = 0.25
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 7), new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: 2.2, roughness: 0.3 })); flame.scale.y = 1.4; flame.position.set(0.1, 1.02, 0)
    const base = atmosphere.torchIntensity * 0.7
    const light = new THREE.PointLight(atmosphere.torch, base, 11, 1.6); light.position.copy(flame.position)
    flickerLights.push({ light, base, phase: Math.random() * Math.PI * 2, speed: 5.5 + Math.random() * 1.5 })
    add(stem); add(flame); group.add(light)
  } else if (prop.assetRef === 'statue') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), stone); base.position.y = 0.2
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 5, 8), stone); body.position.y = 1.25
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 9), stone); head.position.y = 2.15
    add(base, true); add(body, true); add(head, true)
  } else if (prop.assetRef === 'barrel') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12), wood); barrel.position.y = 0.45; add(barrel)
  } else if (prop.assetRef === 'crate') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), wood); crate.position.y = 0.45; add(crate)
  } else if (prop.assetRef === 'rubble') {
    const random = seededRandom(stringSeed(prop.id))
    for (let index = 0; index < 6; index += 1) {
      const radius = 0.14 + random() * 0.14
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), stone)
      rock.position.set((random() - 0.5) * 1.1, radius, (random() - 0.5) * 1.1)
      rock.rotation.set(random(), random(), random())
      add(rock)
    }
  } else {
    for (let index = -2; index <= 2; index += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), metal)
      spike.position.set(index * 0.25, 0.4, 0)
      add(spike)
    }
  }
}

function addMarker(parent: THREE.Group, marker: DungeonMarker) {
  const group = new THREE.Group()
  group.position.set(marker.x, marker.y, marker.z)
  parent.add(group)
  if (marker.type === 'door') {
    group.rotation.y = THREE.MathUtils.degToRad(Number(marker.data.yaw ?? 0))
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x4b382b, roughness: 0.85 })
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x7d5b38, roughness: 0.78 })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.25, 1.65), panelMaterial)
    panel.position.y = 1.13
    if (!Boolean(marker.data.locked)) { panel.rotation.y = Math.PI / 2; panel.position.x = 0.82; panel.position.z = -0.78 }
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.55, 0.22), frameMaterial); left.position.set(0, 1.27, -0.94)
    const right = left.clone(); right.position.z = 0.94
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 2.1), frameMaterial); top.position.set(0, 2.45, 0)
    group.add(panel, left, right, top)
  } else if (marker.type === 'portal') {
    const portal = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 10, 24), new THREE.MeshBasicMaterial({ color: 0x9f74ff }))
    portal.rotation.y = Math.PI / 2
    group.add(portal)
  } else if (marker.type === 'light') {
    const color = String(marker.data.color ?? '#ffb45f')
    const light = new THREE.PointLight(color, Number(marker.data.intensity ?? 2), 7, 2)
    light.position.y = 1.6
    group.add(light)
  } else if (marker.type === 'enemy') {
    const enemy = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.58, 4, 8), new THREE.MeshStandardMaterial({ color: 0x723838, roughness: 0.8 }))
    enemy.position.y = 0.62
    group.add(enemy)
  } else if (marker.type === 'loot') {
    const loot = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), new THREE.MeshStandardMaterial({ color: 0xc89b42, emissive: 0x7d5f22, emissiveIntensity: 0.35 }))
    loot.position.y = 0.35
    group.add(loot)
  }
}

function createAvatar() {
  const group = new THREE.Group()
  group.visible = false
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x46545f, roughness: 0.66, metalness: 0.06, emissive: 0x0a1116, emissiveIntensity: 0.2 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x9bb6c7, roughness: 0.5, metalness: 0.1, emissive: 0x101a21, emissiveIntensity: 0.16 })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 5, 9), bodyMaterial)
  body.position.y = 0.86
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), accentMaterial)
  head.position.y = 1.55
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 28), new THREE.MeshBasicMaterial({ color: 0xa9d6ee, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.025
  body.castShadow = true
  head.castShadow = true
  group.add(body, head, ring)
  return group
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

function canWalkAt(value: DungeonWithProps, x: number, z: number) {
  const radius = 0.3
  if (!value.rooms.some((room) => pointInsideRoom(room, x, z, radius)) && !pointInsideCorridor(value, x, z, radius)) return false
  for (const marker of value.markers) if (marker.type === 'door' && Boolean(marker.data.locked) && pointInsideDoor(marker, x, z, radius)) return false
  for (const prop of dungeonProps(value)) if (prop.collision && Math.hypot(x - prop.x, z - prop.z) < propCollisionRadius(prop) + radius) return false
  return true
}

function propCollisionRadius(prop: DungeonProp) {
  const base = prop.assetRef === 'pillar' ? 0.45 : prop.assetRef === 'statue' ? 0.5 : prop.assetRef === 'rubble' ? 0.25 : prop.assetRef === 'spikes' ? 0.55 : 0.45
  return base * prop.scale
}

function pointInsideRoom(room: DungeonRoom, x: number, z: number, margin: number) {
  const dx = x - room.x, dz = z - room.z
  const angle = -THREE.MathUtils.degToRad(room.rotation)
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos
  return Math.abs(localX) <= Math.max(0.2, room.width / 2 - margin) && Math.abs(localZ) <= Math.max(0.2, room.depth / 2 - margin)
}

function pointInsideCorridor(value: DungeonWithProps, x: number, z: number, margin: number) {
  const rooms = new Map(value.rooms.map((room) => [room.id, room]))
  for (const edge of value.corridors) {
    const a = rooms.get(edge.fromRoomId), b = rooms.get(edge.toRoomId)
    if (!a || !b) continue
    const from = getRoomConnection(a, b, edge.width), to = getRoomConnection(b, a, edge.width)
    const midX = to.x, midZ = from.z
    if (pointInsideAxisSegment(x, z, from.x, from.z, midX, midZ, edge.width, margin) || pointInsideAxisSegment(x, z, midX, midZ, to.x, to.z, edge.width, margin)) return true
  }
  return false
}

function pointInsideAxisSegment(x: number, z: number, x1: number, z1: number, x2: number, z2: number, width: number, margin: number) {
  const halfWidth = Math.max(0.25, width / 2 - margin)
  const pad = margin + 0.28
  if (Math.abs(z2 - z1) < 0.05) return x >= Math.min(x1, x2) - pad && x <= Math.max(x1, x2) + pad && Math.abs(z - z1) <= halfWidth
  if (Math.abs(x2 - x1) < 0.05) return z >= Math.min(z1, z2) - pad && z <= Math.max(z1, z2) + pad && Math.abs(x - x1) <= halfWidth
  return false
}

function pointInsideDoor(marker: DungeonMarker, x: number, z: number, margin: number) {
  const dx = x - marker.x, dz = z - marker.z
  const angle = -THREE.MathUtils.degToRad(Number(marker.data.yaw ?? 0))
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos
  return Math.abs(localX) <= 0.2 + margin && Math.abs(localZ) <= 0.9 + margin
}

function floorHeightAt(value: DungeonWithProps, x: number, z: number) {
  return value.rooms.find((room) => pointInsideRoom(room, x, z, 0))?.floorLevel ?? 0
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let next = state
    next = Math.imul(next ^ next >>> 15, next | 1)
    next ^= next + Math.imul(next ^ next >>> 7, next | 61)
    return ((next ^ next >>> 14) >>> 0) / 4294967296
  }
}

function stringSeed(value: string) {
  let seed = 2166136261
  for (let index = 0; index < value.length; index += 1) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619)
  return seed >>> 0
}

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
