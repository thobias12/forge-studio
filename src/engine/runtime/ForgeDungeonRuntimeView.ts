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
import { FORGE_GAMEPLAY_FEEL, forgeExpAlpha } from './ForgeGameplayFeel'
import {
  forgeSnapGameplayCamera,
  forgeUpdateGameplayCamera,
} from './ForgeGameplayCamera'

export const dungeonViewMethods = {
  updatePortal(delta: number) {
    if (!this.portal) return
    this.portal.group.rotation.y += delta * (this.portalReady() ? 0.55 : 0.12)
    const pulse = 1 + Math.sin(performance.now() * 0.004) * (this.portalReady() ? 0.08 : 0.02)
    this.portal.ring.scale.setScalar(pulse)
  },

  updateCamera(delta: number) {
    this.cameraShake = Math.max(0, this.cameraShake - delta * 2.7)
    this.cameraDistance = THREE.MathUtils.lerp(
      this.cameraDistance,
      this.cameraDistanceTarget,
      forgeExpAlpha(
        FORGE_GAMEPLAY_FEEL.camera.zoomResponse,
        delta,
      ),
    )

    forgeUpdateGameplayCamera({
      camera: this.camera,
      focus: this.cameraFocus,
      playerPosition: this.player.position,
      playerVelocity: this.playerVelocity,
      mouseWorld: this.mouseWorld,
      pointerTracked: this.pointerTracked,
      distance: this.cameraDistance,
      delta,
      shake: this.cameraShake,
      tempFocus: this.tempCameraFocus,
      tempAim: this.tempAim,
      tempOffset: this.tempCamera,
    })
  },

  snapCamera() {
    this.cameraDistance = this.cameraDistanceTarget
    forgeSnapGameplayCamera({
      camera: this.camera,
      focus: this.cameraFocus,
      playerPosition: this.player.position,
      distance: this.cameraDistance,
      tempOffset: this.tempCamera,
    })
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

    const desired = new Map<THREE.Mesh, number>()
    const directWalls: THREE.Mesh[] = []
    for (const hit of this.occlusionRay.intersectObjects(this.world.children, true)) {
      const mesh = hit.object as THREE.Mesh
      if (!mesh.isMesh || !mesh.userData.skillboundOccluder) continue
      desired.set(mesh, 0.055)
      if (mesh.userData.skillboundWallChunk) directWalls.push(mesh)
    }

    // Tall ARPG walls use a compact cutaway pocket rather than a wide
    // translucent zone. Direct blockers almost disappear, one immediate
    // neighbor ring softens the edge, and a small outer feather prevents
    // popping as the player crosses corners.
    if (!this.__forgeWallOccluders) {
      const walls: THREE.Mesh[] = []
      this.world.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh
        if (mesh.isMesh && mesh.userData.skillboundWallChunk) walls.push(mesh)
      })
      this.__forgeWallOccluders = walls
    }

    if (directWalls.length && this.__forgeWallOccluders?.length) {
      const playerPlanarDistance = Math.hypot(
        this.player.position.x - this.camera.position.x,
        this.player.position.z - this.camera.position.z,
      )

      for (const primary of directWalls) {
        const px = Number(primary.userData.skillboundOcclusionCenterX)
        const pz = Number(primary.userData.skillboundOcclusionCenterZ)
        if (!Number.isFinite(px) || !Number.isFinite(pz)) continue

        for (const candidate of this.__forgeWallOccluders as THREE.Mesh[]) {
          if (candidate === primary) continue
          const cx = Number(candidate.userData.skillboundOcclusionCenterX)
          const cz = Number(candidate.userData.skillboundOcclusionCenterZ)
          if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue

          const cameraDistance = Math.hypot(
            cx - this.camera.position.x,
            cz - this.camera.position.z,
          )
          if (cameraDistance > playerPlanarDistance + 1.5) continue
          if (
            Math.hypot(
              cx - this.player.position.x,
              cz - this.player.position.z,
            ) > 9
          ) continue

          const neighborDistance = Math.hypot(cx - px, cz - pz)
          const targetOpacity =
            neighborDistance <= 4.6
              ? 0.46
              : neighborDistance <= 6.8
                ? 0.76
                : undefined
          if (targetOpacity === undefined) continue

          const currentTarget = desired.get(candidate)
          if (
            currentTarget === undefined ||
            targetOpacity < currentTarget
          ) {
            desired.set(candidate, targetOpacity)
          }
        }
      }
    }

    for (const [mesh, targetOpacity] of desired) {
      const response =
        targetOpacity <= 0.08
          ? 19
          : targetOpacity <= 0.5
            ? 12
            : 9
      const fadeOut = 1 - Math.exp(-response * delta)
      const next = THREE.MathUtils.lerp(
        this.fadedOccluders.get(mesh) ?? 1,
        targetOpacity,
        fadeOut,
      )
      setMeshOpacity(mesh, next)
      this.fadedOccluders.set(mesh, next)
    }

    const fadeIn = 1 - Math.exp(-11 * delta)
    for (const [mesh, current] of [...this.fadedOccluders]) {
      if (desired.has(mesh)) continue
      const next = THREE.MathUtils.lerp(current, 1, fadeIn)
      if (next >= 0.995) {
        setMeshOpacity(mesh, 1)
        this.fadedOccluders.delete(mesh)
      } else {
        setMeshOpacity(mesh, next)
        this.fadedOccluders.set(mesh, next)
      }
    }
  },

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
    const material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1, 32),
      material,
    )
    mesh.rotation.x = -Math.PI / 2
    const floorY =
      this.floorHeightAt?.(position.x, position.z) ??
      Number(position.y ?? 0)
    // Crypt floor bricks sit above the navigation floor by roughly .09.
    // Keep all transient ground rings clearly on top of the rendered surface.
    mesh.position.set(position.x, floorY + 0.16, position.z)
    mesh.renderOrder = 22
    this.scene.add(mesh)
    this.effects.push({
      mesh,
      age: 0,
      duration,
      maxScale: Math.max(1, radius),
    })
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
    const sequence = ++this.damageNumberSequence
    const angle = sequence * 2.399963229728653
    const lane = sequence % 4
    const spread = .12 + lane * .045
    sprite.position.set(
      position.x + Math.cos(angle) * spread,
      2.24 + (lane % 3) * .11,
      position.z + Math.sin(angle) * spread,
    )
    sprite.scale.set(1.76, .88, 1)
    this.scene.add(sprite)
    this.textEffects.push({ sprite, age: 0, duration: .56 })
  },

  async spawnBoundVfx(assetId: string | undefined, position: THREE.Vector3) {
    try {
      const spawnPosition = position.clone()
      const floorY = this.floorHeightAt?.(spawnPosition.x, spawnPosition.z) ?? Number(spawnPosition.y ?? 0)
      // V3 floor bricks top out around y + .09. Older runtime VFX used .08 as
      // their ground clamp, which placed ground emitters inside the masonry.
      spawnPosition.y = Math.max(spawnPosition.y, floorY + 0.16)
      const effect = await spawnLibraryVfx(this.scene, assetId, spawnPosition)
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
    return { generatedItems: this.gameplay.items.filter(item => item.itemRoll?.sourceId), health: Math.max(1, this.playerHealth), inventory: [...this.inventory], equippedWeaponId: this.equippedWeaponId }
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
