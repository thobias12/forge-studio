import type { ForgeProjectWorkspace } from './forgeProject'
import type { LibraryAsset } from '../lib/library'

export type ForgeReadiness = 'ready' | 'warning' | 'missing'
export type ForgeContentKind =
  | 'project'
  | 'world'
  | 'region'
  | 'character'
  | 'ui'
  | 'runtime'
  | 'vfx'
  | 'audio'
  | 'dungeon'
  | 'player'
  | 'ability'
  | 'enemy'
  | 'item'
  | 'loot'
  | 'asset'

export type ForgeContentPage =
  | 'home'
  | 'projects'
  | 'world'
  | 'maps'
  | 'uiforge'
  | 'characterforge'
  | 'characters'
  | 'animations'
  | 'vfx'
  | 'mocap'
  | 'models'
  | 'destruction'
  | 'conceptforge'
  | 'textures'
  | 'audio'
  | 'preview'
  | 'assets'
  | 'play'
  | 'validation'

export type ForgeReadinessCheck = {
  id: string
  label: string
  status: ForgeReadiness
  detail: string
}

export type ForgeContentEntry = {
  id: string
  name: string
  kind: ForgeContentKind
  source: string
  page: ForgeContentPage
  tags: string[]
  checks: ForgeReadinessCheck[]
}

export type ForgeHealthDomain = {
  id: string
  label: string
  status: ForgeReadiness
  detail: string
  page: ForgeContentPage
}

export type ForgePipelineStage = {
  id: string
  label: string
  status: ForgeReadiness
  detail: string
}

export const CORE_REGISTRY_ENTRIES: ForgeContentEntry[] = [
  {
    id: 'runtime.forge',
    name: 'Forge Runtime',
    kind: 'runtime',
    source: 'Forge Engine',
    page: 'play',
    tags: ['runtime', 'three.js', 'skillbound'],
    checks: [
      check('renderer', 'Three.js renderer', 'ready', 'Runtime rendering path is connected.'),
      check('world-data', 'Forge project data', 'ready', 'Runtime consumes the same world data as the editor.'),
      check('gameplay', 'Gameplay systems', 'ready', 'Phase 2 proves movement, combat, loot, HUD and persistence.'),
    ],
  },
  {
    id: 'character.crypt_skeleton',
    name: 'Crypt Skeleton',
    kind: 'character',
    source: 'Concept Forge',
    page: 'conceptforge',
    tags: ['enemy', 'skeleton', 'ForgeHumanoidV1', 'rigged', 'skillbound'],
    checks: [
      check('model', 'Curated model', 'ready', 'Concept Forge has a dedicated Crypt Skeleton build.'),
      check('rig', 'ForgeHumanoidV1 rig', 'ready', 'The skeleton uses the shared humanoid runtime rig.'),
      check('clips', 'Combat animation set', 'ready', 'Idle, Walk, Attack and Death clips are available.'),
      check('hitbox', 'Runtime hitbox', 'ready', 'Character preview exposes the gameplay capsule.'),
      check('materials', 'ARPG materials', 'ready', 'Dark ARPG palette and material pass are present.'),
    ],
  },
  {
    id: 'ui.skillbound',
    name: 'Skillbound UI System',
    kind: 'ui',
    source: 'UI Forge',
    page: 'uiforge',
    tags: ['ui', 'hud', 'inventory', 'character', 'skills', 'skillbound'],
    checks: [
      check('design-system', 'Shared design tokens', 'ready', 'HUD, inventory, character and skills share one theme.'),
      check('responsive', 'Viewport presets', 'ready', 'UI Forge can test compact, desktop and ultrawide layouts.'),
      check('runtime-ui', 'Runtime HUD', 'ready', 'Phase 2 now renders health, cooldowns, inventory and save state in play mode.'),
    ],
  },
]

