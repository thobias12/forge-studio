import * as THREE from 'three'
import { getRoomConnection, type DungeonCorridor, type DungeonRoom } from './dungeonPackage'
import type { DungeonWithProps } from './dungeonProps'
import type { DungeonAtmosphere } from './dungeonAtmosphere'

export type DungeonRenderMode = 'editor' | 'arpg' | 'walk'
export type DungeonV3FlickerLight = { light: THREE.PointLight; base: number; phase: number; speed: number }
export type DungeonPoint = { x: number; z: number }

const FLOOR_BRICK_W = 1.22
const FLOOR_BRICK_D = 0.62
const WALL_SAMPLE = 0.82
const FLOOR_Y = 0.045

type GeometryCache = {
  corridors: Array<{ edge: DungeonCorridor; path: DungeonPoint[]; radius: number }>
}

const geometryCaches = new WeakMap<object, GeometryCache>()

function geometryCache(value: DungeonWithProps): GeometryCache {
  const cached = geometryCaches.get(value)
  if (cached) return cached
  const next: GeometryCache = {
    corridors: value.corridors.map((edge) => ({
      edge,
      path: dungeonCorridorPath(value, edge),
      radius: Math.max(0.3, edge.width / 2),
    })),
  }
  geometryCaches.set(value, next)
  return next
}

/**
 * Dungeon Forge V3 structural renderer.
 *
 * The old renderer built each room/corridor as a separate open-top 3D box.
 * V3 renders one continuous walkable union instead:
 * - staggered masonry only where the shared floor geometry is walkable
 * - perimeter walls only where walkable space borders the void
 * - internal room/corridor overlap walls therefore cannot exist
 * - ARPG/editor use a low perimeter silhouette; Walk uses full-height walls
 *
 * The same geometry helpers are exported for collision and hit testing so the
 * visible floor, movement and editing all agree.
 */
export function addDungeonMasonryV3(
  parent: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  flickerLights: DungeonV3FlickerLight[],
  mode: DungeonRenderMode,
) {
  const root = new THREE.Group()
  root.name = 'DungeonForgeV3'
  root.userData.dungeonSurface = true
  parent.add(root)

  const bounds = dungeonWorldBoundsV3(value, 3)
  addFloor(root, value, atmosphere, bounds)
  addPerimeterWalls(root, value, atmosphere, bounds, mode)
  addRoomFixtures(root, value, atmosphere, flickerLights, mode)
  addRoomDressing(root, value, atmosphere)

  return root
}

export function addDungeonRoomOverlayV3(
  parent: THREE.Group,
  room: DungeonRoom,
  selected: boolean,
  corridorStart: boolean,
) {
  const root = new THREE.Group()
  root.position.set(room.x, room.floorLevel, room.z)
  root.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  root.userData.roomId = room.id
  root.userData.roomRoot = true
  parent.add(root)

  const color = selected ? 0x91ddff : corridorStart ? 0xb69aff : 0x526772
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: selected || corridorStart ? 0.92 : 0.24,
    depthTest: false,
  })
  const outline = roomLocalOutline(room)
  const points = [...outline, outline[0]].map((point) => new THREE.Vector3(point.x, 0.22, point.z))
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(geometry, material)
  line.userData.roomId = room.id
  line.renderOrder = 18
  root.add(line)

  if (selected) {
    const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x8ed8ff, depthTest: false })
    const positions: Array<['north' | 'south' | 'east' | 'west', number, number]> = [
      ['north', 0, -room.depth / 2],
      ['south', 0, room.depth / 2],
      ['west', -room.width / 2, 0],
      ['east', room.width / 2, 0],
    ]
    for (const [side, x, z] of positions) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.58), handleMaterial)
      handle.position.set(x, 0.34, z)
      handle.userData.roomId = room.id
      handle.userData.resizeSide = side
      handle.renderOrder = 20
      root.add(handle)
    }
  }

  return root
}

export function dungeonWorldBoundsV3(value: DungeonWithProps, padding = 0) {
  const points: DungeonPoint[] = []
  for (const room of value.rooms) {
    const halfW = room.width / 2
    const halfD = room.depth / 2
    points.push(
      localToWorld(room, -halfW, -halfD),
      localToWorld(room, halfW, -halfD),
      localToWorld(room, halfW, halfD),
      localToWorld(room, -halfW, halfD),
    )
  }
  for (const edge of value.corridors) points.push(...dungeonCorridorPath(value, edge))
  for (const wall of value.walls ?? []) points.push({ x: wall.x1, z: wall.z1 }, { x: wall.x2, z: wall.z2 })

  if (!points.length) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10, width: 20, depth: 20, x: 0, z: 0 }

  const minX = Math.min(...points.map((point) => point.x)) - padding
  const maxX = Math.max(...points.map((point) => point.x)) + padding
  const minZ = Math.min(...points.map((point) => point.z)) - padding
  const maxZ = Math.max(...points.map((point) => point.z)) + padding
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(1, maxX - minX),
    depth: Math.max(1, maxZ - minZ),
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
  }
}

