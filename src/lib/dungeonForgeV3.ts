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
  addFloorAtmosphere(root, value, atmosphere, bounds)
  addPerimeterWalls(root, value, atmosphere, bounds, mode)
  addCorridorArchitecture(root, value, atmosphere, mode)
  addRoomArchitecture(root, value, atmosphere, mode)
  addRoomFixtures(root, value, atmosphere, flickerLights, mode)
  addCorridorFixtures(root, value, atmosphere, flickerLights, mode)
  addRoomDressing(root, value, atmosphere, mode)

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

/**
 * Navigation keeps a small circular footprint on the authored floor union.
 * Unlike room-margin shrinking, this works across the union of rooms +
 * corridors and therefore slides cleanly around concave corners/openings.
 */
export function dungeonNavigationContainsV3(
  value: DungeonWithProps,
  x: number,
  z: number,
  radius = 0.3,
) {
  if (!dungeonContainsPointV3(value, x, z, 0)) return false
  const probeRadius = Math.max(0.12, radius * 0.9)
  const probes = 12
  for (let index = 0; index < probes; index += 1) {
    const angle = index / probes * Math.PI * 2
    const px = x + Math.cos(angle) * probeRadius
    const pz = z + Math.sin(angle) * probeRadius
    if (!dungeonContainsPointV3(value, px, pz, 0)) return false
  }
  return true
}

export function resolveDungeonSlideV3(
  currentX: number,
  currentZ: number,
  dx: number,
  dz: number,
  isOpen: (x: number, z: number) => boolean,
) {
  if (Math.abs(dx) + Math.abs(dz) < 1e-7) return { x: currentX, z: currentZ }
  const directX = currentX + dx
  const directZ = currentZ + dz
  if (isOpen(directX, directZ)) return { x: directX, z: directZ }

  const length = Math.hypot(dx, dz)
  const ux = dx / length
  const uz = dz / length
  const candidates: Array<{ x: number; z: number; score: number }> = []

  const addCandidate = (mx: number, mz: number, scale = 1) => {
    const tx = currentX + mx * scale
    const tz = currentZ + mz * scale
    if (!isOpen(tx, tz)) return
    const movedX = tx - currentX
    const movedZ = tz - currentZ
    const moved = Math.hypot(movedX, movedZ)
    if (moved < 1e-6) return
    const alignment = (movedX * ux + movedZ * uz) / moved
    candidates.push({ x: tx, z: tz, score: alignment * 10 + moved / Math.max(length, 1e-6) })
  }

  // Axis projections handle straight walls cheaply.
  addCandidate(dx, 0)
  addCandidate(0, dz)

  // Angled probes are what keep movement flowing around curved/concave V3
  // boundaries instead of getting caught when both axis projections fail.
  const angles = [22.5, -22.5, 45, -45, 67.5, -67.5, 90, -90]
  for (const degrees of angles) {
    const angle = THREE.MathUtils.degToRad(degrees)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const rx = dx * cos - dz * sin
    const rz = dx * sin + dz * cos
    addCandidate(rx, rz, 0.94)
    addCandidate(rx, rz, 0.68)
  }

  if (!candidates.length) return { x: currentX, z: currentZ }
  candidates.sort((a, b) => b.score - a.score)
  return { x: candidates[0].x, z: candidates[0].z }
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
  const instances: Array<{ x: number; z: number; y: number; width: number; depth: number; shade: number; yaw: number }> = []
  const cracks: Array<{ x: number; z: number; y: number; yaw: number; length: number }> = []
  let row = 0
  for (let z = Math.floor(bounds.minZ / FLOOR_BRICK_D) * FLOOR_BRICK_D; z <= bounds.maxZ; z += FLOOR_BRICK_D) {
    const shift = row % 2 ? FLOOR_BRICK_W / 2 : 0
    for (let x = Math.floor((bounds.minX - shift) / FLOOR_BRICK_W) * FLOOR_BRICK_W + shift; x <= bounds.maxX; x += FLOOR_BRICK_W) {
      const cx = x + FLOOR_BRICK_W / 2
      const cz = z + FLOOR_BRICK_D / 2
      if (!dungeonContainsPointV3(value, cx, cz, 0.12)) continue
      const hash = numberHash(Math.round(cx * 13), Math.round(cz * 19), value.seed)
      const chip = 0.93 + ((hash >>> 5) % 5) * 0.01
      const floorY = dungeonFloorHeightV3(value, cx, cz) + FLOOR_Y
      const damaged = hash % 17 === 0
      const missingCorner = hash % 29 === 0
      instances.push({
        x: cx,
        z: cz,
        y: floorY + (damaged ? -0.018 : ((hash >>> 14) % 3) * 0.004),
        width: FLOOR_BRICK_W * chip * (missingCorner ? 0.88 : 1),
        depth: FLOOR_BRICK_D * (0.9 + ((hash >>> 9) % 6) * 0.01) * (damaged ? 0.94 : 1),
        shade: damaged ? 0.7 + (hash % 7) / 100 : 0.88 + (hash % 11) / 100,
        yaw: ((hash >>> 18) % 5 - 2) * 0.004,
      })
      if (hash % 21 === 0) {
        cracks.push({
          x: cx + (((hash >>> 4) % 7) - 3) * 0.035,
          z: cz + (((hash >>> 7) % 5) - 2) * 0.03,
          y: floorY + 0.052,
          yaw: ((hash >>> 12) % 628) / 100,
          length: 0.28 + ((hash >>> 20) % 5) * 0.07,
        })
      }
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
    emissive: new THREE.Color(atmosphere.floor),
    emissiveIntensity: 0.3,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length)
  mesh.name = 'DungeonV3Floor'
  mesh.userData.dungeonSurface = true
  const dummy = new THREE.Object3D()
  const base = new THREE.Color(0xffffff)
  instances.forEach((instance, index) => {
    dummy.position.set(instance.x, instance.y, instance.z)
    dummy.rotation.set(0, instance.yaw, 0)
    dummy.scale.set(instance.width, 1, instance.depth)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, base.clone().multiplyScalar(instance.shade))
  })
  mesh.receiveShadow = true
  root.add(mesh)

  if (cracks.length) {
    const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x17110d, transparent: true, opacity: 0.72, depthWrite: false })
    const crackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.008, 0.045), crackMaterial, cracks.length)
    crackMesh.name = 'DungeonV3FloorCracks'
    cracks.forEach((crack, index) => {
      dummy.position.set(crack.x, crack.y, crack.z)
      dummy.rotation.set(0, crack.yaw, 0)
      dummy.scale.set(crack.length, 1, 1)
      dummy.updateMatrix()
      crackMesh.setMatrixAt(index, dummy.matrix)
    })
    crackMesh.renderOrder = 2
    root.add(crackMesh)
  }
}

