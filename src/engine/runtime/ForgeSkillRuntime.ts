// @ts-nocheck
import type { ForgeAbilityDefinition } from '../forgeProject'
import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'
import { playLibraryAudio } from './ForgeAnimationAudio'

export type ForgeSkillSnapshotExtension = {
  mana: number
  maxMana: number
  manaRegen: number
  hotbarAbilityIds: string[]
  hotbarCooldowns: number[]
}

const installed = new WeakSet<object>()

export function installForgeSkillRuntime(RuntimeClass: { prototype: any }) {
  const proto = RuntimeClass.prototype
  if (installed.has(proto)) return
  installed.add(proto)

  const originalGetSkillAbility = proto.getSkillAbility
  if (typeof originalGetSkillAbility === 'function') {
    proto.getSkillAbility = function (...args: unknown[]) {
      const first = hotbarIds(this)[0]
      if (first) {
        const ability = this.gameplay?.abilities?.find?.((candidate: ForgeAbilityDefinition) => candidate.id === first)
        if (ability) return ability
      }
      return originalGetSkillAbility.apply(this, args)
    }
  }

  const originalCooldowns = proto.updateCooldowns
  if (typeof originalCooldowns === 'function') {
    proto.updateCooldowns = function (delta: number, ...args: unknown[]) {
      ensureHotbarInput(this)
      const result = originalCooldowns.call(this, delta, ...args)
      if (!this.__forgeProfilePaused) {
        ensureMana(this)
        const regen = playerManaRegen(this)
        if (regen > 0 && this.__forgeMana < this.__forgeMaxMana) {
          this.__forgeMana = Math.min(this.__forgeMaxMana, this.__forgeMana + regen * Math.max(0, delta || 0))
        }
      }
      return result
    }
  }

  const originalAbility = proto.performAbility
  if (typeof originalAbility === 'function') {
    proto.performAbility = function (ability: ForgeAbilityDefinition, ...args: unknown[]) {
      if (!ability || this.__forgeProfilePaused) return
      ensureMana(this)
      const cooldown = Number(this.cooldowns?.get?.(ability.id) ?? 0)
      if (cooldown > 0.001 || Number(this.playerHealth ?? 1) <= 0) return

      const cost = abilityManaCost(this, ability)
      if (cost > this.__forgeMana + 0.001) {
        this.setMessage?.(`Not enough mana · ${Math.ceil(cost)} required`, 1.8)
        this.emitState?.()
        return false
      }

      this.__forgeMana = Math.max(0, this.__forgeMana - cost)
      const result = originalAbility.call(this, ability, ...args)
      if (ability.sfxAssetId) void playLibraryAudio(ability.sfxAssetId, { volume: .88 })
      this.emitState?.()
      return result ?? true
    }
  }

  const originalSnapshot = proto.makeSnapshot
  if (typeof originalSnapshot === 'function') {
    proto.makeSnapshot = function (...args: unknown[]) {
      ensureHotbarInput(this)
      const base = originalSnapshot.apply(this, args)
      ensureMana(this)
      const ids = hotbarIds(this)
      return {
        ...base,
        mana: this.__forgeMana,
        maxMana: this.__forgeMaxMana,
        manaRegen: playerManaRegen(this),
        hotbarAbilityIds: ids,
        hotbarCooldowns: ids.map((id) => Number(this.cooldowns?.get?.(id) ?? 0)),
      }
    }
  }

  const originalPlayerState = proto.playerState
  if (typeof originalPlayerState === 'function') {
    proto.playerState = function (...args: unknown[]) {
      ensureMana(this)
      return { ...originalPlayerState.apply(this, args), mana: this.__forgeMana, maxMana: this.__forgeMaxMana }
    }
  }

  const originalSave = proto.saveGame
  if (typeof originalSave === 'function') {
    proto.saveGame = function (...args: unknown[]) {
      ensureMana(this)
      const result = originalSave.apply(this, args)
      if (this.saveKey) {
        const save = loadRuntimeSave(this.saveKey)
        if (save) writeRuntimeSave(this.saveKey, { ...save, mana: this.__forgeMana, maxMana: this.__forgeMaxMana })
      }
      return result
    }
  }

  const originalDispose = proto.dispose
  if (typeof originalDispose === 'function') {
    proto.dispose = function (...args: unknown[]) {
      if (this.__forgeSkillKeyHandler) window.removeEventListener('keydown', this.__forgeSkillKeyHandler, true)
      this.__forgeSkillKeyHandler = undefined
      return originalDispose.apply(this, args)
    }
  }

  proto.setManaState = function (mana?: number, maxMana?: number) {
    const configured = Math.max(1, Number(maxMana ?? this.gameplay?.player?.maxMana ?? this.playerDefinition?.maxMana ?? 100))
    this.__forgeMaxMana = configured
    this.__forgeMana = clampMana(Number.isFinite(Number(mana)) ? Number(mana) : configured, configured)
    this.emitState?.()
  }

  proto.useAbilitySlot = function (index: number) {
    const ids = hotbarIds(this)
    const slot = Math.max(0, Math.floor(index))
    const id = ids[slot]
    if (!id) {
      this.setMessage?.(`Skill slot ${slot + 1} is empty. Assign it in Skill Forge.`, 1.8)
      this.emitState?.()
      return false
    }
    const ability = this.gameplay?.abilities?.find?.((candidate: ForgeAbilityDefinition) => candidate.id === id)
    if (!ability) return false
    return this.performAbility?.(ability) ?? false
  }
}

