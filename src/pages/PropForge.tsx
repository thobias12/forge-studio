import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Boxes,
  Box,
  Camera,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  Grid3X3,
  Layers3,
  Maximize2,
  Move,
  PackagePlus,
  Plus,
  RotateCw,
  Save,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react'
import PropForgeViewport, {
  type PropForgePreviewMode,
  type PropForgeTransformMode,
} from '../components/PropForgeViewport'
import GameplaySocketInspector from '../components/GameplaySocketInspector'
import {
  GAMEPLAY_SOCKET_TYPES,
  cloneGameplaySocket,
  createGameplaySocket,
  gameplaySocketColor,
  gameplaySocketKindLabel,
  type GameplaySocket,
  type GameplaySocketKind,
} from '../engine/gameplaySockets'
import {
  PROP_CATEGORIES,
  PROP_MATERIALS,
  PROP_PART_LIBRARY,
  clonePropPrefab,
  createBlankPropPrefab,
  createPropPart,
  loadPropPrefabs,
  parsePropPrefabJson,
  savePropPrefabs,
  serializePropPrefab,
  starterPropPrefabs,
  touchPropPrefab,
  validatePropPrefab,
  type PropCategory,
  type PropPart,
  type PropPartKind,
  type PropPrefab,
} from '../lib/propPrefab'
import '../prop-forge.css'

const primitiveIcons: Record<PropPartKind, typeof Box> = {
  box: Box,
  cylinder: CircleDot,
  sphere: CircleDot,
  rock: Boxes,
  cone: Maximize2,
  plank: Layers3,
  post: Layers3,
  wheel: CircleDot,
  ring: CircleDot,
}

