import type { ForgeItemDefinition } from '../forgeProject'
import type { ForgeEquipmentState } from '../equipment'
import type { ForgeInventoryPackLayout } from '../inventoryPack'

export type ForgeRuntimeLootSave = {
  id: string
  itemId: string
  x: number
  z: number
}

export type ForgeRuntimeSave = {
  format: 'forge-runtime-save'
  version: 1
  projectId: string
  regionId: string
  worldSeed: number
  generationVersion: number
  player: { x: number; z: number; health: number }
  inventory: string[]
  generatedItems?: ForgeItemDefinition[]
  lootRollIndex?: number
  inventoryLayout?: ForgeInventoryPackLayout
  equippedWeaponId?: string
  equipment?: ForgeEquipmentState
  defeatedEnemyIds: string[]
  usedInteractionIds?: string[]
  lootDrops: ForgeRuntimeLootSave[]
  gold?: number
  xp?: number
  level?: number
  mana?: number
  maxMana?: number
  savedAt: string
}

export function runtimeSaveKey(projectId: string, regionId: string, worldSeed: number, generationVersion: number) {
  return `forge-runtime-save:${projectId}:v1:${regionId}:${worldSeed}:${generationVersion}`
}

export function loadRuntimeSave(key: string): ForgeRuntimeSave | undefined {
  const value = localStorage.getItem(key)
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as ForgeRuntimeSave
    if (parsed.format !== 'forge-runtime-save' || parsed.version !== 1) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function writeRuntimeSave(key: string, save: ForgeRuntimeSave) {
  localStorage.setItem(key, JSON.stringify(save))
}

export function clearRuntimeSave(key: string) {
  localStorage.removeItem(key)
}
