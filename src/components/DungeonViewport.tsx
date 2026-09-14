import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DungeonMarker, DungeonRoom, ForgeDungeonPackage } from '../lib/dungeonPackage'

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
}

type RoomVisual = { group: THREE.Group; floor: THREE.Mesh }
type MarkerVisual = { object: THREE.Object3D }

const roomColors: Record<DungeonRoom['type'], number> = {
  entrance: 0x5588aa,
  combat: 0x8a6f55,
  treasure: 0xb8933d,
  elite: 0xa05b35,
  shrine: 0x568b77,
  boss: 0x8c3f4d,
  secret: 0x624b7c,
  utility: 0x616a72,
}

export default function DungeonViewport({ value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick })
  useEffect(() => { propsRef.current = { value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick } }, [value, tool, selectedRoomId, selectedMarkerId, corridorStartId, topDown, playtest, onGroundClick, onRoomClick, onMarkerClick])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1015)
    scene.fog = new THREE.FogExp2(0x0b1015, value.settings.fogDensity)

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300)
    camera.position.set(26, 30, 32)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
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

    const rebuild = () => {
      while (dungeonGroup.children.length) disposeObject(dungeonGroup.children.pop()!)
      roomVisuals.clear()
      markerVisuals.clear()
      const current = propsRef.current.value
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = current.settings.fogDensity
      ambient.intensity = 0.6 + current.settings.ambientLight * 2.2

      const roomMap = new Map(current.rooms.map((item) => [item.id, item]))
      for (const edge of current.corridors) {
        const from = roomMap.get(edge.fromRoomId)
        const to = roomMap.get(edge.toRoomId)
        if (!from || !to) continue
        addCorridor(dungeonGroup, from, to, edge.width)
      }
      for (const room of current.rooms) {
        const visual = addRoom(dungeonGroup, room, current.settings.wallThickness, room.id === propsRef.current.selectedRoomId, room.id === propsRef.current.corridorStartId)
        roomVisuals.set(room.id, visual)
      }
      for (const item of current.markers) {
        const visual = addMarker(dungeonGroup, item, item.id === propsRef.current.selectedMarkerId)
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

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || propsRef.current.playtest) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects([dungeonGroup, ground], true)
      const hit = hits.find((candidate) => candidate.object.userData.roomId || candidate.object.userData.markerId || candidate.object.name === '__ground')
      if (!hit) return
      const roomId = hit.object.userData.roomId as string | undefined
      const markerId = hit.object.userData.markerId as string | undefined
      if (markerId) propsRef.current.onMarkerClick(markerId)
      else if (roomId) propsRef.current.onRoomClick(roomId)
      else propsRef.current.onGroundClick({ x: hit.point.x, z: hit.point.z })
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)

    let raf = 0
    let playAngle = 0
    const tick = () => {
      const state = propsRef.current
      const signature = JSON.stringify([state.value.rooms, state.value.corridors, state.value.markers, state.value.settings, state.selectedRoomId, state.selectedMarkerId, state.corridorStartId])
      if (signature !== lastSignature) {
        lastSignature = signature
        rebuild()
      }

      if (state.topDown && !state.playtest) {
        const center = dungeonCenter(state.value.rooms)
        camera.position.lerp(new THREE.Vector3(center.x, 42, center.z + 0.01), 0.09)
        controls.target.lerp(new THREE.Vector3(center.x, 0, center.z), 0.09)
      }
      controls.enabled = !state.playtest
      if (state.playtest) {
        const entrance = state.value.rooms.find((item) => item.type === 'entrance') ?? state.value.rooms[0]
        if (entrance) {
          playAngle += 0.0025
          const radius = Math.max(7, Math.max(entrance.width, entrance.depth) * 0.8)
          const target = new THREE.Vector3(entrance.x, 0.9, entrance.z)
          camera.position.lerp(new THREE.Vector3(entrance.x + Math.cos(playAngle) * radius, 4.6, entrance.z + Math.sin(playAngle) * radius), 0.04)
          camera.lookAt(target)
        }
      } else {
        controls.update()
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      controls.dispose()
      disposeObject(dungeonGroup)
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={hostRef} className="dungeon-viewport-canvas" />
}

function addRoom(parent: THREE.Group, room: DungeonRoom, wallThickness: number, selected: boolean, corridorStart: boolean): RoomVisual {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  parent.add(group)

  const baseColor = roomColors[room.type]
  const floorMaterial = new THREE.MeshStandardMaterial({ color: selected ? 0x6f9fba : corridorStart ? 0x8f78b6 : baseColor, roughness: 0.92, metalness: 0.02 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.18, room.depth), floorMaterial)
  floor.position.y = 0.09
  floor.userData.roomId = room.id
  group.add(floor)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: selected ? 0x9cc8df : 0x39434b, roughness: 0.95 })
  const wallHeight = room.height
  const t = Math.max(0.12, wallThickness)
  const wallY = wallHeight * 0.5
  const north = new THREE.Mesh(new THREE.BoxGeometry(room.width + t * 2, wallHeight, t), wallMaterial)
  north.position.set(0, wallY, -room.depth / 2)
  const south = north.clone(); south.position.z = room.depth / 2
  const west = new THREE.Mesh(new THREE.BoxGeometry(t, wallHeight, room.depth), wallMaterial)
  west.position.set(-room.width / 2, wallY, 0)
  const east = west.clone(); east.position.x = room.width / 2
  for (const wall of [north, south, west, east]) { wall.userData.roomId = room.id; group.add(wall) }

  const label = makeLabel(room.name, room.type.toUpperCase())
  label.position.set(0, room.height + 0.6, 0)
  group.add(label)
  return { group, floor }
}

