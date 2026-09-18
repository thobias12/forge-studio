import type { ForgeCharacterConfig } from './proceduralCharacter'

export type SkillboundClass = 'duskstrider' | 'thornwarden' | 'voidweaver'
export type FacePreset = 'balanced' | 'angular' | 'narrow' | 'broad'
export type HairStyle = 'none' | 'cropped' | 'swept' | 'undercut' | 'long' | 'tied'
export type FacialHairStyle = 'none' | 'stubble' | 'short' | 'full'

export type CharacterIdentityRecipe = {
  format: 'SkillboundCharacterIdentity'
  version: 2
  id: string
  name: string
  classId: SkillboundClass
  seed: number
  modelAssets: {
    bodyAssetId?: string
    headAssetId?: string
    hairAssetId?: string
  }
  appearance: {
    facePreset: FacePreset
    skinTone: string
    eyeColor: string
    hairStyle: HairStyle
    hairColor: string
    facialHairStyle: FacialHairStyle
    facialHairColor: string
  }
  body: {
    height: number
    build: number
    shoulders: number
    chest: number
    waist: number
    hips: number
    headScale: number
    armLength: number
    legLength: number
  }
}

export type StartingEquipmentItem = {
  id: string
  label: string
  slot: 'chest' | 'legs' | 'boots' | 'mainHand' | 'offHand'
}

export type SkillboundClassDefinition = {
  id: SkillboundClass
  name: string
  subtitle: string
  description: string
  undersuit: string
  accent: string
  startingLoadout: StartingEquipmentItem[]
  bodyDefaults: CharacterIdentityRecipe['body']
}

export const CLASS_DEFINITIONS: Record<SkillboundClass, SkillboundClassDefinition> = {
  duskstrider: {
    id: 'duskstrider',
    name: 'Duskstrider',
    subtitle: 'Agile melee',
    description: 'Fast, mobile fighter built around positioning and close-range pressure.',
    undersuit: '#26383a',
    accent: '#9c7247',
    bodyDefaults: {
      height: .98, build: .97, shoulders: .98, chest: 1, waist: .98, hips: 1,
      headScale: .99, armLength: .96, legLength: 1,
    },
    startingLoadout: [
      { id: 'skillbound:duskstrider:starter-tunic', label: 'Worn Dusk Tunic', slot: 'chest' },
      { id: 'skillbound:duskstrider:starter-trousers', label: 'Traveller Trousers', slot: 'legs' },
      { id: 'skillbound:duskstrider:starter-boots', label: 'Soft Leather Boots', slot: 'boots' },
      { id: 'skillbound:duskstrider:starter-blade', label: 'Wayfarer Blade', slot: 'mainHand' },
    ],
  },
  thornwarden: {
    id: 'thornwarden',
    name: 'Thornwarden',
    subtitle: 'Ranged hunter',
    description: 'Precise ranged class with mobility, traps and wilderness utility.',
    undersuit: '#304236',
    accent: '#8e764a',
    bodyDefaults: {
      height: .99, build: .96, shoulders: .97, chest: .98, waist: .97, hips: .99,
      headScale: 1, armLength: .97, legLength: 1.02,
    },
    startingLoadout: [
      { id: 'skillbound:thornwarden:starter-shirt', label: 'Ranger Shirt', slot: 'chest' },
      { id: 'skillbound:thornwarden:starter-trousers', label: 'Field Trousers', slot: 'legs' },
      { id: 'skillbound:thornwarden:starter-boots', label: 'Trail Boots', slot: 'boots' },
      { id: 'skillbound:thornwarden:starter-bow', label: 'Hunting Bow', slot: 'mainHand' },
    ],
  },
  voidweaver: {
    id: 'voidweaver',
    name: 'Voidweaver',
    subtitle: 'Arcane caster',
    description: 'Spellcaster focused on ranged magic, control and volatile arcane power.',
    undersuit: '#302b45',
    accent: '#8874b6',
    bodyDefaults: {
      height: .99, build: .94, shoulders: .95, chest: .96, waist: .95, hips: .98,
      headScale: 1.01, armLength: .96, legLength: 1.01,
    },
    startingLoadout: [
      { id: 'skillbound:voidweaver:starter-robe', label: 'Apprentice Robe', slot: 'chest' },
      { id: 'skillbound:voidweaver:starter-leggings', label: 'Cloth Leggings', slot: 'legs' },
      { id: 'skillbound:voidweaver:starter-shoes', label: 'Arcane Shoes', slot: 'boots' },
      { id: 'skillbound:voidweaver:starter-focus', label: 'Initiate Focus', slot: 'mainHand' },
    ],
  },
}

