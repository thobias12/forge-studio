// @ts-nocheck
import { dungeonSceneMethods } from './ForgeDungeonRuntimeScene'
import { dungeonGameplayMethods } from './ForgeDungeonRuntimeGameplay'
import { dungeonViewMethods } from './ForgeDungeonRuntimeView'
import { disposeSceneObject, isTextInput } from './ForgeDungeonRuntimeHelpers'
import * as THREE from 'three'
import type {
  ForgeAbilityDefinition,
  ForgeEnemyDefinition,
  ForgeGameplayContent,
  ForgeItemDefinition,
  ForgeProjectDungeonDefinition,
} from '../forgeProject'
import { itemVisual } from '../itemPresentation'
import { dungeonAtmosphere, dungeonLightingProfile, tintRoomFloor } from '../../lib/dungeonAtmosphere'
import { dungeonProps } from '../../lib/dungeonProps'
import { getRoomConnection, type DungeonConnection, type DungeonEncounter, type DungeonMarker, type DungeonRoom } from '../../lib/dungeonPackage'
import { addCryptCorridorEnvironment, addCryptRoomEnvironment, type CryptFlickerLight } from '../../lib/cryptEnvironment'
import {
  bindCharacterAsset,
  disposeBoundObject,
  ForgeCharacterVisualBinding,
  ForgeLibraryVfxInstance,
  loadLibraryAnimationClips,
  preloadLibraryVfx,
  spawnLibraryVfx,
} from './ForgeAssetRuntime'
import { bindRuntimeItemModel, fallbackSocketPosition, findRuntimeItemSocket } from './ForgeItemRuntime'
import type { ForgeAdventurePlayerState } from './ForgeAdventureSession'
import { ForgeChainLightningEffect } from './ForgeChainLightningRuntime'
import {
  FORGE_GAMEPLAY_FEEL,
  forgeWheelDistanceTarget,
} from './ForgeGameplayFeel'
import { FORGE_WORLD_SCALE } from '../worldScale'

type RoomOpening = DungeonConnection & { corridorId: string }
type RuntimeEncounter = { definition: DungeonEncounter; active: boolean; cleared: boolean; rewardSpawned: boolean }
type RuntimeEnemy = {
  id: string
  encounterId: string
  roomId: string
  definition: ForgeEnemyDefinition
  group: THREE.Group
  placeholderMaterial: THREE.MeshStandardMaterial
  healthFill: THREE.Mesh
  telegraph: THREE.Mesh
  health: number
  maxHealth: number
  damage: number
  moveSpeed: number
  attackRange: number
  attackCooldown: number
  attackTimer: number
  windupRemaining: number
  windupDuration: number
  staggerRemaining: number
  recoveryRemaining: number
  knockback: THREE.Vector3
  boss: boolean
  elite: boolean
  visual?: ForgeCharacterVisualBinding
  moving: boolean
}
type RuntimeLoot = { id: string; itemId: string; group: THREE.Group; fallback: THREE.Mesh; model?: THREE.Object3D; age: number }
type RuntimeEffect = { mesh: THREE.Mesh; age: number; duration: number; maxScale: number }
type RuntimeTextEffect = { sprite: THREE.Sprite; age: number; duration: number }
type PortalRuntime = { marker: DungeonMarker; group: THREE.Group; ring: THREE.Mesh; light: THREE.PointLight }

export type ForgeDungeonTargetSnapshot = { id: string; name: string; health: number; maxHealth: number; boss: boolean }
export type ForgeDungeonRuntimeSnapshot = ForgeAdventurePlayerState & {
  maxHealth: number
  enemiesAlive: number
  enemiesTotal: number
  primaryCooldown: number
  skillCooldown: number
  dodgeCooldown: number
  encounter: string
  target?: ForgeDungeonTargetSnapshot
  interaction?: { label: string; ready: boolean }
  message: string
  bossCleared: boolean
}

export type ForgeDungeonRuntimeOptions = {
  projectId: string
  onState?: (state: ForgeDungeonRuntimeSnapshot) => void
  onExit: (state: ForgeAdventurePlayerState) => void
}

const PLAYER_RADIUS = 0.58
const ENEMY_RADIUS = 0.58
const DODGE_DURATION = 0.19
const INTERACT_DISTANCE = 2.65

