import { ensureSkillboundItemSystem } from './skillboundItems'
import type { SkillboundItemRecipe, SkillboundItemRoll } from './skillboundItems'
import { createDefaultSkillboundUiDefinition, type ForgeUiThemeDefinition } from '../lib/uiForge'
import type { DungeonWithProps } from '../lib/dungeonProps'
import type { ForgeBossDefinition, ForgeEncounterProfile } from './encounterForge'

export type ForgeProjectManifest = {
  format: 'forge-project'
  version: 1
  id: string
  name: string
  generationVersion: number
  contentRevision?: number
  runtime: {
    renderer: 'three'
    entryWorld: string
    mode: 'single-player'
  }
  content: {
    worlds: string[]
    regions: string[]
    dungeons?: string[]
    encounters?: string[]
    bosses?: string[]
    player: string
    abilities: string[]
    enemies: string[]
    items: string[]
    lootTables: string[]
    ui?: string
  }
}

export type ForgeWorldNodeType = 'procedural-region' | 'town' | 'dungeon'

export type ForgeWorldNode = { id: string; label: string; type: ForgeWorldNodeType; ref?: string; required: boolean }
export type ForgeWorldDefinition = { format: 'forge-world'; version: 1; id: string; name: string; act: number; nodes: ForgeWorldNode[] }
export type ForgePathStyle = 'direct' | 'winding' | 'meandering'
export type ForgeDensity = 'low' | 'medium' | 'high' | 'horde'
export type ForgeRegionSize = 'small' | 'medium' | 'large'
export type ForgeRegionMood = 'auto' | 'normal' | 'dark' | 'deadwood' | 'bleak'
export type ForgeRegionWorldGeneration = { size: ForgeRegionSize; layout?: 'journey-v1'; mood?: ForgeRegionMood; elevation: number; cliffs: number; water: number; forestDensity: number; openSpace: number; exploration: number; loops: number; secretPaths: number; verticality: number; poiDensity: number; layerSeeds?: { terrain: number; routes: number; pois: number; dressing: number } }
export type ForgeRegionDefinition = {
  format: 'forge-region'
  version: 1
  id: string
  name: string
  biome: string
  chunkRange: [number, number]
  mainPath: ForgePathStyle
  branchRange: [number, number]
  landmarkRange: [number, number]
  enemyDensity: ForgeDensity
  encounterGroupRange?: [number, number]
  encounterMinSpacing?: number
  enemyRespawn?: boolean
  enemyRespawnSeconds?: number
  optionalDungeonChance: number
  settlementChance: number
  features: string[]
  linkedDungeonId?: string
  worldGen?: ForgeRegionWorldGeneration
}
export type ForgeAbilityKind = 'melee' | 'area'
export type ForgeAbilityInput = 'primary' | 'skill-1'
export type ForgeAbilityDelivery = 'standard' | 'chain'
export type ForgeChainAbilityDefinition = {
  maxJumps?: number
  jumpRadius?: number
  jumpDelay?: number
  damageFalloff?: number
  allowRepeatTargets?: boolean
  selectionMode?: 'nearest'
  boltLifetime?: number
  arcAmplitude?: number
  branchCount?: number
  glowWidth?: number
  lightFlashIntensity?: number
}
export type ForgeAbilityDefinition = {
  format: 'forge-ability'
  version: 1
  id: string
  name: string
  kind: ForgeAbilityKind
  input: ForgeAbilityInput
  damage: number
  cooldown: number
  range: number
  radius: number
  color: string
  animationAssetId?: string
  vfxAssetId?: string
  delivery?: ForgeAbilityDelivery
  chain?: ForgeChainAbilityDefinition
}
export type ForgeEnemyRole = 'skirmisher' | 'brute' | 'ranged' | 'caster'
export type ForgeEnemyAttackStyle = 'melee' | 'projectile' | 'area'
export type ForgeEnemyDefinition = {
  format: 'forge-enemy'
  version: 1
  id: string
  name: string
  maxHealth: number
  moveSpeed: number
  aggroRange: number
  attackRange: number
  attackDamage: number
  attackCooldown: number
  attackWindup?: number
  lootTable: string
  color: string
  role?: ForgeEnemyRole
  attackStyle?: ForgeEnemyAttackStyle
  preferredRange?: number
  retreatRange?: number
  strafeWeight?: number
  poise?: number
  poiseRecovery?: number
  projectileSpeed?: number
  projectileRadius?: number
  areaRadius?: number
  specialCooldown?: number
  dashDistance?: number
  chargeDistance?: number
  volleyCount?: number
  hazardDuration?: number
  hazardTickDamage?: number
  scale?: number
  telegraphColor?: string
  characterAssetId?: string
  animationAssetId?: string
  attackVfxAssetId?: string
  hitVfxAssetId?: string
  deathVfxAssetId?: string
}
export type ForgeItemSlot = 'weapon'
export type ForgeItemRarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary' | 'unique'
export type ForgeItemSocket = 'RightHand' | 'LeftHand' | 'Back' | 'HipLeft' | 'HipRight'
export type ForgeItemCameraPreset = 'three-quarter' | 'front' | 'side'
export type ForgeItemTransform = { position: [number, number, number]; rotation: [number, number, number]; scale: number }
export type ForgeItemVisualDefinition = { masterAssetId?: string; inventory: { autoIcon: boolean; iconAssetId?: string; cameraPreset: ForgeItemCameraPreset; rotation: [number, number, number]; scale: number }; drop: { useMaster: boolean; modelAssetId?: string; transform: ForgeItemTransform; groundOffset: number }; equipped: { useMaster: boolean; modelAssetId?: string; socket: ForgeItemSocket; transform: ForgeItemTransform } }
export type ForgeItemDefinition = { format: 'forge-item'; version: 1; id: string; name: string; slot: ForgeItemSlot; rarity: ForgeItemRarity; damageBonus: number; color: string; modelAssetId?: string; visual?: ForgeItemVisualDefinition; procedural?: SkillboundItemRecipe; itemRoll?: SkillboundItemRoll }
export type ForgeLootRollMode = 'independent' | 'weighted'
export type ForgeLootEntry = {
  itemId: string
  chance: number
  weight?: number
  minQuantity?: number
  maxQuantity?: number
}
export type ForgeLootRewardRange = {
  min: number
  max: number
  chance: number
}
export type ForgeLootTableDefinition = {
  format: 'forge-loot-table'
  version: 1
  id: string
  name: string
  entries: ForgeLootEntry[]
  rollMode?: ForgeLootRollMode
  rolls?: [number, number]
  allowDuplicates?: boolean
  nothingWeight?: number
  gold?: ForgeLootRewardRange
  xp?: ForgeLootRewardRange
  scatterRadius?: number
}
export type ForgePlayerArchetypeLoadout = { label?: string; basicAbility: string; activeAbilities: string[]; startingItems: string[] }
export type ForgePlayerDefinition = { format: 'forge-player'; version: 1; id: string; name: string; maxHealth: number; moveSpeed: number; dodgeDistance: number; dodgeCooldown: number; basicAbility: string; activeAbilities: string[]; startingItems: string[]; characterAssetId?: string; animationAssetId?: string; archetypeLoadouts?: Partial<Record<'melee' | 'ranged' | 'caster', ForgePlayerArchetypeLoadout>> }
export type ForgeGameplayContent = { itemSystemVersion?: 1; player: ForgePlayerDefinition; abilities: ForgeAbilityDefinition[]; enemies: ForgeEnemyDefinition[]; items: ForgeItemDefinition[]; lootTables: ForgeLootTableDefinition[] }
export type ForgeProjectDungeonDefinition = DungeonWithProps & { id: string }
export type ForgeProjectWorkspace = { manifest: ForgeProjectManifest; worlds: ForgeWorldDefinition[]; regions: ForgeRegionDefinition[]; dungeons: ForgeProjectDungeonDefinition[]; encounterProfiles: ForgeEncounterProfile[]; bossProfiles: ForgeBossDefinition[]; gameplay: ForgeGameplayContent; ui: ForgeUiThemeDefinition; editor: { previewSeed: number; selectedWorldId: string; selectedRegionId: string }; updatedAt: string }

