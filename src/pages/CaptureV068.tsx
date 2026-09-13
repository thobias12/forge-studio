import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CircleStop, FlipHorizontal2, Radio, RotateCcw, Video } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { FilesetResolver, HandLandmarker, HolisticLandmarker, type HolisticLandmarkerResult } from '@mediapipe/tasks-vision'
import { POSE_CONNECTIONS, downloadJson } from '../lib/pose'
import type { ForgeMotion, PeerMessage, PoseFrame, PosePoint, TrackingQuality } from '../types'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const HOLISTIC_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task'
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const INFERENCE_INTERVAL_MS = 30
const HAND_HOLD_MS = 340
const HAND_FALLBACK_INTERVAL_MS = 85
const HAND_CROP_SIZE = 320

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
type PoseSnapshot = {
  t: number
  landmarks?: PosePoint[]
  worldLandmarks?: PosePoint[]
  hands: HandSnapshot
}

type HandSide = 'left' | 'right'

export default function CaptureV068() {
  const params = new URLSearchParams(window.location.search)
  const target = params.get('target') || ''
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const holisticRef = useRef<HolisticLandmarker | null>(null)
  const handTrackerRef = useRef<HandLandmarker | null>(null)
  const handCropCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const connRef = useRef<DataConnection | null>(null)
  const framesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const recordingStartedRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastInferenceRef = useRef(0)
  const lastHandFallbackRef = useRef(0)
  const fallbackSideRef = useRef<HandSide>('left')
  const handsRef = useRef<HandSnapshot>({})
  const handSeenRef = useRef<HandSeenTimes>({ left: 0, right: 0 })
  const readyStreakRef = useRef(0)
  const previousRawRef = useRef<PoseSnapshot>()
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
  const [inferenceMs, setInferenceMs] = useState(0)
  const [predictionMs, setPredictionMs] = useState(0)
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
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    holisticRef.current?.close()
    handTrackerRef.current?.close()
    holisticRef.current = null
    handTrackerRef.current = null
  }, [])

  const initTracker = async () => {
    if (holisticRef.current) return
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const holisticOptions = {
      runningMode: 'VIDEO' as const,
      minFaceDetectionConfidence: 0.7,
      minFacePresenceConfidence: 0.7,
      minFaceSuppressionThreshold: 0.3,
      minPoseDetectionConfidence: 0.42,
      minPosePresenceConfidence: 0.42,
      minPoseSuppressionThreshold: 0.3,
      minHandLandmarksConfidence: 0.28,
      outputFaceBlendshapes: false,
      outputPoseSegmentationMasks: false,
    }
    try {
      holisticRef.current = await HolisticLandmarker.createFromOptions(vision, {
        ...holisticOptions,
        baseOptions: { modelAssetPath: HOLISTIC_MODEL_URL, delegate: 'GPU' },
      })
    } catch {
      holisticRef.current = await HolisticLandmarker.createFromOptions(vision, {
        ...holisticOptions,
        baseOptions: { modelAssetPath: HOLISTIC_MODEL_URL, delegate: 'CPU' },
      })
    }

    const handOptions = {
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.24,
      minHandPresenceConfidence: 0.24,
      minTrackingConfidence: 0.24,
    }
    try {
      handTrackerRef.current = await HandLandmarker.createFromOptions(vision, {
        ...handOptions,
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
      })
    } catch {
      try {
        handTrackerRef.current = await HandLandmarker.createFromOptions(vision, {
          ...handOptions,
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' },
        })
      } catch {
        handTrackerRef.current = null
      }
    }
    handCropCanvasRef.current = document.createElement('canvas')
    handCropCanvasRef.current.width = HAND_CROP_SIZE
    handCropCanvasRef.current.height = HAND_CROP_SIZE
  }

  const stopCameraInternal = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const startCamera = async (mode = facingMode) => {
    setLoading(true)
    setError('')
    try {
      stopCameraInternal()
      await initTracker()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, max: 60 },
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
      lastHandFallbackRef.current = 0
      fallbackSideRef.current = 'left'
      previousRawRef.current = undefined
      handsRef.current = {}
      handSeenRef.current = { left: 0, right: 0 }
      readyStreakRef.current = 0
      let fpsFrames = 0
      let fpsStarted = performance.now()

      const loop = () => {
        const video = videoRef.current
        const tracker = holisticRef.current
        if (!video || !tracker || !streamRef.current) return
        const startedAt = performance.now()

        if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current && startedAt - lastInferenceRef.current >= INFERENCE_INTERVAL_MS) {
          lastVideoTimeRef.current = video.currentTime
          lastInferenceRef.current = startedAt
          const sourceVideoTimeMs = video.currentTime * 1000

          const result = tracker.detectForVideo(video, startedAt)
          const holisticDoneAt = performance.now()
          const rawLandmarks = copyPoints(result.poseLandmarks?.[0])
          const rawWorldLandmarks = copyPoints(result.poseWorldLandmarks?.[0])
          let detectedHands = extractHolisticHands(result)
          let fallbackUsed: HandSide | undefined

          if (rawLandmarks?.length === 33 && handTrackerRef.current && holisticDoneAt - lastHandFallbackRef.current >= HAND_FALLBACK_INTERVAL_MS) {
            const missingSides: HandSide[] = []
            if (!detectedHands.leftHandLandmarks?.length) missingSides.push('left')
            if (!detectedHands.rightHandLandmarks?.length) missingSides.push('right')
            if (missingSides.length) {
              let side = missingSides[0]
              if (missingSides.length === 2) {
                side = fallbackSideRef.current
                fallbackSideRef.current = side === 'left' ? 'right' : 'left'
              }
              const crop = detectHandCrop(video, handTrackerRef.current, rawLandmarks, side, holisticDoneAt + 0.01, handCropCanvasRef.current)
              if (crop?.landmarks?.length === 21) {
                fallbackUsed = side
                detectedHands = mergeHand(detectedHands, side, crop.landmarks, crop.worldLandmarks)
              }
              lastHandFallbackRef.current = holisticDoneAt
            }
          }

          const detectedAt = performance.now()
          const measuredInferenceMs = Math.max(0, detectedAt - startedAt)
          const predictedMs = Math.min(48, Math.max(6, measuredInferenceMs * 0.78 + 7))

          handsRef.current = holdHands(handsRef.current, detectedHands, detectedAt, handSeenRef.current)
          const rawHands = handsRef.current
          const previous = previousRawRef.current
          const dt = previous ? Math.max(12, Math.min(140, detectedAt - previous.t)) : 0
          const landmarks = predictPoints(rawLandmarks, previous?.landmarks, dt, predictedMs, 0.045)
          const worldLandmarks = predictPoints(rawWorldLandmarks, previous?.worldLandmarks, dt, predictedMs, 0.085)
          const hands = predictHands(rawHands, previous?.hands, dt, predictedMs)
          previousRawRef.current = {
            t: detectedAt,
            landmarks: rawLandmarks?.map(clonePoint),
            worldLandmarks: rawWorldLandmarks?.map(clonePoint),
            hands: cloneHands(rawHands),
          }

          const currentHandCount = Number(!!hands.leftHandLandmarks) + Number(!!hands.rightHandLandmarks)
          setHandCount(currentHandCount)
          setInferenceMs(Math.round(measuredInferenceMs))
          setPredictionMs(Math.round(predictedMs))

          if (landmarks?.length === 33) {
            const tracking = evaluateTracking(landmarks, currentHandCount)
            readyStreakRef.current = tracking.bodyReady ? Math.min(8, readyStreakRef.current + 1) : 0
            tracking.bodyReady = readyStreakRef.current >= 4
            const producedAt = performance.now()
            const frame: PoseFrame = {
              t: producedAt,
              landmarks,
              worldLandmarks,
              ...hands,
              tracking,
              capture: {
                videoTimeMs: sourceVideoTimeMs,
                inferenceMs: Number(measuredInferenceMs.toFixed(2)),
                predictionMs: Number(predictedMs.toFixed(2)),
                producedAt,
                handFallback: fallbackUsed,
              },
            }

            setBodyScore(tracking.bodyScore)
            setBodyReady(tracking.bodyReady)
            setMissingBody(tracking.missing)
            setFootCount(tracking.footCount)
            drawTracking(frame)

            if (connRef.current?.open) connRef.current.send({ type: 'pose-frame', frame } satisfies PeerMessage)
            if (recordingRef.current) {
              framesRef.current.push(frame)
              setFrameCount(framesRef.current.length)
            }
            fpsFrames += 1
          } else {
            readyStreakRef.current = 0
            setBodyScore(0)
            setBodyReady(false)
            setMissingBody(['body'])
            setFootCount(0)
            drawHandsOnly(hands)
          }

          if (detectedAt - fpsStarted >= 1000) {
            setFps(Math.round((fpsFrames * 1000) / (detectedAt - fpsStarted)))
            fpsFrames = 0
            fpsStarted = detectedAt
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Camera or holistic tracking could not start.')
      setCameraActive(false)
    } finally {
      setLoading(false)
    }
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
      format: 'forge-motion', version: 2,
      name: `Phone Mocap ${new Date().toLocaleTimeString()}`,
      createdAt: new Date().toISOString(),
      fps: durationMs ? Math.round((frames.length / durationMs) * 1000) : 0,
      durationMs, frames, source: 'phone',
    }
    downloadJson(`phone-mocap-${Date.now()}.forge-motion.json`, clip)
  }

  const getDrawingContext = () => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return undefined
    const rect = video.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    return { ctx, width: rect.width, height: rect.height }
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
    drawDetailedHands(drawing.ctx, hands, drawing.width, drawing.height)
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
        {!cameraActive && <div className="camera-empty"><Camera size={45} /><h2>Phone Mocap</h2><p>Forge tracks body, hands and feet from one phone, with high-detail hand fallback and latency compensation.</p></div>}
        {cameraActive && <div className="capture-hud"><div><span>BODY</span><strong>{bodyScore}%</strong></div><div><span>HANDS</span><strong>{handCount}/2</strong></div><div><span>FEET</span><strong>{footCount}/2</strong></div><div><span>FPS</span><strong>{fps || '—'}</strong></div></div>}
        {recording && <div className="phone-rec"><span />{recordingSeconds.toFixed(1)}s</div>}
      </section>

      {error && <div className="capture-error">{error}</div>}

      <section className="capture-controls">
        {!cameraActive ? (
          <button className="capture-main-button" disabled={loading} onClick={() => startCamera()}><Video size={20} />{loading ? 'Loading trackers…' : 'Start camera'}</button>
        ) : (
          <>
            <button className="capture-round-button" aria-label="Flip camera" onClick={toggleFacing}><FlipHorizontal2 size={20} /></button>
            <button className={`record-button ${recording ? 'active' : ''}`} onClick={recording ? stopRecording : startRecording}>{recording ? <CircleStop size={34} /> : <span className="record-circle" />}</button>
            <button className="capture-round-button" aria-label="Stop camera" onClick={stopCameraInternal}><CameraOff size={20} /></button>
          </>
        )}
      </section>

      <section className="capture-info-card">
        <div><span className="property-label">Capture quality</span><strong>{bodyReady ? 'Full body locked' : cameraActive ? 'Keep your whole body visible' : 'Waiting for camera'}</strong></div>
        <div className="capture-tip">
          {bodyReady
            ? handCount > 0
              ? 'Tracking is locked. Detailed hand crops automatically help when your fingers are small in the full-body frame.'
              : 'Body is locked. Keep your hands separated from your torso and facing the camera when finger detail matters.'
            : cameraActive
              ? `Forge needs stable shoulders, hips, knees, ankles and both feet.${missingBody.length ? ` Missing/weak: ${missingBody.join(', ')}.` : ''}`
              : 'Place the phone around waist/chest height and step back until your entire body, including both feet, remains in frame.'}
        </div>
        <div className="capture-tip">Tracking: {inferenceMs || '—'} ms inference · {predictionMs || '—'} ms motion compensation · camera requests up to 60 FPS. Processing stays on the phone.</div>
        {framesRef.current.length > 0 && !recording && <button className="capture-export" onClick={exportLocal}><RotateCcw size={15} /> Save local backup</button>}
      </section>
    </main>
  )
}

