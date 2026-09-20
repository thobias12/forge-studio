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
  stoneLight: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  bone: THREE.MeshStandardMaterial
}

type FloorSlab = { x: number; z: number; sx: number; sz: number; y: number; rotation: number; shade: number }

type WallBlock = { along: number; y: number; length: number; height: number; depth: number; shade: number }

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

  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wall, roughness: 0.88, metalness: 0.015 })
  const stoneLight = new THREE.MeshStandardMaterial({ color: new THREE.Color(atmosphere.wall).multiplyScalar(1.16), roughness: 0.86, metalness: 0.01 })
  const dark = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.97, metalness: 0.005 })
  const iron = new THREE.MeshStandardMaterial({ color: 0x313941, roughness: 0.6, metalness: 0.46 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x493326, roughness: 0.9 })
  const bone = new THREE.MeshStandardMaterial({ color: 0x8e897a, roughness: 0.92 })
  const ctx: RoomContext = { group, room, atmosphere, flickerLights, immersive, stone, stoneLight, dark, iron, wood, bone }

  addFlagstoneFloor(ctx)
  addWallStoneCourses(ctx, openings, Math.max(0.12, wallThickness))
  addCornerPillars(ctx)
  addWallArchitecture(ctx, openings, Math.max(0.12, wallThickness))
  addWallLighting(ctx, openings, Math.max(0.12, wallThickness))
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
  const random = seededRandom(stringSeed(`crypt-floor-${room.id}`))
  const slabs: FloorSlab[] = []
  let z = -room.depth / 2 + 0.42
  let row = 0
  while (z < room.depth / 2 - 0.18) {
    const rowDepth = 0.72 + random() * 0.48
    let x = -room.width / 2 + (row % 2 ? -0.45 : 0.08) + random() * 0.26
    while (x < room.width / 2 - 0.12) {
      const slabWidth = 0.78 + random() * 1.35
      const missing = random() < (room.type === 'secret' ? 0.095 : 0.045)
      if (!missing) {
        slabs.push({
          x: x + slabWidth / 2 + (random() - 0.5) * 0.05,
          z: z + rowDepth / 2 + (random() - 0.5) * 0.05,
          sx: Math.min(slabWidth * (0.91 + random() * 0.06), room.width),
          sz: rowDepth * (0.89 + random() * 0.06),
          y: 0.19 + random() * 0.022,
          rotation: (random() - 0.5) * 0.026,
          shade: 0.76 + random() * 0.26,
        })
      }
      x += slabWidth + 0.08 + random() * 0.08
    }
    z += rowDepth + 0.08 + random() * 0.06
    row += 1
  }

  if (slabs.length) {
    const geometry = new THREE.BoxGeometry(1, 0.055, 1)
    const material = new THREE.MeshStandardMaterial({ color: atmosphere.floor, roughness: 0.72, metalness: 0.025 })
    const mesh = new THREE.InstancedMesh(geometry, material, slabs.length)
    const dummy = new THREE.Object3D()
    const base = new THREE.Color(atmosphere.floor)
    slabs.forEach((slab, index) => {
      dummy.position.set(slab.x, slab.y, slab.z)
      dummy.rotation.set(0, slab.rotation, 0)
      dummy.scale.set(slab.sx, 1, slab.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, base.clone().multiplyScalar(slab.shade))
    })
    mesh.receiveShadow = true
    mesh.userData.roomId = room.id
    group.add(mesh)
  }

  const crackCount = room.type === 'boss' ? 7 : room.type === 'entrance' ? 2 : 3 + Math.floor(random() * 3)
  const crackMaterial = new THREE.MeshBasicMaterial({ color: atmosphere.seam, transparent: true, opacity: 0.76, depthWrite: false })
  for (let index = 0; index < crackCount; index += 1) {
    const root = new THREE.Group()
    root.position.set((random() - 0.5) * room.width * 0.68, 0.225, (random() - 0.5) * room.depth * 0.68)
    root.rotation.y = random() * Math.PI
    let cursorX = 0
    let cursorZ = 0
    for (let segment = 0; segment < 2 + Math.floor(random() * 3); segment += 1) {
      const length = 0.35 + random() * 0.52
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.006, length), crackMaterial)
      line.position.set(cursorX, 0, cursorZ + length / 2)
      line.rotation.y = (random() - 0.5) * 0.7
      root.add(line)
      cursorX += (random() - 0.5) * 0.22
      cursorZ += length * 0.72
    }
    root.userData.roomId = room.id
    group.add(root)
  }

  const puddleCount = room.type === 'boss' ? 5 : room.type === 'entrance' ? 1 : 2 + Math.floor(random() * 3)
  for (let index = 0; index < puddleCount; index += 1) {
    const radius = 0.48 + random() * 0.9
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
      new THREE.MeshStandardMaterial({ color: 0x0b151d, roughness: 0.1, metalness: 0.08, transparent: true, opacity: 0.38, depthWrite: false }),
    )
    puddle.rotation.x = -Math.PI / 2
    puddle.rotation.z = random() * Math.PI
    puddle.scale.set(1, 0.45 + random() * 0.42, 1)
    puddle.position.set((random() - 0.5) * room.width * 0.66, 0.232, (random() - 0.5) * room.depth * 0.66)
    puddle.userData.roomId = room.id
    group.add(puddle)
  }

  const fragmentCount = room.type === 'boss' ? 10 : 4 + Math.floor(random() * 5)
  for (let index = 0; index < fragmentCount; index += 1) {
    const edge = index % 4
    const width = 0.24 + random() * 0.42
    const depth = 0.24 + random() * 0.5
    const fragment = roomMesh(ctx, new THREE.BoxGeometry(width, 0.08 + random() * 0.08, depth), index % 3 === 0 ? ctx.dark : ctx.stone)
    const edgeX = room.width / 2 - 0.55 - random() * 1.35
    const edgeZ = room.depth / 2 - 0.55 - random() * 1.35
    if (edge === 0) fragment.position.set((random() - 0.5) * room.width * 0.68, 0.1, -edgeZ)
    if (edge === 1) fragment.position.set(edgeX, 0.1, (random() - 0.5) * room.depth * 0.68)
    if (edge === 2) fragment.position.set((random() - 0.5) * room.width * 0.68, 0.1, edgeZ)
    if (edge === 3) fragment.position.set(-edgeX, 0.1, (random() - 0.5) * room.depth * 0.68)
    fragment.rotation.set((random() - 0.5) * 0.14, random() * Math.PI, (random() - 0.5) * 0.14)
    fragment.castShadow = true
    group.add(fragment)
  }
}

