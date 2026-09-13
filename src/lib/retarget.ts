import * as THREE from 'three'
import type { PosePoint } from '../types'

export type CoreHumanoidBoneKey =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'leftToes'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'rightToes'

export type FingerBoneKey =
  | 'leftThumb1' | 'leftThumb2' | 'leftThumb3'
  | 'leftIndex1' | 'leftIndex2' | 'leftIndex3'
  | 'leftMiddle1' | 'leftMiddle2' | 'leftMiddle3'
  | 'leftRing1' | 'leftRing2' | 'leftRing3'
  | 'leftPinky1' | 'leftPinky2' | 'leftPinky3'
  | 'rightThumb1' | 'rightThumb2' | 'rightThumb3'
  | 'rightIndex1' | 'rightIndex2' | 'rightIndex3'
  | 'rightMiddle1' | 'rightMiddle2' | 'rightMiddle3'
  | 'rightRing1' | 'rightRing2' | 'rightRing3'
  | 'rightPinky1' | 'rightPinky2' | 'rightPinky3'

export type HumanoidBoneKey = CoreHumanoidBoneKey | FingerBoneKey

export const CORE_BONE_KEYS: CoreHumanoidBoneKey[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
]

export const FINGER_BONE_KEYS: FingerBoneKey[] = [
  'leftThumb1', 'leftThumb2', 'leftThumb3', 'leftIndex1', 'leftIndex2', 'leftIndex3', 'leftMiddle1', 'leftMiddle2', 'leftMiddle3', 'leftRing1', 'leftRing2', 'leftRing3', 'leftPinky1', 'leftPinky2', 'leftPinky3',
  'rightThumb1', 'rightThumb2', 'rightThumb3', 'rightIndex1', 'rightIndex2', 'rightIndex3', 'rightMiddle1', 'rightMiddle2', 'rightMiddle3', 'rightRing1', 'rightRing2', 'rightRing3', 'rightPinky1', 'rightPinky2', 'rightPinky3',
]

export const HUMANOID_BONE_KEYS: HumanoidBoneKey[] = [...CORE_BONE_KEYS, ...FINGER_BONE_KEYS]

export type HumanoidRig = Partial<Record<HumanoidBoneKey, THREE.Bone>>

export type RigInfo = {
  totalBones: number
  mappedCount: number
  coreMappedCount: number
  fingerMappedCount: number
  coreTotal: number
  mapped: Partial<Record<HumanoidBoneKey, string>>
  missing: CoreHumanoidBoneKey[]
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
  bases: Partial<Record<'hips' | 'spine' | 'chest' | 'leftHand' | 'rightHand', BoneBasisState>>
}

