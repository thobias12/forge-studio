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
  { value: 'rusted-iron', label: 'Rusted iron' },
  { value: 'blackened-steel', label: 'Blackened steel' },
  { value: 'silvered-steel', label: 'Silvered steel' },
  { value: 'bronze', label: 'Bronze' },
]

const gripOptions = [
  { value: 'brown-leather', label: 'Brown leather' },
  { value: 'black-leather', label: 'Black leather' },
  { value: 'red-leather', label: 'Red leather' },
  { value: 'tan-leather', label: 'Tan leather' },
  { value: 'cloth', label: 'Dark cloth' },
  { value: 'wood', label: 'Wood' },
]

const swordPresets: ForgeGeneratorPreset[] = [
  {
    id: 'rusted-soldier', label: 'Rusted Soldier', description: 'Old infantry sword with a worn broad blade and simple fittings.',
    params: { bladeStyle: 'arming', bladeLength: 1.5, bladeWidth: 0.25, bladeThickness: 0.075, bladeTaper: 0.42, crossSection: 'diamond', tipStyle: 'point', fuller: 'single-long', guardStyle: 'downturned', guardWidth: 0.64, guardThickness: 0.075, guardTip: 'plain', gripLength: 0.48, gripThickness: 0.078, gripTaper: 0.14, gripStyle: 'leather-bands', pommelStyle: 'scent-stopper', wearStyle: 'rusted', wearAmount: 0.62 },
    materials: { blade: 'rusted-iron', guard: 'dark-iron', grip: 'brown-leather', accent: 'bronze' },
  },
  {
    id: 'knight', label: 'Knight', description: 'Balanced arming sword with a faceted polished blade and classic crossguard.',
    params: { bladeStyle: 'arming', bladeLength: 1.68, bladeWidth: 0.205, bladeThickness: 0.065, bladeTaper: 0.56, crossSection: 'diamond', tipStyle: 'spear', fuller: 'single-short', guardStyle: 'straight', guardWidth: 0.72, guardThickness: 0.06, guardTip: 'knob', gripLength: 0.52, gripThickness: 0.068, gripTaper: 0.08, gripStyle: 'spiral', pommelStyle: 'wheel', wearStyle: 'clean', wearAmount: 0.08 },
    materials: { blade: 'steel', guard: 'steel', grip: 'black-leather', accent: 'bronze' },
  },
  {
    id: 'raider', label: 'Raider', description: 'Heavy crude blade with aggressive asymmetry and rough forged fittings.',
    params: { bladeStyle: 'jagged', bladeLength: 1.38, bladeWidth: 0.31, bladeThickness: 0.105, bladeTaper: 0.22, crossSection: 'hex', tipStyle: 'broken', fuller: 'none', guardStyle: 'asymmetric', guardWidth: 0.8, guardThickness: 0.1, guardTip: 'spike', gripLength: 0.46, gripThickness: 0.095, gripTaper: 0.18, gripStyle: 'cloth-wrap', pommelStyle: 'spiked', wearStyle: 'crude', wearAmount: 0.82 },
    materials: { blade: 'dark-iron', guard: 'rusted-iron', grip: 'red-leather', accent: 'iron' },
  },
  {
    id: 'duelist', label: 'Duelist', description: 'Narrow elegant blade with swept guard and a long controlled grip.',
    params: { bladeStyle: 'tapered', bladeLength: 1.78, bladeWidth: 0.15, bladeThickness: 0.05, bladeTaper: 0.72, crossSection: 'diamond', tipStyle: 'spear', fuller: 'double', guardStyle: 'swept', guardWidth: 0.58, guardThickness: 0.052, guardTip: 'knob', gripLength: 0.6, gripThickness: 0.06, gripTaper: 0.04, gripStyle: 'smooth', pommelStyle: 'faceted', wearStyle: 'noble', wearAmount: 0.04 },
    materials: { blade: 'silvered-steel', guard: 'blackened-steel', grip: 'black-leather', accent: 'silvered-steel' },
  },
  {
    id: 'militia', label: 'Militia', description: 'Short practical sword assembled from inexpensive, sturdy components.',
    params: { bladeStyle: 'straight', bladeLength: 1.28, bladeWidth: 0.2, bladeThickness: 0.08, bladeTaper: 0.3, crossSection: 'flat-bevel', tipStyle: 'point', fuller: 'none', guardStyle: 'block', guardWidth: 0.5, guardThickness: 0.09, guardTip: 'plain', gripLength: 0.42, gripThickness: 0.085, gripTaper: 0.12, gripStyle: 'wood-ribbed', pommelStyle: 'cap', wearStyle: 'worn', wearAmount: 0.45 },
    materials: { blade: 'weathered-steel', guard: 'iron', grip: 'wood', accent: 'iron' },
  },
  {
    id: 'crypt-blade', label: 'Crypt Blade', description: 'Unsettling ancient sword with a leaf-like silhouette and funerary fittings.',
    params: { bladeStyle: 'leaf', bladeLength: 1.58, bladeWidth: 0.24, bladeThickness: 0.075, bladeTaper: 0.52, crossSection: 'diamond', tipStyle: 'spear', fuller: 'single-short', guardStyle: 'upturned', guardWidth: 0.66, guardThickness: 0.065, guardTip: 'spike', gripLength: 0.5, gripThickness: 0.072, gripTaper: 0.1, gripStyle: 'leather-bands', pommelStyle: 'diamond', wearStyle: 'undead', wearAmount: 0.7 },
    materials: { blade: 'blackened-steel', guard: 'dark-iron', grip: 'black-leather', accent: 'bronze' },
  },
  {
    id: 'noble-guard', label: 'Noble Guard', description: 'Ceremonial but combat-capable sword with clean proportions and bright trim.',
    params: { bladeStyle: 'broad', bladeLength: 1.64, bladeWidth: 0.22, bladeThickness: 0.06, bladeTaper: 0.48, crossSection: 'hex', tipStyle: 'spear', fuller: 'double', guardStyle: 'crescent', guardWidth: 0.7, guardThickness: 0.055, guardTip: 'knob', gripLength: 0.54, gripThickness: 0.068, gripTaper: 0.06, gripStyle: 'spiral', pommelStyle: 'wheel', wearStyle: 'noble', wearAmount: 0.02 },
    materials: { blade: 'silvered-steel', guard: 'bronze', grip: 'tan-leather', accent: 'bronze' },
  },
]

