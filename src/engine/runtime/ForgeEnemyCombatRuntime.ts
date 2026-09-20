// @ts-nocheck
import * as THREE from 'three'

type EnemyMode = 'overworld' | 'dungeon'

type EnemyProjectile = {
  mesh: THREE.Group
  velocity: THREE.Vector3
  source: THREE.Vector3
  damage: number
  radius: number
  age: number
  lifetime: number
  color: string
}

const DEFAULT_ROLE_POISE = {
  skirmisher: 44,
  brute: 120,
  ranged: 34,
  caster: 46,
} as const

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function roleOf(definition: any) {
  return definition?.role ?? 'skirmisher'
}

function styleOf(definition: any) {
  return definition?.attackStyle ?? 'melee'
}

function preferredRange(definition: any) {
  const role = roleOf(definition)
  if (Number.isFinite(definition?.preferredRange)) {
    return Math.max(.8, Number(definition.preferredRange))
  }
  if (role === 'ranged') return Math.max(4.5, definition?.attackRange * .82)
  if (role === 'caster') return Math.max(4.2, definition?.attackRange * .8)
  return Math.max(.9, definition?.attackRange * .86)
}

function retreatRange(definition: any) {
  if (Number.isFinite(definition?.retreatRange)) {
    return Math.max(.55, Number(definition.retreatRange))
  }
  const role = roleOf(definition)
  return role === 'ranged' || role === 'caster'
    ? Math.max(2.5, preferredRange(definition) * .55)
    : .8
}

function combatColor(definition: any) {
  return String(
    definition?.telegraphColor ??
      (roleOf(definition) === 'caster'
        ? '#9b6ee7'
        : roleOf(definition) === 'ranged'
          ? '#e0b36c'
          : roleOf(definition) === 'brute'
            ? '#d96645'
            : '#e8644d'),
  )
}

function roleHealthColor(role: string, elite: boolean, boss: boolean) {
  if (boss) return 0xdc525a
  if (elite) return 0xe58a4f
  if (role === 'caster') return 0xa873df
  if (role === 'ranged') return 0xd5a858
  if (role === 'brute') return 0xd36a4d
  return 0xc9574f
}

function ensureEnemyState(enemy: any) {
  if (!enemy || enemy.__forgeCombatV3) return
  const definition = enemy.definition ?? {}
  const role = roleOf(definition)
  const basePoise = Math.max(
    8,
    Number(
      definition.poise ??
        DEFAULT_ROLE_POISE[role as keyof typeof DEFAULT_ROLE_POISE] ??
        44,
    ),
  )
  const multiplier = enemy.boss ? 2.25 : enemy.elite ? 1.45 : 1

  enemy.__forgeCombatV3 = true
  enemy.combatRole = role
  enemy.attackStyle = styleOf(definition)
  enemy.preferredRange = preferredRange(definition)
  enemy.retreatRange = retreatRange(definition)
  enemy.strafeWeight = Math.max(0, Number(definition.strafeWeight ?? .12))
  enemy.maxPoise = basePoise * multiplier
  enemy.poise = enemy.maxPoise
  enemy.poiseRecovery = Math.max(0, Number(definition.poiseRecovery ?? 12))
  enemy.poiseRecoveryDelay = 0
  enemy.attackTarget = new THREE.Vector3()
  enemy.attackTargetValid = false

  if (enemy.elite && !enemy.boss) {
    const roll = hashUnit(`${enemy.id}:elite-modifier`)
    enemy.eliteModifier =
      roll < .34 ? 'Bulwark' :
        roll < .67 ? 'Relentless' :
          'Swift'
    if (enemy.eliteModifier === 'Bulwark') {
      enemy.maxPoise *= 1.48
      enemy.poise = enemy.maxPoise
      enemy.poiseRecovery *= 1.18
    } else if (enemy.eliteModifier === 'Relentless') {
      if (Number.isFinite(enemy.attackCooldown)) {
        enemy.attackCooldown *= .8
      }
      enemy.damage = Number.isFinite(enemy.damage)
        ? enemy.damage * 1.08
        : enemy.damage
    } else if (enemy.eliteModifier === 'Swift') {
      if (Number.isFinite(enemy.moveSpeed)) {
        enemy.moveSpeed *= 1.2
      }
    }
  }

  const material = enemy.telegraph?.material
  if (material?.color) material.color.set(combatColor(definition))

  const healthMaterial = enemy.healthFill?.material
  if (healthMaterial?.color) {
    healthMaterial.color.setHex(
      roleHealthColor(role, Boolean(enemy.elite), Boolean(enemy.boss)),
    )
  }

  if (!enemy.boss && enemy.group && Number.isFinite(definition.scale)) {
    enemy.group.scale.setScalar(
      THREE.MathUtils.clamp(Number(definition.scale), .72, 1.45),
    )
  }

  if (enemy.telegraph?.geometry) {
    const style = styleOf(definition)
    if (style === 'projectile') {
      enemy.telegraph.geometry.dispose?.()
      enemy.telegraph.geometry = new THREE.RingGeometry(.38, .64, 32)
    } else if (style === 'area') {
      const radius = Math.max(1.1, Number(definition.areaRadius ?? 1.9))
      enemy.telegraph.geometry.dispose?.()
      enemy.telegraph.geometry = new THREE.RingGeometry(
        radius * .76,
        radius,
        40,
      )
    }
  }
}

