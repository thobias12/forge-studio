import * as THREE from 'three'
import { FORGE_WORLD_SCALE } from '../worldScale'
import {
  FORGE_GAMEPLAY_FEEL,
  forgeExpAlpha,
} from './ForgeGameplayFeel'

export function forgeGameplayCameraOffset(
  distance: number,
  target: THREE.Vector3,
) {
  return target.set(
    distance * FORGE_WORLD_SCALE.playCameraHorizontalScale,
    distance * FORGE_WORLD_SCALE.playCameraVerticalScale,
    distance * FORGE_WORLD_SCALE.playCameraHorizontalScale,
  )
}

export function forgeUpdateGameplayCamera(options: {
  camera: THREE.PerspectiveCamera
  focus: THREE.Vector3
  playerPosition: THREE.Vector3
  playerVelocity: THREE.Vector3
  mouseWorld?: THREE.Vector3
  pointerTracked?: boolean
  distance: number
  delta: number
  shake: number
  tempFocus: THREE.Vector3
  tempAim: THREE.Vector3
  tempOffset: THREE.Vector3
  now?: number
}) {
  const {
    camera,
    focus,
    playerPosition,
    playerVelocity,
    mouseWorld,
    pointerTracked = false,
    distance,
    delta,
    shake,
    tempFocus,
    tempAim,
    tempOffset,
  } = options

  const focusTarget = tempFocus.copy(playerPosition)
  focusTarget.addScaledVector(
    playerVelocity,
    FORGE_GAMEPLAY_FEEL.camera.velocityLookAhead,
  )

  if (pointerTracked && mouseWorld) {
    tempAim.copy(mouseWorld).sub(playerPosition).setY(0)
    if (tempAim.lengthSq() > .01) {
      tempAim
        .normalize()
        .multiplyScalar(FORGE_GAMEPLAY_FEEL.camera.aimLookAhead)
      focusTarget.add(tempAim)
    }
  }

  focusTarget.y = playerPosition.y
  focus.lerp(
    focusTarget,
    forgeExpAlpha(
      FORGE_GAMEPLAY_FEEL.camera.followResponse,
      delta,
    ),
  )

  const desired = forgeGameplayCameraOffset(
    distance,
    tempOffset,
  ).add(focus)

  if (shake > 0) {
    const strength = shake * .7
    const time = options.now ?? performance.now()
    desired.x += Math.sin(time * .061) * strength
    desired.y += Math.sin(time * .083) * strength * .45
    desired.z += Math.cos(time * .073) * strength
  }

  camera.position.lerp(
    desired,
    forgeExpAlpha(
      FORGE_GAMEPLAY_FEEL.camera.positionResponse,
      delta,
    ),
  )
  camera.lookAt(
    focus.x,
    focus.y + FORGE_WORLD_SCALE.playCameraLookAtHeight,
    focus.z,
  )
}

export function forgeSnapGameplayCamera(options: {
  camera: THREE.PerspectiveCamera
  focus: THREE.Vector3
  playerPosition: THREE.Vector3
  distance: number
  tempOffset: THREE.Vector3
}) {
  options.focus.copy(options.playerPosition)
  options.camera.position
    .copy(options.focus)
    .add(
      forgeGameplayCameraOffset(
        options.distance,
        options.tempOffset,
      ),
    )
  options.camera.lookAt(
    options.focus.x,
    options.focus.y + FORGE_WORLD_SCALE.playCameraLookAtHeight,
    options.focus.z,
  )
}