const WORKSPACE_KEY = 'forge-project:skillbound:v4'
const LEGACY_V3_KEY = 'forge-project:skillbound:v3'
const LEGACY_V2_KEY = 'forge-project:skillbound:v2'
const LEGACY_V1_KEY = 'forge-project:skillbound:v1'
const PROJECT_ROOT = './projects/skillbound/'
let skillboundWorkspacePromise: Promise<ForgeProjectWorkspace> | undefined

export async function loadSkillboundWorkspace(forceBundled = false): Promise<ForgeProjectWorkspace> {
  if (!forceBundled && skillboundWorkspacePromise) return await skillboundWorkspacePromise
const workspace = await loadWorkspaceContent(forceBundled)
  const resolved = { ...workspace, gameplay: ensureSkillboundItemSystem(workspace.gameplay) }
if (!forceBundled) skillboundWorkspacePromise = Promise.resolve(resolved)
return resolved
}

async function loadWorkspaceContent(forceBundled = false): Promise<ForgeProjectWorkspace> {
  const manifest = await fetchJson<ForgeProjectManifest>(`${PROJECT_ROOT}project.forge.json`)
  if (!forceBundled) {
    const current = readCachedWorkspace(WORKSPACE_KEY)
    if (current?.worlds?.length && current.regions?.length && current.editor && current.gameplay) {
      const sourceAdvanced = (manifest.contentRevision ?? 1) > (current.manifest.contentRevision ?? 1)
      const [bundledDungeons, bundledGameplay] = await Promise.all([
        loadDungeons(manifest),
        sourceAdvanced ? loadGameplay(manifest) : Promise.resolve(undefined),
      ])
      return {
        ...current,
        manifest: sourceAdvanced ? manifest : { ...manifest, contentRevision: current.manifest.contentRevision ?? manifest.contentRevision },
        dungeons: current.dungeons?.length ? mergeProjectDungeonBindings(current.dungeons, bundledDungeons) : bundledDungeons,
        encounterProfiles: sourceAdvanced ? await loadEncounterProfiles(manifest) : current.encounterProfiles ?? await loadEncounterProfiles(manifest),
        bossProfiles: sourceAdvanced ? await loadBossProfiles(manifest) : current.bossProfiles ?? await loadBossProfiles(manifest),
        gameplay: bundledGameplay ?? current.gameplay,
        ui: current.ui ?? await loadUi(manifest),
      } as ForgeProjectWorkspace
    }
    const legacy = readCachedWorkspace(LEGACY_V3_KEY) ?? readCachedWorkspace(LEGACY_V2_KEY) ?? readCachedWorkspace(LEGACY_V1_KEY)
    if (legacy?.worlds?.length && legacy.regions?.length && legacy.editor) {
      const [bundledRegions, bundledDungeons] = await Promise.all([loadRegions(manifest), loadDungeons(manifest)])
      return { manifest, worlds: legacy.worlds, regions: mergeProjectRegionLinks(legacy.regions, bundledRegions), dungeons: legacy.dungeons?.length ? mergeProjectDungeonBindings(legacy.dungeons, bundledDungeons) : bundledDungeons, encounterProfiles: await loadEncounterProfiles(manifest), bossProfiles: await loadBossProfiles(manifest), gameplay: legacy.gameplay ?? await loadGameplay(manifest), ui: legacy.ui ?? await loadUi(manifest), editor: legacy.editor, updatedAt: legacy.updatedAt ?? new Date().toISOString() }
    }
  }
  const [worlds, regions, dungeons, encounterProfiles, bossProfiles, gameplay, ui] = await Promise.all([Promise.all(manifest.content.worlds.map((path) => fetchJson<ForgeWorldDefinition>(`${PROJECT_ROOT}${path}`))), loadRegions(manifest), loadDungeons(manifest), loadEncounterProfiles(manifest), loadBossProfiles(manifest), loadGameplay(manifest), loadUi(manifest)])
  return { manifest, worlds, regions, dungeons, encounterProfiles, bossProfiles, gameplay, ui, editor: { previewSeed: 8472152, selectedWorldId: worlds[0]?.id ?? '', selectedRegionId: regions[0]?.id ?? '' }, updatedAt: new Date().toISOString() }
}