export const SKILLBOUND_PIPELINE: ForgePipelineStage[] = [
  { id: 'world', label: 'World', status: 'ready', detail: 'Seeded guided world + region grammar' },
  { id: 'scene', label: 'Scene', status: 'ready', detail: 'Editor -> runtime handoff works' },
  { id: 'entities', label: 'Entities', status: 'ready', detail: 'Player + enemy definitions load from project data' },
  { id: 'combat', label: 'Combat', status: 'ready', detail: 'Attack, active skill and dodge are playable' },
  { id: 'loot', label: 'Loot', status: 'ready', detail: 'Drops, pickup, inventory and equip work' },
  { id: 'ui', label: 'UI', status: 'ready', detail: 'Runtime HUD and inventory are connected' },
  { id: 'save', label: 'Save', status: 'ready', detail: 'Gameplay state persists by project/region/seed' },
  { id: 'presentation', label: 'Presentation', status: 'warning', detail: 'Authored models, animation, VFX and audio are next' },
]

export const RECENT_FORGE_CHANGES = [
  { version: '1.14', title: 'Phase 2 gameplay loop', detail: 'Movement, enemy AI, combat, loot, inventory, HUD and persistent runtime save.' },
  { version: '1.13', title: 'Skillbound project foundation', detail: 'Project Manager, World Forge and shared Forge Runtime boundary.' },
  { version: '1.12', title: 'UI Forge', detail: 'Skillbound design system with responsive HUD and menu previews.' },
]

