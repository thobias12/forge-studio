import { useEffect, useMemo, useState } from 'react'
import {
  BoxSelect, ChevronRight, CircleDot, DoorOpen, Download, Gem, Grid3X3, Lightbulb,
  Map as MapIcon, MousePointer2, Network, Play, RotateCcw, Save, ShieldAlert, Skull, Sparkles,
  Spline, Square, Trash2, WandSparkles, Waypoints,
} from 'lucide-react'
import DungeonViewport, { type DungeonTool } from '../components/DungeonViewport'
import { saveAsset } from '../lib/library'
import {
  corridor, createStarterDungeon, dungeonBlob, generateDungeon, getRoomConnection, marker, room, validateDungeon,
  type DungeonMarker, type DungeonRoom, type DungeonRoomType, type DungeonTheme, type ForgeDungeonPackage,
} from '../lib/dungeonPackage'
import '../map-studio.css'

const tools: Array<{ id: DungeonTool; label: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 }, { id: 'room', label: 'Room', icon: Square },
  { id: 'corridor', label: 'Corridor', icon: Spline }, { id: 'door', label: 'Door', icon: DoorOpen },
  { id: 'enemy', label: 'Enemy', icon: Skull }, { id: 'loot', label: 'Loot', icon: Gem },
  { id: 'checkpoint', label: 'Checkpoint', icon: CircleDot }, { id: 'portal', label: 'Portal', icon: Waypoints },
  { id: 'trigger', label: 'Trigger', icon: BoxSelect }, { id: 'light', label: 'Light', icon: Lightbulb },
  { id: 'erase', label: 'Erase', icon: Trash2 },
]
const roomTypes: Array<{ id: DungeonRoomType; label: string }> = [
  { id: 'entrance', label: 'Entrance' }, { id: 'combat', label: 'Combat' }, { id: 'treasure', label: 'Treasure' },
  { id: 'elite', label: 'Elite' }, { id: 'shrine', label: 'Shrine' }, { id: 'boss', label: 'Boss' },
  { id: 'secret', label: 'Secret' }, { id: 'utility', label: 'Utility' },
]
const themes: DungeonTheme[] = ['crypt', 'castle', 'cave', 'cathedral', 'mine', 'sewer', 'void']

