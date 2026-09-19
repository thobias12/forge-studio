import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  actionDefinition,
  FORGE_ANIMATION_ACTIONS,
  type ForgeAnimationActionId,
  type ForgeAnimationEvent,
} from './animationBindings'
import { getAsset, saveAsset, type LibraryAsset } from '../lib/library'
import {
  HUMANOID_BONE_KEYS,
  mapHumanoidRig,
  type HumanoidBoneKey,
  type HumanoidRig,
} from '../lib/retarget'

export type ForgeAnimationRootMotionV3 = 'none' | 'extract' | 'apply'

export type ForgeAnimationBoneTrackV3 = {
  times: number[]
  rotations: number[]
}

export type ForgeAnimationClipV3 = {
  format: 'forge-animation'
  version: 3
  id: string
  name: string
  rig: 'ForgeHumanoidV2'
  duration: number
  loop: boolean
  rootMotion: ForgeAnimationRootMotionV3
  sourceAssetId?: string
  tracks: Partial<Record<HumanoidBoneKey, ForgeAnimationBoneTrackV3>>
  events?: ForgeAnimationEvent[]
}

export type ForgeAnimationProfileActionV3 = {
  assetId: string
  loop: boolean
  speed: number
}

export type ForgeAnimationProfileV3 = {
  format: 'forge-animation-profile'
  version: 3
  id: string
  name: string
  targetId: string
  rig: 'ForgeHumanoidV2'
  sourceBodyAssetId?: string
  actions: Partial<Record<ForgeAnimationActionId, ForgeAnimationProfileActionV3>>
}

export type ForgeRigAdapterV3 = {
  root: THREE.Object3D
  rig: HumanoidRig
  rest: Partial<Record<HumanoidBoneKey, THREE.Quaternion>>
}

type RuntimeActionV3 = {
  id: ForgeAnimationActionId
  definition: ForgeAnimationClipV3
  clip: THREE.AnimationClip
  action: THREE.AnimationAction
}

export function forgeAnimationV3AssetId(targetId: string, action: ForgeAnimationActionId) {
  return `forgeanim:v3:${targetId}:${action}`
}

export function forgeAnimationProfileV3AssetId(targetId: string) {
  return `forge-animation-profile:v3:${targetId}`
}

export function forgeAnimationV3Blob(animation: ForgeAnimationClipV3) {
  return new Blob([JSON.stringify(animation)], { type: 'application/x-forge-animation+json' })
}

export function forgeAnimationProfileV3Blob(profile: ForgeAnimationProfileV3) {
  return new Blob([JSON.stringify(profile, null, 2)], { type: 'application/x-forge-animation-profile+json' })
}

export async function parseForgeAnimationV3(blob: Blob) {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<ForgeAnimationClipV3>
    if (parsed.format !== 'forge-animation' || parsed.version !== 3 || parsed.rig !== 'ForgeHumanoidV2' || !parsed.tracks) return undefined
    return parsed as ForgeAnimationClipV3
  } catch {
    return undefined
  }
}

export async function parseForgeAnimationProfileV3(blob: Blob) {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<ForgeAnimationProfileV3>
    if (parsed.format !== 'forge-animation-profile' || parsed.version !== 3 || parsed.rig !== 'ForgeHumanoidV2' || !parsed.targetId || !parsed.actions) return undefined
    return parsed as ForgeAnimationProfileV3
  } catch {
    return undefined
  }
}

export async function loadForgeAnimationProfileV3(targetId: string) {
  const asset = await getAsset(forgeAnimationProfileV3AssetId(targetId)).catch(() => undefined)
  if (!asset) return undefined
  return await parseForgeAnimationProfileV3(asset.blob)
}