function initializeNewEnemies(runtime: any, before: Set<any>, mode: EnemyMode) {
  const collection =
    mode === 'dungeon'
      ? [...runtime.enemies.values()]
      : [...runtime.enemies]
  for (const enemy of collection) {
    if (before.has(enemy)) continue
    ensureEnemyState(enemy)
  }
}

function ensureProjectileState(runtime: any) {
  runtime.__forgeEnemyProjectiles ??= []
  return runtime.__forgeEnemyProjectiles as EnemyProjectile[]
}

function moveEnemyAway(runtime: any, enemy: any, delta: number, mode: EnemyMode) {
  const role = enemy.combatRole ?? roleOf(enemy.definition)
  if (role !== 'ranged' && role !== 'caster') return
  if (
    enemy.health <= 0 ||
    enemy.windupRemaining > 0 ||
    enemy.staggerRemaining > 0 ||
    enemy.recoveryRemaining > 0
  ) {
    return
  }

  if (mode === 'dungeon') {
    const encounter = runtime.encounters?.get(enemy.encounterId)
    if (!encounter?.active || encounter.cleared) return
  }

  const toEnemy = enemy.group.position
    .clone()
    .sub(runtime.player.position)
    .setY(0)
  const distance = toEnemy.length()
  const desired = enemy.preferredRange ?? preferredRange(enemy.definition)
  if (distance >= desired - .18 || distance <= .001) return

  const attackHoldDistance = Math.max(
    enemy.retreatRange ?? retreatRange(enemy.definition),
    desired * .72,
  )
  if (distance < attackHoldDistance) {
    if (mode === 'dungeon') {
      enemy.attackTimer = Math.max(Number(enemy.attackTimer ?? 0), .16)
    } else {
      enemy.attackCooldown = Math.max(Number(enemy.attackCooldown ?? 0), .16)
    }
  }

  toEnemy.normalize()
  const side = hashUnit(`${enemy.id}:combat-side`) > .5 ? 1 : -1
  const tangent = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x)
    .multiplyScalar(side * (enemy.strafeWeight ?? .15))
  const direction = toEnemy.add(tangent).normalize()
  const pressure = THREE.MathUtils.clamp((desired - distance) / desired, .15, 1)
  const speed = Math.max(1.25, enemy.moveSpeed ?? enemy.definition.moveSpeed ?? 3)
  const step = direction.multiplyScalar(speed * delta * (.55 + pressure * .55))

  if (mode === 'dungeon') runtime.tryMoveEnemy(enemy, step)
  else runtime.moveActor(enemy.group, step, .58)

  enemy.group.rotation.y = Math.atan2(
    runtime.player.position.x - enemy.group.position.x,
    runtime.player.position.z - enemy.group.position.z,
  )
  runtime.setEnemyMoving?.(enemy, true)
}

