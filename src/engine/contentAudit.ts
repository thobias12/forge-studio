import type { ForgeProjectWorkspace } from './forgeProject'
import { itemVisual } from './itemPresentation'
import type { LibraryAsset } from '../lib/library'

export type ForgeContentAuditStatus = 'ready' | 'warning' | 'missing'
export type ForgeContentAuditKind = 'player' | 'enemy' | 'skill' | 'item' | 'boss'

export type ForgeContentAuditCheck = {
  id: string
  label: string
  status: ForgeContentAuditStatus
  detail: string
}

export type ForgeContentAuditEntry = {
  id: string
  name: string
  kind: ForgeContentAuditKind
  tool: string
  checks: ForgeContentAuditCheck[]
}

export type ForgeContentAuditSummary = {
  total: number
  ready: number
  warnings: number
  missing: number
  completeEntries: number
}

type ExtendedAbility = ForgeProjectWorkspace['gameplay']['abilities'][number] & {
  sfxAssetId?: string
  iconAssetId?: string
}

export function buildSkillboundContentAudit(workspace: ForgeProjectWorkspace, assets: LibraryAsset[], sourceAssetIds = new Set<string>()): ForgeContentAuditEntry[] {
  const byAssetId = new Map(assets.map((asset) => [asset.id, asset]))
  const entries: ForgeContentAuditEntry[] = []
  const assetCheck = (id: string, label: string, assetId?: string, optional = false): ForgeContentAuditCheck => {
    if (!assetId) return {
      id,
      label,
      status: 'warning',
      detail: optional ? 'Optional presentation is not authored yet.' : 'No Library asset is bound yet; runtime uses a fallback.',
    }
    const asset = byAssetId.get(assetId)
    if (!asset) return { id, label, status: 'missing', detail: `Bound asset ${assetId} is not available in this Forge Library.` }
    if (!sourceAssetIds.has(assetId)) return { id, label, status: 'warning', detail: `${asset.name} is bound locally but has not been synced into the Skillbound project source.` }
    return { id, label, status: 'ready', detail: `${asset.name} is bound and source-backed.` }
  }

  const player = workspace.gameplay.player
  entries.push({
    id: `player.${player.id}`,
    name: player.name,
    kind: 'player',
    tool: 'Gameplay Forge',
    checks: [
      ready('gameplay', 'Gameplay definition', `${player.maxHealth} HP · ${player.moveSpeed} move speed · ${player.dodgeDistance} dodge.`),
      assetCheck('character', 'Character model', player.characterAssetId),
      assetCheck('animations', 'Animation set', player.animationAssetId),
    ],
  })

  for (const enemy of workspace.gameplay.enemies) {
    entries.push({
      id: `enemy.${enemy.id}`,
      name: enemy.name,
      kind: 'enemy',
      tool: 'Gameplay Forge',
      checks: [
        ready('gameplay', 'Gameplay definition', `${enemy.maxHealth} HP · ${enemy.attackDamage} damage · ${enemy.lootTable} loot.`),
        assetCheck('character', 'Character model', enemy.characterAssetId),
        assetCheck('animations', 'Animation set', enemy.animationAssetId),
        assetCheck('attack-vfx', 'Attack VFX', enemy.attackVfxAssetId),
        assetCheck('hit-vfx', 'Hit VFX', enemy.hitVfxAssetId),
        assetCheck('death-vfx', 'Death VFX', enemy.deathVfxAssetId),
      ],
    })
  }

  for (const raw of workspace.gameplay.abilities) {
    const ability = raw as ExtendedAbility
    entries.push({
      id: `ability.${ability.id}`,
      name: ability.name,
      kind: 'skill',
      tool: 'Skill Forge',
      checks: [
        ready('gameplay', 'Gameplay definition', `${ability.damage} damage · ${ability.cooldown}s cooldown · ${ability.kind}.`),
        assetCheck('animation', 'Skill animation', ability.animationAssetId),
        assetCheck('vfx', 'Skill VFX', ability.vfxAssetId),
        assetCheck('sfx', 'Skill SFX', ability.sfxAssetId),
        assetCheck('icon', 'Hotbar icon', ability.iconAssetId),
      ],
    })
  }

  for (const item of workspace.gameplay.items) {
    const visual = itemVisual(item)
    const master = visual.masterAssetId ?? item.modelAssetId
    const dropModel = visual.drop.useMaster ? master : visual.drop.modelAssetId
    const equippedModel = visual.equipped.useMaster ? master : visual.equipped.modelAssetId
    entries.push({
      id: `item.${item.id}`,
      name: item.name,
      kind: 'item',
      tool: 'Item Forge',
      checks: [
        ready('gameplay', 'Gameplay definition', `${item.rarity} ${item.slot} · +${item.damageBonus} attack.`),
        assetCheck('master', 'Master model', master),
        assetCheck('icon', 'Inventory icon', visual.inventory.iconAssetId),
        assetCheck('drop', 'World-drop model', dropModel),
        assetCheck('equipped', 'Equipped model', equippedModel),
      ],
    })
  }

  const enemyById = new Map(workspace.gameplay.enemies.map((enemy) => [enemy.id, enemy]))
  for (const boss of workspace.bossProfiles) {
    const baseEnemy = enemyById.get(boss.enemyId)
    const dedicated = Boolean(baseEnemy && (baseEnemy.id === boss.id || baseEnemy.name.toLowerCase() === boss.name.toLowerCase()))
    entries.push({
      id: `boss.${boss.id}`,
      name: boss.name,
      kind: 'boss',
      tool: 'Boss Forge',
      checks: [
        baseEnemy ? ready('base-enemy', 'Base enemy definition', `${boss.name} resolves to ${baseEnemy.name}.`) : missing('base-enemy', 'Base enemy definition', `Missing enemy definition ${boss.enemyId}.`),
        dedicated ? ready('dedicated', 'Dedicated boss presentation', `${baseEnemy?.name ?? boss.name} owns the boss presentation.`) : warning('dedicated', 'Dedicated boss presentation', `${boss.name} currently reuses ${baseEnemy?.name ?? boss.enemyId}; create/bind a dedicated enemy presentation when ready.`),
        ...boss.phases.map((phase) => assetCheck(`phase-${phase.id}`, `${phase.name} VFX`, phase.vfxAssetId, true)),
      ],
    })
  }

  return entries
}

export function summarizeSkillboundContentAudit(entries: ForgeContentAuditEntry[]): ForgeContentAuditSummary {
  const checks = entries.flatMap((entry) => entry.checks)
  return {
    total: checks.length,
    ready: checks.filter((check) => check.status === 'ready').length,
    warnings: checks.filter((check) => check.status === 'warning').length,
    missing: checks.filter((check) => check.status === 'missing').length,
    completeEntries: entries.filter((entry) => entry.checks.every((check) => check.status === 'ready')).length,
  }
}

export function auditEntryStatus(entry: ForgeContentAuditEntry): ForgeContentAuditStatus {
  if (entry.checks.some((check) => check.status === 'missing')) return 'missing'
  if (entry.checks.some((check) => check.status === 'warning')) return 'warning'
  return 'ready'
}

function ready(id: string, label: string, detail: string): ForgeContentAuditCheck { return { id, label, status: 'ready', detail } }
function warning(id: string, label: string, detail: string): ForgeContentAuditCheck { return { id, label, status: 'warning', detail } }
function missing(id: string, label: string, detail: string): ForgeContentAuditCheck { return { id, label, status: 'missing', detail } }