function addFloorAtmosphere(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  bounds: ReturnType<typeof dungeonWorldBoundsV3>,
) {
  const patches: Array<{ x: number; z: number; y: number; sx: number; sz: number; yaw: number; shade: number }> = []
  const cell = 5.8
  const startX = Math.floor(bounds.minX / cell) * cell
  const startZ = Math.floor(bounds.minZ / cell) * cell
  for (let z = startZ; z <= bounds.maxZ; z += cell) {
    for (let x = startX; x <= bounds.maxX; x += cell) {
      const hash = numberHash(Math.round(x * 7), Math.round(z * 11), value.seed ^ 0x4a3d)
      if (hash % 4 !== 0) continue
      const px = x + ((hash >>> 8) % 100) / 100 * cell
      const pz = z + ((hash >>> 16) % 100) / 100 * cell
      if (!dungeonContainsPointV3(value, px, pz, 0.9)) continue
      patches.push({
        x: px,
        z: pz,
        y: dungeonFloorHeightV3(value, px, pz) + 0.096,
        sx: 0.7 + ((hash >>> 4) % 11) / 10,
        sz: 0.32 + ((hash >>> 12) % 8) / 10,
        yaw: ((hash >>> 20) % 628) / 100,
        shade: 0.55 + (hash % 15) / 100,
      })
    }
  }
  if (!patches.length) return

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(atmosphere.wallDark).multiplyScalar(0.8),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), material, patches.length)
  mesh.name = 'DungeonV3DampPatches'
  const dummy = new THREE.Object3D()
  patches.forEach((patch, index) => {
    dummy.position.set(patch.x, patch.y, patch.z)
    dummy.rotation.set(-Math.PI / 2, 0, patch.yaw)
    dummy.scale.set(patch.sx, patch.sz, 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  })
  mesh.renderOrder = 3
  root.add(mesh)
}

type BoundaryBrick = { x: number; y: number; z: number; length: number; yaw: number; shade: number; cap: boolean; base: boolean; damaged: boolean; nx: number; nz: number }

function addPerimeterWalls(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  bounds: ReturnType<typeof dungeonWorldBoundsV3>,
  mode: DungeonRenderMode,
) {
  const topDown = mode !== 'walk'
  const wallHeight = topDown ? 0.98 : Math.max(3.8, Math.min(5.2, averageRoomHeight(value)))
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

      const edges: Array<{ open: boolean; x: number; z: number; yaw: number; nx: number; nz: number }> = [
        { open: !dungeonContainsPointV3(value, cx, cz - WALL_SAMPLE, 0), x: cx, z, yaw: 0, nx: 0, nz: -1 },
        { open: !dungeonContainsPointV3(value, cx, cz + WALL_SAMPLE, 0), x: cx, z: z + WALL_SAMPLE, yaw: 0, nx: 0, nz: 1 },
        { open: !dungeonContainsPointV3(value, cx - WALL_SAMPLE, cz, 0), x, z: cz, yaw: Math.PI / 2, nx: -1, nz: 0 },
        { open: !dungeonContainsPointV3(value, cx + WALL_SAMPLE, cz, 0), x: x + WALL_SAMPLE, z: cz, yaw: Math.PI / 2, nx: 1, nz: 0 },
      ]

      for (const edge of edges) {
        if (!edge.open) continue
        const hash = numberHash(Math.round(edge.x * 23), Math.round(edge.z * 29), value.seed)
        for (let row = 0; row < rows; row += 1) {
          const actualHeight = Math.min(rowHeight * 0.9, wallHeight - row * rowHeight)
          if (actualHeight <= 0.04) continue
          const stagger = row % 2 ? WALL_SAMPLE * 0.08 : 0
          const cap = row === rows - 1
          const base = row === 0
          const damaged = ((hash >>> (row % 16)) + row * 7) % 23 === 0
          samples.push({
            x: edge.x + (edge.yaw === 0 ? stagger : 0),
            z: edge.z + (edge.yaw === 0 ? 0 : stagger),
            y: floorY + row * rowHeight + actualHeight / 2 - (damaged ? 0.025 : 0),
            length: WALL_SAMPLE * (damaged ? 0.82 : cap ? 1.08 : 1.03),
            yaw: edge.yaw,
            shade: (damaged ? 0.74 : 0.88) + (hash % 9) / 100,
            cap,
            base,
            damaged,
            nx: edge.nx,
            nz: edge.nz,
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
    emissive: new THREE.Color(atmosphere.wall),
    emissiveIntensity: topDown ? 0.16 : 0.1,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, samples.length)
  mesh.name = 'DungeonV3Perimeter'
  mesh.userData.dungeonWall = true
  const dummy = new THREE.Object3D()
  const white = new THREE.Color(0xffffff)
  samples.forEach((sample, index) => {
    const heightScale = rowHeight * (sample.cap ? 0.64 : sample.base ? 0.88 : sample.damaged ? 0.68 : 0.8)
    const depthScale = topDown
      ? sample.cap ? 0.42 : sample.base ? 0.38 : 0.3
      : sample.cap ? 0.58 : sample.base ? 0.52 : 0.42
    const outward = depthScale * 0.52
    dummy.position.set(sample.x + sample.nx * outward, sample.y, sample.z + sample.nz * outward)
    dummy.rotation.set(0, sample.yaw, 0)
    dummy.scale.set(sample.length, heightScale, depthScale)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    const color = white.clone().multiplyScalar(sample.shade + (sample.cap ? 0.1 : sample.base ? -0.03 : 0))
    mesh.setColorAt(index, color)
  })
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
}

type V3ArtMaterials = {
  stone: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  cap: THREE.MeshStandardMaterial
  bone: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  gold: THREE.MeshStandardMaterial
}

function createArtMaterials(atmosphere: DungeonAtmosphere): V3ArtMaterials {
  return {
    stone: new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.91, metalness: 0.01 }),
    dark: new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.96, metalness: 0.005 }),
    cap: new THREE.MeshStandardMaterial({
      color: new THREE.Color(atmosphere.wall).offsetHSL(-0.01, -0.14, -0.045),
      roughness: 0.93,
      metalness: 0.005,
    }),
    bone: new THREE.MeshStandardMaterial({ color: 0xb8aa8a, roughness: 0.9, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5d5146, roughness: 0.7, metalness: 0.32 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x4e2c28, roughness: 0.92, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5f432c, roughness: 0.88, metalness: 0 }),
    gold: new THREE.MeshStandardMaterial({ color: 0x5b5042, roughness: 0.84, metalness: 0.12 }),
  }
}

