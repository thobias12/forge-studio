export type ForgeItemGeneratorId =
  | 'weapon.sword'
  | 'weapon.dagger'
  | 'weapon.axe'
  | 'weapon.mace'
  | 'weapon.staff'
  | 'weapon.spear'
  | 'weapon.bow'
  | 'armor.helmet'
  | 'armor.chest'
  | 'armor.gloves'
  | 'armor.legs'
  | 'armor.boots'

export type ForgeGeneratorValue = string | number | boolean

export type ForgeItemGeneratorRecipe = {
  generatorId: ForgeItemGeneratorId
  version: 1
  seed: number
  preset: string
  params: Record<string, ForgeGeneratorValue>
  materials: Record<string, string>
}

export type ForgeGeneratorRangeField = {
  kind: 'range'
  key: string
  label: string
  group: string
  min: number
  max: number
  step: number
}

export type ForgeGeneratorSelectField = {
  kind: 'select'
  key: string
  label: string
  group: string
  options: Array<{ value: string; label: string }>
}

export type ForgeGeneratorField = ForgeGeneratorRangeField | ForgeGeneratorSelectField

export type ForgeGeneratorMaterialField = {
  key: string
  label: string
  options: Array<{ value: string; label: string }>
}

export type ForgeGeneratorPreset = {
  id: string
  label: string
  description: string
  params: Record<string, ForgeGeneratorValue>
  materials: Record<string, string>
}
