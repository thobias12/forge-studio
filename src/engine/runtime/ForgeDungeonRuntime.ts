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
import { withCryptRuntimeCollision } from '../../lib/cryptCollision'
import { dungeonAtmosphere, tintRoomFloor } from '../../lib/dungeonAtmosphere'
import { dungeonProps } from '../../lib/dungeonProps'
import { getRoomConnection, type DungeonConnection, type DungeonEncounter, type DungeonMarker, type DungeonRoom } from '../../lib/dungeonPackage'
import { addCryptCorridorEnvironment, addCryptRoomEnvironment, type CryptFlickerLight } from '../../lib/cryptEnvironment'
import {
  bindCharacterAsset,
  disposeBoundObject,
  ForgeCharacterVisualBinding,
  ForgeLibraryVfxInstance,
  loadLibraryAnimationClips,
  spawnLibraryVfx,
} from './ForgeAssetRuntime'
import { bindRuntimeItemModel, fallbackSocketPosition, findRuntimeItemSocket } from './ForgeItemRuntime'
import type { ForgeAdventurePlayerState } from './ForgeAdventureSession'

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
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.08, 260)
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
  private readonly dodgeDirection = new THREE.Vector3()
  private readonly enemies = new Map<string, RuntimeEnemy>()
  private readonly encounters = new Map<string, RuntimeEncounter>()
  private readonly lockedDoorIds = new Set<string>()
  private readonly loot: RuntimeLoot[] = []
  private readonly effects: RuntimeEffect[] = []
  private readonly textEffects: RuntimeTextEffect[] = []
  private readonly libraryVfx: ForgeLibraryVfxInstance[] = []
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
  private cameraDistance = 31
  private dodgeRemaining = 0
  private dodgeCooldown = 0
  private playerMoving = false
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

  constructor(host: HTMLElement, dungeon: ForgeProjectDungeonDefinition, gameplay: ForgeGameplayContent, initial: ForgeAdventurePlayerState, options: ForgeDungeonRuntimeOptions) {
    this.host = host
    this.dungeon = dungeon
    this.runtimeDungeon = withCryptRuntimeCollision(dungeon) as ForgeProjectDungeonDefinition
    this.gameplay = gameplay
    for (const item of initial.generatedItems ?? []) if (!gameplay.items.some(entry => entry.id === item.id)) gameplay.items.push(item)
    this.options = options
    this.playerHealth = THREE.MathUtils.clamp(initial.health, 1, gameplay.player.maxHealth)
    this.inventory = [...initial.inventory]
    this.equippedWeaponId = initial.equippedWeaponId

    const atmosphere = dungeonAtmosphere(dungeon.theme)
    this.scene.background = new THREE.Color(atmosphere.background)
    this.scene.fog = new THREE.FogExp2(atmosphere.fog, dungeon.settings.fogDensity * atmosphere.fogMultiplier)
    this.scene.add(this.world)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = atmosphere.exposure
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
    this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    this.playerVisual?.dispose()
    this.enemies.forEach((enemy) => enemy.visual?.dispose())
    if (this.equippedModel) disposeBoundObject(this.equippedModel)
    this.libraryVfx.forEach((effect) => effect.dispose())
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
  private onBlur = () => this.keys.clear()
  private onContextMenu = (event: MouseEvent) => event.preventDefault()
  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
    this.ndc.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.raycaster.ray.intersectPlane(this.floorPlane, this.mouseWorld)
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
    this.activateEncounters()
    this.updatePlayer(simulationDelta)
    this.updateEnemies(simulationDelta)
    this.updateLoot(simulationDelta)
    this.updateEffects(delta)
    this.updateTextEffects(delta)
    this.updateLibraryVfx(delta)
    this.updatePortal(delta)
    this.updateCamera(delta)
    this.updateOcclusion(delta)
    this.emitElapsed += delta
    if (this.emitElapsed >= 0.1) { this.emitElapsed = 0; this.emitState() }
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
