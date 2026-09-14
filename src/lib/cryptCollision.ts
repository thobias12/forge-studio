import type { DungeonRoom } from './dungeonPackage'
import type { DungeonProp, DungeonWithProps } from './dungeonProps'

const PREFIX = '__crypt-collision-'
const HIDDEN_Y = -64

export function withCryptRuntimeCollision(value: DungeonWithProps): DungeonWithProps {
  if (value.theme !== 'crypt') return value
  const explicit = (value.props ?? []).filter((prop) => !prop.id.startsWith(PREFIX))
  return { ...value, props: [...explicit, ...cryptCollisionProps(value.rooms)] }
}

function cryptCollisionProps(rooms: DungeonRoom[]): DungeonProp[] {
  const result: DungeonProp[] = []
  for (const room of rooms) {
    const edgeX = Math.max(2.3, room.width / 2 - 2.25)
    const edgeZ = Math.max(2.3, room.depth / 2 - 2.25)
    const pillarX = Math.max(0.8, room.width / 2 - 0.62)
    const pillarZ = Math.max(0.8, room.depth / 2 - 0.62)

    // Structural corner pillars are large enough to affect movement in the rendered scene.
    addPoint(result, room, 'pillar-nw', -pillarX, -pillarZ, 1.28, 'pillar')
    addPoint(result, room, 'pillar-ne', pillarX, -pillarZ, 1.28, 'pillar')
    addPoint(result, room, 'pillar-sw', -pillarX, pillarZ, 1.28, 'pillar')
    addPoint(result, room, 'pillar-se', pillarX, pillarZ, 1.28, 'pillar')

    if (room.type === 'entrance') {
      addPoint(result, room, 'brazier-a', -edgeX * 0.62, -edgeZ * 0.58, 1.0)
      addPoint(result, room, 'brazier-b', edgeX * 0.62, -edgeZ * 0.58, 1.0)
      addLineX(result, room, 'bench-a', -1.3, edgeZ * 0.72, 0, 3, 0.62, 0.88)
      addLineX(result, room, 'bench-b', 1.3, edgeZ * 0.72, 0, 3, 0.62, 0.88)
    } else if (room.type === 'combat') {
      addSarcophagus(result, room, 'sarc-a', -edgeX * 0.9, -edgeZ * 0.18, Math.PI / 2, 1)
      addSarcophagus(result, room, 'sarc-b', edgeX * 0.9, edgeZ * 0.22, Math.PI / 2, 0.96)
      if (room.width > 18) addSarcophagus(result, room, 'sarc-c', -edgeX * 0.34, edgeZ * 0.84, 0, 0.9)
      addPoint(result, room, 'rubble-a', edgeX * 0.56, -edgeZ * 0.66, 0.88)
    } else if (room.type === 'elite') {
      addSarcophagus(result, room, 'sarc-a', -edgeX * 0.84, edgeZ * 0.12, Math.PI / 2, 1.08)
      addSarcophagus(result, room, 'sarc-b', edgeX * 0.84, edgeZ * 0.12, Math.PI / 2, 1.08)
      addPoint(result, room, 'brazier-a', -edgeX * 0.62, -edgeZ * 0.56, 1.08)
      addPoint(result, room, 'brazier-b', edgeX * 0.62, -edgeZ * 0.56, 1.08)
    } else if (room.type === 'treasure') {
      addAltar(result, room, 'altar', 0, edgeZ * 0.6, 0, 1.12)
    } else if (room.type === 'shrine') {
      addAltar(result, room, 'altar', 0, edgeZ * 0.58, 0, 1.2)
      addLineX(result, room, 'bench-a', -edgeX * 0.44, -edgeZ * 0.18, Math.PI / 2, 3, 0.62, 0.88)
      addLineX(result, room, 'bench-b', edgeX * 0.44, -edgeZ * 0.18, Math.PI / 2, 3, 0.62, 0.88)
    } else if (room.type === 'boss') {
      addPoint(result, room, 'brazier-nw', -edgeX * 0.72, -edgeZ * 0.68, 1.18)
      addPoint(result, room, 'brazier-ne', edgeX * 0.72, -edgeZ * 0.68, 1.18)
      addPoint(result, room, 'brazier-sw', -edgeX * 0.72, edgeZ * 0.68, 1.18)
      addPoint(result, room, 'brazier-se', edgeX * 0.72, edgeZ * 0.68, 1.18)
      addSarcophagus(result, room, 'sarc-a', -edgeX * 0.9, -edgeZ * 0.05, Math.PI / 2, 1.18)
      addSarcophagus(result, room, 'sarc-b', edgeX * 0.9, -edgeZ * 0.05, Math.PI / 2, 1.18)
      addSarcophagus(result, room, 'sarc-c', -edgeX * 0.9, edgeZ * 0.48, Math.PI / 2, 1.06)
      addSarcophagus(result, room, 'sarc-d', edgeX * 0.9, edgeZ * 0.48, Math.PI / 2, 1.06)
      addPoint(result, room, 'rubble-a', -edgeX * 0.55, edgeZ * 0.76, 1.0)
      addPoint(result, room, 'rubble-b', edgeX * 0.55, edgeZ * 0.76, 0.9)
    } else if (room.type === 'secret') {
      addSarcophagus(result, room, 'sarc', 0, edgeZ * 0.42, 0, 1.02)
      addPoint(result, room, 'rubble-a', -edgeX * 0.55, -edgeZ * 0.48, 1.0)
    } else {
      addLineX(result, room, 'bench', 0, edgeZ * 0.62, 0, 3, 0.62, 0.88)
    }
  }
  return result
}

function addSarcophagus(target: DungeonProp[], room: DungeonRoom, key: string, x: number, z: number, rotation: number, scale: number) {
  addLineZ(target, room, key, x, z, rotation, 3, 0.72 * scale, 1.18 * scale)
}

function addAltar(target: DungeonProp[], room: DungeonRoom, key: string, x: number, z: number, rotation: number, scale: number) {
  addLineX(target, room, key, x, z, rotation, 3, 0.48 * scale, 1.02 * scale)
}

function addLineX(target: DungeonProp[], room: DungeonRoom, key: string, x: number, z: number, rotation: number, count: number, spacing: number, scale: number) {
  const half = (count - 1) / 2
  for (let i = 0; i < count; i += 1) {
    const offset = (i - half) * spacing
    addPoint(target, room, `${key}-${i}`, x + Math.cos(rotation) * offset, z - Math.sin(rotation) * offset, scale)
  }
}

function addLineZ(target: DungeonProp[], room: DungeonRoom, key: string, x: number, z: number, rotation: number, count: number, spacing: number, scale: number) {
  const half = (count - 1) / 2
  for (let i = 0; i < count; i += 1) {
    const offset = (i - half) * spacing
    addPoint(target, room, `${key}-${i}`, x + Math.sin(rotation) * offset, z + Math.cos(rotation) * offset, scale)
  }
}

function addPoint(target: DungeonProp[], room: DungeonRoom, key: string, localX: number, localZ: number, scale: number, assetRef = 'crate') {
  const point = localToWorld(room, localX, localZ)
  target.push({
    id: `${PREFIX}${room.id}-${key}`,
    name: 'Crypt collision',
    source: 'builtin',
    assetRef,
    x: point.x,
    y: HIDDEN_Y,
    z: point.z,
    rotationY: room.rotation,
    scale,
    roomId: room.id,
    collision: true,
  })
}

function localToWorld(room: DungeonRoom, localX: number, localZ: number) {
  const angle = room.rotation * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: room.x + localX * cos - localZ * sin, z: room.z + localX * sin + localZ * cos }
}
