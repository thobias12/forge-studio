import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CircleStop, FlipHorizontal2, Radio, RotateCcw, Video } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { POSE_CONNECTIONS, averageVisibility, downloadJson } from '../lib/pose'
import type { ForgeMotion, PeerMessage, PoseFrame, PosePoint } from '../types'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8], [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16], [13,17],[17,18],[18,19],[19,20], [0,17],
]

type HandSnapshot = {
  leftHandLandmarks?: PosePoint[]
  rightHandLandmarks?: PosePoint[]
  leftHandWorldLandmarks?: PosePoint[]
  rightHandWorldLandmarks?: PosePoint[]
}

export default function Capture() {
  const params = new URLSearchParams(window.location.search)
  const target = params.get('target') || ''
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null)
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const connRef = useRef<DataConnection | null>(null)
  const framesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const recordingStartedRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastInferenceRef = useRef(0)
  const lastHandInferenceRef = useRef(0)
  const handsRef = useRef<HandSnapshot>({})
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
  const [handCount, setHandCount] = useState(0)
  const [footCount, setFootCount] = useState(0)
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
    return () => { connRef.current?.close(); peer.destroy() }
  }, [target])

  useEffect(() => {
    if (!recording) return
    const interval = window.setInterval(() => setRecordingSeconds((performance.now() - recordingStartedRef.current) / 1000), 100)
    return () => window.clearInterval(interval)
  }, [recording])

  useEffect(() => () => {
    stopCameraInternal()
    poseLandmarkerRef.current?.close()
    handLandmarkerRef.current?.close()
    poseLandmarkerRef.current = null
    handLandmarkerRef.current = null
  }, [])

  const initLandmarkers = async () => {
    if (poseLandmarkerRef.current && handLandmarkerRef.current) return
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const poseOptions = {
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
    const handOptions = {
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    }

    try {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...poseOptions, baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' } })
    } catch {
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...poseOptions, baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'CPU' } })
    }
    try {
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, { ...handOptions, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' } })
    } catch {
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, { ...handOptions, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' } })
    }
  }

  const startCamera = async (mode = facingMode) => {
    setLoading(true)
    setError('')
    try {
      stopCameraInternal()
      await initLandmarkers()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } },
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setCameraActive(true)
      lastVideoTimeRef.current = -1
      lastInferenceRef.current = 0
      lastHandInferenceRef.current = 0
      handsRef.current = {}
      let fpsFrames = 0
      let fpsStarted = performance.now()

      const loop = () => {
        const video = videoRef.current
        const poseLandmarker = poseLandmarkerRef.current
        const handLandmarker = handLandmarkerRef.current
        if (!video || !poseLandmarker || !streamRef.current) return
        const now = performance.now()
        if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current && now - lastInferenceRef.current >= 30) {
          lastVideoTimeRef.current = video.currentTime
          lastInferenceRef.current = now
          const result = poseLandmarker.detectForVideo(video, now)
          const landmarks = result.landmarks?.[0] as PosePoint[] | undefined
          const worldLandmarks = result.worldLandmarks?.[0] as PosePoint[] | undefined

          if (handLandmarker && now - lastHandInferenceRef.current >= 50) {
            lastHandInferenceRef.current = now
            handsRef.current = extractHands(handLandmarker.detectForVideo(video, now) as any)
            setHandCount((handsRef.current.leftHandLandmarks ? 1 : 0) + (handsRef.current.rightHandLandmarks ? 1 : 0))
          }

          if (landmarks?.length) {
            const hands = handsRef.current
            const frame: PoseFrame = {
              t: now,
              landmarks: stripLandmarks(landmarks),
              worldLandmarks: worldLandmarks ? stripLandmarks(worldLandmarks) : undefined,
              ...hands,
            }
            setVisibility(Math.round(averageVisibility(frame.landmarks) * 100))
            const leftFoot = [27, 29, 31].filter((index) => (frame.landmarks[index]?.visibility ?? 0) > 0.4).length >= 2
            const rightFoot = [28, 30, 32].filter((index) => (frame.landmarks[index]?.visibility ?? 0) > 0.4).length >= 2
            setFootCount((leftFoot ? 1 : 0) + (rightFoot ? 1 : 0))
            drawTracking(frame)
            if (connRef.current?.open) connRef.current.send({ type: 'pose-frame', frame } satisfies PeerMessage)
            if (recordingRef.current) { framesRef.current.push(frame); setFrameCount(framesRef.current.length) }
            fpsFrames++
            if (now - fpsStarted >= 1000) {
              setFps(Math.round((fpsFrames * 1000) / (now - fpsStarted)))
              fpsFrames = 0
              fpsStarted = now
            }
          } else {
            setVisibility(0)
            setFootCount(0)
            clearOverlay()
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Camera or tracking could not start.')
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
      format: 'forge-motion', version: 2, name: `Phone Mocap ${new Date().toLocaleTimeString()}`, createdAt: new Date().toISOString(),
      fps: durationMs ? Math.round((frames.length / durationMs) * 1000) : 0, durationMs, frames, source: 'phone',
    }
    downloadJson(`phone-mocap-${Date.now()}.forge-motion.json`, clip)
  }

  const drawTracking = (frame: PoseFrame) => {
    const canvas = canvasRef.current, video = videoRef.current
    if (!canvas || !video) return
    const rect = video.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio))
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    drawConnections(ctx, frame.landmarks, POSE_CONNECTIONS, rect.width, rect.height, 'rgba(139, 197, 255, .9)', 3)
    drawPoints(ctx, frame.landmarks, rect.width, rect.height, '#eef7ff', 3.2)
    if (frame.leftHandLandmarks) {
      drawConnections(ctx, frame.leftHandLandmarks, HAND_CONNECTIONS, rect.width, rect.height, 'rgba(112, 234, 182, .95)', 2.4)
      drawPoints(ctx, frame.leftHandLandmarks, rect.width, rect.height, '#a9f4d2', 2.4)
    }
    if (frame.rightHandLandmarks) {
      drawConnections(ctx, frame.rightHandLandmarks, HAND_CONNECTIONS, rect.width, rect.height, 'rgba(255, 176, 103, .95)', 2.4)
      drawPoints(ctx, frame.rightHandLandmarks, rect.width, rect.height, '#ffd0a4', 2.4)
    }
  }

  const clearOverlay = () => {
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
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
        {!cameraActive && <div className="camera-empty"><Camera size={45} /><h2>Phone Mocap</h2><p>One phone tracks body, both hands and detailed foot direction for Forge Studio.</p></div>}
        {cameraActive && <div className="capture-hud"><div><span>BODY</span><strong>{visibility}%</strong></div><div><span>HANDS</span><strong>{handCount}/2</strong></div><div><span>FEET</span><strong>{footCount}/2</strong></div><div><span>FPS</span><strong>{fps || '—'}</strong></div></div>}
        {recording && <div className="phone-rec"><span />{recordingSeconds.toFixed(1)}s</div>}
      </section>

      {error && <div className="capture-error">{error}</div>}

      <section className="capture-controls">
        {!cameraActive ? (
          <button className="capture-main-button" disabled={loading} onClick={() => startCamera()}><Video size={20} />{loading ? 'Loading body + hand trackers…' : 'Start camera'}</button>
        ) : (
          <><button className="capture-round-button" aria-label="Flip camera" onClick={toggleFacing}><FlipHorizontal2 size={20} /></button><button className={`record-button ${recording ? 'active' : ''}`} onClick={recording ? stopRecording : startRecording}>{recording ? <CircleStop size={34} /> : <span className="record-circle" />}</button><button className="capture-round-button" aria-label="Stop camera" onClick={stopCameraInternal}><CameraOff size={20} /></button></>
        )}
      </section>

      <section className="capture-info-card">
        <div><span className="property-label">Capture mode</span><strong>Body + hands + feet · {facingMode === 'environment' ? 'Rear camera' : 'Front camera'}</strong></div>
        <div className="capture-tip">Keep your full body visible. For finger capture, keep your hands in front of your body when the exact finger pose matters. Feet use ankle + heel + toe landmarks for direction and planting.</div>
        {framesRef.current.length > 0 && !recording && <button className="capture-export" onClick={exportLocal}><RotateCcw size={15} /> Save local backup</button>}
      </section>
    </main>
  )
}

