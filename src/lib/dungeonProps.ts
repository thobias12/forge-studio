import type { ForgeDungeonPackage } from './dungeonPackage'

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
