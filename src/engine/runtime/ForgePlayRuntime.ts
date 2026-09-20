import { forestPathMaterial, forestWaterMaterial } from '../forestAtmosphere'
import { forestRock, forestLog, forestGrass, forestFern, forestFloorMaterial, forestDeadTree, forestSpeciesCrown, forestTrunk } from '../forestGeometry'
import * as THREE from 'three'
import type {
  ForgeAbilityDefinition,
  ForgeEnemyDefinition,
  ForgeGameplayContent,
  ForgeItemDefinition,
  ForgePlayerDefinition,
} from '../forgeProject'
import { itemVisual } from '../itemPresentation'
import { sampleStreamHeight, sampleTerrainHeight, sampleTerrainSurface, streamRenderContinuityIssues, streamWaterSurfaceRows, worldBoundaryBackdropHeight, type GeneratedRegion, type GeneratedRegionNode, type GeneratedWorldPath } from '../guidedWorld'
import {
  bindCharacterAsset,
  disposeBoundObject,
  ForgeCharacterVisualBinding,
  ForgeLibraryVfxInstance,
  loadLibraryAnimationClips,
  preloadLibraryVfx,
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
import {
  buildWorldAmbientVisuals,
  updateWorldAmbientVisuals,
  type WorldAmbientVisuals,
} from '../worldAmbient'
import {
  FORGE_WORLD_SCALE,
  forgeBridgeDimensions,
  forgePoiClearsDressing,
  forgePoiPresentationRotation,
  forgePoiVisualScale,
  forgeTreePresentationScale,
} from '../worldScale'
import {
  DEFAULT_WORLD_ENVIRONMENT,
  advanceWorldHour,
  applyWorldEnvironmentToScene,
  createWorldWeatherVisuals,
  markWorldWindMaterial,
  resetWorldEnvironmentSceneCache,
  sampleWorldEnvironment,
  updateWorldWeatherVisuals,
  type WorldWeather,
  type WorldWeatherVisuals,
} from '../worldEnvironment'
import {
  authoredPoiRuntimeObstacleRadius,
  buildPoiPrefabVisual,
  collectPoiGameplaySockets,
  loadAuthoredPoiSettings,
  resolvePoiPrefab,
} from '../poiPrefabWorld'
import {
  buildGameplaySocketMarker,
  isRuntimeInteractableSocket,
  socketActionLabel,
  socketPrompt,
  type GameplaySocket,
} from '../gameplaySockets'
import { loadPoiPrefabs } from '../../lib/poiPrefab'
import { loadPropPrefabs } from '../../lib/propPrefab'
import { rollLootTable } from '../lootForge'
import { grantForgeRewardTotals } from './ForgeRewardPickupRuntime'
import {
  ForgeChainLightningEffect,
  normalizeChainConfig,
  resolveForgeChainTargets,
} from './ForgeChainLightningRuntime'
import {
  FORGE_GAMEPLAY_FEEL,
  forgeAbilityActionCooldown,
  forgeAbilityTiming,
  forgeAttackMovementMultiplier,
  forgeCanDodgeCancelAction,
  forgeExpAlpha,
  forgeMeleeComboProfile,
  forgeMovementResponse,
  forgeWheelDistanceTarget,
  type ForgePlayerActionPhase,
} from './ForgeGameplayFeel'

export type ForgeRuntimeTargetSnapshot = {
  id: string
  name: string
  health: number
  maxHealth: number
}

export type ForgeRuntimeInteractionSnapshot = {
  id: string
  name: string
  kind: GameplaySocket['kind']
  action: string
  prompt: string
  trigger: 'tap' | 'hold'
  progress: number
  holdSeconds: number
  locked: boolean
  lockedText?: string
  sourceName: string
}

export type ForgeRuntimeInteractionEvent = {
  id: string
  socket: GameplaySocket
  sourceName: string
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
  interaction?: ForgeRuntimeInteractionSnapshot
  message: string
  savedAt?: string
  animation?: {
    runtime: string
    base: string
    baseClip?: string
    action?: string
    actionClip?: string
    available: string[]
  }
}

export type ForgePlayRuntimeOptions = {
  projectId: string
  onState?: (state: ForgeRuntimeSnapshot) => void
  onInteraction?: (event: ForgeRuntimeInteractionEvent) => void
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
  staggerRemaining: number
  recoveryRemaining: number
  knockback: THREE.Vector3
  path: THREE.Vector3[]
  pathIndex: number
  repathRemaining: number
  visual?: ForgeCharacterVisualBinding
  moving: boolean
  spawnX: number
  spawnZ: number
  transient: boolean
  respawn: boolean
  respawnSeconds: number
  visualAccumulator: number
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

type RuntimeInteraction = {
  id: string
  socket: GameplaySocket
  anchor: THREE.Group
  sourceName: string
  radiusScale: number
  cooldownRemaining: number
  activationCount: number
  used: boolean
}

type RuntimeEffect = { mesh: THREE.Mesh; age: number; duration: number; maxScale: number }
type RuntimeTextEffect = { sprite: THREE.Sprite; age: number; duration: number }
type RuntimePlayerAction = {
  ability: ForgeAbilityDefinition
  aim: THREE.Vector3
  phase: ForgePlayerActionPhase
  remaining: number
  activeDuration: number
  recoveryDuration: number
  comboStep: number
  impacted: boolean
}

const PLAYER_RADIUS = 0.58
const ENEMY_RADIUS = 0.62
const DODGE_DURATION = FORGE_GAMEPLAY_FEEL.dodgeDuration

function chainLightningTravelDuration(distance: number) {
  return THREE.MathUtils.clamp(
    .045 + Math.max(0, distance) * .012,
    .055,
    .125,
  )
}

export class ForgePlayRuntime {
  private readonly host: HTMLElement
  private readonly region: GeneratedRegion
  private readonly gameplay: ForgeGameplayContent
  private readonly options: ForgePlayRuntimeOptions
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FORGE_WORLD_SCALE.playCameraFov, 1, 0.1, 800)
  private readonly player = new THREE.Group()
  private readonly playerPlaceholder = new THREE.Group()
  private readonly equippedModelAnchor = new THREE.Group()
  private readonly keys = new Set<string>()
  private readonly mouseWorld = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly obstacles: CircleObstacle[] = []
  private readonly cameraOccluders: THREE.Group[] = []
  private readonly enemies: RuntimeEnemy[] = []
  private readonly loot: RuntimeLoot[] = []
  private readonly corpses: RuntimeCorpse[] = []
  private readonly effects: RuntimeEffect[] = []
  private readonly libraryVfx: ForgeLibraryVfxInstance[] = []
  private readonly chainLightningEffects: ForgeChainLightningEffect[] = []
  private readonly textEffects: RuntimeTextEffect[] = []
  private readonly defeatedEnemyIds = new Set<string>()
  private readonly usedInteractionIds = new Set<string>()
  private readonly interactions: RuntimeInteraction[] = []
  private readonly cooldowns = new Map<string, number>()
  private readonly respawnTimers = new Set<number>()
  private readonly pulseGeometry = new THREE.RingGeometry(0.6, 1, 32)
  private readonly damageTextureCache = new Map<string, THREE.CanvasTexture>()
  private readonly abilityAnimationClipNames = new Map<string, string>()
  private readonly playerDefinition: ForgePlayerDefinition
  private readonly saveKey: string
  private readonly resizeObserver: ResizeObserver
  private readonly dodgeDirection = new THREE.Vector3()
  private readonly playerVelocity = new THREE.Vector3()
  private readonly cameraFocus = new THREE.Vector3()
  private readonly tempMove = new THREE.Vector3()
  private readonly tempForward = new THREE.Vector3()
  private readonly tempRight = new THREE.Vector3()
  private readonly tempAim = new THREE.Vector3()
  private readonly tempCamera = new THREE.Vector3()
  private readonly tempCameraFocus = new THREE.Vector3()
  private readonly tempActorNext = new THREE.Vector3()
  private readonly tempEnemyDirection = new THREE.Vector3()
  private readonly tempEnemySeparation = new THREE.Vector3()
  private navigation!: ForgeNavigationGrid
  private playerVisual?: ForgeCharacterVisualBinding
  private ambientVisuals?: WorldAmbientVisuals
  private weatherVisuals?: WorldWeatherVisuals
  private environmentHour = DEFAULT_WORLD_ENVIRONMENT.hour
  private environmentWeather: WorldWeather = DEFAULT_WORLD_ENVIRONMENT.weather
  private environmentPaused = DEFAULT_WORLD_ENVIRONMENT.paused
  private environmentSpeed = DEFAULT_WORLD_ENVIRONMENT.speed
  private environmentElapsed = 0
  private equippedModel?: THREE.Object3D
  private inventory: string[] = []
  private equippedWeaponId: string | undefined
  private focusEnemyId: string | undefined
  private cameraDistance: number = FORGE_WORLD_SCALE.playCameraDistance
  private cameraDistanceTarget: number = FORGE_WORLD_SCALE.playCameraDistance
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
  private chainCastSequence = 0
  private pointerTracked = false
  private testPackSequence = 0
  private playerMoving = false
  private playerAction: RuntimePlayerAction | undefined
  private bufferedAbility: ForgeAbilityDefinition | undefined
  private bufferedAbilityRemaining = 0
  private primaryHeld = false
  private meleeComboStep = -1
  private meleeComboResetRemaining = 0
  private activeInteractionId: string | undefined
  private interactionHeld = false
  private interactionHoldProgress = 0
  private pendingSaveTimer: number | undefined

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
      save.usedInteractionIds?.forEach((id) => this.usedInteractionIds.add(id))
      this.playerHealth = THREE.MathUtils.clamp(save.player.health, 1, this.playerDefinition.maxHealth)
      this.savedAt = save.savedAt
    } else {
      this.inventory = [...this.playerDefinition.startingItems]
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    const moodStyle = runtimeMoodStyle(this.region.mood)
    this.renderer.toneMappingExposure = moodStyle.exposure
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'skillbound-runtime-canvas'
    this.host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(moodStyle.background)
    this.scene.fog = new THREE.FogExp2(moodStyle.fog, moodStyle.fogDensity)
    this.buildLighting()
    this.buildRegion()
    this.interactions.forEach((interaction) => {
      interaction.used = this.usedInteractionIds.has(interaction.id)
      interaction.anchor.visible = false
    })
    this.navigation = new ForgeNavigationGrid(this.region.bounds, this.obstacles)
    this.buildPlayer(save?.player)
    this.buildEnemies()
    save?.lootDrops.forEach((drop) => this.spawnLoot(drop, false))
    void preloadLibraryVfx([
      ...this.gameplay.abilities.map(
        (ability) => ability.vfxAssetId,
      ),
      ...this.gameplay.enemies.flatMap(
        (enemy) => [
          enemy.attackVfxAssetId,
          enemy.hitVfxAssetId,
          enemy.deathVfxAssetId,
        ],
      ),
    ]).catch(() => undefined)
    void this.bindPlayerVisual()
    void this.refreshEquippedModel()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.host)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerUp)
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerUp)
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false })
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)
    this.resize()
    this.snapCamera()
    this.emitState()
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  dispose() {
    if (this.disposed) return
    if (this.pendingSaveTimer !== undefined) {
      window.clearTimeout(this.pendingSaveTimer)
      this.pendingSaveTimer = undefined
    }
    if (!this.skipFinalSave) this.writeRuntimeSaveNow(false)
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerUp)
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerUp)
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
    this.chainLightningEffects.forEach((effect) => effect.dispose())
    this.chainLightningEffects.length = 0
    this.respawnTimers.forEach((timer) => window.clearTimeout(timer))
    this.respawnTimers.clear()
    this.scene.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) &&
        !(object instanceof THREE.Sprite) &&
        !(object instanceof THREE.Points)
      ) {
        return
      }
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose()
      }
      const material = object.material
      const materials = Array.isArray(material) ? material : [material]
      materials.forEach((entry) => {
        if (entry instanceof THREE.SpriteMaterial) entry.map?.dispose()
        entry.dispose()
      })
    })
    this.damageTextureCache.forEach((texture) => texture.dispose())
    this.damageTextureCache.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getSnapshot(): ForgeRuntimeSnapshot { return this.makeSnapshot() }

  interact() {
    const interaction = this.getActiveInteraction()
    if (!interaction) return false
    this.triggerInteraction(interaction)
    return true
  }

  spawnTestPack(count = 8) {
    const definition = this.gameplay.enemies[0]
    if (!definition || this.disposed) return 0

    const amount = THREE.MathUtils.clamp(
      Math.round(count),
      1,
      20,
    )
    const sequence = ++this.testPackSequence
    const spacing = Math.max(
      1.35,
      this.region.encounters?.minSpacing ?? 1.65,
    )

    for (let index = 0; index < amount; index += 1) {
      const angle =
        sequence * .83 +
        index * 2.399963229728653
      const radius =
        3.4 +
        Math.sqrt(index) * spacing
      const x = THREE.MathUtils.clamp(
        this.player.position.x + Math.cos(angle) * radius,
        this.region.bounds.minX + 1.5,
        this.region.bounds.maxX - 1.5,
      )
      const z = THREE.MathUtils.clamp(
        this.player.position.z + Math.sin(angle) * radius,
        this.region.bounds.minZ + 1.5,
        this.region.bounds.maxZ - 1.5,
      )
      const id =
        `test-pack:${this.region.seed}:${sequence}:${index}`
      this.spawnEnemy(
        id,
        definition,
        x,
        z,
        {
          transient: true,
          respawn: false,
        },
      )
    }

    this.totalEnemyCount = Math.max(
      this.totalEnemyCount,
      this.enemies.length,
    )
    this.setMessage(
      `Spawned ${amount} test enemies near the player.`,
      2.2,
    )
    this.emitState()
    return amount
  }

  saveGame(manual = true) {
    if (!manual) {
      this.queueRuntimeSave()
      return
    }
    this.writeRuntimeSaveNow(true)
  }

  private queueRuntimeSave() {
    if (this.pendingSaveTimer !== undefined || this.disposed) return
    this.pendingSaveTimer = window.setTimeout(() => {
      this.pendingSaveTimer = undefined
      if (!this.disposed) this.writeRuntimeSaveNow(false)
    }, 320)
  }

  private writeRuntimeSaveNow(manual: boolean) {
    const savedAt = new Date().toISOString()
    writeRuntimeSave(this.saveKey, {
      format: 'forge-runtime-save',
      version: 1,
      projectId: this.options.projectId,
      regionId: this.region.regionId,
      worldSeed: this.region.seed,
      generationVersion: this.region.generationVersion,
      player: {
        x: this.player.position.x,
        z: this.player.position.z,
        health: this.playerHealth,
      },
      inventory: [...this.inventory],
      equippedWeaponId: this.equippedWeaponId,
      defeatedEnemyIds: [...this.defeatedEnemyIds],
      usedInteractionIds: [...this.usedInteractionIds],
      lootDrops: this.loot.map((drop) => ({ ...drop.save })),
      savedAt,
    })
    this.savedAt = savedAt
    if (manual) {
      this.setMessage(
        'Game saved. Reloading this seed will restore the same combat state.',
        3.2,
      )
      this.emitState()
    }
  }

  resetProgress() {
    this.skipFinalSave = true
    clearRuntimeSave(this.saveKey)
  }

  setEnvironmentHour(hour: number) {
    const wrapped = hour % 24
    this.environmentHour = wrapped < 0 ? wrapped + 24 : wrapped
  }

  setEnvironmentWeather(weather: WorldWeather) {
    this.environmentWeather = weather
  }

  setEnvironmentPaused(paused: boolean) {
    this.environmentPaused = paused
  }

  setEnvironmentSpeed(speed: number) {
    this.environmentSpeed = THREE.MathUtils.clamp(speed, .25, 16)
  }

  getEnvironmentState() {
    return {
      hour: this.environmentHour,
      weather: this.environmentWeather,
      paused: this.environmentPaused,
      speed: this.environmentSpeed,
    }
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
      const binding = await bindCharacterAsset(this.player, this.playerDefinition.characterAssetId, this.playerDefinition.animationAssetId, FORGE_WORLD_SCALE.characterHeight)
      if (this.disposed) { binding?.dispose(); return }
      this.playerVisual = binding
      if (binding && !binding.getAnimationRuntimeV3()) {
        await this.preloadAbilityAnimations(binding)
      }
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
    const moodStyle = runtimeMoodStyle(this.region.mood)
    const hemisphere = new THREE.HemisphereLight(
      moodStyle.hemisphereSky,
      moodStyle.hemisphereGround,
      moodStyle.hemisphere,
    )
    hemisphere.name = 'WorldMoodHemisphere'
    this.scene.add(hemisphere)

    const sun = new THREE.DirectionalLight(
      moodStyle.sunColor,
      moodStyle.sun,
    )
    sun.name = 'WorldMoodSun'
    sun.position.set(-30, 42, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -80
    sun.shadow.camera.right = 80
    sun.shadow.camera.top = 80
    sun.shadow.camera.bottom = -80
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(
      moodStyle.fillColor,
      moodStyle.fill,
    )
    fill.name = 'WorldMoodFill'
    fill.position.set(46, 28, -52)
    this.scene.add(fill)
  }

  private buildRegion() {
    if (this.region.version >= 2 && this.region.terrain) {
      this.scene.add(makeRuntimeBoundaryBackdrop(this.region))
      const ground = makeGeneratedTerrain(this.region)
      this.scene.add(ground)
      if (this.region.terrain.stream.length > 1) this.scene.add(makeGeneratedStream(this.region))
      for (const path of this.region.paths) this.scene.add(makeGeneratedPath(this.region, path))
      for (const crossing of this.region.crossings) this.scene.add(makeRuntimeCrossing(this.region, crossing))
      appendRuntimeRiverObstacles(this.region, this.obstacles)
      addGeneratedDressing(
        this.scene,
        this.region,
        this.obstacles,
        this.cameraOccluders,
      )
      this.interactions.push(
        ...addGeneratedPois(
          this.scene,
          this.region,
          this.obstacles,
        ),
      )
      this.ambientVisuals = buildWorldAmbientVisuals(this.region)
      this.scene.add(this.ambientVisuals.group)
      this.weatherVisuals = createWorldWeatherVisuals(this.region)
      this.scene.add(this.weatherVisuals.group)
      resetWorldEnvironmentSceneCache(this.scene)
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
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.18, 12), new THREE.MeshStandardMaterial({ color: 0xb8c5ba, roughness: 0.62 }))
    body.position.y = 0.62
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd4b59a, roughness: 0.7 }))
    head.position.y = 1.51
    head.castShadow = true
    const facing = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.54, 8), new THREE.MeshStandardMaterial({ color: 0x7ea58b, roughness: 0.55 }))
    facing.rotation.x = Math.PI / 2
    facing.position.set(0, 0.92, -0.62)
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
      this.region.version >= 2 ? runtimeWalkSurfaceHeight(this.region, playerX, playerZ) : 0,
      playerZ,
    )
    this.mouseWorld.set(this.player.position.x - 4, 0, this.player.position.z - 4)
    this.scene.add(this.player)
  }

  private buildEnemies() {
    const definition = this.gameplay.enemies[0]
    if (!definition) return

    const encounterNodes = this.region.nodes.filter(
      (node) => node.kind === 'encounter',
    )
    const settings = this.region.encounters ?? {
      density: 'medium',
      groupRange: [4, 6] as [number, number],
      minSpacing: 1.65,
      respawn: false,
      respawnSeconds: 30,
    }

    encounterNodes.forEach((node, encounterIndex) => {
      const [minCount, maxCount] = settings.groupRange
      const range = Math.max(0, maxCount - minCount)
      const spawnCount =
        minCount +
        Math.floor(
          hashUnit(
            `${this.region.seed}:${node.id}:group-size`,
          ) *
            (range + 1),
        )

      for (let index = 0; index < spawnCount; index += 1) {
        const id =
          `${this.region.regionId}:${node.id}:${definition.id}:${index}`
        this.totalEnemyCount += 1

        if (
          !settings.respawn &&
          this.defeatedEnemyIds.has(id)
        ) {
          continue
        }

        const angle =
          encounterIndex * .71 +
          index * 2.399963229728653
        const distance =
          1.5 +
          Math.sqrt(index) * settings.minSpacing
        const x =
          node.x +
          Math.cos(angle) * distance
        const z =
          node.z +
          Math.sin(angle) * distance

        this.spawnEnemy(
          id,
          definition,
          x,
          z,
          {
            transient: false,
            respawn: settings.respawn,
            respawnSeconds: settings.respawnSeconds,
          },
        )
      }
    })
  }

  private spawnEnemy(
    id: string,
    definition: ForgeEnemyDefinition,
    x: number,
    z: number,
    options: {
      transient?: boolean
      respawn?: boolean
      respawnSeconds?: number
    } = {},
  ) {
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
    group.position.set(x, this.region.version >= 2 ? runtimeWalkSurfaceHeight(this.region, x, z) : 0, z)
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
      staggerRemaining: 0,
      recoveryRemaining: 0,
      knockback: new THREE.Vector3(),
      path: [],
      pathIndex: 0,
      repathRemaining: 0,
      moving: false,
      spawnX: x,
      spawnZ: z,
      transient: options.transient ?? false,
      respawn: options.respawn ?? false,
      respawnSeconds: THREE.MathUtils.clamp(
        options.respawnSeconds ?? 30,
        3,
        300,
      ),
      visualAccumulator: hashUnit(id) * .08,
    }
    this.enemies.push(enemy)
    void this.bindEnemyVisual(enemy)
  }

  private async bindEnemyVisual(enemy: RuntimeEnemy) {
    try {
      const binding = await bindCharacterAsset(enemy.group, enemy.definition.characterAssetId, enemy.definition.animationAssetId, FORGE_WORLD_SCALE.characterHeight)
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
    if (key === 'e') {
      this.interactionHeld = true
      if (!event.repeat) {
        const interaction = this.getActiveInteraction()
        if (
          interaction &&
          (interaction.socket.trigger ?? 'tap') !== 'hold'
        ) {
          this.triggerInteraction(interaction)
        }
      }
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

  private onKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    this.keys.delete(key)
    if (key === 'e') {
      this.interactionHeld = false
      this.interactionHoldProgress = 0
    }
  }
  private onBlur = () => {
    this.keys.clear()
    this.primaryHeld = false
    this.interactionHeld = false
    this.interactionHoldProgress = 0
  }
  private onContextMenu = (event: MouseEvent) => event.preventDefault()

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.pointerTracked = true
    this.updateMouseWorldFromPointerRay()
  }

  private updateMouseWorldFromPointerRay() {
    this.raycaster.setFromCamera(this.ndc, this.camera)

    // Resolve the pointer against the actual walk surface while keeping the
    // point on the camera ray. Simply intersecting Y=0 and then replacing Y
    // with terrain height moves the world point off the cursor ray.
    this.floorPlane.constant = 0
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.mouseWorld)) return

    if (this.region.version >= 2) {
      for (let iteration = 0; iteration < 5; iteration += 1) {
        const surfaceY = runtimeWalkSurfaceHeight(
          this.region,
          this.mouseWorld.x,
          this.mouseWorld.z,
        )
        this.floorPlane.constant = -surfaceY
        if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.mouseWorld)) break
      }
      this.floorPlane.constant = 0
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    this.primaryHeld = true
    const ability = this.getPrimaryAbility()
    if (ability) this.performAbility(ability)
    event.preventDefault()
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.button === 0 || event.type !== 'pointerup') this.primaryHeld = false
  }

  private onWheel = (event: WheelEvent) => {
    this.cameraDistanceTarget = forgeWheelDistanceTarget(
      this.cameraDistanceTarget,
      event.deltaY,
      FORGE_WORLD_SCALE.playCameraMinDistance,
      FORGE_WORLD_SCALE.playCameraMaxDistance,
      FORGE_WORLD_SCALE.playCameraWheelStep,
    )
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
    this.updateInteractions(simulationDelta)
    this.updateEnemies(simulationDelta)
    this.updateCorpses(delta)
    this.updateLoot(simulationDelta)
    this.updateEffects(delta)
    this.updateLibraryVfx(delta)
    this.updateChainLightningEffects(delta)
    this.updateTextEffects(delta)
    this.updateCamera(delta)
    if (this.pointerTracked) this.updateMouseWorldFromPointerRay()
    this.updateCameraOcclusion(delta)

    this.environmentElapsed += delta
    if (!this.environmentPaused) {
      this.environmentHour = advanceWorldHour(
        this.environmentHour,
        delta,
        this.environmentSpeed,
      )
    }
    const environment = sampleWorldEnvironment(
      this.region.mood,
      this.environmentHour,
      this.environmentWeather,
      this.environmentElapsed,
      this.region.seed,
    )
    applyWorldEnvironmentToScene(
      this.scene,
      this.renderer,
      environment,
      this.environmentElapsed,
    )
    if (this.weatherVisuals) {
      updateWorldWeatherVisuals(
        this.weatherVisuals,
        this.camera,
        environment,
        this.environmentElapsed,
        delta,
      )
    }

    this.updatePersistence(delta)
    if (this.ambientVisuals) {
      updateWorldAmbientVisuals(
        this.ambientVisuals,
        now / 1000,
        environment,
      )
    }
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  private updateCameraOcclusion(delta: number) {
    if (!this.cameraOccluders.length) return

    const targetX = this.player.position.x
    const targetY =
      this.player.position.y +
      FORGE_WORLD_SCALE.playCameraLookAtHeight
    const targetZ = this.player.position.z
    const cameraX = this.camera.position.x
    const cameraY = this.camera.position.y
    const cameraZ = this.camera.position.z
    const dx = targetX - cameraX
    const dz = targetZ - cameraZ
    const lengthSq = dx * dx + dz * dz

    if (lengthSq < .001) return

    for (const root of this.cameraOccluders) {
      const rx = root.position.x - cameraX
      const rz = root.position.z - cameraZ
      const t = THREE.MathUtils.clamp(
        (rx * dx + rz * dz) / lengthSq,
        0,
        1,
      )
      const closestX = cameraX + dx * t
      const closestZ = cameraZ + dz * t
      const distance = Math.hypot(
        root.position.x - closestX,
        root.position.z - closestZ,
      )
      const radius = Number(root.userData.forgeOcclusionRadius ?? 1.5)
      const height = Number(root.userData.forgeOcclusionHeight ?? 5)
      const lineY = THREE.MathUtils.lerp(cameraY, targetY, t)
      const blocks =
        t > .06 &&
        t < .965 &&
        distance < radius &&
        lineY < root.position.y + height + .35
      const targetOpacity = blocks ? .3 : 1
      const current = Number(root.userData.forgeOcclusionOpacity ?? 1)
      const response = targetOpacity < current ? 9 : 5.5
      const next =
        targetOpacity +
        (current - targetOpacity) * Math.exp(-response * delta)

      root.userData.forgeOcclusionOpacity =
        Math.abs(next - targetOpacity) < .006 ? targetOpacity : next

      if (
        targetOpacity < .999 ||
        current < .999 ||
        root.userData.forgeOcclusionMaterialsReady
      ) {
        this.ensureCameraOccluderMaterials(root)
        const opacity = Number(root.userData.forgeOcclusionOpacity)
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material]
          materials.forEach((material) => {
            const transparent = opacity < .995
            if (material.transparent !== transparent) {
              material.transparent = transparent
              material.needsUpdate = true
            }
            material.opacity = opacity
            material.depthWrite = opacity > .56
          })
        })
      }
    }
  }

  private ensureCameraOccluderMaterials(root: THREE.Group) {
    if (root.userData.forgeOcclusionMaterialsReady) return

    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      if (Array.isArray(object.material)) {
        object.material = object.material.map((material) => material.clone())
      } else {
        object.material = object.material.clone()
      }
    })
    root.userData.forgeOcclusionMaterialsReady = true
  }

  private updateCooldowns(delta: number) {
    for (const [id, value] of this.cooldowns) this.cooldowns.set(id, Math.max(0, value - delta))
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta)
    if (this.meleeComboResetRemaining > 0) {
      this.meleeComboResetRemaining = Math.max(
        0,
        this.meleeComboResetRemaining - delta,
      )
      if (this.meleeComboResetRemaining <= 0) this.meleeComboStep = -1
    }
    if (this.bufferedAbilityRemaining > 0) {
      this.bufferedAbilityRemaining = Math.max(0, this.bufferedAbilityRemaining - delta)
      if (this.bufferedAbilityRemaining <= 0) this.bufferedAbility = undefined
    }
    if (this.messageRemaining > 0) {
      this.messageRemaining -= delta
      if (this.messageRemaining <= 0) this.message = ''
    }
  }

  private updatePlayer(delta: number) {
    this.updatePlayerAction(delta)
    let moving = false

    if (this.dodgeRemaining > 0) {
      const speed = this.playerDefinition.dodgeDistance / DODGE_DURATION
      this.playerVelocity.copy(this.dodgeDirection).multiplyScalar(speed)
      this.tempMove.copy(this.playerVelocity).multiplyScalar(delta)
      this.moveActor(this.player, this.tempMove, PLAYER_RADIUS)
      this.dodgeRemaining = Math.max(0, this.dodgeRemaining - delta)
      moving = true
    } else {
      const input = this.getMoveDirection()
      const movementMultiplier = forgeAttackMovementMultiplier(this.playerAction?.phase)
      const desiredX = input.x * this.playerDefinition.moveSpeed * movementMultiplier
      const desiredZ = input.z * this.playerDefinition.moveSpeed * movementMultiplier
      const response = forgeMovementResponse(
        this.playerVelocity.x,
        this.playerVelocity.z,
        desiredX,
        desiredZ,
      )
      const alpha = forgeExpAlpha(response, delta)
      this.playerVelocity.x = THREE.MathUtils.lerp(this.playerVelocity.x, desiredX, alpha)
      this.playerVelocity.z = THREE.MathUtils.lerp(this.playerVelocity.z, desiredZ, alpha)
      this.playerVelocity.y = 0
      if (
        input.lengthSq() < .001 &&
        this.playerVelocity.lengthSq() <
          FORGE_GAMEPLAY_FEEL.movement.stopSpeed *
          FORGE_GAMEPLAY_FEEL.movement.stopSpeed
      ) {
        this.playerVelocity.set(0, 0, 0)
      }
      if (this.playerVelocity.lengthSq() > .001) {
        this.tempMove.copy(this.playerVelocity).multiplyScalar(delta)
        this.moveActor(this.player, this.tempMove, PLAYER_RADIUS)
      }
      moving = this.playerVelocity.lengthSq() > .04
    }

    const aim = this.playerAction?.aim ?? this.tempAim
      .copy(this.mouseWorld)
      .sub(this.player.position)
      .setY(0)
    if (aim.lengthSq() > .01) {
      const targetAngle = Math.atan2(aim.x, aim.z)
      const difference = Math.atan2(
        Math.sin(targetAngle - this.player.rotation.y),
        Math.cos(targetAngle - this.player.rotation.y),
      )
      this.player.rotation.y += difference * forgeExpAlpha(28, delta)
    }

    if (moving !== this.playerMoving) {
      this.playerMoving = moving
      if (!this.playerAction) this.playerVisual?.play(moving ? 'move' : 'idle')
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
    return this.tempMove
  }

  private startDodge() {
    if (this.dodgeCooldown > 0 || this.dodgeRemaining > 0) return
    if (!forgeCanDodgeCancelAction(this.playerAction?.phase)) return
    this.playerAction = undefined
    this.bufferedAbility = undefined
    this.bufferedAbilityRemaining = 0
    this.meleeComboStep = -1
    this.meleeComboResetRemaining = 0
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

  private getGroundAimPoint(
    range: number,
    minimumDistance = 0,
  ) {
    const direction = this.mouseWorld
      .clone()
      .sub(this.player.position)
      .setY(0)
    const cursorDistance = direction.length()

    if (cursorDistance > .001) direction.multiplyScalar(1 / cursorDistance)
    else direction.set(0, 0, -1)

    const clampedMinimum = Math.min(
      Math.max(0, range),
      Math.max(0, minimumDistance),
    )
    const targetDistance = Math.min(
      Math.max(0, range),
      Math.max(clampedMinimum, cursorDistance),
    )
    const target = this.player.position
      .clone()
      .addScaledVector(direction, targetDistance)

    target.y =
      this.region.version >= 2
        ? runtimeWalkSurfaceHeight(
            this.region,
            target.x,
            target.z,
          )
        : 0

    return target
  }

  private performAbility(ability: ForgeAbilityDefinition) {
    if (this.playerHealth <= 0) return
    if (
      this.dodgeRemaining > 0 ||
      this.playerAction ||
      (this.cooldowns.get(ability.id) ?? 0) > 0
    ) {
      this.bufferedAbility = ability
      this.bufferedAbilityRemaining = FORGE_GAMEPLAY_FEEL.inputBufferSeconds
      return
    }
    this.startAbilityAction(ability)
  }

  private startAbilityAction(ability: ForgeAbilityDefinition) {
    if ((this.cooldowns.get(ability.id) ?? 0) > 0 || this.playerHealth <= 0) return
    if (this.pointerTracked) this.updateMouseWorldFromPointerRay()
    const aim = this.mouseWorld.clone().sub(this.player.position).setY(0)
    if (aim.lengthSq() < .01) aim.set(0, 0, -1)
    aim.normalize()
    const primaryMelee =
      ability.id === this.playerDefinition.basicAbility &&
      ability.input === 'primary' &&
      ability.kind === 'melee'
    const comboStep = primaryMelee
      ? this.meleeComboResetRemaining > 0
        ? (this.meleeComboStep + 1) % 3
        : 0
      : 0
    if (primaryMelee) {
      this.meleeComboStep = comboStep
      this.meleeComboResetRemaining =
        FORGE_GAMEPLAY_FEEL.combat.comboResetSeconds
    } else {
      this.meleeComboStep = -1
      this.meleeComboResetRemaining = 0
    }

    const timing = forgeAbilityTiming(ability, comboStep)
    this.playerAction = {
      ability,
      aim,
      phase: 'windup',
      remaining: timing.windup,
      activeDuration: timing.active,
      recoveryDuration: timing.recovery,
      comboStep,
      impacted: false,
    }
    this.cooldowns.set(
      ability.id,
      forgeAbilityActionCooldown(ability, comboStep),
    )
    const animationV3 = this.playerVisual?.getAnimationRuntimeV3()
    if (animationV3) {
      if (primaryMelee) {
        // Forge V3 currently exposes primary + heavy attack actions.
        // Hit two keeps the primary animation but has distinct mechanical
        // timing/arc/lunge; the finisher uses heavy when authored.
        const played =
          comboStep === 2
            ? animationV3.playAction('attackHeavy')
            : animationV3.playAction('attackPrimary')
        if (!played) animationV3.playAction('attackPrimary')
      } else if (!animationV3.playAction('cast')) {
        animationV3.playAction('attackPrimary')
      }
    } else {
      const clipName = this.abilityAnimationClipNames.get(ability.id)
      if (!clipName || !this.playerVisual?.playClipName(clipName, false)) {
        this.playerVisual?.play('attack', false)
      }
    }
    this.emitState()
  }

  private updatePlayerAction(delta: number) {
    const action = this.playerAction
    if (!action) {
      if (
        this.bufferedAbility &&
        this.bufferedAbilityRemaining > 0 &&
        (this.cooldowns.get(this.bufferedAbility.id) ?? 0) <= 0 &&
        this.dodgeRemaining <= 0
      ) {
        const buffered = this.bufferedAbility
        this.bufferedAbility = undefined
        this.bufferedAbilityRemaining = 0
        this.startAbilityAction(buffered)
      } else if (this.primaryHeld && this.dodgeRemaining <= 0) {
        const primary = this.getPrimaryAbility()
        if (primary && (this.cooldowns.get(primary.id) ?? 0) <= 0) {
          this.startAbilityAction(primary)
        }
      }
      return
    }

    if (action.phase === 'windup' && this.pointerTracked) {
      const aim = this.mouseWorld.clone().sub(this.player.position).setY(0)
      if (aim.lengthSq() > .01) action.aim.copy(aim.normalize())
    }

    action.remaining -= delta
    if (action.remaining > 0) return

    if (action.phase === 'windup') {
      action.phase = 'active'
      action.remaining = action.activeDuration
      if (!action.impacted) {
        action.impacted = true
        if (
          action.ability.input === 'primary' &&
          action.ability.kind === 'melee'
        ) {
          const combo = forgeMeleeComboProfile(action.comboStep)
          this.tempMove
            .copy(action.aim)
            .multiplyScalar(combo.lunge)
          this.moveActor(this.player, this.tempMove, PLAYER_RADIUS)
          this.playerVelocity.multiplyScalar(.42)
        }
        this.resolveAbilityImpact(
          action.ability,
          action.aim,
          action.comboStep,
        )
      }
      return
    }

    if (action.phase === 'active') {
      action.phase = 'recovery'
      action.remaining = action.recoveryDuration
      return
    }

    this.playerAction = undefined
    if (this.playerMoving) this.playerVisual?.play('move')
    else this.playerVisual?.play('idle')
  }

  private resolveAbilityImpact(
    ability: ForgeAbilityDefinition,
    aim: THREE.Vector3,
    comboStep = 0,
  ) {
    const primaryMelee =
      ability.input === 'primary' &&
      ability.kind === 'melee'
    const combo = primaryMelee
      ? forgeMeleeComboProfile(comboStep)
      : undefined
    const damage =
      (ability.damage + this.getEquippedDamageBonus()) *
      (combo?.damageMultiplier ?? 1)
    if (ability.delivery === 'chain') {
      this.performChainAbility(ability, aim, damage)
      return
    }

    if (ability.kind === 'melee') {
      const impact = this.player.position.clone().addScaledVector(
        aim,
        Math.max(1, ability.range * .5),
      )
      this.spawnPulse(impact, ability.color, ability.radius, .24)
      void this.spawnBoundVfx(ability.vfxAssetId, impact)
      for (const enemy of [...this.enemies]) {
        const toEnemy = enemy.group.position.clone().sub(this.player.position).setY(0)
        const distance = toEnemy.length()
        if (distance > ability.range + ENEMY_RADIUS) continue
        const facing = distance > .001 ? toEnemy.normalize().dot(aim) : 1
        if (facing >= (combo?.arcDot ?? .08)) {
          this.damageEnemy(
            enemy,
            damage,
            aim,
            ability.color,
            'standard',
            combo?.knockbackMultiplier ?? 1,
            combo?.hitStop,
            combo?.cameraShake,
            combo?.staggerSeconds,
          )
        }
      }
      return
    }

    const target = this.getGroundAimPoint(ability.range)
    this.spawnPulse(target, ability.color, ability.radius, .55)
    void this.spawnBoundVfx(ability.vfxAssetId, target)
    for (const enemy of [...this.enemies]) {
      if (enemy.group.position.distanceTo(target) > ability.radius + ENEMY_RADIUS) continue
      const direction = enemy.group.position.clone().sub(target).setY(0)
      if (direction.lengthSq() > .001) direction.normalize()
      else direction.copy(aim)
      this.damageEnemy(enemy, damage, direction, ability.color)
    }
  }

  private getChainCastOrigin(aim: THREE.Vector3) {
    const characterRoot =
      this.playerVisual?.root ??
      this.player.getObjectByName('__forge_bound_character')

    if (characterRoot) {
      const rightHand = findRuntimeItemSocket(
        characterRoot,
        'RightHand',
      )
      if (rightHand) {
        rightHand.updateWorldMatrix(true, false)
        const position = rightHand.getWorldPosition(
          new THREE.Vector3(),
        )
        position.y += .035
        position.addScaledVector(aim, .12)
        return position
      }
    }

    const fallback = new THREE.Vector3(
      ...fallbackSocketPosition('RightHand'),
    )
    this.player.localToWorld(fallback)
    fallback.addScaledVector(aim, .1)
    return fallback
  }

  private performChainAbility(
    ability: ForgeAbilityDefinition,
    aim: THREE.Vector3,
    damage: number,
  ) {
    const config = normalizeChainConfig(ability.chain)
    const caster = this.getChainCastOrigin(aim)
    const aimedGroundPoint = this.getGroundAimPoint(
      ability.range,
      1.5,
    )
    const aimedPoint = aimedGroundPoint.clone()

    const candidates = this.enemies
      .filter((enemy) =>
        enemy.health > 0 &&
        enemy.group.position.distanceTo(this.player.position) <=
          ability.range + ENEMY_RADIUS,
      )
      .map((enemy) => ({
        id: enemy.id,
        value: enemy,
        position: enemy.group.position
          .clone()
          .add(new THREE.Vector3(0, 1.05, 0)),
      }))

    const first = [...candidates].sort((a, b) => {
      const aDx = a.position.x - aimedGroundPoint.x
      const aDz = a.position.z - aimedGroundPoint.z
      const bDx = b.position.x - aimedGroundPoint.x
      const bDz = b.position.z - aimedGroundPoint.z
      const aAim = aDx * aDx + aDz * aDz
      const bAim = bDx * bDx + bDz * bDz
      if (Math.abs(aAim - bAim) > 1e-6) return aAim - bAim
      return a.id.localeCompare(b.id)
    })[0]

    const castId =
      `${ability.id}:${this.region.seed}:${++this.chainCastSequence}`

    if (!first) {
      const effect = new ForgeChainLightningEffect(
        this.scene,
        [{
          index: 0,
          from: caster,
          to: aimedPoint,
          delay: 0,
          travel: chainLightningTravelDuration(
            caster.distanceTo(aimedPoint),
          ),
        }],
        {
          color: ability.color,
          boltLifetime: config.boltLifetime,
          arcAmplitude: config.arcAmplitude,
          branchCount: config.branchCount,
          glowWidth: config.glowWidth,
          lightFlashIntensity: config.lightFlashIntensity,
          seed: castId,
        },
      )
      this.chainLightningEffects.push(effect)
      return
    }

    const targets = resolveForgeChainTargets(
      first,
      candidates,
      ability.chain,
    )
    let chainDelay = 0
    const hops = targets.map((target, index) => {
      const from =
        index === 0
          ? caster.clone()
          : targets[index - 1].position.clone()
      const to = target.position.clone()
      const travel = chainLightningTravelDuration(
        from.distanceTo(to),
      )
      const hop = {
        index,
        from,
        to,
        delay: chainDelay,
        travel,
      }
      chainDelay +=
        travel + config.jumpDelay
      return hop
    })

    const effect = new ForgeChainLightningEffect(
      this.scene,
      hops,
      {
        color: ability.color,
        boltLifetime: config.boltLifetime,
        arcAmplitude: config.arcAmplitude,
        branchCount: config.branchCount,
        glowWidth: config.glowWidth,
        lightFlashIntensity: config.lightFlashIntensity,
        seed: castId,
      },
      (index) => {
        const target = targets[index]
        if (!target) return
        const enemy = target.value
        if (!this.enemies.includes(enemy) || enemy.health <= 0) return

        const from = hops[index]?.from ?? caster
        const direction = target.position
          .clone()
          .sub(from)
          .setY(0)
        if (direction.lengthSq() > .001) direction.normalize()
        else direction.copy(aim)

        void this.spawnBoundVfx(
          ability.vfxAssetId,
          target.position,
        )
        this.damageEnemy(
          enemy,
          Math.max(1, damage * target.damageMultiplier),
          direction,
          ability.color,
          'chain',
        )
      },
    )

    this.chainLightningEffects.push(effect)
    if (targets.length > 1) {
      this.setMessage(
        `${ability.name} chained through ${targets.length} targets.`,
        1.15,
      )
    }
  }

  private updateChainLightningEffects(delta: number) {
    for (
      let index = this.chainLightningEffects.length - 1;
      index >= 0;
      index -= 1
    ) {
      const effect = this.chainLightningEffects[index]
      if (!effect.update(delta)) {
        this.chainLightningEffects.splice(index, 1)
      }
    }
  }

  private damageEnemy(
    enemy: RuntimeEnemy,
    damage: number,
    direction: THREE.Vector3,
    color: string,
    presentation: 'standard' | 'chain' = 'standard',
    knockbackMultiplier = 1,
    hitStop?: number,
    cameraShake?: number,
    staggerSeconds?: number,
  ) {
    this.focusEnemyId = enemy.id
    enemy.health = Math.max(0, enemy.health - damage)
    const normalized = direction.clone().setY(0)
    if (normalized.lengthSq() > 0.001) normalized.normalize()
    enemy.knockback.addScaledVector(
      normalized,
      Math.min(6.8, (2.7 + damage * .025) * knockbackMultiplier),
    )
    enemy.windupRemaining = 0
    enemy.staggerRemaining = Math.max(
      enemy.staggerRemaining,
      staggerSeconds ??
        (presentation === 'chain'
          ? .045
          : FORGE_GAMEPLAY_FEEL.combat.enemyStaggerSeconds),
    )
    enemy.recoveryRemaining = 0
    enemy.telegraph.visible = false
    enemy.visual?.play('hit', false)
    enemy.bodyMaterial.emissive.set(
      presentation === 'chain'
        ? new THREE.Color(color)
        : new THREE.Color(0xffffff),
    )
    enemy.bodyMaterial.emissiveIntensity =
      presentation === 'chain' ? .72 : 1
    const ratio = Math.max(0.001, enemy.health / enemy.definition.maxHealth)
    enemy.healthFill.scale.x = ratio
    enemy.healthFill.position.x = -(1 - ratio) * 0.64
    this.spawnDamageNumber(enemy.group.position, damage, color)
    this.spawnPulse(
      enemy.group.position,
      color,
      presentation === 'chain' ? .68 : 1.15,
      presentation === 'chain' ? .1 : .18,
    )
    if (enemy.health > 0) {
      void this.spawnBoundVfx(
        enemy.definition.hitVfxAssetId,
        enemy.group.position,
      )
    }
    this.hitStopRemaining = Math.max(
      this.hitStopRemaining,
      hitStop ?? (presentation === 'chain' ? .012 : .035),
    )
    this.cameraShake = Math.max(
      this.cameraShake,
      cameraShake ?? (presentation === 'chain' ? .09 : .22),
    )
    if (enemy.health <= 0) this.killEnemy(enemy)
  }

  private killEnemy(enemy: RuntimeEnemy) {
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
    if (this.focusEnemyId === enemy.id) this.focusEnemyId = undefined

    if (!enemy.transient && !enemy.respawn) {
      this.defeatedEnemyIds.add(enemy.id)
    } else {
      this.defeatedEnemyIds.delete(enemy.id)
    }

    if (enemy.respawn && !enemy.transient) {
      this.scheduleEnemyRespawn(enemy)
    }

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
    if (!enemy.transient) {
      this.rollLoot(enemy, position)
    }
    this.setMessage(
      enemy.transient
        ? 'Test enemy defeated.'
        : this.enemies.length === 0
          ? enemy.respawn
            ? `Encounter cleared for now. Enemies respawn in ${Math.round(enemy.respawnSeconds)}s.`
            : 'Encounter cleared. Pick up the loot and equip it from the inventory.'
          : `${enemy.definition.name} defeated.`,
      3.2,
    )
    this.cameraShake = Math.max(this.cameraShake, 0.34)
    if (!enemy.transient) this.saveGame(false)
    this.emitState()
  }

  private scheduleEnemyRespawn(enemy: RuntimeEnemy) {
    const timer = window.setTimeout(() => {
      this.respawnTimers.delete(timer)
      if (this.disposed) return
      if (this.enemies.some((candidate) => candidate.id === enemy.id)) return

      this.spawnEnemy(
        enemy.id,
        enemy.definition,
        enemy.spawnX,
        enemy.spawnZ,
        {
          transient: false,
          respawn: true,
          respawnSeconds: enemy.respawnSeconds,
        },
      )
      this.setMessage(
        `${enemy.definition.name} encounter has respawned.`,
        1.8,
      )
      this.emitState()
    }, enemy.respawnSeconds * 1000)

    this.respawnTimers.add(timer)
  }

  private updateCorpses(delta: number) {
    for (
      let index = this.corpses.length - 1;
      index >= 0;
      index -= 1
    ) {
      const corpse = this.corpses[index]
      corpse.age += delta
      corpse.visual?.update(delta)
      if (corpse.age < corpse.duration) continue

      this.corpses.splice(index, 1)
      this.scene.remove(corpse.group)

      const visual = corpse.visual
      const group = corpse.group
      this.runWhenIdle(() => {
        if (visual) {
          const visualRoot = visual.root
          visual.dispose()
          visualRoot.removeFromParent()
        }
        this.disposeObject(group)
      })
    }
  }

  private rollLoot(enemy: RuntimeEnemy, position: THREE.Vector3) {
    this.rollLootTableAt(
      enemy.definition.lootTable,
      `enemy:${enemy.id}`,
      position,
      true,
    )
  }

  private rollLootTableAt(
    tableId: string | undefined,
    sourceId: string,
    position: THREE.Vector3,
    persist: boolean,
  ) {
    if (!tableId) return undefined
    const table = this.gameplay.lootTables.find(
      (candidate) => candidate.id === tableId,
    )
    if (!table) return undefined

    const result = rollLootTable(table, sourceId)
    const scatter = THREE.MathUtils.clamp(
      table.scatterRadius ?? .85,
      .2,
      4,
    )
    let ordinal = 0

    for (const rolled of result.items) {
      for (
        let quantityIndex = 0;
        quantityIndex < rolled.quantity;
        quantityIndex += 1
      ) {
        const angle =
          hashUnit(
            `${sourceId}:angle:${rolled.entryIndex}:${quantityIndex}`,
          ) *
          Math.PI *
          2
        const radius =
          scatter *
          (
            .35 +
            hashUnit(
              `${sourceId}:radius:${rolled.entryIndex}:${quantityIndex}`,
            ) *
              .65
          )
        this.spawnLoot(
          {
            id: `${sourceId}:drop:${ordinal}:${rolled.itemId}`,
            itemId: rolled.itemId,
            x: position.x + Math.cos(angle) * radius,
            z: position.z + Math.sin(angle) * radius,
          },
          false,
        )
        ordinal += 1
      }
    }

    if (result.gold > 0 || result.xp > 0) {
      grantForgeRewardTotals(
        this as unknown,
        result.gold,
        result.xp,
      )
    }

    if (persist) this.saveGame(false)
    return result
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
    group.position.set(
      save.x,
      this.region.version >= 2
        ? runtimeWalkSurfaceHeight(this.region, save.x, save.z)
        : 0,
      save.z,
    )
    this.scene.add(group)
    const drop: RuntimeLoot = { save: { ...save }, group, fallback, age: 0 }
    this.loot.push(drop)
    this.runWhenIdle(() => {
      if (this.disposed || !this.loot.includes(drop)) return
      void this.bindLootPresentation(drop, item)
    }, 700)
    if (persist) this.saveGame(false)
  }

  private runWhenIdle(
    task: () => void,
    timeout = 450,
  ) {
    const runtimeWindow = window as typeof window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number
    }

    if (runtimeWindow.requestIdleCallback) {
      runtimeWindow.requestIdleCallback(
        task,
        { timeout },
      )
      return
    }

    window.setTimeout(task, 16)
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
    const playerX = this.player.position.x
    const playerZ = this.player.position.z

    for (const enemy of this.enemies) {
      enemy.attackCooldown = Math.max(
        0,
        enemy.attackCooldown - delta,
      )
      enemy.staggerRemaining = Math.max(
        0,
        enemy.staggerRemaining - delta,
      )
      enemy.recoveryRemaining = Math.max(
        0,
        enemy.recoveryRemaining - delta,
      )
      enemy.repathRemaining = Math.max(
        0,
        enemy.repathRemaining - delta,
      )

      // Avoid allocating a new Color for every enemy every frame.
      enemy.bodyMaterial.emissive.multiplyScalar(
        Math.max(0, 1 - delta * 22),
      )

      const dx = playerX - enemy.group.position.x
      const dz = playerZ - enemy.group.position.z
      const distanceSq = dx * dx + dz * dz
      const activeRange = Math.max(
        12,
        enemy.definition.aggroRange + 3,
      )
      const needsFullSimulation =
        distanceSq <= activeRange * activeRange ||
        enemy.windupRemaining > 0 ||
        enemy.knockback.lengthSq() > .02

      if (!needsFullSimulation) {
        if (enemy.moving) this.setEnemyMoving(enemy, false)
        enemy.telegraph.visible = false

        // Distant actors still animate, just at a much cheaper 8–10 Hz.
        enemy.visualAccumulator += delta
        if (enemy.visualAccumulator >= .11) {
          enemy.visual?.update(enemy.visualAccumulator)
          enemy.visualAccumulator = 0
        }
        continue
      }

      if (enemy.visualAccumulator > 0) {
        enemy.visual?.update(
          enemy.visualAccumulator + delta,
        )
        enemy.visualAccumulator = 0
      } else {
        enemy.visual?.update(delta)
      }

      if (enemy.knockback.lengthSq() > .02) {
        this.tempMove
          .copy(enemy.knockback)
          .multiplyScalar(delta)
        this.moveActor(
          enemy.group,
          this.tempMove,
          ENEMY_RADIUS,
        )
        enemy.knockback.multiplyScalar(
          Math.max(0, 1 - delta * 8.5),
        )
      }

      if (enemy.staggerRemaining > 0) {
        this.setEnemyMoving(enemy, false)
        enemy.telegraph.visible = false
        continue
      }
      if (enemy.recoveryRemaining > 0) {
        this.setEnemyMoving(enemy, false)
        enemy.telegraph.visible = false
        continue
      }

      const distance = Math.hypot(
        playerX - enemy.group.position.x,
        playerZ - enemy.group.position.z,
      )

      if (enemy.windupRemaining > 0) {
        enemy.moving = false
        enemy.windupRemaining = Math.max(
          0,
          enemy.windupRemaining - delta,
        )
        const progress =
          1 -
          enemy.windupRemaining /
            Math.max(.01, enemy.windupDuration)
        enemy.telegraph.visible = true
        const material =
          enemy.telegraph.material as THREE.MeshBasicMaterial
        material.opacity = .18 + progress * .62
        enemy.telegraph.scale.setScalar(
          .85 + progress * .2,
        )
        if (enemy.windupRemaining <= 0) {
          this.resolveEnemyAttack(enemy)
        }
        continue
      }

      enemy.telegraph.visible = false
      if (distance > enemy.definition.aggroRange) {
        this.setEnemyMoving(enemy, false)
        continue
      }
      if (
        distance <= enemy.definition.attackRange &&
        enemy.attackCooldown <= 0
      ) {
        this.beginEnemyAttack(enemy)
        continue
      }
      if (distance > enemy.definition.attackRange) {
        this.setEnemyMoving(enemy, true)
        this.updateEnemyPath(enemy, delta)
      } else {
        this.setEnemyMoving(enemy, false)
      }
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
    const direction =
      this.tempEnemyDirection
        .copy(target)
        .sub(enemy.group.position)
        .setY(0)
    if (direction.lengthSq() < .001) return
    direction.normalize()
    direction
      .addScaledVector(
        this.enemySeparation(
          enemy,
          this.tempEnemySeparation,
        ),
        .7,
      )
      .normalize()

    enemy.group.rotation.y =
      Math.atan2(
        direction.x,
        direction.z,
      )
    direction.multiplyScalar(
      enemy.definition.moveSpeed * delta,
    )
    this.moveActor(
      enemy.group,
      direction,
      ENEMY_RADIUS,
    )
  }

  private enemySeparation(
    enemy: RuntimeEnemy,
    force: THREE.Vector3,
  ) {
    force.set(0, 0, 0)
    const x = enemy.group.position.x
    const z = enemy.group.position.z

    for (const other of this.enemies) {
      if (other === enemy) continue
      const dx =
        x - other.group.position.x
      const dz =
        z - other.group.position.z
      const distanceSq =
        dx * dx + dz * dz
      if (
        distanceSq <= 1e-6 ||
        distanceSq >= 3.24
      ) {
        continue
      }

      const distance =
        Math.sqrt(distanceSq)
      const weight =
        (1.8 - distance) /
        (1.8 * distance)
      force.x += dx * weight
      force.z += dz * weight
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
    enemy.recoveryRemaining = Math.max(
      enemy.recoveryRemaining,
      FORGE_GAMEPLAY_FEEL.combat.enemyRecoverySeconds +
        enemy.windupDuration * .16,
    )
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
    this.player.position.set(
      respawnX,
      this.region.version >= 2
        ? runtimeWalkSurfaceHeight(this.region, respawnX, respawnZ)
        : 0,
      respawnZ,
    )
    this.playerHealth = this.playerDefinition.maxHealth
    this.focusEnemyId = undefined
    this.setMessage('You fell in battle and returned to the region entry. Enemy progress is preserved.', 4)
    this.saveGame(false)
  }

  private updateLoot(delta: number) {
    const playerX = this.player.position.x
    const playerZ = this.player.position.z
    const pickupRadiusSq = 1.35 * 1.35

    for (
      let index = this.loot.length - 1;
      index >= 0;
      index -= 1
    ) {
      const drop = this.loot[index]
      drop.age += delta
      drop.fallback.rotation.y += delta * 1.8
      drop.group.position.y =
        Math.sin(drop.age * 3.2) * .08

      const dx =
        drop.group.position.x - playerX
      const dz =
        drop.group.position.z - playerZ
      if (
        dx * dx + dz * dz >
        pickupRadiusSq
      ) {
        continue
      }

      const item = this.gameplay.items.find(
        (candidate) =>
          candidate.id === drop.save.itemId,
      )
      if (!item) continue

      const inventoryRuntime =
        this as unknown as {
          canPickupInventoryItem?: (
            itemId: string,
          ) => boolean
          refreshInventoryLayout?: () => void
        }

      if (
        inventoryRuntime.canPickupInventoryItem &&
        !inventoryRuntime.canPickupInventoryItem(
          drop.save.itemId,
        )
      ) {
        if (this.messageRemaining <= .35) {
          this.setMessage(
            'Pack full. Make room or auto-sort the 12 × 6 inventory.',
            1.8,
          )
        }
        continue
      }

      this.inventory.push(drop.save.itemId)
      inventoryRuntime.refreshInventoryLayout?.()
      this.loot.splice(index, 1)
      this.scene.remove(drop.group)
      this.disposeObject(drop.group)
      this.setMessage(
        `${item.name} picked up. Press I to open the pack.`,
        3.2,
      )
      this.saveGame(false)
      this.emitState()
    }
  }

  private updateEffects(delta: number) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index]
      effect.age += delta
      const progress = Math.min(1, effect.age / effect.duration)
      effect.mesh.scale.setScalar(
        0.25 + progress * effect.maxScale,
      )
      const material =
        effect.mesh.material as THREE.MeshBasicMaterial
      material.opacity = (1 - progress) * 0.72
      if (progress < 1) continue
      this.effects.splice(index, 1)
      this.scene.remove(effect.mesh)
      material.dispose()
    }
  }

  private updateLibraryVfx(delta: number) {
    for (
      let index = this.libraryVfx.length - 1;
      index >= 0;
      index -= 1
    ) {
      const effect = this.libraryVfx[index]
      if (effect.update(delta)) continue
      effect.dispose()
      this.libraryVfx.splice(index, 1)
    }
  }

  private updateTextEffects(delta: number) {
    for (
      let index = this.textEffects.length - 1;
      index >= 0;
      index -= 1
    ) {
      const effect = this.textEffects[index]
      effect.age += delta
      const progress = Math.min(
        1,
        effect.age / effect.duration,
      )
      effect.sprite.position.y +=
        delta * (0.9 - progress * 0.35)
      const material =
        effect.sprite.material as THREE.SpriteMaterial
      material.opacity = 1 - progress
      if (progress < 1) continue
      this.scene.remove(effect.sprite)
      material.dispose()
      this.textEffects.splice(index, 1)
    }
  }

  private updateCamera(delta: number) {
    this.cameraShake = Math.max(0, this.cameraShake - delta * 2.7)
    this.cameraDistance = THREE.MathUtils.lerp(
      this.cameraDistance,
      this.cameraDistanceTarget,
      forgeExpAlpha(FORGE_GAMEPLAY_FEEL.camera.zoomResponse, delta),
    )

    const focusTarget = this.tempCameraFocus.copy(this.player.position)
    focusTarget.addScaledVector(
      this.playerVelocity,
      FORGE_GAMEPLAY_FEEL.camera.velocityLookAhead,
    )
    this.tempAim.copy(this.mouseWorld).sub(this.player.position).setY(0)
    if (this.tempAim.lengthSq() > .01) {
      this.tempAim.normalize().multiplyScalar(FORGE_GAMEPLAY_FEEL.camera.aimLookAhead)
      focusTarget.add(this.tempAim)
    }
    focusTarget.y = this.player.position.y
    this.cameraFocus.lerp(
      focusTarget,
      forgeExpAlpha(FORGE_GAMEPLAY_FEEL.camera.followResponse, delta),
    )

    const desired = this.cameraOffset(this.tempCamera).add(this.cameraFocus)
    if (this.cameraShake > 0) {
      const strength = this.cameraShake * .7
      const now = performance.now()
      desired.x += Math.sin(now * .061) * strength
      desired.y += Math.sin(now * .083) * strength * .45
      desired.z += Math.cos(now * .073) * strength
    }

    this.camera.position.lerp(
      desired,
      forgeExpAlpha(FORGE_GAMEPLAY_FEEL.camera.positionResponse, delta),
    )
    this.camera.lookAt(
      this.cameraFocus.x,
      this.cameraFocus.y + FORGE_WORLD_SCALE.playCameraLookAtHeight,
      this.cameraFocus.z,
    )
  }

  private snapCamera() {
    this.cameraDistance = this.cameraDistanceTarget
    this.cameraFocus.copy(this.player.position)
    this.camera.position
      .copy(this.cameraFocus)
      .add(this.cameraOffset(this.tempCamera))
    this.camera.lookAt(
      this.cameraFocus.x,
      this.cameraFocus.y + FORGE_WORLD_SCALE.playCameraLookAtHeight,
      this.cameraFocus.z,
    )
  }

  private cameraOffset(target: THREE.Vector3) {
    return target.set(
      this.cameraDistance * FORGE_WORLD_SCALE.playCameraHorizontalScale,
      this.cameraDistance * FORGE_WORLD_SCALE.playCameraVerticalScale,
      this.cameraDistance * FORGE_WORLD_SCALE.playCameraHorizontalScale,
    )
  }

  private moveActor(
    actor: THREE.Object3D,
    delta: THREE.Vector3,
    radius: number,
  ) {
    const distance = Math.hypot(delta.x, delta.z)
    if (distance <= 0) return
    const steps = Math.max(
      1,
      Math.ceil(distance / FORGE_GAMEPLAY_FEEL.movement.collisionStep),
    )
    const stepX = delta.x / steps
    const stepZ = delta.z / steps

    for (let index = 0; index < steps; index += 1) {
      const currentX = actor.position.x
      const currentZ = actor.position.z
      const nextX = THREE.MathUtils.clamp(
        currentX + stepX,
        this.region.bounds.minX + radius,
        this.region.bounds.maxX - radius,
      )
      const nextZ = THREE.MathUtils.clamp(
        currentZ + stepZ,
        this.region.bounds.minZ + radius,
        this.region.bounds.maxZ - radius,
      )

      if (!this.actorPositionBlocked(nextX, nextZ, radius)) {
        actor.position.x = nextX
        actor.position.z = nextZ
        continue
      }

      const xOpen = !this.actorPositionBlocked(nextX, currentZ, radius)
      const zOpen = !this.actorPositionBlocked(currentX, nextZ, radius)
      if (xOpen && zOpen) {
        if (Math.abs(stepX) >= Math.abs(stepZ)) {
          actor.position.x = nextX
          if (!this.actorPositionBlocked(actor.position.x, nextZ, radius)) {
            actor.position.z = nextZ
          }
        } else {
          actor.position.z = nextZ
          if (!this.actorPositionBlocked(nextX, actor.position.z, radius)) {
            actor.position.x = nextX
          }
        }
      } else if (xOpen) {
        actor.position.x = nextX
      } else if (zOpen) {
        actor.position.z = nextZ
      }
    }

    if (this.region.version >= 2) {
      actor.position.y = runtimeWalkSurfaceHeight(
        this.region,
        actor.position.x,
        actor.position.z,
      )
    }
  }

  private actorPositionBlocked(x: number, z: number, radius: number) {
    for (const obstacle of this.obstacles) {
      if (Math.hypot(x - obstacle.x, z - obstacle.z) < radius + obstacle.radius) {
        return true
      }
    }
    return false
  }

  private spawnPulse(position: THREE.Vector3, color: string, radius: number, duration: number) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
    const mesh = new THREE.Mesh(this.pulseGeometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(position.x, 0.055, position.z)
    this.scene.add(mesh)
    this.effects.push({ mesh, age: 0, duration, maxScale: Math.max(1, radius) })
  }

  private spawnDamageNumber(
    position: THREE.Vector3,
    damage: number,
    color: string,
  ) {
    const label = String(Math.round(damage))
    const cacheKey = `${label}:${color}`
    let texture = this.damageTextureCache.get(cacheKey)

    if (!texture) {
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
      context.strokeText(label, 64, 32)
      context.fillStyle = color
      context.fillText(label, 64, 32)
      texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      this.damageTextureCache.set(cacheKey, texture)
    }

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(position.x, 2.4, position.z)
    sprite.scale.set(2.1, 1.05, 1)
    this.scene.add(sprite)
    this.textEffects.push({
      sprite,
      age: 0,
      duration: 0.68,
    })
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

  private updateInteractions(delta: number) {
    let nearest: RuntimeInteraction | undefined
    let nearestDistance = Infinity
    const world = new THREE.Vector3()

    for (const interaction of this.interactions) {
      interaction.cooldownRemaining = Math.max(
        0,
        interaction.cooldownRemaining - delta,
      )
      if (
        interaction.used ||
        !interaction.socket.enabled
      ) {
        interaction.anchor.visible = false
        continue
      }

      interaction.anchor.getWorldPosition(world)
      const distance = Math.hypot(
        world.x - this.player.position.x,
        world.z - this.player.position.z,
      )
      const radius =
        interaction.socket.radius *
        interaction.radiusScale
      if (
        distance <= radius &&
        distance < nearestDistance
      ) {
        nearest = interaction
        nearestDistance = distance
      }
    }

    const previous = this.activeInteractionId
    this.activeInteractionId = nearest?.id
    if (previous !== this.activeInteractionId) {
      this.interactionHoldProgress = 0
    }

    for (const interaction of this.interactions) {
      interaction.anchor.visible =
        interaction.id === this.activeInteractionId &&
        !interaction.used
    }

    if (!nearest) {
      this.interactionHoldProgress = 0
      return
    }

    const trigger = nearest.socket.trigger ?? 'tap'
    if (trigger !== 'hold') {
      this.interactionHoldProgress = 0
      return
    }

    if (
      !this.interactionHeld ||
      nearest.cooldownRemaining > 0 ||
      this.isInteractionLocked(nearest)
    ) {
      if (!this.interactionHeld) {
        this.interactionHoldProgress = 0
      }
      return
    }

    const holdSeconds = Math.max(
      .15,
      nearest.socket.holdSeconds ?? .6,
    )
    this.interactionHoldProgress += delta
    if (this.interactionHoldProgress >= holdSeconds) {
      this.interactionHoldProgress = 0
      this.triggerInteraction(nearest)
    }
  }

  private getActiveInteraction() {
    return this.activeInteractionId
      ? this.interactions.find(
          (interaction) =>
            interaction.id === this.activeInteractionId,
        )
      : undefined
  }

  private isInteractionLocked(
    interaction: RuntimeInteraction,
  ) {
    const required =
      interaction.socket.requiredItemId?.trim()
    return Boolean(
      required &&
      !this.inventory.includes(required),
    )
  }

  private triggerInteraction(
    interaction: RuntimeInteraction,
  ) {
    if (
      interaction.used ||
      interaction.cooldownRemaining > 0
    ) {
      return
    }

    const required =
      interaction.socket.requiredItemId?.trim()
    if (
      required &&
      !this.inventory.includes(required)
    ) {
      this.setMessage(
        interaction.socket.lockedText?.trim() ||
          `Requires ${required}.`,
        2.6,
      )
      interaction.cooldownRemaining = .3
      this.emitState()
      return
    }

    if (
      required &&
      interaction.socket.consumeRequiredItem
    ) {
      const index = this.inventory.indexOf(required)
      if (index >= 0) this.inventory.splice(index, 1)
    }

    const world = new THREE.Vector3()
    interaction.anchor.getWorldPosition(world)
    const action =
      interaction.socket.action ?? 'message'
    const fallbackMessage =
      action === 'container'
        ? 'Container opened.'
        : action === 'shrine'
          ? 'The shrine answers with a warm pulse.'
          : action === 'door'
            ? 'Door interaction triggered.'
            : action === 'teleport'
              ? 'Travel socket triggered.'
              : action === 'quest'
                ? 'Quest interaction triggered.'
                : `${socketActionLabel(interaction.socket)} triggered.`

    let resultMessage =
      interaction.socket.message?.trim() ||
      fallbackMessage

    if (action === 'container') {
      const tableId =
        interaction.socket.targetRef?.trim()
      const loot = this.rollLootTableAt(
        tableId,
        `container:${interaction.id}:open:${interaction.activationCount}`,
        world,
        false,
      )
      if (tableId && !loot) {
        resultMessage =
          `Loot table "${tableId}" is missing.`
      } else if (loot) {
        const itemCount = loot.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        )
        const rewards = [
          itemCount > 0
            ? `${itemCount} item${itemCount === 1 ? '' : 's'}`
            : '',
          loot.gold > 0 ? `${loot.gold} gold` : '',
          loot.xp > 0 ? `${loot.xp} XP` : '',
        ].filter(Boolean)
        resultMessage = rewards.length
          ? `${resultMessage} · ${rewards.join(' · ')}`
          : `${resultMessage} · Empty`
      } else if (!tableId) {
        resultMessage =
          'Container opened · no Loot Forge table is assigned.'
      }
      interaction.activationCount += 1
    }

    this.setMessage(
      resultMessage,
      action === 'message' ? 3.2 : 3.1,
    )

    if (action === 'shrine') {
      this.spawnPulse(world, '#e5c879', 2.5, .5)
    } else if (action === 'container') {
      this.spawnPulse(world, '#d4ad61', 1.6, .32)
    } else if (action === 'door') {
      this.spawnPulse(world, '#a98a63', 1.25, .24)
    } else if (action === 'teleport') {
      this.spawnPulse(world, '#938cff', 2.2, .42)
    } else if (action === 'quest') {
      this.spawnPulse(world, '#e4d06e', 1.8, .36)
    }

    interaction.cooldownRemaining = Math.max(
      0,
      interaction.socket.cooldown ?? 0,
    )

    if (interaction.socket.oneShot) {
      interaction.used = true
      interaction.anchor.visible = false
      this.usedInteractionIds.add(interaction.id)
      if (
        this.activeInteractionId === interaction.id
      ) {
        this.activeInteractionId = undefined
      }
    }

    this.options.onInteraction?.({
      id: interaction.id,
      socket: interaction.socket,
      sourceName: interaction.sourceName,
    })

    if (
      interaction.socket.oneShot ||
      interaction.socket.consumeRequiredItem
    ) {
      this.saveGame(false)
    } else {
      this.emitState()
    }
  }

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
    const activeInteraction = this.getActiveInteraction()
    const locked = activeInteraction
      ? this.isInteractionLocked(activeInteraction)
      : false
    const holdSeconds = activeInteraction
      ? Math.max(
          .15,
          activeInteraction.socket.holdSeconds ?? .6,
        )
      : .6
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
      interaction: activeInteraction ? {
        id: activeInteraction.id,
        name: activeInteraction.socket.name,
        kind: activeInteraction.socket.kind,
        action: activeInteraction.socket.action ?? 'message',
        prompt: socketPrompt(activeInteraction.socket),
        trigger: activeInteraction.socket.trigger ?? 'tap',
        progress:
          (activeInteraction.socket.trigger ?? 'tap') === 'hold'
            ? THREE.MathUtils.clamp(
                this.interactionHoldProgress / holdSeconds,
                0,
                1,
              )
            : 0,
        holdSeconds,
        locked,
        lockedText: locked
          ? activeInteraction.socket.lockedText ?? 'Locked'
          : undefined,
        sourceName: activeInteraction.sourceName,
      } : undefined,
      message: this.message,
      savedAt: this.savedAt,
      animation: this.playerVisual
        ?.getAnimationRuntimeV3()
        ?.getDebugState(),
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
  const palette = runtimeMoodPalette(
    runtimeBiomePalette(region.biome),
    region.mood,
  )
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 100, depth + 100),
    new THREE.MeshStandardMaterial({ color: palette.low, roughness: 1 }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(centerX, worldBoundaryBackdropHeight(region), centerZ)
  mesh.receiveShadow = true
  return mesh
}

