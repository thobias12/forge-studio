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
    const edgeX = Math.max(1.4, room.width / 2 - 1.65)
    const edgeZ = Math.max(1.4, room.depth / 2 - 1.65)
    const innerX = Math.max(1.2, room.width / 2 - 3.2)
    const innerZ = Math.max(1.2, room.depth / 2 - 3.2)

    if (room.type === 'boss') {
      addCornerPillars(result, room, edgeX, edgeZ, 1.2)
      addAuto(result, room, 'pillar', 'Inner Crypt Pillar', -innerX, -innerZ, 1.05, true, 'inner-nw')
      addAuto(result, room, 'pillar', 'Inner Crypt Pillar', innerX, -innerZ, 1.05, true, 'inner-ne')
      addAuto(result, room, 'pillar', 'Inner Crypt Pillar', -innerX, innerZ, 1.05, true, 'inner-sw')
      addAuto(result, room, 'pillar', 'Inner Crypt Pillar', innerX, innerZ, 1.05, true, 'inner-se')
      addAuto(result, room, 'statue', 'Grave Effigy', -room.width * 0.31, -edgeZ, 0.98, true, 'effigy-a', 180)
      addAuto(result, room, 'statue', 'Grave Effigy', room.width * 0.31, -edgeZ, 0.98, true, 'effigy-b', 180)
      addAuto(result, room, 'statue', 'Warden Statue', -room.width * 0.31, edgeZ, 0.9, true, 'effigy-c')
      addAuto(result, room, 'statue', 'Warden Statue', room.width * 0.31, edgeZ, 0.9, true, 'effigy-d')
      addRubbleBand(result, room, 5, 1.0)
      continue
    }

    if (room.type === 'elite') {
      addCornerPillars(result, room, edgeX, edgeZ, 1.02)
      addAuto(result, room, 'statue', 'Crypt Effigy', -room.width * 0.24, -edgeZ, 0.82, true, 'effigy-a', 180)
      addAuto(result, room, 'statue', 'Crypt Effigy', room.width * 0.24, -edgeZ, 0.82, true, 'effigy-b', 180)
      addRubbleBand(result, room, 4, 0.9)
      continue
    }

    if (room.type === 'combat') {
      addCornerPillars(result, room, edgeX, edgeZ, 0.9)
      if (room.width >= 18) {
        addAuto(result, room, 'statue', 'Burial Effigy', -room.width * 0.3, -edgeZ, 0.68, true, 'effigy-a', 180)
        addAuto(result, room, 'statue', 'Burial Effigy', room.width * 0.3, -edgeZ, 0.68, true, 'effigy-b', 180)
      }
      addRubbleBand(result, room, room.width * room.depth > 260 ? 4 : 3, 0.82)
      continue
    }

    if (room.type === 'treasure' || room.type === 'shrine') {
      addCornerPillars(result, room, edgeX, edgeZ, 0.82)
      addAuto(result, room, 'statue', room.type === 'shrine' ? 'Shrine Effigy' : 'Ancient Effigy', 0, -edgeZ, 0.76, true, 'effigy', 180)
      addAuto(result, room, 'rubble', 'Broken Masonry', -edgeX * 0.72, edgeZ * 0.68, 0.76, false, 'rubble-a')
      addAuto(result, room, 'rubble', 'Broken Masonry', edgeX * 0.62, edgeZ * 0.5, 0.62, false, 'rubble-b')
      continue
    }

    if (room.type === 'entrance') {
      addCornerPillars(result, room, edgeX, edgeZ, 0.86)
      addAuto(result, room, 'statue', 'Threshold Effigy', -room.width * 0.27, -edgeZ, 0.7, true, 'effigy-a', 180)
      addAuto(result, room, 'statue', 'Threshold Effigy', room.width * 0.27, -edgeZ, 0.7, true, 'effigy-b', 180)
      addAuto(result, room, 'rubble', 'Old Stone Debris', edgeX * 0.65, edgeZ * 0.62, 0.72, false, 'rubble')
      continue
    }

    if (room.type === 'secret') {
      addAuto(result, room, 'statue', 'Forgotten Effigy', 0, -edgeZ, 0.74, true, 'effigy', 180)
      addAuto(result, room, 'pillar', 'Broken Crypt Pillar', -edgeX, edgeZ, 0.76, true, 'pillar')
      addAuto(result, room, 'rubble', 'Collapsed Stone', edgeX * 0.62, edgeZ * 0.52, 1.1, false, 'rubble-a')
      addAuto(result, room, 'rubble', 'Collapsed Stone', -edgeX * 0.5, -edgeZ * 0.18, 0.85, false, 'rubble-b')
      continue
    }

    addAuto(result, room, 'pillar', 'Crypt Pillar', -edgeX, -edgeZ, 0.8, true, 'pillar-a')
    addAuto(result, room, 'pillar', 'Crypt Pillar', edgeX, edgeZ, 0.8, true, 'pillar-b')
    addAuto(result, room, 'rubble', 'Broken Masonry', -edgeX * 0.55, edgeZ * 0.5, 0.72, false, 'rubble')
  }
  return result
}

function addCornerPillars(target: DungeonProp[], room: DungeonRoom, edgeX: number, edgeZ: number, scale: number) {
  addAuto(target, room, 'pillar', 'Crypt Pillar', -edgeX, -edgeZ, scale, true, 'nw')
  addAuto(target, room, 'pillar', 'Crypt Pillar', edgeX, -edgeZ, scale, true, 'ne')
  addAuto(target, room, 'pillar', 'Crypt Pillar', -edgeX, edgeZ, scale, true, 'sw')
  addAuto(target, room, 'pillar', 'Crypt Pillar', edgeX, edgeZ, scale, true, 'se')
}

function addRubbleBand(target: DungeonProp[], room: DungeonRoom, count: number, scale: number) {
  const random = seededRandom(stringSeed(`props-${room.id}`))
  const marginX = Math.max(2, room.width * 0.22)
  const marginZ = Math.max(2, room.depth * 0.22)
  for (let index = 0; index < count; index += 1) {
    const side = index % 4
    let x = 0, z = 0
    if (side === 0) { x = (random() - 0.5) * (room.width - marginX * 2); z = -room.depth / 2 + 1.15 + random() * 0.8 }
    if (side === 1) { x = room.width / 2 - 1.15 - random() * 0.8; z = (random() - 0.5) * (room.depth - marginZ * 2) }
    if (side === 2) { x = (random() - 0.5) * (room.width - marginX * 2); z = room.depth / 2 - 1.15 - random() * 0.8 }
    if (side === 3) { x = -room.width / 2 + 1.15 + random() * 0.8; z = (random() - 0.5) * (room.depth - marginZ * 2) }
    addAuto(target, room, 'rubble', 'Broken Masonry', x, z, scale * (0.75 + random() * 0.45), false, `rubble-${index}`, random() * 360)
  }
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

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function stringSeed(value: string) {
  let seed = 2166136261
  for (let index = 0; index < value.length; index += 1) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619)
  return seed >>> 0
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}
