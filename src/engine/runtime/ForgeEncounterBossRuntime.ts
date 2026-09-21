// @ts-nocheck
import * as THREE from 'three'
import type { DungeonEncounter, DungeonRoom } from '../../lib/dungeonPackage'
import { activeBossPhase, normalizeBossPhases } from '../encounterForge'
import { hashSeed, seededRandom } from './ForgeDungeonRuntimeHelpers'

export function installEncounterBossRuntime(Runtime: any) {
  if (Runtime.prototype.__encounterBossForgeInstalled) return
  Runtime.prototype.__encounterBossForgeInstalled = true

  const baseUpdateEnemies = Runtime.prototype.updateEnemies
  const baseBeginEnemyAttack = Runtime.prototype.beginEnemyAttack
  const baseSpawnReward = Runtime.prototype.spawnReward
  const baseRewardItemForEncounter = Runtime.prototype.rewardItemForEncounter

  Object.assign(Runtime.prototype, {
    encounterProfiles() { return this.options.encounterProfiles ?? [] },
    bossProfiles() { return this.options.bossProfiles ?? [] },

    resolveEncounterProfile(encounter: DungeonEncounter) {
      const id = (encounter as DungeonEncounter & { encounterProfileId?: string }).encounterProfileId
      return id ? this.encounterProfiles().find((profile: any) => profile.id === id) : undefined
    },

    resolveBossProfile(encounter: DungeonEncounter) {
      const id = (encounter as DungeonEncounter & { bossProfileId?: string }).bossProfileId
      return id ? this.bossProfiles().find((profile: any) => profile.id === id) : undefined
    },

    resolveEncounterDefinition(encounter: DungeonEncounter) {
      const profile = this.resolveEncounterProfile(encounter)
      const bossProfile = this.resolveBossProfile(encounter)
      if (bossProfile) {
        return {
          ...encounter,
          name: bossProfile.name || encounter.name,
          family: bossProfile.enemyId || encounter.family,
          count: 1,
          eliteChance: 1,
          difficulty: 1,
          boss: true,
          __bossProfileId: bossProfile.id,
        }
      }
      if (!profile) return encounter
      return {
        ...encounter,
        name: profile.name || encounter.name,
        family: profile.enemyId || profile.family || encounter.family,
        count: Math.max(1, Math.round(profile.count)),
        eliteChance: THREE.MathUtils.clamp(profile.eliteChance, 0, 1),
        difficulty: Math.max(0.25, profile.difficulty),
        __encounterProfileId: profile.id,
        __introMessage: profile.introMessage,
      }
    },

    buildEncounters() {
      const markerMap = new Map(this.dungeon.markers.map((marker: any) => [marker.id, marker]))
      for (const authored of this.dungeon.logic?.encounters ?? []) {
        const encounter = this.resolveEncounterDefinition(authored)
        const room = this.dungeon.rooms.find((candidate: any) => candidate.id === encounter.roomId)
        if (!room) continue
        this.encounters.set(encounter.id, { definition: encounter, active: false, cleared: false, rewardSpawned: false })
        const spawns = encounter.spawnMarkerIds.map((id: string) => markerMap.get(id)).filter(Boolean)
        const random = seededRandom(hashSeed(`${this.dungeon.seed}:${encounter.id}`))
        const cap = encounter.boss ? 1 : 14
        for (let index = 0; index < Math.min(encounter.count, cap); index += 1) {
          const marker: any = spawns[index % Math.max(1, spawns.length)]
          const radius = encounter.boss ? 0 : 0.8 + Math.sqrt(index) * 0.72
          const angle = index * 2.399 + random() * 0.45
          const x = THREE.MathUtils.clamp((marker?.x ?? room.x) + Math.cos(angle) * radius, room.x - room.width / 2 + 1, room.x + room.width / 2 - 1)
          const z = THREE.MathUtils.clamp((marker?.z ?? room.z) + Math.sin(angle) * radius, room.z - room.depth / 2 + 1, room.z + room.depth / 2 - 1)
          this.spawnEnemy(encounter, room, index, x, z)
        }
      }
    },

    spawnEnemy(encounter: DungeonEncounter, room: DungeonRoom, index: number, x: number, z: number) {
      const bossProfile = encounter.boss ? this.resolveBossProfile(encounter) ?? this.bossProfiles().find((profile: any) => profile.id === encounter.__bossProfileId) : undefined
      const definition = bossProfile
        ? this.gameplay.enemies.find((candidate: any) => candidate.id === bossProfile.enemyId) ?? this.resolveEnemyDefinition(bossProfile.enemyId)
        : this.resolveEnemyDefinition(encounter.family)
      if (!definition) return

      const boss = Boolean(encounter.boss)
      const random = seededRandom(hashSeed(`${encounter.id}:${index}:${this.totalEnemyCount}`))
      const elite = boss || random() < encounter.eliteChance
      const difficultyMultiplier = bossProfile ? 1 : Math.max(1, encounter.difficulty * 0.72)
      const hpMultiplier = bossProfile?.healthMultiplier ?? (boss ? 3.2 : elite ? 1.65 : 1)
      const damageMultiplier = bossProfile?.damageMultiplier ?? (boss ? 1.65 : elite ? 1.25 : 1)
      const moveMultiplier = bossProfile?.moveSpeedMultiplier ?? (boss ? 0.9 : 1)
      const cooldownMultiplier = bossProfile?.attackCooldownMultiplier ?? 1
      const scale = bossProfile?.scale ?? (boss ? 1.12 : 1)

      const group = new THREE.Group()
      group.position.set(x, room.floorLevel, z)
      group.scale.setScalar(scale)
      const placeholder = new THREE.Group()
      placeholder.name = '__forge_placeholder'
      const material = new THREE.MeshStandardMaterial({ color: boss ? 0x7c3138 : elite ? 0x7a5437 : definition.color, roughness: 0.82, emissive: 0x000000 })
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.64, 1.5, 10), material)
      body.position.y = 0.82; body.castShadow = true
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8a7667, roughness: 0.9 }))
      head.position.y = 1.76; head.castShadow = true
      placeholder.add(body, head)
      const healthBack = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x251817 }))
      healthBack.position.set(0, 2.48, 0)
      const healthFill = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.055, 0.065), new THREE.MeshBasicMaterial({ color: boss ? 0xdc525a : 0xc9574f }))
      healthFill.position.set(0, 2.48, -0.035)
      // Target health is rendered in the HUD. World-space bars rotate with
      // enemies in the isometric camera and read as distracting floating rods.
      healthBack.visible = false
      healthFill.visible = false
      const telegraph = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.45, definition.attackRange * 0.55), Math.max(0.55, definition.attackRange * 0.72), 32),
        new THREE.MeshBasicMaterial({ color: 0xe8644d, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }),
      )
      telegraph.rotation.x = -Math.PI / 2; telegraph.position.y = 0.045; telegraph.visible = false
      group.add(placeholder, healthBack, healthFill, telegraph)
      this.world.add(group)

      const maxHealth = Math.round(definition.maxHealth * hpMultiplier * difficultyMultiplier)
      const baseDamage = definition.attackDamage * damageMultiplier * difficultyMultiplier
      const baseMoveSpeed = definition.moveSpeed * moveMultiplier
      const baseAttackCooldown = definition.attackCooldown * cooldownMultiplier
      const baseWindup = definition.attackWindup ?? 0.42
      const enemy: any = {
        id: `${encounter.id}:${index}:${this.totalEnemyCount}`,
        encounterId: encounter.id,
        roomId: room.id,
        definition,
        group,
        placeholderMaterial: material,
        healthFill,
        telegraph,
        health: maxHealth,
        maxHealth,
        damage: baseDamage,
        moveSpeed: baseMoveSpeed,
        attackRange: definition.attackRange + (boss ? 0.25 : 0),
        attackCooldown: baseAttackCooldown,
        attackTimer: random() * 0.5,
        windupRemaining: 0,
        windupDuration: baseWindup,
        staggerRemaining: 0,
        recoveryRemaining: 0,
        knockback: new THREE.Vector3(),
        phaseWindup: baseWindup,
        boss,
        elite,
        moving: false,
        bossProfile,
        bossPhaseIndex: -1,
        baseDamage,
        baseMoveSpeed,
        baseAttackCooldown,
        baseWindup,
      }
      this.enemies.set(enemy.id, enemy)
      this.totalEnemyCount += 1
      if (bossProfile) this.updateBossPhase(enemy, true)
      void this.bindEnemyVisual(enemy)
    },

    updateBossPhase(enemy: any, initial = false) {
      const profile = enemy.bossProfile
      if (!profile || enemy.health <= 0) return
      const phases = normalizeBossPhases(profile.phases)
      if (!phases.length) return
      const ratio = enemy.health / Math.max(1, enemy.maxHealth)
      const phase = activeBossPhase(phases, ratio)
      const index = phases.findIndex((entry: any) => entry.id === phase?.id)
      if (!phase || index < 0 || index <= enemy.bossPhaseIndex) return

      const previous = enemy.bossPhaseIndex
      enemy.bossPhaseIndex = index
      enemy.damage = enemy.baseDamage * Math.max(0.1, phase.damageMultiplier)
      enemy.moveSpeed = enemy.baseMoveSpeed * Math.max(0.1, phase.moveSpeedMultiplier)
      enemy.attackCooldown = enemy.baseAttackCooldown * Math.max(0.1, phase.attackCooldownMultiplier)
      enemy.phaseWindup = enemy.baseWindup * Math.max(0.1, phase.windupMultiplier)
      enemy.attackTimer = Math.min(enemy.attackTimer, enemy.attackCooldown * 0.35)
      const material = enemy.telegraph.material as THREE.MeshBasicMaterial
      material.color.set(index >= phases.length - 1 ? 0xff3f3f : index > 0 ? 0xf27845 : 0xe8644d)

      if (initial || previous < 0 && index === 0) return
      this.focusEnemyId = enemy.id
      this.cameraShake = Math.max(this.cameraShake, 0.42)
      this.spawnPulse(enemy.group.position, index >= phases.length - 1 ? '#ff4b42' : '#e8874d', 4.2, 0.5)
      if (phase.vfxAssetId) void this.spawnBoundVfx(phase.vfxAssetId, enemy.group.position)
      if (phase.message) this.setMessage(phase.message, 4.2)
      if (phase.summonEnemyId && phase.summonCount > 0) this.spawnBossSummons(enemy, phase)
    },

    spawnBossSummons(boss: any, phase: any) {
      const room = this.dungeon.rooms.find((candidate: any) => candidate.id === boss.roomId)
      const definition = this.gameplay.enemies.find((candidate: any) => candidate.id === phase.summonEnemyId)
      if (!room || !definition) return
      const state = this.encounters.get(boss.encounterId)
      if (!state) return
      const random = seededRandom(hashSeed(`${this.dungeon.seed}:${boss.id}:${phase.id}`))
      const count = Math.min(8, Math.max(0, Math.round(phase.summonCount)))
      for (let i = 0; i < count; i += 1) {
        const angle = i / Math.max(1, count) * Math.PI * 2 + random() * 0.45
        // Keep phase adds out of the boss's immediate melee footprint.
        // The previous 2.3–3.5m ring collapsed boss + adds into one visual pile.
        const radius = 4.2 + random() * 1.6
        const x = THREE.MathUtils.clamp(
          boss.group.position.x + Math.cos(angle) * radius,
          room.x - room.width / 2 + 1.35,
          room.x + room.width / 2 - 1.35,
        )
        const z = THREE.MathUtils.clamp(
          boss.group.position.z + Math.sin(angle) * radius,
          room.z - room.depth / 2 + 1.35,
          room.z + room.depth / 2 - 1.35,
        )
        const summonEncounter: any = {
          ...state.definition,
          family: definition.id,
          boss: false,
          eliteChance: 0,
          difficulty: 1,
          count: 1,
          __bossProfileId: undefined,
        }
        this.spawnEnemy(summonEncounter, room, 1000 + this.totalEnemyCount + i, x, z)
      }
    },

    updateEnemies(delta: number) {
      for (const enemy of this.enemies.values()) {
        if (enemy.boss && enemy.bossProfile && enemy.health > 0) this.updateBossPhase(enemy)
      }
      return baseUpdateEnemies.call(this, delta)
    },

    beginEnemyAttack(enemy: any) {
      if (!enemy.bossProfile) return baseBeginEnemyAttack.call(this, enemy)
      enemy.windupDuration = THREE.MathUtils.clamp(enemy.phaseWindup ?? enemy.baseWindup ?? enemy.definition.attackWindup ?? 0.42, 0.12, 1.5)
      enemy.windupRemaining = enemy.windupDuration
      enemy.telegraph.visible = true
      enemy.visual?.play('attack', false)
      this.focusEnemyId = enemy.id
    },

    activateEncounters() {
      for (const state of this.encounters.values()) {
        if (state.active || state.cleared) continue
        const encounter = state.definition
        const room = this.dungeon.rooms.find((candidate: any) => candidate.id === encounter.roomId)
        if (!room) continue
        let activate = encounter.trigger === 'room-enter'
          ? this.dungeon.rooms.some((candidate: any) => candidate.id === room.id && Math.abs(this.player.position.x - room.x) <= room.width / 2 && Math.abs(this.player.position.z - room.z) <= room.depth / 2)
          : false
        if (!activate && encounter.triggerMarkerId) {
          const marker = this.dungeon.markers.find((candidate: any) => candidate.id === encounter.triggerMarkerId)
          if (marker) activate = Math.hypot(this.player.position.x - marker.x, this.player.position.z - marker.z) <= (marker.radius ?? 2)
        }
        if (!activate) continue
        state.active = true
        encounter.lockDoorIds.forEach((id: string) => this.lockedDoorIds.add(id))
        const intro = encounter.__introMessage
        this.setMessage(intro || (encounter.boss ? `${encounter.name} awakens.` : `${encounter.name} started.`), 2.8)
      }
    },

    spawnReward(marker: any, encounter: any, bossPosition?: THREE.Vector3) {
      const bossProfile = encounter.boss ? this.resolveBossProfile(encounter) ?? this.bossProfiles().find((profile: any) => profile.id === encounter.__bossProfileId) : undefined
      const explicitItemId = bossProfile?.guaranteedItemId ?? (typeof marker.data.itemId === 'string' ? marker.data.itemId : undefined)
      const markerWithProfileReward = explicitItemId ? { ...marker, data: { ...marker.data, itemId: explicitItemId } } : marker
      return baseSpawnReward.call(this, markerWithProfileReward, encounter, bossPosition)
    },

    rewardItemForEncounter(encounter: any) {
      const bossProfile = encounter.boss ? this.resolveBossProfile(encounter) ?? this.bossProfiles().find((profile: any) => profile.id === encounter.__bossProfileId) : undefined
      const encounterProfile = this.resolveEncounterProfile(encounter) ?? this.encounterProfiles().find((profile: any) => profile.id === encounter.__encounterProfileId)
      const lootTableId = bossProfile?.rewardLootTableId ?? encounterProfile?.rewardLootTableId
      if (lootTableId) {
        const table = this.gameplay.lootTables.find((candidate: any) => candidate.id === lootTableId)
        if (table?.entries?.length) {
          const ordered = [...table.entries].sort((a: any, b: any) => b.chance - a.chance)
          return ordered[0]?.itemId
        }
      }
      return baseRewardItemForEncounter.call(this, encounter)
    },
  })
}
