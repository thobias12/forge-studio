import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'

export type ForgeAdventurePlayerState = {
  health: number
  inventory: string[]
  equippedWeaponId?: string
}

export function mergeAdventurePlayerState(runtimeSaveKey: string, state: ForgeAdventurePlayerState) {
  const save = loadRuntimeSave(runtimeSaveKey)
  if (!save) return false
  writeRuntimeSave(runtimeSaveKey, {
    ...save,
    player: { ...save.player, health: Math.max(1, state.health) },
    inventory: [...state.inventory],
    equippedWeaponId: state.equippedWeaponId,
    savedAt: new Date().toISOString(),
  })
  return true
}