function addCombatOrbit(runtime: any, enemy: any, delta: number, mode: EnemyMode) {
  if ((enemy.combatRole ?? roleOf(enemy.definition)) !== 'skirmisher') return
  if (
    enemy.health <= 0 ||
    enemy.windupRemaining > 0 ||
    enemy.staggerRemaining > 0 ||
    enemy.recoveryRemaining > 0
  ) {
    return
  }
  const dx = runtime.player.position.x - enemy.group.position.x
  const dz = runtime.player.position.z - enemy.group.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1.7 || distance > 3.2) return
  const side = hashUnit(`${enemy.id}:skirmish-side`) > .5 ? 1 : -1
  const tangent = new THREE.Vector3(-dz, 0, dx)
  if (tangent.lengthSq() < .001) return
  tangent
    .normalize()
    .multiplyScalar(
      Math.max(1.2, enemy.moveSpeed ?? enemy.definition.moveSpeed ?? 3) *
        delta *
        .16 *
        side,
    )
  if (mode === 'dungeon') runtime.tryMoveEnemy(enemy, tangent)
  else runtime.moveActor(enemy.group, tangent, .58)
}

function updatePoise(enemy: any, delta: number) {
  ensureEnemyState(enemy)
  enemy.poiseRecoveryDelay = Math.max(
    0,
    Number(enemy.poiseRecoveryDelay ?? 0) - delta,
  )
  if (
    enemy.health <= 0 ||
    enemy.poiseRecoveryDelay > 0 ||
    enemy.poise >= enemy.maxPoise
  ) {
    return
  }
  enemy.poise = Math.min(
    enemy.maxPoise,
    enemy.poise + enemy.poiseRecovery * delta,
  )
}

function registerPoiseHit(
  runtime: any,
  enemy: any,
  damage: number,
  knockbackMultiplier: number,
) {
  ensureEnemyState(enemy)
  const role = enemy.combatRole
  const roleFactor =
    role === 'brute' ? .72 :
      role === 'ranged' ? 1.08 :
        role === 'caster' ? 1.02 :
          .96
  const poiseDamage =
    Math.max(5, damage * .72 + Math.max(0, knockbackMultiplier - .5) * 8) *
    roleFactor

  enemy.poise = Math.max(0, enemy.poise - poiseDamage)
  enemy.poiseRecoveryDelay = 1.05
  if (enemy.poise > 0) {
    return {
      broken: false,
      stagger:
        enemy.boss ? .012 :
          enemy.elite ? .025 :
            role === 'brute' ? .028 :
              role === 'ranged' ? .085 :
                .06,
    }
  }

  const breakStagger =
    enemy.boss ? .34 :
      enemy.elite ? .48 :
        role === 'brute' ? .56 :
          .5
  enemy.poise = enemy.maxPoise * (enemy.boss ? .4 : .28)
  enemy.poiseRecoveryDelay = enemy.boss ? 1.6 : 1.25
  runtime.spawnPulse?.(
    enemy.group.position,
    enemy.boss ? '#ffb265' : '#e5c37b',
    enemy.boss ? 1.9 : 1.35,
    .18,
  )
  return { broken: true, stagger: breakStagger }
}

function beginRoleAttack(runtime: any, enemy: any, baseBegin: Function) {
  ensureEnemyState(enemy)
  enemy.attackTarget.copy(runtime.player.position)
  enemy.attackTargetValid = true

  const toPlayer = runtime.player.position
    .clone()
    .sub(enemy.group.position)
    .setY(0)
  if (toPlayer.lengthSq() > .001) {
    enemy.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z)
    enemy.group.updateMatrixWorld(true)
  }

  baseBegin.call(runtime, enemy)

  const style = enemy.attackStyle
  const telegraph = enemy.telegraph
  if (!telegraph) return

  const material = telegraph.material
  if (material?.color) material.color.set(combatColor(enemy.definition))

  if (style === 'area' || style === 'projectile') {
    enemy.group.updateMatrixWorld(true)
    const localTarget = enemy.group.worldToLocal(
      enemy.attackTarget.clone(),
    )
    telegraph.position.set(localTarget.x, .045, localTarget.z)
  } else {
    telegraph.position.set(0, .045, 0)
  }
}

