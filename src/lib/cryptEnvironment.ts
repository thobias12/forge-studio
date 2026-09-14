import * as THREE from 'three'
import type { DungeonConnection, DungeonRoom } from './dungeonPackage'
import type { DungeonAtmosphere } from './dungeonAtmosphere'

export type CryptOpening = Pick<DungeonConnection, 'side' | 'offset' | 'openingWidth'>
export type CryptFlickerLight = { light: THREE.PointLight; base: number; phase: number; speed: number }

type Side = CryptOpening['side']

type RoomContext = {
  group: THREE.Group
  room: DungeonRoom
  atmosphere: DungeonAtmosphere
  flickerLights: CryptFlickerLight[]
  immersive: boolean
  stone: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
}

export function addCryptRoomEnvironment(
  parent: THREE.Group,
  room: DungeonRoom,
  openings: CryptOpening[],
  wallThickness: number,
  atmosphere: DungeonAtmosphere,
  flickerLights: CryptFlickerLight[],
  immersive: boolean,
) {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  group.userData.cryptEnvironment = true
  group.userData.roomId = room.id
  parent.add(group)

  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.93, metalness: 0.01 })
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.97 })
  const iron = new THREE.MeshStandardMaterial({ color: 0x343b40, roughness: 0.68, metalness: 0.38 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x4b372a, roughness: 0.9 })
  const ctx: RoomContext = { group, room, atmosphere, flickerLights, immersive, stone, dark, iron, wood }

  addFlagstoneFloor(ctx)
  addCornerPillars(ctx)
  addWallArchitecture(ctx, openings, Math.max(0.12, wallThickness))
  addRoomDressing(ctx)
  addRoomFill(ctx)
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
  const mid = { x: to.x, z: from.z }
  addCorridorSegmentDetail(parent, from.x, from.z, mid.x, mid.z, width, atmosphere, `${seedKey}-a`, immersive)
  addCorridorSegmentDetail(parent, mid.x, mid.z, to.x, to.z, width, atmosphere, `${seedKey}-b`, immersive)
}

function addFlagstoneFloor(ctx: RoomContext) {
  const { group, room, atmosphere } = ctx
  const random = seededRandom(stringSeed(`shared-floor-${room.id}`))
  const step = room.type === 'boss' ? 1.18 : 1.02
  const tiles: Array<{ x: number; z: number; sx: number; sz: number; y: number; r: number; shade: number }> = []
  for (let x = -room.width / 2 + step * 0.5; x < room.width / 2; x += step) {
    for (let z = -room.depth / 2 + step * 0.5; z < room.depth / 2; z += step) {
      if (random() < 0.055) continue
      tiles.push({
        x: x + (random() - 0.5) * 0.1,
        z: z + (random() - 0.5) * 0.1,
        sx: step * (0.86 + random() * 0.12),
        sz: step * (0.86 + random() * 0.12),
        y: 0.19 + random() * 0.018,
        r: (random() - 0.5) * 0.04,
        shade: 0.8 + random() * 0.24,
      })
    }
  }
  if (tiles.length) {
    const geometry = new THREE.BoxGeometry(1, 0.05, 1)
    const material = new THREE.MeshStandardMaterial({ color: atmosphere.floor, roughness: 0.8, metalness: 0.02 })
    const mesh = new THREE.InstancedMesh(geometry, material, tiles.length)
    const dummy = new THREE.Object3D()
    const base = new THREE.Color(atmosphere.floor)
    tiles.forEach((tile, index) => {
      dummy.position.set(tile.x, tile.y, tile.z)
      dummy.rotation.set(0, tile.r, 0)
      dummy.scale.set(tile.sx, 1, tile.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, base.clone().multiplyScalar(tile.shade))
    })
    mesh.receiveShadow = true
    mesh.userData.roomId = room.id
    group.add(mesh)
  }

  const puddles = room.type === 'boss' ? 3 : room.type === 'entrance' ? 0 : 1 + Math.floor(random() * 2)
  for (let i = 0; i < puddles; i += 1) {
    const radius = 0.4 + random() * 0.58
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshStandardMaterial({ color: 0x111923, roughness: 0.19, metalness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }),
    )
    puddle.rotation.x = -Math.PI / 2
    puddle.scale.y = 0.55 + random() * 0.32
    puddle.position.set((random() - 0.5) * room.width * 0.52, 0.225, (random() - 0.5) * room.depth * 0.52)
    puddle.userData.roomId = room.id
    group.add(puddle)
  }
}

