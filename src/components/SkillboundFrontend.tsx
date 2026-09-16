import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Backpack,
  BookOpen,
  ChevronRight,
  CircleUserRound,
  Gamepad2,
  Map,
  Play,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
} from 'lucide-react'
import CharacterForgePreview from './CharacterForgePreview'
import SkillboundPlayViewport from './SkillboundPlayViewport'
import { SkillboundCharacterRuntimePanel, SkillboundInventoryRuntimePanel } from './SkillboundRuntimePanels'
import type { ForgeProjectWorkspace } from '../engine/forgeProject'
import type { ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import type { GeneratedRegion } from '../engine/guidedWorld'
import {
  blueprintToConfig,
  cloneBlueprint,
  type ForgeCharacterBlueprint,
} from '../engine/characterBlueprint'
import {
  createDefaultPlayerBlueprint,
  createPlayerProfile,
  deletePlayerProfile,
  getActivePlayerProfileId,
  listPlayerProfiles,
  savePlayerProfile,
  setActivePlayerProfileId,
  touchPlayerProfile,
  type SkillboundPlayerProfile,
} from '../engine/playerProfiles'
import '../skillbound-frontend.css'

type Screen = 'menu' | 'select' | 'create' | 'settings' | 'play'
type PausePanel = 'root' | 'character' | 'inventory' | 'skills' | 'map' | 'quests' | 'settings'
type ExtendedSnapshot = ForgeRuntimeSnapshot & { gold?: number; xp?: number; level?: number; xpToNext?: number }

type Props = {
  workspace: ForgeProjectWorkspace
  region: GeneratedRegion
  onOpenWorld: () => void
  onBackHome: () => void
}

export default function SkillboundFrontend({ workspace, region, onOpenWorld, onBackHome }: Props) {
  const [profiles, setProfiles] = useState<SkillboundPlayerProfile[]>(() => listPlayerProfiles())
  const [selectedId, setSelectedId] = useState(() => getActivePlayerProfileId() ?? profiles[0]?.id)
  const [screen, setScreen] = useState<Screen>('menu')
  const [draft, setDraft] = useState<ForgeCharacterBlueprint>(() => createDefaultPlayerBlueprint('Wanderer'))
  const [snapshot, setSnapshot] = useState<ExtendedSnapshot>()
  const [paused, setPaused] = useState(false)
  const [pausePanel, setPausePanel] = useState<PausePanel>('root')

  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0]
  const selectedConfig = selected ? blueprintToConfig(selected.blueprint) : undefined
  const draftConfig = useMemo(() => blueprintToConfig(draft), [draft])

  useEffect(() => {
    if (!selectedId && profiles[0]) setSelectedId(profiles[0].id)
  }, [profiles, selectedId])

  useEffect(() => {
    if (screen !== 'play') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTextInput(event.target)) return
      event.preventDefault()
      setPausePanel('root')
      setPaused((value) => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  const refreshProfiles = (preferId?: string) => {
    const next = listPlayerProfiles()
    setProfiles(next)
    if (preferId) setSelectedId(preferId)
    else if (!next.some((profile) => profile.id === selectedId)) setSelectedId(next[0]?.id)
  }

  const startProfile = (profile: SkillboundPlayerProfile) => {
    const touched = touchPlayerProfile(profile.id) ?? profile
    setSelectedId(touched.id)
    setActivePlayerProfileId(touched.id)
    refreshProfiles(touched.id)
    setSnapshot(undefined)
    setPaused(false)
    setPausePanel('root')
    setScreen('play')
  }

  const createAndPlay = () => {
    const profile = createPlayerProfile(draft.name, draft)
    refreshProfiles(profile.id)
    setDraft(createDefaultPlayerBlueprint('Wanderer'))
    startProfile(profile)
  }

  const removeProfile = (profileId: string) => {
    if (!window.confirm('Delete this Skillbound character profile? The character list entry will be removed.')) return
    const next = deletePlayerProfile(profileId)
    setProfiles(next)
    setSelectedId(next[0]?.id)
  }

  if (screen === 'play' && selected) {
    return <div className="skillbound-game-shell">
      <SkillboundPlayViewport
        region={region}
        profile={selected}
        paused={paused}
        onSnapshot={(state) => setSnapshot(state as ExtendedSnapshot)}
      />
      {paused && <PauseMenu
        panel={pausePanel}
        setPanel={setPausePanel}
        profile={selected}
        snapshot={snapshot}
        workspace={workspace}
        region={region}
        onResume={() => { setPausePanel('root'); setPaused(false) }}
        onCharacterSelect={() => { setPaused(false); setPausePanel('root'); setScreen('select') }}
      />}
    </div>
  }

  return <div className="skillbound-front-shell">
    <div className="skillbound-front-atmosphere"><i/><i/><i/></div>
    <header className="skillbound-front-topbar">
      <button onClick={onBackHome}><ArrowLeft size={14}/> Forge Studio</button>
      <span>{workspace.manifest.name}</span>
      <button onClick={onOpenWorld}>Edit World</button>
    </header>

    {screen === 'menu' && <MainMenu
      hasProfiles={profiles.length > 0}
      selected={selected}
      onContinue={() => selected && startProfile(selected)}
      onSelect={() => setScreen('select')}
      onCreate={() => { setDraft(createDefaultPlayerBlueprint('Wanderer')); setScreen('create') }}
      onSettings={() => setScreen('settings')}
    />}

    {screen === 'select' && <CharacterSelect
      profiles={profiles}
      selected={selected}
      selectedConfig={selectedConfig}
      onSelect={(profile) => { setSelectedId(profile.id); setActivePlayerProfileId(profile.id) }}
      onPlay={startProfile}
      onCreate={() => { setDraft(createDefaultPlayerBlueprint('Wanderer')); setScreen('create') }}
      onDelete={removeProfile}
      onBack={() => setScreen('menu')}
    />}

    {screen === 'create' && <CharacterCreator
      blueprint={draft}
      config={draftConfig}
      onChange={setDraft}
      onCreate={createAndPlay}
      onBack={() => setScreen(profiles.length ? 'select' : 'menu')}
    />}

    {screen === 'settings' && <FrontSettings onBack={() => setScreen('menu')}/>} 
  </div>
}

function MainMenu({ hasProfiles, selected, onContinue, onSelect, onCreate, onSettings }: {
  hasProfiles: boolean
  selected?: SkillboundPlayerProfile
  onContinue: () => void
  onSelect: () => void
  onCreate: () => void
  onSettings: () => void
}) {
  return <main className="skillbound-main-menu">
    <div className="skillbound-title-lockup"><span>FORGE PRESENTS</span><h1>SKILLBOUND</h1><p>Descend into a world shaped by steel, memory and forgotten power.</p></div>
    <div className="skillbound-main-actions">
      <button className="primary" disabled={!hasProfiles} onClick={onContinue}><Play size={16}/><span><strong>Continue</strong><small>{selected ? `${selected.name} · return to the adventure` : 'Create a character first'}</small></span></button>
      <button onClick={onSelect}><CircleUserRound size={16}/><span><strong>Character Select</strong><small>{hasProfiles ? `${hasProfiles ? 'Choose an existing hero' : ''}` : 'No characters yet'}</small></span></button>
      <button onClick={onCreate}><Plus size={16}/><span><strong>Create Character</strong><small>Build a new Skillbound hero</small></span></button>
      <button onClick={onSettings}><Settings size={16}/><span><strong>Settings</strong><small>Display and interface options</small></span></button>
    </div>
    <footer>FORGE FRONTEND RUNTIME · CHARACTER BLUEPRINT V2</footer>
  </main>
}

function CharacterSelect({ profiles, selected, selectedConfig, onSelect, onPlay, onCreate, onDelete, onBack }: {
  profiles: SkillboundPlayerProfile[]
  selected?: SkillboundPlayerProfile
  selectedConfig?: ReturnType<typeof blueprintToConfig>
  onSelect: (profile: SkillboundPlayerProfile) => void
  onPlay: (profile: SkillboundPlayerProfile) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onBack: () => void
}) {
  return <main className="skillbound-character-select">
    <header><button onClick={onBack}><ArrowLeft size={14}/> Main Menu</button><div><span>CHARACTERS</span><h2>Choose your hero</h2></div><button className="create" onClick={onCreate}><Plus size={14}/> New Character</button></header>
    <div className="character-select-body">
      <aside className="character-card-list">
        {profiles.map((profile) => <button key={profile.id} className={selected?.id === profile.id ? 'active' : ''} onClick={() => onSelect(profile)}>
          <span className="portrait-mark"><UserRound size={18}/></span>
          <span><strong>{profile.name}</strong><small>Level {profile.blueprint.level} · {profile.blueprint.role}</small><em>{profile.lastPlayedAt ? `Last played ${formatDate(profile.lastPlayedAt)}` : 'New character'}</em></span>
          <ChevronRight size={15}/>
        </button>)}
        {!profiles.length && <div className="no-characters"><CircleUserRound size={28}/><strong>No heroes yet</strong><span>Create your first Skillbound character.</span></div>}
      </aside>
      <section className="character-select-preview">
        {selected && selectedConfig ? <>
          <div className="character-preview-3d"><CharacterForgePreview conceptMode config={selectedConfig} animation="Idle" playing showRig={false} showHitbox={false} cameraMode="studio"/></div>
          <div className="character-select-info"><span>{selected.blueprint.role.toUpperCase()} · {selected.blueprint.combat.weaponProfile.replaceAll('-', ' ').toUpperCase()}</span><h2>{selected.name}</h2><p>{selected.blueprint.tags.join(' · ')}</p><div><button className="play" onClick={() => onPlay(selected)}><Play size={15}/> Enter World</button><button className="delete" onClick={() => onDelete(selected.id)}><Trash2 size={14}/></button></div></div>
        </> : <div className="character-empty-preview"><Sparkles size={32}/><strong>Create your first hero</strong><button onClick={onCreate}>Open Character Creator</button></div>}
      </section>
    </div>
  </main>
}

function CharacterCreator({ blueprint, config, onChange, onCreate, onBack }: {
  blueprint: ForgeCharacterBlueprint
  config: ReturnType<typeof blueprintToConfig>
  onChange: (blueprint: ForgeCharacterBlueprint) => void
  onCreate: () => void
  onBack: () => void
}) {
  const patchBody = (key: keyof ForgeCharacterBlueprint['body'], value: number) => onChange({ ...blueprint, body: { ...blueprint.body, [key]: value } })
  const patchAppearance = (key: keyof ForgeCharacterBlueprint['appearance'], value: string) => onChange({ ...blueprint, appearance: { ...blueprint.appearance, [key]: value } })
  const archetype = (role: 'melee' | 'ranged' | 'caster') => {
    const next = cloneBlueprint(blueprint)
    next.role = role
    next.combat.weaponProfile = role === 'caster' ? 'staff' : role === 'ranged' ? 'bow' : 'one-hand-sword'
    next.appearance.accent = role === 'caster' ? '#586ca8' : role === 'ranged' ? '#526f4d' : '#8a5d3a'
    next.tags = ['player', 'human', role]
    onChange(next)
  }

  return <main className="skillbound-character-creator">
    <header><button onClick={onBack}><ArrowLeft size={14}/> Back</button><div><span>CHARACTER CREATOR</span><h2>Shape your hero</h2></div><button className="create-hero" onClick={onCreate}><Play size={14}/> Create & Play</button></header>
    <div className="creator-body">
      <aside className="creator-controls">
        <section><label>Character name<input value={blueprint.name} maxLength={24} onChange={(event) => onChange({ ...blueprint, name: event.target.value })}/></label></section>
        <section><span className="section-title">ARCHETYPE</span><div className="creator-archetypes"><button className={blueprint.role === 'melee' ? 'active' : ''} onClick={() => archetype('melee')}><Shield size={15}/><strong>Vanguard</strong><small>Sword & resilience</small></button><button className={blueprint.role === 'ranged' ? 'active' : ''} onClick={() => archetype('ranged')}><Swords size={15}/><strong>Ranger</strong><small>Range & mobility</small></button><button className={blueprint.role === 'caster' ? 'active' : ''} onClick={() => archetype('caster')}><Sparkles size={15}/><strong>Arcanist</strong><small>Staff & arcane power</small></button></div></section>
        <section><span className="section-title">BODY</span><CreatorRange label="Height" value={blueprint.body.height} min={.85} max={1.2} onChange={(value) => patchBody('height', value)}/><CreatorRange label="Build" value={blueprint.body.bulk} min={.78} max={1.38} onChange={(value) => patchBody('bulk', value)}/><CreatorRange label="Shoulders" value={blueprint.body.shoulders} min={.82} max={1.3} onChange={(value) => patchBody('shoulders', value)}/><CreatorRange label="Head" value={blueprint.body.headScale} min={.88} max={1.14} onChange={(value) => patchBody('headScale', value)}/></section>
        <section><span className="section-title">APPEARANCE</span><div className="creator-colors"><label>Skin<input type="color" value={blueprint.appearance.primary} onChange={(event) => patchAppearance('primary', event.target.value)}/></label><label>Cloth<input type="color" value={blueprint.appearance.secondary} onChange={(event) => patchAppearance('secondary', event.target.value)}/></label><label>Accent<input type="color" value={blueprint.appearance.accent} onChange={(event) => patchAppearance('accent', event.target.value)}/></label></div><label>Headwear<select value={blueprint.appearance.headwear} onChange={(event) => patchAppearance('headwear', event.target.value)}><option value="none">None</option><option value="hood">Hood</option><option value="helmet">Helmet</option></select></label></section>
      </aside>
      <section className="creator-preview"><CharacterForgePreview conceptMode config={config} animation="Idle" playing showRig={false} showHitbox={false} cameraMode="studio"/><div className="creator-preview-label"><span>FORGEHUMANOIDV1</span><strong>{blueprint.name || 'Wanderer'}</strong><small>Character Blueprint v2 · compatible with Skillbound runtime</small></div></section>
      <aside className="creator-summary"><span>HERO SUMMARY</span><h3>{blueprint.name || 'Wanderer'}</h3><dl><div><dt>Archetype</dt><dd>{blueprint.role}</dd></div><div><dt>Weapon style</dt><dd>{blueprint.combat.weaponProfile.replaceAll('-', ' ')}</dd></div><div><dt>Height</dt><dd>{Math.round(blueprint.body.height * 180)} cm</dd></div><div><dt>Build</dt><dd>{Math.round(blueprint.body.bulk * 100)}%</dd></div></dl><p>Your body and appearance are stored as editable Character Blueprint DNA. Equipment remains external and comes from Item Forge.</p><button onClick={onCreate}><Gamepad2 size={15}/> Create Character</button></aside>
    </div>
  </main>
}

function PauseMenu({ panel, setPanel, profile, snapshot, workspace, region, onResume, onCharacterSelect }: {
  panel: PausePanel
  setPanel: (panel: PausePanel) => void
  profile: SkillboundPlayerProfile
  snapshot?: ExtendedSnapshot
  workspace: ForgeProjectWorkspace
  region: GeneratedRegion
  onResume: () => void
  onCharacterSelect: () => void
}) {
  return <div className="skillbound-pause-layer">
    <div className="skillbound-pause-backdrop"/>
    <aside className="pause-navigation">
      <div><span>SKILLBOUND</span><strong>{profile.name}</strong><small>Level {snapshot?.level ?? profile.blueprint.level} · {region.regionName}</small></div>
      <button className={panel === 'root' ? 'active' : ''} onClick={() => setPanel('root')}><Gamepad2 size={15}/> Pause</button>
      <button className={panel === 'character' ? 'active' : ''} onClick={() => setPanel('character')}><UserRound size={15}/> Character</button>
      <button className={panel === 'inventory' ? 'active' : ''} onClick={() => setPanel('inventory')}><Backpack size={15}/> Inventory</button>
      <button className={panel === 'skills' ? 'active' : ''} onClick={() => setPanel('skills')}><Swords size={15}/> Skills</button>
      <button className={panel === 'map' ? 'active' : ''} onClick={() => setPanel('map')}><Map size={15}/> Map</button>
      <button className={panel === 'quests' ? 'active' : ''} onClick={() => setPanel('quests')}><BookOpen size={15}/> Quests</button>
      <button className={panel === 'settings' ? 'active' : ''} onClick={() => setPanel('settings')}><Settings size={15}/> Settings</button>
      <div className="pause-spacer"/>
      <button onClick={onCharacterSelect}><CircleUserRound size={15}/> Exit to Character Select</button>
      <button className="resume" onClick={onResume}><Play size={15}/> Resume</button>
    </aside>
    <main className="pause-content">{renderPausePanel(panel, profile, snapshot, workspace, region, onResume)}</main>
  </div>
}

function renderPausePanel(panel: PausePanel, profile: SkillboundPlayerProfile, snapshot: ExtendedSnapshot | undefined, workspace: ForgeProjectWorkspace, region: GeneratedRegion, onResume: () => void) {
  if (panel === 'root') return <div className="pause-hero-panel"><span>GAME PAUSED</span><h2>{profile.name}</h2><p>{region.regionName} · Level {snapshot?.level ?? 1}</p><button onClick={onResume}><Play size={16}/> Return to World</button></div>
  if (panel === 'character') return <SkillboundCharacterRuntimePanel profile={profile} snapshot={snapshot} workspace={workspace}/>
  if (panel === 'inventory') return <SkillboundInventoryRuntimePanel profile={profile} snapshot={snapshot} workspace={workspace}/>
  if (panel === 'skills') return <div className="pause-sheet"><header><span>SKILLS</span><h2>Current abilities</h2></header><div className="pause-skill-list">{workspace.gameplay.abilities.map((ability) => <div key={ability.id}><i style={{ background: ability.color }}/><span><strong>{ability.name}</strong><small>{ability.kind} · {ability.damage} damage · {ability.cooldown}s cooldown</small></span></div>)}</div></div>
  if (panel === 'map') return <div className="pause-sheet"><header><span>MAP</span><h2>{region.regionName}</h2></header><div className="pause-map"><div className="map-route"/>{region.nodes.slice(0, 12).map((node, index) => <i key={node.id} style={{ left: `${12 + (index * 17) % 76}%`, top: `${20 + (index * 29) % 62}%` }} title={node.label}/>)}</div><p>{region.nodes.length} generated locations · {region.biome}</p></div>
  if (panel === 'quests') return <div className="pause-sheet"><header><span>QUEST LOG</span><h2>Tracked objectives</h2></header><div className="pause-quest"><strong>{snapshot && snapshot.enemiesAlive > 0 ? 'Clear the encounter' : 'Explore the region'}</strong><span>{snapshot ? `${snapshot.enemiesAlive}/${snapshot.enemiesTotal} enemies remain` : `Travel through ${region.regionName}`}</span></div></div>
  return <FrontSettings embedded/>
}

function FrontSettings({ onBack, embedded = false }: { onBack?: () => void; embedded?: boolean }) {
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem('skillbound-setting-ui-scale') ?? 100))
  const [motion, setMotion] = useState(() => localStorage.getItem('skillbound-setting-motion') !== 'reduced')
  const save = (nextScale = uiScale, nextMotion = motion) => {
    localStorage.setItem('skillbound-setting-ui-scale', String(nextScale))
    localStorage.setItem('skillbound-setting-motion', nextMotion ? 'full' : 'reduced')
  }
  return <main className={embedded ? 'pause-sheet settings-sheet' : 'skillbound-settings-screen'}>
    {!embedded && <header><button onClick={onBack}><ArrowLeft size={14}/> Main Menu</button><div><span>SETTINGS</span><h2>Interface & display</h2></div></header>}
    <section><label><span><strong>UI Scale</strong><small>Scale Skillbound menus and HUD.</small></span><input type="range" min={75} max={140} value={uiScale} onChange={(event) => { const value = Number(event.target.value); setUiScale(value); save(value, motion) }}/><em>{uiScale}%</em></label><label><span><strong>Full UI motion</strong><small>Keep liquid, pickup and menu animation enabled.</small></span><input type="checkbox" checked={motion} onChange={(event) => { setMotion(event.target.checked); save(uiScale, event.target.checked) }}/></label></section>
  </main>
}

function CreatorRange({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="creator-range"><span>{label}<em>{Math.round(value * 100)}%</em></span><input type="range" min={min} max={max} step={.01} value={value} onChange={(event) => onChange(Number(event.target.value))}/></label>
}
function Stat({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function formatDate(value: string) { try { return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) } catch { return 'Recently' } }
function isTextInput(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.isContentEditable) }
