import * as THREE from 'three'
import {
  loadCharacterAssetScene,
  setSkillboundBaseClothingVisible,
  skillboundBodyTypeFromAsset,
} from '../../lib/characterAssetRegistry'
import { disposeForgeCharacter } from '../../lib/proceduralCharacter'
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
  retargetForgeHumanoidClips,
  uniqueAnimationClips,
} from '../skillboundCharacterAnimation'
import {
  ForgeCharacterVisualBinding,
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
  let authoredSource: THREE.Object3D | undefined

  try {
    let clips = retargetForgeHumanoidClips(
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

      const packAsset = await getAsset(
        animationPackAssetId(animationTargetId),
      ).catch(() => undefined)
      const authoredLoaded = packAsset
        ? await loadCharacterAssetScene(packAsset.blob).catch(() => undefined)
        : undefined
      const authored = authoredLoaded?.animations.map((clip) => clip.clone()) ?? []
      authoredSource = authoredLoaded?.scene

      if (authored.length && authoredSource) {
        // Even when the authored pack came from the same library body asset,
        // it is a separate GLTF instance with different runtime UUIDs. Always
        // remap through the pack's source skeleton so every authored bone track
        // (arms included) binds by humanoid bone identity onto the live body.
        clips = uniqueAnimationClips([
          ...clips,
          ...retargetForgeHumanoidClips(
            authoredSource,
            root,
            authored,
          ),
        ])
      }
    }

    target.add(root)
    hidePlaceholder(target)

    const binding = new ForgeCharacterVisualBinding(root)
    const foundationBodyType =
      skillboundBodyTypeFromAsset(asset)
    if (foundationBodyType === 'female') {
      binding.enableSubtleChestSecondaryMotion()
    }
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
    ).forgeFoundationBodyType = foundationBodyType

    binding.setAnimations(clips)
    return binding
  } catch (error) {
    root.removeFromParent()
    disposeObject(root)
    throw error
  } finally {
    if (authoredSource) disposeObject(authoredSource)
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

    const packAsset = await getAsset(
      animationPackAssetId(animationTargetId),
    ).catch(() => undefined)
    const authoredLoaded = packAsset
      ? await loadCharacterAssetScene(packAsset.blob).catch(() => undefined)
      : undefined
    const authored = authoredLoaded?.animations.map((clip) => clip.clone()) ?? []
    if (authored.length && authoredLoaded?.scene) {
      clips = uniqueAnimationClips([
        ...clips,
        ...retargetForgeHumanoidClips(
          authoredLoaded.scene,
          root,
          authored,
        ),
      ])
    }
    if (authoredLoaded?.scene) disposeObject(authoredLoaded.scene)
  }

  ;(
    binding as ForgeCharacterVisualBinding & {
      forgeAnimationSet?: ForgeAnimationSet
    }
  ).forgeAnimationSet = authoredSet
  binding.setAnimations(clips)
  return binding
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
