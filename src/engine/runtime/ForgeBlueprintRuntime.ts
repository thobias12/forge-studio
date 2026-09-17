import * as THREE from 'three'
import { getAsset } from '../../lib/library'
import { animationBindingAssetId, animationPackAssetId, parseAnimationSet } from '../animationBindings'
import { blueprintToConfig, type ForgeCharacterBlueprint } from '../characterBlueprint'
import { createConceptForgeCharacter } from '../conceptCharacterV2'
import { ForgeCharacterVisualBinding, loadLibraryAnimationClips } from './ForgeAssetRuntime'

export async function bindCharacterBlueprint(
  target: THREE.Object3D,
  blueprint: ForgeCharacterBlueprint,
  desiredHeight = 1.95,
  animationTargetId?: string,
) {
  const build = createConceptForgeCharacter(blueprintToConfig(blueprint))
  const root = build.root
  normalize(root, desiredHeight)
  root.name = '__forge_bound_character'
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
  })
  target.add(root)
  const placeholder = target.getObjectByName('__forge_placeholder')
  if (placeholder) placeholder.visible = false

  const binding = new ForgeCharacterVisualBinding(root)
  let clips = build.clips.map((clip) => clip.clone())

  if (animationTargetId) {
    const bindingAsset = await getAsset(animationBindingAssetId(animationTargetId)).catch(() => undefined)
    if (bindingAsset) binding.setAnimationSet(await parseAnimationSet(bindingAsset.blob, animationTargetId))

    const authored = await loadLibraryAnimationClips(animationPackAssetId(animationTargetId)).catch(() => [])
    if (authored.length) clips = [...clips, ...authored]
  }

  binding.setAnimations(clips)
  return binding
}

function normalize(root: THREE.Object3D, desiredHeight: number) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  if (size.y > .001) root.scale.multiplyScalar(desiredHeight / size.y)
  root.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(root)
  const center = fitted.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= fitted.min.y
  root.updateMatrixWorld(true)
}
