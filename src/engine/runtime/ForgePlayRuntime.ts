import * as THREE from 'three'
import type {
  ForgeAbilityDefinition,
  ForgeEnemyDefinition,
  ForgeGameplayContent,
  ForgeItemDefinition,
  ForgePlayerDefinition,
} from '../forgeProject'
import { itemVisual } from '../itemPresentation'
import { sampleStreamHeight, sampleTerrainHeight, sampleTerrainSurface, streamRenderContinuityIssues, streamRenderProfile, visibleStreamRenderHeight, type GeneratedRegion, type GeneratedRegionNode, type GeneratedWorldPath } from '../guidedWorld'
import {
  bindCharacterAsset,
  disposeBoundObject,
  ForgeCharacterVisualBinding,
  ForgeLibraryVfxInstance,
  loadLibraryAnimationClips,
  spawnLibraryVfx,
} from './ForgeAssetRuntime'
import {
  bindRuntimeItemModel,
  fallbackSocketPosition,
  findRuntimeItemSocket,
} from './ForgeItemRuntime'
import {
  clearRuntimeSave,
  loadRuntimeSave,
  runtimeSaveKey,
  writeRuntimeSave,
  type ForgeRuntimeLootSave,
} from './ForgeGameSave'
import { ForgeNavigationGrid, type ForgeNavigationObstacle } from './ForgeNavigation'

export type ForgeRuntimeTargetSnapshot = {
  id: string
  name: string
  health: number
  maxHealth: number
}

export type ForgeRuntimeSnapshot = {
  health: number
  maxHealth: number
  enemiesAlive: number
  enemiesTotal: number
  primaryCooldown: number
  skillCooldown: number
  dodgeCooldown: number
  inventory: string[]
  equippedWeaponId?: string
  target?: ForgeRuntimeTargetSnapshot
  message: string
  savedAt?: string
}

export type ForgePlayRuntimeOptions = {
  projectId: string
  onState?: (state: ForgeRuntimeSnapshot) => void
}

type CircleObstacle = ForgeNavigationObstacle

type RuntimeEnemy = {
  id: string
  definition: ForgeEnemyDefinition
  group: THREE.Group
  bodyMaterial: THREE.MeshStandardMaterial
  healthFill: THREE.Mesh
  telegraph: THREE.Mesh
  health: number
  attackCooldown: number
  windupRemaining: number
  windupDuration: number
  knockback: THREE.Vector3
  path: THREE.Vector3[]
  pathIndex: number
  repathRemaining: number
  visual?: ForgeCharacterVisualBinding
  moving: boolean
}

type RuntimeLoot = {
  save: ForgeRuntimeLootSave
  group: THREE.Group
  fallback: THREE.Mesh
  model?: THREE.Object3D
  age: number
}

type RuntimeCorpse = {
  group: THREE.Group
  visual?: ForgeCharacterVisualBinding
  age: number
  duration: number
}

type RuntimeEffect = { mesh: THREE.Mesh; age: number; duration: number; maxScale: number }
type RuntimeTextEffect = { sprite: THREE.Sprite; age: number; duration: number }

const PLAYER_RADIUS = 0.58
const ENEMY_RADIUS = 0.62
const DODGE_DURATION = 0.19

