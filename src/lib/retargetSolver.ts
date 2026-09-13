import * as THREE from 'three'
import type { PosePoint } from '../types'
import type { HumanoidBoneKey, RetargetRuntime } from './retarget'

type StableRetargetOptions = {
  mirrorX?: boolean
  blend?: number
  bodySpace?: 'world' | 'image'
  leftHand?: PosePoint[]
  rightHand?: PosePoint[]
}

function finite(point: PosePoint | undefined, threshold = 0.2, ignoreVisibility = false) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z)
    && (ignoreVisibility || (point.visibility ?? 1) >= threshold)
}

function cameraVector(point: PosePoint, mirrorX: boolean) {
  return new THREE.Vector3(mirrorX ? -point.x : point.x, -point.y, -point.z)
}

function pointsToVectors(points: PosePoint[], mirrorX: boolean) {
  return points.map((point) => cameraVector(point, mirrorX))
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3) {
  return a.clone().add(b).multiplyScalar(0.5)
}

function makeBasisQuaternion(xInput: THREE.Vector3, yInput: THREE.Vector3) {
  const y = yInput.clone().normalize()
  const x = xInput.clone().addScaledVector(y, -xInput.dot(y)).normalize()
  if (x.lengthSq() < 1e-8 || y.lengthSq() < 1e-8) return undefined
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  if (z.lengthSq() < 1e-8) return undefined
  x.crossVectors(y, z).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

function orientBasis(
  runtime: RetargetRuntime,
  state: RetargetRuntime['bases']['hips'],
  rightWorld: THREE.Vector3,
  upWorld: THREE.Vector3,
  blend: number,
) {
  if (!state || rightWorld.lengthSq() < 1e-8 || upWorld.lengthSq() < 1e-8) return
  const parentQuaternion = state.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  const inverseParent = parentQuaternion.clone().invert()
  const targetBasis = makeBasisQuaternion(
    rightWorld.clone().applyQuaternion(inverseParent),
    upWorld.clone().applyQuaternion(inverseParent),
  )
  if (!targetBasis) return
  const desired = targetBasis.multiply(state.sourceBasisQuaternion.clone().invert())
  state.bone.quaternion.slerp(desired, THREE.MathUtils.clamp(blend, 0.02, 1))
  runtime.root.updateMatrixWorld(true)
}

function aimBone(
  runtime: RetargetRuntime,
  key: HumanoidBoneKey,
  directionWorld: THREE.Vector3,
  blend: number,
  maxAngleDegrees = 180,
) {
  const state = runtime.aims[key]
  if (!state || directionWorld.lengthSq() < 1e-8) return
  const parentQuaternion = state.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  const directionParent = directionWorld.clone().normalize().applyQuaternion(parentQuaternion.clone().invert())
  const restDirectionParent = state.axisLocal.clone().applyQuaternion(state.restLocalQuaternion).normalize()
  const delta = new THREE.Quaternion().setFromUnitVectors(restDirectionParent, directionParent)
  const maxAngle = THREE.MathUtils.degToRad(maxAngleDegrees)
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(delta.w), -1, 1))
  if (angle > maxAngle && angle > 1e-5) delta.slerp(new THREE.Quaternion(), 1 - maxAngle / angle)
  const desired = delta.multiply(state.restLocalQuaternion)
  state.bone.quaternion.slerp(desired, THREE.MathUtils.clamp(blend, 0.02, 1))
  runtime.root.updateMatrixWorld(true)
}

function stabilizedUp(source: THREE.Vector3, leanAmount: number) {
  if (source.lengthSq() < 1e-8) return new THREE.Vector3(0, 1, 0)
  const up = source.clone().normalize()
  if (up.y < 0) up.multiplyScalar(-1)
  return new THREE.Vector3(0, 1, 0).lerp(up, THREE.MathUtils.clamp(leanAmount, 0, 1)).normalize()
}

function stableFootDirection(heel: THREE.Vector3, toe: THREE.Vector3) {
  const direction = toe.clone().sub(heel)
  // Preserve yaw and a little pitch, but never let monocular depth make the foot
  // stand on its edge or point vertically through the floor.
  direction.y *= 0.28
  if (direction.lengthSq() < 1e-8) return direction
  return direction.normalize()
}

function applyHand(runtime: RetargetRuntime, side: 'left' | 'right', points: PosePoint[] | undefined, mirrorX: boolean, blend: number) {
  if (!points || points.length < 21) return
  // MediaPipe Holistic hand landmarks commonly expose visibility=0. Presence is
  // represented by the 21-point result itself, so do not gate fingers on visibility.
  const p = pointsToVectors(points, mirrorX)
  const handKey = side === 'left' ? 'leftHand' : 'rightHand'
  const handBasis = runtime.bases[handKey]
  if (finite(points[0], 0, true) && finite(points[5], 0, true) && finite(points[9], 0, true) && finite(points[17], 0, true)) {
    const acrossPalm = p[5].clone().sub(p[17])
    const alongPalm = p[9].clone().sub(p[0])
    orientBasis(runtime, handBasis, acrossPalm, alongPalm, Math.min(0.62, blend * 0.72))
  }

  const prefix = side === 'left' ? 'left' : 'right'
  const fingers: Array<[string, number, number, number, number, number, number]> = [
    ['Thumb', 1, 2, 2, 3, 3, 4],
    ['Index', 5, 6, 6, 7, 7, 8],
    ['Middle', 9, 10, 10, 11, 11, 12],
    ['Ring', 13, 14, 14, 15, 15, 16],
    ['Pinky', 17, 18, 18, 19, 19, 20],
  ]

  for (const [name, a1, b1, a2, b2, a3, b3] of fingers) {
    const fingerBlend = name === 'Thumb' ? Math.min(0.58, blend * 0.68) : Math.min(0.68, blend * 0.8)
    const key1 = `${prefix}${name}1` as HumanoidBoneKey
    const key2 = `${prefix}${name}2` as HumanoidBoneKey
    const key3 = `${prefix}${name}3` as HumanoidBoneKey
    if (finite(points[a1], 0, true) && finite(points[b1], 0, true)) aimBone(runtime, key1, p[b1].clone().sub(p[a1]), fingerBlend, name === 'Thumb' ? 90 : 105)
    if (finite(points[a2], 0, true) && finite(points[b2], 0, true)) aimBone(runtime, key2, p[b2].clone().sub(p[a2]), fingerBlend, 120)
    if (finite(points[a3], 0, true) && finite(points[b3], 0, true)) aimBone(runtime, key3, p[b3].clone().sub(p[a3]), fingerBlend, 130)
  }
}

