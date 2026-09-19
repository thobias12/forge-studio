import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  Flame,
  Focus,
  Grid3X3,
  MapPin,
  Maximize2,
  Minus,
  Mountain,
  Move,
  PackagePlus,
  Plus,
  RotateCw,
  Save,
  Trash2,
  Triangle,
  Upload,
} from 'lucide-react'
import PoiForgeViewport, {
  type PoiForgeTransformMode,
} from '../components/PoiForgeViewport'
import {
  POI_MATERIALS,
  POI_PART_LIBRARY,
  clonePoiPrefab,
  createBlankPoiPrefab,
  createPoiPart,
  loadPoiPrefabs,
  parsePoiPrefabJson,
  savePoiPrefabs,
  serializePoiPrefab,
  starterPoiPrefabs,
  touchPoiPrefab,
  validatePoiPrefab,
  type PoiPartKind,
  type PoiPrefab,
  type PoiPrefabCategory,
  type PoiPrefabPart,
} from '../lib/poiPrefab'
import '../poi-forge.css'

const partIcons: Record<PoiPartKind, typeof Box> = {
  box: Box,
  cylinder: CircleDot,
  rock: Mountain,
  tent: Triangle,
  log: Minus,
  torch: Flame,
  entry: MapPin,
}

const categories: Array<{ id: PoiPrefabCategory; label: string }> = [
  { id: 'camp', label: 'Camp / Settlement' },
  { id: 'shrine', label: 'Shrine / Ritual' },
  { id: 'ruins', label: 'Ruins' },
  { id: 'watchtower', label: 'Watchtower' },
  { id: 'graveyard', label: 'Graveyard' },
  { id: 'den', label: 'Natural Den' },
  { id: 'custom', label: 'Custom' },
]