const aliases: Partial<Record<HumanoidBoneKey, string[]>> = {
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
  leftToes: ['lefttoebase', 'lefttoe', 'toel', 'ltoe', 'lefttoes'],
  rightUpperLeg: ['rightupperleg', 'rightupleg', 'rightthigh', 'upperlegr', 'thighr', 'rupperleg'],
  rightLowerLeg: ['rightlowerleg', 'rightleg', 'rightshin', 'rightcalf', 'lowerlegr', 'shinr', 'calfr', 'rlowerleg'],
  rightFoot: ['rightfoot', 'footr', 'rfoot', 'rightankle'],
  rightToes: ['righttoebase', 'righttoe', 'toer', 'rtoe', 'righttoes'],
  leftThumb1: ['lefthandthumb1', 'leftthumb1', 'thumb01l', 'lthumb1'],
  leftThumb2: ['lefthandthumb2', 'leftthumb2', 'thumb02l', 'lthumb2'],
  leftThumb3: ['lefthandthumb3', 'leftthumb3', 'thumb03l', 'lthumb3'],
  leftIndex1: ['lefthandindex1', 'leftindex1', 'index01l', 'lindex1'],
  leftIndex2: ['lefthandindex2', 'leftindex2', 'index02l', 'lindex2'],
  leftIndex3: ['lefthandindex3', 'leftindex3', 'index03l', 'lindex3'],
  leftMiddle1: ['lefthandmiddle1', 'leftmiddle1', 'middle01l', 'lmiddle1'],
  leftMiddle2: ['lefthandmiddle2', 'leftmiddle2', 'middle02l', 'lmiddle2'],
  leftMiddle3: ['lefthandmiddle3', 'leftmiddle3', 'middle03l', 'lmiddle3'],
  leftRing1: ['lefthandring1', 'leftring1', 'ring01l', 'lring1'],
  leftRing2: ['lefthandring2', 'leftring2', 'ring02l', 'lring2'],
  leftRing3: ['lefthandring3', 'leftring3', 'ring03l', 'lring3'],
  leftPinky1: ['lefthandpinky1', 'lefthandlittle1', 'leftpinky1', 'leftlittle1', 'pinky01l', 'little01l'],
  leftPinky2: ['lefthandpinky2', 'lefthandlittle2', 'leftpinky2', 'leftlittle2', 'pinky02l', 'little02l'],
  leftPinky3: ['lefthandpinky3', 'lefthandlittle3', 'leftpinky3', 'leftlittle3', 'pinky03l', 'little03l'],
  rightThumb1: ['righthandthumb1', 'rightthumb1', 'thumb01r', 'rthumb1'],
  rightThumb2: ['righthandthumb2', 'rightthumb2', 'thumb02r', 'rthumb2'],
  rightThumb3: ['righthandthumb3', 'rightthumb3', 'thumb03r', 'rthumb3'],
  rightIndex1: ['righthandindex1', 'rightindex1', 'index01r', 'rindex1'],
  rightIndex2: ['righthandindex2', 'rightindex2', 'index02r', 'rindex2'],
  rightIndex3: ['righthandindex3', 'rightindex3', 'index03r', 'rindex3'],
  rightMiddle1: ['righthandmiddle1', 'rightmiddle1', 'middle01r', 'rmiddle1'],
  rightMiddle2: ['righthandmiddle2', 'rightmiddle2', 'middle02r', 'rmiddle2'],
  rightMiddle3: ['righthandmiddle3', 'rightmiddle3', 'middle03r', 'rmiddle3'],
  rightRing1: ['righthandring1', 'rightring1', 'ring01r', 'rring1'],
  rightRing2: ['righthandring2', 'rightring2', 'ring02r', 'rring2'],
  rightRing3: ['righthandring3', 'rightring3', 'ring03r', 'rring3'],
  rightPinky1: ['righthandpinky1', 'righthandlittle1', 'rightpinky1', 'rightlittle1', 'pinky01r', 'little01r'],
  rightPinky2: ['righthandpinky2', 'righthandlittle2', 'rightpinky2', 'rightlittle2', 'pinky02r', 'little02r'],
  rightPinky3: ['righthandpinky3', 'righthandlittle3', 'rightpinky3', 'rightlittle3', 'pinky03r', 'little03r'],
}

const aimChildren: Partial<Record<HumanoidBoneKey, HumanoidBoneKey>> = {
  neck: 'head',
  leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand',
  rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand',
  leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot', leftFoot: 'leftToes',
  rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot', rightFoot: 'rightToes',
  leftThumb1: 'leftThumb2', leftThumb2: 'leftThumb3',
  leftIndex1: 'leftIndex2', leftIndex2: 'leftIndex3',
  leftMiddle1: 'leftMiddle2', leftMiddle2: 'leftMiddle3',
  leftRing1: 'leftRing2', leftRing2: 'leftRing3',
  leftPinky1: 'leftPinky2', leftPinky2: 'leftPinky3',
  rightThumb1: 'rightThumb2', rightThumb2: 'rightThumb3',
  rightIndex1: 'rightIndex2', rightIndex2: 'rightIndex3',
  rightMiddle1: 'rightMiddle2', rightMiddle2: 'rightMiddle3',
  rightRing1: 'rightRing2', rightRing2: 'rightRing3',
  rightPinky1: 'rightPinky2', rightPinky2: 'rightPinky3',
}

function normalizeBoneName(value: string) {
  return value.toLowerCase().replace(/mixamorig/g, '').replace(/bip001/g, '').replace(/bip01/g, '').replace(/armature/g, '').replace(/[^a-z0-9]/g, '')
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
  root.traverse((object) => { if ((object as THREE.Bone).isBone) bones.push(object as THREE.Bone) })
  const rig: HumanoidRig = {}
  const used = new Set<THREE.Bone>()

  for (const key of HUMANOID_BONE_KEYS) {
    let best: THREE.Bone | undefined
    let bestScore = 0
    for (const bone of bones) {
      if (used.has(bone)) continue
      const score = scoreBoneName(normalizeBoneName(bone.name), aliases[key] ?? [])
      if (score > bestScore) { best = bone; bestScore = score }
    }
    if (best && bestScore > 0) { rig[key] = best; used.add(best) }
  }

  const mapped: Partial<Record<HumanoidBoneKey, string>> = {}
  HUMANOID_BONE_KEYS.forEach((key) => { if (rig[key]) mapped[key] = rig[key]!.name || key })
  const coreMappedCount = CORE_BONE_KEYS.filter((key) => rig[key]).length
  const fingerMappedCount = FINGER_BONE_KEYS.filter((key) => rig[key]).length
  const info: RigInfo = {
    totalBones: bones.length,
    mappedCount: Object.keys(mapped).length,
    coreMappedCount,
    fingerMappedCount,
    coreTotal: CORE_BONE_KEYS.length,
    mapped,
    missing: CORE_BONE_KEYS.filter((key) => !rig[key]),
  }
  return { rig, info }
}

