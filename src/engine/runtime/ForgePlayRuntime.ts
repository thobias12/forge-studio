import * as THREE from 'three'
import type {
  ForgeAbilityDefinition,
  ForgeEnemyDefinition,
  ForgeGameplayContent,
  ForgeItemDefinition,
  ForgePlayerDefinition,
} from '../forgeProject'
import type { GeneratedRegion, GeneratedRegionNode } from '../guidedWorld'
import {
  clearRuntimeSave,
  loadRuntimeSave,
  runtimeSaveKey,
  writeRuntimeSave,
  type ForgeRuntimeLootSave,
} from './ForgeGameSave'

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
  message: string
  savedAt?: string
}

export type ForgePlayRuntimeOptions = {
  projectId: string
  onState?: (state: ForgeRuntimeSnapshot) => void
}

type CircleObstacle = { x: number; z: number; radius: number }

type RuntimeEnemy = {
  id: string
  definition: ForgeEnemyDefinition
  group: THREE.Group
  healthFill: THREE.Mesh
  health: number
  attackCooldown: number
  flash: number
}

type RuntimeLoot = {
  save: ForgeRuntimeLootSave
  group: THREE.Group
  age: number
}

type RuntimeEffect = {
  mesh: THREE.Mesh
  age: number
  duration: number
  maxScale: number
}

const PLAYER_RADIUS = 0.58
const ENEMY_RADIUS = 0.62
const DODGE_DURATION = 0.19