function makeGeneratedTerrain(region: GeneratedRegion) {
  const { terrain, bounds } = region
  const resolution = terrain.resolution
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const palette = runtimeMoodPalette(
    runtimeBiomePalette(region.biome),
    region.mood,
  )
  const surfacePalette = runtimeMoodPalette(
    runtimeSurfacePalette(region.biome),
    region.mood,
  )
  const moodStyle = runtimeMoodStyle(region.mood)
  const moodTerrainTint = new THREE.Color(moodStyle.terrainTint)
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
      color.lerp(forestFloorColor, surface.forestFloor * .34)
      color.lerp(mossColor, surface.moss * .31)
      color.lerp(meadowColor, surface.meadow * .42)
      color.lerp(scrubColor, surface.scrub * .27)
      color.lerp(rockyColor, surface.rocky * .38)
      color.lerp(soilColor, Math.max(surface.soil * .24, surface.poiWear * .68, surface.roadWear * .42))
      color.lerp(moodTerrainTint, moodStyle.terrainTintStrength)
      const variation =
        moodStyle.terrainBrightness *
        (.96 + (surface.medium - .5) * .08 + (surface.fine - .5) * .06)
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
  const mesh = new THREE.Mesh(geometry, forestFloorMaterial())
  mesh.name = 'GeneratedTerrain'
  mesh.receiveShadow = true
  return mesh
}

