import {
  encounterForRoom, marker,
  type DungeonEncounter, type DungeonMarker, type DungeonTriggerAction, type ForgeDungeonPackage,
} from './dungeonPackage'

export type SkillboundRuntimeEncounter = {
  id: string
  name: string
  roomId: string
  trigger: { mode: 'room-enter' | 'marker'; markerId?: string; radius?: number }
  enemies: Array<{ markerId: string; x: number; y: number; z: number; family: string; count: number; eliteChance: number; difficulty: number }>
  lockDoorIds: string[]
  rewardMarkerIds: string[]
  boss: boolean
  once: boolean
}

export type SkillboundDungeonRuntime = {
  schema: 'skillbound-dungeon-runtime'
  version: 1
  sourceFormat: 'forge-dungeon-package'
  sourceVersion: number
  name: string
  theme: string
  seed: number
  spawn: { x: number; y: number; z: number; checkpointId?: string }
  rooms: ForgeDungeonPackage['rooms']
  corridors: ForgeDungeonPackage['corridors']
  doors: DungeonMarker[]
  triggers: DungeonMarker[]
  loot: DungeonMarker[]
  checkpoints: DungeonMarker[]
  portals: DungeonMarker[]
  encounters: SkillboundRuntimeEncounter[]
  completionPortalId?: string
}

export function getRoomEncounter(value: ForgeDungeonPackage, roomId: string) {
  return value.logic?.encounters.find((item) => item.roomId === roomId)
}

export function ensureRoomEncounter<T extends ForgeDungeonPackage>(value: T, roomId: string): T {
  const targetRoom = value.rooms.find((item) => item.id === roomId)
  if (!targetRoom || getRoomEncounter(value, roomId)) return value

  const nextMarkers = [...value.markers]
  const base = encounterForRoom(targetRoom)
  const family = value.theme === 'crypt' ? (targetRoom.type === 'boss' ? 'crypt-warden' : 'undead') : value.theme
  const spawn = marker('enemy', targetRoom.x, targetRoom.floorLevel + 0.3, targetRoom.z, targetRoom.id, targetRoom.type === 'boss' ? 'Boss Spawn' : 'Encounter Spawn', {
    family, count: base.count, eliteChance: base.eliteChance, difficulty: base.difficulty, encounterId: base.id,
  })
  const trigger = marker('trigger', targetRoom.x, targetRoom.floorLevel + 0.15, targetRoom.z, targetRoom.id, `${targetRoom.name} Trigger`, {
    action: 'start-encounter', targetId: base.id, once: true,
  })
  trigger.radius = Math.max(2.2, Math.min(targetRoom.width, targetRoom.depth) * 0.34)
  nextMarkers.push(spawn, trigger)

  const roomDoors = nextMarkers.filter((item) => item.type === 'door' && item.roomId === roomId).map((item) => item.id)
  const rewardMarkerIds: string[] = []
  let completionPortalId = value.logic?.completionPortalId
  if (targetRoom.type === 'boss') {
    let reward = nextMarkers.find((item) => item.type === 'loot' && item.roomId === roomId)
    if (!reward) {
      reward = marker('loot', targetRoom.x + Math.min(1.5, targetRoom.width * 0.18), targetRoom.floorLevel + 0.3, targetRoom.z, targetRoom.id, 'Boss Reliquary', {
        tier: 'legendary', requiresClear: true, encounterId: base.id,
      })
      nextMarkers.push(reward)
    }
    rewardMarkerIds.push(reward.id)
    let portal = nextMarkers.find((item) => item.type === 'portal' && item.roomId === roomId)
    if (!portal) {
      portal = marker('portal', targetRoom.x + targetRoom.width * 0.27, targetRoom.floorLevel + 0.3, targetRoom.z, targetRoom.id, 'Exit Portal', {
        action: 'exit-dungeon', requiresEncounterId: base.id,
      })
      nextMarkers.push(portal)
    }
    completionPortalId = portal.id
  }

  const created: DungeonEncounter = {
    ...base,
    family,
    trigger: 'marker',
    triggerMarkerId: trigger.id,
    spawnMarkerIds: [spawn.id],
    lockDoorIds: roomDoors,
    rewardMarkerIds,
  }
  return {
    ...value,
    version: 2,
    markers: nextMarkers,
    logic: { encounters: [...(value.logic?.encounters ?? []), created], completionPortalId },
    updatedAt: new Date().toISOString(),
  }
}

export function patchRoomEncounter<T extends ForgeDungeonPackage>(value: T, roomId: string, patch: Partial<DungeonEncounter>): T {
  const encounter = getRoomEncounter(value, roomId)
  if (!encounter) return value
  const updated = { ...encounter, ...patch }
  const spawnSet = new Set(updated.spawnMarkerIds)
  return {
    ...value,
    version: 2,
    logic: { ...value.logic, encounters: (value.logic?.encounters ?? []).map((item) => item.id === encounter.id ? updated : item) },
    markers: value.markers.map((item) => spawnSet.has(item.id) && item.type === 'enemy' ? {
      ...item,
      data: { ...item.data, family: updated.family, count: updated.count, eliteChance: updated.eliteChance, difficulty: updated.difficulty, encounterId: updated.id },
    } : item),
    updatedAt: new Date().toISOString(),
  }
}

