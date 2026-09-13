import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CircleStop, FlipHorizontal2, Radio, RotateCcw, Video } from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { POSE_CONNECTIONS, downloadJson } from '../lib/pose'
import type { ForgeMotion, PeerMessage, PoseFrame, PosePoint, TrackingQuality } from '../types'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const HAND_HOLD_MS = 420
const HAND_INTERVAL_MS = 46
const HAND_CROP_SIZE = 384

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

type HandSide = 'left' | 'right'
type HandSeenTimes = { left: number; right: number }
type HandMissCounts = { left: number; right: number }
type PoseSnapshot = {
  t: number
  landmarks?: PosePoint[]
  worldLandmarks?: PosePoint[]
}

type HandRunInfo = {
  side?: HandSide
  detected: boolean
  inferenceMs: number
}

export default function CaptureV069() {
  const params = new URLSearchParams(window.location.search)
  const target = params.get('target') || ''
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const poseTrackerRef = useRef<PoseLandmarker | null>(null)
  const handTrackerRef = useRef<HandLandmarker | null>(null)
  const handCropCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const connRef = useRef<DataConnection | null>(null)
  const framesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const recordingStartedRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastHandRunRef = useRef(0)
  const nextHandSideRef = useRef<HandSide>('left')
  const handsRef = useRef<HandSnapshot>({})
  const handSeenRef = useRef<HandSeenTimes>({ left: 0, right: 0 })
  const handMissRef = useRef<HandMissCounts>({ left: 0, right: 0 })
  const lastHandRunInfoRef = useRef<HandRunInfo>({ detected: false, inferenceMs: 0 })
  const readyStreakRef = useRef(0)
  const previousBodyRef = useRef<PoseSnapshot>()
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
  const [ikAssistCount, setIkAssistCount] = useState(0)
  const [bodyInferenceMs, setBodyInferenceMs] = useState(0)
  const [handInferenceMs, setHandInferenceMs] = useState(0)
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
    poseTrackerRef.current?.close()
    handTrackerRef.current?.close()
    poseTrackerRef.current = null
    handTrackerRef.current = null
  }, [])

  const initTrackers = async () => {
    if (poseTrackerRef.current) return
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const poseOptions = {
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.38,
      minPosePresenceConfidence: 0.38,
      minTrackingConfidence: 0.38,
      outputSegmentationMasks: false,
    }
    try {
      poseTrackerRef.current = await PoseLandmarker.createFromOptions(vision, {
        ...poseOptions,
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
      })
    } catch {
      poseTrackerRef.current = await PoseLandmarker.createFromOptions(vision, {
        ...poseOptions,
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'CPU' },
      })
    }

    const handOptions = {
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.22,
      minHandPresenceConfidence: 0.22,
      minTrackingConfidence: 0.22,
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
      await initTrackers()
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
      lastHandRunRef.current = 0
      nextHandSideRef.current = 'left'
      previousBodyRef.current = undefined
      handsRef.current = {}
      handSeenRef.current = { left: 0, right: 0 }
      handMissRef.current = { left: 0, right: 0 }
      lastHandRunInfoRef.current = { detected: false, inferenceMs: 0 }
      readyStreakRef.current = 0
      let fpsFrames = 0
      let fpsStarted = performance.now()

      const loop = () => {
        const video = videoRef.current
        const tracker = poseTrackerRef.current
        if (!video || !tracker || !streamRef.current) return
        const startedAt = performance.now()

        if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime
          const sourceVideoTimeMs = video.currentTime * 1000

          const poseResult = tracker.detectForVideo(video, startedAt)
          const poseDoneAt = performance.now()
          const measuredBodyInferenceMs = Math.max(0, poseDoneAt - startedAt)
          const rawLandmarks = copyPoints(poseResult.landmarks?.[0])
          const rawWorldLandmarks = copyPoints(poseResult.worldLandmarks?.[0])
          const predictedMs = Math.min(28, Math.max(4, measuredBodyInferenceMs * 0.46 + 4))

          const previous = previousBodyRef.current
          const dt = previous ? Math.max(10, Math.min(120, poseDoneAt - previous.t)) : 0
          const landmarks = predictPoints(rawLandmarks, previous?.landmarks, dt, predictedMs, 0.032)
          const worldLandmarks = predictPoints(rawWorldLandmarks, previous?.worldLandmarks, dt, predictedMs, 0.055)
          previousBodyRef.current = {
            t: poseDoneAt,
            landmarks: rawLandmarks?.map(clonePoint),
            worldLandmarks: rawWorldLandmarks?.map(clonePoint),
          }

          handsRef.current = holdHands(handsRef.current, {}, poseDoneAt, handSeenRef.current)
          const hands = cloneHands(handsRef.current)
          const currentHandCount = Number(!!hands.leftHandLandmarks) + Number(!!hands.rightHandLandmarks)
          setHandCount(currentHandCount)
          setBodyInferenceMs(Math.round(measuredBodyInferenceMs))
          setHandInferenceMs(Math.round(lastHandRunInfoRef.current.inferenceMs))
          setPredictionMs(Math.round(predictedMs))

          if (landmarks?.length === 33) {
            const tracking = evaluateTracking(landmarks, currentHandCount)
            readyStreakRef.current = tracking.bodyReady ? Math.min(8, readyStreakRef.current + 1) : Math.max(0, readyStreakRef.current - 1)
            tracking.bodyReady = readyStreakRef.current >= 3
            const producedAt = performance.now()
            const handRun = lastHandRunInfoRef.current
            const frame: PoseFrame = {
              t: producedAt,
              landmarks,
              worldLandmarks,
              ...hands,
              tracking,
              capture: {
                engine: 'pose-lite',
                videoTimeMs: sourceVideoTimeMs,
                inferenceMs: Number(measuredBodyInferenceMs.toFixed(2)),
                bodyInferenceMs: Number(measuredBodyInferenceMs.toFixed(2)),
                handInferenceMs: Number(handRun.inferenceMs.toFixed(2)),
                predictionMs: Number(predictedMs.toFixed(2)),
                producedAt,
                handAttempt: handRun.side,
                handDetected: handRun.detected,
                handFallback: handRun.detected ? handRun.side : undefined,
                cameraFpsTarget: 60,
              },
            }

            setBodyScore(tracking.bodyScore)
            setBodyReady(tracking.bodyReady)
            setMissingBody(tracking.missing)
            setFootCount(tracking.footCount)
            setIkAssistCount(tracking.ikAssistCount ?? 0)
            drawTracking(frame)

            if (connRef.current?.open) connRef.current.send({ type: 'pose-frame', frame } satisfies PeerMessage)
            if (recordingRef.current) {
              framesRef.current.push(frame)
              setFrameCount(framesRef.current.length)
            }
            fpsFrames += 1

            if (handTrackerRef.current && poseDoneAt - lastHandRunRef.current >= HAND_INTERVAL_MS) {
              const side = chooseHandSide(landmarks, nextHandSideRef.current)
              nextHandSideRef.current = side === 'left' ? 'right' : 'left'
              const handStarted = performance.now()
              const crop = detectHandCrop(
                video,
                handTrackerRef.current,
                landmarks,
                side,
                handStarted,
                handCropCanvasRef.current,
                handMissRef.current[side],
              )
              const handDone = performance.now()
              const handMs = Math.max(0, handDone - handStarted)
              lastHandRunRef.current = handDone
              lastHandRunInfoRef.current = { side, detected: !!crop?.landmarks?.length, inferenceMs: handMs }

              if (crop?.landmarks?.length === 21) {
                handMissRef.current[side] = 0
                handsRef.current = mergeHand(handsRef.current, side, crop.landmarks, crop.worldLandmarks)
                handSeenRef.current[side] = handDone
              } else {
                handMissRef.current[side] = Math.min(5, handMissRef.current[side] + 1)
              }
            }
          } else {
            readyStreakRef.current = 0
            setBodyScore(0)
            setBodyReady(false)
            setMissingBody(['body'])
            setFootCount(0)
            setIkAssistCount(0)
            drawHandsOnly(hands)
          }

          const doneAt = performance.now()
          if (doneAt - fpsStarted >= 1000) {
            setFps(Math.round((fpsFrames * 1000) / (doneAt - fpsStarted)))
            fpsFrames = 0
            fpsStarted = doneAt
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Camera or Pose Lite tracking could not start.')
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
        {!cameraActive && <div className="camera-empty"><Camera size={45} /><h2>Phone Mocap</h2><p>Pose Lite handles the body at high speed while dedicated wrist-guided crops capture detailed hands.</p></div>}
        {cameraActive && <div className="capture-hud"><div><span>BODY</span><strong>{bodyScore}%</strong></div><div><span>HANDS</span><strong>{handCount}/2</strong></div><div><span>FEET</span><strong>{footCount}/2</strong></div><div><span>FPS</span><strong>{fps || '—'}</strong></div></div>}
        {recording && <div className="phone-rec"><span />{recordingSeconds.toFixed(1)}s</div>}
      </section>

      {error && <div className="capture-error">{error}</div>}

      <section className="capture-controls">
        {!cameraActive ? (
          <button className="capture-main-button" disabled={loading} onClick={() => startCamera()}><Video size={20} />{loading ? 'Loading fast trackers…' : 'Start camera'}</button>
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
              ? `Fast body tracking locked${ikAssistCount ? ` · IK assisting ${ikAssistCount} knee${ikAssistCount > 1 ? 's' : ''}` : ''}. Detailed hand crops run independently.`
              : `Body locked${ikAssistCount ? ` with IK assisting ${ikAssistCount} knee${ikAssistCount > 1 ? 's' : ''}` : ''}. Keep hands separated from your torso and visible to the camera.`
            : cameraActive
              ? `Forge needs shoulders, hips, ankles and both feet. Weak knees can now be reconstructed with IK.${missingBody.length ? ` Missing/weak: ${missingBody.join(', ')}.` : ''}`
              : 'Place the phone around waist/chest height and step back until your entire body, including both feet, remains in frame.'}
        </div>
        <div className="capture-tip">Engine: Pose Lite · body {bodyInferenceMs || '—'} ms · hand crop {handInferenceMs || '—'} ms · prediction {predictionMs || '—'} ms · camera requests up to 60 FPS.</div>
        {framesRef.current.length > 0 && !recording && <button className="capture-export" onClick={exportLocal}><RotateCcw size={15} /> Save local backup</button>}
      </section>
    </main>
  )
}

function chooseHandSide(pose: PosePoint[], preferred: HandSide): HandSide {
  const preferredWrist = pose[preferred === 'left' ? 15 : 16]
  const other: HandSide = preferred === 'left' ? 'right' : 'left'
  const otherWrist = pose[other === 'left' ? 15 : 16]
  if (pointUsable(preferredWrist, 0.16)) return preferred
  if (pointUsable(otherWrist, 0.16)) return other
  return preferred
}

function detectHandCrop(
  video: HTMLVideoElement,
  tracker: HandLandmarker,
  pose: PosePoint[],
  side: HandSide,
  timestamp: number,
  canvas?: HTMLCanvasElement | null,
  missCount = 0,
) {
  if (!canvas || !video.videoWidth || !video.videoHeight) return undefined
  const indices = side === 'left'
    ? { elbow: 13, wrist: 15, pinky: 17, index: 19, thumb: 21 }
    : { elbow: 14, wrist: 16, pinky: 18, index: 20, thumb: 22 }

  const wrist = pose[indices.wrist]
  const elbow = pose[indices.elbow]
  if (!pointFinite(wrist) || !pointFinite(elbow)) return undefined

  const vw = video.videoWidth
  const vh = video.videoHeight
  const anchors = [pose[indices.wrist], pose[indices.pinky], pose[indices.index], pose[indices.thumb]]
    .filter((point): point is PosePoint => pointFinite(point))
  if (!anchors.length) return undefined

  const pixels = anchors.map((point) => ({ x: point.x * vw, y: point.y * vh }))
  const cx = pixels.reduce((sum, point) => sum + point.x, 0) / pixels.length
  const cy = pixels.reduce((sum, point) => sum + point.y, 0) / pixels.length
  const wx = wrist.x * vw
  const wy = wrist.y * vh
  const ex = elbow.x * vw
  const ey = elbow.y * vh
  const forearm = Math.max(42, Math.hypot(wx - ex, wy - ey))
  const handExtent = Math.max(18, ...pixels.map((point) => Math.hypot(point.x - cx, point.y - cy)))
  const expansion = 1 + Math.min(0.55, missCount * 0.12)
  const requested = Math.max(150, Math.min(Math.min(vw, vh) * 0.7, Math.max(forearm * 1.45, handExtent * 5.1) * expansion))
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

function predictPoints(current: PosePoint[] | undefined, previous: PosePoint[] | undefined, dt: number, horizon: number, maxAdvance: number) {
  if (!current?.length) return undefined
  if (!previous || previous.length !== current.length || dt <= 0) return current.map(clonePoint)
  const factor = Math.min(1.15, Math.max(0, horizon / dt)) * 0.62
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
  const scoreIndices = [11,12,13,14,15,16,23,24,27,28,29,30,31,32]
  const values = scoreIndices.map((index) => Math.max(0, Math.min(1, points[index]?.visibility ?? 0)))
  const bodyScore = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
  const pairReady = (a: number, b: number, threshold: number) => pointUsable(points[a], threshold) && pointUsable(points[b], threshold)
  const hipsReady = pairReady(23, 24, 0.36)
  const anklesReady = pairReady(27, 28, 0.3)
  const leftFoot = [27,29,31].filter((index) => pointUsable(points[index], 0.28)).length >= 2
  const rightFoot = [28,30,32].filter((index) => pointUsable(points[index], 0.28)).length >= 2
  const footCount = Number(leftFoot) + Number(rightFoot)
  const leftKneeGood = pointUsable(points[25], 0.3)
  const rightKneeGood = pointUsable(points[26], 0.3)
  const leftKneeRecoverable = !leftKneeGood && pointUsable(points[23], 0.28) && pointUsable(points[27], 0.26)
  const rightKneeRecoverable = !rightKneeGood && pointUsable(points[24], 0.28) && pointUsable(points[28], 0.26)
  const ikAssistCount = Number(leftKneeRecoverable) + Number(rightKneeRecoverable)
  const missing: string[] = []
  if (!pairReady(11, 12, 0.36)) missing.push('shoulders')
  if (!hipsReady) missing.push('hips')
  if (!leftKneeGood && !leftKneeRecoverable || !rightKneeGood && !rightKneeRecoverable) missing.push('knees')
  if (!anklesReady) missing.push('ankles')
  if (footCount < 2) missing.push('feet')
  return { bodyScore, bodyReady: missing.length === 0 && bodyScore >= 54, handCount, footCount, missing, ikAssistCount }
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
