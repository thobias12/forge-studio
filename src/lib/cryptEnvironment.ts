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
  addLegacyRoom(parent, room, openings, wallThickness, atmosphere, flickerLights, immersive)
  addCryptRoomSurfacePass(parent, room, openings, wallThickness, atmosphere, flickerLights, immersive)
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
  addLegacyCorridor(parent, from, to, width, atmosphere, seedKey, immersive)
  addCryptCorridorSurfacePass(parent, from, to, width, atmosphere, seedKey)
}
