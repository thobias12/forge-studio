import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CircleStop, FlipHorizontal2, Radio, RotateCcw, Video } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { POSE_CONNECTIONS, downloadJson } from '../lib/pose'
import type { ForgeMotion, PeerMessage, PoseFrame, PosePoint, TrackingQuality } from '../types'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
const HAND_HOLD_MS = 240
const HAND_INFERENCE_MS = 85

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

type HandSeenTimes = { left: number; right: number }

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
  const handSeenRef = useRef<HandSeenTimes>({ left: 0, right: 0 })
  const rafRef = useRef(0)

  const [connected, setConnected] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [bodyScore, setBodyScore] = useState(0)
  const [bodyReady, setBodyReady] = useState(false)
  const [missingBody, setMissingBody] = useState<string[]>([])
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
      minPoseDetectionConfidence: 0.48,
      minPosePresenceConfidence: 0.48,
      minTrackingConfidence: 0.48,
    }
    const handOptions = {
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.34,
      minHandPresenceConfidence: 0.34,
      minTrackingConfidence: 0.38,
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
      handSeenRef.current = { left: 0, right: 0 }
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
          const poseResult = poseLandmarker.detectForVideo(video, now)
          const landmarks = poseResult.landmarks?.[0] as PosePoint[] | undefined
          const worldLandmarks = poseResult.worldLandmarks?.[0] as PosePoint[] | undefined

          if (handLandmarker && now - lastHandInferenceRef.current >= HAND_INFERENCE_MS) {
            lastHandInferenceRef.current = now
            const detected = extractHands(handLandmarker.detectForVideo(video, now) as any, landmarks)
            handsRef.current = holdHands(handsRef.current, detected, now, handSeenRef.current)
          } else {
            handsRef.current = holdHands(handsRef.current, {}, now, handSeenRef.current)
          }

          const hands = handsRef.current
          const currentHandCount = Number(!!hands.leftHandLandmarks) + Number(!!hands.rightHandLandmarks)
          setHandCount(currentHandCount)

          if (landmarks?.length) {
            const tracking = evaluateTracking(landmarks, currentHandCount)
            const frame: PoseFrame = {
              t: now,
              landmarks: stripLandmarks(landmarks),
              worldLandmarks: worldLandmarks ? stripLandmarks(worldLandmarks) : undefined,
              ...hands,
              tracking,
            }
            setBodyScore(tracking.bodyScore)
            setBodyReady(tracking.bodyReady)
            setMissingBody(tracking.missing)
            setFootCount(tracking.footCount)
            drawTracking(frame)
            if (connRef.current?.open) connRef.current.send({ type: 'pose-frame', frame } satisfies PeerMessage)
            if (recordingRef.current) { framesRef.current.push(frame); setFrameCount(framesRef.current.length) }
            fpsFrames++
          } else {
            setBodyScore(0)
            setBodyReady(false)
            setMissingBody(['body'])
            setFootCount(0)
            drawHandsOnly(hands)
          }

          if (now - fpsStarted >= 1000) {
            setFps(Math.round((fpsFrames * 1000) / (now - fpsStarted)))
            fpsFrames = 0
            fpsStarted = now
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
    const drawing = getDrawingContext()
    if (!drawing) return
    const { ctx, width, height } = drawing
    drawConnections(ctx, frame.landmarks, POSE_CONNECTIONS, width, height, 'rgba(139, 197, 255, .88)', 2.7)
    drawPoints(ctx, frame.landmarks, width, height, '#eef7ff', 3)
    drawDetailedHands(ctx, frame, width, height)
  }

  const drawHandsOnly = (hands: HandSnapshot) => {
    const drawing = getDrawingContext()
    if (!drawing) return
    const { ctx, width, height } = drawing
    drawDetailedHands(ctx, hands, width, height)
  }

  const getDrawingContext = () => {
    const canvas = canvasRef.current, video = videoRef.current
    if (!canvas || !video) return undefined
    const rect = video.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio))
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    return { ctx, width: rect.width, height: rect.height }
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
        {!cameraActive && <div className="camera-empty"><Camera size={45} /><h2>Phone Mocap</h2><p>One phone tracks your body, detailed hands and foot direction for Forge Studio.</p></div>}
        {cameraActive && <div className="capture-hud"><div><span>BODY</span><strong>{bodyScore}%</strong></div><div><span>HANDS</span><strong>{handCount}/2</strong></div><div><span>FEET</span><strong>{footCount}/2</strong></div><div><span>FPS</span><strong>{fps || '—'}</strong></div></div>}
        {recording && <div className="phone-rec"><span />{recordingSeconds.toFixed(1)}s</div>}
      </section>

      {error && <div className="capture-error">{error}</div>}

      <section className="capture-controls">
        {!cameraActive ? (
          <button className="capture-main-button" disabled={loading} onClick={() => startCamera()}><Video size={20} />{loading ? 'Loading trackers…' : 'Start camera'}</button>
        ) : (
          <><button className="capture-round-button" aria-label="Flip camera" onClick={toggleFacing}><FlipHorizontal2 size={20} /></button><button className={`record-button ${recording ? 'active' : ''}`} onClick={recording ? stopRecording : startRecording}>{recording ? <CircleStop size={34} /> : <span className="record-circle" />}</button><button className="capture-round-button" aria-label="Stop camera" onClick={stopCameraInternal}><CameraOff size={20} /></button></>
        )}
      </section>

      <section className="capture-info-card">
        <div><span className="property-label">Capture quality</span><strong>{bodyReady ? 'Full body ready' : cameraActive ? 'Move farther from the camera' : 'Waiting for camera'}</strong></div>
        <div className="capture-tip">
          {bodyReady
            ? 'Good framing. Keep your whole body inside the frame while recording. Green/orange 21-point overlays confirm detailed hand tracking.'
            : cameraActive
              ? `Forge needs shoulders, hips, knees, ankles and feet for full-body mocap.${missingBody.length ? ` Missing/weak: ${missingBody.join(', ')}.` : ''} Your hands can still be detected while you adjust the camera.`
              : 'Place the phone roughly chest height and step back until your whole body, including both feet, stays visible.'}
        </div>
        {framesRef.current.length > 0 && !recording && <button className="capture-export" onClick={exportLocal}><RotateCcw size={15} /> Save local backup</button>}
      </section>
    </main>
  )
}

