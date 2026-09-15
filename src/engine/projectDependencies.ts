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
  const enemyIds = new Set(workspace.gameplay.enemies.map((enemy) => enemy.id))
  const itemIds = new Set(workspace.gameplay.items.map((item) => item.id))
  const lootIds = new Set(workspace.gameplay.lootTables.map((table) => table.id))
  const regionIds = new Set(workspace.regions.map((region) => region.id))
  const dungeonIds = new Set(workspace.dungeons.map((dungeon) => dungeon.id))
  const encounterIds = new Set(workspace.encounterProfiles.map((profile) => profile.id))
  const bossIds = new Set(workspace.bossProfiles.map((boss) => boss.id))

  for (const world of workspace.worlds) {
    for (const node of world.nodes) {
      if (!node.ref) continue
      if (node.type === 'procedural-region') {
        edges.push(projectEdge(`world.${world.id}`, `region.${node.ref}`, `${node.label} region`, regionIds.has(node.ref), true,
          regionIds.has(node.ref) ? 'Campaign node resolves to authored region grammar.' : `Missing region definition: ${node.ref}`))
      } else if (node.type === 'dungeon') {
        edges.push(projectEdge(`world.${world.id}`, `dungeon.${node.ref}`, `${node.label} dungeon`, dungeonIds.has(node.ref), node.required,
          dungeonIds.has(node.ref) ? 'Campaign dungeon resolves to an authored Map Studio package.' : `Missing dungeon definition: ${node.ref}`))
      }
    }
  }

  for (const region of workspace.regions) {
    if (!region.linkedDungeonId) continue
    edges.push(projectEdge(`region.${region.id}`, `dungeon.${region.linkedDungeonId}`, 'Linked dungeon entrance', dungeonIds.has(region.linkedDungeonId), true,
      dungeonIds.has(region.linkedDungeonId) ? 'Generated region can transition into the authored dungeon.' : `Missing linked dungeon: ${region.linkedDungeonId}`))
  }

  for (const dungeon of workspace.dungeons) {
    for (const raw of dungeon.logic?.encounters ?? []) {
      const encounter = raw as typeof raw & { encounterProfileId?: string; bossProfileId?: string }
      if (encounter.encounterProfileId) {
        edges.push(projectEdge(`dungeon.${dungeon.id}`, `encounter.${encounter.encounterProfileId}`, `${encounter.name} profile`, encounterIds.has(encounter.encounterProfileId), true,
          encounterIds.has(encounter.encounterProfileId) ? 'Dungeon encounter resolves to Encounter Forge content.' : `Missing encounter profile: ${encounter.encounterProfileId}`))
      }
      if (encounter.bossProfileId) {
        edges.push(projectEdge(`dungeon.${dungeon.id}`, `boss.${encounter.bossProfileId}`, `${encounter.name} boss`, bossIds.has(encounter.bossProfileId), true,
          bossIds.has(encounter.bossProfileId) ? 'Dungeon boss resolves to Boss Forge content.' : `Missing boss profile: ${encounter.bossProfileId}`))
      }
    }
  }

  const playerSource = `player.${workspace.gameplay.player.id}`
  edges.push(projectEdge(playerSource, `ability.${workspace.gameplay.player.basicAbility}`, 'Basic ability', abilityIds.has(workspace.gameplay.player.basicAbility), true,
    abilityIds.has(workspace.gameplay.player.basicAbility) ? 'Basic ability resolves.' : 'Player basic ability is missing.'))

  for (const abilityId of workspace.gameplay.player.activeAbilities) {
    edges.push(projectEdge(playerSource, `ability.${abilityId}`, 'Active ability', abilityIds.has(abilityId), true,
      abilityIds.has(abilityId) ? 'Active ability resolves.' : `Missing active ability: ${abilityId}`))
  }
  for (const itemId of workspace.gameplay.player.startingItems) {
    edges.push(projectEdge(playerSource, `item.${itemId}`, 'Starting item', itemIds.has(itemId), true,
      itemIds.has(itemId) ? 'Starting item resolves.' : `Missing starting item: ${itemId}`))
  }
  edges.push(assetEdge(playerSource, workspace.gameplay.player.characterAssetId, 'Player character', assetIds))
  edges.push(assetEdge(playerSource, workspace.gameplay.player.animationAssetId, 'Player animations', assetIds))

  for (const enemy of workspace.gameplay.enemies) {
    const source = `enemy.${enemy.id}`
    edges.push(projectEdge(source, `loot.${enemy.lootTable}`, 'Loot table', lootIds.has(enemy.lootTable), true,
      lootIds.has(enemy.lootTable) ? 'Enemy loot table resolves.' : `Missing loot table: ${enemy.lootTable}`))
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
      edges.push(projectEdge(`loot.${table.id}`, `item.${entry.itemId}`, 'Drop item', itemIds.has(entry.itemId), true,
        itemIds.has(entry.itemId) ? `${Math.round(entry.chance * 100)}% drop resolves.` : `Missing item definition: ${entry.itemId}`))
    }
  }

  for (const profile of workspace.encounterProfiles) {
    const source = `encounter.${profile.id}`
    edges.push(projectEdge(source, `enemy.${profile.enemyId}`, 'Encounter enemy', enemyIds.has(profile.enemyId), true,
      enemyIds.has(profile.enemyId) ? 'Encounter enemy resolves.' : `Missing enemy definition: ${profile.enemyId}`))
    if (profile.rewardLootTableId) edges.push(projectEdge(source, `loot.${profile.rewardLootTableId}`, 'Encounter reward', lootIds.has(profile.rewardLootTableId), false,
      lootIds.has(profile.rewardLootTableId) ? 'Optional reward table resolves.' : `Missing optional reward table: ${profile.rewardLootTableId}`))
  }

  for (const boss of workspace.bossProfiles) {
    const source = `boss.${boss.id}`
    edges.push(projectEdge(source, `enemy.${boss.enemyId}`, 'Boss enemy', enemyIds.has(boss.enemyId), true,
      enemyIds.has(boss.enemyId) ? 'Boss base enemy resolves.' : `Missing enemy definition: ${boss.enemyId}`))
    if (boss.rewardLootTableId) edges.push(projectEdge(source, `loot.${boss.rewardLootTableId}`, 'Boss reward table', lootIds.has(boss.rewardLootTableId), false,
      lootIds.has(boss.rewardLootTableId) ? 'Boss reward table resolves.' : `Missing reward table: ${boss.rewardLootTableId}`))
    if (boss.guaranteedItemId) edges.push(projectEdge(source, `item.${boss.guaranteedItemId}`, 'Guaranteed boss item', itemIds.has(boss.guaranteedItemId), true,
      itemIds.has(boss.guaranteedItemId) ? 'Guaranteed item resolves.' : `Missing guaranteed item: ${boss.guaranteedItemId}`))
    for (const phase of boss.phases) {
      if (phase.summonEnemyId) edges.push(projectEdge(source, `enemy.${phase.summonEnemyId}`, `${phase.name} summon`, enemyIds.has(phase.summonEnemyId), true,
        enemyIds.has(phase.summonEnemyId) ? 'Phase summon resolves.' : `Missing summon enemy: ${phase.summonEnemyId}`))
      edges.push(assetEdge(source, phase.vfxAssetId, `${phase.name} VFX`, assetIds))
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
