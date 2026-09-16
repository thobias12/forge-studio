import type {
  ForgeAbilityDefinition,
  ForgeEnemyDefinition,
  ForgeItemDefinition,
  ForgeLootTableDefinition,
  ForgeProjectManifest,
  ForgeProjectWorkspace,
} from './forgeProject'

export type ManagedGameplayKind = 'enemy' | 'ability' | 'item' | 'loot'

export function slugContentId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function titleCaseId(value: string) {
  return value.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function uniqueContentId(base: string, ids: string[]) {
  const seed = slugContentId(base) || 'definition'
  if (!ids.includes(seed)) return seed
  let index = 2
  while (ids.includes(`${seed}-${index}`)) index += 1
  return `${seed}-${index}`
}

export function createEnemyDefinition(name: string, id: string, workspace: ForgeProjectWorkspace): ForgeEnemyDefinition {
  return {
    format: 'forge-enemy',
    version: 1,
    id,
    name,
    maxHealth: 85,
    moveSpeed: 4,
    aggroRange: 11,
    attackRange: 1.5,
    attackDamage: 12,
    attackCooldown: 1.15,
    attackWindup: 0.42,
    lootTable: workspace.gameplay.lootTables[0]?.id ?? '',
    color: '#745044',
  }
}

export function createAbilityDefinition(name: string, id: string): ForgeAbilityDefinition {
  return {
    format: 'forge-ability',
    version: 1,
    id,
    name,
    kind: 'melee',
    input: 'skill-1',
    damage: 20,
    cooldown: 1,
    range: 3,
    radius: 1.5,
    color: '#68d6a7',
  }
}

export function createItemDefinition(name: string, id: string): ForgeItemDefinition {
  return {
    format: 'forge-item',
    version: 1,
    id,
    name,
    slot: 'weapon',
    rarity: 'common',
    damageBonus: 0,
    color: '#8e8a80',
  }
}

export function createLootTableDefinition(name: string, id: string, workspace: ForgeProjectWorkspace): ForgeLootTableDefinition {
  const firstItem = workspace.gameplay.items[0]
  return {
    format: 'forge-loot-table',
    version: 1,
    id,
    name,
    entries: firstItem ? [{ itemId: firstItem.id, chance: 0.5 }] : [],
  }
}

export function duplicateName(name: string) {
  return /\bcopy(?: \d+)?$/i.test(name) ? `${name} 2` : `${name} Copy`
}

export function managedContentPath(kind: ManagedGameplayKind, id: string) {
  if (kind === 'enemy') return `enemies/${id}.enemy.json`
  if (kind === 'ability') return `abilities/${id}.ability.json`
  if (kind === 'item') return `items/${id}.item.json`
  return `loot/${id}.loot.json`
}

export function addManagedManifestPath(manifest: ForgeProjectManifest, kind: ManagedGameplayKind, id: string): ForgeProjectManifest {
  const path = managedContentPath(kind, id)
  const content = { ...manifest.content }
  if (kind === 'enemy') content.enemies = uniquePaths([...content.enemies, path])
  else if (kind === 'ability') content.abilities = uniquePaths([...content.abilities, path])
  else if (kind === 'item') content.items = uniquePaths([...content.items, path])
  else content.lootTables = uniquePaths([...content.lootTables, path])
  return { ...manifest, content }
}

export function removeManagedManifestPath(manifest: ForgeProjectManifest, kind: ManagedGameplayKind, id: string): ForgeProjectManifest {
  const path = managedContentPath(kind, id)
  const content = { ...manifest.content }
  if (kind === 'enemy') content.enemies = content.enemies.filter((entry) => entry !== path)
  else if (kind === 'ability') content.abilities = content.abilities.filter((entry) => entry !== path)
  else if (kind === 'item') content.items = content.items.filter((entry) => entry !== path)
  else content.lootTables = content.lootTables.filter((entry) => entry !== path)
  return { ...manifest, content }
}

export function findGameplayReferences(workspace: ForgeProjectWorkspace, kind: ManagedGameplayKind, id: string) {
  const references: string[] = []
  const loadouts = workspace.gameplay.player.archetypeLoadouts ?? {}

  if (kind === 'ability') {
    if (workspace.gameplay.player.basicAbility === id) references.push('Player · fallback basic ability')
    if (workspace.gameplay.player.activeAbilities.includes(id)) references.push('Player · fallback active abilities')
    for (const [role, loadout] of Object.entries(loadouts)) {
      if (!loadout) continue
      if (loadout.basicAbility === id) references.push(`Player · ${role} primary ability`)
      if (loadout.activeAbilities.includes(id)) references.push(`Player · ${role} active abilities`)
    }
  }

  if (kind === 'enemy') {
    for (const profile of workspace.encounterProfiles) if (profile.enemyId === id) references.push(`Encounter Forge · ${profile.name}`)
    for (const boss of workspace.bossProfiles) {
      if (boss.enemyId === id) references.push(`Boss Forge · ${boss.name} base enemy`)
      for (const phase of boss.phases) if (phase.summonEnemyId === id) references.push(`Boss Forge · ${boss.name} / ${phase.name} summon`)
    }
  }

  if (kind === 'item') {
    if (workspace.gameplay.player.startingItems.includes(id)) references.push('Player · fallback starting items')
    for (const [role, loadout] of Object.entries(loadouts)) {
      if (loadout?.startingItems.includes(id)) references.push(`Player · ${role} starting gear`)
    }
    for (const table of workspace.gameplay.lootTables) if (table.entries.some((entry) => entry.itemId === id)) references.push(`Loot · ${table.name}`)
    for (const boss of workspace.bossProfiles) if (boss.guaranteedItemId === id) references.push(`Boss Forge · ${boss.name} guaranteed reward`)
  }

  if (kind === 'loot') {
    for (const enemy of workspace.gameplay.enemies) if (enemy.lootTable === id) references.push(`Enemy · ${enemy.name}`)
    for (const profile of workspace.encounterProfiles) if (profile.rewardLootTableId === id) references.push(`Encounter Forge · ${profile.name} reward`)
    for (const boss of workspace.bossProfiles) if (boss.rewardLootTableId === id) references.push(`Boss Forge · ${boss.name} reward`)
  }

  return [...new Set(references)]
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths)]
}