function corridorStructuralSupports(value: DungeonWithProps, edge: DungeonCorridor) {
  const path = dungeonCorridorPath(value, edge)
  const total = pathLength(path)
  const supports: Array<{ x: number; z: number; yaw: number; damaged: boolean }> = []
  if (path.length < 2 || total < 13) return supports

  // Evergrow-style corridors read primarily as masonry passages. Structural
  // accents are sparse and wall-attached instead of freestanding every few m.
  const count = Math.max(0, Math.floor(total / 16))
  for (let index = 1; index <= count; index += 1) {
    const sample = samplePathAtDistance(path, index * total / (count + 1))
    if (!sample) continue
    if (value.rooms.some((room) => dungeonRoomContainsV3(room, sample.x, sample.z, 2.2))) continue
    const side = index % 2 ? 1 : -1
    const half = Math.max(1.35, edge.width / 2 - 0.12)
    const px = -Math.cos(sample.yaw) * side
    const pz = Math.sin(sample.yaw) * side
    supports.push({
      x: sample.x + px * half,
      z: sample.z + pz * half,
      yaw: sample.yaw,
      damaged: (stringHash(edge.id) + index) % 4 === 0,
    })
  }
  return supports
}

function addCorridorArchitecture(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  mode: DungeonRenderMode,
) {
  const materials = createArtMaterials(atmosphere)
  const topDown = mode !== 'walk'
  if (topDown) return
  for (const edge of value.corridors) {
    const path = dungeonCorridorPath(value, edge)
    const total = pathLength(path)
    if (path.length < 2 || total < 5) continue

    for (const support of corridorStructuralSupports(value, edge)) {
      const floorY = dungeonFloorHeightV3(value, support.x, support.z)
      addWallButtress(root, support.x, floorY, support.z, support.yaw, materials, mode, support.damaged)

      const recess = new THREE.Group()
      recess.position.set(support.x, floorY, support.z)
      recess.rotation.y = support.yaw
      root.add(recess)
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, topDown ? 0.55 : 1.55, 0.13), materials.dark)
      back.position.y = topDown ? 0.34 : 0.86
      back.castShadow = true
      recess.add(back)
    }

    if (!topDown && total > 18) {
      const midpoint = samplePathAtDistance(path, total * 0.5)
      if (midpoint && !value.rooms.some((room) => dungeonRoomContainsV3(room, midpoint.x, midpoint.z, 2.4))) {
        addArchLintel(root, midpoint.x, dungeonFloorHeightV3(value, midpoint.x, midpoint.z), midpoint.z, midpoint.yaw, edge.width, materials, 3.2)
      }
    }
  }
}

function roomStructuralSupports(room: DungeonRoom) {
  const template = resolveRoomTemplate(room)
  const points: Array<{ x: number; z: number; yaw: number; damaged: boolean }> = []
  const angle = THREE.MathUtils.degToRad(room.rotation)

  // Ordinary rooms intentionally have none. Large ritual/warden spaces may
  // have two or four masonry buttresses integrated into the walls.
  const local: Array<{ x: number; z: number; yaw: number }> = []
  if (template === 'warden-sanctum') {
    local.push(
      { x: -room.width * 0.3, z: -room.depth / 2, yaw: 0 },
      { x: room.width * 0.3, z: -room.depth / 2, yaw: 0 },
    )
  } else if (template === 'warden-hall' && room.width >= 18) {
    local.push({ x: 0, z: -room.depth / 2, yaw: 0 })
  }

  local.forEach((point, index) => {
    const world = localToWorld(room, point.x, point.z)
    points.push({
      x: world.x,
      z: world.z,
      yaw: angle + point.yaw,
      damaged: (stringHash(room.id) + index * 13) % 5 === 0,
    })
  })
  return points
}

