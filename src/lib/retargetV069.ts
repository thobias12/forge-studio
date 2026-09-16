import * as THREE from 'three'
import { createRetargetRuntime as createRetargetRuntimeV067 } from './retargetV067'

export * from './retargetV067'

/**
 * Normalizes authored Forge characters to the mocap camera convention before
 * their rest pose is captured. Concept Forge 2 characters use the opposite
 * forward axis to the original mocap mannequin, so without this correction
 * they appear to turn away from the performer.
 */
export function createRetargetRuntime(root: THREE.Object3D) {
  normalizeForgeMocapFacing(root)
  return createRetargetRuntimeV067(root)
}

function normalizeForgeMocapFacing(root: THREE.Object3D) {
  const marker = '__forgeRetargetFacingNormalized'
  if (root.userData?.[marker]) return

  let authoredYaw: number | undefined
  let isConceptForgeV2 = false
  root.traverse((object) => {
    const metadata = object.userData?.forgeCharacter as { conceptForgeVersion?: number; mocapFacingYaw?: number } | undefined
    if (!metadata) return
    if (Number.isFinite(metadata.mocapFacingYaw)) authoredYaw = Number(metadata.mocapFacingYaw)
    if (Number(metadata.conceptForgeVersion) >= 2) isConceptForgeV2 = true
  })

  const yaw = authoredYaw ?? (isConceptForgeV2 ? Math.PI : 0)
  if (Math.abs(yaw) > 1e-5) {
    root.rotateY(yaw)
    root.updateMatrixWorld(true)
  }

  Object.defineProperty(root.userData, marker, {
    value: true,
    enumerable: false,
    configurable: true,
  })
}