function finishAttackState(runtime: any, enemy: any, mode: EnemyMode) {
  enemy.telegraph.visible = false
  enemy.telegraph.position.set(0, .045, 0)
  if (mode === 'dungeon') {
    enemy.attackTimer = enemy.attackCooldown
  } else {
    enemy.attackCooldown = enemy.definition.attackCooldown
  }
  enemy.recoveryRemaining = Math.max(
    enemy.recoveryRemaining ?? 0,
    .18 + (enemy.windupDuration ?? .4) * .16,
  )
}

function spawnProjectile(runtime: any, enemy: any, mode: EnemyMode) {
  const definition = enemy.definition
  const color = combatColor(definition)
  const radius = THREE.MathUtils.clamp(
    Number(definition.projectileRadius ?? .18),
    .1,
    .42,
  )
  const speed = THREE.MathUtils.clamp(
    Number(definition.projectileSpeed ?? 11),
    5,
    24,
  )
  const origin = enemy.group.position
    .clone()
    .add(new THREE.Vector3(0, 1.05, 0))
  const target = (enemy.attackTargetValid
    ? enemy.attackTarget.clone()
    : runtime.player.position.clone())
    .add(new THREE.Vector3(0, .75, 0))
  const direction = target.sub(origin)
  direction.y *= .18
  if (direction.lengthSq() < .001) direction.set(0, 0, -1)
  direction.normalize()

  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: .95,
      toneMapped: false,
    }),
  )
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.8, 10, 6),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: .18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  group.add(core, halo)
  group.position.copy(origin)
  ;(runtime.world ?? runtime.scene).add(group)

  ensureProjectileState(runtime).push({
    mesh: group,
    velocity: direction.multiplyScalar(speed),
    source: enemy.group.position.clone(),
    damage: enemy.damage ?? definition.attackDamage,
    radius,
    age: 0,
    lifetime: 3.2,
    color,
  })
  runtime.spawnPulse?.(origin, color, .52, .1)
}

function resolveAreaAttack(runtime: any, enemy: any, mode: EnemyMode) {
  const definition = enemy.definition
  const radius = THREE.MathUtils.clamp(
    Number(definition.areaRadius ?? 1.9),
    .9,
    4.2,
  )
  const target = enemy.attackTargetValid
    ? enemy.attackTarget.clone()
    : runtime.player.position.clone()
  target.y = runtime.floorHeightAt
    ? runtime.floorHeightAt(target.x, target.z)
    : runtime.player.position.y
  const color = combatColor(definition)

  runtime.spawnPulse?.(target, color, radius * 1.2, .32)
  void runtime.spawnBoundVfx?.(definition.attackVfxAssetId, target)

  const dx = runtime.player.position.x - target.x
  const dz = runtime.player.position.z - target.z
  if (Math.hypot(dx, dz) <= radius) {
    damagePlayer(runtime, enemy.damage ?? definition.attackDamage, enemy.group.position, mode, color)
  }
}

function damagePlayer(
  runtime: any,
  damage: number,
  source: THREE.Vector3,
  mode: EnemyMode,
  color = '#ef776b',
) {
  if (runtime.dodgeRemaining > 0) {
    runtime.spawnPulse?.(runtime.player.position, '#88bca0', 1.05, .16)
    return
  }

  if (mode === 'overworld' && typeof runtime.damagePlayer === 'function') {
    runtime.damagePlayer(damage, source)
    return
  }

  runtime.playerHealth = Math.max(0, runtime.playerHealth - damage)
  runtime.playerVisual?.play('hit', false)
  runtime.spawnDamageNumber?.(runtime.player.position, damage, color)
  runtime.spawnPulse?.(runtime.player.position, color, 1.15, .18)
  const recoil = runtime.player.position
    .clone()
    .sub(source)
    .setY(0)
  if (recoil.lengthSq() > .001) {
    runtime.movePlayer?.(recoil.normalize().multiplyScalar(.42))
  }
  runtime.hitStopRemaining = Math.max(runtime.hitStopRemaining ?? 0, .024)
  runtime.cameraShake = Math.max(runtime.cameraShake ?? 0, .34)
  if (runtime.playerHealth <= 0) runtime.respawnPlayer?.()
  runtime.emitState?.()
}