const swordGenerator: ForgeItemGeneratorDefinition = {
  id: 'weapon.sword',
  label: 'Procedural Sword',
  description: 'Silhouette-driven low-poly sword generator. Family, fittings and wear stay editable; the GLB is generated output.',
  fields: [
    { kind: 'select', key: 'bladeStyle', label: 'Blade family', group: 'Blade silhouette', options: [{ value: 'arming', label: 'Arming' }, { value: 'straight', label: 'Straight' }, { value: 'broad', label: 'Broad' }, { value: 'tapered', label: 'Tapered' }, { value: 'falchion', label: 'Falchion' }, { value: 'leaf', label: 'Leaf' }, { value: 'jagged', label: 'Jagged' }] },
    { kind: 'range', key: 'bladeLength', label: 'Length', group: 'Blade silhouette', min: 1.05, max: 2.05, step: 0.01 },
    { kind: 'range', key: 'bladeWidth', label: 'Base width', group: 'Blade silhouette', min: 0.11, max: 0.36, step: 0.005 },
    { kind: 'range', key: 'bladeTaper', label: 'Taper', group: 'Blade silhouette', min: 0, max: 1, step: 0.01 },
    { kind: 'range', key: 'bladeThickness', label: 'Thickness', group: 'Blade construction', min: 0.04, max: 0.12, step: 0.005 },
    { kind: 'select', key: 'crossSection', label: 'Cross section', group: 'Blade construction', options: [{ value: 'diamond', label: 'Diamond bevel' }, { value: 'hex', label: 'Hex bevel' }, { value: 'flat-bevel', label: 'Flat bevel' }] },
    { kind: 'select', key: 'tipStyle', label: 'Tip', group: 'Blade construction', options: [{ value: 'point', label: 'Point' }, { value: 'spear', label: 'Spear point' }, { value: 'chisel', label: 'Chisel' }, { value: 'rounded', label: 'Rounded' }, { value: 'broken', label: 'Broken / damaged' }] },
    { kind: 'select', key: 'fuller', label: 'Fuller', group: 'Blade construction', options: [{ value: 'none', label: 'None' }, { value: 'single-short', label: 'Single short' }, { value: 'single-long', label: 'Single long' }, { value: 'double', label: 'Double' }] },
    { kind: 'select', key: 'guardStyle', label: 'Guard family', group: 'Guard', options: [{ value: 'straight', label: 'Straight' }, { value: 'downturned', label: 'Downturned' }, { value: 'upturned', label: 'Upturned' }, { value: 'swept', label: 'Swept' }, { value: 'crescent', label: 'Crescent' }, { value: 'block', label: 'Block' }, { value: 'asymmetric', label: 'Asymmetric' }] },
    { kind: 'range', key: 'guardWidth', label: 'Width', group: 'Guard', min: 0.32, max: 0.94, step: 0.01 },
    { kind: 'range', key: 'guardThickness', label: 'Thickness', group: 'Guard', min: 0.045, max: 0.12, step: 0.005 },
    { kind: 'select', key: 'guardTip', label: 'Quillon tips', group: 'Guard', options: [{ value: 'plain', label: 'Plain' }, { value: 'knob', label: 'Knob' }, { value: 'spike', label: 'Spike' }] },
    { kind: 'range', key: 'gripLength', label: 'Length', group: 'Grip', min: 0.34, max: 0.72, step: 0.01 },
    { kind: 'range', key: 'gripThickness', label: 'Thickness', group: 'Grip', min: 0.05, max: 0.115, step: 0.005 },
    { kind: 'range', key: 'gripTaper', label: 'Taper', group: 'Grip', min: 0, max: 0.32, step: 0.01 },
    { kind: 'select', key: 'gripStyle', label: 'Wrap', group: 'Grip', options: [{ value: 'leather-bands', label: 'Leather bands' }, { value: 'spiral', label: 'Spiral wrap' }, { value: 'smooth', label: 'Smooth leather' }, { value: 'wood-ribbed', label: 'Ribbed wood' }, { value: 'cloth-wrap', label: 'Cloth wrap' }] },
    { kind: 'select', key: 'pommelStyle', label: 'Pommel', group: 'Pommel', options: [{ value: 'wheel', label: 'Wheel' }, { value: 'faceted', label: 'Faceted' }, { value: 'scent-stopper', label: 'Scent stopper' }, { value: 'diamond', label: 'Diamond' }, { value: 'round', label: 'Round' }, { value: 'cap', label: 'Cap' }, { value: 'spiked', label: 'Spiked' }] },
    { kind: 'select', key: 'wearStyle', label: 'Style', group: 'Finish', options: [{ value: 'clean', label: 'Clean' }, { value: 'worn', label: 'Worn' }, { value: 'rusted', label: 'Rusted' }, { value: 'crude', label: 'Crude forged' }, { value: 'noble', label: 'Noble' }, { value: 'undead', label: 'Undead / crypt' }] },
    { kind: 'range', key: 'wearAmount', label: 'Wear amount', group: 'Finish', min: 0, max: 1, step: 0.01 },
  ],
  materials: [
    { key: 'blade', label: 'Blade', options: metalOptions },
    { key: 'guard', label: 'Guard', options: metalOptions },
    { key: 'grip', label: 'Grip', options: gripOptions },
    { key: 'accent', label: 'Accent', options: metalOptions },
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
  const normalized = normalizeSeed(seed)
  const rng = mulberry32(normalized)
  const family = generator.presets[Math.floor(rng() * generator.presets.length)] ?? generator.presets[0]
  const base = recipeFromPreset(generator, family, normalized)
  return mutateGeneratorRecipe(base, 0.2, normalized ^ 0x5f356495)
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
    } else if (rng() < amount * 0.32) {
      params[field.key] = field.options[Math.floor(rng() * field.options.length)]?.value ?? params[field.key]
    }
  }
  const materials = { ...recipe.materials }
  for (const field of generator.materials) {
    if (rng() < amount * 0.18) materials[field.key] = field.options[Math.floor(rng() * field.options.length)]?.value ?? materials[field.key]
  }
  return { ...recipe, seed: normalizeSeed(seed), preset: 'custom', params, materials }
}

