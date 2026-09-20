import type { ForgeItemDefinition } from '../forgeProject'
import type { ForgeEquipmentState } from '../equipment'
import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'

export type ForgeAdventurePlayerState = {
  health: number
  inventory: string[]
  generatedItems?: ForgeItemDefinition[]
  equippedWeaponId?: string
  equipment?: ForgeEquipmentState
  gold?: number
  xp?: number
  level?: number
  mana?: number
  maxMana?: number
}

export function mergeAdventurePlayerState(runtimeSaveKey: string, state: ForgeAdventurePlayerState) {
  const save = loadRuntimeSave(runtimeSaveKey)
  if (!save) return false
  writeRuntimeSave(runtimeSaveKey, {
    ...save,
    player: { ...save.player, health: Math.max(1, state.health) },
    inventory: [...state.inventory],
    generatedItems: [...new Map([...(save.generatedItems ?? []), ...(state.generatedItems ?? [])].map(item => [item.id, item])).values()],
    equippedWeaponId: state.equipment?.MainHand ?? state.equippedWeaponId,
    equipment: state.equipment ? { ...state.equipment } : save.equipment,
    gold: state.gold ?? save.gold ?? 0,
    xp: state.xp ?? save.xp ?? 0,
    level: state.level ?? save.level ?? 1,
    mana: state.mana ?? save.mana,
    maxMana: state.maxMana ?? save.maxMana,
    savedAt: new Date().toISOString(),
  })
  return true
}
