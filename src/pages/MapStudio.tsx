import { useEffect, useMemo, useState } from 'react'
import {
  Box, BoxSelect, ChevronRight, CircleDot, DoorOpen, Download, Gem, Grid3X3, Lightbulb,
  Map as MapIcon, MousePointer2, Network, Play, RotateCcw, Save, ShieldAlert, Skull, Sparkles,
  Spline, Square, Trash2, WandSparkles, Waypoints,
} from 'lucide-react'
import DungeonViewport, { type DungeonTool, type ResizeSide } from '../components/DungeonViewport'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import {
  corridor, createStarterDungeon, dungeonBlob, generateDungeon, getRoomConnection, marker, room, validateDungeon,
  type DungeonMarker, type DungeonRoom, type DungeonRoomType, type DungeonTheme, type ForgeDungeonPackage,
} from '../lib/dungeonPackage'
import {
  BUILTIN_DUNGEON_PROPS, createDungeonProp, dungeonProps,
  type DungeonProp, type DungeonWithProps, type PropLibraryAsset,
} from '../lib/dungeonProps'
import '../map-studio.css'
import '../map-studio-props.css'

const tools: Array<{ id: DungeonTool; label: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 }, { id: 'room', label: 'Room', icon: Square },
  { id: 'corridor', label: 'Corridor', icon: Spline }, { id: 'prop', label: 'Prop', icon: Box },
  { id: 'door', label: 'Door', icon: DoorOpen }, { id: 'enemy', label: 'Enemy', icon: Skull },
  { id: 'loot', label: 'Loot', icon: Gem }, { id: 'checkpoint', label: 'Checkpoint', icon: CircleDot },
  { id: 'portal', label: 'Portal', icon: Waypoints }, { id: 'trigger', label: 'Trigger', icon: BoxSelect },
  { id: 'light', label: 'Light', icon: Lightbulb }, { id: 'erase', label: 'Erase', icon: Trash2 },
]
const roomTypes: Array<{ id: DungeonRoomType; label: string }> = [
  { id: 'entrance', label: 'Entrance' }, { id: 'combat', label: 'Combat' }, { id: 'treasure', label: 'Treasure' },
  { id: 'elite', label: 'Elite' }, { id: 'shrine', label: 'Shrine' }, { id: 'boss', label: 'Boss' },
  { id: 'secret', label: 'Secret' }, { id: 'utility', label: 'Utility' },
]
const themes: DungeonTheme[] = ['crypt', 'castle', 'cave', 'cathedral', 'mine', 'sewer', 'void']
type PropBrush = { source: 'builtin' | 'library'; assetRef: string; name: string }

