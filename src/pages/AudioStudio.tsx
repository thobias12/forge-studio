import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Download, FileAudio, FileUp, Library, Mic2, Pause, Play, Redo2, Scissors, Square, Trash2, Undo2, Volume2, WandSparkles } from 'lucide-react'
import { decodeAudioBlob, processAudioToWav } from '../lib/audioProcessing'
import { registerHistoryScope } from '../lib/historyShortcuts'
import { saveAsset } from '../lib/library'
import '../audio-studio.css'

type ClipType = 'voice' | 'sfx' | 'foley' | 'ambience' | 'music'

type AudioClip = {
  id: string
  name: string
  blob: Blob
  mime: string
  duration: number
  type: ClipType
  tags: string[]
  notes: string
  trimStart: number
  trimEnd: number
  fadeIn: number
  fadeOut: number
  gainDb: number
  normalize: boolean
  createdAt: string
}

const MAX_HISTORY = 60

export default function AudioStudio() {
  const [clips, setClips] = useState<AudioClip[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [newTakeType, setNewTakeType] = useState<ClipType>('voice')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const [inputLevel, setInputLevel] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [waveBuffer, setWaveBuffer] = useState<AudioBuffer>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Record dialogue, foley and game sounds, or import existing audio.')

  const undoStack = useRef<AudioClip[][]>([])
  const redoStack = useRef<AudioClip[][]>([])
  const recorderRef = useRef<MediaRecorder>()
  const streamRef = useRef<MediaStream>()
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number>()
  const meterFrameRef = useRef<number>()
  const meterContextRef = useRef<AudioContext>()

  const selected = clips.find((clip) => clip.id === selectedId)

  const cloneClips = (items: AudioClip[]) => items.map((clip) => ({ ...clip, tags: [...clip.tags] }))

  const commitClips = useCallback((next: AudioClip[], message?: string) => {
    undoStack.current.push(cloneClips(clips))
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    setClips(next)
    if (message) setStatus(message)
  }, [clips])

  const undo = useCallback(() => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(cloneClips(clips))
    setClips(previous)
    setStatus('Undid the last Audio Studio action.')
  }, [clips])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(cloneClips(clips))
    setClips(next)
    setStatus('Redid the last Audio Studio action.')
  }, [clips])

  useEffect(() => registerHistoryScope({ undo, redo, label: 'Audio Studio' }), [undo, redo])

  useEffect(() => {
    if (!clips.length) {
      setSelectedId('')
      return
    }
    if (!clips.some((clip) => clip.id === selectedId)) setSelectedId(clips[0].id)
  }, [clips, selectedId])

  useEffect(() => {
    let cancelled = false
    if (!selected) {
      setWaveBuffer(undefined)
      return
    }
    void decodeAudioBlob(selected.blob).then((buffer) => {
      if (!cancelled) setWaveBuffer(buffer)
    }).catch(() => {
      if (!cancelled) setWaveBuffer(undefined)
    })
    return () => { cancelled = true }
  }, [selected?.id])

  useEffect(() => {
    let cancelled = false
    let url = ''
    if (!selected) {
      setPreviewUrl('')
      return
    }
    void processAudioToWav(selected.blob, selected).then((result) => {
      if (cancelled) return
      url = URL.createObjectURL(result.blob)
      setPreviewUrl(url)
    }).catch(() => {
      if (!cancelled) setPreviewUrl('')
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [selected?.id, selected?.trimStart, selected?.trimEnd, selected?.fadeIn, selected?.fadeOut, selected?.gainDb, selected?.normalize])

  useEffect(() => () => stopCaptureResources(), [])

  const enableMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('This browser does not expose microphone recording.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter((device) => device.kind === 'audioinput')
      setDevices(inputs)
      if (!deviceId && inputs[0]) setDeviceId(inputs[0].deviceId)
      setStatus(`Microphone ready${inputs.length > 1 ? ` · ${inputs.length} inputs available` : ''}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Microphone permission was not granted.')
    }
  }

  const startRecording = async () => {
    if (recording) return
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: newTakeType === 'voice', noiseSuppression: newTakeType === 'voice' } : true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const mime = chooseRecorderMime()
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorderRef.current = recorder
      streamRef.current = stream
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => void finishRecording(recorder.mimeType || mime || 'audio/webm')
      recorder.start(200)
      setRecording(true)
      setRecordingMs(0)
      const started = performance.now()
      timerRef.current = window.setInterval(() => setRecordingMs(performance.now() - started), 80)
      startInputMeter(stream)
      setStatus(`Recording ${labelForType(newTakeType).toLowerCase()}…`)
    } catch (error) {
      stopCaptureResources()
      setStatus(error instanceof Error ? error.message : 'Could not start recording.')
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
    setRecording(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = undefined
    stopMeter()
  }

  const finishRecording = async (mime: string) => {
    const blob = new Blob(chunksRef.current, { type: mime })
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
    recorderRef.current = undefined
    chunksRef.current = []
    if (!blob.size) {
      setStatus('The recording contained no audio data.')
      return
    }
    try {
      const buffer = await decodeAudioBlob(blob)
      const type = newTakeType
      const count = clips.filter((clip) => clip.type === type).length + 1
      const clip: AudioClip = {
        id: crypto.randomUUID(),
        name: `${labelForType(type)} Take ${String(count).padStart(2, '0')}`,
        blob,
        mime,
        duration: buffer.duration,
        type,
        tags: [],
        notes: '',
        trimStart: 0,
        trimEnd: buffer.duration,
        fadeIn: 0,
        fadeOut: 0,
        gainDb: 0,
        normalize: false,
        createdAt: new Date().toISOString(),
      }
      commitClips([clip, ...clips], `${clip.name} recorded.`)
      setSelectedId(clip.id)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The recorded audio could not be decoded.')
    }
  }

  const importFiles = async (files?: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const imported: AudioClip[] = []
      for (const file of Array.from(files)) {
        const buffer = await decodeAudioBlob(file)
        imported.push({
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ''),
          blob: file,
          mime: file.type || 'audio/*',
          duration: buffer.duration,
          type: newTakeType,
          tags: [],
          notes: '',
          trimStart: 0,
          trimEnd: buffer.duration,
          fadeIn: 0,
          fadeOut: 0,
          gainDb: 0,
          normalize: false,
          createdAt: new Date().toISOString(),
        })
      }
      commitClips([...imported, ...clips], `${imported.length} audio clip${imported.length === 1 ? '' : 's'} imported.`)
      if (imported[0]) setSelectedId(imported[0].id)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import that audio file.')
    } finally {
      setBusy(false)
    }
  }

  const patchSelected = (patch: Partial<AudioClip>, history = true) => {
    if (!selected) return
    const next = clips.map((clip) => clip.id === selected.id ? { ...clip, ...patch } : clip)
    if (history) commitClips(next)
    else setClips(next)
  }

  const removeSelected = () => {
    if (!selected) return
    commitClips(clips.filter((clip) => clip.id !== selected.id), `${selected.name} removed from the session.`)
  }

  const saveSelected = async (downloadOnly = false) => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await processAudioToWav(selected.blob, selected)
      const filename = `${safeName(selected.name)}.wav`
      if (downloadOnly) {
        downloadBlob(result.blob, filename)
        setStatus(`${selected.name} exported as WAV.`)
      } else {
        await saveAsset({
          name: selected.name,
          category: 'audio',
          kind: 'audio',
          mime: 'audio/wav',
          tags: [selected.type, ...selected.tags],
          source: 'Forge Voice & Audio Studio',
          blob: result.blob,
        })
        setStatus(`${selected.name} saved to the Shared Asset Library as WAV.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not process this audio clip.')
    } finally {
      setBusy(false)
    }
  }

  const trimDuration = selected ? Math.max(0, selected.trimEnd - selected.trimStart) : 0
  const displayClips = useMemo(() => clips, [clips])

  return (
    <div className="audio-studio-page">
      <aside className="audio-session-panel">
        <div className="audio-panel-title"><FileAudio size={15} /><span>SESSION / TAKES</span></div>
        <div className="audio-record-card">
          <label>Recording type<select value={newTakeType} onChange={(event) => setNewTakeType(event.target.value as ClipType)}>{(['voice', 'sfx', 'foley', 'ambience', 'music'] as ClipType[]).map((type) => <option key={type} value={type}>{labelForType(type)}</option>)}</select></label>
          <label>Input<select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">Default microphone</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
          <button className="audio-enable-mic" onClick={() => void enableMicrophone()}><Mic2 size={13} /> Enable / refresh microphones</button>
          <div className="audio-input-meter"><span style={{ width: `${Math.round(inputLevel * 100)}%` }} /></div>
          <button className={`audio-record-button ${recording ? 'recording' : ''}`} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <Square size={14} fill="currentColor" /> : <Mic2 size={15} />}{recording ? `Stop · ${formatTime(recordingMs / 1000)}` : 'Record new take'}</button>
          <label className="secondary-button audio-import"><FileUp size={13} /> Import audio<input multiple type="file" accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a,.aac,.flac" onChange={(event) => void importFiles(event.target.files)} /></label>
        </div>
        <div className="audio-take-list">
          {displayClips.map((clip) => <button key={clip.id} className={clip.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(clip.id)}><AudioLines size={15} /><span><strong>{clip.name}</strong><em>{labelForType(clip.type)} · {formatTime(clip.trimEnd - clip.trimStart)}</em></span></button>)}
          {!clips.length && <div className="audio-no-takes"><Mic2 size={25} /><span>Your recordings and imported sounds will appear here.</span></div>}
        </div>
      </aside>

      <main className="audio-editor-main">
        <header className="audio-editor-toolbar">
          <div><span className="eyebrow">VOICE & AUDIO STUDIO</span><strong>{selected?.name ?? 'No clip selected'}</strong></div>
          <div className="audio-editor-actions"><button title="Undo · Ctrl+Z" onClick={undo}><Undo2 size={14} /></button><button title="Redo · Ctrl+Y" onClick={redo}><Redo2 size={14} /></button></div>
        </header>
        <div className="audio-editor-stage">
          {selected ? (
            <>
              <div className="audio-wave-card">
                <div className="audio-wave-heading"><span>{formatTime(selected.trimStart)}</span><b>{trimDuration.toFixed(2)}s selected</b><span>{formatTime(selected.trimEnd)}</span></div>
                <Waveform buffer={waveBuffer} trimStart={selected.trimStart} trimEnd={selected.trimEnd} />
                <div className="audio-trim-controls">
                  <label>Start <input type="range" min="0" max={Math.max(0.01, selected.duration)} step="0.01" value={selected.trimStart} onChange={(event) => patchSelected({ trimStart: Math.min(Number(event.target.value), selected.trimEnd - 0.01) })} /><b>{selected.trimStart.toFixed(2)}s</b></label>
                  <label>End <input type="range" min="0" max={Math.max(0.01, selected.duration)} step="0.01" value={selected.trimEnd} onChange={(event) => patchSelected({ trimEnd: Math.max(Number(event.target.value), selected.trimStart + 0.01) })} /><b>{selected.trimEnd.toFixed(2)}s</b></label>
                </div>
              </div>
              <div className="audio-preview-card">
                <div><Volume2 size={17} /><span><strong>Processed preview</strong><em>Trim, fades, gain and normalization applied</em></span></div>
                {previewUrl ? <audio controls src={previewUrl} /> : <span className="audio-rendering">Rendering preview…</span>}
              </div>
            </>
          ) : <div className="audio-editor-empty"><Mic2 size={42} /><h2>Record your own game audio</h2><p>Dialogue, creature voices, UI sounds, foley, ambience and anything else you can capture with a microphone.</p></div>}
        </div>
        <footer className="audio-status"><span>{status}</span><b>Ctrl+Z undo · Ctrl+Y redo</b></footer>
      </main>

      <aside className="audio-inspector">
        <div className="audio-panel-title"><Scissors size={15} /><span>CLIP INSPECTOR</span></div>
        {selected ? (
          <>
            <section className="audio-inspector-section">
              <label>Name<input value={selected.name} onChange={(event) => patchSelected({ name: event.target.value }, false)} /></label>
              <label>Type<select value={selected.type} onChange={(event) => patchSelected({ type: event.target.value as ClipType })}>{(['voice', 'sfx', 'foley', 'ambience', 'music'] as ClipType[]).map((type) => <option key={type} value={type}>{labelForType(type)}</option>)}</select></label>
              <label>Tags<input value={selected.tags.join(', ')} placeholder="sword, hit, metal" onChange={(event) => patchSelected({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }, false)} /></label>
              <label>Script / notes<textarea rows={4} value={selected.notes} placeholder="Line, direction or recording notes…" onChange={(event) => patchSelected({ notes: event.target.value }, false)} /></label>
            </section>
            <section className="audio-inspector-section">
              <div className="audio-section-title">PROCESSING</div>
              <label>Gain <div className="audio-slider-row"><input type="range" min="-18" max="18" step="0.5" value={selected.gainDb} onChange={(event) => patchSelected({ gainDb: Number(event.target.value) })} /><b>{selected.gainDb > 0 ? '+' : ''}{selected.gainDb.toFixed(1)} dB</b></div></label>
              <label>Fade in <div className="audio-slider-row"><input type="range" min="0" max={Math.min(3, trimDuration / 2)} step="0.01" value={Math.min(selected.fadeIn, trimDuration / 2)} onChange={(event) => patchSelected({ fadeIn: Number(event.target.value) })} /><b>{selected.fadeIn.toFixed(2)}s</b></div></label>
              <label>Fade out <div className="audio-slider-row"><input type="range" min="0" max={Math.min(3, trimDuration / 2)} step="0.01" value={Math.min(selected.fadeOut, trimDuration / 2)} onChange={(event) => patchSelected({ fadeOut: Number(event.target.value) })} /><b>{selected.fadeOut.toFixed(2)}s</b></div></label>
              <button className={`audio-normalize ${selected.normalize ? 'active' : ''}`} onClick={() => patchSelected({ normalize: !selected.normalize })}><WandSparkles size={13} /> Normalize peak {selected.normalize ? 'ON' : 'OFF'}</button>
            </section>
            <section className="audio-inspector-section audio-clip-info">
              <div><span>Original</span><b>{selected.duration.toFixed(2)}s</b></div><div><span>Trimmed</span><b>{trimDuration.toFixed(2)}s</b></div><div><span>Source</span><b>{selected.mime.split(';')[0] || 'audio'}</b></div><div><span>Output</span><b>WAV PCM16</b></div>
            </section>
            <section className="audio-inspector-section audio-output-buttons">
              <button className="primary-button" disabled={busy} onClick={() => void saveSelected(false)}><Library size={14} /> Save WAV to Library</button>
              <button className="secondary-button" disabled={busy} onClick={() => void saveSelected(true)}><Download size={14} /> Export WAV</button>
              <button className="audio-delete" onClick={removeSelected}><Trash2 size={13} /> Remove take</button>
            </section>
          </>
        ) : <div className="audio-inspector-empty">Select or record a clip to edit it.</div>}
      </aside>
    </div>
  )

  function startInputMeter(stream: MediaStream) {
    stopMeter()
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    meterContextRef.current = context
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const value of data) {
        const normalized = (value - 128) / 128
        sum += normalized * normalized
      }
      setInputLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.6))
      meterFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  function stopMeter() {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current)
    meterFrameRef.current = undefined
    void meterContextRef.current?.close().catch(() => undefined)
    meterContextRef.current = undefined
    setInputLevel(0)
  }

  function stopCaptureResources() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = undefined
    if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    recorderRef.current = undefined
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
    stopMeter()
  }
}

