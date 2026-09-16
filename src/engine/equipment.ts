import type { ForgeGameplayContent, ForgeItemDefinition } from './forgeProject'
import { itemClassification, type ForgeAuthoredItem, type ForgeItemEquipSlot } from './itemTaxonomy'

export const FORGE_EQUIPMENT_SLOTS = ['Head', 'Chest', 'Hands', 'MainHand', 'OffHand', 'Legs', 'Feet'] as const
export type ForgeEquipmentSlot = typeof FORGE_EQUIPMENT_SLOTS[number]
export type ForgeEquipmentState = Partial<Record<ForgeEquipmentSlot, string>>

export type ForgeEquipmentStats = {
  damageBonus: number
  defense: number
}

export function itemEquipmentSlot(item: ForgeItemDefinition): ForgeEquipmentSlot | undefined {
  const slot = itemClassification(item).equipSlot
  return slot === 'None' ? undefined : slot as ForgeEquipmentSlot
}

export function normalizeEquipment(value?: Partial<Record<ForgeItemEquipSlot, string>>, legacyWeaponId?: string): ForgeEquipmentState {
  const next: ForgeEquipmentState = {}
  for (const slot of FORGE_EQUIPMENT_SLOTS) {
    const itemId = value?.[slot]
    if (itemId) next[slot] = itemId
  }
  if (!next.MainHand && legacyWeaponId) next.MainHand = legacyWeaponId
  return next
}

export function equipmentItem(gameplay: ForgeGameplayContent, equipment: ForgeEquipmentState, slot: ForgeEquipmentSlot) {
  const id = equipment[slot]
  return id ? gameplay.items.find((item) => item.id === id) : undefined
}

export function equipmentStats(gameplay: ForgeGameplayContent, equipment: ForgeEquipmentState): ForgeEquipmentStats {
  let damageBonus = 0
  let defense = 0
  for (const slot of FORGE_EQUIPMENT_SLOTS) {
    const item = equipmentItem(gameplay, equipment, slot)
    if (!item) continue
    damageBonus += Math.max(0, Number(item.damageBonus) || 0)
    defense += Math.max(0, Number((item as ForgeAuthoredItem).defenseBonus) || 0)
  }
  return { damageBonus, defense }
}

export function equipItemIntoState(gameplay: ForgeGameplayContent, current: ForgeEquipmentState, item: ForgeItemDefinition) {
  const slot = itemEquipmentSlot(item)
  if (!slot) return { equipment: current, slot: undefined as ForgeEquipmentSlot | undefined }
  const next: ForgeEquipmentState = { ...current, [slot]: item.id }
  const classification = itemClassification(item)
  if (slot === 'MainHand' && isTwoHandedSubtype(classification.subtype)) delete next.OffHand
  if (slot === 'OffHand') {
    const mainHand = equipmentItem(gameplay, next, 'MainHand')
    if (mainHand && isTwoHandedSubtype(itemClassification(mainHand).subtype)) delete next.MainHand
  }
  return { equipment: next, slot }
}

export function isItemEquipped(equipment: ForgeEquipmentState | undefined, itemId: string) {
  return Boolean(equipment && FORGE_EQUIPMENT_SLOTS.some((slot) => equipment[slot] === itemId))
}

export function itemDefenseBonus(item: ForgeItemDefinition) {
  return Math.max(0, Number((item as ForgeAuthoredItem).defenseBonus) || 0)
}

export function itemRuntimeDescription(item: ForgeItemDefinition) {
  const classification = itemClassification(item)
  const damage = Math.max(0, Number(item.damageBonus) || 0)
  const defense = itemDefenseBonus(item)
  const stats = [damage ? `+${damage} damage` : '', defense ? `+${defense} defense` : ''].filter(Boolean).join(' · ')
  return `${item.rarity} ${taxonomyLabel(classification.subtype)}${stats ? ` · ${stats}` : ''}`
}

export function mitigateEquipmentDamage(rawDamage: number, defense: number) {
  if (defense <= 0) return Math.max(1, Math.round(rawDamage))
  return Math.max(1, Math.round(rawDamage * (100 / (100 + defense * 2))))
}

export function equipmentSlotLabel(slot: ForgeEquipmentSlot) {
  if (slot === 'MainHand') return 'Main Hand'
  if (slot === 'OffHand') return 'Off Hand'
  return slot
}

export function isTwoHandedItem(item: ForgeItemDefinition) {
  return isTwoHandedSubtype(itemClassification(item).subtype)
}

function isTwoHandedSubtype(subtype: string) {
  return subtype === 'bow' || subtype === 'staff' || subtype === 'spear'
}

function taxonomyLabel(value: string) {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