function addCornerPillars(ctx: RoomContext) {
  const { group, room, stone, dark } = ctx
  const inset = 0.18
  const corners: Array<[number, number]> = [
    [-room.width / 2 + inset, -room.depth / 2 + inset], [room.width / 2 - inset, -room.depth / 2 + inset],
    [-room.width / 2 + inset, room.depth / 2 - inset], [room.width / 2 - inset, room.depth / 2 - inset],
  ]
  for (const [x, z] of corners) {
    const shaftHeight = Math.max(1.15, room.height - 0.62)
    const shaft = roomMesh(ctx, new THREE.CylinderGeometry(0.22, 0.29, shaftHeight, 8), stone)
    shaft.position.set(x, 0.31 + shaftHeight / 2, z)
    shaft.castShadow = true
    shaft.receiveShadow = true
    group.add(shaft)
    const base = roomMesh(ctx, new THREE.BoxGeometry(0.68, 0.28, 0.68), dark)
    base.position.set(x, 0.14, z)
    group.add(base)
    const plinth = roomMesh(ctx, new THREE.CylinderGeometry(0.39, 0.43, 0.18, 8), stone)
    plinth.position.set(x, 0.37, z)
    group.add(plinth)
    const capital = roomMesh(ctx, new THREE.BoxGeometry(0.62, 0.24, 0.62), dark)
    capital.position.set(x, Math.max(0.7, room.height - 0.22), z)
    group.add(capital)
    const neck = roomMesh(ctx, new THREE.CylinderGeometry(0.35, 0.27, 0.2, 8), stone)
    neck.position.set(x, Math.max(0.62, room.height - 0.44), z)
    group.add(neck)
  }
}

function addWallArchitecture(ctx: RoomContext, openings: CryptOpening[], thickness: number) {
  const { group, room, stone, dark } = ctx
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    const sideOpenings = openings.filter((opening) => opening.side === side)
    const total = side === 'north' || side === 'south' ? room.width : room.depth
    const baySpacing = 2.8
    const bayCount = Math.max(1, Math.floor(total / baySpacing))
    for (let index = 0; index < bayCount; index += 1) {
      const along = -total / 2 + (index + 0.5) * (total / bayCount)
      if (sideOpenings.some((opening) => Math.abs(opening.offset - along) < opening.openingWidth / 2 + 0.75)) continue
      const panel = roomMesh(ctx, new THREE.BoxGeometry(1.25, Math.min(1.7, room.height * 0.52), 0.055), dark)
      placeOnSide(panel, room, side, along, Math.min(1.7, room.height * 0.52) / 2 + 0.34, thickness * 0.5 + 0.015)
      group.add(panel)
      for (const offset of [-0.78, 0.78]) {
        const support = roomMesh(ctx, new THREE.BoxGeometry(0.2, Math.min(2.15, room.height * 0.7), 0.2), dark)
        placeOnSide(support, room, side, along + offset, Math.min(2.15, room.height * 0.7) / 2, -0.075)
        support.castShadow = true
        group.add(support)
      }
    }

    for (const opening of sideOpenings) addDoorArch(ctx, side, opening.offset, opening.openingWidth, thickness, stone, dark)
  }
}