export function dungeonRoomContainsV3(room: DungeonRoom, x: number, z: number, margin = 0) {
  const local = worldToLocal(room, x, z)
  const halfW = Math.max(0.2, room.width / 2 - margin)
  const halfD = Math.max(0.2, room.depth / 2 - margin)
  const ax = Math.abs(local.x)
  const az = Math.abs(local.z)
  if (ax > halfW || az > halfD) return false

  const shape = room.shape ?? 'rect'
  if (shape === 'octagon') {
    const cut = Math.min(halfW, halfD) * 0.34
    return ax + az <= halfW + halfD - cut
  }
  if (shape === 'cross') {
    const armX = halfW * 0.38
    const armZ = halfD * 0.38
    return ax <= armX || az <= armZ
  }
  return true
}

export function dungeonRoomAtV3(value: DungeonWithProps, x: number, z: number) {
  return value.rooms.find((room) => dungeonRoomContainsV3(room, x, z, 0))
}

export function dungeonCorridorPath(value: DungeonWithProps, edge: DungeonCorridor): DungeonPoint[] {
  if (edge.path?.length && edge.path.length >= 2) return edge.path
  const roomMap = new Map(value.rooms.map((room) => [room.id, room]))
  const a = roomMap.get(edge.fromRoomId)
  const b = roomMap.get(edge.toRoomId)
  if (!a || !b) return []

  const from = getRoomConnection(a, b, edge.width)
  const to = getRoomConnection(b, a, edge.width)
  const p0 = { x: from.x, z: from.z }
  const p3 = { x: to.x, z: to.z }
  const dx = p3.x - p0.x
  const dz = p3.z - p0.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.1) return [p0, p3]

  const nx = -dz / distance
  const nz = dx / distance
  const sign = (stringHash(edge.id) & 1) ? 1 : -1
  const bend = Math.min(distance * 0.17, 3.4) * sign
  const p1 = { x: p0.x + dx * 0.33 + nx * bend, z: p0.z + dz * 0.33 + nz * bend }
  const p2 = { x: p0.x + dx * 0.67 - nx * bend * 0.55, z: p0.z + dz * 0.67 - nz * bend * 0.55 }

  const steps = Math.max(8, Math.ceil(distance / 1.25))
  const result: DungeonPoint[] = []
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const u = 1 - t
    result.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    })
  }
  return result
}

export function dungeonCorridorContainsV3(value: DungeonWithProps, edge: DungeonCorridor, x: number, z: number, margin = 0) {
  const entry = geometryCache(value).corridors.find((item) => item.edge.id === edge.id)
  const path = entry?.path ?? dungeonCorridorPath(value, edge)
  if (path.length < 2) return false
  const radius = Math.max(0.3, (entry?.radius ?? edge.width / 2) - margin)
  return pathContains(path, x, z, radius)
}

export function dungeonContainsPointV3(value: DungeonWithProps, x: number, z: number, margin = 0) {
  if (value.rooms.some((room) => dungeonRoomContainsV3(room, x, z, margin))) return true
  const cache = geometryCache(value)
  for (const corridor of cache.corridors) {
    const radius = Math.max(0.3, corridor.radius - margin)
    if (pathContains(corridor.path, x, z, radius)) return true
  }
  return false
}

export function dungeonFloorHeightV3(value: DungeonWithProps, x: number, z: number) {
  return dungeonRoomAtV3(value, x, z)?.floorLevel ?? 0
}

export function buildCorridorPathV3(
  fromRoom: DungeonRoom,
  toRoom: DungeonRoom,
  width: number,
  seed: number,
): DungeonPoint[] {
  const from = getRoomConnection(fromRoom, toRoom, width)
  const to = getRoomConnection(toRoom, fromRoom, width)
  const p0 = { x: from.x, z: from.z }
  const p3 = { x: to.x, z: to.z }
  const dx = p3.x - p0.x
  const dz = p3.z - p0.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.1) return [p0, p3]
  const nx = -dz / distance
  const nz = dx / distance
  const random = seededRandom(seed)
  const sign = random() < 0.5 ? -1 : 1
  const bend = Math.min(distance * (0.12 + random() * 0.1), 4.6) * sign
  const p1 = { x: p0.x + dx * 0.32 + nx * bend, z: p0.z + dz * 0.32 + nz * bend }
  const p2 = { x: p0.x + dx * 0.68 - nx * bend * (0.35 + random() * 0.35), z: p0.z + dz * 0.68 - nz * bend * (0.35 + random() * 0.35) }
  const steps = Math.max(8, Math.ceil(distance / 1.15))
  const result: DungeonPoint[] = []
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const u = 1 - t
    result.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
    })
  }
  return result
}

