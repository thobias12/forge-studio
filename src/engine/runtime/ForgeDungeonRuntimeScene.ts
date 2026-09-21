// @ts-nocheck
import * as THREE from 'three'
import { itemVisual } from '../itemPresentation'
import { dungeonAtmosphere, dungeonLightingProfile, tintRoomFloor } from '../../lib/dungeonAtmosphere'
import { dungeonProps } from '../../lib/dungeonProps'
import { getRoomConnection } from '../../lib/dungeonPackage'
import { addCryptCorridorEnvironment, addCryptRoomEnvironment } from '../../lib/cryptEnvironment'
import { addDungeonMasonryV3 } from '../../lib/dungeonForgeV3'
import { bindCharacterAsset, disposeBoundObject, loadLibraryAnimationClips, spawnLibraryVfx } from './ForgeAssetRuntime'
import { bindRuntimeItemModel, fallbackSocketPosition, findRuntimeItemSocket } from './ForgeItemRuntime'
import { addRoomShell, addCorridorFloor, addBuiltinProp, chooseAbilityClip, markOccluderTree, pointInsideRoom, planarDistance, seededRandom, hashSeed, setMeshOpacity } from './ForgeDungeonRuntimeHelpers'
const INTERACT_DISTANCE = 2.65

export const dungeonSceneMethods = {
  buildLighting() {
    const atmosphere = dungeonAtmosphere(this.dungeon.theme)
    const lighting = dungeonLightingProfile(atmosphere, this.dungeon.settings)
    this.scene.add(new THREE.HemisphereLight(atmosphere.sky, atmosphere.ground, lighting.ambientIntensity))
    this.scene.add(new THREE.AmbientLight(atmosphere.sky, lighting.fillIntensity))
    const key = new THREE.DirectionalLight(atmosphere.key, lighting.keyIntensity)
    key.position.set(12, 22, 9)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -70
    key.shadow.camera.right = 70
    key.shadow.camera.top = 70
    key.shadow.camera.bottom = -70
    this.scene.add(key)
  },

  buildDungeon() {
    const atmosphere = dungeonAtmosphere(this.dungeon.theme)
    const flickerLights: CryptFlickerLight[] = []

    if (this.dungeon.theme === 'crypt') {
      // Play Project and Dungeon Forge now share the exact V3 geometry/art
      // renderer. This removes the old parallel "game dungeon" appearance.
      addDungeonMasonryV3(this.world, this.runtimeDungeon, atmosphere, flickerLights, 'arpg')
    } else {
      const roomMap = new Map(this.runtimeDungeon.rooms.map((room) => [room.id, room]))
      const openings = new Map<string, RoomOpening[]>()
      const addOpening = (roomId: string, opening: RoomOpening) => openings.set(roomId, [...(openings.get(roomId) ?? []), opening])

      for (const edge of this.runtimeDungeon.corridors) {
        const fromRoom = roomMap.get(edge.fromRoomId)
        const toRoom = roomMap.get(edge.toRoomId)
        if (!fromRoom || !toRoom) continue
        const from = getRoomConnection(fromRoom, toRoom, edge.width)
        const to = getRoomConnection(toRoom, fromRoom, edge.width)
        addOpening(fromRoom.id, { ...from, corridorId: edge.id })
        addOpening(toRoom.id, { ...to, corridorId: edge.id })
        addCorridorFloor(this.world, from, to, edge.width, atmosphere.corridorFloor)
        if (this.dungeon.theme === 'crypt') {
          const start = this.world.children.length
          addCryptCorridorEnvironment(this.world, from, to, edge.width, atmosphere, `${edge.id}-${this.dungeon.seed}`, false)
          this.world.children.slice(start).forEach(markOccluderTree)
        }
      }

      for (const room of this.runtimeDungeon.rooms) {
        const roomOpenings = openings.get(room.id) ?? []
        addRoomShell(this.world, room, roomOpenings, this.dungeon.settings.wallThickness, tintRoomFloor(atmosphere.floor, room.type, atmosphere).getHex(), atmosphere.wall, atmosphere.wallDark)
        if (this.dungeon.theme === 'crypt') {
          const start = this.world.children.length
          addCryptRoomEnvironment(this.world, room, roomOpenings, this.dungeon.settings.wallThickness, atmosphere, flickerLights, false)
          this.world.children.slice(start).forEach(markOccluderTree)
        }
      }
    }

    for (const prop of dungeonProps(this.runtimeDungeon)) {
      if (prop.y < -20) continue
      addBuiltinProp(this.world, prop.assetRef, prop.x, prop.y, prop.z, prop.rotationY, prop.scale, atmosphere)
    }
  },

  buildPlayer() {
    this.playerPlaceholder.name = '__forge_placeholder'
    const material = new THREE.MeshStandardMaterial({ color: 0xb8c5ba, roughness: 0.62 })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.6, 1.35, 12), material)
    body.position.y = 0.88
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd4b59a, roughness: 0.7 }))
    head.position.y = 1.75
    head.castShadow = true
    const facing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 8), new THREE.MeshStandardMaterial({ color: 0x7ea58b, roughness: 0.55 }))
    facing.rotation.x = Math.PI / 2
    facing.position.set(0, 1.05, -0.7)
    this.playerPlaceholder.add(body, head, facing)
    this.player.add(this.playerPlaceholder)
    this.equippedModelAnchor.position.set(...fallbackSocketPosition('RightHand'))
    this.player.add(this.equippedModelAnchor)
    if (this.dungeon.theme === 'crypt') {
      const atmosphere = dungeonAtmosphere(this.dungeon.theme)
      const lighting = dungeonLightingProfile(atmosphere, this.dungeon.settings)
      const normalized = THREE.MathUtils.clamp((lighting.brightness - 0.55) / 1.95, 0, 1)
      const visibility = new THREE.PointLight(
        atmosphere.sky,
        THREE.MathUtils.lerp(0.28, 0.42, normalized),
        5.6,
        2.15,
      )
      visibility.name = 'DungeonReadabilityLight'
      visibility.position.set(0, 2.7, 0)
      visibility.castShadow = false
      this.player.add(visibility)
    }
    const spawn = this.dungeon.markers.find((marker) => marker.type === 'checkpoint')
    const entrance = this.dungeon.rooms.find((room) => room.type === 'entrance') ?? this.dungeon.rooms[0]
    this.player.position.set(spawn?.x ?? entrance?.x ?? 0, entrance?.floorLevel ?? 0, spawn?.z ?? entrance?.z ?? 0)
    this.mouseWorld.set(this.player.position.x - 4, 0, this.player.position.z - 4)
    this.scene.add(this.player)
  },

  buildEncounters() {
    const markerMap = new Map(this.dungeon.markers.map((marker) => [marker.id, marker]))
    for (const encounter of this.dungeon.logic?.encounters ?? []) {
      const room = this.dungeon.rooms.find((candidate) => candidate.id === encounter.roomId)
      if (!room) continue
      this.encounters.set(encounter.id, { definition: encounter, active: false, cleared: false, rewardSpawned: false })
      const spawns = encounter.spawnMarkerIds.map((id) => markerMap.get(id)).filter((marker): marker is DungeonMarker => Boolean(marker))
      const random = seededRandom(hashSeed(`${this.dungeon.seed}:${encounter.id}`))
      for (let index = 0; index < Math.min(encounter.count, encounter.boss ? 1 : 14); index += 1) {
        const marker = spawns[index % Math.max(1, spawns.length)]
        const radius = encounter.boss ? 0 : 0.8 + Math.sqrt(index) * 0.72
        const angle = index * 2.399 + random() * 0.45
        const x = THREE.MathUtils.clamp((marker?.x ?? room.x) + Math.cos(angle) * radius, room.x - room.width / 2 + 1, room.x + room.width / 2 - 1)
        const z = THREE.MathUtils.clamp((marker?.z ?? room.z) + Math.sin(angle) * radius, room.z - room.depth / 2 + 1, room.z + room.depth / 2 - 1)
        this.spawnEnemy(encounter, room, index, x, z)
      }
    }
  },

  spawnEnemy(encounter: DungeonEncounter, room: DungeonRoom, index: number, x: number, z: number) {
    const definition = this.resolveEnemyDefinition(encounter.family)
    if (!definition) return
    const boss = encounter.boss
    const random = seededRandom(hashSeed(`${encounter.id}:${index}`))
    const elite = boss || random() < encounter.eliteChance
    const hpMultiplier = boss ? 3.2 : elite ? 1.65 : 1
    const damageMultiplier = boss ? 1.65 : elite ? 1.25 : 1
    const group = new THREE.Group()
    group.position.set(x, room.floorLevel, z)
    if (boss) group.scale.setScalar(1.12)
    const placeholder = new THREE.Group()
    placeholder.name = '__forge_placeholder'
    const material = new THREE.MeshStandardMaterial({ color: boss ? 0x7c3138 : elite ? 0x7a5437 : definition.color, roughness: 0.82, emissive: 0x000000 })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.64, 1.5, 10), material)
    body.position.y = 0.82
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8a7667, roughness: 0.9 }))
    head.position.y = 1.76
    head.castShadow = true
    placeholder.add(body, head)
    const healthBack = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x251817 }))
    healthBack.position.set(0, 2.48, 0)
    const healthFill = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.055, 0.065), new THREE.MeshBasicMaterial({ color: boss ? 0xdc525a : 0xc9574f }))
    healthFill.position.set(0, 2.48, -0.035)
    // Target health is rendered in the HUD. These world-space bars otherwise
    // rotate with the enemy and look like floating rods in the isometric view.
    healthBack.visible = false
    healthFill.visible = false
    const telegraph = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.45, definition.attackRange * 0.55), Math.max(0.55, definition.attackRange * 0.72), 32),
      new THREE.MeshBasicMaterial({ color: 0xe8644d, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }),
    )
    telegraph.rotation.x = -Math.PI / 2
    telegraph.position.y = 0.045
    telegraph.visible = false
    group.add(placeholder, healthBack, healthFill, telegraph)
    this.world.add(group)
    const maxHealth = Math.round(definition.maxHealth * hpMultiplier * Math.max(1, encounter.difficulty * 0.72))
    const enemy: RuntimeEnemy = {
      id: `${encounter.id}:${index}`,
      encounterId: encounter.id,
      roomId: room.id,
      definition,
      group,
      placeholderMaterial: material,
      healthFill,
      telegraph,
      health: maxHealth,
      maxHealth,
      damage: definition.attackDamage * damageMultiplier * Math.max(1, encounter.difficulty * 0.72),
      moveSpeed: definition.moveSpeed * (boss ? 0.9 : 1),
      attackRange: definition.attackRange + (boss ? 0.25 : 0),
      attackCooldown: definition.attackCooldown,
      attackTimer: random() * 0.5,
      windupRemaining: 0,
      windupDuration: definition.attackWindup ?? 0.42,
      staggerRemaining: 0,
      recoveryRemaining: 0,
      knockback: new THREE.Vector3(),
      boss,
      elite,
      moving: false,
    }
    this.enemies.set(enemy.id, enemy)
    this.totalEnemyCount += 1
    void this.bindEnemyVisual(enemy)
  },

  async bindPlayerVisual() {
    try {
      const binding = await bindCharacterAsset(this.player, this.gameplay.player.characterAssetId, this.gameplay.player.animationAssetId, 1.95)
      if (this.disposed) { binding?.dispose(); return }
      this.playerVisual = binding
      if (binding) await this.preloadAbilityAnimations(binding)
      if (!this.disposed) void this.refreshEquippedModel()
    } catch { /* placeholder remains valid */ }
  },

  async bindEnemyVisual(enemy: RuntimeEnemy) {
    try {
      const binding = await bindCharacterAsset(enemy.group, enemy.definition.characterAssetId, enemy.definition.animationAssetId, 1.95)
      if (this.disposed || !this.enemies.has(enemy.id)) { binding?.dispose(); return }
      enemy.visual = binding
    } catch { /* placeholder remains valid */ }
  },

  async preloadAbilityAnimations(binding: ForgeCharacterVisualBinding) {
    const loaded = new Set<string>()
    for (const ability of this.gameplay.abilities) {
      if (!ability.animationAssetId || loaded.has(ability.animationAssetId)) continue
      loaded.add(ability.animationAssetId)
      const clips = await loadLibraryAnimationClips(ability.animationAssetId)
      if (this.disposed || !clips.length) continue
      binding.addAnimations(clips)
      for (const candidate of this.gameplay.abilities.filter((entry) => entry.animationAssetId === ability.animationAssetId)) {
        const clip = chooseAbilityClip(candidate, clips)
        if (clip) this.abilityAnimationClipNames.set(candidate.id, clip.name)
      }
    }
  },

  async refreshEquippedModel() {
    if (this.equippedModel) {
      this.equippedModel.parent?.remove(this.equippedModel)
      disposeBoundObject(this.equippedModel)
      this.equippedModel = undefined
    }
    const item = this.getEquippedItem()
    if (!item) return
    const visual = itemVisual(item)
    const boundCharacter = this.player.getObjectByName('__forge_bound_character')
    let target = boundCharacter ? findRuntimeItemSocket(boundCharacter, visual.equipped.socket) : undefined
    if (!target) {
      this.equippedModelAnchor.position.set(...fallbackSocketPosition(visual.equipped.socket))
      target = this.equippedModelAnchor
    }
    try {
      const model = await bindRuntimeItemModel(target, item, 'equipped')
      if (!model) return
      if (this.disposed || this.equippedWeaponId !== item.id) { model.parent?.remove(model); disposeBoundObject(model); return }
      this.equippedModel = model
    } catch { /* optional presentation */ }
  },

  buildPortal(marker: DungeonMarker): PortalRuntime {
    const group = new THREE.Group()
    group.position.set(marker.x, marker.y, marker.z)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.13, 10, 34),
      new THREE.MeshBasicMaterial({ color: 0x6a2f32, transparent: true, opacity: 0.65 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 1.15
    const floor = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0x6a2f32, side: THREE.DoubleSide, transparent: true, opacity: 0.28 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.04
    const light = new THREE.PointLight(0x6a2f32, 1.4, 7)
    light.position.y = 1.3
    group.add(ring, floor, light)
    this.world.add(group)
    return { marker, group, ring, light }
  },

  updatePortalVisual() {
    if (!this.portal) return
    const ready = this.portalReady()
    const color = ready ? 0x68d78c : 0x6a2f32
    const material = this.portal.ring.material as THREE.MeshBasicMaterial
    material.color.setHex(color)
    material.opacity = ready ? 0.95 : 0.48
    this.portal.light.color.setHex(color)
    this.portal.light.intensity = ready ? 3.2 : 0.8
  },

  portalReady() {
    if (!this.portal) return false
    const required = String(this.portal.marker.data.requiresEncounterId ?? '')
    return !required || Boolean(this.encounters.get(required)?.cleared)
  },

  currentPortalInteraction() {
    if (!this.portal) return undefined
    const distance = planarDistance(this.player.position, this.portal.group.position)
    if (distance > INTERACT_DISTANCE) return undefined
    const ready = this.portalReady()
    return { label: ready ? 'E · Return to Drowned March' : 'Defeat the Vault Warden to activate the portal', ready }
  }
}
