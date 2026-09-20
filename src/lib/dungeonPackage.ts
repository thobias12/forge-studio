export type DungeonTheme = 'crypt' | 'castle' | 'cave' | 'cathedral' | 'mine' | 'sewer' | 'void'
export type DungeonRoomType = 'entrance' | 'combat' | 'treasure' | 'elite' | 'shrine' | 'boss' | 'secret' | 'utility'
export type DungeonScalePreset = 'standard' | 'grand' | 'massive'
export const DEFAULT_DUNGEON_BRIGHTNESS = 1.35
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
  shape?: 'rect' | 'cross' | 'octagon'
  tags: string[]
}

export type DungeonCorridor = {
  id: string
  fromRoomId: string
  toRoomId: string
  width: number
  style: 'straight' | 'l' | 'curve'
  path?: Array<{ x: number; z: number }>
}

export type DungeonWall = {
  id: string
  name: string
  x1: number
  z1: number
  x2: number
  z2: number
  height: number
  thickness: number
}

export type DungeonGenerationSettings = {
  roomCount: number
  branchChance: number
  loopChance: number
  corridorWidth: number
  scalePreset: DungeonScalePreset
}

export const DEFAULT_DUNGEON_GENERATION: DungeonGenerationSettings = {
  roomCount: 8,
  branchChance: 0.55,
  loopChance: 0.2,
  corridorWidth: 5.2,
  scalePreset: 'grand',
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
  walls?: DungeonWall[]
  markers: DungeonMarker[]
  logic?: DungeonLogicState
  generation?: DungeonGenerationSettings
  settings: {
    wallThickness: number
    ambientLight: number
    brightness?: number
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
  entrance: { width: 18, depth: 15, height: 5.2 },
  combat: { width: 22, depth: 18, height: 5.4 },
  treasure: { width: 16, depth: 13, height: 5.0 },
  elite: { width: 26, depth: 21, height: 5.7 },
  shrine: { width: 17, depth: 15, height: 5.2 },
  boss: { width: 34, depth: 29, height: 6.2 },
  secret: { width: 14, depth: 12, height: 4.9 },
  utility: { width: 17, depth: 14, height: 5.1 },
}

export function createStarterDungeon(): ForgeDungeonPackage {
  const now = new Date().toISOString()
  const entrance = room('Entrance', 'entrance', -32, 0)
  const combat = room('Crossroads', 'combat', -7, 0, 18, 15)
  const treasure = room('Treasure Alcove', 'treasure', -7, -21)
  const boss = room('Boss Arena', 'boss', 27, 2, 30, 25)
  entrance.shape = 'rect'
  combat.shape = 'cross'
  treasure.shape = 'rect'
  boss.shape = 'octagon'
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
    rooms: [entrance, combat, treasure, boss], corridors: [entranceEdge, treasureEdge, bossEdge], walls: [],
    markers: [checkpoint, combatSpawn, combatTrigger, treasureLoot, bossSpawn, bossReward, bossTrigger, bossDoor, exitPortal],
    logic: { encounters, completionPortalId: exitPortal.id },
    generation: { ...DEFAULT_DUNGEON_GENERATION },
    settings: { wallThickness: 0.62, ambientLight: 0.12, brightness: DEFAULT_DUNGEON_BRIGHTNESS, fogDensity: 0.019, snap: true },
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

export function corridor(fromRoomId: string, toRoomId: string, width = DEFAULT_DUNGEON_GENERATION.corridorWidth): DungeonCorridor {
  return { id: crypto.randomUUID(), fromRoomId, toRoomId, width, style: 'curve' }
}

export function wall(x1: number, z1: number, x2: number, z2: number, height = 3.8, thickness = 0.5, name = 'Stone Wall'): DungeonWall {
  return { id: crypto.randomUUID(), name, x1, z1, x2, z2, height, thickness }
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
  const upgraded: ForgeDungeonPackage = {
    ...value,
    version: 2,
    walls: value.walls ?? [],
    generation: value.generation ?? { ...DEFAULT_DUNGEON_GENERATION },
    settings: {
      ...value.settings,
      brightness: value.settings.brightness ?? DEFAULT_DUNGEON_BRIGHTNESS,
    },
    logic: value.logic ?? { encounters: [] },
    updatedAt: new Date().toISOString(),
  }
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
  for (const wallItem of value.walls ?? []) {
    if (Math.hypot(wallItem.x2 - wallItem.x1, wallItem.z2 - wallItem.z1) < 0.75) warnings.push(`${wallItem.name} is too short to be a useful wall segment.`)
    if (wallItem.thickness < 0.12) warnings.push(`${wallItem.name} is too thin for reliable runtime collision.`)
  }

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

export function generateDungeon(
  seed = Math.floor(Math.random() * 999999),
  theme: DungeonTheme = 'crypt',
  input: Partial<DungeonGenerationSettings> = {},
): ForgeDungeonPackage {
  const generation = resolveGeneration(input)
  const random = mulberry32(seed)
  const now = new Date().toISOString()
  const rooms: DungeonRoom[] = []
  const corridors: DungeonCorridor[] = []
  const markers: DungeonMarker[] = []
  const encounters: DungeonEncounter[] = []
  const scale = generation.scalePreset === 'massive' ? 1.34 : generation.scalePreset === 'grand' ? 1.16 : 1
  const targetRooms = Math.max(5, Math.min(14, Math.round(generation.roomCount)))
  const mainRooms = Math.max(4, Math.min(targetRooms - 1, Math.round(targetRooms * 0.7)))

  const entranceBase = ROOM_SCALE.entrance
  const entrance = room(
    'Sunken Threshold',
    'entrance',
    0,
    0,
    entranceBase.width * scale,
    entranceBase.depth * scale,
  )
  entrance.shape = 'rect'
  rooms.push(entrance)
  markers.push(marker('checkpoint', entrance.x, 0.3, entrance.z, entrance.id, 'Entrance Checkpoint', { checkpointId: 'entrance' }))

  let previous = entrance
  let direction: [number, number] = [1, 0]
  const mainPath: DungeonRoom[] = [entrance]

  for (let index = 0; index < mainRooms; index += 1) {
    const isLast = index === mainRooms - 1
    const progress = index / Math.max(1, mainRooms - 1)
    const type: DungeonRoomType =
      isLast ? 'boss' :
      progress > 0.44 && progress < 0.82 && random() > 0.55 ? 'elite' :
      'combat'

    if (index > 0 && random() < 0.48) {
      const turn = random() < 0.5 ? -1 : 1
      direction = turnDirection(direction, turn)
    }

    const base = ROOM_SCALE[type]
    const width = (base.width + random() * (type === 'boss' ? 5 : 6)) * scale
    const depth = (base.depth + random() * (type === 'boss' ? 4 : 5)) * scale
    const gap = (9 + random() * 8) * scale

    let next: DungeonRoom | undefined
    for (let attempt = 0; attempt < 8 && !next; attempt += 1) {
      const candidateDirection = attempt === 0 ? direction : turnDirection(direction, attempt % 2 ? 1 : -1)
      const [dx, dz] = candidateDirection
      const previousAlong = Math.abs(dx) > 0 ? previous.width : previous.depth
      const nextAlong = Math.abs(dx) > 0 ? width : depth
      const lateral = (random() - 0.5) * 7 * scale
      const x = previous.x + dx * (previousAlong / 2 + nextAlong / 2 + gap + attempt * 2.5)
        + (dz !== 0 ? lateral : 0)
      const z = previous.z + dz * (previousAlong / 2 + nextAlong / 2 + gap + attempt * 2.5)
        + (dx !== 0 ? lateral : 0)
      const candidate = room(
        isLast ? 'Warden Sanctum' : type === 'elite' ? `Ossuary Hall ${index + 1}` : `Burial Chamber ${index + 1}`,
        type,
        snap(x),
        snap(z),
        width,
        depth,
      )
      candidate.shape = generatedRoomShape(type, random)
      if (!rooms.some((existing) => roomBoundsOverlap(existing, candidate, 5.5 * scale))) {
        direction = candidateDirection
        next = candidate
      }
    }

    if (!next) {
      direction = [1, 0]
      next = room(
        isLast ? 'Warden Sanctum' : `Burial Chamber ${index + 1}`,
        type,
        snap(previous.x + previous.width / 2 + width / 2 + gap + 18),
        snap(previous.z),
        width,
        depth,
      )
      next.shape = generatedRoomShape(type, random)
    }

    rooms.push(next)
    mainPath.push(next)
    const edge = corridor(previous.id, next.id, generation.corridorWidth * scale)
    corridors.push(edge)
    addGeneratedEncounter(theme, next, previous, edge, markers, encounters, isLast)
    previous = next
  }

  const branchParents = mainPath.slice(1, -1)
  let branchIndex = 0
  let branchAttempts = 0
  while (rooms.length < targetRooms && branchParents.length && branchAttempts < targetRooms * 12) {
    branchAttempts += 1
    const parent = branchParents[branchIndex % branchParents.length]
    branchIndex += 1
    if (random() > generation.branchChance && branchIndex < branchParents.length * 2) continue

    const roll = random()
    const branchType: DungeonRoomType = roll < 0.38 ? 'treasure' : roll < 0.7 ? 'shrine' : roll < 0.88 ? 'secret' : 'utility'
    const base = ROOM_SCALE[branchType]
    const width = (base.width + random() * 3.5) * scale
    const depth = (base.depth + random() * 3.2) * scale
    const parentIndex = mainPath.indexOf(parent)
    const before = mainPath[Math.max(0, parentIndex - 1)]
    const after = mainPath[Math.min(mainPath.length - 1, parentIndex + 1)]
    const flowX = after.x - before.x
    const flowZ = after.z - before.z
    const len = Math.hypot(flowX, flowZ) || 1
    const side = random() < 0.5 ? -1 : 1
    const nx = -flowZ / len * side
    const nz = flowX / len * side

    let branch: DungeonRoom | undefined
    for (let attempt = 0; attempt < 8 && !branch; attempt += 1) {
      const gap = (8 + random() * 7 + attempt * 2.4) * scale
      const x = parent.x + nx * (Math.max(parent.width, parent.depth) / 2 + Math.max(width, depth) / 2 + gap)
      const z = parent.z + nz * (Math.max(parent.width, parent.depth) / 2 + Math.max(width, depth) / 2 + gap)
      const candidate = room(
        branchType === 'treasure' ? 'Reliquary' : branchType === 'shrine' ? 'Forgotten Shrine' : branchType === 'secret' ? 'Sealed Ossuary' : 'Side Chamber',
        branchType,
        snap(x),
        snap(z),
        width,
        depth,
      )
      candidate.shape = generatedRoomShape(branchType, random)
      if (!rooms.some((existing) => roomBoundsOverlap(existing, candidate, 4.2 * scale))) branch = candidate
    }
    if (!branch) continue

    rooms.push(branch)
    corridors.push(corridor(parent.id, branch.id, Math.max(4.4, generation.corridorWidth * 0.9) * scale))
    markers.push(marker(
      branchType === 'treasure' ? 'loot' : branchType === 'shrine' ? 'checkpoint' : 'light',
      branch.x,
      branchType === 'treasure' || branchType === 'shrine' ? 0.3 : 1.7,
      branch.z,
      branch.id,
      branchType === 'treasure' ? 'Reliquary Cache' : branchType === 'shrine' ? 'Shrine' : 'Ambient Light',
      branchType === 'treasure' ? { tier: 'rare', requiresClear: false } : branchType === 'shrine' ? { checkpointId: `shrine-${branch.id}` } : { color: '#ffad68', intensity: 1.4 },
    ))
  }

  if (random() < generation.loopChance && rooms.length > 6) {
    const candidates = rooms.filter((item) => item.type !== 'entrance' && item.type !== 'boss')
    let best: { a: DungeonRoom; b: DungeonRoom; distance: number } | undefined
    for (let i = 0; i < candidates.length; i += 1) for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i], b = candidates[j]
      if (corridors.some((edge) => (edge.fromRoomId === a.id && edge.toRoomId === b.id) || (edge.fromRoomId === b.id && edge.toRoomId === a.id))) continue
      const distance = Math.hypot(a.x - b.x, a.z - b.z)
      if (distance < 18 * scale || distance > 46 * scale) continue
      if (!best || distance < best.distance) best = { a, b, distance }
    }
    if (best) corridors.push(corridor(best.a.id, best.b.id, Math.max(4.2, generation.corridorWidth * 0.86) * scale))
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
    format: 'forge-dungeon-package',
    version: 2,
    name: theme === 'crypt' ? 'Sunken Ossuary' : `${titleCase(theme)} Dungeon`,
    targetGame: 'skillbound',
    theme,
    gridSize: 1,
    seed,
    createdAt: now,
    updatedAt: now,
    rooms,
    corridors,
    walls: [],
    markers,
    logic: { encounters, completionPortalId },
    generation,
    settings: { wallThickness: 0.62, ambientLight: 0.12, brightness: DEFAULT_DUNGEON_BRIGHTNESS, fogDensity: 0.019, snap: true },
  }
}

function addGeneratedEncounter(
  theme: DungeonTheme,
  target: DungeonRoom,
  previous: DungeonRoom,
  edge: DungeonCorridor,
  markers: DungeonMarker[],
  encounters: DungeonEncounter[],
  boss: boolean,
) {
  const encounterId = crypto.randomUUID()
  const family = theme === 'crypt' ? (boss ? 'crypt-warden' : 'undead') : theme
  const elite = target.type === 'elite'
  const count = boss ? 1 : elite ? 5 : Math.max(7, Math.round(Math.min(target.width, target.depth) * 0.42))
  const eliteChance = boss ? 1 : elite ? 0.78 : 0.14
  const difficulty = boss ? 3 : elite ? 2 : 1
  const spawn = marker('enemy', target.x, 0.3, target.z, target.id, boss ? 'Boss Spawn' : elite ? 'Elite Encounter' : 'Enemy Pack', { family, count, eliteChance, difficulty, encounterId })
  const trigger = marker('trigger', target.x, 0.15, target.z, target.id, `${target.name} Trigger`, { action: 'start-encounter', targetId: encounterId, once: true })
  trigger.radius = Math.max(boss ? 6.8 : 4.6, Math.min(target.width, target.depth) * 0.28)
  markers.push(spawn, trigger)

  const lockDoorIds: string[] = []
  const rewardMarkerIds: string[] = []
  if (boss || elite) {
    const connection = getRoomConnection(target, previous, edge.width)
    const door = marker('door', connection.x, 0, connection.z, target.id, boss ? 'Boss Gate' : 'Elite Gate', { corridorId: edge.id, yaw: connection.yaw, locked: false, encounterId })
    markers.push(door)
    lockDoorIds.push(door.id)
  }
  if (boss) {
    const reward = marker('loot', target.x + 3.6, 0.3, target.z + 1, target.id, 'Boss Reliquary', { tier: 'legendary', requiresClear: true, encounterId })
    markers.push(reward)
    rewardMarkerIds.push(reward.id)
  }

  encounters.push({
    id: encounterId,
    name: boss ? `${target.name} Boss Encounter` : `${target.name} Encounter`,
    roomId: target.id,
    trigger: 'marker',
    triggerMarkerId: trigger.id,
    spawnMarkerIds: [spawn.id],
    lockDoorIds,
    rewardMarkerIds,
    family,
    count,
    eliteChance,
    difficulty,
    boss,
    once: true,
  })
}

function resolveGeneration(input: Partial<DungeonGenerationSettings>): DungeonGenerationSettings {
  const preset = input.scalePreset ?? DEFAULT_DUNGEON_GENERATION.scalePreset
  return {
    roomCount: Math.max(5, Math.min(14, Math.round(input.roomCount ?? DEFAULT_DUNGEON_GENERATION.roomCount))),
    branchChance: Math.max(0, Math.min(1, input.branchChance ?? DEFAULT_DUNGEON_GENERATION.branchChance)),
    loopChance: Math.max(0, Math.min(1, input.loopChance ?? DEFAULT_DUNGEON_GENERATION.loopChance)),
    corridorWidth: Math.max(3.8, Math.min(8, input.corridorWidth ?? DEFAULT_DUNGEON_GENERATION.corridorWidth)),
    scalePreset: preset,
  }
}

function generatedRoomShape(type: DungeonRoomType, random: () => number): NonNullable<DungeonRoom['shape']> {
  if (type === 'boss') return 'octagon'
  if (type === 'entrance' || type === 'treasure' || type === 'shrine' || type === 'secret') return 'rect'
  const roll = random()
  if (roll < 0.2) return 'cross'
  if (roll < 0.36) return 'octagon'
  return 'rect'
}

function turnDirection(direction: [number, number], turn: number): [number, number] {
  return turn > 0 ? [-direction[1], direction[0]] : [direction[1], -direction[0]]
}

function roomBoundsOverlap(a: DungeonRoom, b: DungeonRoom, padding: number) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding
    && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + padding
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
