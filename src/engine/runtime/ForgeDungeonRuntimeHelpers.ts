// @ts-nocheck
import * as THREE from 'three'
import type { ForgeAbilityDefinition } from '../forgeProject'
import type { DungeonConnection, DungeonRoom } from '../../lib/dungeonPackage'
import { dungeonAtmosphere } from '../../lib/dungeonAtmosphere'

type RoomOpening = DungeonConnection & { corridorId: string }
export function chooseAbilityClip(ability: ForgeAbilityDefinition, clips: THREE.AnimationClip[]) {
  const tokens = `${ability.id} ${ability.name}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
  return clips.find((clip) => tokens.some((token) => clip.name.toLowerCase().includes(token)))
    ?? clips.find((clip) => /attack|cast|slash|strike|swing|skill/i.test(clip.name))
    ?? clips[0]
}

export function addRoomShell(parent: THREE.Group, room: DungeonRoom, openings: RoomOpening[], thickness: number, floorColor: number, wallColor: number, darkColor: number) {
  const group = new THREE.Group()
  group.position.set(room.x, room.floorLevel, room.z)
  group.rotation.y = THREE.MathUtils.degToRad(room.rotation)
  parent.add(group)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.18, room.depth), new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9 }))
  floor.position.y = 0.09; floor.receiveShadow = true; group.add(floor)
  const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.98 })
  for (const side of ['north', 'south', 'east', 'west'] as const) addWallSide(group, room, side, openings.filter((opening) => opening.side === side), thickness, wallMaterial, darkMaterial)
}

export function addWallSide(group: THREE.Group, room: DungeonRoom, side: 'north'|'south'|'east'|'west', openings: RoomOpening[], thickness: number, material: THREE.Material, dark: THREE.Material) {
  const horizontal = side === 'north' || side === 'south'
  const total = horizontal ? room.width : room.depth
  const half = total / 2
  const intervals = openings.map((opening) => ({ start: Math.max(-half, opening.offset - opening.openingWidth / 2), end: Math.min(half, opening.offset + opening.openingWidth / 2) })).sort((a, b) => a.start - b.start)
  let cursor = -half
  const segments: Array<[number, number]> = []
  for (const interval of intervals) { if (interval.start > cursor) segments.push([cursor, interval.start]); cursor = Math.max(cursor, interval.end) }
  if (cursor < half) segments.push([cursor, half])
  for (const [start, end] of segments) {
    const length = end - start
    if (length <= 0.05) continue
    const mesh = horizontal
      ? new THREE.Mesh(new THREE.BoxGeometry(length, room.height, thickness), material)
      : new THREE.Mesh(new THREE.BoxGeometry(thickness, room.height, length), material)
    if (horizontal) mesh.position.set((start + end) / 2, room.height / 2, (side === 'south' ? 1 : -1) * room.depth / 2)
    else mesh.position.set((side === 'east' ? 1 : -1) * room.width / 2, room.height / 2, (start + end) / 2)
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.skillboundOccluder = true; group.add(mesh)
    const trim = horizontal
      ? new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, thickness + 0.08), dark)
      : new THREE.Mesh(new THREE.BoxGeometry(thickness + 0.08, 0.16, length), dark)
    trim.position.copy(mesh.position); trim.position.y = 0.08; group.add(trim)
  }
}

export function addCorridorFloor(parent: THREE.Group, from: DungeonConnection, to: DungeonConnection, width: number, color: number) {
  const dx = to.x - from.x, dz = to.z - from.z, length = Math.max(0.1, Math.hypot(dx, dz))
  const floor = new THREE.Mesh(new THREE.BoxGeometry(length + 0.4, 0.16, width), new THREE.MeshStandardMaterial({ color, roughness: 0.94 }))
  floor.position.set((from.x + to.x) / 2, 0.08, (from.z + to.z) / 2)
  floor.rotation.y = -Math.atan2(dz, dx)
  floor.receiveShadow = true
  parent.add(floor)
}

export function addBuiltinProp(parent: THREE.Group, type: string, x: number, y: number, z: number, rotationY: number, scale: number, atmosphere: ReturnType<typeof dungeonAtmosphere>) {
  const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = THREE.MathUtils.degToRad(rotationY); group.scale.setScalar(scale); parent.add(group)
  const stone = new THREE.MeshStandardMaterial({ color: atmosphere.wallDark, roughness: 0.95 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3e2b, roughness: 0.9 })
  if (type === 'torch') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.25, 8), wood); stem.position.y = 0.65
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: atmosphere.torch })); flame.position.y = 1.35
    const light = new THREE.PointLight(atmosphere.torch, atmosphere.torchIntensity, 7); light.position.y = 1.35; group.add(stem, flame, light)
  } else if (type === 'pillar' || type === 'statue') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(type === 'statue' ? 0.45 : 0.38, 0.48, type === 'statue' ? 2.7 : 3.4, 8), stone); body.position.y = type === 'statue' ? 1.35 : 1.7; body.castShadow = true; group.add(body)
  } else if (type === 'rubble') {
    for (let i = 0; i < 5; i++) { const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + i * 0.025, 0), stone); mesh.position.set((i - 2) * 0.18, 0.15, Math.sin(i) * 0.16); mesh.rotation.set(i, i * 0.7, 0); group.add(mesh) }
  } else {
    const mesh = new THREE.Mesh(type === 'barrel' ? new THREE.CylinderGeometry(0.32, 0.34, 0.75, 10) : new THREE.BoxGeometry(0.72, 0.72, 0.72), type === 'spikes' ? stone : wood); mesh.position.y = 0.36; mesh.castShadow = true; group.add(mesh)
  }
}

export function pointInsideRoom(room: DungeonRoom, x: number, z: number, margin: number) {
  const angle = -THREE.MathUtils.degToRad(room.rotation)
  const dx = x - room.x, dz = z - room.z
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle)
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle)
  return Math.abs(localX) <= Math.max(0.2, room.width / 2 - margin) && Math.abs(localZ) <= Math.max(0.2, room.depth / 2 - margin)
}

export function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az
  const denom = abx * abx + abz * abz
  const t = denom <= 0.0001 ? 0 : THREE.MathUtils.clamp((apx * abx + apz * abz) / denom, 0, 1)
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

export function planarDistance(a: THREE.Vector3, b: THREE.Vector3) { return Math.hypot(a.x - b.x, a.z - b.z) }
export function isTextInput(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.isContentEditable) }
export function hashSeed(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) } return hash >>> 0 }
export function seededRandom(seed: number) { let state = seed || 1; return () => { state |= 0; state = state + 0x6D2B79F5 | 0; let value = Math.imul(state ^ state >>> 15, 1 | state); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296 } }
export function disposeSceneObject(object: THREE.Object3D) { object.traverse((child) => { if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return; if (child instanceof THREE.Mesh) child.geometry.dispose(); const material = child.material; const materials = Array.isArray(material) ? material : [material]; materials.forEach((entry) => { if (entry instanceof THREE.SpriteMaterial) entry.map?.dispose(); entry.dispose() }) }); object.parent?.remove(object) }

export function markOccluderTree(root: THREE.Object3D) { root.traverse((child) => { const mesh = child as THREE.Mesh; if (!mesh.isMesh || !mesh.geometry) return; mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox; if (!box) return; const size = box.getSize(new THREE.Vector3()); if (size.y > 0.55) mesh.userData.skillboundOccluder = true }) }
export function setMeshOpacity(mesh: THREE.Mesh, opacity: number) { if (!mesh.userData.skillboundFadeMaterial) { mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone(); mesh.userData.skillboundFadeMaterial = true; mesh.userData.skillboundCastShadow = mesh.castShadow } const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; const transparent = opacity < 0.995; for (const material of materials) { material.transparent = transparent; material.opacity = opacity; material.depthWrite = !transparent; material.needsUpdate = true } mesh.castShadow = transparent ? false : Boolean(mesh.userData.skillboundCastShadow) }