function addWallStoneCourses(ctx: RoomContext, openings: CryptOpening[], thickness: number) {
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    const sideOpenings = openings.filter((opening) => opening.side === side)
    const total = side === 'north' || side === 'south' ? ctx.room.width : ctx.room.depth
    const displayHeight = ctx.immersive ? ctx.room.height : Math.min(ctx.room.height, 3.1)
    const rows = Math.max(4, Math.floor(displayHeight / 0.78))
    const rowHeight = displayHeight / rows
    const blocks: WallBlock[] = []
    const random = seededRandom(stringSeed(`courses-${ctx.room.id}-${side}`))
    for (let row = 0; row < rows; row += 1) {
      let along = -total / 2 - (row % 2 ? 0.55 : 0)
      while (along < total / 2) {
        const length = 0.82 + random() * 0.72
        const center = along + length / 2
        const blocked = sideOpenings.some((opening) => Math.abs(center - opening.offset) < opening.openingWidth / 2 + 0.12)
        if (!blocked && center > -total / 2 && center < total / 2) {
          blocks.push({
            along: center,
            y: row * rowHeight + rowHeight * 0.5,
            length: Math.min(length * 0.94, total),
            height: rowHeight * (0.83 + random() * 0.08),
            depth: 0.065 + random() * 0.035,
            shade: 0.78 + random() * 0.25,
          })
        }
        along += length + 0.055 + random() * 0.045
      }
    }
    if (!blocks.length) continue
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({ color: ctx.atmosphere.wall, roughness: 0.9, metalness: 0.01 })
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length)
    const dummy = new THREE.Object3D()
    const base = new THREE.Color(ctx.atmosphere.wall)
    blocks.forEach((block, index) => {
      if (side === 'north') dummy.position.set(block.along, block.y, -ctx.room.depth / 2 + thickness / 2 + 0.045)
      if (side === 'south') dummy.position.set(block.along, block.y, ctx.room.depth / 2 - thickness / 2 - 0.045)
      if (side === 'west') dummy.position.set(-ctx.room.width / 2 + thickness / 2 + 0.045, block.y, block.along)
      if (side === 'east') dummy.position.set(ctx.room.width / 2 - thickness / 2 - 0.045, block.y, block.along)
      dummy.rotation.set(0, side === 'west' || side === 'east' ? Math.PI / 2 : 0, 0)
      dummy.scale.set(block.length, block.height, block.depth)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, base.clone().multiplyScalar(block.shade))
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.roomId = ctx.room.id
    mesh.userData.wallSide = side
    mesh.userData.arpgOccluder = true
    ctx.group.add(mesh)
  }
}

function addCornerPillars(ctx: RoomContext) {
  const { group, room } = ctx
  const inset = 0.32
  const radius = room.type === 'boss' ? 0.4 : 0.32
  const corners: Array<[number, number]> = [
    [-room.width / 2 + inset, -room.depth / 2 + inset],
    [room.width / 2 - inset, -room.depth / 2 + inset],
    [-room.width / 2 + inset, room.depth / 2 - inset],
    [room.width / 2 - inset, room.depth / 2 - inset],
  ]
  for (const [x, z] of corners) {
    const shaftHeight = Math.max(2.2, room.height - 1.02)
    const base = roomMesh(ctx, new THREE.BoxGeometry(radius * 2.5, 0.24, radius * 2.5), ctx.dark)
    base.position.set(x, 0.12, z)
    const lower = roomMesh(ctx, new THREE.CylinderGeometry(radius * 1.22, radius * 1.38, 0.3, 8), ctx.stone)
    lower.position.set(x, 0.38, z)
    const shaft = roomMesh(ctx, new THREE.CylinderGeometry(radius * 0.82, radius, shaftHeight, 10), ctx.stoneLight)
    shaft.position.set(x, 0.53 + shaftHeight / 2, z)
    const ring = roomMesh(ctx, new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, 0.13, 10), ctx.dark)
    ring.position.set(x, room.height - 0.72, z)
    const capital = roomMesh(ctx, new THREE.BoxGeometry(radius * 2.25, 0.25, radius * 2.25), ctx.dark)
    capital.position.set(x, room.height - 0.28, z)
    for (const object of [base, lower, shaft, ring, capital]) {
      object.castShadow = true
      group.add(object)
    }
  }
}