function extractHolisticHands(result: HolisticLandmarkerResult): HandSnapshot {
  return {
    leftHandLandmarks: copyPoints(result.leftHandLandmarks?.[0]),
    rightHandLandmarks: copyPoints(result.rightHandLandmarks?.[0]),
    leftHandWorldLandmarks: copyPoints(result.leftHandWorldLandmarks?.[0]),
    rightHandWorldLandmarks: copyPoints(result.rightHandWorldLandmarks?.[0]),
  }
}

function detectHandCrop(video: HTMLVideoElement, tracker: HandLandmarker, pose: PosePoint[], side: HandSide, timestamp: number, canvas?: HTMLCanvasElement | null) {
  if (!canvas || !video.videoWidth || !video.videoHeight) return undefined
  const wristIndex = side === 'left' ? 15 : 16
  const elbowIndex = side === 'left' ? 13 : 14
  const wrist = pose[wristIndex]
  const elbow = pose[elbowIndex]
  if (!pointFinite(wrist) || !pointFinite(elbow)) return undefined

  const vw = video.videoWidth
  const vh = video.videoHeight
  const wx = wrist.x * vw
  const wy = wrist.y * vh
  const ex = elbow.x * vw
  const ey = elbow.y * vh
  const vx = wx - ex
  const vy = wy - ey
  const forearm = Math.max(45, Math.hypot(vx, vy))
  const requested = Math.max(170, Math.min(Math.min(vw, vh) * 0.62, forearm * 2.65))
  const cx = wx + vx * 0.42
  const cy = wy + vy * 0.42
  const sw = Math.min(requested, vw)
  const sh = Math.min(requested, vh)
  const sx = clamp(cx - sw * 0.5, 0, Math.max(0, vw - sw))
  const sy = clamp(cy - sh * 0.5, 0, Math.max(0, vh - sh))

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return undefined
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, HAND_CROP_SIZE, HAND_CROP_SIZE)

  const result = tracker.detectForVideo(canvas, timestamp)
  const local = copyPoints(result.landmarks?.[0])
  if (!local?.length) return undefined
  const landmarks = local.map((point) => ({
    ...point,
    x: (sx + point.x * sw) / vw,
    y: (sy + point.y * sh) / vh,
  }))
  return { landmarks, worldLandmarks: copyPoints(result.worldLandmarks?.[0]) }
}

