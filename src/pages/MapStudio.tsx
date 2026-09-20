import { useEffect, useMemo, useState } from 'react'
import {
  Box, BoxSelect, ChevronRight, CircleDot, DoorOpen, Download, Gem, Grid3X3, Lightbulb,
  Map as MapIcon, MousePointer2, Network, Play, RotateCcw, Save, ShieldAlert, Skull, Sparkles,
  Spline, Square, Trash2, WandSparkles, Waypoints,
} from 'lucide-react'
import DungeonViewport, { type DungeonTool, type ResizeSide } from '../components/DungeonViewport'
import ArpgDungeonViewport from '../components/ArpgDungeonViewport'
import DungeonMinimap from '../components/DungeonMinimap'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import {
  DEFAULT_DUNGEON_GENERATION, corridor, createStarterDungeon, dungeonBlob, generateDungeon, getRoomConnection, marker, room, validateDungeon, wall,
  type DungeonEncounter, type DungeonGenerationSettings, type DungeonMarker, type DungeonRoom, type DungeonRoomType, type DungeonTheme, type DungeonTriggerAction, type DungeonWall, type ForgeDungeonPackage,
} from '../lib/dungeonPackage'
import {
  compileSkillboundRuntime, ensureRoomEncounter, getRoomEncounter, patchRoomEncounter, removeRoomEncounter, setEncounterDoor,
} from '../lib/dungeonLogic'
import {
  BUILTIN_DUNGEON_PROPS, createDungeonProp, dungeonProps,
  type DungeonProp, type DungeonWithProps, type PropLibraryAsset,
} from '../lib/dungeonProps'
import '../map-studio.css'
import '../map-studio-props.css'

const tools: Array<{ id: DungeonTool; label: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 }, { id: 'room', label: 'Room', icon: Square },
  { id: 'wall', label: 'Wall', icon: Grid3X3 }, { id: 'corridor', label: 'Corridor', icon: Spline }, { id: 'prop', label: 'Prop', icon: Box },
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
const triggerActions: DungeonTriggerAction[] = ['start-encounter','open-door','close-door','spawn-enemies','grant-loot','activate-shrine','set-checkpoint','exit-dungeon']
type PropBrush = { source: 'builtin' | 'library'; assetRef: string; name: string }

