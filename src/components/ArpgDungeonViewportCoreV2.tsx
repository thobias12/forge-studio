import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getRoomConnection, type DungeonConnection, type DungeonMarker, type DungeonRoom } from '../lib/dungeonPackage'
import { dungeonProps, type DungeonDestructible, type DungeonProp, type DungeonWithProps } from '../lib/dungeonProps'
import { dungeonAtmosphere, roomAccent, tintRoomFloor, type DungeonAtmosphere } from '../lib/dungeonAtmosphere'
import { addCryptCorridorEnvironment, addCryptRoomEnvironment } from '../lib/cryptEnvironment'
import { getAsset } from '../lib/library'
import { definitionFromMetadata, findDestructibleRoot, isForgeDestructibleMetadata, playDestructibleBreakSound } from '../lib/destructibleAsset'

type Props = { value: DungeonWithProps }
type RoomOpening = DungeonConnection & { corridorId: string }
type FlickerLight = { light: THREE.PointLight; base: number; phase: number; speed: number }
type Side = 'north' | 'south' | 'east' | 'west'
type RuntimeDestructible = {
  prop: DungeonProp
  root: THREE.Object3D
  intact: THREE.Object3D
  fragments: THREE.Object3D
  meshes: THREE.Mesh[]
  definition: DungeonDestructible
}
type DustParticle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; totalLife: number }

const CAMERA_OFFSET = new THREE.Vector3(5.1, 10.2, 6.4)
const CAMERA_FOV = 35
const CAMERA_LOOK_AHEAD = 1.15
const CAMERA_FOLLOW_RATE = 10.5
const CAMERA_FOCUS_RATE = 8.5
const WALK_SPEED = 4.2
const SPRINT_SPEED = 7.2
const OCCLUDER_OPACITY = 0.16