function localDirectionFromWorld(bone: THREE.Bone, worldDirection: THREE.Vector3) {
  return worldDirection.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize()
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

function captureAimState(bone: THREE.Bone, child: THREE.Bone): BoneAimState | undefined {
  const direction = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3()))
  if (direction.lengthSq() < 1e-8) return undefined
  return { bone, restLocalQuaternion: bone.quaternion.clone(), axisLocal: localDirectionFromWorld(bone, direction) }
}

function captureBasisState(bone: THREE.Bone, upTarget?: THREE.Bone, leftTarget?: THREE.Bone, rightTarget?: THREE.Bone): BoneBasisState | undefined {
  if (!upTarget || !leftTarget || !rightTarget) return undefined
  const origin = bone.getWorldPosition(new THREE.Vector3())
  const up = upTarget.getWorldPosition(new THREE.Vector3()).sub(origin)
  const right = rightTarget.getWorldPosition(new THREE.Vector3()).sub(leftTarget.getWorldPosition(new THREE.Vector3()))
  if (up.lengthSq() < 1e-8 || right.lengthSq() < 1e-8) return undefined
  const sourceBasisQuaternion = makeBasisQuaternion(localDirectionFromWorld(bone, right), localDirectionFromWorld(bone, up))
  return sourceBasisQuaternion ? { bone, sourceBasisQuaternion } : undefined
}

export function createRetargetRuntime(root: THREE.Object3D): RetargetRuntime {
  root.updateMatrixWorld(true)
  const { rig, info } = mapHumanoidRig(root)
  const aims: RetargetRuntime['aims'] = {}
  for (const [key, childKey] of Object.entries(aimChildren) as [HumanoidBoneKey, HumanoidBoneKey][]) {
    const bone = rig[key], child = rig[childKey]
    if (bone && child) aims[key] = captureAimState(bone, child)
  }
  const bases: RetargetRuntime['bases'] = {}
  if (rig.hips) bases.hips = captureBasisState(rig.hips, rig.spine ?? rig.chest, rig.leftUpperLeg, rig.rightUpperLeg)
  if (rig.spine) bases.spine = captureBasisState(rig.spine, rig.chest ?? rig.neck, rig.leftUpperArm, rig.rightUpperArm)
  if (rig.chest) bases.chest = captureBasisState(rig.chest, rig.neck ?? rig.head, rig.leftUpperArm, rig.rightUpperArm)
  if (rig.leftHand) bases.leftHand = captureBasisState(rig.leftHand, rig.leftMiddle1, rig.leftPinky1, rig.leftIndex1)
  if (rig.rightHand) bases.rightHand = captureBasisState(rig.rightHand, rig.rightMiddle1, rig.rightPinky1, rig.rightIndex1)
  return { root, rig, info, aims, bases }
}

function poseVector(point: PosePoint, mirrorX: boolean) {
  return new THREE.Vector3(mirrorX ? -point.x : point.x, -point.y, -point.z)
}
function visible(point: PosePoint | undefined, threshold = 0.24) { return !!point && (point.visibility ?? 1) >= threshold }
function midpoint(a: THREE.Vector3, b: THREE.Vector3) { return a.clone().add(b).multiplyScalar(0.5) }

function orientBasis(runtime: RetargetRuntime, state: BoneBasisState | undefined, rightWorld: THREE.Vector3, upWorld: THREE.Vector3, blend: number) {
  if (!state || rightWorld.lengthSq() < 1e-8 || upWorld.lengthSq() < 1e-8) return
  const parentQuaternion = state.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  const targetBasis = makeBasisQuaternion(rightWorld.clone().applyQuaternion(parentQuaternion.clone().invert()), upWorld.clone().applyQuaternion(parentQuaternion.clone().invert()))
  if (!targetBasis) return
  state.bone.quaternion.slerp(targetBasis.multiply(state.sourceBasisQuaternion.clone().invert()), blend)
  runtime.root.updateMatrixWorld(true)
}

function aimBone(runtime: RetargetRuntime, state: BoneAimState | undefined, directionWorld: THREE.Vector3, blend: number) {
  if (!state || directionWorld.lengthSq() < 1e-8) return
  const parentQuaternion = state.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
  const directionParent = directionWorld.clone().normalize().applyQuaternion(parentQuaternion.clone().invert())
  const restDirectionParent = state.axisLocal.clone().applyQuaternion(state.restLocalQuaternion).normalize()
  const desired = new THREE.Quaternion().setFromUnitVectors(restDirectionParent, directionParent).multiply(state.restLocalQuaternion)
  state.bone.quaternion.slerp(desired, blend)
  runtime.root.updateMatrixWorld(true)
}

