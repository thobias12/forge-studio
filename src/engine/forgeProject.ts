export type ForgeProjectManifest = {
  format: 'forge-project'
  version: 1
  id: string
  name: string
  generationVersion: number
  runtime: {
    renderer: 'three'
    entryWorld: string
    mode: 'single-player'
  }
  content: {
    worlds: string[]
    regions: string[]
    player: string
    abilities: string[]
    enemies: string[]
    items: string[]
    lootTables: string[]
  }
}

export type ForgeWorldNodeType = 'procedural-region' | 'town' | 'dungeon'

export type ForgeWorldNode = {
  id: string
  label: string
  type: ForgeWorldNodeType
  ref?: string
  required: boolean
}

export type ForgeWorldDefinition = {
  format: 'forge-world'
  version: 1
  id: string
  name: string
  act: number
  nodes: ForgeWorldNode[]
}

export type ForgePathStyle = 'direct' | 'winding' | 'meandering'
export type ForgeDensity = 'low' | 'medium' | 'high'

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
  optionalDungeonChance: number
  settlementChance: number
  features: string[]
}

export type ForgeAbilityKind = 'melee' | 'area'
export type ForgeAbilityInput = 'primary' | 'skill-1'

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
}

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
  lootTable: string
  color: string
}

export type ForgeItemSlot = 'weapon'
export type ForgeItemRarity = 'common' | 'magic' | 'rare'

export type ForgeItemDefinition = {
  format: 'forge-item'
  version: 1
  id: string
  name: string
  slot: ForgeItemSlot
  rarity: ForgeItemRarity
  damageBonus: number
  color: string
}

export type ForgeLootEntry = {
  itemId: string
  chance: number
}

export type ForgeLootTableDefinition = {
  format: 'forge-loot-table'
  version: 1
  id: string
  name: string
  entries: ForgeLootEntry[]
}

export type ForgePlayerDefinition = {
  format: 'forge-player'
  version: 1
  id: string
  name: string
  maxHealth: number
  moveSpeed: number
  dodgeDistance: number
  dodgeCooldown: number
  basicAbility: string
  activeAbilities: string[]
  startingItems: string[]
}

export type ForgeGameplayContent = {
  player: ForgePlayerDefinition
  abilities: ForgeAbilityDefinition[]
  enemies: ForgeEnemyDefinition[]
  items: ForgeItemDefinition[]
  lootTables: ForgeLootTableDefinition[]
}

export type ForgeProjectWorkspace = {
  manifest: ForgeProjectManifest
  worlds: ForgeWorldDefinition[]
  regions: ForgeRegionDefinition[]
  gameplay: ForgeGameplayContent
  editor: {
    previewSeed: number
    selectedWorldId: string
    selectedRegionId: string
  }
  updatedAt: string
}

const WORKSPACE_KEY = 'forge-project:skillbound:v1'
const PROJECT_ROOT = './projects/skillbound/'

export async function loadSkillboundWorkspace(forceBundled = false): Promise<ForgeProjectWorkspace> {
  const manifest = await fetchJson<ForgeProjectManifest>(`${PROJECT_ROOT}project.forge.json`)

  if (!forceBundled) {
    const cached = localStorage.getItem(WORKSPACE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Partial<ForgeProjectWorkspace>
        if (parsed.manifest?.format === 'forge-project' && parsed.manifest.id === 'skillbound' && parsed.worlds?.length && parsed.regions?.length && parsed.editor) {
          return {
            manifest,
            worlds: parsed.worlds,
            regions: parsed.regions,
            gameplay: await loadGameplay(manifest),
            editor: parsed.editor,
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
          }
        }
      } catch {
        // Fall through to the bundled project if the editor cache is invalid.
      }
    }
  }

  const [worlds, regions, gameplay] = await Promise.all([
    Promise.all(manifest.content.worlds.map((path) => fetchJson<ForgeWorldDefinition>(`${PROJECT_ROOT}${path}`))),
    Promise.all(manifest.content.regions.map((path) => fetchJson<ForgeRegionDefinition>(`${PROJECT_ROOT}${path}`))),
    loadGameplay(manifest),
  ])
  const firstWorld = worlds[0]
  const firstRegion = regions[0]

  return {
    manifest,
    worlds,
    regions,
    gameplay,
    editor: {
      previewSeed: 8472152,
      selectedWorldId: firstWorld?.id ?? '',
      selectedRegionId: firstRegion?.id ?? '',
    },
    updatedAt: new Date().toISOString(),
  }
}

export function saveSkillboundWorkspace(workspace: ForgeProjectWorkspace) {
  const next: ForgeProjectWorkspace = { ...workspace, updatedAt: new Date().toISOString() }
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('forge-project-saved', { detail: { projectId: next.manifest.id } }))
  return next
}

export function clearSkillboundWorkspace() {
  localStorage.removeItem(WORKSPACE_KEY)
}

export function patchRegion(workspace: ForgeProjectWorkspace, region: ForgeRegionDefinition): ForgeProjectWorkspace {
  return {
    ...workspace,
    regions: workspace.regions.map((item) => item.id === region.id ? region : item),
    updatedAt: new Date().toISOString(),
  }
}

async function loadGameplay(manifest: ForgeProjectManifest): Promise<ForgeGameplayContent> {
  const [player, abilities, enemies, items, lootTables] = await Promise.all([
    fetchJson<ForgePlayerDefinition>(`${PROJECT_ROOT}${manifest.content.player}`),
    Promise.all(manifest.content.abilities.map((path) => fetchJson<ForgeAbilityDefinition>(`${PROJECT_ROOT}${path}`))),
    Promise.all(manifest.content.enemies.map((path) => fetchJson<ForgeEnemyDefinition>(`${PROJECT_ROOT}${path}`))),
    Promise.all(manifest.content.items.map((path) => fetchJson<ForgeItemDefinition>(`${PROJECT_ROOT}${path}`))),
    Promise.all(manifest.content.lootTables.map((path) => fetchJson<ForgeLootTableDefinition>(`${PROJECT_ROOT}${path}`))),
  ])
  return { player, abilities, enemies, items, lootTables }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load Forge project file: ${url}`)
  return await response.json() as T
}
