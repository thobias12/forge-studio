import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { HudPickupFlights } from './HudPickupFlights'
import SkillboundOrb from './SkillboundOrb'
import { loadSkillboundWorkspace, type ForgeGameplayContent, type ForgeProjectDungeonDefinition } from '../engine/forgeProject'
import { isItemEquipped, itemRuntimeDescription } from '../engine/equipment'
import type { ForgeBossDefinition, ForgeEncounterProfile } from '../engine/encounterForge'
import type { ForgeCharacterBlueprint } from '../engine/characterBlueprint'
import type { ForgeAdventurePlayerState } from '../engine/runtime/ForgeAdventureSession'
import { ForgeDungeonRuntime, type ForgeDungeonRuntimeSnapshot } from '../engine/runtime/ForgeDungeonRuntime'
import { hydrateRuntimeEquipment, type ForgeEquipmentSnapshotExtension } from '../engine/runtime/ForgeEquipmentRuntime'
import { installDungeonRewardMethods } from '../engine/runtime/ForgeDungeonRuntimeRewards'
import { installEncounterBossRuntime } from '../engine/runtime/ForgeEncounterBossRuntime'
import { installDungeonEnemyCombatRuntime } from '../engine/runtime/ForgeEnemyCombatRuntime'
import { installDungeonRunDirector } from '../engine/runtime/ForgeDungeonRunRuntime'
import { installDungeonRewardPickupRuntime, type ForgeRewardSnapshotExtension } from '../engine/runtime/ForgeRewardPickupRuntime'
import { installPlayerProfileRuntime } from '../engine/runtime/ForgePlayerProfileRuntime'
import type { ForgeSkillSnapshotExtension } from '../engine/runtime/ForgeSkillRuntime'
import { hudModuleStyle, hudModuleVisible, normalizeHudLayout, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import { skillboundUiCssVariables, type SkillboundUiTheme } from '../lib/uiForge'
import '../hud-runtime-rewards.css'

installDungeonRewardMethods(ForgeDungeonRuntime)
installEncounterBossRuntime(ForgeDungeonRuntime)
installDungeonEnemyCombatRuntime(ForgeDungeonRuntime)
installDungeonRunDirector(ForgeDungeonRuntime)
installDungeonRewardPickupRuntime(ForgeDungeonRuntime)
installPlayerProfileRuntime(ForgeDungeonRuntime)

type DungeonRuntimeState = ForgeDungeonRuntimeSnapshot & ForgeRewardSnapshotExtension & ForgeEquipmentSnapshotExtension & ForgeSkillSnapshotExtension & {
  runEncountersCleared?: number
  runEncountersTotal?: number
  runProgress?: number
  runState?: 'exploring' | 'encounter' | 'complete'
  waveCurrent?: number
  waveTotal?: number
  waveName?: string
  waveAlive?: number
  wavePending?: boolean
  plannedEnemies?: number
}

const EMPTY: DungeonRuntimeState = {
  health: 1,
  maxHealth: 1,
  mana: 100,
  maxMana: 100,
  manaRegen: 14,
  hotbarAbilityIds: ['', '', '', '', ''],
  hotbarCooldowns: [0, 0, 0, 0, 0],
  inventory: [],
  equipment: {},
  defense: 0,
  attackBonus: 0,
  enemiesAlive: 0,
  enemiesTotal: 0,
  primaryCooldown: 0,
  skillCooldown: 0,
  dodgeCooldown: 0,
  encounter: 'Loading Hollow Vault…',
  message: '',
  bossCleared: false,
  gold: 0,
  xp: 0,
  level: 1,
  xpToNext: 100,
  pickupEvents: [],
}

type Props = {
  dungeon: ForgeProjectDungeonDefinition
  gameplay: ForgeGameplayContent
  projectId: string
  initialState: ForgeAdventurePlayerState
  characterBlueprint?: ForgeCharacterBlueprint
  paused?: boolean
  onSnapshot?: (state: DungeonRuntimeState) => void
  uiTheme?: SkillboundUiTheme
  hudLayout?: SkillboundHudLayout
  itemIcons: Record<string, string>
  onExit: (state: ForgeAdventurePlayerState) => void
}

type AuthoredCombatProfiles = {
  encounters: ForgeEncounterProfile[]
  bosses: ForgeBossDefinition[]
}

export default function SkillboundDungeonPlayViewport({ dungeon, gameplay, projectId, initialState, characterBlueprint, paused = false, onSnapshot, uiTheme, hudLayout, itemIcons, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ForgeDungeonRuntime | null>(null)
  const [snapshot, setSnapshot] = useState<DungeonRuntimeState>({ ...EMPTY, ...initialState, maxHealth: gameplay.player.maxHealth })
  const [profiles, setProfiles] = useState<AuthoredCombatProfiles>()
  const primaryAbility = gameplay.abilities.find((ability) => ability.id === gameplay.player.basicAbility)
  const hotbarAbilities = useMemo(() => (snapshot.hotbarAbilityIds ?? []).map((id) => gameplay.abilities.find((ability) => ability.id === id)), [gameplay.abilities, snapshot.hotbarAbilityIds])
  const normalizedHudLayout = useMemo(() => normalizeHudLayout(hudLayout), [hudLayout])
  const uiStyle = useMemo(() => uiTheme ? skillboundUiCssVariables(uiTheme) as CSSProperties : undefined, [uiTheme])
  const uiClasses = uiTheme
    ? `panel-${uiTheme.panelStyle} ornament-${uiTheme.ornamentLevel} corner-${uiTheme.cornerStyle} slots-${uiTheme.slotStyle} buttons-${uiTheme.buttonStyle} density-${uiTheme.density}`
    : ''
  const moduleStyle = (id: SkillboundHudModuleId) => hudModuleStyle(normalizedHudLayout.modules[id], uiTheme?.uiScale ?? 1) as CSSProperties

  useEffect(() => {
    let cancelled = false
    void loadSkillboundWorkspace().then((workspace) => {
      if (!cancelled) setProfiles({ encounters: workspace.encounterProfiles, bosses: workspace.bossProfiles })
    }).catch(() => {
      if (!cancelled) setProfiles({ encounters: [], bosses: [] })
    })
    return () => { cancelled = true }
  }, [dungeon.id])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !profiles) return
    const handleState = (state: ForgeDungeonRuntimeSnapshot) => {
      const next = state as DungeonRuntimeState
      setSnapshot(next)
      onSnapshot?.(next)
    }
    const runtime = new ForgeDungeonRuntime(host, dungeon, gameplay, initialState, {
      projectId,
      onState: handleState,
      onExit,
      encounterProfiles: profiles.encounters,
      bossProfiles: profiles.bosses,
      characterBlueprint,
    } as any)
    const rewardRuntime = runtime as unknown as {
      __forgeGold?: number
      __forgeXp?: number
      __forgeLevel?: number
      __forgeRewardInit?: boolean
      __forgeRewardEvents?: ForgeRewardSnapshotExtension['pickupEvents']
      __forgeRewardPickups?: unknown[]
    }
    rewardRuntime.__forgeGold = initialState.gold ?? 0
    rewardRuntime.__forgeXp = initialState.xp ?? 0
    rewardRuntime.__forgeLevel = initialState.level ?? 1
    rewardRuntime.__forgeRewardInit = false
    rewardRuntime.__forgeRewardEvents = []
    rewardRuntime.__forgeRewardPickups = []
    runtimeRef.current = runtime
    hydrateRuntimeEquipment(runtime, initialState.equipment)
    ;(runtime as any).setManaState?.(initialState.mana, initialState.maxMana)
    ;(runtime as any).setPaused?.(paused)
    const initial = runtime.getSnapshot() as DungeonRuntimeState
    setSnapshot(initial)
    onSnapshot?.(initial)
    return () => {
      runtime.dispose()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [dungeon, gameplay, initialState, onExit, profiles, projectId, characterBlueprint])

  useEffect(() => {
    ;(runtimeRef.current as any)?.setPaused?.(paused)
  }, [paused])

  const targetModule: SkillboundHudModuleId = snapshot.target?.boss ? 'boss' : 'target'
  const xpPercent = Math.max(0, Math.min(100, snapshot.xp / Math.max(1, snapshot.xpToNext) * 100))

  return <div className={`skillbound-runtime-host skillbound-dungeon-runtime ${uiClasses}`} ref={hostRef} style={uiStyle}>
    {!profiles && <div className="skillbound-runtime-loading">Loading Encounter Forge + Boss Forge definitions…</div>}
    <div className="skillbound-runtime-hint">
      <strong>{dungeon.name.toUpperCase()} · {characterBlueprint?.name?.toUpperCase() ?? 'SKILLBOUND HERO'}</strong>
      <span>WASD move · LMB primary · 1–5 skills · Q slot 1 · Space dodge · wheel zoom · E interact · Esc menu</span>
    </div>

    <HudPickupFlights events={snapshot.pickupEvents} layout={normalizedHudLayout}/>
    {hudModuleVisible(normalizedHudLayout, 'objective') && <div className="skillbound-objective skillbound-run-objective" style={moduleStyle('objective')}>
      <span>{snapshot.bossCleared ? 'Vault Warden defeated · find the active return portal' : snapshot.encounter}</span>
      {(snapshot.runEncountersTotal ?? 0) > 0 && <i>
        <b style={{ width: `${Math.round((snapshot.runProgress ?? 0) * 100)}%` }}/>
      </i>}
      {(snapshot.waveTotal ?? 0) > 1 && !snapshot.bossCleared && <small>
        {snapshot.wavePending
          ? `Wave ${Math.min(snapshot.waveTotal ?? 0, (snapshot.waveCurrent ?? 0) + 1)} incoming`
          : `${snapshot.waveName ?? 'Wave'} · ${snapshot.waveCurrent}/${snapshot.waveTotal}`}
      </small>}
    </div>}
    {snapshot.target && hudModuleVisible(normalizedHudLayout, targetModule) && <TargetBar target={snapshot.target} style={moduleStyle(targetModule)}/>} 
    {snapshot.interaction && hudModuleVisible(normalizedHudLayout, 'interaction') && <div className={`skillbound-interaction-prompt ${snapshot.interaction.ready ? 'ready' : 'locked'}`} style={moduleStyle('interaction')}><kbd>E</kbd><strong>{snapshot.interaction.label.replace(/^E · /, '')}</strong></div>}
    {snapshot.message && hudModuleVisible(normalizedHudLayout, 'loot') && <div className="skillbound-runtime-message" style={moduleStyle('loot')}>{snapshot.message}</div>}

    {hudModuleVisible(normalizedHudLayout, 'health') && <SkillboundOrb kind="health" value={snapshot.health} max={snapshot.maxHealth} style={moduleStyle('health')}/>} 
    {hudModuleVisible(normalizedHudLayout, 'resource') && <SkillboundOrb kind="mana" value={snapshot.mana} max={snapshot.maxMana} style={moduleStyle('resource')}/>} 
    {hudModuleVisible(normalizedHudLayout, 'hotbar') && <div className="skillbound-skillbar skillbound-skillbar-expanded" style={moduleStyle('hotbar')}>
      <SkillSlot hotkey="LMB" name={primaryAbility?.name ?? 'Basic attack'} cooldown={snapshot.primaryCooldown}/>
      {hotbarAbilities.map((skill, index) => <SkillSlot key={index} hotkey={String(index + 1)} name={skill?.name ?? 'Empty'} cooldown={snapshot.hotbarCooldowns[index] ?? 0} manaCost={skill ? Number((skill as any).manaCost ?? 12) : undefined} onClick={skill ? () => (runtimeRef.current as any)?.useAbilitySlot?.(index) : undefined}/>)}
      <SkillSlot hotkey="SPACE" name="Dodge" cooldown={snapshot.dodgeCooldown}/>
    </div>}
    {hudModuleVisible(normalizedHudLayout, 'xp') && <div className="skillbound-runtime-xp" style={moduleStyle('xp')}>
      <span><strong>LV {snapshot.level}</strong><em>EXPERIENCE</em><small>{snapshot.xp} / {snapshot.xpToNext}</small></span>
      <i><b style={{ width: `${xpPercent}%` }}/></i>
    </div>}
    {hudModuleVisible(normalizedHudLayout, 'gold') && <div className="skillbound-runtime-gold" style={moduleStyle('gold')}>
      <i/><span><strong>{snapshot.gold.toLocaleString()}</strong><small>Gold</small></span>
    </div>}

    {hudModuleVisible(normalizedHudLayout, 'inventory') && <aside className="skillbound-inventory" style={moduleStyle('inventory')}>
      <header><span>INVENTORY</span><small>{snapshot.inventory.length} item{snapshot.inventory.length === 1 ? '' : 's'} · {snapshot.defense} DEF</small></header>
      <div className="skillbound-inventory-items">
        {snapshot.inventory.length === 0 && <p>Drops collected in Hollow Vault will carry back to Drowned March.</p>}
        {snapshot.inventory.map((itemId, index) => {
          const item = gameplay.items.find((candidate) => candidate.id === itemId)
          if (!item) return null
          const equipped = isItemEquipped(snapshot.equipment, item.id)
          const icon = itemIcons[item.id]
          return <button key={`${itemId}-${index}`} className={`${equipped ? 'equipped ' : ''}rarity-${item.rarity}`} onClick={() => runtimeRef.current?.equipItem(item.id)}>
            <span className="skillbound-item-icon">{icon ? <img src={icon} alt=""/> : <i style={{ background: item.color }}/>}</span>
            <span><strong>{item.name}</strong><small>{itemRuntimeDescription(item)}</small></span>
            <em>{equipped ? 'Equipped' : 'Equip'}</em>
          </button>
        })}
      </div>
      <footer>{snapshot.bossCleared ? 'Return portal active' : `${snapshot.enemiesAlive}/${snapshot.enemiesTotal} enemies alive`}</footer>
    </aside>}
  </div>
}

function TargetBar({ target, style }: { target: NonNullable<ForgeDungeonRuntimeSnapshot['target']> & { role?: string; elite?: boolean; poise?: number; maxPoise?: number }; style?: CSSProperties }) {
  const percent = Math.max(0, Math.min(100, target.health / Math.max(1, target.maxHealth) * 100))
  const poisePercent = target.maxPoise
    ? Math.max(0, Math.min(100, (target.poise ?? 0) / target.maxPoise * 100))
    : 0
  return <div className={`skillbound-target-bar ${target.boss ? 'boss' : ''}`} style={style}>
    <div>
      <strong>{target.name}</strong>
      <span>{target.elite && !target.boss ? 'ELITE · ' : ''}{target.role ? `${target.role.toUpperCase()} · ` : ''}{Math.ceil(target.health)} / {target.maxHealth}</span>
    </div>
    <i><b style={{ width: `${percent}%` }}/></i>
    {target.maxPoise !== undefined && <i className="skillbound-poise-bar"><b style={{ width: `${poisePercent}%` }}/></i>}
  </div>
}

function SkillSlot({ hotkey, name, cooldown, manaCost, onClick }: { hotkey: string; name: string; cooldown: number; manaCost?: number; onClick?: () => void }) {
  const cooling = cooldown > 0.04
  return <div className={`${cooling ? 'skillbound-skill-slot cooling' : 'skillbound-skill-slot'}${onClick ? ' clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
    <b>{hotkey}</b><span>{name}{manaCost !== undefined && <small>{manaCost} MP</small>}</span>{cooling && <em>{cooldown.toFixed(1)}</em>}
  </div>
}