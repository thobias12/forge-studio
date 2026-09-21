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
  amount: number
  group: THREE.Group
  floorY: number
  age: number
  velocity: THREE.Vector3
  spin: THREE.Vector3
  settled: boolean
  magnet: boolean
  magnetAge: number
  bounces: number
}

type RewardXpParticle = {
  mesh: THREE.Mesh
  angle: number
  radius: number
  lift: number
}

type RewardXpFx = {
  group: THREE.Group
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
  particles: RewardXpParticle[]
  age: number
  duration: number
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
  __forgeRewardXpFx?: RewardXpFx[]
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
    updateRewardPresentation(this as RewardRuntime, delta)
    return result
  }
}

function withRewardSnapshot<T extends object>(
  base: T,
  runtime: RewardRuntime,
): T & ForgeRewardSnapshotExtension {
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
  runtime.__forgeRewardXpFx = runtime.__forgeRewardXpFx ?? []
}

function clearRewardState(runtime: RewardRuntime) {
  for (const pickup of runtime.__forgeRewardPickups ?? []) {
    pickup.group.parent?.remove(pickup.group)
    disposeGroup(pickup.group)
  }
  for (const effect of runtime.__forgeRewardXpFx ?? []) {
    effect.group.parent?.remove(effect.group)
    disposeGroup(effect.group)
  }
  runtime.__forgeRewardInit = true
  runtime.__forgeGold = 0
  runtime.__forgeXp = 0
  runtime.__forgeLevel = 1
  runtime.__forgeRewardEventId = 0
  runtime.__forgeRewardEvents = []
  runtime.__forgeRewardPickups = []
  runtime.__forgeRewardXpFx = []
}

function spawnRewardBurst(
  runtime: RewardRuntime,
  enemyId: string,
  maxHealth: number,
  position: THREE.Vector3,
) {
  ensureRewardState(runtime)
  const goldTotal = Math.max(
    4,
    Math.round(6 + maxHealth * .035 + hashUnit(`${enemyId}:gold`) * 12),
  )
  const xpTotal = Math.max(10, Math.round(12 + maxHealth * .16))

  spawnGoldPile(runtime, enemyId, goldTotal, position)
  awardXpImmediately(runtime, xpTotal, position, enemyId)
}

function spawnGoldPile(
  runtime: RewardRuntime,
  enemyId: string,
  total: number,
  position: THREE.Vector3,
) {
  const angle = hashUnit(`${enemyId}:gold:angle`) * Math.PI * 2
  const phase = hashUnit(`${enemyId}:gold:phase`) * Math.PI * 2
  const launch = 2.15 + hashUnit(`${enemyId}:gold:launch`) * .75
  const lift = 3.5 + hashUnit(`${enemyId}:gold:lift`) * .65
  const group = buildGoldPickupVisual(phase)
  const floorY = position.y + .1

  group.position.set(
    position.x + Math.cos(angle) * .06,
    position.y + .46,
    position.z + Math.sin(angle) * .06,
  )
  group.scale.setScalar(.76)
  ;(runtime.world ?? runtime.scene).add(group)

  runtime.__forgeRewardPickups!.push({
    id: `${enemyId}:gold`,
    amount: total,
    group,
    floorY,
    age: 0,
    velocity: new THREE.Vector3(
      Math.cos(angle) * launch,
      lift,
      Math.sin(angle) * launch,
    ),
    spin: new THREE.Vector3(3.5, 5.5 + phase % 2.5, 2.8),
    settled: false,
    magnet: false,
    magnetAge: 0,
    bounces: 0,
  })
}