export const SKIN_TONES = ['#d7aa8a', '#bd8769', '#9e6b52', '#7c4f3c', '#5b382c']
export const HAIR_COLORS = ['#241b17', '#4a2f20', '#765137', '#a77b4f', '#b7b4ad', '#17191c']
export const EYE_COLORS = ['#6f8ea0', '#6f7e55', '#8a6c49', '#655f8f', '#493c34']

export function createDefaultIdentity(classId: SkillboundClass = 'duskstrider'): CharacterIdentityRecipe {
  const definition = CLASS_DEFINITIONS[classId]
  return {
    format: 'SkillboundCharacterIdentity',
    version: 2,
    id: crypto.randomUUID(),
    name: definition.name,
    classId,
    seed: Math.floor(Math.random() * 1_000_000),
    modelAssets: {},
    appearance: {
      facePreset: 'balanced',
      skinTone: SKIN_TONES[1],
      eyeColor: EYE_COLORS[0],
      hairStyle: 'cropped',
      hairColor: HAIR_COLORS[0],
      facialHairStyle: 'none',
      facialHairColor: HAIR_COLORS[0],
    },
    body: { ...definition.bodyDefaults },
  }
}

export function identityToForgeConfig(identity: CharacterIdentityRecipe): ForgeCharacterConfig {
  const definition = CLASS_DEFINITIONS[identity.classId]
  return {
    name: identity.name,
    species: 'bandit',
    height: identity.body.height,
    bulk: identity.body.build * .8,
    shoulders: identity.body.shoulders * .87,
    headScale: identity.body.headScale,
    armLength: identity.body.armLength,
    legLength: identity.body.legLength,
    asymmetry: 0,
    armor: 'none',
    headwear: 'none',
    weapon: 'none',
    primary: identity.appearance.skinTone,
    secondary: definition.undersuit,
    accent: definition.accent,
  }
}

export function randomizeIdentity(current: CharacterIdentityRecipe): CharacterIdentityRecipe {
  const faces: FacePreset[] = ['balanced', 'angular', 'narrow', 'broad']
  const hair: HairStyle[] = ['none', 'cropped', 'swept', 'undercut', 'long', 'tied']
  const beard: FacialHairStyle[] = ['none', 'stubble', 'short', 'full']
  const definition = CLASS_DEFINITIONS[current.classId]
  const jitter = (value: number, spread: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round((value + (Math.random() * 2 - 1) * spread) * 100) / 100))

  return {
    ...current,
    id: crypto.randomUUID(),
    seed: Math.floor(Math.random() * 1_000_000),
    modelAssets: { ...current.modelAssets },
    appearance: {
      facePreset: faces[Math.floor(Math.random() * faces.length)],
      skinTone: pick(SKIN_TONES),
      eyeColor: pick(EYE_COLORS),
      hairStyle: pick(hair),
      hairColor: pick(HAIR_COLORS),
      facialHairStyle: pick(beard),
      facialHairColor: pick(HAIR_COLORS),
    },
    body: {
      height: jitter(definition.bodyDefaults.height, .06, .9, 1.08),
      build: jitter(definition.bodyDefaults.build, .08, .86, 1.08),
      shoulders: jitter(definition.bodyDefaults.shoulders, .07, .9, 1.08),
      chest: jitter(definition.bodyDefaults.chest, .07, .9, 1.08),
      waist: jitter(definition.bodyDefaults.waist, .08, .88, 1.08),
      hips: jitter(definition.bodyDefaults.hips, .07, .9, 1.08),
      headScale: jitter(definition.bodyDefaults.headScale, .04, .94, 1.06),
      armLength: jitter(definition.bodyDefaults.armLength, .04, .92, 1.04),
      legLength: jitter(definition.bodyDefaults.legLength, .04, .94, 1.07),
    },
  }
}

function pick<T>(values: readonly T[]) {
  return values[Math.floor(Math.random() * values.length)]
}


export function normalizeIdentityRecipe(value: unknown): CharacterIdentityRecipe {
  const raw = value as Partial<CharacterIdentityRecipe> & { version?: number; modelAssets?: CharacterIdentityRecipe['modelAssets'] }
  const classId: SkillboundClass = raw.classId && raw.classId in CLASS_DEFINITIONS ? raw.classId : 'duskstrider'
  const fallback = createDefaultIdentity(classId)
  return {
    ...fallback,
    ...raw,
    format: 'SkillboundCharacterIdentity',
    version: 2,
    classId,
    modelAssets: { ...(raw.modelAssets ?? {}) },
    appearance: { ...fallback.appearance, ...(raw.appearance ?? {}) },
    body: { ...fallback.body, ...(raw.body ?? {}) },
  }
}