export function buildContentRegistry(workspace?: ForgeProjectWorkspace, assets: LibraryAsset[] = []) {
  const entries: ForgeContentEntry[] = [...CORE_REGISTRY_ENTRIES]

  if (workspace) {
    entries.unshift({
      id: `project.${workspace.manifest.id}`,
      name: workspace.manifest.name,
      kind: 'project',
      source: 'Forge Project',
      page: 'projects',
      tags: ['project', 'skillbound', 'active'],
      checks: [
        check('manifest', 'Project manifest', 'ready', 'project.forge.json loaded.'),
        check('entry-world', 'Entry world', workspace.worlds.length ? 'ready' : 'missing', workspace.worlds.length ? `${workspace.worlds.length} world definition loaded.` : 'No world definition found.'),
        check('regions', 'Region grammar', workspace.regions.length ? 'ready' : 'missing', workspace.regions.length ? `${workspace.regions.length} region definitions loaded.` : 'No region grammar found.'),
        check('runtime', 'Runtime contract', 'ready', `${workspace.manifest.runtime.renderer} · ${workspace.manifest.runtime.mode}`),
      ],
    })

    for (const world of workspace.worlds) {
      entries.push({
        id: `world.${world.id}`,
        name: world.name,
        kind: 'world',
        source: 'World Forge',
        page: 'world',
        tags: ['world', `act-${world.act}`, 'skillbound'],
        checks: [
          check('graph', 'Campaign graph', world.nodes.length ? 'ready' : 'missing', `${world.nodes.length} campaign nodes.`),
          check('required-path', 'Required path', world.nodes.some((node) => node.required) ? 'ready' : 'warning', 'Required campaign anchors are authored.'),
        ],
      })
    }

    for (const region of workspace.regions) {
      entries.push({
        id: `region.${region.id}`,
        name: region.name,
        kind: 'region',
        source: 'World Forge',
        page: 'world',
        tags: ['region', slug(region.biome), 'procedural', 'skillbound'],
        checks: [
          check('grammar', 'Generation grammar', 'ready', `${region.mainPath} path · ${region.chunkRange[0]}-${region.chunkRange[1]} chunks.`),
          check('encounters', 'Enemy density', 'ready', `${region.enemyDensity} enemy density.`),
          check('features', 'Biome features', region.features.length ? 'ready' : 'warning', `${region.features.length} generation features.`),
        ],
      })
    }
  }

  if (workspace?.gameplay) {
    const { player, abilities, enemies, items, lootTables } = workspace.gameplay
    entries.push({
      id: `player.${player.id}`,
      name: player.name,
      kind: 'player',
      source: 'Forge Runtime',
      page: 'play',
      tags: ['player', 'skillbound', 'runtime'],
      checks: [
        check('stats', 'Player stats', 'ready', `${player.maxHealth} health · ${player.moveSpeed} move speed.`),
        check('abilities', 'Ability bindings', abilities.some((ability) => ability.id === player.basicAbility) ? 'ready' : 'missing', `${1 + player.activeAbilities.length} combat bindings.`),
        check('dodge', 'Dodge', 'ready', `${player.dodgeDistance} distance · ${player.dodgeCooldown}s cooldown.`),
      ],
    })

    for (const ability of abilities) entries.push({
      id: `ability.${ability.id}`,
      name: ability.name,
      kind: 'ability',
      source: 'Forge Project',
      page: 'play',
      tags: ['ability', ability.kind, ability.input, 'skillbound'],
      checks: [
        check('definition', 'Ability definition', 'ready', `${ability.damage} damage · ${ability.cooldown}s cooldown.`),
        check('runtime', 'Runtime execution', 'ready', `${ability.kind} ability is consumed by Forge Runtime.`),
        check('presentation', 'Authored presentation', 'warning', 'Connect final animation, VFX and audio in the next pass.'),
      ],
    })

    for (const enemy of enemies) entries.push({
      id: `enemy.${enemy.id}`,
      name: enemy.name,
      kind: 'enemy',
      source: 'Forge Project',
      page: 'play',
      tags: ['enemy', 'ai', 'combat', 'skillbound'],
      checks: [
        check('stats', 'Enemy stats', 'ready', `${enemy.maxHealth} health · ${enemy.moveSpeed} move speed.`),
        check('ai', 'Enemy AI', 'ready', `Aggro ${enemy.aggroRange} · melee range ${enemy.attackRange}.`),
        check('loot', 'Loot reference', lootTables.some((table) => table.id === enemy.lootTable) ? 'ready' : 'missing', enemy.lootTable),
        check('model', 'Authored character asset', 'warning', 'Runtime still uses development presentation for this enemy.'),
      ],
    })

    for (const item of items) entries.push({
      id: `item.${item.id}`,
      name: item.name,
      kind: 'item',
      source: 'Forge Project',
      page: 'play',
      tags: ['item', item.slot, item.rarity, 'skillbound'],
      checks: [
        check('definition', 'Item definition', 'ready', `${item.rarity} ${item.slot} · +${item.damageBonus} damage.`),
        check('inventory', 'Inventory + equip', 'ready', 'Runtime can pick up and equip this item.'),
        check('visual', 'Authored item visual', 'warning', 'Dedicated item model/icon is still presentation work.'),
      ],
    })

    for (const table of lootTables) entries.push({
      id: `loot.${table.id}`,
      name: table.name,
      kind: 'loot',
      source: 'Forge Project',
      page: 'play',
      tags: ['loot', 'drops', 'skillbound'],
      checks: [
        check('entries', 'Loot entries', table.entries.length ? 'ready' : 'missing', `${table.entries.length} drop entries.`),
        check('references', 'Item references', table.entries.every((entry) => items.some((item) => item.id === entry.itemId)) ? 'ready' : 'missing', 'Referenced items resolve in the project registry.'),
      ],
    })
  }

  for (const asset of assets) entries.push(libraryAssetEntry(asset))

  return dedupe(entries)
}