function mergeHand(snapshot: HandSnapshot, side: HandSide, landmarks: PosePoint[], worldLandmarks?: PosePoint[]) {
  if (side === 'left') return { ...snapshot, leftHandLandmarks: landmarks, leftHandWorldLandmarks: worldLandmarks }
  return { ...snapshot, rightHandLandmarks: landmarks, rightHandWorldLandmarks: worldLandmarks }
}

function holdHands(previous: HandSnapshot, detected: HandSnapshot, now: number, seen: HandSeenTimes): HandSnapshot {
  const next: HandSnapshot = {}
  for (const side of ['left', 'right'] as const) {
    const landmarkKey = `${side}HandLandmarks` as 'leftHandLandmarks' | 'rightHandLandmarks'
    const worldKey = `${side}HandWorldLandmarks` as 'leftHandWorldLandmarks' | 'rightHandWorldLandmarks'
    if (detected[landmarkKey]?.length === 21) {
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

function predictHands(current: HandSnapshot, previous: HandSnapshot | undefined, dt: number, horizon: number): HandSnapshot {
  return {
    leftHandLandmarks: predictPoints(current.leftHandLandmarks, previous?.leftHandLandmarks, dt, horizon, 0.055),
    rightHandLandmarks: predictPoints(current.rightHandLandmarks, previous?.rightHandLandmarks, dt, horizon, 0.055),
    leftHandWorldLandmarks: predictPoints(current.leftHandWorldLandmarks, previous?.leftHandWorldLandmarks, dt, horizon, 0.07),
    rightHandWorldLandmarks: predictPoints(current.rightHandWorldLandmarks, previous?.rightHandWorldLandmarks, dt, horizon, 0.07),
  }
}

function predictPoints(current: PosePoint[] | undefined, previous: PosePoint[] | undefined, dt: number, horizon: number, maxAdvance: number) {
  if (!current?.length) return undefined
  if (!previous || previous.length !== current.length || dt <= 0) return current.map(clonePoint)
  const factor = Math.min(1.6, Math.max(0, horizon / dt)) * 0.72
  return current.map((point, index) => {
    const before = previous[index]
    if (!pointFinite(point) || !pointFinite(before)) return clonePoint(point)
    let dx = (point.x - before.x) * factor
    let dy = (point.y - before.y) * factor
    let dz = (point.z - before.z) * factor
    const magnitude = Math.hypot(dx, dy, dz)
    if (magnitude > maxAdvance && magnitude > 1e-6) {
      const scale = maxAdvance / magnitude
      dx *= scale; dy *= scale; dz *= scale
    }
    return { x: point.x + dx, y: point.y + dy, z: point.z + dz, visibility: point.visibility }
  })
}

function cloneHands(hands: HandSnapshot): HandSnapshot {
  return {
    leftHandLandmarks: hands.leftHandLandmarks?.map(clonePoint),
    rightHandLandmarks: hands.rightHandLandmarks?.map(clonePoint),
    leftHandWorldLandmarks: hands.leftHandWorldLandmarks?.map(clonePoint),
    rightHandWorldLandmarks: hands.rightHandWorldLandmarks?.map(clonePoint),
  }
}

function evaluateTracking(points: PosePoint[], handCount: number): TrackingQuality {
  const scoreIndices = [11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32]
  const values = scoreIndices.map((index) => Math.max(0, Math.min(1, points[index]?.visibility ?? 0)))
  const bodyScore = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
  const pairReady = (a: number, b: number, threshold: number) => pointUsable(points[a], threshold) && pointUsable(points[b], threshold)
  const leftFoot = [27,29,31].filter((index) => pointUsable(points[index], 0.34)).length >= 2
  const rightFoot = [28,30,32].filter((index) => pointUsable(points[index], 0.34)).length >= 2
  const footCount = Number(leftFoot) + Number(rightFoot)
  const missing: string[] = []
  if (!pairReady(11, 12, 0.4)) missing.push('shoulders')
  if (!pairReady(23, 24, 0.4)) missing.push('hips')
  if (!pairReady(25, 26, 0.31)) missing.push('knees')
  if (!pairReady(27, 28, 0.32)) missing.push('ankles')
  if (footCount < 2) missing.push('feet')
  return { bodyScore, bodyReady: missing.length === 0 && bodyScore >= 56, handCount, footCount, missing }
}

function pointUsable(point: PosePoint | undefined, threshold: number) {
  return pointFinite(point) && (point!.visibility ?? 1) >= threshold
}

function pointFinite(point: PosePoint | undefined): point is PosePoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
}

function copyPoints(points: Array<{ x: number; y: number; z: number; visibility?: number }> | undefined): PosePoint[] | undefined {
  if (!points?.length) return undefined
  return points.map(({ x, y, z, visibility }) => ({ x, y, z, visibility }))
}

function clonePoint(point: PosePoint): PosePoint {
  return { x: point.x, y: point.y, z: point.z, visibility: point.visibility }
}

function drawDetailedHands(ctx: CanvasRenderingContext2D, frame: HandSnapshot, width: number, height: number) {
  if (frame.leftHandLandmarks) {
    drawConnections(ctx, frame.leftHandLandmarks, HAND_CONNECTIONS, width, height, 'rgba(83, 238, 166, .98)', 3, true)
    drawPoints(ctx, frame.leftHandLandmarks, width, height, '#a9f4d2', 2.7, true)
  }
  if (frame.rightHandLandmarks) {
    drawConnections(ctx, frame.rightHandLandmarks, HAND_CONNECTIONS, width, height, 'rgba(255, 164, 83, .98)', 3, true)
    drawPoints(ctx, frame.rightHandLandmarks, width, height, '#ffd0a4', 2.7, true)
  }
}

function drawConnections(ctx: CanvasRenderingContext2D, points: PosePoint[], connections: Array<[number, number]>, width: number, height: number, color: string, lineWidth: number, ignoreVisibility = false) {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  for (const [a, b] of connections) {
    const pa = points[a], pb = points[b]
    if (!pa || !pb || (!ignoreVisibility && ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3))) continue
    ctx.beginPath()
    ctx.moveTo(pa.x * width, pa.y * height)
    ctx.lineTo(pb.x * width, pb.y * height)
    ctx.stroke()
  }
}

function drawPoints(ctx: CanvasRenderingContext2D, points: PosePoint[], width: number, height: number, color: string, radius: number, ignoreVisibility = false) {
  ctx.fillStyle = color
  for (const point of points) {
    if (!ignoreVisibility && (point.visibility ?? 1) < 0.3) continue
    ctx.beginPath()
    ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function detectDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android phone'
  return 'Phone browser'
}