function addRoomArchitecture(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  mode: DungeonRenderMode,
) {
  const materials = createArtMaterials(atmosphere)
  const topDown = mode !== 'walk'
  const roomMap = new Map(value.rooms.map((room) => [room.id, room]))

  for (const room of value.rooms) {
    if (!topDown) {
      for (const support of roomStructuralSupports(room)) {
        addWallButtress(root, support.x, room.floorLevel, support.z, support.yaw, materials, mode, support.damaged)
      }
    }

    // Doors are architectural objects, not holes in giant room boxes. Every
    // connected passage gets the same frame language so procedural rooms read
    // as one authored kit.
    for (const edge of value.corridors) {
      const otherId = edge.fromRoomId === room.id ? edge.toRoomId : edge.toRoomId === room.id ? edge.fromRoomId : undefined
      if (!otherId) continue
      const other = roomMap.get(otherId)
      if (!other) continue
      if (topDown) continue
      const connection = getRoomConnection(room, other, edge.width)
      const yaw = THREE.MathUtils.degToRad(connection.yaw)
      const doorway = new THREE.Group()
      doorway.position.set(connection.x, room.floorLevel, connection.z)
      doorway.rotation.y = yaw
      root.add(doorway)

      const postHeight = topDown ? 0.92 : 2.95
      const postWidth = 0.24
      const half = Math.max(1.45, edge.width / 2)
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postWidth, postHeight, 0.28), materials.stone)
        post.position.set(side * half, postHeight / 2, 0)
        post.castShadow = true
        post.receiveShadow = true
        doorway.add(post)

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.13, 0.34), materials.dark)
        foot.position.set(side * half, 0.11, 0)
        foot.castShadow = true
        doorway.add(foot)

        const capital = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.34), materials.cap)
        capital.position.set(side * half, postHeight - 0.1, 0)
        capital.castShadow = true
        doorway.add(capital)
      }

      if (!topDown) {
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.9, 0.42, 0.72), materials.cap)
        lintel.position.y = postHeight + 0.08
        lintel.castShadow = true
        doorway.add(lintel)
        for (const side of [-1, 1]) {
          const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.48, 0.66), materials.stone)
          wedge.position.set(side * (half * 0.63), postHeight - 0.2, 0)
          wedge.rotation.z = side * 0.32
          wedge.castShadow = true
          doorway.add(wedge)
        }
      }
    }
  }
}

function addWallButtress(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  yaw: number,
  materials: V3ArtMaterials,
  mode: DungeonRenderMode,
  damaged = false,
) {
  const topDown = mode !== 'walk'
  const height = topDown ? (damaged ? 0.82 : 1.18) : (damaged ? 2.25 : 3.35)
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = yaw
  root.add(group)

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.42), materials.dark)
  plinth.position.set(0, 0.09, 0.03)
  plinth.castShadow = true
  plinth.receiveShadow = true
  group.add(plinth)

  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(damaged ? 0.42 : 0.48, height - 0.22, damaged ? 0.28 : 0.32),
    materials.stone,
  )
  shaft.position.set(0, 0.18 + (height - 0.22) / 2, 0.08)
  shaft.rotation.z = damaged ? 0.018 : 0
  shaft.castShadow = true
  shaft.receiveShadow = true
  group.add(shaft)

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.38), materials.cap)
  cap.position.set(0, height - 0.03, 0.06)
  cap.castShadow = true
  group.add(cap)

  if (damaged) {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), materials.dark)
    chip.position.set(0.18, height * 0.68, 0.08)
    chip.rotation.set(0.18, 0.22, 0.28)
    group.add(chip)
  }
}

function addArchLintel(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  yaw: number,
  width: number,
  materials: V3ArtMaterials,
  height: number,
) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = yaw
  root.add(group)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(Math.max(3.2, width + 0.7), 0.38, 0.62), materials.cap)
  lintel.position.y = height
  lintel.castShadow = true
  group.add(lintel)
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.7), materials.stone)
  keystone.position.y = height - 0.05
  keystone.rotation.z = 0.06
  keystone.castShadow = true
  group.add(keystone)
}

function pathLength(path: DungeonPoint[]) {
  let total = 0
  for (let index = 1; index < path.length; index += 1) total += Math.hypot(path[index].x - path[index - 1].x, path[index].z - path[index - 1].z)
  return total
}

function samplePathAtDistance(path: DungeonPoint[], distance: number) {
  if (path.length < 2) return undefined
  let travelled = 0
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (travelled + length >= distance) {
      const t = length > 0.0001 ? (distance - travelled) / length : 0
      return {
        x: THREE.MathUtils.lerp(a.x, b.x, t),
        z: THREE.MathUtils.lerp(a.z, b.z, t),
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
      }
    }
    travelled += length
  }
  const a = path[path.length - 2]
  const b = path[path.length - 1]
  return { x: b.x, z: b.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }
}

let warmPoolTexture: THREE.CanvasTexture | undefined

