import * as THREE from 'three'
import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'

export type ForgeRewardPickupEvent = {
  id: number
  kind: 'gold' | 'xp'
  amount: number
  screenX: number
  screenY: number
  levelUp?: boolean
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
  floorY: number
  age: number
  phase: number
  velocity: THREE.Vector3
  spin: THREE.Vector3
  settled: boolean
  magnet: boolean
  magnetAge: number
}

type RewardRuntime = {
  scene: THREE.Scene
  world?: THREE.Object3D
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  player: THREE.Object3D
  saveKey?: string
  emitState: () => void
  setMessage: (message: string, seconds: number) => void
  saveGame?: (manual?: boolean) => void
  spawnPulse?: (
    position: THREE.Vector3,
    color: string,
    radius: number,
    duration: number,
  ) => void
  __forgeRewardInit?: boolean
  __forgeGold?: number
  __forgeXp?: number
  __forgeLevel?: number
  __forgeRewardEventId?: number
  __forgeRewardEvents?: ForgeRewardPickupEvent[]
  __forgeRewardPickups?: RewardPickup[]
}

let overworldInstalled = false
let dungeonInstalled = false

export function installForgeRewardPickupRuntime(RuntimeClass: { prototype: any }) {
  if (overworldInstalled) return
  overworldInstalled = true
  const proto = RuntimeClass.prototype

  const originalMakeSnapshot = proto.makeSnapshot
  proto.makeSnapshot = function () {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    return withRewardSnapshot(originalMakeSnapshot.call(this), runtime)
  }

  const originalSaveGame = proto.saveGame
  proto.saveGame = function (...args: unknown[]) {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    const result = originalSaveGame.apply(this, args)
    if (!runtime.saveKey) return result
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
    clearRewardState(runtime)
    return result
  }

  wrapCombatRewards(proto)
}

export function installDungeonRewardPickupRuntime(RuntimeClass: { prototype: any }) {
  if (dungeonInstalled) return
  dungeonInstalled = true
  const proto = RuntimeClass.prototype

  const originalPlayerState = proto.playerState
  proto.playerState = function () {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    return {
      ...originalPlayerState.call(this),
      gold: runtime.__forgeGold ?? 0,
      xp: runtime.__forgeXp ?? 0,
      level: runtime.__forgeLevel ?? 1,
    }
  }

  const originalMakeSnapshot = proto.makeSnapshot
  proto.makeSnapshot = function () {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    return withRewardSnapshot(originalMakeSnapshot.call(this), runtime)
  }

  wrapCombatRewards(proto)
}

