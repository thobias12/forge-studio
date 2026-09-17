import { cloneForgeCharacterConfig, type ForgeCharacterArmor, type ForgeCharacterConfig, type ForgeCharacterHeadwear, type ForgeCharacterSpecies } from '../lib/proceduralCharacter'
import type { ForgeWeaponAnimationProfile } from './weaponAnimationProfiles'

export type ForgeCharacterEntityKind = 'enemy' | 'npc' | 'creature' | 'player'
export type ForgeCharacterRole = 'melee' | 'ranged' | 'caster' | 'tank' | 'civilian' | 'vendor' | 'quest'
export type ForgeCharacterFaction = 'undead' | 'bandits' | 'cult' | 'town' | 'wild' | 'neutral'
export type ForgeCharacterTemperament = 'passive' | 'defensive' | 'aggressive' | 'fearless'
export type ForgeCharacterDialogueStyle = 'none' | 'brief' | 'friendly' | 'grim' | 'mysterious'
export type ForgeCharacterPresetId = 'crypt-skeleton' | 'bone-mage' | 'crypt-zombie' | 'undead-brute' | 'dungeon-bandit' | 'cultist' | 'town-guard' | 'villager'

export type ForgeCharacterBlueprint = {
  format: 'forge-character-blueprint'
  version: 2
  targetAssetId?: string
  name: string
  entityKind: ForgeCharacterEntityKind
  lineage: ForgeCharacterSpecies
  role: ForgeCharacterRole
  faction: ForgeCharacterFaction
  level: number
  body: {
    height: number
    bulk: number
    shoulders: number
    headScale: number
    armLength: number
    legLength: number
    asymmetry: number
  }
  appearance: {
    armor: ForgeCharacterArmor
    headwear: ForgeCharacterHeadwear
    primary: string
    secondary: string
    accent: string
  }
  combat: {
    weaponProfile: ForgeWeaponAnimationProfile
    temperament: ForgeCharacterTemperament
    aggression: number
    preferredRange: number
  }
  npc: {
    occupation: string
    dialogueStyle: ForgeCharacterDialogueStyle
    important: boolean
  }
  tags: string[]
  creatorCompatible: boolean
}

