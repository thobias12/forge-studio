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
}

export type CaptureTiming = {
  videoTimeMs?: number
  inferenceMs?: number
  predictionMs?: number
  producedAt?: number
  handFallback?: 'left' | 'right' | 'both'
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