function updateProjectiles(runtime: any, delta: number, mode: EnemyMode) {
  const projectiles = ensureProjectileState(runtime)
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = projectiles[index]
    projectile.age += delta
    projectile.mesh.position.addScaledVector(projectile.velocity, delta)
    projectile.mesh.rotation.y += delta * 8

    const dx = projectile.mesh.position.x - runtime.player.position.x
    const dz = projectile.mesh.position.z - runtime.player.position.z
    const hitRadius = projectile.radius + .52
    if (dx * dx + dz * dz <= hitRadius * hitRadius) {
      damagePlayer(
        runtime,
        projectile.damage,
        projectile.source,
        mode,
        projectile.color,
      )
      removeProjectile(runtime, projectiles, index)
      continue
    }

    if (projectile.age >= projectile.lifetime) {
      removeProjectile(runtime, projectiles, index)
    }
  }
}

function removeProjectile(runtime: any, list: EnemyProjectile[], index: number) {
  const projectile = list[index]
  projectile.mesh.parent?.remove(projectile.mesh)
  projectile.mesh.traverse((child: any) => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose?.())
    else child.material?.dispose?.()
  })
  list.splice(index, 1)
}

function roleTargetSnapshot(runtime: any, snapshot: any, mode: EnemyMode) {
  if (!snapshot?.target) return snapshot
  const enemy =
    mode === 'dungeon'
      ? runtime.enemies.get(snapshot.target.id)
      : runtime.enemies.find((entry: any) => entry.id === snapshot.target.id)
  if (!enemy) return snapshot
  ensureEnemyState(enemy)
  return {
    ...snapshot,
    target: {
      ...snapshot.target,
      name:
        enemy.bossProfile?.name ??
        snapshot.target.name,
      role: enemy.combatRole,
      elite: Boolean(enemy.elite),
      eliteModifier: enemy.eliteModifier,
      poise: Math.max(0, Math.round(enemy.poise)),
      maxPoise: Math.max(1, Math.round(enemy.maxPoise)),
    },
  }
}

function applyOverworldDefinition(enemy: any, definition: any) {
  if (!enemy || !definition || enemy.definition?.id === definition.id) {
    ensureEnemyState(enemy)
    return
  }
  enemy.definition = definition
  enemy.health = definition.maxHealth
  enemy.windupDuration = definition.attackWindup ?? .42
  enemy.attackCooldown = Math.min(enemy.attackCooldown ?? 0, .15)
  enemy.bodyMaterial?.color?.set(definition.color)
  if (enemy.group && Number.isFinite(definition.scale)) {
    enemy.group.scale.setScalar(
      THREE.MathUtils.clamp(Number(definition.scale), .72, 1.45),
    )
  }
  enemy.__forgeCombatV3 = false
  ensureEnemyState(enemy)
}

function selectOverworldDefinition(runtime: any, enemy: any) {
  const roster = runtime.gameplay?.enemies ?? []
  if (roster.length <= 1) return enemy.definition
  const byRole = new Map(roster.map((entry: any) => [roleOf(entry), entry]))
  const roll = hashUnit(`${runtime.region?.seed ?? 0}:${enemy.id}:combat-v3`)
  const role =
    roll < .44 ? 'skirmisher' :
      roll < .64 ? 'ranged' :
        roll < .84 ? 'brute' :
          'caster'
  return byRole.get(role) ?? roster[Math.floor(roll * roster.length)] ?? enemy.definition
}

