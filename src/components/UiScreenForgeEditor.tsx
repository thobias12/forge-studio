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
import '../ui-screen-forge-full.css'

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
      <ElementMock screenId={layout.id} element={element}/>
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
  const frontEnd = id === 'main-menu' || id === 'load-game' || id === 'character-select' || id === 'character-creator'
  return <div className={`ui-screen-backdrop ${frontEnd ? 'front-end' : ''}`}><i/><b/></div>
}

function ElementMock({ screenId, element }: { screenId: SkillboundUiScreenLayout['id']; element: UiScreenElement }) {
  const kind = element.kind
  if (kind === 'title') return <div className="ui-mock-title"><small>SKILLBOUND</small><strong>{titleFor(screenId, element.label)}</strong></div>
  if (kind === 'character-model') return <CharacterMock screenId={screenId}/>
  if (kind === 'item-grid' && screenId === 'inventory') return <TetrisPackMock/>
  if (kind === 'item-grid' || kind === 'stash-grid') return <div className="ui-mock-item-grid">{Array.from({ length: kind === 'stash-grid' ? 30 : 20 }).map((_, index) => <i className={index % 7 === 2 || index % 11 === 4 ? 'filled' : ''} key={index}/>)}</div>
  if (kind === 'equipment') return <EquipmentMock/>
  if (kind === 'stats') return <StatsMock screenId={screenId} element={element}/>
  if (kind === 'skills') return <div className="ui-mock-skills">{Array.from({ length: 9 }).map((_, index) => <i key={index} style={{ left: `${12 + (index % 3) * 34}%`, top: `${12 + Math.floor(index / 3) * 34}%` }}>{index + 1}</i>)}</div>
  if (kind === 'map') return <div className="ui-mock-map"><i/><i/><i/><b>THE DROWNED MARCH</b></div>
  if (kind === 'quest-list') return <div className="ui-mock-list">{['Break the Bone Seal','The Hollow Vault','Ash on the Road','A Stranger in Grey'].map((item, index) => <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>)}</div>
  if (kind === 'character-cards') return <div className="ui-mock-cards">{['Thobias','Kael','Mira'].map((name, index) => <div className={index === 0 ? 'active' : ''} key={name}><i/><span><strong>{name}</strong><small>{index === 0 ? 'Vanguard · The Hollow Vault' : 'Adventurer · Drowned March'}</small></span><em>Lv. {18 - index * 4}</em></div>)}</div>
  if (kind === 'creator-options') return <CreatorOptionsMock/>
  if (kind === 'settings-list') return <SettingsMock/>
  if (kind === 'save-list') return <SaveListMock/>
  if (kind === 'item-compare') return <ItemCompareMock equipped={element.id === 'current'}/>
  if (kind === 'level-up') return <LevelUpMock/>
  if (kind === 'waypoint-list') return <WaypointMock/>
  if (kind === 'button-list') return <div className="ui-mock-buttons">{buttonLabels(element.label).map((item) => <button className={isPrimaryButton(item) ? 'primary' : ''} key={item}>{item}</button>)}</div>
  if (kind === 'vendor-list') return <div className="ui-mock-list">{['Iron Longsword · 480g','Hunter Bow · 390g','Leather Boots · 220g','Health Flask · 85g'].map((item) => <span key={item}>{item}</span>)}</div>
  if (kind === 'crafting-list') return <div className="ui-mock-list">{['Rusted Blade','Iron Ingot','Leather Grip','Crypt Sigil'].map((item) => <span key={item}>{item}</span>)}</div>
  if (kind === 'dialogue') return <div className="ui-mock-dialogue"><strong>Warden Edda</strong><p>“The vault below has not been quiet since the seal broke.”</p></div>
  if (kind === 'death-summary') return <div className="ui-mock-death"><strong>YOU HAVE FALLEN</strong><span>Level 18 · The Hollow Vault</span><small>3 enemies defeated · 2 items recovered</small></div>
  if (kind === 'tabs') return <TabsMock screenId={screenId}/>
  return <PanelMock screenId={screenId} element={element}/>
}

