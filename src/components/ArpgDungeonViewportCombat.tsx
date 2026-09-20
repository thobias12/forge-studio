import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getRoomConnection, type DungeonConnection, type DungeonEncounter, type DungeonMarker, type DungeonRoom, type DungeonWall } from '../lib/dungeonPackage'
import { dungeonPropBlocksMovement, dungeonProps, type DungeonDestructible, type DungeonProp, type DungeonWithProps } from '../lib/dungeonProps'
import { dungeonAtmosphere, dungeonLightingProfile, roomAccent, tintRoomFloor, type DungeonAtmosphere } from '../lib/dungeonAtmosphere'
import { addDungeonMasonryV3, dungeonArtCollidesV3, dungeonFloorHeightV3, dungeonNavigationContainsV3, dungeonRoomContainsV3, resolveDungeonSlideV3 } from '../lib/dungeonForgeV3'
import { getAsset, listAssets } from '../lib/library'
import { definitionFromMetadata, findDestructibleRoot, isForgeDestructibleMetadata, playDestructibleBreakSound } from '../lib/destructibleAsset'
import '../arpg-combat.css'

type Props = { value: DungeonWithProps }
type RoomOpening = DungeonConnection & { corridorId: string }
type FlickerLight = { light: THREE.PointLight; base: number; phase: number; speed: number }
type Side = 'north' | 'south' | 'east' | 'west'
type CharacterChoice = { id: string; name: string; tags: string[] }
type RuntimeDestructible = { prop: DungeonProp; root: THREE.Object3D; intact: THREE.Object3D; fragments: THREE.Object3D; meshes: THREE.Mesh[]; definition: DungeonDestructible }
type DustParticle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; totalLife: number }
type RuntimeLoot = { mesh: THREE.Mesh; value: number }
type RuntimeDoor = { panel: THREE.Mesh; defaultLocked: boolean }
type RuntimeEnemyState = 'idle' | 'chase' | 'attack' | 'dead'
type RuntimeEnemy = { id: string; encounterId: string; roomId: string; root: THREE.Group; visual: THREE.Object3D; mixer?: THREE.AnimationMixer; clips: THREE.AnimationClip[]; action?: THREE.AnimationAction; animation?: string; state: RuntimeEnemyState; hp: number; maxHp: number; damage: number; speed: number; attackCooldown: number; attackTimer: number; deadTimer: number; boss: boolean; elite: boolean; lootDropped: boolean }
type RuntimeEncounter = { encounter: DungeonEncounter; active: boolean; cleared: boolean; rewardSpawned: boolean }
type AttackFx = { mesh: THREE.Mesh; life: number }
type Hud = { hp: number; maxHp: number; gold: number; encounter: string; alive: number; total: number }

const CAMERA_OFFSET = new THREE.Vector3(5.4, 15.8, 7.2)
const CAMERA_FOV = 35
const CAMERA_LOOK_AHEAD = 1.55
const CAMERA_FOLLOW_RATE = 10.5
const CAMERA_FOCUS_RATE = 8.5
const WALK_SPEED = 4.2
const SPRINT_SPEED = 7.2
const OCCLUDER_OPACITY = 0.075
const PLAYER_ATTACK_RANGE = 1.95
const PLAYER_ATTACK_DAMAGE = 42
const PLAYER_ATTACK_COOLDOWN = 0.42