export class ForgeDungeonRuntime {
  private readonly host: HTMLElement
  private readonly dungeon: ForgeProjectDungeonDefinition
  private readonly gameplay: ForgeGameplayContent
  private readonly options: ForgeDungeonRuntimeOptions
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(
    FORGE_WORLD_SCALE.playCameraFov,
    1,
    0.08,
    260,
  )
  private readonly world = new THREE.Group()
  private readonly player = new THREE.Group()
  private readonly playerPlaceholder = new THREE.Group()
  private readonly equippedModelAnchor = new THREE.Group()
  private readonly keys = new Set<string>()
  private readonly mouseWorld = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly tempForward = new THREE.Vector3()
  private readonly tempRight = new THREE.Vector3()
  private readonly tempMove = new THREE.Vector3()
  private readonly tempAim = new THREE.Vector3()
  private readonly tempCamera = new THREE.Vector3()
  private readonly tempEnemyDirection = new THREE.Vector3()
  private readonly tempEnemySeparation = new THREE.Vector3()
  private readonly tempCombatSpacing = new THREE.Vector3()
  private readonly tempActorNext = new THREE.Vector3()
  private readonly dodgeDirection = new THREE.Vector3()
  private readonly playerVelocity = new THREE.Vector3()
  private readonly cameraFocus = new THREE.Vector3()
  private readonly tempCameraFocus = new THREE.Vector3()
  private readonly enemies = new Map<string, RuntimeEnemy>()
  private readonly encounters = new Map<string, RuntimeEncounter>()
  private readonly lockedDoorIds = new Set<string>()
  private readonly loot: RuntimeLoot[] = []
  private readonly effects: RuntimeEffect[] = []
  private readonly textEffects: RuntimeTextEffect[] = []
  private readonly libraryVfx: ForgeLibraryVfxInstance[] = []
  private readonly chainLightningEffects: ForgeChainLightningEffect[] = []
  private readonly occlusionRay = new THREE.Raycaster()
  private readonly fadedOccluders = new Map<THREE.Mesh, number>()
  private readonly cooldowns = new Map<string, number>()
  private readonly abilityAnimationClipNames = new Map<string, string>()
  private readonly resizeObserver: ResizeObserver
  private readonly portal?: PortalRuntime
  private readonly runtimeDungeon: ForgeProjectDungeonDefinition
  private playerVisual?: ForgeCharacterVisualBinding
  private equippedModel?: THREE.Object3D
  private equippedWeaponId?: string
  private inventory: string[]
  private playerHealth: number
  private cameraDistance = FORGE_WORLD_SCALE.playCameraDistance
  private cameraDistanceTarget = FORGE_WORLD_SCALE.playCameraDistance
  private dodgeRemaining = 0
  private dodgeCooldown = 0
  private playerMoving = false
  private playerAction?: any
  private bufferedAbility?: ForgeAbilityDefinition
  private bufferedAbilityRemaining = 0
  private primaryHeld = false
  private meleeComboStep = -1
  private meleeComboResetRemaining = 0
  private damageNumberSequence = 0
  private pointerTracked = false
  private focusEnemyId?: string
  private disposed = false
  private lastFrame = performance.now()
  private frame = 0
  private message = 'Explore Hollow Vault and clear its encounters.'
  private messageRemaining = 5
  private emitElapsed = 0
  private hitStopRemaining = 0
  private cameraShake = 0
  private totalEnemyCount = 0
  private chainCastSequence = 0
  private runtimeFrameErrorLogged = false
  private runtimeEnemyErrorLogged = false
  private runtimeEffectsErrorLogged = false
  private runtimeCameraErrorLogged = false