export default function ArpgDungeonViewportCoreV2({ value }: Props) {
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
    key.shadow.camera.left = -36; key.shadow.camera.right = 36; key.shadow.camera.top = 36; key.shadow.camera.bottom = -36
    key.shadow.camera.near = 1; key.shadow.camera.far = 76; key.shadow.bias = -0.0005
    scene.add(key)

    const world = new THREE.Group()
    scene.add(world)
    const avatar = createAvatar()
    avatar.scale.setScalar(1.08)
    scene.add(avatar)

    const keys = new Set<string>()
    const loader = new GLTFLoader()
    const occlusionRay = new THREE.Raycaster()
    const playerPosition = new THREE.Vector3()
    const cameraFocus = new THREE.Vector3()
    const cameraForward = new THREE.Vector3(-CAMERA_OFFSET.x, 0, -CAMERA_OFFSET.z).normalize()
    const cameraRight = new THREE.Vector3(-cameraForward.z, 0, cameraForward.x)
    const flickerLights: FlickerLight[] = []
    const fadedOccluders = new Map<THREE.Mesh, number>()
    const destructibles = new Map<string, RuntimeDestructible>()
    const brokenPropIds = new Set<string>()
    const dust: DustParticle[] = []
    const lootDrops: THREE.Mesh[] = []
    let playerInitialized = false
    let lastFrame = performance.now()
    let lastSignature = ''
    let breakFreezeUntil = 0
    let cameraShake = 0

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

    const focusTarget = () => playerPosition.clone().addScaledVector(cameraForward, CAMERA_LOOK_AHEAD).add(new THREE.Vector3(0, 0.82, 0))
    const spawnPlayer = (current: DungeonWithProps) => {
      const checkpoint = current.markers.find((item) => item.type === 'checkpoint')
      const entrance = current.rooms.find((room) => room.type === 'entrance') ?? current.rooms[0]
      if (!entrance) return
      playerPosition.set(checkpoint?.x ?? entrance.x, entrance.floorLevel, checkpoint?.z ?? entrance.z)
      avatar.position.copy(playerPosition)
      avatar.visible = true
      cameraFocus.copy(focusTarget())
      camera.position.copy(playerPosition).add(CAMERA_OFFSET)
      camera.lookAt(cameraFocus)
      playerInitialized = true
    }

    const registerLibraryProp = (prop: DungeonProp, group: THREE.Group, atmosphere: DungeonAtmosphere) => {
      const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.86, transparent: true, opacity: 0.35 }))
      placeholder.position.y = 0.4
      group.add(placeholder)
      void getAsset(prop.assetRef).then(async (asset) => {
        if (!asset || !group.parent || asset.kind !== 'glb') return
        const url = URL.createObjectURL(asset.blob)
        try {
          const gltf = await loader.loadAsync(url)
          if (!group.parent) { disposeObject(gltf.scene); return }
          placeholder.removeFromParent(); disposeObject(placeholder)
          gltf.scene.traverse((object) => {
            object.userData.propId = prop.id
            const mesh = object as THREE.Mesh
            if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
          })
          group.add(gltf.scene)

          const destructibleRoot = findDestructibleRoot(gltf.scene)
          const metadata = destructibleRoot?.userData.forgeDestructible
          const fromAsset = isForgeDestructibleMetadata(metadata) ? definitionFromMetadata(metadata) : undefined
          const definition = prop.destructible ?? fromAsset
          if (!definition || !destructibleRoot) return
          const intactName = isForgeDestructibleMetadata(metadata) ? metadata.intactGroup ?? 'Intact' : 'Intact'
          const fragmentsName = isForgeDestructibleMetadata(metadata) ? metadata.fragmentsGroup ?? 'Fragments' : 'Fragments'
          const intact = destructibleRoot.getObjectByName(intactName)
          const fragments = destructibleRoot.getObjectByName(fragmentsName)
          if (!intact || !fragments) return
          const meshes: THREE.Mesh[] = []
          fragments.traverse((object) => {
            const mesh = object as THREE.Mesh
            if (!mesh.isMesh) return
            meshes.push(mesh)
            const bounds = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
            mesh.userData.breakFloorRadius = Math.max(0.045, Math.min(bounds.x || 0.1, bounds.y || 0.1, bounds.z || 0.1) * 0.3)
          })
          const alreadyBroken = brokenPropIds.has(prop.id)
          intact.visible = !alreadyBroken
          fragments.visible = alreadyBroken
          destructibles.set(prop.id, { prop, root: destructibleRoot, intact, fragments, meshes, definition })
        } catch { /* stale or invalid library assets stay as placeholders */ }
        finally { URL.revokeObjectURL(url) }
      }).catch(() => undefined)
    }

    const rebuild = () => {
      fadedOccluders.clear()
      destructibles.clear()
      for (const particle of dust.splice(0)) disposeObject(particle.mesh)
      for (const drop of lootDrops.splice(0)) disposeObject(drop)
      while (world.children.length) disposeObject(world.children.pop()!)
      flickerLights.length = 0
      const current = valueRef.current
      const atmosphere = applyAtmosphere(current)
      const crypt = current.theme === 'crypt'
      const roomMap = new Map(current.rooms.map((room) => [room.id, room]))
      const openings = new Map<string, RoomOpening[]>()
      const addOpening = (roomId: string, opening: RoomOpening) => openings.set(roomId, [...(openings.get(roomId) ?? []), opening])

      for (const edge of current.corridors) {
        const fromRoom = roomMap.get(edge.fromRoomId), toRoom = roomMap.get(edge.toRoomId)
        if (!fromRoom || !toRoom) continue
        const from = getRoomConnection(fromRoom, toRoom, edge.width), to = getRoomConnection(toRoom, fromRoom, edge.width)
        addOpening(fromRoom.id, { ...from, corridorId: edge.id })
        addOpening(toRoom.id, { ...to, corridorId: edge.id })
        addBaseCorridor(world, from, to, edge.width, atmosphere)
        if (crypt) addCryptCorridorEnvironment(world, from, to, edge.width, atmosphere, `${edge.id}-${current.seed}`, false)
      }

      for (const room of current.rooms) {
        const roomOpenings = openings.get(room.id) ?? []
        addBaseRoom(world, room, current.settings.wallThickness, roomOpenings, atmosphere, flickerLights, crypt)
        if (crypt) addCryptRoomEnvironment(world, room, roomOpenings, current.settings.wallThickness, atmosphere, flickerLights, false)
      }
      for (const prop of dungeonProps(current)) {
        const group = addBuiltinProp(world, prop, atmosphere, flickerLights)
        if (prop.source === 'library') registerLibraryProp(prop, group, atmosphere)
      }
      for (const item of current.markers) addMarker(world, item)
      if (!playerInitialized || !canWalkAt(current, playerPosition.x, playerPosition.z, brokenPropIds)) spawnPlayer(current)
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
    resizeObserver.observe(host); resize()

    const breakDestructible = (runtime: RuntimeDestructible) => {
      if (brokenPropIds.has(runtime.prop.id)) return
      brokenPropIds.add(runtime.prop.id)
      runtime.intact.visible = false
      runtime.fragments.visible = true
      const random = seededRandom(stringSeed(`${runtime.prop.id}-${Date.now()}`))
      for (const mesh of runtime.meshes) {
        const outward = mesh.position.clone()
        outward.y = Math.max(0.18, outward.y * 0.32 + 0.25)
        if (outward.lengthSq() < 0.001) outward.set(random() - 0.5, 0.3, random() - 0.5)
        outward.normalize()
        const power = runtime.definition.impulse * (0.62 + random() * 0.7)
        mesh.userData.breakVelocity = outward.multiplyScalar(power).add(new THREE.Vector3((random() - 0.5) * 1.6, 1.1 + random() * 1.9, (random() - 0.5) * 1.6))
        mesh.userData.breakAngular = new THREE.Vector3((random() - 0.5) * 8, (random() - 0.5) * 9, (random() - 0.5) * 8)
        mesh.userData.breakAge = 0
        mesh.visible = true
      }
      spawnBreakDust(world, dust, runtime.prop, runtime.definition)
      if (runtime.definition.lootEnabled && Math.random() <= runtime.definition.lootChance) lootDrops.push(spawnLoot(world, runtime.prop))
      playDestructibleBreakSound(runtime.definition.template)
      breakFreezeUntil = performance.now() + 38
      cameraShake = Math.max(cameraShake, 0.105)
    }

    const smashNearest = () => {
      if (!playerInitialized) return
      let best: RuntimeDestructible | undefined
      let bestScore = Infinity
      const facing = new THREE.Vector3(Math.sin(avatar.rotation.y), 0, Math.cos(avatar.rotation.y))
      for (const runtime of destructibles.values()) {
        if (brokenPropIds.has(runtime.prop.id)) continue
        const target = new THREE.Vector3(runtime.prop.x, playerPosition.y, runtime.prop.z)
        const delta = target.sub(playerPosition)
        const distance = delta.length()
        const reach = 1.75 + runtime.prop.scale * 0.6
        if (distance > reach) continue
        const direction = distance > 0.001 ? delta.clone().normalize() : facing
        const facingScore = facing.dot(direction)
        if (facingScore < -0.2) continue
        const score = distance - facingScore * 0.35
        if (score < bestScore) { best = runtime; bestScore = score }
      }
      if (best) breakDestructible(best)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'KeyF') { smashNearest(); event.preventDefault(); return }
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return
      keys.add(event.code); event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code)
    const onBlur = () => keys.clear()
    const onPointerDown = (event: PointerEvent) => { if (event.button === 0) { smashNearest(); event.preventDefault() } }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)

    const updatePlayer = (dt: number) => {
      const current = valueRef.current
      const forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
      const rightAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      if (forwardAmount || rightAmount) {
        const move = cameraForward.clone().multiplyScalar(forwardAmount).add(cameraRight.clone().multiplyScalar(rightAmount))
        if (move.lengthSq() > 1) move.normalize()
        move.multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED) * dt)
        const nextX = playerPosition.x + move.x, nextZ = playerPosition.z + move.z
        if (canWalkAt(current, nextX, playerPosition.z, brokenPropIds)) playerPosition.x = nextX
        if (canWalkAt(current, playerPosition.x, nextZ, brokenPropIds)) playerPosition.z = nextZ
        avatar.rotation.y = Math.atan2(move.x, move.z)
      }
      playerPosition.y = floorHeightAt(current, playerPosition.x, playerPosition.z)
      avatar.position.lerp(playerPosition, 1 - Math.exp(-20 * dt))
      camera.position.lerp(playerPosition.clone().add(CAMERA_OFFSET), 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt))
      if (cameraShake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * cameraShake
        camera.position.y += (Math.random() - 0.5) * cameraShake * 0.55
        camera.position.z += (Math.random() - 0.5) * cameraShake
        cameraShake *= Math.exp(-15 * dt)
      }
      cameraFocus.lerp(focusTarget(), 1 - Math.exp(-CAMERA_FOCUS_RATE * dt))
      camera.lookAt(cameraFocus)
    }

    const updateDestruction = (dt: number) => {
      for (const runtime of destructibles.values()) {
        if (!brokenPropIds.has(runtime.prop.id)) continue
        for (const mesh of runtime.meshes) {
          const velocity = mesh.userData.breakVelocity as THREE.Vector3 | undefined
          const angular = mesh.userData.breakAngular as THREE.Vector3 | undefined
          if (!velocity || !angular || !mesh.visible) continue
          const age = Number(mesh.userData.breakAge ?? 0) + dt
          mesh.userData.breakAge = age
          if (age >= runtime.definition.fragmentLifetime) { mesh.visible = false; continue }
          velocity.y -= 9.8 * dt
          mesh.position.addScaledVector(velocity, dt)
          mesh.rotation.x += angular.x * dt
          mesh.rotation.y += angular.y * dt
          mesh.rotation.z += angular.z * dt
          const floorRadius = Number(mesh.userData.breakFloorRadius ?? 0.06)
          if (mesh.position.y < floorRadius && velocity.y < 0) {
            mesh.position.y = floorRadius
            velocity.y *= -runtime.definition.bounce
            velocity.x *= 0.76
            velocity.z *= 0.76
            angular.multiplyScalar(0.84)
          }
        }
      }
      for (let index = dust.length - 1; index >= 0; index -= 1) {
        const particle = dust[index]
        particle.life -= dt
        particle.velocity.y -= 4.2 * dt
        particle.mesh.position.addScaledVector(particle.velocity, dt)
        particle.mesh.rotation.x += dt * 3
        particle.mesh.rotation.y += dt * 2
        const material = particle.mesh.material as THREE.MeshBasicMaterial
        material.opacity = Math.max(0, particle.life / particle.totalLife) * 0.34
        if (particle.life <= 0) { disposeObject(particle.mesh); dust.splice(index, 1) }
      }
      for (const drop of lootDrops) drop.rotation.y += dt * 1.8
    }

    const ensureFadeMaterial = (mesh: THREE.Mesh) => {
      if (mesh.userData.arpgFadeMaterial) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone()
      mesh.userData.arpgFadeMaterial = true
      mesh.userData.arpgOriginalCastShadow = mesh.castShadow
    }
    const setOpacity = (mesh: THREE.Mesh, opacity: number) => {
      ensureFadeMaterial(mesh)
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const transparent = opacity < 0.995
      for (const material of materials) {
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true }
        material.opacity = opacity; material.depthWrite = !transparent
      }
      mesh.castShadow = transparent ? false : Boolean(mesh.userData.arpgOriginalCastShadow)
    }
    const isOccluder = (mesh: THREE.Mesh) => {
      if (mesh.userData.arpgOccluder) return true
      if (!mesh.userData.roomId) return false
      mesh.geometry.computeBoundingBox()
      const box = mesh.geometry.boundingBox
      if (!box) return false
      const size = new THREE.Vector3(); box.getSize(size)
      return size.y > 0.52
    }
    const blockedOccluders = () => {
      const hits = new Set<THREE.Mesh>()
      const targets = [-0.56, 0, 0.56].map((offset) => playerPosition.clone().addScaledVector(cameraRight, offset).add(new THREE.Vector3(0, 0.78, 0)))
      targets.push(playerPosition.clone().add(new THREE.Vector3(0, 1.35, 0)))
      for (const target of targets) {
        const direction = target.clone().sub(camera.position), distance = direction.length()
        if (distance < 0.1) continue
        direction.normalize(); occlusionRay.set(camera.position, direction); occlusionRay.near = 0.08; occlusionRay.far = Math.max(0.1, distance - 0.38)
        for (const hit of occlusionRay.intersectObjects(world.children, true)) {
          const mesh = hit.object as THREE.Mesh
          if (!mesh.isMesh || !isOccluder(mesh)) continue
          hits.add(mesh); if (hits.size >= 16) break
        }
      }
      return hits
    }
    const updateOcclusion = (dt: number) => {
      const blocked = blockedOccluders(), fadeOut = 1 - Math.exp(-13 * dt), fadeIn = 1 - Math.exp(-8 * dt)
      for (const mesh of blocked) {
        const next = THREE.MathUtils.lerp(fadedOccluders.get(mesh) ?? 1, OCCLUDER_OPACITY, fadeOut)
        setOpacity(mesh, next); fadedOccluders.set(mesh, next)
      }
      for (const [mesh, current] of [...fadedOccluders.entries()]) {
        if (blocked.has(mesh)) continue
        const next = THREE.MathUtils.lerp(current, 1, fadeIn)
        if (next >= 0.995) { setOpacity(mesh, 1); fadedOccluders.delete(mesh) }
        else { setOpacity(mesh, next); fadedOccluders.set(mesh, next) }
      }
    }

    let frame = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now
      const current = valueRef.current
      const signature = JSON.stringify([current.theme, current.rooms, current.corridors, current.markers, current.logic, dungeonProps(current), current.settings])
      if (signature !== lastSignature) { lastSignature = signature; rebuild() }
      if (!playerInitialized) spawnPlayer(current)
      const frozen = now < breakFreezeUntil
      if (!frozen) { updatePlayer(dt); updateDestruction(dt) }
      const seconds = now * 0.001
      for (const entry of flickerLights) {
        const noise = Math.sin(seconds * entry.speed + entry.phase) * 0.09 + Math.sin(seconds * entry.speed * 2.17 + entry.phase * 0.41) * 0.035
        entry.light.intensity = entry.base * (1 + noise)
      }
      updateOcclusion(dt); renderer.render(scene, camera); frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect()
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      disposeObject(world); disposeObject(avatar); renderer.dispose(); renderer.domElement.remove()
    }
  }, [])

  return <div className="dungeon-viewport-canvas map-arpg-active">
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    <div className="map-arpg-overlay"><div className="map-walk-help"><strong>ARPG CAMERA</strong><span>WASD move · Shift sprint · Left click / Space / F smash destructibles · foreground walls fade</span></div></div>
  </div>
}

