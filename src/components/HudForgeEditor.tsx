import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Eye, EyeOff, Grip, RotateCcw } from 'lucide-react'
import {
  HUD_ANCHORS,
  HUD_MODULES,
  HUD_PRESETS,
  HUD_PREVIEW_MODES,
  cloneHudPreset,
  hudModuleStyle,
  hudModuleVisibleInPreview,
  patchHudGrid,
  patchHudModule,
  patchHudPreview,
  snapHudOffset,
  type SkillboundHudLayout,
  type SkillboundHudModule,
  type SkillboundHudModuleId,
  type SkillboundHudPresetId,
} from '../lib/hudForge'
import '../hud-forge.css'
import '../hud-forge-full.css'
import '../hud-orb-polish.css'

type EditorProps = {
  layout: SkillboundHudLayout
  selected: SkillboundHudModuleId
  onSelect: (id: SkillboundHudModuleId) => void
  onChange: (layout: SkillboundHudLayout) => void
}

const SLOT_MODULES: SkillboundHudModuleId[] = ['hotbar', 'potions', 'buffs', 'debuffs', 'party', 'loot']
const ORIENTATION_MODULES: SkillboundHudModuleId[] = ['hotbar', 'potions', 'buffs', 'debuffs', 'party', 'loot']

export function HudForgeEditor({ layout, selected, onSelect, onChange }: EditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null)

  const startDrag = (event: ReactPointerEvent, id: SkillboundHudModuleId) => {
    if (event.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(id)
    const bounds = canvas.getBoundingClientRect()
    const start = layout.modules[id]
    const startX = event.clientX
    const startY = event.clientY
    const move = (next: PointerEvent) => {
      const rawX = start.offsetX + (next.clientX - startX) / Math.max(1, bounds.width) * 100
      const rawY = start.offsetY + (next.clientY - startY) / Math.max(1, bounds.height) * 100
      onChange(patchHudModule(layout, id, {
        offsetX: snapHudOffset(rawX, 'x', layout.grid),
        offsetY: snapHudOffset(rawY, 'y', layout.grid),
      }))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  return <div className={`hud-forge-editor hud-preview-${layout.preview} ${layout.grid.show ? 'hud-show-grid' : ''}`} ref={canvasRef} onPointerDown={() => onSelect(selected)} style={{ '--hud-grid-columns': layout.grid.columns, '--hud-grid-rows': layout.grid.rows } as CSSProperties}>
    <div className="hud-forge-world">
      <div className="hud-forge-vignette"/>
      <div className="hud-forge-ground"/>
      <div className="hud-forge-ruin ruin-one"/><div className="hud-forge-ruin ruin-two"/>
      <div className="hud-forge-player"><i/><b/></div>
      <div className="hud-forge-enemy enemy-one"/><div className="hud-forge-enemy enemy-two"/>
    </div>
    {layout.preview === 'low-health' && <div className="hud-low-health-vignette"/>}
    {layout.grid.show && <div className="hud-layout-grid"/>}
    <div className="hud-safe-frame"><span>SAFE AREA</span></div>
    {HUD_MODULES.map(({ id }) => {
      const module = layout.modules[id]
      const contextual = hudModuleVisibleInPreview(layout, id)
      if (!module.visible || (!contextual && selected !== id)) return null
      return <div
        key={id}
        className={`hud-module-shell module-${id} ${selected === id ? 'selected' : ''} ${!contextual ? 'context-preview' : ''}`}
        style={hudModuleStyle(module) as CSSProperties}
        onPointerDown={(event) => startDrag(event, id)}
        onClick={(event) => { event.stopPropagation(); onSelect(id) }}
      >
        <span className="hud-module-drag"><Grip size={10}/></span>
        <HudModuleMock id={id} module={module} preview={layout.preview}/>
      </div>
    })}
  </div>
}

export function HudForgeInspector({ layout, selected, onSelect, onChange }: EditorProps) {
  const current = layout.modules[selected]
  const meta = HUD_MODULES.find((entry) => entry.id === selected) ?? HUD_MODULES[0]
  const loadPreset = (id: SkillboundHudPresetId) => onChange(cloneHudPreset(id))
  const resetSelected = () => {
    const preset = cloneHudPreset(layout.preset === 'custom' ? 'classic-arpg' : layout.preset)
    onChange(patchHudModule(layout, selected, preset.modules[selected]))
  }

  return <>
    <section className="hud-inspector-section">
      <h3>Preview state</h3>
      <div className="hud-preview-state-grid">{HUD_PREVIEW_MODES.map((mode) => <button key={mode.id} className={layout.preview === mode.id ? 'active' : ''} onClick={() => onChange(patchHudPreview(layout, mode.id))}><strong>{mode.label}</strong><small>{mode.detail}</small></button>)}</div>
    </section>

    <section className="hud-inspector-section">
      <h3>HUD layout preset</h3>
      <div className="hud-preset-grid">{HUD_PRESETS.map((preset) => <button key={preset.id} className={layout.preset === preset.id ? 'active' : ''} onClick={() => loadPreset(preset.id)}><strong>{preset.label}</strong><small>{preset.detail}</small></button>)}</div>
    </section>

    <section className="hud-inspector-section">
      <h3>Placement grid</h3>
      <div className="hud-grid-preset-row"><button onClick={() => onChange(patchHudGrid(layout, { columns: 16, rows: 9 }))}>16×9</button><button onClick={() => onChange(patchHudGrid(layout, { columns: 24, rows: 14 }))}>24×14</button><button onClick={() => onChange(patchHudGrid(layout, { columns: 32, rows: 18 }))}>32×18</button></div>
      <label className="hud-field"><span>Columns</span><input type="number" min={8} max={48} value={layout.grid.columns} onChange={(event) => onChange(patchHudGrid(layout, { columns: Number(event.target.value) }))}/></label>
      <label className="hud-field"><span>Rows</span><input type="number" min={6} max={30} value={layout.grid.rows} onChange={(event) => onChange(patchHudGrid(layout, { rows: Number(event.target.value) }))}/></label>
      <label className="hud-visible-switch"><input type="checkbox" checked={layout.grid.snap} onChange={(event) => onChange(patchHudGrid(layout, { snap: event.target.checked }))}/><span>Snap dragged modules to grid</span></label>
      <label className="hud-visible-switch"><input type="checkbox" checked={layout.grid.show} onChange={(event) => onChange(patchHudGrid(layout, { show: event.target.checked }))}/><span>Show placement grid</span></label>
    </section>

    <section className="hud-inspector-section">
      <div className="hud-inspector-heading"><div><h3>HUD modules</h3><small>Every module can now be positioned and resized independently.</small></div></div>
      <div className="hud-module-list">{HUD_MODULES.map((module) => {
        const value = layout.modules[module.id]
        return <div key={module.id} className={`hud-module-row ${selected === module.id ? 'active' : ''}`}>
          <button className="hud-module-main" onClick={() => onSelect(module.id)}><span><strong>{module.label}</strong><small>{module.detail}</small></span><em className={module.runtime === 'Live' ? 'live' : ''}>{module.runtime}</em></button>
          <button className="hud-visibility" title={value.visible ? 'Hide module' : 'Show module'} onClick={() => onChange(patchHudModule(layout, module.id, { visible: !value.visible }))}>{value.visible ? <Eye size={13}/> : <EyeOff size={13}/>}</button>
        </div>
      })}</div>
    </section>

    <section className="hud-inspector-section selected-module">
      <div className="hud-selected-title"><div><span>SELECTED MODULE</span><strong>{meta.label}</strong></div><button onClick={resetSelected} title="Reset this module to the current preset"><RotateCcw size={13}/></button></div>
      <label className="hud-field"><span>Anchor</span><select value={current.anchor} onChange={(event) => onChange(patchHudModule(layout, selected, { anchor: event.target.value as typeof current.anchor }))}>{HUD_ANCHORS.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}</select></label>
      <HudRange label="Horizontal offset" value={current.offsetX} min={-40} max={40} step={.1} suffix={`${current.offsetX.toFixed(1)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { offsetX: snapHudOffset(value, 'x', layout.grid) }))}/>
      <HudRange label="Vertical offset" value={current.offsetY} min={-40} max={40} step={.1} suffix={`${current.offsetY.toFixed(1)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { offsetY: snapHudOffset(value, 'y', layout.grid) }))}/>
      <div className="hud-size-group">
        <span>SIZE</span>
        <HudRange label="Overall scale" value={current.scale} min={.25} max={2.5} step={.01} suffix={`${Math.round(current.scale * 100)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { scale: value }))}/>
        <HudRange label="Width" value={current.widthScale} min={.4} max={2.5} step={.01} suffix={`${Math.round(current.widthScale * 100)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { widthScale: value }))}/>
        <HudRange label="Height" value={current.heightScale} min={.4} max={2.5} step={.01} suffix={`${Math.round(current.heightScale * 100)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { heightScale: value }))}/>
      </div>
      <HudRange label="Opacity" value={current.opacity} min={.2} max={1} step={.01} suffix={`${Math.round(current.opacity * 100)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { opacity: value }))}/>
      <label className="hud-field"><span>Display</span><select value={current.displayMode} onChange={(event) => onChange(patchHudModule(layout, selected, { displayMode: event.target.value as SkillboundHudModule['displayMode'] }))}><option value="orb">Orb</option><option value="bar">Bar</option><option value="compact">Compact</option><option value="icons">Icons</option><option value="list">List</option></select></label>
      {ORIENTATION_MODULES.includes(selected) && <label className="hud-field"><span>Direction</span><select value={current.orientation} onChange={(event) => onChange(patchHudModule(layout, selected, { orientation: event.target.value as SkillboundHudModule['orientation'] }))}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>}
      {SLOT_MODULES.includes(selected) && <HudRange label="Slots / entries" value={current.slotCount} min={1} max={12} step={1} suffix={`${current.slotCount}`} onChange={(value) => onChange(patchHudModule(layout, selected, { slotCount: Math.round(value) }))}/>} 
      <label className="hud-field"><span>Visibility rule</span><select value={current.visibilityRule} onChange={(event) => onChange(patchHudModule(layout, selected, { visibilityRule: event.target.value as SkillboundHudModule['visibilityRule'] }))}><option value="always">Always</option><option value="combat">In combat</option><option value="context">Context only</option></select></label>
      <label className="hud-visible-switch"><input type="checkbox" checked={current.showNumbers} onChange={(event) => onChange(patchHudModule(layout, selected, { showNumbers: event.target.checked }))}/><span>Show numeric values / timers</span></label>
      <label className="hud-visible-switch"><input type="checkbox" checked={current.showLabels} onChange={(event) => onChange(patchHudModule(layout, selected, { showLabels: event.target.checked }))}/><span>Show text labels</span></label>
      <label className="hud-visible-switch"><input type="checkbox" checked={current.visible} onChange={(event) => onChange(patchHudModule(layout, selected, { visible: event.target.checked }))}/><span>Enabled in Skillbound UI</span></label>
    </section>
  </>
}