export function applyStablePoseToRig(runtime: RetargetRuntime, landmarks: PosePoint[], options: StableRetargetOptions = {}) {
  if (landmarks.length < 33) return
  const mirrorX = options.mirrorX ?? false
  const blend = THREE.MathUtils.clamp(options.blend ?? 0.72, 0.05, 1)
  const bodySpace = options.bodySpace ?? 'image'
  const p = pointsToVectors(landmarks, mirrorX)
  const shouldersVisible = finite(landmarks[11], 0.3) && finite(landmarks[12], 0.3)
  const hipsVisible = finite(landmarks[23], 0.3) && finite(landmarks[24], 0.3)

  if (hipsVisible) {
    // Pelvis gets yaw only. This is the key stability change: noisy camera depth is
    // no longer allowed to roll/pitch the entire skeleton before the legs are solved.
    const hipRight = p[24].clone().sub(p[23])
    hipRight.y = 0
    if (hipRight.lengthSq() > 1e-6) orientBasis(runtime, runtime.bases.hips, hipRight, new THREE.Vector3(0, 1, 0), Math.min(blend, 0.72))
  }

  if (shouldersVisible && hipsVisible) {
    const shoulderCenter = midpoint(p[11], p[12])
    const hipCenter = midpoint(p[23], p[24])
    const torsoUp = shoulderCenter.clone().sub(hipCenter)
    const shoulderRight = p[12].clone().sub(p[11])
    const spineUp = stabilizedUp(torsoUp, bodySpace === 'world' ? 0.72 : 0.42)
    orientBasis(runtime, runtime.bases.spine, shoulderRight, spineUp, Math.min(blend, 0.66))
    orientBasis(runtime, runtime.bases.chest, shoulderRight, spineUp, Math.min(blend, 0.72))
  }

  if (finite(landmarks[11]) && finite(landmarks[13])) aimBone(runtime, 'leftUpperArm', p[13].clone().sub(p[11]), blend, 160)
  if (finite(landmarks[13]) && finite(landmarks[15])) aimBone(runtime, 'leftLowerArm', p[15].clone().sub(p[13]), blend, 165)
  if (finite(landmarks[12]) && finite(landmarks[14])) aimBone(runtime, 'rightUpperArm', p[14].clone().sub(p[12]), blend, 160)
  if (finite(landmarks[14]) && finite(landmarks[16])) aimBone(runtime, 'rightLowerArm', p[16].clone().sub(p[14]), blend, 165)

  if (finite(landmarks[23]) && finite(landmarks[25])) aimBone(runtime, 'leftUpperLeg', p[25].clone().sub(p[23]), Math.min(blend, 0.78), 112)
  if (finite(landmarks[25]) && finite(landmarks[27])) aimBone(runtime, 'leftLowerLeg', p[27].clone().sub(p[25]), Math.min(blend, 0.8), 135)
  if (finite(landmarks[24]) && finite(landmarks[26])) aimBone(runtime, 'rightUpperLeg', p[26].clone().sub(p[24]), Math.min(blend, 0.78), 112)
  if (finite(landmarks[26]) && finite(landmarks[28])) aimBone(runtime, 'rightLowerLeg', p[28].clone().sub(p[26]), Math.min(blend, 0.8), 135)

  if (finite(landmarks[29]) && finite(landmarks[31])) aimBone(runtime, 'leftFoot', stableFootDirection(p[29], p[31]), Math.min(blend, 0.58), 55)
  if (finite(landmarks[30]) && finite(landmarks[32])) aimBone(runtime, 'rightFoot', stableFootDirection(p[30], p[32]), Math.min(blend, 0.58), 55)

  if (shouldersVisible) {
    const shoulderCenter = midpoint(p[11], p[12])
    let headTarget: THREE.Vector3 | undefined
    if (finite(landmarks[7], 0.25) && finite(landmarks[8], 0.25)) headTarget = midpoint(p[7], p[8])
    else if (finite(landmarks[0], 0.25)) headTarget = p[0]
    if (headTarget) aimBone(runtime, 'neck', headTarget.clone().sub(shoulderCenter), Math.min(blend, 0.54), 45)
  }

  applyHand(runtime, 'left', options.leftHand, mirrorX, blend)
  applyHand(runtime, 'right', options.rightHand, mirrorX, blend)
}
