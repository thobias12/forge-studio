import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { loadSkillboundWorkspace, type ForgeGameplayContent } from '../engine/forgeProject'
import { itemVisual } from '../engine/itemPresentation'
import type { GeneratedRegion } from '../engine/guidedWorld'
import { ForgePlayRuntime, type ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import { getAsset } from '../lib/library'
import { skillboundUiCssVariables, type SkillboundUiTheme } from '../lib/uiForge'
import '../skillbound-runtime.css'

type Props = { region: GeneratedRegion }

const EMPTY_STATE: ForgeRuntimeSnapshot = {
  health: 1,
  maxHealth: 1,
  enemiesAlive: 0,
  enemiesTotal: 0,
  primaryCooldown: 0,
  skillCooldown: 0,
  dodgeCooldown: 0,
  inventory: [],
  message: '',
}

export default function SkillboundPlayViewport({ region }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ForgePlayRuntime | null>(null)
  const [snapshot, setSnapshot] = useState<ForgeRuntimeSnapshot>(EMPTY_STATE)
  const [session, setSession] = useState(0)
  const [gameplay, setGameplay] = useState<ForgeGameplayContent>()
  const [projectId, setProjectId] = useState('')
  const [uiTheme, setUiTheme] = useState<SkillboundUiTheme>()
  const [itemIcons, setItemIcons] = useState<Record<string, string>>({})

  const primaryAbility = useMemo(() => gameplay?.abilities.find((ability) => ability.id === gameplay.player.basicAbility), [gameplay])
  const skillAbility = useMemo(() => gameplay?.abilities.find((ability) => ability.id === gameplay.player.activeAbilities[0]), [gameplay])
  const uiStyle = useMemo(() => uiTheme ? skillboundUiCssVariables(uiTheme) as CSSProperties : undefined, [uiTheme])
  const uiClasses = uiTheme
    ? `panel-${uiTheme.panelStyle} ornament-${uiTheme.ornamentLevel} corner-${uiTheme.cornerStyle} slots-${uiTheme.slotStyle} buttons-${uiTheme.buttonStyle} density-${uiTheme.density}`
    : ''

  useEffect(() => {
    void loadSkillboundWorkspace().then((workspace) => {
      setGameplay(workspace.gameplay)
      setProjectId(workspace.manifest.id)
      setUiTheme(workspace.ui.theme)
    })
  }, [])

  useEffect(() => {
    if (!gameplay) return
    let cancelled = false
    const urls: string[] = []
    const load = async () => {
      const entries = await Promise.all(gameplay.items.map(async (item) => {
        const iconId = itemVisual(item).inventory.iconAssetId
        if (!iconId) return undefined
        const asset = await getAsset(iconId).catch(() => undefined)
        if (!asset) return undefined
        const url = URL.createObjectURL(asset.blob)
        urls.push(url)
        return [item.id, url] as const
      }))
      if (!cancelled) setItemIcons(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>))
    }
    void load()
    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [gameplay])

  useEffect(() => {
    if (!hostRef.current || !gameplay || !projectId) return
    const runtime = new ForgePlayRuntime(hostRef.current, region, gameplay, { projectId, onState: setSnapshot })
    runtimeRef.current = runtime
    setSnapshot(runtime.getSnapshot())
    return () => {
      runtime.dispose()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [region, gameplay, projectId, session])

  const reset = () => {
    runtimeRef.current?.resetProgress()
    setSession((value) => value + 1)
  }

  const healthPercent = Math.max(0, Math.min(100, snapshot.health / Math.max(1, snapshot.maxHealth) * 100))
  const objective = snapshot.enemiesTotal === 0
    ? 'No encounter in this generated region.'
    : snapshot.enemiesAlive > 0
      ? `Clear the encounter · ${snapshot.enemiesAlive}/${snapshot.enemiesTotal} enemies remaining`
      : 'Encounter cleared · collect and equip the drop'

  return <div className={`skillbound-runtime-host ${uiClasses}`} ref={hostRef} style={uiStyle}>
    {!gameplay && <div className="skillbound-runtime-loading">Loading Skillbound gameplay data…</div>}
    <div className="skillbound-runtime-hint">
      <strong>FORGE PLAY MODE · AUTHORED PRESENTATION</strong>
      <span>WASD move · LMB attack · Q skill · Space dodge · red ring = enemy wind-up</span>
    </div>

    <div className="skillbound-objective">{objective}</div>
    {snapshot.target && <TargetBar target={snapshot.target}/>} 

    <div className="skillbound-runtime-actions">
      <button onClick={() => runtimeRef.current?.saveGame(true)}>Save game</button>
      <button onClick={reset}>Reset run</button>
    </div>

    {snapshot.message && <div className="skillbound-runtime-message">{snapshot.message}</div>}

    <div className="skillbound-hud">
      <div className="skillbound-health-orb" style={{ '--health': `${healthPercent}%` } as CSSProperties}>
        <strong>{Math.ceil(snapshot.health)}</strong>
        <span>/{snapshot.maxHealth}</span>
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
        {snapshot.inventory.length === 0 && <p>Defeat the encounter and walk over the loot.</p>}
        {snapshot.inventory.map((itemId, index) => {
          const item = gameplay?.items.find((candidate) => candidate.id === itemId)
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
      <footer>{snapshot.savedAt ? `Autosaved ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Autosave every 5 seconds'}</footer>
    </aside>
  </div>
}

function TargetBar({ target }: { target: NonNullable<ForgeRuntimeSnapshot['target']> }) {
  const percent = Math.max(0, Math.min(100, target.health / Math.max(1, target.maxHealth) * 100))
  return <div className="skillbound-target-bar">
    <div><strong>{target.name}</strong><span>{Math.ceil(target.health)} / {target.maxHealth}</span></div>
    <i><b style={{ width: `${percent}%` }}/></i>
  </div>
}

function SkillSlot({ hotkey, name, cooldown }: { hotkey: string; name: string; cooldown: number }) {
  const cooling = cooldown > 0.04
  return <div className={cooling ? 'skillbound-skill-slot cooling' : 'skillbound-skill-slot'}>
    <b>{hotkey}</b>
    <span>{name}</span>
    {cooling && <em>{cooldown.toFixed(1)}</em>}
  </div>
}
