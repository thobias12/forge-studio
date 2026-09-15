import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ForgeGameplayContent, ForgeProjectDungeonDefinition } from '../engine/forgeProject'
import type { ForgeAdventurePlayerState } from '../engine/runtime/ForgeAdventureSession'
import { ForgeDungeonRuntime, type ForgeDungeonRuntimeSnapshot } from '../engine/runtime/ForgeDungeonRuntime'
import { skillboundUiCssVariables, type SkillboundUiTheme } from '../lib/uiForge'

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
  itemIcons: Record<string, string>
  onExit: (state: ForgeAdventurePlayerState) => void
}

export default function SkillboundDungeonPlayViewport({ dungeon, gameplay, projectId, initialState, uiTheme, itemIcons, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ForgeDungeonRuntime | null>(null)
  const [snapshot, setSnapshot] = useState<ForgeDungeonRuntimeSnapshot>({ ...EMPTY, ...initialState, maxHealth: gameplay.player.maxHealth })
  const primaryAbility = gameplay.abilities.find((ability) => ability.id === gameplay.player.basicAbility)
  const skillAbility = gameplay.abilities.find((ability) => ability.id === gameplay.player.activeAbilities[0])
  const uiStyle = useMemo(() => uiTheme ? skillboundUiCssVariables(uiTheme) as CSSProperties : undefined, [uiTheme])
  const uiClasses = uiTheme
    ? `panel-${uiTheme.panelStyle} ornament-${uiTheme.ornamentLevel} corner-${uiTheme.cornerStyle} slots-${uiTheme.slotStyle} buttons-${uiTheme.buttonStyle} density-${uiTheme.density}`
    : ''

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const runtime = new ForgeDungeonRuntime(host, dungeon, gameplay, initialState, { projectId, onState: setSnapshot, onExit })
    runtimeRef.current = runtime
    setSnapshot(runtime.getSnapshot())
    return () => {
      runtime.dispose()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [dungeon, gameplay, initialState, onExit, projectId])

  const healthPercent = Math.max(0, Math.min(100, snapshot.health / Math.max(1, snapshot.maxHealth) * 100))

  return <div className={`skillbound-runtime-host skillbound-dungeon-runtime ${uiClasses}`} ref={hostRef} style={uiStyle}>
    <div className="skillbound-runtime-hint">
      <strong>HOLLOW VAULT · SKILLBOUND RUNTIME</strong>
      <span>Same Skillbound camera · WASD move · LMB attack · Q skill · Space dodge · wheel zoom · E interact</span>
    </div>

    <div className="skillbound-objective">{snapshot.bossCleared ? 'Vault Warden defeated · find the active return portal' : snapshot.encounter}</div>
    {snapshot.target && <TargetBar target={snapshot.target}/>} 
    {snapshot.interaction && <div className={`skillbound-interaction-prompt ${snapshot.interaction.ready ? 'ready' : 'locked'}`}><kbd>E</kbd><strong>{snapshot.interaction.label.replace(/^E · /, '')}</strong></div>}
    {snapshot.message && <div className="skillbound-runtime-message">{snapshot.message}</div>}

    <div className="skillbound-hud">
      <div className="skillbound-health-orb" style={{ '--health': `${healthPercent}%` } as CSSProperties}>
        <strong>{Math.ceil(snapshot.health)}</strong><span>/{snapshot.maxHealth}</span>
      </div>
      <div className="skillbound-skillbar">
        <SkillSlot hotkey="LMB" name={primaryAbility?.name ?? 'Basic attack'} cooldown={snapshot.primaryCooldown}/>
        <SkillSlot hotkey="Q" name={skillAbility?.name ?? 'Skill'} cooldown={snapshot.skillCooldown}/>
        <SkillSlot hotkey="SPACE" name="Dodge" cooldown={snapshot.dodgeCooldown}/>
      </div>
    </div>

    <aside className="skillbound-inventory">
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
    </aside>
  </div>
}

function TargetBar({ target }: { target: NonNullable<ForgeDungeonRuntimeSnapshot['target']> }) {
  const percent = Math.max(0, Math.min(100, target.health / Math.max(1, target.maxHealth) * 100))
  return <div className={`skillbound-target-bar ${target.boss ? 'boss' : ''}`}>
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