export default function MapStudio() {
  const [value, setValue] = useState<DungeonWithProps>(() => ({ ...createStarterDungeon(), props: [] }))
  const [tool, setTool] = useState<DungeonTool>('select')
  const [roomBrush, setRoomBrush] = useState<DungeonRoomType>('combat')
  const [propBrush, setPropBrush] = useState<PropBrush>({ source: 'builtin', assetRef: 'pillar', name: 'Stone Pillar' })
  const [libraryProps, setLibraryProps] = useState<PropLibraryAsset[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string>()
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>()
  const [selectedPropId, setSelectedPropId] = useState<string>()
  const [corridorStartId, setCorridorStartId] = useState<string>()
  const [topDown, setTopDown] = useState(false)
  const [playtest, setPlaytest] = useState(false)
  const [flowOpen, setFlowOpen] = useState(true)
  const [status, setStatus] = useState('Select rooms to drag or resize them. Use Prop to dress the dungeon with built-in or Shared Library assets.')
  const validation = useMemo(() => validateDungeon(value), [value])
  const selectedRoom = value.rooms.find((item) => item.id === selectedRoomId)
  const selectedMarker = value.markers.find((item) => item.id === selectedMarkerId)
  const selectedProp = dungeonProps(value).find((item) => item.id === selectedPropId)

  useEffect(() => {
    let cancelled = false
    void listAssets().then((items) => {
      if (cancelled) return
      setLibraryProps(items.filter(isMapPropAsset).map((item) => ({ id: item.id, name: item.name, blob: item.blob })))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const mutate = (next: DungeonWithProps, message?: string) => {
    setValue({ ...next, updatedAt: new Date().toISOString() })
    if (message) setStatus(message)
  }
  const clearSelection = () => { setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setSelectedPropId(undefined) }

  const moveRoom = (roomId: string, x: number, z: number, freeMove: boolean) => {
    setValue((current) => {
      const existing = current.rooms.find((item) => item.id === roomId)
      if (!existing) return current
      const nextX = freeMove || !current.settings.snap ? roundTo(x, 0.1) : snap(x, current.gridSize)
      const nextZ = freeMove || !current.settings.snap ? roundTo(z, 0.1) : snap(z, current.gridSize)
      if (nextX === existing.x && nextZ === existing.z) return current
      const dx = nextX - existing.x, dz = nextZ - existing.z
      const next: DungeonWithProps = {
        ...current,
        updatedAt: new Date().toISOString(),
        rooms: current.rooms.map((item) => item.id === roomId ? { ...item, x: nextX, z: nextZ } : item),
        markers: current.markers.map((item) => item.roomId === roomId && item.type !== 'door' ? { ...item, x: item.x + dx, z: item.z + dz } : item),
        props: dungeonProps(current).map((item) => item.roomId === roomId ? { ...item, x: item.x + dx, z: item.z + dz } : item),
      }
      return syncDoorMarkers(next)
    })
    setStatus('Room moved. Corridors, openings, attached props, and gameplay markers updated automatically.')
  }

  const resizeRoom = (roomId: string, side: ResizeSide, worldX: number, worldZ: number, freeMove: boolean) => {
    setValue((current) => {
      const existing = current.rooms.find((item) => item.id === roomId)
      if (!existing) return current
      const angle = THREE_RAD(existing.rotation), cos = Math.cos(angle), sin = Math.sin(angle)
      const dx = worldX - existing.x, dz = worldZ - existing.z
      let lx = dx * cos - dz * sin, lz = dx * sin + dz * cos
      const step = freeMove || !current.settings.snap ? 0.1 : current.gridSize
      lx = roundTo(lx, step); lz = roundTo(lz, step)
      let width = existing.width, depth = existing.depth, shiftX = 0, shiftZ = 0
      if (side === 'east') { const fixed = -existing.width / 2, boundary = Math.max(fixed + 3, lx); width = boundary - fixed; shiftX = (boundary + fixed) / 2 }
      if (side === 'west') { const fixed = existing.width / 2, boundary = Math.min(fixed - 3, lx); width = fixed - boundary; shiftX = (boundary + fixed) / 2 }
      if (side === 'south') { const fixed = -existing.depth / 2, boundary = Math.max(fixed + 3, lz); depth = boundary - fixed; shiftZ = (boundary + fixed) / 2 }
      if (side === 'north') { const fixed = existing.depth / 2, boundary = Math.min(fixed - 3, lz); depth = fixed - boundary; shiftZ = (boundary + fixed) / 2 }
      width = Math.max(3, roundTo(width, step)); depth = Math.max(3, roundTo(depth, step))
      const worldShiftX = shiftX * cos + shiftZ * sin
      const worldShiftZ = -shiftX * sin + shiftZ * cos
      const nextRoom = { ...existing, x: roundTo(existing.x + worldShiftX, 0.1), z: roundTo(existing.z + worldShiftZ, 0.1), width, depth }
      const centerDx = nextRoom.x - existing.x, centerDz = nextRoom.z - existing.z
      return syncDoorMarkers({
        ...current,
        rooms: current.rooms.map((item) => item.id === roomId ? nextRoom : item),
        markers: current.markers.map((item) => item.roomId === roomId && item.type !== 'door' ? { ...item, x: item.x + centerDx, z: item.z + centerDz } : item),
        props: dungeonProps(current).map((item) => item.roomId === roomId ? { ...item, x: item.x + centerDx, z: item.z + centerDz } : item),
        updatedAt: new Date().toISOString(),
      })
    })
    setStatus('Room resized. Opposite wall stayed fixed and connected corridors/openings were recalculated.')
  }

  const moveProp = (propId: string, x: number, z: number, freeMove: boolean) => {
    setValue((current) => ({
      ...current,
      props: dungeonProps(current).map((item) => item.id === propId ? { ...item, x: freeMove ? roundTo(x, 0.1) : snap(x, current.gridSize), z: freeMove ? roundTo(z, 0.1) : snap(z, current.gridSize), roomId: nearestRoom(current.rooms, x, z)?.id } : item),
      updatedAt: new Date().toISOString(),
    }))
  }

  const deleteSelection = () => {
    if (selectedPropId) { setValue((current) => ({ ...current, props: dungeonProps(current).filter((item) => item.id !== selectedPropId), updatedAt: new Date().toISOString() })); setSelectedPropId(undefined); setStatus('Prop removed.'); return }
    if (selectedMarkerId) { setValue((current) => ({ ...current, markers: current.markers.filter((item) => item.id !== selectedMarkerId), updatedAt: new Date().toISOString() })); setSelectedMarkerId(undefined); setStatus('Marker removed.'); return }
    if (selectedRoomId) {
      setValue((current) => ({ ...current, rooms: current.rooms.filter((item) => item.id !== selectedRoomId), corridors: current.corridors.filter((item) => item.fromRoomId !== selectedRoomId && item.toRoomId !== selectedRoomId), markers: current.markers.filter((item) => item.roomId !== selectedRoomId), props: dungeonProps(current).filter((item) => item.roomId !== selectedRoomId), updatedAt: new Date().toISOString() }))
      setSelectedRoomId(undefined); setStatus('Room and its connected data/props removed.')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input,select,textarea') || playtest) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedRoomId || selectedMarkerId || selectedPropId)) { event.preventDefault(); deleteSelection(); return }
      if (selectedPropId && (event.key.toLowerCase() === 'q' || event.key.toLowerCase() === 'e')) {
        event.preventDefault(); const delta = event.key.toLowerCase() === 'q' ? -15 : 15
        setValue((current) => ({ ...current, props: dungeonProps(current).map((item) => item.id === selectedPropId ? { ...item, rotationY: normalizeDegrees(item.rotationY + delta) } : item), updatedAt: new Date().toISOString() })); return
      }
      if (!selectedRoomId || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
      const currentRoom = value.rooms.find((item) => item.id === selectedRoomId)
      if (!currentRoom) return
      event.preventDefault(); const step = event.shiftKey ? 0.25 : value.gridSize
      moveRoom(currentRoom.id, currentRoom.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), currentRoom.z + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0), event.shiftKey)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedRoomId, selectedMarkerId, selectedPropId, value, playtest])

  const placeProp = (x: number, z: number) => {
    const targetRoom = nearestRoom(value.rooms, x, z)
    const next = createDungeonProp({ name: propBrush.name, source: propBrush.source, assetRef: propBrush.assetRef, x: snap(x, value.gridSize), z: snap(z, value.gridSize), y: targetRoom?.floorLevel ?? 0, roomId: targetRoom?.id })
    mutate({ ...value, props: [...dungeonProps(value), next] }, `${next.name} placed. Select it to drag, rotate, scale, or change collision.`)
    setSelectedPropId(next.id); setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setTool('select')
  }

  const onGroundClick = ({ x, z }: { x: number; z: number }) => {
    const gx = snap(x, value.gridSize), gz = snap(z, value.gridSize)
    if (tool === 'prop') { placeProp(x, z); return }
    if (tool === 'room') { const nextRoom = room(`${titleCase(roomBrush)} Room`, roomBrush, gx, gz, roomBrush === 'boss' ? 12 : 7, roomBrush === 'boss' ? 11 : 7); mutate({ ...value, rooms: [...value.rooms, nextRoom] }, `${nextRoom.name} placed.`); setSelectedRoomId(nextRoom.id); setSelectedMarkerId(undefined); setSelectedPropId(undefined); return }
    if (tool === 'door') { setStatus('Doors attach to corridor openings. Click a connected room.'); return }
    if (isMarkerTool(tool)) { const nearest = nearestRoom(value.rooms, gx, gz), nextMarker = marker(tool, gx, tool === 'light' ? 1.7 : 0.3, gz, nearest?.id); mutate({ ...value, markers: [...value.markers, nextMarker] }, `${nextMarker.name} placed.`); setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); setSelectedPropId(undefined); return }
    clearSelection()
  }

  const onRoomClick = (roomId: string) => {
    if (tool === 'prop') { const target = value.rooms.find((item) => item.id === roomId); if (target) placeProp(target.x, target.z); return }
    if (tool === 'erase') { mutate({ ...value, rooms: value.rooms.filter((item) => item.id !== roomId), corridors: value.corridors.filter((item) => item.fromRoomId !== roomId && item.toRoomId !== roomId), markers: value.markers.filter((item) => item.roomId !== roomId), props: dungeonProps(value).filter((item) => item.roomId !== roomId) }, 'Room and attached dungeon data removed.'); setSelectedRoomId(undefined); return }
    if (tool === 'corridor') {
      if (!corridorStartId) { setCorridorStartId(roomId); setStatus('Corridor start selected. Click another room.') }
      else if (corridorStartId !== roomId) { const exists = value.corridors.some((item) => (item.fromRoomId === corridorStartId && item.toRoomId === roomId) || (item.fromRoomId === roomId && item.toRoomId === corridorStartId)); if (!exists) mutate({ ...value, corridors: [...value.corridors, corridor(corridorStartId, roomId)] }, 'Rooms connected. Doorway openings were cut automatically.'); else setStatus('Those rooms are already connected.'); setCorridorStartId(undefined) }
      return
    }
    if (tool === 'door') { const placement = findDoorPlacement(value, roomId); if (!placement) { setStatus('This room has no unused corridor opening.'); return } const nextMarker = marker('door', placement.x, 0, placement.z, roomId, 'Dungeon Door', { corridorId: placement.corridorId, yaw: placement.yaw, locked: false }); mutate({ ...value, markers: [...value.markers, nextMarker] }, 'Door installed in the corridor opening.'); setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); setSelectedPropId(undefined); return }
    if (isMarkerTool(tool)) { const target = value.rooms.find((item) => item.id === roomId); if (!target) return; const nextMarker = marker(tool, target.x, tool === 'light' ? 1.7 : 0.3, target.z, target.id); mutate({ ...value, markers: [...value.markers, nextMarker] }, `${nextMarker.name} added to ${target.name}.`); setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); setSelectedPropId(undefined); return }
    setSelectedRoomId(roomId); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setTool('select')
  }

  const onMarkerClick = (markerId: string) => { if (tool === 'erase') { mutate({ ...value, markers: value.markers.filter((item) => item.id !== markerId) }, 'Marker removed.'); setSelectedMarkerId(undefined); return } setSelectedMarkerId(markerId); setSelectedRoomId(undefined); setSelectedPropId(undefined); setTool('select') }
  const onPropClick = (propId: string) => { if (tool === 'erase') { mutate({ ...value, props: dungeonProps(value).filter((item) => item.id !== propId) }, 'Prop removed.'); setSelectedPropId(undefined); return } setSelectedPropId(propId); setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setTool('select') }
  const patchRoom = (patch: Partial<DungeonRoom>) => { if (selectedRoom) setValue((current) => syncDoorMarkers({ ...current, rooms: current.rooms.map((item) => item.id === selectedRoom.id ? { ...item, ...patch } : item), updatedAt: new Date().toISOString() })) }
  const patchMarker = (patch: Partial<DungeonMarker>) => { if (selectedMarker) mutate({ ...value, markers: value.markers.map((item) => item.id === selectedMarker.id ? { ...item, ...patch } : item) }) }
  const patchProp = (patch: Partial<DungeonProp>) => { if (selectedProp) mutate({ ...value, props: dungeonProps(value).map((item) => item.id === selectedProp.id ? { ...item, ...patch } : item) }) }
  const proceduralGenerate = () => { const next: DungeonWithProps = { ...generateDungeon(Math.floor(Math.random() * 999999), value.theme), props: [] }; mutate(next, `${titleCase(value.theme)} dungeon generated.`); clearSelection(); setSelectedRoomId(next.rooms[0]?.id); setCorridorStartId(undefined) }
  const saveToLibrary = async () => { await saveAsset({ name: value.name, category: 'environment', kind: 'file', mime: 'application/x-forge-dungeon+json', tags: ['map','dungeon','skillbound',value.theme], source: 'Forge Map Studio', blob: dungeonBlob(value as ForgeDungeonPackage) }); setStatus(`${value.name} saved to the Shared Asset Library.`) }
  const exportSkillbound = () => { download(dungeonBlob(value as ForgeDungeonPackage), `${slug(value.name)}.forge-dungeon.json`); setStatus('Skillbound dungeon package exported with props and transforms.') }

  return <div className="map-studio-page">
    <aside className="map-left-panel">
      <div className="map-panel-title"><MapIcon size={15} /> MAP STUDIO</div>
      <div className="map-mode-card"><span>CREATION MODE</span><strong>Dungeon Builder</strong><em>Skillbound ARPG</em></div>
      <section className="map-panel-section"><div className="map-section-title">TOOLS</div><div className="map-tools-grid">{tools.map(({ id,label,icon:Icon }) => <button key={id} className={tool===id?'active':''} onClick={() => { setTool(id); if(id!=='corridor')setCorridorStartId(undefined) }}><Icon size={15}/><span>{label}</span></button>)}</div></section>
      <section className="map-panel-section"><div className="map-section-title">ROOM PREFABS</div><div className="map-prefab-list">{roomTypes.map((item)=><button key={item.id} className={roomBrush===item.id?'active':''} onClick={()=>{setRoomBrush(item.id);setTool('room')}}><span className={`room-dot ${item.id}`}/><strong>{item.label}</strong><em>{prefabHint(item.id)}</em></button>)}</div></section>
      <section className="map-panel-section"><div className="map-section-title">DUNGEON PROPS</div><div className="map-prop-grid">{BUILTIN_DUNGEON_PROPS.map((item)=><button key={item.id} className={propBrush.source==='builtin'&&propBrush.assetRef===item.id?'active':''} onClick={()=>{setPropBrush({source:'builtin',assetRef:item.id,name:item.name});setTool('prop')}}><Box size={14}/><span><strong>{item.name}</strong><em>{item.hint}</em></span></button>)}</div>{libraryProps.length>0&&<><div className="map-library-caption">SHARED LIBRARY</div><div className="map-prop-grid">{libraryProps.map((item)=><button key={item.id} className={propBrush.source==='library'&&propBrush.assetRef===item.id?'active':''} onClick={()=>{setPropBrush({source:'library',assetRef:item.id,name:item.name});setTool('prop')}}><Box size={14}/><span><strong>{item.name}</strong><em>GLB asset</em></span></button>)}</div></>}</section>
      <section className="map-panel-section compact"><div className="map-section-title">THEME</div><select value={value.theme} onChange={(e)=>mutate({...value,theme:e.target.value as DungeonTheme})}>{themes.map((item)=><option key={item} value={item}>{titleCase(item)}</option>)}</select><button className="map-generate-button" onClick={proceduralGenerate}><WandSparkles size={14}/> Generate Dungeon</button></section>
    </aside>

    <main className="map-workspace">
      <header className="map-toolbar"><div className="map-name-block"><span>SKILLBOUND / DUNGEON</span><input value={value.name} onChange={(e)=>setValue({...value,name:e.target.value})}/></div><div className="map-toolbar-actions"><button className={topDown?'active':''} onClick={()=>{setTopDown(!topDown);setPlaytest(false)}}><Grid3X3 size={14}/> Top</button><button className={playtest?'active play':''} onClick={()=>{setPlaytest(!playtest);setTopDown(false)}}><Play size={14}/> {playtest?'Exit Walk':'Walk'}</button><button onClick={proceduralGenerate}><RotateCcw size={14}/> Regenerate</button><button onClick={()=>void saveToLibrary()}><Save size={14}/> Save</button><button className="primary" onClick={exportSkillbound}><Download size={14}/> Export Skillbound</button></div></header>
      <div className="map-viewport-wrap"><DungeonViewport value={value} tool={tool} selectedRoomId={selectedRoomId} selectedMarkerId={selectedMarkerId} selectedPropId={selectedPropId} corridorStartId={corridorStartId} topDown={topDown} playtest={playtest} libraryAssets={libraryProps} onGroundClick={onGroundClick} onRoomClick={onRoomClick} onMarkerClick={onMarkerClick} onPropClick={onPropClick} onRoomMove={moveRoom} onRoomResize={resizeRoom} onPropMove={moveProp}/>{!playtest&&<><div className="map-viewport-hud top-left"><strong>{titleCase(tool)}</strong><span>{toolHint(tool,corridorStartId)}</span></div><div className="map-viewport-hud bottom-left"><span>{value.rooms.length} rooms</span><b>·</b><span>{value.corridors.length} corridors</span><b>·</b><span>{dungeonProps(value).length} props</span><b>·</b><span>{value.markers.length} markers</span></div><div className={`map-validation-chip ${validation.ok?'ok':'warning'}`}>{validation.ok?<Sparkles size={13}/>:<ShieldAlert size={13}/>} {validation.ok?'Dungeon valid':`${validation.warnings.length} warnings`}</div></>}</div>
      <section className={`map-flow ${flowOpen?'open':''}`}><button className="map-flow-header" onClick={()=>setFlowOpen(!flowOpen)}><Network size={14}/><strong>DUNGEON FLOW</strong><span>{flowOpen?'Hide':'Show'}</span></button>{flowOpen&&<div className="map-flow-body">{value.rooms.map((item,index)=><div key={item.id} className={`flow-node ${item.type} ${selectedRoomId===item.id?'selected':''}`} onClick={()=>{setSelectedRoomId(item.id);setSelectedMarkerId(undefined);setSelectedPropId(undefined);setTool('select')}}><span>{item.type}</span><strong>{item.name}</strong>{index<value.rooms.length-1&&<ChevronRight size={14}/>}</div>)}</div>}</section>
      <footer className="map-status"><span>{status}</span><b>{validation.ok?'Ready for Skillbound export':validation.warnings[0]}</b></footer>
    </main>

    <aside className="map-right-panel"><div className="map-panel-title"><Sparkles size={15}/> INSPECTOR</div>{!selectedRoom&&!selectedMarker&&!selectedProp&&<div className="map-empty-inspector"><MousePointer2 size={28}/><strong>Select something</strong><span>Rooms have direct resize handles. Props can be dragged, rotated and scaled.</span></div>}{selectedRoom&&<RoomInspector room={selectedRoom} onPatch={patchRoom}/>} {selectedMarker&&<MarkerInspector marker={selectedMarker} onPatch={patchMarker}/>} {selectedProp&&<PropInspector prop={selectedProp} onPatch={patchProp}/>}<section className="map-validation-panel"><div className="map-section-title">VALIDATION</div>{validation.ok?<div className="validation-ok"><Sparkles size={14}/> All rooms connected and entrance/boss flow is valid.</div>:validation.warnings.map((warning)=><div key={warning} className="validation-warning"><ShieldAlert size={13}/> {warning}</div>)}</section></aside>
  </div>
}

function RoomInspector({room,onPatch}:{room:DungeonRoom;onPatch:(patch:Partial<DungeonRoom>)=>void}){return <><section className="map-inspector-section"><div className="map-section-title">ROOM</div><label>Name<input value={room.name} onChange={(e)=>onPatch({name:e.target.value})}/></label><label>Type<select value={room.type} onChange={(e)=>onPatch({type:e.target.value as DungeonRoomType})}>{roomTypes.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></section><section className="map-inspector-section"><div className="map-section-title">TRANSFORM</div><div className="map-room-summary"><strong>Drag + resize directly</strong><span>Drag inside the room to move it. Drag any cyan edge handle to resize while the opposite wall stays fixed. Hold Shift for fine/free movement.</span></div><div className="map-number-grid"><NumberField label="X" value={room.x} onChange={(x)=>onPatch({x})}/><NumberField label="Z" value={room.z} onChange={(z)=>onPatch({z})}/><NumberField label="Width" value={room.width} min={3} onChange={(width)=>onPatch({width})}/><NumberField label="Depth" value={room.depth} min={3} onChange={(depth)=>onPatch({depth})}/><NumberField label="Height" value={room.height} min={2} step={0.1} onChange={(height)=>onPatch({height})}/><label>Rotation<select value={room.rotation} onChange={(e)=>onPatch({rotation:Number(e.target.value) as DungeonRoom['rotation']})}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label></div></section></>}
function MarkerInspector({marker,onPatch}:{marker:DungeonMarker;onPatch:(patch:Partial<DungeonMarker>)=>void}){const data=marker.data,patchData=(key:string,val:string|number|boolean)=>onPatch({data:{...data,[key]:val}});return <><section className="map-inspector-section"><div className="map-section-title">{marker.type.toUpperCase()}</div><label>Name<input value={marker.name} onChange={(e)=>onPatch({name:e.target.value})}/></label></section>{marker.type==='door'&&<section className="map-inspector-section"><label>Locked by default<select value={String(Boolean(data.locked))} onChange={(e)=>patchData('locked',e.target.value==='true')}><option value="false">No</option><option value="true">Yes</option></select></label></section>}{marker.type==='enemy'&&<section className="map-inspector-section"><label>Enemy family<input value={String(data.family??'undead')} onChange={(e)=>patchData('family',e.target.value)}/></label><NumberField label="Count" value={Number(data.count??5)} min={1} step={1} onChange={(count)=>patchData('count',count)}/></section>}{marker.type==='light'&&<section className="map-inspector-section"><label>Color<input type="color" value={String(data.color??'#ffb45f')} onChange={(e)=>patchData('color',e.target.value)}/><NumberField label="Intensity" value={Number(data.intensity??2)} min={0} step={0.1} onChange={(intensity)=>patchData('intensity',intensity)}/></label></section>}</>}
function PropInspector({prop,onPatch}:{prop:DungeonProp;onPatch:(patch:Partial<DungeonProp>)=>void}){return <><section className="map-inspector-section"><div className="map-section-title">PROP</div><label>Name<input value={prop.name} onChange={(e)=>onPatch({name:e.target.value})}/></label><div className="map-room-summary"><strong>{prop.source==='library'?'Shared Library asset':'Built-in dungeon prop'}</strong><span>Drag it directly in Select mode. Q / E rotates by 15°.</span></div></section><section className="map-inspector-section"><div className="map-section-title">TRANSFORM</div><div className="map-number-grid"><NumberField label="X" value={prop.x} onChange={(x)=>onPatch({x})}/><NumberField label="Z" value={prop.z} onChange={(z)=>onPatch({z})}/><NumberField label="Y" value={prop.y} step={0.1} onChange={(y)=>onPatch({y})}/><NumberField label="Rotation" value={prop.rotationY} step={15} onChange={(rotationY)=>onPatch({rotationY:normalizeDegrees(rotationY)})}/><NumberField label="Scale" value={prop.scale} min={0.1} step={0.1} onChange={(scale)=>onPatch({scale:Math.max(0.1,scale)})}/><label>Collision<select value={String(prop.collision)} onChange={(e)=>onPatch({collision:e.target.value==='true'})}><option value="true">On</option><option value="false">Off</option></select></label></div></section></>}
function NumberField({label,value,min,step=0.5,onChange}:{label:string;value:number;min?:number;step?:number;onChange:(value:number)=>void}){return <label>{label}<input type="number" value={Number(value.toFixed(2))} min={min} step={step} onChange={(e)=>onChange(Number(e.target.value))}/></label>}
function syncDoorMarkers(value:DungeonWithProps):DungeonWithProps{const map=new Map(value.rooms.map((r)=>[r.id,r]));return{...value,markers:value.markers.map((item)=>{if(item.type!=='door'||!item.roomId||typeof item.data.corridorId!=='string')return item;const edge=value.corridors.find((e)=>e.id===item.data.corridorId),current=map.get(item.roomId);if(!edge||!current)return item;const other=map.get(edge.fromRoomId===item.roomId?edge.toRoomId:edge.fromRoomId);if(!other)return item;const connection=getRoomConnection(current,other,edge.width);return{...item,x:connection.x,z:connection.z,data:{...item.data,yaw:connection.yaw}}})}}
function findDoorPlacement(value:DungeonWithProps,roomId:string){const current=value.rooms.find((r)=>r.id===roomId);if(!current)return;for(const edge of value.corridors.filter((e)=>e.fromRoomId===roomId||e.toRoomId===roomId)){if(value.markers.some((m)=>m.type==='door'&&m.roomId===roomId&&m.data.corridorId===edge.id))continue;const other=value.rooms.find((r)=>r.id===(edge.fromRoomId===roomId?edge.toRoomId:edge.fromRoomId));if(other)return{...getRoomConnection(current,other,edge.width),corridorId:edge.id}}}
function nearestRoom(rooms:DungeonRoom[],x:number,z:number){return[...rooms].sort((a,b)=>(a.x-x)**2+(a.z-z)**2-((b.x-x)**2+(b.z-z)**2))[0]}
function isMapPropAsset(item:LibraryAsset){return item.kind==='glb'&&(item.category==='props'||item.category==='environment')}
function isMarkerTool(tool:DungeonTool):tool is Extract<DungeonTool,'enemy'|'loot'|'checkpoint'|'portal'|'trigger'|'light'>{return['enemy','loot','checkpoint','portal','trigger','light'].includes(tool)}
function snap(v:number,g:number){return Math.round(v/g)*g}function roundTo(v:number,g:number){return Math.round(v/g)*g}function THREE_RAD(v:number){return v*Math.PI/180}function normalizeDegrees(v:number){return((v%360)+360)%360}function titleCase(v:string){return v.charAt(0).toUpperCase()+v.slice(1)}function slug(v:string){return v.trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'skillbound-dungeon'}
function download(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function prefabHint(type:DungeonRoomType){return({entrance:'spawn + checkpoint',combat:'standard encounter',treasure:'reward branch',elite:'hard encounter',shrine:'rest / buff',boss:'large arena',secret:'hidden branch',utility:'custom space'}as const)[type]}
function toolHint(tool:DungeonTool,start?:string){if(tool==='select')return'Drag rooms/props to move them. Selected rooms have cyan resize handles. Q/E rotates selected props.';if(tool==='room')return'Click the grid to place a room.';if(tool==='prop')return'Click anywhere on a room/floor to place the selected prop.';if(tool==='corridor')return start?'Click the destination room.':'Click the first room, then another.';if(tool==='door')return'Click a connected room to install a door.';if(tool==='erase')return'Click an object to delete it.';return'Click a room or floor to place this gameplay marker.'}
