export type DungeonTheme = 'crypt' | 'castle' | 'cave' | 'cathedral' | 'mine' | 'sewer' | 'void'
export type DungeonRoomType = 'entrance' | 'combat' | 'treasure' | 'elite' | 'shrine' | 'boss' | 'secret' | 'utility'
export type DungeonMarkerType = 'door' | 'enemy' | 'loot' | 'checkpoint' | 'portal' | 'trigger' | 'light'
export type DungeonTriggerAction = 'start-encounter' | 'open-door' | 'close-door' | 'spawn-enemies' | 'grant-loot' | 'activate-shrine' | 'set-checkpoint' | 'exit-dungeon'

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

export type DungeonEncounter = {
  id: string
  name: string
  roomId: string
  trigger: 'room-enter' | 'marker'
  triggerMarkerId?: string
  spawnMarkerIds: string[]
  lockDoorIds: string[]
  rewardMarkerIds: string[]
  family: string
  count: number
  eliteChance: number
  difficulty: number
  boss: boolean
  once: boolean
}

export type DungeonLogicState = {
  encounters: DungeonEncounter[]
  completionPortalId?: string
}

export type ForgeDungeonPackage = {
  format: 'forge-dungeon-package'
  version: 1 | 2
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
  logic?: DungeonLogicState
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

type RoomScale = { width: number; depth: number; height: number }

const ROOM_SCALE: Record<DungeonRoomType, RoomScale> = {
  entrance: { width: 14, depth: 12, height: 4.8 },
  combat: { width: 16, depth: 14, height: 4.9 },
  treasure: { width: 12, depth: 10, height: 4.6 },
  elite: { width: 20, depth: 17, height: 5.2 },
  shrine: { width: 13, depth: 12, height: 4.8 },
  boss: { width: 28, depth: 24, height: 5.8 },
  secret: { width: 11, depth: 10, height: 4.5 },
  utility: { width: 13, depth: 12, height: 4.7 },
}

export function createStarterDungeon(): ForgeDungeonPackage {
  const now = new Date().toISOString()
  const entrance = room('Entrance', 'entrance', -32, 0)
  const combat = room('Crossroads', 'combat', -7, 0, 18, 15)
  const treasure = room('Treasure Alcove', 'treasure', -7, -21)
  const boss = room('Boss Arena', 'boss', 27, 2, 30, 25)
  const entranceEdge = corridor(entrance.id, combat.id)
  const treasureEdge = corridor(combat.id, treasure.id)
  const bossEdge = corridor(combat.id, boss.id)

  const checkpoint = marker('checkpoint', entrance.x, 0.3, entrance.z, entrance.id, 'Entrance checkpoint', { checkpointId: 'entrance' })
  const combatSpawn = marker('enemy', combat.x, 0.3, combat.z, combat.id, 'Skeleton pack', { family: 'undead', count: 7, eliteChance: 0.1, difficulty: 1 })
  const combatEncounterId = crypto.randomUUID()
  const combatTrigger = marker('trigger', combat.x, 0.15, combat.z, combat.id, 'Crossroads encounter trigger', { action: 'start-encounter', targetId: combatEncounterId, once: true })
  combatTrigger.radius = Math.max(3.8, Math.min(combat.width, combat.depth) * 0.32)

  const treasureLoot = marker('loot', treasure.x, 0.3, treasure.z, treasure.id, 'Treasure chest', { tier: 'rare', requiresClear: false })
  const bossSpawn = marker('enemy', boss.x, 0.3, boss.z, boss.id, 'Boss spawn', { family: 'crypt-warden', count: 1, eliteChance: 1, difficulty: 3 })
  const bossReward = marker('loot', boss.x + 3.2, 0.3, boss.z + 0.8, boss.id, 'Boss reliquary', { tier: 'legendary', requiresClear: true })
  const bossEncounterId = crypto.randomUUID()
  const bossTrigger = marker('trigger', boss.x, 0.15, boss.z, boss.id, 'Boss arena trigger', { action: 'start-encounter', targetId: bossEncounterId, once: true })
  bossTrigger.radius = Math.max(5.5, Math.min(boss.width, boss.depth) * 0.3)
  const bossConnection = getRoomConnection(boss, combat, bossEdge.width)
  const bossDoor = marker('door', bossConnection.x, 0, bossConnection.z, boss.id, 'Boss gate', {
    corridorId: bossEdge.id, yaw: bossConnection.yaw, locked: false, encounterId: bossEncounterId,
  })
  const exitPortal = marker('portal', boss.x + boss.width * 0.3, 0.3, boss.z, boss.id, 'Exit Portal', { action: 'exit-dungeon', requiresEncounterId: bossEncounterId })

  const encounters: DungeonEncounter[] = [
    {
      id: combatEncounterId, name: 'Crossroads Ambush', roomId: combat.id, trigger: 'marker', triggerMarkerId: combatTrigger.id,
      spawnMarkerIds: [combatSpawn.id], lockDoorIds: [], rewardMarkerIds: [], family: 'undead', count: 7,
      eliteChance: 0.1, difficulty: 1, boss: false, once: true,
    },
    {
      id: bossEncounterId, name: 'Crypt Warden', roomId: boss.id, trigger: 'marker', triggerMarkerId: bossTrigger.id,
      spawnMarkerIds: [bossSpawn.id], lockDoorIds: [bossDoor.id], rewardMarkerIds: [bossReward.id], family: 'crypt-warden', count: 1,
      eliteChance: 1, difficulty: 3, boss: true, once: true,
    },
  ]

  return {
    format: 'forge-dungeon-package', version: 2, name: 'Skillbound Dungeon', targetGame: 'skillbound', theme: 'crypt',
    gridSize: 1, seed: Math.floor(Math.random() * 999999), createdAt: now, updatedAt: now,
    rooms: [entrance, combat, treasure, boss], corridors: [entranceEdge, treasureEdge, bossEdge],
    markers: [checkpoint, combatSpawn, combatTrigger, treasureLoot, bossSpawn, bossReward, bossTrigger, bossDoor, exitPortal],
    logic: { encounters, completionPortalId: exitPortal.id },
    settings: { wallThickness: 0.5, ambientLight: 0.25, fogDensity: 0.014, snap: true },
  }
}

export function room(name: string, type: DungeonRoomType, x: number, z: number, width = 7, depth = 7): DungeonRoom {
  const scale = ROOM_SCALE[type]
  return {
    id: crypto.randomUUID(),
    name,
    type,
    x,
    z,
    width: Math.max(scale.width, width),
    depth: Math.max(scale.depth, depth),
    height: scale.height,
    rotation: 0,
    floorLevel: 0,
    tags: [],
  }
}

export function corridor(fromRoomId: string, toRoomId: string): DungeonCorridor {
  return { id: crypto.randomUUID(), fromRoomId, toRoomId, width: 4.2, style: 'l' }
}

export function marker(type: DungeonMarkerType, x: number, y: number, z: number, roomId?: string, name?: string, data: Record<string, string | number | boolean> = {}): DungeonMarker {
  return {
    id: crypto.randomUUID(), type, x, y, z, roomId, name: name ?? markerName(type),
    radius: type === 'trigger' ? 2 : type === 'enemy' ? 1.5 : 0.75, data,
  }
}

export function encounterForRoom(roomValue: DungeonRoom, overrides: Partial<DungeonEncounter> = {}): DungeonEncounter {
  const boss = roomValue.type === 'boss'
  const elite = roomValue.type === 'elite'
  return {
    id: crypto.randomUUID(),
    name: boss ? `${roomValue.name} Boss Encounter` : elite ? `${roomValue.name} Elite Encounter` : `${roomValue.name} Encounter`,
    roomId: roomValue.id,
    trigger: 'room-enter',
    spawnMarkerIds: [],
    lockDoorIds: [],
    rewardMarkerIds: [],
    family: 'undead',
    count: boss ? 1 : elite ? 4 : 7,
    eliteChance: boss ? 1 : elite ? 0.75 : 0.12,
    difficulty: boss ? 3 : elite ? 2 : 1,
    boss,
    once: true,
    ...overrides,
  }
}

function markerName(type: DungeonMarkerType) {
  return ({ door: 'Door', enemy: 'Enemy Spawn', loot: 'Loot', checkpoint: 'Checkpoint', portal: 'Portal', trigger: 'Trigger', light: 'Light' } as const)[type]
}

export function dungeonBlob(value: ForgeDungeonPackage) {
  const upgraded: ForgeDungeonPackage = { ...value, version: 2, logic: value.logic ?? { encounters: [] }, updatedAt: new Date().toISOString() }
  return new Blob([JSON.stringify(upgraded, null, 2)], { type: 'application/x-forge-dungeon+json' })
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
  for (const roomItem of value.rooms) if (entrance && !reachable.has(roomItem.id)) warnings.push(`${roomItem.name} is unreachable from the entrance.`)
  if (boss && entrance && !reachable.has(boss.id)) warnings.push('Boss room is not reachable from the entrance.')
  if (value.rooms.length < 3) warnings.push('Dungeon is very small; add at least 3 rooms for a useful ARPG layout.')

  for (const roomItem of value.rooms) {
    if ((roomItem.type === 'combat' || roomItem.type === 'elite') && Math.min(roomItem.width, roomItem.depth) < 10) warnings.push(`${roomItem.name} is cramped for ARPG combat; aim for at least 10m on its short side.`)
    if (roomItem.type === 'boss' && Math.min(roomItem.width, roomItem.depth) < 16) warnings.push(`${roomItem.name} is cramped for a boss arena; aim for at least 16m on its short side.`)
  }
  for (const edge of value.corridors) if (edge.width < 3) warnings.push('A corridor is narrower than 3m and may feel cramped in ARPG camera mode.')

  if (entrance && !value.markers.some((item) => item.type === 'checkpoint' && item.roomId === entrance.id)) warnings.push('Entrance needs a checkpoint / spawn marker.')
  if (boss && !value.markers.some((item) => item.type === 'portal' && item.roomId === boss.id)) warnings.push('Boss room needs an exit portal.')

  const encounters = value.logic?.encounters ?? []
  const markerMap = new Map(value.markers.map((item) => [item.id, item]))
  const roomMap = new Map(value.rooms.map((item) => [item.id, item]))
  const encounterMap = new Map(encounters.map((item) => [item.id, item]))
  for (const item of encounters) {
    if (!roomMap.has(item.roomId)) warnings.push(`${item.name} references a missing room.`)
    if (!item.spawnMarkerIds.length) warnings.push(`${item.name} has no enemy spawn markers.`)
    for (const spawnId of item.spawnMarkerIds) if (markerMap.get(spawnId)?.type !== 'enemy') warnings.push(`${item.name} references an invalid enemy spawn.`)
    if (item.trigger === 'marker' && (!item.triggerMarkerId || markerMap.get(item.triggerMarkerId)?.type !== 'trigger')) warnings.push(`${item.name} needs a valid trigger marker.`)
    for (const doorId of item.lockDoorIds) if (markerMap.get(doorId)?.type !== 'door') warnings.push(`${item.name} references a missing encounter door.`)
    for (const rewardId of item.rewardMarkerIds) if (markerMap.get(rewardId)?.type !== 'loot') warnings.push(`${item.name} references a missing reward marker.`)
  }
  if (boss && !encounters.some((item) => item.roomId === boss.id && item.boss)) warnings.push('Boss room needs a boss encounter.')

  for (const item of value.markers) {
    if (item.type === 'door' && Boolean(item.data.locked)) {
      const managed = encounters.some((encounter) => encounter.lockDoorIds.includes(item.id)) || value.markers.some((trigger) => trigger.type === 'trigger' && trigger.data.action === 'open-door' && trigger.data.targetId === item.id)
      if (!managed) warnings.push(`${item.name} starts locked but has no encounter/trigger that opens it.`)
    }
    if (item.type !== 'trigger') continue
    const action = String(item.data.action ?? '') as DungeonTriggerAction
    const targetId = String(item.data.targetId ?? '')
    if (!action) warnings.push(`${item.name} has no trigger action.`)
    else if (action === 'start-encounter' && !encounterMap.has(targetId)) warnings.push(`${item.name} targets a missing encounter.`)
    else if ((action === 'open-door' || action === 'close-door') && markerMap.get(targetId)?.type !== 'door') warnings.push(`${item.name} targets a missing door.`)
    else if (action === 'grant-loot' && markerMap.get(targetId)?.type !== 'loot') warnings.push(`${item.name} targets a missing loot marker.`)
  }

  if (value.logic?.completionPortalId && markerMap.get(value.logic.completionPortalId)?.type !== 'portal') warnings.push('Completion portal reference is invalid.')
  return { ok: warnings.length === 0, warnings, reachableRoomIds: reachable }
}

export function getRoomConnection(roomValue: DungeonRoom, target: DungeonRoom, corridorWidth = 4.2): DungeonConnection {
  const angle = roomValue.rotation * Math.PI / 180
  const dx = target.x - roomValue.x
  const dz = target.z - roomValue.z
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle)
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle)
  const openingWidth = Math.max(2.5, corridorWidth + 0.28)
  const margin = 0.6
  let side: DungeonConnection['side']
  let lx = 0, lz = 0, offset = 0
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
  const encounters: DungeonEncounter[] = []

  const entrance = room('Entrance', 'entrance', -38, 0)
  rooms.push(entrance)
  markers.push(marker('checkpoint', entrance.x, 0.3, entrance.z, entrance.id, 'Entrance Checkpoint', { checkpointId: 'entrance' }))
  let previous = entrance
  const mainCount = 5 + Math.floor(random() * 3)

  for (let i = 0; i < mainCount; i += 1) {
    const isLast = i === mainCount - 1
    const type: DungeonRoomType = isLast ? 'boss' : i === 2 && random() > 0.45 ? 'elite' : 'combat'
    const base = ROOM_SCALE[type]
    const width = isLast ? 28 + Math.floor(random() * 5) : base.width + Math.floor(random() * (type === 'elite' ? 4 : 6))
    const depth = isLast ? 24 + Math.floor(random() * 5) : base.depth + Math.floor(random() * (type === 'elite' ? 4 : 5))
    const gap = 8 + random() * 7
    const nextX = previous.x + previous.width / 2 + width / 2 + gap
    const nextZ = previous.z + (random() - 0.5) * 16
    const next = room(isLast ? 'Boss Arena' : type === 'elite' ? `Elite Hall ${i + 1}` : `Combat Chamber ${i + 1}`, type, snap(nextX), snap(nextZ), width, depth)
    rooms.push(next)
    const edge = corridor(previous.id, next.id)
    corridors.push(edge)

    const encounterId = crypto.randomUUID()
    const family = theme === 'crypt' ? (isLast ? 'crypt-warden' : 'undead') : theme
    const count = isLast ? 1 : type === 'elite' ? 4 : 6 + Math.floor(random() * 6)
    const eliteChance = isLast ? 1 : type === 'elite' ? 0.75 : 0.12
    const difficulty = isLast ? 3 : type === 'elite' ? 2 : 1
    const spawn = marker('enemy', next.x, 0.3, next.z, next.id, isLast ? 'Boss Spawn' : type === 'elite' ? 'Elite Encounter' : 'Enemy Pack', { family, count, eliteChance, difficulty, encounterId })
    const trigger = marker('trigger', next.x, 0.15, next.z, next.id, `${next.name} Trigger`, { action: 'start-encounter', targetId: encounterId, once: true })
    trigger.radius = Math.max(type === 'boss' ? 5.5 : 3.8, Math.min(next.width, next.depth) * 0.3)
    markers.push(spawn, trigger)

    const lockDoorIds: string[] = []
    const rewardMarkerIds: string[] = []
    if (isLast || type === 'elite') {
      const connection = getRoomConnection(next, previous, edge.width)
      const door = marker('door', connection.x, 0, connection.z, next.id, isLast ? 'Boss Gate' : 'Elite Gate', { corridorId: edge.id, yaw: connection.yaw, locked: false, encounterId })
      markers.push(door)
      lockDoorIds.push(door.id)
    }
    if (isLast) {
      const reward = marker('loot', next.x + 3.2, 0.3, next.z + 0.8, next.id, 'Boss Reliquary', { tier: 'legendary', requiresClear: true, encounterId })
      markers.push(reward)
      rewardMarkerIds.push(reward.id)
    }

    encounters.push({
      id: encounterId, name: isLast ? `${next.name} Boss Encounter` : `${next.name} Encounter`, roomId: next.id,
      trigger: 'marker', triggerMarkerId: trigger.id, spawnMarkerIds: [spawn.id], lockDoorIds, rewardMarkerIds,
      family, count, eliteChance, difficulty, boss: isLast, once: true,
    })

    previous = next

    if (!isLast && random() > 0.42) {
      const branchType: DungeonRoomType = random() > 0.5 ? 'treasure' : 'shrine'
      const branchBase = ROOM_SCALE[branchType]
      const branchWidth = branchBase.width + Math.floor(random() * 3)
      const branchDepth = branchBase.depth + Math.floor(random() * 3)
      const direction = random() > 0.5 ? 1 : -1
      const branchGap = 7 + random() * 5
      const branchZ = next.z + direction * (next.depth / 2 + branchDepth / 2 + branchGap)
      const branch = room(branchType === 'treasure' ? 'Treasure Room' : 'Shrine', branchType, next.x + (random() - 0.5) * 4, snap(branchZ), branchWidth, branchDepth)
      rooms.push(branch)
      corridors.push(corridor(next.id, branch.id))
      markers.push(marker(branchType === 'treasure' ? 'loot' : 'checkpoint', branch.x, 0.3, branch.z, branch.id, branchType === 'treasure' ? 'Treasure Chest' : 'Shrine', branchType === 'treasure' ? { tier: 'rare', requiresClear: false } : { checkpointId: `shrine-${branch.id}` }))
    }
  }

  const boss = rooms.find((item) => item.type === 'boss')
  let completionPortalId: string | undefined
  if (boss) {
    const bossEncounter = encounters.find((item) => item.roomId === boss.id)
    const exit = marker('portal', boss.x + boss.width * 0.3, 0.3, boss.z, boss.id, 'Exit Portal', { action: 'exit-dungeon', requiresEncounterId: bossEncounter?.id ?? '' })
    markers.push(exit)
    completionPortalId = exit.id
  }

  return {
    format: 'forge-dungeon-package', version: 2, name: `${titleCase(theme)} Dungeon`, targetGame: 'skillbound', theme,
    gridSize: 1, seed, createdAt: now, updatedAt: now, rooms, corridors, markers,
    logic: { encounters, completionPortalId },
    settings: { wallThickness: 0.5, ambientLight: 0.25, fogDensity: 0.014, snap: true },
  }
}

function clamp(value: number, min: number, max: number) { if (min > max) return 0; return Math.max(min, Math.min(max, value)) }
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
