import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileAudio, FileUp, GripVertical, Library, Pause, Play, Plus, Redo2, Save, Trash2, Undo2, Volume2 } from 'lucide-react'
import { decodeAudioBlob } from '../lib/audioProcessing'
import { mixLayersToWav, type MixerLayer } from '../lib/audioMixer'
import { registerHistoryScope } from '../lib/historyShortcuts'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import '../audio-mixer.css'

const MAX_HISTORY = 50

export default function AudioLayerMixer() {
  const [name, setName] = useState('Forge Sound Mix')
  const [layers, setLayers] = useState<MixerLayer[]>([])
  const [library, setLibrary] = useState<LibraryAsset[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [mixUrl, setMixUrl] = useState('')
  const [rendering, setRendering] = useState(false)
  const [status, setStatus] = useState('Add audio from the Shared Library or import files, then layer the sounds on the timeline.')
  const [dragId, setDragId] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const undoStack = useRef<MixerLayer[][]>([])
  const redoStack = useRef<MixerLayer[][]>([])

  useEffect(() => {
    void listAssets().then((assets) => {
      const audio = assets.filter((asset) => asset.category === 'audio' || asset.kind === 'audio')
      setLibrary(audio)
      if (audio[0]) setSelectedAssetId(audio[0].id)
    })
  }, [])

  const cloneLayers = (items: MixerLayer[]) => items.map((layer) => ({ ...layer }))

  const commit = useCallback((next: MixerLayer[], message?: string) => {
    undoStack.current.push(cloneLayers(layers))
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    setLayers(next)
    if (message) setStatus(message)
  }, [layers])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(cloneLayers(layers))
    setLayers(previous)
    setStatus('Undid the last mixer action.')
  }, [layers])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(cloneLayers(layers))
    setLayers(next)
    setStatus('Redid the last mixer action.')
  }, [layers])

  useEffect(() => registerHistoryScope({ undo, redo, label: 'Audio Layer Mixer' }), [undo, redo])

  useEffect(() => () => {
    if (mixUrl) URL.revokeObjectURL(mixUrl)
  }, [mixUrl])

  const totalDuration = useMemo(() => {
    let result = 4
    for (const layer of layers) {
      const rate = Math.pow(2, layer.pitchSemitones / 12)
      result = Math.max(result, layer.offset + layer.duration / rate)
    }
    return Math.min(120, Math.ceil(result * 2) / 2)
  }, [layers])

  const makeLayer = async (name: string, blob: Blob) => {
    const buffer = await decodeAudioBlob(blob)
    return {
      id: crypto.randomUUID(), name, blob, duration: buffer.duration,
      offset: 0, gainDb: 0, pitchSemitones: 0, pan: 0,
      fadeIn: 0, fadeOut: 0, muted: false, solo: false, loop: false,
    } satisfies MixerLayer
  }

  const addLibraryAsset = async () => {
    const asset = library.find((item) => item.id === selectedAssetId)
    if (!asset) return
    try {
      const layer = await makeLayer(asset.name, asset.blob)
      commit([...layers, layer], `${asset.name} added as a new layer.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not decode that library sound.')
    }
  }

  const importFiles = async (files?: FileList | null) => {
    if (!files?.length) return
    const imported: MixerLayer[] = []
    try {
      for (const file of Array.from(files)) imported.push(await makeLayer(file.name.replace(/\.[^.]+$/, ''), file))
      commit([...layers, ...imported], `${imported.length} layer${imported.length === 1 ? '' : 's'} imported.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import one of those sounds.')
    }
  }

  const patchLayer = (id: string, patch: Partial<MixerLayer>, history = true) => {
    const next = layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer)
    if (history) commit(next)
    else setLayers(next)
  }

  const removeLayer = (id: string) => {
    const item = layers.find((layer) => layer.id === id)
    commit(layers.filter((layer) => layer.id !== id), `${item?.name ?? 'Layer'} removed.`)
  }

  const duplicateLayer = (id: string) => {
    const item = layers.find((layer) => layer.id === id)
    if (!item) return
    const copy = { ...item, id: crypto.randomUUID(), name: `${item.name} Copy`, offset: item.offset + 0.05 }
    const index = layers.findIndex((layer) => layer.id === id)
    const next = [...layers]
    next.splice(index + 1, 0, copy)
    commit(next, `${item.name} duplicated.`)
  }

  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const from = layers.findIndex((layer) => layer.id === dragId)
    const to = layers.findIndex((layer) => layer.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...layers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next, 'Layer order changed.')
    setDragId('')
  }

  const renderMix = async () => {
    if (!layers.length) throw new Error('Add at least one audio layer first.')
    setRendering(true)
    try {
      const result = await mixLayersToWav(layers, totalDuration)
      if (mixUrl) URL.revokeObjectURL(mixUrl)
      const url = URL.createObjectURL(result.blob)
      setMixUrl(url)
      return result
    } finally {
      setRendering(false)
    }
  }

  const preview = async () => {
    try {
      const result = await renderMix()
      setStatus(`Rendered ${result.duration.toFixed(2)}s mix preview.`)
      window.setTimeout(() => void audioRef.current?.play(), 0)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not preview the mix.')
    }
  }

  const saveMix = async (downloadOnly: boolean) => {
    try {
      const result = await renderMix()
      const filename = `${safeName(name)}.wav`
      if (downloadOnly) {
        downloadBlob(result.blob, filename)
        setStatus(`${name} exported as WAV.`)
      } else {
        await saveAsset({
          name: name.trim() || 'Forge Sound Mix', category: 'audio', kind: 'audio', mime: 'audio/wav',
          tags: ['mix', 'layered'], source: 'Forge Audio Layer Mixer', blob: result.blob,
        })
        setStatus(`${name} saved to the Shared Asset Library.`)
        const assets = await listAssets()
        setLibrary(assets.filter((asset) => asset.category === 'audio' || asset.kind === 'audio'))
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render this mix.')
    }
  }

  return (
    <div className="audio-mixer-page">
      <aside className="mixer-library-panel">
        <div className="mixer-panel-title"><Library size={15} /> SOUND SOURCES</div>
        <section className="mixer-source-card">
          <label>Shared Library<select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)}><option value="">Choose audio…</option>{library.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
          <button className="primary-button" disabled={!selectedAssetId} onClick={() => void addLibraryAsset()}><Plus size={13} /> Add as layer</button>
          <label className="secondary-button mixer-file-button"><FileUp size={13} /> Import local audio<input type="file" multiple accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac" onChange={(event) => void importFiles(event.target.files)} /></label>
        </section>
        <section className="mixer-help">
          <b>BUILD A SOUND</b>
          <p>Stack generated sounds, recordings and ambience. Offset each layer by milliseconds, then shape pitch, pan and volume before mixing everything to one game-ready WAV.</p>
        </section>
      </aside>

      <main className="mixer-main">
        <header className="mixer-toolbar">
          <div><span className="eyebrow">AUDIO / LAYER MIXER</span><input value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="mixer-toolbar-actions">
            <button title="Undo · Ctrl+Z" onClick={undo}><Undo2 size={14} /></button>
            <button title="Redo · Ctrl+Y" onClick={redo}><Redo2 size={14} /></button>
            <button disabled={rendering || !layers.length} onClick={() => void preview()}><Play size={14} /> Preview mix</button>
          </div>
        </header>

        <div className="mixer-timeline-wrap">
          <div className="mixer-ruler"><span>0s</span>{Array.from({ length: 5 }, (_, index) => <span key={index}>{((index + 1) * totalDuration / 5).toFixed(1)}s</span>)}</div>
          <div className="mixer-tracks">
            {layers.map((layer) => (
              <div key={layer.id} className="mixer-track" draggable onDragStart={() => setDragId(layer.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(layer.id)}>
                <div className="mixer-track-head">
                  <GripVertical size={13} />
                  <input value={layer.name} onChange={(event) => patchLayer(layer.id, { name: event.target.value }, false)} />
                  <button className={layer.muted ? 'active' : ''} onClick={() => patchLayer(layer.id, { muted: !layer.muted })}>M</button>
                  <button className={layer.solo ? 'active solo' : ''} onClick={() => patchLayer(layer.id, { solo: !layer.solo })}>S</button>
                  <button title="Duplicate" onClick={() => duplicateLayer(layer.id)}><Plus size={12} /></button>
                  <button title="Remove" onClick={() => removeLayer(layer.id)}><Trash2 size={12} /></button>
                </div>
                <div className="mixer-lane">
                  <div className="mixer-clip" style={{ left: `${(layer.offset / totalDuration) * 100}%`, width: `${Math.max(2, Math.min(100 - (layer.offset / totalDuration) * 100, ((layer.duration / Math.pow(2, layer.pitchSemitones / 12)) / totalDuration) * 100))}%` }}>
                    <LayerWaveform blob={layer.blob} />
                    <span>{layer.name}</span>
                  </div>
                </div>
                <div className="mixer-controls">
                  <Control label="Offset" value={layer.offset} min={0} max={Math.max(0, totalDuration - 0.05)} step={0.01} unit="s" onChange={(value) => patchLayer(layer.id, { offset: value })} />
                  <Control label="Gain" value={layer.gainDb} min={-24} max={12} step={0.5} unit="dB" onChange={(value) => patchLayer(layer.id, { gainDb: value })} />
                  <Control label="Pitch" value={layer.pitchSemitones} min={-12} max={12} step={1} unit="st" onChange={(value) => patchLayer(layer.id, { pitchSemitones: value })} />
                  <Control label="Pan" value={layer.pan} min={-1} max={1} step={0.05} unit="" onChange={(value) => patchLayer(layer.id, { pan: value })} />
                  <label className="mixer-loop"><input type="checkbox" checked={layer.loop} onChange={() => patchLayer(layer.id, { loop: !layer.loop })} /> Loop</label>
                </div>
              </div>
            ))}
            {!layers.length && <div className="mixer-empty"><Volume2 size={38} /><h2>Layer sounds into one effect</h2><p>Add audio from the Shared Library or import a recording. A sword hit can combine a whoosh, metal clash, low impact and cloth movement into one finished sound.</p></div>}
          </div>
        </div>

        <footer className="mixer-status"><span>{status}</span><b>{layers.length} layers · {totalDuration.toFixed(1)}s mix</b></footer>
      </main>

      <aside className="mixer-master-panel">
        <div className="mixer-panel-title"><Volume2 size={15} /> MASTER</div>
        <section className="mixer-master-card">
          <div><span>Layers</span><b>{layers.length}</b></div><div><span>Duration</span><b>{totalDuration.toFixed(2)}s</b></div><div><span>Output</span><b>WAV PCM16</b></div>
        </section>
        <section className="mixer-output-card">
          <button className="primary-button" disabled={rendering || !layers.length} onClick={() => void saveMix(false)}><Save size={14} /> Save mix to Library</button>
          <button className="secondary-button" disabled={rendering || !layers.length} onClick={() => void saveMix(true)}><Download size={14} /> Export WAV</button>
        </section>
        <section className="mixer-preview-card">
          <b>LAST RENDER</b>
          {mixUrl ? <audio ref={audioRef} controls src={mixUrl} /> : <span>No mix rendered yet.</span>}
        </section>
      </aside>
    </div>
  )
}

function Control({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><b>{value.toFixed(step < 1 ? 2 : 0)}{unit}</b></label>
}

function LayerWaveform({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    void decodeAudioBlob(blob).then((buffer) => {
      if (cancelled || !ref.current) return
      const canvas = ref.current
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(80, Math.round(rect.width * devicePixelRatio))
      const height = Math.max(30, Math.round(rect.height * devicePixelRatio))
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d'); if (!ctx) return
      const data = buffer.getChannelData(0)
      const stride = Math.max(1, Math.floor(data.length / width))
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(174,215,245,.72)'; ctx.lineWidth = Math.max(1, devicePixelRatio)
      ctx.beginPath()
      for (let x = 0; x < width; x += 1) {
        let peak = 0
        for (let i = x * stride; i < Math.min(data.length, (x + 1) * stride); i += 1) peak = Math.max(peak, Math.abs(data[i]))
        const half = peak * height * 0.42
        ctx.moveTo(x, height / 2 - half); ctx.lineTo(x, height / 2 + half)
      }
      ctx.stroke()
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [blob])
  return <canvas ref={ref} />
}

function safeName(value: string) { return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'forge-mix' }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}