function addCorridor(parent: THREE.Group, from: DungeonRoom, to: DungeonRoom, width: number) {
  const corridorMaterial = new THREE.MeshStandardMaterial({ color: 0x4b4843, roughness: 1 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x323a40, roughness: 1 })
  const y = 0.07
  const mid = { x: to.x, z: from.z }
  addCorridorSegment(parent, from.x, from.z, mid.x, mid.z, width, y, corridorMaterial, wallMaterial)
  addCorridorSegment(parent, mid.x, mid.z, to.x, to.z, width, y, corridorMaterial, wallMaterial)
}

function addCorridorSegment(parent: THREE.Group, x1: number, z1: number, x2: number, z2: number, width: number, y: number, floorMaterial: THREE.Material, wallMaterial: THREE.Material) {
  const dx = x2 - x1
  const dz = z2 - z1
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

function addMarker(parent: THREE.Group, marker: DungeonMarker, selected: boolean): MarkerVisual {
  const group = new THREE.Group()
  group.position.set(marker.x, marker.y, marker.z)
  const color = markerColor(marker.type)
  let object: THREE.Object3D
  if (marker.type === 'portal') {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 10, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
    mesh.rotation.y = Math.PI / 2
    object = mesh
  } else if (marker.type === 'trigger') {
    object = new THREE.Mesh(new THREE.CylinderGeometry(marker.radius ?? 2, marker.radius ?? 2, 0.08, 24), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.72 }))
  } else if (marker.type === 'door') {
    object = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.3, 1.4), new THREE.MeshStandardMaterial({ color }))
    object.position.y = 1.15
  } else if (marker.type === 'light') {
    object = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color }))
    const light = new THREE.PointLight(color, 2.2, 7, 2)
    light.position.y = 1.6
    group.add(light)
  } else {
    object = new THREE.Mesh(marker.type === 'enemy' ? new THREE.OctahedronGeometry(0.42) : new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22 }))
  }
  object.userData.markerId = marker.id
  if (selected) object.scale.setScalar(1.35)
  group.add(object)
  const label = makeLabel(marker.name, marker.type.toUpperCase())
  label.position.y = marker.type === 'door' ? 2.8 : 1.05
  group.add(label)
  parent.add(group)
  return { object: group }
}

function makeLabel(title: string, subtitle: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(7,12,17,.82)'
  roundRect(ctx, 8, 8, 496, 112, 18)
  ctx.fill()
  ctx.fillStyle = '#e9f2f9'
  ctx.font = '600 32px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(title.slice(0, 28), 256, 56)
  ctx.fillStyle = '#87a2b7'
  ctx.font = '600 18px system-ui'
  ctx.fillText(subtitle, 256, 88)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(4.6, 1.15, 1)
  return sprite
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function markerColor(type: DungeonMarker['type']) {
  return ({ door: 0xa57743, enemy: 0xe45c5c, loot: 0xe3b64b, checkpoint: 0x65d08a, portal: 0xa675ff, trigger: 0xff9448, light: 0xffd179 } as const)[type]
}

function dungeonCenter(rooms: DungeonRoom[]) {
  if (!rooms.length) return { x: 0, z: 0 }
  return { x: rooms.reduce((sum, room) => sum + room.x, 0) / rooms.length, z: rooms.reduce((sum, room) => sum + room.z, 0) / rooms.length }
}

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