function registerDungeonDeath(runtime: any, enemy: any) {
  runtime.__forgeCombatDeaths ??= []
  const away = enemy.group.position
    .clone()
    .sub(runtime.player.position)
    .setY(0)
  if (away.lengthSq() < .001) {
    const angle = hashUnit(`${enemy.id}:death`) * Math.PI * 2
    away.set(Math.cos(angle), 0, Math.sin(angle))
  } else {
    away.normalize()
  }
  const side = hashUnit(`${enemy.id}:death-side`) > .5 ? 1 : -1
  runtime.__forgeCombatDeaths.push({
    enemy,
    age: 0,
    duration: enemy.boss ? 1.05 : .92,
    velocity: away.multiplyScalar(
      enemy.boss ? .55 : enemy.elite ? 1.05 : 1.35,
    ),
    roll: side * (enemy.boss ? .42 : enemy.elite ? .82 : 1.05),
  })
}

function updateDungeonDeaths(runtime: any, delta: number) {
  const deaths = runtime.__forgeCombatDeaths ?? []
  for (let index = deaths.length - 1; index >= 0; index -= 1) {
    const death = deaths[index]
    death.age += delta
    const enemy = death.enemy
    if (!enemy?.group?.parent || death.age >= death.duration) {
      deaths.splice(index, 1)
      continue
    }
    const drift = death.velocity.clone().multiplyScalar(delta)
    enemy.group.position.add(drift)
    death.velocity.multiplyScalar(Math.max(0, 1 - delta * 5.5))
    enemy.group.rotation.z += death.roll * delta
    if (death.age > death.duration * .68 && !enemy.boss) {
      const shrink = 1 - delta * .18
      enemy.group.scale.multiplyScalar(Math.max(.985, shrink))
    }
  }
}

