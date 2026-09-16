import * as THREE from 'three'
import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'

export type ForgeRewardPickupEvent = {
  id: number
  kind: 'gold' | 'xp'
  amount: number
  screenX: number
  screenY: number
}

export type ForgeRewardSnapshotExtension = {
  gold: number
  xp: number
  level: number
  xpToNext: number
  pickupEvents: ForgeRewardPickupEvent[]
}

type RewardPickup = {
  id: string
  kind: 'gold' | 'xp'
  amount: number
  group: THREE.Group
  baseY: number
  age: number
  magnet: boolean
}

type RewardRuntime = {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  player: THREE.Object3D
  saveKey: string
  emitState: () => void
  setMessage: (message: string, seconds: number) => void
  __forgeRewardInit?: boolean
  __forgeGold?: number
  __forgeXp?: number
  __forgeLevel?: number
  __forgeRewardEventId?: number
  __forgeRewardEvents?: ForgeRewardPickupEvent[]
  __forgeRewardPickups?: RewardPickup[]
}

let installed = false

export function installForgeRewardPickupRuntime(RuntimeClass: { prototype: any }) {
  if (installed) return
  installed = true
  const proto = RuntimeClass.prototype

  const originalMakeSnapshot = proto.makeSnapshot
  proto.makeSnapshot = function () {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    return {
      ...originalMakeSnapshot.call(this),
      gold: runtime.__forgeGold ?? 0,
      xp: runtime.__forgeXp ?? 0,
      level: runtime.__forgeLevel ?? 1,
      xpToNext: xpRequired(runtime.__forgeLevel ?? 1),
      pickupEvents: [...(runtime.__forgeRewardEvents ?? [])],
    }
  }

  const originalSaveGame = proto.saveGame
  proto.saveGame = function (...args: unknown[]) {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    const result = originalSaveGame.apply(this, args)
    const save = loadRuntimeSave(runtime.saveKey)
    if (save) {
      writeRuntimeSave(runtime.saveKey, {
        ...save,
        gold: runtime.__forgeGold ?? 0,
        xp: runtime.__forgeXp ?? 0,
        level: runtime.__forgeLevel ?? 1,
      })
    }
    return result
  }

  const originalReset = proto.resetProgress
  proto.resetProgress = function (...args: unknown[]) {
    const runtime = this as RewardRuntime
    const result = originalReset.apply(this, args)
    runtime.__forgeGold = 0
    runtime.__forgeXp = 0
    runtime.__forgeLevel = 1
    runtime.__forgeRewardEvents = []
    runtime.__forgeRewardPickups = []
    return result
  }

  const originalKillEnemy = proto.killEnemy
  proto.killEnemy = function (enemy: any) {
    const runtime = this as RewardRuntime
    const position = enemy.group.position.clone() as THREE.Vector3
    const enemyId = String(enemy.id)
    const maxHealth = Number(enemy.definition?.maxHealth ?? 100)
    const result = originalKillEnemy.call(this, enemy)
    spawnRewardBurst(runtime, enemyId, maxHealth, position)
    return result
  }

  const originalUpdateLoot = proto.updateLoot
  proto.updateLoot = function (delta: number) {
    const result = originalUpdateLoot.call(this, delta)
    updateRewardPickups(this as RewardRuntime, delta)
    return result
  }
}

function ensureRewardState(runtime: RewardRuntime) {
  if (runtime.__forgeRewardInit) return
  runtime.__forgeRewardInit = true
  const save = loadRuntimeSave(runtime.saveKey)
  runtime.__forgeGold = Math.max(0, Math.round(save?.gold ?? 0))
  runtime.__forgeXp = Math.max(0, Math.round(save?.xp ?? 0))
  runtime.__forgeLevel = Math.max(1, Math.round(save?.level ?? 1))
  runtime.__forgeRewardEventId = 0
  runtime.__forgeRewardEvents = []
  runtime.__forgeRewardPickups = []
}

function spawnRewardBurst(runtime: RewardRuntime, enemyId: string, maxHealth: number, position: THREE.Vector3) {
  ensureRewardState(runtime)
  const goldTotal = Math.max(4, Math.round(6 + maxHealth * .035 + hashUnit(`${enemyId}:gold`) * 12))
  const xpTotal = Math.max(10, Math.round(12 + maxHealth * .16))
  spawnPieces(runtime, enemyId, 'gold', goldTotal, 5, position)
  spawnPieces(runtime, enemyId, 'xp', xpTotal, 6, position)
}

