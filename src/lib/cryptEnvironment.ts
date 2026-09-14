import * as THREE from 'three'
import type { DungeonConnection, DungeonRoom } from './dungeonPackage'
import type { DungeonAtmosphere } from './dungeonAtmosphere'
import {
  addCryptRoomEnvironment as addLegacyRoom,
  addCryptCorridorEnvironment as addLegacyCorridor,
  type CryptOpening,
  type CryptFlickerLight,
} from './cryptEnvironmentLegacy'
import { addCryptRoomSurfacePass, addCryptCorridorSurfacePass } from './cryptSurfacePass'

export type { CryptOpening, CryptFlickerLight } from './cryptEnvironmentLegacy'

export function addCryptRoomEnvironment(
  parent: THREE.Group,
  room: DungeonRoom,
  openings: CryptOpening[],
  wallThickness: number,
  atmosphere: DungeonAtmosphere,
  flickerLights: CryptFlickerLight[],
  immersive: boolean,
) {
  const start = parent.children.length
  addLegacyRoom(parent, room, openings, wallThickness, atmosphere, flickerLights, immersive)
  addCryptRoomSurfacePass(parent, room, openings, wallThickness, atmosphere, flickerLights, immersive)
  if (!immersive) suppressFloatingTopTrim(parent.children.slice(start), room.floorLevel + Math.min(room.height - 0.7, 3.15))
}

export function addCryptCorridorEnvironment(
  parent: THREE.Group,
  from: DungeonConnection,
  to: DungeonConnection,
  width: number,
  atmosphere: DungeonAtmosphere,
  seedKey: string,
  immersive: boolean,
) {
  const start = parent.children.length
  addLegacyCorridor(parent, from, to, width, atmosphere, seedKey, immersive)
  addCryptCorridorSurfacePass(parent, from, to, width, atmosphere, seedKey)
  if (!immersive) suppressFloatingTopTrim(parent.children.slice(start), 2.85)
}

function suppressFloatingTopTrim(objects: THREE.Object3D[], minWorldY: number) {
  const size = new THREE.Vector3()
  const world = new THREE.Vector3()
  for (const object of objects) object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox
    if (!box) return
    box.getSize(size)
    mesh.getWorldPosition(world)
    const long = Math.max(size.x, size.z)
    // The old decorative cornice pieces sit above the ARPG wall fade. When the
    // foreground wall fades they were left behind as long floating roof planes.
    // Keep real arches/pillars, but omit only the very long, very thin top trims.
    if (world.y >= minWorldY && size.y <= 0.24 && long >= 2.5) mesh.visible = false
  })
}
