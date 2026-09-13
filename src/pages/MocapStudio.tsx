import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Bug, Download, FileUp, Pause, Play, QrCode, Radio, RotateCcw, Smartphone, Trash2 } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { QRCodeSVG } from 'qrcode.react'
import RetargetViewport, { type RetargetDiagnosticsSnapshot } from '../components/RetargetViewport'
import { bakeMotionToGlb, downloadBlob } from '../lib/animationBake'
import { saveAsset } from '../lib/library'
import { cleanupMotion, type MotionCleanupOptions } from '../lib/motionCleanup'
import { averageVisibility, downloadJson, formatDuration } from '../lib/pose'
import type { RigInfo } from '../lib/retarget'
import type { ForgeMotion, PeerMessage, PoseFrame } from '../types'

const BUILTIN_CHARACTER = 'Forge Mannequin'
const FORGE_BUILD = '0.6.3'
const DIAGNOSTIC_WINDOW_MS = 10_000
const MAX_DIAGNOSTIC_FRAMES = 360

export default function MocapStudio() {
  const [peerId, setPeerId] = useState('')
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [phoneName, setPhoneName] = useState('Phone')
  const [lastFrame, setLastFrame] = useState<PoseFrame>()
  const [recording, setRecording] = useState(false)
  const [frames, setFrames] = useState<PoseFrame[]>([])
  const [clip, setClip] = useState<ForgeMotion>()
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [latency, setLatency] = useState<number | null>(null)
  const [characterUrl, setCharacterUrl] = useState<string>()
  const [characterName, setCharacterName] = useState(BUILTIN_CHARACTER)
  const [rigInfo, setRigInfo] = useState<RigInfo>()
  const [smoothing, setSmoothing] = useState(0.48)
  const [mirrorX, setMirrorX] = useState(false)
  const [showRig, setShowRig] = useState(false)
  const [cleanupStrength, setCleanupStrength] = useState(0.58)
  const [repairGaps, setRepairGaps] = useState(true)
  const [footLock, setFootLock] = useState(true)
  const [groundAlign, setGroundAlign] = useState(true)
  const [exportingGlb, setExportingGlb] = useState(false)
  const [savingLibrary, setSavingLibrary] = useState(false)
  const [bakeStatus, setBakeStatus] = useState('')
  const connectionRef = useRef<DataConnection | null>(null)
  const recordFramesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const playbackStartedRef = useRef(0)
  const playbackOffsetRef = useRef(0)
  const diagnosticFramesRef = useRef<PoseFrame[]>([])
  const retargetDiagnosticsRef = useRef<RetargetDiagnosticsSnapshot>()
  const phoneMetadataRef = useRef<unknown>()
  const runtimeErrorsRef = useRef<Array<{ at: string; type: string; message: string; source?: string }>>([])
  const usingBuiltin = !characterUrl

  const cleanupOptions = useMemo<MotionCleanupOptions>(() => ({ strength: cleanupStrength, repairGaps, footLock, groundAlign, maxGapMs: 180 }), [cleanupStrength, repairGaps, footLock, groundAlign])
  const cleanedPreview = useMemo(() => clip ? cleanupMotion(clip, cleanupOptions) : undefined, [clip, cleanupOptions])

  useEffect(() => {
    const peer = new Peer()
    peer.on('open', (id) => setPeerId(id))
    peer.on('connection', (connection) => {
      connectionRef.current = connection
      phoneMetadataRef.current = connection.metadata
      connection.on('open', () => setPhoneConnected(true))
      connection.on('close', () => setPhoneConnected(false))
      connection.on('data', (raw) => {
        const message = raw as PeerMessage
        if (message.type === 'hello') { setPhoneName(message.device || 'Phone'); setPhoneConnected(true) }
        if (message.type === 'pose-frame') {
          setLastFrame(message.frame)
          const diagnostics = diagnosticFramesRef.current
          diagnostics.push(message.frame)
          const cutoff = message.frame.t - DIAGNOSTIC_WINDOW_MS
          while (diagnostics.length && diagnostics[0].t < cutoff) diagnostics.shift()
          if (diagnostics.length > MAX_DIAGNOSTIC_FRAMES) diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTIC_FRAMES)
          if (recordingRef.current) recordFramesRef.current.push(message.frame)
        }
        if (message.type === 'recording-start') {
          recordingRef.current = true; recordFramesRef.current = []; setFrames([]); setRecording(true); setClip(undefined); setBakeStatus('')
        }
        if (message.type === 'recording-stop') {
          recordingRef.current = false
          const captured = [...recordFramesRef.current]
          setFrames(captured); setRecording(false)
          if (captured.length) setClip(buildClip(captured, `Mocap ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
        }
        if (message.type === 'ping') connection.send({ type: 'pong', sentAt: message.sentAt } satisfies PeerMessage)
        if (message.type === 'pong') setLatency(Math.max(0, Math.round((performance.now() - message.sentAt) / 2)))
      })
    })
    peer.on('error', () => setPhoneConnected(false))
    const interval = window.setInterval(() => { const conn = connectionRef.current; if (conn?.open) conn.send({ type: 'ping', sentAt: performance.now() } satisfies PeerMessage) }, 2500)
    return () => { window.clearInterval(interval); connectionRef.current?.close(); peer.destroy() }
  }, [])

  useEffect(() => {
    const appendError = (entry: { at: string; type: string; message: string; source?: string }) => {
      runtimeErrorsRef.current.push(entry)
      if (runtimeErrorsRef.current.length > 20) runtimeErrorsRef.current.splice(0, runtimeErrorsRef.current.length - 20)
    }
    const onError = (event: ErrorEvent) => appendError({
      at: new Date().toISOString(),
      type: 'error',
      message: event.message || String(event.error ?? 'Unknown window error'),
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    })
    const onUnhandled = (event: PromiseRejectionEvent) => appendError({
      at: new Date().toISOString(),
      type: 'unhandledrejection',
      message: event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack ?? ''}` : safeString(event.reason),
    })
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  }, [])

  useEffect(() => () => { if (characterUrl) URL.revokeObjectURL(characterUrl) }, [characterUrl])

  useEffect(() => {
    if (!playing || !clip?.frames.length) return
    let raf = 0
    playbackStartedRef.current = performance.now()
    const tick = () => {
      const elapsed = performance.now() - playbackStartedRef.current + playbackOffsetRef.current
      const duration = clip.durationMs || 1
      if (elapsed >= duration) { setPlayhead(duration); setPlaying(false); playbackOffsetRef.current = 0; return }
      setPlayhead(elapsed); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clip])

  const captureUrl = useMemo(() => {
    if (!peerId) return ''
    const url = new URL('.', window.location.href)
    url.hash = ''; url.search = ''; url.searchParams.set('capture', '1'); url.searchParams.set('target', peerId)
    return url.toString()
  }, [peerId])

  const activeFrame = useMemo(() => {
    const previewMotion = cleanedPreview?.motion
    if (!previewMotion?.frames.length) return lastFrame
    let selected = previewMotion.frames[0]
    for (const frame of previewMotion.frames) { if (frame.t <= playhead) selected = frame; else break }
    return selected
  }, [cleanedPreview, playhead, lastFrame])

  const visibility = activeFrame?.tracking?.bodyScore ?? Math.round(averageVisibility(activeFrame?.landmarks) * 100)
  const handsTracked = (activeFrame?.leftHandLandmarks?.length === 21 ? 1 : 0) + (activeFrame?.rightHandLandmarks?.length === 21 ? 1 : 0)
  const feetTracked = activeFrame ? ([27,29,31].filter((i) => (activeFrame.landmarks[i]?.visibility ?? 0) > .35).length >= 2 ? 1 : 0) + ([28,30,32].filter((i) => (activeFrame.landmarks[i]?.visibility ?? 0) > .35).length >= 2 ? 1 : 0) : 0
  const canBake = !!clip && !recording && !exportingGlb && !savingLibrary && !!rigInfo && rigInfo.coreMappedCount >= 8

  const importMotion = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as ForgeMotion
      if (parsed.format !== 'forge-motion' || !Array.isArray(parsed.frames)) throw new Error('Invalid Forge motion file')
      setClip({ ...parsed, source: 'import' }); setFrames(parsed.frames); setPlayhead(0); setPlaying(false); setBakeStatus('')
    } catch { alert('That file is not a valid Forge motion capture.') }
  }

  const importCharacter = (file?: File) => {
    if (!file) return
    const nextUrl = URL.createObjectURL(file)
    setCharacterUrl(nextUrl); setCharacterName(file.name); setRigInfo(undefined); setShowRig(false); setBakeStatus('')
  }

  const useBuiltinCharacter = () => { setCharacterUrl(undefined); setCharacterName(BUILTIN_CHARACTER); setRigInfo(undefined); setShowRig(false); setBakeStatus('') }
  const resetBakeStatus = () => setBakeStatus('')

  const bakeCurrent = async () => {
    if (!clip) throw new Error('No mocap clip loaded.')
    return bakeMotionToGlb({ motion: clip, characterSrc: characterUrl, clipName: clip.name, smoothing, mirrorX, cleanup: cleanupOptions })
  }

  const exportAnimatedGlb = async () => {
    if (!clip || !canBake) return
    setExportingGlb(true); setBakeStatus('Cleaning motion and baking body + hands + feet…')
    try {
      const result = await bakeCurrent()
      downloadBlob(`${safeName(characterName)}-${safeName(clip.name)}.glb`, result.blob)
      setBakeStatus(`${result.mappedBones} bones · ${result.sampleCount} samples · ${result.cleanup.footLockedFrames} foot locks · ${result.cleanup.repairedPoints} repaired`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error'; setBakeStatus(`Export failed: ${message}`); alert(`Animated GLB export failed: ${message}`)
    } finally { setExportingGlb(false) }
  }

  const saveToLibrary = async () => {
    if (!clip || !canBake) return
    setSavingLibrary(true); setBakeStatus('Baking and saving to Forge Library…')
    try {
      const result = await bakeCurrent()
      await saveAsset({
        name: clip.name,
        category: 'animations',
        kind: 'glb',
        mime: 'model/gltf-binary',
        tags: ['mocap', 'humanoid', ...(handsTracked ? ['hands'] : []), 'feet'],
        source: `${characterName} · phone mocap`,
        blob: result.blob,
      })
      setBakeStatus(`${clip.name} saved to Shared Asset Library · ${result.mappedBones} animated bones`)
    } catch (error) {
      setBakeStatus(`Library save failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally { setSavingLibrary(false) }
  }

  const saveDiagnostics = () => {
    const sourceFrames = [...diagnosticFramesRef.current]
    if (!sourceFrames.length) {
      alert('No live phone frames are available yet. Connect the phone, reproduce the problem for a few seconds, then try again.')
      return
    }
    const firstT = sourceFrames[0].t
    const normalizedFrames = sourceFrames.map((frame) => ({ ...frame, t: frame.t - firstT }))
    const browserNavigator = navigator as Navigator & { deviceMemory?: number }
    const packet = {
      format: 'forge-diagnostics',
      version: 1,
      forgeBuild: FORGE_BUILD,
      createdAt: new Date().toISOString(),
      note: 'Contains tracking coordinates and rig transforms only. No camera image, audio, location, cookies or local asset files are included.',
      session: {
        phoneConnected,
        phoneName,
        phonePeerMetadata: serializable(phoneMetadataRef.current),
        latencyMs: latency,
        recording,
        previewSource: clip ? 'recorded-cleanup-preview' : 'live-phone',
      },
      browser: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGb: browserNavigator.deviceMemory,
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
      character: {
        name: characterName,
        builtIn: usingBuiltin,
        rigInfo,
      },
      settings: {
        smoothing,
        mirrorX,
        showRig,
        cleanupStrength,
        repairGaps,
        footLock,
        groundAlign,
      },
      trackingSummary: summarizeDiagnosticFrames(sourceFrames),
      retargetSnapshot: retargetDiagnosticsRef.current,
      runtimeErrors: runtimeErrorsRef.current,
      frames: normalizedFrames,
    }
    downloadJson(`forge-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, packet)
  }

  const togglePlayback = () => {
    if (!clip) return
    if (playing) { playbackOffsetRef.current = playhead; setPlaying(false); return }
    if (playhead >= clip.durationMs) { setPlayhead(0); playbackOffsetRef.current = 0 } else playbackOffsetRef.current = playhead
    setPlaying(true)
  }

  return (
    <div className="mocap-layout">
      <section className="mocap-main">
        <div className="viewport-toolbar">
          <div><span className="eyebrow">MOCAP STUDIO</span><strong>{recording ? 'Recording body + hands + feet' : clip ? clip.name : characterName}</strong></div>
          <div className="toolbar-actions">
            <button className="secondary-button" disabled={!lastFrame} onClick={saveDiagnostics}><Bug size={16} /> Save diagnostics</button>
            <label className="secondary-button file-button"><FileUp size={16} /> Replace character<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(e) => importCharacter(e.target.files?.[0])} /></label>
            <label className="secondary-button file-button"><FileUp size={16} /> Import motion<input type="file" accept=".json,.forge-motion.json" onChange={(e) => importMotion(e.target.files?.[0])} /></label>
            {clip && <button className="secondary-button" onClick={() => downloadJson(`${safeName(clip.name)}.forge-motion.json`, clip)}><Download size={16} /> Raw JSON</button>}
            {clip && cleanedPreview && <button className="secondary-button" onClick={() => downloadJson(`${safeName(clip.name)}-clean.forge-motion.json`, cleanedPreview.motion)}><Download size={16} /> Clean JSON</button>}
            {clip && <button className="secondary-button" disabled={!canBake} onClick={saveToLibrary}><Archive size={16} /> {savingLibrary ? 'Saving…' : 'Save to Library'}</button>}
            {clip && <button className="primary-button bake-toolbar-button" disabled={!canBake} onClick={exportAnimatedGlb}><Download size={16} /> {exportingGlb ? 'Baking…' : 'Export animated GLB'}</button>}
          </div>
        </div>

        <div className="mocap-viewport-wrap">
          <RetargetViewport className="mocap-viewport" src={characterUrl} landmarks={activeFrame?.landmarks} worldLandmarks={activeFrame?.worldLandmarks}
            leftHandLandmarks={activeFrame?.leftHandLandmarks} rightHandLandmarks={activeFrame?.rightHandLandmarks}
            leftHandWorldLandmarks={activeFrame?.leftHandWorldLandmarks} rightHandWorldLandmarks={activeFrame?.rightHandWorldLandmarks}
            smoothing={smoothing} mirrorX={mirrorX} showRig={showRig} onRigInfo={setRigInfo}
            onDiagnostics={(snapshot) => { retargetDiagnosticsRef.current = snapshot }} />
          <div className="viewport-overlay top-left"><span className={`live-dot ${phoneConnected ? 'connected' : ''}`} /><span>{phoneConnected ? `${phoneName} connected` : 'Waiting for phone'}</span></div>
          <div className="viewport-overlay top-right"><span className="character-dot" /><span>{characterName}{usingBuiltin ? ' · BUILT IN' : ''}</span></div>
          {recording && <div className="recording-pill"><span /> REC</div>}
          {clip && <div className="cleanup-preview-pill">CLEANUP PREVIEW</div>}
          <div className="viewport-stats">
            <div><span>BODY</span><strong>{activeFrame ? `${visibility}%` : '—'}</strong></div>
            <div><span>HANDS</span><strong>{activeFrame ? `${handsTracked}/2` : '—'}</strong></div>
            <div><span>FEET</span><strong>{activeFrame ? `${feetTracked}/2` : '—'}</strong></div>
            <div><span>LATENCY</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div>
            <div><span>RIG</span><strong>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal}` : '…'}</strong></div>
          </div>
        </div>

        <div className="timeline-panel">
          <div className="timeline-controls">
            <button className="icon-button" disabled={!clip} onClick={() => { setPlayhead(0); playbackOffsetRef.current = 0; setPlaying(false) }}><RotateCcw size={16} /></button>
            <button className="play-button" disabled={!clip} onClick={togglePlayback}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
            <span className="timecode">{formatDuration(playhead)} / {formatDuration(clip?.durationMs ?? 0)}</span><div className="timeline-spacer" />
            {clip && <button className="icon-button danger-hover" title="Clear clip" onClick={() => { setClip(undefined); setFrames([]); setPlayhead(0); setPlaying(false); setBakeStatus('') }}><Trash2 size={16} /></button>}
          </div>
          <input className="timeline-range" type="range" min={0} max={Math.max(1, clip?.durationMs ?? 1)} value={Math.min(playhead, clip?.durationMs ?? 0)} disabled={!clip} onChange={(e) => { const value = Number(e.target.value); setPlayhead(value); playbackOffsetRef.current = value; setPlaying(false) }} />
          <div className="timeline-track"><div className="track-label">PHONE MOCAP</div><div className={`track-clip ${clip ? 'has-clip' : ''}`}>{clip ? `${clip.frames.length} frames · body + hands + feet` : 'Record on your phone to create a clip'}</div></div>
          <div className="timeline-track character-track"><div className="track-label">CHARACTER</div><div className="track-clip has-character">Live retarget · {characterName}</div></div>
        </div>
      </section>

      <aside className="pair-panel">
        <div className="inspector-heading"><Smartphone size={17} /><span>Phone capture</span></div>
        {!phoneConnected ? (
          <><div className="qr-shell">{captureUrl ? <QRCodeSVG value={captureUrl} size={184} bgColor="#ffffff" fgColor="#0d1016" level="M" marginSize={2} /> : <div className="qr-loading"><QrCode size={36} /><span>Creating session…</span></div>}</div><h3>Scan with your phone</h3><p className="pair-copy">One phone now captures body pose, both hands and foot direction. Keep your whole body visible.</p><div className="pair-steps"><div><span>1</span><p>Scan QR</p></div><div><span>2</span><p>Allow camera</p></div><div><span>3</span><p>Move + gesture</p></div></div></>
        ) : (
          <div className="connected-card compact-connected-card"><div className="phone-illustration"><Smartphone size={42} /><span className="signal-ring" /></div><span className="connected-label"><Radio size={14} /> LIVE CONNECTION</span><h3>{phoneName}</h3><p>Single-phone body, hand and foot landmarks are streaming directly to Forge over WebRTC.</p><div className="connection-grid"><div><span>Hands</span><strong>{handsTracked}/2</strong></div><div><span>Latency</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div></div></div>
        )}

        <div className="inspector-block info-block">
          <span className="property-label">Tracking diagnostics</span>
          <p>Reproduce the bad pose for about 5–10 seconds, then press Save diagnostics. Forge saves the recent raw landmarks, tracking confidence, rig map and live bone transforms into one JSON file.</p>
          <button className="inspector-action" disabled={!lastFrame} onClick={saveDiagnostics}><Bug size={15} /> Save last 10 seconds</button>
          <p className="rig-note">No camera image, microphone audio or location data is saved.</p>
        </div>

        <div className="inspector-block character-inspector">
          <span className="property-label">Live character</span><strong className="character-name">{characterName}</strong>
          <div className="mini-row"><span>Source</span><span className="status-good">{usingBuiltin ? 'Built in' : 'Imported'}</span></div>
          <div className="mini-row"><span>Core humanoid bones</span><span className={rigInfo && rigInfo.coreMappedCount >= 10 ? 'status-good' : 'status-warn'}>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal}` : 'Scanning…'}</span></div>
          <div className="mini-row"><span>Finger bones</span><span className={rigInfo?.fingerMappedCount ? 'status-good' : 'status-warn'}>{rigInfo ? `${rigInfo.fingerMappedCount}/30` : 'Scanning…'}</span></div>
          <div className="mini-row"><span>Total skeleton bones</span><span>{rigInfo?.totalBones ?? '—'}</span></div>
          {rigInfo && rigInfo.missing.length > 0 && <p className="rig-note">Missing core: {rigInfo.missing.slice(0, 5).join(', ')}{rigInfo.missing.length > 5 ? '…' : ''}</p>}
          {usingBuiltin ? <label className="inspector-action file-button">Replace with your GLB<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(e) => importCharacter(e.target.files?.[0])} /></label> : <button className="inspector-action" onClick={useBuiltinCharacter}>Use Forge Mannequin</button>}
        </div>

        <div className="inspector-block retarget-settings">
          <span className="property-label">Retarget settings</span>
          <label className="range-setting"><span><b>Smoothing</b><em>{Math.round(smoothing * 100)}%</em></span><input type="range" min="0" max="0.9" step="0.05" value={smoothing} onChange={(e) => { setSmoothing(Number(e.target.value)); resetBakeStatus() }} /></label>
          <label className="toggle-setting"><span><b>Mirror X</b><small>Use if left/right movement is reversed</small></span><input type="checkbox" checked={mirrorX} onChange={(e) => { setMirrorX(e.target.checked); resetBakeStatus() }} /></label>
          <label className="toggle-setting"><span><b>Show rig</b><small>Includes fingers and toe bones when available</small></span><input type="checkbox" checked={showRig} onChange={(e) => setShowRig(e.target.checked)} /></label>
        </div>

        <div className="inspector-block cleanup-card">
          <span className="property-label">Motion cleanup</span>
          <label className="range-setting"><span><b>Cleanup strength</b><em>{Math.round(cleanupStrength * 100)}%</em></span><input type="range" min="0" max="1" step="0.05" value={cleanupStrength} onChange={(e) => { setCleanupStrength(Number(e.target.value)); resetBakeStatus() }} /></label>
          <label className="toggle-setting"><span><b>Foot locking</b><small>Holds planted feet during low-speed contact</small></span><input type="checkbox" checked={footLock} onChange={(e) => { setFootLock(e.target.checked); resetBakeStatus() }} /></label>
          <label className="toggle-setting"><span><b>Ground alignment</b><small>Pulls support feet onto a stable floor plane</small></span><input type="checkbox" checked={groundAlign} onChange={(e) => { setGroundAlign(e.target.checked); resetBakeStatus() }} /></label>
          <label className="toggle-setting"><span><b>Repair short gaps</b><small>Interpolates brief body landmark dropouts up to 180 ms</small></span><input type="checkbox" checked={repairGaps} onChange={(e) => { setRepairGaps(e.target.checked); resetBakeStatus() }} /></label>
          {cleanedPreview && <div className="cleanup-report"><div><span>Foot-locked frames</span><strong>{cleanedPreview.report.footLockedFrames}</strong></div><div><span>Grounded frames</span><strong>{cleanedPreview.report.groundAlignedFrames}</strong></div><div><span>Repaired landmarks</span><strong>{cleanedPreview.report.repairedPoints}</strong></div></div>}
        </div>

        {clip && <div className="inspector-block bake-card"><span className="property-label">Game-ready output</span><div className="mini-row"><span>Clip</span><strong>{clip.name}</strong></div><div className="mini-row"><span>Duration</span><span>{formatDuration(clip.durationMs)}</span></div><div className="mini-row"><span>Hands in current frame</span><span>{handsTracked}/2</span></div><div className="mini-row"><span>Output</span><span className="status-good">GLB + AnimationClip</span></div><button className="secondary-button bake-button" disabled={!canBake} onClick={saveToLibrary}><Archive size={15} /> {savingLibrary ? 'Saving…' : 'Save to Library'}</button><button className="primary-button bake-button" disabled={!canBake} onClick={exportAnimatedGlb}><Download size={15} /> {exportingGlb ? 'Cleaning + baking…' : 'Export cleaned GLB'}</button>{bakeStatus && <div className={`bake-status ${bakeStatus.includes('failed') ? 'error' : ''}`}>{bakeStatus}</div>}</div>}

        <div className="inspector-block info-block"><span className="property-label">Single-phone capture</span><p>Feet work best when the whole body stays visible. Finger tracking works best when hands are not hidden behind your torso or each other.</p></div>
        <div className="inspector-block"><span className="property-label">v0.6 pipeline</span><div className="mini-row"><span>Body + foot tracking</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Two-hand + finger tracking</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Motion cleanup + foot lock</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Shared Asset Library</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Send to Game profiles</span><span className="status-good">Ready</span></div></div>
      </aside>
    </div>
  )
}

function buildClip(frames: PoseFrame[], name: string): ForgeMotion {
  const firstT = frames[0]?.t ?? 0
  const normalized = frames.map((frame) => ({ ...frame, t: frame.t - firstT }))
  const durationMs = normalized.at(-1)?.t ?? 0
  const fps = durationMs > 0 ? Math.round((normalized.length / durationMs) * 1000) : 0
  return { format: 'forge-motion', version: 2, name, createdAt: new Date().toISOString(), fps, durationMs, frames: normalized, source: 'phone' }
}

function summarizeDiagnosticFrames(frames: PoseFrame[]) {
  const durationMs = frames.length > 1 ? Math.max(0, frames.at(-1)!.t - frames[0].t) : 0
  const bodyScores = frames.map((frame) => frame.tracking?.bodyScore).filter((value): value is number => typeof value === 'number')
  const bodyReadyFrames = frames.filter((frame) => frame.tracking?.bodyReady).length
  const leftHandFrames = frames.filter((frame) => frame.leftHandLandmarks?.length === 21).length
  const rightHandFrames = frames.filter((frame) => frame.rightHandLandmarks?.length === 21).length
  const bothHandFrames = frames.filter((frame) => frame.leftHandLandmarks?.length === 21 && frame.rightHandLandmarks?.length === 21).length
  const footHistogram = { zero: 0, one: 0, two: 0 }
  const missingCounts: Record<string, number> = {}

  for (const frame of frames) {
    const footCount = frame.tracking?.footCount ?? 0
    if (footCount >= 2) footHistogram.two += 1
    else if (footCount === 1) footHistogram.one += 1
    else footHistogram.zero += 1
    for (const missing of frame.tracking?.missing ?? []) missingCounts[missing] = (missingCounts[missing] ?? 0) + 1
  }

  const percent = (count: number) => frames.length ? Math.round((count / frames.length) * 1000) / 10 : 0
  return {
    frameCount: frames.length,
    durationMs: Math.round(durationMs),
    estimatedFps: durationMs > 0 ? Math.round((frames.length / durationMs) * 1000 * 10) / 10 : 0,
    averageBodyScore: bodyScores.length ? Math.round(bodyScores.reduce((sum, value) => sum + value, 0) / bodyScores.length * 10) / 10 : null,
    minimumBodyScore: bodyScores.length ? Math.min(...bodyScores) : null,
    maximumBodyScore: bodyScores.length ? Math.max(...bodyScores) : null,
    bodyReadyPercent: percent(bodyReadyFrames),
    leftHandDetectionPercent: percent(leftHandFrames),
    rightHandDetectionPercent: percent(rightHandFrames),
    bothHandsDetectionPercent: percent(bothHandFrames),
    feet: { ...footHistogram, twoFeetPercent: percent(footHistogram.two) },
    missingCounts,
  }
}

function serializable(value: unknown): unknown {
  try { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) }
  catch { return safeString(value) }
}

function safeString(value: unknown) {
  try { return typeof value === 'string' ? value : JSON.stringify(value) }
  catch { return String(value) }
}

function safeName(value: string) { return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'mocap' }