export async function saveForgeAnimationV3(input: {
  targetId: string
  targetName: string
  sourceBodyAssetId?: string
  action: ForgeAnimationActionId
  animation: ForgeAnimationClipV3
  previousEvents?: ForgeAnimationEvent[]
}) {
  const animationId = forgeAnimationV3AssetId(input.targetId, input.action)
  const animation: ForgeAnimationClipV3 = {
    ...input.animation,
    id: animationId,
    loop: actionDefinition(input.action)?.loop ?? input.animation.loop,
    events: input.previousEvents ?? input.animation.events,
  }
  const animationAsset = await saveAsset({
    id: animationId,
    name: `${input.targetName} · ${actionDefinition(input.action)?.label ?? input.action}`,
    category: 'animations',
    kind: 'file',
    mime: 'application/x-forge-animation+json',
    tags: ['forge-animation-v3', 'ForgeHumanoidV2', input.targetId, `action:${input.action}`, ...(input.sourceBodyAssetId ? [`source-character:${input.sourceBodyAssetId}`] : [])],
    source: 'Forge Animation Studio Runtime 3',
    blob: forgeAnimationV3Blob(animation),
  })

  const profileId = forgeAnimationProfileV3AssetId(input.targetId)
  const existingAsset = await getAsset(profileId).catch(() => undefined)
  const existing = existingAsset ? await parseForgeAnimationProfileV3(existingAsset.blob) : undefined
  const profile: ForgeAnimationProfileV3 = {
    format: 'forge-animation-profile',
    version: 3,
    id: profileId,
    name: `${input.targetName} Animation Profile`,
    targetId: input.targetId,
    rig: 'ForgeHumanoidV2',
    sourceBodyAssetId: input.sourceBodyAssetId ?? existing?.sourceBodyAssetId,
    actions: {
      ...(existing?.actions ?? {}),
      [input.action]: {
        assetId: animationId,
        loop: animation.loop,
        speed: 1,
      },
    },
  }
  const profileAsset = await saveAsset({
    id: profileId,
    name: profile.name,
    category: 'animations',
    kind: 'file',
    mime: 'application/x-forge-animation-profile+json',
    tags: ['forge-animation-profile-v3', 'ForgeHumanoidV2', input.targetId],
    source: 'Forge Animation Studio Runtime 3',
    blob: forgeAnimationProfileV3Blob(profile),
  })

  return { animationAsset, profileAsset, animation, profile }
}

export function createRigAdapterV3(root: THREE.Object3D): ForgeRigAdapterV3 {
  root.updateMatrixWorld(true)
  const { rig } = mapHumanoidRig(root)
  const rest: ForgeRigAdapterV3['rest'] = {}
  for (const key of HUMANOID_BONE_KEYS) {
    const bone = rig[key]
    if (bone) rest[key] = bone.quaternion.clone()
  }
  return { root, rig, rest }
}

