import * as THREE from 'three'
import {
  loadCharacterAssetScene,
  setSkillboundBaseClothingVisible,
  skillboundBodyTypeFromAsset,
} from '../../lib/characterAssetRegistry'
import { disposeForgeCharacter } from '../../lib/proceduralCharacter'
import { getAsset } from '../../lib/library'
import {
  blueprintToConfig,
  type ForgeCharacterBlueprint,
} from '../characterBlueprint'
import { createConceptForgeCharacter } from '../conceptCharacterV2'
import { createAnimationControllerV3 } from '../animationV3'
import { ForgeCharacterVisualBinding } from './ForgeAssetRuntime'

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

  // Generated clips are converted once into semantic V3 fallback animations.
  // Published .forgeanim actions override them explicitly by action ID.
  const fallback = createConceptForgeCharacter(
    blueprintToConfig(blueprint),
  )

  try {
    const controller = await createAnimationControllerV3({
      targetRoot: root,
      targetId: animationTargetId,
      fallbackSource: {
        root: fallback.root,
        clips: fallback.clips,
        sourceAssetId: `generated-blueprint:${blueprint.role}`,
      },
    })

    target.add(root)
    hidePlaceholder(target)

    const binding = new ForgeCharacterVisualBinding(root)
    binding.setAnimationRuntimeV3(controller)

    const foundationBodyType = skillboundBodyTypeFromAsset(asset)
    if (foundationBodyType === 'female') {
      binding.enableSubtleChestSecondaryMotion()
    }

    ;(
      binding as ForgeCharacterVisualBinding & {
        forgeAnimationRuntime?: 'v3'
        forgeFoundationBodyType?: 'male' | 'female'
      }
    ).forgeAnimationRuntime = 'v3'
    ;(
      binding as ForgeCharacterVisualBinding & {
        forgeFoundationBodyType?: 'male' | 'female'
      }
    ).forgeFoundationBodyType = foundationBodyType

    return binding
  } catch (error) {
    root.removeFromParent()
    disposeObject(root)
    throw error
  } finally {
    disposeForgeCharacter(fallback.root)
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
  const controller = await createAnimationControllerV3({
    targetRoot: root,
    targetId: animationTargetId,
    fallbackSource: {
      root,
      clips: build.clips,
      sourceAssetId: `generated-blueprint:${blueprint.role}`,
    },
  })
  binding.setAnimationRuntimeV3(controller)

  ;(
    binding as ForgeCharacterVisualBinding & {
      forgeAnimationRuntime?: 'v3'
    }
  ).forgeAnimationRuntime = 'v3'

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
