import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Download, Grid3X3, Monitor, Palette, RotateCcw, Save, Shield } from 'lucide-react'
import { HudForgeEditor, HudForgeInspector } from '../components/HudForgeEditor'
import { UiScreenForgeEditor, UiScreenForgeInspector } from '../components/UiScreenForgeEditor'
import { loadSkillboundWorkspace, patchUi, saveSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'
import { createDefaultHudLayout, normalizeHudLayout, type SkillboundHudLayout, type SkillboundHudModuleId } from '../lib/hudForge'
import { createDefaultUiScreens, normalizeUiScreens, UI_SCREEN_META, type SkillboundUiScreenId, type SkillboundUiScreens, type UiScreenCategory } from '../lib/uiScreenForge'
import {
  UI_FORGE_ACCENTS,
  UI_FORGE_PRESETS,
  UI_FORGE_VIEWPORTS,
  cloneUiForgePreset,
  skillboundUiCssVariables,
  withAccent,
  type SkillboundUiTheme,
  type UiForgeAccent,
} from '../lib/uiForge'
import '../ui-forge.css'
import '../hud-grid.css'
import '../ui-forge-v2.css'

type EditorScreen = 'hud' | SkillboundUiScreenId

const GROUPS: Array<{ label: UiScreenCategory | 'HUD'; screens: EditorScreen[] }> = [
  { label: 'HUD', screens: ['hud'] },
  { label: 'In Game', screens: UI_SCREEN_META.filter((item) => item.category === 'In Game').map((item) => item.id) },
  { label: 'Front End', screens: UI_SCREEN_META.filter((item) => item.category === 'Front End').map((item) => item.id) },
  { label: 'Gameplay Windows', screens: UI_SCREEN_META.filter((item) => item.category === 'Gameplay Windows').map((item) => item.id) },
]

export default function UIForge() {
  const [presetId, setPresetId] = useState('dark-arpg')
  const [theme, setTheme] = useState<SkillboundUiTheme>(() => cloneUiForgePreset('dark-arpg'))
  const [hudLayout, setHudLayout] = useState<SkillboundHudLayout>(() => createDefaultHudLayout())
  const [screens, setScreens] = useState<SkillboundUiScreens>(() => createDefaultUiScreens())
  const [selectedHudModule, setSelectedHudModule] = useState<SkillboundHudModuleId>('hotbar')
  const [selectedElementByScreen, setSelectedElementByScreen] = useState<Partial<Record<SkillboundUiScreenId, string>>>({})
  const [screen, setScreen] = useState<EditorScreen>('hud')
  const [viewportId, setViewportId] = useState('fhd')
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [status, setStatus] = useState('Loading the active Skillbound UI definition…')

  const viewport = UI_FORGE_VIEWPORTS.find((item) => item.id === viewportId) ?? UI_FORGE_VIEWPORTS[1]
  const screenMeta = screen === 'hud'
    ? { label: 'HUD', detail: 'Combat HUD modules with responsive anchors and optional grid snapping.' }
    : UI_SCREEN_META.find((item) => item.id === screen) ?? { label: screen, detail: '' }
  const screenLayout = screen === 'hud' ? undefined : screens[screen]
  const selectedElementId = screenLayout
    ? selectedElementByScreen[screenLayout.id] ?? screenLayout.elements[0]?.id ?? ''
    : ''

  useEffect(() => {
    let cancelled = false
    void loadSkillboundWorkspace()
      .then((project) => {
        if (cancelled) return
        setWorkspace(project)
        setTheme({ ...project.ui.theme })
        setHudLayout(normalizeHudLayout(project.ui.hud))
        setScreens(normalizeUiScreens(project.ui.screens))
        setPresetId(UI_FORGE_PRESETS.some((preset) => preset.id === project.ui.theme.id) ? project.ui.theme.id : 'dark-arpg')
        setStatus('UI Forge 2.0 loaded. HUD and menu layouts are stored with the Skillbound project UI definition.')
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load the Skillbound UI definition.')
      })
    return () => { cancelled = true }
  }, [])

  const patchTheme = <K extends keyof SkillboundUiTheme>(key: K, value: SkillboundUiTheme[K]) => setTheme((current) => ({ ...current, [key]: value }))
  const loadPreset = (id: string) => {
    setPresetId(id)
    setTheme(cloneUiForgePreset(id))
    setStatus('Theme preset loaded. Screen grid layouts were kept unchanged.')
  }
  const style = useMemo(() => ({
    ...skillboundUiCssVariables(theme),
    '--sb-aspect': `${viewport.width} / ${viewport.height}`,
  } as CSSProperties), [theme, viewport])

  const updateScreenLayout = (id: SkillboundUiScreenId, next: SkillboundUiScreens[SkillboundUiScreenId]) => {
    setScreens((current) => ({ ...current, [id]: next }))
  }

  const saveUi = () => {
    if (!workspace) {
      setStatus('Skillbound project is still loading.')
      return
    }
    const updatedUi = { ...workspace.ui, theme: { ...theme }, hud: hudLayout, screens }
    const next = saveSkillboundWorkspace(patchUi(workspace, updatedUi))
    setWorkspace(next)
    setStatus(`Saved ${theme.name}, HUD layout and ${Object.keys(screens).length} authored UI screens to Skillbound.`)
  }

  const exportUi = () => {
    const definition = workspace?.ui
      ? { ...workspace.ui, theme: { ...theme }, hud: hudLayout, screens }
      : { format: 'forge-ui-theme', version: 1, id: 'skillbound-ui', projectId: 'skillbound', theme, hud: hudLayout, screens }
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `skillbound-ui-${slug(theme.name)}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 800)
  }

  return <div className="uiforge ui-forge-v2" style={style}>
    <aside className="uiforge-left ui-screen-browser">
      <header className="uiforge-panel-heading"><Palette size={16}/><div><span>UI FORGE 2.0</span><strong>Skillbound Interface</strong></div></header>
      <p className="uiforge-intro">Author the whole player-facing interface. Menu screens use real grid cells instead of unrestricted free placement.</p>

      <div className="ui-screen-groups">{GROUPS.map((group) => <section key={group.label}>
        <h3>{group.label}</h3>
        {group.screens.map((id) => {
          const meta = id === 'hud' ? { label: 'HUD', detail: 'Combat overlay' } : UI_SCREEN_META.find((item) => item.id === id)!
          return <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}>
            <span><strong>{meta.label}</strong><small>{meta.detail}</small></span><em>{id === 'hud' ? 'ANCHOR + GRID' : 'GRID'}</em>
          </button>
        })}
      </section>)}</div>

      <section className="uiforge-control-section compact-theme-controls">
        <h3>Shared theme</h3>
        <Field label="Preset"><select value={presetId} onChange={(event) => loadPreset(event.target.value)}>{UI_FORGE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></Field>
        <Field label="Material"><select value={theme.panelStyle} onChange={(event) => patchTheme('panelStyle', event.target.value as SkillboundUiTheme['panelStyle'])}><option value="metal">Forged metal</option><option value="leather">Leather</option><option value="stone">Stone</option><option value="glass">Glass-dark</option></select></Field>
        <Field label="Accent"><select value={theme.accent} onChange={(event) => setTheme((current) => withAccent(current, event.target.value as UiForgeAccent))}>{Object.entries(UI_FORGE_ACCENTS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></Field>
        <Field label="Decoration"><select value={theme.ornamentLevel} onChange={(event) => patchTheme('ornamentLevel', event.target.value as SkillboundUiTheme['ornamentLevel'])}><option value="minimal">Minimal</option><option value="medium">Medium</option><option value="ornate">Ornate</option></select></Field>
        <Range label="UI scale" value={theme.uiScale} min={.82} max={1.25} step={.01} suffix={`${Math.round(theme.uiScale * 100)}%`} onChange={(value) => patchTheme('uiScale', value)}/>
      </section>
    </aside>

    <main className="uiforge-center">
      <header className="uiforge-toolbar ui-v2-toolbar">
        <div><span className="eyebrow">LIVE DESIGN CANVAS</span><strong>Skillbound · {screenMeta.label}</strong><small>{screenMeta.detail}</small></div>
        <span className="ui-authority-badge"><Grid3X3 size={12}/>{screen === 'hud' ? 'Responsive HUD' : 'Cell-based layout'}</span>
      </header>

      <div className="uiforge-viewport-toolbar">
        <div className="uiforge-viewports">{UI_FORGE_VIEWPORTS.map((item) => <button key={item.id} className={viewportId === item.id ? 'active' : ''} onClick={() => setViewportId(item.id)}><strong>{item.label}</strong><span>{item.detail}</span></button>)}</div>
        <span className="uiforge-resolution"><Monitor size={13}/>{viewport.width} × {viewport.height}</span>
      </div>

      <div className="uiforge-stage">
        <div className={`skillbound-preview panel-${theme.panelStyle} ornament-${theme.ornamentLevel} corner-${theme.cornerStyle} slots-${theme.slotStyle} buttons-${theme.buttonStyle} density-${theme.density}`}>
          {screen === 'hud' ? <HudForgeEditor layout={hudLayout} selected={selectedHudModule} onSelect={setSelectedHudModule} onChange={setHudLayout}/>
            : screenLayout ? <UiScreenForgeEditor
              layout={screenLayout}
              selectedElementId={selectedElementId}
              onSelectElement={(id) => setSelectedElementByScreen((current) => ({ ...current, [screenLayout.id]: id }))}
              onChange={(next) => updateScreenLayout(screenLayout.id, next)}
            /> : null}
        </div>
      </div>
      <footer className="uiforge-canvas-footer"><Shield size={13}/><span>{screen === 'hud' ? 'HUD modules preserve responsive anchors; grid snapping keeps alignment predictable.' : 'Every visible element occupies explicit grid cells. Dragging moves by cells, not arbitrary pixels.'}</span></footer>
    </main>

    <aside className="uiforge-right ui-v2-inspector">
      <header className="uiforge-panel-heading"><Grid3X3 size={16}/><div><span>{screen === 'hud' ? 'HUD FORGE' : 'SCREEN LAYOUT'}</span><strong>{screenMeta.label}</strong></div></header>
      {screen === 'hud' ? <HudForgeInspector layout={hudLayout} selected={selectedHudModule} onSelect={setSelectedHudModule} onChange={setHudLayout}/>
        : screenLayout ? <UiScreenForgeInspector
          layout={screenLayout}
          selectedElementId={selectedElementId}
          onSelectElement={(id) => setSelectedElementByScreen((current) => ({ ...current, [screenLayout.id]: id }))}
          onChange={(next) => updateScreenLayout(screenLayout.id, next)}
        /> : null}

      <div className="uiforge-actions ui-v2-actions">
        <button onClick={() => loadPreset(presetId)}><RotateCcw size={14}/> Reset theme</button>
        <button onClick={exportUi}><Download size={14}/> Export UI JSON</button>
        <button className="primary" disabled={!workspace} onClick={saveUi}><Save size={14}/> Save to Skillbound</button>
      </div>
      <div className="uiforge-project-status">{status}</div>
    </aside>
  </div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="uiforge-field"><span>{label}</span>{children}</label>
}

function Range({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="uiforge-range"><span><b>{label}</b><code>{suffix}</code></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/></label>
}

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
