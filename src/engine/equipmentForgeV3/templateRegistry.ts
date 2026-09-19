import type {
  EquipmentForgeV3Recipe,
  GarmentTemplateId,
} from './types'

export type EquipmentForgeV3TemplateDefinition = {
  id: GarmentTemplateId
  label: string
  description: string
  supportedBodyTypes: Array<'female' | 'male'>
  maskBody: boolean
}

export const EQUIPMENT_FORGE_V3_TEMPLATES:
  EquipmentForgeV3TemplateDefinition[] = [
    {
      id: 'tunic_fitted',
      label: 'Fitted Tunic',
      description:
        'Body-conforming skinned tunic with real transferred bone weights.',
      supportedBodyTypes: [
        'female',
        'male',
      ],
      maskBody: true,
    },
  ]

export function equipmentForgeV3Template(
  id: GarmentTemplateId,
) {
  return (
    EQUIPMENT_FORGE_V3_TEMPLATES.find(
      (template) => template.id === id,
    ) ??
    EQUIPMENT_FORGE_V3_TEMPLATES[0]
  )
}

export function normalizeEquipmentForgeV3Recipe(
  input: EquipmentForgeV3Recipe,
): EquipmentForgeV3Recipe {
  return {
    ...input,
    length: clamp(input.length, .72, 1.28),
    looseness: clamp(
      input.looseness,
      0,
      .55,
    ),
    waistTaper: clamp(
      input.waistTaper,
      0,
      .65,
    ),
    hemFlare: clamp(
      input.hemFlare ?? .14,
      0,
      .5,
    ),
  }
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(max, value),
  )
}