export class ForgePlayRuntime {
  private readonly host: HTMLElement
  private readonly region: GeneratedRegion
  private readonly gameplay: ForgeGameplayContent
  private readonly options: ForgePlayRuntimeOptions
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 800)
  private readonly player = new THREE.Group()
  private readonly keys = new Set<string>()
  private readonly mouseWorld = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly obstacles: CircleObstacle[] = []
  private readonly enemies: RuntimeEnemy[] = []
  private readonly loot: RuntimeLoot[] = []
  private readonly effects: RuntimeEffect[] = []
  private readonly defeatedEnemyIds = new Set<string>()
  private readonly cooldowns = new Map<string, number>()
  private readonly playerDefinition: ForgePlayerDefinition
  private readonly saveKey: string
  private readonly resizeObserver: ResizeObserver
  private readonly dodgeDirection = new THREE.Vector3()
  private readonly tempMove = new THREE.Vector3()
  private readonly tempForward = new THREE.Vector3()
  private readonly tempRight = new THREE.Vector3()
  private inventory: string[] = []
  private equippedWeaponId: string | undefined
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
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'skillbound-runtime-canvas'
    this.host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x07110d)
    this.scene.fog = new THREE.FogExp2(0x07110d, 0.012)
    this.buildLighting()
    this.buildRegion()
    this.buildPlayer(save?.player)
    this.buildEnemies()
    save?.lootDrops.forEach((drop) => this.spawnLoot(drop, false))

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
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getSnapshot(): ForgeRuntimeSnapshot {
    return this.makeSnapshot()
  }

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
    this.saveGame(false)
    this.emitState()
  }

  private buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0x9ab9a1, 0x15110d, 1.25))
    const sun = new THREE.DirectionalLight(0xffe3bd, 2.2)
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
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.6, 1.35, 12), new THREE.MeshStandardMaterial({ color: 0xb8c5ba, roughness: 0.62 }))
    body.position.y = 0.88
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd4b59a, roughness: 0.7 }))
    head.position.y = 1.75
    head.castShadow = true
    const facing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 8), new THREE.MeshStandardMaterial({ color: 0x7ea58b, roughness: 0.55 }))
    facing.rotation.x = Math.PI / 2
    facing.position.set(0, 1.05, -0.7)
    this.player.add(body, head, facing)

    const entry = this.region.nodes.find((node) => node.kind === 'entry') ?? this.region.nodes[0]
    const x = savedPlayer?.x ?? entry?.x ?? 0
    const z = savedPlayer?.z ?? entry?.z ?? 0
    this.player.position.set(
      THREE.MathUtils.clamp(x, this.region.bounds.minX, this.region.bounds.maxX),
      0,
      THREE.MathUtils.clamp(z, this.region.bounds.minZ, this.region.bounds.maxZ),
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
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.8 })
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

    const healthBack = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0x251817 }))
    healthBack.position.set(0, 2.48, 0)
    const healthFill = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.055, 0.065), new THREE.MeshBasicMaterial({ color: 0xc9574f }))
    healthFill.position.set(0, 2.48, -0.035)
    group.add(body, head, weapon, healthBack, healthFill)
    group.position.set(x, 0, z)
    this.scene.add(group)
    this.enemies.push({ id, definition, group, healthFill, health: definition.maxHealth, attackCooldown: 0, flash: 0 })
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
    this.updateCooldowns(delta)
    this.updatePlayer(delta)
    this.updateEnemies(delta)
    this.updateLoot(delta)
    this.updateEffects(delta)
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
    if (this.dodgeRemaining > 0) {
      const speed = this.playerDefinition.dodgeDistance / DODGE_DURATION
      this.moveActor(this.player, this.dodgeDirection.clone().multiplyScalar(speed * delta), PLAYER_RADIUS)
      this.dodgeRemaining = Math.max(0, this.dodgeRemaining - delta)
    } else {
      const move = this.getMoveDirection()
      if (move.lengthSq() > 0) this.moveActor(this.player, move.multiplyScalar(this.playerDefinition.moveSpeed * delta), PLAYER_RADIUS)
    }

    const aim = this.mouseWorld.clone().sub(this.player.position)
    aim.y = 0
    if (aim.lengthSq() > 0.01) this.player.rotation.y = Math.atan2(aim.x, aim.z)
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
    this.spawnPulse(this.player.position, '#8ebaa0', 2.2, 0.28)
    this.emitState()
  }

  private performAbility(ability: ForgeAbilityDefinition) {
    if ((this.cooldowns.get(ability.id) ?? 0) > 0 || this.playerHealth <= 0) return
    const aim = this.mouseWorld.clone().sub(this.player.position).setY(0)
    if (aim.lengthSq() < 0.01) aim.set(0, 0, -1)
    aim.normalize()
    const damage = ability.damage + this.getEquippedDamageBonus()

    if (ability.kind === 'melee') {
      const impact = this.player.position.clone().addScaledVector(aim, Math.max(1, ability.range * 0.5))
      this.spawnPulse(impact, ability.color, ability.radius, 0.24)
      for (const enemy of [...this.enemies]) {
        const toEnemy = enemy.group.position.clone().sub(this.player.position).setY(0)
        const distance = toEnemy.length()
        if (distance > ability.range + ENEMY_RADIUS) continue
        const facing = distance > 0.001 ? toEnemy.normalize().dot(aim) : 1
        if (facing >= 0.1) this.damageEnemy(enemy, damage)
      }
    } else {
      const mouseDistance = this.mouseWorld.distanceTo(this.player.position)
      const targetDistance = Math.min(ability.range, mouseDistance)
      const target = this.player.position.clone().addScaledVector(aim, targetDistance)
      this.spawnPulse(target, ability.color, ability.radius, 0.55)
      for (const enemy of [...this.enemies]) {
        if (enemy.group.position.distanceTo(target) <= ability.radius + ENEMY_RADIUS) this.damageEnemy(enemy, damage)
      }
    }

    this.cooldowns.set(ability.id, ability.cooldown)
    this.emitState()
  }

  private damageEnemy(enemy: RuntimeEnemy, damage: number) {
    enemy.health = Math.max(0, enemy.health - damage)
    enemy.flash = 0.1
    const ratio = Math.max(0.001, enemy.health / enemy.definition.maxHealth)
    enemy.healthFill.scale.x = ratio
    enemy.healthFill.position.x = -(1 - ratio) * 0.64
    if (enemy.health <= 0) this.killEnemy(enemy)
  }

  private killEnemy(enemy: RuntimeEnemy) {
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
    this.defeatedEnemyIds.add(enemy.id)
    this.scene.remove(enemy.group)
    this.disposeObject(enemy.group)
    this.spawnPulse(enemy.group.position, '#b65e4c', 2.5, 0.45)
    this.rollLoot(enemy)
    this.setMessage(this.enemies.length === 0 ? 'Encounter cleared. Pick up the loot and equip it from the inventory.' : `${enemy.definition.name} defeated.`, 3.2)
    this.saveGame(false)
    this.emitState()
  }

  private rollLoot(enemy: RuntimeEnemy) {
    const table = this.gameplay.lootTables.find((candidate) => candidate.id === enemy.definition.lootTable)
    if (!table) return
    table.entries.forEach((entry, index) => {
      const roll = hashUnit(`${enemy.id}:${entry.itemId}:${index}`)
      if (roll > entry.chance) return
      const angle = hashUnit(`${enemy.id}:angle:${index}`) * Math.PI * 2
      const drop: ForgeRuntimeLootSave = {
        id: `${enemy.id}:drop:${index}`,
        itemId: entry.itemId,
        x: enemy.group.position.x + Math.cos(angle) * 0.8,
        z: enemy.group.position.z + Math.sin(angle) * 0.8,
      }
      this.spawnLoot(drop, true)
    })
  }

  private spawnLoot(save: ForgeRuntimeLootSave, persist: boolean) {
    if (this.loot.some((drop) => drop.save.id === save.id)) return
    const item = this.gameplay.items.find((candidate) => candidate.id === save.itemId)
    if (!item) return
    const group = new THREE.Group()
    const glow = new THREE.PointLight(item.color, 1.2, 4)
    glow.position.y = 0.8
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({ color: item.color, emissive: item.color, emissiveIntensity: 0.45, roughness: 0.45, metalness: 0.15 }),
    )
    mesh.position.y = 0.55
    mesh.castShadow = true
    group.add(mesh, glow)
    group.position.set(save.x, 0, save.z)
    this.scene.add(group)
    this.loot.push({ save: { ...save }, group, age: 0 })
    if (persist) this.saveGame(false)
  }

  private updateEnemies(delta: number) {
    for (const enemy of [...this.enemies]) {
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta)
      enemy.flash = Math.max(0, enemy.flash - delta)
      const toPlayer = this.player.position.clone().sub(enemy.group.position).setY(0)
      const distance = toPlayer.length()
      if (distance <= enemy.definition.aggroRange && distance > enemy.definition.attackRange) {
        const direction = toPlayer.normalize()
        this.moveActor(enemy.group, direction.multiplyScalar(enemy.definition.moveSpeed * delta), ENEMY_RADIUS)
        enemy.group.rotation.y = Math.atan2(direction.x, direction.z)
      } else if (distance <= enemy.definition.attackRange && enemy.attackCooldown <= 0) {
        enemy.attackCooldown = enemy.definition.attackCooldown
        if (this.dodgeRemaining <= 0) this.damagePlayer(enemy.definition.attackDamage)
        this.spawnPulse(this.player.position, '#c84d43', 1.2, 0.2)
      }
    }
  }

  private damagePlayer(damage: number) {
    if (this.dodgeRemaining > 0) return
    this.playerHealth = Math.max(0, this.playerHealth - damage)
    this.setMessage(`Hit for ${damage}. Space dodges through attacks.`, 1.6)
    if (this.playerHealth <= 0) this.respawnPlayer()
    this.emitState()
  }

  private respawnPlayer() {
    const entry = this.region.nodes.find((node) => node.kind === 'entry') ?? this.region.nodes[0]
    this.player.position.set(entry?.x ?? 0, 0, entry?.z ?? 0)
    this.playerHealth = this.playerDefinition.maxHealth
    this.setMessage('You fell in battle and returned to the region entry. Enemy progress is preserved.', 4)
    this.saveGame(false)
  }

  private updateLoot(delta: number) {
    for (const drop of [...this.loot]) {
      drop.age += delta
      drop.group.rotation.y += delta * 1.8
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
      const scale = 0.25 + progress * effect.maxScale
      effect.mesh.scale.setScalar(scale)
      const material = effect.mesh.material as THREE.MeshBasicMaterial
      material.opacity = (1 - progress) * 0.72
      if (progress < 1) continue
      const index = this.effects.indexOf(effect)
      if (index >= 0) this.effects.splice(index, 1)
      this.scene.remove(effect.mesh)
      effect.mesh.geometry.dispose()
      material.dispose()
    }
  }

  private updateCamera(delta: number) {
    const offset = this.cameraOffset()
    const desired = this.player.position.clone().add(offset)
    this.camera.position.lerp(desired, 1 - Math.pow(0.0008, delta))
    this.camera.lookAt(this.player.position.x, 0.8, this.player.position.z)
  }

  private snapCamera() {
    this.camera.position.copy(this.player.position).add(this.cameraOffset())
    this.camera.lookAt(this.player.position.x, 0.8, this.player.position.z)
  }

  private cameraOffset() {
    return new THREE.Vector3(this.cameraDistance * 0.58, this.cameraDistance * 0.74, this.cameraDistance * 0.58)
  }

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
      if (distance < 0.0001) {
        dx = 1
        dz = 0
        distance = 1
      }
      next.x = obstacle.x + dx / distance * minimum
      next.z = obstacle.z + dz / distance * minimum
    }
    actor.position.x = next.x
    actor.position.z = next.z
  }

  private spawnPulse(position: THREE.Vector3, color: string, radius: number, duration: number) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(position.x, 0.055, position.z)
    this.scene.add(mesh)
    this.effects.push({ mesh, age: 0, duration, maxScale: Math.max(1, radius) })
  }

  private getPrimaryAbility() {
    return this.gameplay.abilities.find((ability) => ability.id === this.playerDefinition.basicAbility)
  }

  private getSkillAbility() {
    const id = this.playerDefinition.activeAbilities[0]
    return this.gameplay.abilities.find((ability) => ability.id === id)
  }

  private getEquippedDamageBonus() {
    return this.getEquippedItem()?.damageBonus ?? 0
  }

  private getEquippedItem(): ForgeItemDefinition | undefined {
    return this.gameplay.items.find((item) => item.id === this.equippedWeaponId)
  }

  private updatePersistence(delta: number) {
    this.autosaveElapsed += delta
    this.stateEmitElapsed += delta
    if (this.autosaveElapsed >= 5) {
      this.autosaveElapsed = 0
      this.saveGame(false)
    }
    if (this.stateEmitElapsed >= 0.1) {
      this.stateEmitElapsed = 0
      this.emitState()
    }
  }

  private setMessage(message: string, seconds: number) {
    this.message = message
    this.messageRemaining = seconds
  }

  private emitState() {
    this.options.onState?.(this.makeSnapshot())
  }

  private makeSnapshot(): ForgeRuntimeSnapshot {
    const primary = this.getPrimaryAbility()
    const skill = this.getSkillAbility()
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

function makePath(from: GeneratedRegionNode, to: GeneratedRegionNode, width: number) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.max(0.1, Math.hypot(dx, dz))
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.08, width),
    new THREE.MeshStandardMaterial({ color: 0x4c4030, roughness: 1 }),
  )
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
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function biomeColor(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('swamp') || value.includes('drowned')) return 0x263128
  if (value.includes('coast') || value.includes('ashen')) return 0x37362f
  if (value.includes('verdant')) return 0x263d2b
  return 0x2e342b
}
