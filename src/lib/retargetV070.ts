import * as THREE from 'three'
import { createRetargetRuntime as createRetargetRuntimeV067 } from './retargetV067'

export * from './retargetV067'

/**
 * Retargeting must stay in the character's authored coordinate system. Rotating
 * the model root before rest-pose capture makes torso basis solving fight the
 * display correction as soon as live mocap starts. Keep the rig untouched here
 * and let the viewport choose which side of the character to view instead.
 */
export function createRetargetRuntime(root: THREE.Object3D) {
  return createRetargetRuntimeV067(root)
}

/**
 * Returns the yaw the mocap preview camera should orbit around the character.
 * Concept Forge 2 authored characters face the opposite axis from the original
 * Forge mannequin, while imported third-party rigs keep the legacy camera unless
 * they explicitly provide mocapFacingYaw metadata.
 */
export function getMocapPreviewFacingYaw(root: THREE.Object3D) {
  let authoredYaw: number | undefined
  let isConceptForgeV2 = false

  root.traverse((object) => {
    const metadata = object.userData?.forgeCharacter as { conceptForgeVersion?: number; mocapFacingYaw?: number } | undefined
    if (!metadata) return
    if (Number.isFinite(metadata.mocapFacingYaw)) authoredYaw = Number(metadata.mocapFacingYaw)
    if (Number(metadata.conceptForgeVersion) >= 2) isConceptForgeV2 = true
  })

  return authoredYaw ?? (isConceptForgeV2 ? Math.PI : 0)
}
