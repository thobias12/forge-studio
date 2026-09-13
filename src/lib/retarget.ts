import * as THREE from 'three'
import type { PosePoint } from '../types'

export type HumanoidBoneKey =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'

export const HUMANOID_BONE_KEYS: HumanoidBoneKey[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
]

export type HumanoidRig = Partial<Record<HumanoidBoneKey, THREE.Bone>>

export type RigInfo = {
  totalBones: number
  mappedCount: number
  mapped: Partial<Record<HumanoidBoneKey, string>>
  missing: HumanoidBoneKey[]
}

type BoneAimState = {
  bone: THREE.Bone
  restLocalQuaternion: THREE.Quaternion
  axisLocal: THREE.Vector3
}

type BoneBasisState = {
  bone: THREE.Bone
  sourceBasisQuaternion: THREE.Quaternion
}

export type RetargetRuntime = {
  root: THREE.Object3D
  rig: HumanoidRig
  info: RigInfo
  aims: Partial<Record<HumanoidBoneKey, BoneAimState>>
  bases: Partial<Record<'hips' | 'spine' | 'chest', BoneBasisState>>
}

const aliases: Record<HumanoidBoneKey, string[]> = {
  hips: ['hips', 'pelvis', 'hip', 'rootpelvis'],
  spine: ['spine', 'spine01', 'spine1', 'lowerback', 'abdomen'],
  chest: ['chest', 'upperchest', 'spine02', 'spine2', 'spine03', 'spine3', 'upperbody'],
  neck: ['neck', 'neck01', 'neck1'],
  head: ['head', 'head01'],
  leftUpperArm: ['leftupperarm', 'leftarm', 'upperarml', 'arml', 'lupperarm'],
  leftLowerArm: ['leftlowerarm', 'leftforearm', 'lowerarml', 'forearml', 'llowerarm'],
  leftHand: ['lefthand', 'handl', 'lhand'],
  rightUpperArm: ['rightupperarm', 'rightarm', 'upperarmr', 'armr', 'rupperarm'],
  rightLowerArm: ['rightlowerarm', 'rightforearm', 'lowerarmr', 'forearmr', 'rlowerarm'],
  rightHand: ['righthand', 'handr', 'rhand'],
  leftUpperLeg: ['leftupperleg', 'leftupleg', 'leftthigh', 'upperlegl', 'thighl', 'lupperleg'],
  leftLowerLeg: ['leftlowerleg', 'leftleg', 'leftshin', 'leftcalf', 'lowerlegl', 'shinl', 'calfl', 'llowerleg'],
  leftFoot: ['leftfoot', 'footl', 'lfoot', 'leftankle'],
  rightUpperLeg: ['rightupperleg', 'rightupleg', 'rightthigh', 'upperlegr', 'thighr', 'rupperleg'],
  rightLowerLeg: ['rightlowerleg', 'rightleg', 'rightshin', 'rightcalf', 'lowerlegr', 'shinr', 'calfr', 'rlowerleg'],
  rightFoot: ['rightfoot', 'footr', 'rfoot', 'rightankle'],
}

const aimChildren: Partial<Record<HumanoidBoneKey, HumanoidBoneKey>> = {
  neck: 'head',
  leftUpperArm: 'leftLowerArm',
  leftLowerArm: 'leftHand',
  rightUpperArm: 'rightLowerArm',
  rightLowerArm: 'rightHand',
  leftUpperLeg: 'leftLowerLeg',
  leftLowerLeg: 'leftFoot',
  rightUpperLeg: 'rightLowerLeg',
  rightLowerLeg: 'rightFoot',
}

function normalizeBoneName(value: string) {
  return value
    .toLowerCase()
    .replace(/mixamorig/g, '')
    .replace(/bip001/g, '')
    .replace(/bip01/g, '')
    .replace(/armature/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function scoreBoneName(name: string, candidates: string[]) {
  let score = 0
  for (const alias of candidates) {
    if (name === alias) score = Math.max(score, 1000 + alias.length)
    else if (name.endsWith(alias)) score = Math.max(score, 700 + alias.length)
    else if (name.startsWith(alias)) score = Math.max(score, 600 + alias.length)
    else if (name.includes(alias)) score = Math.max(score, 350 + alias.length)
  }
  return score
}

export function mapHumanoidRig(root: THREE.Object3D) {
  const bones: THREE.Bone[] = []
  root.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.push(object as THREE.Bone)
  })

  const rig: HumanoidRig = {}
  const used = new Set<THREE.Bone>()

  for (const key of HUMANOID_BONE_KEYS) {
    let best: THREE.Bone | undefined
    let bestScore = 0
    for (const bone of bones) {
      if (used.has(bone)) continue
      const score = scoreBoneName(normalizeBoneName(bone.name), aliases[key])
      if (score > bestScore) {
        best = bone
        bestScore = score
      }
    }
    if (best && bestScore > 0) {
      rig[key] = best
      used.add(best)
    }
  }

  const mapped: Partial<Record<HumanoidBoneKey, string>> = {}
  HUMANOID_BONE_KEYS.forEach((key) => {
    if (rig[key]) mapped[key] = rig[key]!.name || key
  })

  const info: RigInfo = {
    totalBones: bones.length,
    mappedCount: Object.keys(mapped).length,
    mapped,
    missing: HUMANOID_BONE_KEYS.filter((key) => !rig[key]),
  }

  return { rig, info }
}