function addWallArchitecture(ctx: RoomContext, openings: CryptOpening[], thickness: number) {
  const { room } = ctx
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    const sideOpenings = openings.filter((opening) => opening.side === side)
    const total = side === 'north' || side === 'south' ? room.width : room.depth
    const bayWidth = room.type === 'boss' ? 4.6 : 3.7
    const bayCount = Math.max(2, Math.floor(total / bayWidth))
    const bayStep = total / bayCount

    const lowerCourse = roomMesh(ctx, side === 'north' || side === 'south'
      ? new THREE.BoxGeometry(total, 0.28, thickness + 0.16)
      : new THREE.BoxGeometry(thickness + 0.16, 0.28, total), ctx.dark)
    placeOnSide(lowerCourse, room, side, 0, 0.14, -0.04)
    lowerCourse.castShadow = true
    ctx.group.add(lowerCourse)

    const cornice = roomMesh(ctx, side === 'north' || side === 'south'
      ? new THREE.BoxGeometry(total, 0.18, thickness + 0.18)
      : new THREE.BoxGeometry(thickness + 0.18, 0.18, total), ctx.dark)
    placeOnSide(cornice, room, side, 0, Math.min(room.height - 0.62, 3.45), -0.055)
    cornice.castShadow = true
    ctx.group.add(cornice)

    for (let index = 0; index < bayCount; index += 1) {
      const along = -total / 2 + (index + 0.5) * bayStep
      if (sideOpenings.some((opening) => Math.abs(opening.offset - along) < opening.openingWidth / 2 + 1)) continue
      const panelHeight = Math.min(room.height * 0.56, 2.45)
      const panelWidth = Math.min(2.2, bayStep * 0.62)
      const panel = roomMesh(ctx, new THREE.BoxGeometry(panelWidth, panelHeight, 0.075), ctx.dark)
      placeOnSide(panel, room, side, along, panelHeight / 2 + 0.42, thickness / 2 + 0.035)
      ctx.group.add(panel)

      for (const offset of [-bayStep * 0.38, bayStep * 0.38]) {
        const supportHeight = Math.min(room.height - 0.5, 3.65)
        const support = roomMesh(ctx, new THREE.BoxGeometry(0.3, supportHeight, 0.34), index % 3 === 0 ? ctx.stoneLight : ctx.stone)
        placeOnSide(support, room, side, along + offset, supportHeight / 2, -0.12)
        support.castShadow = true
        ctx.group.add(support)
        const foot = roomMesh(ctx, new THREE.BoxGeometry(0.46, 0.24, 0.48), ctx.dark)
        placeOnSide(foot, room, side, along + offset, 0.12, -0.16)
        ctx.group.add(foot)
      }

      const nicheSeed = stringSeed(`${room.id}-${side}-${index}`)
      if (room.type !== 'entrance' && nicheSeed % 100 < (room.type === 'boss' ? 72 : 48)) addTombNiche(ctx, side, along, thickness, nicheSeed % 3 === 0)
      else if (room.type === 'elite' || room.type === 'boss' || room.type === 'shrine') addWallBanner(ctx, side, along, thickness, room.type === 'boss' ? 1.2 : 0.92)
    }

    for (const opening of sideOpenings) addDoorArch(ctx, side, opening.offset, opening.openingWidth, thickness)
  }
}

function addDoorArch(ctx: RoomContext, side: Side, center: number, openingWidth: number, thickness: number) {
  const { room } = ctx
  const springY = Math.min(room.height - 1.1, Math.max(2.25, room.height * 0.55))
  const half = openingWidth / 2 + 0.22
  for (const sign of [-1, 1]) {
    const jamb = roomMesh(ctx, new THREE.BoxGeometry(0.38, springY, thickness + 0.28), ctx.stoneLight)
    placeOnSide(jamb, room, side, center + sign * half, springY / 2, -0.12)
    jamb.castShadow = true
    ctx.group.add(jamb)
    const foot = roomMesh(ctx, new THREE.BoxGeometry(0.6, 0.28, thickness + 0.34), ctx.dark)
    placeOnSide(foot, room, side, center + sign * half, 0.14, -0.15)
    ctx.group.add(foot)
    const cap = roomMesh(ctx, new THREE.BoxGeometry(0.56, 0.22, thickness + 0.32), ctx.dark)
    placeOnSide(cap, room, side, center + sign * half, springY - 0.08, -0.14)
    ctx.group.add(cap)
  }

  const radius = Math.max(1.05, openingWidth * 0.53)
  const stones = 13
  for (let index = 0; index < stones; index += 1) {
    const t = index / (stones - 1)
    const angle = Math.PI * t
    const along = center + Math.cos(angle) * radius
    const y = springY + Math.sin(angle) * radius * 0.5
    const keystone = index === Math.floor(stones / 2)
    const voussoir = roomMesh(ctx, new THREE.BoxGeometry(keystone ? 0.54 : 0.4, keystone ? 0.34 : 0.27, thickness + 0.32), keystone ? ctx.dark : ctx.stoneLight)
    placeOnSide(voussoir, room, side, along, y, -0.15)
    if (side === 'north' || side === 'south') voussoir.rotation.z = (Math.PI / 2 - angle) * 0.5
    else voussoir.rotation.x = -(Math.PI / 2 - angle) * 0.5
    voussoir.castShadow = true
    ctx.group.add(voussoir)
  }
}