function makeGeneratedStream(region: GeneratedRegion) {
  const group = new THREE.Group()
  group.name = 'GeneratedStream'
  {
    const issues = streamRenderContinuityIssues(region)
    if (issues.length) console.warn('[Play Region] River continuity', issues)
  }
  const water = new THREE.Mesh(
    makeRuntimeTerrainSafeWaterGeometry(region),
    forestWaterMaterial(),
  )
  water.name = 'GeneratedWaterSurface'
  water.castShadow = false
  water.receiveShadow = false
  water.renderOrder = 20
  water.frustumCulled = false
  group.add(water)
  return group
}

function makeGeneratedPath(region: GeneratedRegion, path: GeneratedWorldPath) {
  const widths = path.widths.length === path.points.length ? path.widths : path.points.map(() => path.width)
  const road = new THREE.Mesh(
    makeRuntimeRibbon(path.points, widths, (x, z) => sampleTerrainHeight(region, x, z) + (path.kind === 'main' ? .054 : .049)),
    forestPathMaterial(path.kind === 'main'),
  )
  road.name = path.kind === 'main' ? 'MainRoad' : 'SideTrail'
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
  const uvs: number[] = []
  const indices: number[] = []

  sections.forEach((section, index) => {
    uvs.push(0,index/Math.max(1,sections.length-1),1,index/Math.max(1,sections.length-1))
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
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeRuntimeTerrainSafeWaterGeometry(region: GeneratedRegion) {
  const surface = streamWaterSurfaceRows(region, 9, .085)
  const rows = surface.rows
  const lanes = surface.laneCount
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const deepWater = new THREE.Color(0x245962)
  const moodPalette = runtimeMoodPalette(
    runtimeBiomePalette(region.biome),
    region.mood,
  )
  const bankWater = new THREE.Color(moodPalette.low).lerp(new THREE.Color(0x668f83), .58)
  const sheenWater = new THREE.Color(0x8bc5bd)
  const waterColor = new THREE.Color()

  let flowDistance = 0
  rows.forEach((row, rowIndex) => {
    if (rowIndex) flowDistance += Math.hypot(row.x-rows[rowIndex-1].x,row.z-rows[rowIndex-1].z)
    row.points.forEach((point, laneIndex) => {
      const u = laneIndex / Math.max(1, lanes - 1)
      const v = flowDistance
      const edge = Math.pow(Math.abs(u * 2 - 1), 1.55)
      const flowWave = Math.sin(rowIndex * .31 + laneIndex * .46)
        + Math.sin(rowIndex * .12 - laneIndex * .24 + 1.35)
      const sheen = Math.max(0, flowWave * .5) * (.07 - edge * .025)

      positions.push(point.x, point.y, point.z)
      uvs.push(u, v)
      waterColor.copy(deepWater).lerp(bankWater, edge * .78).lerp(sheenWater, sheen)
      colors.push(waterColor.r, waterColor.g, waterColor.b)
    })
  })

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    for (let laneIndex = 0; laneIndex < lanes - 1; laneIndex += 1) {
      const a = rowIndex * lanes + laneIndex
      const b = a + 1
      const c = (rowIndex + 1) * lanes + laneIndex
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
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


function appendRuntimeRiverObstacles(
  region: GeneratedRegion,
  obstacles: CircleObstacle[],
) {
  if (region.terrain.stream.length < 2) return

  const surface = streamWaterSurfaceRows(region, 5, .085)
  for (let index = 0; index < surface.rows.length; index += 2) {
    const row = surface.rows[index]
    if (
      row.x < region.bounds.minX ||
      row.x > region.bounds.maxX ||
      row.z < region.bounds.minZ ||
      row.z > region.bounds.maxZ
    ) {
      continue
    }

    const crossingOpen = region.crossings.some((crossing) => {
      const openingRadius =
        crossing.kind === 'bridge'
          ? Math.max(2.7, crossing.width * .72)
          : Math.max(2.45, crossing.width * .68)
      return Math.hypot(row.x - crossing.x, row.z - crossing.z) < openingRadius
    })
    if (crossingOpen) continue

    // Movement collision expands this by the actor radius, and navigation adds
    // its own clearance. This keeps feet out of the visible water without
    // widening the blocked corridor far beyond the banks.
    obstacles.push({
      x: row.x,
      z: row.z,
      radius: Math.max(.34, row.width * .5 - .28),
    })
  }
}


function runtimeWalkSurfaceHeight(
  region: GeneratedRegion,
  x: number,
  z: number,
) {
  const terrainHeight = sampleTerrainHeight(region, x, z)
  let surfaceHeight = terrainHeight

  for (const crossing of region.crossings) {
    if (crossing.kind !== 'bridge') continue

    const dx = x - crossing.x
    const dz = z - crossing.z
    const cos = Math.cos(crossing.rotation)
    const sin = Math.sin(crossing.rotation)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos
    const { length, width: deckWidth } = forgeBridgeDimensions(crossing.width)

    if (
      Math.abs(localX) > length * .5 + .12 ||
      Math.abs(localZ) > deckWidth * .5 + .08
    ) {
      continue
    }

    const streamHeight = sampleStreamHeight(
      region,
      crossing.x,
      crossing.z,
    )
    const bridgeCenterHeight = Math.max(
      streamHeight + .3,
      sampleTerrainHeight(region, crossing.x, crossing.z) + .1,
    )
    surfaceHeight = Math.max(surfaceHeight, bridgeCenterHeight + .058)
  }

  return surfaceHeight
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
    const { width: bridgeWidth, length } = forgeBridgeDimensions(crossing.width)
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
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(
          length,
          FORGE_WORLD_SCALE.bridgeRailThickness,
          .12,
        ),
        railMaterial,
      )
      rail.position.set(
        0,
        FORGE_WORLD_SCALE.bridgeRailHeight,
        side * bridgeWidth * .54,
      )
      rail.castShadow = true
      group.add(rail)

      for (const x of [-length * .42, 0, length * .42]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(.13, FORGE_WORLD_SCALE.bridgePostHeight, .13),
          railMaterial,
        )
        post.position.set(
          x,
          FORGE_WORLD_SCALE.bridgePostHeight * .5,
          side * bridgeWidth * .54,
        )
        post.castShadow = true
        group.add(post)
      }
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

function addGeneratedDressing(
  scene: THREE.Scene,
  region: GeneratedRegion,
  obstacles: CircleObstacle[],
  cameraOccluders: THREE.Group[] = [],
) {
  const palette = runtimeMoodPalette(
    runtimeBiomePalette(region.biome),
    region.mood,
  )
  const surfacePalette = runtimeMoodPalette(
    runtimeSurfacePalette(region.biome),
    region.mood,
  )
  const treeVariantColors = runtimeTreeVariantColors(
    region.biome,
    palette.tree,
  ).map((color) => runtimeMoodColor(color, region.mood))
  const groundCoverColors = runtimeMoodPalette(
    runtimeGroundCoverColors(region.biome, palette.fern),
    region.mood,
  )
  const corruptTrees = region.biome.toLowerCase().includes('corrupt')
  const bankPatchGeometry = new THREE.CircleGeometry(1, 10)
  bankPatchGeometry.rotateX(-Math.PI / 2)
  const bankPatchColor = new THREE.Color(surfacePalette.soil)
    .lerp(new THREE.Color(palette.low), .34)
    .multiplyScalar(.82)
  const bankPatchMaterial = new THREE.MeshStandardMaterial({
    color: bankPatchColor,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })

  const treeTrunkGeometry = forestTrunk()
  const treeTrunkMaterial = markWorldWindMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x382c22,
      roughness: 1,
    }),
    .16,
  )
  const treeLowerMaterials = treeVariantColors.map(
    (color) =>
      markWorldWindMaterial(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color).multiplyScalar(.9),
          roughness: 1, vertexColors: true,
        }),
        .48,
      ),
  )
  const treeMiddleMaterials = treeVariantColors.map(
    (color) =>
      markWorldWindMaterial(
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1, vertexColors: true,
        }),
        .68,
      ),
  )
  const treeUpperMaterials = treeVariantColors.map(
    (color) =>
      markWorldWindMaterial(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color).multiplyScalar(1.1),
          roughness: 1, vertexColors: true,
        }),
        .9,
      ),
  )
  const treeLowerGeometries: THREE.BufferGeometry[] = [
    forestSpeciesCrown(1.52, 2.75, 0, 0),
    forestSpeciesCrown(1.72, 2.35, 1, 0),
    forestSpeciesCrown(1.18, 1.77, 2, 0),
    forestSpeciesCrown(1.34, 2.95, 3, 0),
  ]
  const treeMiddleGeometries: THREE.BufferGeometry[] = [
    forestSpeciesCrown(1.18, 2.45, 0, 1),
    forestSpeciesCrown(1.32, 2.15, 1, 1),
    forestSpeciesCrown(1.04, 1.56, 2, 1),
    forestSpeciesCrown(1.04, 2.55, 3, 1),
  ]
  const treeUpperGeometries: THREE.BufferGeometry[] = [
    forestSpeciesCrown(.82, 2.15, 0, 2),
    forestSpeciesCrown(.9, 1.92, 1, 2),
    forestSpeciesCrown(.82, 1.23, 2, 2),
    forestSpeciesCrown(.7, 2.2, 3, 2),
  ]
  const treeAccentGeometries: THREE.BufferGeometry[] = [
    forestSpeciesCrown(.78, .88, 0, 3),
    forestSpeciesCrown(.92, .72, 1, 3),
    forestSpeciesCrown(.66, 0.99, 2, 3),
    forestSpeciesCrown(.7, .96, 3, 3),
  ]
  const deadTreeGeometries=[0,1,2,3].map(forestDeadTree)
  const deadTreeMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1})

  const signaturePatchGeometry = new THREE.CircleGeometry(1, 9)
  signaturePatchGeometry.rotateX(-Math.PI / 2)
  const leafPatchMaterial = new THREE.MeshStandardMaterial({
    color: 0x75502f,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const mudPatchMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(surfacePalette.soil)
      .lerp(new THREE.Color(palette.low), .48)
      .multiplyScalar(.72),
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const corruptScarMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a293d,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const flowerGeometry = new THREE.DodecahedronGeometry(.085, 0)
  const flowerWarmMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2b85e,
    roughness: 1,
  })
  const flowerCoolMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d77b5,
    roughness: 1,
  })
  const outcropGeometry = new THREE.DodecahedronGeometry(.72, 0)
  const outcropMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.rock).multiplyScalar(.9),
    roughness: 1,
  })
  const hedgeGeometry = new THREE.DodecahedronGeometry(.55, 0)
  const hedgeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.tree)
      .lerp(new THREE.Color(palette.fern), .55),
    roughness: 1,
  })
  const rootGeometry = new THREE.CylinderGeometry(.07, .13, 2.15, 5)
  rootGeometry.rotateZ(Math.PI / 2)
  const rootMaterial = new THREE.MeshStandardMaterial({
    color: 0x423027,
    roughness: 1,
  })

  for (const item of region.dressing) {
    if (forgePoiClearsDressing(region.pois, item.x, item.z)) continue
    if (item.type === 'bank-patch') {
      const patch = new THREE.Mesh(bankPatchGeometry, bankPatchMaterial)
      patch.position.set(item.x, item.y + .028, item.z)
      patch.rotation.y = item.rotation
      patch.scale.set(
        item.scale * (1.38 + item.variant * .11),
        1,
        item.scale * (.42 + (item.variant % 2) * .08),
      )
      patch.receiveShadow = true
      patch.renderOrder = 2
      scene.add(patch)
    } else if (item.type === 'leaf-patch' || item.type === 'mud-patch') {
      const material =
        item.type === 'leaf-patch'
          ? leafPatchMaterial
          : mudPatchMaterial
      const patch = new THREE.Mesh(signaturePatchGeometry, material)
      patch.position.set(item.x, item.y + .031, item.z)
      patch.rotation.y = item.rotation
      const widthScale = item.type === 'mud-patch' ? 1.82 : 1.45
      const depthScale = item.type === 'mud-patch' ? .9 : .68
      patch.scale.set(
        item.scale * widthScale * (1 + item.variant * .07),
        1,
        item.scale * depthScale * (1 + (item.variant % 2) * .08),
      )
      patch.receiveShadow = true
      patch.renderOrder = 2
      scene.add(patch)
    } else if (item.type === 'corrupt-scar') {
      for (let piece = 0; piece < 3; piece += 1) {
        const angle = item.rotation + piece * 2.17 + item.variant * .13
        const radius = piece === 0 ? 0 : (.34 + piece * .12) * item.scale
        const patch = new THREE.Mesh(signaturePatchGeometry, corruptScarMaterial)
        patch.position.set(
          item.x + Math.cos(angle) * radius,
          item.y + .032 + piece * .002,
          item.z + Math.sin(angle) * radius,
        )
        patch.rotation.y = angle + piece * .27
        patch.scale.set(
          item.scale * (1.05 + piece * .2),
          1,
          item.scale * (.28 + (piece % 2) * .16),
        )
        patch.receiveShadow = true
        patch.renderOrder = 2
        scene.add(patch)
      }

      const corruptSpikeGeometry = new THREE.ConeGeometry(.12, .58, 5)
      const corruptSpikeMaterial = new THREE.MeshStandardMaterial({
        color: 0x4f3158,
        roughness: 1,
      })
      for (let spike = 0; spike < 2; spike += 1) {
        const angle = item.rotation + .75 + spike * 2.75 + item.variant * .19
        const radius = (.38 + spike * .2) * item.scale
        const spikeMesh = new THREE.Mesh(
          corruptSpikeGeometry,
          corruptSpikeMaterial,
        )
        const spikeScale = item.scale * (.72 + spike * .18)
        spikeMesh.position.set(
          item.x + Math.cos(angle) * radius,
          item.y + .24 * spikeScale,
          item.z + Math.sin(angle) * radius,
        )
        spikeMesh.rotation.set(
          spike ? -.12 : .09,
          angle,
          spike ? .14 : -.1,
        )
        spikeMesh.scale.setScalar(spikeScale)
        spikeMesh.castShadow = true
        scene.add(spikeMesh)
      }
    } else if (item.type === 'flower-patch') {
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = item.rotation + petal * 2.399
        const radius = (.16 + (petal % 3) * .11) * item.scale
        const head = new THREE.Mesh(
          flowerGeometry,
          petal < 3 ? flowerWarmMaterial : flowerCoolMaterial,
        )
        const size = item.scale * (.72 + (petal % 2) * .18)
        head.position.set(
          item.x + Math.cos(angle) * radius,
          item.y + .08 + (petal % 2) * .025,
          item.z + Math.sin(angle) * radius,
        )
        head.scale.setScalar(size)
        scene.add(head)
      }
    } else if (item.type === 'rock-outcrop') {
      const pieceCount = 5 + item.variant
      for (let piece = 0; piece < pieceCount; piece += 1) {
        const ring = piece === 0 ? 0 : 1 + Math.floor((piece - 1) / 3)
        const angle =
          item.rotation +
          piece * 2.18 +
          item.variant * .19 +
          ring * .27
        const radius =
          piece === 0
            ? 0
            : (.46 + ring * .34 + (piece % 3) * .08) * item.scale
        const size =
          item.scale *
          (piece === 0
            ? 1.18
            : .5 + ((piece + item.variant) % 4) * .11)
        const rock = new THREE.Mesh(outcropGeometry, outcropMaterial)
        rock.position.set(
          item.x + Math.cos(angle) * radius,
          item.y + .28 * size,
          item.z + Math.sin(angle) * radius,
        )
        rock.rotation.set(
          (piece % 3 - 1) * .1,
          angle,
          ((piece + item.variant) % 4 - 1.5) * .11,
        )
        rock.scale.set(
          size * (1.02 + (piece % 2) * .14),
          size * (.52 + ((piece + 1) % 3) * .12),
          size * (.9 + (piece % 3) * .08),
        )
        rock.castShadow = true
        rock.receiveShadow = true
        scene.add(rock)
      }
      obstacles.push({ x: item.x, z: item.z, radius: 1.55 * item.scale })
    } else if (item.type === 'hedge') {
      const hedge = new THREE.Group()
      hedge.position.set(item.x, item.y, item.z)
      hedge.rotation.y = item.rotation
      for (let piece = 0; piece < 4; piece += 1) {
        const part = new THREE.Mesh(hedgeGeometry, hedgeMaterial)
        part.position.set((piece - 1.5) * .68 * item.scale, .34 * item.scale, 0)
        part.rotation.y = (piece % 2) * .16
        part.scale.set(
          item.scale * .82,
          item.scale * (.58 + (piece % 2) * .08),
          item.scale * .7,
        )
        part.castShadow = true
        hedge.add(part)
      }
      scene.add(hedge)
      obstacles.push({ x: item.x, z: item.z, radius: 1.25 * item.scale })
    } else if (item.type === 'root-cluster') {
      for (let root = 0; root < 3; root += 1) {
        const angle =
          item.rotation +
          root * (1.72 + item.variant * .04) +
          (root === 2 ? .35 : 0)
        const radius = root * .16 * item.scale
        const rootMesh = new THREE.Mesh(rootGeometry, rootMaterial)
        rootMesh.position.set(
          item.x + Math.cos(angle) * radius,
          item.y + .1 + root * .025,
          item.z + Math.sin(angle) * radius,
        )
        rootMesh.rotation.set(
          (root - 1) * .08,
          angle,
          root % 2 ? -.08 : .1,
        )
        const rootScale = item.scale * (.72 + root * .12)
        rootMesh.scale.set(
          rootScale,
          item.scale * (.72 + root * .08),
          rootScale,
        )
        rootMesh.castShadow = true
        scene.add(rootMesh)
      }
    } else if (item.type === 'tree') {
      const displayScale = forgeTreePresentationScale(item.scale)
      const tree = new THREE.Group()
      tree.position.set(item.x, item.y, item.z)
      tree.rotation.set(
        corruptTrees ? (item.variant - 1.5) * .035 : 0,
        item.rotation,
        corruptTrees ? (item.variant % 2 ? -.045 : .045) : 0,
      )
      tree.scale.setScalar(displayScale)

      const trunk = new THREE.Mesh(treeTrunkGeometry, treeTrunkMaterial)
      trunk.position.y = 1.66
      trunk.scale.set(
        .9 + item.variant * .02,
        1 + item.variant * .025,
        .9 + item.variant * .02,
      )
      trunk.castShadow = true
      trunk.receiveShadow = true
      tree.add(trunk)

      const broadleaf = item.variant === 2
      const variant = item.variant
      const tierJitter =
        (.055 + variant * .015) *
        (corruptTrees ? 1.5 : 1)
      const lower = new THREE.Mesh(
        treeLowerGeometries[variant],
        treeLowerMaterials[variant],
      )
      lower.position.set(
        broadleaf ? -.22 : (variant % 2 ? -1 : 1) * tierJitter,
        broadleaf ? 3.7 : 3.32,
        broadleaf ? .05 : (variant < 2 ? 1 : -1) * tierJitter * .55,
      )
      lower.rotation.set(
        broadleaf ? (corruptTrees ? .05 : 0) : (variant - 1.5) * (corruptTrees ? .028 : .012),
        -.08 - variant * .018,
        broadleaf
          ? (corruptTrees ? -.06 : 0)
          : (variant % 2 ? -1 : 1) * (corruptTrees ? .055 : .018),
      )
      lower.scale.set(
        broadleaf ? 1 : 1.05,
        broadleaf ? 1.06 : .96,
        broadleaf ? 1 : .94,
      )
      lower.castShadow = true
      tree.add(lower)

      const middle = new THREE.Mesh(
        treeMiddleGeometries[variant],
        treeMiddleMaterials[variant],
      )
      middle.position.set(
        broadleaf ? .3 : (variant % 2 ? 1 : -1) * tierJitter * 1.5,
        broadleaf ? 4.25 : 4.25,
        broadleaf ? -.12 : (variant < 2 ? -1 : 1) * tierJitter,
      )
      middle.rotation.set(
        broadleaf ? (corruptTrees ? -.04 : 0) : (1.5 - variant) * (corruptTrees ? .032 : .016),
        .11 + variant * .026,
        broadleaf
          ? (corruptTrees ? .07 : 0)
          : (variant % 2 ? 1 : -1) * (corruptTrees ? .06 : .022),
      )
      const middleScale = broadleaf ? .94 : .78
      middle.scale.set(
        middleScale * (broadleaf ? 1 : 1.04),
        middleScale * (broadleaf ? 1.08 : .94),
        middleScale * (broadleaf ? 1 : .92),
      )
      middle.castShadow = true
      tree.add(middle)

      const upper = new THREE.Mesh(
        treeUpperGeometries[variant],
        treeUpperMaterials[variant],
      )
      upper.position.set(
        broadleaf ? .04 : (variant % 3 - 1) * tierJitter * 1.1,
        broadleaf ? 4.75 : 5.03,
        broadleaf ? .26 : (variant % 2 ? -.7 : .8) * tierJitter,
      )
      upper.rotation.set(
        broadleaf ? (corruptTrees ? .06 : 0) : (variant - 1.5) * (corruptTrees ? .04 : .02),
        -.16 + variant * .035,
        broadleaf
          ? (corruptTrees ? -.075 : 0)
          : (variant % 2 ? -1 : 1) * (corruptTrees ? .072 : .026),
      )
      const upperScale = broadleaf ? .78 : .57
      upper.scale.set(
        upperScale * (broadleaf ? 1 : 1.02),
        upperScale * (broadleaf ? 1.08 : .92),
        upperScale * (broadleaf ? 1 : .9),
      )
      upper.castShadow = true
      tree.add(upper)

      const accent = new THREE.Mesh(
        treeAccentGeometries[variant],
        treeMiddleMaterials[variant],
      )
      accent.position.set(
        broadleaf ? .42 : (variant % 2 ? -.42 : .38),
        broadleaf ? 4.12 : 3.92 + variant * .06,
        broadleaf ? .18 : (variant < 2 ? .28 : -.24),
      )
      accent.rotation.set(
        broadleaf ? .08 : (variant % 2 ? -.08 : .06),
        .32 + variant * .11,
        broadleaf ? -.06 : (variant % 2 ? .12 : -.1),
      )
      const accentScale = broadleaf ? .72 : .66 + variant * .035
      accent.scale.set(
        accentScale * (broadleaf ? 1.05 : 1.18),
        accentScale * (broadleaf ? .92 : .78),
        accentScale,
      )
      accent.castShadow = true
      tree.add(accent)

      tree.userData.forgeCameraOccluder = true
      tree.userData.forgeOcclusionRadius =
        (broadleaf ? 1.72 : 1.48) * displayScale
      tree.userData.forgeOcclusionHeight = 6.35 * displayScale
      tree.userData.forgeOcclusionOpacity = 1
      cameraOccluders.push(tree)

      scene.add(tree)
      obstacles.push({ x: item.x, z: item.z, radius: .44 * displayScale })
    } else if (item.type === 'dead-tree') {
      const tree = new THREE.Group()
      tree.position.set(item.x, item.y, item.z)
      tree.rotation.y = item.rotation
      tree.scale.setScalar(item.scale)

      const wood = new THREE.Mesh(deadTreeGeometries[item.variant%4],deadTreeMaterial)
      wood.castShadow=true;wood.receiveShadow=true;tree.add(wood)

      tree.userData.forgeCameraOccluder = true
      tree.userData.forgeOcclusionRadius = 1.3 * item.scale
      tree.userData.forgeOcclusionHeight = 5.15 * item.scale
      tree.userData.forgeOcclusionOpacity = 1
      cameraOccluders.push(tree)

      scene.add(tree)
      obstacles.push({ x: item.x, z: item.z, radius: .36 * item.scale })
    } else if (item.type === 'rock') {
      const rock = new THREE.Mesh(
        forestRock(.7 * item.scale),
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
        forestLog(2.4 * item.scale),
        new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 }),
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
        forestFern().scale(item.scale,item.scale,item.scale),
        markWorldWindMaterial(
          new THREE.MeshStandardMaterial({ color: groundCoverColors.fern, side: THREE.DoubleSide, roughness: 1 }),
          .72,
        ),
      )
      fern.position.set(item.x, item.y + .015, item.z)
      fern.rotation.y = item.rotation
      scene.add(fern)
    } else if (item.type === 'grass') {
      const grass = new THREE.Mesh(
        forestGrass().scale(item.scale, item.scale, item.scale),
        markWorldWindMaterial(
          new THREE.MeshStandardMaterial({ color: groundCoverColors.grass, vertexColors: true, side: THREE.DoubleSide, roughness: 1 }),
          .9,
        ),
      )
      grass.position.set(item.x, item.y + .015, item.z)
      grass.rotation.y = item.rotation
      scene.add(grass)
    } else if (item.type === 'shrub') {
      const shrub = new THREE.Mesh(
        new THREE.DodecahedronGeometry(.45 * item.scale, 0),
        new THREE.MeshStandardMaterial({ color: groundCoverColors.shrub, roughness: 1 }),
      )
      shrub.position.set(item.x, item.y + .34 * item.scale, item.z)
      shrub.scale.y = .72
      shrub.rotation.y = item.rotation
      shrub.castShadow = true
      scene.add(shrub)
    } else if (item.type === 'reeds') {
      const material = markWorldWindMaterial(
        new THREE.MeshStandardMaterial({ color: groundCoverColors.reeds, roughness: 1 }),
        1,
      )
      const bladesPerCluster = 6
      for (let blade = 0; blade < bladesPerCluster; blade += 1) {
        const angle = item.rotation + blade * 1.37 + item.variant * .16
        const radius = .1 + (blade % 3) * .09
        const reed = new THREE.Mesh(
          new THREE.CylinderGeometry(
            .03,
            .05,
            .95 * item.scale * (.88 + (blade % 4) * .1),
            5,
          ),
          material,
        )
        reed.position.set(
          item.x + Math.cos(angle) * radius,
          item.y + .42 * item.scale,
          item.z + Math.sin(angle) * radius,
        )
        reed.rotation.z =
          (blade - (bladesPerCluster - 1) / 2) * .022
        scene.add(reed)
      }
    }
  }
}

