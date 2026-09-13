import * as THREE from 'three'
import type { MocapPolishQuality } from './mocapPolish'
import type { RetargetRuntime } from './retarget'

export type ModelFootLockState = {
  leftAnchor?: THREE.Vector3
  rightAnchor?: THREE.Vector3
  rootOrigin?: THREE.Vector3
  leftWasLocked: boolean
  rightWasLocked: boolean
}

export function createModelFootLockState(): ModelFootLockState {
  return { leftWasLocked: false, rightWasLocked: false }
}

export function resetModelFootLockState(state: ModelFootLockState) {
  state.leftAnchor = undefined
  state.rightAnchor = undefined
  state.rootOrigin = undefined
  state.leftWasLocked = false
  state.rightWasLocked = false
}

export function applyModelFootLocks(root: THREE.Object3D, runtime: RetargetRuntime, quality: MocapPolishQuality, state: ModelFootLockState, strength = 0.9) {
  if (!state.rootOrigin) state.rootOrigin = root.position.clone()

  const leftBone = runtime.rig.leftToes ?? runtime.rig.leftFoot
  const rightBone = runtime.rig.rightToes ?? runtime.rig.rightFoot
  const leftPos = leftBone?.getWorldPosition(new THREE.Vector3())
  const rightPos = rightBone?.getWorldPosition(new THREE.Vector3())

  if (quality.leftFootLocked && leftPos) {
    if (!state.leftWasLocked || !state.leftAnchor) state.leftAnchor = leftPos.clone()
  } else {
    state.leftAnchor = undefined
  }
  if (quality.rightFootLocked && rightPos) {
    if (!state.rightWasLocked || !state.rightAnchor) state.rightAnchor = rightPos.clone()
  } else {
    state.rightAnchor = undefined
  }

  state.leftWasLocked = quality.leftFootLocked
  state.rightWasLocked = quality.rightFootLocked

  const corrections: THREE.Vector3[] = []
  if (state.leftAnchor && leftPos) corrections.push(state.leftAnchor.clone().sub(leftPos))
  if (state.rightAnchor && rightPos) corrections.push(state.rightAnchor.clone().sub(rightPos))

  if (!corrections.length) {
    if (state.rootOrigin) {
      root.position.x = THREE.MathUtils.lerp(root.position.x, state.rootOrigin.x, 0.045)
      root.position.z = THREE.MathUtils.lerp(root.position.z, state.rootOrigin.z, 0.045)
      root.updateMatrixWorld(true)
    }
    return false
  }

  const delta = corrections.reduce((sum, value) => sum.add(value), new THREE.Vector3()).multiplyScalar(1 / corrections.length)
  const amount = THREE.MathUtils.clamp(strength, 0.45, 0.98)
  root.position.x += THREE.MathUtils.clamp(delta.x * amount, -0.065, 0.065)
  root.position.z += THREE.MathUtils.clamp(delta.z * amount, -0.065, 0.065)

  const maxDrift = 0.24
  root.position.x = THREE.MathUtils.clamp(root.position.x, state.rootOrigin.x - maxDrift, state.rootOrigin.x + maxDrift)
  root.position.z = THREE.MathUtils.clamp(root.position.z, state.rootOrigin.z - maxDrift, state.rootOrigin.z + maxDrift)
  root.updateMatrixWorld(true)
  return true
}