function addDoorArch(ctx: RoomContext, side: Side, center: number, openingWidth: number, thickness: number, stone: THREE.Material, dark: THREE.Material) {
  const { group, room } = ctx
  const doorHeight = Math.min(2.45, Math.max(1.9, room.height - 0.4))
  const jambHeight = Math.min(doorHeight * 0.78, 1.8)
  const half = openingWidth / 2 + 0.16
  for (const sign of [-1, 1]) {
    const jamb = roomMesh(ctx, new THREE.BoxGeometry(0.27, jambHeight, thickness + 0.18), stone)
    placeOnSide(jamb, room, side, center + sign * half, jambHeight / 2, -0.07)
    jamb.castShadow = true
    group.add(jamb)
    const foot = roomMesh(ctx, new THREE.BoxGeometry(0.42, 0.24, thickness + 0.22), dark)
    placeOnSide(foot, room, side, center + sign * half, 0.12, -0.09)
    group.add(foot)
  }

  const radius = Math.max(0.7, openingWidth * 0.52)
  const centerY = Math.min(doorHeight - 0.14, 2.05)
  const stones = 9
  for (let index = 0; index < stones; index += 1) {
    const t = index / (stones - 1)
    const angle = Math.PI * t
    const along = center + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius * 0.53
    const voussoir = roomMesh(ctx, new THREE.BoxGeometry(0.34, 0.24, thickness + 0.21), index === Math.floor(stones / 2) ? dark : stone)
    placeOnSide(voussoir, room, side, along, y, -0.09)
    if (side === 'north' || side === 'south') voussoir.rotation.z = (Math.PI / 2 - angle) * 0.46
    else voussoir.rotation.x = -(Math.PI / 2 - angle) * 0.46
    voussoir.castShadow = true
    group.add(voussoir)
  }
}

function addRoomDressing(ctx: RoomContext) {
  const { room, atmosphere, flickerLights } = ctx
  const random = seededRandom(stringSeed(`shared-dress-${room.id}`))
  const edgeX = Math.max(1.2, room.width / 2 - 1.25)
  const edgeZ = Math.max(1.2, room.depth / 2 - 1.25)

  if (room.type === 'entrance') {
    addBrazier(ctx, -edgeX * 0.62, -edgeZ * 0.55, 0.82)
    addBrazier(ctx, edgeX * 0.62, -edgeZ * 0.55, 0.82)
    addBench(ctx, 0, edgeZ * 0.72, 0)
  } else if (room.type === 'combat') {
    addSarcophagus(ctx, -edgeX * 0.82, -edgeZ * 0.15, Math.PI / 2)
    if (room.width > 7) addSarcophagus(ctx, edgeX * 0.82, edgeZ * 0.2, Math.PI / 2)
    addRubble(ctx, edgeX * 0.5, -edgeZ * 0.58, random)
    addBones(ctx, -edgeX * 0.35, edgeZ * 0.62, random)
  } else if (room.type === 'elite') {
    addSarcophagus(ctx, 0, edgeZ * 0.5, 0, 1.15)
    addBrazier(ctx, -edgeX * 0.66, 0, 1)
    addBrazier(ctx, edgeX * 0.66, 0, 1)
    addBones(ctx, 0, -edgeZ * 0.58, random)
  } else if (room.type === 'treasure') {
    addAltar(ctx, 0, edgeZ * 0.5, 0)
    addCandles(ctx, -0.75, edgeZ * 0.28, 5)
    addCandles(ctx, 0.75, edgeZ * 0.28, 4)
    addUrns(ctx, -edgeX * 0.72, edgeZ * 0.58, random)
    addUrns(ctx, edgeX * 0.72, edgeZ * 0.58, random)
  } else if (room.type === 'shrine') {
    addAltar(ctx, 0, edgeZ * 0.45, 0, 1.12)
    addCandles(ctx, -1, 0.1, 6)
    addCandles(ctx, 1, 0.1, 6)
    addBench(ctx, -edgeX * 0.45, -edgeZ * 0.25, Math.PI / 2)
    addBench(ctx, edgeX * 0.45, -edgeZ * 0.25, Math.PI / 2)
  } else if (room.type === 'boss') {
    addBossDais(ctx)
    addBrazier(ctx, -edgeX * 0.72, -edgeZ * 0.68, 1.15)
    addBrazier(ctx, edgeX * 0.72, -edgeZ * 0.68, 1.15)
    addBrazier(ctx, -edgeX * 0.72, edgeZ * 0.68, 1.15)
    addBrazier(ctx, edgeX * 0.72, edgeZ * 0.68, 1.15)
    addSarcophagus(ctx, -edgeX * 0.75, 0, Math.PI / 2, 1.18)
    addSarcophagus(ctx, edgeX * 0.75, 0, Math.PI / 2, 1.18)
  } else if (room.type === 'secret') {
    addSarcophagus(ctx, 0, edgeZ * 0.32, 0, 0.95, true)
    addRubble(ctx, -edgeX * 0.5, -edgeZ * 0.45, random, 1.25)
    addRubble(ctx, edgeX * 0.45, -edgeZ * 0.2, random, 0.9)
    addUrns(ctx, edgeX * 0.58, edgeZ * 0.55, random)
  } else {
    addBench(ctx, 0, edgeZ * 0.55, 0)
    addUrns(ctx, -edgeX * 0.55, edgeZ * 0.5, random)
  }

  // Keep TypeScript aware that the shared room ambience intentionally belongs here.
  void atmosphere
  void flickerLights
}

function addRoomFill(ctx: RoomContext) {
  const { group, room, atmosphere, immersive } = ctx
  const intensity = (room.type === 'boss' ? 0.48 : room.type === 'entrance' ? 0.34 : 0.26) * (immersive ? 1 : 0.72)
  const fill = new THREE.PointLight(atmosphere.sky, intensity, Math.max(room.width, room.depth) * 0.8, 1.6)
  fill.position.set(0, Math.min(1.85, room.height * 0.56), 0)
  group.add(fill)
}

function addSarcophagus(ctx: RoomContext, x: number, z: number, rotation = 0, scale = 1, broken = false) {
  const { group, stone, dark } = ctx
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = rotation
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  const base = roomMesh(ctx, new THREE.BoxGeometry(1.15, 0.34, 2.15), dark)
  base.position.y = 0.17
  const body = roomMesh(ctx, new THREE.BoxGeometry(0.98, 0.48, 1.92), stone)
  body.position.y = 0.5
  const lid = roomMesh(ctx, new THREE.BoxGeometry(1.06, 0.18, 2.02), stone)
  lid.position.y = 0.82
  lid.rotation.z = broken ? 0.11 : 0
  lid.position.x = broken ? 0.18 : 0
  root.add(base, body, lid)
  group.add(root)
}

function addAltar(ctx: RoomContext, x: number, z: number, rotation = 0, scale = 1) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = rotation
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  const plinth = roomMesh(ctx, new THREE.BoxGeometry(1.5, 0.24, 1.05), ctx.dark)
  plinth.position.y = 0.12
  const base = roomMesh(ctx, new THREE.BoxGeometry(1.18, 0.65, 0.8), ctx.stone)
  base.position.y = 0.55
  const top = roomMesh(ctx, new THREE.BoxGeometry(1.42, 0.18, 0.98), ctx.stone)
  top.position.y = 0.97
  root.add(plinth, base, top)
  ctx.group.add(root)
}

function addBrazier(ctx: RoomContext, x: number, z: number, scale = 1) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  const stem = roomMesh(ctx, new THREE.CylinderGeometry(0.08, 0.12, 0.72, 8), ctx.iron)
  stem.position.y = 0.38
  const bowl = roomMesh(ctx, new THREE.CylinderGeometry(0.34, 0.2, 0.17, 12), ctx.iron)
  bowl.position.y = 0.8
  const flameMat = new THREE.MeshStandardMaterial({ color: ctx.atmosphere.torch, emissive: ctx.atmosphere.torch, emissiveIntensity: 2.1, roughness: 0.28 })
  const flame = roomMesh(ctx, new THREE.SphereGeometry(0.14, 9, 7), flameMat)
  flame.scale.set(0.78, 1.55, 0.78)
  flame.position.y = 0.98
  root.add(stem, bowl, flame)
  const base = ctx.atmosphere.torchIntensity * 0.5 * scale * (ctx.immersive ? 1 : 0.78)
  const light = new THREE.PointLight(ctx.atmosphere.torch, base, 8.5 * scale, 1.55)
  light.position.y = 1.03
  root.add(light)
  ctx.flickerLights.push({ light, base, phase: stringSeed(`${ctx.room.id}-${x}-${z}`) % 628 / 100, speed: 5.1 + scale })
  ctx.group.add(root)
}

