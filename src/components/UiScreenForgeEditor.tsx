import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Eye, EyeOff, Grid3X3, Lock, LockOpen } from 'lucide-react'
import {
  gridPlacementStyle,
  moveElement,
  patchScreenElement,
  patchScreenGrid,
  resizeElement,
  type SkillboundUiScreenLayout,
  type UiScreenElement,
} from '../lib/uiScreenForge'
import '../ui-screen-forge.css'

type Props = {
  layout: SkillboundUiScreenLayout
  selectedElementId: string
  onSelectElement: (id: string) => void
  onChange: (layout: SkillboundUiScreenLayout) => void
}

export function UiScreenForgeEditor({ layout, selectedElementId, onSelectElement, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  const beginDrag = (event: ReactPointerEvent, element: UiScreenElement) => {
    if (event.button !== 0 || element.locked) return
    const host = hostRef.current
    if (!host) return
    event.preventDefault()
    event.stopPropagation()
    onSelectElement(element.id)
    const bounds = host.getBoundingClientRect()
    const cellWidth = bounds.width / layout.grid.columns
    const cellHeight = bounds.height / layout.grid.rows
    const startX = event.clientX
    const startY = event.clientY
    const startColumn = element.placement.column
    const startRow = element.placement.row
    const move = (next: PointerEvent) => {
      const dx = Math.round((next.clientX - startX) / Math.max(1, cellWidth))
      const dy = Math.round((next.clientY - startY) / Math.max(1, cellHeight))
      onChange(moveElement(layout, element.id, startColumn + dx, startRow + dy))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  return <div
    ref={hostRef}
    className={`ui-screen-grid-canvas ${layout.grid.showGrid ? 'show-grid' : ''}`}
    style={{
      gridTemplateColumns: `repeat(${layout.grid.columns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${layout.grid.rows}, minmax(0, 1fr))`,
      gap: `${layout.grid.gap}%`,
      padding: `${layout.grid.margin}%`,
    }}
  >
    <ScreenBackdrop id={layout.id}/>
    {layout.elements.filter((element) => element.visible).map((element) => <div
      key={element.id}
      className={`ui-grid-element ${selectedElementId === element.id ? 'selected' : ''} ${element.locked ? 'locked' : ''}`}
      style={gridPlacementStyle(element.placement)}
      onPointerDown={(event) => beginDrag(event, element)}
      onClick={(event) => { event.stopPropagation(); onSelectElement(element.id) }}
    >
      <span className="ui-grid-element-label">{element.label}{element.locked ? <Lock size={9}/> : null}</span>
      <ElementMock element={element}/>
    </div>)}
  </div>
}

export function UiScreenForgeInspector({ layout, selectedElementId, onSelectElement, onChange }: Props) {
  const selected = layout.elements.find((element) => element.id === selectedElementId) ?? layout.elements[0]

  return <div className="ui-screen-inspector">
    <section>
      <div className="ui-inspector-title"><Grid3X3 size={14}/><div><span>GRID SYSTEM</span><strong>{layout.name}</strong></div></div>
      <div className="ui-grid-preset-row">
        <button onClick={() => onChange(patchScreenGrid(layout, { columns: 8, rows: 6 }))}>8×6</button>
        <button onClick={() => onChange(patchScreenGrid(layout, { columns: 12, rows: 8 }))}>12×8</button>
        <button onClick={() => onChange(patchScreenGrid(layout, { columns: 16, rows: 9 }))}>16×9</button>
      </div>
      <GridNumber label="Columns" value={layout.grid.columns} min={6} max={24} onChange={(value) => onChange(patchScreenGrid(layout, { columns: value }))}/>
      <GridNumber label="Rows" value={layout.grid.rows} min={4} max={16} onChange={(value) => onChange(patchScreenGrid(layout, { rows: value }))}/>
      <GridNumber label="Gap" value={layout.grid.gap} min={0} max={3} step={.1} suffix="%" onChange={(value) => onChange(patchScreenGrid(layout, { gap: value }))}/>
      <GridNumber label="Outer margin" value={layout.grid.margin} min={0} max={6} step={.1} suffix="%" onChange={(value) => onChange(patchScreenGrid(layout, { margin: value }))}/>
      <label className="ui-grid-check"><input type="checkbox" checked={layout.grid.showGrid} onChange={(event) => onChange(patchScreenGrid(layout, { showGrid: event.target.checked }))}/><span>Show layout grid</span></label>
    </section>

    <section>
      <h3>Elements</h3>
      <div className="ui-layer-list">{layout.elements.map((element) => <div className={`ui-layer-row ${selected?.id === element.id ? 'active' : ''}`} key={element.id}>
        <button className="ui-layer-main" onClick={() => onSelectElement(element.id)}><strong>{element.label}</strong><small>{element.kind}</small></button>
        <button title={element.visible ? 'Hide' : 'Show'} onClick={() => onChange(patchScreenElement(layout, element.id, { visible: !element.visible }))}>{element.visible ? <Eye size={12}/> : <EyeOff size={12}/>}</button>
        <button title={element.locked ? 'Unlock' : 'Lock'} onClick={() => onChange(patchScreenElement(layout, element.id, { locked: !element.locked }))}>{element.locked ? <Lock size={12}/> : <LockOpen size={12}/>}</button>
      </div>)}</div>
    </section>

    {selected && <section>
      <h3>Selected · {selected.label}</h3>
      <p className="ui-grid-note">Elements are assigned to cells. Dragging moves by whole grid cells; size is controlled by column/row span.</p>
      <GridNumber label="Column" value={selected.placement.column} min={1} max={layout.grid.columns} onChange={(value) => onChange(moveElement(layout, selected.id, value, selected.placement.row))}/>
      <GridNumber label="Row" value={selected.placement.row} min={1} max={layout.grid.rows} onChange={(value) => onChange(moveElement(layout, selected.id, selected.placement.column, value))}/>
      <GridNumber label="Width" value={selected.placement.columnSpan} min={1} max={layout.grid.columns} suffix=" cols" onChange={(value) => onChange(resizeElement(layout, selected.id, value, selected.placement.rowSpan))}/>
      <GridNumber label="Height" value={selected.placement.rowSpan} min={1} max={layout.grid.rows} suffix=" rows" onChange={(value) => onChange(resizeElement(layout, selected.id, selected.placement.columnSpan, value))}/>
      <label className="ui-grid-check"><input type="checkbox" checked={selected.visible} onChange={(event) => onChange(patchScreenElement(layout, selected.id, { visible: event.target.checked }))}/><span>Visible</span></label>
      <label className="ui-grid-check"><input type="checkbox" checked={selected.locked} onChange={(event) => onChange(patchScreenElement(layout, selected.id, { locked: event.target.checked }))}/><span>Lock position</span></label>
    </section>}
  </div>
}

function ScreenBackdrop({ id }: { id: SkillboundUiScreenLayout['id'] }) {
  const frontEnd = id === 'main-menu' || id === 'character-select' || id === 'character-creator'
  return <div className={`ui-screen-backdrop ${frontEnd ? 'front-end' : ''}`}><i/><b/></div>
}

function ElementMock({ element }: { element: UiScreenElement }) {
  const kind = element.kind
  if (kind === 'title') return <div className="ui-mock-title"><small>SKILLBOUND</small><strong>{element.label.replace(/ Header| Logo \/ Title| Logo/g, '')}</strong></div>
  if (kind === 'character-model') return <div className="ui-mock-character"><i className="head"/><i className="body"/><i className="arm left"/><i className="arm right"/><i className="leg left"/><i className="leg right"/><strong>Lv. 18 Vanguard</strong></div>
  if (kind === 'item-grid' || kind === 'stash-grid') return <div className="ui-mock-item-grid">{Array.from({ length: kind === 'stash-grid' ? 30 : 20 }).map((_, index) => <i className={index % 7 === 2 || index % 11 === 4 ? 'filled' : ''} key={index}/>)}</div>
  if (kind === 'equipment') return <div className="ui-mock-equipment"><div className="paper"><i/><b/></div>{['Helm','Chest','Gloves','Legs','Boots','Weapon'].map((item) => <span key={item}>{item}</span>)}</div>
  if (kind === 'stats') return <div className="ui-mock-stats">{['Damage 1,284','Attack Speed 1.42/s','Armor 642','Crit 18.5%','Fire 62%','Shadow 36%'].map((row) => <span key={row}>{row}</span>)}</div>
  if (kind === 'skills') return <div className="ui-mock-skills">{Array.from({ length: 9 }).map((_, index) => <i key={index} style={{ left: `${12 + (index % 3) * 34}%`, top: `${12 + Math.floor(index / 3) * 34}%` }}>{index + 1}</i>)}</div>
  if (kind === 'map') return <div className="ui-mock-map"><i/><i/><i/><b>THE DROWNED MARCH</b></div>
  if (kind === 'quest-list') return <div className="ui-mock-list">{['Break the Bone Seal','The Hollow Vault','Ash on the Road','A Stranger in Grey'].map((item, index) => <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>)}</div>
  if (kind === 'character-cards') return <div className="ui-mock-cards">{['Thobias','Kael','Mira'].map((name, index) => <div className={index === 0 ? 'active' : ''} key={name}><i/><strong>{name}</strong><small>Lv. {18 - index * 4}</small></div>)}</div>
  if (kind === 'creator-options') return <div className="ui-mock-list">{['Identity','Body','Face','Hair','Skin','Voice','Origin'].map((item, index) => <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>)}</div>
  if (kind === 'button-list') return <div className="ui-mock-buttons">{buttonLabels(element.label).map((item) => <button key={item}>{item}</button>)}</div>
  if (kind === 'vendor-list') return <div className="ui-mock-list">{['Iron Longsword · 480g','Hunter Bow · 390g','Leather Boots · 220g','Health Flask · 85g'].map((item) => <span key={item}>{item}</span>)}</div>
  if (kind === 'crafting-list') return <div className="ui-mock-list">{['Rusted Blade','Iron Ingot','Leather Grip','Crypt Sigil'].map((item) => <span key={item}>{item}</span>)}</div>
  if (kind === 'dialogue') return <div className="ui-mock-dialogue"><strong>Warden Edda</strong><p>“The vault below has not been quiet since the seal broke.”</p></div>
  if (kind === 'death-summary') return <div className="ui-mock-death"><strong>YOU HAVE FALLEN</strong><span>Level 18 · The Hollow Vault</span><small>3 enemies defeated · 2 items recovered</small></div>
  if (kind === 'tabs') return <div className="ui-mock-tabs"><span>Stash I</span><span>Stash II</span><span>Materials</span><span>Quest</span></div>
  return <div className="ui-mock-panel"><span>{element.label}</span><strong>Ashen Vanguard Blade</strong><small>Rare · 142–188 Damage</small><p>+12% attack speed<br/>+34 strength</p></div>
}

function buttonLabels(label: string) {
  if (label.includes('Main')) return ['CONTINUE', 'CHARACTER SELECT', 'SETTINGS', 'QUIT']
  if (label.includes('Pause')) return ['RESUME', 'INVENTORY', 'CHARACTER', 'SKILLS', 'MAP', 'QUESTS', 'SETTINGS', 'SAVE & EXIT']
  if (label.includes('Play')) return ['PLAY', '+ CREATE']
  if (label.includes('Dialogue')) return ['Tell me more', 'Trade', 'Leave']
  if (label.includes('Respawn')) return ['RESPAWN', 'RETURN TO TOWN']
  return ['PRIMARY', 'SECONDARY', 'CANCEL']
}

function GridNumber({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="ui-grid-number"><span>{label}</span><div><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/><small>{suffix}</small></div></label>
}
