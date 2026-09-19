import * as THREE from 'three'
import {
  HUMANOID_BONE_KEYS,
  mapHumanoidRig,
  type HumanoidBoneKey,
} from '../lib/retarget'

export function retargetForgeHumanoidClips(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  clips: THREE.AnimationClip[],
) {
  sourceRoot.updateMatrixWorld(true)
  targetRoot.updateMatrixWorld(true)

  const source = mapHumanoidRig(sourceRoot).rig
  const target = mapHumanoidRig(targetRoot).rig
  const sourceNameToKey = new Map<string, HumanoidBoneKey>()

  for (const key of HUMANOID_BONE_KEYS) {
    const bone = source[key]
    if (bone) sourceNameToKey.set(bone.name, key)
  }

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

        const sourceBoneName = track.name.replace(
          /\.quaternion$/i,
          '',
        )
        const key = sourceNameToKey.get(sourceBoneName)
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
          new THREE.QuaternionKeyframeTrack(
            `${targetBone.name}.quaternion`,
            Array.from(track.times),
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