export class ForgePlayRuntime {
  private readonly host: HTMLElement
  private readonly region: GeneratedRegion
  private readonly gameplay: ForgeGameplayContent
  private readonly options: ForgePlayRuntimeOptions
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 800)
  private readonly player = new THREE.Group()
  private readonly playerPlaceholder = new THREE.Group()
  private readonly equippedModelAnchor = new THREE.Group()
  private readonly keys = new Set<string>()
  private readonly mouseWorld = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly obstacles: CircleObstacle[] = []
  private readonly enemies: RuntimeEnemy[] = []
  private readonly loot: RuntimeLoot[] = []
  private readonly corpses: RuntimeCorpse[] = []
  private readonly effects: RuntimeEffect[] = []
  private readonly libraryVfx: ForgeLibraryVfxInstance[] = []
  private readonly textEffects: RuntimeTextEffect[] = []
  private readonly defeatedEnemyIds = new Set<string>()
  private readonly cooldowns = new Map<string, number>()
  private readonly abilityAnimationClipNames = new Map<string, string>()
  private readonly playerDefinition: ForgePlayerDefinition
  private readonly saveKey: string
  private readonly resizeObserver: ResizeObserver
  private readonly dodgeDirection = new THREE.Vector3()
  private readonly tempMove = new THREE.Vector3()
  private readonly tempForward = new THREE.Vector3()
  private readonly tempRight = new THREE.Vector3()
  private navigation!: ForgeNavigationGrid
  private playerVisual?: ForgeCharacterVisualBinding
  private equippedModel?: THREE.Object3D
  private inventory: string[] = []
  private equippedWeaponId: string | undefined
  private focusEnemyId: string | undefined
  private cameraDistance = 31
  private playerHealth = 100
  private dodgeRemaining = 0
  private dodgeCooldown = 0
  private lastFrame = performance.now()
  private animationFrame = 0
  private totalEnemyCount = 0
  private disposed = false
  private skipFinalSave = false
  private autosaveElapsed = 0
  private stateEmitElapsed = 0
  private message = 'Find the encounter and test the combat loop.'
  private messageRemaining = 5
  private savedAt: string | undefined
  private hitStopRemaining = 0
  private cameraShake = 0
  private playerMoving = false

  constructor(host: HTMLElement, region: GeneratedRegion, gameplay: ForgeGameplayContent, options: ForgePlayRuntimeOptions) {
    this.host = host
    this.region = region
    this.gameplay = gameplay
    this.options = options
    this.playerDefinition = gameplay.player
    this.playerHealth = this.playerDefinition.maxHealth
    this.saveKey = runtimeSaveKey(options.projectId, region.regionId, region.seed, region.generationVersion)

    const save = loadRuntimeSave(this.saveKey)
    if (save) {
      this.inventory = [...save.inventory]
      this.equippedWeaponId = save.equippedWeaponId
      save.defeatedEnemyIds.forEach((id) => this.defeatedEnemyIds.add(id))
      this.playerHealth = THREE.MathUtils.clamp(save.player.health, 1, this.playerDefinition.maxHealth)
      this.savedAt = save.savedAt
    } else {
      this.inventory = [...this.playerDefinition.startingItems]
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.18
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'skillbound-runtime-canvas'
    this.host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x162119)
    this.scene.fog = new THREE.FogExp2(0x18251c, 0.009)
    this.buildLighting()
    this.buildRegion()
    this.navigation = new ForgeNavigationGrid(this.region.bounds, this.obstacles)
    this.buildPlayer(save?.player)
    this.buildEnemies()
    save?.lootDrops.forEach((drop) => this.spawnLoot(drop, false))
    void this.bindPlayerVisual()
    void this.refreshEquippedModel()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.host)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false })
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)
    this.resize()
    this.snapCamera()
    this.emitState()
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (!this.skipFinalSave) this.saveGame(false)
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    if (this.equippedModel) {
      this.equippedModel.parent?.remove(this.equippedModel)
      disposeBoundObject(this.equippedModel)
      this.equippedModel = undefined
    }
    this.playerVisual?.dispose()
    this.enemies.forEach((enemy) => enemy.visual?.dispose())
    this.corpses.forEach((corpse) => corpse.visual?.dispose())
    this.libraryVfx.forEach((effect) => effect.dispose())
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return
      if (object instanceof THREE.Mesh) object.geometry.dispose()
      const material = object.material
      const materials = Array.isArray(material) ? material : [material]
      materials.forEach((entry) => {
        if (entry instanceof THREE.SpriteMaterial) entry.map?.dispose()
        entry.dispose()
      })
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getSnapshot(): ForgeRuntimeSnapshot { return this.makeSnapshot() }

  saveGame(manual = true) {
    const savedAt = new Date().toISOString()
    writeRuntimeSave(this.saveKey, {
      format: 'forge-runtime-save',
      version: 1,
      projectId: this.options.projectId,
      regionId: this.region.regionId,
      worldSeed: this.region.seed,
      generationVersion: this.region.generationVersion,
      player: { x: this.player.position.x, z: this.player.position.z, health: this.playerHealth },
      inventory: [...this.inventory],
      equippedWeaponId: this.equippedWeaponId,
      defeatedEnemyIds: [...this.defeatedEnemyIds],
      lootDrops: this.loot.map((drop) => ({ ...drop.save })),
      savedAt,
    })
    this.savedAt = savedAt
    if (manual) this.setMessage('Game saved. Reloading this seed will restore the same combat state.', 3.2)
    this.emitState()
  }

  resetProgress() {
    this.skipFinalSave = true
    clearRuntimeSave(this.saveKey)
  }

  equipItem(itemId: string) {
    const item = this.gameplay.items.find((candidate) => candidate.id === itemId)
    if (!item || item.slot !== 'weapon' || !this.inventory.includes(itemId)) return
    this.equippedWeaponId = itemId
    this.setMessage(`${item.name} equipped. +${item.damageBonus} attack damage.`, 2.8)
    void this.refreshEquippedModel()
    this.saveGame(false)
    this.emitState()
  }

  private async bindPlayerVisual() {
    try {
      const binding = await bindCharacterAsset(this.player, this.playerDefinition.characterAssetId, this.playerDefinition.animationAssetId, 1.95)
      if (this.disposed) { binding?.dispose(); return }
      this.playerVisual = binding
      if (binding) await this.preloadAbilityAnimations(binding)
      if (!this.disposed) void this.refreshEquippedModel()
    } catch {
      // Asset bindings are optional; placeholders remain a valid development fallback.
    }
  }

  private async preloadAbilityAnimations(binding: ForgeCharacterVisualBinding) {
    const boundIds = new Set<string>()
    for (const ability of this.gameplay.abilities) {
      if (!ability.animationAssetId || boundIds.has(ability.animationAssetId)) continue
      boundIds.add(ability.animationAssetId)
      const clips = await loadLibraryAnimationClips(ability.animationAssetId)
      if (this.disposed || !clips.length) continue
      binding.addAnimations(clips)
      for (const candidate of this.gameplay.abilities.filter((entry) => entry.animationAssetId === ability.animationAssetId)) {
        const clip = chooseAbilityClip(candidate, clips)
        if (clip) this.abilityAnimationClipNames.set(candidate.id, clip.name)
      }
    }
  }

  private async refreshEquippedModel() {
    if (this.equippedModel) {
      this.equippedModel.parent?.remove(this.equippedModel)
      disposeBoundObject(this.equippedModel)
      this.equippedModel = undefined
    }
    const item = this.getEquippedItem()
    if (!item) return
    const itemId = item.id
    const visual = itemVisual(item)
    const boundCharacter = this.player.getObjectByName('__forge_bound_character')
    let target = boundCharacter ? findRuntimeItemSocket(boundCharacter, visual.equipped.socket) : undefined
    if (!target) {
      this.equippedModelAnchor.position.set(...fallbackSocketPosition(visual.equipped.socket))
      this.equippedModelAnchor.rotation.set(0, 0, 0)
      target = this.equippedModelAnchor
    }
    try {
      const model = await bindRuntimeItemModel(target, item, 'equipped')
      if (!model) return
      if (this.disposed || this.equippedWeaponId !== itemId) {
        model.parent?.remove(model)
        disposeBoundObject(model)
        return
      }
      this.equippedModel = model
    } catch {
      // Item models are optional and never block gameplay.
    }
  }

  private buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xc6d8c8, 0x202b22, 1.9))
    const sun = new THREE.DirectionalLight(0xffe3bd, 2.8)
    sun.position.set(-30, 42, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -80
    sun.shadow.camera.right = 80
    sun.shadow.camera.top = 80
    sun.shadow.camera.bottom = -80
    this.scene.add(sun)
  }

  private buildRegion() {
    if (this.region.version >= 2 && this.region.terrain) {
      this.scene.add(makeRuntimeBoundaryBackdrop(this.region))
      const ground = makeGeneratedTerrain(this.region)
      this.scene.add(ground)
      if (this.region.terrain.stream.length > 1) this.scene.add(makeGeneratedStream(this.region))
      for (const path of this.region.paths) this.scene.add(makeGeneratedPath(this.region, path))
      for (const crossing of this.region.crossings) this.scene.add(makeRuntimeCrossing(this.region, crossing))
      addGeneratedDressing(this.scene, this.region, this.obstacles)
      addGeneratedPois(this.scene, this.region, this.obstacles)
      return
    }

    const { bounds } = this.region
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.maxX - bounds.minX + 32, bounds.maxZ - bounds.minZ + 32),
      new THREE.MeshStandardMaterial({ color: biomeColor(this.region.biome), roughness: 0.98, metalness: 0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set((bounds.minX + bounds.maxX) / 2, -0.12, (bounds.minZ + bounds.maxZ) / 2)
    ground.receiveShadow = true
    this.scene.add(ground)
    for (const link of this.region.connections) {
      const from = this.region.nodes.find((node) => node.id === link.from)
      const to = this.region.nodes.find((node) => node.id === link.to)
      if (from && to) this.scene.add(makePath(from, to, link.kind === 'main' ? 5.8 : 3.5))
    }
    for (const node of this.region.nodes) addNodeDressing(this.scene, node, this.obstacles)
  }

  private buildPlayer(savedPlayer?: { x: number; z: number; health: number }) {
    this.playerPlaceholder.name = '__forge_placeholder'
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.6, 1.35, 12), new THREE.MeshStandardMaterial({ color: 0xb8c5ba, roughness: 0.62 }))
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
    const entry = this.region.nodes.find((node) => node.kind === 'entry') ?? this.region.nodes[0]
    const x = savedPlayer?.x ?? entry?.x ?? 0
    const z = savedPlayer?.z ?? entry?.z ?? 0
    const playerX = THREE.MathUtils.clamp(x, this.region.bounds.minX, this.region.bounds.maxX)
    const playerZ = THREE.MathUtils.clamp(z, this.region.bounds.minZ, this.region.bounds.maxZ)
    this.player.position.set(
      playerX,
      this.region.version >= 2 ? sampleTerrainHeight(this.region, playerX, playerZ) : 0,
      playerZ,
    )
    this.mouseWorld.set(this.player.position.x - 4, 0, this.player.position.z - 4)
    this.scene.add(this.player)
  }

  private buildEnemies() {
    const definition = this.gameplay.enemies[0]
    if (!definition) return
    const encounterNodes = this.region.nodes.filter((node) => node.kind === 'encounter')
    const densityLabel = encounterNodes[0]?.label.toLowerCase() ?? 'medium'
    const spawnCount = densityLabel.includes('high') ? 3 : densityLabel.includes('low') ? 1 : 2
    encounterNodes.forEach((node, encounterIndex) => {
      for (let index = 0; index < spawnCount; index += 1) {
        const id = `${this.region.regionId}:${node.id}:${definition.id}:${index}`
        this.totalEnemyCount += 1
        if (this.defeatedEnemyIds.has(id)) continue
        const angle = (index / Math.max(1, spawnCount)) * Math.PI * 2 + encounterIndex * 0.7
        const distance = 1.4 + index * 0.7
        this.spawnEnemy(id, definition, node.x + Math.cos(angle) * distance, node.z + Math.sin(angle) * distance)
      }
    })
  }

  private spawnEnemy(id: string, definition: ForgeEnemyDefinition, x: number, z: number) {
    const group = new THREE.Group()
    const placeholder = new THREE.Group()
    placeholder.name = '__forge_placeholder'
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.8, emissive: 0x000000 })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.66, 1.5, 10), bodyMaterial)
    body.position.y = 0.82
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8a7667, roughness: 0.9 }))
    head.position.y = 1.76
    head.castShadow = true
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.2), new THREE.MeshStandardMaterial({ color: 0x68665f, roughness: 0.7, metalness: 0.2 }))
    weapon.position.set(0.62, 1.0, -0.12)
    weapon.rotation.z = -0.38
    weapon.castShadow = true
    placeholder.add(body, head, weapon)
    const healthBack = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x251817 }))
    healthBack.position.set(0, 2.48, 0)
    const healthFill = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.055, 0.065), new THREE.MeshBasicMaterial({ color: 0xc9574f }))
    healthFill.position.set(0, 2.48, -0.035)
    const telegraph = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.45, definition.attackRange * 0.55), Math.max(0.55, definition.attackRange * 0.72), 32),
      new THREE.MeshBasicMaterial({ color: 0xe8644d, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }),
    )
    telegraph.rotation.x = -Math.PI / 2
    telegraph.position.y = 0.045
    telegraph.visible = false
    group.add(placeholder, healthBack, healthFill, telegraph)
    group.position.set(x, this.region.version >= 2 ? sampleTerrainHeight(this.region, x, z) : 0, z)
    this.scene.add(group)
    const enemy: RuntimeEnemy = {
      id,
      definition,
      group,
      bodyMaterial,
      healthFill,
      telegraph,
      health: definition.maxHealth,
      attackCooldown: 0,
      windupRemaining: 0,
      windupDuration: definition.attackWindup ?? 0.42,
      knockback: new THREE.Vector3(),
      path: [],
      pathIndex: 0,
      repathRemaining: 0,
      moving: false,
    }
    this.enemies.push(enemy)
    void this.bindEnemyVisual(enemy)
  }

  private async bindEnemyVisual(enemy: RuntimeEnemy) {
    try {
      const binding = await bindCharacterAsset(enemy.group, enemy.definition.characterAssetId, enemy.definition.animationAssetId, 1.95)
      if (this.disposed || !this.enemies.includes(enemy)) { binding?.dispose(); return }
      enemy.visual = binding
    } catch {
      // Keep the primitive fallback if a development asset is missing or invalid.
    }
  }

  private resize = () => {
    const rect = this.host.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTextInput(event.target)) return
    const key = event.key.toLowerCase()
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.keys.add(key)
      event.preventDefault()
      return
    }
    if (event.repeat) return
    if (key === 'q') {
      const ability = this.getSkillAbility()
      if (ability) this.performAbility(ability)
      event.preventDefault()
    } else if (event.code === 'Space') {
      this.startDodge()
      event.preventDefault()
    }
  }

  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())
  private onBlur = () => this.keys.clear()
  private onContextMenu = (event: MouseEvent) => event.preventDefault()

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.raycaster.ray.intersectPlane(this.floorPlane, this.mouseWorld)
    if (this.region.version >= 2) this.mouseWorld.y = sampleTerrainHeight(this.region, this.mouseWorld.x, this.mouseWorld.z)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const ability = this.getPrimaryAbility()
    if (ability) this.performAbility(ability)
    event.preventDefault()
  }

  private onWheel = (event: WheelEvent) => {
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + Math.sign(event.deltaY) * 2, 23, 43)
    event.preventDefault()
  }

  private animate = (now: number) => {
    if (this.disposed) return
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000))
    this.lastFrame = now
    this.hitStopRemaining = Math.max(0, this.hitStopRemaining - delta)
    const simulationDelta = this.hitStopRemaining > 0 ? 0 : delta
    this.updateCooldowns(delta)
    this.updatePlayer(simulationDelta)
    this.updateEnemies(simulationDelta)
    this.updateCorpses(delta)
    this.updateLoot(simulationDelta)
    this.updateEffects(delta)
    this.updateLibraryVfx(delta)
    this.updateTextEffects(delta)
    this.updateCamera(delta)
    this.updatePersistence(delta)
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  private updateCooldowns(delta: number) {
    for (const [id, value] of this.cooldowns) this.cooldowns.set(id, Math.max(0, value - delta))
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta)
    if (this.messageRemaining > 0) {
      this.messageRemaining -= delta
      if (this.messageRemaining <= 0) this.message = ''
    }
  }

  private updatePlayer(delta: number) {
    let moving = false
    if (this.dodgeRemaining > 0) {
      const speed = this.playerDefinition.dodgeDistance / DODGE_DURATION
      this.moveActor(this.player, this.dodgeDirection.clone().multiplyScalar(speed * delta), PLAYER_RADIUS)
      this.dodgeRemaining = Math.max(0, this.dodgeRemaining - delta)
      moving = true
    } else {
      const move = this.getMoveDirection()
      if (move.lengthSq() > 0) {
        this.moveActor(this.player, move.multiplyScalar(this.playerDefinition.moveSpeed * delta), PLAYER_RADIUS)
        moving = true
      }
    }
    const aim = this.mouseWorld.clone().sub(this.player.position)
    aim.y = 0
    if (aim.lengthSq() > 0.01) this.player.rotation.y = Math.atan2(aim.x, aim.z)
    if (moving !== this.playerMoving) {
      this.playerMoving = moving
      this.playerVisual?.play(moving ? 'move' : 'idle')
    }
    this.playerVisual?.update(delta)
  }

  private getMoveDirection() {
    this.camera.getWorldDirection(this.tempForward)
    this.tempForward.y = 0
    if (this.tempForward.lengthSq() < 0.001) this.tempForward.set(-1, 0, -1)
    this.tempForward.normalize()
    this.tempRight.set(-this.tempForward.z, 0, this.tempForward.x).normalize()
    const forwardInput = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)
    const rightInput = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
    this.tempMove.copy(this.tempForward).multiplyScalar(forwardInput).addScaledVector(this.tempRight, rightInput)
    if (this.tempMove.lengthSq() > 1) this.tempMove.normalize()
    return this.tempMove.clone()
  }

  private startDodge() {
    if (this.dodgeCooldown > 0 || this.dodgeRemaining > 0) return
    const direction = this.getMoveDirection()
    if (direction.lengthSq() < 0.01) {
      direction.copy(this.mouseWorld).sub(this.player.position).setY(0)
      if (direction.lengthSq() < 0.01) direction.set(0, 0, -1)
      direction.normalize()
    }
    this.dodgeDirection.copy(direction)
    this.dodgeRemaining = DODGE_DURATION
    this.dodgeCooldown = this.playerDefinition.dodgeCooldown
    this.playerVisual?.play('dodge', false)
    this.spawnPulse(this.player.position, '#8ebaa0', 2.2, 0.28)
    this.emitState()
  }

  private performAbility(ability: ForgeAbilityDefinition) {
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
      for (const enemy of [...this.enemies]) {
        const toEnemy = enemy.group.position.clone().sub(this.player.position).setY(0)
        const distance = toEnemy.length()
        if (distance > ability.range + ENEMY_RADIUS) continue
        const facing = distance > 0.001 ? toEnemy.normalize().dot(aim) : 1
        if (facing >= 0.1) this.damageEnemy(enemy, damage, aim, ability.color)
      }
    } else {
      const mouseDistance = this.mouseWorld.distanceTo(this.player.position)
      const targetDistance = Math.min(ability.range, mouseDistance)
      const target = this.player.position.clone().addScaledVector(aim, targetDistance)
      this.spawnPulse(target, ability.color, ability.radius, 0.55)
      void this.spawnBoundVfx(ability.vfxAssetId, target)
      for (const enemy of [...this.enemies]) {
        if (enemy.group.position.distanceTo(target) <= ability.radius + ENEMY_RADIUS) {
          const direction = enemy.group.position.clone().sub(target).setY(0)
          if (direction.lengthSq() > 0.001) direction.normalize(); else direction.copy(aim)
          this.damageEnemy(enemy, damage, direction, ability.color)
        }
      }
    }
    this.cooldowns.set(ability.id, ability.cooldown)
    this.emitState()
  }

  private damageEnemy(enemy: RuntimeEnemy, damage: number, direction: THREE.Vector3, color: string) {
    this.focusEnemyId = enemy.id
    enemy.health = Math.max(0, enemy.health - damage)
    const normalized = direction.clone().setY(0)
    if (normalized.lengthSq() > 0.001) normalized.normalize()
    enemy.knockback.addScaledVector(normalized, Math.min(5.5, 2.7 + damage * 0.025))
    enemy.windupRemaining = 0
    enemy.telegraph.visible = false
    enemy.visual?.play('hit', false)
    enemy.bodyMaterial.emissive.set(0xffffff)
    const ratio = Math.max(0.001, enemy.health / enemy.definition.maxHealth)
    enemy.healthFill.scale.x = ratio
    enemy.healthFill.position.x = -(1 - ratio) * 0.64
    this.spawnDamageNumber(enemy.group.position, damage, color)
    this.spawnPulse(enemy.group.position, color, 1.15, 0.18)
    void this.spawnBoundVfx(enemy.definition.hitVfxAssetId, enemy.group.position)
    this.hitStopRemaining = Math.max(this.hitStopRemaining, 0.035)
    this.cameraShake = Math.max(this.cameraShake, 0.22)
    if (enemy.health <= 0) this.killEnemy(enemy)
  }

  private killEnemy(enemy: RuntimeEnemy) {
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
    if (this.focusEnemyId === enemy.id) this.focusEnemyId = undefined
    this.defeatedEnemyIds.add(enemy.id)
    const position = enemy.group.position.clone()
    enemy.windupRemaining = 0
    enemy.telegraph.visible = false
    enemy.healthFill.visible = false
    enemy.group.children.forEach((child) => {
      if (child !== enemy.group.getObjectByName('__forge_bound_character') && child instanceof THREE.Mesh && child.position.y > 2.2) child.visible = false
    })
    enemy.visual?.play('death', false)
    this.corpses.push({ group: enemy.group, visual: enemy.visual, age: 0, duration: 1.15 })
    void this.spawnBoundVfx(enemy.definition.deathVfxAssetId, position)
    this.spawnPulse(position, '#b65e4c', 2.5, 0.45)
    this.rollLoot(enemy, position)
    this.setMessage(this.enemies.length === 0 ? 'Encounter cleared. Pick up the loot and equip it from the inventory.' : `${enemy.definition.name} defeated.`, 3.2)
    this.cameraShake = Math.max(this.cameraShake, 0.34)
    this.saveGame(false)
    this.emitState()
  }

  private updateCorpses(delta: number) {
    for (const corpse of [...this.corpses]) {
      corpse.age += delta
      corpse.visual?.update(delta)
      if (corpse.age < corpse.duration) continue
      const index = this.corpses.indexOf(corpse)
      if (index >= 0) this.corpses.splice(index, 1)
      this.scene.remove(corpse.group)
      corpse.visual?.dispose()
      this.disposeObject(corpse.group)
    }
  }

  private rollLoot(enemy: RuntimeEnemy, position: THREE.Vector3) {
    const table = this.gameplay.lootTables.find((candidate) => candidate.id === enemy.definition.lootTable)
    if (!table) return
    table.entries.forEach((entry, index) => {
      const roll = hashUnit(`${enemy.id}:${entry.itemId}:${index}`)
      if (roll > entry.chance) return
      const angle = hashUnit(`${enemy.id}:angle:${index}`) * Math.PI * 2
      this.spawnLoot({
        id: `${enemy.id}:drop:${index}`,
        itemId: entry.itemId,
        x: position.x + Math.cos(angle) * 0.8,
        z: position.z + Math.sin(angle) * 0.8,
      }, true)
    })
  }

  private spawnLoot(save: ForgeRuntimeLootSave, persist: boolean) {
    if (this.loot.some((drop) => drop.save.id === save.id)) return
    const item = this.gameplay.items.find((candidate) => candidate.id === save.itemId)
    if (!item) return
    const group = new THREE.Group()
    const glow = new THREE.PointLight(item.color, 1.2, 4)
    glow.position.y = 0.8
    const fallback = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({ color: item.color, emissive: item.color, emissiveIntensity: 0.45, roughness: 0.45, metalness: 0.15 }),
    )
    fallback.position.y = 0.55
    fallback.castShadow = true
    group.add(fallback, glow)
    group.position.set(save.x, this.region.version >= 2 ? sampleTerrainHeight(this.region, save.x, save.z) : 0, save.z)
    this.scene.add(group)
    const drop: RuntimeLoot = { save: { ...save }, group, fallback, age: 0 }
    this.loot.push(drop)
    void this.bindLootPresentation(drop, item)
    if (persist) this.saveGame(false)
  }

  private async bindLootPresentation(drop: RuntimeLoot, item: ForgeItemDefinition) {
    try {
      const model = await bindRuntimeItemModel(drop.group, item, 'drop')
      if (!model) return
      if (this.disposed || !this.loot.includes(drop)) {
        model.parent?.remove(model)
        disposeBoundObject(model)
        return
      }
      drop.model = model
      drop.fallback.visible = false
    } catch {
      // Keep the colored drop fallback when a Library model is unavailable.
    }
  }

  private updateEnemies(delta: number) {
    for (const enemy of [...this.enemies]) {
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta)
      enemy.repathRemaining = Math.max(0, enemy.repathRemaining - delta)
      enemy.bodyMaterial.emissive.lerp(new THREE.Color(0x000000), Math.min(1, delta * 22))
      enemy.visual?.update(delta)
      if (enemy.knockback.lengthSq() > 0.02) {
        this.moveActor(enemy.group, enemy.knockback.clone().multiplyScalar(delta), ENEMY_RADIUS)
        enemy.knockback.multiplyScalar(Math.max(0, 1 - delta * 8.5))
      }
      const distance = this.player.position.distanceTo(enemy.group.position)
      if (enemy.windupRemaining > 0) {
        enemy.moving = false
        enemy.windupRemaining = Math.max(0, enemy.windupRemaining - delta)
        const progress = 1 - enemy.windupRemaining / Math.max(0.01, enemy.windupDuration)
        enemy.telegraph.visible = true
        const material = enemy.telegraph.material as THREE.MeshBasicMaterial
        material.opacity = 0.18 + progress * 0.62
        enemy.telegraph.scale.setScalar(0.85 + progress * 0.2)
        if (enemy.windupRemaining <= 0) this.resolveEnemyAttack(enemy)
        continue
      }
      enemy.telegraph.visible = false
      if (distance > enemy.definition.aggroRange) { this.setEnemyMoving(enemy, false); continue }
      if (distance <= enemy.definition.attackRange && enemy.attackCooldown <= 0) { this.beginEnemyAttack(enemy); continue }
      if (distance > enemy.definition.attackRange) { this.setEnemyMoving(enemy, true); this.updateEnemyPath(enemy, delta) }
      else this.setEnemyMoving(enemy, false)
    }
  }

  private setEnemyMoving(enemy: RuntimeEnemy, moving: boolean) {
    if (enemy.moving === moving) return
    enemy.moving = moving
    enemy.visual?.play(moving ? 'move' : 'idle')
  }

  private updateEnemyPath(enemy: RuntimeEnemy, delta: number) {
    if (enemy.repathRemaining <= 0 || !enemy.path.length || enemy.pathIndex >= enemy.path.length) {
      enemy.path = this.navigation.findPath(enemy.group.position, this.player.position)
      enemy.pathIndex = 0
      enemy.repathRemaining = 0.28 + hashUnit(enemy.id) * 0.12
    }
    let target = enemy.path[enemy.pathIndex] ?? this.player.position
    if (enemy.group.position.distanceTo(target) < 0.7 && enemy.pathIndex < enemy.path.length - 1) {
      enemy.pathIndex += 1
      target = enemy.path[enemy.pathIndex] ?? this.player.position
    }
    const direction = target.clone().sub(enemy.group.position).setY(0)
    if (direction.lengthSq() < 0.001) return
    direction.normalize()
    direction.addScaledVector(this.enemySeparation(enemy), 0.7).normalize()
    this.moveActor(enemy.group, direction.multiplyScalar(enemy.definition.moveSpeed * delta), ENEMY_RADIUS)
    enemy.group.rotation.y = Math.atan2(direction.x, direction.z)
  }

  private enemySeparation(enemy: RuntimeEnemy) {
    const force = new THREE.Vector3()
    for (const other of this.enemies) {
      if (other === enemy) continue
      const away = enemy.group.position.clone().sub(other.group.position).setY(0)
      const distance = away.length()
      if (distance <= 0.001 || distance >= 1.8) continue
      force.addScaledVector(away.normalize(), (1.8 - distance) / 1.8)
    }
    return force
  }

  private beginEnemyAttack(enemy: RuntimeEnemy) {
    if (!this.focusEnemyId) this.focusEnemyId = enemy.id
    enemy.windupDuration = THREE.MathUtils.clamp(enemy.definition.attackWindup ?? 0.42, 0.12, 1.5)
    enemy.windupRemaining = enemy.windupDuration
    enemy.telegraph.visible = true
    enemy.visual?.play('attack', false)
    const toPlayer = this.player.position.clone().sub(enemy.group.position).setY(0)
    if (toPlayer.lengthSq() > 0.001) enemy.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z)
    void this.spawnBoundVfx(enemy.definition.attackVfxAssetId, enemy.group.position)
  }

  private resolveEnemyAttack(enemy: RuntimeEnemy) {
    enemy.telegraph.visible = false
    enemy.attackCooldown = enemy.definition.attackCooldown
    const distance = enemy.group.position.distanceTo(this.player.position)
    if (distance > enemy.definition.attackRange + 0.55) { this.spawnPulse(enemy.group.position, '#804a3c', 0.8, 0.15); return }
    if (this.dodgeRemaining > 0) { this.spawnPulse(this.player.position, '#88bca0', 1.1, 0.18); this.setMessage('Dodged.', 0.8); return }
    this.damagePlayer(enemy.definition.attackDamage, enemy.group.position)
  }

  private damagePlayer(damage: number, source: THREE.Vector3) {
    if (this.dodgeRemaining > 0) return
    this.playerHealth = Math.max(0, this.playerHealth - damage)
    this.playerVisual?.play('hit', false)
    this.spawnDamageNumber(this.player.position, damage, '#ff8272')
    this.spawnPulse(this.player.position, '#c84d43', 1.2, 0.2)
    const push = this.player.position.clone().sub(source).setY(0)
    if (push.lengthSq() > 0.001) this.moveActor(this.player, push.normalize().multiplyScalar(0.45), PLAYER_RADIUS)
    this.cameraShake = Math.max(this.cameraShake, 0.42)
    this.hitStopRemaining = Math.max(this.hitStopRemaining, 0.025)
    this.setMessage(`Hit for ${damage}. Dodge after the red wind-up begins.`, 1.6)
    if (this.playerHealth <= 0) this.respawnPlayer()
    this.emitState()
  }

  private respawnPlayer() {
    const entry = this.region.nodes.find((node) => node.kind === 'entry') ?? this.region.nodes[0]
    const respawnX = entry?.x ?? 0
    const respawnZ = entry?.z ?? 0
    this.player.position.set(respawnX, this.region.version >= 2 ? sampleTerrainHeight(this.region, respawnX, respawnZ) : 0, respawnZ)
    this.playerHealth = this.playerDefinition.maxHealth
    this.focusEnemyId = undefined
    this.setMessage('You fell in battle and returned to the region entry. Enemy progress is preserved.', 4)
    this.saveGame(false)
  }

  private updateLoot(delta: number) {
    for (const drop of [...this.loot]) {
      drop.age += delta
      drop.fallback.rotation.y += delta * 1.8
      drop.group.position.y = Math.sin(drop.age * 3.2) * 0.08
      if (drop.group.position.distanceTo(this.player.position) > 1.35) continue
      const item = this.gameplay.items.find((candidate) => candidate.id === drop.save.itemId)
      if (!item) continue
      this.inventory.push(drop.save.itemId)
      const index = this.loot.indexOf(drop)
      if (index >= 0) this.loot.splice(index, 1)
      this.scene.remove(drop.group)
      this.disposeObject(drop.group)
      this.setMessage(`${item.name} picked up. Click it in the inventory to equip.`, 3.2)
      this.saveGame(false)
      this.emitState()
    }
  }

  private updateEffects(delta: number) {
    for (const effect of [...this.effects]) {
      effect.age += delta
      const progress = Math.min(1, effect.age / effect.duration)
      effect.mesh.scale.setScalar(0.25 + progress * effect.maxScale)
      const material = effect.mesh.material as THREE.MeshBasicMaterial
      material.opacity = (1 - progress) * 0.72
      if (progress < 1) continue
      this.effects.splice(this.effects.indexOf(effect), 1)
      this.scene.remove(effect.mesh)
      effect.mesh.geometry.dispose()
      material.dispose()
    }
  }

  private updateLibraryVfx(delta: number) {
    for (const effect of [...this.libraryVfx]) {
      if (effect.update(delta)) continue
      effect.dispose()
      this.libraryVfx.splice(this.libraryVfx.indexOf(effect), 1)
    }
  }

  private updateTextEffects(delta: number) {
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
  }

  private updateCamera(delta: number) {
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
  }

  private snapCamera() {
    this.camera.position.copy(this.player.position).add(this.cameraOffset())
    this.camera.lookAt(this.player.position.x, 0.8, this.player.position.z)
  }

  private cameraOffset() { return new THREE.Vector3(this.cameraDistance * 0.58, this.cameraDistance * 0.74, this.cameraDistance * 0.58) }

  private moveActor(actor: THREE.Object3D, delta: THREE.Vector3, radius: number) {
    const next = actor.position.clone().add(delta)
    next.x = THREE.MathUtils.clamp(next.x, this.region.bounds.minX + radius, this.region.bounds.maxX - radius)
    next.z = THREE.MathUtils.clamp(next.z, this.region.bounds.minZ + radius, this.region.bounds.maxZ - radius)
    for (const obstacle of this.obstacles) {
      let dx = next.x - obstacle.x
      let dz = next.z - obstacle.z
      let distance = Math.hypot(dx, dz)
      const minimum = radius + obstacle.radius
      if (distance >= minimum) continue
      if (distance < 0.0001) { dx = 1; dz = 0; distance = 1 }
      next.x = obstacle.x + dx / distance * minimum
      next.z = obstacle.z + dz / distance * minimum
    }
    actor.position.x = next.x
    actor.position.z = next.z
    if (this.region.version >= 2) actor.position.y = sampleTerrainHeight(this.region, next.x, next.z)
  }

  private spawnPulse(position: THREE.Vector3, color: string, radius: number, duration: number) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(position.x, 0.055, position.z)
    this.scene.add(mesh)
    this.effects.push({ mesh, age: 0, duration, maxScale: Math.max(1, radius) })
  }

  private spawnDamageNumber(position: THREE.Vector3, damage: number, color: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 64
    const context = canvas.getContext('2d')
    if (!context) return
    context.font = '700 34px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineWidth = 7
    context.strokeStyle = '#100b09'
    context.strokeText(String(Math.round(damage)), 64, 32)
    context.fillStyle = color
    context.fillText(String(Math.round(damage)), 64, 32)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(position.x, 2.4, position.z)
    sprite.scale.set(2.1, 1.05, 1)
    this.scene.add(sprite)
    this.textEffects.push({ sprite, age: 0, duration: 0.68 })
  }

  private async spawnBoundVfx(assetId: string | undefined, position: THREE.Vector3) {
    try {
      const effect = await spawnLibraryVfx(this.scene, assetId, position.clone())
      if (!effect) return
      if (this.disposed) { effect.dispose(); return }
      this.libraryVfx.push(effect)
    } catch {
      // Built-in pulse remains the safe fallback for an invalid library reference.
    }
  }

  private getPrimaryAbility() { return this.gameplay.abilities.find((ability) => ability.id === this.playerDefinition.basicAbility) }
  private getSkillAbility() {
    const id = this.playerDefinition.activeAbilities[0]
    return this.gameplay.abilities.find((ability) => ability.id === id)
  }
  private getEquippedDamageBonus() { return this.getEquippedItem()?.damageBonus ?? 0 }
  private getEquippedItem(): ForgeItemDefinition | undefined { return this.gameplay.items.find((item) => item.id === this.equippedWeaponId) }

  private updatePersistence(delta: number) {
    this.autosaveElapsed += delta
    this.stateEmitElapsed += delta
    if (this.autosaveElapsed >= 5) { this.autosaveElapsed = 0; this.saveGame(false) }
    if (this.stateEmitElapsed >= 0.1) { this.stateEmitElapsed = 0; this.emitState() }
  }

  private setMessage(message: string, seconds: number) { this.message = message; this.messageRemaining = seconds }
  private emitState() { this.options.onState?.(this.makeSnapshot()) }

  private makeSnapshot(): ForgeRuntimeSnapshot {
    const primary = this.getPrimaryAbility()
    const skill = this.getSkillAbility()
    const focused = this.enemies.find((enemy) => enemy.id === this.focusEnemyId)
    return {
      health: this.playerHealth,
      maxHealth: this.playerDefinition.maxHealth,
      enemiesAlive: this.enemies.length,
      enemiesTotal: this.totalEnemyCount,
      primaryCooldown: primary ? this.cooldowns.get(primary.id) ?? 0 : 0,
      skillCooldown: skill ? this.cooldowns.get(skill.id) ?? 0 : 0,
      dodgeCooldown: this.dodgeCooldown,
      inventory: [...this.inventory],
      equippedWeaponId: this.equippedWeaponId,
      target: focused ? { id: focused.id, name: focused.definition.name, health: focused.health, maxHealth: focused.definition.maxHealth } : undefined,
      message: this.message,
      savedAt: this.savedAt,
    }
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    })
  }
}

