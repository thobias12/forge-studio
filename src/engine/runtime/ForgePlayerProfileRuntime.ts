// @ts-nocheck
import type { ForgeAnimationSet } from '../animationBindings'
import type { ForgeCharacterBlueprint } from '../characterBlueprint'
import { bindCharacterBlueprint } from './ForgeBlueprintRuntime'
import { registerSkillboundRuntime, unregisterSkillboundRuntime } from './SkillboundRuntimeBridge'

const installed = new WeakSet<object>()

export function installPlayerProfileRuntime(RuntimeClass: { prototype: any }) {
  if (installed.has(RuntimeClass.prototype)) return
  installed.add(RuntimeClass.prototype)
  const proto = RuntimeClass.prototype

  const originalBindPlayerVisual = proto.bindPlayerVisual
  proto.bindPlayerVisual = async function () {
    registerSkillboundRuntime(this)
    const blueprint = this.options?.characterBlueprint as ForgeCharacterBlueprint | undefined
    if (!blueprint) return originalBindPlayerVisual.call(this)
    try {
      const animationTargetId = this.options?.animationTargetId ?? blueprint.targetAssetId
      const binding = await bindCharacterBlueprint(this.player, blueprint, 1.95, animationTargetId)
      if (this.disposed) { binding.dispose(); return }
      this.playerVisual = binding
      if (binding && this.preloadAbilityAnimations) await this.preloadAbilityAnimations(binding)
      if (!this.disposed && this.refreshEquippedModel) void this.refreshEquippedModel()
    } catch {
      return originalBindPlayerVisual.call(this)
    }
  }

  const originalDispose = proto.dispose
  if (typeof originalDispose === 'function') {
    proto.dispose = function (...args: unknown[]) {
      unregisterSkillboundRuntime(this)
      return originalDispose.apply(this, args)
    }
  }

  proto.setPaused = function (paused: boolean) {
    this.__forgeProfilePaused = paused
    this.keys?.clear?.()
  }

  wrapNoopWhenPaused(proto, 'updateCooldowns')
  wrapNoopWhenPaused(proto, 'activateEncounters')
  wrapNoopWhenPaused(proto, 'updatePlayer')
  wrapNoopWhenPaused(proto, 'updateEnemies')
  wrapNoopWhenPaused(proto, 'updateLoot')
  wrapNoopWhenPaused(proto, 'startDodge')
  wrapTimedAbility(proto)
}

function wrapTimedAbility(proto: any) {
  const original = proto.performAbility
  if (typeof original !== 'function') return
  proto.performAbility = function (ability: any) {
    if (this.__forgeProfilePaused) return

    const set = this.playerVisual?.forgeAnimationSet as ForgeAnimationSet | undefined
    const basicId = this.gameplay?.player?.basicAbility
    const action = ability?.id === basicId ? 'attackPrimary' : 'cast'
    const hitMarker = set?.actions?.[action]?.events?.find((event) => event.kind === 'hit')
    const delayMs = Math.max(0, Number(hitMarker?.time ?? 0) * 1000)
    if (delayMs < 12) return original.call(this, ability)

    const queuedDamage: Array<{ enemy: unknown; args: unknown[] }> = []
    const damageEnemy = this.damageEnemy
    if (typeof damageEnemy !== 'function') return original.call(this, ability)

    this.damageEnemy = function (enemy: unknown, ...args: unknown[]) {
      queuedDamage.push({ enemy, args })
    }
    try {
      original.call(this, ability)
    } finally {
      this.damageEnemy = damageEnemy
    }

    if (!queuedDamage.length) return
    window.setTimeout(() => {
      if (this.disposed || this.playerHealth <= 0) return
      for (const hit of queuedDamage) {
        try { damageEnemy.call(this, hit.enemy, ...hit.args) } catch { /* target may have despawned during the windup */ }
      }
      this.emitState?.()
    }, delayMs)
  }
}

function wrapNoopWhenPaused(proto: any, method: string) {
  const original = proto[method]
  if (typeof original !== 'function') return
  proto[method] = function (...args: unknown[]) {
    if (this.__forgeProfilePaused) return
    return original.apply(this, args)
  }
}