function addTombNiche(ctx: RoomContext, side: Side, along: number, thickness: number, broken: boolean) {
  const root = new THREE.Group()
  placeWallRoot(root, ctx.room, side, along, 0, thickness / 2 + 0.06)
  root.userData.roomId = ctx.room.id

  const recess = roomMesh(ctx, new THREE.BoxGeometry(1.45, 1.95, 0.08), ctx.dark)
  recess.position.set(0, 1.42, 0)
  const slab = roomMesh(ctx, new THREE.BoxGeometry(0.88, 1.2, 0.14), ctx.stone)
  slab.position.set(broken ? 0.12 : 0, 1.13, 0.1)
  slab.rotation.z = broken ? 0.08 : 0
  const ledge = roomMesh(ctx, new THREE.BoxGeometry(1.35, 0.18, 0.28), ctx.stoneLight)
  ledge.position.set(0, 0.46, 0.12)
  const left = roomMesh(ctx, new THREE.BoxGeometry(0.17, 1.55, 0.24), ctx.stoneLight)
  left.position.set(-0.68, 1.25, 0.08)
  const right = left.clone()
  right.position.x = 0.68
  right.userData.roomId = ctx.room.id
  root.add(recess, slab, ledge, left, right)

  for (let index = 0; index < 7; index += 1) {
    const t = index / 6
    const angle = Math.PI * t
    const stone = roomMesh(ctx, new THREE.BoxGeometry(0.25, 0.18, 0.24), index === 3 ? ctx.dark : ctx.stoneLight)
    stone.position.set(Math.cos(angle) * 0.69, 2.02 + Math.sin(angle) * 0.4, 0.08)
    stone.rotation.z = Math.PI / 2 - angle
    root.add(stone)
  }

  if (!broken) {
    const skull = roomMesh(ctx, new THREE.SphereGeometry(0.12, 8, 6), ctx.bone)
    skull.scale.set(1, 0.9, 0.82)
    skull.position.set(0, 0.66, 0.23)
    root.add(skull)
  }
  ctx.group.add(root)
}

function addWallBanner(ctx: RoomContext, side: Side, along: number, thickness: number, scale: number) {
  const root = new THREE.Group()
  placeWallRoot(root, ctx.room, side, along, 0, thickness / 2 + 0.09)
  root.userData.roomId = ctx.room.id
  const rod = roomMesh(ctx, new THREE.CylinderGeometry(0.035, 0.035, 1.18 * scale, 8), ctx.iron)
  rod.rotation.z = Math.PI / 2
  rod.position.set(0, Math.min(ctx.room.height - 0.7, 3.35), 0.08)
  const cloth = roomMesh(ctx, new THREE.BoxGeometry(0.88 * scale, 1.48 * scale, 0.045), new THREE.MeshStandardMaterial({ color: ctx.room.type === 'boss' ? 0x442229 : 0x27313a, roughness: 0.92, side: THREE.DoubleSide }))
  cloth.position.set(0, rod.position.y - 0.78 * scale, 0.11)
  cloth.rotation.z = (stringSeed(`${ctx.room.id}-${side}-${along}`) % 11 - 5) * 0.008
  root.add(rod, cloth)
  ctx.group.add(root)
}

function addWallLighting(ctx: RoomContext, openings: CryptOpening[], thickness: number) {
  const placements: Array<{ side: Side; along: number }> = []
  const room = ctx.room
  const addSide = (side: Side, total: number, count: number) => {
    for (let index = 0; index < count; index += 1) placements.push({ side, along: -total * 0.27 + (count === 1 ? total * 0.27 : index * total * 0.54 / Math.max(1, count - 1)) })
  }
  addSide('north', room.width, room.type === 'boss' ? 2 : 1)
  addSide('south', room.width, room.type === 'boss' || room.type === 'elite' ? 2 : 1)
  if (room.width >= 18 || room.depth >= 16) {
    addSide('west', room.depth, 1)
    addSide('east', room.depth, 1)
  }

  for (const placement of placements) {
    const sideOpenings = openings.filter((opening) => opening.side === placement.side)
    if (sideOpenings.some((opening) => Math.abs(opening.offset - placement.along) < opening.openingWidth / 2 + 1.05)) continue
    addWallSconce(ctx, placement.side, placement.along, thickness)
  }
}

function addWallSconce(ctx: RoomContext, side: Side, along: number, thickness: number) {
  const root = new THREE.Group()
  const y = Math.min(ctx.room.height - 1.05, 2.45)
  placeWallRoot(root, ctx.room, side, along, y, thickness / 2 + 0.18)
  root.userData.roomId = ctx.room.id

  const arm = roomMesh(ctx, new THREE.BoxGeometry(0.08, 0.08, 0.46), ctx.iron)
  arm.position.set(0, -0.08, 0.18)
  arm.rotation.x = -0.2
  const bowl = roomMesh(ctx, new THREE.CylinderGeometry(0.2, 0.12, 0.13, 10), ctx.iron)
  bowl.position.set(0, 0.02, 0.45)
  const flame = flameMesh(ctx.atmosphere.torch, 0.09)
  flame.position.set(0, 0.22, 0.45)
  const glow = flameGlow(ctx.atmosphere.torch, 0.28)
  glow.position.copy(flame.position)
  root.add(arm, bowl, flame, glow)

  const base = ctx.atmosphere.torchIntensity * 0.36
  const light = new THREE.PointLight(ctx.atmosphere.torch, base, 10.5, 1.38)
  light.position.copy(flame.position)
  root.add(light)
  ctx.flickerLights.push({ light, base, phase: stringSeed(`${ctx.room.id}-${side}-${along}`) % 628 / 100, speed: 4.8 + (Math.abs(along) % 1.7) })
  ctx.group.add(root)
}

