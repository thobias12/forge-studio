import * as THREE from 'three'
import type { MocapPolishQuality } from './mocapPolish'
import type { RetargetRuntime } from './retarget'

export type ModelFootLockState = {
  leftAnchor?: THREE.Vector3
  rightAnchor?: THREE.Vector3
  leftWasLocked: boolean
  rightWasLocked: boolean
}

export function createModelFootLockState(): ModelFootLockState {
  return { leftWasLocked: false, rightWasLocked: false }
}

export function resetModelFootLockState(state: ModelFootLockState) {
  state.leftAnchor = undefined
  state.rightAnchor = undefined
  state.leftWasLocked = false
  state.rightWasLocked = false
}

export function applyModelFootLocks(root: THREE.Object3D, runtime: RetargetRuntime, quality: MocapPolishQuality, state: ModelFootLockState, strength = 0.9) {
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
  if (!corrections.length) return false

  const delta = corrections.reduce((sum, value) => sum.add(value), new THREE.Vector3()).multiplyScalar(1 / corrections.length)
  const amount = THREE.MathUtils.clamp(strength, 0.45, 0.98)
  root.position.x += THREE.MathUtils.clamp(delta.x * amount, -0.09, 0.09)
  root.position.z += THREE.MathUtils.clamp(delta.z * amount, -0.09, 0.09)
  root.updateMatrixWorld(true)
  return true
}