export default function ArpgDungeonViewportCombat({ value }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  const [characters, setCharacters] = useState<CharacterChoice[]>([])
  const [forcedCharacterId, setForcedCharacterId] = useState(() => localStorage.getItem('forge-arpg-enemy-character') ?? '')
  const [hud, setHud] = useState<Hud>({ hp: 100, maxHp: 100, gold: 0, encounter: 'Exploring', alive: 0, total: 0 })
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => {
    let cancelled = false
    void listAssets().then((items) => {
      if (cancelled) return
      setCharacters(items.filter((item) => item.kind === 'glb' && item.category === 'characters').map((item) => ({ id: item.id, name: item.name, tags: item.tags })))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const initialAtmosphere = dungeonAtmosphere(valueRef.current.theme)
    const initialLighting = dungeonLightingProfile(initialAtmosphere, valueRef.current.settings)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(initialAtmosphere.background)
    scene.fog = new THREE.FogExp2(initialAtmosphere.fog, initialLighting.fogDensity)
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.08, 220)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = initialLighting.exposure
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight(initialAtmosphere.sky, initialAtmosphere.ground, initialLighting.ambientIntensity)
    scene.add(ambient)
    const sceneFill = new THREE.AmbientLight(initialAtmosphere.sky, initialLighting.fillIntensity)
    scene.add(sceneFill)
    const key = new THREE.DirectionalLight(initialAtmosphere.key, initialLighting.keyIntensity)
    key.position.set(12, 22, 9); key.castShadow = true; key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -36; key.shadow.camera.right = 36; key.shadow.camera.top = 36; key.shadow.camera.bottom = -36; key.shadow.camera.near = 1; key.shadow.camera.far = 76; key.shadow.bias = -0.0005
    scene.add(key)

    const world = new THREE.Group(); scene.add(world)
    const avatar = createAvatar(); avatar.scale.setScalar(1.08); scene.add(avatar)
    const readabilityLight = new THREE.PointLight(initialAtmosphere.sky, 0.34, 5.6, 2.15)
    readabilityLight.name = 'DungeonReadabilityLight'
    readabilityLight.position.set(0, 2.7, 0)
    readabilityLight.castShadow = false
    avatar.add(readabilityLight)
    const loader = new GLTFLoader()
    const keys = new Set<string>()
    const occlusionRay = new THREE.Raycaster()
    const playerPosition = new THREE.Vector3()
    const cameraFocus = new THREE.Vector3()
    const cameraForward = new THREE.Vector3(-CAMERA_OFFSET.x, 0, -CAMERA_OFFSET.z).normalize()
    const cameraRight = new THREE.Vector3(-cameraForward.z, 0, cameraForward.x)
    const flickerLights: FlickerLight[] = []
    const roomWallNodes: THREE.Object3D[] = []
    const roomWallFactor = new Map<THREE.Object3D, number>()
    const fadedOccluders = new Map<THREE.Mesh, number>()
    const destructibles = new Map<string, RuntimeDestructible>()
    const brokenPropIds = new Set<string>()
    const enemies = new Map<string, RuntimeEnemy>()
    const encounters = new Map<string, RuntimeEncounter>()
    const runtimeLockedDoorIds = new Set<string>()
    const doors = new Map<string, RuntimeDoor>()
    const dust: DustParticle[] = []
    const lootDrops: RuntimeLoot[] = []
    const attackFx: AttackFx[] = []
    let playerInitialized = false
    let playerHp = 100
    const playerMaxHp = 100
    let playerInvulnerableUntil = 0
    let playerAttackReadyAt = 0
    let gold = 0
    let lastFrame = performance.now()
    let lastSignature = ''
    let freezeUntil = 0
    let cameraShake = 0
    let lastHudUpdate = 0

    const applyAtmosphere = (current: DungeonWithProps) => {
      const atmosphere = dungeonAtmosphere(current.theme)
      const lighting = dungeonLightingProfile(atmosphere, current.settings)
      scene.background = new THREE.Color(atmosphere.background)
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(atmosphere.fog)
        scene.fog.density = lighting.fogDensity
      }
      ambient.color.setHex(atmosphere.sky)
      ambient.groundColor.setHex(atmosphere.ground)
      ambient.intensity = lighting.ambientIntensity
      sceneFill.color.setHex(atmosphere.sky)
      sceneFill.intensity = lighting.fillIntensity
      key.color.setHex(atmosphere.key)
      key.intensity = lighting.keyIntensity
      readabilityLight.color.setHex(atmosphere.sky)
      readabilityLight.intensity = current.theme === 'crypt'
        ? THREE.MathUtils.lerp(0.28, 0.42, THREE.MathUtils.clamp((lighting.brightness - 0.55) / 1.95, 0, 1))
        : 0
      renderer.toneMappingExposure = lighting.exposure
      return atmosphere
    }

    const focusTarget = () => playerPosition.clone().addScaledVector(cameraForward, CAMERA_LOOK_AHEAD).add(new THREE.Vector3(0, 0.82, 0))
    const spawnPlayer = (current: DungeonWithProps) => {
      const checkpoint = current.markers.find((item) => item.type === 'checkpoint')
      const entrance = current.rooms.find((room) => room.type === 'entrance') ?? current.rooms[0]
      if (!entrance) return
      playerPosition.set(checkpoint?.x ?? entrance.x, entrance.floorLevel, checkpoint?.z ?? entrance.z)
      avatar.position.copy(playerPosition); avatar.visible = true
      cameraFocus.copy(focusTarget()); camera.position.copy(playerPosition).add(CAMERA_OFFSET); camera.lookAt(cameraFocus); playerInitialized = true
    }

    const chooseCharacterAsset = (encounter: DungeonEncounter) => {
      const explicit = (encounter as DungeonEncounter & { enemyAssetRef?: string }).enemyAssetRef
      if (explicit) return explicit
      if (forcedCharacterId) return forcedCharacterId
      const family = encounter.family.toLowerCase()
      const species = family.includes('zombie') ? 'zombie' : family.includes('bandit') ? 'bandit' : 'skeleton'
      return characters.find((item) => item.tags.some((tag) => tag.toLowerCase() === species))?.id ?? characters[0]?.id
    }

    const loadEnemyVisual = (enemy: RuntimeEnemy, assetId?: string) => {
      if (!assetId) return
      void getAsset(assetId).then(async (asset) => {
        if (!asset || asset.kind !== 'glb' || !enemy.root.parent || enemy.state === 'dead') return
        const url = URL.createObjectURL(asset.blob)
        try {
          const gltf = await loader.loadAsync(url)
          if (!enemy.root.parent) { disposeObject(gltf.scene); return }
          disposeObject(enemy.visual)
          enemy.visual = gltf.scene
          gltf.scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true } })
          enemy.root.add(gltf.scene)
          enemy.clips = gltf.animations
          enemy.mixer = new THREE.AnimationMixer(gltf.scene)
          playEnemyAnimation(enemy, enemy.state === 'chase' ? 'Walk' : enemy.state === 'attack' ? 'Attack' : 'Idle')
        } catch { /* keep fallback enemy */ }
        finally { URL.revokeObjectURL(url) }
      }).catch(() => undefined)
    }

    const registerLibraryProp = (prop: DungeonProp, group: THREE.Group, atmosphere: DungeonAtmosphere) => {
      const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.86, transparent: true, opacity: 0.35 }))
      placeholder.position.y = 0.4; group.add(placeholder)
      void getAsset(prop.assetRef).then(async (asset) => {
        if (!asset || !group.parent || asset.kind !== 'glb') return
        const url = URL.createObjectURL(asset.blob)
        try {
          const gltf = await loader.loadAsync(url)
          if (!group.parent) { disposeObject(gltf.scene); return }
          placeholder.removeFromParent(); disposeObject(placeholder)
          gltf.scene.traverse((object) => { object.userData.propId = prop.id; const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true } })
          group.add(gltf.scene)
          const destructibleRoot = findDestructibleRoot(gltf.scene), metadata = destructibleRoot?.userData.forgeDestructible
          const definition = prop.destructible ?? (isForgeDestructibleMetadata(metadata) ? definitionFromMetadata(metadata) : undefined)
          if (!definition || !destructibleRoot) return
          const intact = destructibleRoot.getObjectByName(isForgeDestructibleMetadata(metadata) ? metadata.intactGroup ?? 'Intact' : 'Intact')
          const fragments = destructibleRoot.getObjectByName(isForgeDestructibleMetadata(metadata) ? metadata.fragmentsGroup ?? 'Fragments' : 'Fragments')
          if (!intact || !fragments) return
          const meshes: THREE.Mesh[] = []
          fragments.traverse((object) => { const mesh = object as THREE.Mesh; if (!mesh.isMesh) return; meshes.push(mesh); const bounds = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()); mesh.userData.breakFloorRadius = Math.max(0.045, Math.min(bounds.x || 0.1, bounds.y || 0.1, bounds.z || 0.1) * 0.3) })
          const broken = brokenPropIds.has(prop.id); intact.visible = !broken; fragments.visible = broken
          destructibles.set(prop.id, { prop, root: destructibleRoot, intact, fragments, meshes, definition })
        } catch { /* invalid library asset remains placeholder */ }
        finally { URL.revokeObjectURL(url) }
      }).catch(() => undefined)
    }

    const createEnemyRuntime = (encounter: DungeonEncounter, room: DungeonRoom, index: number, x: number, z: number) => {
      const root = new THREE.Group(); root.position.set(x, room.floorLevel, z); world.add(root)
      const elite = encounter.boss || seededRandom(stringSeed(`${encounter.id}-${index}`))() < encounter.eliteChance
      const material = new THREE.MeshStandardMaterial({ color: encounter.boss ? 0x7c3138 : elite ? 0x7a5437 : 0x593e3e, roughness: 0.82, emissive: encounter.boss ? 0x26080c : 0x000000, emissiveIntensity: 0.35 })
      const placeholder = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(elite ? 0.3 : 0.25, elite ? 0.78 : 0.62, 5, 8), material); body.position.y = elite ? 0.88 : 0.74; body.castShadow = true
      const head = new THREE.Mesh(new THREE.SphereGeometry(elite ? 0.23 : 0.19, 10, 8), material); head.position.y = elite ? 1.62 : 1.38; head.castShadow = true
      placeholder.add(body, head); root.add(placeholder)
      const maxHp = encounter.boss ? 190 + encounter.difficulty * 45 : (elite ? 85 : 52) * Math.max(1, encounter.difficulty * 0.86)
      const runtime: RuntimeEnemy = { id: `${encounter.id}-${index}`, encounterId: encounter.id, roomId: room.id, root, visual: placeholder, clips: [], state: 'idle', hp: maxHp, maxHp, damage: 5 + encounter.difficulty * 2.5 + (elite ? 2 : 0), speed: encounter.boss ? 1.45 : 1.65 + encounter.difficulty * 0.12, attackCooldown: encounter.boss ? 1.05 : 1.2, attackTimer: Math.random() * 0.6, deadTimer: 0, boss: encounter.boss, elite, lootDropped: false }
      enemies.set(runtime.id, runtime)
      loadEnemyVisual(runtime, chooseCharacterAsset(encounter))
    }

    const buildEncounters = (current: DungeonWithProps) => {
      const markerMap = new Map(current.markers.map((item) => [item.id, item]))
      for (const encounter of current.logic?.encounters ?? []) {
        const room = current.rooms.find((item) => item.id === encounter.roomId); if (!room) continue
        encounters.set(encounter.id, { encounter, active: false, cleared: false, rewardSpawned: false })
        const spawnMarkers = encounter.spawnMarkerIds.map((id) => markerMap.get(id)).filter((item): item is DungeonMarker => Boolean(item && item.type === 'enemy'))
        const random = seededRandom(stringSeed(`${current.seed}-${encounter.id}`))
        for (let i = 0; i < Math.min(encounter.count, encounter.boss ? 1 : 14); i += 1) {
          const marker = spawnMarkers[i % Math.max(1, spawnMarkers.length)]
          const baseX = marker?.x ?? room.x, baseZ = marker?.z ?? room.z
          const radius = encounter.boss ? 0 : 0.8 + Math.sqrt(i) * 0.72
          const angle = i * 2.399 + random() * 0.45
          const x = THREE.MathUtils.clamp(baseX + Math.cos(angle) * radius, room.x - room.width / 2 + 1, room.x + room.width / 2 - 1)
          const z = THREE.MathUtils.clamp(baseZ + Math.sin(angle) * radius, room.z - room.depth / 2 + 1, room.z + room.depth / 2 - 1)
          createEnemyRuntime(encounter, room, i, x, z)
        }
      }
    }

    const rebuild = () => {
      fadedOccluders.clear(); roomWallNodes.length = 0; roomWallFactor.clear(); destructibles.clear(); enemies.clear(); encounters.clear(); runtimeLockedDoorIds.clear(); doors.clear()
      for (const particle of dust.splice(0)) disposeObject(particle.mesh)
      for (const drop of lootDrops.splice(0)) disposeObject(drop.mesh)
      for (const fx of attackFx.splice(0)) disposeObject(fx.mesh)
      while (world.children.length) disposeObject(world.children.pop()!)
      flickerLights.length = 0
      const current = valueRef.current, atmosphere = applyAtmosphere(current), useV3 = current.theme === 'crypt'
      const roomMap = new Map(current.rooms.map((room) => [room.id, room])), openings = new Map<string, RoomOpening[]>()
      const addOpening = (roomId: string, opening: RoomOpening) => openings.set(roomId, [...(openings.get(roomId) ?? []), opening])
      for (const edge of current.corridors) {
        const fromRoom = roomMap.get(edge.fromRoomId), toRoom = roomMap.get(edge.toRoomId); if (!fromRoom || !toRoom) continue
        const from = getRoomConnection(fromRoom, toRoom, edge.width), to = getRoomConnection(toRoom, fromRoom, edge.width)
        addOpening(fromRoom.id, { ...from, corridorId: edge.id }); addOpening(toRoom.id, { ...to, corridorId: edge.id })
        if (!useV3) addBaseCorridor(world, from, to, edge.width, atmosphere)
      }
      if (useV3) addDungeonMasonryV3(world, current, atmosphere, flickerLights, 'arpg')
      for (const room of current.rooms) {
        if (useV3) continue
        const roomOpenings = openings.get(room.id) ?? []
        addBaseRoom(world, room, current.settings.wallThickness, roomOpenings, atmosphere, flickerLights, false)
      }
      for (const wall of current.walls ?? []) addRuntimeWall(world, wall, atmosphere)
      world.traverse((object) => {
        const roomId = inheritedRuntimeData(object, 'roomId')
        const sides = runtimeWallSides(object)
        if (!roomId || !sides.length || object === world) return
        const parentRoomId = object.parent ? inheritedRuntimeData(object.parent, 'roomId') : undefined
        const parentSides = object.parent ? runtimeWallSides(object.parent) : []
        if (parentRoomId === roomId && parentSides.length) return
        roomWallNodes.push(object)
      })
      for (const prop of dungeonProps(current)) { const group = addBuiltinProp(world, prop, atmosphere, flickerLights); if (prop.source === 'library') registerLibraryProp(prop, group, atmosphere) }
      for (const item of current.markers) {
        if (['enemy', 'trigger', 'checkpoint', 'door'].includes(item.type)) continue
        if (item.type === 'loot' && Boolean(item.data.requiresClear)) continue
        addMarker(world, item, doors)
      }
      buildEncounters(current)
      if (!playerInitialized || !canWalkAt(current, playerPosition.x, playerPosition.z, brokenPropIds, runtimeLockedDoorIds)) spawnPlayer(current)
    }
    rebuild()

    const resize = () => { const rect = host.getBoundingClientRect(); if (!rect.width || !rect.height) return; renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix() }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize()

    const breakDestructible = (runtime: RuntimeDestructible) => {
      if (brokenPropIds.has(runtime.prop.id)) return
      brokenPropIds.add(runtime.prop.id); runtime.intact.visible = false; runtime.fragments.visible = true
      const random = seededRandom(stringSeed(`${runtime.prop.id}-${Date.now()}`))
      for (const mesh of runtime.meshes) { const outward = mesh.position.clone(); outward.y = Math.max(0.18, outward.y * 0.32 + 0.25); if (outward.lengthSq() < 0.001) outward.set(random() - 0.5, 0.3, random() - 0.5); outward.normalize(); const power = runtime.definition.impulse * (0.62 + random() * 0.7); mesh.userData.breakVelocity = outward.multiplyScalar(power).add(new THREE.Vector3((random() - 0.5) * 1.6, 1.1 + random() * 1.9, (random() - 0.5) * 1.6)); mesh.userData.breakAngular = new THREE.Vector3((random() - 0.5) * 8, (random() - 0.5) * 9, (random() - 0.5) * 8); mesh.userData.breakAge = 0; mesh.visible = true }
      spawnBreakDust(world, dust, runtime.prop, runtime.definition)
      if (runtime.definition.lootEnabled && Math.random() <= runtime.definition.lootChance) lootDrops.push(spawnLoot(world, runtime.prop.x, runtime.prop.y + 0.34 * runtime.prop.scale, runtime.prop.z, 1 + Math.floor(Math.random() * 4)))
      playDestructibleBreakSound(runtime.definition.template); freezeUntil = performance.now() + 38; cameraShake = Math.max(cameraShake, 0.105)
    }

    const killEnemy = (enemy: RuntimeEnemy) => {
      if (enemy.state === 'dead') return
      enemy.state = 'dead'; enemy.deadTimer = 0; playEnemyAnimation(enemy, 'Death', true); cameraShake = Math.max(cameraShake, enemy.boss ? 0.2 : 0.08)
      if (!enemy.lootDropped && Math.random() < (enemy.boss ? 1 : enemy.elite ? 0.55 : 0.22)) { enemy.lootDropped = true; lootDrops.push(spawnLoot(world, enemy.root.position.x, enemy.root.position.y + 0.35, enemy.root.position.z, enemy.boss ? 25 : enemy.elite ? 7 : 3)) }
    }

    const hitEnemy = (enemy: RuntimeEnemy, damage: number) => { if (enemy.state === 'dead') return; enemy.hp -= damage; spawnHitFx(world, enemy.root.position); if (enemy.hp <= 0) killEnemy(enemy); else cameraShake = Math.max(cameraShake, 0.045) }

    const smashInAttackArc = () => {
      const facing = new THREE.Vector3(Math.sin(avatar.rotation.y), 0, Math.cos(avatar.rotation.y)); let best: RuntimeDestructible | undefined; let score = Infinity
      for (const runtime of destructibles.values()) { if (brokenPropIds.has(runtime.prop.id)) continue; const delta = new THREE.Vector3(runtime.prop.x - playerPosition.x, 0, runtime.prop.z - playerPosition.z); const distance = delta.length(); if (distance > 1.9 + runtime.prop.scale * 0.45) continue; const dot = distance > 0.001 ? facing.dot(delta.normalize()) : 1; if (dot < -0.15) continue; const next = distance - dot * 0.3; if (next < score) { score = next; best = runtime } }
      if (best) breakDestructible(best)
    }

    const performAttack = () => {
      const now = performance.now() * 0.001; if (!playerInitialized || now < playerAttackReadyAt) return
      playerAttackReadyAt = now + PLAYER_ATTACK_COOLDOWN; spawnAttackArc(world, attackFx, playerPosition, avatar.rotation.y); freezeUntil = Math.max(freezeUntil, performance.now() + 22)
      const facing = new THREE.Vector3(Math.sin(avatar.rotation.y), 0, Math.cos(avatar.rotation.y)); let best: RuntimeEnemy | undefined; let score = Infinity
      for (const enemy of enemies.values()) { if (enemy.state === 'dead') continue; const encounter = encounters.get(enemy.encounterId); if (!encounter?.active) continue; const delta = enemy.root.position.clone().sub(playerPosition); delta.y = 0; const distance = delta.length(); if (distance > PLAYER_ATTACK_RANGE + (enemy.boss ? 0.35 : 0)) continue; const dot = distance > 0.001 ? facing.dot(delta.normalize()) : 1; if (dot < -0.18) continue; const next = distance - dot * 0.45; if (next < score) { score = next; best = enemy } }
      if (best) hitEnemy(best, PLAYER_ATTACK_DAMAGE * (best.boss ? 0.82 : 1)); smashInAttackArc()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.code === 'Space' || event.code === 'KeyF') && !event.repeat) { performAttack(); event.preventDefault(); return }
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return
      keys.add(event.code); event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code)
    const onBlur = () => keys.clear()
    const onPointerDown = (event: PointerEvent) => { if (event.button === 0) { performAttack(); event.preventDefault() } }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur); renderer.domElement.addEventListener('pointerdown', onPointerDown)

    const updatePlayer = (dt: number) => {
      const current = valueRef.current, forwardAmount = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), rightAmount = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      if (forwardAmount || rightAmount) { const move = cameraForward.clone().multiplyScalar(forwardAmount).add(cameraRight.clone().multiplyScalar(rightAmount)); if (move.lengthSq() > 1) move.normalize(); move.multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED) * dt); const resolved=resolveDungeonSlideV3(playerPosition.x,playerPosition.z,move.x,move.z,(x,z)=>canWalkAt(current,x,z,brokenPropIds,runtimeLockedDoorIds)); playerPosition.x=resolved.x; playerPosition.z=resolved.z; avatar.rotation.y = Math.atan2(move.x, move.z) }
      playerPosition.y = floorHeightAt(current, playerPosition.x, playerPosition.z); avatar.position.lerp(playerPosition, 1 - Math.exp(-20 * dt)); camera.position.lerp(playerPosition.clone().add(CAMERA_OFFSET), 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt))
      if (cameraShake > 0.001) { camera.position.x += (Math.random() - 0.5) * cameraShake; camera.position.y += (Math.random() - 0.5) * cameraShake * 0.55; camera.position.z += (Math.random() - 0.5) * cameraShake; cameraShake *= Math.exp(-15 * dt) }
      cameraFocus.lerp(focusTarget(), 1 - Math.exp(-CAMERA_FOCUS_RATE * dt)); camera.lookAt(cameraFocus)
    }

    const activateEncounters = (current: DungeonWithProps) => {
      for (const state of encounters.values()) {
        if (state.active || state.cleared) continue
        const room = current.rooms.find((item) => item.id === state.encounter.roomId); if (!room) continue
        let activate = state.encounter.trigger === 'room-enter' ? pointInsideRoom(room, playerPosition.x, playerPosition.z, 0) : false
        if (!activate && state.encounter.triggerMarkerId) { const marker = current.markers.find((item) => item.id === state.encounter.triggerMarkerId); if (marker) activate = Math.hypot(playerPosition.x - marker.x, playerPosition.z - marker.z) <= (marker.radius ?? 2) }
        if (!activate) continue
        state.active = true; for (const id of state.encounter.lockDoorIds) runtimeLockedDoorIds.add(id)
      }
    }

    const damagePlayer = (amount: number, nowMs: number) => {
      if (nowMs < playerInvulnerableUntil) return
      playerInvulnerableUntil = nowMs + 480; playerHp = Math.max(0, playerHp - amount); cameraShake = Math.max(cameraShake, 0.13)
      if (playerHp <= 0) { playerHp = playerMaxHp; spawnPlayer(valueRef.current); playerInvulnerableUntil = nowMs + 900; cameraShake = 0.28 }
    }

    const updateEnemies = (dt: number, nowMs: number) => {
      const current = valueRef.current; activateEncounters(current)
      for (const enemy of enemies.values()) {
        enemy.mixer?.update(dt)
        const encounterState = encounters.get(enemy.encounterId)
        if (enemy.state === 'dead') { enemy.deadTimer += dt; if (enemy.deadTimer > 1.45) enemy.root.visible = false; continue }
        if (!encounterState?.active || encounterState.cleared) { setEnemyState(enemy, 'idle'); continue }
        const room = current.rooms.find((item) => item.id === enemy.roomId); if (!room) continue
        const delta = playerPosition.clone().sub(enemy.root.position); delta.y = 0; const distance = delta.length(); enemy.attackTimer -= dt
        if (distance <= (enemy.boss ? 1.35 : 1.05)) {
          setEnemyState(enemy, 'attack'); enemy.root.rotation.y = Math.atan2(delta.x, delta.z)
          if (enemy.attackTimer <= 0) { enemy.attackTimer = enemy.attackCooldown; damagePlayer(enemy.damage, nowMs) }
        } else {
          setEnemyState(enemy, 'chase'); if (distance > 0.001) { delta.normalize(); const nextX = enemy.root.position.x + delta.x * enemy.speed * dt, nextZ = enemy.root.position.z + delta.z * enemy.speed * dt; if (pointInsideRoom(room, nextX, nextZ, 0.45)) { enemy.root.position.x = nextX; enemy.root.position.z = nextZ } enemy.root.rotation.y = Math.atan2(delta.x, delta.z) }
        }
      }
      for (const state of encounters.values()) {
        if (!state.active || state.cleared) continue
        const members = [...enemies.values()].filter((enemy) => enemy.encounterId === state.encounter.id), alive = members.filter((enemy) => enemy.state !== 'dead')
        if (members.length && !alive.length) { state.cleared = true; state.active = false; for (const id of state.encounter.lockDoorIds) runtimeLockedDoorIds.delete(id); if (!state.rewardSpawned) { state.rewardSpawned = true; for (const markerId of state.encounter.rewardMarkerIds) { const marker = current.markers.find((item) => item.id === markerId); if (marker) lootDrops.push(spawnLoot(world, marker.x, marker.y + 0.2, marker.z, state.encounter.boss ? 30 : 8)) } } }
      }
    }

    const updateDoors = () => { for (const [id, runtime] of doors) { const locked = runtime.defaultLocked || runtimeLockedDoorIds.has(id); runtime.panel.rotation.y = locked ? 0 : Math.PI / 2; runtime.panel.position.x = locked ? 0 : 0.82; runtime.panel.position.z = locked ? 0 : -0.78 } }

    const updateDestruction = (dt: number) => {
      for (const runtime of destructibles.values()) if (brokenPropIds.has(runtime.prop.id)) for (const mesh of runtime.meshes) { const velocity = mesh.userData.breakVelocity as THREE.Vector3 | undefined, angular = mesh.userData.breakAngular as THREE.Vector3 | undefined; if (!velocity || !angular || !mesh.visible) continue; const age = Number(mesh.userData.breakAge ?? 0) + dt; mesh.userData.breakAge = age; if (age >= runtime.definition.fragmentLifetime) { mesh.visible = false; continue } velocity.y -= 9.8 * dt; mesh.position.addScaledVector(velocity, dt); mesh.rotation.x += angular.x * dt; mesh.rotation.y += angular.y * dt; mesh.rotation.z += angular.z * dt; const floorRadius = Number(mesh.userData.breakFloorRadius ?? 0.06); if (mesh.position.y < floorRadius && velocity.y < 0) { mesh.position.y = floorRadius; velocity.y *= -runtime.definition.bounce; velocity.x *= 0.76; velocity.z *= 0.76; angular.multiplyScalar(0.84) } }
      for (let i = dust.length - 1; i >= 0; i--) { const particle = dust[i]; particle.life -= dt; particle.velocity.y -= 4.2 * dt; particle.mesh.position.addScaledVector(particle.velocity, dt); particle.mesh.rotation.x += dt * 3; particle.mesh.rotation.y += dt * 2; (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, particle.life / particle.totalLife) * 0.34; if (particle.life <= 0) { disposeObject(particle.mesh); dust.splice(i, 1) } }
      for (let i = lootDrops.length - 1; i >= 0; i--) { const drop = lootDrops[i]; drop.mesh.rotation.y += dt * 1.8; drop.mesh.position.y += Math.sin(performance.now() * 0.004 + i) * 0.0008; if (Math.hypot(drop.mesh.position.x - playerPosition.x, drop.mesh.position.z - playerPosition.z) < 0.72) { gold += drop.value; disposeObject(drop.mesh); lootDrops.splice(i, 1) } }
      for (let i = attackFx.length - 1; i >= 0; i--) { const fx = attackFx[i]; fx.life -= dt; const material = fx.mesh.material as THREE.MeshBasicMaterial; material.opacity = Math.max(0, fx.life / 0.16) * 0.5; fx.mesh.scale.multiplyScalar(1 + dt * 3); if (fx.life <= 0) { disposeObject(fx.mesh); attackFx.splice(i, 1) } }
    }

    const ensureRoomWallTransform = (object: THREE.Object3D) => {
      if (object.userData.arpgWallBaseY === undefined) {
        object.userData.arpgWallBaseY = object.position.y
        object.userData.arpgWallBaseScaleY = object.scale.y
      }
      object.traverse((child) => {
        const light = child as THREE.PointLight
        if (!light.isPointLight) return
        if (light.userData.arpgWallBaseIntensity === undefined) {
          light.userData.arpgWallBaseIntensity = light.intensity
        }
      })
    }

    const setRoomWallFactor = (object: THREE.Object3D, factor: number) => {
      ensureRoomWallTransform(object)
      const baseY = Number(object.userData.arpgWallBaseY ?? object.position.y)
      const baseScaleY = Number(object.userData.arpgWallBaseScaleY ?? object.scale.y)
      object.position.y = baseY * factor
      object.scale.y = baseScaleY * factor
      object.traverse((child) => {
        const light = child as THREE.PointLight
        if (!light.isPointLight) return
        const baseIntensity = Number(light.userData.arpgWallBaseIntensity ?? light.intensity)
        light.intensity = baseIntensity * THREE.MathUtils.lerp(0.1, 1, factor)
      })
    }

    const updateRoomCutaway = (dt: number) => {
      const current = valueRef.current
      const activeRoom = current.rooms.find((room) => pointInsideRoom(room, playerPosition.x, playerPosition.z, 0))
      const cutSides = activeRoom ? roomSidesFacingCamera(activeRoom, camera.position) : undefined

      for (const object of roomWallNodes) {
        const roomId = String(inheritedRuntimeData(object, 'roomId') ?? '')
        const room = current.rooms.find((item) => item.id === roomId)
        let target = 1
        if (activeRoom && room?.id === activeRoom.id && cutSides) {
          const sides = runtimeWallSides(object)
          if (sides.some((side) => cutSides.has(side))) {
            target = THREE.MathUtils.clamp(1.02 / Math.max(1, activeRoom.height), 0.16, 0.38)
          }
        }
        const currentFactor = roomWallFactor.get(object) ?? 1
        const speed = target < currentFactor ? 16 : 10
        const next = THREE.MathUtils.lerp(currentFactor, target, 1 - Math.exp(-speed * dt))
        setRoomWallFactor(object, next)
        if (target === 1 && next >= 0.998) roomWallFactor.delete(object)
        else roomWallFactor.set(object, next)
      }
    }

    const ensureFadeMaterial = (mesh: THREE.Mesh) => { if (mesh.userData.arpgFadeMaterial) return; mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone(); mesh.userData.arpgFadeMaterial = true; mesh.userData.arpgOriginalCastShadow = mesh.castShadow }
    const setOpacity = (mesh: THREE.Mesh, opacity: number) => { ensureFadeMaterial(mesh); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material], transparent = opacity < 0.995; for (const material of materials) { if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true } material.opacity = opacity; material.depthWrite = !transparent } mesh.castShadow = transparent ? false : Boolean(mesh.userData.arpgOriginalCastShadow) }
    const isOccluder = (mesh: THREE.Mesh) => { if (mesh.userData.arpgOccluder) return true; if (!mesh.userData.roomId) return false; mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox; if (!box) return false; const size = new THREE.Vector3(); box.getSize(size); return size.y > 0.52 }
    const blockedOccluders = () => {
      const hits = new Set<THREE.Mesh>()
      const targets = [-0.56, 0, 0.56].map((offset) => playerPosition.clone().addScaledVector(cameraRight, offset).add(new THREE.Vector3(0, 0.78, 0)))
      targets.push(playerPosition.clone().add(new THREE.Vector3(0, 1.35, 0)))
      for (const target of targets) {
        const direction = target.clone().sub(camera.position), distance = direction.length()
        if (distance < 0.1) continue
        direction.normalize()
        occlusionRay.set(camera.position, direction)
        occlusionRay.near = 0.08
        occlusionRay.far = Math.max(0.1, distance - 0.38)
        for (const hit of occlusionRay.intersectObjects(world.children, true)) {
          const mesh = hit.object as THREE.Mesh
          if (!mesh.isMesh || !isOccluder(mesh)) continue
          hits.add(mesh)
          if (hits.size >= 24) break
        }
      }

      return hits
    }
    const updateOcclusion = (dt: number) => { const blocked = blockedOccluders(), fadeOut = 1 - Math.exp(-13 * dt), fadeIn = 1 - Math.exp(-8 * dt); for (const mesh of blocked) { const next = THREE.MathUtils.lerp(fadedOccluders.get(mesh) ?? 1, OCCLUDER_OPACITY, fadeOut); setOpacity(mesh, next); fadedOccluders.set(mesh, next) } for (const [mesh, current] of [...fadedOccluders.entries()]) { if (blocked.has(mesh)) continue; const next = THREE.MathUtils.lerp(current, 1, fadeIn); if (next >= 0.995) { setOpacity(mesh, 1); fadedOccluders.delete(mesh) } else { setOpacity(mesh, next); fadedOccluders.set(mesh, next) } } }

    const updateHud = (now: number) => {
      if (now - lastHudUpdate < 90) return; lastHudUpdate = now
      const active = [...encounters.values()].find((item) => item.active) ?? [...encounters.values()].find((item) => !item.cleared)
      const members = active ? [...enemies.values()].filter((enemy) => enemy.encounterId === active.encounter.id) : []
      const alive = members.filter((enemy) => enemy.state !== 'dead').length
      setHud({ hp: Math.round(playerHp), maxHp: playerMaxHp, gold, encounter: active ? active.encounter.name : 'Exploring', alive, total: members.length })
    }

    let frame = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now
      const current = valueRef.current, signature = JSON.stringify([current.theme, current.rooms, current.corridors, current.walls ?? [], current.markers, current.logic, dungeonProps(current), current.settings, forcedCharacterId, characters.map((item) => item.id)])
      if (signature !== lastSignature) { lastSignature = signature; rebuild() }
      if (!playerInitialized) spawnPlayer(current)
      const frozen = now < freezeUntil
      if (!frozen) { updatePlayer(dt); updateEnemies(dt, now); updateDestruction(dt); updateDoors() }
      const seconds = now * 0.001
      for (const entry of flickerLights) { const noise = Math.sin(seconds * entry.speed + entry.phase) * 0.09 + Math.sin(seconds * entry.speed * 2.17 + entry.phase * 0.41) * 0.035; entry.light.intensity = entry.base * (1 + noise) }
      updateRoomCutaway(dt); updateOcclusion(dt); updateHud(now); renderer.render(scene, camera); frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      for (const enemy of enemies.values()) enemy.mixer?.stopAllAction()
      disposeObject(world); disposeObject(avatar); renderer.dispose(); renderer.domElement.remove()
    }
  }, [characters, forcedCharacterId])

  const selectCharacter = (id: string) => { setForcedCharacterId(id); if (id) localStorage.setItem('forge-arpg-enemy-character', id); else localStorage.removeItem('forge-arpg-enemy-character') }
  const hpPct = Math.max(0, Math.min(100, hud.hp / hud.maxHp * 100))
  return <div className="dungeon-viewport-canvas map-arpg-active">
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
    <div className="arpg-combat-hud">
      <div className="arpg-player-card"><div className="arpg-hp-row"><strong>HP</strong><span>{hud.hp}/{hud.maxHp}</span></div><div className="arpg-hp-track"><i style={{ width: `${hpPct}%` }}/></div><div className="arpg-gold">Loot <b>{hud.gold}</b></div></div>
      <div className="arpg-encounter-card"><span>{hud.encounter}</span>{hud.total > 0 && <strong>{hud.alive} / {hud.total} enemies</strong>}</div>
      <label className="arpg-enemy-loadout"><span>Enemy model</span><select value={forcedCharacterId} onChange={(event) => selectCharacter(event.target.value)}><option value="">Auto from Character Forge</option>{characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div className="map-arpg-overlay"><div className="map-walk-help"><strong>ARPG COMBAT</strong><span>WASD move · Shift sprint · Left click / Space / F attack · attacks smash destructibles · collect dropped loot</span></div></div>
  </div>
}

