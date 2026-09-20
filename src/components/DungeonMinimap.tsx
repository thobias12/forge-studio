import { useMemo } from 'react'
import type { DungeonWithProps } from '../lib/dungeonProps'
import { dungeonCorridorPath, dungeonWorldBoundsV3 } from '../lib/dungeonForgeV3'

export default function DungeonMinimap({ value, selectedRoomId, onSelectRoom }: {
  value: DungeonWithProps
  selectedRoomId?: string
  onSelectRoom?: (roomId: string) => void
}) {
  const layout = useMemo(() => {
    if (!value.rooms.length) return undefined
    const bounds = dungeonWorldBoundsV3(value, 1.5)
    const scale = Math.min(240 / Math.max(8, bounds.width), 145 / Math.max(8, bounds.depth))
    const ox = 140 - bounds.x * scale
    const oz = 82 - bounds.z * scale
    const point = (x: number, z: number) => ({ x: x * scale + ox, y: z * scale + oz })
    return { scale, point }
  }, [value])

  if (!layout) return <div className="dungeon-minimap empty">No rooms yet</div>
  const roomMap = new Map(value.rooms.map((room) => [room.id, room]))
  return <div className="dungeon-minimap">
    <svg viewBox="0 0 280 164" role="img" aria-label="Dungeon minimap preview">
      <rect x="0" y="0" width="280" height="164" rx="8" className="minimap-bg" />
      <g className="minimap-corridors">
        {value.corridors.map((edge) => {
          if (!roomMap.has(edge.fromRoomId) || !roomMap.has(edge.toRoomId)) return null
          const path = dungeonCorridorPath(value, edge)
          if (path.length < 2) return null
          const d = path.map((point, index) => {
            const p = layout.point(point.x, point.z)
            return `${index ? 'L' : 'M'} ${p.x} ${p.y}`
          }).join(' ')
          return <path key={edge.id} d={d} />
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
          const shape = room.shape ?? 'rect'
          const points = shape === 'octagon'
            ? [[-.34,-.5],[.34,-.5],[.5,-.34],[.5,.34],[.34,.5],[-.34,.5],[-.5,.34],[-.5,-.34]]
            : shape === 'cross'
              ? [[-.19,-.5],[.19,-.5],[.19,-.19],[.5,-.19],[.5,.19],[.19,.19],[.19,.5],[-.19,.5],[-.19,.19],[-.5,.19],[-.5,-.19],[-.19,-.19]]
              : undefined
          return <g key={room.id} transform={`translate(${p.x} ${p.y}) rotate(${room.rotation})`} onClick={() => onSelectRoom?.(room.id)} className={`minimap-room ${room.type} ${selectedRoomId === room.id ? 'selected' : ''}`}>
            {points
              ? <polygon points={points.map(([x,z]) => `${x*w},${z*h}`).join(' ')} />
              : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="2" />}
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