function addFloor(root: THREE.Group, value: DungeonWithProps, atmosphere: DungeonAtmosphere, bounds: ReturnType<typeof dungeonWorldBoundsV3>) {
  const instances: Array<{ x: number; z: number; y: number; width: number; depth: number; shade: number }> = []
  let row = 0
  for (let z = Math.floor(bounds.minZ / FLOOR_BRICK_D) * FLOOR_BRICK_D; z <= bounds.maxZ; z += FLOOR_BRICK_D) {
    const shift = row % 2 ? FLOOR_BRICK_W / 2 : 0
    for (let x = Math.floor((bounds.minX - shift) / FLOOR_BRICK_W) * FLOOR_BRICK_W + shift; x <= bounds.maxX; x += FLOOR_BRICK_W) {
      const cx = x + FLOOR_BRICK_W / 2
      const cz = z + FLOOR_BRICK_D / 2
      if (!dungeonContainsPointV3(value, cx, cz, 0.12)) continue
      const hash = numberHash(Math.round(cx * 13), Math.round(cz * 19), value.seed)
      const chip = 0.93 + ((hash >>> 5) % 5) * 0.01
      instances.push({
        x: cx,
        z: cz,
        y: dungeonFloorHeightV3(value, cx, cz) + FLOOR_Y,
        width: FLOOR_BRICK_W * chip,
        depth: FLOOR_BRICK_D * (0.9 + ((hash >>> 9) % 6) * 0.01),
        shade: 0.74 + (hash % 19) / 100,
      })
    }
    row += 1
  }
  if (!instances.length) return

  const geometry = new THREE.BoxGeometry(1, 0.09, 1)
  const material = new THREE.MeshStandardMaterial({
    color: atmosphere.floor,
    roughness: 0.9,
    metalness: 0.01,
    vertexColors: true,
    emissive: new THREE.Color(atmosphere.floor).multiplyScalar(0.055),
    emissiveIntensity: 0.18,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length)
  mesh.name = 'DungeonV3Floor'
  mesh.userData.dungeonSurface = true
  const dummy = new THREE.Object3D()
  const base = new THREE.Color(0xffffff)
  instances.forEach((instance, index) => {
    dummy.position.set(instance.x, instance.y, instance.z)
    dummy.scale.set(instance.width, 1, instance.depth)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, base.clone().multiplyScalar(instance.shade))
  })
  mesh.receiveShadow = true
  root.add(mesh)
}

type BoundaryBrick = { x: number; y: number; z: number; length: number; yaw: number; shade: number; cap: boolean }

