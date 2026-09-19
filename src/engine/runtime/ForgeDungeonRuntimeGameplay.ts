// @ts-nocheck
import * as THREE from 'three'
import { itemVisual } from '../itemPresentation'
import { dungeonAtmosphere, tintRoomFloor } from '../../lib/dungeonAtmosphere'
import { dungeonProps } from '../../lib/dungeonProps'
import { getRoomConnection } from '../../lib/dungeonPackage'
import { addCryptCorridorEnvironment, addCryptRoomEnvironment } from '../../lib/cryptEnvironment'
import { bindCharacterAsset, disposeBoundObject, loadLibraryAnimationClips, spawnLibraryVfx } from './ForgeAssetRuntime'
import { bindRuntimeItemModel, fallbackSocketPosition, findRuntimeItemSocket } from './ForgeItemRuntime'
import { addRoomShell, addCorridorFloor, addBuiltinProp, chooseAbilityClip, markOccluderTree, pointInsideRoom, planarDistance, seededRandom, hashSeed, setMeshOpacity, distanceToSegment, disposeSceneObject } from './ForgeDungeonRuntimeHelpers'
const PLAYER_RADIUS = 0.58
const ENEMY_RADIUS = 0.58
const DODGE_DURATION = 0.19

export const dungeonGameplayMethods = {
  updateCooldowns(delta: number) {
    for (const [id, value] of this.cooldowns) this.cooldowns.set(id, Math.max(0, value - delta))
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta)
    if (this.messageRemaining > 0) { this.messageRemaining -= delta; if (this.messageRemaining <= 0) this.message = '' }
  },

  updatePlayer(delta: number) {
    let moving = false
    if (this.dodgeRemaining > 0) {
      const speed = this.gameplay.player.dodgeDistance / DODGE_DURATION
      this.movePlayer(this.dodgeDirection.clone().multiplyScalar(speed * delta))
      this.dodgeRemaining = Math.max(0, this.dodgeRemaining - delta)
      moving = true
    } else {
      const move = this.getMoveDirection()
      if (move.lengthSq() > 0) {
        this.movePlayer(move.multiplyScalar(this.gameplay.player.moveSpeed * delta))
        moving = true
      }
    }
    const aim = this.mouseWorld.clone().sub(this.player.position).setY(0)
    if (aim.lengthSq() > 0.01) this.player.rotation.y = Math.atan2(aim.x, aim.z)
    if (moving !== this.playerMoving) { this.playerMoving = moving; this.playerVisual?.play(moving ? 'move' : 'idle') }
    this.playerVisual?.update(delta)
  },

  getMoveDirection() {
    this.camera.getWorldDirection(this.tempForward)
    this.tempForward.y = 0
    if (this.tempForward.lengthSq() < 0.001) this.tempForward.set(-1, 0, -1)
    this.tempForward.normalize()
    this.tempRight.set(-this.tempForward.z, 0, this.tempForward.x).normalize()
    const forward = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)
    const right = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
    this.tempMove.copy(this.tempForward).multiplyScalar(forward).addScaledVector(this.tempRight, right)
    if (this.tempMove.lengthSq() > 1) this.tempMove.normalize()
    return this.tempMove.clone()
  },

  movePlayer(delta: THREE.Vector3) {
    const nextX = this.player.position.x + delta.x
    const nextZ = this.player.position.z + delta.z
    if (this.canWalkAt(nextX, this.player.position.z, PLAYER_RADIUS)) this.player.position.x = nextX
    if (this.canWalkAt(this.player.position.x, nextZ, PLAYER_RADIUS)) this.player.position.z = nextZ
    this.player.position.y = this.floorHeightAt(this.player.position.x, this.player.position.z)
  },

  startDodge() {
    if (this.dodgeCooldown > 0 || this.dodgeRemaining > 0) return
    const direction = this.getMoveDirection()
    if (direction.lengthSq() < 0.01) {
      direction.copy(this.mouseWorld).sub(this.player.position).setY(0)
      if (direction.lengthSq() < 0.01) direction.set(0, 0, -1)
      direction.normalize()
    }
    this.dodgeDirection.copy(direction)
    this.dodgeRemaining = DODGE_DURATION
    this.dodgeCooldown = this.gameplay.player.dodgeCooldown
    this.playerVisual?.play('dodge', false)
    this.spawnPulse(this.player.position, '#8ebaa0', 2.2, 0.28)
    this.emitState()
  },

  performAbility(ability: ForgeAbilityDefinition) {
    if ((this.cooldowns.get(ability.id) ?? 0) > 0 || this.playerHealth <= 0) return
    const aim = this.mouseWorld.clone().sub(this.player.position).setY(0)
    if (aim.lengthSq() < 0.01) aim.set(0, 0, -1)
    aim.normalize()
    const damage = ability.damage + this.getEquippedDamageBonus()
    const clipName = this.abilityAnimationClipNames.get(ability.id)
    if (!clipName || !this.playerVisual?.playClipName(clipName, false)) this.playerVisual?.play('attack', false)
    if (ability.kind === 'melee') {
      const impact = this.player.position.clone().addScaledVector(aim, Math.max(1, ability.range * 0.5))
      this.spawnPulse(impact, ability.color, ability.radius, 0.24)
      void this.spawnBoundVfx(ability.vfxAssetId, impact)
      for (const enemy of this.enemies.values()) {
        if (!this.enemyDamageable(enemy)) continue
        const toEnemy = enemy.group.position.clone().sub(this.player.position).setY(0)
        const distance = toEnemy.length()
        if (distance > ability.range + ENEMY_RADIUS) continue
        const facing = distance > 0.001 ? toEnemy.normalize().dot(aim) : 1
        if (facing >= 0.1) this.damageEnemy(enemy, damage, aim, ability.color)
      }
    } else {
      const targetDistance = Math.min(ability.range, this.mouseWorld.distanceTo(this.player.position))
      const target = this.player.position.clone().addScaledVector(aim, targetDistance)
      this.spawnPulse(target, ability.color, ability.radius, 0.55)
      void this.spawnBoundVfx(ability.vfxAssetId, target)
      for (const enemy of this.enemies.values()) {
        if (!this.enemyDamageable(enemy) || enemy.group.position.distanceTo(target) > ability.radius + ENEMY_RADIUS) continue
        const direction = enemy.group.position.clone().sub(target).setY(0)
        if (direction.lengthSq() > 0.001) direction.normalize(); else direction.copy(aim)
        this.damageEnemy(enemy, damage, direction, ability.color)
      }
    }
    this.cooldowns.set(ability.id, ability.cooldown)
    this.emitState()
  },

  enemyDamageable(enemy: RuntimeEnemy) {
    return enemy.health > 0 && Boolean(this.encounters.get(enemy.encounterId)?.active)
  },

  damageEnemy(enemy: RuntimeEnemy, damage: number, direction: THREE.Vector3, color: string) {
    this.focusEnemyId = enemy.id
    enemy.health = Math.max(0, enemy.health - damage)
    enemy.windupRemaining = 0
    enemy.telegraph.visible = false
    enemy.visual?.play('hit', false)
    enemy.placeholderMaterial.emissive.set(0xffffff)
    const ratio = Math.max(0.001, enemy.health / enemy.maxHealth)
    enemy.healthFill.scale.x = ratio
    enemy.healthFill.position.x = -(1 - ratio) * 0.64
    const knock = direction.clone().setY(0)
    if (knock.lengthSq() > 0.001) knock.normalize()
    this.tryMoveEnemy(enemy, knock.multiplyScalar(Math.min(1.1, 0.45 + damage * 0.006)))
    this.spawnDamageNumber(enemy.group.position, damage, color)
    this.spawnPulse(enemy.group.position, color, 1.15, 0.18)
    void this.spawnBoundVfx(enemy.definition.hitVfxAssetId, enemy.group.position)
    this.hitStopRemaining = Math.max(this.hitStopRemaining, 0.035)
    this.cameraShake = Math.max(this.cameraShake, 0.22)
    if (enemy.health <= 0) this.killEnemy(enemy)
  },

  killEnemy(enemy: RuntimeEnemy) {
    enemy.health = 0
    enemy.telegraph.visible = false
    enemy.healthFill.visible = false
    enemy.visual?.play('death', false)
    void this.spawnBoundVfx(enemy.definition.deathVfxAssetId, enemy.group.position)
    this.spawnPulse(enemy.group.position, enemy.boss ? '#d6535b' : '#b65e4c', enemy.boss ? 3.4 : 2.5, 0.45)
    this.cameraShake = Math.max(this.cameraShake, enemy.boss ? 0.5 : 0.34)
    setTimeout(() => { if (!this.disposed) enemy.group.visible = false }, 1050)
    this.checkEncounterClears()
    this.emitState()
  },

  activateEncounters() {
    for (const state of this.encounters.values()) {
      if (state.active || state.cleared) continue
      const encounter = state.definition
      const room = this.dungeon.rooms.find((candidate) => candidate.id === encounter.roomId)
      if (!room) continue
      let activate = encounter.trigger === 'room-enter' ? pointInsideRoom(room, this.player.position.x, this.player.position.z, 0) : false
      if (!activate && encounter.triggerMarkerId) {
        const marker = this.dungeon.markers.find((candidate) => candidate.id === encounter.triggerMarkerId)
        if (marker) activate = Math.hypot(this.player.position.x - marker.x, this.player.position.z - marker.z) <= (marker.radius ?? 2)
      }
      if (!activate) continue
      state.active = true
      encounter.lockDoorIds.forEach((id) => this.lockedDoorIds.add(id))
      this.setMessage(encounter.boss ? `${encounter.name} awakens.` : `${encounter.name} started.`, 2.4)
    }
  },

  checkEncounterClears() {
    for (const state of this.encounters.values()) {
      if (!state.active || state.cleared) continue
      const members = [...this.enemies.values()].filter((enemy) => enemy.encounterId === state.definition.id)
      if (!members.length || members.some((enemy) => enemy.health > 0)) continue
      state.cleared = true
      state.active = false
      state.definition.lockDoorIds.forEach((id) => this.lockedDoorIds.delete(id))
      if (!state.rewardSpawned) {
        state.rewardSpawned = true
        for (const markerId of state.definition.rewardMarkerIds) {
          const marker = this.dungeon.markers.find((candidate) => candidate.id === markerId)
          if (marker) this.spawnReward(marker, state.definition)
        }
      }
      if (state.definition.boss) {
        this.setMessage('Vault Warden defeated. The return portal is active.', 4.2)
        this.updatePortalVisual()
      } else this.setMessage(`${state.definition.name} cleared.`, 2.8)
    }
  },

  spawnReward(marker: DungeonMarker, encounter: DungeonEncounter) {
    const explicitItemId = typeof marker.data.itemId === 'string' ? marker.data.itemId : undefined
    const itemId = explicitItemId ?? this.rewardItemForEncounter(encounter)
    if (itemId) this.spawnLoot(`${encounter.id}:${marker.id}`, itemId, marker.x, marker.z)
  },

  rewardItemForEncounter(encounter: DungeonEncounter) {
    const enemy = this.resolveEnemyDefinition(encounter.family)
    const table = enemy ? this.gameplay.lootTables.find((candidate) => candidate.id === enemy.lootTable) : undefined
    return table?.entries[0]?.itemId ?? this.gameplay.items[0]?.id
  },

  spawnLoot(id: string, itemId: string, x: number, z: number) {
    if (this.loot.some((drop) => drop.id === id)) return
    const item = this.gameplay.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    const group = new THREE.Group()
    group.position.set(x, this.floorHeightAt(x, z), z)
    const glow = new THREE.PointLight(item.color, 1.5, 5)
    glow.position.y = 0.8
    const fallback = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: item.color, emissive: item.color, emissiveIntensity: 0.45 }))
    fallback.position.y = 0.55
    group.add(fallback, glow)
    this.world.add(group)
    const drop: RuntimeLoot = { id, itemId, group, fallback, age: 0 }
    this.loot.push(drop)
    void this.bindLootPresentation(drop, item)
  },

  async bindLootPresentation(drop: RuntimeLoot, item: ForgeItemDefinition) {
    try {
      const model = await bindRuntimeItemModel(drop.group, item, 'drop')
      if (!model) return
      if (this.disposed || !this.loot.includes(drop)) { model.parent?.remove(model); disposeBoundObject(model); return }
      drop.model = model
      drop.fallback.visible = false
    } catch { /* fallback remains */ }
  },

  updateLoot(delta: number) {
    for (const drop of [...this.loot]) {
      drop.age += delta
      drop.group.rotation.y += delta * 0.85
      drop.group.position.y = this.floorHeightAt(drop.group.position.x, drop.group.position.z) + Math.sin(drop.age * 3.2) * 0.08
      if (planarDistance(drop.group.position, this.player.position) > 1.0) continue
      const inventoryRuntime = this as unknown as {
        canPickupInventoryItem?: (itemId: string) => boolean
        refreshInventoryLayout?: () => void
      }
      if (
        inventoryRuntime.canPickupInventoryItem &&
        !inventoryRuntime.canPickupInventoryItem(drop.itemId)
      ) {
        this.setMessage('Pack full. Make room or auto-sort the 12 × 6 inventory.', 1.8)
        continue
      }
      this.inventory.push(drop.itemId)
      inventoryRuntime.refreshInventoryLayout?.()
      const item = this.gameplay.items.find((candidate) => candidate.id === drop.itemId)
      if (!this.equippedWeaponId && item?.slot === 'weapon') { this.equippedWeaponId = item.id; void this.refreshEquippedModel() }
      this.setMessage(`${item?.name ?? 'Item'} collected${this.equippedWeaponId === drop.itemId ? ' and equipped' : ''}.`, 2.8)
      this.world.remove(drop.group)
      if (drop.model) disposeBoundObject(drop.model)
      disposeSceneObject(drop.group)
      this.loot.splice(this.loot.indexOf(drop), 1)
      this.emitState()
    }
  },

  updateEnemies(delta: number) {
    for (const enemy of this.enemies.values()) {
      if (enemy.health <= 0) { enemy.visual?.update(delta); continue }
      enemy.attackTimer = Math.max(0, enemy.attackTimer - delta)
      enemy.placeholderMaterial.emissive.lerp(new THREE.Color(0x000000), Math.min(1, delta * 22))
      enemy.visual?.update(delta)
      const encounter = this.encounters.get(enemy.encounterId)
      if (!encounter?.active || encounter.cleared) { this.setEnemyMoving(enemy, false); continue }
      const distance = planarDistance(enemy.group.position, this.player.position)
      if (enemy.windupRemaining > 0) {
        enemy.windupRemaining = Math.max(0, enemy.windupRemaining - delta)
        const progress = 1 - enemy.windupRemaining / Math.max(0.01, enemy.windupDuration)
        enemy.telegraph.visible = true
        ;(enemy.telegraph.material as THREE.MeshBasicMaterial).opacity = 0.18 + progress * 0.62
        if (enemy.windupRemaining <= 0) this.resolveEnemyAttack(enemy)
        continue
      }
      enemy.telegraph.visible = false
      if (distance <= enemy.attackRange && enemy.attackTimer <= 0) { this.beginEnemyAttack(enemy); continue }
      if (distance > enemy.attackRange) {
        this.setEnemyMoving(enemy, true)
        const direction = this.player.position.clone().sub(enemy.group.position).setY(0)
        if (direction.lengthSq() > 0.001) {
          direction.normalize()
          this.tryMoveEnemy(enemy, direction.multiplyScalar(enemy.moveSpeed * delta))
          enemy.group.rotation.y = Math.atan2(direction.x, direction.z)
        }
      } else this.setEnemyMoving(enemy, false)
    }
  },

  setEnemyMoving(enemy: RuntimeEnemy, moving: boolean) {
    if (enemy.moving === moving) return
    enemy.moving = moving
    enemy.visual?.play(moving ? 'move' : 'idle')
  },

  beginEnemyAttack(enemy: RuntimeEnemy) {
    enemy.windupDuration = THREE.MathUtils.clamp(enemy.definition.attackWindup ?? 0.42, 0.12, 1.5)
    enemy.windupRemaining = enemy.windupDuration
    enemy.telegraph.visible = true
    enemy.visual?.play('attack', false)
    this.focusEnemyId = enemy.id
  },

  resolveEnemyAttack(enemy: RuntimeEnemy) {
    enemy.telegraph.visible = false
    enemy.attackTimer = enemy.attackCooldown
    if (this.dodgeRemaining > 0 || planarDistance(enemy.group.position, this.player.position) > enemy.attackRange + 0.28) return
    this.playerHealth = Math.max(0, this.playerHealth - enemy.damage)
    this.spawnDamageNumber(this.player.position, enemy.damage, '#ef776b')
    void this.spawnBoundVfx(enemy.definition.attackVfxAssetId, this.player.position)
    this.cameraShake = Math.max(this.cameraShake, 0.28)
    if (this.playerHealth <= 0) this.respawnPlayer()
  },

  respawnPlayer() {
    const spawn = this.dungeon.markers.find((marker) => marker.type === 'checkpoint')
    const entrance = this.dungeon.rooms.find((room) => room.type === 'entrance') ?? this.dungeon.rooms[0]
    this.playerHealth = this.gameplay.player.maxHealth
    this.player.position.set(spawn?.x ?? entrance?.x ?? 0, entrance?.floorLevel ?? 0, spawn?.z ?? entrance?.z ?? 0)
    this.setMessage('You were defeated and returned to the Vault Threshold.', 3.4)
    this.cameraShake = 0.45
  },

  tryMoveEnemy(enemy: RuntimeEnemy, delta: THREE.Vector3) {
    const room = this.dungeon.rooms.find((candidate) => candidate.id === enemy.roomId)
    if (!room) return
    const nextX = enemy.group.position.x + delta.x
    const nextZ = enemy.group.position.z + delta.z
    if (pointInsideRoom(room, nextX, nextZ, ENEMY_RADIUS)) { enemy.group.position.x = nextX; enemy.group.position.z = nextZ }
  },

  canWalkAt(x: number, z: number, radius: number) {
    const roomOk = this.dungeon.rooms.some((room) => pointInsideRoom(room, x, z, radius))
    const corridorOk = this.dungeon.corridors.some((edge) => {
      const a = this.dungeon.rooms.find((room) => room.id === edge.fromRoomId)
      const b = this.dungeon.rooms.find((room) => room.id === edge.toRoomId)
      if (!a || !b) return false
      const from = getRoomConnection(a, b, edge.width)
      const to = getRoomConnection(b, a, edge.width)
      return distanceToSegment(x, z, from.x, from.z, to.x, to.z) <= Math.max(0.7, edge.width / 2 - radius * 0.45)
    })
    if (!roomOk && !corridorOk) return false

    for (const prop of dungeonProps(this.runtimeDungeon)) {
      if (!prop.collision) continue
      const propRadius = Math.max(0.28, prop.scale * (prop.assetRef === 'pillar' || prop.assetRef === 'statue' ? 0.72 : 0.52))
      if (Math.hypot(x - prop.x, z - prop.z) < radius + propRadius) return false
    }
    for (const marker of this.dungeon.markers.filter((candidate) => candidate.type === 'door')) {
      const locked = Boolean(marker.data.locked) || this.lockedDoorIds.has(marker.id)
      if (locked && Math.hypot(x - marker.x, z - marker.z) < radius + 0.72) return false
    }
    return true
  },

  floorHeightAt(x: number, z: number) {
    const room = this.dungeon.rooms.find((candidate) => pointInsideRoom(candidate, x, z, -0.2))
    return room?.floorLevel ?? 0
  }
}
