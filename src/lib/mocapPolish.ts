import type { PoseFrame, PosePoint } from '../types'

export type MocapBodySpace = 'world' | 'image'

export type MocapPolishOptions = {
  calibrationFrames?: number
  dropoutHoldMs?: number
  jointStability?: number
  handStability?: number
  footLock?: boolean
  footLockStrength?: number
}

export type MocapPolishQuality = {
  bodyScore: number
  handCount: number
  footCount: number
  weakJoints: string[]
  calibrationProgress: number
  calibrated: boolean
  recoveredPoints: number
  leftFootLocked: boolean
  rightFootLocked: boolean
  leftHandHeld: boolean
  rightHandHeld: boolean
  bodySpace: MocapBodySpace
}

export type MocapPolishResult = {
  body: PosePoint[]
  bodySpace: MocapBodySpace
  leftHand?: PosePoint[]
  rightHand?: PosePoint[]
  quality: MocapPolishQuality
}

type PointMemory = { point: PosePoint; seenAt: number }
type FootState = {
  lastCenter?: PosePoint
  anchor?: PosePoint
  plantedFrames: number
  locked: boolean
}

type CalibrationSample = {
  floorY: number
  shoulderWidth: number
  hipWidth: number
  torsoLength: number
  upperArm: number
  lowerArm: number
  upperLeg: number
  lowerLeg: number
}

type Calibration = {
  floorY: number
  shoulderWidth: number
  hipWidth: number
  torsoLength: number
  upperArm: number
  lowerArm: number
  upperLeg: number
  lowerLeg: number
}

export type MocapPolishState = {
  calibrationSamples: CalibrationSample[]
  calibration?: Calibration
  bodyMemory: Array<PointMemory | undefined>
  lastBody?: PosePoint[]
  lastLeftHand?: PosePoint[]
  lastRightHand?: PosePoint[]
  lastLeftHandAt: number
  lastRightHandAt: number
  leftFoot: FootState
  rightFoot: FootState
  hingeNormals: Record<string, PosePoint | undefined>
  lastInput?: PosePoint[]
  lastTimestamp: number
  cached?: MocapPolishResult
}

const DEFAULTS: Required<MocapPolishOptions> = {
  calibrationFrames: 36,
  dropoutHoldMs: 220,
  jointStability: 0.76,
  handStability: 0.68,
  footLock: true,
  footLockStrength: 0.88,
}

const IMPORTANT_JOINTS: Array<[number, string]> = [
  [11, 'left shoulder'], [12, 'right shoulder'],
  [13, 'left elbow'], [14, 'right elbow'],
  [15, 'left wrist'], [16, 'right wrist'],
  [23, 'left hip'], [24, 'right hip'],
  [25, 'left knee'], [26, 'right knee'],
  [27, 'left ankle'], [28, 'right ankle'],
  [31, 'left toe'], [32, 'right toe'],
]

const LEFT_FOOT = [27, 29, 31]
const RIGHT_FOOT = [28, 30, 32]

export function createMocapPolishState(): MocapPolishState {
  return {
    calibrationSamples: [],
    bodyMemory: [],
    lastLeftHandAt: -Infinity,
    lastRightHandAt: -Infinity,
    leftFoot: { plantedFrames: 0, locked: false },
    rightFoot: { plantedFrames: 0, locked: false },
    hingeNormals: {},
    lastTimestamp: 0,
  }
}

export function resetDynamicPolishState(state: MocapPolishState) {
  state.bodyMemory = []
  state.lastBody = undefined
  state.lastLeftHand = undefined
  state.lastRightHand = undefined
  state.lastLeftHandAt = -Infinity
  state.lastRightHandAt = -Infinity
  state.leftFoot = { plantedFrames: 0, locked: false }
  state.rightFoot = { plantedFrames: 0, locked: false }
  state.hingeNormals = {}
  state.lastInput = undefined
  state.lastTimestamp = 0
  state.cached = undefined
}

