import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Copy, Download, FileUp, Library, Pause, Play, RotateCcw, Scissors, Trash2 } from 'lucide-react'
import AnimationPreview from '../components/AnimationPreview'
import { downloadBlob } from '../lib/animationBake'
import { createEditedClip, defaultClipEdit, exportAnimationSet, formatSeconds, type AnimationClipEdit, type RootMotionMode } from '../lib/animationEdit'
import { saveAsset } from '../lib/library'
import '../animation.css'

type ClipItem = { id: string; source: THREE.AnimationClip; edit: AnimationClipEdit }
type SeekRequest = { id: number; time: number }

export default function AnimationStudio() {
  const [modelUrl, setModelUrl] = useState('')
  const [modelName, setModelName] = useState('')
  const [clips, setClips] = useState<ClipItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [playing, setPlaying] = useState(false)
  const [loopPreview, setLoopPreview] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<SeekRequest>()
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  const seekIdRef = useRef(0)

  useEffect(() => () => { if (modelUrl) URL.revokeObjectURL(modelUrl) }, [modelUrl])

  const selected = clips.find((item) => item.id === selectedId)
  const editedClip = useMemo(() => selected ? createEditedClip(selected.source, selected.edit) : undefined, [selected])
  const editedDuration = editedClip?.duration ?? 0

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    seekIdRef.current += 1
    setSeekRequest({ id: seekIdRef.current, time: 0 })
  }, [selectedId, selected?.edit])

  const importGlb = async (file?: File) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setStatus('Reading animation clips…')
    try {
      const gltf = await new GLTFLoader().loadAsync(url)
      const nextClips = gltf.animations.map((clip, index) => ({ id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`, source: clip, edit: defaultClipEdit(clip) }))
      if (!nextClips.length) throw new Error('This GLB does not contain any animation clips.')
      if (modelUrl) URL.revokeObjectURL(modelUrl)
      setModelUrl(url)
      setModelName(file.name)
      setClips(nextClips)
      setSelectedId(nextClips[0].id)
      setPlaying(false)
      setCurrentTime(0)
      setStatus(`${nextClips.length} animation clip${nextClips.length === 1 ? '' : 's'} loaded`)
    } catch (error) {
      URL.revokeObjectURL(url)
      const message = error instanceof Error ? error.message : 'Could not open this GLB.'
      setStatus(message)
      alert(message)
    }
  }

  const updateEdit = (patch: Partial<AnimationClipEdit>) => {
    if (!selected) return
    setClips((items) => items.map((item) => item.id === selected.id ? { ...item, edit: { ...item.edit, ...patch } } : item))
    setStatus('')
  }

  const duplicateSelected = () => {
    if (!selected) return
    const id = `${Date.now()}-copy-${Math.random().toString(36).slice(2)}`
    const copy: ClipItem = { id, source: selected.source.clone(), edit: { ...selected.edit, name: `${selected.edit.name} Copy` } }
    setClips((items) => [...items, copy])
    setSelectedId(id)
    setStatus('Clip duplicated')
  }

  const deleteSelected = () => {
    if (!selected) return
    const remaining = clips.filter((item) => item.id !== selected.id)
    setClips(remaining)
    setSelectedId(remaining[0]?.id ?? '')
    setStatus('Clip removed from this export set')
  }

  const resetSelected = () => {
    if (!selected) return
    updateEdit(defaultClipEdit(selected.source))
    setStatus('Clip edits reset')
  }

  const seek = (time: number) => {
    const clamped = THREE.MathUtils.clamp(time, 0, Math.max(0, editedDuration))
    setCurrentTime(clamped)
    seekIdRef.current += 1
    setSeekRequest({ id: seekIdRef.current, time: clamped })
  }

  const buildEditedGlb = async () => {
    if (!modelUrl || !clips.length) throw new Error('There are no animation clips to build.')
    const edited = clips.map((item) => createEditedClip(item.source, item.edit))
    return { edited, blob: await exportAnimationSet(modelUrl, edited) }
  }

  const exportGlb = async () => {
    if (!modelUrl || !clips.length) return
    setExporting(true); setPlaying(false); setStatus('Building edited animation set…')
    try {
      const { edited, blob } = await buildEditedGlb()
      const base = safeBase(modelName)
      downloadBlob(`${base}-animations.glb`, blob)
      setStatus(`${edited.length} edited clip${edited.length === 1 ? '' : 's'} exported to GLB`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Animation export failed.'
      setStatus(`Export failed: ${message}`); alert(message)
    } finally { setExporting(false) }
  }

  const saveToLibrary = async () => {
    if (!modelUrl || !clips.length) return
    setExporting(true); setPlaying(false); setStatus('Building animation set for the Shared Asset Library…')
    try {
      const { edited, blob } = await buildEditedGlb()
      const name = `${safeBase(modelName)} Animations`
      await saveAsset({ name, category: 'animations', kind: 'glb', mime: 'model/gltf-binary', tags: ['animation', ...edited.map((clip) => clip.name.toLowerCase()).slice(0, 8)], source: 'Forge Animation Studio', blob })
      setStatus(`${name} saved to the Shared Asset Library. Gameplay Forge can bind it immediately.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the animation set.'
      setStatus(`Library save failed: ${message}`); alert(message)
    } finally { setExporting(false) }
  }

  if (!modelUrl) return <div className="animation-empty-page"><div className="animation-empty-card"><div className="animation-empty-icon"><Scissors size={30}/></div><span className="eyebrow">ANIMATION STUDIO</span><h1>Edit game-ready clips</h1><p>Import an animated GLB from Mocap or any other rigged character. Forge will load every embedded clip into the editor.</p><label className="primary-button animation-import-button"><FileUp size={17}/> Import animated GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => importGlb(event.target.files?.[0])}/></label>{status && <div className="animation-status">{status}</div>}</div></div>

  const sourceDuration = selected?.source.duration ?? 0
  const trimStart = selected?.edit.trimStart ?? 0
  const trimEnd = selected?.edit.trimEnd ?? sourceDuration

  return <div className="animation-studio">
    <div className="animation-toolbar"><div><span className="eyebrow">ANIMATION STUDIO</span><strong>{modelName}</strong></div><div className="animation-toolbar-actions"><label className="secondary-button file-button"><FileUp size={16}/> Replace GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => importGlb(event.target.files?.[0])}/></label><button className="secondary-button" disabled={exporting || !clips.length} onClick={() => void saveToLibrary()}><Library size={16}/> {exporting ? 'Building…' : 'Save to Library'}</button><button className="primary-button" disabled={exporting || !clips.length} onClick={() => void exportGlb()}><Download size={16}/> {exporting ? 'Building…' : 'Export edited GLB'}</button></div></div>

    <div className="animation-workspace">
      <aside className="clip-browser"><div className="panel-heading"><span>CLIPS</span><b>{clips.length}</b></div><div className="clip-list">{clips.map((item, index) => { const preview = createEditedClip(item.source, item.edit); return <button key={item.id} className={`clip-row ${item.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}><span className="clip-index">{String(index + 1).padStart(2, '0')}</span><span className="clip-copy"><strong>{item.edit.name}</strong><small>{formatSeconds(preview.duration)} · {preview.tracks.length} tracks</small></span></button> })}</div><div className="clip-actions"><button disabled={!selected} onClick={duplicateSelected}><Copy size={14}/> Duplicate</button><button disabled={!selected || clips.length <= 1} onClick={deleteSelected}><Trash2 size={14}/> Delete</button></div></aside>

      <section className="animation-center">{editedClip && <AnimationPreview className="animation-preview" src={modelUrl} clip={editedClip} playing={playing} loop={loopPreview} seekRequest={seekRequest} onTime={(time) => setCurrentTime(time)} onEnded={() => setPlaying(false)}/>}<div className="animation-preview-overlay"><span className="character-dot"/><span>{selected?.edit.name}</span></div><div className="animation-transport"><button className="icon-button" onClick={() => { setPlaying(false); seek(0) }}><RotateCcw size={16}/></button><button className="play-button" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><span className="animation-time">{formatSeconds(currentTime)} / {formatSeconds(editedDuration)}</span><input type="range" min={0} max={Math.max(0.001, editedDuration)} step="0.001" value={Math.min(currentTime, editedDuration)} onChange={(event) => { setPlaying(false); seek(Number(event.target.value)) }}/><label className="transport-loop"><input type="checkbox" checked={loopPreview} onChange={(event) => setLoopPreview(event.target.checked)}/><span>Loop preview</span></label></div><div className="animation-timeline"><div className="timeline-ruler"><span>IN {formatSeconds(trimStart)}</span><span>EDITED {formatSeconds(editedDuration)}</span><span>OUT {formatSeconds(trimEnd)}</span></div><div className="animation-track-row"><div className="track-label">{selected?.edit.name}</div><div className="animation-clip-block"><span>{editedClip?.tracks.length ?? 0} tracks</span><b>{selected?.edit.speed.toFixed(2)}×</b></div></div></div></section>

      <aside className="animation-inspector"><div className="panel-heading"><span>CLIP INSPECTOR</span></div>{selected && <><div className="animation-property"><label>Name</label><input className="text-input" value={selected.edit.name} onChange={(event) => updateEdit({ name: event.target.value })}/></div><div className="animation-property trim-property"><div className="property-title"><span>Trim / crop</span><em>{formatSeconds(sourceDuration)} source</em></div><label><span>Start</span><input type="number" min={0} max={Math.max(0, trimEnd - 0.01)} step="0.01" value={trimStart.toFixed(2)} onChange={(event) => updateEdit({ trimStart: THREE.MathUtils.clamp(Number(event.target.value), 0, Math.max(0, trimEnd - 0.01)) })}/></label><input type="range" min={0} max={Math.max(0.01, sourceDuration)} step="0.01" value={trimStart} onChange={(event) => updateEdit({ trimStart: Math.min(Number(event.target.value), trimEnd - 0.01) })}/><label><span>End</span><input type="number" min={trimStart + 0.01} max={sourceDuration} step="0.01" value={trimEnd.toFixed(2)} onChange={(event) => updateEdit({ trimEnd: THREE.MathUtils.clamp(Number(event.target.value), trimStart + 0.01, sourceDuration) })}/></label><input type="range" min={0.01} max={Math.max(0.01, sourceDuration)} step="0.01" value={trimEnd} onChange={(event) => updateEdit({ trimEnd: Math.max(Number(event.target.value), trimStart + 0.01) })}/></div><div className="animation-property"><div className="property-title"><span>Playback speed</span><em>{selected.edit.speed.toFixed(2)}×</em></div><input type="range" min="0.25" max="2.5" step="0.05" value={selected.edit.speed} onChange={(event) => updateEdit({ speed: Number(event.target.value) })}/><div className="speed-presets"><button onClick={() => updateEdit({ speed: 0.5 })}>0.5×</button><button onClick={() => updateEdit({ speed: 1 })}>1×</button><button onClick={() => updateEdit({ speed: 1.5 })}>1.5×</button><button onClick={() => updateEdit({ speed: 2 })}>2×</button></div></div><div className="animation-property"><div className="property-title"><span>Loop tools</span></div><label className="toggle-setting"><span><b>Close loop</b><small>Force the exported final pose to match the first pose.</small></span><input type="checkbox" checked={selected.edit.closeLoop} onChange={(event) => updateEdit({ closeLoop: event.target.checked })}/></label></div><div className="animation-property"><div className="property-title"><span>Root motion</span></div><select className="animation-select" value={selected.edit.rootMotion} onChange={(event) => updateEdit({ rootMotion: event.target.value as RootMotionMode })}><option value="keep">Keep root motion</option><option value="horizontal">Remove X/Z travel</option><option value="all">Lock root position</option></select><p className="property-help">Useful for converting a moving walk/run into an in-place game animation.</p></div><div className="animation-property clip-summary"><div className="mini-row"><span>Source</span><span>{formatSeconds(sourceDuration)}</span></div><div className="mini-row"><span>Edited</span><span className="status-good">{formatSeconds(editedDuration)}</span></div><div className="mini-row"><span>Tracks</span><span>{editedClip?.tracks.length ?? 0}</span></div></div><button className="secondary-button reset-animation-button" onClick={resetSelected}><RotateCcw size={14}/> Reset clip edits</button></>}{status && <div className={`animation-status ${status.startsWith('Export failed') || status.startsWith('Library save failed') ? 'error' : ''}`}>{status}</div>}</aside>
    </div>
  </div>
}

function safeBase(name: string) { return name.replace(/\.glb$/i, '').replace(/[^a-z0-9_-]+/gi, '-') || 'forge-character' }