function getWarmPoolTexture() {
  if (warmPoolTexture || typeof document === 'undefined') return warmPoolTexture
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const gradient = context.createRadialGradient(48, 48, 2, 48, 48, 48)
  gradient.addColorStop(0, 'rgba(255,220,165,0.72)')
  gradient.addColorStop(0.32, 'rgba(255,170,92,0.34)')
  gradient.addColorStop(0.72, 'rgba(255,130,64,0.09)')
  gradient.addColorStop(1, 'rgba(255,110,45,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 96, 96)
  warmPoolTexture = new THREE.CanvasTexture(canvas)
  warmPoolTexture.colorSpace = THREE.SRGBColorSpace
  warmPoolTexture.needsUpdate = true
  return warmPoolTexture
}

function addWarmLightPool(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  opacity: number,
) {
  const texture = getWarmPoolTexture()
  if (!texture) return
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffa666,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
  pool.rotation.x = -Math.PI / 2
  pool.position.set(x, y, z)
  pool.renderOrder = 4
  parent.add(pool)
}

function addFlameVfx(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  atmosphere: DungeonAtmosphere,
  seed: number,
  light?: THREE.PointLight,
  scale = 1,
) {
  const root = new THREE.Group()
  root.position.set(x, y, z)
  parent.add(root)

  const outerMaterial = new THREE.MeshBasicMaterial({
    color: atmosphere.torch,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  })
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe2a3,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  })
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa05b,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  })

  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.105 * scale, 0.32 * scale, 9), outerMaterial)
  outer.position.y = 0.15 * scale
  root.add(outer)

  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.052 * scale, 0.2 * scale, 8), innerMaterial)
  inner.position.y = 0.105 * scale
  root.add(inner)

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.23 * scale, 10, 7), glowMaterial)
  glow.scale.y = 1.15
  glow.position.y = 0.11 * scale
  root.add(glow)

  const emberCount = 6
  const emberPositions = new Float32Array(emberCount * 3)
  const emberGeometry = new THREE.BufferGeometry()
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3))
  const emberMaterial = new THREE.PointsMaterial({
    color: 0xffb06c,
    size: 0.035 * scale,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
  const embers = new THREE.Points(emberGeometry, emberMaterial)
  root.add(embers)

  const phase = (seed % 997) / 997 * Math.PI * 2
  const speed = 6.1 + (seed % 7) * 0.14
  outer.onBeforeRender = () => {
    const t = performance.now() * 0.001
    const n = Math.sin(t * speed + phase) * 0.08 + Math.sin(t * speed * 2.23 + phase * 0.37) * 0.035
    outer.scale.set(1 - n * 0.35, 1 + n, 1 - n * 0.35)
    outer.rotation.y = Math.sin(t * 2.7 + phase) * 0.12
    inner.scale.set(0.94 + n * 0.18, 1.04 + n * 0.5, 0.94 + n * 0.18)
    glow.scale.setScalar(1 + n * 0.55)
    glow.scale.y = 1.15 + n * 0.35
    if (light) light.intensity = Math.max(0, light.userData.baseIntensity * (1 + n * 0.42))

    for (let index = 0; index < emberCount; index += 1) {
      const offset = index * 3
      const localPhase = phase + index * 1.913
      const cycle = (t * (0.34 + index * 0.025) + index / emberCount + (seed % 31) * 0.013) % 1
      const spread = (0.035 + cycle * 0.085) * scale
      emberPositions[offset] = Math.sin(localPhase + t * 1.2) * spread
      emberPositions[offset + 1] = (0.24 + cycle * 0.72) * scale
      emberPositions[offset + 2] = Math.cos(localPhase * 1.17 + t * 0.9) * spread
    }
    ;(emberGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    emberMaterial.opacity = 0.55 + Math.sin(t * 3.1 + phase) * 0.16
  }

  return root
}

function addCorridorFixtures(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  flickerLights: DungeonV3FlickerLight[],
  mode: DungeonRenderMode,
) {
  const materials = createArtMaterials(atmosphere)
  for (const edge of value.corridors) {
    const path = dungeonCorridorPath(value, edge)
    const total = pathLength(path)
    if (path.length < 2 || total < 9) continue
    const count = Math.max(1, Math.floor(total / 13))
    for (let index = 1; index <= count; index += 1) {
      const sample = samplePathAtDistance(path, index * total / (count + 1))
      if (!sample) continue
      if (value.rooms.some((room) => dungeonRoomContainsV3(room, sample.x, sample.z, 2.15))) continue
      const side = index % 2 ? 1 : -1
      const offset = Math.max(1.22, edge.width / 2 - 0.34)
      const px = -Math.cos(sample.yaw) * side
      const pz = Math.sin(sample.yaw) * side
      const x = sample.x + px * offset
      const z = sample.z + pz * offset
      const y = dungeonFloorHeightV3(value, sample.x, sample.z)
      const fixtureYaw = sample.yaw + side * Math.PI / 2
      addWallSconce(root, x, y, z, fixtureYaw, atmosphere, materials, flickerLights, mode, stringHash(edge.id) + index * 31)
    }
  }
}

function addWallSconce(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  yaw: number,
  atmosphere: DungeonAtmosphere,
  materials: V3ArtMaterials,
  flickerLights: DungeonV3FlickerLight[],
  mode: DungeonRenderMode,
  seed: number,
) {
  const flameY = mode === 'walk' ? 1.88 : 0.98
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = yaw
  root.add(group)

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.055), materials.metal)
  plate.position.set(0, flameY - 0.21, -0.035)
  plate.castShadow = true
  group.add(plate)

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.3), materials.metal)
  arm.position.set(0, flameY - 0.18, 0.13)
  arm.rotation.x = -0.2
  group.add(arm)

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.075, 0.09, 9), materials.metal)
  cup.position.set(0, flameY - 0.01, 0.27)
  cup.castShadow = true
  group.add(cup)

  const light = new THREE.PointLight(atmosphere.torch, atmosphere.torchIntensity * 0.68, 8.6, 2.05)
  light.position.set(0, flameY + 0.16, 0.27)
  light.userData.baseIntensity = light.intensity
  group.add(light)
  flickerLights.push({
    light,
    base: light.intensity,
    phase: (seed % 628) / 100,
    speed: 5.8 + (seed % 5) * 0.18,
  })
  addFlameVfx(group, 0, flameY + 0.02, 0.27, atmosphere, seed, light, 1)
  addWarmLightPool(group, 0, 0.105, 1.12, 4.4, 3.2, 0.12)
}

function addRoomFixtures(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  flickerLights: DungeonV3FlickerLight[],
  mode: DungeonRenderMode,
) {
  const fixtureY = mode === 'walk' ? 2.0 : 1.05
  for (const room of value.rooms) {
    const allPositions: Array<{ x: number; z: number; yaw: number }> = [
      roomWallPoint(room, 'north', -0.24, 0.28),
      roomWallPoint(room, 'east', 0.2, 0.28),
      roomWallPoint(room, 'south', 0.24, 0.28),
      roomWallPoint(room, 'west', -0.2, 0.28),
    ]
    const largeRoom = room.type === 'boss' || room.type === 'elite' || room.width * room.depth >= 520
    const positions = largeRoom ? allPositions : [allPositions[0], allPositions[2]]

    positions.forEach((position, index) => {
      const fixture = new THREE.Group()
      fixture.position.set(position.x, room.floorLevel, position.z)
      fixture.rotation.y = position.yaw
      root.add(fixture)

      const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x242728, roughness: 0.76, metalness: 0.34 })
      const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.055), bracketMaterial)
      backplate.position.set(0, fixtureY - 0.21, -0.035)
      backplate.castShadow = true
      fixture.add(backplate)

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.3), bracketMaterial)
      arm.position.set(0, fixtureY - 0.18, 0.13)
      arm.rotation.x = -0.2
      fixture.add(arm)

      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.075, 0.09, 9), bracketMaterial)
      cup.position.set(0, fixtureY - 0.01, 0.27)
      fixture.add(cup)

      const seed = stringHash(room.id) + index * 17
      const light = new THREE.PointLight(
        atmosphere.torch,
        atmosphere.torchIntensity * (room.type === 'boss' ? 0.86 : 0.72),
        room.type === 'boss' ? 10.8 : 8.8,
        2.02,
      )
      light.position.set(0, fixtureY + 0.16, 0.27)
      light.userData.baseIntensity = light.intensity
      fixture.add(light)
      flickerLights.push({
        light,
        base: light.intensity,
        phase: (seed % 628) / 100,
        speed: 5.25 + index * 0.3,
      })
      addFlameVfx(fixture, 0, fixtureY + 0.02, 0.27, atmosphere, seed, light, room.type === 'boss' ? 1.08 : 1)
      addWarmLightPool(fixture, 0, 0.105, 1.18, room.type === 'boss' ? 5.8 : 4.8, room.type === 'boss' ? 4.4 : 3.6, room.type === 'boss' ? 0.14 : 0.115)
    })
  }
}

