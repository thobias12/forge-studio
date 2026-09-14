export type DungeonTheme = 'crypt' | 'castle' | 'cave' | 'cathedral' | 'mine' | 'sewer' | 'void'
export type DungeonRoomType = 'entrance' | 'combat' | 'treasure' | 'elite' | 'shrine' | 'boss' | 'secret' | 'utility'
export type DungeonMarkerType = 'door' | 'enemy' | 'loot' | 'checkpoint' | 'portal' | 'trigger' | 'light'

export type DungeonRoom = {
  id: string
  name: string
  type: DungeonRoomType
  x: number
  z: number
  width: number
  depth: number
  height: number
  rotation: 0 | 90 | 180 | 270
  floorLevel: number
  tags: string[]
}

export type DungeonCorridor = {
  id: string
  fromRoomId: string
  toRoomId: string
  width: number
  style: 'straight' | 'l'
}

export type DungeonMarker = {
  id: string
  type: DungeonMarkerType
  x: number
  y: number
  z: number
  roomId?: string
  name: string
  radius?: number
  data: Record<string, string | number | boolean>
}

export type ForgeDungeonPackage = {
  format: 'forge-dungeon-package'
  version: 1
  name: string
  targetGame: 'skillbound'
  theme: DungeonTheme
  gridSize: number
  seed: number
  createdAt: string
  updatedAt: string
  rooms: DungeonRoom[]
  corridors: DungeonCorridor[]
  markers: DungeonMarker[]
  settings: {
    wallThickness: number
    ambientLight: number
    fogDensity: number
    snap: boolean
  }
}

export type DungeonValidation = {
  ok: boolean
  warnings: string[]
  reachableRoomIds: Set<string>
}

export type DungeonConnection = {
  side: 'north' | 'south' | 'east' | 'west'
  offset: number
  x: number
  z: number
  yaw: number
  openingWidth: number
}

export function createStarterDungeon(): ForgeDungeonPackage {
  const now = new Date().toISOString()
  const entrance = room('Entrance', 'entrance', -8, 0, 7, 7)
  const combat = room('Crossroads', 'combat', 2, 0, 9, 8)
  const treasure = room('Treasure Alcove', 'treasure', 2, -10, 6, 5)
  const boss = room('Boss Arena', 'boss', 15, 0, 12, 11)
  return {
    format: 'forge-dungeon-package',
    version: 1,
    name: 'Skillbound Dungeon',
    targetGame: 'skillbound',
    theme: 'crypt',
    gridSize: 1,
    seed: Math.floor(Math.random() * 999999),
    createdAt: now,
    updatedAt: now,
    rooms: [entrance, combat, treasure, boss],
    corridors: [
      corridor(entrance.id, combat.id),
      corridor(combat.id, treasure.id),
      corridor(combat.id, boss.id),
    ],
    markers: [
      marker('checkpoint', entrance.x, 0.3, entrance.z, entrance.id, 'Entrance checkpoint'),
      marker('enemy', combat.x, 0.3, combat.z, combat.id, 'Skeleton pack', { family: 'undead', count: 6, eliteChance: 0.1 }),
      marker('loot', treasure.x, 0.3, treasure.z, treasure.id, 'Treasure chest', { tier: 'rare' }),
      marker('enemy', boss.x, 0.3, boss.z, boss.id, 'Boss spawn', { family: 'boss', count: 1, eliteChance: 1 }),
    ],
    settings: { wallThickness: 0.35, ambientLight: 0.28, fogDensity: 0.018, snap: true },
  }
}

export function room(name: string, type: DungeonRoomType, x: number, z: number, width = 7, depth = 7): DungeonRoom {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    x,
    z,
    width,
    depth,
    height: 3.2,
    rotation: 0,
    floorLevel: 0,
    tags: [],
  }
}

export function corridor(fromRoomId: string, toRoomId: string): DungeonCorridor {
  return { id: crypto.randomUUID(), fromRoomId, toRoomId, width: 2.4, style: 'l' }
}

export function marker(type: DungeonMarkerType, x: number, y: number, z: number, roomId?: string, name?: string, data: Record<string, string | number | boolean> = {}): DungeonMarker {
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    z,
    roomId,
    name: name ?? markerName(type),
    radius: type === 'trigger' ? 2 : type === 'enemy' ? 1.5 : 0.75,
    data,
  }
}

function markerName(type: DungeonMarkerType) {
  return ({
    door: 'Door', enemy: 'Enemy Spawn', loot: 'Loot', checkpoint: 'Checkpoint', portal: 'Portal', trigger: 'Trigger', light: 'Light',
  } as const)[type]
}

export function dungeonBlob(value: ForgeDungeonPackage) {
  return new Blob([JSON.stringify({ ...value, updatedAt: new Date().toISOString() }, null, 2)], { type: 'application/x-forge-dungeon+json' })
}

export function validateDungeon(value: ForgeDungeonPackage): DungeonValidation {
  const warnings: string[] = []
  const entrance = value.rooms.find((item) => item.type === 'entrance')
  const boss = value.rooms.find((item) => item.type === 'boss')
  if (!entrance) warnings.push('Dungeon needs an Entrance room.')
  if (!boss) warnings.push('Dungeon needs a Boss room.')

  const reachable = new Set<string>()
  if (entrance) {
    const stack = [entrance.id]
    while (stack.length) {
      const current = stack.pop()!
      if (reachable.has(current)) continue
      reachable.add(current)
      for (const edge of value.corridors) {
        if (edge.fromRoomId === current && !reachable.has(edge.toRoomId)) stack.push(edge.toRoomId)
        if (edge.toRoomId === current && !reachable.has(edge.fromRoomId)) stack.push(edge.fromRoomId)
      }
    }
  }
  for (const roomItem of value.rooms) {
    if (entrance && !reachable.has(roomItem.id)) warnings.push(`${roomItem.name} is unreachable from the entrance.`)
  }
  if (boss && entrance && !reachable.has(boss.id)) warnings.push('Boss room is not reachable from the entrance.')
  if (value.rooms.length < 3) warnings.push('Dungeon is very small; add at least 3 rooms for a useful ARPG layout.')

  return { ok: warnings.length === 0, warnings, reachableRoomIds: reachable }
}

