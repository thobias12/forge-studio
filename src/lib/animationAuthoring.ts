import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { bakeMotionToGlb } from './animationBake'
import { createEditedClip, exportAnimationSet, type RootMotionMode } from './animationEdit'
import { characterPackageDataToBlob, parseCharacterPackage } from './characterPackage'
import { getAsset, saveAsset, type LibraryAsset } from './library'
import type { MotionCleanupOptions } from './motionCleanup'
import {
  animationBindingAssetId,
  animationPackAssetId,
  animationSetBlob,
  createAnimationSet,
  normalizeAnimationSet,
  parseAnimationSet,
  type ForgeAnimationActionId,
  type ForgeAnimationSet,
} from '../engine/animationBindings'
import { loadSkillboundWorkspace, patchGameplay, saveSkillboundWorkspace } from '../engine/forgeProject'
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
  groundedNeutral?: boolean
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
    selected = [...motion.frames]
      .sort((a, b) => Math.abs(a.t - start) - Math.abs(b.t - start))
      .slice(0, 2)
      .sort((a, b) => a.t - b.t)
  }

  const firstSelectedTime = selected[0]?.t ?? start
  const frames = selected.map((frame) => cloneFrameWithTime(frame, Math.max(0, (frame.t - firstSelectedTime) / speed)))
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
      groundedNeutral: input.groundedNeutral,
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
  bindingTargetId?: string
  bindingTargetName?: string
}) {
  const built = await buildAuthoredAnimation({
    ...input,
    groundedNeutral: input.action === 'idle',
  })
  const runtimeTargetId = input.bindingTargetId ?? input.characterAsset.id
  const runtimeTargetName = input.bindingTargetName ?? input.characterAsset.name
  const bindingId = animationBindingAssetId(runtimeTargetId)
  const existingBindingAsset = await getAsset(bindingId)
  const existingSet = existingBindingAsset ? await parseAnimationSet(existingBindingAsset.blob, runtimeTargetId) : undefined
  const previousBinding = existingSet?.actions[input.action]
  const previousClipName = previousBinding?.clip

  const packId = animationPackAssetId(runtimeTargetId)
  const existingPack = await getAsset(packId)
  const previousClips = existingPack ? await loadAnimationClips(existingPack.blob) : []
  const newClips = await loadAnimationClips(built.blob)
  const bakedClip = newClips.find((clip) => clip.name === built.clipName) ?? newClips[0]
  if (!bakedClip) throw new Error('The newly baked animation did not contain a usable clip.')

  // Skillbound owns world-space movement on the player group. A mocap root-position
  // track would overwrite the runtime's ground-normalized body root and can make the
  // character float or snap away from the terrain. Gameplay clips therefore keep the
  // authored bone rotations but never animate the model root position.
  const newClip = stripGameplayRootPositionTracks(bakedClip)
  const mergedClips = previousClips
    .filter((clip) => clip.name !== built.clipName && (!previousClipName || clip.name !== previousClipName))
    .map(stripGameplayRootPositionTracks)
  mergedClips.push(newClip)

  const packBlob = await exportAnimationPack(built.blob, mergedClips)
  const animationAsset = await saveAsset({
    id: packId,
    name: `${runtimeTargetName} · Gameplay Animations`,
    category: 'animations',
    kind: 'glb',
    mime: 'model/gltf-binary',
    tags: [
      'animation-pack',
      'gameplay',
      'ForgeHumanoidV1',
      runtimeTargetId,
      `binding-target:${runtimeTargetId}`,
      `source-character:${input.characterAsset.id}`,
    ],
    source: 'Forge Animation Studio',
    blob: packBlob,
  })

  const baseSet = normalizeAnimationSet(
    existingSet ?? createAnimationSet(runtimeTargetId, mergedClips.map((clip) => clip.name)),
    runtimeTargetId,
    mergedClips.map((clip) => clip.name),
  )
  const nextSet: ForgeAnimationSet = {
    ...baseSet,
    actions: {
      ...baseSet.actions,
      [input.action]: {
        clip: built.clipName,
        loop: input.edit.loop,
        speed: 1,
        events: previousBinding?.events,
      },
    },
  }

  const bindingAsset = await saveAsset({
    id: bindingId,
    name: `${runtimeTargetName} Action Bindings`,
    category: 'animations',
    kind: 'file',
    mime: 'application/x-forge-animation-set+json',
    tags: [
      'animation-bindings',
      'ForgeHumanoidV1',
      runtimeTargetId,
      `binding-target:${runtimeTargetId}`,
      `source-character:${input.characterAsset.id}`,
    ],
    source: 'Forge Animation Studio',
    blob: animationSetBlob(nextSet),
  })

  const linkedRuntimeTargets = runtimeTargetId === input.characterAsset.id
    ? await linkAnimationPackToSkillbound(input.characterAsset.id, packId)
    : 0
  return {
    built,
    animationAsset,
    bindingAsset,
    set: nextSet,
    linkedRuntimeTargets,
    clipCount: mergedClips.length,
    runtimeTargetId,
    sourceCharacterAssetId: input.characterAsset.id,
  }
}

async function exportAnimationPack(sceneBlob: Blob, clips: THREE.AnimationClip[]) {
  const url = URL.createObjectURL(sceneBlob)
  try {
    return await exportAnimationSet(url, clips)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function loadAnimationClips(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const clips = gltf.animations.map((clip) => clip.clone())
    disposeGltf(gltf.scene)
    return clips
  } finally {
    URL.revokeObjectURL(url)
  }
}

function stripGameplayRootPositionTracks(clip: THREE.AnimationClip) {
  const tracks = clip.tracks
    .filter((track) => !track.name.toLowerCase().endsWith('.position'))
    .map((track) => track.clone())
  const next = new THREE.AnimationClip(clip.name, clip.duration, tracks)
  next.resetDuration()
  next.optimize()
  return next
}

async function linkAnimationPackToSkillbound(characterAssetId: string, animationAssetId: string) {
  try {
    const workspace = await loadSkillboundWorkspace()
    let linked = 0
    const player = workspace.gameplay.player.characterAssetId === characterAssetId
      ? (() => { linked += 1; return { ...workspace.gameplay.player, animationAssetId } })()
      : workspace.gameplay.player
    const enemies = workspace.gameplay.enemies.map((enemy) => {
      if (enemy.characterAssetId !== characterAssetId) return enemy
      linked += 1
      return { ...enemy, animationAssetId }
    })
    if (linked > 0) saveSkillboundWorkspace(patchGameplay(workspace, { ...workspace.gameplay, player, enemies }))
    return linked
  } catch {
    return 0
  }
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