function markOccluder(mesh: THREE.Mesh) { mesh.userData.arpgOccluder = true; return mesh }

function addBaseRoom(parent: THREE.Group, room: DungeonRoom, wallThickness: number, openings: RoomOpening[], atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) {
  const group = new THREE.Group(); group.position.set(room.x, room.floorLevel, room.z); group.rotation.y = THREE.MathUtils.degToRad(room.rotation); parent.add(group)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.18, room.depth), new THREE.MeshStandardMaterial({ color: tintRoomFloor(atmosphere.floor, room.type, atmosphere), roughness: crypt ? 0.8 : 0.62, metalness: 0.02 }))
  floor.position.y = 0.09; floor.receiveShadow = true; group.add(floor)
  const wallMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: crypt ? 0.93 : 0.86, metalness: 0.01 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.96 })
  for (const side of ['north','south','west','east'] as Side[]) addWallWithOpenings(group, room, side, openings.filter((opening) => opening.side === side), Math.max(0.12, wallThickness), wallMaterial, darkMaterial)
  if (!crypt) {
    const inset = 0.16
    for (const [x,z] of [[-room.width/2+inset,-room.depth/2+inset],[room.width/2-inset,-room.depth/2+inset],[-room.width/2+inset,room.depth/2-inset],[room.width/2-inset,room.depth/2-inset]] as Array<[number,number]>) {
      const column = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.36, room.height, 0.36), darkMaterial)); column.position.set(x, room.height/2, z); column.castShadow = true; column.receiveShadow = true; group.add(column)
    }
  }
  addRoomLights(group, room, atmosphere, flickerLights, crypt)
}

