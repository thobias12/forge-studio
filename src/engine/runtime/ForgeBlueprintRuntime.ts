import * as THREE from 'three'
import {
  loadCharacterAssetScene,
  setSkillboundBaseClothingVisible,
  skillboundBodyTypeFromAsset,
} from '../../lib/characterAssetRegistry'
import { disposeForgeCharacter } from '../../lib/proceduralCharacter'
import {
  HUMANOID_BONE_KEYS,
  mapHumanoidRig,
  type HumanoidBoneKey,
} from '../../lib/retarget'
import { getAsset } from '../../lib/library'
import {
  animationBindingAssetId,
  animationPackAssetId,
  parseAnimationSet,
  type ForgeAnimationSet,
} from '../animationBindings'
import {
  blueprintToConfig,
  type ForgeCharacterBlueprint,
} from '../characterBlueprint'
import { createConceptForgeCharacter } from '../conceptCharacterV2'
import {
  ForgeCharacterVisualBinding,
  loadLibraryAnimationClips,
} from './ForgeAssetRuntime'

export async function bindCharacterBlueprint(
  target: THREE.Object3D,
  blueprint: ForgeCharacterBlueprint,
  desiredHeight = 1.95,
  animationTargetId?: string,
) {
  const foundation = await bindSkillboundFoundation(
    target,
    blueprint,
    desiredHeight,
    animationTargetId,
  ).catch(() => undefined)
  if (foundation) return foundation

  return await bindProceduralBlueprint(
    target,
    blueprint,
    desiredHeight,
    animationTargetId,
  )
}

async function bindSkillboundFoundation(
  target: THREE.Object3D,
  blueprint: ForgeCharacterBlueprint,
  desiredHeight: number,
  animationTargetId?: string,
) {
  const assetId = blueprint.foundation?.bodyAssetId
  if (!assetId) return undefined

  const asset = await getAsset(assetId).catch(() => undefined)
  if (!asset || !skillboundBodyTypeFromAsset(asset)) return undefined

  const loaded = await loadCharacterAssetScene(asset.blob)
  const root = loaded.scene
  root.name = '__forge_bound_character'
  normalize(root, desiredHeight)
  setSkillboundBaseClothingVisible(
    root,
    blueprint.foundation?.baseClothingVisible ?? true,
  )
  prepareRuntimeMeshes(root)

  const source = createConceptForgeCharacter(
    blueprintToConfig(blueprint),
  )

  try {
    let clips = retargetClipsToSkillboundRig(
      source.root,
      root,
      source.clips,
    )

    let authoredSet: ForgeAnimationSet | undefined
    if (animationTargetId) {
      const bindingAsset = await getAsset(
        animationBindingAssetId(animationTargetId),
      ).catch(() => undefined)
      authoredSet = bindingAsset
        ? await parseAnimationSet(
            bindingAsset.blob,
            animationTargetId,
          )
        : undefined

      const authored = await loadLibraryAnimationClips(
        animationPackAssetId(animationTargetId),
      ).catch(() => [])
      if (authored.length) {
        clips = uniqueClips([
          ...clips,
          ...retargetClipsToSkillboundRig(
            source.root,
            root,
            authored,
          ),
        ])
      }
    }

    target.add(root)
    hidePlaceholder(target)

    const binding = new ForgeCharacterVisualBinding(root)
    if (authoredSet) binding.setAnimationSet(authoredSet)
    ;(
      binding as ForgeCharacterVisualBinding & {
        forgeAnimationSet?: ForgeAnimationSet
        forgeFoundationBodyType?: 'male' | 'female'
      }
    ).forgeAnimationSet = authoredSet
    ;(
      binding as ForgeCharacterVisualBinding & {
        forgeFoundationBodyType?: 'male' | 'female'
      }
    ).forgeFoundationBodyType =
      skillboundBodyTypeFromAsset(asset)

    binding.setAnimations(clips)
    return binding
  } catch (error) {
    root.removeFromParent()
    disposeObject(root)
    throw error
  } finally {
    disposeForgeCharacter(source.root)
  }
}

async function bindProceduralBlueprint(
  target: THREE.Object3D,
  blueprint: ForgeCharacterBlueprint,
  desiredHeight: number,
  animationTargetId?: string,
) {
  const build = createConceptForgeCharacter(
    blueprintToConfig(blueprint),
  )
  const root = build.root
  normalize(root, desiredHeight)
  root.name = '__forge_bound_character'
  prepareRuntimeMeshes(root)
  target.add(root)
  hidePlaceholder(target)

  const binding = new ForgeCharacterVisualBinding(root)
  let clips = build.clips.map((clip) => clip.clone())
  let authoredSet: ForgeAnimationSet | undefined

  if (animationTargetId) {
    const bindingAsset = await getAsset(
      animationBindingAssetId(animationTargetId),
    ).catch(() => undefined)
    authoredSet = bindingAsset
      ? await parseAnimationSet(
          bindingAsset.blob,
          animationTargetId,
        )
      : undefined
    if (authoredSet) binding.setAnimationSet(authoredSet)

    const authored = await loadLibraryAnimationClips(
      animationPackAssetId(animationTargetId),
    ).catch(() => [])
    if (authored.length) clips = [...clips, ...authored]
  }

  ;(
    binding as ForgeCharacterVisualBinding & {
      forgeAnimationSet?: ForgeAnimationSet
    }
  ).forgeAnimationSet = authoredSet
  binding.setAnimations(clips)
  return binding
}

function retargetClipsToSkillboundRig(
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

function prepareRuntimeMeshes(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    child.frustumCulled = false
  })
}

function hidePlaceholder(target: THREE.Object3D) {
  const placeholder = target.getObjectByName(
    '__forge_placeholder',
  )
  if (placeholder) placeholder.visible = false
}

function normalize(
  root: THREE.Object3D,
  desiredHeight: number,
) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  if (size.y > .001) {
    root.scale.multiplyScalar(desiredHeight / size.y)
  }
  root.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(root)
  const center = fitted.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= fitted.min.y
  root.updateMatrixWorld(true)
}

function uniqueClips(clips: THREE.AnimationClip[]) {
  const result = new Map<string, THREE.AnimationClip>()
  for (const clip of clips) {
    result.set(
      clip.name || `clip-${result.size}`,
      clip,
    )
  }
  return [...result.values()]
}

function disposeObject(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry?.dispose()
    const list = Array.isArray(child.material)
      ? child.material
      : [child.material]
    list.forEach((material) => {
      if (material) materials.add(material)
    })
  })
  materials.forEach((material) => material.dispose())
}
