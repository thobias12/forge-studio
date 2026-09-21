import type { ForgeGameplayContent, ForgeItemDefinition, ForgeItemRarity } from './forgeProject'
import { itemClassification, type ForgeAuthoredItem, type ForgeItemEquipSlot, type ForgeItemSubtype, type ForgeItemType } from './itemTaxonomy'

// Original Skillbound recipes. Persist these values, never the state of a global RNG.
export const ITEM_FAMILIES = ['sword', 'dagger', 'axe', 'mace', 'staff', 'spear', 'bow', 'shield', 'grimoire', 'orb', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'cloak', 'waist', 'amulet', 'ring', 'charm', 'pickaxe', 'hatchet', 'sickle'] as const
export type SkillboundItemFamily = typeof ITEM_FAMILIES[number]
export const ITEM_TIERS = ['common', 'magic', 'rare', 'epic', 'legendary', 'unique'] as const
export const ITEM_PALETTES = {
  woodland: { cloth: '#c9bb94', leather: '#583d2c', metal: '#827e69', edge: '#c7b282', wood: '#654631', magic: '#7fc7b3' },
  dusk: { cloth: '#555b76', leather: '#40332e', metal: '#6b7e86', edge: '#c1b69a', wood: '#4d3830', magic: '#a6a1e0' },
  ember: { cloth: '#85463f', leather: '#483226', metal: '#836c52', edge: '#ceb078', wood: '#5f3927', magic: '#eca264' },
  marsh: { cloth: '#73764d', leather: '#493e2d', metal: '#68786c', edge: '#b0b08a', wood: '#56513a', magic: '#93d29e' },
} as const
export type SkillboundItemRecipe = {
  version: 1; seed: number; family: SkillboundItemFamily; palette: keyof typeof ITEM_PALETTES;
  construction: 'cloth' | 'leather' | 'plate'; variant: number; length: number; width: number;
  trim: number; wear: number;
}
export type SkillboundItemRoll = { version: 1; level: number; sourceId?: string; templateId?: string; affixes: Array<{ name: string; stat: 'damage' | 'defense'; value: number }> }
export const TIER_COLORS: Record<ForgeItemRarity, string> = { common: '#b7afa1', magic: '#80b9d2', rare: '#dbc476', epic: '#b496d6', legendary: '#e49a59', unique: '#d87972' }
export function itemSeed(value: string) { let n = 2166136261; for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0 }
export function itemRandom(seed: number) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296 } }
export function createItemRecipe(family: SkillboundItemFamily, seed: number): SkillboundItemRecipe {
  const r = itemRandom(seed); const palettes = Object.keys(ITEM_PALETTES) as Array<keyof typeof ITEM_PALETTES>
  return { version: 1, seed: seed >>> 0, family, palette: palettes[Math.floor(r() * palettes.length)], construction: (['cloth', 'leather', 'plate'] as const)[Math.floor(r() * 3)], variant: Math.floor(r() * 4), length: .9 + r() * .2, width: .9 + r() * .2, trim: .65 + r() * .35, wear: r() * .4 }
}
export function recipeForItem(item: ForgeItemDefinition): SkillboundItemRecipe | undefined {
  if (item.procedural?.version === 1 && ITEM_FAMILIES.includes(item.procedural.family)) return item.procedural
  return undefined
}
export function familyClassification(family: SkillboundItemFamily): { itemType: ForgeItemType; subtype: ForgeItemSubtype; equipSlot: ForgeItemEquipSlot } {
  const armor: Partial<Record<SkillboundItemFamily, ForgeItemEquipSlot>> = { helmet: 'Head', chest: 'Chest', gloves: 'Hands', legs: 'Legs', boots: 'Feet', cloak: 'Cape', waist: 'Waist' }
  if (armor[family]) return { itemType: 'armor', subtype: family as ForgeItemSubtype, equipSlot: armor[family]! }
  if (['shield', 'grimoire', 'orb'].includes(family)) return { itemType: 'offhand', subtype: family === 'shield' ? 'shield' : 'focus', equipSlot: 'OffHand' }
  if (['amulet', 'ring', 'charm'].includes(family)) return { itemType: 'misc', subtype: family as ForgeItemSubtype, equipSlot: family === 'amulet' ? 'Amulet' : family === 'ring' ? 'Ring' : 'Charm' }
  return { itemType: 'weapon', subtype: family as ForgeItemSubtype, equipSlot: 'MainHand' }
}
export function generateSkillboundItem(family: SkillboundItemFamily, seed: number, level = 1, tier?: ForgeItemRarity, id = `sb-${family}-${seed >>> 0}`): ForgeAuthoredItem {
  const r = itemRandom(seed ^ 0x71b43); const chance = r()
  const rarity = tier ?? (chance < .48 ? 'common' : chance < .78 ? 'magic' : chance < .94 ? 'rare' : chance < .985 ? 'epic' : 'legendary')
  const rank = ITEM_TIERS.indexOf(rarity); level = Math.max(1, Math.min(100, Math.floor(level) || 1))
  const recipe = createItemRecipe(family, seed); const classification = familyClassification(family)
  const offensive = classification.itemType === 'weapon' || family === 'orb' || family === 'grimoire'
  const affixes: SkillboundItemRoll['affixes'] = []
  // Only roll stats the combat system actually consumes. Every named bonus has an effect.
  const pool = offensive ? ['Keen', 'Resolute', 'Honed', 'Relentless'] : ['Stalwart', 'Warded', 'Reinforced', 'Enduring']
  for (let i = 0; i < Math.min(4, rank); i++) affixes.push({ name: pool[i], stat: offensive ? 'damage' : 'defense', value: Math.max(1, Math.round((1 + level * .18) * (.7 + r() * .6))) })
  const bonus = affixes.reduce((sum, a) => sum + a.value, 0)
  const base = Math.round((offensive ? 3 : 2) + level * .55 + rank)
  const noun = family.charAt(0).toUpperCase() + family.slice(1)
  const theme = recipe.palette.charAt(0).toUpperCase() + recipe.palette.slice(1)
  return { format: 'forge-item', version: 1, id, name: `${affixes[0] ? `${affixes[0].name} ` : ''}${theme} ${noun}`, slot: 'weapon', rarity, color: TIER_COLORS[rarity], damageBonus: offensive ? base + bonus : 0, defenseBonus: offensive ? 0 : base + bonus, ...classification, armorFitMode: classification.itemType === 'armor' ? 'skinned' : 'rigid', procedural: recipe, itemRoll: { version: 1, level, affixes } }
}
export function rollSkillboundLoot(template: ForgeItemDefinition, source: string, level = 1) {
  const recipe = recipeForItem(template)
  if (!recipe) return template
  const item = generateSkillboundItem(recipe.family, itemSeed(`${source}:${template.id}`), level)
  item.itemRoll = { ...item.itemRoll!, sourceId: source, templateId: template.id }
  return item
}
/** Explicit migration: replaces presentations, retains authored IDs, stats, loot tables and old library files. */
export function replaceEquipmentPresentations(gameplay: ForgeGameplayContent) {
  return { ...gameplay, items: gameplay.items.map(item => {
    const c = itemClassification(item)
    if (!['weapon', 'armor', 'offhand'].includes(c.itemType)) return item
    const family = c.subtype === 'focus' ? 'orb' : c.subtype
    if (!ITEM_FAMILIES.includes(family as SkillboundItemFamily)) return item
    return { ...item, procedural: createItemRecipe(family as SkillboundItemFamily, itemSeed(item.id)), visual: undefined, modelAssetId: undefined }
  }) }
}

export function withGeneratedItems(gameplay: ForgeGameplayContent, items?: ForgeItemDefinition[]): ForgeGameplayContent {
  if (!items?.length) return gameplay
  return { ...gameplay, items: [...new Map([...gameplay.items, ...items].map(item => [item.id, item])).values()] }
}

export function ensureSkillboundItemSystem(gameplay: ForgeGameplayContent): ForgeGameplayContent {
  if (gameplay.itemSystemVersion === 1) return gameplay
  const next = replaceEquipmentPresentations(gameplay)
  for (const family of ITEM_FAMILIES) if (!next.items.some(item => item.procedural?.family === family)) {
    next.items.push(generateSkillboundItem(family, 18427 + ITEM_FAMILIES.indexOf(family) * 977, 1, 'common', 'skillbound-template-' + family))
  }
  return { ...next, itemSystemVersion: 1 }
}