export function saveSkillboundWorkspace(workspace: ForgeProjectWorkspace) { const next = { ...workspace, updatedAt: new Date().toISOString() }; localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next)); skillboundWorkspacePromise = Promise.resolve(next); window.dispatchEvent(new CustomEvent('forge-project-saved', { detail: { projectId: next.manifest.id } })); return next }
export function clearSkillboundWorkspace() { localStorage.removeItem(WORKSPACE_KEY); localStorage.removeItem(LEGACY_V3_KEY); localStorage.removeItem(LEGACY_V2_KEY); localStorage.removeItem(LEGACY_V1_KEY); skillboundWorkspacePromise = undefined }
export function patchRegion(workspace: ForgeProjectWorkspace, region: ForgeRegionDefinition): ForgeProjectWorkspace { return { ...workspace, regions: workspace.regions.map((item) => item.id === region.id ? region : item), updatedAt: new Date().toISOString() } }
export function patchGameplay(workspace: ForgeProjectWorkspace, gameplay: ForgeGameplayContent): ForgeProjectWorkspace { return { ...workspace, gameplay, updatedAt: new Date().toISOString() } }
export function patchUi(workspace: ForgeProjectWorkspace, ui: ForgeUiThemeDefinition): ForgeProjectWorkspace { return { ...workspace, ui, updatedAt: new Date().toISOString() } }
export function patchDungeon(workspace: ForgeProjectWorkspace, dungeon: ForgeProjectDungeonDefinition): ForgeProjectWorkspace { const exists = workspace.dungeons.some((item) => item.id === dungeon.id); return { ...workspace, dungeons: exists ? workspace.dungeons.map((item) => item.id === dungeon.id ? dungeon : item) : [...workspace.dungeons, dungeon], updatedAt: new Date().toISOString() } }
export function patchEncounterProfiles(workspace: ForgeProjectWorkspace, encounterProfiles: ForgeEncounterProfile[]): ForgeProjectWorkspace { return { ...workspace, encounterProfiles, updatedAt: new Date().toISOString() } }
export function patchBossProfiles(workspace: ForgeProjectWorkspace, bossProfiles: ForgeBossDefinition[]): ForgeProjectWorkspace { return { ...workspace, bossProfiles, updatedAt: new Date().toISOString() } }