type V3ArtCollider = { x: number; z: number; radius: number }
const artColliderCaches = new WeakMap<object, readonly V3ArtCollider[]>()

export function dungeonArtCollidesV3(value: DungeonWithProps, x: number, z: number, radius = 0.3) {
  const colliders = dungeonArtCollidersV3(value)
  for (const collider of colliders) {
    if (Math.hypot(x - collider.x, z - collider.z) <= collider.radius + radius) return true
  }
  return false
}

function dungeonArtCollidersV3(value: DungeonWithProps): readonly V3ArtCollider[] {
  const cached = artColliderCaches.get(value)
  if (cached) return cached

  const colliders: V3ArtCollider[] = []
  const add = (x: number, z: number, radius: number) => colliders.push({ x, z, radius })

  for (const room of value.rooms) {
    const template = resolveRoomTemplate(room)
    const place = (xFraction: number, zFraction: number, radius: number) => {
      const point = roomPlacement(room, xFraction, zFraction)
      add(point.x, point.z, radius)
    }

    // Only objects a player would realistically need to walk around are solid.
    if (template === 'burial-chamber') {
      place(-0.28, 0.18, 0.9)
      place(0.28, 0.18, 0.9)
    } else if (template === 'ossuary-gallery') {
      place(-0.3, -0.24, 0.88)
      place(-0.3, 0.03, 0.88)
      place(-0.3, 0.3, 0.88)
    } else if (template === 'warden-hall') {
      place(-0.31, -0.2, 0.62)
      place(0.31, -0.2, 0.62)
    } else if (template === 'reliquary') {
      place(0, 0.02, 1.0)
    } else if (template === 'shrine-hall') {
      place(0, 0.02, 1.08)
    } else if (template === 'warden-sanctum') {
      place(0, 0, 1.72)
      place(-0.34, 0.18, 0.64)
      place(0.34, 0.18, 0.64)
    } else if (template === 'sealed-ossuary') {
      place(0, 0.08, 0.92)
    } else if (template === 'storage-vault') {
      place(-0.28, 0.2, 0.68)
      place(0.3, -0.18, 0.68)
    }
  }

  const frozen = Object.freeze(colliders)
  artColliderCaches.set(value, frozen)
  return frozen
}

function addRoomDressing(
  root: THREE.Group,
  value: DungeonWithProps,
  atmosphere: DungeonAtmosphere,
  mode: DungeonRenderMode,
) {
  const materials = createArtMaterials(atmosphere)
  for (const room of value.rooms) {
    const template = resolveRoomTemplate(room)
    const random = seededRandom(stringHash(room.id) ^ value.seed)

    // Keep most of the playable floor intentionally empty. Dressing is a focal
    // cluster, not a scatter pass.
    if (template === 'threshold') {
      if (random() > 0.7) addRubbleCluster(root, room, 0.34, 0.34, materials, random, false)
      addCandleCluster(root, room, -0.34, 0.3, atmosphere, stringHash(room.id) + 3)
      continue
    }

    if (template === 'burial-chamber') {
      addSarcophagus(root, room, -0.28, 0.18, 0.03, materials)
      addSarcophagus(root, room, 0.28, 0.18, -0.03, materials)
      if (random() > 0.5) addBonePile(root, room, 0, -0.27, materials, random)
      continue
    }

    if (template === 'ossuary-gallery') {
      addSarcophagus(root, room, -0.3, -0.2, 0.02, materials)
      addSarcophagus(root, room, -0.3, 0.22, -0.02, materials)
      if (random() > 0.6) addBonePile(root, room, 0.28, 0.24, materials, random)
      continue
    }

    if (template === 'crossroads') {
      if (random() > 0.55) addRubbleCluster(root, room, 0.34, 0.29, materials, random, false)
      continue
    }

    if (template === 'warden-hall') {
      addStatue(root, room, -0.31, -0.2, 0, materials, mode)
      addStatue(root, room, 0.31, -0.2, Math.PI, materials, mode)
      if (random() > 0.55) addRoomBanner(root, room, 0, 0.42, materials, mode, 0x4b3430)
      continue
    }

    if (template === 'reliquary') {
      addReliquary(root, room, 0, 0.02, materials)
      addCandleCluster(root, room, -0.28, 0.29, atmosphere, stringHash(room.id) + 41)
      continue
    }

    if (template === 'shrine-hall') {
      addShrine(root, room, 0, 0.02, materials)
      addCandleCluster(root, room, -0.3, 0.27, atmosphere, stringHash(room.id) + 71)
      addCandleCluster(root, room, 0.3, 0.27, atmosphere, stringHash(room.id) + 89)
      continue
    }

    if (template === 'warden-sanctum') {
      addBossDais(root, room, materials)
      addStatue(root, room, -0.34, 0.18, Math.PI / 2, materials, mode)
      addStatue(root, room, 0.34, 0.18, -Math.PI / 2, materials, mode)
      continue
    }

    if (template === 'sealed-ossuary') {
      addSarcophagus(root, room, 0, 0.08, 0, materials)
      if (random() > 0.5) addBonePile(root, room, 0.29, -0.24, materials, random)
      continue
    }

    if (template === 'storage-vault') {
      addCrateStack(root, room, -0.28, 0.2, materials, random)
      addCrateStack(root, room, 0.3, -0.18, materials, random)
      continue
    }

    if (room.type === 'boss') addBossDais(root, room, materials)
    else if (room.type === 'treasure') addReliquary(root, room, 0, 0, materials)
    else if (room.type === 'shrine') addShrine(root, room, 0, 0, materials)
    else if (room.type === 'combat' || room.type === 'elite') {
      addSarcophagus(root, room, -0.26, 0.2, 0, materials)
    } else if (random() > 0.7) {
      addRubbleCluster(root, room, 0.28, 0.28, materials, random, false)
    }
  }
}