function drawDetailedHands(ctx: CanvasRenderingContext2D, frame: HandSnapshot, width: number, height: number) {
  if (frame.leftHandLandmarks) {
    drawConnections(ctx, frame.leftHandLandmarks, HAND_CONNECTIONS, width, height, 'rgba(83, 238, 166, .98)', 3)
    drawPoints(ctx, frame.leftHandLandmarks, width, height, '#a9f4d2', 2.7)
  }
  if (frame.rightHandLandmarks) {
    drawConnections(ctx, frame.rightHandLandmarks, HAND_CONNECTIONS, width, height, 'rgba(255, 164, 83, .98)', 3)
    drawPoints(ctx, frame.rightHandLandmarks, width, height, '#ffd0a4', 2.7)
  }
}

function extractHands(result: any, poseLandmarks?: PosePoint[]): HandSnapshot {
  const detections = (result.landmarks ?? []).map((raw: PosePoint[], index: number) => ({
    points: stripLandmarks(raw),
    worldPoints: result.worldLandmarks?.[index] ? stripLandmarks(result.worldLandmarks[index] as PosePoint[]) : undefined,
    label: String(result.handedness?.[index]?.[0]?.categoryName ?? result.handedness?.[index]?.[0]?.displayName ?? '').toLowerCase(),
  }))
  const snapshot: HandSnapshot = {}
  if (!detections.length) return snapshot

  const leftWrist = poseLandmarks?.[15]
  const rightWrist = poseLandmarks?.[16]
  const leftUsable = pointUsable(leftWrist, 0.18)
  const rightUsable = pointUsable(rightWrist, 0.18)

  const assign = (side: 'left' | 'right', detection: typeof detections[number]) => {
    if (side === 'left') {
      snapshot.leftHandLandmarks = detection.points
      snapshot.leftHandWorldLandmarks = detection.worldPoints
    } else {
      snapshot.rightHandLandmarks = detection.points
      snapshot.rightHandWorldLandmarks = detection.worldPoints
    }
  }

  const availableWrists: Array<{ side: 'left' | 'right'; point: PosePoint }> = []
  if (leftUsable && leftWrist) availableWrists.push({ side: 'left', point: leftWrist })
  if (rightUsable && rightWrist) availableWrists.push({ side: 'right', point: rightWrist })

  const usedDetections = new Set<number>()
  const usedSides = new Set<'left' | 'right'>()
  const pairs = detections.flatMap((detection, detectionIndex) =>
    availableWrists.map(({ side, point }) => ({ detectionIndex, side, distance: distance2d(detection.points[0], point) })),
  ).sort((a, b) => a.distance - b.distance)

  for (const pair of pairs) {
    if (pair.distance > 0.34 || usedDetections.has(pair.detectionIndex) || usedSides.has(pair.side)) continue
    assign(pair.side, detections[pair.detectionIndex])
    usedDetections.add(pair.detectionIndex)
    usedSides.add(pair.side)
  }

  for (let detectionIndex = 0; detectionIndex < detections.length; detectionIndex += 1) {
    if (usedDetections.has(detectionIndex)) continue
    const detection = detections[detectionIndex]
    const side: 'left' | 'right' = detection.label.includes('left') ? 'right' : 'left'
    if (side === 'left' && !snapshot.leftHandLandmarks) assign('left', detection)
    else if (side === 'right' && !snapshot.rightHandLandmarks) assign('right', detection)
    else if (!snapshot.leftHandLandmarks) assign('left', detection)
    else if (!snapshot.rightHandLandmarks) assign('right', detection)
  }
  return snapshot
}

