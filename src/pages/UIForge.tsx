import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Backpack, Download, Grid3X3, LayoutGrid, Monitor, Palette, RotateCcw, Save, Shield, Sparkles, Swords, UserRound } from 'lucide-react'
import { HudForgeEditor, HudForgeInspector } from '../components/HudForgeEditor'
import { loadSkillboundWorkspace, patchUi, saveSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'
import { createDefaultHudLayout, normalizeHudLayout, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import {
  UI_FORGE_ACCENTS,
  UI_FORGE_PRESETS,
  UI_FORGE_VIEWPORTS,
  cloneUiForgePreset,
  skillboundUiCssVariables,
  withAccent,
  type SkillboundUiTheme,
  type UiForgeAccent,
  type UiForgeScreen,
} from '../lib/uiForge'
import '../ui-forge.css'

const SCREENS: Array<{ id: UiForgeScreen; label: string; icon: typeof LayoutGrid }> = [
  { id: 'hud', label: 'HUD', icon: Monitor },
  { id: 'inventory', label: 'Inventory', icon: Backpack },
  { id: 'character', label: 'Character', icon: UserRound },
  { id: 'skills', label: 'Skills', icon: Sparkles },
]

const RARITIES = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary']

export default function UIForge() {
  const [presetId, setPresetId] = useState('dark-arpg')
  const [theme, setTheme] = useState<SkillboundUiTheme>(() => cloneUiForgePreset('dark-arpg'))
  const [hudLayout, setHudLayout] = useState<SkillboundHudLayout>(() => createDefaultHudLayout())
  const [selectedHudModule, setSelectedHudModule] = useState<SkillboundHudModuleId>('hotbar')
  const [screen, setScreen] = useState<UiForgeScreen>('hud')
  const [viewportId, setViewportId] = useState('fhd')
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [status, setStatus] = useState('Loading the active Skillbound UI theme…')
  const viewport = UI_FORGE_VIEWPORTS.find((item) => item.id === viewportId) ?? UI_FORGE_VIEWPORTS[1]

  useEffect(() => {
    let cancelled = false
    void loadSkillboundWorkspace()
      .then((project) => {
        if (cancelled) return
        setWorkspace(project)
        setTheme({ ...project.ui.theme })
        setHudLayout(normalizeHudLayout(project.ui.hud))
        setPresetId(UI_FORGE_PRESETS.some((preset) => preset.id === project.ui.theme.id) ? project.ui.theme.id : 'dark-arpg')
        setStatus('Loaded from projects/skillbound UI data. Save changes to update Play Mode.')
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load the Skillbound UI theme.')
      })
    return () => { cancelled = true }
  }, [])

  const patch = <K extends keyof SkillboundUiTheme>(key: K, value: SkillboundUiTheme[K]) => setTheme((current) => ({ ...current, [key]: value }))
  const loadPreset = (id: string) => { setPresetId(id); setTheme(cloneUiForgePreset(id)); setStatus('Theme preset loaded in the editor. Save to apply it to Skillbound Runtime.') }
  const style = useMemo(() => ({
    ...skillboundUiCssVariables(theme),
    '--sb-aspect': `${viewport.width} / ${viewport.height}`,
  } as CSSProperties), [theme, viewport])

  const saveTheme = () => {
    if (!workspace) {
      setStatus('Skillbound project is still loading.')
      return
    }
    const updatedUi = { ...workspace.ui, theme: { ...theme }, hud: hudLayout }
    const next = saveSkillboundWorkspace(patchUi(workspace, updatedUi))
    setWorkspace(next)
    setStatus(`Saved "${theme.name}" + HUD layout to Skillbound. Play Project now consumes both.`)
  }

  const exportTheme = () => {
    const definition = workspace?.ui
      ? { ...workspace.ui, theme: { ...theme }, hud: hudLayout }
      : { format: 'forge-ui-theme', version: 1, id: 'skillbound-ui', projectId: 'skillbound', theme, hud: hudLayout }
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `skillbound-ui-${slug(theme.name)}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 800)
  }

  return <div className="uiforge" style={style}>
    <aside className="uiforge-left">
      <header className="uiforge-panel-heading"><Palette size={16}/><div><span>UI FORGE</span><strong>Skillbound Design System</strong></div></header>
      <p className="uiforge-intro">One project UI definition drives the design canvas and the live Skillbound runtime. HUD Forge now stores responsive module anchors alongside the visual theme.</p>

      <section className="uiforge-control-section">
        <h3>Theme preset</h3>
        <div className="uiforge-preset-grid">{UI_FORGE_PRESETS.map((preset) => <button key={preset.id} className={presetId === preset.id ? 'active' : ''} onClick={() => loadPreset(preset.id)}><i style={{ background: preset.accentColor }}/><span>{preset.name}</span></button>)}</div>
      </section>

      <section className="uiforge-control-section">
        <h3>Global style</h3>
        <Field label="Panel material"><select value={theme.panelStyle} onChange={(event) => patch('panelStyle', event.target.value as SkillboundUiTheme['panelStyle'])}><option value="metal">Forged metal</option><option value="leather">Leather</option><option value="stone">Stone</option><option value="glass">Glass-dark</option></select></Field>
        <Field label="Accent"><select value={theme.accent} onChange={(event) => setTheme((current) => withAccent(current, event.target.value as UiForgeAccent))}>{Object.entries(UI_FORGE_ACCENTS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></Field>
        <Field label="Decoration"><select value={theme.ornamentLevel} onChange={(event) => patch('ornamentLevel', event.target.value as SkillboundUiTheme['ornamentLevel'])}><option value="minimal">Minimal</option><option value="medium">Medium</option><option value="ornate">Ornate</option></select></Field>
        <Field label="Corners"><select value={theme.cornerStyle} onChange={(event) => patch('cornerStyle', event.target.value as SkillboundUiTheme['cornerStyle'])}><option value="sharp">Sharp</option><option value="bevel">Beveled</option><option value="runes">Rune corners</option></select></Field>
        <Field label="Typography"><select value={theme.fontStyle} onChange={(event) => patch('fontStyle', event.target.value as SkillboundUiTheme['fontStyle'])}><option value="hybrid">Fantasy hybrid</option><option value="serif">Serif</option><option value="sans">Clean sans</option></select></Field>
      </section>

      <section className="uiforge-control-section">
        <h3>Scale & surface</h3>
        <Range label="UI scale" value={theme.uiScale} min={0.82} max={1.25} step={0.01} suffix={`${Math.round(theme.uiScale * 100)}%`} onChange={(value) => patch('uiScale', value)}/>
        <Range label="Font scale" value={theme.fontScale} min={0.82} max={1.2} step={0.01} suffix={`${Math.round(theme.fontScale * 100)}%`} onChange={(value) => patch('fontScale', value)}/>
        <Range label="Panel opacity" value={theme.transparency} min={0.72} max={1} step={0.01} suffix={`${Math.round(theme.transparency * 100)}%`} onChange={(value) => patch('transparency', value)}/>
        <Range label="Border" value={theme.borderWidth} min={1} max={3} step={1} suffix={`${theme.borderWidth}px`} onChange={(value) => patch('borderWidth', value)}/>
        <Range label="Shadow" value={theme.shadowStrength} min={0} max={1} step={0.05} suffix={`${Math.round(theme.shadowStrength * 100)}%`} onChange={(value) => patch('shadowStrength', value)}/>
      </section>
    </aside>

    <main className="uiforge-center">
      <header className="uiforge-toolbar">
        <div><span className="eyebrow">LIVE DESIGN CANVAS</span><strong>Skillbound · {SCREENS.find((item) => item.id === screen)?.label}</strong></div>
        <div className="uiforge-screen-tabs">{SCREENS.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={13}/>{label}</button>)}</div>
      </header>

      <div className="uiforge-viewport-toolbar">
        <div className="uiforge-viewports">{UI_FORGE_VIEWPORTS.map((item) => <button key={item.id} className={viewportId === item.id ? 'active' : ''} onClick={() => setViewportId(item.id)}><strong>{item.label}</strong><span>{item.detail}</span></button>)}</div>
        <span className="uiforge-resolution"><Monitor size={13}/>{viewport.width} × {viewport.height}</span>
      </div>

      <div className="uiforge-stage">
        <div className={`skillbound-preview panel-${theme.panelStyle} ornament-${theme.ornamentLevel} corner-${theme.cornerStyle} slots-${theme.slotStyle} buttons-${theme.buttonStyle} density-${theme.density}`}>
          {screen === 'hud' && <HudForgeEditor layout={hudLayout} selected={selectedHudModule} onSelect={setSelectedHudModule} onChange={setHudLayout}/>} 
          {screen === 'inventory' && <InventoryPreview/>}
          {screen === 'character' && <CharacterPreview/>}
          {screen === 'skills' && <SkillsPreview/>}
        </div>
      </div>
      <footer className="uiforge-canvas-footer"><Shield size={13}/><span>{screen === 'hud' ? `Drag HUD modules directly at ${viewport.label}; anchors keep the composition responsive.` : `Responsive preview at ${viewport.label}. Saved tokens are consumed by Skillbound Play Mode.`}</span></footer>
    </main>

    <aside className="uiforge-right">
      {screen === 'hud' ? <>
        <header className="uiforge-panel-heading"><Grid3X3 size={16}/><div><span>HUD FORGE 2.0</span><strong>Runtime layout</strong></div></header>
        <HudForgeInspector layout={hudLayout} selected={selectedHudModule} onSelect={setSelectedHudModule} onChange={setHudLayout}/>
      </> : <>
        <header className="uiforge-panel-heading"><Grid3X3 size={16}/><div><span>COMPONENT SYSTEM</span><strong>Shared primitives</strong></div></header>
        <section className="uiforge-control-section">
          <h3>Component language</h3>
          <Field label="Item slots"><select value={theme.slotStyle} onChange={(event) => patch('slotStyle', event.target.value as SkillboundUiTheme['slotStyle'])}><option value="inset">Dark inset</option><option value="etched">Etched frame</option><option value="clean">Clean frame</option></select></Field>
          <Field label="Buttons"><select value={theme.buttonStyle} onChange={(event) => patch('buttonStyle', event.target.value as SkillboundUiTheme['buttonStyle'])}><option value="solid">Solid</option><option value="ghost">Ghost</option></select></Field>
          <Field label="Density"><select value={theme.density} onChange={(event) => patch('density', event.target.value as SkillboundUiTheme['density'])}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></Field>
        </section>
        <section className="uiforge-component-demo">
          <h3>Live components</h3>
          <div className="sb-panel demo-panel"><span className="sb-kicker">PANEL</span><strong>Ancient Reliquary</strong><p>Shared surface, header and border language.</p></div>
          <div className="uiforge-demo-row"><button className="sb-button">Primary</button><button className="sb-button subtle">Secondary</button></div>
          <div className="uiforge-demo-slots">{RARITIES.map((rarity, index) => <div className={`sb-slot rarity-${index}`} key={rarity}><span>{index + 1}</span><small>{rarity[0]}</small></div>)}</div>
          <div className="sb-tooltip"><span className="legendary">Ashen Vanguard Blade</span><small>Two-Handed Sword</small><b>142–188 Damage</b><p>+12% attack speed<br/>+34 strength</p></div>
        </section>
        <section className="uiforge-token-summary">
          <h3>System coverage</h3>
          <Token label="Panel / Window" value="Runtime + menus"/>
          <Token label="Item / Gear slot" value="Inventory + loot"/>
          <Token label="Button / Tab" value="Global"/>
          <Token label="Tooltip" value="Items + skills"/>
          <Token label="Resource orb" value="Combat HUD"/>
          <Token label="Project file" value="ui/skillbound.ui.json"/>
        </section>
      </>}

      <div className="uiforge-actions">
        <button onClick={() => loadPreset(presetId)}><RotateCcw size={14}/> Reset theme</button>
        <button onClick={exportTheme}><Download size={14}/> Export JSON</button>
        <button className="primary" disabled={!workspace} onClick={saveTheme}><Save size={14}/> Save to Skillbound</button>
      </div>
      <div className="uiforge-project-status">{status}</div>
    </aside>
  </div>
}

function InventoryPreview() {
  return <div className="sb-world sb-menu-world"><WorldBackdrop/><div className="sb-window inventory-window sb-panel">
    <WindowHeader title="Inventory" tabs={['Inventory','Materials','Stash']}/>
    <div className="inventory-layout">
      <div className="paperdoll"><span className="sb-kicker">EQUIPMENT</span><div className="doll-body"><i className="head"/><i className="torso"/><i className="arm left"/><i className="arm right"/><i className="leg left"/><i className="leg right"/></div><EquipmentSlots/></div>
      <div className="inventory-bag"><div className="inventory-meta"><span>Backpack</span><b>27 / 40</b></div><div className="item-grid">{Array.from({ length: 40 }).map((_, index) => <div className={`sb-slot ${[2,7,13,16,24,31].includes(index) ? `filled rarity-${index % 5}` : ''}`} key={index}>{[2,7,13,16,24,31].includes(index) && <i/>}</div>)}</div><div className="gold-row"><span>Gold</span><strong>12,840</strong></div></div>
      <div className="sb-tooltip inventory-tooltip"><span className="legendary">Cryptwarden Pauldron</span><small>Rare Shoulder Armor · Lv. 17</small><b>86 Armor</b><p>+21 vitality<br/>+8% shadow resistance<br/>Sockets: 1</p><em>Forged in the Hollow.</em></div>
    </div>
  </div></div>
}

function CharacterPreview() {
  return <div className="sb-world sb-menu-world"><WorldBackdrop/><div className="sb-window character-window sb-panel">
    <WindowHeader title="Character" tabs={['Overview','Attributes','Defense']}/>
    <div className="character-layout">
      <div className="character-stats"><span className="sb-kicker">OFFENSE</span><Stat name="Damage" value="1,284"/><Stat name="Attack speed" value="1.42/s"/><Stat name="Critical chance" value="18.5%"/><span className="sb-kicker second">DEFENSE</span><Stat name="Armor" value="642"/><Stat name="Dodge" value="9%"/><Stat name="Block" value="12%"/></div>
      <div className="character-hero"><div className="hero-silhouette"><i className="hero-head"/><i className="hero-chest"/><i className="hero-arm l"/><i className="hero-arm r"/><i className="hero-leg l"/><i className="hero-leg r"/></div><strong>Thobias</strong><span>Runebound Vanguard · Level 18</span></div>
      <div className="character-resists"><span className="sb-kicker">RESISTANCES</span><Resist name="Fire" value={62}/><Resist name="Frost" value={48}/><Resist name="Lightning" value={71}/><Resist name="Shadow" value={36}/><div className="attribute-points"><small>Unspent points</small><b>3</b><button className="sb-button">Allocate</button></div></div>
    </div>
  </div></div>
}

function SkillsPreview() {
  return <div className="sb-world sb-menu-world"><WorldBackdrop/><div className="sb-window skills-window sb-panel">
    <WindowHeader title="Skills" tabs={['Active','Passive','Loadout']}/>
    <div className="skills-layout">
      <div className="skill-tree"><div className="skill-branch branch-a"/><div className="skill-branch branch-b"/><div className="skill-branch branch-c"/>{[
        ['A','Grave Step','active'], ['B','Soul Cleave','active'], ['C','Blood Pact','locked'], ['D','Rift Guard','active'], ['E','Bone Storm','elite'], ['F','Hexbrand','active'], ['G','Last Rite','locked'],
      ].map(([id,label,state], index) => <div className={`skill-node node-${index} ${state}`} key={id}><span>{id}</span><small>{label}</small></div>)}</div>
      <div className="skill-details"><span className="sb-kicker">SELECTED SKILL</span><div className="skill-big-icon"><Swords size={30}/></div><h2>Soul Cleave</h2><p>Carve a spectral arc through enemies and mark survivors for execution.</p><div className="skill-tags"><span>Melee</span><span>Shadow</span><span>AoE</span></div><Stat name="Damage" value="164%"/><Stat name="Cooldown" value="4.2s"/><Stat name="Cost" value="18 Mana"/><button className="sb-button bind-button">Bind to hotbar</button></div>
    </div>
  </div></div>
}

function WorldBackdrop() { return <><div className="world-vignette"/><div className="world-floor"/><div className="world-ruin ruin-a"/><div className="world-ruin ruin-b"/><div className="world-player"><i/><b/></div><div className="world-enemy enemy-a"/><div className="world-enemy enemy-b"/></> }
function WindowHeader({ title, tabs }: { title: string; tabs: string[] }) { return <div className="sb-window-header"><div><span className="sb-kicker">SKILLBOUND</span><strong>{title}</strong></div><nav>{tabs.map((tab, index) => <button className={index === 0 ? 'active' : ''} key={tab}>{tab}</button>)}</nav><button className="window-close">×</button></div> }
function EquipmentSlots() { return <>{['helm','chest','gloves','boots','weapon','ring'].map((slot, index) => <div className={`sb-slot equipment-slot equip-${slot} ${index < 4 ? `rarity-${(index + 1) % 5}` : ''}`} key={slot}><small>{slot[0].toUpperCase()}</small>{index < 4 && <i/>}</div>)}</> }
function Stat({ name, value }: { name: string; value: string }) { return <div className="stat-row"><span>{name}</span><strong>{value}</strong></div> }
function Resist({ name, value }: { name: string; value: number }) { return <div className="resist-row"><div><span>{name}</span><strong>{value}%</strong></div><i><b style={{ width: `${value}%` }}/></i></div> }
function Token({ label, value }: { label: string; value: string }) { return <div className="token-row"><span>{label}</span><strong>{value}</strong></div> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="uiforge-field"><span>{label}</span>{children}</label> }
function Range({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) { return <label className="uiforge-range"><span><b>{label}</b><code>{suffix}</code></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/></label> }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }
