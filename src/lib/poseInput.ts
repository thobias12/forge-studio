import type { PosePoint } from '../types'

const TORSO = new Set([11, 12, 23, 24])
const LEGS = new Set([23, 24, 25, 26, 27, 28, 29, 30, 31, 32])

export function prepareRetargetPose(points: PosePoint[] | undefined) {
  if (!points || points.length < 33) return points
  const hipZ = ((points[23]?.z ?? 0) + (points[24]?.z ?? 0)) * 0.5

  return points.map((point, index) => {
    let depthScale = 0.78
    if (TORSO.has(index)) depthScale = 0.3
    else if (LEGS.has(index)) depthScale = 0.52

    return {
      ...point,
      z: hipZ + (point.z - hipZ) * depthScale,
    }
  })
}

export function hasStableFootContact(points: PosePoint[] | undefined) {
  if (!points?.length) return false
  return footIsStable(points, 27, 29, 31) || footIsStable(points, 28, 30, 32)
}

function footIsStable(points: PosePoint[], ankleIndex: number, heelIndex: number, toeIndex: number) {
  const ankle = points[ankleIndex]
  const heel = points[heelIndex]
  const toe = points[toeIndex]
  if (!usable(ankle, 0.3) || !usable(heel, 0.3) || !usable(toe, 0.3)) return false

  const verticalSpread = Math.max(ankle.y, heel.y, toe.y) - Math.min(ankle.y, heel.y, toe.y)
  return verticalSpread < 0.09
}

function usable(point: PosePoint | undefined, threshold: number) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
    && (point.visibility ?? 1) >= threshold
}