export default function PropForge() {
  const initialRef = useRef<PropPrefab[] | null>(null)
  if (!initialRef.current) {
    initialRef.current = loadPropPrefabs()
  }

  const initialPrefabs = initialRef.current ?? []
  const [prefabs, setPrefabs] = useState<PropPrefab[]>(
    initialPrefabs,
  )
  const [activeId, setActiveId] = useState(
    initialPrefabs[0]?.id ?? '',
  )
  const [selectedPartId, setSelectedPartId] = useState<string>()
  const [selectedSocketId, setSelectedSocketId] = useState<string>()
  const [newSocketKind, setNewSocketKind] = useState<GameplaySocketKind>('interaction')
  const [mode, setMode] =
    useState<PropForgeTransformMode>('translate')
  const [previewMode, setPreviewMode] =
    useState<PropForgePreviewMode>('full')
  const [topDown, setTopDown] = useState(false)
  const [showCollision, setShowCollision] = useState(false)
  const [showPivot, setShowPivot] = useState(true)
  const [focusNonce, setFocusNonce] = useState(0)
  const [captureNonce, setCaptureNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] =
    useState<PropCategory | 'all'>('all')
  const [status, setStatus] = useState(
    'Prop Forge ready. Build reusable props from modular primitive parts.',
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active =
    prefabs.find((prefab) => prefab.id === activeId) ??
    prefabs[0]
  const selectedPart = active?.parts.find(
    (part) => part.id === selectedPartId,
  )
  const selectedSocket = active?.sockets.find(
    (socket) => socket.id === selectedSocketId,
  )
  const validation = active
    ? validatePropPrefab(active)
    : undefined

  const filteredPrefabs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return prefabs.filter((prefab) => {
      if (
        categoryFilter !== 'all' &&
        prefab.category !== categoryFilter
      ) {
        return false
      }
      if (!needle) return true
      return [
        prefab.name,
        prefab.category,
        prefab.description,
        prefab.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [prefabs, query, categoryFilter])

  const groupedParts = useMemo(() => {
    if (!active) return []
    const groups = new Map<string, PropPart[]>()
    for (const part of active.parts) {
      const name = part.group.trim() || 'Ungrouped'
      const list = groups.get(name) ?? []
      list.push(part)
      groups.set(name, list)
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )
  }, [active])

  useEffect(() => {
    savePropPrefabs(prefabs)
  }, [prefabs])

  useEffect(() => {
    if (!active && prefabs[0]) {
      setActiveId(prefabs[0].id)
    }
  }, [active, prefabs])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      if (event.key === 'Delete') {
        if (selectedSocketId) {
          deleteSelectedSocket()
          event.preventDefault()
        } else if (selectedPartId) {
          deleteSelectedPart()
          event.preventDefault()
        }
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'd'
      ) {
        if (selectedSocketId) {
          duplicateSelectedSocket()
          event.preventDefault()
        } else if (selectedPartId) {
          duplicateSelectedPart()
          event.preventDefault()
        }
      }
      if (event.key.toLowerCase() === 'w') {
        setMode('translate')
      }
      if (event.key.toLowerCase() === 'e') {
        setMode('rotate')
      }
      if (event.key.toLowerCase() === 'r') {
        setMode('scale')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPartId, selectedSocketId, activeId, prefabs])

  if (!active) {
    return (
      <div className="prop-forge-empty">
        <PackagePlus size={34}/>
        <strong>No prop assets</strong>
        <span>Create a blank modular prop to begin.</span>
        <button
          onClick={() => {
            const next = createBlankPropPrefab()
            setPrefabs([next])
            setActiveId(next.id)
          }}
        >
          Create prop
        </button>
      </div>
    )
  }

  const mutateActive = (
    update: (prefab: PropPrefab) => PropPrefab,
    message?: string,
  ) => {
    setPrefabs((current) =>
      current.map((prefab) =>
        prefab.id === active.id
          ? touchPropPrefab(update(prefab))
          : prefab,
      ),
    )
    if (message) setStatus(message)
  }

  const patchActive = (
    patch: Partial<PropPrefab>,
    message?: string,
  ) => {
    mutateActive(
      (prefab) => ({ ...prefab, ...patch }),
      message,
    )
  }

  const commitPart = (part: PropPart) => {
    mutateActive((prefab) => ({
      ...prefab,
      parts: prefab.parts.map((candidate) =>
        candidate.id === part.id ? part : candidate,
      ),
    }))
  }

  const patchSelectedPart = (
    patch: Partial<PropPart>,
    message?: string,
  ) => {
    if (!selectedPart) return
    commitPart({ ...selectedPart, ...patch })
    if (message) setStatus(message)
  }

  const commitSocket = (socket: GameplaySocket) => {
    mutateActive((prefab) => ({
      ...prefab,
      sockets: prefab.sockets.map((candidate) =>
        candidate.id === socket.id ? socket : candidate,
      ),
    }))
  }

  const patchSelectedSocket = (
    patch: Partial<GameplaySocket>,
    message?: string,
  ) => {
    if (!selectedSocket) return
    commitSocket({ ...selectedSocket, ...patch })
    if (message) setStatus(message)
  }

  const addSocket = () => {
    const socket = createGameplaySocket(newSocketKind)
    mutateActive(
      (prefab) => ({
        ...prefab,
        sockets: [...prefab.sockets, socket],
      }),
      `${gameplaySocketKindLabel(socket.kind)} added. Move and rotate it directly in the viewport.`,
    )
    setSelectedPartId(undefined)
    setSelectedSocketId(socket.id)
    setPreviewMode('full')
    setMode('translate')
  }

  const deleteSelectedSocket = () => {
    if (!selectedSocketId) return
    mutateActive(
      (prefab) => ({
        ...prefab,
        sockets: prefab.sockets.filter(
          (socket) => socket.id !== selectedSocketId,
        ),
      }),
      'Gameplay socket removed.',
    )
    setSelectedSocketId(undefined)
  }

  const duplicateSelectedSocket = () => {
    if (!selectedSocket) return
    const duplicate = cloneGameplaySocket(
      selectedSocket,
      [active.gridSize, 0, active.gridSize],
    )
    mutateActive(
      (prefab) => ({
        ...prefab,
        sockets: [...prefab.sockets, duplicate],
      }),
      'Gameplay socket duplicated.',
    )
    setSelectedPartId(undefined)
    setSelectedSocketId(duplicate.id)
  }

  const addPart = (kind: PropPartKind) => {
    const part = createPropPart(kind, {
      group: selectedPart?.group ?? 'Main',
    })
    mutateActive(
      (prefab) => ({
        ...prefab,
        parts: [...prefab.parts, part],
      }),
      `${part.name} added. W/E/R switches Move, Rotate and Scale.`,
    )
    setSelectedSocketId(undefined)
    setSelectedPartId(part.id)
    setPreviewMode('full')
    setMode('translate')
  }

  const deleteSelectedPart = () => {
    if (!selectedPartId) return
    mutateActive(
      (prefab) => ({
        ...prefab,
        parts: prefab.parts.filter(
          (part) => part.id !== selectedPartId,
        ),
      }),
      'Part removed.',
    )
    setSelectedPartId(undefined)
  }

  const duplicateSelectedPart = () => {
    if (!selectedPart) return
    const duplicate = createPropPart(selectedPart.kind, {
      ...selectedPart,
      id: undefined,
      name: `${selectedPart.name} Copy`,
      position: [
        selectedPart.position[0] + active.gridSize,
        selectedPart.position[1],
        selectedPart.position[2] + active.gridSize,
      ],
    })
    mutateActive(
      (prefab) => ({
        ...prefab,
        parts: [...prefab.parts, duplicate],
      }),
      'Part duplicated.',
    )
    setSelectedPartId(duplicate.id)
  }

  const duplicateGroup = (groupName: string) => {
    const source = active.parts.filter(
      (part) => (part.group.trim() || 'Ungrouped') === groupName,
    )
    if (!source.length) return

    const newGroup = uniqueGroupName(
      active.parts.map((part) => part.group),
      `${groupName} Copy`,
    )
    const copies = source.map((part) =>
      createPropPart(part.kind, {
        ...part,
        id: undefined,
        name: part.name,
        group: newGroup,
        position: [
          part.position[0] + active.gridSize,
          part.position[1],
          part.position[2] + active.gridSize,
        ],
      }),
    )
    mutateActive(
      (prefab) => ({
        ...prefab,
        parts: [...prefab.parts, ...copies],
      }),
      `${groupName} duplicated as ${newGroup}.`,
    )
    setSelectedSocketId(undefined)
    setSelectedPartId(copies[0]?.id)
  }

  const createPrefab = () => {
    const next = createBlankPropPrefab()
    setPrefabs((current) => [...current, next])
    setActiveId(next.id)
    setSelectedSocketId(undefined)
    setSelectedPartId(next.parts[0]?.id)
    setPreviewMode('full')
    setStatus('Blank modular prop created.')
  }

  const duplicatePrefab = () => {
    const next = clonePropPrefab(active)
    setPrefabs((current) => [...current, next])
    setActiveId(next.id)
    setSelectedPartId(undefined)
    setSelectedSocketId(undefined)
    setPreviewMode('full')
    setStatus('Prop duplicated as an independent asset.')
  }

  const deletePrefab = () => {
    if (
      !window.confirm(
        `Delete “${active.name}” from the local Prop Forge library?`,
      )
    ) {
      return
    }

    const next = prefabs.filter(
      (prefab) => prefab.id !== active.id,
    )
    if (!next.length) {
      const blank = createBlankPropPrefab()
      setPrefabs([blank])
      setActiveId(blank.id)
    } else {
      setPrefabs(next)
      setActiveId(next[0].id)
    }
    setSelectedPartId(undefined)
    setSelectedSocketId(undefined)
    setStatus('Prop deleted.')
  }

  const restoreStarters = () => {
    if (
      !window.confirm(
        'Restore the bundled Prop Forge starter library? This replaces the current local prop library.',
      )
    ) {
      return
    }
    const next = starterPropPrefabs()
    setPrefabs(next)
    setActiveId(next[0]?.id ?? '')
    setSelectedPartId(undefined)
    setSelectedSocketId(undefined)
    setPreviewMode('full')
    setStatus('Starter prop library restored.')
  }

  const exportPrefab = () => {
    const blob = new Blob(
      [serializePropPrefab(active)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug(active.name)}.forge-prop.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setStatus('Prop exported as portable Forge prop JSON.')
  }

  const importPrefab = async (file?: File) => {
    if (!file) return
    try {
      const imported = parsePropPrefabJson(
        await file.text(),
      )
      setPrefabs((current) => [...current, imported])
      setActiveId(imported.id)
      setSelectedPartId(undefined)
      setSelectedSocketId(undefined)
      setPreviewMode('full')
      setStatus('Prop imported into the local asset library.')
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not import prop.',
      )
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const captureThumbnail = (dataUrl: string) => {
    patchActive(
      { thumbnail: dataUrl },
      'Viewport thumbnail captured and saved with the prop.',
    )
  }

  return (
    <div className="prop-forge-page">
      <aside className="prop-forge-library">
        <header>
          <div>
            <span>MODULAR ASSET LIBRARY</span>
            <strong>Prop Forge</strong>
          </div>
          <button
            title="New prop"
            onClick={createPrefab}
          >
            <Plus size={15}/>
          </button>
        </header>

        <div className="prop-library-filters">
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search props, tags…"
          />
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(
                event.target.value as
                  | PropCategory
                  | 'all',
              )
            }
          >
            <option value="all">All categories</option>
            {PROP_CATEGORIES.map((category) => (
              <option
                key={category.id}
                value={category.id}
              >
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className="prop-prefab-list">
          {filteredPrefabs.map((prefab) => {
            const result = validatePropPrefab(prefab)
            return (
              <button
                key={prefab.id}
                className={
                  prefab.id === active.id
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setActiveId(prefab.id)
                  setSelectedPartId(undefined)
                  setPreviewMode('full')
                }}
              >
                <span className="prop-prefab-thumb">
                  {prefab.thumbnail
                    ? <img src={prefab.thumbnail} alt=""/>
                    : categoryGlyph(prefab.category)}
                </span>
                <span>
                  <strong>{prefab.name}</strong>
                  <small>
                    {categoryLabel(prefab.category)}
                    {' · '}
                    {prefab.parts.length} parts
                  </small>
                </span>
                {result.ready
                  ? <CheckCircle2
                      className="ready"
                      size={13}
                    />
                  : <AlertTriangle
                      className="warning"
                      size={13}
                    />}
              </button>
            )
          })}
        </div>

        <section className="prop-library-actions">
          <button onClick={duplicatePrefab}>
            <Copy size={13}/> Duplicate
          </button>
          <button onClick={exportPrefab}>
            <Download size={13}/> Export
          </button>
          <button
            onClick={() =>
              fileInputRef.current?.click()
            }
          >
            <Upload size={13}/> Import
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".json,.forge-prop.json,application/json"
            onChange={(event) =>
              void importPrefab(
                event.target.files?.[0],
              )
            }
          />
          <button
            className="danger"
            onClick={deletePrefab}
          >
            <Trash2 size={13}/> Delete
          </button>
        </section>

        <button
          className="prop-reset-starters"
          onClick={restoreStarters}
        >
          Restore starter library
        </button>
      </aside>

      <main className="prop-forge-workspace">
        <header className="prop-forge-toolbar">
          <div className="prop-toolbar-title">
            <span>PROP ASSET</span>
            <input
              value={active.name}
              onChange={(event) =>
                patchActive({
                  name: event.target.value,
                })
              }
            />
          </div>

          <div className="prop-transform-tools">
            <button
              className={
                mode === 'translate' ? 'active' : ''
              }
              title="Move (W)"
              disabled={previewMode === 'far'}
              onClick={() => setMode('translate')}
            >
              <Move size={15}/>
              <span>Move</span>
            </button>
            <button
              className={
                mode === 'rotate' ? 'active' : ''
              }
              title="Rotate (E)"
              disabled={previewMode === 'far'}
              onClick={() => setMode('rotate')}
            >
              <RotateCw size={15}/>
              <span>Rotate</span>
            </button>
            <button
              className={
                mode === 'scale' ? 'active' : ''
              }
              title="Scale (R)"
              disabled={previewMode === 'far'}
              onClick={() => setMode('scale')}
            >
              <Maximize2 size={15}/>
              <span>Scale</span>
            </button>
          </div>

          <div className="prop-toolbar-actions">
            <button
              className={active.snap ? 'active' : ''}
              onClick={() =>
                patchActive(
                  { snap: !active.snap },
                  'Transform snapping updated.',
                )
              }
            >
              <Grid3X3 size={14}/> Snap
            </button>
            <button
              className={showCollision ? 'active' : ''}
              onClick={() =>
                setShowCollision((value) => !value)
              }
            >
              {showCollision
                ? <Eye size={14}/>
                : <EyeOff size={14}/>}
              Collision
            </button>
            <button
              className={showPivot ? 'active' : ''}
              onClick={() =>
                setShowPivot((value) => !value)
              }
            >
              Pivot
            </button>
            <button
              className={topDown ? 'active' : ''}
              onClick={() =>
                setTopDown((value) => !value)
              }
            >
              Top
            </button>
            <button
              onClick={() =>
                setFocusNonce((value) => value + 1)
              }
            >
              <Focus size={14}/> Focus
            </button>
            <button
              onClick={() =>
                setCaptureNonce((value) => value + 1)
              }
            >
              <Camera size={14}/> Thumbnail
            </button>
            <button
              className="primary"
              onClick={() => {
                savePropPrefabs(prefabs)
                setStatus('Prop library saved locally.')
              }}
            >
              <Save size={14}/> Save
            </button>
          </div>
        </header>

        <section className="prop-forge-stage">
          <PropForgeViewport
            prefab={active}
            selectedPartId={selectedPartId}
            selectedSocketId={selectedSocketId}
            mode={mode}
            topDown={topDown}
            showCollision={showCollision}
            showPivot={showPivot}
            previewMode={previewMode}
            focusNonce={focusNonce}
            captureNonce={captureNonce}
            onSelectPart={(partId) => {
              setSelectedPartId(partId)
              if (partId) setSelectedSocketId(undefined)
            }}
            onSelectSocket={(socketId) => {
              setSelectedSocketId(socketId)
              if (socketId) setSelectedPartId(undefined)
            }}
            onCommitPart={commitPart}
            onCommitSocket={commitSocket}
            onCaptureThumbnail={captureThumbnail}
          />

          <div className="prop-part-palette">
            <span>ADD PRIMITIVE</span>
            {PROP_PART_LIBRARY.map((item) => {
              const Icon = primitiveIcons[item.kind]
              return (
                <button
                  key={item.kind}
                  title={item.label}
                  onClick={() => addPart(item.kind)}
                >
                  <Icon size={15}/>
                  <small>{item.label}</small>
                </button>
              )
            })}
          </div>

          <div className="prop-stage-status">
            <span>{status}</span>
            <strong>
              {active.snap
                ? `Snap ${active.gridSize}m`
                : 'Free transform'}
              {' · '}
              {active.parts.length} parts
              {' · '}
              {active.sockets.length} sockets
              {' · '}
              {validation?.collisionCount ?? 0} collision
            </strong>
          </div>
        </section>
      </main>

      <aside className="prop-forge-inspector">
        <header>
          <span>ASSET INSPECTOR</span>
          <strong>
            {selectedSocket?.name ?? selectedPart?.name ?? active.name}
          </strong>
        </header>

        <section className="prop-hierarchy">
          <div className="prop-inspector-heading">
            <span>PART HIERARCHY</span>
            <small>{groupedParts.length} groups</small>
          </div>
          <div className="prop-hierarchy-scroll">
            {groupedParts.map(([group, parts]) => (
              <div
                className="prop-hierarchy-group"
                key={group}
              >
                <header>
                  <strong>{group}</strong>
                  <span>{parts.length}</span>
                  <button
                    title="Duplicate group"
                    onClick={() =>
                      duplicateGroup(group)
                    }
                  >
                    <Copy size={11}/>
                  </button>
                </header>
                {parts.map((part) => (
                  <button
                    key={part.id}
                    className={
                      selectedPartId === part.id
                        ? 'active'
                        : ''
                    }
                    onClick={() => {
                      setSelectedSocketId(undefined)
                      setSelectedPartId(part.id)
                      setPreviewMode('full')
                    }}
                  >
                    <i>
                      {part.collision ? '◆' : '◇'}
                    </i>
                    <span>{part.name}</span>
                    <em>{part.kind}</em>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="prop-gameplay-sockets">
          <div className="prop-inspector-heading">
            <span>GAMEPLAY SOCKETS</span>
            <small>{active.sockets.length} authored</small>
          </div>
          <div className="gameplay-socket-list">
            {active.sockets.map((socket) => (
              <button
                key={socket.id}
                className={selectedSocketId === socket.id ? 'active' : ''}
                style={{
                  ['--socket-color' as string]: `#${gameplaySocketColor(socket.kind).toString(16).padStart(6, '0')}`,
                }}
                onClick={() => {
                  setSelectedPartId(undefined)
                  setSelectedSocketId(socket.id)
                  setPreviewMode('full')
                  if (mode === 'scale') setMode('translate')
                }}
              >
                <i/>
                <span>{socket.name}</span>
                <em>{gameplaySocketKindLabel(socket.kind)}</em>
              </button>
            ))}
          </div>
          <div className="gameplay-socket-add">
            <select
              value={newSocketKind}
              onChange={(event) =>
                setNewSocketKind(event.target.value as GameplaySocketKind)
              }
            >
              {GAMEPLAY_SOCKET_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            <button onClick={addSocket}>
              <Plus size={12}/> Add
            </button>
          </div>
        </section>

        {selectedSocket ? (
          <GameplaySocketInspector
            socket={selectedSocket}
            onChange={patchSelectedSocket}
            onDuplicate={duplicateSelectedSocket}
            onDelete={deleteSelectedSocket}
          />
        ) : selectedPart ? (
          <>
            <section>
              <div className="prop-inspector-heading">
                <span>SELECTED PART</span>
                <div>
                  <button
                    title="Duplicate"
                    onClick={duplicateSelectedPart}
                  >
                    <Copy size={13}/>
                  </button>
                  <button
                    title="Delete"
                    className="danger"
                    onClick={deleteSelectedPart}
                  >
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>

              <label className="prop-field">
                <span>Name</span>
                <input
                  value={selectedPart.name}
                  onChange={(event) =>
                    patchSelectedPart({
                      name: event.target.value,
                    })
                  }
                />
              </label>

              <label className="prop-field">
                <span>Group</span>
                <input
                  value={selectedPart.group}
                  list="prop-groups"
                  onChange={(event) =>
                    patchSelectedPart({
                      group:
                        event.target.value ||
                        'Ungrouped',
                    })
                  }
                />
                <datalist id="prop-groups">
                  {groupedParts.map(([group]) => (
                    <option
                      key={group}
                      value={group}
                    />
                  ))}
                </datalist>
              </label>

              <div className="prop-field">
                <span>Primitive</span>
                <strong>{selectedPart.kind}</strong>
              </div>

              <label className="prop-field">
                <span>Material</span>
                <select
                  value={selectedPart.material}
                  onChange={(event) =>
                    patchSelectedPart({
                      material:
                        event.target.value as
                          PropPart['material'],
                      color: undefined,
                    })
                  }
                >
                  {PROP_MATERIALS.map((material) => (
                    <option
                      key={material.id}
                      value={material.id}
                    >
                      {material.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="prop-field prop-color-field">
                <span>Color override</span>
                <input
                  type="color"
                  value={
                    selectedPart.color ?? '#686b61'
                  }
                  onChange={(event) =>
                    patchSelectedPart({
                      color: event.target.value,
                    })
                  }
                />
                {selectedPart.color && (
                  <button
                    onClick={() =>
                      patchSelectedPart({
                        color: undefined,
                      })
                    }
                  >
                    Reset
                  </button>
                )}
              </div>

              <label className="prop-check-field">
                <input
                  type="checkbox"
                  checked={selectedPart.collision}
                  onChange={(event) =>
                    patchSelectedPart(
                      {
                        collision:
                          event.target.checked,
                      },
                      event.target.checked
                        ? 'Collision enabled for this part.'
                        : 'This part is visual-only.',
                    )
                  }
                />
                <span>
                  <strong>Collision geometry</strong>
                  <small>
                    Stored with the asset for future
                    runtime/nav baking.
                  </small>
                </span>
              </label>
            </section>

            <TransformSection
              label="Position"
              value={selectedPart.position}
              step={active.gridSize}
              onChange={(position) =>
                patchSelectedPart({ position })
              }
            />
            <TransformSection
              label="Rotation"
              value={
                selectedPart.rotation.map(
                  radiansToDegrees,
                ) as [number, number, number]
              }
              step={15}
              suffix="°"
              onChange={(rotation) =>
                patchSelectedPart({
                  rotation: rotation.map(
                    degreesToRadians,
                  ) as [number, number, number],
                })
              }
            />
            <TransformSection
              label="Scale"
              value={selectedPart.scale}
              step={.05}
              min={.025}
              onChange={(scale) =>
                patchSelectedPart({ scale })
              }
            />
          </>
        ) : (
          <>
            <section>
              <span className="prop-section-title">
                ASSET SETTINGS
              </span>
              <label className="prop-field">
                <span>Category</span>
                <select
                  value={active.category}
                  onChange={(event) =>
                    patchActive({
                      category:
                        event.target.value as
                          PropCategory,
                    })
                  }
                >
                  {PROP_CATEGORIES.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="prop-field vertical">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={active.description}
                  onChange={(event) =>
                    patchActive({
                      description:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label className="prop-field vertical">
                <span>Tags · comma separated</span>
                <input
                  value={active.tags.join(', ')}
                  onChange={(event) =>
                    patchActive({
                      tags: event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 32),
                    })
                  }
                />
              </label>

              <label className="prop-field">
                <span>Grid size</span>
                <select
                  value={active.gridSize}
                  onChange={(event) =>
                    patchActive({
                      gridSize: Number(
                        event.target.value,
                      ),
                    })
                  }
                >
                  <option value={.05}>0.05 m</option>
                  <option value={.1}>0.1 m</option>
                  <option value={.25}>0.25 m</option>
                  <option value={.5}>0.5 m</option>
                  <option value={1}>1 m</option>
                </select>
              </label>
            </section>

            <section>
              <div className="prop-inspector-heading">
                <span>INSERTION PIVOT</span>
                <small>yellow axes</small>
              </div>
              <VectorSection
                value={active.pivot}
                step={active.gridSize}
                onChange={(pivot) =>
                  patchActive(
                    { pivot },
                    'Asset pivot updated.',
                  )
                }
              />
              <p className="prop-help">
                The pivot becomes the placement origin when
                this prop is inserted into POIs, dungeons or
                future scene editors.
              </p>
            </section>

            <section>
              <div className="prop-inspector-heading">
                <span>LOD PROFILE</span>
                <button
                  className={
                    previewMode === 'far'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setPreviewMode((value) =>
                      value === 'far'
                        ? 'full'
                        : 'far',
                    )
                  }
                >
                  Preview far
                </button>
              </div>

              <label className="prop-check-field">
                <input
                  type="checkbox"
                  checked={active.lod.enabled}
                  onChange={(event) =>
                    patchActive({
                      lod: {
                        ...active.lod,
                        enabled:
                          event.target.checked,
                      },
                    })
                  }
                />
                <span>
                  <strong>Enable LOD metadata</strong>
                  <small>
                    Allows future runtime placement to use
                    the far proxy.
                  </small>
                </span>
              </label>

              <NumericField
                label="Far distance"
                value={active.lod.farDistance}
                min={6}
                max={250}
                step={1}
                suffix="m"
                onChange={(farDistance) =>
                  patchActive({
                    lod: {
                      ...active.lod,
                      farDistance,
                    },
                  })
                }
              />

              <label className="prop-field slider">
                <span>Simplify target</span>
                <div>
                  <input
                    type="range"
                    min={.1}
                    max={.9}
                    step={.05}
                    value={active.lod.simplify}
                    onChange={(event) =>
                      patchActive({
                        lod: {
                          ...active.lod,
                          simplify: Number(
                            event.target.value,
                          ),
                        },
                      })
                    }
                  />
                  <strong>
                    {Math.round(
                      active.lod.simplify * 100,
                    )}%
                  </strong>
                </div>
              </label>
            </section>

            <section
              className={
                validation?.ready
                  ? 'prop-validation ready'
                  : 'prop-validation warning'
              }
            >
              <div>
                {validation?.ready
                  ? <CheckCircle2 size={16}/>
                  : <AlertTriangle size={16}/>}
                <span>
                  <strong>
                    {validation?.ready
                      ? 'Reusable asset ready'
                      : 'Needs attention'}
                  </strong>
                  <small>
                    {validation?.partCount ?? 0} parts
                    {' · '}
                    {validation?.groupCount ?? 0} groups
                    {' · '}
                    {validation?.collisionCount ?? 0} collision
                  </small>
                </span>
              </div>
              <p>
                Bounds {validation?.bounds.width.toFixed(1)}
                {' × '}
                {validation?.bounds.height.toFixed(1)}
                {' × '}
                {validation?.bounds.depth.toFixed(1)} m
              </p>
              {validation?.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </section>
          </>
        )}

        <footer className="prop-inspector-tip">
          <strong>Viewport shortcuts</strong>
          <span>
            W move · E rotate · R scale · Del delete ·
            Ctrl+D duplicate
          </span>
        </footer>
      </aside>
    </div>
  )
}

function TransformSection({
  label,
  value,
  step,
  min,
  suffix,
  onChange,
}: {
  label: string
  value: [number, number, number]
  step: number
  min?: number
  suffix?: string
  onChange: (
    value: [number, number, number],
  ) => void
}) {
  return (
    <section>
      <span className="prop-section-title">{label}</span>
      <VectorSection
        value={value}
        step={step}
        min={min}
        suffix={suffix}
        onChange={onChange}
      />
    </section>
  )
}

function VectorSection({
  value,
  step,
  min,
  suffix,
  onChange,
}: {
  value: [number, number, number]
  step: number
  min?: number
  suffix?: string
  onChange: (
    value: [number, number, number],
  ) => void
}) {
  const axes = ['X', 'Y', 'Z'] as const
  return (
    <div className="prop-vector-fields">
      {axes.map((axis, index) => (
        <label key={axis}>
          <span>{axis}</span>
          <input
            type="number"
            step={step}
            min={min}
            value={round(
              value[index],
              suffix ? 1 : 3,
            )}
            onChange={(event) => {
              const number = Number(
                event.target.value,
              )
              if (!Number.isFinite(number)) return
              const next = [...value] as [
                number,
                number,
                number,
              ]
              next[index] =
                min !== undefined
                  ? Math.max(min, number)
                  : number
              onChange(next)
            }}
          />
          {suffix && <em>{suffix}</em>}
        </label>
      ))}
    </div>
  )
}

function NumericField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <div className="prop-number-with-suffix">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const number = Number(
              event.target.value,
            )
            if (!Number.isFinite(number)) return
            onChange(
              Math.max(
                min,
                Math.min(max, number),
              ),
            )
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}

function categoryGlyph(category: PropCategory) {
  if (category === 'storage') return '▣'
  if (category === 'furniture') return '▤'
  if (category === 'camp') return '⌂'
  if (category === 'architecture') return '▥'
  if (category === 'market') return '◇'
  if (category === 'graveyard') return '†'
  if (category === 'dungeon') return '◆'
  if (category === 'lighting') return '✦'
  if (category === 'utility') return '⚒'
  if (category === 'nature') return '♧'
  return '□'
}

function categoryLabel(category: PropCategory) {
  return (
    PROP_CATEGORIES.find(
      (candidate) => candidate.id === category,
    )?.label ?? category
  )
}

function uniqueGroupName(
  existing: string[],
  base: string,
) {
  const names = new Set(
    existing.map((value) => value.trim()),
  )
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base} ${index}`)) {
    index += 1
  }
  return `${base} ${index}`
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    (target instanceof HTMLElement &&
      target.isContentEditable)
  )
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
    'forge-prop'
  )
}