function addRoomDressing(ctx: RoomContext) {
  const { room } = ctx
  const random = seededRandom(stringSeed(`crypt-dress-${room.id}`))
  const edgeX = Math.max(2.3, room.width / 2 - 2.25)
  const edgeZ = Math.max(2.3, room.depth / 2 - 2.25)

  if (room.type === 'entrance') {
    addBrazier(ctx, -edgeX * 0.62, -edgeZ * 0.58, 0.96)
    addBrazier(ctx, edgeX * 0.62, -edgeZ * 0.58, 0.96)
    addBench(ctx, -1.3, edgeZ * 0.72, 0)
    addBench(ctx, 1.3, edgeZ * 0.72, 0)
    addCandles(ctx, -edgeX * 0.45, edgeZ * 0.58, 5)
    addChains(ctx, edgeX * 0.72, -edgeZ * 0.75, 6)
  } else if (room.type === 'combat') {
    addSarcophagus(ctx, -edgeX * 0.9, -edgeZ * 0.18, Math.PI / 2)
    addSarcophagus(ctx, edgeX * 0.9, edgeZ * 0.22, Math.PI / 2, 0.96, random() > 0.6)
    if (room.width > 18) addSarcophagus(ctx, -edgeX * 0.34, edgeZ * 0.84, 0, 0.9, random() > 0.5)
    addRubble(ctx, edgeX * 0.56, -edgeZ * 0.66, random, 1.15)
    addRubble(ctx, -edgeX * 0.62, edgeZ * 0.7, random, 0.9)
    addBones(ctx, -edgeX * 0.25, edgeZ * 0.62, random)
    addCandles(ctx, edgeX * 0.36, edgeZ * 0.73, 4)
  } else if (room.type === 'elite') {
    addRitualInlay(ctx, Math.min(room.width, room.depth) * 0.16, 0x623138)
    addSarcophagus(ctx, -edgeX * 0.84, edgeZ * 0.12, Math.PI / 2, 1.08)
    addSarcophagus(ctx, edgeX * 0.84, edgeZ * 0.12, Math.PI / 2, 1.08)
    addBrazier(ctx, -edgeX * 0.62, -edgeZ * 0.56, 1.05)
    addBrazier(ctx, edgeX * 0.62, -edgeZ * 0.56, 1.05)
    addBones(ctx, 0, edgeZ * 0.72, random)
    addChains(ctx, -edgeX * 0.92, -edgeZ * 0.82, 7)
    addChains(ctx, edgeX * 0.92, -edgeZ * 0.82, 7)
  } else if (room.type === 'treasure') {
    addAltar(ctx, 0, edgeZ * 0.6, 0, 1.12)
    addCandles(ctx, -1.1, edgeZ * 0.4, 8)
    addCandles(ctx, 1.1, edgeZ * 0.4, 8)
    addUrns(ctx, -edgeX * 0.78, edgeZ * 0.58, random)
    addUrns(ctx, edgeX * 0.78, edgeZ * 0.58, random)
    addRubble(ctx, edgeX * 0.82, -edgeZ * 0.55, random, 0.72)
  } else if (room.type === 'shrine') {
    addRitualInlay(ctx, Math.min(room.width, room.depth) * 0.18, 0x315e68)
    addAltar(ctx, 0, edgeZ * 0.58, 0, 1.2)
    addCandles(ctx, -1.2, 0.2, 8)
    addCandles(ctx, 1.2, 0.2, 8)
    addBench(ctx, -edgeX * 0.44, -edgeZ * 0.18, Math.PI / 2)
    addBench(ctx, edgeX * 0.44, -edgeZ * 0.18, Math.PI / 2)
    addChains(ctx, -edgeX * 0.82, edgeZ * 0.72, 5)
  } else if (room.type === 'boss') {
    addBossDais(ctx)
    addBrazier(ctx, -edgeX * 0.72, -edgeZ * 0.68, 1.25)
    addBrazier(ctx, edgeX * 0.72, -edgeZ * 0.68, 1.25)
    addBrazier(ctx, -edgeX * 0.72, edgeZ * 0.68, 1.25)
    addBrazier(ctx, edgeX * 0.72, edgeZ * 0.68, 1.25)
    addSarcophagus(ctx, -edgeX * 0.9, -edgeZ * 0.05, Math.PI / 2, 1.18)
    addSarcophagus(ctx, edgeX * 0.9, -edgeZ * 0.05, Math.PI / 2, 1.18)
    addSarcophagus(ctx, -edgeX * 0.9, edgeZ * 0.48, Math.PI / 2, 1.06, true)
    addSarcophagus(ctx, edgeX * 0.9, edgeZ * 0.48, Math.PI / 2, 1.06)
    addChains(ctx, -edgeX * 0.96, -edgeZ * 0.86, 8)
    addChains(ctx, edgeX * 0.96, -edgeZ * 0.86, 8)
    addRubble(ctx, -edgeX * 0.55, edgeZ * 0.76, random, 1.2)
    addRubble(ctx, edgeX * 0.55, edgeZ * 0.76, random, 1.0)
  } else if (room.type === 'secret') {
    addSarcophagus(ctx, 0, edgeZ * 0.42, 0, 1.02, true)
    addRubble(ctx, -edgeX * 0.55, -edgeZ * 0.48, random, 1.4)
    addRubble(ctx, edgeX * 0.5, -edgeZ * 0.26, random, 1.0)
    addUrns(ctx, edgeX * 0.64, edgeZ * 0.58, random)
    addBones(ctx, -edgeX * 0.3, edgeZ * 0.62, random)
    addCandles(ctx, 0.7, edgeZ * 0.25, 5)
  } else {
    addBench(ctx, 0, edgeZ * 0.62, 0)
    addUrns(ctx, -edgeX * 0.55, edgeZ * 0.5, random)
    addRubble(ctx, edgeX * 0.52, -edgeZ * 0.54, random, 0.8)
  }
}

