import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { bakeMotionToGlb } from './animationBake'
import { createEditedClip, exportAnimationSet, type RootMotionMode } from './animationEdit'
import { characterPackageDataToBlob, parseCharacterPackage } from './characterPackage'
import { getAsset, saveAsset, type LibraryAsset } from './library'
import type { MotionCleanupOptions } from './motionCleanup'
import {
  animationBindingAssetId,
  animationSetBlob,
  createAnimationSet,
  normalizeAnimationSet,
  parseAnimationSet,
  type ForgeAnimationActionId,
} from '../engine/animationBindings'
import type { ForgeMotion, PoseFrame } from '../types'

export type AnimationAuthoringEdit = {
  name: string
  trimStartMs: number
  trimEndMs: number
  speed: number
  closeLoop: boolean
  rootMotion: RootMotionMode
  loop: boolean
}

export type BuildAuthoredAnimationInput = {
  motion: ForgeMotion
  characterBlob?: Blob
  edit: AnimationAuthoringEdit
  smoothing: number
  mirrorX: boolean
  cleanup: MotionCleanupOptions
}

export type BuiltAuthoredAnimation = {
  blob: Blob
  clipName: string
  duration: number
  mappedBones: number
  sampleCount: number
  footLockedFrames: number
  repairedPoints: number
}

export async function libraryCharacterModelBlob(asset: LibraryAsset) {
  const characterPackage = await parseCharacterPackage(asset.blob)
  return characterPackage ? characterPackageDataToBlob(characterPackage.base.data) : asset.blob
}

export function editMotionForAuthoring(motion: ForgeMotion, edit: AnimationAuthoringEdit): ForgeMotion {
  const duration = Math.max(1, motion.durationMs || motion.frames.at(-1)?.t || 1)
  const start = THREE.MathUtils.clamp(edit.trimStartMs, 0, Math.max(0, duration - 1))
  const end = THREE.MathUtils.clamp(edit.trimEndMs, start + 1, duration)
  const speed = THREE.MathUtils.clamp(edit.speed, 0.1, 4)

  let selected = motion.frames.filter((frame) => frame.t >= start && frame.t <= end)
  if (selected.length < 2) {
    const nearest = [...motion.frames].sort((a, b) => Math.abs(a.t - start) - Math.abs(b.t - start)).slice(0, 2).sort((a, b) => a.t - b.t)
    selected = nearest
  }

  const frames = selected.map((frame) => cloneFrameWithTime(frame, Math.max(0, (frame.t - start) / speed)))
  const durationMs = frames.at(-1)?.t ?? 0
  const fps = durationMs > 0 ? Math.round((frames.length / durationMs) * 1000) : motion.fps

  return {
    ...motion,
    name: edit.name.trim() || motion.name || 'Animation',
    fps,
    durationMs,
    frames,
  }
}

export async function buildAuthoredAnimation(input: BuildAuthoredAnimationInput): Promise<BuiltAuthoredAnimation> {
  const authoredMotion = editMotionForAuthoring(input.motion, input.edit)
  let characterUrl = ''
  let bakedUrl = ''

  try {
    if (input.characterBlob) characterUrl = URL.createObjectURL(input.characterBlob)
    const baked = await bakeMotionToGlb({
      motion: authoredMotion,
      characterSrc: characterUrl || undefined,
      clipName: input.edit.name.trim() || authoredMotion.name || 'Animation',
      smoothing: input.smoothing,
      mirrorX: input.mirrorX,
      cleanup: input.cleanup,
    })

    bakedUrl = URL.createObjectURL(baked.blob)
    const gltf = await new GLTFLoader().loadAsync(bakedUrl)
    const source = gltf.animations.find((clip) => clip.name === baked.clip.name) ?? gltf.animations.at(-1)
    if (!source) throw new Error('Forge baked the motion but could not find its animation clip.')

    const finalClip = createEditedClip(source, {
      name: input.edit.name.trim() || source.name || 'Animation',
      trimStart: 0,
      trimEnd: Math.max(0.001, source.duration),
      speed: 1,
      closeLoop: input.edit.closeLoop,
      rootMotion: input.edit.rootMotion,
    })
    const finalBlob = await exportAnimationSet(bakedUrl, [finalClip])

    disposeGltf(gltf.scene)
    return {
      blob: finalBlob,
      clipName: finalClip.name,
      duration: finalClip.duration,
      mappedBones: baked.mappedBones,
      sampleCount: baked.sampleCount,
      footLockedFrames: baked.cleanup.footLockedFrames,
      repairedPoints: baked.cleanup.repairedPoints,
    }
  } finally {
    if (characterUrl) URL.revokeObjectURL(characterUrl)
    if (bakedUrl) URL.revokeObjectURL(bakedUrl)
  }
}

export async function publishAuthoredAnimation(input: BuildAuthoredAnimationInput & {
  characterAsset: LibraryAsset
  action: ForgeAnimationActionId
}) {
  const built = await buildAuthoredAnimation(input)
  const animationAssetId = `forge-animation:${input.characterAsset.id}:${input.action}`
  const animationAsset = await saveAsset({
    id: animationAssetId,
    name: `${input.characterAsset.name} · ${built.clipName}`,
    category: 'animations',
    kind: 'glb',
    mime: 'model/gltf-binary',
    tags: ['animation', 'gameplay', input.action, input.characterAsset.id],
    source: 'Forge Animation Studio',
    blob: built.blob,
  })

  const bindingId = animationBindingAssetId(input.characterAsset.id)
  const existingAsset = await getAsset(bindingId)
  const existing = existingAsset ? await parseAnimationSet(existingAsset.blob, input.characterAsset.id) : undefined
  const baseSet = normalizeAnimationSet(existing ?? createAnimationSet(input.characterAsset.id, [built.clipName]), input.characterAsset.id, [built.clipName])
  const nextSet = {
    ...baseSet,
    actions: {
      ...baseSet.actions,
      [input.action]: {
        clip: built.clipName,
        loop: input.edit.loop,
        speed: 1,
      },
    },
  }

  const bindingAsset = await saveAsset({
    id: bindingId,
    name: `${input.characterAsset.name} Action Bindings`,
    category: 'animations',
    kind: 'file',
    mime: 'application/x-forge-animation-set+json',
    tags: ['animation-bindings', 'ForgeHumanoidV1', input.characterAsset.id],
    source: 'Forge Animation Studio',
    blob: animationSetBlob(nextSet),
  })

  return { built, animationAsset, bindingAsset, set: nextSet }
}

function cloneFrameWithTime(frame: PoseFrame, t: number): PoseFrame {
  return {
    ...frame,
    t,
    landmarks: frame.landmarks.map((point) => ({ ...point })),
    worldLandmarks: frame.worldLandmarks?.map((point) => ({ ...point })),
    leftHandLandmarks: frame.leftHandLandmarks?.map((point) => ({ ...point })),
    rightHandLandmarks: frame.rightHandLandmarks?.map((point) => ({ ...point })),
    leftHandWorldLandmarks: frame.leftHandWorldLandmarks?.map((point) => ({ ...point })),
    rightHandWorldLandmarks: frame.rightHandWorldLandmarks?.map((point) => ({ ...point })),
    tracking: frame.tracking ? { ...frame.tracking, missing: [...frame.tracking.missing] } : undefined,
    capture: frame.capture ? { ...frame.capture } : undefined,
  }
}

function disposeGltf(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => material?.dispose())
  })
}