function wrapCombatRewards(proto: any) {
  const originalKillEnemy = proto.killEnemy
  proto.killEnemy = function (enemy: any) {
    const runtime = this as RewardRuntime
    ensureRewardState(runtime)
    const position = enemy.group.position.clone() as THREE.Vector3
    const enemyId = String(enemy.id)
    const maxHealth = Number(enemy.maxHealth ?? enemy.definition?.maxHealth ?? 100)
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

function withRewardSnapshot<T extends object>(base: T, runtime: RewardRuntime): T & ForgeRewardSnapshotExtension {
  return {
    ...base,
    gold: runtime.__forgeGold ?? 0,
    xp: runtime.__forgeXp ?? 0,
    level: runtime.__forgeLevel ?? 1,
    xpToNext: xpRequired(runtime.__forgeLevel ?? 1),
    pickupEvents: [...(runtime.__forgeRewardEvents ?? [])],
  }
}

function ensureRewardState(runtime: RewardRuntime) {
  if (runtime.__forgeRewardInit) return
  runtime.__forgeRewardInit = true
  const save = runtime.saveKey ? loadRuntimeSave(runtime.saveKey) : undefined
  runtime.__forgeGold = Math.max(0, Math.round(runtime.__forgeGold ?? save?.gold ?? 0))
  runtime.__forgeXp = Math.max(0, Math.round(runtime.__forgeXp ?? save?.xp ?? 0))
  runtime.__forgeLevel = Math.max(1, Math.round(runtime.__forgeLevel ?? save?.level ?? 1))
  runtime.__forgeRewardEventId = runtime.__forgeRewardEventId ?? 0
  runtime.__forgeRewardEvents = runtime.__forgeRewardEvents ?? []
  runtime.__forgeRewardPickups = runtime.__forgeRewardPickups ?? []
}

function clearRewardState(runtime: RewardRuntime) {
  for (const pickup of runtime.__forgeRewardPickups ?? []) {
    pickup.group.parent?.remove(pickup.group)
    disposeGroup(pickup.group)
  }
  runtime.__forgeRewardInit = true
  runtime.__forgeGold = 0
  runtime.__forgeXp = 0
  runtime.__forgeLevel = 1
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

function spawnPieces(
  runtime: RewardRuntime,
  enemyId: string,
  kind: 'gold' | 'xp',
  total: number,
  count: number,
  position: THREE.Vector3,
) {
  const pieces = splitAmount(total, count)
  pieces.forEach((amount, index) => {
    const angle = hashUnit(`${enemyId}:${kind}:angle:${index}`) * Math.PI * 2
    const launch = 2.2 + hashUnit(`${enemyId}:${kind}:launch:${index}`) * 2.7
    const lift = 3.8 + hashUnit(`${enemyId}:${kind}:lift:${index}`) * 2.3
    const phase = hashUnit(`${enemyId}:${kind}:phase:${index}`) * Math.PI * 2
    const group = kind === 'gold'
      ? buildGoldPickupVisual(amount, phase)
      : buildXpPickupVisual(phase)
    const floorY = position.y + (kind === 'gold' ? .12 : .25)

    group.position.set(
      position.x + Math.cos(angle) * .12,
      position.y + (kind === 'gold' ? .62 : .78),
      position.z + Math.sin(angle) * .12,
    )
    group.scale.setScalar(.28)
    ;(runtime.world ?? runtime.scene).add(group)

    runtime.__forgeRewardPickups!.push({
      id: `${enemyId}:${kind}:${index}`,
      kind,
      amount,
      group,
      floorY,
      age: index * -.035,
      phase,
      velocity: new THREE.Vector3(
        Math.cos(angle) * launch,
        lift,
        Math.sin(angle) * launch,
      ),
      spin: new THREE.Vector3(
        5 + phase % 2.5,
        7 + phase % 4,
        3.5 + phase % 3,
      ),
      settled: false,
      magnet: false,
      magnetAge: 0,
    })
  })
}

function buildGoldPickupVisual(amount: number, phase: number) {
  const group = new THREE.Group()
  const visibleCoins = Math.max(2, Math.min(4, 2 + Math.floor(Math.log2(amount + 1) / 2)))
  for (let index = 0; index < visibleCoins; index += 1) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(.135, .135, .052, 18),
      new THREE.MeshStandardMaterial({
        color: 0xe1b653,
        emissive: 0x7c5317,
        emissiveIntensity: .72,
        roughness: .28,
        metalness: .82,
      }),
    )
    const angle = phase + index * 2.399
    const spread = index === 0 ? 0 : .07 + index * .025
    coin.position.set(
      Math.cos(angle) * spread,
      index * .032,
      Math.sin(angle) * spread * .72,
    )
    coin.rotation.y = angle
    coin.rotation.z = (index - 1) * .08
    coin.castShadow = true
    group.add(coin)
  }
  return group
}

function buildXpPickupVisual(phase: number) {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(.15, 0),
    new THREE.MeshStandardMaterial({
      color: 0xdccfff,
      emissive: 0x745bb8,
      emissiveIntensity: 1.5,
      roughness: .18,
      metalness: .06,
    }),
  )
  core.rotation.y = phase
  group.add(core)

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(.21, .018, 8, 24),
    new THREE.MeshBasicMaterial({
      color: 0xbba0f3,
      transparent: true,
      opacity: .68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  halo.rotation.x = Math.PI / 2
  halo.rotation.z = phase
  group.add(halo)
  return group
}

function updateRewardPickups(runtime: RewardRuntime, delta: number) {
  ensureRewardState(runtime)
  for (const pickup of [...runtime.__forgeRewardPickups!]) {
    pickup.age += delta
    if (pickup.age < 0) continue

    const appear = Math.min(1, pickup.age * 10)
    if (!pickup.settled) {
      pickup.velocity.y -= 14.5 * delta
      pickup.group.position.addScaledVector(pickup.velocity, delta)
      pickup.group.rotation.x += pickup.spin.x * delta
      pickup.group.rotation.y += pickup.spin.y * delta
      pickup.group.rotation.z += pickup.spin.z * delta
      pickup.group.scale.setScalar(.28 + appear * .72)

      if (pickup.group.position.y <= pickup.floorY) {
        pickup.group.position.y = pickup.floorY
        if (Math.abs(pickup.velocity.y) > 1.05 && pickup.age < .78) {
          pickup.velocity.y = Math.abs(pickup.velocity.y) * .3
          pickup.velocity.x *= .68
          pickup.velocity.z *= .68
          pickup.spin.multiplyScalar(.72)
        } else {
          pickup.velocity.set(0, 0, 0)
          pickup.settled = true
          pickup.group.rotation.x = 0
          pickup.group.rotation.z = 0
        }
      }
      if (!pickup.settled) continue
    }

    const dx = runtime.player.position.x - pickup.group.position.x
    const dz = runtime.player.position.z - pickup.group.position.z
    const horizontalDistance = Math.hypot(dx, dz)
    if (pickup.age >= .24 && horizontalDistance < 5.25) pickup.magnet = true

    if (!pickup.magnet) {
      const bob = pickup.kind === 'xp'
        ? Math.sin(pickup.age * 4.8 + pickup.phase) * .085
        : Math.max(0, Math.sin(pickup.age * 2.4 + pickup.phase)) * .018
      pickup.group.position.y = pickup.floorY + bob
      pickup.group.rotation.y += delta * (pickup.kind === 'xp' ? 2.8 : 1.35)
      const idlePulse = pickup.kind === 'xp'
        ? 1 + Math.sin(pickup.age * 5.2 + pickup.phase) * .08
        : 1
      pickup.group.scale.setScalar(idlePulse)
      continue
    }

    pickup.magnetAge += delta
    const target = runtime.player.position.clone().add(new THREE.Vector3(0, .88, 0))
    const toTarget = target.sub(pickup.group.position)
    const distance = toTarget.length()
    const inward = Math.max(0, 5.25 - Math.min(5.25, horizontalDistance))
    const acceleration = Math.min(15, pickup.magnetAge * 22)
    const speed = 4.2 + inward * 7.2 + acceleration
    const travel = Math.min(distance, speed * delta)
    if (distance > .0001) pickup.group.position.addScaledVector(toTarget, travel / distance)

    pickup.group.rotation.x += delta * (pickup.kind === 'gold' ? 11 : 7)
    pickup.group.rotation.y += delta * (pickup.kind === 'gold' ? 16 : 12)
    const squeeze = THREE.MathUtils.clamp(distance / 1.7, .2, 1)
    pickup.group.scale.setScalar(.28 + squeeze * .72)

    if (distance > .34) continue
    collectReward(runtime, pickup)
  }
}

function collectReward(runtime: RewardRuntime, pickup: RewardPickup) {
  const screen = projectToScreen(runtime, pickup.group.position)
  const index = runtime.__forgeRewardPickups!.indexOf(pickup)
  if (index >= 0) runtime.__forgeRewardPickups!.splice(index, 1)
  pickup.group.parent?.remove(pickup.group)
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

  runtime.spawnPulse?.(
    pickup.group.position,
    pickup.kind === 'gold' ? '#f0c45e' : '#bba0f3',
    pickup.kind === 'gold' ? .72 : .9,
    .16,
  )

  const event: ForgeRewardPickupEvent = {
    id: (runtime.__forgeRewardEventId = (runtime.__forgeRewardEventId ?? 0) + 1),
    kind: pickup.kind,
    amount: pickup.amount,
    screenX: screen.x,
    screenY: screen.y,
    levelUp: leveled || undefined,
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

export function grantForgeRewardTotals(
  runtimeValue: unknown,
  gold: number,
  xp: number,
) {
  const runtime = runtimeValue as RewardRuntime
  ensureRewardState(runtime)

  const goldAdded = Math.max(0, Math.round(gold))
  const xpAdded = Math.max(0, Math.round(xp))
  runtime.__forgeGold =
    (runtime.__forgeGold ?? 0) + goldAdded
  runtime.__forgeXp =
    (runtime.__forgeXp ?? 0) + xpAdded

  let levelsGained = 0
  while (
    (runtime.__forgeXp ?? 0) >=
    xpRequired(runtime.__forgeLevel ?? 1)
  ) {
    runtime.__forgeXp =
      (runtime.__forgeXp ?? 0) -
      xpRequired(runtime.__forgeLevel ?? 1)
    runtime.__forgeLevel =
      (runtime.__forgeLevel ?? 1) + 1
    levelsGained += 1
  }

  runtime.emitState()
  return {
    goldAdded,
    xpAdded,
    level: runtime.__forgeLevel ?? 1,
    levelsGained,
  }
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