export default function MapStudio() {
  const [value, setValue] = useState<ForgeDungeonPackage>(() => createStarterDungeon())
  const [tool, setTool] = useState<DungeonTool>('select')
  const [roomBrush, setRoomBrush] = useState<DungeonRoomType>('combat')
  const [selectedRoomId, setSelectedRoomId] = useState<string>()
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>()
  const [corridorStartId, setCorridorStartId] = useState<string>()
  const [topDown, setTopDown] = useState(false)
  const [playtest, setPlaytest] = useState(false)
  const [flowOpen, setFlowOpen] = useState(true)
  const [status, setStatus] = useState('Select a room and drag it directly on the grid. Corridors automatically create doorway openings.')
  const validation = useMemo(() => validateDungeon(value), [value])
  const selectedRoom = value.rooms.find((item) => item.id === selectedRoomId)
  const selectedMarker = value.markers.find((item) => item.id === selectedMarkerId)

  const mutate = (next: ForgeDungeonPackage, message?: string) => {
    setValue({ ...next, updatedAt: new Date().toISOString() })
    if (message) setStatus(message)
  }

  const moveRoom = (roomId: string, x: number, z: number, freeMove: boolean) => {
    setValue((current) => {
      const existing = current.rooms.find((item) => item.id === roomId)
      if (!existing) return current
      const nextX = freeMove || !current.settings.snap ? roundTo(x, 0.1) : snap(x, current.gridSize)
      const nextZ = freeMove || !current.settings.snap ? roundTo(z, 0.1) : snap(z, current.gridSize)
      if (nextX === existing.x && nextZ === existing.z) return current
      const dx = nextX - existing.x, dz = nextZ - existing.z
      const next: ForgeDungeonPackage = {
        ...current, updatedAt: new Date().toISOString(),
        rooms: current.rooms.map((item) => item.id === roomId ? { ...item, x: nextX, z: nextZ } : item),
        markers: current.markers.map((item) => item.roomId === roomId && item.type !== 'door' ? { ...item, x: item.x + dx, z: item.z + dz } : item),
      }
      return syncDoorMarkers(next)
    })
    setStatus(freeMove ? 'Room moved freely. Release Shift to return to grid snapping.' : 'Room moved. Corridors, openings, and attached markers updated automatically.')
  }

  const deleteSelection = () => {
    if (selectedMarkerId) {
      setValue((current) => ({ ...current, markers: current.markers.filter((item) => item.id !== selectedMarkerId), updatedAt: new Date().toISOString() }))
      setSelectedMarkerId(undefined); setStatus('Marker removed.'); return
    }
    if (selectedRoomId) {
      setValue((current) => ({ ...current, rooms: current.rooms.filter((item) => item.id !== selectedRoomId), corridors: current.corridors.filter((item) => item.fromRoomId !== selectedRoomId && item.toRoomId !== selectedRoomId), markers: current.markers.filter((item) => item.roomId !== selectedRoomId), updatedAt: new Date().toISOString() }))
      setSelectedRoomId(undefined); setStatus('Room, connected corridors, doors, and attached markers removed.')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input,select,textarea')) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedRoomId || selectedMarkerId)) { event.preventDefault(); deleteSelection(); return }
      if (!selectedRoomId || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const currentRoom = value.rooms.find((item) => item.id === selectedRoomId)
      if (!currentRoom) return
      event.preventDefault()
      const step = event.shiftKey ? 0.25 : value.gridSize
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dz = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      moveRoom(currentRoom.id, currentRoom.x + dx, currentRoom.z + dz, event.shiftKey)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedRoomId, selectedMarkerId, value])

  const onGroundClick = ({ x, z }: { x: number; z: number }) => {
    const gx = snap(x, value.gridSize), gz = snap(z, value.gridSize)
    if (tool === 'room') {
      const nextRoom = room(`${titleCase(roomBrush)} Room`, roomBrush, gx, gz, roomBrush === 'boss' ? 12 : 7, roomBrush === 'boss' ? 11 : 7)
      mutate({ ...value, rooms: [...value.rooms, nextRoom] }, `${nextRoom.name} placed.`); setSelectedRoomId(nextRoom.id); setSelectedMarkerId(undefined); return
    }
    if (tool === 'door') { setStatus('Doors attach to corridor openings. With the Door tool selected, click a room that is connected to another room.'); return }
    if (isMarkerTool(tool)) {
      const nearest = nearestRoom(value.rooms, gx, gz)
      const nextMarker = marker(tool, gx, tool === 'light' ? 1.7 : 0.3, gz, nearest?.id)
      mutate({ ...value, markers: [...value.markers, nextMarker] }, `${nextMarker.name} placed.`); setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); return
    }
    setSelectedRoomId(undefined); setSelectedMarkerId(undefined)
  }

  const onRoomClick = (roomId: string) => {
    if (tool === 'erase') {
      mutate({ ...value, rooms: value.rooms.filter((item) => item.id !== roomId), corridors: value.corridors.filter((item) => item.fromRoomId !== roomId && item.toRoomId !== roomId), markers: value.markers.filter((item) => item.roomId !== roomId) }, 'Room and attached dungeon data removed.')
      setSelectedRoomId(undefined); return
    }
    if (tool === 'corridor') {
      if (!corridorStartId) { setCorridorStartId(roomId); setStatus('Corridor start selected. Click another room; doorway openings will be cut automatically.') }
      else if (corridorStartId !== roomId) {
        const exists = value.corridors.some((item) => (item.fromRoomId === corridorStartId && item.toRoomId === roomId) || (item.fromRoomId === roomId && item.toRoomId === corridorStartId))
        if (!exists) mutate({ ...value, corridors: [...value.corridors, corridor(corridorStartId, roomId)] }, 'Rooms connected. Open doorway openings were added to both walls automatically.')
        else setStatus('Those rooms are already connected.')
        setCorridorStartId(undefined)
      }
      return
    }
    if (tool === 'door') {
      const placement = findDoorPlacement(value, roomId)
      if (!placement) { setStatus('This room has no unused corridor opening. Connect it first, or remove an existing door from one of its openings.'); return }
      const nextMarker = marker('door', placement.x, 0, placement.z, roomId, 'Dungeon Door', { corridorId: placement.corridorId, yaw: placement.yaw, locked: false })
      mutate({ ...value, markers: [...value.markers, nextMarker] }, 'Door placed inside the corridor opening. It can later be locked by triggers or encounters.')
      setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); return
    }
    if (isMarkerTool(tool)) {
      const target = value.rooms.find((item) => item.id === roomId)
      if (!target) return
      const nextMarker = marker(tool, target.x, tool === 'light' ? 1.7 : 0.3, target.z, target.id)
      mutate({ ...value, markers: [...value.markers, nextMarker] }, `${nextMarker.name} added to ${target.name}.`); setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); return
    }
    setSelectedRoomId(roomId); setSelectedMarkerId(undefined); setTool('select')
  }

  const onMarkerClick = (markerId: string) => {
    if (tool === 'erase') { mutate({ ...value, markers: value.markers.filter((item) => item.id !== markerId) }, 'Marker removed.'); setSelectedMarkerId(undefined); return }
    setSelectedMarkerId(markerId); setSelectedRoomId(undefined); setTool('select')
  }

  const patchRoom = (patch: Partial<DungeonRoom>) => {
    if (!selectedRoom) return
    setValue((current) => syncDoorMarkers({ ...current, rooms: current.rooms.map((item) => item.id === selectedRoom.id ? { ...item, ...patch } : item), updatedAt: new Date().toISOString() }))
  }
  const patchMarker = (patch: Partial<DungeonMarker>) => { if (selectedMarker) mutate({ ...value, markers: value.markers.map((item) => item.id === selectedMarker.id ? { ...item, ...patch } : item) }) }
  const proceduralGenerate = () => {
    const next = generateDungeon(Math.floor(Math.random() * 999999), value.theme)
    mutate(next, `${titleCase(value.theme)} dungeon generated with automatic corridor openings. Edit any room or regenerate again.`); setSelectedRoomId(next.rooms[0]?.id); setSelectedMarkerId(undefined); setCorridorStartId(undefined)
  }
  const saveToLibrary = async () => {
    await saveAsset({ name: value.name, category: 'environment', kind: 'file', mime: 'application/x-forge-dungeon+json', tags: ['map', 'dungeon', 'skillbound', value.theme], source: 'Forge Map Studio', blob: dungeonBlob(value) })
    setStatus(`${value.name} saved to the Shared Asset Library.`)
  }
  const exportSkillbound = () => { download(dungeonBlob(value), `${slug(value.name)}.forge-dungeon.json`); setStatus('Skillbound dungeon package exported.') }

  return (
    <div className="map-studio-page">
      <aside className="map-left-panel">
        <div className="map-panel-title"><MapIcon size={15} /> MAP STUDIO</div>
        <div className="map-mode-card"><span>CREATION MODE</span><strong>Dungeon Builder</strong><em>Skillbound ARPG</em></div>
        <section className="map-panel-section"><div className="map-section-title">TOOLS</div><div className="map-tools-grid">
          {tools.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? 'active' : ''} onClick={() => { setTool(id); if (id !== 'corridor') setCorridorStartId(undefined) }}><Icon size={15} /><span>{label}</span></button>)}
        </div></section>
        <section className="map-panel-section"><div className="map-section-title">ROOM PREFABS</div><div className="map-prefab-list">
          {roomTypes.map((item) => <button key={item.id} className={roomBrush === item.id ? 'active' : ''} onClick={() => { setRoomBrush(item.id); setTool('room') }}><span className={`room-dot ${item.id}`} /><strong>{item.label}</strong><em>{prefabHint(item.id)}</em></button>)}
        </div></section>
        <section className="map-panel-section compact"><div className="map-section-title">THEME</div><select value={value.theme} onChange={(e) => mutate({ ...value, theme: e.target.value as DungeonTheme })}>{themes.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><button className="map-generate-button" onClick={proceduralGenerate}><WandSparkles size={14} /> Generate Dungeon</button></section>
      </aside>

      <main className="map-workspace">
        <header className="map-toolbar"><div className="map-name-block"><span>SKILLBOUND / DUNGEON</span><input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} /></div><div className="map-toolbar-actions">
          <button className={topDown ? 'active' : ''} onClick={() => { setTopDown(!topDown); setPlaytest(false) }}><Grid3X3 size={14} /> Top</button>
          <button className={playtest ? 'active play' : ''} onClick={() => { setPlaytest(!playtest); setTopDown(false) }}><Play size={14} /> {playtest ? 'Exit Test' : 'Test'}</button>
          <button onClick={proceduralGenerate}><RotateCcw size={14} /> Regenerate</button><button onClick={() => void saveToLibrary()}><Save size={14} /> Save</button><button className="primary" onClick={exportSkillbound}><Download size={14} /> Export Skillbound</button>
        </div></header>
        <div className="map-viewport-wrap">
          <DungeonViewport value={value} tool={tool} selectedRoomId={selectedRoomId} selectedMarkerId={selectedMarkerId} corridorStartId={corridorStartId} topDown={topDown} playtest={playtest} onGroundClick={onGroundClick} onRoomClick={onRoomClick} onMarkerClick={onMarkerClick} onRoomMove={moveRoom} />
          <div className="map-viewport-hud top-left"><strong>{titleCase(tool)}</strong><span>{toolHint(tool, corridorStartId)}</span></div>
          <div className="map-viewport-hud bottom-left"><span>{value.rooms.length} rooms</span><b>·</b><span>{value.corridors.length} corridors / openings</span><b>·</b><span>{value.markers.length} gameplay markers</span></div>
          <div className={`map-validation-chip ${validation.ok ? 'ok' : 'warning'}`}>{validation.ok ? <Sparkles size={13} /> : <ShieldAlert size={13} />}{validation.ok ? 'Dungeon valid' : `${validation.warnings.length} warning${validation.warnings.length === 1 ? '' : 's'}`}</div>
        </div>
        <section className={`map-flow ${flowOpen ? 'open' : ''}`}><button className="map-flow-header" onClick={() => setFlowOpen(!flowOpen)}><Network size={14} /><strong>DUNGEON FLOW</strong><span>{flowOpen ? 'Hide' : 'Show'}</span></button>{flowOpen && <div className="map-flow-body">{value.rooms.map((roomItem, index) => <div key={roomItem.id} className={`flow-node ${roomItem.type} ${selectedRoomId === roomItem.id ? 'selected' : ''}`} onClick={() => { setSelectedRoomId(roomItem.id); setSelectedMarkerId(undefined); setTool('select') }}><span>{roomItem.type}</span><strong>{roomItem.name}</strong>{index < value.rooms.length - 1 && <ChevronRight size={14} />}</div>)}</div>}</section>
        <footer className="map-status"><span>{status}</span><b>{validation.ok ? 'Ready for Skillbound export' : validation.warnings[0]}</b></footer>
      </main>

      <aside className="map-right-panel">
        <div className="map-panel-title"><Sparkles size={15} /> INSPECTOR</div>
        {!selectedRoom && !selectedMarker && <div className="map-empty-inspector"><MousePointer2 size={28} /><strong>Select something</strong><span>Choose a room or gameplay marker in the viewport to edit it.</span></div>}
        {selectedRoom && <RoomInspector room={selectedRoom} onPatch={patchRoom} />}{selectedMarker && <MarkerInspector marker={selectedMarker} onPatch={patchMarker} />}
        <section className="map-validation-panel"><div className="map-section-title">VALIDATION</div>{validation.ok ? <div className="validation-ok"><Sparkles size={14} /> All rooms are connected and the dungeon has an entrance and boss.</div> : validation.warnings.map((warning) => <div key={warning} className="validation-warning"><ShieldAlert size={13} /> {warning}</div>)}</section>
      </aside>
    </div>
  )
}