export function summarizeProjectHealth(registry: ForgeContentEntry[]): ForgeHealthDomain[] {
  const any = (kind: ForgeContentKind) => registry.some((entry) => entry.kind === kind)
  const anyReady = (kind: ForgeContentKind) => registry.some((entry) => entry.kind === kind && entryStatus(entry) === 'ready')

  return [
    { id: 'world', label: 'World', status: anyReady('world') && anyReady('region') ? 'ready' : 'warning', detail: any('region') ? 'World graph + procedural regions' : 'Needs authored world data', page: 'world' },
    { id: 'runtime', label: 'Runtime', status: anyReady('player') && anyReady('enemy') && anyReady('ability') ? 'ready' : 'warning', detail: anyReady('player') ? 'Phase 2 gameplay loop is playable' : 'Gameplay runtime needs validation', page: 'play' },
    { id: 'characters', label: 'Characters', status: anyReady('character') ? 'warning' : 'missing', detail: anyReady('character') ? 'Rig pipeline exists · runtime presentation integration next' : 'No validated character yet', page: 'characterforge' },
    { id: 'ui', label: 'UI', status: anyReady('ui') ? 'ready' : 'missing', detail: any('ui') ? 'Design system + runtime HUD are connected' : 'No Skillbound UI registered', page: 'uiforge' },
    { id: 'vfx', label: 'VFX', status: anyReady('vfx') ? 'ready' : 'warning', detail: any('vfx') ? 'Library VFX packages available' : 'Runtime supports VFX; project content not registered', page: 'vfx' },
    { id: 'dungeons', label: 'Dungeons', status: anyReady('dungeon') ? 'ready' : 'warning', detail: any('dungeon') ? 'Dungeon content registered' : 'Map Studio packages need project registration', page: 'maps' },
    { id: 'audio', label: 'Audio', status: anyReady('audio') ? 'ready' : 'warning', detail: any('audio') ? 'Audio content available in library' : 'No project audio registered yet', page: 'audio' },
  ]
}

export function entryStatus(entry: ForgeContentEntry): ForgeReadiness {
  if (entry.checks.some((item) => item.status === 'missing')) return 'missing'
  if (entry.checks.some((item) => item.status === 'warning')) return 'warning'
  return 'ready'
}

export function searchForgeRegistry(registry: ForgeContentEntry[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return registry
  return registry.filter((entry) =>
    entry.id.toLowerCase().includes(needle) ||
    entry.name.toLowerCase().includes(needle) ||
    entry.kind.toLowerCase().includes(needle) ||
    entry.source.toLowerCase().includes(needle) ||
    entry.tags.some((tag) => tag.toLowerCase().includes(needle)),
  )
}

export function registryStats(registry: ForgeContentEntry[]) {
  const byKind = registry.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] ?? 0) + 1
    return acc
  }, {})
  const checks = registry.flatMap((entry) => entry.checks)
  return {
    total: registry.length,
    ready: checks.filter((item) => item.status === 'ready').length,
    warnings: checks.filter((item) => item.status === 'warning').length,
    missing: checks.filter((item) => item.status === 'missing').length,
    byKind,
  }
}

function libraryAssetEntry(asset: LibraryAsset): ForgeContentEntry {
  const kind = asset.category === 'characters' ? 'character'
    : asset.category === 'vfx' ? 'vfx'
      : asset.category === 'audio' ? 'audio'
        : 'asset'
  const runtimePackaged = ['characters', 'vfx', 'materials', 'animations'].includes(asset.category)

  return {
    id: `library.${asset.id}`,
    name: asset.name,
    kind,
    source: 'Asset Library',
    page: 'assets',
    tags: [asset.category, asset.kind, ...asset.tags],
    checks: [
      check('stored', 'Library asset', 'ready', `${formatBytes(asset.size)} · ${asset.kind}`),
      check('runtime', 'Runtime package', runtimePackaged ? 'ready' : 'warning', runtimePackaged ? 'Forge has a runtime/export contract for this asset type.' : 'This asset still needs a project-specific runtime reference.'),
    ],
  }
}

function check(id: string, label: string, status: ForgeReadiness, detail: string): ForgeReadinessCheck {
  return { id, label, status, detail }
}

function dedupe(entries: ForgeContentEntry[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'content'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