function addWallWithOpenings(group: THREE.Group, room: DungeonRoom, side: Side, openings: RoomOpening[], thickness: number, material: THREE.Material, darkMaterial: THREE.Material) {
  const horizontal = side === 'north' || side === 'south', total = horizontal ? room.width : room.depth, half = total / 2
  const intervals = mergeIntervals(openings.map((opening) => ({ start: Math.max(-half, opening.offset-opening.openingWidth/2), end: Math.min(half, opening.offset+opening.openingWidth/2) })))
  const doorHeight = Math.min(2.45, Math.max(1.9, room.height-0.4)); let cursor = -half
  for (const interval of intervals) {
    addWallSegment(group, room, side, cursor, interval.start, thickness, room.height, material, darkMaterial)
    const openingLength = interval.end-interval.start
    if (openingLength > 0.05 && room.height > doorHeight+0.12) {
      const lintelHeight = room.height-doorHeight, center = (interval.start+interval.end)/2
      const lintel = markOccluder(horizontal ? new THREE.Mesh(new THREE.BoxGeometry(openingLength,lintelHeight,thickness),material) : new THREE.Mesh(new THREE.BoxGeometry(thickness,lintelHeight,openingLength),material))
      if (horizontal) lintel.position.set(center,doorHeight+lintelHeight/2,(side==='south'?1:-1)*room.depth/2)
      else lintel.position.set((side==='east'?1:-1)*room.width/2,doorHeight+lintelHeight/2,center)
      lintel.castShadow=true; lintel.receiveShadow=true; group.add(lintel)
    }
    cursor=interval.end
  }
  addWallSegment(group,room,side,cursor,half,thickness,room.height,material,darkMaterial)
}
function addWallSegment(group: THREE.Group, room: DungeonRoom, side: Side, start: number, end: number, thickness: number, height: number, material: THREE.Material, darkMaterial: THREE.Material) {
  const length=end-start; if(length<=0.04)return
  const horizontal=side==='north'||side==='south', center=(start+end)/2
  const wall=markOccluder(horizontal?new THREE.Mesh(new THREE.BoxGeometry(length,height,thickness),material):new THREE.Mesh(new THREE.BoxGeometry(thickness,height,length),material))
  if(horizontal)wall.position.set(center,height/2,(side==='south'?1:-1)*room.depth/2);else wall.position.set((side==='east'?1:-1)*room.width/2,height/2,center)
  wall.castShadow=true;wall.receiveShadow=true;group.add(wall)
  const base=markOccluder(horizontal?new THREE.Mesh(new THREE.BoxGeometry(length,.26,thickness+.08),darkMaterial):new THREE.Mesh(new THREE.BoxGeometry(thickness+.08,.26,length),darkMaterial));base.position.copy(wall.position);base.position.y=.13;group.add(base)
}