export function installOverworldEnemyCombatRuntime(Runtime: any) {
  if (Runtime.prototype.__forgeEnemyCombatV3Overworld) return
  Runtime.prototype.__forgeEnemyCombatV3Overworld = true
  const proto = Runtime.prototype

  const baseBuildEnemies = proto.buildEnemies
  const baseSpawnEnemy = proto.spawnEnemy
  const baseUpdateEnemies = proto.updateEnemies
  const baseBeginEnemyAttack = proto.beginEnemyAttack
  const baseResolveEnemyAttack = proto.resolveEnemyAttack
  const baseDamageEnemy = proto.damageEnemy
  const baseDamagePlayer = proto.damagePlayer
  const baseMakeSnapshot = proto.makeSnapshot

  proto.spawnEnemy = function (...args: any[]) {
    const before = new Set(this.enemies)
    const result = baseSpawnEnemy.apply(this, args)
    initializeNewEnemies(this, before, 'overworld')
    return result
  }

  proto.buildEnemies = function (...args: any[]) {
    const before = new Set(this.enemies)
    const result = baseBuildEnemies.apply(this, args)
    const created = this.enemies.filter((enemy: any) => !before.has(enemy))
    for (const enemy of created) {
      applyOverworldDefinition(
        enemy,
        selectOverworldDefinition(this, enemy),
      )
    }
    return result
  }

  proto.updateEnemies = function (delta: number) {
    for (const enemy of this.enemies) {
      ensureEnemyState(enemy)
      updatePoise(enemy, delta)
      moveEnemyAway(this, enemy, delta, 'overworld')
      addCombatOrbit(this, enemy, delta, 'overworld')
    }
    const result = baseUpdateEnemies.call(this, delta)
    updateProjectiles(this, delta, 'overworld')
    return result
  }

  proto.beginEnemyAttack = function (enemy: any) {
    return beginRoleAttack(this, enemy, baseBeginEnemyAttack)
  }

  proto.resolveEnemyAttack = function (enemy: any) {
    ensureEnemyState(enemy)
    const style = enemy.attackStyle
    if (style === 'melee') {
      return baseResolveEnemyAttack.call(this, enemy)
    }
    finishAttackState(this, enemy, 'overworld')
    if (style === 'projectile') {
      spawnProjectile(this, enemy, 'overworld')
    } else {
      resolveAreaAttack(this, enemy, 'overworld')
    }
  }

  proto.damageEnemy = function (
    enemy: any,
    damage: number,
    direction: THREE.Vector3,
    color: string,
    presentation = 'standard',
    knockbackMultiplier = 1,
    hitStop?: number,
    cameraShake?: number,
    staggerSeconds?: number,
  ) {
    const poise = registerPoiseHit(
      this,
      enemy,
      damage,
      knockbackMultiplier,
    )
    return baseDamageEnemy.call(
      this,
      enemy,
      damage,
      direction,
      color,
      presentation,
      knockbackMultiplier,
      hitStop,
      cameraShake,
      poise?.stagger ?? staggerSeconds,
    )
  }

  proto.damagePlayer = function (...args: any[]) {
    if (this.__forgeCombatLabInvulnerable) {
      this.spawnPulse?.(this.player.position, '#79c79a', .72, .1)
      return
    }
    return baseDamagePlayer.apply(this, args)
  }

  proto.spawnCombatLabPack = function (
    selection: 'mixed' | 'skirmisher' | 'brute' | 'ranged' | 'caster' = 'mixed',
  ) {
    this.__forgeCombatLabSequence =
      Number(this.__forgeCombatLabSequence ?? 0) + 1
    const sequence = this.__forgeCombatLabSequence
    const roster = this.gameplay?.enemies ?? []
    const byRole = new Map(
      roster.map((definition: any) => [roleOf(definition), definition]),
    )
    const roles =
      selection === 'mixed'
        ? ['skirmisher', 'skirmisher', 'brute', 'ranged', 'ranged', 'caster']
        : selection === 'skirmisher'
          ? ['skirmisher', 'skirmisher', 'skirmisher']
          : selection === 'ranged'
            ? ['ranged', 'ranged']
            : [selection]

    let spawned = 0
    roles.forEach((role, index) => {
      const definition =
        byRole.get(role) ??
        roster.find((candidate: any) => candidate.id === role)
      if (!definition) return

      const angle =
        index / Math.max(1, roles.length) * Math.PI * 2 +
        hashUnit(`combat-lab:${sequence}:${index}`) * .48
      const radius =
        role === 'ranged' || role === 'caster'
          ? 6.1
          : role === 'brute'
            ? 4.5
            : 3.8
      const x = this.player.position.x + Math.cos(angle) * radius
      const z = this.player.position.z + Math.sin(angle) * radius
      this.spawnEnemy(
        `combat-lab:${sequence}:${role}:${index}`,
        definition,
        x,
        z,
        {
          transient: true,
          respawn: false,
          respawnSeconds: 0,
        },
      )
      spawned += 1
    })

    this.setMessage?.(
      `Combat Lab · spawned ${spawned} ${selection === 'mixed' ? 'mixed enemies' : selection + (spawned === 1 ? '' : 's')}.`,
      2,
    )
    this.emitState?.()
    return spawned
  }

  proto.clearCombatLab = function () {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]
      if (!enemy.transient || !String(enemy.id).startsWith('combat-lab:')) {
        continue
      }
      if (this.focusEnemyId === enemy.id) this.focusEnemyId = undefined
      enemy.visual?.dispose?.()
      enemy.group.parent?.remove(enemy.group)
      this.disposeObject?.(enemy.group)
      this.enemies.splice(index, 1)
    }
    const projectiles = ensureProjectileState(this)
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      removeProjectile(this, projectiles, index)
    }
    this.setMessage?.('Combat Lab cleared.', 1.4)
    this.emitState?.()
  }

  proto.setCombatLabInvulnerable = function (enabled: boolean) {
    this.__forgeCombatLabInvulnerable = Boolean(enabled)
    if (enabled) {
      this.playerHealth = this.playerDefinition?.maxHealth ?? this.playerHealth
    }
    this.setMessage?.(
      enabled
        ? 'Combat Lab · invulnerability enabled.'
        : 'Combat Lab · invulnerability disabled.',
      1.4,
    )
    this.emitState?.()
  }

  proto.setCombatLabTimeScale = function (scale: number) {
    const value = THREE.MathUtils.clamp(
      Number.isFinite(scale) ? scale : 1,
      .2,
      1,
    )
    this.__forgeCombatLabTimeScale = value
    this.setMessage?.(
      value < .999
        ? `Combat Lab · ${value.toFixed(2)}× slow motion.`
        : 'Combat Lab · normal speed.',
      1.2,
    )
    this.emitState?.()
  }

  proto.makeSnapshot = function (...args: any[]) {
    return {
      ...roleTargetSnapshot(
        this,
        baseMakeSnapshot.apply(this, args),
        'overworld',
      ),
      combatLabInvulnerable: Boolean(this.__forgeCombatLabInvulnerable),
      combatLabTimeScale: THREE.MathUtils.clamp(
        Number(this.__forgeCombatLabTimeScale ?? 1),
        .2,
        1,
      ),
    }
  }
}

