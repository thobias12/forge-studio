import * as THREE from 'three'
import {
  HUMANOID_BONE_KEYS,
  mapHumanoidRig,
  type HumanoidBoneKey,
  type HumanoidRig,
} from '../lib/retarget'

function normalizeTrackBoneId(value: string) {
  return value
    .toLowerCase()
    .replace(/mixamorig/g, '')
    .replace(/bip001/g, '')
    .replace(/bip01/g, '')
    .replace(/armature/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function animationTrackNodeId(trackName: string) {
  const withoutProperty = trackName.replace(/\.quaternion$/i, '')
  const boneMatch = withoutProperty.match(/\.bones\[([^\]]+)\]$/i)
  if (boneMatch?.[1]) return boneMatch[1]
  const pathParts = withoutProperty.split(/[|/:]/g).filter(Boolean)
  return pathParts.at(-1) ?? withoutProperty
}

function createSourceBoneResolver(rig: HumanoidRig) {
  const exact = new Map<string, HumanoidBoneKey>()
  const normalized = new Map<string, HumanoidBoneKey>()

  for (const key of HUMANOID_BONE_KEYS) {
    const bone = rig[key]
    if (!bone) continue

    exact.set(bone.uuid, key)
    if (bone.name) {
      exact.set(bone.name, key)
      normalized.set(normalizeTrackBoneId(bone.name), key)
    }
  }

  return (trackName: string) => {
    const raw = animationTrackNodeId(trackName)
    return (
      exact.get(raw) ??
      normalized.get(normalizeTrackBoneId(raw))
    )
  }
}

function cloneQuaternionTrackForTarget(
  track: THREE.QuaternionKeyframeTrack,
  targetBone: THREE.Bone,
  values: ArrayLike<number> = track.values,
) {
  return new THREE.QuaternionKeyframeTrack(
    `${targetBone.uuid}.quaternion`,
    Array.from(track.times),
    Array.from(values),
  )
}

/**
 * The source and target are two runtime instances of the exact same body asset.
 * Only the Three.js UUIDs differ, so preserve the authored local quaternions
 * byte-for-byte and rewrite each track to the corresponding live bone UUID.
 */
export function remapSameRigHumanoidClips(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  clips: THREE.AnimationClip[],
) {
  sourceRoot.updateMatrixWorld(true)
  targetRoot.updateMatrixWorld(true)

  const source = mapHumanoidRig(sourceRoot).rig
  const target = mapHumanoidRig(targetRoot).rig
  const resolveSourceKey = createSourceBoneResolver(source)

  return clips
    .filter(
      (clip) =>
        !clip.name.toLowerCase().startsWith('qa_deformation'),
    )
    .map((clip) => {
      const tracks: THREE.KeyframeTrack[] = []

      for (const track of clip.tracks) {
        if (!(track instanceof THREE.QuaternionKeyframeTrack)) {
          continue
        }

        const key = resolveSourceKey(track.name)
        const targetBone = key ? target[key] : undefined
        if (!key || !targetBone) continue

        tracks.push(
          cloneQuaternionTrackForTarget(
            track,
            targetBone,
          ),
        )
      }

      return new THREE.AnimationClip(
        clip.name,
        clip.duration,
        tracks,
      )
    })
    .filter((clip) => clip.tracks.length > 0)
}

export function retargetForgeHumanoidClips(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  clips: THREE.AnimationClip[],
) {
  sourceRoot.updateMatrixWorld(true)
  targetRoot.updateMatrixWorld(true)

  const source = mapHumanoidRig(sourceRoot).rig
  const target = mapHumanoidRig(targetRoot).rig
  const resolveSourceKey = createSourceBoneResolver(source)

  return clips
    .filter(
      (clip) =>
        !clip.name.toLowerCase().startsWith('qa_deformation'),
    )
    .map((clip) => {
      const tracks: THREE.KeyframeTrack[] = []

      for (const track of clip.tracks) {
        if (!(track instanceof THREE.QuaternionKeyframeTrack)) {
          continue
        }

        const key = resolveSourceKey(track.name)
        const sourceBone = key ? source[key] : undefined
        const targetBone = key ? target[key] : undefined
        if (!sourceBone || !targetBone) continue

        const sourceRestInverse =
          sourceBone.quaternion.clone().invert()
        const targetRest = targetBone.quaternion.clone()
        const values = Array.from(track.values)
        const retargeted: number[] = []

        for (
          let index = 0;
          index + 3 < values.length;
          index += 4
        ) {
          const animated = new THREE.Quaternion(
            values[index],
            values[index + 1],
            values[index + 2],
            values[index + 3],
          )
          const delta = sourceRestInverse
            .clone()
            .multiply(animated)
          const result = targetRest
            .clone()
            .multiply(delta)
            .normalize()
          retargeted.push(
            result.x,
            result.y,
            result.z,
            result.w,
          )
        }

        tracks.push(
          cloneQuaternionTrackForTarget(
            track,
            targetBone,
            retargeted,
          ),
        )
      }

      return new THREE.AnimationClip(
        clip.name,
        clip.duration,
        tracks,
      )
    })
    .filter((clip) => clip.tracks.length > 0)
}

export function uniqueAnimationClips(
  clips: THREE.AnimationClip[],
) {
  const result = new Map<string, THREE.AnimationClip>()
  for (const clip of clips) {
    result.set(
      clip.name || `clip-${result.size}`,
      clip,
    )
  }
  return [...result.values()]
}