function normalizeTrackNode(value: string) {
  return value
    .toLowerCase()
    .replace(/mixamorig/g, '')
    .replace(/bip001/g, '')
    .replace(/bip01/g, '')
    .replace(/armature/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function trackNodeId(trackName: string) {
  const noProperty = trackName.replace(/\.(quaternion|position)$/i, '')
  const boneMatch = noProperty.match(/\.bones\[([^\]]+)\]$/i)
  if (boneMatch?.[1]) return boneMatch[1]
  const parts = noProperty.split(/[|/:]/g).filter(Boolean)
  return parts.at(-1) ?? noProperty
}

function createTrackBoneResolver(root: THREE.Object3D) {
  const { rig } = mapHumanoidRig(root)
  const exact = new Map<string, HumanoidBoneKey>()
  const normalized = new Map<string, HumanoidBoneKey>()
  for (const key of HUMANOID_BONE_KEYS) {
    const bone = rig[key]
    if (!bone) continue
    exact.set(bone.uuid, key)
    if (bone.name) {
      exact.set(bone.name, key)
      normalized.set(normalizeTrackNode(bone.name), key)
    }
  }
  return {
    rig,
    resolve(trackName: string) {
      const node = trackNodeId(trackName)
      return exact.get(node) ?? normalized.get(normalizeTrackNode(node))
    },
  }
}

export function forgeAnimationV3FromThreeClip(input: {
  sourceRoot: THREE.Object3D
  clip: THREE.AnimationClip
  id: string
  name?: string
  loop: boolean
  rootMotion?: ForgeAnimationRootMotionV3
  sourceAssetId?: string
  events?: ForgeAnimationEvent[]
}) {
  input.sourceRoot.updateMatrixWorld(true)
  const resolver = createTrackBoneResolver(input.sourceRoot)
  const tracks: ForgeAnimationClipV3['tracks'] = {}

  for (const track of input.clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue
    const key = resolver.resolve(track.name)
    const bone = key ? resolver.rig[key] : undefined
    if (!key || !bone) continue
    const restInverse = bone.quaternion.clone().invert()
    const rotations: number[] = []
    for (let index = 0; index + 3 < track.values.length; index += 4) {
      const animated = new THREE.Quaternion(
        track.values[index],
        track.values[index + 1],
        track.values[index + 2],
        track.values[index + 3],
      )
      const delta = restInverse.clone().multiply(animated).normalize()
      rotations.push(delta.x, delta.y, delta.z, delta.w)
    }
    tracks[key] = { times: Array.from(track.times), rotations }
  }

  return {
    format: 'forge-animation',
    version: 3,
    id: input.id,
    name: input.name ?? input.clip.name,
    rig: 'ForgeHumanoidV2',
    duration: input.clip.duration,
    loop: input.loop,
    rootMotion: input.rootMotion ?? 'none',
    sourceAssetId: input.sourceAssetId,
    tracks,
    events: input.events,
  } satisfies ForgeAnimationClipV3
}

export async function forgeAnimationV3FromGlb(input: {
  blob: Blob
  clipName: string
  id: string
  name?: string
  loop: boolean
  rootMotion?: ForgeAnimationRootMotionV3
  sourceAssetId?: string
  events?: ForgeAnimationEvent[]
}) {
  const url = URL.createObjectURL(input.blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const clip = gltf.animations.find((candidate) => candidate.name === input.clipName) ?? gltf.animations[0]
    if (!clip) throw new Error('The baked motion did not contain a usable animation clip.')
    return forgeAnimationV3FromThreeClip({
      sourceRoot: gltf.scene,
      clip,
      id: input.id,
      name: input.name,
      loop: input.loop,
      rootMotion: input.rootMotion,
      sourceAssetId: input.sourceAssetId,
      events: input.events,
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function compileForgeAnimationV3(animation: ForgeAnimationClipV3, adapter: ForgeRigAdapterV3) {
  const tracks: THREE.KeyframeTrack[] = []
  for (const key of HUMANOID_BONE_KEYS) {
    const semantic = animation.tracks[key]
    const targetBone = adapter.rig[key]
    const rest = adapter.rest[key]
    if (!semantic || !targetBone || !rest || semantic.rotations.length < 4 || !semantic.times.length) continue
    const rotations: number[] = []
    for (let index = 0; index + 3 < semantic.rotations.length; index += 4) {
      const delta = new THREE.Quaternion(
        semantic.rotations[index],
        semantic.rotations[index + 1],
        semantic.rotations[index + 2],
        semantic.rotations[index + 3],
      )
      const output = rest.clone().multiply(delta).normalize()
      rotations.push(output.x, output.y, output.z, output.w)
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${targetBone.uuid}.quaternion`,
      semantic.times,
      rotations,
    ))
  }
  return new THREE.AnimationClip(animation.name, animation.duration, tracks)
}

async function loadProfileAnimations(profile: ForgeAnimationProfileV3) {
  const result = new Map<ForgeAnimationActionId, ForgeAnimationClipV3>()
  await Promise.all(
    Object.entries(profile.actions).map(async ([action, binding]) => {
      if (!binding?.assetId) return
      const asset = await getAsset(binding.assetId).catch(() => undefined)
      const animation = asset ? await parseForgeAnimationV3(asset.blob) : undefined
      if (animation) result.set(action as ForgeAnimationActionId, animation)
    }),
  )
  return result
}

function inferLegacyAction(clips: THREE.AnimationClip[], action: ForgeAnimationActionId) {
  const aliases = actionDefinition(action)?.aliases ?? []
  for (const alias of aliases) {
    const match = clips.find((clip) => alias.test(clip.name))
    if (match) return match
  }
  return undefined
}

export function buildLegacyFallbackAnimationsV3(input: {
  sourceRoot: THREE.Object3D
  clips: THREE.AnimationClip[]
  sourceAssetId?: string
}) {
  const result = new Map<ForgeAnimationActionId, ForgeAnimationClipV3>()
  for (const definition of FORGE_ANIMATION_ACTIONS) {
    const clip = inferLegacyAction(input.clips, definition.id)
    if (!clip) continue
    result.set(definition.id, forgeAnimationV3FromThreeClip({
      sourceRoot: input.sourceRoot,
      clip,
      id: `legacy-runtime:${definition.id}`,
      name: clip.name,
      loop: definition.loop,
      rootMotion: 'none',
      sourceAssetId: input.sourceAssetId,
    }))
  }
  return result
}

export class ForgeAnimationControllerV3 {
  readonly runtime = 'ForgeAnimationRuntimeV3'
  readonly adapter: ForgeRigAdapterV3
  private mixer: THREE.AnimationMixer
  private actions = new Map<ForgeAnimationActionId, RuntimeActionV3>()
  private baseId: 'idle' | 'walk' | 'run' = 'idle'
  private base?: RuntimeActionV3
  private oneShot?: RuntimeActionV3
  private disposed = false

  constructor(root: THREE.Object3D, animations: Map<ForgeAnimationActionId, ForgeAnimationClipV3>) {
    this.adapter = createRigAdapterV3(root)
    this.mixer = new THREE.AnimationMixer(root)

    for (const [id, definition] of animations) {
      const clip = compileForgeAnimationV3(definition, this.adapter)
      if (!clip.tracks.length) continue
      const action = this.mixer.clipAction(clip)
      action.enabled = true
      this.actions.set(id, { id, definition, clip, action })
    }

    this.mixer.addEventListener('finished', this.handleFinished as never)
    this.setBase('idle', true)
  }

  private handleFinished = (event: { action?: THREE.AnimationAction }) => {
    if (!this.oneShot || event.action !== this.oneShot.action) return
    this.oneShot.action.stop()
    this.oneShot = undefined
    if (this.base) {
      this.base.action.enabled = true
      this.base.action.setEffectiveWeight(1)
      this.base.action.play()
      this.mixer.update(0)
    }
  }

  has(action: ForgeAnimationActionId) {
    return this.actions.has(action)
  }

  setBase(action: 'idle' | 'walk' | 'run', immediate = false) {
    const resolved = this.actions.get(action)
      ?? (action === 'run' ? this.actions.get('walk') : undefined)
      ?? this.actions.get('idle')
    if (!resolved) return false
    if (this.base === resolved) return true

    const previous = this.base
    this.baseId = action
    this.base = resolved
    resolved.action.reset()
    resolved.action.enabled = true
    resolved.action.setLoop(THREE.LoopRepeat, Infinity)
    resolved.action.clampWhenFinished = false
    resolved.action.setEffectiveTimeScale(1)
    resolved.action.setEffectiveWeight(this.oneShot ? 0 : 1)
    resolved.action.play()

    if (previous && previous !== resolved) {
      if (!this.oneShot && !immediate) {
        previous.action.crossFadeTo(resolved.action, 0.12, false)
      } else {
        previous.action.stop()
      }
    }
    return true
  }

  setLocomotion(moving: boolean, running = true) {
    return this.setBase(moving ? (running ? 'run' : 'walk') : 'idle')
  }

  playAction(id: ForgeAnimationActionId) {
    const runtime = this.actions.get(id)
    if (!runtime) return false
    if (runtime.definition.loop && (id === 'idle' || id === 'walk' || id === 'run')) {
      return this.setBase(id)
    }

    if (this.oneShot) this.oneShot.action.stop()
    this.oneShot = runtime
    if (this.base) this.base.action.setEffectiveWeight(0)
    runtime.action.reset()
    runtime.action.enabled = true
    runtime.action.setLoop(runtime.definition.loop ? THREE.LoopRepeat : THREE.LoopOnce, runtime.definition.loop ? Infinity : 1)
    runtime.action.clampWhenFinished = false
    runtime.action.setEffectiveWeight(1)
    runtime.action.setEffectiveTimeScale(1)
    runtime.action.play()
    return true
  }

  playCue(cue: 'idle' | 'move' | 'attack' | 'hit' | 'death' | 'dodge') {
    if (cue === 'idle') return this.setBase('idle')
    if (cue === 'move') return this.setBase(this.actions.has('run') ? 'run' : 'walk')
    if (cue === 'attack') return this.playAction('attackPrimary')
    if (cue === 'hit') return this.playAction(this.actions.has('hit') ? 'hit' : 'stagger')
    if (cue === 'death') return this.playAction('death')
    return this.playAction('dodge')
  }

  playNamed(name: string, loop = false) {
    for (const runtime of this.actions.values()) {
      if (runtime.definition.id === name || runtime.definition.name === name || runtime.clip.name === name) {
        if (runtime.id === 'idle' || runtime.id === 'walk' || runtime.id === 'run') return this.setBase(runtime.id)
        return this.playAction(runtime.id)
      }
    }
    return false
  }

  update(delta: number) {
    if (this.disposed) return
    this.mixer.update(delta)
  }

  getDebugState() {
    return {
      runtime: this.runtime,
      base: this.baseId,
      baseClip: this.base?.definition.name,
      action: this.oneShot?.id,
      actionClip: this.oneShot?.definition.name,
      available: [...this.actions.keys()],
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.mixer.removeEventListener('finished', this.handleFinished as never)
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.adapter.root)
  }
}

export async function createAnimationControllerV3(input: {
  targetRoot: THREE.Object3D
  targetId?: string
  fallbackSource?: { root: THREE.Object3D; clips: THREE.AnimationClip[]; sourceAssetId?: string }
}) {
  const merged = new Map<ForgeAnimationActionId, ForgeAnimationClipV3>()

  if (input.fallbackSource) {
    const fallback = buildLegacyFallbackAnimationsV3(input.fallbackSource)
    fallback.forEach((animation, action) => merged.set(action, animation))
  }

  if (input.targetId) {
    const profile = await loadForgeAnimationProfileV3(input.targetId)
    if (profile) {
      const authored = await loadProfileAnimations(profile)
      authored.forEach((animation, action) => merged.set(action, animation))
    }
  }

  return new ForgeAnimationControllerV3(input.targetRoot, merged)
}
