import { useMemo } from 'react'
import type { DungeonWithProps } from '../lib/dungeonProps'

export default function DungeonMinimap({ value, selectedRoomId, onSelectRoom }: {
  value: DungeonWithProps
  selectedRoomId?: string
  onSelectRoom?: (roomId: string) => void
}) {
  const layout = useMemo(() => {
    if (!value.rooms.length) return undefined
    const wallXs = (value.walls ?? []).flatMap((wall) => [wall.x1, wall.x2])
    const wallZs = (value.walls ?? []).flatMap((wall) => [wall.z1, wall.z2])
    const minX = Math.min(...value.rooms.map((room) => room.x - room.width / 2), ...wallXs)
    const maxX = Math.max(...value.rooms.map((room) => room.x + room.width / 2), ...wallXs)
    const minZ = Math.min(...value.rooms.map((room) => room.z - room.depth / 2), ...wallZs)
    const maxZ = Math.max(...value.rooms.map((room) => room.z + room.depth / 2), ...wallZs)
    const width = Math.max(8, maxX - minX)
    const depth = Math.max(8, maxZ - minZ)
    const scale = Math.min(240 / width, 145 / depth)
    const ox = 140 - (minX + maxX) * 0.5 * scale
    const oz = 82 - (minZ + maxZ) * 0.5 * scale
    const point = (x: number, z: number) => ({ x: x * scale + ox, y: z * scale + oz })
    return { scale, point }
  }, [value.rooms, value.walls])

  if (!layout) return <div className="dungeon-minimap empty">No rooms yet</div>
  const roomMap = new Map(value.rooms.map((room) => [room.id, room]))
  return <div className="dungeon-minimap">
    <svg viewBox="0 0 280 164" role="img" aria-label="Dungeon minimap preview">
      <rect x="0" y="0" width="280" height="164" rx="8" className="minimap-bg" />
      <g className="minimap-corridors">
        {value.corridors.map((edge) => {
          const a = roomMap.get(edge.fromRoomId), b = roomMap.get(edge.toRoomId)
          if (!a || !b) return null
          const p1 = layout.point(a.x, a.z), p2 = layout.point(b.x, b.z)
          const bend = layout.point(b.x, a.z)
          return <path key={edge.id} d={`M ${p1.x} ${p1.y} L ${bend.x} ${bend.y} L ${p2.x} ${p2.y}`} />
        })}
      </g>
      <g className="minimap-walls">
        {(value.walls ?? []).map((wall) => {
          const a = layout.point(wall.x1, wall.z1)
          const b = layout.point(wall.x2, wall.z2)
          return <line key={wall.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={Math.max(1.6, wall.thickness * layout.scale)} />
        })}
      </g>
      <g className="minimap-rooms">
        {value.rooms.map((room) => {
          const p = layout.point(room.x, room.z)
          const w = Math.max(5, room.width * layout.scale), h = Math.max(5, room.depth * layout.scale)
          return <g key={room.id} transform={`translate(${p.x} ${p.y}) rotate(${room.rotation})`} onClick={() => onSelectRoom?.(room.id)} className={`minimap-room ${room.type} ${selectedRoomId === room.id ? 'selected' : ''}`}>
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="2" />
            <circle r={room.type === 'boss' ? 3.2 : room.type === 'entrance' ? 2.6 : 1.7} />
          </g>
        })}
      </g>
      <g className="minimap-markers">
        {value.markers.filter((item) => ['checkpoint','portal','enemy','loot','trigger'].includes(item.type)).map((item) => {
          const p = layout.point(item.x, item.z)
          return <circle key={item.id} cx={p.x} cy={p.y} r={item.type === 'portal' ? 2.8 : 1.7} className={item.type} />
        })}
      </g>
    </svg>
    <div className="minimap-legend"><span><i className="entrance"/>Entrance</span><span><i className="combat"/>Combat</span><span><i className="boss"/>Boss</span><span><i className="trigger"/>Logic</span></div>
  </div>
}