function buildGoldPickupVisual(phase: number) {
  const group = new THREE.Group()
  group.userData.rewardPhase = phase

  const aura = new THREE.Mesh(
    new THREE.CircleGeometry(.38, 32),
    new THREE.MeshBasicMaterial({
      color: 0xf3b83f,
      transparent: true,
      opacity: .13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  aura.rotation.x = -Math.PI / 2
  aura.position.y = .006
  aura.userData.rewardGlow = true
  group.add(aura)

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(.31, .012, 6, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd86a,
      transparent: true,
      opacity: .3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  halo.rotation.x = Math.PI / 2
  halo.position.y = .026
  halo.userData.rewardGlow = true
  group.add(halo)

  const layout = [
    { x: -.13, y: .035, z: .045, rx: -.03, rz: -.08, yaw: .2 },
    { x: .035, y: .043, z: .085, rx: .025, rz: .055, yaw: 1.25 },
    { x: .145, y: .05, z: -.025, rx: -.02, rz: .085, yaw: 2.3 },
    { x: -.015, y: .082, z: -.105, rx: .04, rz: -.035, yaw: 3.15 },
  ]

  layout.forEach((slot, index) => {
    const coinGroup = new THREE.Group()
    coinGroup.position.set(slot.x, slot.y, slot.z)
    coinGroup.rotation.set(slot.rx, slot.yaw + phase * .08, slot.rz)

    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(.145, .145, .052, 24),
      new THREE.MeshStandardMaterial({
        color: index === 3 ? 0xf0c958 : 0xe2b246,
        emissive: 0x8e5b13,
        emissiveIntensity: .78,
        roughness: .22,
        metalness: .88,
      }),
    )
    coin.castShadow = true
    coinGroup.add(coin)

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(.141, .011, 7, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffe8a0,
        transparent: true,
        opacity: .76,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = .029
    coinGroup.add(rim)

    const stamp = new THREE.Mesh(
      new THREE.CylinderGeometry(.075, .075, .004, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffda73,
        emissive: 0x9b681c,
        emissiveIntensity: .62,
        roughness: .26,
        metalness: .74,
      }),
    )
    stamp.position.y = .029
    coinGroup.add(stamp)

    group.add(coinGroup)
  })

  const sparkleGeometry = new THREE.OctahedronGeometry(.027, 0)
  ;[
    [-.22, .17, -.04],
    [.2, .2, .09],
  ].forEach(([x, y, z], index) => {
    const sparkle = new THREE.Mesh(
      sparkleGeometry.clone(),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xfff3bd : 0xffd56c,
        transparent: true,
        opacity: .82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    sparkle.position.set(x, y, z)
    sparkle.userData.rewardSparkle = true
    sparkle.userData.rewardSparkleOffset = index * Math.PI
    group.add(sparkle)
  })

  return group
}

function awardXpImmediately(
  runtime: RewardRuntime,
  amount: number,
  position: THREE.Vector3,
  enemyId: string,
) {
  runtime.__forgeXp = (runtime.__forgeXp ?? 0) + amount
  let leveled = false
  while ((runtime.__forgeXp ?? 0) >= xpRequired(runtime.__forgeLevel ?? 1)) {
    runtime.__forgeXp =
      (runtime.__forgeXp ?? 0) - xpRequired(runtime.__forgeLevel ?? 1)
    runtime.__forgeLevel = (runtime.__forgeLevel ?? 1) + 1
    leveled = true
  }

  spawnXpGainFx(runtime, position, enemyId)
  runtime.spawnPulse?.(position, '#a98aef', 1.15, .2)
  pushRewardEvent(runtime, {
    kind: 'xp',
    amount,
    position: position.clone().add(new THREE.Vector3(0, .75, 0)),
    levelUp: leveled,
  })

  if (leveled) {
    runtime.setMessage(
      `Level ${runtime.__forgeLevel}! Your experience carried you forward.`,
      2.8,
    )
  }
  runtime.saveGame?.(false)
}

function spawnXpGainFx(
  runtime: RewardRuntime,
  position: THREE.Vector3,
  enemyId: string,
) {
  const group = new THREE.Group()
  group.position.copy(position)
  group.position.y += .12

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.36, .026, 8, 28),
    new THREE.MeshBasicMaterial({
      color: 0xb89bf0,
      transparent: true,
      opacity: .74,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = .12
  group.add(ring)

  const particles: RewardXpParticle[] = []
  for (let index = 0; index < 7; index += 1) {
    const angle =
      hashUnit(`${enemyId}:xp:angle:${index}`) * Math.PI * 2
    const radius =
      .38 + hashUnit(`${enemyId}:xp:radius:${index}`) * .48
    const lift =
      .7 + hashUnit(`${enemyId}:xp:lift:${index}`) * .7
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(.048 + (index % 2) * .012, 0),
      new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? 0xf4edff : 0xb89bf0,
        transparent: true,
        opacity: .9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    mesh.position.y = .35
    group.add(mesh)
    particles.push({ mesh, angle, radius, lift })
  }

  ;(runtime.world ?? runtime.scene).add(group)
  runtime.__forgeRewardXpFx!.push({
    group,
    ring,
    particles,
    age: 0,
    duration: .34,
  })
}

function updateRewardPresentation(runtime: RewardRuntime, delta: number) {
  updateGoldPickups(runtime, delta)
  updateXpEffects(runtime, delta)
}

function updateGoldPickups(runtime: RewardRuntime, delta: number) {
  ensureRewardState(runtime)
  for (const pickup of [...runtime.__forgeRewardPickups!]) {
    pickup.age += delta
    if (pickup.age < 0) continue

    const dx = runtime.player.position.x - pickup.group.position.x
    const dz = runtime.player.position.z - pickup.group.position.z
    const horizontalDistance = Math.hypot(dx, dz)

    if (pickup.age >= .14 && horizontalDistance < 5.7) {
      pickup.magnet = true
    }

    if (!pickup.magnet) {
      if (!pickup.settled) {
        pickup.velocity.y -= 25 * delta
        pickup.group.position.addScaledVector(pickup.velocity, delta)
        pickup.group.rotation.x += pickup.spin.x * delta
        pickup.group.rotation.y += pickup.spin.y * delta
        pickup.group.rotation.z += pickup.spin.z * delta

        const appear = Math.min(1, pickup.age * 18)
        pickup.group.scale.setScalar(.72 + appear * .28)

        if (pickup.group.position.y <= pickup.floorY) {
          pickup.group.position.y = pickup.floorY
          if (pickup.bounces === 0 && pickup.age < .46) {
            pickup.bounces = 1
            pickup.velocity.y = Math.min(1.55, Math.abs(pickup.velocity.y) * .16)
            pickup.velocity.x *= .42
            pickup.velocity.z *= .42
            pickup.spin.multiplyScalar(.48)
          } else {
            pickup.velocity.set(0, 0, 0)
            pickup.settled = true
            pickup.group.rotation.x = 0
            pickup.group.rotation.z = 0
          }
        }
      } else {
        const phase = Number(pickup.group.userData.rewardPhase ?? 0)
        const pulse = Math.sin(pickup.age * 4.2 + phase)
        pickup.group.position.y = pickup.floorY + .018 + pulse * .012
        pickup.group.rotation.y += delta * .32
        pickup.group.scale.setScalar(.98 + pulse * .018)
        pickup.group.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          if (child.userData.rewardGlow && child.material instanceof THREE.MeshBasicMaterial) {
            child.material.opacity = child.geometry.type === 'CircleGeometry'
              ? .12 + (pulse + 1) * .025
              : .28 + (pulse + 1) * .04
          }
          if (child.userData.rewardSparkle && child.material instanceof THREE.MeshBasicMaterial) {
            const offset = Number(child.userData.rewardSparkleOffset ?? 0)
            const shimmer = .5 + .5 * Math.sin(pickup.age * 7.4 + offset)
            child.material.opacity = .26 + shimmer * .68
            child.scale.setScalar(.65 + shimmer * .65)
            child.rotation.y += delta * 4
          }
        })
      }
      continue
    }

    pickup.magnetAge += delta
    const target = runtime.player.position.clone().add(new THREE.Vector3(0, .82, 0))
    const toTarget = target.sub(pickup.group.position)
    const distance = toTarget.length()
    const speed =
      11.8 +
      Math.min(24, pickup.magnetAge * 62) +
      Math.max(0, 5.7 - Math.min(5.7, horizontalDistance)) * 4.8
    const travel = Math.min(distance, speed * delta)

    if (distance > .0001) {
      pickup.group.position.addScaledVector(toTarget, travel / distance)
    }
    pickup.group.rotation.x += delta * 17
    pickup.group.rotation.y += delta * 24
    pickup.group.scale.setScalar(
      THREE.MathUtils.clamp(.38 + distance * .28, .38, 1),
    )

    if (distance <= .3) collectGold(runtime, pickup)
  }
}

function updateXpEffects(runtime: RewardRuntime, delta: number) {
  for (let index = runtime.__forgeRewardXpFx!.length - 1; index >= 0; index -= 1) {
    const effect = runtime.__forgeRewardXpFx![index]
    effect.age += delta
    const t = Math.min(1, effect.age / effect.duration)
    const fade = Math.pow(1 - t, 1.7)

    effect.ring.scale.setScalar(.45 + t * 1.35)
    effect.ring.material.opacity = fade * .72

    effect.particles.forEach((particle, particleIndex) => {
      const spread = particle.radius * (.18 + t * .82)
      particle.mesh.position.set(
        Math.cos(particle.angle) * spread,
        .28 + particle.lift * t + Math.sin(t * Math.PI) * .18,
        Math.sin(particle.angle) * spread,
      )
      particle.mesh.rotation.y += delta * (8 + particleIndex)
      particle.mesh.scale.setScalar(.55 + fade * .65)
      ;(particle.mesh.material as THREE.MeshBasicMaterial).opacity = fade
    })

    if (t < 1) continue
    effect.group.parent?.remove(effect.group)
    disposeGroup(effect.group)
    runtime.__forgeRewardXpFx!.splice(index, 1)
  }
}

function collectGold(runtime: RewardRuntime, pickup: RewardPickup) {
  const position = pickup.group.position.clone()
  const index = runtime.__forgeRewardPickups!.indexOf(pickup)
  if (index >= 0) runtime.__forgeRewardPickups!.splice(index, 1)

  runtime.__forgeGold = (runtime.__forgeGold ?? 0) + pickup.amount
  runtime.spawnPulse?.(position, '#f0c45e', .62, .12)

  pickup.group.parent?.remove(pickup.group)
  disposeGroup(pickup.group)

  pushRewardEvent(runtime, {
    kind: 'gold',
    amount: pickup.amount,
    position,
  })
}

function pushRewardEvent(
  runtime: RewardRuntime,
  reward: {
    kind: 'gold' | 'xp'
    amount: number
    position: THREE.Vector3
    levelUp?: boolean
  },
) {
  const screen = projectToScreen(runtime, reward.position)
  const event: ForgeRewardPickupEvent = {
    id: (runtime.__forgeRewardEventId =
      (runtime.__forgeRewardEventId ?? 0) + 1),
    kind: reward.kind,
    amount: reward.amount,
    screenX: screen.x,
    screenY: screen.y,
    levelUp: reward.levelUp || undefined,
  }
  runtime.__forgeRewardEvents!.push(event)
  if (runtime.__forgeRewardEvents!.length > 10) {
    runtime.__forgeRewardEvents!.splice(
      0,
      runtime.__forgeRewardEvents!.length - 10,
    )
  }
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
  return Array.from({ length: count })
    .map(() => base + (remainder-- > 0 ? 1 : 0))
    .filter((value) => value > 0)
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
  runtime.__forgeGold = (runtime.__forgeGold ?? 0) + goldAdded
  runtime.__forgeXp = (runtime.__forgeXp ?? 0) + xpAdded

  let levelsGained = 0
  while ((runtime.__forgeXp ?? 0) >= xpRequired(runtime.__forgeLevel ?? 1)) {
    runtime.__forgeXp =
      (runtime.__forgeXp ?? 0) - xpRequired(runtime.__forgeLevel ?? 1)
    runtime.__forgeLevel = (runtime.__forgeLevel ?? 1) + 1
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
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    materials.forEach((material) => material.dispose())
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