export function polishPoseFrame(
  frame: Pick<PoseFrame, 't' | 'landmarks' | 'worldLandmarks' | 'leftHandLandmarks' | 'rightHandLandmarks' | 'leftHandWorldLandmarks' | 'rightHandWorldLandmarks' | 'tracking'>,
  state: MocapPolishState,
  options?: MocapPolishOptions,
): MocapPolishResult | undefined {
  const config = { ...DEFAULTS, ...options }
  const worldBody = frame.worldLandmarks?.length === 33 ? frame.worldLandmarks : undefined
  const source = worldBody ?? frame.landmarks
  const bodySpace: MocapBodySpace = worldBody ? 'world' : 'image'
  if (!source || source.length !== 33) return undefined

  // React renders faster than the phone sends frames. Do all stateful mocap work only
  // once per actual landmark array so calibration and velocity estimates stay physical.
  if (state.lastInput === source && state.cached) return state.cached
  state.lastInput = source

  const now = Number.isFinite(frame.t) ? frame.t : performance.now()
  if (state.lastTimestamp && now + 5 < state.lastTimestamp) resetDynamicPolishState(state)
  const dt = state.lastTimestamp ? Math.max(1 / 120, Math.min(0.25, (now - state.lastTimestamp) / 1000)) : 1 / 30
  state.lastTimestamp = now

  const recovered = recoverBodyPoints(source, state, now, config.dropoutHoldMs)
  const body = recovered.points
  stabilizeHinges(body, state, bodySpace, dt, config.jointStability)

  const readyForCalibration = fullBodyUsable(body)
  if (!state.calibration && readyForCalibration && state.calibrationSamples.length < config.calibrationFrames) {
    const sample = makeCalibrationSample(body)
    if (sample) state.calibrationSamples.push(sample)
    if (state.calibrationSamples.length >= config.calibrationFrames) state.calibration = finalizeCalibration(state.calibrationSamples)
  }

  applySegmentLengthConstraints(body, state.calibration, config.jointStability)

  const floorY = state.calibration?.floorY ?? estimateFloorY(body)
  if (config.footLock && floorY !== undefined) {
    updateFootLock(body, LEFT_FOOT, 25, state.leftFoot, floorY, bodySpace, dt, config.footLockStrength)
    updateFootLock(body, RIGHT_FOOT, 26, state.rightFoot, floorY, bodySpace, dt, config.footLockStrength)
  } else {
    state.leftFoot.locked = false
    state.rightFoot.locked = false
  }

  const leftSource = frame.leftHandWorldLandmarks?.length === 21 ? frame.leftHandWorldLandmarks : frame.leftHandLandmarks
  const rightSource = frame.rightHandWorldLandmarks?.length === 21 ? frame.rightHandWorldLandmarks : frame.rightHandLandmarks
  const leftHand = stabilizeHand(leftSource, state.lastLeftHand, bodySpace, config.handStability)
  const rightHand = stabilizeHand(rightSource, state.lastRightHand, bodySpace, config.handStability)
  let leftHandHeld = false
  let rightHandHeld = false

  if (leftSource?.length === 21) {
    state.lastLeftHand = leftHand?.map(clonePoint)
    state.lastLeftHandAt = now
  } else if (state.lastLeftHand && now - state.lastLeftHandAt <= config.dropoutHoldMs + 80) {
    leftHandHeld = true
  }

  if (rightSource?.length === 21) {
    state.lastRightHand = rightHand?.map(clonePoint)
    state.lastRightHandAt = now
  } else if (state.lastRightHand && now - state.lastRightHandAt <= config.dropoutHoldMs + 80) {
    rightHandHeld = true
  }

  const outputLeft = leftSource?.length === 21 ? leftHand : leftHandHeld ? state.lastLeftHand?.map(clonePoint) : undefined
  const outputRight = rightSource?.length === 21 ? rightHand : rightHandHeld ? state.lastRightHand?.map(clonePoint) : undefined

  state.lastBody = body.map(clonePoint)

  const weakJoints = IMPORTANT_JOINTS.filter(([index]) => !usable(body[index], bodySpace === 'world' ? 0.22 : 0.3)).map(([, label]) => label)
  const bodyScore = frame.tracking?.bodyScore ?? computeBodyScore(body)
  const footCount = Number(footUsable(body, LEFT_FOOT)) + Number(footUsable(body, RIGHT_FOOT))
  const handCount = Number(!!leftSource?.length) + Number(!!rightSource?.length)
  const calibrationProgress = state.calibration ? 100 : Math.min(99, Math.round((state.calibrationSamples.length / config.calibrationFrames) * 100))

  const result: MocapPolishResult = {
    body,
    bodySpace,
    leftHand: outputLeft,
    rightHand: outputRight,
    quality: {
      bodyScore,
      handCount,
      footCount,
      weakJoints,
      calibrationProgress,
      calibrated: !!state.calibration,
      recoveredPoints: recovered.count,
      leftFootLocked: state.leftFoot.locked,
      rightFootLocked: state.rightFoot.locked,
      leftHandHeld,
      rightHandHeld,
      bodySpace,
    },
  }
  state.cached = result
  return result
}