function addPerimeterWalls(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  bounds: ReturnType<typeof dungeonWorldBoundsV3>,
  mode: DungeonRenderMode,
) {
  const topDown = mode !== 'walk'
  const wallHeight = topDown ? 1.18 : Math.max(3.8, Math.min(5.2, averageRoomHeight(value)))
  const rowHeight = 0.46
  const rows = Math.max(2, Math.ceil(wallHeight / rowHeight))
  const samples: BoundaryBrick[] = []

  const startX = Math.floor(bounds.minX / WALL_SAMPLE) * WALL_SAMPLE
  const startZ = Math.floor(bounds.minZ / WALL_SAMPLE) * WALL_SAMPLE
  for (let z = startZ; z < bounds.maxZ; z += WALL_SAMPLE) {
    for (let x = startX; x < bounds.maxX; x += WALL_SAMPLE) {
      const cx = x + WALL_SAMPLE / 2
      const cz = z + WALL_SAMPLE / 2
      if (!dungeonContainsPointV3(value, cx, cz, 0)) continue
      const floorY = dungeonFloorHeightV3(value, cx, cz)

      const edges: Array<{ open: boolean; x: number; z: number; yaw: number }> = [
        { open: !dungeonContainsPointV3(value, cx, cz - WALL_SAMPLE, 0), x: cx, z, yaw: 0 },
        { open: !dungeonContainsPointV3(value, cx, cz + WALL_SAMPLE, 0), x: cx, z: z + WALL_SAMPLE, yaw: 0 },
        { open: !dungeonContainsPointV3(value, cx - WALL_SAMPLE, cz, 0), x, z: cz, yaw: Math.PI / 2 },
        { open: !dungeonContainsPointV3(value, cx + WALL_SAMPLE, cz, 0), x: x + WALL_SAMPLE, z: cz, yaw: Math.PI / 2 },
      ]

      for (const edge of edges) {
        if (!edge.open) continue
        const hash = numberHash(Math.round(edge.x * 23), Math.round(edge.z * 29), value.seed)
        for (let row = 0; row < rows; row += 1) {
          const actualHeight = Math.min(rowHeight * 0.9, wallHeight - row * rowHeight)
          if (actualHeight <= 0.04) continue
          const stagger = row % 2 ? WALL_SAMPLE * 0.08 : 0
          samples.push({
            x: edge.x + (edge.yaw === 0 ? stagger : 0),
            z: edge.z + (edge.yaw === 0 ? 0 : stagger),
            y: floorY + row * rowHeight + actualHeight / 2,
            length: WALL_SAMPLE * 1.03,
            yaw: edge.yaw,
            shade: 0.72 + (hash % 18) / 100,
            cap: row === rows - 1,
          })
        }
      }
    }
  }

  if (!samples.length) return
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({
    color: atmosphere.wall,
    roughness: 0.93,
    metalness: 0.005,
    vertexColors: true,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, samples.length)
  mesh.name = 'DungeonV3Perimeter'
  mesh.userData.dungeonWall = true
  const dummy = new THREE.Object3D()
  const white = new THREE.Color(0xffffff)
  samples.forEach((sample, index) => {
    dummy.position.set(sample.x, sample.y, sample.z)
    dummy.rotation.set(0, sample.yaw, 0)
    dummy.scale.set(sample.length, rowHeight * (sample.cap ? 0.62 : 0.84), topDown ? 0.28 : 0.36)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    const color = white.clone().multiplyScalar(sample.shade + (sample.cap ? 0.08 : 0))
    mesh.setColorAt(index, color)
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
}

function addRoomFixtures(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  flickerLights: DungeonV3FlickerLight[],
  mode: DungeonRenderMode,
) {
  const fixtureY = mode === 'walk' ? 2.05 : 1.05
  for (const room of value.rooms) {
    const count = room.type === 'boss' ? 4 : room.type === 'treasure' || room.type === 'shrine' ? 2 : 2
    const positions: Array<{ x: number; z: number; yaw: number }> = []
    const along = count === 4 ? [-0.3, 0.3] : [0]
    for (const offset of along) {
      positions.push(roomWallPoint(room, 'north', offset, 0.28))
      if (count === 4) positions.push(roomWallPoint(room, 'south', -offset, 0.28))
      else positions.push(roomWallPoint(room, 'east', offset, 0.28))
    }

    positions.slice(0, count).forEach((position, index) => {
      const fixture = new THREE.Group()
      fixture.position.set(position.x, room.floorLevel, position.z)
      fixture.rotation.y = position.yaw
      root.add(fixture)

      const bracketMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.82, metalness: 0.22 })
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), bracketMaterial)
      arm.position.set(0, fixtureY - 0.12, 0.14)
      arm.rotation.x = -0.18
      fixture.add(arm)

      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.09, 8), bracketMaterial)
      cup.position.set(0, fixtureY, 0.29)
      fixture.add(cup)

      const flameMaterial = new THREE.MeshStandardMaterial({
        color: atmosphere.torch,
        emissive: atmosphere.torch,
        emissiveIntensity: 2.25,
        roughness: 0.28,
      })
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 8), flameMaterial)
      flame.position.set(0, fixtureY + 0.18, 0.29)
      fixture.add(flame)

      const light = new THREE.PointLight(atmosphere.torch, atmosphere.torchIntensity * 0.44, 8.8, 1.65)
      light.position.copy(flame.position)
      fixture.add(light)
      flickerLights.push({
        light,
        base: light.intensity,
        phase: ((stringHash(room.id) + index * 17) % 628) / 100,
        speed: 5.4 + index * 0.35,
      })
    })
  }
}