function TetrisPackMock() {
  const items = [
    { id: 'sword', column: 1, row: 1, width: 1, height: 3 },
    { id: 'chest', column: 3, row: 1, width: 2, height: 3 },
    { id: 'bow', column: 6, row: 1, width: 2, height: 4 },
    { id: 'helm', column: 9, row: 1, width: 2, height: 2 },
    { id: 'boots', column: 9, row: 4, width: 2, height: 2 },
    { id: 'ring', column: 12, row: 1, width: 1, height: 1 },
  ]
  return <div className="ui-mock-tetris-pack">
    {Array.from({ length: 72 }).map((_, index) =>
      <i
        className="pack-cell"
        key={index}
        style={{
          gridColumn: index % 12 + 1,
          gridRow: Math.floor(index / 12) + 1,
        }}
      />,
    )}
    {items.map((item) =>
      <b
        className={`pack-item ${item.id}`}
        key={item.id}
        style={{
          gridColumn: `${item.column} / span ${item.width}`,
          gridRow: `${item.row} / span ${item.height}`,
        }}
      >
        <span/>
      </b>,
    )}
  </div>
}

function CharacterMock({ screenId }: { screenId: SkillboundUiScreenLayout['id'] }) {
  const creator = screenId === 'character-creator'
  return <div className={`ui-mock-character ${creator ? 'creator' : ''}`}>
    <div className="character-aura"/>
    <i className="head"/><i className="neck"/><i className="body"/><i className="arm left"/><i className="arm right"/><i className="leg left"/><i className="leg right"/>
    <div className="character-base"/>
    <strong>{creator ? 'BODY PREVIEW · FORGEHUMANOIDV1' : 'Lv. 18 · Vanguard'}</strong>
  </div>
}

function EquipmentMock() {
  const slots = [['helm','Helmet'],['amulet','Amulet'],['weapon','Weapon'],['chest','Chest'],['offhand','Offhand'],['gloves','Gloves'],['legs','Legs'],['ring','Ring'],['boots','Boots']]
  return <div className="ui-mock-equipment"><div className="equipment-paperdoll"><i className="head"/><i className="torso"/><i className="legs"/></div>{slots.map(([slot,label]) => <span className={`equip-${slot}`} key={slot}><b>{label}</b><small>{slot === 'weapon' ? 'Rusted Sword' : 'Empty'}</small></span>)}</div>
}

function StatsMock({ screenId, element }: { screenId: SkillboundUiScreenLayout['id']; element: UiScreenElement }) {
  const inventory = screenId === 'inventory'
  const defense = /defense|resist/i.test(`${element.id} ${element.label}`)
  const rows = inventory
    ? [['Primary Attack','24'],['Gear Attack','7'],['Defense','18'],['Health','120 / 120'],['Skill Power','34'],['Move Speed','6.0'],['Gear Power','39']]
    : defense
      ? [['Armor','642'],['Block','12%'],['Dodge','9%'],['Fire','62%'],['Cold','48%'],['Shadow','36%']]
      : [['Damage','1,284'],['Attack Speed','1.42/s'],['Critical Chance','18.5%'],['Strength','46'],['Dexterity','22'],['Vitality','51']]
  return <div className="ui-mock-stats"><header>{inventory ? 'CHARACTER STATS' : defense ? 'DEFENSE & RESISTANCES' : 'OFFENSE & ATTRIBUTES'}</header>{rows.map(([label,value]) => <span key={label}><b>{label}</b><em>{value}</em></span>)}</div>
}

function CreatorOptionsMock() {
  return <div className="ui-mock-creator-options"><div className="creator-tabs">{['Identity','Body','Face','Hair','Skin'].map((item,index) => <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>)}</div><label><b>Name</b><span>Thobias</span></label><label><b>Body type</b><span>Adventurer</span></label><label><b>Height</b><i><em style={{ width: '58%' }}/></i></label><label><b>Build</b><i><em style={{ width: '44%' }}/></i></label><label><b>Skin tone</b><div className="creator-swatches"><i/><i/><i/><i/></div></label><label><b>Origin</b><span>Drowned March</span></label></div>
}

