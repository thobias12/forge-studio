import type { ForgeMotion, PoseFrame, PosePoint } from '../types'

export type MotionCleanupOptions = {
  strength: number
  repairGaps: boolean
  footLock: boolean
  groundAlign: boolean
  maxGapMs?: number
}

export type MotionCleanupReport = {
  repairedPoints: number
  footLockedFrames: number
  groundAlignedFrames: number
  sourceFrames: number
  usedWorldLandmarks: boolean
}

const LEFT_FOOT = [27, 29, 31]
const RIGHT_FOOT = [28, 30, 32]
const MIN_VISIBILITY = 0.24

function clonePoint(point: PosePoint): PosePoint {
  return { x: point.x, y: point.y, z: point.z, visibility: point.visibility }
}

function cloneFrame(frame: PoseFrame): PoseFrame {
  return {
    t: frame.t,
    landmarks: frame.landmarks.map(clonePoint),
    worldLandmarks: frame.worldLandmarks?.map(clonePoint),
  }
}

function isValid(point: PosePoint | undefined) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
    && (point.visibility ?? 1) >= MIN_VISIBILITY
}

function lerpPoint(a: PosePoint, b: PosePoint, alpha: number): PosePoint {
  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    z: a.z + (b.z - a.z) * alpha,
    visibility: Math.max(MIN_VISIBILITY + 0.06, Math.min(a.visibility ?? 1, b.visibility ?? 1) * 0.9),
  }
}

function getChannel(frame: PoseFrame, world: boolean) {
  return world ? frame.worldLandmarks : frame.landmarks
}

function repairShortGaps(frames: PoseFrame[], world: boolean, maxGapMs: number) {
  let repaired = 0
  const count = Math.max(...frames.map((frame) => getChannel(frame, world)?.length ?? 0), 0)

  for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
    let index = 0
    while (index < frames.length) {
      const channel = getChannel(frames[index], world)
      if (isValid(channel?.[pointIndex])) {
        index += 1
        continue
      }

      const gapStart = index
      while (index < frames.length && !isValid(getChannel(frames[index], world)?.[pointIndex])) index += 1
      const gapEnd = index - 1
      const beforeIndex = gapStart - 1
      const afterIndex = index

      if (beforeIndex < 0 || afterIndex >= frames.length) continue
      const before = getChannel(frames[beforeIndex], world)?.[pointIndex]
      const after = getChannel(frames[afterIndex], world)?.[pointIndex]
      if (!isValid(before) || !isValid(after)) continue

      const span = frames[afterIndex].t - frames[beforeIndex].t
      if (span <= 0 || span > maxGapMs) continue

      for (let fill = gapStart; fill <= gapEnd; fill += 1) {
        const targetChannel = getChannel(frames[fill], world)
        if (!targetChannel || !before || !after) continue
        const alpha = (frames[fill].t - frames[beforeIndex].t) / span
        targetChannel[pointIndex] = lerpPoint(before, after, Math.max(0, Math.min(1, alpha)))
        repaired += 1
      }
    }
  }

  return repaired
}

function distance(a: PosePoint, b: PosePoint) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function smoothChannel(frames: PoseFrame[], world: boolean, strength: number) {
  const amount = Math.max(0, Math.min(0.78, strength * 0.72))
  if (amount <= 0 || frames.length < 3) return

  const snapshots = frames.map((frame) => getChannel(frame, world)?.map(clonePoint))
  const count = Math.max(...snapshots.map((points) => points?.length ?? 0), 0)
  const radius = strength >= 0.7 ? 2 : 1

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const target = getChannel(frames[frameIndex], world)
    if (!target) continue

    for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
      const original = snapshots[frameIndex]?.[pointIndex]
      if (!isValid(original)) continue

      let sumX = 0
      let sumY = 0
      let sumZ = 0
      let totalWeight = 0
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sample = snapshots[frameIndex + offset]?.[pointIndex]
        if (!isValid(sample)) continue
        const weight = (1 / (1 + Math.abs(offset))) * Math.max(0.25, sample?.visibility ?? 1)
        sumX += sample!.x * weight
        sumY += sample!.y * weight
        sumZ += sample!.z * weight
        totalWeight += weight
      }
      if (totalWeight <= 0) continue

      const average: PosePoint = {
        x: sumX / totalWeight,
        y: sumY / totalWeight,
        z: sumZ / totalWeight,
        visibility: original!.visibility,
      }

      const previous = snapshots[Math.max(0, frameIndex - 1)]?.[pointIndex]
      const next = snapshots[Math.min(frames.length - 1, frameIndex + 1)]?.[pointIndex]
      const motion = previous && next && isValid(previous) && isValid(next) ? distance(previous, next) : 0
      const motionScale = world
        ? Math.max(0.28, Math.min(1, 1 - motion / 0.22))
        : Math.max(0.34, Math.min(1, 1 - motion / 0.12))
      const adaptiveAmount = amount * motionScale
      target[pointIndex] = lerpPoint(original!, average, adaptiveAmount)
      target[pointIndex].visibility = original!.visibility
    }
  }
}

