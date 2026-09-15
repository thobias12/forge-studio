import type { ForgeItemDefinition } from './forgeProject'
import { itemClassification } from './itemTaxonomy'
import type { ForgeGeneratorField, ForgeGeneratorMaterialField, ForgeGeneratorPreset, ForgeItemGeneratorId, ForgeItemGeneratorRecipe } from './itemGeneratorTypes'

export type ForgeItemGeneratorDefinition = {
  id: ForgeItemGeneratorId
  label: string
  description: string
  fields: ForgeGeneratorField[]
  materials: ForgeGeneratorMaterialField[]
  presets: ForgeGeneratorPreset[]
}

const metalOptions = [
  { value: 'iron', label: 'Iron' },
  { value: 'dark-iron', label: 'Dark iron' },
  { value: 'steel', label: 'Steel' },
  { value: 'weathered-steel', label: 'Weathered steel' },
  { value: 'bronze', label: 'Bronze' },
]

const gripOptions = [
  { value: 'brown-leather', label: 'Brown leather' },
  { value: 'black-leather', label: 'Black leather' },
  { value: 'red-leather', label: 'Red leather' },
  { value: 'wood', label: 'Wood' },
]

const swordPresets: ForgeGeneratorPreset[] = [
  { id: 'rusted-soldier', label: 'Rusted Soldier', description: 'Workmanlike broad sword with worn iron.', params: { bladeStyle: 'broad', bladeLength: 1.55, bladeWidth: 0.23, bladeThickness: 0.075, tipStyle: 'point', fuller: 'single', guardStyle: 'straight', guardWidth: 0.62, gripLength: 0.48, gripThickness: 0.075, pommelStyle: 'diamond' }, materials: { blade: 'weathered-steel', guard: 'dark-iron', grip: 'brown-leather', accent: 'bronze' } },
  { id: 'knight', label: 'Knight', description: 'Long tapered blade with polished steel.', params: { bladeStyle: 'tapered', bladeLength: 1.72, bladeWidth: 0.19, bladeThickness: 0.065, tipStyle: 'point', fuller: 'single', guardStyle: 'cross', guardWidth: 0.72, gripLength: 0.52, gripThickness: 0.07, pommelStyle: 'round' }, materials: { blade: 'steel', guard: 'steel', grip: 'black-leather', accent: 'bronze' } },
  { id: 'raider', label: 'Raider', description: 'Heavy jagged blade with an aggressive silhouette.', params: { bladeStyle: 'jagged', bladeLength: 1.38, bladeWidth: 0.29, bladeThickness: 0.095, tipStyle: 'chisel', fuller: 'none', guardStyle: 'curved', guardWidth: 0.78, gripLength: 0.44, gripThickness: 0.09, pommelStyle: 'spiked' }, materials: { blade: 'dark-iron', guard: 'weathered-steel', grip: 'red-leather', accent: 'iron' } },
  { id: 'duelist', label: 'Duelist', description: 'Light narrow blade with a long grip.', params: { bladeStyle: 'straight', bladeLength: 1.68, bladeWidth: 0.14, bladeThickness: 0.05, tipStyle: 'point', fuller: 'double', guardStyle: 'short', guardWidth: 0.45, gripLength: 0.58, gripThickness: 0.06, pommelStyle: 'flat' }, materials: { blade: 'steel', guard: 'dark-iron', grip: 'black-leather', accent: 'steel' } },
]

const swordGenerator: ForgeItemGeneratorDefinition = {
  id: 'weapon.sword', label: 'Procedural Sword', description: 'Deterministic low-poly sword generator. The recipe stays editable; the GLB is generated output.',
  fields: [
    { kind: 'select', key: 'bladeStyle', label: 'Blade shape', group: 'Blade', options: [{ value: 'straight', label: 'Straight' }, { value: 'broad', label: 'Broad' }, { value: 'tapered', label: 'Tapered' }, { value: 'jagged', label: 'Jagged' }] },
    { kind: 'range', key: 'bladeLength', label: 'Length', group: 'Blade', min: 1.05, max: 2.05, step: 0.01 },
    { kind: 'range', key: 'bladeWidth', label: 'Width', group: 'Blade', min: 0.11, max: 0.36, step: 0.005 },
    { kind: 'range', key: 'bladeThickness', label: 'Thickness', group: 'Blade', min: 0.04, max: 0.12, step: 0.005 },
    { kind: 'select', key: 'tipStyle', label: 'Tip', group: 'Blade', options: [{ value: 'point', label: 'Point' }, { value: 'chisel', label: 'Chisel' }, { value: 'rounded', label: 'Rounded' }] },
    { kind: 'select', key: 'fuller', label: 'Fuller', group: 'Blade', options: [{ value: 'none', label: 'None' }, { value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }] },
    { kind: 'select', key: 'guardStyle', label: 'Guard', group: 'Guard', options: [{ value: 'straight', label: 'Straight' }, { value: 'curved', label: 'Curved' }, { value: 'cross', label: 'Cross' }, { value: 'short', label: 'Short' }] },
    { kind: 'range', key: 'guardWidth', label: 'Guard width', group: 'Guard', min: 0.32, max: 0.92, step: 0.01 },
    { kind: 'range', key: 'gripLength', label: 'Grip length', group: 'Grip', min: 0.34, max: 0.72, step: 0.01 },
    { kind: 'range', key: 'gripThickness', label: 'Grip thickness', group: 'Grip', min: 0.05, max: 0.115, step: 0.005 },
    { kind: 'select', key: 'pommelStyle', label: 'Pommel', group: 'Pommel', options: [{ value: 'round', label: 'Round' }, { value: 'diamond', label: 'Diamond' }, { value: 'flat', label: 'Flat' }, { value: 'spiked', label: 'Spiked' }] },
  ],
  materials: [
    { key: 'blade', label: 'Blade', options: metalOptions }, { key: 'guard', label: 'Guard', options: metalOptions }, { key: 'grip', label: 'Grip', options: gripOptions }, { key: 'accent', label: 'Accent', options: metalOptions },
  ],
  presets: swordPresets,
}