function recoverBodyPoints(source: PosePoint[], state: MocapPolishState, now: number, holdMs: number) {
  let count = 0
  const points = source.map((point, index) => {
    if (usable(point, 0.2)) {
      const copy = clonePoint(point)
      state.bodyMemory[index] = { point: copy, seenAt: now }
      return copy
    }
    const memory = state.bodyMemory[index]
    if (memory && now - memory.seenAt <= holdMs) {
      count += 1
      return { ...memory.point, visibility: Math.max(0.22, Math.min(memory.point.visibility ?? 0.5, 0.55)) }
    }
    return clonePoint(point)
  })
  return { points, count }
}

function stabilizeHinges(points: PosePoint[], state: MocapPolishState, space: MocapBodySpace, dt: number, strength: number) {
  if (!state.lastBody?.length) return
  const jumpThreshold = space === 'world' ? 0.18 : 0.075
  const hingeTriples: Array<[string, number, number, number]> = [
    ['leftElbow', 11, 13, 15], ['rightElbow', 12, 14, 16],
    ['leftKnee', 23, 25, 27], ['rightKnee', 24, 26, 28],
  ]

  for (const [name, a, b, c] of hingeTriples) {
    if (!usable(points[a], 0.18) || !usable(points[b], 0.18) || !usable(points[c], 0.18)) continue
    const previous = state.lastBody[b]
    if (!previous) continue

    const movement = distance(points[b], previous)
    const currentNormal = cross(sub(points[b], points[a]), sub(points[c], points[b]))
    const previousNormal = state.hingeNormals[name]
    const currentLength = vectorLength(currentNormal)
    if (previousNormal && currentLength > 1e-6) {
      const dot = normalizedDot(currentNormal, previousNormal)
      const violentFlip = dot < -0.2 && dt < 0.12
      const jump = movement > jumpThreshold
      if (violentFlip || jump) {
        const keep = Math.max(0.18, Math.min(0.72, strength * (violentFlip ? 0.82 : 0.58)))
        points[b] = lerpPoint(points[b], previous, keep)
      }
    }

    const updatedNormal = cross(sub(points[b], points[a]), sub(points[c], points[b]))
    if (vectorLength(updatedNormal) > 1e-6) state.hingeNormals[name] = normalize(updatedNormal)
  }
}

function applySegmentLengthConstraints(points: PosePoint[], calibration: Calibration | undefined, strength: number) {
  if (!calibration) return
  const amount = Math.max(0.12, Math.min(0.68, strength * 0.62))
  constrainPair(points, 11, 13, calibration.upperArm, amount)
  constrainPair(points, 12, 14, calibration.upperArm, amount)
  constrainPair(points, 13, 15, calibration.lowerArm, amount)
  constrainPair(points, 14, 16, calibration.lowerArm, amount)
  constrainPair(points, 23, 25, calibration.upperLeg, amount)
  constrainPair(points, 24, 26, calibration.upperLeg, amount)
  constrainPair(points, 25, 27, calibration.lowerLeg, amount)
  constrainPair(points, 26, 28, calibration.lowerLeg, amount)
}