function addGeneratedPois(
  scene: THREE.Scene,
  region: GeneratedRegion,
  obstacles: CircleObstacle[],
): RuntimeInteraction[] {
  const interactions: RuntimeInteraction[] = []
  const authoredPoiSettings = loadAuthoredPoiSettings()
  const authoredPoiPrefabs = authoredPoiSettings.enabled
    ? loadPoiPrefabs()
    : []
  const authoredPropPrefabs = authoredPoiSettings.enabled
    ? loadPropPrefabs()
    : []
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x62685f, roughness: 1 })
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x444943, roughness: 1 })
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5d5742, roughness: 1 })
  const wood = new THREE.MeshStandardMaterial({ color: 0x513c2c, roughness: 1 })
  const green = new THREE.MeshStandardMaterial({ color: 0x2f4b34, roughness: 1 })

  for (const poi of region.pois) {
    const group = new THREE.Group()
    group.userData.forgePoiId = poi.id
    group.userData.forgePoiType = poi.type
    const resolvedPrefab = resolvePoiPrefab(
      authoredPoiPrefabs,
      region,
      poi,
      authoredPoiSettings,
    )
    const poiVisualScale =
      resolvedPrefab?.worldScale ?? forgePoiVisualScale(poi.type)
    const poiRotation =
      resolvedPrefab?.worldRotation ??
      forgePoiPresentationRotation(region.nodes, poi)
    group.position.set(poi.x, sampleTerrainHeight(region, poi.x, poi.z), poi.z)
    group.rotation.y = poiRotation
    group.scale.setScalar(poiVisualScale)

    if (resolvedPrefab) {
      group.userData.forgePoiPrefabId = resolvedPrefab.prefab.id
      group.userData.forgePoiPrefabName = resolvedPrefab.prefab.name
      group.add(buildPoiPrefabVisual(resolvedPrefab.prefab))

      for (
        const placement of collectPoiGameplaySockets(
          resolvedPrefab.prefab,
          authoredPropPrefabs,
        )
      ) {
        if (!isRuntimeInteractableSocket(placement.socket)) continue
        const runtimeSocket: GameplaySocket = {
          ...placement.socket,
          id: `${region.regionId}:${poi.id}:${placement.id}`,
          position: [...placement.position],
          rotation: [...placement.rotation],
        }
        const marker = buildGameplaySocketMarker(
          runtimeSocket,
          { runtime: true },
        )
        marker.visible = false
        marker.userData.forgeInteractionSource =
          placement.sourceName
        group.add(marker)
        interactions.push({
          id: runtimeSocket.id,
          socket: runtimeSocket,
          anchor: marker,
          sourceName: placement.sourceName,
          radiusScale:
            placement.scale * poiVisualScale,
          cooldownRemaining: 0,
          activationCount: 0,
          used: false,
        })
      }

      appendAuthoredPoiLegacyObstacles(
        poi,
        poiVisualScale,
        poiRotation,
        obstacles,
      )
    } else if (poi.type === 'ruins') {
      runtimeBox(group, -3.15, .9, .4, .6, 1.8, 4.8, stoneMaterial)
      runtimeBox(group, 3, .65, -.9, .6, 1.3, 3.4, darkStone)
      runtimeBox(group, -1.75, .7, -2.65, 2.8, 1.4, .55, stoneMaterial)
      runtimeBox(group, 2.25, .38, 2.45, 2.7, .76, .6, darkStone)
      runtimeBox(group, -.95, 1.45, 2.8, .62, 2.9, .65, stoneMaterial)
      runtimeBox(group, 1.05, 1.15, 2.8, .62, 2.3, .65, stoneMaterial)
      // Broken lintel: the missing centre makes the gateway read as collapsed.
      runtimeBox(group, -.83, 2.55, 2.8, 1.05, .5, .7, darkStone)
      runtimeBox(group, .94, 2.46, 2.8, .7, .42, .68, darkStone)

      const standingColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(.32, .45, 2.35, 6),
        stoneMaterial,
      )
      standingColumn.position.set(-2.25, 1.16, -1.2)
      standingColumn.rotation.z = -.05
      group.add(standingColumn)

      const fallenColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(.3, .42, 2.75, 6),
        darkStone,
      )
      fallenColumn.position.set(1.45, .34, -2.05)
      fallenColumn.rotation.set(.08, .42, Math.PI / 2)
      group.add(fallenColumn)

      obstacles.push({ x: poi.x, z: poi.z, radius: 3 * poiVisualScale })
    } else if (poi.type === 'camp' || poi.type === 'settlement') {
      const count = poi.type === 'settlement' ? 5 : 3
      const tentRandom = runtimeVisualRandom(`${poi.id}:tent-layout`)
      for (let i = 0; i < count; i += 1) {
        const baseAngle = i / count * Math.PI * 2 + .35
        const angle = baseAngle + (tentRandom() - .5) * .3
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.2, 4), cloth)
        const baseRadius = poi.type === 'settlement' ? 4.5 : 3.7
        const tentRadius = baseRadius + (tentRandom() - .5) * .9
        tent.position.set(
          Math.cos(angle) * tentRadius,
          1.05,
          Math.sin(angle) * tentRadius,
        )
        tent.rotation.y =
          angle +
          Math.PI / 4 +
          (tentRandom() - .5) * .34
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
        const benchAngle =
          i / 4 * Math.PI * 2 +
          .45 +
          (tentRandom() - .5) * .12
        const benchRadius = 1.45 + (tentRandom() - .5) * .18
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.15, .22, .28), wood)
        bench.position.set(
          Math.cos(benchAngle) * benchRadius,
          .22,
          Math.sin(benchAngle) * benchRadius,
        )
        bench.rotation.y =
          -benchAngle +
          (tentRandom() - .5) * .08
        group.add(bench)
      }

      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(.24, .31, .3, 8),
        darkStone,
      )
      pot.position.set(.18, .34, -.12)
      group.add(pot)

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(.34, .38, .72, 8),
        wood,
      )
      barrel.position.set(-2.25, .36, 1.35)
      barrel.rotation.z = .04
      group.add(barrel)

      const bedrollCount = poi.type === 'settlement' ? 3 : 2
      for (let i = 0; i < bedrollCount; i += 1) {
        const angle = 1.9 + i * 1.6 + (tentRandom() - .5) * .2
        const radius = (poi.type === 'settlement' ? 3.15 : 2.75) + i * .18
        const bedroll = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, .14, .5),
          cloth,
        )
        bedroll.position.set(
          Math.cos(angle) * radius,
          .09,
          Math.sin(angle) * radius,
        )
        bedroll.rotation.y = -angle + .25
        group.add(bedroll)
      }

      const sackMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b6045,
        roughness: 1,
      })
      for (let i = 0; i < 2; i += 1) {
        const sack = new THREE.Mesh(
          new THREE.SphereGeometry(.27 + i * .05, 7, 5),
          sackMaterial,
        )
        sack.scale.y = 1.2
        sack.position.set(-1.75 + i * .48, .28, -2.05 + i * .2)
        group.add(sack)
      }

      const fireGlow = new THREE.PointLight(0xff8738, .9, 6)
      fireGlow.userData.forgeEnvironmentLightBase = .9
      fireGlow.position.set(0, .7, 0)
      group.add(fireGlow)

      obstacles.push({ x: poi.x, z: poi.z, radius: (poi.type === 'settlement' ? 4.5 : 3.7) * poiVisualScale })
    } else if (poi.type === 'watchtower') {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.95, 5.6, 8),
        stoneMaterial,
      )
      tower.position.y = 2.68
      tower.castShadow = true
      group.add(tower)

      // Only part of the upper wall survives. The missing rear quarter and
      // uneven battlements make "Ruined Watchtower" readable at gameplay scale.
      const upperWall = new THREE.Mesh(
        new THREE.CylinderGeometry(
          1.58,
          1.64,
          1.55,
          8,
          1,
          true,
          -Math.PI * .75,
          Math.PI * 1.5,
        ),
        darkStone,
      )
      upperWall.position.y = 5.92
      upperWall.castShadow = true
      group.add(upperWall)

      const survivingAngles = [-.62, -.32, 0, .31, .58].map(
        (value) => value * Math.PI,
      )
      survivingAngles.forEach((angle, index) => {
        const battlement = new THREE.Mesh(
          new THREE.BoxGeometry(
            index === 2 ? .56 : .46,
            .55 + (index % 2) * .16,
            .5,
          ),
          darkStone,
        )
        battlement.position.set(
          Math.sin(angle) * 1.56,
          6.82 + (index % 2) * .06,
          Math.cos(angle) * 1.56,
        )
        battlement.rotation.y = angle
        group.add(battlement)
      })

      const collapsedCap = new THREE.Mesh(
        new THREE.BoxGeometry(.72, .45, .58),
        darkStone,
      )
      collapsedCap.position.set(1.95, .34, -1.6)
      collapsedCap.rotation.set(.22, .42, .28)
      group.add(collapsedCap)
      const doorwayRecess = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, 1.72, .18),
        new THREE.MeshStandardMaterial({
          color: 0x161914,
          roughness: 1,
        }),
      )
      doorwayRecess.position.set(0, .96, 1.98)
      group.add(doorwayRecess)
      runtimeBox(group, -.63, 1.02, 2.05, .2, 1.95, .28, darkStone)
      runtimeBox(group, .63, 1.02, 2.05, .2, 1.95, .28, darkStone)
      runtimeBox(group, 0, 1.95, 2.05, 1.46, .22, .3, darkStone)
      runtimeBox(group, -2.8, .7, -1.6, .55, 1.4, 3.4, darkStone)
      obstacles.push({ x: poi.x, z: poi.z, radius: 2.2 * poiVisualScale })
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
      for (const localX of [-1.7, 1.7]) {
        obstacles.push({
          x: poi.x + Math.cos(poiRotation) * localX * poiVisualScale,
          z: poi.z - Math.sin(poiRotation) * localX * poiVisualScale,
          radius: .8 * poiVisualScale,
        })
      }
    } else if (poi.type === 'shrine') {
      // Stepped altar + rear stone frame gives the shrine a recognizable
      // silhouette instead of reading as a stack of blocks.
      runtimeBox(group, 0, .12, .45, 3.5, .24, 3.1, darkStone)
      runtimeBox(group, 0, .33, .5, 2.85, .22, 2.45, stoneMaterial)
      runtimeBox(group, 0, .68, .1, 1.55, .48, .9, darkStone)
      runtimeBox(group, 0, 1.08, -.55, .92, 1.35, .55, stoneMaterial)
      runtimeBox(group, -1.15, 1.5, -.78, .38, 2.45, .42, darkStone)
      runtimeBox(group, 1.15, 1.5, -.78, .38, 2.45, .42, darkStone)
      runtimeBox(group, 0, 2.72, -.78, 2.72, .34, .5, darkStone)

      const offeringMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8a06b,
        emissive: 0x6a4b1e,
        emissiveIntensity: .45,
        roughness: .7,
      })
      for (const x of [-.42, .42]) {
        const candle = new THREE.Mesh(
          new THREE.CylinderGeometry(.07, .08, .3, 7),
          offeringMaterial,
        )
        candle.position.set(x, 1.02, .16)
        group.add(candle)

        const flame = new THREE.Mesh(
          new THREE.SphereGeometry(.075, 7, 5),
          new THREE.MeshStandardMaterial({
            color: 0xffd27a,
            emissive: 0xff9b39,
            emissiveIntensity: 1.2,
            roughness: .4,
          }),
        )
        flame.scale.y = 1.5
        flame.position.set(x, 1.25, .16)
        group.add(flame)
      }

      const shrineGlow = new THREE.PointLight(0xd6b36d, 1.15, 7)
      shrineGlow.userData.forgeEnvironmentLightBase = 1.15
      shrineGlow.position.set(0, 1.5, .1)
      group.add(shrineGlow)
    } else if (poi.type === 'standing-stones') {
      for (let i = 0; i < 7; i += 1) {
        const angle = i / 7 * Math.PI * 2
        const radius = i === 0 ? 0 : 3
        const height = i === 0 ? 3.8 : 2.4 + (i % 3) * .35
        const stone = new THREE.Mesh(
          new THREE.CylinderGeometry(
            i === 0 ? .4 : .29,
            i === 0 ? .56 : .43,
            height,
            5,
          ),
          i % 2 ? stoneMaterial : darkStone,
        )
        stone.position.set(
          Math.cos(angle) * radius,
          height * .5,
          Math.sin(angle) * radius,
        )
        stone.rotation.set(
          (i % 2 ? .04 : -.03),
          angle * .23,
          (i % 3 - 1) * .07,
        )
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
      // Organic boulder mound instead of a manufactured torus/slab cave.
      const denRock = (
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        material: THREE.Material,
        rotation = 0,
      ) => {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1, 0),
          material,
        )
        rock.position.set(x, y, z)
        rock.scale.set(sx, sy, sz)
        rock.rotation.set(.08 * Math.sin(rotation), rotation, .06 * Math.cos(rotation))
        rock.castShadow = true
        group.add(rock)
      }

      denRock(-1.48, .92, .36, .9, 1.2, .85, darkStone, -.24)
      denRock(1.43, .9, .34, .92, 1.15, .86, stoneMaterial, .3)
      denRock(-.72, 1.72, .2, .86, 1.02, .78, stoneMaterial, -.1)
      denRock(.36, 1.95, .15, .94, 1.08, .82, darkStone, .2)
      denRock(1.12, 1.62, .2, .82, .96, .76, stoneMaterial, .46)
      denRock(-1.72, .48, -.72, 1.08, .72, 1.0, stoneMaterial, -.35)
      denRock(-.35, .5, -1.05, 1.35, .74, 1.2, darkStone, .12)
      denRock(1.25, .46, -.88, 1.18, .68, 1.05, stoneMaterial, .42)

      const mouth = new THREE.Mesh(
        new THREE.PlaneGeometry(2.45, 1.95),
        new THREE.MeshBasicMaterial({
          color: 0x050705,
          side: THREE.DoubleSide,
        }),
      )
      mouth.position.set(0, .92, .56)
      group.add(mouth)

      const boneMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8b29a,
        roughness: .92,
      })
      for (let i = 0; i < 2; i += 1) {
        const bone = new THREE.Mesh(
          new THREE.CylinderGeometry(.045, .055, .82, 6),
          boneMaterial,
        )
        bone.position.set(-.62 + i * .34, .09, 1.85 + i * .16)
        bone.rotation.set(.05, .35 + i * .75, Math.PI / 2)
        group.add(bone)
      }
      const skull = new THREE.Mesh(
        new THREE.SphereGeometry(.19, 7, 5),
        boneMaterial,
      )
      skull.scale.set(1, .8, .85)
      skull.position.set(-.2, .19, 1.72)
      group.add(skull)
    }

    addRuntimePoiEnvironment(group, poi, stoneMaterial, darkStone, wood, green)

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = !object.userData.forgePoiGround
        object.receiveShadow = true
      }
    })
    scene.add(group)
  }

  return interactions
}

