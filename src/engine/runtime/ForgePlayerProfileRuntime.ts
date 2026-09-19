// @ts-nocheck
import type { ForgeAnimationActionId, ForgeAnimationEvent } from '../animationBindings'
import type { ForgeCharacterBlueprint } from '../characterBlueprint'
import { playLibraryAudio } from './ForgeAnimationAudio'
import { bindCharacterBlueprint } from './ForgeBlueprintRuntime'
import { installForgeSkillRuntime } from './ForgeSkillRuntime'
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
      if (binding && !binding.getAnimationRuntimeV3?.() && this.preloadAbilityAnimations) {
        await this.preloadAbilityAnimations(binding)
      }
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
  installForgeSkillRuntime(RuntimeClass)
}

function wrapTimedAbility(proto: any) {
  const original = proto.performAbility
  if (typeof original !== 'function') return
  proto.performAbility = function (ability: any) {
    if (this.__forgeProfilePaused) return
    if ((this.cooldowns?.get?.(ability?.id) ?? 0) > 0 || this.playerHealth <= 0) return original.call(this, ability)

    const basicId = this.gameplay?.player?.basicAbility
    const action: ForgeAnimationActionId =
      ability?.id === basicId ? 'attackPrimary' : 'cast'
    const events =
      this.playerVisual
        ?.getAnimationRuntimeV3?.()
        ?.getEvents(action) ?? []
    const hitMarker = events.find((event) => event.kind === 'hit')
    const delayMs = Math.max(0, Number(hitMarker?.time ?? 0) * 1000)
    const markerPosition = abilityMarkerPosition(this, ability)

    const queuedDamage: Array<{ enemy: unknown; args: unknown[] }> = []
    const damageEnemy = this.damageEnemy
    const delayDamage = delayMs >= 12 && typeof damageEnemy === 'function'

    if (delayDamage) {
      this.damageEnemy = function (enemy: unknown, ...args: unknown[]) {
        queuedDamage.push({ enemy, args })
      }
    }

    try {
      original.call(this, ability)
    } finally {
      if (delayDamage) this.damageEnemy = damageEnemy
    }

    schedulePresentationEvents(this, events, markerPosition)

    if (!delayDamage || !queuedDamage.length) return
    window.setTimeout(() => {
      if (this.disposed || this.__forgeProfilePaused || this.playerHealth <= 0) return
      for (const hit of queuedDamage) {
        try { damageEnemy.call(this, hit.enemy, ...hit.args) } catch { /* target may have despawned during the windup */ }
      }
      this.emitState?.()
    }, delayMs)
  }
}

function schedulePresentationEvents(runtime: any, events: ForgeAnimationEvent[] = [], position: any) {
  for (const event of events ?? []) {
    if ((event.kind !== 'vfx' && event.kind !== 'sfx') || !event.assetId) continue
    const fire = () => {
      if (runtime.disposed || runtime.__forgeProfilePaused) return
      if (event.kind === 'vfx') {
        try { void runtime.spawnBoundVfx?.(event.assetId, position.clone ? position.clone() : position) } catch { /* authored VFX stays optional */ }
      } else {
        void playLibraryAudio(event.assetId, { volume: .9, playbackRate: .985 + Math.random() * .03 })
      }
    }
    const delay = Math.max(0, Number(event.time || 0) * 1000)
    if (delay < 12) fire()
    else window.setTimeout(fire, delay)
  }
}

function abilityMarkerPosition(runtime: any, ability: any) {
  const origin = runtime.player?.position?.clone?.()
  if (!origin) return runtime.player?.position
  const aim = runtime.mouseWorld?.clone?.().sub(origin).setY(0)
  if (!aim || aim.lengthSq() < .001) aim?.set?.(0, 0, -1)
  aim?.normalize?.()
  if (ability?.kind === 'melee') return origin.addScaledVector(aim, Math.max(1, Number(ability.range || 2) * .5))
  const distance = Math.min(Number(ability?.range || 6), runtime.mouseWorld?.distanceTo?.(origin) ?? Number(ability?.range || 6))
  return origin.addScaledVector(aim, distance)
}

function wrapNoopWhenPaused(proto: any, method: string) {
  const original = proto[method]
  if (typeof original !== 'function') return
  proto[method] = function (...args: unknown[]) {
    if (this.__forgeProfilePaused) return
    return original.apply(this, args)
  }
}