function applyHand(runtime: RetargetRuntime, side: 'left' | 'right', points: PosePoint[] | undefined, mirrorX: boolean, blend: number) {
  if (!points || points.length < 21) return
  const p = points.map((point) => poseVector(point, mirrorX))
  if (visible(points[0]) && visible(points[5]) && visible(points[9]) && visible(points[17])) {
    const right = p[5].clone().sub(p[17])
    const forward = p[9].clone().sub(p[0])
    orientBasis(runtime, runtime.bases[side === 'left' ? 'leftHand' : 'rightHand'], right, forward, blend)
  }
  const prefix = side === 'left' ? 'left' : 'right'
  const fingers: Array<[string, number, number, number, number]> = [
    ['Thumb', 1, 2, 2, 3], ['Index', 5, 6, 6, 7], ['Middle', 9, 10, 10, 11], ['Ring', 13, 14, 14, 15], ['Pinky', 17, 18, 18, 19],
  ]
  for (const [name, a1, b1, a2, b2] of fingers) {
    const key1 = `${prefix}${name}1` as HumanoidBoneKey
    const key2 = `${prefix}${name}2` as HumanoidBoneKey
    if (visible(points[a1]) && visible(points[b1])) aimBone(runtime, runtime.aims[key1], p[b1].clone().sub(p[a1]), blend)
    if (visible(points[a2]) && visible(points[b2])) aimBone(runtime, runtime.aims[key2], p[b2].clone().sub(p[a2]), blend)
  }
}

export function applyPoseToRig(
  runtime: RetargetRuntime,
  landmarks: PosePoint[],
  options?: { mirrorX?: boolean; blend?: number; leftHand?: PosePoint[]; rightHand?: PosePoint[] },
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
    orientBasis(runtime, runtime.bases.hips, p[24].clone().sub(p[23]), torsoUp, blend)
    orientBasis(runtime, runtime.bases.spine, p[12].clone().sub(p[11]), torsoUp, blend)
    orientBasis(runtime, runtime.bases.chest, p[12].clone().sub(p[11]), torsoUp, blend)
  }

  if (visible(landmarks[11]) && visible(landmarks[13])) aimBone(runtime, runtime.aims.leftUpperArm, p[13].clone().sub(p[11]), blend)
  if (visible(landmarks[13]) && visible(landmarks[15])) aimBone(runtime, runtime.aims.leftLowerArm, p[15].clone().sub(p[13]), blend)
  if (visible(landmarks[12]) && visible(landmarks[14])) aimBone(runtime, runtime.aims.rightUpperArm, p[14].clone().sub(p[12]), blend)
  if (visible(landmarks[14]) && visible(landmarks[16])) aimBone(runtime, runtime.aims.rightLowerArm, p[16].clone().sub(p[14]), blend)
  if (visible(landmarks[23]) && visible(landmarks[25])) aimBone(runtime, runtime.aims.leftUpperLeg, p[25].clone().sub(p[23]), blend)
  if (visible(landmarks[25]) && visible(landmarks[27])) aimBone(runtime, runtime.aims.leftLowerLeg, p[27].clone().sub(p[25]), blend)
  if (visible(landmarks[24]) && visible(landmarks[26])) aimBone(runtime, runtime.aims.rightUpperLeg, p[26].clone().sub(p[24]), blend)
  if (visible(landmarks[26]) && visible(landmarks[28])) aimBone(runtime, runtime.aims.rightLowerLeg, p[28].clone().sub(p[26]), blend)

  // MediaPipe Pose includes ankle, heel and foot-index landmarks. The ankle -> foot-index vector gives Forge actual foot pitch/yaw instead of only a planted point.
  if (visible(landmarks[27]) && visible(landmarks[31])) aimBone(runtime, runtime.aims.leftFoot, p[31].clone().sub(p[27]), blend)
  if (visible(landmarks[28]) && visible(landmarks[32])) aimBone(runtime, runtime.aims.rightFoot, p[32].clone().sub(p[28]), blend)

  if (shouldersVisible) {
    const shoulderCenter = midpoint(p[11], p[12])
    const headTarget = visible(landmarks[7]) && visible(landmarks[8]) ? midpoint(p[7], p[8]) : p[0]
    aimBone(runtime, runtime.aims.neck, headTarget.sub(shoulderCenter), blend)
  }

  applyHand(runtime, 'left', options?.leftHand, mirrorX, blend)
  applyHand(runtime, 'right', options?.rightHand, mirrorX, blend)
}
