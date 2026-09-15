// @ts-nocheck
import * as THREE from 'three'
import { itemVisual } from '../itemPresentation'
import { dungeonAtmosphere, tintRoomFloor } from '../../lib/dungeonAtmosphere'
import { dungeonProps } from '../../lib/dungeonProps'
import { getRoomConnection } from '../../lib/dungeonPackage'
import { addCryptCorridorEnvironment, addCryptRoomEnvironment } from '../../lib/cryptEnvironment'
import { bindCharacterAsset, disposeBoundObject, loadLibraryAnimationClips, spawnLibraryVfx } from './ForgeAssetRuntime'
import { bindRuntimeItemModel, fallbackSocketPosition, findRuntimeItemSocket } from './ForgeItemRuntime'
import { addRoomShell, addCorridorFloor, addBuiltinProp, chooseAbilityClip, markOccluderTree, pointInsideRoom, planarDistance, seededRandom, hashSeed, setMeshOpacity } from './ForgeDungeonRuntimeHelpers'

export const dungeonViewMethods = {
  updatePortal(delta: number) {
    if (!this.portal) return
    this.portal.group.rotation.y += delta * (this.portalReady() ? 0.55 : 0.12)
    const pulse = 1 + Math.sin(performance.now() * 0.004) * (this.portalReady() ? 0.08 : 0.02)
    this.portal.ring.scale.setScalar(pulse)
  },

  updateCamera(delta: number) {
    this.cameraShake = Math.max(0, this.cameraShake - delta * 2.7)
    const desired = this.player.position.clone().add(this.cameraOffset())
    if (this.cameraShake > 0) {
      const strength = this.cameraShake * 0.7
      desired.x += Math.sin(performance.now() * 0.061) * strength
      desired.y += Math.sin(performance.now() * 0.083) * strength * 0.45
      desired.z += Math.cos(performance.now() * 0.073) * strength
    }
    this.camera.position.lerp(desired, 1 - Math.pow(0.0008, delta))
    this.camera.lookAt(this.player.position.x, 0.8, this.player.position.z)
  },

  snapCamera() {
    this.camera.position.copy(this.player.position).add(this.cameraOffset())
    this.camera.lookAt(this.player.position.x, 0.8, this.player.position.z)
  },

  updateOcclusion(delta: number) {
    const target = this.player.position.clone().add(new THREE.Vector3(0, 0.95, 0))
    const direction = target.clone().sub(this.camera.position)
    const distance = direction.length()
    if (distance < 0.2) return
    direction.normalize()
    this.occlusionRay.set(this.camera.position, direction)
    this.occlusionRay.near = 0.08
    this.occlusionRay.far = Math.max(0.1, distance - 0.35)
    const blocked = new Set<THREE.Mesh>()
    for (const hit of this.occlusionRay.intersectObjects(this.world.children, true)) {
      const mesh = hit.object as THREE.Mesh
      if (!mesh.isMesh || !mesh.userData.skillboundOccluder) continue
      blocked.add(mesh)
    }
    const fadeOut = 1 - Math.exp(-13 * delta)
    const fadeIn = 1 - Math.exp(-8 * delta)
    for (const mesh of blocked) {
      const next = THREE.MathUtils.lerp(this.fadedOccluders.get(mesh) ?? 1, 0.14, fadeOut)
      setMeshOpacity(mesh, next)
      this.fadedOccluders.set(mesh, next)
    }
    for (const [mesh, current] of [...this.fadedOccluders]) {
      if (blocked.has(mesh)) continue
      const next = THREE.MathUtils.lerp(current, 1, fadeIn)
      if (next >= 0.995) { setMeshOpacity(mesh, 1); this.fadedOccluders.delete(mesh) }
      else { setMeshOpacity(mesh, next); this.fadedOccluders.set(mesh, next) }
    }
  },

  cameraOffset() { return new THREE.Vector3(this.cameraDistance * 0.58, this.cameraDistance * 0.74, this.cameraDistance * 0.58) },

  updateEffects(delta: number) {
    for (const effect of [...this.effects]) {
      effect.age += delta
      const progress = Math.min(1, effect.age / effect.duration)
      effect.mesh.scale.setScalar(0.25 + progress * effect.maxScale)
      ;(effect.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.72
      if (progress < 1) continue
      this.effects.splice(this.effects.indexOf(effect), 1)
      this.scene.remove(effect.mesh)
      effect.mesh.geometry.dispose()
      ;(effect.mesh.material as THREE.Material).dispose()
    }
  },

  updateTextEffects(delta: number) {
    for (const effect of [...this.textEffects]) {
      effect.age += delta
      const progress = Math.min(1, effect.age / effect.duration)
      effect.sprite.position.y += delta * (0.9 - progress * 0.35)
      const material = effect.sprite.material as THREE.SpriteMaterial
      material.opacity = 1 - progress
      if (progress < 1) continue
      this.scene.remove(effect.sprite)
      material.map?.dispose()
      material.dispose()
      this.textEffects.splice(this.textEffects.indexOf(effect), 1)
    }
  },

  updateLibraryVfx(delta: number) {
    for (const effect of [...this.libraryVfx]) {
      if (effect.update(delta)) continue
      effect.dispose()
      this.libraryVfx.splice(this.libraryVfx.indexOf(effect), 1)
    }
  },

  spawnPulse(position: THREE.Vector3, color: string, radius: number, duration: number) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(position.x, 0.055, position.z)
    this.scene.add(mesh)
    this.effects.push({ mesh, age: 0, duration, maxScale: Math.max(1, radius) })
  },

  spawnDamageNumber(position: THREE.Vector3, damage: number, color: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 128; canvas.height = 64
    const context = canvas.getContext('2d')
    if (!context) return
    context.font = '700 34px Inter, Arial, sans-serif'
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineWidth = 7
    context.strokeStyle = '#100b09'; context.strokeText(String(Math.round(damage)), 64, 32)
    context.fillStyle = color; context.fillText(String(Math.round(damage)), 64, 32)
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(position.x, 2.4, position.z); sprite.scale.set(2.1, 1.05, 1)
    this.scene.add(sprite)
    this.textEffects.push({ sprite, age: 0, duration: 0.68 })
  },

  async spawnBoundVfx(assetId: string | undefined, position: THREE.Vector3) {
    try {
      const effect = await spawnLibraryVfx(this.scene, assetId, position.clone())
      if (!effect) return
      if (this.disposed) { effect.dispose(); return }
      this.libraryVfx.push(effect)
    } catch { /* built-in pulse remains */ }
  },

  getPrimaryAbility() { return this.gameplay.abilities.find((ability) => ability.id === this.gameplay.player.basicAbility) },

  getSkillAbility() {
    const id = this.gameplay.player.activeAbilities[0]
    return this.gameplay.abilities.find((ability) => ability.id === id)
  },

  getEquippedItem() { return this.gameplay.items.find((item) => item.id === this.equippedWeaponId) },

  getEquippedDamageBonus() { return this.getEquippedItem()?.damageBonus ?? 0 },

  resolveEnemyDefinition(family: string) {
    const normalized = family.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return this.gameplay.enemies.find((enemy) => enemy.id === normalized || enemy.id.includes(normalized) || normalized.includes(enemy.id)) ?? this.gameplay.enemies[0]
  },

  playerState(): ForgeAdventurePlayerState {
    return { health: Math.max(1, this.playerHealth), inventory: [...this.inventory], equippedWeaponId: this.equippedWeaponId }
  },

  makeSnapshot(): ForgeDungeonRuntimeSnapshot {
    const primary = this.getPrimaryAbility()
    const skill = this.getSkillAbility()
    const focus = this.focusEnemyId ? this.enemies.get(this.focusEnemyId) : undefined
    const active = [...this.encounters.values()].find((entry) => entry.active) ?? [...this.encounters.values()].find((entry) => !entry.cleared)
    const interaction = this.currentPortalInteraction()
    return {
      ...this.playerState(),
      maxHealth: this.gameplay.player.maxHealth,
      enemiesAlive: [...this.enemies.values()].filter((enemy) => enemy.health > 0).length,
      enemiesTotal: this.totalEnemyCount,
      primaryCooldown: primary ? this.cooldowns.get(primary.id) ?? 0 : 0,
      skillCooldown: skill ? this.cooldowns.get(skill.id) ?? 0 : 0,
      dodgeCooldown: this.dodgeCooldown,
      encounter: active?.definition.name ?? (this.portalReady() ? 'Hollow Vault cleared' : 'Exploring'),
      target: focus && focus.health > 0 ? { id: focus.id, name: focus.boss ? `Vault Warden · ${focus.definition.name}` : focus.definition.name, health: focus.health, maxHealth: focus.maxHealth, boss: focus.boss } : undefined,
      interaction,
      message: this.message,
      bossCleared: this.portalReady(),
    }
  },

  setMessage(message: string, seconds: number) { this.message = message; this.messageRemaining = seconds },

  emitState() { this.options.onState?.(this.makeSnapshot()) }
}