function constrainPair(points: PosePoint[], parentIndex: number, childIndex: number, targetLength: number, amount: number) {
  const parent = points[parentIndex]
  const child = points[childIndex]
  if (!usable(parent, 0.18) || !usable(child, 0.18) || targetLength <= 1e-5) return
  const direction = sub(child, parent)
  const length = vectorLength(direction)
  if (length < 1e-6) return
  const ratio = length / targetLength
  if (ratio > 0.74 && ratio < 1.28) return
  const desired = add(parent, scale(direction, targetLength / length))
  points[childIndex] = lerpPoint(child, desired, amount)
}

function updateFootLock(
  points: PosePoint[],
  indices: number[],
  kneeIndex: number,
  state: FootState,
  floorY: number,
  space: MocapBodySpace,
  dt: number,
  strength: number,
) {
  const center = footCenter(points, indices)
  if (!center) {
    state.plantedFrames = 0
    state.locked = false
    state.anchor = undefined
    return
  }

  const speed = state.lastCenter ? distance(center, state.lastCenter) / dt : Number.POSITIVE_INFINITY
  state.lastCenter = clonePoint(center)
  const nearTolerance = space === 'world' ? 0.085 : 0.036
  const liftTolerance = space === 'world' ? 0.13 : 0.055
  const plantSpeed = space === 'world' ? 0.24 : 0.105
  const nearFloor = Math.abs(center.y - floorY) <= nearTolerance
  const lifted = center.y < floorY - liftTolerance
  const planted = nearFloor && speed <= plantSpeed

  state.plantedFrames = planted ? state.plantedFrames + 1 : Math.max(0, state.plantedFrames - 2)
  if (lifted || speed > plantSpeed * 2.15) {
    state.locked = false
    state.anchor = undefined
    state.plantedFrames = 0
    return
  }
  if (!state.locked && state.plantedFrames >= 3) {
    state.locked = true
    state.anchor = { ...center, y: floorY }
  }
  if (!state.locked || !state.anchor) return

  const lockAmount = Math.max(0.45, Math.min(0.97, strength))
  const delta = {
    x: state.anchor.x - center.x,
    y: floorY - center.y,
    z: state.anchor.z - center.z,
    visibility: center.visibility,
  }
  for (const index of indices) {
    const point = points[index]
    if (!point) continue
    points[index] = {
      ...point,
      x: point.x + delta.x * lockAmount,
      y: point.y + delta.y * Math.min(0.92, lockAmount),
      z: point.z + delta.z * lockAmount,
    }
  }
  const knee = points[kneeIndex]
  if (knee) {
    points[kneeIndex] = {
      ...knee,
      x: knee.x + delta.x * 0.12 * lockAmount,
      y: knee.y + delta.y * 0.05 * lockAmount,
      z: knee.z + delta.z * 0.12 * lockAmount,
    }
  }
}

function stabilizeHand(source: PosePoint[] | undefined, previous: PosePoint[] | undefined, bodySpace: MocapBodySpace, strength: number) {
  if (!source || source.length !== 21) return undefined
  if (!previous || previous.length !== 21) return source.map(clonePoint)
  const moveScale = bodySpace === 'world' ? 0.024 : 0.018
  const tipIndices = new Set([4, 8, 12, 16, 20])
  return source.map((point, index) => {
    const before = previous[index]
    if (!finitePoint(point)) return clonePoint(before)
    const movement = distance(point, before)
    const responsive = Math.min(1, movement / moveScale)
    const baseAlpha = tipIndices.has(index) ? 0.24 : 0.34
    const alpha = Math.min(0.9, baseAlpha + responsive * (0.62 - strength * 0.12))
    return {
      x: before.x + (point.x - before.x) * alpha,
      y: before.y + (point.y - before.y) * alpha,
      z: before.z + (point.z - before.z) * alpha,
      visibility: point.visibility,
    }
  })
}