function HudModuleMock({ id, module, preview }: { id: SkillboundHudModuleId; module: SkillboundHudModule; preview: SkillboundHudLayout['preview'] }) {
  const critical = preview === 'low-health'
  if (id === 'health') return <div className={`hud-preview-orb life display-${module.displayMode}`}><div className="orb-liquid" style={{ '--orb-fill': critical ? '24%' : '78%' } as CSSProperties}/><strong>{module.showNumbers ? critical ? '214' : '1,248' : ''}</strong>{module.showLabels && <small>Health</small>}</div>
  if (id === 'resource') return <div className={`hud-preview-orb resource display-${module.displayMode}`}><div className="orb-liquid" style={{ '--orb-fill': '68%' } as CSSProperties}/><strong>{module.showNumbers ? '462' : ''}</strong>{module.showLabels && <small>Mana</small>}</div>
  if (id === 'hotbar') return <div className={`hud-preview-hotbar ${module.orientation}`}>{Array.from({ length: module.slotCount }).map((_, index) => { const key = ['LMB','Q','W','E','R','SPACE'][index] ?? `${index + 1}`; return <div key={index} className={`skill-${index}`}><kbd>{key}</kbd><i/><span>{module.showLabels ? ['Attack','Soul Cleave','Grave Step','Ward','Nova','Dodge'][index] ?? 'Skill' : ''}</span>{module.showNumbers && index === 1 ? <em>2.4</em> : null}</div>})}</div>
  if (id === 'potions') return <div className={`hud-preview-potions ${module.orientation}`}>{Array.from({ length: module.slotCount }).map((_, index) => <div key={index}><kbd>{index + 1}</kbd><i className={index % 2 ? 'mana' : 'life'}/>{module.showNumbers && <small>{index === 0 ? '3' : '5'}</small>}</div>)}</div>
  if (id === 'xp') return <div className="hud-preview-xp"><span><b>LV 18</b>{module.showLabels && <em>VANGUARD</em>}{module.showNumbers && <small>64%</small>}</span><i><b style={{ width: '64%' }}/></i></div>
  if (id === 'gold') return <div className="hud-preview-gold"><i/><span><strong>{module.showNumbers ? '12,840' : ''}</strong>{module.showLabels && <small>Gold</small>}</span></div>
  if (id === 'minimap') return <div className="hud-preview-minimap"><div className="map-path a"/><div className="map-path b"/><i className="player"/><i className="objective"/><i className="portal"/>{module.showLabels && <strong>DROWNED MARCH</strong>}</div>
  if (id === 'objective') return <div className="hud-preview-objective"><span>OBJECTIVE</span><strong>Break the Bone Seal</strong>{module.showLabels && <small>Reach the lower sanctum · 2/3</small>}</div>
  if (id === 'buffs' || id === 'debuffs') return <div className={`hud-preview-status ${id} ${module.orientation}`}>{Array.from({ length: Math.min(module.slotCount, 8) }).map((_, index) => <div key={index}><i/>{module.showNumbers && <small>{8 + index}s</small>}</div>)}</div>
  if (id === 'party') return <div className={`hud-preview-party ${module.orientation}`}>{Array.from({ length: Math.min(module.slotCount, 4) }).map((_, index) => <div key={index}><i/><span><strong>{['Thobias','Mira','Kael','Edda'][index]}</strong><b><em style={{ width: `${88 - index * 13}%` }}/></b></span>{module.showNumbers && <small>18</small>}</div>)}</div>
  if (id === 'target') return <div className="hud-preview-target"><div><strong>Crypt Wretch</strong>{module.showNumbers && <span>348 / 420</span>}</div><i><b style={{ width: '82%' }}/></i>{module.showLabels && <small>Lv. 17 · Undead</small>}</div>
  if (id === 'boss') return <div className="hud-preview-target boss"><div><strong>THE VAULT WARDEN</strong>{module.showNumbers && <span>6,840 / 9,200</span>}</div><i><b style={{ width: '74%' }}/></i>{module.showLabels && <small>PHASE II · BONE AEGIS</small>}</div>
  if (id === 'cast') return <div className="hud-preview-cast"><span>{module.showLabels ? 'SOUL CLEAVE' : ''}{module.showNumbers && <small>0.7s</small>}</span><i><b style={{ width: '68%' }}/></i></div>
  if (id === 'interaction') return <div className="hud-preview-interaction"><kbd>E</kbd><strong>{module.showLabels ? 'Enter Hollow Vault' : 'Interact'}</strong></div>
  if (id === 'loot') return <div className={`hud-preview-feed ${module.orientation}`}>{Array.from({ length: Math.min(module.slotCount, 4) }).map((_, index) => <div key={index}><i/><span><strong>{['Rusted Sword','Crypt Sigil','42 Gold','Health Flask'][index]}</strong>{module.showLabels && <small>{index < 2 ? 'Rare pickup' : 'Collected'}</small>}</span></div>)}</div>
  if (id === 'combatText') return <div className="hud-preview-combat-text"><strong>1,284</strong><b>CRIT 2,117</b><small>+186</small></div>
  return <div className="hud-preview-inventory"><header><span>INVENTORY</span><small>2 items</small></header><div><i/><span><strong>Rusted Sword</strong><small>Rare weapon</small></span><em>Equipped</em></div><div><i/><span><strong>Crypt Key</strong><small>Quest item</small></span><em>Use</em></div></div>
}

function HudRange({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="hud-range"><span><b>{label}</b><code>{suffix}</code></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/></label>
}
