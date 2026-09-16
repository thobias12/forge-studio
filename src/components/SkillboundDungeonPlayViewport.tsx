import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { loadSkillboundWorkspace, type ForgeGameplayContent, type ForgeProjectDungeonDefinition } from '../engine/forgeProject'
import type { ForgeBossDefinition, ForgeEncounterProfile } from '../engine/encounterForge'
import type { ForgeAdventurePlayerState } from '../engine/runtime/ForgeAdventureSession'
import { ForgeDungeonRuntime, type ForgeDungeonRuntimeSnapshot } from '../engine/runtime/ForgeDungeonRuntime'
import { installDungeonRewardMethods } from '../engine/runtime/ForgeDungeonRuntimeRewards'
import { installEncounterBossRuntime } from '../engine/runtime/ForgeEncounterBossRuntime'
import { xpRequired } from '../engine/runtime/ForgeRewardPickupRuntime'
import { hudModuleStyle, hudModuleVisible, normalizeHudLayout, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import { skillboundUiCssVariables, type SkillboundUiTheme } from '../lib/uiForge'
import '../hud-runtime-rewards.css'

installDungeonRewardMethods(ForgeDungeonRuntime)
installEncounterBossRuntime(ForgeDungeonRuntime)

const EMPTY: ForgeDungeonRuntimeSnapshot = {
  health: 1,
  maxHealth: 1,
  inventory: [],
  enemiesAlive: 0,
  enemiesTotal: 0,
  primaryCooldown: 0,
  skillCooldown: 0,
  dodgeCooldown: 0,
  encounter: 'Loading Hollow Vault…',
  message: '',
  bossCleared: false,
}

type Props = {
  dungeon: ForgeProjectDungeonDefinition
  gameplay: ForgeGameplayContent
  projectId: string
  initialState: ForgeAdventurePlayerState
  uiTheme?: SkillboundUiTheme
  hudLayout?: SkillboundHudLayout
  itemIcons: Record<string, string>
  onExit: (state: ForgeAdventurePlayerState) => void
}

type AuthoredCombatProfiles = {
  encounters: ForgeEncounterProfile[]
  bosses: ForgeBossDefinition[]
}

export default function SkillboundDungeonPlayViewport({ dungeon, gameplay, projectId, initialState, uiTheme, hudLayout, itemIcons, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ForgeDungeonRuntime | null>(null)
  const [snapshot, setSnapshot] = useState<ForgeDungeonRuntimeSnapshot>({ ...EMPTY, ...initialState, maxHealth: gameplay.player.maxHealth })
  const [profiles, setProfiles] = useState<AuthoredCombatProfiles>()
  const primaryAbility = gameplay.abilities.find((ability) => ability.id === gameplay.player.basicAbility)
  const skillAbility = gameplay.abilities.find((ability) => ability.id === gameplay.player.activeAbilities[0])
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
    const mergeRewards = (state: ForgeDungeonRuntimeSnapshot): ForgeDungeonRuntimeSnapshot => ({
      ...state,
      gold: state.gold ?? initialState.gold ?? 0,
      xp: state.xp ?? initialState.xp ?? 0,
      level: state.level ?? initialState.level ?? 1,
    })
    const runtime = new ForgeDungeonRuntime(host, dungeon, gameplay, initialState, {
      projectId,
      onState: (state: ForgeDungeonRuntimeSnapshot) => setSnapshot(mergeRewards(state)),
      onExit,
      encounterProfiles: profiles.encounters,
      bossProfiles: profiles.bosses,
    } as any)
    runtimeRef.current = runtime
    setSnapshot(mergeRewards(runtime.getSnapshot()))
    return () => {
      runtime.dispose()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [dungeon, gameplay, initialState, onExit, profiles, projectId])

  const healthPercent = Math.max(0, Math.min(100, snapshot.health / Math.max(1, snapshot.maxHealth) * 100))
  const targetModule: SkillboundHudModuleId = snapshot.target?.boss ? 'boss' : 'target'
  const level = snapshot.level ?? initialState.level ?? 1
  const xp = snapshot.xp ?? initialState.xp ?? 0
  const xpToNext = xpRequired(level)
  const xpPercent = Math.max(0, Math.min(100, xp / Math.max(1, xpToNext) * 100))
  const gold = snapshot.gold ?? initialState.gold ?? 0

  return <div className={`skillbound-runtime-host skillbound-dungeon-runtime ${uiClasses}`} ref={hostRef} style={uiStyle}>
    {!profiles && <div className="skillbound-runtime-loading">Loading Encounter Forge + Boss Forge definitions…</div>}
    <div className="skillbound-runtime-hint">
      <strong>HOLLOW VAULT · HUD FORGE 2.0</strong>
      <span>Encounter Forge + Boss Forge · Skillbound camera · WASD move · LMB attack · Q skill · Space dodge · wheel zoom · E interact</span>
    </div>

    {hudModuleVisible(normalizedHudLayout, 'objective') && <div className="skillbound-objective" style={moduleStyle('objective')}>{snapshot.bossCleared ? 'Vault Warden defeated · find the active return portal' : snapshot.encounter}</div>}
    {snapshot.target && hudModuleVisible(normalizedHudLayout, targetModule) && <TargetBar target={snapshot.target} style={moduleStyle(targetModule)}/>} 
    {snapshot.interaction && hudModuleVisible(normalizedHudLayout, 'interaction') && <div className={`skillbound-interaction-prompt ${snapshot.interaction.ready ? 'ready' : 'locked'}`} style={moduleStyle('interaction')}><kbd>E</kbd><strong>{snapshot.interaction.label.replace(/^E · /, '')}</strong></div>}
    {snapshot.message && hudModuleVisible(normalizedHudLayout, 'loot') && <div className="skillbound-runtime-message" style={moduleStyle('loot')}>{snapshot.message}</div>}

    {hudModuleVisible(normalizedHudLayout, 'health') && <div className="skillbound-health-orb" style={{ ...moduleStyle('health'), '--health': `${healthPercent}%` } as CSSProperties}>
      <strong>{Math.ceil(snapshot.health)}</strong><span>/{snapshot.maxHealth}</span>
    </div>}
    {hudModuleVisible(normalizedHudLayout, 'hotbar') && <div className="skillbound-skillbar" style={moduleStyle('hotbar')}>
      <SkillSlot hotkey="LMB" name={primaryAbility?.name ?? 'Basic attack'} cooldown={snapshot.primaryCooldown}/>
      <SkillSlot hotkey="Q" name={skillAbility?.name ?? 'Skill'} cooldown={snapshot.skillCooldown}/>
      <SkillSlot hotkey="SPACE" name="Dodge" cooldown={snapshot.dodgeCooldown}/>
    </div>}
    {hudModuleVisible(normalizedHudLayout, 'xp') && <div className="skillbound-runtime-xp" style={moduleStyle('xp')}>
      <span><strong>LV {level}</strong><em>EXPERIENCE</em><small>{xp} / {xpToNext}</small></span>
      <i><b style={{ width: `${xpPercent}%` }}/></i>
    </div>}
    {hudModuleVisible(normalizedHudLayout, 'gold') && <div className="skillbound-runtime-gold" style={moduleStyle('gold')}>
      <i/><span><strong>{gold.toLocaleString()}</strong><small>Gold</small></span>
    </div>}

    {hudModuleVisible(normalizedHudLayout, 'inventory') && <aside className="skillbound-inventory" style={moduleStyle('inventory')}>
      <header><span>INVENTORY</span><small>{snapshot.inventory.length} item{snapshot.inventory.length === 1 ? '' : 's'}</small></header>
      <div className="skillbound-inventory-items">
        {snapshot.inventory.length === 0 && <p>Drops collected in Hollow Vault will carry back to Drowned March.</p>}
        {snapshot.inventory.map((itemId, index) => {
          const item = gameplay.items.find((candidate) => candidate.id === itemId)
          if (!item) return null
          const equipped = snapshot.equippedWeaponId === item.id
          const icon = itemIcons[item.id]
          return <button key={`${itemId}-${index}`} className={`${equipped ? 'equipped ' : ''}rarity-${item.rarity}`} onClick={() => runtimeRef.current?.equipItem(item.id)}>
            <span className="skillbound-item-icon">{icon ? <img src={icon} alt=""/> : <i style={{ background: item.color }}/>}</span>
            <span><strong>{item.name}</strong><small>{item.rarity} weapon · +{item.damageBonus} damage</small></span>
            <em>{equipped ? 'Equipped' : 'Equip'}</em>
          </button>
        })}
      </div>
      <footer>{snapshot.bossCleared ? 'Return portal active' : `${snapshot.enemiesAlive}/${snapshot.enemiesTotal} enemies alive`}</footer>
    </aside>}
  </div>
}

function TargetBar({ target, style }: { target: NonNullable<ForgeDungeonRuntimeSnapshot['target']>; style?: CSSProperties }) {
  const percent = Math.max(0, Math.min(100, target.health / Math.max(1, target.maxHealth) * 100))
  return <div className={`skillbound-target-bar ${target.boss ? 'boss' : ''}`} style={style}>
    <div><strong>{target.name}</strong><span>{Math.ceil(target.health)} / {target.maxHealth}</span></div>
    <i><b style={{ width: `${percent}%` }}/></i>
  </div>
}

function SkillSlot({ hotkey, name, cooldown }: { hotkey: string; name: string; cooldown: number }) {
  const cooling = cooldown > 0.04
  return <div className={cooling ? 'skillbound-skill-slot cooling' : 'skillbound-skill-slot'}>
    <b>{hotkey}</b><span>{name}</span>{cooling && <em>{cooldown.toFixed(1)}</em>}
  </div>
}