function appendAuthoredPoiLegacyObstacles(
  poi: GeneratedRegion['pois'][number],
  poiVisualScale: number,
  poiRotation: number,
  obstacles: CircleObstacle[],
) {
  const radius = authoredPoiRuntimeObstacleRadius(poi.type)
  if (radius !== undefined) {
    obstacles.push({
      x: poi.x,
      z: poi.z,
      radius: radius * poiVisualScale,
    })
    return
  }

  if (poi.type === 'dungeon') {
    for (const localX of [-1.7, 1.7]) {
      obstacles.push({
        x: poi.x + Math.cos(poiRotation) * localX * poiVisualScale,
        z: poi.z - Math.sin(poiRotation) * localX * poiVisualScale,
        radius: .8 * poiVisualScale,
      })
    }
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
  const jitter = (amount = .24) => (random() - .5) * amount

  type GroundProfile = {
    core: number
    edge: number
    width: number
    depth: number
    coreOpacity: number
    edgeOpacity: number
  }

  const groundProfiles: Record<string, GroundProfile> = {
    ruins: {
      core: 0x49483a,
      edge: 0x46503b,
      width: 3.9,
      depth: 3.6,
      coreOpacity: .46,
      edgeOpacity: .22,
    },
    graveyard: {
      core: 0x414333,
      edge: 0x42513a,
      width: 3.65,
      depth: 3.45,
      coreOpacity: .48,
      edgeOpacity: .2,
    },
    camp: {
      core: 0x5a4127,
      edge: 0x4b5131,
      width: 3.7,
      depth: 3.35,
      coreOpacity: .54,
      edgeOpacity: .24,
    },
    settlement: {
      core: 0x5b432a,
      edge: 0x4c5232,
      width: 4.7,
      depth: 4.2,
      coreOpacity: .56,
      edgeOpacity: .25,
    },
    shrine: {
      core: 0x46503d,
      edge: 0x40573e,
      width: 2.85,
      depth: 2.6,
      coreOpacity: .3,
      edgeOpacity: .16,
    },
    'standing-stones': {
      core: 0x46503d,
      edge: 0x40573e,
      width: 3.45,
      depth: 3.25,
      coreOpacity: .3,
      edgeOpacity: .16,
    },
    'beast-den': {
      core: 0x453526,
      edge: 0x3f4a31,
      width: 3.45,
      depth: 2.9,
      coreOpacity: .58,
      edgeOpacity: .24,
    },
    watchtower: {
      core: 0x484536,
      edge: 0x43503a,
      width: 3.1,
      depth: 2.9,
      coreOpacity: .44,
      edgeOpacity: .2,
    },
    dungeon: {
      core: 0x42423a,
      edge: 0x414f3a,
      width: 3.55,
      depth: 3.15,
      coreOpacity: .5,
      edgeOpacity: .22,
    },
  }

  const profile = groundProfiles[poi.type] ?? groundProfiles.ruins

  const irregularGroundGeometry = (phase: number, points = 11) => {
    const shape = new THREE.Shape()
    for (let index = 0; index < points; index += 1) {
      const angle = index / points * Math.PI * 2
      const wobble =
        .83 +
        .12 * Math.sin(index * 2.31 + phase) +
        .08 * Math.sin(index * 4.17 + phase * 1.7)
      const x = Math.cos(angle) * wobble
      const y = Math.sin(angle) * wobble
      if (index === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }

  const addGroundPatch = (
    x: number,
    z: number,
    width: number,
    depth: number,
    color: number,
    opacity: number,
    rotation: number,
    phase: number,
    renderOrder: number,
  ) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const patch = new THREE.Mesh(irregularGroundGeometry(phase), material)
    patch.rotation.x = -Math.PI / 2
    patch.rotation.z = rotation
    patch.position.set(x, .034 + renderOrder * .002, z)
    patch.scale.set(width, depth, 1)
    patch.receiveShadow = true
    patch.userData.forgePoiGround = true
    patch.renderOrder = renderOrder
    group.add(patch)
  }

  const addWornArc = (
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    length: number,
    color: number,
    opacity: number,
    rotation = 0,
  ) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(
        innerRadius,
        outerRadius,
        16,
        1,
        startAngle,
        length,
      ),
      material,
    )
    arc.rotation.x = -Math.PI / 2
    arc.rotation.z = rotation
    arc.position.y = .045
    arc.receiveShadow = true
    arc.userData.forgePoiGround = true
    arc.renderOrder = 4
    group.add(arc)
  }

  // Keep the darkest wear under the actual landmark and bias it away from the
  // local +Z entrance so the generated access path remains visually readable.
  addGroundPatch(
    0,
    -.45,
    profile.width,
    profile.depth * .84,
    profile.core,
    profile.coreOpacity,
    -.06,
    .4,
    2,
  )
  addGroundPatch(
    -profile.width * .34,
    .08,
    profile.width * .58,
    profile.depth * .6,
    profile.edge,
    profile.edgeOpacity,
    .28,
    1.7,
    3,
  )
  addGroundPatch(
    profile.width * .35,
    -.02,
    profile.width * .56,
    profile.depth * .57,
    profile.edge,
    profile.edgeOpacity * .92,
    -.34,
    2.9,
    3,
  )
  addGroundPatch(
    -.08,
    -profile.depth * .58,
    profile.width * .7,
    profile.depth * .42,
    profile.edge,
    profile.edgeOpacity * .78,
    .12,
    4.2,
    3,
  )

  // Two light side patches frame the entrance instead of painting over the
  // centreline. The branch/road underneath therefore stays visible.
  addGroundPatch(
    -profile.width * .48,
    profile.depth * .64,
    profile.width * .3,
    profile.depth * .28,
    profile.edge,
    profile.edgeOpacity * .56,
    .18,
    5.3,
    3,
  )
  addGroundPatch(
    profile.width * .48,
    profile.depth * .64,
    profile.width * .3,
    profile.depth * .28,
    profile.edge,
    profile.edgeOpacity * .52,
    -.22,
    6.1,
    3,
  )

  const addBlendTuft = (
    x: number,
    z: number,
    scale: number,
    rotation: number,
  ) => {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(.11, .48, 4),
      green,
    )
    tuft.position.set(x, .23 * scale, z)
    tuft.rotation.set(.05, rotation, -.08)
    tuft.scale.set(scale, scale, scale * .72)
    tuft.castShadow = false
    group.add(tuft)
  }

  const tuftAngles = [
    -.25,
    .38,
    2.15,
    2.75,
    3.55,
    4.05,
  ]
  tuftAngles.forEach((angle, index) => {
    const radiusX = profile.width * (.86 + (index % 2) * .07)
    const radiusZ = profile.depth * (.83 + ((index + 1) % 2) * .08)
    addBlendTuft(
      Math.cos(angle) * radiusX,
      Math.sin(angle) * radiusZ - .12,
      .72 + (index % 3) * .12,
      angle + .3,
    )
  })

  const addRockAt = (x: number, z: number, scale = 1) => {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.34 + random() * .18, 0),
      random() > .42 ? stone : darkStone,
    )
    mesh.position.set(x + jitter(), .18, z + jitter())
    mesh.scale.set(scale * (1 + random() * .2), scale * (.55 + random() * .22), scale)
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }

  const addShrubAt = (x: number, z: number, scale = 1) => {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.42 + random() * .13, 0),
      green,
    )
    mesh.position.set(x + jitter(), .32, z + jitter())
    mesh.scale.set(scale, scale * .68, scale)
    mesh.rotation.y = random() * Math.PI
    group.add(mesh)
  }

  const addTimberAt = (
    x: number,
    z: number,
    rotation: number,
    length = 2.25,
    scale = 1,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(.12 * scale, .17 * scale, length, 6),
      wood,
    )
    mesh.rotation.set(0, rotation, Math.PI / 2)
    mesh.position.set(x + jitter(.16), .17 * scale, z + jitter(.16))
    group.add(mesh)
  }

  const addFence = (
    x: number,
    z: number,
    rotation: number,
    length = 2.4,
  ) => {
    runtimeBox(group, x, .42, z, length, .12, .12, wood)
    const rail = group.children[group.children.length - 1]
    rail.rotation.y = rotation
    for (const side of [-1, 1]) {
      runtimeBox(
        group,
        x + Math.cos(rotation) * length * .42 * side,
        .42,
        z - Math.sin(rotation) * length * .42 * side,
        .11,
        .82,
        .11,
        wood,
      )
    }
  }

  const addCrateStack = (x: number, z: number, rotation = 0) => {
    const positions = [
      [0, .32, 0],
      [.62, .32, .08],
      [.28, .88, .02],
    ] as const
    positions.forEach(([dx, y, dz], index) => {
      runtimeBox(
        group,
        x + dx,
        y,
        z + dz,
        .58,
        .58,
        .58,
        wood,
      )
      const crate = group.children[group.children.length - 1]
      crate.rotation.y = rotation + (index - 1) * .07
    })
  }

  const addMarkerPair = (
    z: number,
    gap: number,
    material: THREE.MeshStandardMaterial,
    height = 1.5,
  ) => {
    for (const side of [-1, 1]) {
      runtimeBox(group, side * gap, height * .5, z, .27, height, .27, material)
    }
  }

  if (poi.type === 'ruins') {
    // Foundation fragments and gateway wear make the ruin feel embedded without
    // expanding the soft blend back into a large POI disk.
    addGroundPatch(-1.15, 2.15, 1.25, .92, profile.core, .19, -.08, 7.2, 4)
    addGroundPatch(1.15, 2.12, 1.2, .88, profile.core, .17, .1, 8.1, 4)
    runtimeBox(group, -1.35, .08, -.55, 1.55, .16, 1.05, darkStone)
    const ruinFloorA = group.children[group.children.length - 1]
    ruinFloorA.rotation.y = .16
    runtimeBox(group, 1.05, .07, -1.25, 1.25, .14, .92, stone)
    const ruinFloorB = group.children[group.children.length - 1]
    ruinFloorB.rotation.y = -.23
    runtimeBox(group, 2.05, .07, 1.45, 1.05, .14, .72, darkStone)
    const ruinFloorC = group.children[group.children.length - 1]
    ruinFloorC.rotation.y = .31

    // Collapse and rubble follow the surviving walls instead of forming a ring.
    addRockAt(-4.15, -2.5, 1.05)
    addRockAt(-3.6, -3.05, .82)
    addRockAt(3.65, -2.35, 1.15)
    addRockAt(4.05, -1.55, .72)
    addRockAt(-3.85, 2.1, .76)
    addTimberAt(2.7, -3.45, .18, 3.1, 1.1)
    addTimberAt(3.25, -3.05, -.1, 2.55, .9)
    runtimeBox(group, -3.95, .38, -.15, 2.5, .76, .42, darkStone)
    const fallenWall = group.children[group.children.length - 1]
    fallenWall.rotation.set(.06, .18, -.13)
    runtimeBox(group, 2.85, .28, 3.55, 2.1, .56, .4, stone)
    const threshold = group.children[group.children.length - 1]
    threshold.rotation.y = -.12
    addShrubAt(-4.6, -3.3, .9)
    addShrubAt(4.5, -2.8, 1.05)
    addMarkerPair(5.05, 1.75, darkStone, 1.65)
  } else if (poi.type === 'watchtower') {
    // Tight base wear, low entry steps and guard-yard details visually anchor
    // the tower while keeping its overall footprint restrained.
    addGroundPatch(0, -.15, 2.2, 2.05, profile.core, .24, .04, 7.6, 4)
    runtimeBox(group, 0, .09, 2.48, 1.35, .18, .62, stone)
    runtimeBox(group, 0, .045, 2.9, 1.75, .09, .7, darkStone)
    addRockAt(-2.05, -.85, .58)
    addRockAt(2.15, -.65, .52)

    // A small guard yard, not a random debris halo.
    addFence(-4.15, .2, Math.PI / 2, 3)
    addFence(4.15, .25, Math.PI / 2, 3)
    addFence(-3.05, -3.7, .12, 2.25)
    addCrateStack(-3.45, -2.45, .12)
    addTimberAt(3.35, -2.9, .08, 2.8, 1)
    addTimberAt(3.55, -2.48, -.04, 2.35, .88)
    addRockAt(-2.6, 3.7, .78)
    addRockAt(2.75, 3.55, .9)
    addShrubAt(-4.1, -3.65, .9)
    addMarkerPair(4.8, 1.62, wood, 1.55)
  } else if (poi.type === 'graveyard') {
    // A very light inner wear patch and stone threshold are enough here; the
    // enclosure/rows already provide strong readability.
    addGroundPatch(0, 1.65, 1.55, 1.05, profile.core, .12, -.04, 7.9, 4)
    runtimeBox(group, 0, .06, 3.02, 1.75, .12, .52, stone)

    // Keep the grave rows readable; age the back corners and entrance instead.
    addShrubAt(-4.5, -2.85, 1.05)
    addShrubAt(4.45, -2.7, .92)
    addShrubAt(-4.55, 2.15, .82)
    addRockAt(-4.1, -3.4, .74)
    addRockAt(4.15, -3.25, .88)
    runtimeBox(group, 0, .78, -4.25, .72, 1.56, .56, darkStone)
    runtimeBox(group, 0, 1.56, -4.25, 1.4, .22, .5, stone)
    addFence(-4.2, 4.15, .08, 2.15)
    addFence(4.2, 4.15, -.08, 2.15)
    addMarkerPair(4.65, 2.42, darkStone, 1.7)
  } else if (poi.type === 'camp' || poi.type === 'settlement') {
    const settlement = poi.type === 'settlement'

    // Concentrate the strongest wear at the fire rather than darkening the
    // entire camp footprint.
    addGroundPatch(
      0,
      0,
      settlement ? 1.35 : 1.15,
      settlement ? 1.2 : 1.02,
      0x302b24,
      settlement ? .4 : .45,
      .08,
      8.4,
      4,
    )

    addCrateStack(-3.25, -2.75, .18)
    if (settlement) addCrateStack(-4.65, -1.4, -.16)
    addTimberAt(3.35, -2.65, .12, 2.9, 1)
    addTimberAt(3.62, -2.18, -.08, 2.55, .92)
    addTimberAt(3.08, -1.78, .04, 2.25, .82)
    addFence(-4.45, 1.25, Math.PI / 2 + .08, settlement ? 3 : 2.25)
    addFence(4.45, 1.15, Math.PI / 2 - .08, settlement ? 3 : 2.25)
    if (settlement) {
      addFence(-3.15, -4.45, .08, 2.6)
      addFence(3.15, -4.45, -.08, 2.6)
    }
    addShrubAt(-4.35, -3.5, .8)
    addShrubAt(4.45, -3.25, .85)
    addMarkerPair(settlement ? 5.7 : 4.7, settlement ? 2.05 : 1.65, wood, 1.5)
  } else if (poi.type === 'shrine' || poi.type === 'standing-stones') {
    if (poi.type === 'standing-stones') {
      // A broken, low-opacity ritual ring and a few chips create a readable
      // sacred centre without reintroducing a hard circular ground decal.
      addGroundPatch(0, -.05, 2.15, 1.95, profile.core, .12, .1, 8.8, 4)
      addWornArc(1.62, 1.92, .2, 2.15, profile.core, .22, .05)
      addWornArc(1.62, 1.92, 3.05, 1.75, profile.edge, .18, -.08)
      for (let index = 0; index < 4; index += 1) {
        const angle = .55 + index * 1.42
        const radius = 1.25 + (index % 2) * .45
        addRockAt(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          .32 + (index % 2) * .08,
        )
      }
    }

    const ring = poi.type === 'standing-stones' ? 4.7 : 4.15
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2 + .2
      addRockAt(Math.cos(angle) * ring, Math.sin(angle) * ring, .58 + (index % 2) * .13)
    }
    runtimeBox(group, -1.25, .18, 3.55, .65, .36, .65, stone)
    runtimeBox(group, 1.25, .18, 3.55, .65, .36, .65, stone)
    addShrubAt(-4.25, -2.6, .72)
    addShrubAt(4.15, -2.45, .72)
    addMarkerPair(4.35, 1.5, stone, 1.25)
  } else if (poi.type === 'beast-den') {
    addRockAt(-3.25, .85, 1.2)
    addRockAt(-2.85, -.35, .82)
    addRockAt(3.15, .75, 1.1)
    addRockAt(2.7, -.65, .78)
    addTimberAt(-3.45, -2.2, -.3, 2.8, 1)
    addTimberAt(3.25, -2.3, .22, 2.45, .9)
    addShrubAt(-3.8, -2.9, .85)
    addShrubAt(3.65, -2.75, .78)
  } else if (poi.type === 'dungeon') {
    // Broken approach stones deliberately frame the portal.
    for (const side of [-1, 1]) {
      runtimeBox(group, side * 3.2, .75, 3.45, .5, 1.5, .5, darkStone)
      const marker = group.children[group.children.length - 1]
      marker.rotation.z = side * .08
      runtimeBox(group, side * 4.05, .48, 1.75, .58, .96, .52, stone)
      const outer = group.children[group.children.length - 1]
      outer.rotation.z = -side * .11
      addRockAt(side * 3.9, -2.15, .9)
      addShrubAt(side * 4.25, -2.75, .7)
    }
    addRockAt(-2.85, -3.2, .72)
    addRockAt(2.7, -3.35, .78)
    addMarkerPair(4.85, 1.95, darkStone, 1.65)
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


function runtimeMoodStyle(mood: GeneratedRegion['mood']) {
  if (mood === 'dark') {
    return {
      background: 0x101813,
      fog: 0x142019,
      fogDensity: .0094,
      exposure: .94,
      hemisphereSky: 0xb7c8bb,
      hemisphereGround: 0x18211b,
      hemisphere: 1.45,
      sunColor: 0xd8c4a5,
      sun: 1.95,
      fillColor: 0x6f8c79,
      fill: .5,
      terrainTint: 0x243226,
      terrainTintStrength: .14,
      terrainBrightness: .82,
      colorBrightness: .82,
      colorTint: 0x263229,
      colorTintStrength: .08,
    }
  }
  if (mood === 'deadwood') {
    return {
      background: 0x141713,
      fog: 0x1b2119,
      fogDensity: .0092,
      exposure: .98,
      hemisphereSky: 0xc4c7b8,
      hemisphereGround: 0x241f18,
      hemisphere: 1.58,
      sunColor: 0xd8c3a4,
      sun: 2.08,
      fillColor: 0x7b806c,
      fill: .56,
      terrainTint: 0x443f2f,
      terrainTintStrength: .12,
      terrainBrightness: 1.04,
      colorBrightness: 1.15,
      colorTint: 0x4a4332,
      colorTintStrength: .045,
    }
  }
  if (mood === 'bleak') {
    return {
      background: 0x1b211f,
      fog: 0x242b27,
      fogDensity: .0085,
      exposure: 1.01,
      hemisphereSky: 0xc5ceca,
      hemisphereGround: 0x262b28,
      hemisphere: 1.7,
      sunColor: 0xd6d2c5,
      sun: 2.14,
      fillColor: 0x82908a,
      fill: .6,
      terrainTint: 0x59605a,
      terrainTintStrength: .12,
      terrainBrightness: .91,
      colorBrightness: .9,
      colorTint: 0x5d625d,
      colorTintStrength: .12,
    }
  }
  return {
    background: 0x162119,
    fog: 0x18251c,
    fogDensity: .0094,
    exposure: 1.18,
    hemisphereSky: 0xc6d8c8,
    hemisphereGround: 0x202b22,
    hemisphere: 1.9,
    sunColor: 0xffe3bd,
    sun: 2.8,
    fillColor: 0x86a891,
    fill: .72,
    terrainTint: 0x000000,
    terrainTintStrength: 0,
    terrainBrightness: 1,
    colorBrightness: 1,
    colorTint: 0x000000,
    colorTintStrength: 0,
  }
}

function runtimeMoodColor(
  value: number,
  mood: GeneratedRegion['mood'],
) {
  const style = runtimeMoodStyle(mood)
  return new THREE.Color(value)
    .multiplyScalar(style.colorBrightness)
    .lerp(new THREE.Color(style.colorTint), style.colorTintStrength)
    .getHex()
}

function runtimeMoodPalette<T extends Record<string, number>>(
  palette: T,
  mood: GeneratedRegion['mood'],
): T {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [
      key,
      runtimeMoodColor(value, mood),
    ]),
  ) as T
}

function runtimeBiomePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { ground: 0x5a4d32, low: 0x3c4933, high: 0x74654a, tree: 0x73502b, fern: 0x596137, rock: 0x67645b }
  if (value.includes('highland')) return { ground: 0x4b5148, low: 0x39453f, high: 0x747a70, tree: 0x2d402e, fern: 0x4a5b3d, rock: 0x737a73 }
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) return { ground: 0x24352d, low: 0x172f2a, high: 0x415346, tree: 0x1b3024, fern: 0x315f42, rock: 0x4b5751 }
  if (value.includes('corrupt')) return { ground: 0x413444, low: 0x302b3d, high: 0x6a526e, tree: 0x342d3b, fern: 0x5b3c63, rock: 0x5f5663 }
  if (value.includes('farmland') || value.includes('meadow') || value.includes('grassland')) return { ground: 0x6a633f, low: 0x506040, high: 0x8b8258, tree: 0x425838, fern: 0x637043, rock: 0x777468 }
  return { ground: 0x28412c, low: 0x203929, high: 0x526049, tree: 0x183824, fern: 0x2e6039, rock: 0x596159 }
}

function runtimeGroundCoverColors(biome: string, fallbackFern: number) {
  const value = biome.toLowerCase()
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) {
    return {
      fern: 0x2b4b38,
      grass: 0x4b5a42,
      shrub: 0x294237,
      reeds: 0x67734e,
    }
  }
  if (value.includes('corrupt')) {
    return {
      fern: 0x514557,
      grass: 0x625e4b,
      shrub: 0x403b45,
      reeds: 0x665d4d,
    }
  }
  return {
    fern: fallbackFern,
    grass: 0x58704a,
    shrub: 0x2f4c33,
    reeds: 0x607453,
  }
}