function addRoomLights(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) {
  const y=Math.min(1.72,room.height*.55), positions:Array<[number,number,number]>=[[-room.width/2+.38,y,-room.depth*.22],[room.width/2-.38,y,room.depth*.22]]
  positions.forEach(([x,py,z],index)=>{
    const bracket=new THREE.Mesh(new THREE.BoxGeometry(.08,.48,.08),new THREE.MeshStandardMaterial({color:0x28221f,roughness:.72,metalness:.34}));bracket.position.set(x,py-.22,z);bracket.rotation.z=x<0?-.34:.34;group.add(bracket)
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshStandardMaterial({color:atmosphere.torch,emissive:atmosphere.torch,emissiveIntensity:crypt?2.05:2.4,roughness:.3}));flame.scale.set(.78,1.55,.78);flame.position.set(x,py+.13,z);group.add(flame)
    if(index===0||room.type==='boss'||room.type==='elite'){const base=atmosphere.torchIntensity*(crypt?.66:.88),light=new THREE.PointLight(atmosphere.torch,base,crypt?11.5:9.5,crypt?1.55:1.75);light.position.copy(flame.position);group.add(light);flickerLights.push({light,base,phase:Math.random()*Math.PI*2,speed:5.2+Math.random()*1.6})}
  })
  const accent=roomAccent(room.type,atmosphere);if(accent!==undefined){const light=new THREE.PointLight(accent,room.type==='boss'?1.45:.72,room.type==='boss'?Math.max(room.width,room.depth)*.82:5.8,1.9);light.position.set(0,1.15,0);group.add(light)}
}

