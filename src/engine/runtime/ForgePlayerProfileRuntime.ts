// @ts-nocheck
import type { ForgeCharacterBlueprint } from '../characterBlueprint'
import { bindCharacterBlueprint } from './ForgeBlueprintRuntime'

const installed = new WeakSet<object>()

export function installPlayerProfileRuntime(RuntimeClass: { prototype: any }) {
  if (installed.has(RuntimeClass.prototype)) return
  installed.add(RuntimeClass.prototype)
  const proto = RuntimeClass.prototype

  const originalBindPlayerVisual = proto.bindPlayerVisual
  proto.bindPlayerVisual = async function () {
    const blueprint = this.options?.characterBlueprint as ForgeCharacterBlueprint | undefined
    if (!blueprint) return originalBindPlayerVisual.call(this)
    try {
      const binding = bindCharacterBlueprint(this.player, blueprint, 1.95)
      if (this.disposed) { binding.dispose(); return }
      this.playerVisual = binding
      if (binding && this.preloadAbilityAnimations) await this.preloadAbilityAnimations(binding)
      if (!this.disposed && this.refreshEquippedModel) void this.refreshEquippedModel()
    } catch {
      return originalBindPlayerVisual.call(this)
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
  wrapNoopWhenPaused(proto, 'performAbility')
}

function wrapNoopWhenPaused(proto: any, method: string) {
  const original = proto[method]
  if (typeof original !== 'function') return
  proto[method] = function (...args: unknown[]) {
    if (this.__forgeProfilePaused) return
    return original.apply(this, args)
  }
}
