export type PosePoint = {
  x: number
  y: number
  z: number
  visibility?: number
}

export type TrackingQuality = {
  bodyScore: number
  bodyReady: boolean
  handCount: number
  footCount: number
  missing: string[]
  ikAssistCount?: number
}

export type CaptureTiming = {
  engine?: 'holistic' | 'pose-lite'
  videoTimeMs?: number
  inferenceMs?: number
  bodyInferenceMs?: number
  handInferenceMs?: number
  predictionMs?: number
  producedAt?: number
  handAttempt?: 'left' | 'right'
  handDetected?: boolean
  handFallback?: 'left' | 'right' | 'both'
  cameraFpsTarget?: number
}

export type PoseFrame = {
  t: number
  landmarks: PosePoint[]
  worldLandmarks?: PosePoint[]
  leftHandLandmarks?: PosePoint[]
  rightHandLandmarks?: PosePoint[]
  leftHandWorldLandmarks?: PosePoint[]
  rightHandWorldLandmarks?: PosePoint[]
  tracking?: TrackingQuality
  capture?: CaptureTiming
}

export type ForgeMotion = {
  format: 'forge-motion'
  version: 1 | 2
  name: string
  createdAt: string
  fps: number
  durationMs: number
  frames: PoseFrame[]
  source: 'phone' | 'import'
}

export type PeerMessage =
  | { type: 'hello'; device: string }
  | { type: 'pose-frame'; frame: PoseFrame }
  | { type: 'recording-start'; name: string; startedAt: number }
  | { type: 'recording-stop'; stoppedAt: number }
  | { type: 'ping'; sentAt: number }
  | { type: 'pong'; sentAt: number }