function addBaseCorridor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number, atmosphere: DungeonAtmosphere) {
  const floorMaterial=new THREE.MeshStandardMaterial({color:atmosphere.corridorFloor,roughness:.8,metalness:.02}),wallMaterial=new THREE.MeshStandardMaterial({color:atmosphere.corridorWall,roughness:.93});const mid={x:to.x,z:from.z}
  addCorridorSegment(parent,from.x,from.z,mid.x,mid.z,width,floorMaterial,wallMaterial);addCorridorSegment(parent,mid.x,mid.z,to.x,to.z,width,floorMaterial,wallMaterial)
}
function addCorridorSegment(parent: THREE.Group,x1:number,z1:number,x2:number,z2:number,width:number,floorMaterial:THREE.Material,wallMaterial:THREE.Material){const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);if(length<.25)return;const angle=Math.atan2(dx,dz),floor=new THREE.Mesh(new THREE.BoxGeometry(width,.14,length),floorMaterial);floor.position.set((x1+x2)/2,.07,(z1+z2)/2);floor.rotation.y=angle;floor.receiveShadow=true;parent.add(floor);for(const side of[-1,1]){const wall=markOccluder(new THREE.Mesh(new THREE.BoxGeometry(.22,2.55,length),wallMaterial));wall.position.set(floor.position.x+Math.cos(angle)*(width/2+.11)*side,1.275,floor.position.z-Math.sin(angle)*(width/2+.11)*side);wall.rotation.y=angle;wall.castShadow=true;wall.receiveShadow=true;parent.add(wall)}}

function addBuiltinProp(parent:THREE.Group,prop:DungeonProp,atmosphere:DungeonAtmosphere,flickerLights:FlickerLight[]){const group=new THREE.Group();group.position.set(prop.x,prop.y,prop.z);group.rotation.y=THREE.MathUtils.degToRad(prop.rotationY);group.scale.setScalar(prop.scale);group.userData.propId=prop.id;parent.add(group);const stone=new THREE.MeshStandardMaterial({color:atmosphere.wall,roughness:.9}),wood=new THREE.MeshStandardMaterial({color:0x5a4030,roughness:.9}),metal=new THREE.MeshStandardMaterial({color:0x4f565c,roughness:.65,metalness:.32});const add=(object:THREE.Object3D,occluder=false)=>{object.traverse((child)=>{child.userData.propId=prop.id;const mesh=child as THREE.Mesh;if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;if(occluder)mesh.userData.arpgOccluder=true});group.add(object)};if(prop.source==='library')return group;if(prop.assetRef==='pillar'){const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.35,.42,2.6,10),stone);shaft.position.y=1.3;const base=new THREE.Mesh(new THREE.BoxGeometry(.92,.22,.92),stone);base.position.y=.11;add(shaft,true);add(base,true)}else if(prop.assetRef==='torch'){const stem=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,.8,8),wood);stem.position.y=.55;stem.rotation.z=.25;const flame=new THREE.Mesh(new THREE.SphereGeometry(.1,9,7),new THREE.MeshStandardMaterial({color:atmosphere.torch,emissive:atmosphere.torch,emissiveIntensity:2.6,roughness:.3}));flame.scale.y=1.35;flame.position.set(.1,1.02,0);const light=new THREE.PointLight(atmosphere.torch,atmosphere.torchIntensity,9,1.75);light.position.copy(flame.position);flickerLights.push({light,base:atmosphere.torchIntensity,phase:Math.random()*Math.PI*2,speed:5.8+Math.random()*2});add(stem);add(flame);group.add(light)}else if(prop.assetRef==='statue'){const base=new THREE.Mesh(new THREE.BoxGeometry(.9,.4,.9),stone);base.position.y=.2;const body=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.1,5,8),stone);body.position.y=1.25;const head=new THREE.Mesh(new THREE.SphereGeometry(.27,12,9),stone);head.position.y=2.15;add(base,true);add(body,true);add(head,true)}else if(prop.assetRef==='barrel'){const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.9,12),wood);barrel.position.y=.45;add(barrel)}else if(prop.assetRef==='crate'){const crate=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),wood);crate.position.y=.45;add(crate)}else if(prop.assetRef==='rubble'){const random=seededRandom(stringSeed(prop.id));for(let i=0;i<6;i++){const radius=.14+random()*.14,rock=new THREE.Mesh(new THREE.DodecahedronGeometry(radius,0),stone);rock.position.set((random()-.5)*1.1,radius,(random()-.5)*1.1);rock.rotation.set(random(),random(),random());add(rock)}}else{for(let i=-2;i<=2;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.12,.8,6),metal);spike.position.set(i*.25,.4,0);add(spike)}}return group}