function inheritedRuntimeData(object: THREE.Object3D, key: string) {
  let current: THREE.Object3D | null = object
  while (current) {
    const value = current.userData[key]
    if (value !== undefined) return value
    current = current.parent
  }
  return undefined
}
function runtimeWallSides(object: THREE.Object3D | null): Side[] {
  let current = object
  while (current) {
    const many = current.userData.wallSides
    if (Array.isArray(many) && many.length) return many as Side[]
    const single = current.userData.wallSide as Side | undefined
    if (single) return [single]
    current = current.parent
  }
  return []
}
function roomSidesFacingCamera(room: DungeonRoom, cameraPosition: THREE.Vector3) {
  const dx = cameraPosition.x - room.x, dz = cameraPosition.z - room.z
  const angle = -THREE.MathUtils.degToRad(room.rotation), cos = Math.cos(angle), sin = Math.sin(angle)
  const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos
  return new Set<Side>([localX >= 0 ? 'east' : 'west', localZ >= 0 ? 'south' : 'north'])
}
function playEnemyAnimation(enemy: RuntimeEnemy, name: string, once = false) { if (!enemy.mixer || enemy.animation === name) return; const clip = enemy.clips.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? enemy.clips.find((item) => item.name.toLowerCase().includes(name.toLowerCase())); if (!clip) return; const next = enemy.mixer.clipAction(clip); enemy.action?.fadeOut(0.1); next.reset().fadeIn(0.1); if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true } else next.setLoop(THREE.LoopRepeat, Infinity); next.play(); enemy.action = next; enemy.animation = name }
function setEnemyState(enemy: RuntimeEnemy, state: RuntimeEnemyState) { if (enemy.state === state) return; enemy.state = state; playEnemyAnimation(enemy, state === 'chase' ? 'Walk' : state === 'attack' ? 'Attack' : state === 'dead' ? 'Death' : 'Idle', state === 'dead') }
function markOccluder(mesh: THREE.Mesh) { mesh.userData.arpgOccluder = true; return mesh }
function addRuntimeWall(parent: THREE.Group, wall: DungeonWall, atmosphere: DungeonAtmosphere) {
  const dx = wall.x2 - wall.x1
  const dz = wall.z2 - wall.z1
  const length = Math.hypot(dx, dz)
  if (length < .1) return

  const root = new THREE.Group()
  root.position.set((wall.x1 + wall.x2) / 2, 0, (wall.z1 + wall.z2) / 2)
  root.rotation.y = Math.atan2(dx, dz)
  parent.add(root)

  const coreMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: .97 })
  const brickMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: .93, metalness: .005 })
  const core = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(wall.thickness, wall.height, length), coreMaterial))
  core.position.y = wall.height / 2
  core.castShadow = true
  core.receiveShadow = true
  root.add(core)

  const rows = Math.max(4, Math.floor(wall.height / .54))
  const rowHeight = wall.height / rows
  const random = seededRandom(stringSeed(`runtime-wall-${wall.id}`))
  const bricks: Array<{ z: number; y: number; length: number; shade: number }> = []
  for (let row = 0; row < rows; row += 1) {
    let cursor = -length / 2 - (row % 2 ? .55 : 0)
    while (cursor < length / 2) {
      const brickLength = .82 + random() * .78
      const center = cursor + brickLength / 2
      if (center > -length / 2 && center < length / 2) {
        bricks.push({ z: center, y: row * rowHeight + rowHeight / 2, length: Math.min(brickLength * .93, length), shade: .74 + random() * .22 })
      }
      cursor += brickLength + .06
    }
  }
  if (!bricks.length) return
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), brickMaterial, bricks.length)
  const dummy = new THREE.Object3D()
  const white = new THREE.Color(0xffffff)
  bricks.forEach((brick, index) => {
    dummy.position.set(0, brick.y, brick.z)
    dummy.scale.set(wall.thickness + .07, rowHeight * .82, brick.length)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, white.clone().multiplyScalar(brick.shade))
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.arpgOccluder = true
  root.add(mesh)
}

