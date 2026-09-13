import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createForgeMannequin } from './mannequin'
import { cleanupMotion, type MotionCleanupOptions, type MotionCleanupReport } from './motionCleanup'
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

function smoothPose(source: PosePoint[] | undefined, previous: PosePoint[] | undefined, smoothing: number) {
  if (!source?.length) return undefined
  const alpha = THREE.MathUtils.clamp(1 - smoothing, 0.08, 1)
  if (!previous || previous.length !== source.length) return source.map((point) => ({ ...point }))
  return source.map((point, index) => {
    const before = previous[index]
    if ((point.visibility ?? 1) < 0.22) return { ...before, visibility: point.visibility }
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
  const { motion, characterSrc, clipName, smoothing, mirrorX, cleanup } = options
  if (motion.frames.length < 2) throw new Error('Record at least two mocap frames before exporting an animated GLB.')

  const cleaned = cleanupMotion(motion, cleanup)
  const { root, animations: sourceAnimations } = await loadCharacter(characterSrc)
  const runtime = createRetargetRuntime(root)
  if (runtime.info.coreMappedCount < 8) throw new Error('The character does not have enough mapped humanoid bones to bake this motion.')

  // Keep the bake path identical to the live preview. We explicitly reflect image X
  // instead of using the old quaternion basis alignment that could rotate the avatar 180°.
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

  let smoothed: PosePoint[] | undefined
  let leftHand: PosePoint[] | undefined
  let rightHand: PosePoint[] | undefined
  let lastTime = -1
  const blend = THREE.MathUtils.lerp(0.88, 0.46, THREE.MathUtils.clamp(smoothing, 0, 0.9))

  for (const frame of cleaned.motion.frames) {
    const raw = frame.landmarks
    if (!raw || raw.length !== 33) continue

    smoothed = smoothPose(raw, smoothed, smoothing)
    leftHand = smoothPose(frame.leftHandLandmarks, leftHand, smoothing)
    rightHand = smoothPose(frame.rightHandLandmarks, rightHand, smoothing)
    const prepared = prepareRetargetPose(smoothed)
    if (!prepared) continue

    applyPoseToRig(runtime, prepared, {
      mirrorX: !mirrorX,
      blend,
      leftHand,
      rightHand,
    })
    root.updateMatrixWorld(true)

    if (supportReferenceY !== undefined && hasStableFootContact(prepared)) {
      const currentSupportY = getSupportY(runtime)
      if (currentSupportY !== undefined) {
        const delta = THREE.MathUtils.clamp(supportReferenceY - currentSupportY, -0.09, 0.09)
        root.position.y += delta * 0.58
        root.updateMatrixWorld(true)
      }
    }

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