export function installDungeonEnemyCombatRuntime(Runtime: any) {
  if (Runtime.prototype.__forgeEnemyCombatV3Dungeon) return
  Runtime.prototype.__forgeEnemyCombatV3Dungeon = true
  const proto = Runtime.prototype

  const baseSpawnEnemy = proto.spawnEnemy
  const baseUpdateEnemies = proto.updateEnemies
  const baseBeginEnemyAttack = proto.beginEnemyAttack
  const baseResolveEnemyAttack = proto.resolveEnemyAttack
  const baseDamageEnemy = proto.damageEnemy
  const baseKillEnemy = proto.killEnemy
  const baseMakeSnapshot = proto.makeSnapshot

  proto.spawnEnemy = function (...args: any[]) {
    const before = new Set(this.enemies.values())
    const result = baseSpawnEnemy.apply(this, args)
    initializeNewEnemies(this, before, 'dungeon')
    return result
  }

  proto.updateEnemies = function (delta: number) {
    for (const enemy of this.enemies.values()) {
      ensureEnemyState(enemy)
      updatePoise(enemy, delta)
      moveEnemyAway(this, enemy, delta, 'dungeon')
      addCombatOrbit(this, enemy, delta, 'dungeon')
    }
    const result = baseUpdateEnemies.call(this, delta)
    updateProjectiles(this, delta, 'dungeon')
    updateDungeonDeaths(this, delta)
    return result
  }

  proto.beginEnemyAttack = function (enemy: any) {
    return beginRoleAttack(this, enemy, baseBeginEnemyAttack)
  }

  proto.resolveEnemyAttack = function (enemy: any) {
    ensureEnemyState(enemy)
    const style = enemy.attackStyle
    if (style === 'melee') {
      return baseResolveEnemyAttack.call(this, enemy)
    }
    finishAttackState(this, enemy, 'dungeon')
    if (style === 'projectile') {
      spawnProjectile(this, enemy, 'dungeon')
    } else {
      resolveAreaAttack(this, enemy, 'dungeon')
    }
  }

  proto.damageEnemy = function (
    enemy: any,
    damage: number,
    direction: THREE.Vector3,
    color: string,
    knockbackMultiplier = 1,
    hitStop?: number,
    cameraShake?: number,
    staggerSeconds?: number,
  ) {
    const poise = registerPoiseHit(
      this,
      enemy,
      damage,
      knockbackMultiplier,
    )
    return baseDamageEnemy.call(
      this,
      enemy,
      damage,
      direction,
      color,
      knockbackMultiplier,
      hitStop,
      cameraShake,
      poise?.stagger ?? staggerSeconds,
    )
  }

  proto.killEnemy = function (enemy: any) {
    registerDungeonDeath(this, enemy)
    return baseKillEnemy.call(this, enemy)
  }

  proto.makeSnapshot = function (...args: any[]) {
    return roleTargetSnapshot(
      this,
      baseMakeSnapshot.apply(this, args),
      'dungeon',
    )
  }
}