function Waveform({ buffer, trimStart, trimEnd }: { buffer?: AudioBuffer; trimStart: number; trimEnd: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const render = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      const width = rect.width
      const height = rect.height
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#080d13'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#1c2a38'
      ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke()
      if (!buffer) return

      const data = buffer.getChannelData(0)
      const samplesPerPixel = Math.max(1, Math.floor(data.length / Math.max(1, width)))
      ctx.strokeStyle = '#6da7d8'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x < width; x += 1) {
        const start = Math.floor(x * samplesPerPixel)
        const end = Math.min(data.length, start + samplesPerPixel)
        let peak = 0
        for (let i = start; i < end; i += 1) peak = Math.max(peak, Math.abs(data[i]))
        const half = peak * height * 0.42
        ctx.moveTo(x + 0.5, height / 2 - half)
        ctx.lineTo(x + 0.5, height / 2 + half)
      }
      ctx.stroke()

      const startX = buffer.duration ? (trimStart / buffer.duration) * width : 0
      const endX = buffer.duration ? (trimEnd / buffer.duration) * width : width
      ctx.fillStyle = 'rgba(4,8,12,.58)'
      ctx.fillRect(0, 0, Math.max(0, startX), height)
      ctx.fillRect(Math.max(0, endX), 0, Math.max(0, width - endX), height)
      ctx.fillStyle = '#8fc4ef'
      ctx.fillRect(startX - 1, 0, 2, height)
      ctx.fillRect(endX - 1, 0, 2, height)
    }

    render()
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [buffer, trimStart, trimEnd])

  return <canvas ref={canvasRef} className="audio-waveform" />
}

function chooseRecorderMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? ''
}

function labelForType(type: ClipType) {
  if (type === 'sfx') return 'SFX'
  if (type === 'foley') return 'Foley'
  if (type === 'ambience') return 'Ambience'
  if (type === 'music') return 'Music'
  return 'Voice'
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00.00'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.max(0, seconds - minutes * 60)
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`
}

function safeName(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'forge-audio'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}
