import type { ForgeItemDefinition } from './forgeProject'

export type ForgeItemType = 'weapon' | 'armor' | 'offhand' | 'consumable' | 'material' | 'quest' | 'misc'
export type ForgeWeaponSubtype = 'sword' | 'dagger' | 'axe' | 'mace' | 'staff' | 'spear' | 'bow' | 'pickaxe' | 'hatchet' | 'sickle'
export type ForgeArmorSubtype = 'helmet' | 'chest' | 'gloves' | 'legs' | 'boots' | 'cloak' | 'waist'
export type ForgeOffhandSubtype = 'shield' | 'focus'
export type ForgeItemSubtype = ForgeWeaponSubtype | ForgeArmorSubtype | ForgeOffhandSubtype | 'potion' | 'food' | 'scroll' | 'crafting-material' | 'quest-item' | 'miscellaneous' | 'amulet' | 'ring' | 'charm'
export type ForgeItemEquipSlot = 'MainHand' | 'OffHand' | 'Head' | 'Chest' | 'Hands' | 'Legs' | 'Feet' | 'Cape' | 'Waist' | 'Amulet' | 'Ring' | 'Charm' | 'None'
export type ForgeArmorFitMode = 'rigid' | 'skinned'
export type ForgeBodyRegion = 'head' | 'hair' | 'torso' | 'upper-arms' | 'forearms' | 'hands' | 'hips' | 'thighs' | 'shins' | 'feet'

export type ForgeItemAuthoringFields = {
  itemType?: ForgeItemType
  subtype?: ForgeItemSubtype
  equipSlot?: ForgeItemEquipSlot
  armorFitMode?: ForgeArmorFitMode
  bodyMask?: ForgeBodyRegion[]
  defenseBonus?: number
}

export type ForgeAuthoredItem = ForgeItemDefinition & ForgeItemAuthoringFields

export type ItemClassification = {
  itemType: ForgeItemType
  subtype: ForgeItemSubtype
  equipSlot: ForgeItemEquipSlot
  armorFitMode: ForgeArmorFitMode
  bodyMask: ForgeBodyRegion[]
}

export const ITEM_TYPE_OPTIONS: ForgeItemType[] = ['weapon', 'armor', 'offhand', 'consumable', 'material', 'quest', 'misc']
export const BODY_REGION_OPTIONS: ForgeBodyRegion[] = ['head', 'hair', 'torso', 'upper-arms', 'forearms', 'hands', 'hips', 'thighs', 'shins', 'feet']

const SUBTYPES: Record<ForgeItemType, ForgeItemSubtype[]> = {
  weapon: ['sword', 'dagger', 'axe', 'mace', 'staff', 'spear', 'bow', 'pickaxe', 'hatchet', 'sickle'],
  armor: ['helmet', 'chest', 'gloves', 'legs', 'boots', 'cloak', 'waist'],
  offhand: ['shield', 'focus'],
  consumable: ['potion', 'food', 'scroll'],
  material: ['crafting-material'],
  quest: ['quest-item'],
  misc: ['miscellaneous', 'amulet', 'ring', 'charm'],
}

export function itemClassification(item: ForgeItemDefinition): ItemClassification {
  const authored = item as ForgeAuthoredItem
  const itemType = authored.itemType ?? inferType(item)
  const subtype = validSubtype(itemType, authored.subtype) ? authored.subtype! : inferSubtype(item, itemType)
  return {
    itemType,
    subtype,
    equipSlot: authored.equipSlot ?? defaultEquipSlot(itemType, subtype),
    armorFitMode: authored.armorFitMode ?? defaultArmorFitMode(subtype),
    bodyMask: authored.bodyMask?.length ? [...authored.bodyMask] : defaultBodyMask(subtype),
  }
}

export function subtypeOptions(itemType: ForgeItemType) {
  return SUBTYPES[itemType]
}

export function defaultEquipSlot(itemType: ForgeItemType, subtype: ForgeItemSubtype): ForgeItemEquipSlot {
  if (itemType === 'weapon') return 'MainHand'
  if (itemType === 'offhand') return 'OffHand'
  if (subtype === 'helmet') return 'Head'
  if (subtype === 'chest') return 'Chest'
  if (subtype === 'gloves') return 'Hands'
  if (subtype === 'legs') return 'Legs'
  if (subtype === 'boots') return 'Feet'
  if (subtype === 'cloak') return 'Cape'
  if (subtype === 'waist') return 'Waist'
  if (subtype === 'amulet') return 'Amulet'
  if (subtype === 'ring') return 'Ring'
  if (subtype === 'charm') return 'Charm'
  return 'None'
}

