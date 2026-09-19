import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createForgeMannequin } from './mannequin'
import { cleanupMotion, type MotionCleanupOptions, type MotionCleanupReport } from './motionCleanup'
import { createMocapPolishState, polishPoseFrame, resetDynamicPolishState } from './mocapPolish'
import { applyModelFootLocks, createModelFootLockState } from './modelFootLock'
import { hasStableFootContact, prepareRetargetPose } from './poseInput'
import { applyPoseToRig, createRetargetRuntime, HUMANOID_BONE_KEYS, type HumanoidBoneKey, type RetargetRuntime } from './retarget'
import type { ForgeMotion, PosePoint } from '../types'

export type BakeMotionOptions = {
  motion: ForgeMotion
  characterSrc?: string
  clipName: string
  smoothing: number
  mirrorX: boolean
  cleanup: MotionCleanupOptions
  groundedNeutral?: boolean
}

export type BakeMotionResult = {
  blob: Blob
  clip: THREE.AnimationClip
  mappedBones: number
  sampleCount: number
  preservedAnimations: number
  cleanup: MotionCleanupReport
}

async function loadCharacter(src?: string) {
  if (!src) return { root: createForgeMannequin(), animations: [] as THREE.AnimationClip[] }
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(src)
  return { root: gltf.scene, animations: gltf.animations }
}

function smoothPose(source: PosePoint[] | undefined, previous: PosePoint[] | undefined, smoothing: number, ignoreVisibility = false, movementScale = 0.055) {
  if (!source?.length) return undefined
  const baseAlpha = THREE.MathUtils.clamp(1 - smoothing, 0.08, 1)
  if (!previous || previous.length !== source.length) return source.map((point) => ({ ...point }))
  return source.map((point, index) => {
    const before = previous[index]
    if (!ignoreVisibility && (point.visibility ?? 1) < 0.22) return { ...before, visibility: point.visibility }
    const movement = Math.hypot(point.x - before.x, point.y - before.y, point.z - before.z)
    const response = THREE.MathUtils.clamp(movement / movementScale, 0, 1)
    const alpha = THREE.MathUtils.lerp(baseAlpha, 0.94, Math.pow(response, 0.7))
    return {
      x: THREE.MathUtils.lerp(before.x, point.x, alpha),
      y: THREE.MathUtils.lerp(before.y, point.y, alpha),
      z: THREE.MathUtils.lerp(before.z, point.z, alpha),
      visibility: point.visibility,
    }
  })
}

function pushQuaternion(values: number[], quaternion: THREE.Quaternion, previous?: THREE.Quaternion) {
  const next = quaternion.clone()
  if (previous && previous.dot(next) < 0) next.set(-next.x, -next.y, -next.z, -next.w)
  values.push(next.x, next.y, next.z, next.w)
  return next
}

function getSupportY(runtime: RetargetRuntime) {
  const supportBones = [runtime.rig.leftToes ?? runtime.rig.leftFoot, runtime.rig.rightToes ?? runtime.rig.rightFoot]
    .filter((bone): bone is THREE.Bone => !!bone)
  if (!supportBones.length) return undefined
  return Math.min(...supportBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()).y))
}

