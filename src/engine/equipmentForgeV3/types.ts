import type { SkillboundBodyType } from '../../lib/characterAssetRegistry'

export type GarmentTemplateId =
  | 'tunic_fitted'

export type EquipmentForgeV3Neckline =
  | 'high'
  | 'round'
  | 'scoop'

export type EquipmentForgeV3Sleeve =
  | 'none'
  | 'short'
  | 'long'

export type EquipmentForgeV3Recipe = {
  format: 'forge-equipment-v3-recipe'
  version: 1
  enabled: boolean
  bodyType: SkillboundBodyType
  template: GarmentTemplateId
  name: string
  length: number
  looseness: number
  waistTaper: number
  hemFlare: number
  neckline: EquipmentForgeV3Neckline
  sleeve: EquipmentForgeV3Sleeve
  layers: {
    vest: boolean
    belt: boolean
    tabard: boolean
    cape: boolean
  }
  cape: {
    length: number
    width: number
    flare: number
  }
  materials: {
    cloth: string
    trim: string
    leather: string
    accent: string
  }
}

export function createEquipmentForgeV3Recipe(
  bodyType: SkillboundBodyType = 'female',
): EquipmentForgeV3Recipe {
  return {
    format: 'forge-equipment-v3-recipe',
    version: 1,
    enabled: true,
    bodyType,
    template: 'tunic_fitted',
    name: 'Fitted Ranger Tunic',
    length: 1,
    looseness: .18,
    waistTaper: .24,
    hemFlare: .14,
    neckline: 'round',
    sleeve: 'short',
    layers: {
      vest: true,
      belt: true,
      tabard: true,
      cape: true,
    },
    cape: {
      length: .62,
      width: .3,
      flare: .16,
    },
    materials: {
      cloth: '#344b35',
      trim: '#4b3528',
      leather: '#3b281d',
      accent: '#5a1625',
    },
  }
}


export type EquipmentForgeV3StylePreset =
  | 'ranger'
  | 'traveler'
  | 'acolyte'

export function applyEquipmentForgeV3StylePreset(
  recipe: EquipmentForgeV3Recipe,
  preset: EquipmentForgeV3StylePreset,
): EquipmentForgeV3Recipe {
  if (preset === 'traveler') {
    return {
      ...recipe,
      name: 'Traveler Tunic',
      length: 1.08,
      looseness: .24,
      waistTaper: .14,
      hemFlare: .2,
      neckline: 'scoop',
      sleeve: 'short',
      layers: {
        vest: false,
        belt: true,
        tabard: false,
        cape: false,
      },
      cape: {
        ...recipe.cape,
      },
      materials: {
        ...recipe.materials,
        cloth: '#67563f',
        trim: '#352a22',
        leather: '#443226',
      },
    }
  }

  if (preset === 'acolyte') {
    return {
      ...recipe,
      name: 'Acolyte Tunic',
      length: 1.18,
      looseness: .2,
      waistTaper: .18,
      hemFlare: .24,
      neckline: 'high',
      sleeve: 'long',
      layers: {
        vest: false,
        belt: true,
        tabard: true,
        cape: true,
      },
      cape: {
        length: .72,
        width: .34,
        flare: .22,
      },
      materials: {
        ...recipe.materials,
        cloth: '#29344d',
        trim: '#7b6848',
        leather: '#3b3028',
        accent: '#261b3f',
      },
    }
  }

  return {
    ...recipe,
    name: 'Fitted Ranger Tunic',
    length: 1.04,
    looseness: .16,
    waistTaper: .24,
    hemFlare: .14,
    neckline: 'round',
    sleeve: 'short',
    layers: {
      vest: true,
      belt: true,
      tabard: true,
      cape: true,
    },
    cape: {
      length: .62,
      width: .3,
      flare: .16,
    },
    materials: {
      ...recipe.materials,
      cloth: '#344b35',
      trim: '#4b3528',
      leather: '#3b281d',
      accent: '#5a1625',
    },
  }
}