function localDirectionFromWorld(bone: THREE.Bone, worldDirection: THREE.Vector3) {
  const boneWorldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion())
  return worldDirection.clone().applyQuaternion(boneWorldQuaternion.invert()).normalize()
}

function makeBasisQuaternion(xInput: THREE.Vector3, yInput: THREE.Vector3) {
  const y = yInput.clone().normalize()
  const x = xInput.clone().addScaledVector(y, -xInput.dot(y)).normalize()
  if (x.lengthSq() < 1e-8 || y.lengthSq() < 1e-8) return undefined
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  if (z.lengthSq() < 1e-8) return undefined
  x.crossVectors(y, z).normalize()
  const matrix = new THREE.Matrix4().makeBasis(x, y, z)
  return new THREE.Quaternion().setFromRotationMatrix(matrix)
}

function captureAimState(bone: THREE.Bone, child: THREE.Bone): BoneAimState | undefined {
  const start = bone.getWorldPosition(new THREE.Vector3())
  const end = child.getWorldPosition(new THREE.Vector3())
  const worldDirection = end.sub(start)
  if (worldDirection.lengthSq() < 1e-8) return undefined
  return {
    bone,
    restLocalQuaternion: bone.quaternion.clone(),
    axisLocal: localDirectionFromWorld(bone, worldDirection),
  }
}

function captureBasisState(
  bone: THREE.Bone,
  upTarget: THREE.Bone | undefined,
  leftTarget: THREE.Bone | undefined,
  rightTarget: THREE.Bone | undefined,
): BoneBasisState | undefined {
  if (!upTarget || !leftTarget || !rightTarget) return undefined
  const origin = bone.getWorldPosition(new THREE.Vector3())
  const up = upTarget.getWorldPosition(new THREE.Vector3()).sub(origin)
  const right = rightTarget
    .getWorldPosition(new THREE.Vector3())
    .sub(leftTarget.getWorldPosition(new THREE.Vector3()))
  if (up.lengthSq() < 1e-8 || right.lengthSq() < 1e-8) return undefined
  const upLocal = localDirectionFromWorld(bone, up)
  const rightLocal = localDirectionFromWorld(bone, right)
  const sourceBasisQuaternion = makeBasisQuaternion(rightLocal, upLocal)
  if (!sourceBasisQuaternion) return undefined
  return { bone, sourceBasisQuaternion }
}

export function createRetargetRuntime(root: THREE.Object3D): RetargetRuntime {
  root.updateMatrixWorld(true)
  const { rig, info } = mapHumanoidRig(root)
  const aims: RetargetRuntime['aims'] = {}
  for (const [key, childKey] of Object.entries(aimChildren) as [HumanoidBoneKey, HumanoidBoneKey][]) {
    const bone = rig[key]
    const child = rig[childKey]
    if (bone && child) aims[key] = captureAimState(bone, child)
  }

  const bases: RetargetRuntime['bases'] = {}
  if (rig.hips) {
    bases.hips = captureBasisState(rig.hips, rig.spine ?? rig.chest, rig.leftUpperLeg, rig.rightUpperLeg)
  }
  if (rig.spine) {
    bases.spine = captureBasisState(rig.spine, rig.chest ?? rig.neck, rig.leftUpperArm, rig.rightUpperArm)
  }
  if (rig.chest) {
    bases.chest = captureBasisState(rig.chest, rig.neck ?? rig.head, rig.leftUpperArm, rig.rightUpperArm)
  }

  return { root, rig, info, aims, bases }
}

function poseVector(point: PosePoint, mirrorX: boolean) {
  const x = mirrorX ? -point.x : point.x
  return new THREE.Vector3(x, -point.y, -point.z)
}

function visible(point: PosePoint | undefined, threshold = 0.24) {
  return !!point && (point.visibility ?? 1) >= threshold
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3) {
  return a.clone().add(b).multiplyScalar(0.5)
}