export default function MapStudio() {
  const [value, setValue] = useState<DungeonWithProps>(() => ({ ...createStarterDungeon(), props: [] }))
  const [tool, setTool] = useState<DungeonTool>('select')
  const [roomBrush, setRoomBrush] = useState<DungeonRoomType>('combat')
  const [generation, setGeneration] = useState<DungeonGenerationSettings>(() => ({ ...DEFAULT_DUNGEON_GENERATION }))
  const [propBrush, setPropBrush] = useState<PropBrush>({ source: 'builtin', assetRef: 'pillar', name: 'Stone Pillar' })
  const [libraryProps, setLibraryProps] = useState<PropLibraryAsset[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string>()
  const [selectedMarkerId, setSelectedMarkerId] = useState<string>()
  const [selectedPropId, setSelectedPropId] = useState<string>()
  const [selectedWallId, setSelectedWallId] = useState<string>()
  const [corridorStartId, setCorridorStartId] = useState<string>()
  const [topDown, setTopDown] = useState(false)
  const [playtest, setPlaytest] = useState(false)
  const [flowOpen, setFlowOpen] = useState(true)
  const [status, setStatus] = useState('Select rooms to drag or resize them. Combat rooms can now own encounter logic, gates and rewards.')
  const validation = useMemo(() => validateDungeon(value), [value])
  const selectedRoom = value.rooms.find((item) => item.id === selectedRoomId)
  const selectedMarker = value.markers.find((item) => item.id === selectedMarkerId)
  const selectedProp = dungeonProps(value).find((item) => item.id === selectedPropId)
  const selectedWall = (value.walls ?? []).find((item) => item.id === selectedWallId)
  const selectedEncounter = selectedRoom ? getRoomEncounter(value, selectedRoom.id) : undefined

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
  const clearSelection = () => { setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setSelectedWallId(undefined) }

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
    setStatus('Room moved. Corridors, openings, attached props, encounter markers and doors updated automatically.')
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
      const worldShiftX = shiftX * cos + shiftZ * sin, worldShiftZ = -shiftX * sin + shiftZ * cos
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
    setStatus('Room resized. Opposite wall stayed fixed and connected dungeon logic remained attached.')
  }

  const moveProp = (propId: string, x: number, z: number, freeMove: boolean) => {
    setValue((current) => ({
      ...current,
      props: dungeonProps(current).map((item) => item.id === propId ? { ...item, x: freeMove ? roundTo(x, 0.1) : snap(x, current.gridSize), z: freeMove ? roundTo(z, 0.1) : snap(z, current.gridSize), roomId: nearestRoom(current.rooms, x, z)?.id } : item),
      updatedAt: new Date().toISOString(),
    }))
  }

  const deleteSelection = () => {
    if (selectedWallId) { setValue((current) => ({ ...current, walls: (current.walls ?? []).filter((item) => item.id !== selectedWallId), updatedAt: new Date().toISOString() })); setSelectedWallId(undefined); setStatus('Wall removed.'); return }
    if (selectedPropId) { setValue((current) => ({ ...current, props: dungeonProps(current).filter((item) => item.id !== selectedPropId), updatedAt: new Date().toISOString() })); setSelectedPropId(undefined); setStatus('Prop removed.'); return }
    if (selectedMarkerId) { setValue((current) => removeMarkerReference(current, selectedMarkerId)); setSelectedMarkerId(undefined); setStatus('Marker removed and encounter references cleaned.'); return }
    if (selectedRoomId) {
      setValue((current) => removeRoomData(current, selectedRoomId))
      setSelectedRoomId(undefined); setStatus('Room, corridors, props and encounter logic removed.')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input,select,textarea') || playtest || topDown) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedRoomId || selectedMarkerId || selectedPropId || selectedWallId)) { event.preventDefault(); deleteSelection(); return }
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
  }, [selectedRoomId, selectedMarkerId, selectedPropId, selectedWallId, value, playtest, topDown])

  const placeProp = (x: number, z: number) => {
    const targetRoom = nearestRoom(value.rooms, x, z)
    const next = createDungeonProp({ name: propBrush.name, source: propBrush.source, assetRef: propBrush.assetRef, x: snap(x, value.gridSize), z: snap(z, value.gridSize), y: targetRoom?.floorLevel ?? 0, roomId: targetRoom?.id })
    mutate({ ...value, props: [...dungeonProps(value), next] }, `${next.name} placed. Select it to drag, rotate, scale, or change collision.`)
    setSelectedPropId(next.id); setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setSelectedWallId(undefined); setTool('select')
  }

  const drawRoom = ({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) => {
    const nextRoom = room(
      `${titleCase(roomBrush)} Room`,
      roomBrush,
      snap(x, value.gridSize),
      snap(z, value.gridSize),
      Math.max(width, roomBrush === 'boss' ? 20 : 6),
      Math.max(depth, roomBrush === 'boss' ? 18 : 6),
    )
    let next: DungeonWithProps = { ...value, rooms: [...value.rooms, nextRoom] }
    if (['combat','elite','boss'].includes(roomBrush)) next = ensureRoomEncounter(next, nextRoom.id)
    mutate(next, `${nextRoom.name} drawn. Drag its cyan edge handles to refine the shape.`)
    setSelectedRoomId(nextRoom.id); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setSelectedWallId(undefined); setTool('select')
  }

  const drawWall = ({ x1, z1, x2, z2 }: { x1: number; z1: number; x2: number; z2: number }) => {
    const sx = snap(x1, value.gridSize), sz = snap(z1, value.gridSize)
    const ex = snap(x2, value.gridSize), ez = snap(z2, value.gridSize)
    if (Math.hypot(ex - sx, ez - sz) < 1) { setStatus('Drag farther to create a wall segment.'); return }
    const nextWall = wall(sx, sz, ex, ez, 4.2, value.settings.wallThickness, 'Brick Wall')
    mutate({ ...value, walls: [...(value.walls ?? []), nextWall] }, 'Modular brick wall added. Select it to tune height/thickness or delete it.')
    setSelectedWallId(nextWall.id); setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setTool('select')
  }

  const onGroundClick = ({ x, z }: { x: number; z: number }) => {
    const gx = snap(x, value.gridSize), gz = snap(z, value.gridSize)
    if (tool === 'prop') { placeProp(x, z); return }
    if (tool === 'room') {
      const nextRoom = room(`${titleCase(roomBrush)} Room`, roomBrush, gx, gz, roomBrush === 'boss' ? 12 : 7, roomBrush === 'boss' ? 11 : 7)
      let next: DungeonWithProps = { ...value, rooms: [...value.rooms, nextRoom] }
      if (['combat','elite','boss'].includes(roomBrush)) next = ensureRoomEncounter(next, nextRoom.id)
      mutate(next, `${nextRoom.name} placed${getRoomEncounter(next, nextRoom.id) ? ' with encounter logic' : ''}.`)
      setSelectedRoomId(nextRoom.id); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setSelectedWallId(undefined); return
    }
    if (tool === 'door') { setStatus('Doors attach to corridor openings. Click a connected room.'); return }
    if (isMarkerTool(tool)) {
      const nearest = nearestRoom(value.rooms, gx, gz), nextMarker = marker(tool, gx, tool === 'light' ? 1.7 : 0.3, gz, nearest?.id)
      if (tool === 'trigger') nextMarker.data = { action: 'start-encounter', targetId: nearest ? getRoomEncounter(value, nearest.id)?.id ?? '' : '', once: true }
      if (tool === 'enemy') nextMarker.data = { family: value.theme === 'crypt' ? 'undead' : value.theme, count: 5, eliteChance: 0.1, difficulty: 1 }
      if (tool === 'loot') nextMarker.data = { tier: 'rare', requiresClear: false }
      mutate({ ...value, markers: [...value.markers, nextMarker] }, `${nextMarker.name} placed.`)
      setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); setSelectedPropId(undefined); setSelectedWallId(undefined); return
    }
    clearSelection()
  }

  const onRoomClick = (roomId: string) => {
    if (tool === 'prop') { const target = value.rooms.find((item) => item.id === roomId); if (target) placeProp(target.x, target.z); return }
    if (tool === 'erase') { mutate(removeRoomData(value, roomId), 'Room and attached dungeon data removed.'); setSelectedRoomId(undefined); return }
    if (tool === 'corridor') {
      if (!corridorStartId) { setCorridorStartId(roomId); setStatus('Corridor start selected. Click another room.') }
      else if (corridorStartId !== roomId) {
        const exists = value.corridors.some((item) => (item.fromRoomId === corridorStartId && item.toRoomId === roomId) || (item.fromRoomId === roomId && item.toRoomId === corridorStartId))
        if (!exists) mutate({ ...value, corridors: [...value.corridors, corridor(corridorStartId, roomId)] }, 'Rooms connected. Doorway openings were cut automatically.')
        else setStatus('Those rooms are already connected.')
        setCorridorStartId(undefined)
      }
      return
    }
    if (tool === 'door') {
      const placement = findDoorPlacement(value, roomId)
      if (!placement) { setStatus('This room has no unused corridor opening.'); return }
      const nextMarker = marker('door', placement.x, 0, placement.z, roomId, 'Dungeon Door', { corridorId: placement.corridorId, yaw: placement.yaw, locked: false })
      let next: DungeonWithProps = { ...value, markers: [...value.markers, nextMarker] }
      if (getRoomEncounter(next, roomId)) next = setEncounterDoor(next, roomId, nextMarker.id, true)
      mutate(next, getRoomEncounter(next, roomId) ? 'Door installed and linked to this room encounter.' : 'Door installed in the corridor opening.')
      setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); setSelectedPropId(undefined); return
    }
    if (isMarkerTool(tool)) {
      const target = value.rooms.find((item) => item.id === roomId); if (!target) return
      const nextMarker = marker(tool, target.x, tool === 'light' ? 1.7 : 0.3, target.z, target.id)
      if (tool === 'trigger') nextMarker.data = { action: 'start-encounter', targetId: getRoomEncounter(value, roomId)?.id ?? '', once: true }
      if (tool === 'enemy') nextMarker.data = { family: value.theme === 'crypt' ? 'undead' : value.theme, count: 5, eliteChance: 0.1, difficulty: 1 }
      if (tool === 'loot') nextMarker.data = { tier: 'rare', requiresClear: false }
      mutate({ ...value, markers: [...value.markers, nextMarker] }, `${nextMarker.name} added to ${target.name}.`)
      setSelectedMarkerId(nextMarker.id); setSelectedRoomId(undefined); setSelectedPropId(undefined); return
    }
    setSelectedRoomId(roomId); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setSelectedWallId(undefined); setTool('select')
  }

  const onMarkerClick = (markerId: string) => { if (tool === 'erase') { mutate(removeMarkerReference(value, markerId), 'Marker removed.'); setSelectedMarkerId(undefined); return } setSelectedMarkerId(markerId); setSelectedRoomId(undefined); setSelectedPropId(undefined); setSelectedWallId(undefined); setTool('select') }
  const onPropClick = (propId: string) => { if (tool === 'erase') { mutate({ ...value, props: dungeonProps(value).filter((item) => item.id !== propId) }, 'Prop removed.'); setSelectedPropId(undefined); return } setSelectedPropId(propId); setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setSelectedWallId(undefined); setTool('select') }
  const onWallClick = (wallId: string) => { if (tool === 'erase') { mutate({ ...value, walls: (value.walls ?? []).filter((item) => item.id !== wallId) }, 'Wall removed.'); setSelectedWallId(undefined); return } setSelectedWallId(wallId); setSelectedRoomId(undefined); setSelectedMarkerId(undefined); setSelectedPropId(undefined); setTool('select') }
  const patchRoom = (patch: Partial<DungeonRoom>) => { if (selectedRoom) setValue((current) => syncDoorMarkers({ ...current, rooms: current.rooms.map((item) => item.id === selectedRoom.id ? { ...item, ...patch } : item), updatedAt: new Date().toISOString() })) }
  const patchMarker = (patch: Partial<DungeonMarker>) => { if (selectedMarker) mutate({ ...value, markers: value.markers.map((item) => item.id === selectedMarker.id ? { ...item, ...patch } : item) }) }
  const patchProp = (patch: Partial<DungeonProp>) => { if (selectedProp) mutate({ ...value, props: dungeonProps(value).map((item) => item.id === selectedProp.id ? { ...item, ...patch } : item) }) }
  const patchWall = (patch: Partial<DungeonWall>) => { if (selectedWall) mutate({ ...value, walls: (value.walls ?? []).map((item) => item.id === selectedWall.id ? { ...item, ...patch } : item) }) }
  const patchEncounter = (patch: Partial<DungeonEncounter>) => { if (selectedRoom) mutate(patchRoomEncounter(value, selectedRoom.id, patch), 'Encounter updated.') }
  const createEncounter = () => { if (selectedRoom) mutate(ensureRoomEncounter(value, selectedRoom.id), `${selectedRoom.name} encounter created.`) }
  const deleteEncounter = () => { if (selectedRoom) mutate(removeRoomEncounter(value, selectedRoom.id), `${selectedRoom.name} encounter removed.`) }
  const toggleEncounterDoor = (doorId: string, enabled: boolean) => { if (selectedRoom) mutate(setEncounterDoor(value, selectedRoom.id, doorId, enabled), enabled ? 'Door will lock during the encounter.' : 'Door removed from encounter lock list.') }
  const autoEncounterLogic = () => {
    let next = value
    for (const item of value.rooms) if (['combat','elite','boss'].includes(item.type)) next = ensureRoomEncounter(next, item.id)
    mutate(next, `Encounter logic prepared for ${next.logic?.encounters.length ?? 0} combat rooms.`)
  }
  const proceduralGenerate = () => {
    const seed = Math.floor(Math.random() * 999999)
    const next: DungeonWithProps = { ...generateDungeon(seed, value.theme, generation), props: [] }
    mutate(next, `${titleCase(value.theme)} dungeon generated: ${next.rooms.length} rooms, wider corridors and modular post-editing ready.`)
    setGeneration(next.generation ?? generation)
    clearSelection(); setSelectedRoomId(next.rooms[0]?.id); setCorridorStartId(undefined)
  }
  const saveToLibrary = async () => { await saveAsset({ name: value.name, category: 'environment', kind: 'file', mime: 'application/x-forge-dungeon+json', tags: ['map','dungeon','skillbound',value.theme,'encounters'], source: 'Forge Map Studio', blob: dungeonBlob(value as ForgeDungeonPackage) }); setStatus(`${value.name} saved to the Shared Asset Library.`) }
  const exportSkillbound = () => {
    const runtime = compileSkillboundRuntime(value)
    download(dungeonBlob(value as ForgeDungeonPackage), `${slug(value.name)}.forge-dungeon.json`)
    setStatus(`Skillbound package exported: ${runtime.encounters.length} encounters, ${runtime.doors.length} doors, ${runtime.triggers.length} triggers.`)
  }

  return <div className="map-studio-page">
    <aside className="map-left-panel">
      <div className="map-panel-title"><MapIcon size={15} /> DUNGEON FORGE</div>
      <div className="map-mode-card"><span>CREATION MODE</span><strong>Interior Dungeon Builder</strong><em>Skillbound ARPG</em></div>
      <section className="map-panel-section"><div className="map-section-title">TOOLS</div><div className="map-tools-grid">{tools.map(({ id,label,icon:Icon }) => <button key={id} className={tool===id?'active':''} onClick={() => { setTool(id); if(id!=='corridor')setCorridorStartId(undefined) }}><Icon size={15}/><span>{label}</span></button>)}</div></section>
      <section className="map-panel-section"><div className="map-section-title">ROOM PREFABS</div><div className="map-prefab-list">{roomTypes.map((item)=><button key={item.id} className={roomBrush===item.id?'active':''} onClick={()=>{setRoomBrush(item.id);setTool('room')}}><span className={`room-dot ${item.id}`}/><strong>{item.label}</strong><em>{prefabHint(item.id)}</em></button>)}</div></section>
      <section className="map-panel-section"><div className="map-section-title">DUNGEON PROPS</div><div className="map-prop-grid">{BUILTIN_DUNGEON_PROPS.map((item)=><button key={item.id} className={propBrush.source==='builtin'&&propBrush.assetRef===item.id?'active':''} onClick={()=>{setPropBrush({source:'builtin',assetRef:item.id,name:item.name});setTool('prop')}}><Box size={14}/><span><strong>{item.name}</strong><em>{item.hint}</em></span></button>)}</div>{libraryProps.length>0&&<><div className="map-library-caption">SHARED LIBRARY</div><div className="map-prop-grid">{libraryProps.map((item)=><button key={item.id} className={propBrush.source==='library'&&propBrush.assetRef===item.id?'active':''} onClick={()=>{setPropBrush({source:'library',assetRef:item.id,name:item.name});setTool('prop')}}><Box size={14}/><span><strong>{item.name}</strong><em>GLB asset</em></span></button>)}</div></>}</section>
      <section className="map-panel-section compact"><div className="map-section-title">THEME + GENERATION</div><label className="map-generator-field">Theme<select value={value.theme} onChange={(e)=>mutate({...value,theme:e.target.value as DungeonTheme})}>{themes.map((item)=><option key={item} value={item}>{titleCase(item)}</option>)}</select></label><div className="map-generator-grid"><label>Scale<select value={generation.scalePreset} onChange={(e)=>setGeneration({...generation,scalePreset:e.target.value as DungeonGenerationSettings['scalePreset']})}><option value="standard">Standard</option><option value="grand">Grand</option><option value="massive">Massive</option></select></label><label>Rooms<input type="number" min={5} max={14} value={generation.roomCount} onChange={(e)=>setGeneration({...generation,roomCount:Number(e.target.value)})}/></label><label>Corridor<input type="number" min={3.8} max={8} step={.2} value={generation.corridorWidth} onChange={(e)=>setGeneration({...generation,corridorWidth:Number(e.target.value)})}/></label><label>Branches<input type="range" min={0} max={1} step={.05} value={generation.branchChance} onChange={(e)=>setGeneration({...generation,branchChance:Number(e.target.value)})}/><em>{Math.round(generation.branchChance*100)}%</em></label></div><div className="map-preset-note"><strong>Sunken Ossuary direction</strong><span>Large chambers · brick masonry · warm torch pools · dark negative space</span></div><button className="map-generate-button" onClick={proceduralGenerate}><WandSparkles size={14}/> Generate Dungeon</button><button className="map-generate-button secondary" onClick={autoEncounterLogic}><Network size={14}/> Auto Encounter Logic</button></section>
    </aside>

    <main className="map-workspace">
      <header className="map-toolbar"><div className="map-name-block"><span>SKILLBOUND / DUNGEON</span><input value={value.name} onChange={(e)=>setValue({...value,name:e.target.value})}/></div><div className="map-toolbar-actions"><button className={topDown?'active play':''} onClick={()=>{setTopDown(!topDown);setPlaytest(false)}}><Grid3X3 size={14}/> {topDown?'Exit ARPG':'ARPG'}</button><button className={playtest?'active play':''} onClick={()=>{setPlaytest(!playtest);setTopDown(false)}}><Play size={14}/> {playtest?'Exit Walk':'Walk'}</button><button onClick={proceduralGenerate}><RotateCcw size={14}/> Regenerate</button><button onClick={()=>void saveToLibrary()}><Save size={14}/> Save</button><button className="primary" onClick={exportSkillbound}><Download size={14}/> Export Skillbound</button></div></header>
      <div className="map-viewport-wrap">{topDown?<ArpgDungeonViewport value={value}/>:<DungeonViewport value={value} tool={tool} selectedRoomId={selectedRoomId} selectedMarkerId={selectedMarkerId} selectedPropId={selectedPropId} selectedWallId={selectedWallId} corridorStartId={corridorStartId} topDown={false} playtest={playtest} libraryAssets={libraryProps} onGroundClick={onGroundClick} onRoomClick={onRoomClick} onMarkerClick={onMarkerClick} onPropClick={onPropClick} onWallClick={onWallClick} onRoomMove={moveRoom} onRoomResize={resizeRoom} onPropMove={moveProp} onRoomDraw={drawRoom} onWallDraw={drawWall}/>} {!playtest&&!topDown&&<><div className="map-viewport-hud top-left"><strong>{titleCase(tool)}</strong><span>{toolHint(tool,corridorStartId)}</span></div><div className="map-viewport-hud bottom-left"><span>{value.rooms.length} rooms</span><b>·</b><span>{value.corridors.length} corridors</span><b>·</b><span>{value.logic?.encounters.length ?? 0} encounters</span><b>·</b><span>{dungeonProps(value).length} props</span><b>·</b><span>{value.walls?.length ?? 0} walls</span></div><div className={`map-validation-chip ${validation.ok?'ok':'warning'}`}>{validation.ok?<Sparkles size={13}/>:<ShieldAlert size={13}/>} {validation.ok?'Dungeon valid':`${validation.warnings.length} warnings`}</div></>}</div>
      <section className={`map-flow ${flowOpen?'open':''}`}><button className="map-flow-header" onClick={()=>setFlowOpen(!flowOpen)}><Network size={14}/><strong>DUNGEON FLOW</strong><span>{flowOpen?'Hide':'Show'}</span></button>{flowOpen&&<div className="map-flow-body">{value.rooms.map((item,index)=>{const roomEncounter=getRoomEncounter(value,item.id);return <div key={item.id} className={`flow-node ${item.type} ${selectedRoomId===item.id?'selected':''}`} onClick={()=>{setSelectedRoomId(item.id);setSelectedMarkerId(undefined);setSelectedPropId(undefined);setTool('select')}}><span>{item.type}</span><strong>{item.name}</strong>{roomEncounter&&<em className="flow-encounter">{roomEncounter.boss?'BOSS':`${roomEncounter.count}× ${roomEncounter.family}`}</em>}{index<value.rooms.length-1&&<ChevronRight size={14}/>}</div>})}</div>}</section>
      <footer className="map-status"><span>{status}</span><b>{validation.ok?'Ready for Skillbound export':validation.warnings[0]}</b></footer>
    </main>

    <aside className="map-right-panel">
      <div className="map-panel-title"><Sparkles size={15}/> INSPECTOR</div>
      <section className="map-inspector-section minimap-section"><div className="map-section-title">MINIMAP PREVIEW</div><DungeonMinimap value={value} selectedRoomId={selectedRoomId} onSelectRoom={(roomId)=>{setSelectedRoomId(roomId);setSelectedMarkerId(undefined);setSelectedPropId(undefined);setTool('select')}}/></section>
      {!selectedRoom&&!selectedMarker&&!selectedProp&&!selectedWall&&<div className="map-empty-inspector"><MousePointer2 size={28}/><strong>Select something</strong><span>Rooms have direct resize handles. Combat rooms can own encounter logic and gates.</span></div>}
      {selectedRoom&&<><RoomInspector room={selectedRoom} onPatch={patchRoom}/><EncounterInspector room={selectedRoom} encounter={selectedEncounter} doors={value.markers.filter((item)=>item.type==='door'&&item.roomId===selectedRoom.id)} onCreate={createEncounter} onPatch={patchEncounter} onDoor={toggleEncounterDoor} onRemove={deleteEncounter}/></>}
      {selectedMarker&&<MarkerInspector marker={selectedMarker} onPatch={patchMarker}/>} {selectedProp&&<PropInspector prop={selectedProp} onPatch={patchProp}/>} {selectedWall&&<WallInspector wall={selectedWall} onPatch={patchWall}/>}<section className="map-validation-panel"><div className="map-section-title">VALIDATION</div>{validation.ok?<div className="validation-ok"><Sparkles size={14}/> Layout, boss flow and encounter references are valid.</div>:validation.warnings.map((warning,index)=><div key={`${warning}-${index}`} className="validation-warning"><ShieldAlert size={13}/> {warning}</div>)}</section>
    </aside>
  </div>
}

