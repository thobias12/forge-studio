import type { ForgeAbilityDefinition } from '../forgeProject'

export type ForgePlayerActionPhase = 'windup' | 'active' | 'recovery'

export const FORGE_GAMEPLAY_FEEL = Object.freeze({
  movement: Object.freeze({
    accelerateResponse: 22,
    stopResponse: 34,
    reverseResponse: 38,
    stopSpeed: 0.035,
    collisionStep: 0.2,
  }),
  attackMovement: Object.freeze({
    windup: 0.92,
    active: 0.86,
    recovery: 0.97,
  }),
  inputBufferSeconds: 0.14,
  dodgeDuration: 0.21,
  camera: Object.freeze({
    followResponse: 10.5,
    positionResponse: 12,
    zoomResponse: 12,
    velocityLookAhead: 0.105,
    aimLookAhead: 0.58,
  }),
})

export function forgeExpAlpha(response: number, delta: number) {
  if (!(delta > 0) || !(response > 0)) return 0
  return 1 - Math.exp(-response * delta)
}

export function forgeMovementResponse(
  currentX: number,
  currentZ: number,
  desiredX: number,
  desiredZ: number,
) {
  const currentSq = currentX * currentX + currentZ * currentZ
  const desiredSq = desiredX * desiredX + desiredZ * desiredZ
  if (desiredSq < 1e-6) return FORGE_GAMEPLAY_FEEL.movement.stopResponse
  if (currentSq < 1e-6) return FORGE_GAMEPLAY_FEEL.movement.accelerateResponse
  const dot = currentX * desiredX + currentZ * desiredZ
  return dot < 0
    ? FORGE_GAMEPLAY_FEEL.movement.reverseResponse
    : FORGE_GAMEPLAY_FEEL.movement.accelerateResponse
}

export function forgeAttackMovementMultiplier(
  phase?: ForgePlayerActionPhase,
) {
  if (!phase) return 1
  return FORGE_GAMEPLAY_FEEL.attackMovement[phase]
}

export function forgeAbilityTiming(ability: ForgeAbilityDefinition) {
  const primary = ability.input === 'primary'
  const windup = primary
    ? ability.kind === 'melee' ? 0.075 : 0.095
    : ability.kind === 'melee' ? 0.11 : 0.14
  const active = primary ? 0.04 : 0.055
  const cadence = primary
    ? Math.max(0.26, Math.min(0.62, ability.cooldown || 0.36))
    : ability.kind === 'melee' ? 0.4 : 0.46
  return {
    windup,
    active,
    recovery: Math.max(0.085, cadence - windup - active),
  }
}

export function forgeWheelDistanceTarget(
  currentTarget: number,
  deltaY: number,
  minDistance: number,
  maxDistance: number,
  step = 2,
) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return currentTarget
  return Math.max(
    minDistance,
    Math.min(maxDistance, currentTarget + Math.sign(deltaY) * step),
  )
}