function addCandles(ctx: RoomContext, x: number, z: number, count: number) {
  const random = seededRandom(stringSeed(`candles-${ctx.room.id}-${x}-${z}`))
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.userData.roomId = ctx.room.id
  for (let index = 0; index < count; index += 1) {
    const px = (random() - 0.5) * 0.75
    const pz = (random() - 0.5) * 0.55
    const h = 0.16 + random() * 0.2
    const wax = roomMesh(ctx, new THREE.CylinderGeometry(0.035, 0.045, h, 7), new THREE.MeshStandardMaterial({ color: 0xc8b99a, roughness: 0.9 }))
    wax.position.set(px, h / 2, pz)
    const flame = roomMesh(ctx, new THREE.SphereGeometry(0.025, 6, 5), new THREE.MeshBasicMaterial({ color: ctx.atmosphere.torch }))
    flame.scale.y = 1.5
    flame.position.set(px, h + 0.035, pz)
    root.add(wax, flame)
  }
  const light = new THREE.PointLight(ctx.atmosphere.torch, 0.28 * (ctx.immersive ? 1 : 0.7), 3.2, 1.7)
  light.position.y = 0.5
  root.add(light)
  ctx.group.add(root)
}

function addUrns(ctx: RoomContext, x: number, z: number, random: () => number) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.userData.roomId = ctx.room.id
  const count = 2 + Math.floor(random() * 2)
  for (let index = 0; index < count; index += 1) {
    const scale = 0.75 + random() * 0.35
    const urn = roomMesh(ctx, new THREE.CylinderGeometry(0.18 * scale, 0.13 * scale, 0.48 * scale, 9), ctx.stone)
    urn.position.set((random() - 0.5) * 0.72, 0.24 * scale, (random() - 0.5) * 0.6)
    root.add(urn)
  }
  ctx.group.add(root)
}

function addBones(ctx: RoomContext, x: number, z: number, random: () => number) {
  const root = new THREE.Group()
  root.position.set(x, 0.24, z)
  root.userData.roomId = ctx.room.id
  const boneMat = new THREE.MeshStandardMaterial({ color: 0x8d897b, roughness: 0.92 })
  for (let index = 0; index < 7; index += 1) {
    const bone = roomMesh(ctx, new THREE.CylinderGeometry(0.035, 0.045, 0.42 + random() * 0.18, 6), boneMat)
    bone.rotation.z = Math.PI / 2
    bone.rotation.y = random() * Math.PI
    bone.position.set((random() - 0.5) * 0.8, random() * 0.05, (random() - 0.5) * 0.7)
    root.add(bone)
  }
  ctx.group.add(root)
}

function addRubble(ctx: RoomContext, x: number, z: number, random: () => number, scale = 1) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  for (let index = 0; index < 7; index += 1) {
    const radius = 0.11 + random() * 0.16
    const rock = roomMesh(ctx, new THREE.DodecahedronGeometry(radius, 0), ctx.stone)
    rock.position.set((random() - 0.5) * 1.15, radius, (random() - 0.5) * 1.05)
    rock.rotation.set(random(), random(), random())
    root.add(rock)
  }
  ctx.group.add(root)
}

function addBench(ctx: RoomContext, x: number, z: number, rotation: number) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = rotation
  root.userData.roomId = ctx.room.id
  const seat = roomMesh(ctx, new THREE.BoxGeometry(1.65, 0.18, 0.5), ctx.stone)
  seat.position.y = 0.55
  const legA = roomMesh(ctx, new THREE.BoxGeometry(0.22, 0.55, 0.42), ctx.dark)
  legA.position.set(-0.58, 0.28, 0)
  const legB = legA.clone()
  legB.position.x = 0.58
  legB.userData.roomId = ctx.room.id
  root.add(seat, legA, legB)
  ctx.group.add(root)
}