function SettingsMock() {
  const settings = [['Resolution','2560 × 1440'],['Display Mode','Borderless'],['Quality','High'],['Master Volume','78%'],['Combat Text','On'],['Damage Numbers','On'],['Screen Shake','65%'],['UI Scale','100%']]
  return <div className="ui-mock-settings">{settings.map(([label,value], index) => <label key={label}><span><b>{label}</b><small>{index < 3 ? 'Video' : index < 4 ? 'Audio' : 'Gameplay'}</small></span>{index === 3 || index === 6 || index === 7 ? <i><em style={{ width: value }}/></i> : <button>{value}</button>}</label>)}</div>
}

function SaveListMock() {
  return <div className="ui-mock-save-list">{[['Thobias','Vanguard · Lv. 18','The Hollow Vault · 2h 34m'],['Kael','Warden · Lv. 12','Drowned March · 1h 08m'],['Mira','Arcanist · Lv. 8','Deadwood · 42m']].map((save,index) => <div className={index === 0 ? 'active' : ''} key={save[0]}><i/><span><strong>{save[0]}</strong><b>{save[1]}</b><small>{save[2]}</small></span><em>{index === 0 ? 'TODAY' : `${index + 1}D AGO`}</em></div>)}</div>
}

function ItemCompareMock({ equipped }: { equipped: boolean }) {
  return <div className={`ui-mock-item-compare ${equipped ? 'equipped' : 'candidate'}`}><span>{equipped ? 'EQUIPPED' : 'COMPARED'}</span><div className="compare-art"><i/></div><strong>{equipped ? 'Rusted Sword' : 'Ashen Vanguard Blade'}</strong><small>{equipped ? 'Rare · 118–154 Damage' : 'Rare · 142–188 Damage'}</small><dl><div><dt>Damage</dt><dd className={!equipped ? 'gain' : ''}>{equipped ? '118–154' : '142–188 ▲'}</dd></div><div><dt>Attack Speed</dt><dd>{equipped ? '+6%' : '+12%'}</dd></div><div><dt>Strength</dt><dd className={!equipped ? 'gain' : ''}>{equipped ? '+18' : '+34 ▲'}</dd></div><div><dt>Crit</dt><dd>{equipped ? '—' : '+8%'}</dd></div></dl></div>
}

function LevelUpMock() {
  return <div className="ui-mock-level-up"><span>LEVEL UP</span><strong>19</strong><h4>VANGUARD</h4><div><b>+8</b><small>Maximum Life</small></div><div><b>+2</b><small>Attribute Points</small></div><div><b>1</b><small>Skill Point</small></div><p>New skill tier unlocked</p></div>
}

function WaypointMock() {
  return <div className="ui-mock-waypoints">{[['Drowned March','Current'],['Deadwood','Unlocked'],['Hollow Vault','Unlocked'],['Ashen Crossing','Locked'],['Old Bastion','Locked']].map(([name,state], index) => <span className={index === 0 ? 'active' : state === 'Locked' ? 'locked' : ''} key={name}><i/><b>{name}</b><small>{state}</small></span>)}</div>
}

function TabsMock({ screenId }: { screenId: SkillboundUiScreenLayout['id'] }) {
  const tabs = screenId === 'settings' ? ['Video','Audio','Controls','Gameplay','Accessibility'] : ['Stash I','Stash II','Materials','Quest']
  return <div className={`ui-mock-tabs ${screenId === 'settings' ? 'vertical' : ''}`}>{tabs.map((tab,index) => <span className={index === 0 ? 'active' : ''} key={tab}>{tab}</span>)}</div>
}