function RoomInspector({room,onPatch}:{room:DungeonRoom;onPatch:(patch:Partial<DungeonRoom>)=>void}){return <><section className="map-inspector-section"><div className="map-section-title">ROOM</div><label>Name<input value={room.name} onChange={(e)=>onPatch({name:e.target.value})}/></label><label>Type<select value={room.type} onChange={(e)=>onPatch({type:e.target.value as DungeonRoomType})}>{roomTypes.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></section><section className="map-inspector-section"><div className="map-section-title">TRANSFORM</div><div className="map-room-summary"><strong>Drag + resize directly</strong><span>Drag inside the room to move it. Drag a cyan edge handle to resize while the opposite wall stays fixed. Hold Shift for fine/free movement.</span></div><div className="map-number-grid"><NumberField label="X" value={room.x} onChange={(x)=>onPatch({x})}/><NumberField label="Z" value={room.z} onChange={(z)=>onPatch({z})}/><NumberField label="Width" value={room.width} min={3} onChange={(width)=>onPatch({width})}/><NumberField label="Depth" value={room.depth} min={3} onChange={(depth)=>onPatch({depth})}/><NumberField label="Height" value={room.height} min={2} step={0.1} onChange={(height)=>onPatch({height})}/><label>Rotation<select value={room.rotation} onChange={(e)=>onPatch({rotation:Number(e.target.value) as DungeonRoom['rotation']})}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label></div></section></>}

function EncounterInspector({room,encounter,doors,onCreate,onPatch,onDoor,onRemove}:{room:DungeonRoom;encounter?:DungeonEncounter;doors:DungeonMarker[];onCreate:()=>void;onPatch:(patch:Partial<DungeonEncounter>)=>void;onDoor:(id:string,enabled:boolean)=>void;onRemove:()=>void}){
  if(!encounter)return <section className="map-inspector-section encounter-card"><div className="map-section-title">ENCOUNTER</div><div className="map-room-summary"><strong>No encounter assigned</strong><span>Create a room encounter to spawn enemies, lock gates and release rewards when cleared.</span></div><button className="logic-primary" onClick={onCreate}><Skull size={13}/> Create Encounter</button></section>
  return <section className="map-inspector-section encounter-card"><div className="map-section-title">ENCOUNTER LOGIC</div><label>Name<input value={encounter.name} onChange={(e)=>onPatch({name:e.target.value})}/></label><label>Enemy family<input value={encounter.family} onChange={(e)=>onPatch({family:e.target.value})}/></label><div className="map-number-grid"><NumberField label="Count" value={encounter.count} min={1} step={1} onChange={(count)=>onPatch({count})}/><NumberField label="Elite chance" value={encounter.eliteChance} min={0} step={0.05} onChange={(eliteChance)=>onPatch({eliteChance:Math.max(0,Math.min(1,eliteChance))})}/><NumberField label="Difficulty" value={encounter.difficulty} min={1} step={1} onChange={(difficulty)=>onPatch({difficulty})}/><label>Boss<select value={String(encounter.boss)} onChange={(e)=>onPatch({boss:e.target.value==='true'})}><option value="false">No</option><option value="true">Yes</option></select></label></div><label>Activation<select value={encounter.trigger} onChange={(e)=>onPatch({trigger:e.target.value as DungeonEncounter['trigger']})}><option value="marker">Trigger volume</option><option value="room-enter">Room enter</option></select></label><label>Run<select value={String(encounter.once)} onChange={(e)=>onPatch({once:e.target.value==='true'})}><option value="true">Once per run</option><option value="false">Repeatable</option></select></label><div className="logic-summary"><span>{encounter.spawnMarkerIds.length} spawn group{encounter.spawnMarkerIds.length===1?'':'s'}</span><span>{encounter.rewardMarkerIds.length} reward{encounter.rewardMarkerIds.length===1?'':'s'}</span></div><div className="map-section-title sub">ENCOUNTER GATES</div>{doors.length===0?<div className="logic-muted">Place a Door on a corridor opening to use encounter locking.</div>:doors.map((door)=><label key={door.id} className="logic-check"><input type="checkbox" checked={encounter.lockDoorIds.includes(door.id)} onChange={(e)=>onDoor(door.id,e.target.checked)}/><span>{door.name}</span></label>)}<button className="logic-danger" onClick={onRemove}>Remove Encounter</button><div className="logic-room-id">Room: {room.name}</div></section>
}

function MarkerInspector({marker,onPatch}:{marker:DungeonMarker;onPatch:(patch:Partial<DungeonMarker>)=>void}){const data=marker.data,patchData=(key:string,val:string|number|boolean)=>onPatch({data:{...data,[key]:val}});return <><section className="map-inspector-section"><div className="map-section-title">{marker.type.toUpperCase()}</div><label>Name<input value={marker.name} onChange={(e)=>onPatch({name:e.target.value})}/></label>{marker.type==='trigger'&&<NumberField label="Radius" value={marker.radius??2} min={0.5} step={0.25} onChange={(radius)=>onPatch({radius})}/>}</section>{marker.type==='door'&&<section className="map-inspector-section"><label>Locked by default<select value={String(Boolean(data.locked))} onChange={(e)=>patchData('locked',e.target.value==='true')}><option value="false">No</option><option value="true">Yes</option></select></label><label>Encounter ID<input value={String(data.encounterId??'')} onChange={(e)=>patchData('encounterId',e.target.value)}/></label></section>}{marker.type==='enemy'&&<section className="map-inspector-section"><label>Enemy family<input value={String(data.family??'undead')} onChange={(e)=>patchData('family',e.target.value)}/></label><div className="map-number-grid"><NumberField label="Count" value={Number(data.count??5)} min={1} step={1} onChange={(count)=>patchData('count',count)}/><NumberField label="Elite chance" value={Number(data.eliteChance??0.1)} min={0} step={0.05} onChange={(eliteChance)=>patchData('eliteChance',Math.max(0,Math.min(1,eliteChance)))}/><NumberField label="Difficulty" value={Number(data.difficulty??1)} min={1} step={1} onChange={(difficulty)=>patchData('difficulty',difficulty)}/></div></section>}{marker.type==='trigger'&&<section className="map-inspector-section"><label>Action<select value={String(data.action??'start-encounter')} onChange={(e)=>patchData('action',e.target.value)}>{triggerActions.map((action)=><option key={action} value={action}>{action}</option>)}</select></label><label>Target ID<input value={String(data.targetId??'')} onChange={(e)=>patchData('targetId',e.target.value)}/></label><label>Once<select value={String(data.once??true)} onChange={(e)=>patchData('once',e.target.value==='true')}><option value="true">Yes</option><option value="false">No</option></select></label></section>}{marker.type==='loot'&&<section className="map-inspector-section"><label>Loot tier<select value={String(data.tier??'rare')} onChange={(e)=>patchData('tier',e.target.value)}><option value="common">Common</option><option value="magic">Magic</option><option value="rare">Rare</option><option value="legendary">Legendary</option></select></label><label>Requires clear<select value={String(Boolean(data.requiresClear))} onChange={(e)=>patchData('requiresClear',e.target.value==='true')}><option value="false">No</option><option value="true">Yes</option></select></label></section>}{marker.type==='portal'&&<section className="map-inspector-section"><label>Action<select value={String(data.action??'exit-dungeon')} onChange={(e)=>patchData('action',e.target.value)}><option value="exit-dungeon">Exit dungeon</option><option value="portal">Portal target</option></select></label><label>Requires encounter<input value={String(data.requiresEncounterId??'')} onChange={(e)=>patchData('requiresEncounterId',e.target.value)}/></label></section>}{marker.type==='checkpoint'&&<section className="map-inspector-section"><label>Checkpoint ID<input value={String(data.checkpointId??'checkpoint')} onChange={(e)=>patchData('checkpointId',e.target.value)}/></label></section>}{marker.type==='light'&&<section className="map-inspector-section"><label>Color<input type="color" value={String(data.color??'#ffb45f')} onChange={(e)=>patchData('color',e.target.value)}/><NumberField label="Intensity" value={Number(data.intensity??2)} min={0} step={0.1} onChange={(intensity)=>patchData('intensity',intensity)}/></label></section>}</>}
function PropInspector({prop,onPatch}:{prop:DungeonProp;onPatch:(patch:Partial<DungeonProp>)=>void}){return <><section className="map-inspector-section"><div className="map-section-title">PROP</div><label>Name<input value={prop.name} onChange={(e)=>onPatch({name:e.target.value})}/></label><div className="map-room-summary"><strong>{prop.source==='library'?'Shared Library asset':'Built-in dungeon prop'}</strong><span>Drag it directly in Select mode. Q / E rotates by 15°.</span></div></section><section className="map-inspector-section"><div className="map-section-title">TRANSFORM</div><div className="map-number-grid"><NumberField label="X" value={prop.x} onChange={(x)=>onPatch({x})}/><NumberField label="Z" value={prop.z} onChange={(z)=>onPatch({z})}/><NumberField label="Y" value={prop.y} step={0.1} onChange={(y)=>onPatch({y})}/><NumberField label="Rotation" value={prop.rotationY} step={15} onChange={(rotationY)=>onPatch({rotationY:normalizeDegrees(rotationY)})}/><NumberField label="Scale" value={prop.scale} min={0.1} step={0.1} onChange={(scale)=>onPatch({scale:Math.max(0.1,scale)})}/><label>Collision<select value={String(prop.collision)} onChange={(e)=>onPatch({collision:e.target.value==='true'})}><option value="true">On</option><option value="false">Off</option></select></label></div></section></>}
function WallInspector({wall,onPatch}:{wall:DungeonWall;onPatch:(patch:Partial<DungeonWall>)=>void}){return <><section className="map-inspector-section"><div className="map-section-title">MODULAR WALL</div><label>Name<input value={wall.name} onChange={(e)=>onPatch({name:e.target.value})}/></label><div className="map-room-summary"><strong>Independent wall segment</strong><span>Use the Wall tool to drag more masonry anywhere in the layout. These walls also block movement in Walk and ARPG preview.</span></div></section><section className="map-inspector-section"><div className="map-section-title">GEOMETRY</div><div className="map-number-grid"><NumberField label="Start X" value={wall.x1} onChange={(x1)=>onPatch({x1})}/><NumberField label="Start Z" value={wall.z1} onChange={(z1)=>onPatch({z1})}/><NumberField label="End X" value={wall.x2} onChange={(x2)=>onPatch({x2})}/><NumberField label="End Z" value={wall.z2} onChange={(z2)=>onPatch({z2})}/><NumberField label="Height" value={wall.height} min={1} step={.1} onChange={(height)=>onPatch({height})}/><NumberField label="Thickness" value={wall.thickness} min={.15} step={.05} onChange={(thickness)=>onPatch({thickness})}/></div></section></>}
function NumberField({label,value,min,step=0.5,onChange}:{label:string;value:number;min?:number;step?:number;onChange:(value:number)=>void}){return <label>{label}<input type="number" value={Number(value.toFixed(2))} min={min} step={step} onChange={(e)=>onChange(Number(e.target.value))}/></label>}

function removeMarkerReference(value:DungeonWithProps,markerId:string):DungeonWithProps{return{...value,markers:value.markers.filter((item)=>item.id!==markerId),logic:value.logic?{...value.logic,completionPortalId:value.logic.completionPortalId===markerId?undefined:value.logic.completionPortalId,encounters:value.logic.encounters.map((encounter)=>({...encounter,trigger:encounter.triggerMarkerId===markerId?'room-enter':encounter.trigger,triggerMarkerId:encounter.triggerMarkerId===markerId?undefined:encounter.triggerMarkerId,spawnMarkerIds:encounter.spawnMarkerIds.filter((id)=>id!==markerId),lockDoorIds:encounter.lockDoorIds.filter((id)=>id!==markerId),rewardMarkerIds:encounter.rewardMarkerIds.filter((id)=>id!==markerId)}))}:value.logic,updatedAt:new Date().toISOString()}}
function removeRoomData(value:DungeonWithProps,roomId:string):DungeonWithProps{const markerIds=new Set(value.markers.filter((item)=>item.roomId===roomId).map((item)=>item.id));return{...value,rooms:value.rooms.filter((item)=>item.id!==roomId),corridors:value.corridors.filter((item)=>item.fromRoomId!==roomId&&item.toRoomId!==roomId),markers:value.markers.filter((item)=>item.roomId!==roomId),props:dungeonProps(value).filter((item)=>item.roomId!==roomId),logic:value.logic?{...value.logic,completionPortalId:value.logic.completionPortalId&&markerIds.has(value.logic.completionPortalId)?undefined:value.logic.completionPortalId,encounters:value.logic.encounters.filter((item)=>item.roomId!==roomId).map((item)=>({...item,spawnMarkerIds:item.spawnMarkerIds.filter((id)=>!markerIds.has(id)),lockDoorIds:item.lockDoorIds.filter((id)=>!markerIds.has(id)),rewardMarkerIds:item.rewardMarkerIds.filter((id)=>!markerIds.has(id))}))}:value.logic,updatedAt:new Date().toISOString()}}
function syncDoorMarkers(value:DungeonWithProps):DungeonWithProps{const map=new Map(value.rooms.map((r)=>[r.id,r]));return{...value,markers:value.markers.map((item)=>{if(item.type!=='door'||!item.roomId||typeof item.data.corridorId!=='string')return item;const edge=value.corridors.find((e)=>e.id===item.data.corridorId),current=map.get(item.roomId);if(!edge||!current)return item;const other=map.get(edge.fromRoomId===item.roomId?edge.toRoomId:edge.fromRoomId);if(!other)return item;const connection=getRoomConnection(current,other,edge.width);return{...item,x:connection.x,z:connection.z,data:{...item.data,yaw:connection.yaw}}})}}
function findDoorPlacement(value:DungeonWithProps,roomId:string){const current=value.rooms.find((r)=>r.id===roomId);if(!current)return;for(const edge of value.corridors.filter((e)=>e.fromRoomId===roomId||e.toRoomId===roomId)){if(value.markers.some((m)=>m.type==='door'&&m.roomId===roomId&&m.data.corridorId===edge.id))continue;const other=value.rooms.find((r)=>r.id===(edge.fromRoomId===roomId?edge.toRoomId:edge.fromRoomId));if(other)return{...getRoomConnection(current,other,edge.width),corridorId:edge.id}}}
function nearestRoom(rooms:DungeonRoom[],x:number,z:number){return[...rooms].sort((a,b)=>(a.x-x)**2+(a.z-z)**2-((b.x-x)**2+(b.z-z)**2))[0]}
function isMapPropAsset(item:LibraryAsset){return item.kind==='glb'&&(item.category==='props'||item.category==='environment')}
function isMarkerTool(tool:DungeonTool):tool is Extract<DungeonTool,'enemy'|'loot'|'checkpoint'|'portal'|'trigger'|'light'>{return['enemy','loot','checkpoint','portal','trigger','light'].includes(tool)}
function snap(v:number,g:number){return Math.round(v/g)*g}function roundTo(v:number,g:number){return Math.round(v/g)*g}function THREE_RAD(v:number){return v*Math.PI/180}function normalizeDegrees(v:number){return((v%360)+360)%360}function titleCase(v:string){return v.charAt(0).toUpperCase()+v.slice(1)}function slug(v:string){return v.trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'skillbound-dungeon'}
function download(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function prefabHint(type:DungeonRoomType){return({entrance:'spawn + checkpoint',combat:'standard encounter',treasure:'reward branch',elite:'hard encounter + gate',shrine:'rest / buff',boss:'boss encounter + gate',secret:'hidden branch',utility:'custom space'}as const)[type]}
function toolHint(tool:DungeonTool,start?:string){if(tool==='select')return'Drag rooms/props to move them. Select modular walls to edit their endpoints and thickness.';if(tool==='room')return'Click-drag on the floor to draw a new room. Tiny drags use the room preset minimum.';if(tool==='wall')return'Click-drag to draw an independent brick wall segment.';if(tool==='prop')return'Click anywhere on a room/floor to place the selected prop.';if(tool==='corridor')return start?'Click the destination room.':'Click the first room, then another.';if(tool==='door')return'Click a connected room to install a door; encounter rooms link it automatically.';if(tool==='erase')return'Click an object to delete it.';return'Click a room or floor to place this gameplay marker.'}
