import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import SkillboundDungeonPlayViewport from './SkillboundDungeonPlayViewport'
import { loadSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'
import { itemVisual } from '../engine/itemPresentation'
import type { GeneratedRegion } from '../engine/guidedWorld'
import { mergeAdventurePlayerState, type ForgeAdventurePlayerState } from '../engine/runtime/ForgeAdventureSession'
import { runtimeSaveKey } from '../engine/runtime/ForgeGameSave'
import { ForgePlayRuntime, type ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import { getAsset } from '../lib/library'
import { skillboundUiCssVariables } from '../lib/uiForge'
import '../skillbound-runtime.css'
import '../skillbound-adventure.css'

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
  const nearDungeonRef = useRef(false)
  const [snapshot, setSnapshot] = useState<ForgeRuntimeSnapshot>(EMPTY_STATE)
  const [session, setSession] = useState(0)
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [activeDungeonId, setActiveDungeonId] = useState<string>()
  const [dungeonPlayerState, setDungeonPlayerState] = useState<ForgeAdventurePlayerState>()
  const [nearDungeon, setNearDungeon] = useState(false)
  const [itemIcons, setItemIcons] = useState<Record<string, string>>({})

  const gameplay = workspace?.gameplay
  const projectId = workspace?.manifest.id ?? ''
  const uiTheme = workspace?.ui.theme
  const primaryAbility = useMemo(() => gameplay?.abilities.find((ability) => ability.id === gameplay.player.basicAbility), [gameplay])
  const skillAbility = useMemo(() => gameplay?.abilities.find((ability) => ability.id === gameplay.player.activeAbilities[0]), [gameplay])
  const uiStyle = useMemo(() => uiTheme ? skillboundUiCssVariables(uiTheme) as CSSProperties : undefined, [uiTheme])
  const uiClasses = uiTheme
    ? `panel-${uiTheme.panelStyle} ornament-${uiTheme.ornamentLevel} corner-${uiTheme.cornerStyle} slots-${uiTheme.slotStyle} buttons-${uiTheme.buttonStyle} density-${uiTheme.density}`
    : ''
  const dungeonAnchor = useMemo(() => region.nodes.find((node) => node.contentType === 'dungeon' && node.contentRef), [region])
  const activeDungeon = activeDungeonId ? workspace?.dungeons.find((dungeon) => dungeon.id === activeDungeonId) : undefined

  useEffect(() => {
    void loadSkillboundWorkspace().then(setWorkspace)
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
    if (activeDungeonId || !hostRef.current || !gameplay || !projectId) return
    const runtime = new ForgePlayRuntime(hostRef.current, region, gameplay, { projectId, onState: setSnapshot })
    runtimeRef.current = runtime
    setSnapshot(runtime.getSnapshot())
    return () => {
      runtime.dispose()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [region, gameplay, projectId, session, activeDungeonId])

  useEffect(() => {
    if (!dungeonAnchor || activeDungeonId) {
      nearDungeonRef.current = false
      setNearDungeon(false)
      return
    }
    let frame = 0
    const tick = () => {
      const runtime = runtimeRef.current as unknown as { player?: { position?: { x: number; z: number } } } | null
      const position = runtime?.player?.position
      const next = Boolean(position && Math.hypot(position.x - dungeonAnchor.x, position.z - dungeonAnchor.z) <= 3.35)
      if (next !== nearDungeonRef.current) {
        nearDungeonRef.current = next
        setNearDungeon(next)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [activeDungeonId, dungeonAnchor])

  const reset = () => {
    runtimeRef.current?.resetProgress()
    setSession((value) => value + 1)
  }

  const enterDungeon = useCallback(() => {
    const dungeonId = dungeonAnchor?.contentRef
    if (!dungeonId || !nearDungeonRef.current) return
    runtimeRef.current?.saveGame(false)
    setDungeonPlayerState({
      health: snapshot.health,
      inventory: [...snapshot.inventory],
      equippedWeaponId: snapshot.equippedWeaponId,
    })
    setActiveDungeonId(dungeonId)
    nearDungeonRef.current = false
    setNearDungeon(false)
  }, [dungeonAnchor, snapshot])

  useEffect(() => {
    if (activeDungeonId || !dungeonAnchor) return
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== 'e' || isTextInput(event.target) || !nearDungeonRef.current) return
      enterDungeon()
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeDungeonId, dungeonAnchor, enterDungeon])

  const returnToOverworld = useCallback((state: ForgeAdventurePlayerState) => {
    if (!projectId) return
    const key = runtimeSaveKey(projectId, region.regionId, region.seed, region.generationVersion)
    mergeAdventurePlayerState(key, state)
    setDungeonPlayerState(undefined)
    setActiveDungeonId(undefined)
    setSession((value) => value + 1)
  }, [projectId, region.generationVersion, region.regionId, region.seed])

  if (activeDungeonId) {
    if (!workspace || !gameplay || !dungeonPlayerState) return <div className="skillbound-runtime-loading">Loading Skillbound dungeon session…</div>
    if (!activeDungeon) return <div className="skillbound-dungeon-session missing"><strong>Dungeon unavailable</strong><span>{activeDungeonId} is referenced by this region but is missing from the Skillbound project.</span><button onClick={() => returnToOverworld(dungeonPlayerState)}>Return to {region.regionName}</button></div>
    return <SkillboundDungeonPlayViewport
      dungeon={activeDungeon}
      gameplay={gameplay}
      projectId={projectId}
      initialState={dungeonPlayerState}
      uiTheme={uiTheme}
      itemIcons={itemIcons}
      onExit={returnToOverworld}
    />
  }

  const healthPercent = Math.max(0, Math.min(100, snapshot.health / Math.max(1, snapshot.maxHealth) * 100))
  const objective = snapshot.enemiesTotal === 0
    ? 'No encounter in this generated region.'
    : snapshot.enemiesAlive > 0
      ? `Clear the encounter · ${snapshot.enemiesAlive}/${snapshot.enemiesTotal} enemies remaining`
      : dungeonAnchor
        ? `Encounter cleared · travel to ${dungeonAnchor.label}`
        : 'Encounter cleared · collect and equip the drop'

  return <div className={`skillbound-runtime-host ${uiClasses}`} ref={hostRef} style={uiStyle}>
    {!gameplay && <div className="skillbound-runtime-loading">Loading Skillbound gameplay data…</div>}
    <div className="skillbound-runtime-hint">
      <strong>FORGE PLAY MODE · PHASE 3.1 SEAMLESS ADVENTURE</strong>
      <span>WASD move · LMB attack · Q skill · Space dodge · wheel zoom · E interact</span>
    </div>

    <div className="skillbound-objective">{objective}</div>
    {snapshot.target && <TargetBar target={snapshot.target}/>} 
    {nearDungeon && dungeonAnchor && <div className="skillbound-interaction-prompt ready"><kbd>E</kbd><strong>Enter {dungeonAnchor.label}</strong></div>}

    <div className="skillbound-runtime-actions">
      <button onClick={() => runtimeRef.current?.saveGame(true)}>Save game</button>
      <button onClick={reset}>Reset run</button>
    </div>

    {dungeonAnchor && <div className={`skillbound-dungeon-available ${nearDungeon ? 'near' : ''}`}><span>DUNGEON ENTRANCE</span><strong>{dungeonAnchor.label}</strong><small>{nearDungeon ? 'Press E to enter' : 'Travel to the generated entrance · authored in Map Studio'}</small></div>}
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

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.isContentEditable)
}