function addRoomFill(ctx: RoomContext) {
  const { room, atmosphere } = ctx
  const maxDimension = Math.max(room.width, room.depth)
  const intensity = room.type === 'boss' ? 0.72 : room.type === 'entrance' ? 0.52 : 0.56
  for (const [x, z, factor] of [[-room.width * 0.18, -room.depth * 0.1, 1], [room.width * 0.18, room.depth * 0.12, 0.82]] as Array<[number, number, number]>) {
    const fill = new THREE.PointLight(atmosphere.sky, intensity * factor, maxDimension * 0.8, 1.45)
    fill.position.set(x, Math.min(2.3, room.height * 0.48), z)
    ctx.group.add(fill)
  }
}

function addSarcophagus(ctx: RoomContext, x: number, z: number, rotation = 0, scale = 1, broken = false) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = rotation
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  const plinth = roomMesh(ctx, new THREE.BoxGeometry(1.34, 0.2, 2.38), ctx.dark)
  plinth.position.y = 0.1
  const base = roomMesh(ctx, new THREE.BoxGeometry(1.18, 0.34, 2.18), ctx.stone)
  base.position.y = 0.36
  const body = roomMesh(ctx, new THREE.BoxGeometry(1.02, 0.43, 1.98), ctx.stoneLight)
  body.position.y = 0.69
  const lid = roomMesh(ctx, new THREE.BoxGeometry(1.12, 0.18, 2.08), ctx.stone)
  lid.position.y = 1.0
  lid.rotation.z = broken ? 0.13 : 0
  lid.position.x = broken ? 0.2 : 0
  const crest = roomMesh(ctx, new THREE.BoxGeometry(0.34, 0.07, 1.1), ctx.dark)
  crest.position.set(0, 1.1, 0)
  root.add(plinth, base, body, lid, crest)
  ctx.group.add(root)
}

function addAltar(ctx: RoomContext, x: number, z: number, rotation = 0, scale = 1) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = rotation
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  const lower = roomMesh(ctx, new THREE.BoxGeometry(1.8, 0.2, 1.22), ctx.dark)
  lower.position.y = 0.1
  const base = roomMesh(ctx, new THREE.BoxGeometry(1.48, 0.62, 0.98), ctx.stone)
  base.position.y = 0.5
  const inset = roomMesh(ctx, new THREE.BoxGeometry(0.74, 0.38, 0.07), ctx.dark)
  inset.position.set(0, 0.53, -0.5)
  const top = roomMesh(ctx, new THREE.BoxGeometry(1.72, 0.2, 1.14), ctx.stoneLight)
  top.position.y = 0.93
  root.add(lower, base, inset, top)
  ctx.group.add(root)
}

function addBrazier(ctx: RoomContext, x: number, z: number, scale = 1) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  const feet = roomMesh(ctx, new THREE.CylinderGeometry(0.22, 0.3, 0.13, 8), ctx.iron)
  feet.position.y = 0.065
  const stem = roomMesh(ctx, new THREE.CylinderGeometry(0.08, 0.13, 0.74, 8), ctx.iron)
  stem.position.y = 0.47
  const bowl = roomMesh(ctx, new THREE.CylinderGeometry(0.38, 0.22, 0.18, 12), ctx.iron)
  bowl.position.y = 0.86
  const flame = flameMesh(ctx.atmosphere.torch, 0.15)
  flame.position.y = 1.08
  const glow = flameGlow(ctx.atmosphere.torch, 0.42)
  glow.position.y = 1.08
  root.add(feet, stem, bowl, flame, glow)
  const base = ctx.atmosphere.torchIntensity * 0.52 * scale
  const light = new THREE.PointLight(ctx.atmosphere.torch, base, 11.5 * scale, 1.42)
  light.position.y = 1.08
  root.add(light)
  ctx.flickerLights.push({ light, base, phase: stringSeed(`${ctx.room.id}-${x}-${z}`) % 628 / 100, speed: 4.9 + scale })
  ctx.group.add(root)
}

function addCandles(ctx: RoomContext, x: number, z: number, count: number) {
  const random = seededRandom(stringSeed(`candles-${ctx.room.id}-${x}-${z}`))
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.userData.roomId = ctx.room.id
  for (let index = 0; index < count; index += 1) {
    const px = (random() - 0.5) * 0.92
    const pz = (random() - 0.5) * 0.72
    const h = 0.16 + random() * 0.28
    const wax = roomMesh(ctx, new THREE.CylinderGeometry(0.034, 0.045, h, 7), new THREE.MeshStandardMaterial({ color: 0xcbbd9e, roughness: 0.88 }))
    wax.position.set(px, h / 2, pz)
    const flame = flameMesh(ctx.atmosphere.torch, 0.025)
    flame.position.set(px, h + 0.045, pz)
    root.add(wax, flame)
  }
  const light = new THREE.PointLight(ctx.atmosphere.torch, 0.3, 4.2, 1.6)
  light.position.y = 0.62
  root.add(light)
  ctx.group.add(root)
}

