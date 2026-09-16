import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Eye, EyeOff, Grip, RotateCcw } from 'lucide-react'
import {
  HUD_ANCHORS,
  HUD_MODULES,
  HUD_PRESETS,
  cloneHudPreset,
  hudModuleStyle,
  patchHudGrid,
  patchHudModule,
  snapHudOffset,
  type SkillboundHudLayout,
  type SkillboundHudModuleId,
  type SkillboundHudPresetId,
} from '../lib/hudForge'
import '../hud-forge.css'

type EditorProps = {
  layout: SkillboundHudLayout
  selected: SkillboundHudModuleId
  onSelect: (id: SkillboundHudModuleId) => void
  onChange: (layout: SkillboundHudLayout) => void
}

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

  return <div className={`hud-forge-editor ${layout.grid.show ? 'hud-show-grid' : ''}`} ref={canvasRef} onPointerDown={() => onSelect(selected)} style={{ '--hud-grid-columns': layout.grid.columns, '--hud-grid-rows': layout.grid.rows } as CSSProperties}>
    <div className="hud-forge-world">
      <div className="hud-forge-vignette"/>
      <div className="hud-forge-ground"/>
      <div className="hud-forge-ruin ruin-one"/><div className="hud-forge-ruin ruin-two"/>
      <div className="hud-forge-player"><i/><b/></div>
      <div className="hud-forge-enemy enemy-one"/><div className="hud-forge-enemy enemy-two"/>
    </div>
    {layout.grid.show && <div className="hud-layout-grid"/>}
    <div className="hud-safe-frame"><span>SAFE AREA</span></div>
    {HUD_MODULES.map(({ id }) => {
      const module = layout.modules[id]
      if (!module.visible) return null
      return <div
        key={id}
        className={`hud-module-shell module-${id} ${selected === id ? 'selected' : ''}`}
        style={hudModuleStyle(module) as CSSProperties}
        onPointerDown={(event) => startDrag(event, id)}
        onClick={(event) => { event.stopPropagation(); onSelect(id) }}
      >
        <span className="hud-module-drag"><Grip size={10}/></span>
        <HudModuleMock id={id}/>
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
      <div className="hud-inspector-heading"><div><h3>HUD modules</h3><small>Modules keep responsive anchors, but dragging can now snap to a grid.</small></div></div>
      <div className="hud-module-list">{HUD_MODULES.map((module) => {
        const value = layout.modules[module.id]
        return <div key={module.id} className={`hud-module-row ${selected === module.id ? 'active' : ''}`}>
          <button className="hud-module-main" onClick={() => onSelect(module.id)}><span><strong>{module.label}</strong><small>{module.detail}</small></span><em>{module.runtime}</em></button>
          <button className="hud-visibility" title={value.visible ? 'Hide module' : 'Show module'} onClick={() => onChange(patchHudModule(layout, module.id, { visible: !value.visible }))}>{value.visible ? <Eye size={13}/> : <EyeOff size={13}/>}</button>
        </div>
      })}</div>
    </section>

    <section className="hud-inspector-section selected-module">
      <div className="hud-selected-title"><div><span>SELECTED MODULE</span><strong>{meta.label}</strong></div><button onClick={resetSelected} title="Reset this module to the current preset"><RotateCcw size={13}/></button></div>
      <label className="hud-field"><span>Anchor</span><select value={current.anchor} onChange={(event) => onChange(patchHudModule(layout, selected, { anchor: event.target.value as typeof current.anchor }))}>{HUD_ANCHORS.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}</select></label>
      <HudRange label="Horizontal offset" value={current.offsetX} min={-40} max={40} step={.1} suffix={`${current.offsetX.toFixed(1)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { offsetX: snapHudOffset(value, 'x', layout.grid) }))}/>
      <HudRange label="Vertical offset" value={current.offsetY} min={-40} max={40} step={.1} suffix={`${current.offsetY.toFixed(1)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { offsetY: snapHudOffset(value, 'y', layout.grid) }))}/>
      <HudRange label="Module scale" value={current.scale} min={.55} max={1.7} step={.01} suffix={`${Math.round(current.scale * 100)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { scale: value }))}/>
      <HudRange label="Opacity" value={current.opacity} min={.2} max={1} step={.01} suffix={`${Math.round(current.opacity * 100)}%`} onChange={(value) => onChange(patchHudModule(layout, selected, { opacity: value }))}/>
      <label className="hud-visible-switch"><input type="checkbox" checked={current.visible} onChange={(event) => onChange(patchHudModule(layout, selected, { visible: event.target.checked }))}/><span>Visible in Skillbound runtime</span></label>
    </section>
  </>
}

function HudModuleMock({ id }: { id: SkillboundHudModuleId }) {
  if (id === 'health') return <div className="hud-preview-orb"><div/><strong>1,248</strong><small>Life</small></div>
  if (id === 'hotbar') return <div className="hud-preview-hotbar">{['LMB','Q','SPACE'].map((key, index) => <div key={key} className={`skill-${index}`}><kbd>{key}</kbd><i/><span>{index === 0 ? 'Attack' : index === 1 ? 'Soul Cleave' : 'Dodge'}</span></div>)}</div>
  if (id === 'objective') return <div className="hud-preview-objective"><span>OBJECTIVE</span><strong>Break the Bone Seal</strong><small>Reach the lower sanctum</small></div>
  if (id === 'target') return <div className="hud-preview-target"><div><strong>Crypt Wretch</strong><span>348 / 420</span></div><i><b style={{ width: '82%' }}/></i></div>
  if (id === 'boss') return <div className="hud-preview-target boss"><div><strong>THE VAULT WARDEN</strong><span>6,840 / 9,200</span></div><i><b style={{ width: '74%' }}/></i></div>
  if (id === 'interaction') return <div className="hud-preview-interaction"><kbd>E</kbd><strong>Enter Hollow Vault</strong></div>
  if (id === 'loot') return <div className="hud-preview-loot">Rusted Sword added to inventory</div>
  return <div className="hud-preview-inventory"><header><span>INVENTORY</span><small>2 items</small></header><div><i/><span><strong>Rusted Sword</strong><small>Rare weapon</small></span><em>Equipped</em></div><div><i/><span><strong>Crypt Key</strong><small>Quest item</small></span><em>Use</em></div></div>
}

function HudRange({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="hud-range"><span><b>{label}</b><code>{suffix}</code></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/></label>
}
