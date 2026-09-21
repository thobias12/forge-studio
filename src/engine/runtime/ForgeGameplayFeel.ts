import type { ForgeAbilityDefinition } from '../forgeProject'

export type ForgePlayerActionPhase = 'windup' | 'active' | 'recovery'

export type ForgeMeleeComboProfile = {
  step: 0 | 1 | 2
  windup: number
  active: number
  recovery: number
  lunge: number
  damageMultiplier: number
  arcDot: number
  knockbackMultiplier: number
  hitStop: number
  cameraShake: number
  staggerSeconds: number
}

const MELEE_COMBO: readonly ForgeMeleeComboProfile[] = Object.freeze([
  Object.freeze({
    step: 0,
    windup: .075,
    active: .045,
    recovery: .16,
    lunge: .2,
    damageMultiplier: .82,
    arcDot: .52,
    knockbackMultiplier: .84,
    hitStop: .024,
    cameraShake: .14,
    staggerSeconds: .1,
  }),
  Object.freeze({
    step: 1,
    windup: .065,
    active: .045,
    recovery: .15,
    lunge: .27,
    damageMultiplier: .92,
    arcDot: .42,
    knockbackMultiplier: 1,
    hitStop: .03,
    cameraShake: .18,
    staggerSeconds: .125,
  }),
  Object.freeze({
    step: 2,
    windup: .09,
    active: .055,
    recovery: .195,
    lunge: .38,
    damageMultiplier: 1.16,
    arcDot: .3,
    knockbackMultiplier: 1.34,
    hitStop: .047,
    cameraShake: .28,
    staggerSeconds: .19,
  }),
])

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
  combat: Object.freeze({
    comboResetSeconds: .62,
    enemyRecoverySeconds: .18,
    enemyStaggerSeconds: .11,
    playerEnemySpacing: 1.28,
    enemyEnemySpacing: 1.38,
    lungeContactDistance: 1.24,
    meleeCombo: MELEE_COMBO,
  }),
  inputBufferSeconds: 0.18,
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

export function forgeMeleeComboProfile(step = 0) {
  const normalized = ((Math.round(step) % 3) + 3) % 3
  return FORGE_GAMEPLAY_FEEL.combat.meleeCombo[normalized]
}

export function forgeAbilityTiming(
  ability: ForgeAbilityDefinition,
  comboStep = 0,
) {
  const primary = ability.input === 'primary'
  if (primary && ability.kind === 'melee') {
    const combo = forgeMeleeComboProfile(comboStep)
    return {
      windup: combo.windup,
      active: combo.active,
      recovery: combo.recovery,
    }
  }

  const windup = primary
    ? 0.095
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

export function forgeAbilityActionCooldown(
  ability: ForgeAbilityDefinition,
  comboStep = 0,
) {
  if (ability.input === 'primary' && ability.kind === 'melee') {
    const combo = forgeMeleeComboProfile(comboStep)
    return Math.max(
      .05,
      combo.windup + combo.active + combo.recovery - .018,
    )
  }
  return Math.max(0, ability.cooldown)
}

export function forgeCanDodgeCancelAction(
  phase?: ForgePlayerActionPhase,
) {
  return !phase || phase === 'active' || phase === 'recovery'
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