function orientBasis(
  runtime: RetargetRuntime,
  state: BoneBasisState | undefined,
  rightWorld: THREE.Vector3,
  upWorld: THREE.Vector3,
  blend: number,
) {
  if (!state || rightWorld.lengthSq() < 1e-8 || upWorld.lengthSq() < 1e-8) return
  const parentQuaternion = state.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  const inverseParent = parentQuaternion.clone().invert()
  const rightParent = rightWorld.clone().applyQuaternion(inverseParent)
  const upParent = upWorld.clone().applyQuaternion(inverseParent)
  const targetBasis = makeBasisQuaternion(rightParent, upParent)
  if (!targetBasis) return
  const desired = targetBasis.multiply(state.sourceBasisQuaternion.clone().invert())
  state.bone.quaternion.slerp(desired, blend)
  runtime.root.updateMatrixWorld(true)
}

function aimBone(runtime: RetargetRuntime, state: BoneAimState | undefined, directionWorld: THREE.Vector3, blend: number) {
  if (!state || directionWorld.lengthSq() < 1e-8) return
  const parentQuaternion = state.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  const directionParent = directionWorld.clone().normalize().applyQuaternion(parentQuaternion.clone().invert())
  const restDirectionParent = state.axisLocal.clone().applyQuaternion(state.restLocalQuaternion).normalize()
  const delta = new THREE.Quaternion().setFromUnitVectors(restDirectionParent, directionParent)
  const desired = delta.multiply(state.restLocalQuaternion)
  state.bone.quaternion.slerp(desired, blend)
  runtime.root.updateMatrixWorld(true)
}

export function applyPoseToRig(
  runtime: RetargetRuntime,
  landmarks: PosePoint[],
  options?: { mirrorX?: boolean; blend?: number },
) {
  if (landmarks.length < 33) return
  const mirrorX = options?.mirrorX ?? false
  const blend = THREE.MathUtils.clamp(options?.blend ?? 0.72, 0.05, 1)
  const p = landmarks.map((point) => poseVector(point, mirrorX))

  const shouldersVisible = visible(landmarks[11]) && visible(landmarks[12])
  const hipsVisible = visible(landmarks[23]) && visible(landmarks[24])
  if (shouldersVisible && hipsVisible) {
    const shoulderCenter = midpoint(p[11], p[12])
    const hipCenter = midpoint(p[23], p[24])
    const torsoUp = shoulderCenter.sub(hipCenter)
    const shoulderRight = p[12].clone().sub(p[11])
    const hipRight = p[24].clone().sub(p[23])
    orientBasis(runtime, runtime.bases.hips, hipRight, torsoUp, blend)
    orientBasis(runtime, runtime.bases.spine, shoulderRight, torsoUp, blend)
    orientBasis(runtime, runtime.bases.chest, shoulderRight, torsoUp, blend)
  }

  if (visible(landmarks[11]) && visible(landmarks[13])) {
    aimBone(runtime, runtime.aims.leftUpperArm, p[13].clone().sub(p[11]), blend)
  }
  if (visible(landmarks[13]) && visible(landmarks[15])) {
    aimBone(runtime, runtime.aims.leftLowerArm, p[15].clone().sub(p[13]), blend)
  }
  if (visible(landmarks[12]) && visible(landmarks[14])) {
    aimBone(runtime, runtime.aims.rightUpperArm, p[14].clone().sub(p[12]), blend)
  }
  if (visible(landmarks[14]) && visible(landmarks[16])) {
    aimBone(runtime, runtime.aims.rightLowerArm, p[16].clone().sub(p[14]), blend)
  }
  if (visible(landmarks[23]) && visible(landmarks[25])) {
    aimBone(runtime, runtime.aims.leftUpperLeg, p[25].clone().sub(p[23]), blend)
  }
  if (visible(landmarks[25]) && visible(landmarks[27])) {
    aimBone(runtime, runtime.aims.leftLowerLeg, p[27].clone().sub(p[25]), blend)
  }
  if (visible(landmarks[24]) && visible(landmarks[26])) {
    aimBone(runtime, runtime.aims.rightUpperLeg, p[26].clone().sub(p[24]), blend)
  }
  if (visible(landmarks[26]) && visible(landmarks[28])) {
    aimBone(runtime, runtime.aims.rightLowerLeg, p[28].clone().sub(p[26]), blend)
  }

  if (visible(landmarks[11]) && visible(landmarks[12])) {
    const shoulderCenter = midpoint(p[11], p[12])
    const headTarget = visible(landmarks[7]) && visible(landmarks[8]) ? midpoint(p[7], p[8]) : p[0]
    aimBone(runtime, runtime.aims.neck, headTarget.sub(shoulderCenter), blend)
  }
}
