import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'

export type ForgeAdventurePlayerState = {
  health: number
  inventory: string[]
  equippedWeaponId?: string
  gold?: number
  xp?: number
  level?: number
}

export function mergeAdventurePlayerState(runtimeSaveKey: string, state: ForgeAdventurePlayerState) {
  const save = loadRuntimeSave(runtimeSaveKey)
  if (!save) return false
  writeRuntimeSave(runtimeSaveKey, {
    ...save,
    player: { ...save.player, health: Math.max(1, state.health) },
    inventory: [...state.inventory],
    equippedWeaponId: state.equippedWeaponId,
    gold: state.gold ?? save.gold ?? 0,
    xp: state.xp ?? save.xp ?? 0,
    level: state.level ?? save.level ?? 1,
    savedAt: new Date().toISOString(),
  })
  return true
}