export function abilityManaCost(runtime: any, ability: ForgeAbilityDefinition) {
  const explicit = Number(ability.manaCost)
  if (Number.isFinite(explicit)) return Math.max(0, explicit)
  const basicId = runtime.playerDefinition?.basicAbility ?? runtime.gameplay?.player?.basicAbility
  return ability.id === basicId ? 0 : 12
}

function hotbarIds(runtime: any) {
  const player = runtime.playerDefinition ?? runtime.gameplay?.player
  const configured = Array.isArray(player?.hotbar) ? player.hotbar : player?.activeAbilities
  const ids = Array.isArray(configured) ? configured.filter((id: unknown) => typeof id === 'string').slice(0, 5) : []
  while (ids.length < 5) ids.push('')
  return ids
}

function ensureMana(runtime: any) {
  if (Number.isFinite(runtime.__forgeMana) && Number.isFinite(runtime.__forgeMaxMana)) return
  const configuredMax = Math.max(1, Number(runtime.gameplay?.player?.maxMana ?? runtime.playerDefinition?.maxMana ?? 100))
  let savedMana: number | undefined
  let savedMax: number | undefined
  if (runtime.saveKey) {
    const save = loadRuntimeSave(runtime.saveKey)
    savedMana = Number.isFinite(Number(save?.mana)) ? Number(save?.mana) : undefined
    savedMax = Number.isFinite(Number(save?.maxMana)) ? Number(save?.maxMana) : undefined
  }
  runtime.__forgeMaxMana = Math.max(1, savedMax ?? configuredMax)
  runtime.__forgeMana = clampMana(savedMana ?? runtime.__forgeMaxMana, runtime.__forgeMaxMana)
}

function ensureHotbarInput(runtime: any) {
  if (runtime.__forgeSkillKeyHandler || typeof window === 'undefined') return
  const handler = (event: KeyboardEvent) => {
    if (runtime.disposed || runtime.__forgeProfilePaused || event.repeat || isTextInput(event.target)) return
    const index = Number(event.key) - 1
    if (!Number.isInteger(index) || index < 0 || index > 4) return
    runtime.useAbilitySlot?.(index)
    event.preventDefault()
    event.stopPropagation()
  }
  runtime.__forgeSkillKeyHandler = handler
  window.addEventListener('keydown', handler, true)
}

function playerManaRegen(runtime: any) {
  const value = Number(runtime.gameplay?.player?.manaRegen ?? runtime.playerDefinition?.manaRegen ?? 14)
  return Number.isFinite(value) ? Math.max(0, value) : 14
}

function isTextInput(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable
}

function clampMana(value: number, max: number) {
  if (!Number.isFinite(value)) return max
  return Math.max(0, Math.min(max, value))
}