function addBaseRoom(parent: THREE.Group, room: DungeonRoom, wallThickness: number, openings: RoomOpening[], atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) { const group = new THREE.Group(); group.position.set(room.x, room.floorLevel, room.z); group.rotation.y = THREE.MathUtils.degToRad(room.rotation); parent.add(group); const floorMaterial = new THREE.MeshStandardMaterial({ color: tintRoomFloor(atmosphere.floor, room.type, atmosphere), roughness: crypt ? 0.8 : 0.62, metalness: 0.02, emissive: crypt ? new THREE.Color(atmosphere.floor).multiplyScalar(.12) : new THREE.Color(0x000000), emissiveIntensity: crypt ? .32 : 0 }); const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.18, room.depth), floorMaterial); floor.position.y = 0.09; floor.receiveShadow = true; group.add(floor); const wallMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: crypt ? 0.93 : 0.86, metalness: 0.01 }), darkMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.96 }); for (const side of ['north','south','west','east'] as Side[]) addWallWithOpenings(group, room, side, openings.filter((opening) => opening.side === side), Math.max(0.12, wallThickness), wallMaterial, darkMaterial); if (!crypt) { const inset = 0.16; for (const [x,z] of [[-room.width/2+inset,-room.depth/2+inset],[room.width/2-inset,-room.depth/2+inset],[-room.width/2+inset,room.depth/2-inset],[room.width/2-inset,room.depth/2-inset]] as Array<[number,number]>) { const column = markOccluder(new THREE.Mesh(new THREE.BoxGeometry(0.36, room.height, 0.36), darkMaterial)); column.position.set(x, room.height/2, z); column.castShadow = true; column.receiveShadow = true; group.add(column) } addRoomLights(group, room, atmosphere, flickerLights, crypt) } }
function addWallWithOpenings(group: THREE.Group, room: DungeonRoom, side: Side, openings: RoomOpening[], thickness: number, material: THREE.Material, darkMaterial: THREE.Material) { const horizontal = side === 'north' || side === 'south', total = horizontal ? room.width : room.depth, half = total / 2; const intervals = mergeIntervals(openings.map((opening) => ({ start: Math.max(-half, opening.offset-opening.openingWidth/2), end: Math.min(half, opening.offset+opening.openingWidth/2) }))); const doorHeight = Math.min(2.45, Math.max(1.9, room.height-0.4)); let cursor = -half; for (const interval of intervals) { addWallSegment(group, room, side, cursor, interval.start, thickness, room.height, material, darkMaterial); const openingLength = interval.end-interval.start; if (openingLength > 0.05 && room.height > doorHeight+0.12) { const lintelHeight = room.height-doorHeight, center = (interval.start+interval.end)/2; const lintel = markOccluder(horizontal ? new THREE.Mesh(new THREE.BoxGeometry(openingLength,lintelHeight,thickness),material) : new THREE.Mesh(new THREE.BoxGeometry(thickness,lintelHeight,openingLength),material)); if (horizontal) lintel.position.set(center,doorHeight+lintelHeight/2,(side==='south'?1:-1)*room.depth/2); else lintel.position.set((side==='east'?1:-1)*room.width/2,doorHeight+lintelHeight/2,center); lintel.userData.roomId=room.id; lintel.userData.wallSide=side; lintel.castShadow=true; lintel.receiveShadow=true; group.add(lintel) } cursor=interval.end } addWallSegment(group,room,side,cursor,half,thickness,room.height,material,darkMaterial) }
function addWallSegment(group: THREE.Group, room: DungeonRoom, side: Side, start: number, end: number, thickness: number, height: number, material: THREE.Material, darkMaterial: THREE.Material) { const length=end-start; if(length<=0.04)return; const horizontal=side==='north'||side==='south', center=(start+end)/2; const wall=markOccluder(horizontal?new THREE.Mesh(new THREE.BoxGeometry(length,height,thickness),material):new THREE.Mesh(new THREE.BoxGeometry(thickness,height,length),material)); if(horizontal)wall.position.set(center,height/2,(side==='south'?1:-1)*room.depth/2);else wall.position.set((side==='east'?1:-1)*room.width/2,height/2,center); wall.userData.roomId=room.id; wall.userData.wallSide=side; wall.castShadow=true;wall.receiveShadow=true;group.add(wall); const base=markOccluder(horizontal?new THREE.Mesh(new THREE.BoxGeometry(length,.26,thickness+.08),darkMaterial):new THREE.Mesh(new THREE.BoxGeometry(thickness+.08,.26,length),darkMaterial));base.position.copy(wall.position);base.position.y=.13;base.userData.roomId=room.id;base.userData.wallSide=side;group.add(base) }
function addRoomLights(group: THREE.Group, room: DungeonRoom, atmosphere: DungeonAtmosphere, flickerLights: FlickerLight[], crypt: boolean) { const y=Math.min(1.72,room.height*.55), positions:Array<[number,number,number]>=[[-room.width/2+.38,y,-room.depth*.22],[room.width/2-.38,y,room.depth*.22]]; positions.forEach(([x,py,z],index)=>{ const bracket=new THREE.Mesh(new THREE.BoxGeometry(.08,.48,.08),new THREE.MeshStandardMaterial({color:0x28221f,roughness:.72,metalness:.34}));bracket.position.set(x,py-.22,z);bracket.rotation.z=x<0?-.34:.34;group.add(bracket); const flame=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshStandardMaterial({color:atmosphere.torch,emissive:atmosphere.torch,emissiveIntensity:crypt?2.05:2.4,roughness:.3}));flame.scale.set(.78,1.55,.78);flame.position.set(x,py+.13,z);group.add(flame); if(index===0||room.type==='boss'||room.type==='elite'){const base=atmosphere.torchIntensity*(crypt?.66:.88),light=new THREE.PointLight(atmosphere.torch,base,crypt?11.5:9.5,crypt?1.55:1.75);light.position.copy(flame.position);group.add(light);flickerLights.push({light,base,phase:Math.random()*Math.PI*2,speed:5.2+Math.random()*1.6})} }); const accent=roomAccent(room.type,atmosphere);if(accent!==undefined){const light=new THREE.PointLight(accent,room.type==='boss'?1.45:.72,room.type==='boss'?Math.max(room.width,room.depth)*.82:5.8,1.9);light.position.set(0,1.15,0);group.add(light)} }
function addBaseCorridor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number, atmosphere: DungeonAtmosphere) { const floorMaterial=new THREE.MeshStandardMaterial({color:atmosphere.corridorFloor,roughness:.8,metalness:.02}),wallMaterial=new THREE.MeshStandardMaterial({color:atmosphere.corridorWall,roughness:.93});const mid={x:to.x,z:from.z}; addCorridorSegment(parent,from.x,from.z,mid.x,mid.z,width,floorMaterial,wallMaterial);addCorridorSegment(parent,mid.x,mid.z,to.x,to.z,width,floorMaterial,wallMaterial) }
function addCorridorSegment(parent: THREE.Group,x1:number,z1:number,x2:number,z2:number,width:number,floorMaterial:THREE.Material,wallMaterial:THREE.Material){const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);if(length<.25)return;const angle=Math.atan2(dx,dz),floor=new THREE.Mesh(new THREE.BoxGeometry(width,.14,length),floorMaterial);floor.position.set((x1+x2)/2,.07,(z1+z2)/2);floor.rotation.y=angle;floor.receiveShadow=true;parent.add(floor);const wallHeight=1.02;for(const side of[-1,1]){const wall=markOccluder(new THREE.Mesh(new THREE.BoxGeometry(.22,wallHeight,length),wallMaterial));wall.position.set(floor.position.x+Math.cos(angle)*(width/2+.11)*side,wallHeight/2,floor.position.z-Math.sin(angle)*(width/2+.11)*side);wall.rotation.y=angle;wall.castShadow=true;wall.receiveShadow=true;parent.add(wall)}}
function addBuiltinProp(parent:THREE.Group,prop:DungeonProp,atmosphere:DungeonAtmosphere,flickerLights:FlickerLight[]){const group=new THREE.Group();group.position.set(prop.x,prop.y,prop.z);group.rotation.y=THREE.MathUtils.degToRad(prop.rotationY);group.scale.setScalar(prop.scale);group.userData.propId=prop.id;parent.add(group);const stone=new THREE.MeshStandardMaterial({color:atmosphere.wall,roughness:.9}),wood=new THREE.MeshStandardMaterial({color:0x5a4030,roughness:.9}),metal=new THREE.MeshStandardMaterial({color:0x4f565c,roughness:.65,metalness:.32});const add=(object:THREE.Object3D,occluder=false)=>{object.traverse((child)=>{child.userData.propId=prop.id;const mesh=child as THREE.Mesh;if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;if(occluder)mesh.userData.arpgOccluder=true});group.add(object)};if(prop.source==='library')return group;if(prop.assetRef==='pillar'){const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.35,.42,2.6,10),stone);shaft.position.y=1.3;const base=new THREE.Mesh(new THREE.BoxGeometry(.92,.22,.92),stone);base.position.y=.11;add(shaft,true);add(base,true)}else if(prop.assetRef==='torch'){const stem=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,.8,8),wood);stem.position.y=.55;stem.rotation.z=.25;const flame=new THREE.Mesh(new THREE.SphereGeometry(.1,9,7),new THREE.MeshStandardMaterial({color:atmosphere.torch,emissive:atmosphere.torch,emissiveIntensity:2.6,roughness:.3}));flame.scale.y=1.35;flame.position.set(.1,1.02,0);const light=new THREE.PointLight(atmosphere.torch,atmosphere.torchIntensity,9,1.75);light.position.copy(flame.position);flickerLights.push({light,base:atmosphere.torchIntensity,phase:Math.random()*Math.PI*2,speed:5.8+Math.random()*2});add(stem);add(flame);group.add(light)}else if(prop.assetRef==='statue'){const base=new THREE.Mesh(new THREE.BoxGeometry(.9,.4,.9),stone);base.position.y=.2;const body=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.1,5,8),stone);body.position.y=1.25;const head=new THREE.Mesh(new THREE.SphereGeometry(.27,12,9),stone);head.position.y=2.15;add(base,true);add(body,true);add(head,true)}else if(prop.assetRef==='barrel'){const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.9,12),wood);barrel.position.y=.45;add(barrel)}else if(prop.assetRef==='crate'){const crate=new THREE.Mesh(new THREE.BoxGeometry(.9,.9,.9),wood);crate.position.y=.45;add(crate)}else if(prop.assetRef==='rubble'){const random=seededRandom(stringSeed(prop.id));for(let i=0;i<6;i++){const radius=.14+random()*.14,rock=new THREE.Mesh(new THREE.DodecahedronGeometry(radius,0),stone);rock.position.set((random()-.5)*1.1,radius,(random()-.5)*1.1);rock.rotation.set(random(),random(),random());add(rock)}}else{for(let i=-2;i<=2;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.12,.8,6),metal);spike.position.set(i*.25,.4,0);add(spike)}}return group}
function addMarker(parent:THREE.Group,item:DungeonMarker,doors?:Map<string,RuntimeDoor>){const group=new THREE.Group();group.position.set(item.x,item.y,item.z);parent.add(group);if(item.type==='door'){group.rotation.y=THREE.MathUtils.degToRad(Number(item.data.yaw??0));const frame=new THREE.MeshStandardMaterial({color:0x4b382b,roughness:.85}),panelMaterial=new THREE.MeshStandardMaterial({color:0x7d5b38,roughness:.78}),panel=new THREE.Mesh(new THREE.BoxGeometry(.16,2.25,1.65),panelMaterial);panel.position.y=1.13;const defaultLocked=Boolean(item.data.locked);if(!defaultLocked){panel.rotation.y=Math.PI/2;panel.position.x=.82;panel.position.z=-.78}const left=new THREE.Mesh(new THREE.BoxGeometry(.24,2.55,.22),frame);left.position.set(0,1.27,-.94);const right=left.clone();right.position.z=.94;const top=new THREE.Mesh(new THREE.BoxGeometry(.24,.24,2.1),frame);top.position.set(0,2.45,0);group.add(panel,left,right,top);doors?.set(item.id,{panel,defaultLocked})}else if(item.type==='portal'){const portal=new THREE.Mesh(new THREE.TorusGeometry(.62,.1,10,24),new THREE.MeshBasicMaterial({color:0x9f74ff}));portal.rotation.y=Math.PI/2;group.add(portal)}else if(item.type==='light'){const light=new THREE.PointLight(String(item.data.color??'#ffb45f'),Number(item.data.intensity??2),7,2);light.position.y=1.6;group.add(light)}else if(item.type==='loot'){const loot=new THREE.Mesh(new THREE.OctahedronGeometry(.24),new THREE.MeshStandardMaterial({color:0xc89b42,emissive:0x7d5f22,emissiveIntensity:.35}));loot.position.y=.35;group.add(loot)}else if(item.type==='trigger'){const trigger=new THREE.Mesh(new THREE.RingGeometry(Math.max(.5,(item.radius??2)-.08),item.radius??2,32),new THREE.MeshBasicMaterial({color:0x9f6a3c,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));trigger.rotation.x=-Math.PI/2;trigger.position.y=.04;group.add(trigger)}}
function spawnBreakDust(parent:THREE.Group, output:DustParticle[], prop:DungeonProp, definition:DungeonDestructible){const kind=definition.template==='crate'||definition.template==='barrel'||definition.template==='chest'?'wood':definition.template==='stone-pot'?'stone':'ceramic';const color=new THREE.Color(kind==='wood'?0x8b684d:kind==='stone'?0x899195:0x9b8776),random=seededRandom(stringSeed(`${prop.id}-${Date.now()}`));for(let i=0;i<22;i++){const size=.025+random()*.06,mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(size,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.34,depthWrite:false}));mesh.position.set(prop.x+(random()-.5)*.7*prop.scale,prop.y+.2+random()*.75*prop.scale,prop.z+(random()-.5)*.7*prop.scale);parent.add(mesh);const life=.35+random()*.25;output.push({mesh,velocity:new THREE.Vector3((random()-.5)*2.6,.8+random()*2.2,(random()-.5)*2.6),life,totalLife:life})}}
function spawnLoot(parent:THREE.Group,x:number,y:number,z:number,value:number):RuntimeLoot{const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.22),new THREE.MeshStandardMaterial({color:0xd9af58,emissive:0x76551f,emissiveIntensity:.75,roughness:.3,metalness:.08}));mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return{mesh,value}}
function spawnHitFx(parent:THREE.Group,position:THREE.Vector3){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),new THREE.MeshBasicMaterial({color:0xffd18a,transparent:true,opacity:.7,depthWrite:false}));mesh.position.copy(position).add(new THREE.Vector3(0,.9,0));parent.add(mesh);setTimeout(()=>disposeObject(mesh),120)}
function spawnAttackArc(parent:THREE.Group,output:AttackFx[],position:THREE.Vector3,yaw:number){const mesh=new THREE.Mesh(new THREE.RingGeometry(.54,.76,22,1,-Math.PI*.42,Math.PI*.84),new THREE.MeshBasicMaterial({color:0xd9edf7,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,depthTest:true}));const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));mesh.position.copy(position).addScaledVector(forward,.82);mesh.position.y+=.92;mesh.rotation.y=yaw;mesh.rotation.z=-.32;mesh.renderOrder=8;parent.add(mesh);output.push({mesh,life:.16})}
function createAvatar(){const group=new THREE.Group();group.visible=false;const bodyMaterial=new THREE.MeshStandardMaterial({color:0x55636d,roughness:.66,metalness:.05,emissive:0x1a252c,emissiveIntensity:.34}),accentMaterial=new THREE.MeshStandardMaterial({color:0xb2c6d1,roughness:.5,metalness:.08,emissive:0x25343d,emissiveIntensity:.3}),body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.72,5,9),bodyMaterial);body.position.y=.86;const head=new THREE.Mesh(new THREE.SphereGeometry(.22,12,9),accentMaterial);head.position.y=1.55;body.castShadow=true;head.castShadow=true;group.add(body,head);return group}
function mergeIntervals(intervals:Array<{start:number;end:number}>){const sorted=intervals.filter((item)=>item.end>item.start).sort((a,b)=>a.start-b.start),result:Array<{start:number;end:number}>=[];for(const interval of sorted){const last=result[result.length-1];if(!last||interval.start>last.end+.05)result.push({...interval});else last.end=Math.max(last.end,interval.end)}return result}
function canWalkAt(value:DungeonWithProps,x:number,z:number,broken:Set<string>,runtimeLocked:Set<string>){const radius=.3;const inside=value.theme==='crypt'?dungeonNavigationContainsV3(value,x,z,radius):value.rooms.some((room)=>pointInsideRoom(room,x,z,radius))||pointInsideCorridor(value,x,z,radius);if(!inside)return false;if(value.theme==='crypt'&&dungeonArtCollidesV3(value,x,z,radius))return false;for(const wall of value.walls??[])if(pointNearWall(wall,x,z,radius))return false;for(const prop of dungeonProps(value))if(dungeonPropBlocksMovement(prop)&&!broken.has(prop.id)&&Math.hypot(x-prop.x,z-prop.z)<propCollisionRadius(prop)+radius)return false;return true}
function pointNearWall(wall:DungeonWall,x:number,z:number,margin:number){const dx=wall.x2-wall.x1,dz=wall.z2-wall.z1,lenSq=dx*dx+dz*dz,t=lenSq>.0001?Math.max(0,Math.min(1,((x-wall.x1)*dx+(z-wall.z1)*dz)/lenSq)):0,px=wall.x1+dx*t,pz=wall.z1+dz*t;return Math.hypot(x-px,z-pz)<=wall.thickness/2+margin}
function propCollisionRadius(prop:DungeonProp){const base=prop.assetRef==='pillar'?.45:prop.assetRef==='statue'?.5:prop.assetRef==='rubble'?.25:prop.assetRef==='spikes'?.55:prop.destructible?.enabled?.56:.45;return base*prop.scale}
function pointInsideRoom(room:DungeonRoom,x:number,z:number,margin:number){return dungeonRoomContainsV3(room,x,z,margin)}
function pointInsideCorridor(value:DungeonWithProps,x:number,z:number,margin:number){const rooms=new Map(value.rooms.map((room)=>[room.id,room]));for(const edge of value.corridors){const a=rooms.get(edge.fromRoomId),b=rooms.get(edge.toRoomId);if(!a||!b)continue;const from=getRoomConnection(a,b,edge.width),to=getRoomConnection(b,a,edge.width),midX=to.x,midZ=from.z;if(pointInsideAxisSegment(x,z,from.x,from.z,midX,midZ,edge.width,margin)||pointInsideAxisSegment(x,z,midX,midZ,to.x,to.z,edge.width,margin))return true}return false}
function pointInsideAxisSegment(x:number,z:number,x1:number,z1:number,x2:number,z2:number,width:number,margin:number){const halfWidth=Math.max(.25,width/2-margin),pad=margin+.28;if(Math.abs(z2-z1)<.05)return x>=Math.min(x1,x2)-pad&&x<=Math.max(x1,x2)+pad&&Math.abs(z-z1)<=halfWidth;if(Math.abs(x2-x1)<.05)return z>=Math.min(z1,z2)-pad&&z<=Math.max(z1,z2)+pad&&Math.abs(x-x1)<=halfWidth;return false}
function pointInsideDoor(item:DungeonMarker,x:number,z:number,margin:number){const dx=x-item.x,dz=z-item.z,angle=-THREE.MathUtils.degToRad(Number(item.data.yaw??0)),cos=Math.cos(angle),sin=Math.sin(angle),localX=dx*cos-dz*sin,localZ=dx*sin+dz*cos;return Math.abs(localX)<=.2+margin&&Math.abs(localZ)<=.9+margin}
function floorHeightAt(value:DungeonWithProps,x:number,z:number){return value.theme==='crypt'?dungeonFloorHeightV3(value,x,z):value.rooms.find((room)=>pointInsideRoom(room,x,z,0))?.floorLevel??0}
function seededRandom(seed:number){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let next=state;next=Math.imul(next^next>>>15,next|1);next^=next+Math.imul(next^next>>>7,next|61);return((next^next>>>14)>>>0)/4294967296}}
function stringSeed(value:string){let seed=2166136261;for(let i=0;i<value.length;i++)seed=Math.imul(seed^value.charCodeAt(i),16777619);return seed>>>0}
function disposeMaterial(material:THREE.Material){const withMaps=material as THREE.Material&{map?:THREE.Texture|null;alphaMap?:THREE.Texture|null;emissiveMap?:THREE.Texture|null};withMaps.map?.dispose();withMaps.alphaMap?.dispose();withMaps.emissiveMap?.dispose();material.dispose()}
function disposeObject(object:THREE.Object3D){object.traverse((child)=>{const mesh=child as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();const material=mesh.material;if(Array.isArray(material))material.forEach(disposeMaterial);else if(material)disposeMaterial(material)});object.removeFromParent()}
