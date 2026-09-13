import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CircleStop, FlipHorizontal2, Radio, RotateCcw, Video } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { POSE_CONNECTIONS, averageVisibility, downloadJson } from '../lib/pose'
import type { ForgeMotion, PeerMessage, PoseFrame, PosePoint } from '../types'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

export default function Capture() {
  const params = new URLSearchParams(window.location.search)
  const target = params.get('target') || ''
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const connRef = useRef<DataConnection | null>(null)
  const framesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const recordingStartedRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastInferenceRef = useRef(0)
  const rafRef = useRef(0)

  const [connected, setConnected] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [visibility, setVisibility] = useState(0)
  const [fps, setFps] = useState(0)
  const [frameCount, setFrameCount] = useState(0)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    const peer = new Peer()
    peer.on('open', () => {
      const conn = peer.connect(target, { reliable: true, metadata: { device: navigator.userAgent } })
      connRef.current = conn
      conn.on('open', () => {
        setConnected(true)
        conn.send({ type: 'hello', device: detectDeviceName() } satisfies PeerMessage)
      })
      conn.on('close', () => setConnected(false))
      conn.on('data', (raw) => {
        const message = raw as PeerMessage
        if (message.type === 'ping') conn.send({ type: 'pong', sentAt: message.sentAt } satisfies PeerMessage)
      })
    })
    peer.on('error', () => setConnected(false))
    return () => {
      connRef.current?.close()
      peer.destroy()
    }
  }, [target])

  useEffect(() => {
    if (!recording) return
    const interval = window.setInterval(() => setRecordingSeconds((performance.now() - recordingStartedRef.current) / 1000), 100)
    return () => window.clearInterval(interval)
  }, [recording])

  useEffect(() => () => {
    stopCameraInternal()
    landmarkerRef.current?.close()
    landmarkerRef.current = null
  }, [])

  const initLandmarker = async () => {
    if (landmarkerRef.current) return landmarkerRef.current
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const options = {
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
    let landmarker: PoseLandmarker
    try {
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      })
    } catch {
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      })
    }
    landmarkerRef.current = landmarker
    return landmarker
  }

  const startCamera = async (mode = facingMode) => {
    setLoading(true)
    setError('')
    try {
      stopCameraInternal()
      await initLandmarker()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
        },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
      lastVideoTimeRef.current = -1
      lastInferenceRef.current = 0
      let fpsFrames = 0
      let fpsStarted = performance.now()

      const loop = () => {
        const video = videoRef.current
        const landmarker = landmarkerRef.current
        if (!video || !landmarker || !streamRef.current) return
        const now = performance.now()
        if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current && now - lastInferenceRef.current >= 30) {
          lastVideoTimeRef.current = video.currentTime
          lastInferenceRef.current = now
          const result = landmarker.detectForVideo(video, now)
          const landmarks = result.landmarks?.[0] as PosePoint[] | undefined
          const worldLandmarks = result.worldLandmarks?.[0] as PosePoint[] | undefined
          if (landmarks?.length) {
            const frame: PoseFrame = { t: now, landmarks: stripLandmarks(landmarks), worldLandmarks: worldLandmarks ? stripLandmarks(worldLandmarks) : undefined }
            setVisibility(Math.round(averageVisibility(frame.landmarks) * 100))
            drawPose(frame.landmarks)
            if (connRef.current?.open) connRef.current.send({ type: 'pose-frame', frame } satisfies PeerMessage)
            if (recordingRef.current) {
              framesRef.current.push(frame)
              setFrameCount(framesRef.current.length)
            }
            fpsFrames++
            if (now - fpsStarted >= 1000) {
              setFps(Math.round((fpsFrames * 1000) / (now - fpsStarted)))
              fpsFrames = 0
              fpsStarted = now
            }
          } else {
            setVisibility(0)
            clearOverlay()
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Camera or pose tracking could not start.'
      setError(message)
      setCameraActive(false)
    } finally {
      setLoading(false)
    }
  }

  const stopCameraInternal = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const toggleFacing = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    if (cameraActive) await startCamera(next)
  }

  const startRecording = () => {
    if (!cameraActive) return
    framesRef.current = []
    setFrameCount(0)
    recordingRef.current = true
    recordingStartedRef.current = performance.now()
    setRecordingSeconds(0)
    setRecording(true)
    connRef.current?.send({ type: 'recording-start', name: 'Phone Mocap', startedAt: performance.now() } satisfies PeerMessage)
  }

  const stopRecording = () => {
    recordingRef.current = false
    setRecording(false)
    connRef.current?.send({ type: 'recording-stop', stoppedAt: performance.now() } satisfies PeerMessage)
  }

  const exportLocal = () => {
    if (!framesRef.current.length) return
    const first = framesRef.current[0].t
    const frames = framesRef.current.map((frame) => ({ ...frame, t: frame.t - first }))
    const durationMs = frames.at(-1)?.t ?? 0
    const clip: ForgeMotion = {
      format: 'forge-motion', version: 1, name: `Phone Mocap ${new Date().toLocaleTimeString()}`, createdAt: new Date().toISOString(),
      fps: durationMs ? Math.round((frames.length / durationMs) * 1000) : 0, durationMs, frames, source: 'phone',
    }
    downloadJson(`phone-mocap-${Date.now()}.forge-motion.json`, clip)
  }

  const drawPose = (landmarks: PosePoint[]) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const rect = video.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = 'rgba(139, 197, 255, .9)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = landmarks[a], pb = landmarks[b]
      if (!pa || !pb || (pa.visibility ?? 1) < .35 || (pb.visibility ?? 1) < .35) continue
      ctx.beginPath()
      ctx.moveTo(pa.x * rect.width, pa.y * rect.height)
      ctx.lineTo(pb.x * rect.width, pb.y * rect.height)
      ctx.stroke()
    }
    ctx.fillStyle = '#eef7ff'
    for (const point of landmarks) {
      if ((point.visibility ?? 1) < .35) continue
      ctx.beginPath()
      ctx.arc(point.x * rect.width, point.y * rect.height, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const clearOverlay = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <main className="capture-page">
      <header className="capture-header">
        <div className="forge-mark compact"><span>F</span><div><strong>FORGE</strong><small>CAPTURE</small></div></div>
        <div className={`capture-connection ${connected ? 'online' : ''}`}><span /><Radio size={13} />{connected ? 'Studio connected' : target ? 'Connecting…' : 'Standalone mode'}</div>
      </header>

      <section className="capture-camera-shell">
        <video ref={videoRef} className={`capture-video ${facingMode === 'user' ? 'mirror' : ''}`} playsInline muted />
        <canvas ref={canvasRef} className={`capture-overlay ${facingMode === 'user' ? 'mirror' : ''}`} />
        {!cameraActive && <div className="camera-empty"><Camera size={45} /><h2>Phone Mocap</h2><p>Use your phone as a wireless motion-capture camera for Forge Studio.</p></div>}
        {cameraActive && <div className="capture-hud"><div><span>POSE</span><strong>{visibility}%</strong></div><div><span>FPS</span><strong>{fps || '—'}</strong></div><div><span>FRAMES</span><strong>{recording ? frameCount : '—'}</strong></div></div>}
        {recording && <div className="phone-rec"><span />{recordingSeconds.toFixed(1)}s</div>}
      </section>

      {error && <div className="capture-error">{error}</div>}

      <section className="capture-controls">
        {!cameraActive ? (
          <button className="capture-main-button" disabled={loading} onClick={() => startCamera()}><Video size={20} />{loading ? 'Loading tracker…' : 'Start camera'}</button>
        ) : (
          <>
            <button className="capture-round-button" aria-label="Flip camera" onClick={toggleFacing}><FlipHorizontal2 size={20} /></button>
            <button className={`record-button ${recording ? 'active' : ''}`} onClick={recording ? stopRecording : startRecording}>{recording ? <CircleStop size={34} /> : <span className="record-circle" />}</button>
            <button className="capture-round-button" aria-label="Stop camera" onClick={stopCameraInternal}><CameraOff size={20} /></button>
          </>
        )}
      </section>

      <section className="capture-info-card">
        <div><span className="property-label">Capture mode</span><strong>Full body · {facingMode === 'environment' ? 'Rear camera' : 'Front camera'}</strong></div>
        <div className="capture-tip">Keep your entire body visible, including both feet. Place the phone roughly chest height and step back until you have some space around your body.</div>
        {framesRef.current.length > 0 && !recording && <button className="capture-export" onClick={exportLocal}><RotateCcw size={15} /> Save local backup</button>}
      </section>
    </main>
  )
}

function stripLandmarks(points: PosePoint[]): PosePoint[] {
  return points.map(({ x, y, z, visibility }) => ({ x, y, z, visibility }))
}

function detectDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android phone'
  return 'Phone browser'
}