function addCandleCluster(
  root: THREE.Group,
  room: DungeonRoom,
  xFraction: number,
  zFraction: number,
  atmosphere: DungeonAtmosphere,
  seed: number,
) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw
  root.add(group)

  const wax = new THREE.MeshStandardMaterial({ color: 0xc7bfae, roughness: 0.9, metalness: 0 })
  const baseOffsets = [
    { x: -0.13, z: 0.02, h: 0.22 },
    { x: 0.08, z: -0.07, h: 0.31 },
    { x: 0.18, z: 0.1, h: 0.17 },
  ]
  baseOffsets.forEach((entry, index) => {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, entry.h, 8), wax)
    candle.position.set(entry.x, entry.h / 2 + 0.03, entry.z)
    candle.castShadow = true
    group.add(candle)
    addFlameVfx(group, entry.x, entry.h + 0.04, entry.z, atmosphere, seed + index * 19, undefined, 0.46)
  })

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.38, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2b2a, roughness: 0.76, metalness: 0.24 }),
  )
  plate.position.y = 0.025
  plate.receiveShadow = true
  group.add(plate)
}

function resolveRoomTemplate(room: DungeonRoom) {
  if (room.template) return room.template
  if (room.type === 'entrance') return 'threshold'
  if (room.type === 'boss') return 'warden-sanctum'
  if (room.type === 'elite') return 'warden-hall'
  if (room.type === 'treasure') return 'reliquary'
  if (room.type === 'shrine') return 'shrine-hall'
  if (room.type === 'secret') return 'sealed-ossuary'
  if (room.type === 'utility') return 'storage-vault'
  if (room.shape === 'cross') return 'crossroads'
  return 'burial-chamber'
}


function roomPlacement(room: DungeonRoom, xFraction: number, zFraction: number, yaw = 0) {
  const localX = room.width * xFraction
  const localZ = room.depth * zFraction
  const world = localToWorld(room, localX, localZ)
  return {
    x: world.x,
    y: room.floorLevel,
    z: world.z,
    yaw: THREE.MathUtils.degToRad(room.rotation) + yaw,
  }
}

function addSarcophagus(
  root: THREE.Group,
  room: DungeonRoom,
  xFraction: number,
  zFraction: number,
  yaw: number,
  materials: V3ArtMaterials,
) {
  const p = roomPlacement(room, xFraction, zFraction, yaw)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw
  root.add(group)

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.24, 2.5), materials.dark)
  base.position.y = 0.12
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.34, 2.28), materials.stone)
  body.position.y = 0.34
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 2.06), materials.cap)
  lid.position.y = 0.59
  lid.castShadow = true
  group.add(lid)

  const inset = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 1.22), materials.dark)
  inset.position.y = 0.7
  group.add(inset)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), materials.bone)
  head.scale.set(0.9, 0.55, 1.05)
  head.position.set(0, 0.76, -0.64)
  group.add(head)
}

function addReliquary(root: THREE.Group, room: DungeonRoom, xFraction: number, zFraction: number, materials: V3ArtMaterials) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw
  root.add(group)

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.26, 8), materials.dark)
  lower.position.y = 0.13
  lower.castShadow = true
  lower.receiveShadow = true
  group.add(lower)
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.22, 8), materials.stone)
  upper.position.y = 0.37
  upper.castShadow = true
  group.add(upper)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.58, 0.74), materials.wood)
  chest.position.y = 0.76
  chest.castShadow = true
  group.add(chest)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.18, 0.8), materials.gold)
  lid.position.y = 1.13
  lid.rotation.x = -0.08
  group.add(lid)
  for (const x of [-0.43, 0.43]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.8), materials.metal)
    band.position.set(x, 0.79, 0)
    group.add(band)
  }
}

function addShrine(root: THREE.Group, room: DungeonRoom, xFraction: number, zFraction: number, materials: V3ArtMaterials) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw
  root.add(group)

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.24, 8), materials.dark)
  base.position.y = 0.12
  base.receiveShadow = true
  group.add(base)
  const step = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.24, 0.2, 8), materials.stone)
  step.position.y = 0.33
  group.add(step)
  const altar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.82, 0.88), materials.cap)
  altar.position.y = 0.79
  altar.castShadow = true
  group.add(altar)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.16, 1.05), materials.stone)
  slab.position.y = 1.28
  group.add(slab)
  const relic = new THREE.Mesh(new THREE.OctahedronGeometry(0.23), materials.gold)
  relic.position.y = 1.65
  relic.rotation.y = Math.PI / 4
  group.add(relic)
}

function addBossDais(root: THREE.Group, room: DungeonRoom, materials: V3ArtMaterials) {
  const p = roomPlacement(room, 0, 0)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  root.add(group)

  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.35, 0.22, 12), materials.dark)
  bottom.position.y = 0.11
  bottom.receiveShadow = true
  group.add(bottom)
  const middle = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.95, 0.18, 12), materials.stone)
  middle.position.y = 0.31
  group.add(middle)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.62, 0.16, 12), materials.cap)
  top.position.y = 0.48
  group.add(top)
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.025, 12), materials.dark)
  seal.position.y = 0.575
  group.add(seal)
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.62), materials.stone)
    stone.position.set(Math.cos(angle) * 1.55, 0.68, Math.sin(angle) * 1.55)
    stone.rotation.y = -angle
    stone.castShadow = true
    group.add(stone)
  }
}