function RoomInspector({ room, onPatch }: { room: DungeonRoom; onPatch: (patch: Partial<DungeonRoom>) => void }) {
  return <><section className="map-inspector-section"><div className="map-section-title">ROOM</div><label>Name<input value={room.name} onChange={(e) => onPatch({ name: e.target.value })} /></label><label>Type<select value={room.type} onChange={(e) => onPatch({ type: e.target.value as DungeonRoomType })}>{roomTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></section>
    <section className="map-inspector-section"><div className="map-section-title">TRANSFORM</div><div className="map-room-summary"><strong>Drag to move</strong><span>In Select mode, drag the room directly. Grid snapping is automatic; hold Shift while dragging for free movement. Arrow keys nudge it too.</span></div><div className="map-number-grid"><NumberField label="X" value={room.x} onChange={(x) => onPatch({ x })} /><NumberField label="Z" value={room.z} onChange={(z) => onPatch({ z })} /><NumberField label="Width" value={room.width} min={3} onChange={(width) => onPatch({ width })} /><NumberField label="Depth" value={room.depth} min={3} onChange={(depth) => onPatch({ depth })} /><NumberField label="Height" value={room.height} min={2} step={0.1} onChange={(height) => onPatch({ height })} /><label>Rotation<select value={room.rotation} onChange={(e) => onPatch({ rotation: Number(e.target.value) as DungeonRoom['rotation'] })}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label></div></section>
    <section className="map-inspector-section"><div className="map-section-title">ARPG ROLE</div><div className="map-room-summary"><strong>{room.type === 'boss' ? 'Boss encounter' : room.type === 'elite' ? 'Elite encounter' : room.type === 'treasure' ? 'Reward space' : room.type === 'entrance' ? 'Dungeon start' : 'Dungeon room'}</strong><span>{room.width}×{room.depth}m footprint · {room.height.toFixed(1)}m walls</span></div></section></>
}

function MarkerInspector({ marker, onPatch }: { marker: DungeonMarker; onPatch: (patch: Partial<DungeonMarker>) => void }) {
  const data = marker.data, patchData = (key: string, value: string | number | boolean) => onPatch({ data: { ...data, [key]: value } })
  return <><section className="map-inspector-section"><div className="map-section-title">{marker.type.toUpperCase()}</div><label>Name<input value={marker.name} onChange={(e) => onPatch({ name: e.target.value })} /></label><div className="map-number-grid"><NumberField label="X" value={marker.x} onChange={(x) => onPatch({ x })} /><NumberField label="Z" value={marker.z} onChange={(z) => onPatch({ z })} /></div></section>
    {marker.type === 'door' && <section className="map-inspector-section"><div className="map-section-title">DOOR</div><div className="map-room-summary"><strong>Corridor-mounted door</strong><span>This door stays aligned with its doorway opening when either connected room moves or changes size.</span></div><label><span>Locked by default</span><select value={String(Boolean(data.locked))} onChange={(e) => patchData('locked', e.target.value === 'true')}><option value="false">No</option><option value="true">Yes</option></select></label></section>}
    {marker.type === 'enemy' && <section className="map-inspector-section"><div className="map-section-title">ENCOUNTER</div><label>Enemy family<input value={String(data.family ?? 'undead')} onChange={(e) => patchData('family', e.target.value)} /></label><NumberField label="Count" value={Number(data.count ?? 5)} min={1} step={1} onChange={(count) => patchData('count', count)} /><NumberField label="Elite chance" value={Number(data.eliteChance ?? 0.1)} min={0} step={0.05} onChange={(eliteChance) => patchData('eliteChance', eliteChance)} /></section>}
    {marker.type === 'loot' && <section className="map-inspector-section"><div className="map-section-title">LOOT</div><label>Tier<select value={String(data.tier ?? 'normal')} onChange={(e) => patchData('tier', e.target.value)}><option value="normal">Normal</option><option value="magic">Magic</option><option value="rare">Rare</option><option value="boss">Boss</option></select></label></section>}
    {marker.type === 'trigger' && <section className="map-inspector-section"><div className="map-section-title">TRIGGER</div><NumberField label="Radius" value={marker.radius ?? 2} min={0.5} step={0.25} onChange={(radius) => onPatch({ radius })} /><label>Action<select value={String(data.action ?? 'lockDoors')} onChange={(e) => patchData('action', e.target.value)}><option value="lockDoors">Lock doors + spawn wave</option><option value="unlockDoors">Unlock doors</option><option value="startBoss">Start boss encounter</option><option value="completeObjective">Complete objective</option></select></label></section>}
    {marker.type === 'light' && <section className="map-inspector-section"><div className="map-section-title">LIGHT</div><label>Color<input type="color" value={String(data.color ?? '#ffb45f')} onChange={(e) => patchData('color', e.target.value)} /></label><NumberField label="Intensity" value={Number(data.intensity ?? 2)} min={0} step={0.1} onChange={(intensity) => patchData('intensity', intensity)} /></section>}</>
}

function NumberField({ label, value, min, step = 0.5, onChange }: { label: string; value: number; min?: number; step?: number; onChange: (value: number) => void }) { return <label>{label}<input type="number" value={Number(value.toFixed(2))} min={min} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label> }
function syncDoorMarkers(value: ForgeDungeonPackage): ForgeDungeonPackage {
  const roomMap = new Map(value.rooms.map((item) => [item.id, item]))
  return { ...value, markers: value.markers.map((item) => {
    if (item.type !== 'door' || !item.roomId || typeof item.data.corridorId !== 'string') return item
    const edge = value.corridors.find((candidate) => candidate.id === item.data.corridorId), currentRoom = roomMap.get(item.roomId)
    if (!edge || !currentRoom) return item
    const otherRoomId = edge.fromRoomId === item.roomId ? edge.toRoomId : edge.fromRoomId, other = roomMap.get(otherRoomId)
    if (!other) return item
    const connection = getRoomConnection(currentRoom, other, edge.width)
    return { ...item, x: connection.x, z: connection.z, data: { ...item.data, yaw: connection.yaw } }
  }) }
}
function findDoorPlacement(value: ForgeDungeonPackage, roomId: string) {
  const currentRoom = value.rooms.find((item) => item.id === roomId)
  if (!currentRoom) return undefined
  for (const edge of value.corridors.filter((item) => item.fromRoomId === roomId || item.toRoomId === roomId)) {
    if (value.markers.some((item) => item.type === 'door' && item.roomId === roomId && item.data.corridorId === edge.id)) continue
    const otherRoomId = edge.fromRoomId === roomId ? edge.toRoomId : edge.fromRoomId, other = value.rooms.find((item) => item.id === otherRoomId)
    if (!other) continue
    return { ...getRoomConnection(currentRoom, other, edge.width), corridorId: edge.id }
  }
  return undefined
}
function nearestRoom(rooms: DungeonRoom[], x: number, z: number) { return [...rooms].sort((a, b) => distanceSq(a.x, a.z, x, z) - distanceSq(b.x, b.z, x, z))[0] }
function distanceSq(x1: number, z1: number, x2: number, z2: number) { return (x1 - x2) ** 2 + (z1 - z2) ** 2 }
function snap(value: number, grid: number) { return Math.round(value / grid) * grid }
function roundTo(value: number, increment: number) { return Math.round(value / increment) * increment }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1) }
function isMarkerTool(tool: DungeonTool): tool is Extract<DungeonTool, 'enemy' | 'loot' | 'checkpoint' | 'portal' | 'trigger' | 'light'> { return ['enemy', 'loot', 'checkpoint', 'portal', 'trigger', 'light'].includes(tool) }
function slug(value: string) { return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'skillbound-dungeon' }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
function prefabHint(type: DungeonRoomType) { return ({ entrance: 'spawn + checkpoint', combat: 'standard encounter', treasure: 'reward branch', elite: 'hard encounter', shrine: 'rest / buff', boss: 'large arena', secret: 'hidden branch', utility: 'custom space' } as const)[type] }
function toolHint(tool: DungeonTool, corridorStartId?: string) {
  if (tool === 'select') return 'Click and drag a room to move it. Hold Shift for free movement. Delete removes the selection.'
  if (tool === 'room') return 'Click the grid to place the selected room prefab.'
  if (tool === 'corridor') return corridorStartId ? 'Click the destination room. Openings are cut automatically.' : 'Click the first room, then another room. Doorway openings are automatic.'
  if (tool === 'door') return 'Click a connected room to install a door into its next unused corridor opening.'
  if (isMarkerTool(tool)) return 'Click a room or the grid to place this gameplay marker.'
  if (tool === 'erase') return 'Click a room or marker to delete it.'
  return 'Click a room or marker to inspect and edit it.'
}