function addBossDais(ctx: RoomContext) {
  const lower = roomMesh(ctx, new THREE.CylinderGeometry(2.4, 2.55, 0.18, 32), ctx.dark)
  lower.position.y = 0.18
  const upper = roomMesh(ctx, new THREE.CylinderGeometry(1.85, 1.95, 0.16, 32), ctx.stone)
  upper.position.y = 0.34
  ctx.group.add(lower, upper)
  const ring = roomMesh(ctx, new THREE.RingGeometry(1.15, 1.52, 48), new THREE.MeshBasicMaterial({ color: 0x71353b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.435
  ctx.group.add(ring)
}

function addCorridorSegmentDetail(parent: THREE.Group, x1: number, z1: number, x2: number, z2: number, width: number, atmosphere: DungeonAtmosphere, seedKey: string, immersive: boolean) {
  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.hypot(dx, dz)
  if (length < 0.3) return
  const angle = Math.atan2(dx, dz)
  const cx = (x1 + x2) / 2
  const cz = (z1 + z2) / 2
  const random = seededRandom(stringSeed(seedKey))
  const tileSize = 0.95
  const across = Math.max(1, Math.floor(width / tileSize))
  const along = Math.max(1, Math.floor(length / tileSize))
  const material = new THREE.MeshStandardMaterial({ color: atmosphere.corridorFloor, roughness: 0.82, metalness: 0.02 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.045, 1), material, across * along)
  const dummy = new THREE.Object3D()
  let index = 0
  for (let a = 0; a < across; a += 1) {
    for (let l = 0; l < along; l += 1) {
      const localX = (a - (across - 1) / 2) * (width / across)
      const localZ = (l - (along - 1) / 2) * (length / along)
      dummy.position.set(
        cx + Math.cos(angle) * localX + Math.sin(angle) * localZ,
        0.155 + random() * 0.012,
        cz - Math.sin(angle) * localX + Math.cos(angle) * localZ,
      )
      dummy.rotation.set(0, angle + (random() - 0.5) * 0.025, 0)
      dummy.scale.set((width / across) * (0.86 + random() * 0.08), 1, (length / along) * (0.86 + random() * 0.08))
      dummy.updateMatrix()
      mesh.setMatrixAt(index++, dummy.matrix)
    }
  }
  mesh.receiveShadow = true
  parent.add(mesh)

  const buttressMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.corridorWall, roughness: 0.94 })
  const count = Math.floor(length / 3.2)
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const distanceAlong = -length / 2 + (i + 0.5) * (length / Math.max(1, count))
      const height = immersive ? 2.12 : 1.15
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.32, height, 0.4), buttressMaterial)
      buttress.position.set(
        cx + Math.cos(angle) * (width / 2 + 0.16) * side + Math.sin(angle) * distanceAlong,
        height / 2,
        cz - Math.sin(angle) * (width / 2 + 0.16) * side + Math.cos(angle) * distanceAlong,
      )
      buttress.rotation.y = angle
      buttress.castShadow = true
      buttress.receiveShadow = true
      parent.add(buttress)
    }
  }
}

function placeOnSide(object: THREE.Object3D, room: DungeonRoom, side: Side, along: number, y: number, normalOffset: number) {
  if (side === 'north') object.position.set(along, y, -room.depth / 2 + normalOffset)
  if (side === 'south') object.position.set(along, y, room.depth / 2 - normalOffset)
  if (side === 'west') object.position.set(-room.width / 2 + normalOffset, y, along)
  if (side === 'east') object.position.set(room.width / 2 - normalOffset, y, along)
  if (side === 'west' || side === 'east') object.rotation.y = Math.PI / 2
}

function roomMesh(ctx: RoomContext, geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.roomId = ctx.room.id
  mesh.receiveShadow = true
  return mesh
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