function addRoomDressing(root: THREE.Group, value: DungeonWithProps, atmosphere: DungeonAtmosphere) {
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.95 })

  for (const room of value.rooms) {
    const random = seededRandom(stringHash(room.id) ^ value.seed)
    const count = room.type === 'boss' ? 4 : room.type === 'combat' || room.type === 'elite' ? 2 : room.type === 'treasure' ? 2 : 0
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 ? 1 : -1
      const localX = side * room.width * (0.28 + random() * 0.08)
      const localZ = room.depth * (0.18 + (index >= 2 ? 0.25 : 0))
      const point = localToWorld(room, localX, localZ)
      if (!dungeonRoomContainsV3(room, point.x, point.z, 1.1)) continue

      const group = new THREE.Group()
      group.position.set(point.x, room.floorLevel, point.z)
      group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
      root.add(group)

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.25, 2.35), dark)
      base.position.y = 0.13
      base.castShadow = true
      base.receiveShadow = true
      group.add(base)
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.22, 2.1), stone)
      lid.position.y = 0.32
      lid.castShadow = true
      lid.receiveShadow = true
      group.add(lid)
      const inset = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 1.45), dark)
      inset.position.y = 0.47
      group.add(inset)
    }
  }
}

function roomLocalOutline(room: DungeonRoom): DungeonPoint[] {
  const halfW = room.width / 2
  const halfD = room.depth / 2
  if ((room.shape ?? 'rect') === 'octagon') {
    const cut = Math.min(room.width, room.depth) * 0.16
    return [
      { x: -halfW + cut, z: -halfD },
      { x: halfW - cut, z: -halfD },
      { x: halfW, z: -halfD + cut },
      { x: halfW, z: halfD - cut },
      { x: halfW - cut, z: halfD },
      { x: -halfW + cut, z: halfD },
      { x: -halfW, z: halfD - cut },
      { x: -halfW, z: -halfD + cut },
    ]
  }
  if (room.shape === 'cross') {
    const ax = halfW * 0.38
    const az = halfD * 0.38
    return [
      { x: -ax, z: -halfD }, { x: ax, z: -halfD },
      { x: ax, z: -az }, { x: halfW, z: -az },
      { x: halfW, z: az }, { x: ax, z: az },
      { x: ax, z: halfD }, { x: -ax, z: halfD },
      { x: -ax, z: az }, { x: -halfW, z: az },
      { x: -halfW, z: -az }, { x: -ax, z: -az },
    ]
  }
  return [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW, z: halfD },
    { x: -halfW, z: halfD },
  ]
}

function roomWallPoint(room: DungeonRoom, side: 'north' | 'south' | 'east' | 'west', along: number, inset: number) {
  let x = 0
  let z = 0
  let yaw = 0
  if (side === 'north') { x = room.width * along; z = -room.depth / 2 + inset; yaw = 0 }
  if (side === 'south') { x = room.width * along; z = room.depth / 2 - inset; yaw = Math.PI }
  if (side === 'east') { x = room.width / 2 - inset; z = room.depth * along; yaw = -Math.PI / 2 }
  if (side === 'west') { x = -room.width / 2 + inset; z = room.depth * along; yaw = Math.PI / 2 }
  const world = localToWorld(room, x, z)
  return { ...world, yaw: yaw + THREE.MathUtils.degToRad(room.rotation) }
}

function averageRoomHeight(value: DungeonWithProps) {
  if (!value.rooms.length) return 4.2
  return value.rooms.reduce((sum, room) => sum + room.height, 0) / value.rooms.length
}

function worldToLocal(room: DungeonRoom, x: number, z: number) {
  const angle = -THREE.MathUtils.degToRad(room.rotation)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = x - room.x
  const dz = z - room.z
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
}

function localToWorld(room: DungeonRoom, x: number, z: number) {
  const angle = THREE.MathUtils.degToRad(room.rotation)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: room.x + x * cos - z * sin, z: room.z + x * sin + z * cos }
}

function pathContains(path: DungeonPoint[], x: number, z: number, radius: number) {
  if (path.length < 2) return false
  const radiusSq = radius * radius
  for (let index = 1; index < path.length; index += 1) {
    if (distanceToSegmentSquared(x, z, path[index - 1], path[index]) <= radiusSq) return true
  }
  return false
}

function distanceToSegmentSquared(x: number, z: number, a: DungeonPoint, b: DungeonPoint) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  const t = lengthSq > 0.000001 ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1) : 0
  const px = a.x + dx * t
  const pz = a.z + dz * t
  const ox = x - px
  const oz = z - pz
  return ox * ox + oz * oz
}

function stringHash(value: string) {
  let seed = 2166136261
  for (let index = 0; index < value.length; index += 1) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619)
  return seed >>> 0
}

function numberHash(x: number, z: number, seed: number) {
  let value = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(seed | 0, 83492791)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  value = Math.imul(value, 0x846ca68b)
  return (value ^ (value >>> 16)) >>> 0
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