function makeCalibrationSample(points: PosePoint[]): CalibrationSample | undefined {
  const floorY = estimateFloorY(points)
  if (floorY === undefined) return undefined
  const shoulderWidth = distance(points[11], points[12])
  const hipWidth = distance(points[23], points[24])
  const torsoLength = distance(midpointPoint(points[11], points[12]), midpointPoint(points[23], points[24]))
  const upperArm = average([distance(points[11], points[13]), distance(points[12], points[14])])
  const lowerArm = average([distance(points[13], points[15]), distance(points[14], points[16])])
  const upperLeg = average([distance(points[23], points[25]), distance(points[24], points[26])])
  const lowerLeg = average([distance(points[25], points[27]), distance(points[26], points[28])])
  if (![shoulderWidth, hipWidth, torsoLength, upperArm, lowerArm, upperLeg, lowerLeg].every((value) => Number.isFinite(value) && value > 1e-5)) return undefined
  return { floorY, shoulderWidth, hipWidth, torsoLength, upperArm, lowerArm, upperLeg, lowerLeg }
}

function finalizeCalibration(samples: CalibrationSample[]): Calibration {
  return {
    floorY: median(samples.map((sample) => sample.floorY)),
    shoulderWidth: median(samples.map((sample) => sample.shoulderWidth)),
    hipWidth: median(samples.map((sample) => sample.hipWidth)),
    torsoLength: median(samples.map((sample) => sample.torsoLength)),
    upperArm: median(samples.map((sample) => sample.upperArm)),
    lowerArm: median(samples.map((sample) => sample.lowerArm)),
    upperLeg: median(samples.map((sample) => sample.upperLeg)),
    lowerLeg: median(samples.map((sample) => sample.lowerLeg)),
  }
}

function fullBodyUsable(points: PosePoint[]) {
  return [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].every((index) => usable(points[index], 0.24))
}

function estimateFloorY(points: PosePoint[]) {
  const left = footCenter(points, LEFT_FOOT)
  const right = footCenter(points, RIGHT_FOOT)
  if (left && right) return Math.max(left.y, right.y)
  return left?.y ?? right?.y
}

function footUsable(points: PosePoint[], indices: number[]) {
  return indices.filter((index) => usable(points[index], 0.22)).length >= 2
}

function footCenter(points: PosePoint[], indices: number[]) {
  const valid = indices.map((index) => points[index]).filter((point): point is PosePoint => finitePoint(point))
  if (valid.length < 2) return undefined
  return {
    x: average(valid.map((point) => point.x)),
    y: average(valid.map((point) => point.y)),
    z: average(valid.map((point) => point.z)),
    visibility: average(valid.map((point) => point.visibility ?? 1)),
  }
}

function computeBodyScore(points: PosePoint[]) {
  const indices = IMPORTANT_JOINTS.map(([index]) => index)
  const values = indices.map((index) => Math.max(0, Math.min(1, points[index]?.visibility ?? 0)))
  return Math.round(average(values) * 100)
}

function usable(point: PosePoint | undefined, threshold: number) {
  return finitePoint(point) && (point!.visibility ?? 1) >= threshold
}

function finitePoint(point: PosePoint | undefined): point is PosePoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
}

function clonePoint(point: PosePoint): PosePoint {
  return { x: point.x, y: point.y, z: point.z, visibility: point.visibility }
}

function midpointPoint(a: PosePoint, b: PosePoint): PosePoint {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) }
}

function lerpPoint(a: PosePoint, b: PosePoint, amount: number): PosePoint {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
    visibility: a.visibility,
  }
}

function sub(a: PosePoint, b: PosePoint): PosePoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function add(a: PosePoint, b: PosePoint): PosePoint {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scale(a: PosePoint, amount: number): PosePoint {
  return { x: a.x * amount, y: a.y * amount, z: a.z * amount }
}

function cross(a: PosePoint, b: PosePoint): PosePoint {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function vectorLength(a: PosePoint) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

function normalize(a: PosePoint): PosePoint {
  const length = vectorLength(a)
  return length > 1e-8 ? scale(a, 1 / length) : { x: 0, y: 0, z: 0 }
}

function normalizedDot(a: PosePoint, b: PosePoint) {
  const an = normalize(a)
  const bn = normalize(b)
  return an.x * bn.x + an.y * bn.y + an.z * bn.z
}

function distance(a: PosePoint, b: PosePoint) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5
}
