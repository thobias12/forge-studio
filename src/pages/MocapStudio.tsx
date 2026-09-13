import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileUp, Pause, Play, QrCode, Radio, RotateCcw, Smartphone, Trash2 } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { QRCodeSVG } from 'qrcode.react'
import PoseViewport from '../components/PoseViewport'
import { averageVisibility, downloadJson, formatDuration } from '../lib/pose'
import type { ForgeMotion, PeerMessage, PoseFrame } from '../types'

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
  const connectionRef = useRef<DataConnection | null>(null)
  const recordFramesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const playbackStartedRef = useRef(0)
  const playbackOffsetRef = useRef(0)

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
          if (captured.length) setClip(buildClip(captured, `Mocap ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
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

  const captureUrl = peerId ? `${window.location.origin}/capture?target=${encodeURIComponent(peerId)}` : ''
  const activeFrame = useMemo(() => {
    if (!clip?.frames.length) return lastFrame
    const target = playhead
    let selected = clip.frames[0]
    for (const frame of clip.frames) {
      if (frame.t <= target) selected = frame
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

  const togglePlayback = () => {
    if (!clip) return
    if (playing) {
      playbackOffsetRef.current = playhead
      setPlaying(false)
    } else {
      if (playhead >= clip.durationMs) {
        setPlayhead(0)
        playbackOffsetRef.current = 0
      } else playbackOffsetRef.current = playhead
      setPlaying(true)
    }
  }

  return (
    <div className="mocap-layout">
      <section className="mocap-main">
        <div className="viewport-toolbar">
          <div>
            <span className="eyebrow">MOCAP STUDIO</span>
            <strong>{recording ? 'Recording live movement' : clip ? clip.name : 'Live phone capture'}</strong>
          </div>
          <div className="toolbar-actions">
            <label className="secondary-button file-button"><FileUp size={16} /> Import motion<input type="file" accept=".json,.forge-motion.json" onChange={(e) => importMotion(e.target.files?.[0])} /></label>
            {clip && <button className="secondary-button" onClick={() => downloadJson(`${safeName(clip.name)}.forge-motion.json`, clip)}><Download size={16} /> Export</button>}
          </div>
        </div>

        <div className="mocap-viewport-wrap">
          <PoseViewport className="mocap-viewport" landmarks={activeFrame?.landmarks} worldLandmarks={activeFrame?.worldLandmarks} />
          <div className="viewport-overlay top-left">
            <span className={`live-dot ${phoneConnected ? 'connected' : ''}`} />
            <span>{phoneConnected ? `${phoneName} connected` : 'Waiting for phone'}</span>
          </div>
          {recording && <div className="recording-pill"><span /> REC</div>}
          <div className="viewport-stats">
            <div><span>TRACKING</span><strong>{activeFrame ? `${visibility}%` : '—'}</strong></div>
            <div><span>LATENCY</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div>
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
            <p className="pair-copy">Open the QR code in your phone camera. Forge Capture will connect directly to this studio session.</p>
            <div className="pair-steps">
              <div><span>1</span><p>Scan QR</p></div>
              <div><span>2</span><p>Allow camera</p></div>
              <div><span>3</span><p>Start capture</p></div>
            </div>
          </>
        ) : (
          <div className="connected-card">
            <div className="phone-illustration"><Smartphone size={42} /><span className="signal-ring" /></div>
            <span className="connected-label"><Radio size={14} /> LIVE CONNECTION</span>
            <h3>{phoneName}</h3>
            <p>Pose frames are streaming directly to this browser over WebRTC.</p>
            <div className="connection-grid"><div><span>Tracking</span><strong>{activeFrame ? `${visibility}%` : 'Waiting'}</strong></div><div><span>Latency</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div></div>
          </div>
        )}
        <div className="inspector-block info-block"><span className="property-label">Capture quality</span><p>Place the phone so your full body stays visible. More light and a clear background improve tracking.</p></div>
        <div className="inspector-block"><span className="property-label">v0.1 pipeline</span><div className="mini-row"><span>Phone pose tracking</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Live PC preview</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Motion recording</span><span className="status-good">Ready</span></div><div className="mini-row"><span>GLB retargeting</span><span className="status-warn">Next</span></div></div>
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