export const CHARACTER_BLUEPRINT_PRESETS: Array<{ id: ForgeCharacterPresetId; label: string; detail: string; blueprint: ForgeCharacterBlueprint }> = [
  preset('crypt-skeleton', 'Crypt Skeleton', 'Enemy · melee undead', {
    name: 'Crypt Skeleton', entityKind: 'enemy', lineage: 'skeleton', role: 'melee', faction: 'undead', level: 4,
    body: { height: 1.05, bulk: 1.07, shoulders: 1.12, headScale: 0.94, armLength: 1.03, legLength: 1.01, asymmetry: 0.08 },
    appearance: { armor: 'scrap', headwear: 'none', primary: '#b8b19c', secondary: '#242a2f', accent: '#6e3c3f' },
    combat: { weaponProfile: 'one-hand-sword', temperament: 'aggressive', aggression: 0.72, preferredRange: 1.55 },
    npc: { occupation: '', dialogueStyle: 'none', important: false }, tags: ['undead', 'skeleton', 'melee'], creatorCompatible: true,
  }),
  preset('bone-mage', 'Bone Mage', 'Creature · undead caster', {
    name: 'Bone Mage', entityKind: 'creature', lineage: 'skeleton', role: 'caster', faction: 'undead', level: 8,
    body: { height: 1.08, bulk: 0.93, shoulders: 0.98, headScale: 1.04, armLength: 1.08, legLength: 1.0, asymmetry: 0.16 },
    appearance: { armor: 'none', headwear: 'hood', primary: '#bcb5a1', secondary: '#181b27', accent: '#54407a' },
    combat: { weaponProfile: 'staff', temperament: 'aggressive', aggression: 0.58, preferredRange: 7 },
    npc: { occupation: '', dialogueStyle: 'none', important: false }, tags: ['undead', 'caster', 'elite'], creatorCompatible: true,
  }),
  preset('crypt-zombie', 'Crypt Zombie', 'Creature · shambling undead', {
    name: 'Crypt Zombie', entityKind: 'creature', lineage: 'zombie', role: 'melee', faction: 'undead', level: 3,
    body: { height: 1.08, bulk: 1.22, shoulders: 1.13, headScale: 1.02, armLength: 1.06, legLength: 0.98, asymmetry: 0.4 },
    appearance: { armor: 'none', headwear: 'none', primary: '#596a59', secondary: '#3f302b', accent: '#6e3c37' },
    combat: { weaponProfile: 'unarmed', temperament: 'fearless', aggression: 0.9, preferredRange: 1.2 },
    npc: { occupation: '', dialogueStyle: 'none', important: false }, tags: ['undead', 'zombie', 'melee'], creatorCompatible: true,
  }),
  preset('undead-brute', 'Undead Brute', 'Creature · heavy frontliner', {
    name: 'Undead Brute', entityKind: 'creature', lineage: 'zombie', role: 'tank', faction: 'undead', level: 10,
    body: { height: 1.16, bulk: 1.48, shoulders: 1.3, headScale: 0.92, armLength: 1.09, legLength: 0.96, asymmetry: 0.28 },
    appearance: { armor: 'heavy', headwear: 'helmet', primary: '#4e5c4f', secondary: '#272625', accent: '#654439' },
    combat: { weaponProfile: 'axe-mace', temperament: 'fearless', aggression: 0.82, preferredRange: 1.8 },
    npc: { occupation: '', dialogueStyle: 'none', important: false }, tags: ['undead', 'brute', 'tank'], creatorCompatible: true,
  }),
  preset('dungeon-bandit', 'Dungeon Bandit', 'Enemy · human melee', {
    name: 'Dungeon Bandit', entityKind: 'enemy', lineage: 'bandit', role: 'melee', faction: 'bandits', level: 5,
    body: { height: 1.02, bulk: 1.12, shoulders: 1.14, headScale: 0.94, armLength: 1, legLength: 1, asymmetry: 0.04 },
    appearance: { armor: 'scrap', headwear: 'hood', primary: '#95705b', secondary: '#293540', accent: '#76532f' },
    combat: { weaponProfile: 'one-hand-sword', temperament: 'aggressive', aggression: 0.68, preferredRange: 1.6 },
    npc: { occupation: '', dialogueStyle: 'brief', important: false }, tags: ['human', 'bandit', 'melee'], creatorCompatible: true,
  }),
  preset('cultist', 'Cultist', 'Enemy · ritual caster', {
    name: 'Cultist', entityKind: 'enemy', lineage: 'bandit', role: 'caster', faction: 'cult', level: 7,
    body: { height: 1.01, bulk: 0.94, shoulders: 0.96, headScale: 0.96, armLength: 1.04, legLength: 1.01, asymmetry: 0.03 },
    appearance: { armor: 'none', headwear: 'hood', primary: '#876b5d', secondary: '#241822', accent: '#883b49' },
    combat: { weaponProfile: 'staff', temperament: 'aggressive', aggression: 0.62, preferredRange: 6.5 },
    npc: { occupation: 'Cult acolyte', dialogueStyle: 'grim', important: false }, tags: ['human', 'cult', 'caster'], creatorCompatible: true,
  }),
  preset('town-guard', 'Town Guard', 'NPC · friendly defender', {
    name: 'Town Guard', entityKind: 'npc', lineage: 'bandit', role: 'tank', faction: 'town', level: 6,
    body: { height: 1.04, bulk: 1.18, shoulders: 1.2, headScale: 0.94, armLength: 1, legLength: 1.01, asymmetry: 0 },
    appearance: { armor: 'heavy', headwear: 'helmet', primary: '#9b755f', secondary: '#263643', accent: '#806339' },
    combat: { weaponProfile: 'one-hand-sword', temperament: 'defensive', aggression: 0.35, preferredRange: 1.8 },
    npc: { occupation: 'Guard', dialogueStyle: 'brief', important: false }, tags: ['human', 'town', 'guard'], creatorCompatible: true,
  }),
  preset('villager', 'Villager', 'NPC · civilian foundation', {
    name: 'Villager', entityKind: 'npc', lineage: 'bandit', role: 'civilian', faction: 'town', level: 1,
    body: { height: 1, bulk: 1, shoulders: 1, headScale: 1, armLength: 1, legLength: 1, asymmetry: 0 },
    appearance: { armor: 'none', headwear: 'none', primary: '#9a735f', secondary: '#4c4438', accent: '#6c5334' },
    combat: { weaponProfile: 'unarmed', temperament: 'passive', aggression: 0, preferredRange: 0 },
    npc: { occupation: 'Villager', dialogueStyle: 'friendly', important: false }, tags: ['human', 'town', 'civilian'], creatorCompatible: true,
  }),
]