function footCenter(points: PosePoint[] | undefined, indices: number[]) {
  if (!points) return undefined
  const valid = indices.map((index) => points[index]).filter(isValid) as PosePoint[]
  if (valid.length < 2) return undefined
  return {
    x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
    y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length,
    z: valid.reduce((sum, point) => sum + point.z, 0) / valid.length,
    visibility: valid.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / valid.length,
  } satisfies PosePoint
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))
  return sorted[index]
}

function applyOffset(points: PosePoint[] | undefined, indices: number[], dx: number, dy: number, dz: number, amount: number) {
  if (!points) return
  for (const index of indices) {
    const point = points[index]
    if (!isValid(point)) continue
    point.x += dx * amount
    point.y += dy * amount
    point.z += dz * amount
  }
}

function stabilizeFeet(frames: PoseFrame[], world: boolean, strength: number, footLock: boolean, groundAlign: boolean) {
  const centersBySide = [LEFT_FOOT, RIGHT_FOOT].map((indices) => frames.map((frame) => footCenter(getChannel(frame, world), indices)))
  const floorSamples: number[] = []
  for (const centers of centersBySide) {
    for (const center of centers) if (center) floorSamples.push(center.y)
  }
  if (!floorSamples.length) return { footLockedFrames: 0, groundAlignedFrames: 0 }

  // MediaPipe image/world Y grows downward. A high percentile is therefore a stable estimate of the support plane.
  const floor = percentile(floorSamples, 0.82)
  const scale = world ? 1 : 0.45
  const nearFloorTolerance = (world ? 0.12 : 0.035) * (1 + strength * 0.35)
  const plantSpeed = (world ? 0.34 : 0.11) * (1 + (1 - strength) * 0.5)
  const lockAmount = Math.max(0.35, Math.min(0.96, 0.5 + strength * 0.48))
  const alignAmount = Math.max(0.25, Math.min(0.9, 0.35 + strength * 0.5))
  const lockedFrameSet = new Set<number>()
  const alignedFrameSet = new Set<number>()

  centersBySide.forEach((centers, side) => {
    const indices = side === 0 ? LEFT_FOOT : RIGHT_FOOT
    let anchor: PosePoint | undefined
    let plantedFrames = 0

    for (let index = 0; index < frames.length; index += 1) {
      const center = footCenter(getChannel(frames[index], world), indices)
      const previous = index > 0 ? centers[index - 1] : undefined
      const dt = index > 0 ? Math.max(0.001, (frames[index].t - frames[index - 1].t) / 1000) : 1 / 30
      const speed = center && previous ? distance(center, previous) / dt : Number.POSITIVE_INFINITY
      const nearFloor = !!center && Math.abs(floor - center.y) <= nearFloorTolerance * scale
      const planted = !!center && nearFloor && speed <= plantSpeed * scale

      if (planted) plantedFrames += 1
      else plantedFrames = 0

      if (groundAlign && center && nearFloor) {
        const dy = floor - center.y
        applyOffset(getChannel(frames[index], world), indices, 0, dy, 0, alignAmount)
        alignedFrameSet.add(index)
      }

      if (!footLock || !center || plantedFrames < 2) {
        if (!planted) anchor = undefined
        continue
      }

      if (!anchor) anchor = { ...center, y: groundAlign ? floor : center.y }
      const dx = anchor.x - center.x
      const dy = anchor.y - center.y
      const dz = anchor.z - center.z
      applyOffset(getChannel(frames[index], world), indices, dx, dy, dz, lockAmount)
      lockedFrameSet.add(index)
    }
  })

  return {
    footLockedFrames: lockedFrameSet.size,
    groundAlignedFrames: alignedFrameSet.size,
  }
}

export function cleanupMotion(motion: ForgeMotion, options: MotionCleanupOptions) {
  const strength = Math.max(0, Math.min(1, options.strength))
  const maxGapMs = options.maxGapMs ?? 180
  const frames = motion.frames.map(cloneFrame)
  let repairedPoints = 0

  if (options.repairGaps) {
    repairedPoints += repairShortGaps(frames, false, maxGapMs)
    repairedPoints += repairShortGaps(frames, true, maxGapMs)
  }

  smoothChannel(frames, false, strength)
  smoothChannel(frames, true, strength)

  const hasWorld = frames.some((frame) => frame.worldLandmarks?.length === 33)
  const worldFoot = hasWorld
    ? stabilizeFeet(frames, true, strength, options.footLock, options.groundAlign)
    : { footLockedFrames: 0, groundAlignedFrames: 0 }

  // Also stabilize the screen-space feet. This improves the preview and helps recordings that lack world landmarks.
  const screenFoot = stabilizeFeet(frames, false, strength * 0.75, options.footLock, options.groundAlign)

  const cleaned: ForgeMotion = {
    ...motion,
    frames,
  }

  const report: MotionCleanupReport = {
    repairedPoints,
    footLockedFrames: Math.max(worldFoot.footLockedFrames, screenFoot.footLockedFrames),
    groundAlignedFrames: Math.max(worldFoot.groundAlignedFrames, screenFoot.groundAlignedFrames),
    sourceFrames: frames.length,
    usedWorldLandmarks: hasWorld,
  }

  return { motion: cleaned, report }
}