  constructor(host: HTMLElement, dungeon: ForgeProjectDungeonDefinition, gameplay: ForgeGameplayContent, initial: ForgeAdventurePlayerState, options: ForgeDungeonRuntimeOptions) {
    this.host = host
    this.dungeon = dungeon
    // Dungeon Forge V3 owns structural + authored-art collision directly.
    // Keep the runtime on the exact authored dungeon instead of injecting the
    // legacy hidden crypt collision helpers used by the pre-V3 renderer.
    this.runtimeDungeon = dungeon
    this.gameplay = gameplay
    this.options = options
    this.playerHealth = THREE.MathUtils.clamp(initial.health, 1, gameplay.player.maxHealth)
    this.inventory = [...initial.inventory]
    this.equippedWeaponId = initial.equippedWeaponId

    const atmosphere = dungeonAtmosphere(dungeon.theme)
    const lighting = dungeonLightingProfile(atmosphere, dungeon.settings)
    this.scene.background = new THREE.Color(atmosphere.background)
    this.scene.fog = new THREE.FogExp2(atmosphere.fog, lighting.fogDensity)
    this.scene.add(this.world)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = lighting.exposure
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'skillbound-runtime-canvas'
    this.renderer.domElement.style.touchAction = 'none'
    this.host.appendChild(this.renderer.domElement)

    this.buildLighting()
    this.buildDungeon()
    this.buildPlayer()
    this.buildEncounters()
    const completionMarker = dungeon.markers.find((marker) => marker.id === dungeon.logic?.completionPortalId)
      ?? dungeon.markers.find((marker) => marker.type === 'portal')
    if (completionMarker) this.portal = this.buildPortal(completionMarker)
    void preloadLibraryVfx([
      ...this.gameplay.abilities.map((ability) => ability.vfxAssetId),
      ...this.gameplay.enemies.flatMap((enemy) => [
        enemy.attackVfxAssetId,
        enemy.hitVfxAssetId,
        enemy.deathVfxAssetId,
      ]),
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
    this.updatePortalVisual()
    this.emitState()
    this.frame = requestAnimationFrame(this.animate)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frame)
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
    this.playerVisual?.dispose()
    this.enemies.forEach((enemy) => enemy.visual?.dispose())
    if (this.equippedModel) disposeBoundObject(this.equippedModel)
    this.libraryVfx.forEach((effect) => effect.dispose())
    this.chainLightningEffects.forEach((effect) => effect.dispose())
    this.chainLightningEffects.length = 0
    disposeSceneObject(this.world)
    disposeSceneObject(this.player)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getSnapshot() { return this.makeSnapshot() }

  equipItem(itemId: string) {
    const item = this.gameplay.items.find((candidate) => candidate.id === itemId)
    if (!item || item.slot !== 'weapon' || !this.inventory.includes(itemId)) return
    this.equippedWeaponId = itemId
    this.setMessage(`${item.name} equipped. +${item.damageBonus} attack damage.`, 2.8)
    void this.refreshEquippedModel()
    this.emitState()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTextInput(event.target)) return
    const key = event.key.toLowerCase()
    if (['w', 'a', 's', 'd'].includes(key)) { this.keys.add(key); event.preventDefault(); return }
    if (event.repeat) return
    if (key === 'q') {
      const ability = this.getSkillAbility()
      if (ability) this.performAbility(ability)
      event.preventDefault()
    } else if (event.code === 'Space') {
      this.startDodge()
      event.preventDefault()
    } else if (key === 'e') {
      const interaction = this.currentPortalInteraction()
      if (interaction?.ready) this.options.onExit(this.playerState())
      else if (interaction) this.setMessage('The return portal is sealed until the Vault Warden falls.', 2.8)
      event.preventDefault()
    }
  }

  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())
  private onBlur = () => {
    this.keys.clear()
    this.primaryHeld = false
  }
  private onContextMenu = (event: MouseEvent) => event.preventDefault()
  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
    this.ndc.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    this.pointerTracked = true
    this.updateMouseWorldFromPointerRay()
  }
  private updateMouseWorldFromPointerRay() {
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.raycaster.ray.intersectPlane(this.floorPlane, this.mouseWorld)
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

    try {
      this.updateCooldowns(delta)
      this.activateEncounters()
      this.updatePlayer(simulationDelta)
    } catch (reason) {
      if (!this.runtimeFrameErrorLogged) {
        this.runtimeFrameErrorLogged = true
        console.error('[ForgeDungeonRuntime] player/encounter frame update failed; continuing remaining runtime systems.', reason)
      }
    }

    // Enemy AI is isolated from transient VFX cleanup. A malformed enemy can
    // no longer freeze dash/ability rings, hit flashes, loot, or corpse flow.
    try {
      this.updateEnemies(simulationDelta)
    } catch (reason) {
      if (!this.runtimeEnemyErrorLogged) {
        this.runtimeEnemyErrorLogged = true
        console.error('[ForgeDungeonRuntime] enemy update failed; continuing VFX and render systems.', reason)
      }
    }

    try {
      // Core temporary visuals age out first so unrelated loot/library-VFX
      // failures cannot strand attack, dodge, or skill rings in the scene.
      this.updateEffects(delta)
      this.updateTextEffects(delta)
      this.updateLibraryVfx(delta)
      this.updateChainLightningEffects(delta)
      this.updateLoot(simulationDelta)
      this.updatePortal(delta)
      this.emitElapsed += delta
      if (this.emitElapsed >= 0.1) { this.emitElapsed = 0; this.emitState() }
    } catch (reason) {
      if (!this.runtimeEffectsErrorLogged) {
        this.runtimeEffectsErrorLogged = true
        console.error('[ForgeDungeonRuntime] transient runtime update failed; render/camera remain active.', reason)
      }
    }

    // Camera tracking is intentionally isolated from gameplay simulation.
    // A combat/encounter exception must never leave a live dungeon with a
    // frozen camera.
    try {
      this.updateCamera(delta)
      if (this.pointerTracked) this.updateMouseWorldFromPointerRay()
      this.updateOcclusion(delta)
    } catch (reason) {
      if (!this.runtimeCameraErrorLogged) {
        this.runtimeCameraErrorLogged = true
        console.error('[ForgeDungeonRuntime] camera update failed.', reason)
      }
    }

    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.animate)
  }

  private resize = () => {
    const rect = this.host.getBoundingClientRect()
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
    this.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height)
    this.camera.updateProjectionMatrix()
  }
}

Object.assign(ForgeDungeonRuntime.prototype, dungeonSceneMethods, dungeonGameplayMethods, dungeonViewMethods)