export default function PoiForge() {
  const [prefabs, setPrefabs] = useState<PoiPrefab[]>(() => loadPoiPrefabs())
  const [activeId, setActiveId] = useState(() => loadPoiPrefabs()[0]?.id ?? '')
  const [selectedPartId, setSelectedPartId] = useState<string>()
  const [mode, setMode] = useState<PoiForgeTransformMode>('translate')
  const [topDown, setTopDown] = useState(false)
  const [focusNonce, setFocusNonce] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('POI Forge ready. Select a starter landmark or create a blank prefab.')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active = prefabs.find((prefab) => prefab.id === activeId) ?? prefabs[0]
  const selectedPart = active?.parts.find((part) => part.id === selectedPartId)
  const validation = active ? validatePoiPrefab(active) : undefined
  const filteredPrefabs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return prefabs
    return prefabs.filter((prefab) =>
      `${prefab.name} ${prefab.category} ${prefab.description}`
        .toLowerCase()
        .includes(needle),
    )
  }, [prefabs, query])

  useEffect(() => {
    savePoiPrefabs(prefabs)
  }, [prefabs])

  useEffect(() => {
    if (!active && prefabs[0]) setActiveId(prefabs[0].id)
  }, [active, prefabs])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'Delete' && selectedPartId) {
        deleteSelectedPart()
        event.preventDefault()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedPartId) {
        duplicateSelectedPart()
        event.preventDefault()
      }
      if (event.key.toLowerCase() === 'w') setMode('translate')
      if (event.key.toLowerCase() === 'e') setMode('rotate')
      if (event.key.toLowerCase() === 'r') setMode('scale')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPartId, activeId, prefabs])

  if (!active) {
    return (
      <div className="poi-forge-empty">
        <PackagePlus size={34}/>
        <strong>No POI prefabs</strong>
        <button onClick={() => {
          const next = createBlankPoiPrefab()
          setPrefabs([next])
          setActiveId(next.id)
        }}>Create prefab</button>
      </div>
    )
  }

  const mutateActive = (
    update: (prefab: PoiPrefab) => PoiPrefab,
    message?: string,
  ) => {
    setPrefabs((current) =>
      current.map((prefab) =>
        prefab.id === active.id
          ? touchPoiPrefab(update(prefab))
          : prefab,
      ),
    )
    if (message) setStatus(message)
  }

  const patchActive = (patch: Partial<PoiPrefab>, message?: string) => {
    mutateActive((prefab) => ({ ...prefab, ...patch }), message)
  }

  const commitPart = (part: PoiPrefabPart) => {
    mutateActive(
      (prefab) => ({
        ...prefab,
        parts: prefab.parts.map((candidate) =>
          candidate.id === part.id ? part : candidate,
        ),
      }),
      'Transform saved to the prefab.',
    )
  }

  const patchSelectedPart = (
    patch: Partial<PoiPrefabPart>,
    message?: string,
  ) => {
    if (!selectedPart) return
    commitPart({ ...selectedPart, ...patch })
    if (message) setStatus(message)
  }

  const addPart = (kind: PoiPartKind) => {
    if (kind === 'entry') {
      const existing = active.parts.find((part) => part.kind === 'entry')
      if (existing) {
        setSelectedPartId(existing.id)
        setStatus('This prefab already has an Access Marker. Selected it instead.')
        return
      }
    }
    const part = createPoiPart(kind)
    mutateActive(
      (prefab) => ({ ...prefab, parts: [...prefab.parts, part] }),
      `${part.name} added. Use W/E/R or the toolbar to move, rotate and scale it.`,
    )
    setSelectedPartId(part.id)
    setMode('translate')
  }

  const deleteSelectedPart = () => {
    if (!selectedPartId) return
    mutateActive(
      (prefab) => ({
        ...prefab,
        parts: prefab.parts.filter((part) => part.id !== selectedPartId),
      }),
      'Part removed from prefab.',
    )
    setSelectedPartId(undefined)
  }

  const duplicateSelectedPart = () => {
    if (!selectedPart) return
    if (selectedPart.kind === 'entry') {
      setStatus('Access Marker is intentionally unique. Move the existing marker instead.')
      return
    }
    const duplicate = createPoiPart(selectedPart.kind, {
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
      (prefab) => ({ ...prefab, parts: [...prefab.parts, duplicate] }),
      'Part duplicated.',
    )
    setSelectedPartId(duplicate.id)
  }

  const createPrefab = () => {
    const next = createBlankPoiPrefab()
    setPrefabs((current) => [...current, next])
    setActiveId(next.id)
    setSelectedPartId(next.parts[0]?.id)
    setStatus('Blank prefab created.')
  }

  const duplicatePrefab = () => {
    const next = clonePoiPrefab(active)
    setPrefabs((current) => [...current, next])
    setActiveId(next.id)
    setSelectedPartId(undefined)
    setStatus('Prefab duplicated. This copy can be edited independently.')
  }

  const deletePrefab = () => {
    if (!window.confirm(`Delete “${active.name}” from the local POI library?`)) return
    const next = prefabs.filter((prefab) => prefab.id !== active.id)
    if (!next.length) {
      const blank = createBlankPoiPrefab()
      setPrefabs([blank])
      setActiveId(blank.id)
    } else {
      setPrefabs(next)
      setActiveId(next[0].id)
    }
    setSelectedPartId(undefined)
    setStatus('Prefab deleted.')
  }

  const resetStarters = () => {
    if (!window.confirm('Restore the six starter POI prefabs? This replaces the current local POI library.')) return
    const next = starterPoiPrefabs()
    setPrefabs(next)
    setActiveId(next[0].id)
    setSelectedPartId(undefined)
    setStatus('Starter POI library restored.')
  }

  const exportPrefab = () => {
    const blob = new Blob([serializePoiPrefab(active)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug(active.name)}.forge-poi.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setStatus('Prefab exported as portable Forge POI JSON.')
  }

  const importPrefab = async (file?: File) => {
    if (!file) return
    try {
      const imported = parsePoiPrefabJson(await file.text())
      setPrefabs((current) => [...current, imported])
      setActiveId(imported.id)
      setSelectedPartId(undefined)
      setStatus('POI prefab imported into the local library.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import prefab.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="poi-forge-page">
      <aside className="poi-forge-library">
        <header>
          <div><span>LANDMARK LIBRARY</span><strong>POI Forge</strong></div>
          <button title="New prefab" onClick={createPrefab}><Plus size={15}/></button>
        </header>

        <label className="poi-library-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prefabs…"
          />
        </label>

        <div className="poi-prefab-list">
          {filteredPrefabs.map((prefab) => {
            const result = validatePoiPrefab(prefab)
            return (
              <button
                key={prefab.id}
                className={prefab.id === active.id ? 'active' : ''}
                onClick={() => {
                  setActiveId(prefab.id)
                  setSelectedPartId(undefined)
                }}
              >
                <span className="poi-prefab-thumb">{categoryGlyph(prefab.category)}</span>
                <span>
                  <strong>{prefab.name}</strong>
                  <small>{prefab.category} · {prefab.parts.length} parts</small>
                </span>
                {result.ready
                  ? <CheckCircle2 className="ready" size={13}/>
                  : <AlertTriangle className="warning" size={13}/>}
              </button>
            )
          })}
        </div>

        <section className="poi-library-actions">
          <button onClick={duplicatePrefab}><Copy size={13}/> Duplicate</button>
          <button onClick={exportPrefab}><Download size={13}/> Export</button>
          <button onClick={() => fileInputRef.current?.click()}><Upload size={13}/> Import</button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".json,.forge-poi.json,application/json"
            onChange={(event) => void importPrefab(event.target.files?.[0])}
          />
          <button className="danger" onClick={deletePrefab}><Trash2 size={13}/> Delete</button>
        </section>

        <button className="poi-reset-starters" onClick={resetStarters}>
          Restore starter library
        </button>
      </aside>

      <main className="poi-forge-workspace">
        <header className="poi-forge-toolbar">
          <div className="poi-toolbar-title">
            <span>POI PREFAB</span>
            <input
              value={active.name}
              onChange={(event) => patchActive({ name: event.target.value })}
            />
          </div>

          <div className="poi-transform-tools">
            <button
              className={mode === 'translate' ? 'active' : ''}
              title="Move (W)"
              onClick={() => setMode('translate')}
            ><Move size={15}/><span>Move</span></button>
            <button
              className={mode === 'rotate' ? 'active' : ''}
              title="Rotate (E)"
              onClick={() => setMode('rotate')}
            ><RotateCw size={15}/><span>Rotate</span></button>
            <button
              className={mode === 'scale' ? 'active' : ''}
              title="Scale (R)"
              onClick={() => setMode('scale')}
            ><Maximize2 size={15}/><span>Scale</span></button>
          </div>

          <div className="poi-toolbar-actions">
            <button
              className={active.snap ? 'active' : ''}
              onClick={() => patchActive({ snap: !active.snap }, 'Snapping updated.')}
            ><Grid3X3 size={14}/> Snap</button>
            <button
              className={topDown ? 'active' : ''}
              onClick={() => setTopDown((value) => !value)}
            >Top</button>
            <button
              disabled={!selectedPart}
              onClick={() => setFocusNonce((value) => value + 1)}
            ><Focus size={14}/> Focus</button>
            <button className="primary" onClick={() => {
              savePoiPrefabs(prefabs)
              setStatus('POI library saved locally.')
            }}><Save size={14}/> Save</button>
          </div>
        </header>

        <section className="poi-forge-stage">
          <PoiForgeViewport
            prefab={active}
            selectedPartId={selectedPartId}
            mode={mode}
            topDown={topDown}
            focusNonce={focusNonce}
            onSelectPart={setSelectedPartId}
            onCommitPart={commitPart}
          />

          <div className="poi-part-palette">
            <span>ADD PART</span>
            {POI_PART_LIBRARY.map((item) => {
              const Icon = partIcons[item.kind]
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

          <div className="poi-stage-status">
            <span>{status}</span>
            <strong>
              {active.snap ? `Snap ${active.gridSize}m` : 'Free transform'}
              {' · '}
              {active.parts.length} parts
            </strong>
          </div>
        </section>
      </main>

      <aside className="poi-forge-inspector">
        <header>
          <span>INSPECTOR</span>
          <strong>{selectedPart?.name ?? active.name}</strong>
        </header>

        {selectedPart ? (
          <>
            <section>
              <div className="poi-inspector-heading">
                <span>SELECTED PART</span>
                <div>
                  <button title="Duplicate" onClick={duplicateSelectedPart}><Copy size={13}/></button>
                  <button title="Delete" className="danger" onClick={deleteSelectedPart}><Trash2 size={13}/></button>
                </div>
              </div>
              <label className="poi-field">
                <span>Name</span>
                <input
                  value={selectedPart.name}
                  onChange={(event) => patchSelectedPart({ name: event.target.value })}
                />
              </label>
              <div className="poi-field">
                <span>Type</span>
                <strong>{selectedPart.kind}</strong>
              </div>
              {selectedPart.kind !== 'entry' && (
                <label className="poi-field">
                  <span>Material</span>
                  <select
                    value={selectedPart.material}
                    onChange={(event) => patchSelectedPart({
                      material: event.target.value as PoiPrefabPart['material'],
                      color: undefined,
                    })}
                  >
                    {POI_MATERIALS.map((material) => (
                      <option key={material.id} value={material.id}>{material.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {selectedPart.kind !== 'entry' && (
                <div className="poi-field poi-color-field">
                  <span>Color override</span>
                  <input
                    type="color"
                    value={selectedPart.color ?? '#686b61'}
                    onChange={(event) => patchSelectedPart({ color: event.target.value })}
                  />
                  {selectedPart.color && (
                    <button onClick={() => patchSelectedPart({ color: undefined })}>Reset</button>
                  )}
                </div>
              )}
              <label className="poi-check-field">
                <input
                  type="checkbox"
                  checked={selectedPart.solid}
                  disabled={selectedPart.kind === 'entry'}
                  onChange={(event) => patchSelectedPart({ solid: event.target.checked })}
                />
                <span><strong>Solid landmark piece</strong><small>Reserved for future collision/navigation baking.</small></span>
              </label>
            </section>

            <TransformSection
              label="Position"
              value={selectedPart.position}
              step={active.gridSize}
              onChange={(position) => patchSelectedPart({ position })}
            />
            <TransformSection
              label="Rotation"
              value={selectedPart.rotation.map((value) => radiansToDegrees(value)) as [number, number, number]}
              step={15}
              suffix="°"
              onChange={(rotation) => patchSelectedPart({
                rotation: rotation.map((value) => degreesToRadians(value)) as [number, number, number],
              })}
            />
            <TransformSection
              label="Scale"
              value={selectedPart.scale}
              step={.1}
              min={.05}
              onChange={(scale) => patchSelectedPart({ scale })}
            />
          </>
        ) : (
          <>
            <section>
              <span className="poi-section-title">PREFAB SETTINGS</span>
              <label className="poi-field">
                <span>Category</span>
                <select
                  value={active.category}
                  onChange={(event) => patchActive({
                    category: event.target.value as PoiPrefabCategory,
                  })}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </select>
              </label>
              <label className="poi-field vertical">
                <span>Description</span>
                <textarea
                  value={active.description}
                  rows={4}
                  onChange={(event) => patchActive({ description: event.target.value })}
                />
              </label>
              <label className="poi-field">
                <span>Grid size</span>
                <select
                  value={active.gridSize}
                  onChange={(event) => patchActive({ gridSize: Number(event.target.value) })}
                >
                  <option value={.1}>0.1 m</option>
                  <option value={.25}>0.25 m</option>
                  <option value={.5}>0.5 m</option>
                  <option value={1}>1 m</option>
                  <option value={2}>2 m</option>
                </select>
              </label>
            </section>

            <section>
              <span className="poi-section-title">WORLD FOOTPRINT</span>
              <div className="poi-two-fields">
                <NumericField
                  label="Width"
                  value={active.bounds.width}
                  min={4}
                  step={.5}
                  onChange={(width) => patchActive({
                    bounds: { ...active.bounds, width },
                  })}
                />
                <NumericField
                  label="Depth"
                  value={active.bounds.depth}
                  min={4}
                  step={.5}
                  onChange={(depth) => patchActive({
                    bounds: { ...active.bounds, depth },
                  })}
                />
              </div>
              <p className="poi-help">
                The footprint is the authored landmark area. It does not change World Forge terrain or POI topology.
              </p>
            </section>

            <section className={validation?.ready ? 'poi-validation ready' : 'poi-validation warning'}>
              <div>
                {validation?.ready ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}
                <span>
                  <strong>{validation?.ready ? 'World-ready prefab' : 'Needs attention'}</strong>
                  <small>
                    {validation?.solidCount ?? 0} solid · {validation?.entryCount ?? 0} access marker
                  </small>
                </span>
              </div>
              {validation?.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              {validation?.ready && <p>Ready for future World Forge prefab binding.</p>}
            </section>
          </>
        )}

        <footer className="poi-inspector-tip">
          <strong>Viewport shortcuts</strong>
          <span>W move · E rotate · R scale · Del delete · Ctrl+D duplicate</span>
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
  onChange: (value: [number, number, number]) => void
}) {
  const axes = ['X', 'Y', 'Z'] as const
  return (
    <section>
      <span className="poi-section-title">{label}</span>
      <div className="poi-vector-fields">
        {axes.map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input
              type="number"
              step={step}
              min={min}
              value={round(value[index], label === 'Rotation' ? 1 : 2)}
              onChange={(event) => {
                const next = [...value] as [number, number, number]
                const number = Number(event.target.value)
                if (!Number.isFinite(number)) return
                next[index] = min !== undefined ? Math.max(min, number) : number
                onChange(next)
              }}
            />
            {suffix && <em>{suffix}</em>}
          </label>
        ))}
      </div>
    </section>
  )
}

function NumericField({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => {
          const number = Number(event.target.value)
          if (Number.isFinite(number)) onChange(Math.max(min, number))
        }}
      />
    </label>
  )
}

function categoryGlyph(category: PoiPrefabCategory) {
  if (category === 'camp') return '⛺'
  if (category === 'shrine') return '✦'
  if (category === 'ruins') return '▥'
  if (category === 'watchtower') return '♜'
  if (category === 'graveyard') return '†'
  if (category === 'den') return '◆'
  return '◇'
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
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'forge-poi'
}