function runtimeTreeVariantColors(biome: string, fallback: number) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) {
    return [0x8d552d, 0xb06f31, 0x71402a, 0x45503a]
  }
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) {
    return [0x1b3024, 0x263c2d, 0x304735, 0x1d3528]
  }
  if (value.includes('corrupt')) {
    return [0x342d3b, 0x403344, 0x2d3039, 0x4b394c]
  }
  return [fallback, fallback, fallback, fallback]
}

function runtimeSurfacePalette(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('autumn')) return { forestFloor: 0x473d2c, moss: 0x62613a, soil: 0x6a5538, meadow: 0x6b6840, scrub: 0x564b31, rocky: 0x6e6759 }
  if (value.includes('highland')) return { forestFloor: 0x41483f, moss: 0x55604c, soil: 0x625b49, meadow: 0x606c4d, scrub: 0x4d5641, rocky: 0x747a70 }
  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) return { forestFloor: 0x1c3028, moss: 0x2d6044, soil: 0x3b4135, meadow: 0x395a42, scrub: 0x274839, rocky: 0x4d5a53 }
  if (value.includes('corrupt')) return { forestFloor: 0x352d3b, moss: 0x55405d, soil: 0x604b56, meadow: 0x624e66, scrub: 0x49374f, rocky: 0x5a4d60 }
  if (value.includes('farmland') || value.includes('meadow') || value.includes('grassland')) return { forestFloor: 0x505039, moss: 0x607042, soil: 0x79613f, meadow: 0x85804d, scrub: 0x66603d, rocky: 0x7b796b }
  return { forestFloor: 0x203625, moss: 0x365c38, soil: 0x5b503b, meadow: 0x4b6743, scrub: 0x304b34, rocky: 0x62685f }
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
