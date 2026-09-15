import type { ForgeProjectWorkspace } from './forgeProject'
import type { LibraryAsset } from '../lib/library'
import { itemVisual } from './itemPresentation'

export type ForgeDependencyStatus = 'ready' | 'warning' | 'missing'

export type ForgeDependencyEdge = {
  id: string
  sourceId: string
  targetId: string
  label: string
  kind: 'project' | 'asset'
  required: boolean
  status: ForgeDependencyStatus
  detail: string
}

export type ForgeDependencySummary = {
  total: number
  ready: number
  warnings: number
  missing: number
}

export function buildProjectDependencies(workspace: ForgeProjectWorkspace, assets: LibraryAsset[] = []): ForgeDependencyEdge[] {
  const edges: ForgeDependencyEdge[] = []
  const assetIds = new Set(assets.map((asset) => asset.id))
  const abilityIds = new Set(workspace.gameplay.abilities.map((ability) => ability.id))
  const itemIds = new Set(workspace.gameplay.items.map((item) => item.id))
  const lootIds = new Set(workspace.gameplay.lootTables.map((table) => table.id))
  const regionIds = new Set(workspace.regions.map((region) => region.id))

  for (const world of workspace.worlds) {
    for (const node of world.nodes) {
      if (node.type !== 'procedural-region' || !node.ref) continue
      edges.push(projectEdge(
        `world.${world.id}`,
        `region.${node.ref}`,
        `${node.label} region`,
        regionIds.has(node.ref),
        true,
        regionIds.has(node.ref) ? 'Campaign node resolves to authored region grammar.' : `Missing region definition: ${node.ref}`,
      ))
    }
  }

  const playerSource = `player.${workspace.gameplay.player.id}`
  edges.push(projectEdge(
    playerSource,
    `ability.${workspace.gameplay.player.basicAbility}`,
    'Basic ability',
    abilityIds.has(workspace.gameplay.player.basicAbility),
    true,
    abilityIds.has(workspace.gameplay.player.basicAbility) ? 'Basic ability resolves.' : 'Player basic ability is missing.',
  ))

  for (const abilityId of workspace.gameplay.player.activeAbilities) {
    edges.push(projectEdge(
      playerSource,
      `ability.${abilityId}`,
      'Active ability',
      abilityIds.has(abilityId),
      true,
      abilityIds.has(abilityId) ? 'Active ability resolves.' : `Missing active ability: ${abilityId}`,
    ))
  }
  for (const itemId of workspace.gameplay.player.startingItems) {
    edges.push(projectEdge(
      playerSource,
      `item.${itemId}`,
      'Starting item',
      itemIds.has(itemId),
      true,
      itemIds.has(itemId) ? 'Starting item resolves.' : `Missing starting item: ${itemId}`,
    ))
  }
  edges.push(assetEdge(playerSource, workspace.gameplay.player.characterAssetId, 'Player character', assetIds))
  edges.push(assetEdge(playerSource, workspace.gameplay.player.animationAssetId, 'Player animations', assetIds))

  for (const enemy of workspace.gameplay.enemies) {
    const source = `enemy.${enemy.id}`
    edges.push(projectEdge(
      source,
      `loot.${enemy.lootTable}`,
      'Loot table',
      lootIds.has(enemy.lootTable),
      true,
      lootIds.has(enemy.lootTable) ? 'Enemy loot table resolves.' : `Missing loot table: ${enemy.lootTable}`,
    ))
    edges.push(assetEdge(source, enemy.characterAssetId, 'Character asset', assetIds))
    edges.push(assetEdge(source, enemy.animationAssetId, 'Animation set', assetIds))
    edges.push(assetEdge(source, enemy.attackVfxAssetId, 'Attack VFX', assetIds))
    edges.push(assetEdge(source, enemy.hitVfxAssetId, 'Hit VFX', assetIds))
    edges.push(assetEdge(source, enemy.deathVfxAssetId, 'Death VFX', assetIds))
  }

  for (const ability of workspace.gameplay.abilities) {
    const source = `ability.${ability.id}`
    edges.push(assetEdge(source, ability.animationAssetId, 'Ability animation', assetIds))
    edges.push(assetEdge(source, ability.vfxAssetId, 'Ability VFX', assetIds))
  }

  for (const item of workspace.gameplay.items) {
    const source = `item.${item.id}`
    const visual = itemVisual(item)
    const master = visual.masterAssetId ?? item.modelAssetId
    edges.push(assetEdge(source, master, 'Master item model', assetIds))
    if (!visual.drop.useMaster) edges.push(assetEdge(source, visual.drop.modelAssetId, 'World-drop override', assetIds))
    if (!visual.equipped.useMaster) edges.push(assetEdge(source, visual.equipped.modelAssetId, 'Equipped override', assetIds))
    if (visual.inventory.iconAssetId) edges.push(assetEdge(source, visual.inventory.iconAssetId, 'Generated inventory icon', assetIds))
  }

  for (const table of workspace.gameplay.lootTables) {
    for (const entry of table.entries) {
      edges.push(projectEdge(
        `loot.${table.id}`,
        `item.${entry.itemId}`,
        'Drop item',
        itemIds.has(entry.itemId),
        true,
        itemIds.has(entry.itemId) ? `${Math.round(entry.chance * 100)}% drop resolves.` : `Missing item definition: ${entry.itemId}`,
      ))
    }
  }

  return edges
}

export function summarizeDependencies(edges: ForgeDependencyEdge[]): ForgeDependencySummary {
  return {
    total: edges.length,
    ready: edges.filter((edge) => edge.status === 'ready').length,
    warnings: edges.filter((edge) => edge.status === 'warning').length,
    missing: edges.filter((edge) => edge.status === 'missing').length,
  }
}

export function dependenciesForSource(edges: ForgeDependencyEdge[], sourceId: string) {
  return edges.filter((edge) => edge.sourceId === sourceId)
}

function projectEdge(sourceId: string, targetId: string, label: string, resolved: boolean, required: boolean, detail: string): ForgeDependencyEdge {
  return {
    id: `${sourceId}:${label}:${targetId}`,
    sourceId,
    targetId,
    label,
    kind: 'project',
    required,
    status: resolved ? 'ready' : required ? 'missing' : 'warning',
    detail,
  }
}

function assetEdge(sourceId: string, assetId: string | undefined, label: string, assetIds: Set<string>): ForgeDependencyEdge {
  if (!assetId) {
    return {
      id: `${sourceId}:${label}:unbound`,
      sourceId,
      targetId: 'library.unbound',
      label,
      kind: 'asset',
      required: false,
      status: 'warning',
      detail: 'No Library asset is bound yet; Forge Runtime uses the safe placeholder.',
    }
  }

  const resolved = assetIds.has(assetId)
  return {
    id: `${sourceId}:${label}:library.${assetId}`,
    sourceId,
    targetId: `library.${assetId}`,
    label,
    kind: 'asset',
    required: true,
    status: resolved ? 'ready' : 'missing',
    detail: resolved ? 'Library asset resolves on this workstation.' : `Referenced Library asset ${assetId} is missing on this workstation.`,
  }
}