function addUrns(ctx: RoomContext, x: number, z: number, random: () => number) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.userData.roomId = ctx.room.id
  const count = 3 + Math.floor(random() * 3)
  for (let index = 0; index < count; index += 1) {
    const scale = 0.72 + random() * 0.48
    const urn = roomMesh(ctx, new THREE.CylinderGeometry(0.19 * scale, 0.12 * scale, 0.5 * scale, 9), index % 3 === 0 ? ctx.dark : ctx.stone)
    urn.position.set((random() - 0.5) * 0.95, 0.25 * scale, (random() - 0.5) * 0.78)
    urn.rotation.y = random() * Math.PI
    root.add(urn)
  }
  ctx.group.add(root)
}

function addBones(ctx: RoomContext, x: number, z: number, random: () => number) {
  const root = new THREE.Group()
  root.position.set(x, 0.24, z)
  root.userData.roomId = ctx.room.id
  for (let index = 0; index < 9; index += 1) {
    const bone = roomMesh(ctx, new THREE.CylinderGeometry(0.032, 0.043, 0.38 + random() * 0.24, 6), ctx.bone)
    bone.rotation.z = Math.PI / 2
    bone.rotation.y = random() * Math.PI
    bone.position.set((random() - 0.5) * 1.05, random() * 0.06, (random() - 0.5) * 0.86)
    root.add(bone)
  }
  const skull = roomMesh(ctx, new THREE.SphereGeometry(0.13, 8, 6), ctx.bone)
  skull.scale.set(1, 0.82, 0.9)
  skull.position.set((random() - 0.5) * 0.45, 0.08, (random() - 0.5) * 0.45)
  root.add(skull)
  ctx.group.add(root)
}

function addRubble(ctx: RoomContext, x: number, z: number, random: () => number, scale = 1) {
  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.scale.setScalar(scale)
  root.userData.roomId = ctx.room.id
  for (let index = 0; index < 10; index += 1) {
    const radius = 0.1 + random() * 0.2
    const rock = roomMesh(ctx, new THREE.DodecahedronGeometry(radius, 0), index % 4 === 0 ? ctx.dark : ctx.stone)
    rock.position.set((random() - 0.5) * 1.4, radius * 0.8, (random() - 0.5) * 1.2)
    rock.scale.y = 0.65 + random() * 0.65
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
  const seat = roomMesh(ctx, new THREE.BoxGeometry(1.9, 0.18, 0.52), ctx.stone)
  seat.position.y = 0.58
  const supportA = roomMesh(ctx, new THREE.BoxGeometry(0.24, 0.58, 0.44), ctx.dark)
  supportA.position.set(-0.68, 0.29, 0)
  const supportB = supportA.clone()
  supportB.position.x = 0.68
  supportB.userData.roomId = ctx.room.id
  root.add(seat, supportA, supportB)
  ctx.group.add(root)
}

function addChains(ctx: RoomContext, x: number, z: number, links: number) {
  const root = new THREE.Group()
  root.position.set(x, Math.min(ctx.room.height - 0.4, 3.9), z)
  root.userData.roomId = ctx.room.id
  for (let index = 0; index < links; index += 1) {
    const link = roomMesh(ctx, new THREE.TorusGeometry(0.095, 0.022, 5, 10), ctx.iron)
    link.position.y = -index * 0.16
    link.rotation.y = index % 2 ? Math.PI / 2 : 0
    link.castShadow = true
    root.add(link)
  }
  ctx.group.add(root)
}

function addRitualInlay(ctx: RoomContext, radius: number, color: number) {
  const ring = roomMesh(ctx, new THREE.RingGeometry(radius * 0.74, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.24
  ctx.group.add(ring)
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2
    const rune = roomMesh(ctx, new THREE.BoxGeometry(0.08, 0.008, radius * 0.22), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, depthWrite: false }))
    rune.position.set(Math.cos(angle) * radius * 0.55, 0.247, Math.sin(angle) * radius * 0.55)
    rune.rotation.y = -angle
    ctx.group.add(rune)
  }
}