function addMarker(parent:THREE.Group,item:DungeonMarker){const group=new THREE.Group();group.position.set(item.x,item.y,item.z);parent.add(group);if(item.type==='door'){group.rotation.y=THREE.MathUtils.degToRad(Number(item.data.yaw??0));const frame=new THREE.MeshStandardMaterial({color:0x4b382b,roughness:.85}),panelMaterial=new THREE.MeshStandardMaterial({color:0x7d5b38,roughness:.78}),panel=new THREE.Mesh(new THREE.BoxGeometry(.16,2.25,1.65),panelMaterial);panel.position.y=1.13;if(!Boolean(item.data.locked)){panel.rotation.y=Math.PI/2;panel.position.x=.82;panel.position.z=-.78}const left=new THREE.Mesh(new THREE.BoxGeometry(.24,2.55,.22),frame);left.position.set(0,1.27,-.94);const right=left.clone();right.position.z=.94;const top=new THREE.Mesh(new THREE.BoxGeometry(.24,.24,2.1),frame);top.position.set(0,2.45,0);group.add(panel,left,right,top)}else if(item.type==='portal'){const portal=new THREE.Mesh(new THREE.TorusGeometry(.62,.1,10,24),new THREE.MeshBasicMaterial({color:0x9f74ff}));portal.rotation.y=Math.PI/2;group.add(portal)}else if(item.type==='light'){const light=new THREE.PointLight(String(item.data.color??'#ffb45f'),Number(item.data.intensity??2),7,2);light.position.y=1.6;group.add(light)}else if(item.type==='enemy'){const enemy=new THREE.Mesh(new THREE.CapsuleGeometry(.24,.58,4,8),new THREE.MeshStandardMaterial({color:0x723838,roughness:.8}));enemy.position.y=.62;group.add(enemy)}else if(item.type==='loot'){const loot=new THREE.Mesh(new THREE.OctahedronGeometry(.24),new THREE.MeshStandardMaterial({color:0xc89b42,emissive:0x7d5f22,emissiveIntensity:.35}));loot.position.y=.35;group.add(loot)}else if(item.type==='trigger'){const trigger=new THREE.Mesh(new THREE.RingGeometry(Math.max(.5,(item.radius??2)-.08),item.radius??2,32),new THREE.MeshBasicMaterial({color:0x9f6a3c,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));trigger.rotation.x=-Math.PI/2;trigger.position.y=.04;group.add(trigger)}}

function spawnBreakDust(parent:THREE.Group, output:DustParticle[], prop:DungeonProp, definition:DungeonDestructible){const kind=definition.template==='crate'||definition.template==='barrel'||definition.template==='chest'?'wood':definition.template==='stone-pot'?'stone':'ceramic';const color=new THREE.Color(kind==='wood'?0x8b684d:kind==='stone'?0x899195:0x9b8776);const random=seededRandom(stringSeed(`${prop.id}-${Date.now()}`));for(let i=0;i<22;i++){const size=.025+random()*.06,mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(size,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.34,depthWrite:false}));mesh.position.set(prop.x+(random()-.5)*.7*prop.scale,prop.y+.2+random()*.75*prop.scale,prop.z+(random()-.5)*.7*prop.scale);parent.add(mesh);const life=.35+random()*.25;output.push({mesh,velocity:new THREE.Vector3((random()-.5)*2.6,.8+random()*2.2,(random()-.5)*2.6),life,totalLife:life})}}
function spawnLoot(parent:THREE.Group,prop:DungeonProp){const group=new THREE.Mesh(new THREE.OctahedronGeometry(.22*prop.scale),new THREE.MeshStandardMaterial({color:0xd9af58,emissive:0x76551f,emissiveIntensity:.75,roughness:.3,metalness:.08}));group.position.set(prop.x,prop.y+.34*prop.scale,prop.z);group.castShadow=true;group.userData.lootDrop=true;parent.add(group);return group}