export function generatorForItem(item: ForgeItemDefinition) {
  const c = itemClassification(item)
  return c.itemType === 'weapon' && c.subtype === 'sword' ? swordGenerator : undefined
}

export function getItemGenerator(id: ForgeItemGeneratorId) { return id === swordGenerator.id ? swordGenerator : undefined }

export function itemGeneratorRecipe(item: ForgeItemDefinition): ForgeItemGeneratorRecipe | undefined {
  const generator = generatorForItem(item)
  if (!generator) return undefined
  const stored = (item as ForgeItemDefinition & { generatorRecipe?: ForgeItemGeneratorRecipe }).generatorRecipe
  if (stored?.generatorId === generator.id && stored.version === 1) return normalizeRecipe(generator, stored)
  return recipeFromPreset(generator, generator.presets[0], stableSeed(item.id))
}

export function recipeFromPreset(generator: ForgeItemGeneratorDefinition, preset: ForgeGeneratorPreset, seed: number): ForgeItemGeneratorRecipe {
  return { generatorId: generator.id, version: 1, seed: normalizeSeed(seed), preset: preset.id, params: { ...preset.params }, materials: { ...preset.materials } }
}

export function applyGeneratorPreset(recipe: ForgeItemGeneratorRecipe, presetId: string) {
  const generator = getItemGenerator(recipe.generatorId)
  if (!generator) return recipe
  const preset = generator.presets.find((entry) => entry.id === presetId) ?? generator.presets[0]
  return recipeFromPreset(generator, preset, recipe.seed)
}

export function randomizeGeneratorRecipe(recipe: ForgeItemGeneratorRecipe, seed = randomSeed()) {
  const generator = getItemGenerator(recipe.generatorId)
  if (!generator) return recipe
  const rng = mulberry32(normalizeSeed(seed))
  const params: Record<string, string | number | boolean> = {}
  for (const field of generator.fields) {
    if (field.kind === 'range') params[field.key] = snap(field.min + rng() * (field.max - field.min), field.step)
    else params[field.key] = field.options[Math.floor(rng() * field.options.length)]?.value ?? ''
  }
  const materials: Record<string, string> = {}
  for (const field of generator.materials) materials[field.key] = field.options[Math.floor(rng() * field.options.length)]?.value ?? ''
  return { ...recipe, seed: normalizeSeed(seed), preset: 'custom', params, materials }
}

export function mutateGeneratorRecipe(recipe: ForgeItemGeneratorRecipe, amount = 0.18, seed = randomSeed()) {
  const generator = getItemGenerator(recipe.generatorId)
  if (!generator) return recipe
  const rng = mulberry32(normalizeSeed(seed))
  const params = { ...recipe.params }
  for (const field of generator.fields) {
    if (field.kind === 'range') {
      const current = Number(params[field.key] ?? field.min)
      const radius = (field.max - field.min) * amount
      params[field.key] = snap(clamp(current + (rng() * 2 - 1) * radius, field.min, field.max), field.step)
    } else if (rng() < amount * 0.6) params[field.key] = field.options[Math.floor(rng() * field.options.length)]?.value ?? params[field.key]
  }
  return { ...recipe, seed: normalizeSeed(seed), preset: 'custom', params }
}

export function variationRecipes(recipe: ForgeItemGeneratorRecipe, count = 12) {
  const rng = mulberry32(recipe.seed ^ 1597334677)
  return Array.from({ length: count }, () => mutateGeneratorRecipe(recipe, 0.22, Math.floor(rng() * 2147483647)))
}

export function updateGeneratorParam(recipe: ForgeItemGeneratorRecipe, key: string, value: string | number | boolean) { return { ...recipe, preset: 'custom', params: { ...recipe.params, [key]: value } } }
export function updateGeneratorMaterial(recipe: ForgeItemGeneratorRecipe, key: string, value: string) { return { ...recipe, preset: 'custom', materials: { ...recipe.materials, [key]: value } } }

export function randomSeed() { return Math.max(1, Math.floor(Math.random() * 2147483646)) }

function normalizeRecipe(generator: ForgeItemGeneratorDefinition, recipe: ForgeItemGeneratorRecipe) {
  const base = recipeFromPreset(generator, generator.presets.find((entry) => entry.id === recipe.preset) ?? generator.presets[0], recipe.seed)
  return { ...base, ...recipe, params: { ...base.params, ...recipe.params }, materials: { ...base.materials, ...recipe.materials } }
}

function stableSeed(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) } return (hash >>> 1) || 1 }
function normalizeSeed(value: number) { const n = Math.abs(Math.floor(Number.isFinite(value) ? value : 1)); return (n || 1) & 2147483647 }
function mulberry32(seed: number) { let state = seed >>> 0; return () => { state += 1831565813; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function snap(value: number, step: number) { return Math.round(value / step) * step }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