export function createCharacterBlueprint(presetId: ForgeCharacterPresetId = 'crypt-skeleton') {
  const source = CHARACTER_BLUEPRINT_PRESETS.find((item) => item.id === presetId)?.blueprint ?? CHARACTER_BLUEPRINT_PRESETS[0].blueprint
  return cloneBlueprint(source)
}

export function blueprintFromConfig(config: ForgeCharacterConfig, base?: ForgeCharacterBlueprint): ForgeCharacterBlueprint {
  const source = base ? cloneBlueprint(base) : createCharacterBlueprint(config.species === 'skeleton' ? 'crypt-skeleton' : config.species === 'zombie' ? 'crypt-zombie' : 'dungeon-bandit')
  return {
    ...source,
    name: config.name.replace(/\s+Concept$/i, ''),
    lineage: config.species,
    body: {
      height: config.height, bulk: config.bulk, shoulders: config.shoulders, headScale: config.headScale,
      armLength: config.armLength, legLength: config.legLength, asymmetry: config.asymmetry,
    },
    appearance: {
      armor: config.armor, headwear: config.headwear,
      primary: config.primary, secondary: config.secondary, accent: config.accent,
    },
  }
}

export function blueprintToConfig(blueprint: ForgeCharacterBlueprint): ForgeCharacterConfig {
  const config = cloneForgeCharacterConfig(blueprint.lineage)
  const starterClass = blueprint.entityKind === 'player'
    ? blueprint.role === 'ranged'
      ? 'thornwarden'
      : blueprint.role === 'caster'
        ? 'voidweaver'
        : blueprint.role === 'melee'
          ? 'duskstrider'
          : undefined
    : undefined

  return {
    ...config,
    name: `${blueprint.name} Concept`,
    height: clamp(blueprint.body.height, 0.75, 1.35),
    bulk: clamp(blueprint.body.bulk, 0.65, 1.6),
    shoulders: clamp(blueprint.body.shoulders, 0.72, 1.45),
    headScale: clamp(blueprint.body.headScale, 0.72, 1.35),
    armLength: clamp(blueprint.body.armLength, 0.78, 1.28),
    legLength: clamp(blueprint.body.legLength, 0.78, 1.28),
    asymmetry: clamp(blueprint.body.asymmetry, 0, 0.65),
    armor: blueprint.appearance.armor,
    headwear: blueprint.appearance.headwear,
    weapon: 'none',
    primary: blueprint.appearance.primary,
    secondary: blueprint.appearance.secondary,
    accent: blueprint.appearance.accent,
    ...(starterClass ? { starterClass } : {}),
  } as ForgeCharacterConfig
}

export function characterBlueprintBlob(blueprint: ForgeCharacterBlueprint) {
  return new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/x-forge-character-blueprint+json' })
}

export async function parseCharacterBlueprint(blob: Blob): Promise<ForgeCharacterBlueprint | undefined> {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<ForgeCharacterBlueprint>
    if (parsed.format !== 'forge-character-blueprint' || parsed.version !== 2 || !parsed.name || !parsed.body || !parsed.appearance || !parsed.combat) return undefined
    return parsed as ForgeCharacterBlueprint
  } catch { return undefined }
}

export function cloneBlueprint(blueprint: ForgeCharacterBlueprint): ForgeCharacterBlueprint {
  return JSON.parse(JSON.stringify(blueprint)) as ForgeCharacterBlueprint
}

function preset(id: ForgeCharacterPresetId, label: string, detail: string, blueprint: Omit<ForgeCharacterBlueprint, 'format' | 'version'>) {
  return { id, label, detail, blueprint: { format: 'forge-character-blueprint' as const, version: 2 as const, ...blueprint } }
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