function holdHands(previous: HandSnapshot, detected: HandSnapshot, now: number, seen: HandSeenTimes): HandSnapshot {
  const next: HandSnapshot = {}
  for (const side of ['left', 'right'] as const) {
    const landmarkKey = `${side}HandLandmarks` as 'leftHandLandmarks' | 'rightHandLandmarks'
    const worldKey = `${side}HandWorldLandmarks` as 'leftHandWorldLandmarks' | 'rightHandWorldLandmarks'
    if (detected[landmarkKey]) {
      next[landmarkKey] = detected[landmarkKey]
      next[worldKey] = detected[worldKey]
      seen[side] = now
    } else if (previous[landmarkKey] && now - seen[side] <= HAND_HOLD_MS) {
      next[landmarkKey] = previous[landmarkKey]
      next[worldKey] = previous[worldKey]
    }
  }
  return next
}

function evaluateTracking(points: PosePoint[], handCount: number): TrackingQuality {
  const scoreIndices = [11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32]
  const values = scoreIndices.map((index) => Math.max(0, Math.min(1, points[index]?.visibility ?? 0)))
  const bodyScore = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
  const pairReady = (a: number, b: number, threshold: number) => pointUsable(points[a], threshold) && pointUsable(points[b], threshold)
  const leftFoot = [27,29,31].filter((index) => pointUsable(points[index], 0.38)).length >= 2
  const rightFoot = [28,30,32].filter((index) => pointUsable(points[index], 0.38)).length >= 2
  const footCount = Number(leftFoot) + Number(rightFoot)
  const missing: string[] = []
  if (!pairReady(11, 12, 0.45)) missing.push('shoulders')
  if (!pairReady(23, 24, 0.45)) missing.push('hips')
  if (!pairReady(25, 26, 0.42)) missing.push('knees')
  if (!pairReady(27, 28, 0.40)) missing.push('ankles')
  if (footCount < 2) missing.push('feet')
  return { bodyScore, bodyReady: missing.length === 0 && bodyScore >= 62, handCount, footCount, missing }
}

function pointUsable(point: PosePoint | undefined, threshold: number) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z) && (point.visibility ?? 1) >= threshold
}

function distance2d(a: PosePoint | undefined, b: PosePoint | undefined) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  return Math.hypot(a.x - b.x, a.y - b.y)
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