function addStatue(
  root: THREE.Group,
  room: DungeonRoom,
  xFraction: number,
  zFraction: number,
  yaw: number,
  materials: V3ArtMaterials,
  mode: DungeonRenderMode,
) {
  const p = roomPlacement(room, xFraction, zFraction, yaw)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw
  root.add(group)
  const topDown = mode !== 'walk'

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.28, 8), materials.dark)
  base.position.y = 0.14
  group.add(base)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, topDown ? 0.68 : 1.12, 4, 8), materials.stone)
  body.position.y = topDown ? 0.82 : 1.08
  body.castShadow = true
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 7), materials.cap)
  head.position.y = topDown ? 1.34 : 1.86
  group.add(head)
  const staff = new THREE.Mesh(new THREE.BoxGeometry(0.08, topDown ? 1.0 : 1.65, 0.08), materials.metal)
  staff.position.set(0.38, topDown ? 0.82 : 1.12, 0.02)
  staff.rotation.z = -0.08
  group.add(staff)
}

function addBrokenPlinth(root: THREE.Group, room: DungeonRoom, xFraction: number, zFraction: number, materials: V3ArtMaterials, random: () => number) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  root.add(group)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.18, 1.55), materials.dark)
  slab.position.y = 0.09
  slab.rotation.y = random() * 0.15
  group.add(slab)
  for (let index = 0; index < 5; index += 1) {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.25 + random() * 0.28, 0.12 + random() * 0.18, 0.22 + random() * 0.3), index % 2 ? materials.stone : materials.cap)
    chip.position.set((random() - 0.5) * 1.35, 0.18 + random() * 0.1, (random() - 0.5) * 1.35)
    chip.rotation.set(random() * 0.25, random() * Math.PI, random() * 0.25)
    group.add(chip)
  }
}

function addRubbleCluster(
  root: THREE.Group,
  room: DungeonRoom,
  xFraction: number,
  zFraction: number,
  materials: V3ArtMaterials,
  random: () => number,
  bones: boolean,
) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  root.add(group)
  for (let index = 0; index < 7; index += 1) {
    const size = 0.12 + random() * 0.3
    const mesh = bones
      ? new THREE.Mesh(new THREE.CapsuleGeometry(0.035, size * 0.55, 3, 5), materials.bone)
      : new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), index % 3 ? materials.dark : materials.stone)
    mesh.position.set((random() - 0.5) * 1.35, bones ? 0.07 : size * 0.42, (random() - 0.5) * 1.15)
    mesh.rotation.set(random() * 0.5, random() * Math.PI, random() * 0.5)
    mesh.castShadow = !bones
    group.add(mesh)
  }
}

function addBonePile(root: THREE.Group, room: DungeonRoom, xFraction: number, zFraction: number, materials: V3ArtMaterials, random: () => number) {
  addRubbleCluster(root, room, xFraction, zFraction, materials, random, true)
  const p = roomPlacement(room, xFraction, zFraction)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), materials.bone)
  skull.scale.set(1, 0.82, 0.92)
  skull.position.set(p.x + 0.16, p.y + 0.1, p.z - 0.08)
  root.add(skull)
}

function addUrnCluster(root: THREE.Group, room: DungeonRoom, xFraction: number, zFraction: number, materials: V3ArtMaterials, random: () => number) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  root.add(group)
  for (let index = 0; index < 3; index += 1) {
    const height = 0.34 + random() * 0.2
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, height, 7), index === 1 ? materials.cap : materials.stone)
    urn.position.set((index - 1) * 0.32 + (random() - 0.5) * 0.08, height / 2, (random() - 0.5) * 0.24)
    urn.rotation.y = random() * 0.5
    urn.castShadow = true
    group.add(urn)
  }
}

function addCrateStack(root: THREE.Group, room: DungeonRoom, xFraction: number, zFraction: number, materials: V3ArtMaterials, random: () => number) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw + (random() - 0.5) * 0.4
  root.add(group)

  const crates = [
    { x: -0.25, y: 0.3, z: 0, size: 0.58 },
    { x: 0.3, y: 0.26, z: 0.12, size: 0.5 },
    { x: -0.05, y: 0.78, z: 0.03, size: 0.48 },
  ]
  for (const crate of crates) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(crate.size, crate.size, crate.size), materials.wood)
    mesh.position.set(crate.x, crate.y, crate.z)
    mesh.rotation.y = (random() - 0.5) * 0.28
    mesh.castShadow = true
    group.add(mesh)
    const band = new THREE.Mesh(new THREE.BoxGeometry(crate.size + 0.03, 0.06, crate.size + 0.03), materials.metal)
    band.position.set(crate.x, crate.y, crate.z)
    group.add(band)
  }
}

function addRoomBanner(
  root: THREE.Group,
  room: DungeonRoom,
  xFraction: number,
  zFraction: number,
  materials: V3ArtMaterials,
  mode: DungeonRenderMode,
  color: number,
) {
  const p = roomPlacement(room, xFraction, zFraction)
  const group = new THREE.Group()
  group.position.set(p.x, p.y, p.z)
  group.rotation.y = p.yaw
  root.add(group)
  const height = mode === 'walk' ? 1.85 : 0.9
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.08), materials.metal)
  bar.position.y = height
  group.add(bar)
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.96, side: THREE.DoubleSide })
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.72, mode === 'walk' ? 1.15 : 0.55), cloth)
  banner.position.y = height - (mode === 'walk' ? 0.62 : 0.33)
  banner.rotation.x = -Math.PI / 2.1
  group.add(banner)
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
  const wallAlong = room.shape === 'cross' ? THREE.MathUtils.clamp(along, -0.16, 0.16) : along
  if (side === 'north') { x = room.width * wallAlong; z = -room.depth / 2 + inset; yaw = 0 }
  if (side === 'south') { x = room.width * wallAlong; z = room.depth / 2 - inset; yaw = Math.PI }
  if (side === 'east') { x = room.width / 2 - inset; z = room.depth * wallAlong; yaw = -Math.PI / 2 }
  if (side === 'west') { x = -room.width / 2 + inset; z = room.depth * wallAlong; yaw = Math.PI / 2 }
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