function PanelMock({ screenId, element }: { screenId: SkillboundUiScreenLayout['id']; element: UiScreenElement }) {
  if (screenId === 'inventory') return <div className="ui-mock-panel item-details"><span>SELECTED ITEM</span><strong>Ashen Vanguard Blade</strong><small>Rare · One-Handed Sword · Lv. 18</small><div className="item-art"><i/></div><b>142–188 Damage</b><p>+12% attack speed<br/>+34 strength<br/>+8% critical strike chance</p><footer>Compare · Equip</footer></div>
  if (screenId === 'character-creator') return <div className="ui-mock-panel creator-summary"><span>IDENTITY & CONFIRM</span><strong>Thobias</strong><small>Adventurer · Drowned March</small><dl><div><dt>Body</dt><dd>Adventurer</dd></div><div><dt>Voice</dt><dd>Voice 02</dd></div><div><dt>Preset</dt><dd>Custom</dd></div></dl><button>CREATE CHARACTER</button></div>
  if (screenId === 'character-select' || screenId === 'load-game') return <div className="ui-mock-panel character-summary"><span>SELECTED HERO</span><strong>Thobias</strong><small>Level 18 Vanguard</small><p>The Hollow Vault<br/>2h 34m played<br/>Last played today</p></div>
  if (screenId === 'quests') return <div className="ui-mock-panel quest-details"><span>ACTIVE QUEST</span><strong>Break the Bone Seal</strong><small>The Hollow Vault</small><p>Reach the lower sanctum and destroy the seal guarding the Vault Warden.</p><footer>Tracked</footer></div>
  if (screenId === 'skills') return <div className="ui-mock-panel"><span>SELECTED SKILL</span><strong>Soul Cleave</strong><small>Melee · Physical</small><p>128% weapon damage<br/>4.2s cooldown<br/>Hits enemies in a frontal arc.</p></div>
  return <div className="ui-mock-panel"><span>{element.label}</span><strong>Skillbound</strong><small>{screenId.replace('-', ' ')}</small><p>This panel is authored on the shared UI grid.</p></div>
}

function titleFor(screenId: SkillboundUiScreenLayout['id'], label: string) {
  const titles: Partial<Record<SkillboundUiScreenLayout['id'], string>> = {
    inventory: 'Character', character: 'Character', skills: 'Skills', map: 'World Map', quests: 'Quest Log', pause: 'Paused', settings: 'Settings',
    'main-menu': 'SKILLBOUND', 'load-game': 'Continue', 'character-select': 'Select Character', 'character-creator': 'Create Character', stash: 'Stash', vendor: 'Vendor', crafting: 'Crafting', dialogue: 'Dialogue', death: 'You Have Fallen',
    'item-compare': 'Compare Items', 'level-up': 'Level Up', waypoint: 'Waypoints',
  }
  return titles[screenId] ?? label.replace(/ Header| Logo \/ Title| Logo/g, '')
}

function buttonLabels(label: string) {
  if (label.includes('Main')) return ['CONTINUE', 'CHARACTER SELECT', 'SETTINGS', 'QUIT']
  if (label.includes('Pause')) return ['RESUME', 'INVENTORY', 'CHARACTER', 'SKILLS', 'MAP', 'QUESTS', 'SETTINGS', 'SAVE & EXIT']
  if (label.includes('Play')) return ['PLAY', '+ CREATE']
  if (label.includes('Continue Actions')) return ['CONTINUE', 'DELETE']
  if (label.includes('Apply')) return ['APPLY', 'RESET', 'BACK']
  if (label.includes('Compare Actions')) return ['EQUIP', 'CLOSE']
  if (label === 'Continue') return ['CONTINUE']
  if (label.includes('Travel')) return ['TRAVEL', 'CLOSE']
  if (label.includes('Confirm') || label.includes('Creation')) return ['CREATE CHARACTER', 'BACK']
  if (label.includes('Dialogue')) return ['Tell me more', 'Trade', 'Leave']
  if (label.includes('Respawn')) return ['RESPAWN', 'RETURN TO TOWN']
  return ['PRIMARY', 'SECONDARY', 'CANCEL']
}

function isPrimaryButton(item: string) { return ['PLAY','CREATE CHARACTER','RESUME','CONTINUE','APPLY','EQUIP','TRAVEL','RESPAWN'].includes(item) }

function GridNumber({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="ui-grid-number"><span>{label}</span><div><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))}/><small>{suffix}</small></div></label>
}