export async function bakeMotionToGlb(options: BakeMotionOptions): Promise<BakeMotionResult> {
  const { motion, characterSrc, clipName, smoothing, mirrorX, cleanup, groundedNeutral = false } = options
  if (motion.frames.length < 2) throw new Error('Record at least two mocap frames before exporting an animated GLB.')

  const cleaned = cleanupMotion(motion, cleanup)
  const { root, animations: sourceAnimations } = await loadCharacter(characterSrc)
  const runtime = createRetargetRuntime(root)
  if (runtime.info.coreMappedCount < 8) throw new Error('The character does not have enough mapped humanoid bones to bake this motion.')

  runtime.targetBodyBasis = undefined
  runtime.sourceAlignment = undefined
  runtime.calibrationMirrorX = undefined

  const animatedKeys = HUMANOID_BONE_KEYS.filter((key) => runtime.rig[key])
  const restQuaternions = new Map<THREE.Bone, THREE.Quaternion>()
  const values = new Map<HumanoidBoneKey, number[]>()
  const previousQuaternions = new Map<HumanoidBoneKey, THREE.Quaternion>()
  const restRootPosition = root.position.clone()
  const supportReferenceY = getSupportY(runtime)
  const rootValues: number[] = []
  const times: number[] = []

  animatedKeys.forEach((key) => {
    const bone = runtime.rig[key]!
    restQuaternions.set(bone, bone.quaternion.clone())
    values.set(key, [])
  })

  const polishState = createMocapPolishState()
  const footLockState = createModelFootLockState()
  const polishOptions = {
    calibrationFrames: Math.min(36, Math.max(12, Math.floor(cleaned.motion.frames.length * 0.2))),
    dropoutHoldMs: cleanup.repairGaps ? 240 : 0,
    jointStability: 0.76,
    handStability: 0.64,
    footLock: cleanup.footLock,
    footLockStrength: cleanup.footLock ? 0.92 : 0,
  }

  const primeCount = Math.min(cleaned.motion.frames.length, Math.max(18, polishOptions.calibrationFrames + 6))
  for (let index = 0; index < primeCount; index += 1) polishPoseFrame(cleaned.motion.frames[index], polishState, polishOptions)
  resetDynamicPolishState(polishState)

  let smoothedBody: PosePoint[] | undefined
  let leftHand: PosePoint[] | undefined
  let rightHand: PosePoint[] | undefined
  let lastTime = -1
  const blend = THREE.MathUtils.lerp(0.92, 0.56, THREE.MathUtils.clamp(smoothing, 0, 0.9))

  for (const frame of cleaned.motion.frames) {
    const polished = polishPoseFrame(frame, polishState, polishOptions)
    if (!polished || polished.body.length !== 33) continue

    const bodySpace = polished.bodySpace
    smoothedBody = smoothPose(polished.body, smoothedBody, smoothing, false, bodySpace === 'world' ? 0.055 : 0.028)
    leftHand = smoothPose(polished.leftHand, leftHand, smoothing, true, 0.035)
    rightHand = smoothPose(polished.rightHand, rightHand, smoothing, true, 0.035)
    const prepared = prepareRetargetPose(smoothedBody, bodySpace)
    if (!prepared) continue

    applyPoseToRig(runtime, prepared, {
      mirrorX: !mirrorX,
      blend,
      bodySpace,
      leftHand,
      rightHand,
      handPointsIgnoreVisibility: true,
      groundedNeutral,
    })
    root.updateMatrixWorld(true)

    if (supportReferenceY !== undefined && hasStableFootContact(prepared, bodySpace)) {
      const currentSupportY = getSupportY(runtime)
      if (currentSupportY !== undefined) {
        const delta = THREE.MathUtils.clamp(supportReferenceY - currentSupportY, -0.12, 0.12)
        const lockBoost = polished.quality.leftFootLocked || polished.quality.rightFootLocked ? 0.88 : 0.68
        root.position.y += delta * lockBoost
        root.updateMatrixWorld(true)
      }
    }

    applyModelFootLocks(root, runtime, polished.quality, footLockState, 0.92)

    let time = Math.max(0, frame.t / 1000)
    if (time <= lastTime) time = lastTime + 0.001
    lastTime = time
    times.push(time)
    rootValues.push(root.position.x, root.position.y, root.position.z)

    animatedKeys.forEach((key) => {
      const bone = runtime.rig[key]!
      const stored = pushQuaternion(values.get(key)!, bone.quaternion, previousQuaternions.get(key))
      previousQuaternions.set(key, stored)
    })
  }

  if (times.length < 2) throw new Error('The recording does not contain enough valid pose frames to bake.')

  const tracks: THREE.KeyframeTrack[] = animatedKeys.map((key) =>
    new THREE.QuaternionKeyframeTrack(`${runtime.rig[key]!.uuid}.quaternion`, times, values.get(key)!),
  )
  tracks.push(new THREE.VectorKeyframeTrack(`${root.uuid}.position`, times, rootValues))

  const bakedClip = new THREE.AnimationClip(clipName || 'Forge Mocap', -1, tracks)
  bakedClip.optimize()

  restQuaternions.forEach((quaternion, bone) => bone.quaternion.copy(quaternion))
  root.position.copy(restRootPosition)
  root.updateMatrixWorld(true)

  const preservedAnimations = sourceAnimations.filter((animation) => animation.name !== bakedClip.name)
  const result = await new GLTFExporter().parseAsync(root, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations: [...preservedAnimations, bakedClip],
  })
  if (!(result instanceof ArrayBuffer)) throw new Error('Forge expected a binary GLB export but received text glTF data.')

  return {
    blob: new Blob([result], { type: 'model/gltf-binary' }),
    clip: bakedClip,
    mappedBones: animatedKeys.length,
    sampleCount: times.length,
    preservedAnimations: preservedAnimations.length,
    cleanup: cleaned.report,
  }
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
