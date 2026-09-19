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
  neckline: EquipmentForgeV3Neckline
  sleeve: EquipmentForgeV3Sleeve
  materials: {
    cloth: string
    trim: string
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
    neckline: 'round',
    sleeve: 'short',
    materials: {
      cloth: '#344b35',
      trim: '#4b3528',
    },
  }
}