function addBossDais(ctx: RoomContext) {
  const radius = Math.min(ctx.room.width, ctx.room.depth) * 0.18
  const lower = roomMesh(ctx, new THREE.CylinderGeometry(radius, radius + 0.25, 0.2, 40), ctx.dark)
  lower.position.y = 0.2
  const upper = roomMesh(ctx, new THREE.CylinderGeometry(radius * 0.76, radius * 0.82, 0.17, 40), ctx.stone)
  upper.position.y = 0.38
  ctx.group.add(lower, upper)
  const ring = roomMesh(ctx, new THREE.RingGeometry(radius * 0.46, radius * 0.68, 64), new THREE.MeshBasicMaterial({ color: 0x6d3037, transparent: true, opacity: 0.27, side: THREE.DoubleSide, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.475
  ctx.group.add(ring)
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2
    const rune = roomMesh(ctx, new THREE.BoxGeometry(0.1, 0.008, radius * 0.25), new THREE.MeshBasicMaterial({ color: 0x8b3b3f, transparent: true, opacity: 0.36, depthWrite: false }))
    rune.position.set(Math.cos(angle) * radius * 0.58, 0.485, Math.sin(angle) * radius * 0.58)
    rune.rotation.y = -angle
    ctx.group.add(rune)
  }
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

  const slabs: FloorSlab[] = []
  const across = Math.max(2, Math.floor(width / 1.05))
  const along = Math.max(1, Math.floor(length / 0.95))
  for (let a = 0; a < across; a += 1) {
    for (let l = 0; l < along; l += 1) {
      if (random() < 0.035) continue
      slabs.push({
        x: (a - (across - 1) / 2) * (width / across),
        z: (l - (along - 1) / 2) * (length / along),
        sx: (width / across) * (0.9 + random() * 0.05),
        sz: (length / along) * (0.88 + random() * 0.07),
        y: 0.155 + random() * 0.016,
        rotation: (random() - 0.5) * 0.025,
        shade: 0.78 + random() * 0.22,
      })
    }
  }
  const material = new THREE.MeshStandardMaterial({ color: atmosphere.corridorFloor, roughness: 0.73, metalness: 0.025 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 1), material, slabs.length)
  const dummy = new THREE.Object3D()
  const base = new THREE.Color(atmosphere.corridorFloor)
  slabs.forEach((slab, index) => {
    const wx = cx + Math.cos(angle) * slab.x + Math.sin(angle) * slab.z
    const wz = cz - Math.sin(angle) * slab.x + Math.cos(angle) * slab.z
    dummy.position.set(wx, slab.y, wz)
    dummy.rotation.set(0, angle + slab.rotation, 0)
    dummy.scale.set(slab.sx, 1, slab.sz)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, base.clone().multiplyScalar(slab.shade))
  })
  mesh.receiveShadow = true
  parent.add(mesh)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.corridorWall, roughness: 0.9 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.96 })
  const wallHeight = immersive ? 3.05 : 1.55
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.18, wallHeight, length), wallMaterial)
    wall.position.set(
      cx + Math.cos(angle) * (width / 2 + 0.14) * side,
      wallHeight / 2,
      cz - Math.sin(angle) * (width / 2 + 0.14) * side,
    )
    wall.rotation.y = angle
    wall.castShadow = true
    wall.receiveShadow = true
    wall.userData.arpgOccluder = true
    parent.add(wall)
  }

  const ribCount = Math.max(1, Math.floor(length / 5.2))
  for (let index = 0; index < ribCount; index += 1) {
    const localZ = -length / 2 + (index + 0.5) * (length / ribCount)
    for (const side of [-1, 1]) {
      const localX = (width / 2 + 0.18) * side
      const height = immersive ? 2.82 : 1.48
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.34, height, 0.44), index % 2 ? darkMaterial : wallMaterial)
      pillar.position.set(
        cx + Math.cos(angle) * localX + Math.sin(angle) * localZ,
        height / 2,
        cz - Math.sin(angle) * localX + Math.cos(angle) * localZ,
      )
      pillar.rotation.y = angle
      pillar.castShadow = true
      pillar.receiveShadow = true
      pillar.userData.arpgOccluder = true
      parent.add(pillar)
    }

    if (immersive) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.75, 0.25, 0.34), darkMaterial)
      beam.position.set(cx + Math.sin(angle) * localZ, 3.32, cz + Math.cos(angle) * localZ)
      beam.rotation.y = angle
      beam.castShadow = true
      parent.add(beam)
    }

    if (index % 2 === 0) {
      const side = index % 4 === 0 ? -1 : 1
      const localX = (width / 2 - 0.18) * side
      const wx = cx + Math.cos(angle) * localX + Math.sin(angle) * localZ
      const wz = cz - Math.sin(angle) * localX + Math.cos(angle) * localZ
      const lightY = immersive ? 2.05 : 1.34
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.09), darkMaterial)
      bracket.position.set(wx, lightY - 0.28, wz)
      bracket.castShadow = true
      parent.add(bracket)
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.1, 8), darkMaterial)
      bowl.position.set(wx, lightY - 0.07, wz)
      parent.add(bowl)
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshStandardMaterial({ color: atmosphere.torch, emissive: atmosphere.torch, emissiveIntensity: 2.5, roughness: 0.25 }))
      flame.scale.set(0.76, 1.5, 0.76)
      flame.position.set(wx, lightY + 0.1, wz)
      parent.add(flame)
      const light = new THREE.PointLight(atmosphere.torch, atmosphere.torchIntensity * 0.24, 9, 1.45)
      light.position.copy(flame.position)
      parent.add(light)
    }
  }
}

function flameMesh(color: number, radius: number) {
  const flame = new THREE.Mesh(new THREE.SphereGeometry(radius, 9, 7), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.8, roughness: 0.24 }))
  flame.scale.set(0.78, 1.55, 0.78)
  return flame
}

function flameGlow(color: number, radius: number) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
}

function placeOnSide(object: THREE.Object3D, room: DungeonRoom, side: Side, along: number, y: number, normalOffset: number) {
  object.userData.wallSide = side
  object.userData.roomId = room.id
  if (side === 'north') object.position.set(along, y, -room.depth / 2 + normalOffset)
  if (side === 'south') object.position.set(along, y, room.depth / 2 - normalOffset)
  if (side === 'west') object.position.set(-room.width / 2 + normalOffset, y, along)
  if (side === 'east') object.position.set(room.width / 2 - normalOffset, y, along)
  if (side === 'west' || side === 'east') object.rotation.y = Math.PI / 2
}

function placeWallRoot(object: THREE.Object3D, room: DungeonRoom, side: Side, along: number, y: number, inset: number) {
  object.userData.wallSide = side
  object.userData.roomId = room.id
  if (side === 'north') { object.position.set(along, y, -room.depth / 2 + inset); object.rotation.y = 0 }
  if (side === 'south') { object.position.set(along, y, room.depth / 2 - inset); object.rotation.y = Math.PI }
  if (side === 'west') { object.position.set(-room.width / 2 + inset, y, along); object.rotation.y = Math.PI / 2 }
  if (side === 'east') { object.position.set(room.width / 2 - inset, y, along); object.rotation.y = -Math.PI / 2 }
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