type CachedWorkspace = Partial<ForgeProjectWorkspace> & Pick<ForgeProjectWorkspace, 'manifest'>
function readCachedWorkspace(key: string): CachedWorkspace | undefined { const cached = localStorage.getItem(key); if (!cached) return undefined; try { const parsed = JSON.parse(cached) as CachedWorkspace; if (parsed.manifest?.format !== 'forge-project' || parsed.manifest.id !== 'skillbound') return undefined; if (!parsed.worlds?.length || !parsed.regions?.length || !parsed.editor) return undefined; return parsed } catch { return undefined } }
async function loadRegions(manifest: ForgeProjectManifest) { return await Promise.all(manifest.content.regions.map((path) => fetchJson<ForgeRegionDefinition>(`${PROJECT_ROOT}${path}`))) }
async function loadDungeons(manifest: ForgeProjectManifest): Promise<ForgeProjectDungeonDefinition[]> { return await Promise.all((manifest.content.dungeons ?? []).map(async (path) => { const value = await fetchJson<DungeonWithProps & { id?: string }>(`${PROJECT_ROOT}${path}`); return { ...value, id: value.id ?? dungeonIdFromPath(path) } as ForgeProjectDungeonDefinition })) }
async function loadEncounterProfiles(manifest: ForgeProjectManifest): Promise<ForgeEncounterProfile[]> { return await Promise.all((manifest.content.encounters ?? []).map((path) => fetchJson<ForgeEncounterProfile>(`${PROJECT_ROOT}${path}`))) }
async function loadBossProfiles(manifest: ForgeProjectManifest): Promise<ForgeBossDefinition[]> { return await Promise.all((manifest.content.bosses ?? []).map((path) => fetchJson<ForgeBossDefinition>(`${PROJECT_ROOT}${path}`))) }
async function loadGameplay(manifest: ForgeProjectManifest): Promise<ForgeGameplayContent> { const [player, abilities, enemies, items, lootTables] = await Promise.all([fetchJson<ForgePlayerDefinition>(`${PROJECT_ROOT}${manifest.content.player}`), Promise.all(manifest.content.abilities.map((path) => fetchJson<ForgeAbilityDefinition>(`${PROJECT_ROOT}${path}`))), Promise.all(manifest.content.enemies.map((path) => fetchJson<ForgeEnemyDefinition>(`${PROJECT_ROOT}${path}`))), Promise.all(manifest.content.items.map((path) => fetchJson<ForgeItemDefinition>(`${PROJECT_ROOT}${path}`))), Promise.all(manifest.content.lootTables.map((path) => fetchJson<ForgeLootTableDefinition>(`${PROJECT_ROOT}${path}`)))]); return { player, abilities, enemies, items, lootTables } }
async function loadUi(manifest: ForgeProjectManifest): Promise<ForgeUiThemeDefinition> { if (!manifest.content.ui) return createDefaultSkillboundUiDefinition(); try { const value = await fetchJson<ForgeUiThemeDefinition>(`${PROJECT_ROOT}${manifest.content.ui}`); if (value.format !== 'forge-ui-theme' || value.version !== 1 || value.projectId !== manifest.id || !value.theme) throw new Error('Invalid Forge UI theme definition.'); return value } catch { return createDefaultSkillboundUiDefinition() } }
function mergeProjectRegionLinks(cached: ForgeRegionDefinition[], bundled: ForgeRegionDefinition[]) { const bundledById = new Map(bundled.map((region) => [region.id, region])); return cached.map((region) => ({ ...region, linkedDungeonId: region.linkedDungeonId ?? bundledById.get(region.id)?.linkedDungeonId })) }
function mergeProjectDungeonBindings(cached: ForgeProjectDungeonDefinition[], bundled: ForgeProjectDungeonDefinition[]) { const bundledById = new Map(bundled.map((dungeon) => [dungeon.id, dungeon])); return cached.map((dungeon) => { const source = bundledById.get(dungeon.id); if (!dungeon.logic?.encounters || !source?.logic?.encounters) return dungeon; const sourceById = new Map(source.logic.encounters.map((encounter) => [encounter.id, encounter as typeof encounter & { encounterProfileId?: string; bossProfileId?: string }])); return { ...dungeon, logic: { ...dungeon.logic, encounters: dungeon.logic.encounters.map((encounter) => { const current = encounter as typeof encounter & { encounterProfileId?: string; bossProfileId?: string }; const authored = sourceById.get(encounter.id); return { ...encounter, encounterProfileId: current.encounterProfileId ?? authored?.encounterProfileId, bossProfileId: current.bossProfileId ?? authored?.bossProfileId } }) } } }) }
function dungeonIdFromPath(path: string) { const filename = path.split('/').pop() ?? path; return filename.replace(/\.forge-dungeon\.json$/i, '').replace(/\.dungeon\.json$/i, '').replace(/\.json$/i, '') }
async function fetchJson<T>(url: string): Promise<T> { const response = await fetch(url); if (!response.ok) throw new Error(`Could not load Forge project file: ${url}`); return await response.json() as T }