export function defaultArmorFitMode(subtype: ForgeItemSubtype): ForgeArmorFitMode {
  return subtype === 'helmet' ? 'rigid' : 'skinned'
}

export function defaultBodyMask(subtype: ForgeItemSubtype): ForgeBodyRegion[] {
  if (subtype === 'helmet') return ['head', 'hair']
  if (subtype === 'chest') return ['torso', 'upper-arms']
  if (subtype === 'gloves') return ['hands', 'forearms']
  if (subtype === 'legs') return ['hips', 'thighs', 'shins']
  if (subtype === 'boots') return ['feet', 'shins']
  return []
}

export function classificationPatch(item: ForgeItemDefinition, itemType: ForgeItemType, subtype?: ForgeItemSubtype): ForgeItemAuthoringFields {
  const nextSubtype = validSubtype(itemType, subtype) ? subtype! : SUBTYPES[itemType][0]
  const current = itemClassification(item)
  return {
    itemType,
    subtype: nextSubtype,
    equipSlot: defaultEquipSlot(itemType, nextSubtype),
    armorFitMode: itemType === 'armor' ? defaultArmorFitMode(nextSubtype) : current.armorFitMode,
    bodyMask: itemType === 'armor' ? defaultBodyMask(nextSubtype) : [],
    defenseBonus: itemType === 'armor' ? (item as ForgeAuthoredItem).defenseBonus ?? 0 : undefined,
  }
}

export function starterModelLabel(item: ForgeItemDefinition) {
  const { itemType, subtype } = itemClassification(item)
  if (itemType === 'armor') return `Starter ${subtype} armor`
  if (itemType === 'offhand') return `Starter ${subtype}`
  if (itemType === 'weapon') return `Starter ${subtype}`
  return 'Starter item prop'
}

export function isWearableArmor(item: ForgeItemDefinition) {
  return itemClassification(item).itemType === 'armor'
}

export function wearableAnchor(slot: ForgeItemEquipSlot): [number, number, number] {
  if (slot === 'Head') return [0, 1.82, 0]
  if (slot === 'Chest') return [0, 1.35, 0]
  if (slot === 'Hands') return [0, 1.12, 0]
  if (slot === 'Legs') return [0, 0.58, 0]
  if (slot === 'Feet') return [0, 0.16, 0]
  return [0, 1.15, 0]
}

export function wearableTargetSize(slot: ForgeItemEquipSlot): [number, number, number] {
  if (slot === 'Head') return [0.52, 0.46, 0.5]
  if (slot === 'Chest') return [0.72, 0.78, 0.42]
  if (slot === 'Hands') return [1.18, 0.34, 0.34]
  if (slot === 'Legs') return [0.52, 0.82, 0.38]
  if (slot === 'Feet') return [0.52, 0.34, 0.62]
  return [0.75, 0.75, 0.75]
}

export function taxonomyLabel(value: string) {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function inferType(item: ForgeItemDefinition): ForgeItemType {
  const value = item.name.toLowerCase()
  if (/helmet|helm|hood|chest|chestplate|armor|armour|glove|gauntlet|greave|legging|pants|boot/.test(value)) return 'armor'
  if (/shield|buckler|focus|tome|orb/.test(value)) return 'offhand'
  if (/potion|elixir|food|bread|scroll/.test(value)) return 'consumable'
  if (/ore|ingot|wood|leather|cloth|material|essence/.test(value)) return 'material'
  if (/quest|key|relic/.test(value)) return 'quest'
  return 'weapon'
}

function inferSubtype(item: ForgeItemDefinition, itemType: ForgeItemType): ForgeItemSubtype {
  const value = item.name.toLowerCase()
  if (itemType === 'armor') {
    if (/helmet|helm|hood/.test(value)) return 'helmet'
    if (/glove|gauntlet/.test(value)) return 'gloves'
    if (/boot|shoe/.test(value)) return 'boots'
    if (/leg|greave|pants/.test(value)) return 'legs'
    return 'chest'
  }
  if (itemType === 'offhand') return /focus|tome|orb/.test(value) ? 'focus' : 'shield'
  if (itemType === 'weapon') {
    if (/dagger|knife/.test(value)) return 'dagger'
    if (/axe/.test(value)) return 'axe'
    if (/mace|hammer|club/.test(value)) return 'mace'
    if (/staff/.test(value)) return 'staff'
    if (/spear|polearm|halberd/.test(value)) return 'spear'
    if (/bow|crossbow/.test(value)) return 'bow'
    return 'sword'
  }
  return SUBTYPES[itemType][0]
}

function validSubtype(itemType: ForgeItemType, subtype?: ForgeItemSubtype): subtype is ForgeItemSubtype {
  return Boolean(subtype && SUBTYPES[itemType].includes(subtype))
}
