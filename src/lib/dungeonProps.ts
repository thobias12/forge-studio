import type { ForgeDungeonPackage, DungeonRoom } from './dungeonPackage'

export type BuiltinDungeonProp = 'pillar' | 'torch' | 'statue' | 'barrel' | 'crate' | 'rubble' | 'spikes'

export type DungeonProp = {
  id: string
  name: string
  source: 'builtin' | 'library'
  assetRef: string
  x: number
  y: number
  z: number
  rotationY: number
  scale: number
  roomId?: string
  collision: boolean
}

export type DungeonWithProps = ForgeDungeonPackage & { props?: DungeonProp[] }

export type PropLibraryAsset = {
  id: string
  name: string
  blob: Blob
}

export const BUILTIN_DUNGEON_PROPS: Array<{ id: BuiltinDungeonProp; name: string; hint: string }> = [
  { id: 'pillar', name: 'Stone Pillar', hint: 'architecture' },
  { id: 'torch', name: 'Wall Torch', hint: 'light source' },
  { id: 'statue', name: 'Ancient Statue', hint: 'large decoration' },
  { id: 'barrel', name: 'Barrel', hint: 'clutter' },
  { id: 'crate', name: 'Wooden Crate', hint: 'clutter' },
  { id: 'rubble', name: 'Rubble', hint: 'floor dressing' },
  { id: 'spikes', name: 'Spike Trap', hint: 'hazard prop' },
]

export function dungeonProps(value: DungeonWithProps) {
  if (value.props?.length) return value.props
  if (value.theme === 'crypt') return cryptDressing(value)
  return value.props ?? []
}

export function createDungeonProp(input: {
  name: string
  source: DungeonProp['source']
  assetRef: string
  x: number
  z: number
  y?: number
  roomId?: string
  scale?: number
  rotationY?: number
  collision?: boolean
}): DungeonProp {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    source: input.source,
    assetRef: input.assetRef,
    x: input.x,
    y: input.y ?? 0,
    z: input.z,
    roomId: input.roomId,
    scale: input.scale ?? 1,
    rotationY: input.rotationY ?? 0,
    collision: input.collision ?? input.assetRef !== 'rubble',
  }
}

function cryptDressing(value: DungeonWithProps): DungeonProp[] {
  const result: DungeonProp[] = []
  for (const room of value.rooms) {
    const insetX = Math.max(0.85, Math.min(1.25, room.width * 0.14))
    const insetZ = Math.max(0.85, Math.min(1.25, room.depth * 0.14))
    const left = -room.width / 2 + insetX
    const right = room.width / 2 - insetX
    const north = -room.depth / 2 + insetZ
    const south = room.depth / 2 - insetZ

    if (room.type === 'boss') {
      addAuto(result, room, 'pillar', 'Crypt Pillar', left, north, 0.95, true, 'nw')
      addAuto(result, room, 'pillar', 'Crypt Pillar', right, north, 0.95, true, 'ne')
      addAuto(result, room, 'pillar', 'Crypt Pillar', left, south, 0.95, true, 'sw')
      addAuto(result, room, 'pillar', 'Crypt Pillar', right, south, 0.95, true, 'se')
      addAuto(result, room, 'statue', 'Grave Effigy', -room.width * 0.24, north + 0.15, 0.82, true, 'effigy-a', 180)
      addAuto(result, room, 'statue', 'Grave Effigy', room.width * 0.24, north + 0.15, 0.82, true, 'effigy-b', 180)
      addAuto(result, room, 'rubble', 'Broken Masonry', -room.width * 0.28, room.depth * 0.2, 1.1, false, 'rubble-a')
      addAuto(result, room, 'rubble', 'Broken Masonry', room.width * 0.3, -room.depth * 0.05, 0.85, false, 'rubble-b')
      continue
    }

    if (room.type === 'elite') {
      addAuto(result, room, 'pillar', 'Crypt Pillar', left, north, 0.9, true, 'nw')
      addAuto(result, room, 'pillar', 'Crypt Pillar', right, south, 0.9, true, 'se')
      addAuto(result, room, 'statue', 'Crypt Effigy', 0, north + 0.15, 0.72, true, 'effigy', 180)
      addAuto(result, room, 'rubble', 'Broken Masonry', right * 0.72, north * 0.55, 0.9, false, 'rubble')
      continue
    }

    if (room.type === 'treasure' || room.type === 'shrine') {
      addAuto(result, room, 'pillar', 'Crypt Pillar', left, north, 0.82, true, 'left')
      addAuto(result, room, 'pillar', 'Crypt Pillar', right, north, 0.82, true, 'right')
      addAuto(result, room, 'statue', room.type === 'shrine' ? 'Shrine Effigy' : 'Ancient Effigy', 0, north + 0.1, 0.68, true, 'effigy', 180)
      addAuto(result, room, 'rubble', 'Broken Masonry', left * 0.55, south * 0.55, 0.72, false, 'rubble')
      continue
    }

    if (room.type === 'secret') {
      addAuto(result, room, 'statue', 'Forgotten Effigy', 0, north + 0.1, 0.68, true, 'effigy', 180)
      addAuto(result, room, 'rubble', 'Collapsed Stone', right * 0.6, south * 0.55, 0.95, false, 'rubble')
      continue
    }

    if (room.type === 'entrance') {
      addAuto(result, room, 'pillar', 'Entry Pillar', left, north, 0.82, true, 'left')
      addAuto(result, room, 'pillar', 'Entry Pillar', right, north, 0.82, true, 'right')
      addAuto(result, room, 'rubble', 'Old Stone Debris', left * 0.55, south * 0.55, 0.7, false, 'rubble')
      continue
    }

    if (room.type === 'combat') {
      addAuto(result, room, 'pillar', 'Crypt Pillar', left, north, 0.78, true, 'nw')
      addAuto(result, room, 'pillar', 'Crypt Pillar', right, south, 0.78, true, 'se')
      addAuto(result, room, 'rubble', 'Broken Masonry', right * 0.58, north * 0.58, 0.78, false, 'rubble')
      continue
    }

    addAuto(result, room, 'rubble', 'Broken Masonry', left * 0.55, north * 0.5, 0.72, false, 'rubble')
  }
  return result
}

function addAuto(target: DungeonProp[], room: DungeonRoom, assetRef: BuiltinDungeonProp, name: string, localX: number, localZ: number, scale: number, collision: boolean, suffix: string, localRotation = 0) {
  const point = roomLocalToWorld(room, localX, localZ)
  target.push({
    id: `auto-${room.id}-${suffix}`,
    name,
    source: 'builtin',
    assetRef,
    x: point.x,
    y: room.floorLevel,
    z: point.z,
    rotationY: normalizeDegrees(room.rotation + localRotation),
    scale,
    roomId: room.id,
    collision,
  })
}

function roomLocalToWorld(room: DungeonRoom, localX: number, localZ: number) {
  const angle = room.rotation * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: room.x + localX * cos - localZ * sin,
    z: room.z + localX * sin + localZ * cos,
  }
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}
