import type { ForgeEquipmentSlot } from '../equipment'
import type { ForgeInventorySortMode } from '../inventoryPack'

export type SkillboundRuntimeCommandTarget = {
  equipItem?: (itemId: string) => void
  unequipItem?: (slot: ForgeEquipmentSlot) => boolean
  equipBest?: () => boolean
  moveInventoryItem?: (index: number, cell: number) => boolean
  sortInventory?: (mode: ForgeInventorySortMode) => boolean
  getSnapshot?: () => unknown
  saveGame?: (manual?: boolean) => void
  setPaused?: (paused: boolean) => void
}

let activeRuntime: SkillboundRuntimeCommandTarget | undefined

export function registerSkillboundRuntime(runtime: SkillboundRuntimeCommandTarget) {
  activeRuntime = runtime
  window.dispatchEvent(new CustomEvent('skillbound-runtime-ready'))
}

export function unregisterSkillboundRuntime(runtime: SkillboundRuntimeCommandTarget) {
  if (activeRuntime !== runtime) return
  activeRuntime = undefined
  window.dispatchEvent(new CustomEvent('skillbound-runtime-cleared'))
}

export function equipActiveSkillboundItem(itemId: string) {
  if (!activeRuntime?.equipItem) return false
  activeRuntime.equipItem(itemId)
  return true
}

export function unequipActiveSkillboundSlot(slot: ForgeEquipmentSlot) {
  if (!activeRuntime?.unequipItem) return false
  return activeRuntime.unequipItem(slot)
}

export function equipBestActiveSkillboundGear() {
  if (!activeRuntime?.equipBest) return false
  return activeRuntime.equipBest()
}

export function moveActiveSkillboundInventoryItem(
  index: number,
  cell: number,
) {
  if (!activeRuntime?.moveInventoryItem) return false
  return activeRuntime.moveInventoryItem(index, cell)
}

export function sortActiveSkillboundInventory(
  mode: ForgeInventorySortMode,
) {
  if (!activeRuntime?.sortInventory) return false
  return activeRuntime.sortInventory(mode)
}

export function saveActiveSkillboundRuntime() {
  if (!activeRuntime?.saveGame) return false
  activeRuntime.saveGame(true)
  return true
}

export function getActiveSkillboundRuntime() {
  return activeRuntime
}
