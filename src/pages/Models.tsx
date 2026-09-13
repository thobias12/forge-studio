import { useRef, useState } from 'react'
import { Box, Circle, Cylinder, Download, Grid3X3, Library, MousePointer2, Redo2, Save, Scaling, Square, Undo2, Waypoints } from 'lucide-react'
import ModelCreatorViewport, { type ModelCreatorHandle, type ModelCreatorStats, type TransformTool } from '../components/ModelCreatorViewport'
import { saveAsset } from '../lib/library'
import type { EditMode, PrimitiveKind } from '../lib/modelCreator'
import '../model-creator.css'

const emptyStats: ModelCreatorStats = {
  vertices: 0,
  faces: 0,
  selectedVertices: 0,
  selectedFace: -1,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

export default function Models() {
  const editor = useRef<ModelCreatorHandle>(null)
  const [name, setName] = useState('Forge Model')
  const [primitive, setPrimitive] = useState<PrimitiveKind>('cube')
  const [mode, setMode] = useState<EditMode>('object')
  const [tool, setTool] = useState<TransformTool>('translate')
  const [snap, setSnap] = useState(0.1)
  const [flatShading, setFlatShading] = useState(true)
  const [stats, setStats] = useState<ModelCreatorStats>(emptyStats)
  const [status, setStatus] = useState('Create a primitive, then switch between Object, Vertex and Face editing.')
  const [busy, setBusy] = useState(false)

  const changeMode = (next: EditMode) => {
    setMode(next)
    editor.current?.setMode(next)
    setStatus(next === 'object'
      ? 'Object mode: move, rotate and scale the whole model.'
      : next === 'vertex'
        ? 'Vertex mode: click vertices to select them. Shift-click adds/removes from the selection.'
        : 'Face mode: click a triangle, then use Extrude, Inset or Bevel.')
  }

  const changeTool = (next: TransformTool) => {
    setTool(next)
    editor.current?.setTool(next)
  }

  const create = (kind: PrimitiveKind) => {
    setPrimitive(kind)
    editor.current?.newPrimitive(kind)
  }

  const exportModel = async (saveToLibrary: boolean) => {
    if (!editor.current) return
    setBusy(true)
    try {
      const blob = await editor.current.exportGlb(name)
      if (saveToLibrary) {
        await saveAsset({
          name: name.trim() || 'Forge Model',
          category: 'props',
          kind: 'glb',
          mime: 'model/gltf-binary',
          tags: ['forge-created'],
          source: 'Forge Model Creator',
          blob,
        })
        setStatus(`${name || 'Forge Model'} saved to the Shared Asset Library.`)
      } else {
        download(blob, `${safeName(name)}.glb`)
        setStatus(`${name || 'Forge Model'} exported as GLB.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not export this model.')
    } finally {
      setBusy(false)
    }
  }

  const setTransform = (kind: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => {
    editor.current?.setObjectTransform(kind, axis, value)
  }

  return (
    <div className="model-creator-page">
      <aside className="model-creator-left">
        <div className="creator-panel-title"><Waypoints size={15} /><span>MODEL CREATOR</span></div>

        <section className="creator-section">
          <div className="creator-section-title">NEW PRIMITIVE</div>
          <div className="primitive-grid">
            <PrimitiveButton icon={<Box size={17} />} label="Cube" active={primitive === 'cube'} onClick={() => create('cube')} />
            <PrimitiveButton icon={<Circle size={17} />} label="Sphere" active={primitive === 'sphere'} onClick={() => create('sphere')} />
            <PrimitiveButton icon={<Cylinder size={17} />} label="Cylinder" active={primitive === 'cylinder'} onClick={() => create('cylinder')} />
            <PrimitiveButton icon={<Square size={17} />} label="Plane" active={primitive === 'plane'} onClick={() => create('plane')} />
          </div>
        </section>

        <section className="creator-section">
          <div className="creator-section-title">EDIT MODE</div>
          <div className="creator-segmented">
            {(['object', 'vertex', 'face'] as EditMode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => changeMode(item)}>{item}</button>)}
          </div>
          {mode === 'object' && (
            <div className="creator-tool-row">
              <button className={tool === 'translate' ? 'active' : ''} onClick={() => changeTool('translate')}><MousePointer2 size={13} /> Move</button>
              <button className={tool === 'rotate' ? 'active' : ''} onClick={() => changeTool('rotate')}><Circle size={13} /> Rotate</button>
              <button className={tool === 'scale' ? 'active' : ''} onClick={() => changeTool('scale')}><Scaling size={13} /> Scale</button>
            </div>
          )}
        </section>

        {mode === 'vertex' && (
          <section className="creator-section">
            <div className="creator-section-title">VERTEX TOOLS</div>
            <div className="creator-selection-row"><span>{stats.selectedVertices} selected</span><button onClick={() => editor.current?.selectAllVertices()}>Select all</button><button onClick={() => editor.current?.clearSelection()}>Clear</button></div>
            <div className="creator-nudge-grid">
              <Nudge label="X−" onClick={() => editor.current?.nudgeSelection('x', -1)} />
              <Nudge label="X+" onClick={() => editor.current?.nudgeSelection('x', 1)} />
              <Nudge label="Y−" onClick={() => editor.current?.nudgeSelection('y', -1)} />
              <Nudge label="Y+" onClick={() => editor.current?.nudgeSelection('y', 1)} />
              <Nudge label="Z−" onClick={() => editor.current?.nudgeSelection('z', -1)} />
              <Nudge label="Z+" onClick={() => editor.current?.nudgeSelection('z', 1)} />
            </div>
            <p className="creator-help">Each nudge uses the current grid snap. Set Snap to 0 for fine 0.05-unit movement.</p>
          </section>
        )}

        {mode === 'face' && (
          <section className="creator-section">
            <div className="creator-section-title">FACE TOOLS</div>
            <div className="creator-face-selected">{stats.selectedFace >= 0 ? `Face ${stats.selectedFace + 1} selected` : 'Click a face in the viewport'}</div>
            <div className="creator-stack-buttons">
              <button disabled={stats.selectedFace < 0} onClick={() => editor.current?.extrudeSelectedFace(0.18)}>Extrude <span>0.18</span></button>
              <button disabled={stats.selectedFace < 0} onClick={() => editor.current?.insetSelectedFace(0.24)}>Inset <span>24%</span></button>
              <button disabled={stats.selectedFace < 0} onClick={() => editor.current?.bevelSelectedFace(0.2, 0.06)}>Bevel <span>0.06</span></button>
            </div>
          </section>
        )}

        <section className="creator-section">
          <div className="creator-section-title">MODIFIERS</div>
          <button className="creator-wide-button" onClick={() => editor.current?.mirror('x')}><Grid3X3 size={14} /> Mirror across X</button>
          <label className="creator-toggle"><input type="checkbox" checked={flatShading} onChange={(event) => { setFlatShading(event.target.checked); editor.current?.setFlatShading(event.target.checked) }} /><span>Flat shading</span></label>
        </section>
      </aside>

      <main className="model-creator-main">
        <header className="model-creator-toolbar">
          <div><span className="eyebrow">MODEL LAB / CREATE</span><input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="model-creator-toolbar-actions">
            <button title="Undo" onClick={() => editor.current?.undo()}><Undo2 size={15} /></button>
            <button title="Redo" onClick={() => editor.current?.redo()}><Redo2 size={15} /></button>
            <label className="creator-snap"><span>Snap</span><select value={snap} onChange={(event) => { const value = Number(event.target.value); setSnap(value); editor.current?.setSnap(value) }}><option value="0">Off</option><option value="0.025">0.025</option><option value="0.05">0.05</option><option value="0.1">0.1</option><option value="0.25">0.25</option><option value="0.5">0.5</option></select></label>
            <button onClick={() => editor.current?.resetView()}>Frame</button>
          </div>
        </header>
        <div className="model-creator-stage">
          <ModelCreatorViewport ref={editor} onStats={setStats} onStatus={setStatus} />
          <div className="creator-mode-hud"><b>{mode.toUpperCase()}</b><span>{mode === 'object' ? `${tool} tool` : mode === 'vertex' ? `${stats.selectedVertices} vertices selected` : stats.selectedFace >= 0 ? `face ${stats.selectedFace + 1}` : 'select a face'}</span></div>
        </div>
        <footer className="model-creator-status"><span>{status}</span><b>{stats.vertices} verts · {Math.round(stats.faces)} tris</b></footer>
      </main>

      <aside className="model-creator-inspector">
        <div className="creator-panel-title"><Scaling size={15} /><span>INSPECTOR</span></div>
        <section className="creator-section">
          <div className="creator-section-title">TRANSFORM</div>
          <VectorFields label="Position" values={stats.position} step={snap || 0.05} onChange={(axis, value) => setTransform('position', axis, value)} />
          <VectorFields label="Rotation" values={stats.rotation} step={5} onChange={(axis, value) => setTransform('rotation', axis, value)} />
          <VectorFields label="Scale" values={stats.scale} step={0.05} onChange={(axis, value) => setTransform('scale', axis, value)} />
        </section>
        <section className="creator-section">
          <div className="creator-section-title">MESH</div>
          <div className="creator-stat-row"><span>Vertices</span><b>{stats.vertices}</b></div>
          <div className="creator-stat-row"><span>Triangles</span><b>{Math.round(stats.faces)}</b></div>
          <div className="creator-stat-row"><span>Shading</span><b>{flatShading ? 'Flat' : 'Smooth'}</b></div>
          <div className="creator-stat-row"><span>Format</span><b>GLB 2.0</b></div>
        </section>
        <section className="creator-section creator-export-section">
          <div className="creator-section-title">OUTPUT</div>
          <button className="primary-button" disabled={busy} onClick={() => void exportModel(true)}><Library size={14} /> {busy ? 'Working…' : 'Save to Library'}</button>
          <button className="secondary-button" disabled={busy} onClick={() => void exportModel(false)}><Download size={14} /> Export GLB</button>
          <p>Saved models immediately become available in Character Studio, Asset Library and Game Preview.</p>
        </section>
      </aside>
    </div>
  )
}

function PrimitiveButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Nudge({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick}>{label}</button>
}

function VectorFields({ label, values, step, onChange }: { label: string; values: [number, number, number]; step: number; onChange: (axis: 0 | 1 | 2, value: number) => void }) {
  return <div className="creator-vector"><label>{label}</label><div>{(['X', 'Y', 'Z'] as const).map((axis, index) => <span key={axis}><i>{axis}</i><input type="number" step={step} value={Number(values[index].toFixed(3))} onChange={(event) => onChange(index as 0 | 1 | 2, Number(event.target.value))} /></span>)}</div></div>
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

function safeName(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'forge-model'
}