function createAvatar(){const group=new THREE.Group();group.visible=false;const bodyMaterial=new THREE.MeshStandardMaterial({color:0x46545f,roughness:.66,metalness:.06,emissive:0x0a1116,emissiveIntensity:.2}),accentMaterial=new THREE.MeshStandardMaterial({color:0x9bb6c7,roughness:.5,metalness:.1,emissive:0x101a21,emissiveIntensity:.16}),body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.72,5,9),bodyMaterial);body.position.y=.86;const head=new THREE.Mesh(new THREE.SphereGeometry(.22,12,9),accentMaterial);head.position.y=1.55;const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.5,28),new THREE.MeshBasicMaterial({color:0xa9d6ee,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;body.castShadow=true;head.castShadow=true;group.add(body,head,ring);return group}
function mergeIntervals(intervals:Array<{start:number;end:number}>){const sorted=intervals.filter((item)=>item.end>item.start).sort((a,b)=>a.start-b.start),result:Array<{start:number;end:number}>=[];for(const interval of sorted){const last=result[result.length-1];if(!last||interval.start>last.end+.05)result.push({...interval});else last.end=Math.max(last.end,interval.end)}return result}
function canWalkAt(value:DungeonWithProps,x:number,z:number,broken:Set<string>){const radius=.3;if(!value.rooms.some((room)=>pointInsideRoom(room,x,z,radius))&&!pointInsideCorridor(value,x,z,radius))return false;for(const item of value.markers)if(item.type==='door'&&Boolean(item.data.locked)&&pointInsideDoor(item,x,z,radius))return false;for(const prop of dungeonProps(value))if(prop.collision&&!broken.has(prop.id)&&Math.hypot(x-prop.x,z-prop.z)<propCollisionRadius(prop)+radius)return false;return true}
function propCollisionRadius(prop:DungeonProp){const base=prop.assetRef==='pillar'?.45:prop.assetRef==='statue'?.5:prop.assetRef==='rubble'?.25:prop.assetRef==='spikes'?.55:prop.destructible?.enabled?.56:.45;return base*prop.scale}
function pointInsideRoom(room:DungeonRoom,x:number,z:number,margin:number){const dx=x-room.x,dz=z-room.z,angle=-THREE.MathUtils.degToRad(room.rotation),cos=Math.cos(angle),sin=Math.sin(angle),localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos;return Math.abs(localX)<=Math.max(.2,room.width/2-margin)&&Math.abs(localZ)<=Math.max(.2,room.depth/2-margin)}
function pointInsideCorridor(value:DungeonWithProps,x:number,z:number,margin:number){const rooms=new Map(value.rooms.map((room)=>[room.id,room]));for(const edge of value.corridors){const a=rooms.get(edge.fromRoomId),b=rooms.get(edge.toRoomId);if(!a||!b)continue;const from=getRoomConnection(a,b,edge.width),to=getRoomConnection(b,a,edge.width),midX=to.x,midZ=from.z;if(pointInsideAxisSegment(x,z,from.x,from.z,midX,midZ,edge.width,margin)||pointInsideAxisSegment(x,z,midX,midZ,to.x,to.z,edge.width,margin))return true}return false}
function pointInsideAxisSegment(x:number,z:number,x1:number,z1:number,x2:number,z2:number,width:number,margin:number){const halfWidth=Math.max(.25,width/2-margin),pad=margin+.28;if(Math.abs(z2-z1)<.05)return x>=Math.min(x1,x2)-pad&&x<=Math.max(x1,x2)+pad&&Math.abs(z-z1)<=halfWidth;if(Math.abs(x2-x1)<.05)return z>=Math.min(z1,z2)-pad&&z<=Math.max(z1,z2)+pad&&Math.abs(x-x1)<=halfWidth;return false}
function pointInsideDoor(item:DungeonMarker,x:number,z:number,margin:number){const dx=x-item.x,dz=z-item.z,angle=-THREE.MathUtils.degToRad(Number(item.data.yaw??0)),cos=Math.cos(angle),sin=Math.sin(angle),localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos;return Math.abs(localX)<=.2+margin&&Math.abs(localZ)<=.9+margin}
function floorHeightAt(value:DungeonWithProps,x:number,z:number){return value.rooms.find((room)=>pointInsideRoom(room,x,z,0))?.floorLevel??0}
function seededRandom(seed:number){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let next=state;next=Math.imul(next^next>>>15,next|1);next^=next+Math.imul(next^next>>>7,next|61);return((next^next>>>14)>>>0)/4294967296}}
function stringSeed(value:string){let seed=2166136261;for(let i=0;i<value.length;i++)seed=Math.imul(seed^value.charCodeAt(i),16777619);return seed>>>0}
function disposeMaterial(material:THREE.Material){const withMaps=material as THREE.Material&{map?:THREE.Texture|null;alphaMap?:THREE.Texture|null;emissiveMap?:THREE.Texture|null};withMaps.map?.dispose();withMaps.alphaMap?.dispose();withMaps.emissiveMap?.dispose();material.dispose()}
function disposeObject(object:THREE.Object3D){object.traverse((child)=>{const mesh=child as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();const material=mesh.material;if(Array.isArray(material))material.forEach(disposeMaterial);else if(material)disposeMaterial(material)});object.removeFromParent()}