function extractHands(result: any): HandSnapshot {
  const snapshot: HandSnapshot = {}
  const landmarks = result.landmarks ?? []
  const world = result.worldLandmarks ?? []
  const handedness = result.handedness ?? []
  for (let index = 0; index < landmarks.length; index += 1) {
    const label = String(handedness[index]?.[0]?.categoryName ?? handedness[index]?.[0]?.displayName ?? '').toLowerCase()
    const points = stripLandmarks(landmarks[index] as PosePoint[])
    const worldPoints = world[index] ? stripLandmarks(world[index] as PosePoint[]) : undefined
    if (label.includes('left')) { snapshot.leftHandLandmarks = points; snapshot.leftHandWorldLandmarks = worldPoints }
    else if (label.includes('right')) { snapshot.rightHandLandmarks = points; snapshot.rightHandWorldLandmarks = worldPoints }
  }
  return snapshot
}

function drawConnections(ctx: CanvasRenderingContext2D, points: PosePoint[], connections: Array<[number, number]>, width: number, height: number, color: string, lineWidth: number) {
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'
  for (const [a, b] of connections) {
    const pa = points[a], pb = points[b]
    if (!pa || !pb || (pa.visibility ?? 1) < .35 || (pb.visibility ?? 1) < .35) continue
    ctx.beginPath(); ctx.moveTo(pa.x * width, pa.y * height); ctx.lineTo(pb.x * width, pb.y * height); ctx.stroke()
  }
}

function drawPoints(ctx: CanvasRenderingContext2D, points: PosePoint[], width: number, height: number, color: string, radius: number) {
  ctx.fillStyle = color
  for (const point of points) {
    if ((point.visibility ?? 1) < .35) continue
    ctx.beginPath(); ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2); ctx.fill()
  }
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