function chooseAbilityClip(ability: ForgeAbilityDefinition, clips: THREE.AnimationClip[]) {
  const tokens = `${ability.id} ${ability.name}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
  return clips.find((clip) => tokens.some((token) => clip.name.toLowerCase().includes(token)))
    ?? clips.find((clip) => /attack|cast|slash|strike|swing|skill/i.test(clip.name))
    ?? clips[0]
}

function makeRuntimeBoundaryBackdrop(region: GeneratedRegion) {
  const width = region.bounds.maxX - region.bounds.minX
  const depth = region.bounds.maxZ - region.bounds.minZ
  const centerX = (region.bounds.minX + region.bounds.maxX) / 2
  const centerZ = (region.bounds.minZ + region.bounds.maxZ) / 2
  const palette = runtimeBiomePalette(region.biome)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 100, depth + 100),
    new THREE.MeshStandardMaterial({ color: palette.low, roughness: 1 }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(centerX, -1.5, centerZ)
  mesh.receiveShadow = true
  return mesh
}

function makeGeneratedTerrain(region: GeneratedRegion) {
  const { terrain, bounds } = region
  const resolution = terrain.resolution
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const palette = runtimeBiomePalette(region.biome)
  const surfacePalette = runtimeSurfacePalette(region.biome)
  const forestFloorColor = new THREE.Color(surfacePalette.forestFloor)
  const mossColor = new THREE.Color(surfacePalette.moss)
  const soilColor = new THREE.Color(surfacePalette.soil)
  const meadowColor = new THREE.Color(surfacePalette.meadow)
  const scrubColor = new THREE.Color(surfacePalette.scrub)
  const rockyColor = new THREE.Color(surfacePalette.rocky)
  const color = new THREE.Color()

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * (bounds.maxZ - bounds.minZ)
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * (bounds.maxX - bounds.minX)
      const height = terrain.heights[zIndex * resolution + xIndex] ?? 0
      positions.push(x, height, z)
      color.set(height > 2.4 ? palette.high : height < terrain.waterLevel + .45 ? palette.low : palette.ground)
      const surface = sampleTerrainSurface(region, x, z)
      color.lerp(forestFloorColor, surface.forestFloor * .27)
      color.lerp(mossColor, surface.moss * .22)
      color.lerp(meadowColor, surface.meadow * .31)
      color.lerp(scrubColor, surface.scrub * .2)
      color.lerp(rockyColor, surface.rocky * .29)
      color.lerp(soilColor, Math.max(surface.soil * .24, surface.poiWear * .68, surface.roadWear * .42))
      const variation = .96 + (surface.medium - .5) * .08 + (surface.fine - .5) * .06
      colors.push(color.r * variation, color.g * variation, color.b * variation)
    }
  }

  for (let z = 0; z < resolution - 1; z += 1) {
    for (let x = 0; x < resolution - 1; x += 1) {
      const a = z * resolution + x
      const b = a + 1
      const c = (z + 1) * resolution + x + 1
      const d = (z + 1) * resolution + x
      indices.push(a, d, b, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  mesh.receiveShadow = true
  return mesh
}

function makeGeneratedStream(region: GeneratedRegion) {
  const profile = streamRenderProfile(region)
  const points = profile.points
  const widths = profile.widths
  const heights = profile.heights

  const group = new THREE.Group()
  if (import.meta.env.DEV) {
    const issues = streamRenderContinuityIssues(region)
    if (issues.length) console.warn('[Play Region] River continuity', issues)
  }
  const banks = new THREE.Mesh(
    makeRuntimeRibbon(
      points,
      widths.map((width) => width * 1.72 + .55),
      (x, z) => sampleTerrainHeight(region, x, z) + .018,
    ),
    new THREE.MeshStandardMaterial({
      color: 0x354238,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  )
  banks.receiveShadow = true
  group.add(banks)

  const water = new THREE.Mesh(
    makeRuntimeProfileRibbon(
      points,
      widths,
      heights,
      (nominalHeight, x, z) => visibleStreamRenderHeight(region, nominalHeight, x, z),
    ),
    new THREE.MeshStandardMaterial({ color: 0x355f61, roughness: .28, transparent: true, opacity: .86, side: THREE.DoubleSide }),
  )
  water.receiveShadow = true
  group.add(water)
  return group
}

function makeGeneratedPath(region: GeneratedRegion, path: GeneratedWorldPath) {
  const widths = path.widths.length === path.points.length ? path.widths : path.points.map(() => path.width)
  const road = new THREE.Mesh(
    makeRuntimeRibbon(path.points, widths, (x, z) => sampleTerrainHeight(region, x, z) + (path.kind === 'main' ? .054 : .049)),
    new THREE.MeshStandardMaterial({
      color: path.kind === 'main' ? 0x594f3e : 0x41463a,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  road.receiveShadow = true
  return road
}

function makeRuntimeRibbon(
  points: Array<{ x: number; z: number }>,
  widths: number[],
  heightAt: (x: number, z: number) => number,
) {
  const sections = buildRuntimeRibbonSections(points, widths)
  const positions: number[] = []
  const indices: number[] = []

  sections.forEach((section, index) => {
    const lx = section.x + section.offsetX
    const lz = section.z + section.offsetZ
    const rx = section.x - section.offsetX
    const rz = section.z - section.offsetZ
    positions.push(lx, heightAt(lx, lz), lz, rx, heightAt(rx, rz), rz)

    if (index < sections.length - 1) {
      const a = index * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeRuntimeProfileRibbon(
  points: Array<{ x: number; z: number }>,
  widths: number[],
  heights: number[],
  heightAt: (nominalHeight: number, x: number, z: number) => number,
) {
  const sections = buildRuntimeRibbonSections(points, widths)
  const positions: number[] = []
  const indices: number[] = []

  sections.forEach((section, index) => {
    const nominalHeight = heights[section.sourceIndex] ?? heights[0] ?? 0
    const leftX = section.x + section.offsetX
    const leftZ = section.z + section.offsetZ
    const rightX = section.x - section.offsetX
    const rightZ = section.z - section.offsetZ
    positions.push(
      leftX, heightAt(nominalHeight, leftX, leftZ), leftZ,
      rightX, heightAt(nominalHeight, rightX, rightZ), rightZ,
    )

    if (index < sections.length - 1) {
      const a = index * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildRuntimeRibbonSections(
  points: Array<{ x: number; z: number }>,
  widths: number[],
) {
  const sections: Array<{
    x: number
    z: number
    offsetX: number
    offsetZ: number
    sourceIndex: number
  }> = []

  if (!points.length) return sections
  if (points.length === 1) {
    const half = (widths[0] ?? 1) / 2
    sections.push({ x: points[0].x, z: points[0].z, offsetX: half, offsetZ: 0, sourceIndex: 0 })
    return sections
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const half = Math.max(.04, (widths[index] ?? widths[0] ?? 1) / 2)

    if (index === 0 || index === points.length - 1) {
      const other = index === 0 ? points[1] : points[index - 1]
      const direction = index === 0
        ? normalizeRuntimeRibbon2(other.x - point.x, other.z - point.z)
        : normalizeRuntimeRibbon2(point.x - other.x, point.z - other.z)
      sections.push({
        x: point.x,
        z: point.z,
        offsetX: -direction.z * half,
        offsetZ: direction.x * half,
        sourceIndex: index,
      })
      continue
    }

    const previous = points[index - 1]
    const next = points[index + 1]
    const incomingLength = Math.max(.001, Math.hypot(point.x - previous.x, point.z - previous.z))
    const outgoingLength = Math.max(.001, Math.hypot(next.x - point.x, next.z - point.z))
    const incoming = normalizeRuntimeRibbon2(point.x - previous.x, point.z - previous.z)
    const outgoing = normalizeRuntimeRibbon2(next.x - point.x, next.z - point.z)
    const dot = THREE.MathUtils.clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1)
    const incomingNormal = { x: -incoming.z, z: incoming.x }
    const outgoingNormal = { x: -outgoing.z, z: outgoing.x }

    if (dot < .78) {
      const bevelDistance = Math.max(
        .08,
        Math.min(
          half * .72,
          incomingLength * .28,
          outgoingLength * .28,
        ),
      )
      const cornerHalf = dot < -.15 ? half * .78 : half

      sections.push({
        x: point.x - incoming.x * bevelDistance,
        z: point.z - incoming.z * bevelDistance,
        offsetX: incomingNormal.x * cornerHalf,
        offsetZ: incomingNormal.z * cornerHalf,
        sourceIndex: index,
      })
      sections.push({
        x: point.x + outgoing.x * bevelDistance,
        z: point.z + outgoing.z * bevelDistance,
        offsetX: outgoingNormal.x * cornerHalf,
        offsetZ: outgoingNormal.z * cornerHalf,
        sourceIndex: index,
      })
      continue
    }

    const miter = normalizeRuntimeRibbon2(
      incomingNormal.x + outgoingNormal.x,
      incomingNormal.z + outgoingNormal.z,
    )
    const denominator = Math.max(
      .58,
      Math.abs(miter.x * outgoingNormal.x + miter.z * outgoingNormal.z),
    )
    const scale = Math.min(
      half / denominator,
      half * 1.16,
      Math.min(incomingLength, outgoingLength) * .34,
    )

    sections.push({
      x: point.x,
      z: point.z,
      offsetX: miter.x * Math.max(half * .82, scale),
      offsetZ: miter.z * Math.max(half * .82, scale),
      sourceIndex: index,
    })
  }

  return sections
}

function normalizeRuntimeRibbon2(x: number, z: number) {
  const length = Math.max(.00001, Math.hypot(x, z))
  return { x: x / length, z: z / length }
}

function makeRuntimeCrossing(region: GeneratedRegion, crossing: GeneratedRegion['crossings'][number]) {
  const group = new THREE.Group()
  const streamY = sampleStreamHeight(region, crossing.x, crossing.z)
  const y = crossing.kind === 'bridge'
    ? Math.max(streamY + .3, sampleTerrainHeight(region, crossing.x, crossing.z) + .1)
    : streamY + .07
  group.position.set(crossing.x, y, crossing.z)
  group.rotation.y = -crossing.rotation

  if (crossing.kind === 'bridge') {
    const plankMaterial = new THREE.MeshStandardMaterial({ color: 0x67503a, roughness: .96 })
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x49382b, roughness: 1 })
    const bridgeWidth = crossing.width * .92
    const length = Math.max(4.2, crossing.width * 1.35)
    const plankCount = Math.max(6, Math.round(length / .5))
    for (let index = 0; index < plankCount; index += 1) {
      const x = -length / 2 + (index + .5) * (length / plankCount)
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(length / plankCount * .9, .11, bridgeWidth),
        plankMaterial,
      )
      plank.position.set(x, 0, 0)
      plank.castShadow = true
      group.add(plank)
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, .15, .12), railMaterial)
      rail.position.set(0, .3, side * bridgeWidth * .54)
      rail.castShadow = true
      group.add(rail)
    }
  } else {
    const material = new THREE.MeshStandardMaterial({ color: 0x74746a, roughness: 1 })
    for (let index = 0; index < 7; index += 1) {
      const t = index / 6 - .5
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.42 + (index % 2) * .08, 0), material)
      stone.position.set(t * crossing.width * 1.8, .06, Math.sin(index * 1.6) * .24)
      stone.scale.y = .5
      stone.rotation.y = index * .65
      group.add(stone)
    }
  }
  return group
}

function addGeneratedDressing(scene: THREE.Scene, region: GeneratedRegion, obstacles: CircleObstacle[]) {
  const palette = runtimeBiomePalette(region.biome)
  for (const item of region.dressing) {
    if (item.type === 'tree') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(.2 * item.scale, .32 * item.scale, 2.7 * item.scale, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a2b21, roughness: 1 }),
      )
      trunk.position.set(item.x, item.y + 1.3 * item.scale, item.z)
      trunk.rotation.y = item.rotation
      trunk.castShadow = true
      const crownGeometry = item.variant === 0
        ? new THREE.ConeGeometry(1.22 * item.scale, 4.05 * item.scale, 7)
        : item.variant === 1
          ? new THREE.ConeGeometry(1.45 * item.scale, 3.35 * item.scale, 8)
          : item.variant === 2
            ? new THREE.DodecahedronGeometry(1.3 * item.scale, 0)
            : new THREE.ConeGeometry(1.05 * item.scale, 4.35 * item.scale, 6)
      const crown = new THREE.Mesh(
        crownGeometry,
        new THREE.MeshStandardMaterial({ color: palette.tree, roughness: 1 }),
      )
      if (item.variant === 2) crown.scale.y = 1.35
      crown.position.set(item.x, item.y + (item.variant === 2 ? 3.55 : 3.75) * item.scale, item.z)
      crown.rotation.y = item.rotation
      crown.castShadow = true
      scene.add(trunk, crown)
      obstacles.push({ x: item.x, z: item.z, radius: .38 * item.scale })
    } else if (item.type === 'rock') {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(.62 * item.scale, 0),
        new THREE.MeshStandardMaterial({ color: palette.rock, roughness: 1 }),
      )
      rock.position.set(item.x, item.y + .3 * item.scale, item.z)
      rock.scale.y = .65
      rock.rotation.set(item.rotation * .12, item.rotation, item.rotation * .08)
      rock.castShadow = true
      scene.add(rock)
      obstacles.push({ x: item.x, z: item.z, radius: .45 * item.scale })
    } else if (item.type === 'fallen-log') {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(.22, .28, 2.2 * item.scale, 7),
        new THREE.MeshStandardMaterial({ color: 0x443227, roughness: 1 }),
      )
      log.rotation.set(Math.PI / 2, item.rotation, 0)
      log.position.set(item.x, item.y + .22, item.z)
      log.castShadow = true
      scene.add(log)
    } else if (item.type === 'stump') {
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(.34 * item.scale, .44 * item.scale, .58 * item.scale, 7),
        new THREE.MeshStandardMaterial({ color: 0x49362a, roughness: 1 }),
      )
      stump.position.set(item.x, item.y + .28 * item.scale, item.z)
      stump.castShadow = true
      scene.add(stump)
    } else if (item.type === 'fern') {
      const fern = new THREE.Mesh(
        new THREE.ConeGeometry(.28 * item.scale, .6 * item.scale, 5),
        new THREE.MeshStandardMaterial({ color: palette.fern, roughness: 1 }),
      )
      fern.position.set(item.x, item.y + .27 * item.scale, item.z)
      fern.rotation.y = item.rotation
      scene.add(fern)
    } else if (item.type === 'grass') {
      const grass = new THREE.Mesh(
        new THREE.ConeGeometry(.18 * item.scale, .58 * item.scale, 5),
        new THREE.MeshStandardMaterial({ color: 0x58704a, roughness: 1 }),
      )
      grass.position.set(item.x, item.y + .22 * item.scale, item.z)
      grass.rotation.y = item.rotation
      scene.add(grass)
    } else if (item.type === 'shrub') {
      const shrub = new THREE.Mesh(
        new THREE.DodecahedronGeometry(.45 * item.scale, 0),
        new THREE.MeshStandardMaterial({ color: 0x2f4c33, roughness: 1 }),
      )
      shrub.position.set(item.x, item.y + .34 * item.scale, item.z)
      shrub.scale.y = .72
      shrub.rotation.y = item.rotation
      shrub.castShadow = true
      scene.add(shrub)
    } else if (item.type === 'reeds') {
      const material = new THREE.MeshStandardMaterial({ color: 0x607453, roughness: 1 })
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = item.rotation + blade * 2.1
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(.03, .05, .95 * item.scale, 5), material)
        reed.position.set(
          item.x + Math.cos(angle) * (.1 + blade * .05),
          item.y + .42 * item.scale,
          item.z + Math.sin(angle) * (.1 + blade * .05),
        )
        reed.rotation.z = (blade - 1) * .05
        scene.add(reed)
      }
    }
  }
}

function addGeneratedPois(scene: THREE.Scene, region: GeneratedRegion, obstacles: CircleObstacle[]) {
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x62685f, roughness: 1 })
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x444943, roughness: 1 })
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5d5742, roughness: 1 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x513c2c, roughness: 1 })
  const green = new THREE.MeshStandardMaterial({ color: 0x2f4b34, roughness: 1 })

  for (const poi of region.pois) {
    const group = new THREE.Group()
    group.position.set(poi.x, sampleTerrainHeight(region, poi.x, poi.z), poi.z)
    group.rotation.y = poi.rotation

    if (poi.type === 'ruins') {
      runtimeBox(group, -3.15, .9, .4, .6, 1.8, 4.8, stoneMaterial)
      runtimeBox(group, 3, .65, -.9, .6, 1.3, 3.4, darkStone)
      runtimeBox(group, -1.75, .7, -2.65, 2.8, 1.4, .55, stoneMaterial)
      runtimeBox(group, 2.25, .38, 2.45, 2.7, .76, .6, darkStone)
      runtimeBox(group, -.95, 1.45, 2.8, .62, 2.9, .65, stoneMaterial)
      runtimeBox(group, 1.05, 1.15, 2.8, .62, 2.3, .65, stoneMaterial)
      runtimeBox(group, .05, 2.55, 2.8, 2.65, .5, .7, darkStone)
      obstacles.push({ x: poi.x, z: poi.z, radius: 3 })
    } else if (poi.type === 'camp' || poi.type === 'settlement') {
      const count = poi.type === 'settlement' ? 5 : 3
      for (let i = 0; i < count; i += 1) {
        const angle = i / count * Math.PI * 2 + .35
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.2, 4), cloth)
        const tentRadius = poi.type === 'settlement' ? 4.5 : 3.7
        tent.position.set(Math.cos(angle) * tentRadius, 1.05, Math.sin(angle) * tentRadius)
        tent.rotation.y = angle + Math.PI / 4
        tent.castShadow = true
        group.add(tent)
      }
      const fire = new THREE.Mesh(
        new THREE.CylinderGeometry(.5, .5, .1, 12),
        new THREE.MeshStandardMaterial({ color: 0x6a3823, emissive: 0xff7a2d, emissiveIntensity: .9 }),
      )
      fire.position.y = .09
      group.add(fire)
      for (let i = 0; i < 4; i += 1) {
        const angle = i / 4 * Math.PI * 2 + .45
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.15, .22, .28), wood)
        bench.position.set(Math.cos(angle) * 1.45, .22, Math.sin(angle) * 1.45)
        bench.rotation.y = -angle
        group.add(bench)
      }
      obstacles.push({ x: poi.x, z: poi.z, radius: poi.type === 'settlement' ? 4.5 : 3.7 })
    } else if (poi.type === 'watchtower') {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 2.25, 7, 8), stoneMaterial)
      tower.position.y = 3.35
      tower.castShadow = true
      group.add(tower)
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.05, .58, 8), darkStone)
      upper.position.y = 6.65
      group.add(upper)
      for (let i = 0; i < 8; i += 1) {
        if (i === 2 || i === 3) continue
        const angle = i / 8 * Math.PI * 2
        const battlement = new THREE.Mesh(new THREE.BoxGeometry(.7, .85, .7), darkStone)
        battlement.position.set(Math.cos(angle) * 1.78, 7.2, Math.sin(angle) * 1.78)
        battlement.rotation.y = -angle
        group.add(battlement)
      }
      const doorway = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 1.85),
        new THREE.MeshBasicMaterial({ color: 0x090b09, side: THREE.DoubleSide }),
      )
      doorway.position.set(0, .98, 2.18)
      group.add(doorway)
      runtimeBox(group, -2.8, .7, -1.6, .55, 1.4, 3.4, darkStone)
      obstacles.push({ x: poi.x, z: poi.z, radius: 2.2 })
    } else if (poi.type === 'dungeon') {
      runtimeBox(group, -1.7, 1.5, 0, .82, 3, .9, stoneMaterial)
      runtimeBox(group, 1.7, 1.5, 0, .82, 3, .9, stoneMaterial)
      runtimeBox(group, 0, 3.05, 0, 4.2, .72, .95, darkStone)
      runtimeBox(group, 0, .18, 1.6, 4.5, .36, 2.2, darkStone)
      const darkness = new THREE.Mesh(
        new THREE.PlaneGeometry(2.45, 2.55),
        new THREE.MeshBasicMaterial({ color: 0x080b09, side: THREE.DoubleSide }),
      )
      darkness.position.set(0, 1.28, .49)
      group.add(darkness)
      obstacles.push({ x: poi.x - 1.7, z: poi.z, radius: .8 })
      obstacles.push({ x: poi.x + 1.7, z: poi.z, radius: .8 })
    } else if (poi.type === 'shrine') {
      runtimeBox(group, 0, .18, .4, 3.4, .36, 3, darkStone)
      runtimeBox(group, 0, .5, .25, 2.5, .34, 2.2, stoneMaterial)
      runtimeBox(group, 0, 1.9, -.2, .72, 2.8, .62, stoneMaterial)
      runtimeBox(group, -1.3, 1.15, -.25, .45, 2.3, .45, darkStone)
      runtimeBox(group, 1.3, 1.15, -.25, .45, 2.3, .45, darkStone)
      runtimeBox(group, 0, 2.25, -.25, 3, .42, .48, darkStone)
    } else if (poi.type === 'standing-stones') {
      for (let i = 0; i < 7; i += 1) {
        const angle = i / 7 * Math.PI * 2
        const radius = i === 0 ? 0 : 3
        const height = i === 0 ? 3.8 : 2.4 + (i % 3) * .35
        const stone = new THREE.Mesh(
          new THREE.BoxGeometry(i === 0 ? .9 : .7, height, .65),
          i % 2 ? stoneMaterial : darkStone,
        )
        stone.position.set(Math.cos(angle) * radius, height * .5, Math.sin(angle) * radius)
        stone.rotation.set(0, angle * .23, (i % 3 - 1) * .055)
        group.add(stone)
      }
    } else if (poi.type === 'graveyard') {
      for (let i = 0; i < 12; i += 1) {
        runtimeBox(group, -2.25 + i % 4 * 1.5, .55, -1.8 + Math.floor(i / 4) * 1.75, .42, 1.1 + (i % 2) * .2, .2, stoneMaterial)
      }
      runtimeBox(group, -3.45, .5, 0, .12, 1, 6.4, wood)
      runtimeBox(group, 3.45, .5, 0, .12, 1, 6.4, wood)
      runtimeBox(group, 0, .5, -3.15, 6.8, 1, .12, wood)
      runtimeBox(group, -2.25, .5, 3.15, 2.2, 1, .12, wood)
      runtimeBox(group, 2.25, .5, 3.15, 2.2, 1, .12, wood)
    } else if (poi.type === 'beast-den') {
      const den = new THREE.Mesh(new THREE.TorusGeometry(2.35, .72, 8, 14, Math.PI), darkStone)
      den.rotation.x = Math.PI / 2
      den.position.y = 1.35
      den.castShadow = true
      group.add(den)
      runtimeBox(group, 0, .24, .75, 4.8, .48, 3.5, darkStone)
      const mouth = new THREE.Mesh(
        new THREE.PlaneGeometry(3.3, 2.35),
        new THREE.MeshBasicMaterial({ color: 0x070907, side: THREE.DoubleSide }),
      )
      mouth.position.set(0, 1.05, .62)
      group.add(mouth)
    }

    addRuntimePoiEnvironment(group, poi, stoneMaterial, darkStone, wood, green)

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    scene.add(group)
  }
}

function addRuntimePoiEnvironment(
  group: THREE.Group,
  poi: GeneratedRegion['pois'][number],
  stone: THREE.MeshStandardMaterial,
  darkStone: THREE.MeshStandardMaterial,
  wood: THREE.MeshStandardMaterial,
  green: THREE.MeshStandardMaterial,
) {
  const random = runtimeVisualRandom(poi.id)
  const addRock = (radius: number, scale = 1) => {
    const angle = random() * Math.PI * 2
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.28 + random() * .32, 0), random() > .45 ? stone : darkStone)
    mesh.position.set(Math.cos(angle) * radius, .16 + random() * .12, Math.sin(angle) * radius)
    mesh.scale.set(scale * (1 + random() * .35), scale * (.55 + random() * .3), scale)
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }
  const addShrub = (radius: number) => {
    const angle = random() * Math.PI * 2
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.42 + random() * .2, 0), green)
    mesh.position.set(Math.cos(angle) * radius, .35, Math.sin(angle) * radius)
    mesh.scale.y = .7
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }
  const addTimber = (radius: number) => {
    const angle = random() * Math.PI * 2
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 1.6 + random() * 1.4, 6), wood)
    mesh.rotation.z = Math.PI / 2
    mesh.rotation.y = random() * Math.PI
    mesh.position.set(Math.cos(angle) * radius, .16, Math.sin(angle) * radius)
    group.add(mesh)
  }

  if (poi.type === 'ruins' || poi.type === 'watchtower') {
    for (let i = 0; i < 12; i += 1) addRock(3 + random() * 3.2, .8 + random() * .55)
    for (let i = 0; i < 5; i += 1) addShrub(4 + random() * 2.7)
    for (let i = 0; i < 3; i += 1) addTimber(3.8 + random() * 2.2)
  } else if (poi.type === 'graveyard') {
    for (let i = -2; i <= 2; i += 1) {
      runtimeBox(group, i * 1.25, .28, -2.6, .09, .55, 1.05, wood)
    }
    for (let i = 0; i < 7; i += 1) addShrub(3.8 + random() * 2.5)
  } else if (poi.type === 'camp' || poi.type === 'settlement') {
    for (let i = 0; i < (poi.type === 'settlement' ? 7 : 5); i += 1) addTimber(3.1 + random() * 2.8)
    for (let i = 0; i < (poi.type === 'settlement' ? 5 : 4); i += 1) {
      const angle = random() * Math.PI * 2
      const crate = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .6), wood)
      crate.position.set(Math.cos(angle) * (3 + random() * 2.5), .32, Math.sin(angle) * (3 + random() * 2.5))
      crate.rotation.y = random() * Math.PI
      group.add(crate)
    }
  } else if (poi.type === 'shrine' || poi.type === 'standing-stones') {
    for (let i = 0; i < 10; i += 1) addRock(3.1 + random() * 2, .65 + random() * .32)
    for (let i = 0; i < 5; i += 1) addShrub(3.8 + random() * 2.1)
  } else if (poi.type === 'beast-den') {
    for (let i = 0; i < 7; i += 1) addRock(2.2 + random() * 2.1, .8 + random() * .4)
    for (let i = 0; i < 3; i += 1) addTimber(2.5 + random() * 2)
  } else if (poi.type === 'dungeon') {
    for (let i = 0; i < 7; i += 1) addRock(2.8 + random() * 2.1, .75 + random() * .45)
    for (let i = 0; i < 2; i += 1) addShrub(3.8 + random() * 1.5)
  }
}

function runtimeVisualRandom(value: string) {
  let state = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    state ^= value.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let result = Math.imul(state ^ state >>> 15, 1 | state)
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result
    return ((result ^ result >>> 14) >>> 0) / 4294967296
  }
}

function runtimeBox(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  group.add(mesh)
}

function runtimeBiomePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { ground: 0x584b32, low: 0x3d4932, high: 0x6d6245, tree: 0x694b2a, fern: 0x555e32, rock: 0x66635a }
  if (value.includes('highland')) return { ground: 0x46513d, low: 0x37463a, high: 0x6c7062, tree: 0x31452f, fern: 0x485b3a, rock: 0x73786d }
  if (value.includes('marsh')) return { ground: 0x303c30, low: 0x273b35, high: 0x465044, tree: 0x26372d, fern: 0x35533b, rock: 0x565f56 }
  if (value.includes('corrupt')) return { ground: 0x3a303b, low: 0x30293a, high: 0x544457, tree: 0x342d3b, fern: 0x47364d, rock: 0x625665 }
  if (value.includes('farmland')) return { ground: 0x5b5539, low: 0x48543b, high: 0x6c684d, tree: 0x405134, fern: 0x53603a, rock: 0x6c6b5e }
  return { ground: 0x2d4631, low: 0x263c2e, high: 0x53604a, tree: 0x203b28, fern: 0x31583a, rock: 0x596159 }
}

function runtimeSurfacePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { forestFloor: 0x473d2c, moss: 0x62613a, soil: 0x6a5538, meadow: 0x6b6840, scrub: 0x564b31, rocky: 0x6e6759 }
  if (value.includes('highland')) return { forestFloor: 0x3f4939, moss: 0x59654a, soil: 0x625a47, meadow: 0x596849, scrub: 0x4b563f, rocky: 0x73786d }
  if (value.includes('marsh')) return { forestFloor: 0x26372e, moss: 0x3f5a43, soil: 0x4a4938, meadow: 0x496047, scrub: 0x31493a, rocky: 0x5a6259 }
  if (value.includes('corrupt')) return { forestFloor: 0x322b37, moss: 0x4b3b50, soil: 0x57464f, meadow: 0x57475a, scrub: 0x403344, rocky: 0x6a5e6d }
  if (value.includes('farmland')) return { forestFloor: 0x4b4c34, moss: 0x5a653e, soil: 0x6c5a3c, meadow: 0x727047, scrub: 0x5c5838, rocky: 0x6e6d61 }
  return { forestFloor: 0x253a29, moss: 0x3c5738, soil: 0x5d523d, meadow: 0x506447, scrub: 0x344a35, rocky: 0x62685f }
}

function makePath(from: GeneratedRegionNode, to: GeneratedRegionNode, width: number) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.max(0.1, Math.hypot(dx, dz))
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, width), new THREE.MeshStandardMaterial({ color: 0x4c4030, roughness: 1 }))
  mesh.position.set((from.x + to.x) / 2, -0.02, (from.z + to.z) / 2)
  mesh.rotation.y = -Math.atan2(dz, dx)
  mesh.receiveShadow = true
  return mesh
}

function addNodeDressing(scene: THREE.Scene, node: GeneratedRegionNode, obstacles: CircleObstacle[]) {
  if (node.kind === 'landmark') {
    const landmark = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.7, 5.8, 8), new THREE.MeshStandardMaterial({ color: 0x6d7067, roughness: 0.94 }))
    landmark.position.set(node.x, 2.8, node.z)
    landmark.castShadow = true
    scene.add(landmark)
    obstacles.push({ x: node.x, z: node.z, radius: 1.55 })
    return
  }
  if (node.kind === 'encounter') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 32), new THREE.MeshBasicMaterial({ color: 0x7d3028, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(node.x, 0.03, node.z)
    scene.add(ring)
    return
  }
  const count = node.kind === 'entry' || node.kind === 'exit' ? 5 : 3
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + node.x * 0.07
    const distance = node.radius * 0.72
    const x = node.x + Math.cos(angle) * distance
    const z = node.z + Math.sin(angle) * distance
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 3.2, 7), new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 1 }))
    trunk.position.set(x, 1.5, z)
    trunk.castShadow = true
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.8, 8), new THREE.MeshStandardMaterial({ color: 0x243c2c, roughness: 1 }))
    crown.position.set(x, 4.2, z)
    crown.castShadow = true
    scene.add(trunk, crown)
    obstacles.push({ x, z, radius: 0.48 })
  }
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.isContentEditable)
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0) / 4294967295
}

function biomeColor(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('swamp') || value.includes('drowned')) return 0x263128
  if (value.includes('coast') || value.includes('ashen')) return 0x37362f
  if (value.includes('verdant')) return 0x263d2b
  return 0x2e342b
}