function spawnPieces(runtime: RewardRuntime, enemyId: string, kind: 'gold' | 'xp', total: number, count: number, position: THREE.Vector3) {
  const pieces = splitAmount(total, count)
  pieces.forEach((amount, index) => {
    const angle = hashUnit(`${enemyId}:${kind}:angle:${index}`) * Math.PI * 2
    const radius = .35 + hashUnit(`${enemyId}:${kind}:radius:${index}`) * .95
    const group = new THREE.Group()
    const mesh = kind === 'gold'
      ? new THREE.Mesh(
          new THREE.CylinderGeometry(.14, .14, .05, 16),
          new THREE.MeshStandardMaterial({ color: 0xd8aa3e, emissive: 0x6d4912, emissiveIntensity: .55, roughness: .35, metalness: .72 }),
        )
      : new THREE.Mesh(
          new THREE.OctahedronGeometry(.13, 0),
          new THREE.MeshStandardMaterial({ color: 0x7de0c9, emissive: 0x2b8d83, emissiveIntensity: .8, roughness: .28, metalness: .08 }),
        )
    mesh.castShadow = true
    if (kind === 'gold') mesh.rotation.x = Math.PI / 2
    group.add(mesh)
    const baseY = kind === 'gold' ? .18 : .38
    group.position.set(position.x + Math.cos(angle) * radius, baseY, position.z + Math.sin(angle) * radius)
    group.scale.setScalar(.55)
    runtime.scene.add(group)
    runtime.__forgeRewardPickups!.push({
      id: `${enemyId}:${kind}:${index}`,
      kind,
      amount,
      group,
      baseY,
      age: index * -.055,
      magnet: false,
    })
  })
}

function updateRewardPickups(runtime: RewardRuntime, delta: number) {
  ensureRewardState(runtime)
  for (const pickup of [...runtime.__forgeRewardPickups!]) {
    pickup.age += delta
    if (pickup.age < 0) continue
    const dx = runtime.player.position.x - pickup.group.position.x
    const dz = runtime.player.position.z - pickup.group.position.z
    const horizontalDistance = Math.hypot(dx, dz)
    if (horizontalDistance < 3.15 || pickup.age > 1.05) pickup.magnet = true

    if (!pickup.magnet) {
      pickup.group.position.y = pickup.baseY + Math.sin(pickup.age * 5.5) * (pickup.kind === 'xp' ? .09 : .035)
      pickup.group.rotation.y += delta * (pickup.kind === 'xp' ? 3.6 : 5.2)
      const appear = Math.min(1, pickup.age * 5)
      pickup.group.scale.setScalar(.55 + appear * .45)
      continue
    }

    const target = runtime.player.position.clone().add(new THREE.Vector3(0, .85, 0))
    const attraction = 1 - Math.exp(-delta * (6.2 + Math.min(8, pickup.age * 2.4)))
    pickup.group.position.lerp(target, attraction)
    pickup.group.rotation.y += delta * 8
    pickup.group.scale.multiplyScalar(Math.max(.9, 1 - delta * .55))
    if (pickup.group.position.distanceTo(target) > .34) continue
    collectReward(runtime, pickup)
  }
}

function collectReward(runtime: RewardRuntime, pickup: RewardPickup) {
  const screen = projectToScreen(runtime, pickup.group.position)
  const index = runtime.__forgeRewardPickups!.indexOf(pickup)
  if (index >= 0) runtime.__forgeRewardPickups!.splice(index, 1)
  runtime.scene.remove(pickup.group)
  disposeGroup(pickup.group)

  let leveled = false
  if (pickup.kind === 'gold') {
    runtime.__forgeGold = (runtime.__forgeGold ?? 0) + pickup.amount
  } else {
    runtime.__forgeXp = (runtime.__forgeXp ?? 0) + pickup.amount
    while ((runtime.__forgeXp ?? 0) >= xpRequired(runtime.__forgeLevel ?? 1)) {
      runtime.__forgeXp = (runtime.__forgeXp ?? 0) - xpRequired(runtime.__forgeLevel ?? 1)
      runtime.__forgeLevel = (runtime.__forgeLevel ?? 1) + 1
      leveled = true
    }
  }

  const event: ForgeRewardPickupEvent = {
    id: (runtime.__forgeRewardEventId = (runtime.__forgeRewardEventId ?? 0) + 1),
    kind: pickup.kind,
    amount: pickup.amount,
    screenX: screen.x,
    screenY: screen.y,
  }
  runtime.__forgeRewardEvents!.push(event)
  if (runtime.__forgeRewardEvents!.length > 10) runtime.__forgeRewardEvents!.splice(0, runtime.__forgeRewardEvents!.length - 10)
  if (leveled) runtime.setMessage(`Level ${runtime.__forgeLevel}! Your experience carried you forward.`, 2.8)
  runtime.emitState()
}

function projectToScreen(runtime: RewardRuntime, position: THREE.Vector3) {
  const projected = position.clone().project(runtime.camera)
  return {
    x: clamp((projected.x * .5 + .5) * 100, 2, 98),
    y: clamp((-projected.y * .5 + .5) * 100, 2, 98),
  }
}

function splitAmount(total: number, count: number) {
  const base = Math.floor(total / count)
  let remainder = total - base * count
  return Array.from({ length: count }).map(() => base + (remainder-- > 0 ? 1 : 0)).filter((value) => value > 0)
}

export function xpRequired(level: number) {
  return 100 + Math.max(0, level - 1) * 55
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => material.dispose())
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