export function removeRoomEncounter<T extends ForgeDungeonPackage>(value: T, roomId: string): T {
  const encounter = getRoomEncounter(value, roomId)
  if (!encounter) return value
  const generatedIds = new Set([...(encounter.spawnMarkerIds ?? []), ...(encounter.rewardMarkerIds ?? []), ...(encounter.triggerMarkerId ? [encounter.triggerMarkerId] : [])])
  return {
    ...value,
    version: 2,
    markers: value.markers.filter((item) => !generatedIds.has(item.id)),
    logic: {
      ...value.logic,
      encounters: (value.logic?.encounters ?? []).filter((item) => item.id !== encounter.id),
      completionPortalId: value.logic?.completionPortalId,
    },
    updatedAt: new Date().toISOString(),
  }
}

export function setEncounterDoor<T extends ForgeDungeonPackage>(value: T, roomId: string, doorId: string, enabled: boolean): T {
  const encounter = getRoomEncounter(value, roomId)
  if (!encounter) return value
  const next = enabled
    ? [...new Set([...encounter.lockDoorIds, doorId])]
    : encounter.lockDoorIds.filter((id) => id !== doorId)
  return patchRoomEncounter(value, roomId, { lockDoorIds: next })
}

export function createTriggerAction<T extends ForgeDungeonPackage>(value: T, roomId: string, action: DungeonTriggerAction, targetId: string): T {
  const targetRoom = value.rooms.find((item) => item.id === roomId)
  if (!targetRoom) return value
  const item = marker('trigger', targetRoom.x, targetRoom.floorLevel + 0.15, targetRoom.z, roomId, `${triggerLabel(action)} Trigger`, { action, targetId, once: true })
  item.radius = Math.max(1.6, Math.min(targetRoom.width, targetRoom.depth) * 0.28)
  return { ...value, version: 2, markers: [...value.markers, item], updatedAt: new Date().toISOString() }
}

export function compileSkillboundRuntime(value: ForgeDungeonPackage): SkillboundDungeonRuntime {
  const markerMap = new Map(value.markers.map((item) => [item.id, item]))
  const entrance = value.rooms.find((item) => item.type === 'entrance') ?? value.rooms[0]
  const checkpoint = value.markers.find((item) => item.type === 'checkpoint' && (!entrance || item.roomId === entrance.id))
  return {
    schema: 'skillbound-dungeon-runtime', version: 1, sourceFormat: value.format, sourceVersion: value.version,
    name: value.name, theme: value.theme, seed: value.seed,
    spawn: { x: checkpoint?.x ?? entrance?.x ?? 0, y: checkpoint?.y ?? entrance?.floorLevel ?? 0, z: checkpoint?.z ?? entrance?.z ?? 0, checkpointId: checkpoint?.id },
    rooms: value.rooms,
    corridors: value.corridors,
    doors: value.markers.filter((item) => item.type === 'door'),
    triggers: value.markers.filter((item) => item.type === 'trigger'),
    loot: value.markers.filter((item) => item.type === 'loot'),
    checkpoints: value.markers.filter((item) => item.type === 'checkpoint'),
    portals: value.markers.filter((item) => item.type === 'portal'),
    encounters: (value.logic?.encounters ?? []).map((item) => ({
      id: item.id, name: item.name, roomId: item.roomId,
      trigger: { mode: item.trigger, markerId: item.triggerMarkerId, radius: item.triggerMarkerId ? markerMap.get(item.triggerMarkerId)?.radius : undefined },
      enemies: item.spawnMarkerIds.flatMap((id) => {
        const spawn = markerMap.get(id)
        if (!spawn || spawn.type !== 'enemy') return []
        return [{ markerId: spawn.id, x: spawn.x, y: spawn.y, z: spawn.z, family: item.family, count: item.count, eliteChance: item.eliteChance, difficulty: item.difficulty }]
      }),
      lockDoorIds: item.lockDoorIds, rewardMarkerIds: item.rewardMarkerIds, boss: item.boss, once: item.once,
    })),
    completionPortalId: value.logic?.completionPortalId,
  }
}

function triggerLabel(action: DungeonTriggerAction) {
  return ({
    'start-encounter': 'Encounter', 'open-door': 'Open Door', 'close-door': 'Close Door', 'spawn-enemies': 'Spawn Enemies',
    'grant-loot': 'Grant Loot', 'activate-shrine': 'Activate Shrine', 'set-checkpoint': 'Checkpoint', 'exit-dungeon': 'Exit Dungeon',
  } as const)[action]
}