export function variationRecipes(recipe: ForgeItemGeneratorRecipe, count = 12) {
  const rng = mulberry32(recipe.seed ^ 1597334677)
  return Array.from({ length: count }, () => mutateGeneratorRecipe(recipe, 0.18, Math.floor(rng() * 2147483647)))
}

export function updateGeneratorParam(recipe: ForgeItemGeneratorRecipe, key: string, value: string | number | boolean) { return { ...recipe, preset: 'custom', params: { ...recipe.params, [key]: value } } }
export function updateGeneratorMaterial(recipe: ForgeItemGeneratorRecipe, key: string, value: string) { return { ...recipe, preset: 'custom', materials: { ...recipe.materials, [key]: value } } }

export function randomSeed() { return Math.max(1, Math.floor(Math.random() * 2147483646)) }

function normalizeRecipe(generator: ForgeItemGeneratorDefinition, recipe: ForgeItemGeneratorRecipe) {
  const preset = generator.presets.find((entry) => entry.id === recipe.preset) ?? generator.presets[0]
  const base = recipeFromPreset(generator, preset, recipe.seed)
  return { ...base, ...recipe, params: { ...base.params, ...recipe.params }, materials: { ...base.materials, ...recipe.materials } }
}

function stableSeed(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) } return (hash >>> 1) || 1 }
function normalizeSeed(value: number) { const n = Math.abs(Math.floor(Number.isFinite(value) ? value : 1)); return (n || 1) & 2147483647 }
function mulberry32(seed: number) { let state = seed >>> 0; return () => { state += 1831565813; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function snap(value: number, step: number) { return Math.round(value / step) * step }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
