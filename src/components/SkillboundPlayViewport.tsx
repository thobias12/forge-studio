import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import SkillboundDungeonPlayViewport from './SkillboundDungeonPlayViewport'
import SkillboundOrb from './SkillboundOrb'
import { HudPickupFlights } from './HudPickupFlights'
import { loadSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'
import { isItemEquipped, itemRuntimeDescription } from '../engine/equipment'
import { itemVisual } from '../engine/itemPresentation'
import { resolveGameplayForRole } from '../engine/playerLoadout'
import type { GeneratedRegion } from '../engine/guidedWorld'
import {
  DEFAULT_WORLD_ENVIRONMENT,
  formatWorldHour,
  type WorldWeather,
} from '../engine/worldEnvironment'
import { mergeAdventurePlayerState, type ForgeAdventurePlayerState } from '../engine/runtime/ForgeAdventureSession'
import { runtimeSaveKey } from '../engine/runtime/ForgeGameSave'
import { type ForgeEquipmentSnapshotExtension } from '../engine/runtime/ForgeEquipmentRuntime'
import '../engine/runtime/ForgeInventoryRuntime'
import { ForgePlayRuntime, type ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import { installForgeRewardPickupRuntime, type ForgeRewardSnapshotExtension } from '../engine/runtime/ForgeRewardPickupRuntime'
import { installPlayerProfileRuntime } from '../engine/runtime/ForgePlayerProfileRuntime'
import type { ForgeSkillSnapshotExtension } from '../engine/runtime/ForgeSkillRuntime'
import type { SkillboundPlayerProfile } from '../engine/playerProfiles'
import { getAsset } from '../lib/library'
import { hudModuleStyle, hudModuleVisible, normalizeHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import { skillboundUiCssVariables } from '../lib/uiForge'
import '../skillbound-runtime.css'
import '../skillbound-adventure.css'
import '../hud-runtime-rewards.css'

installForgeRewardPickupRuntime(ForgePlayRuntime)
installPlayerProfileRuntime(ForgePlayRuntime)

type Props = {
  region: GeneratedRegion
  profile?: SkillboundPlayerProfile
  paused?: boolean
  onSnapshot?: (state: ForgeRuntimeSnapshot & ForgeRewardSnapshotExtension & ForgeEquipmentSnapshotExtension & ForgeSkillSnapshotExtension) => void
}
type SkillboundRuntimeState = ForgeRuntimeSnapshot & ForgeRewardSnapshotExtension & ForgeEquipmentSnapshotExtension & ForgeSkillSnapshotExtension

const EMPTY_STATE: SkillboundRuntimeState = {
  health: 1,
  maxHealth: 1,
  mana: 100,
  maxMana: 100,
  manaRegen: 14,
  hotbarAbilityIds: ['', '', '', '', ''],
  hotbarCooldowns: [0, 0, 0, 0, 0],
  enemiesAlive: 0,
  enemiesTotal: 0,
  primaryCooldown: 0,
  skillCooldown: 0,
  dodgeCooldown: 0,
  inventory: [],
  equipment: {},
  defense: 0,
  attackBonus: 0,
  message: '',
  gold: 0,
  xp: 0,
  level: 1,
  xpToNext: 100,
  pickupEvents: [],
}

export default function SkillboundPlayViewport({ region, profile, paused = false, onSnapshot }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ForgePlayRuntime | null>(null)
  const nearDungeonRef = useRef(false)
  const [snapshot, setSnapshot] = useState<SkillboundRuntimeState>(EMPTY_STATE)
  const [session, setSession] = useState(0)
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [activeDungeonId, setActiveDungeonId] = useState<string>()
  const [dungeonPlayerState, setDungeonPlayerState] = useState<ForgeAdventurePlayerState>()
  const [nearDungeon, setNearDungeon] = useState(false)
  const [itemIcons, setItemIcons] = useState<Record<string, string>>({})
  const [showEnvironment, setShowEnvironment] = useState(false)
  const [environmentHour, setEnvironmentHour] = useState(
    DEFAULT_WORLD_ENVIRONMENT.hour,
  )
  const [environmentWeather, setEnvironmentWeather] = useState<WorldWeather>(
    DEFAULT_WORLD_ENVIRONMENT.weather,
  )
  const [environmentPaused, setEnvironmentPaused] = useState(
    DEFAULT_WORLD_ENVIRONMENT.paused,
  )
  const [environmentSpeed, setEnvironmentSpeed] = useState(
    DEFAULT_WORLD_ENVIRONMENT.speed,
  )

  const baseGameplay = workspace?.gameplay
  const gameplay = useMemo(() => baseGameplay ? resolveGameplayForRole(baseGameplay, profile?.blueprint.role) : undefined, [baseGameplay, profile?.blueprint.role])
  const projectId = workspace?.manifest.id ?? ''
  const runtimeProjectId = profile ? `${projectId}:character:${profile.id}` : projectId
  const uiTheme = workspace?.ui.theme
  const hudLayout = useMemo(() => normalizeHudLayout(workspace?.ui.hud), [workspace?.ui.hud])
  const primaryAbility = useMemo(() => gameplay?.abilities.find((ability) => ability.id === gameplay.player.basicAbility), [gameplay])
  const hotbarAbilities = useMemo(() => (snapshot.hotbarAbilityIds ?? []).map((id) => gameplay?.abilities.find((ability) => ability.id === id)), [gameplay, snapshot.hotbarAbilityIds])
  const uiStyle = useMemo(() => uiTheme ? skillboundUiCssVariables(uiTheme) as CSSProperties : undefined, [uiTheme])
  const uiClasses = uiTheme
    ? `panel-${uiTheme.panelStyle} ornament-${uiTheme.ornamentLevel} corner-${uiTheme.cornerStyle} slots-${uiTheme.slotStyle} buttons-${uiTheme.buttonStyle} density-${uiTheme.density}`
    : ''
  const moduleStyle = (id: SkillboundHudModuleId) => hudModuleStyle(hudLayout.modules[id], uiTheme?.uiScale ?? 1) as CSSProperties
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
    if (activeDungeonId || !hostRef.current || !gameplay || !runtimeProjectId) return
    const handleState = (state: ForgeRuntimeSnapshot) => {
      const next = state as SkillboundRuntimeState
      setSnapshot(next)
      onSnapshot?.(next)
    }
    const runtime = new ForgePlayRuntime(hostRef.current, region, gameplay, {
      projectId: runtimeProjectId,
      onState: handleState,
      characterBlueprint: profile?.blueprint,
    } as any)
    runtimeRef.current = runtime
    ;(runtime as any).setPaused?.(paused)
    runtime.setEnvironmentHour(environmentHour)
    runtime.setEnvironmentWeather(environmentWeather)
    runtime.setEnvironmentPaused(environmentPaused)
    runtime.setEnvironmentSpeed(environmentSpeed)
    const initial = runtime.getSnapshot() as SkillboundRuntimeState
    setSnapshot(initial)
    onSnapshot?.(initial)
    return () => {
      runtime.dispose()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [
    region,
    gameplay,
    runtimeProjectId,
    session,
    activeDungeonId,
    profile?.id,
    profile?.blueprint.role,
    profile?.blueprint.foundation?.bodyAssetId,
    profile?.blueprint.foundation?.baseClothingVisible,
  ])

  useEffect(() => {
    ;(runtimeRef.current as any)?.setPaused?.(paused)
  }, [paused])

  useEffect(() => {
    runtimeRef.current?.setEnvironmentWeather(environmentWeather)
  }, [environmentWeather])

  useEffect(() => {
    runtimeRef.current?.setEnvironmentPaused(environmentPaused)
  }, [environmentPaused])

  useEffect(() => {
    runtimeRef.current?.setEnvironmentSpeed(environmentSpeed)
  }, [environmentSpeed])

  useEffect(() => {
    if (activeDungeonId) return
    const timer = window.setInterval(() => {
      const environment = runtimeRef.current?.getEnvironmentState()
      if (environment) setEnvironmentHour(environment.hour)
    }, 500)
    return () => window.clearInterval(timer)
  }, [activeDungeonId])

  useEffect(() => {
    if (!dungeonAnchor || activeDungeonId || paused) {
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
  }, [activeDungeonId, dungeonAnchor, paused])

  const reset = () => {
    runtimeRef.current?.resetProgress()
    setSession((value) => value + 1)
  }

  const setRuntimeHour = (hour: number) => {
    setEnvironmentHour(hour)
    runtimeRef.current?.setEnvironmentHour(hour)
  }

  const enterDungeon = useCallback(() => {
    const dungeonId = dungeonAnchor?.contentRef
    if (paused || !dungeonId || !nearDungeonRef.current) return
    runtimeRef.current?.saveGame(false)
    setDungeonPlayerState({
      health: snapshot.health,
      mana: snapshot.mana,
      maxMana: snapshot.maxMana,
      inventory: [...snapshot.inventory],
      equippedWeaponId: snapshot.equipment.MainHand ?? snapshot.equippedWeaponId,
      equipment: { ...snapshot.equipment },
      gold: snapshot.gold,
      xp: snapshot.xp,
      level: snapshot.level,
    })
    setActiveDungeonId(dungeonId)
    nearDungeonRef.current = false
    setNearDungeon(false)
  }, [dungeonAnchor, paused, snapshot])

  useEffect(() => {
    if (activeDungeonId || !dungeonAnchor || paused) return
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== 'e' || isTextInput(event.target) || !nearDungeonRef.current) return
      enterDungeon()
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeDungeonId, dungeonAnchor, enterDungeon, paused])

  const returnToOverworld = useCallback((state: ForgeAdventurePlayerState) => {
    if (!runtimeProjectId) return
    const key = runtimeSaveKey(runtimeProjectId, region.regionId, region.seed, region.generationVersion)
    mergeAdventurePlayerState(key, {
      ...state,
      gold: state.gold ?? dungeonPlayerState?.gold ?? 0,
      xp: state.xp ?? dungeonPlayerState?.xp ?? 0,
      level: state.level ?? dungeonPlayerState?.level ?? 1,
      mana: state.mana ?? dungeonPlayerState?.mana,
      maxMana: state.maxMana ?? dungeonPlayerState?.maxMana,
    })
    setDungeonPlayerState(undefined)
    setActiveDungeonId(undefined)
    setSession((value) => value + 1)
  }, [dungeonPlayerState, runtimeProjectId, region.generationVersion, region.regionId, region.seed])

  if (activeDungeonId) {
    if (!workspace || !gameplay || !dungeonPlayerState) return <div className="skillbound-runtime-loading">Loading Skillbound dungeon session…</div>
    if (!activeDungeon) return <div className="skillbound-dungeon-session missing"><strong>Dungeon unavailable</strong><span>{activeDungeonId} is referenced by this region but is missing from the Skillbound project.</span><button onClick={() => returnToOverworld(dungeonPlayerState)}>Return to {region.regionName}</button></div>
    return <SkillboundDungeonPlayViewport
      dungeon={activeDungeon}
      gameplay={gameplay}
      projectId={runtimeProjectId}
      initialState={dungeonPlayerState}
      characterBlueprint={profile?.blueprint}
      paused={paused}
      onSnapshot={(state) => onSnapshot?.(state as SkillboundRuntimeState)}
      uiTheme={uiTheme}
      hudLayout={hudLayout}
      itemIcons={itemIcons}
      onExit={returnToOverworld}
    />
  }

  const xpPercent = Math.max(0, Math.min(100, snapshot.xp / Math.max(1, snapshot.xpToNext) * 100))
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
      <strong>SKILLBOUND · {profile?.name ?? 'FORGE HERO'}</strong>
      <span>WASD move · LMB primary · 1–5 skills · Q slot 1 · Space dodge · wheel zoom · E interact · Esc menu</span>
      {snapshot.animation && <span className="skillbound-animation-runtime-debug">
        {snapshot.animation.runtime} · base {snapshot.animation.base}{snapshot.animation.baseClip ? ` / ${snapshot.animation.baseClip}` : ''}{snapshot.animation.action ? ` · action ${snapshot.animation.action}` : ''}
      </span>}
    </div>

    <HudPickupFlights events={snapshot.pickupEvents} layout={hudLayout}/>
    {hudModuleVisible(hudLayout, 'objective') && <div className="skillbound-objective" style={moduleStyle('objective')}>{objective}</div>}
    {snapshot.target && hudModuleVisible(hudLayout, 'target') && <TargetBar target={snapshot.target} style={moduleStyle('target')}/>} 
    {snapshot.interaction && hudModuleVisible(hudLayout, 'interaction') && (
      <button
        className={`skillbound-interaction-prompt gameplay-socket-prompt ${snapshot.interaction.locked ? 'locked' : 'ready'} ${snapshot.interaction.trigger === 'hold' ? 'hold' : 'tap'}`}
        style={moduleStyle('interaction')}
        onClick={() => runtimeRef.current?.interact()}
      >
        <kbd>E</kbd>
        <span>
          <strong>
            {snapshot.interaction.locked
              ? snapshot.interaction.lockedText ?? 'Locked'
              : snapshot.interaction.prompt}
          </strong>
          <small>
            {snapshot.interaction.trigger === 'hold'
              ? `Hold E · ${snapshot.interaction.holdSeconds.toFixed(1)}s`
              : snapshot.interaction.sourceName}
          </small>
        </span>
        {snapshot.interaction.trigger === 'hold' && (
          <i>
            <b style={{ width: `${Math.round(snapshot.interaction.progress * 100)}%` }}/>
          </i>
        )}
      </button>
    )}
    {!snapshot.interaction && nearDungeon && dungeonAnchor && hudModuleVisible(hudLayout, 'interaction') && <div className="skillbound-interaction-prompt ready" style={moduleStyle('interaction')}><kbd>E</kbd><strong>Enter {dungeonAnchor.label}</strong></div>}

    <div className="skillbound-runtime-actions">
      <button onClick={() => runtimeRef.current?.saveGame(true)}>Save game</button>
      <button onClick={reset}>Reset run</button>
      {!activeDungeonId && <button
        onClick={() => runtimeRef.current?.spawnTestPack(8)}
        title="Spawns temporary enemies near you without changing world generation or saved encounter progress."
      >
        Spawn test pack · 8
      </button>}
      <button
        className={showEnvironment ? 'active' : ''}
        onClick={() => setShowEnvironment((value) => !value)}
      >
        Environment
      </button>
    </div>

    {showEnvironment && <div className="skillbound-environment-debug">
      <header>
        <span>WORLD ENVIRONMENT</span>
        <strong>{formatWorldHour(environmentHour)}</strong>
      </header>
      <label>
        <span>Time</span>
        <input
          type="range"
          min={0}
          max={23.75}
          step={.25}
          value={environmentHour}
          onChange={(event) => setRuntimeHour(Number(event.target.value))}
        />
      </label>
      <label>
        <span>Weather</span>
        <select
          value={environmentWeather}
          onChange={(event) =>
            setEnvironmentWeather(event.target.value as WorldWeather)
          }
        >
          <option value="clear">Clear</option>
          <option value="cloudy">Cloudy</option>
          <option value="mist">Mist</option>
          <option value="rain">Rain</option>
          <option value="storm">Storm</option>
        </select>
      </label>
      <div>
        <button
          className={environmentPaused ? 'active' : ''}
          onClick={() => setEnvironmentPaused((value) => !value)}
        >
          {environmentPaused ? 'Resume cycle' : 'Pause cycle'}
        </button>
        <select
          value={environmentSpeed}
          onChange={(event) => setEnvironmentSpeed(Number(event.target.value))}
        >
          <option value={.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
          <option value={8}>8×</option>
          <option value={16}>16×</option>
        </select>
      </div>
      <small>30 min = 24 in-game hours at 1×</small>
    </div>}

    {dungeonAnchor && <div className={`skillbound-dungeon-available ${nearDungeon ? 'near' : ''}`}><span>DUNGEON ENTRANCE</span><strong>{dungeonAnchor.label}</strong><small>{nearDungeon ? 'Press E to enter' : 'Travel to the generated entrance · authored in Map Studio'}</small></div>}
    {snapshot.message && hudModuleVisible(hudLayout, 'loot') && <div className="skillbound-runtime-message" style={moduleStyle('loot')}>{snapshot.message}</div>}

    {hudModuleVisible(hudLayout, 'health') && <SkillboundOrb kind="health" value={snapshot.health} max={snapshot.maxHealth} style={moduleStyle('health')}/>} 
    {hudModuleVisible(hudLayout, 'resource') && <SkillboundOrb kind="mana" value={snapshot.mana} max={snapshot.maxMana} style={moduleStyle('resource')}/>} 
    {hudModuleVisible(hudLayout, 'hotbar') && <div className="skillbound-skillbar skillbound-skillbar-expanded" style={moduleStyle('hotbar')}>
      <SkillSlot hotkey="LMB" name={primaryAbility?.name ?? 'Basic attack'} cooldown={snapshot.primaryCooldown}/>
      {hotbarAbilities.map((skill, index) => <SkillSlot key={index} hotkey={String(index + 1)} name={skill?.name ?? 'Empty'} cooldown={snapshot.hotbarCooldowns[index] ?? 0} manaCost={skill ? Number((skill as any).manaCost ?? 12) : undefined} onClick={skill ? () => (runtimeRef.current as any)?.useAbilitySlot?.(index) : undefined}/>)}
      <SkillSlot hotkey="SPACE" name="Dodge" cooldown={snapshot.dodgeCooldown}/>
    </div>}
    {hudModuleVisible(hudLayout, 'xp') && <div className="skillbound-runtime-xp" style={moduleStyle('xp')}>
      <span><strong>LV {snapshot.level}</strong><em>EXPERIENCE</em><small>{snapshot.xp} / {snapshot.xpToNext}</small></span>
      <i><b style={{ width: `${xpPercent}%` }}/></i>
    </div>}
    {hudModuleVisible(hudLayout, 'gold') && <div className="skillbound-runtime-gold" style={moduleStyle('gold')}>
      <i/><span><strong>{snapshot.gold.toLocaleString()}</strong><small>Gold</small></span>
    </div>}

    {hudModuleVisible(hudLayout, 'inventory') && <aside className="skillbound-inventory" style={moduleStyle('inventory')}>
      <header><span>INVENTORY</span><small>{snapshot.inventory.length} item{snapshot.inventory.length === 1 ? '' : 's'} · {snapshot.defense} DEF</small></header>
      <div className="skillbound-inventory-items">
        {snapshot.inventory.length === 0 && <p>Defeat the encounter and walk over the loot.</p>}
        {snapshot.inventory.map((itemId, index) => {
          const item = gameplay?.items.find((candidate) => candidate.id === itemId)
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
      <footer>{snapshot.savedAt ? `Autosaved ${new Date(snapshot.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Autosave every 5 seconds'}</footer>
    </aside>}
  </div>
}

function TargetBar({ target, style }: { target: NonNullable<ForgeRuntimeSnapshot['target']>; style?: CSSProperties }) {
  const percent = Math.max(0, Math.min(100, target.health / Math.max(1, target.maxHealth) * 100))
  return <div className="skillbound-target-bar" style={style}>
    <div><strong>{target.name}</strong><span>{Math.ceil(target.health)} / {target.maxHealth}</span></div>
    <i><b style={{ width: `${percent}%` }}/></i>
  </div>
}

function SkillSlot({ hotkey, name, cooldown, manaCost, onClick }: { hotkey: string; name: string; cooldown: number; manaCost?: number; onClick?: () => void }) {
  const cooling = cooldown > 0.04
  return <div className={`${cooling ? 'skillbound-skill-slot cooling' : 'skillbound-skill-slot'}${onClick ? ' clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
    <b>{hotkey}</b>
    <span>{name}{manaCost !== undefined && <small>{manaCost} MP</small>}</span>
    {cooling && <em>{cooldown.toFixed(1)}</em>}
  </div>
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.isContentEditable)
}