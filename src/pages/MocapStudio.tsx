import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileUp, Pause, Play, QrCode, Radio, RotateCcw, Smartphone, Trash2 } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { QRCodeSVG } from 'qrcode.react'
import RetargetViewport from '../components/RetargetViewport'
import { averageVisibility, downloadJson, formatDuration } from '../lib/pose'
import type { RigInfo } from '../lib/retarget'
import type { ForgeMotion, PeerMessage, PoseFrame } from '../types'

const BUILTIN_CHARACTER = 'Forge Mannequin'

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
  const connectionRef = useRef<DataConnection | null>(null)
  const recordFramesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const playbackStartedRef = useRef(0)
  const playbackOffsetRef = useRef(0)
  const usingBuiltin = !characterUrl

  useEffect(() => {
    const peer = new Peer()
    peer.on('open', (id) => setPeerId(id))
    peer.on('connection', (connection) => {
      connectionRef.current = connection
      connection.on('open', () => setPhoneConnected(true))
      connection.on('close', () => setPhoneConnected(false))
      connection.on('data', (raw) => {
        const message = raw as PeerMessage
        if (message.type === 'hello') {
          setPhoneName(message.device || 'Phone')
          setPhoneConnected(true)
        }
        if (message.type === 'pose-frame') {
          setLastFrame(message.frame)
          if (recordingRef.current) recordFramesRef.current.push(message.frame)
        }
        if (message.type === 'recording-start') {
          recordingRef.current = true
          recordFramesRef.current = []
          setFrames([])
          setRecording(true)
          setClip(undefined)
        }
        if (message.type === 'recording-stop') {
          recordingRef.current = false
          const captured = [...recordFramesRef.current]
          setFrames(captured)
          setRecording(false)
          if (captured.length) {
            setClip(buildClip(captured, `Mocap ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
          }
        }
        if (message.type === 'ping') connection.send({ type: 'pong', sentAt: message.sentAt } satisfies PeerMessage)
        if (message.type === 'pong') setLatency(Math.max(0, Math.round((performance.now() - message.sentAt) / 2)))
      })
    })
    peer.on('error', () => setPhoneConnected(false))

    const interval = window.setInterval(() => {
      const conn = connectionRef.current
      if (conn?.open) conn.send({ type: 'ping', sentAt: performance.now() } satisfies PeerMessage)
    }, 2500)

    return () => {
      window.clearInterval(interval)
      connectionRef.current?.close()
      peer.destroy()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (characterUrl) URL.revokeObjectURL(characterUrl)
    }
  }, [characterUrl])

  useEffect(() => {
    if (!playing || !clip?.frames.length) return
    let raf = 0
    playbackStartedRef.current = performance.now()
    const tick = () => {
      const elapsed = performance.now() - playbackStartedRef.current + playbackOffsetRef.current
      const duration = clip.durationMs || 1
      if (elapsed >= duration) {
        setPlayhead(duration)
        setPlaying(false)
        playbackOffsetRef.current = 0
        return
      }
      setPlayhead(elapsed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clip])

  const captureUrl = useMemo(() => {
    if (!peerId) return ''
    const url = new URL('.', window.location.href)
    url.hash = ''
    url.search = ''
    url.searchParams.set('capture', '1')
    url.searchParams.set('target', peerId)
    return url.toString()
  }, [peerId])

  const activeFrame = useMemo(() => {
    if (!clip?.frames.length) return lastFrame
    let selected = clip.frames[0]
    for (const frame of clip.frames) {
      if (frame.t <= playhead) selected = frame
      else break
    }
    return selected
  }, [clip, playhead, lastFrame])

  const visibility = Math.round(averageVisibility(activeFrame?.landmarks) * 100)

  const importMotion = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as ForgeMotion
      if (parsed.format !== 'forge-motion' || !Array.isArray(parsed.frames)) throw new Error('Invalid Forge motion file')
      setClip({ ...parsed, source: 'import' })
      setFrames(parsed.frames)
      setPlayhead(0)
      setPlaying(false)
    } catch {
      alert('That file is not a valid Forge motion capture.')
    }
  }

  const importCharacter = (file?: File) => {
    if (!file) return
    const nextUrl = URL.createObjectURL(file)
    setCharacterUrl(nextUrl)
    setCharacterName(file.name)
    setRigInfo(undefined)
    setShowRig(false)
  }

  const useBuiltinCharacter = () => {
    setCharacterUrl(undefined)
    setCharacterName(BUILTIN_CHARACTER)
    setRigInfo(undefined)
    setShowRig(false)
  }

  const togglePlayback = () => {
    if (!clip) return
    if (playing) {
      playbackOffsetRef.current = playhead
      setPlaying(false)
      return
    }
    if (playhead >= clip.durationMs) {
      setPlayhead(0)
      playbackOffsetRef.current = 0
    } else {
      playbackOffsetRef.current = playhead
    }
    setPlaying(true)
  }

  return (
    <div className="mocap-layout">
      <section className="mocap-main">
        <div className="viewport-toolbar">
          <div>
            <span className="eyebrow">MOCAP STUDIO</span>
            <strong>{recording ? 'Recording live movement' : clip ? clip.name : characterName}</strong>
          </div>
          <div className="toolbar-actions">
            <label className="secondary-button file-button"><FileUp size={16} /> Replace character<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(e) => importCharacter(e.target.files?.[0])} /></label>
            <label className="secondary-button file-button"><FileUp size={16} /> Import motion<input type="file" accept=".json,.forge-motion.json" onChange={(e) => importMotion(e.target.files?.[0])} /></label>
            {clip && <button className="secondary-button" onClick={() => downloadJson(`${safeName(clip.name)}.forge-motion.json`, clip)}><Download size={16} /> Export</button>}
          </div>
        </div>

        <div className="mocap-viewport-wrap">
          <RetargetViewport
            className="mocap-viewport"
            src={characterUrl}
            landmarks={activeFrame?.landmarks}
            worldLandmarks={activeFrame?.worldLandmarks}
            smoothing={smoothing}
            mirrorX={mirrorX}
            showRig={showRig}
            onRigInfo={setRigInfo}
          />
          <div className="viewport-overlay top-left">
            <span className={`live-dot ${phoneConnected ? 'connected' : ''}`} />
            <span>{phoneConnected ? `${phoneName} connected` : 'Waiting for phone'}</span>
          </div>
          <div className="viewport-overlay top-right"><span className="character-dot" /><span>{characterName}{usingBuiltin ? ' · BUILT IN' : ''}</span></div>
          {recording && <div className="recording-pill"><span /> REC</div>}
          <div className="viewport-stats">
            <div><span>TRACKING</span><strong>{activeFrame ? `${visibility}%` : '—'}</strong></div>
            <div><span>LATENCY</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div>
            <div><span>RIG</span><strong>{rigInfo ? `${rigInfo.mappedCount}/${rigInfo.mappedCount + rigInfo.missing.length}` : '…'}</strong></div>
            <div><span>FRAMES</span><strong>{recording ? recordFramesRef.current.length : frames.length || '—'}</strong></div>
          </div>
        </div>

        <div className="timeline-panel">
          <div className="timeline-controls">
            <button className="icon-button" disabled={!clip} onClick={() => { setPlayhead(0); playbackOffsetRef.current = 0; setPlaying(false) }}><RotateCcw size={16} /></button>
            <button className="play-button" disabled={!clip} onClick={togglePlayback}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
            <span className="timecode">{formatDuration(playhead)} / {formatDuration(clip?.durationMs ?? 0)}</span>
            <div className="timeline-spacer" />
            {clip && <button className="icon-button danger-hover" title="Clear clip" onClick={() => { setClip(undefined); setFrames([]); setPlayhead(0); setPlaying(false) }}><Trash2 size={16} /></button>}
          </div>
          <input className="timeline-range" type="range" min={0} max={Math.max(1, clip?.durationMs ?? 1)} value={Math.min(playhead, clip?.durationMs ?? 0)} disabled={!clip} onChange={(e) => { const value = Number(e.target.value); setPlayhead(value); playbackOffsetRef.current = value; setPlaying(false) }} />
          <div className="timeline-track"><div className="track-label">PHONE BODY</div><div className={`track-clip ${clip ? 'has-clip' : ''}`}>{clip ? `${clip.frames.length} pose frames` : 'Record on your phone to create a clip'}</div></div>
          <div className="timeline-track character-track"><div className="track-label">CHARACTER</div><div className="track-clip has-character">Live retarget · {characterName}</div></div>
        </div>
      </section>

      <aside className="pair-panel">
        <div className="inspector-heading"><Smartphone size={17} /><span>Phone capture</span></div>
        {!phoneConnected ? (
          <>
            <div className="qr-shell">
              {captureUrl ? <QRCodeSVG value={captureUrl} size={184} bgColor="#ffffff" fgColor="#0d1016" level="M" marginSize={2} /> : <div className="qr-loading"><QrCode size={36} /><span>Creating session…</span></div>}
            </div>
            <h3>Scan with your phone</h3>
            <p className="pair-copy">The Forge Mannequin is already loaded. Scan the QR, allow the camera, and start moving.</p>
            <div className="pair-steps">
              <div><span>1</span><p>Scan QR</p></div>
              <div><span>2</span><p>Allow camera</p></div>
              <div><span>3</span><p>Move mannequin</p></div>
            </div>
          </>
        ) : (
          <div className="connected-card compact-connected-card">
            <div className="phone-illustration"><Smartphone size={42} /><span className="signal-ring" /></div>
            <span className="connected-label"><Radio size={14} /> LIVE CONNECTION</span>
            <h3>{phoneName}</h3>
            <p>One phone is streaming pose landmarks directly to Forge over WebRTC.</p>
            <div className="connection-grid"><div><span>Tracking</span><strong>{activeFrame ? `${visibility}%` : 'Waiting'}</strong></div><div><span>Latency</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div></div>
          </div>
        )}

        <div className="inspector-block character-inspector">
          <span className="property-label">Live character</span>
          <strong className="character-name">{characterName}</strong>
          <div className="mini-row"><span>Source</span><span className="status-good">{usingBuiltin ? 'Built in' : 'Imported'}</span></div>
          <div className="mini-row"><span>Humanoid bones</span><span className={rigInfo && rigInfo.mappedCount >= 10 ? 'status-good' : 'status-warn'}>{rigInfo ? `${rigInfo.mappedCount} mapped` : 'Scanning…'}</span></div>
          <div className="mini-row"><span>Total skeleton bones</span><span>{rigInfo?.totalBones ?? '—'}</span></div>
          {rigInfo && rigInfo.missing.length > 0 && <p className="rig-note">Missing: {rigInfo.missing.slice(0, 5).join(', ')}{rigInfo.missing.length > 5 ? '…' : ''}</p>}
          {usingBuiltin ? (
            <label className="inspector-action file-button">Replace with your GLB<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(e) => importCharacter(e.target.files?.[0])} /></label>
          ) : (
            <button className="inspector-action" onClick={useBuiltinCharacter}>Use Forge Mannequin</button>
          )}
        </div>

        <div className="inspector-block retarget-settings">
          <span className="property-label">Retarget settings</span>
          <label className="range-setting"><span><b>Smoothing</b><em>{Math.round(smoothing * 100)}%</em></span><input type="range" min="0" max="0.9" step="0.05" value={smoothing} onChange={(e) => setSmoothing(Number(e.target.value))} /></label>
          <label className="toggle-setting"><span><b>Mirror X</b><small>Use if left/right movement is reversed</small></span><input type="checkbox" checked={mirrorX} onChange={(e) => setMirrorX(e.target.checked)} /></label>
          <label className="toggle-setting"><span><b>Show rig</b><small>Overlay detected skeleton bones</small></span><input type="checkbox" checked={showRig} onChange={(e) => setShowRig(e.target.checked)} /></label>
        </div>

        <div className="inspector-block info-block"><span className="property-label">Capture quality</span><p>Place your single phone so your full body, hands and feet stay visible. More light and a clear background improve tracking.</p></div>
        <div className="inspector-block"><span className="property-label">v0.2.1 pipeline</span><div className="mini-row"><span>Built-in rigged mannequin</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Phone pose tracking</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Humanoid bone mapper</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Live character retargeting</span><span className="status-good">Ready</span></div><div className="mini-row"><span>GLB animation baking</span><span className="status-warn">Next</span></div></div>
      </aside>
    </div>
  )
}

function buildClip(frames: PoseFrame[], name: string): ForgeMotion {
  const firstT = frames[0]?.t ?? 0
  const normalized = frames.map((frame) => ({ ...frame, t: frame.t - firstT }))
  const durationMs = normalized.at(-1)?.t ?? 0
  const fps = durationMs > 0 ? Math.round((normalized.length / durationMs) * 1000) : 0
  return { format: 'forge-motion', version: 1, name, createdAt: new Date().toISOString(), fps, durationMs, frames: normalized, source: 'phone' }
}

function safeName(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'mocap'
}