export function getRoomConnection(roomValue: DungeonRoom, target: DungeonRoom, corridorWidth = 2.4): DungeonConnection {
  const angle = roomValue.rotation * Math.PI / 180
  const dx = target.x - roomValue.x
  const dz = target.z - roomValue.z
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle)
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle)
  const openingWidth = Math.max(1.4, corridorWidth + 0.18)
  const margin = 0.35

  let side: DungeonConnection['side']
  let lx = 0
  let lz = 0
  let offset = 0
  if (Math.abs(localX) >= Math.abs(localZ)) {
    side = localX >= 0 ? 'east' : 'west'
    offset = clamp(localZ, -roomValue.depth / 2 + openingWidth / 2 + margin, roomValue.depth / 2 - openingWidth / 2 - margin)
    lx = (side === 'east' ? 1 : -1) * roomValue.width / 2
    lz = offset
  } else {
    side = localZ >= 0 ? 'south' : 'north'
    offset = clamp(localX, -roomValue.width / 2 + openingWidth / 2 + margin, roomValue.width / 2 - openingWidth / 2 - margin)
    lx = offset
    lz = (side === 'south' ? 1 : -1) * roomValue.depth / 2
  }

  const x = roomValue.x + lx * Math.cos(angle) + lz * Math.sin(angle)
  const z = roomValue.z - lx * Math.sin(angle) + lz * Math.cos(angle)
  const yaw = normalizeDegrees(roomValue.rotation + (side === 'north' || side === 'south' ? 90 : 0))
  return { side, offset, x, z, yaw, openingWidth }
}

export function generateDungeon(seed = Math.floor(Math.random() * 999999), theme: DungeonTheme = 'crypt'): ForgeDungeonPackage {
  const random = mulberry32(seed)
  const now = new Date().toISOString()
  const rooms: DungeonRoom[] = []
  const corridors: DungeonCorridor[] = []
  const markers: DungeonMarker[] = []

  const entrance = room('Entrance', 'entrance', -18, 0, 7, 7)
  rooms.push(entrance)
  let previous = entrance
  let x = -7
  let z = 0
  const mainCount = 5 + Math.floor(random() * 3)

  for (let i = 0; i < mainCount; i += 1) {
    const isLast = i === mainCount - 1
    const type: DungeonRoomType = isLast ? 'boss' : i === 2 && random() > 0.45 ? 'elite' : 'combat'
    const width = isLast ? 12 : 7 + Math.floor(random() * 4)
    const depth = isLast ? 11 : 6 + Math.floor(random() * 4)
    z += (random() - 0.5) * 10
    const next = room(isLast ? 'Boss Arena' : type === 'elite' ? `Elite Hall ${i + 1}` : `Combat Chamber ${i + 1}`, type, snap(x), snap(z), width, depth)
    rooms.push(next)
    corridors.push(corridor(previous.id, next.id))
    markers.push(marker('enemy', next.x, 0.3, next.z, next.id, isLast ? 'Boss Spawn' : type === 'elite' ? 'Elite Encounter' : 'Enemy Pack', {
      family: theme === 'crypt' ? 'undead' : theme,
      count: isLast ? 1 : type === 'elite' ? 3 : 5 + Math.floor(random() * 5),
      eliteChance: isLast ? 1 : type === 'elite' ? 0.75 : 0.12,
    }))
    previous = next
    x += 11 + random() * 5

    if (!isLast && random() > 0.42) {
      const branchType: DungeonRoomType = random() > 0.5 ? 'treasure' : 'shrine'
      const branchZ = next.z + (random() > 0.5 ? 10 : -10)
      const branch = room(branchType === 'treasure' ? 'Treasure Room' : 'Shrine', branchType, next.x, snap(branchZ), 6, 5)
      rooms.push(branch)
      corridors.push(corridor(next.id, branch.id))
      markers.push(marker(branchType === 'treasure' ? 'loot' : 'checkpoint', branch.x, 0.3, branch.z, branch.id, branchType === 'treasure' ? 'Treasure Chest' : 'Shrine'))
    }
  }

  markers.push(marker('checkpoint', entrance.x, 0.3, entrance.z, entrance.id, 'Entrance Checkpoint'))
  const boss = rooms.find((item) => item.type === 'boss')
  if (boss) markers.push(marker('portal', boss.x + boss.width * 0.25, 0.3, boss.z, boss.id, 'Exit Portal'))

  return {
    format: 'forge-dungeon-package', version: 1, name: `${titleCase(theme)} Dungeon`, targetGame: 'skillbound', theme,
    gridSize: 1, seed, createdAt: now, updatedAt: now, rooms, corridors, markers,
    settings: { wallThickness: 0.35, ambientLight: 0.28, fogDensity: 0.018, snap: true },
  }
}

function clamp(value: number, min: number, max: number) {
  if (min > max) return 0
  return Math.max(min, Math.min(max, value))
}
function normalizeDegrees(value: number) { return ((value % 360) + 360) % 360 }
function snap(value: number) { return Math.round(value) }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
