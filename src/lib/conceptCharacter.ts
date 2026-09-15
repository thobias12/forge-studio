import { cloneForgeCharacterConfig, createProceduralCharacter, disposeForgeCharacter, type ForgeCharacterConfig, type ForgeCharacterSpecies } from './proceduralCharacter'

export type ConceptSpeciesHint = ForgeCharacterSpecies | 'auto'

export type ConceptAnalysis = {
  sourceName: string
  species: ForgeCharacterSpecies
  confidence: number
  width: number
  height: number
  aspect: number
  palette: { primary: string; secondary: string; accent: string }
  metrics: { averageLuminance: number; averageSaturation: number; warmRatio: number; greenRatio: number; neutralLightRatio: number }
}

export type ConceptValidation = {
  bones: number
  skinnedMeshes: number
  triangles: number
  rig: 'ForgeHumanoidV1'
  gameReady: boolean
}

const DEFAULT_PALETTES: Record<ForgeCharacterSpecies, ConceptAnalysis['palette']> = {
  skeleton: { primary: '#b8b19c', secondary: '#242a2f', accent: '#6e3c3f' },
  zombie: { primary: '#596a59', secondary: '#3f302b', accent: '#6e3c37' },
  bandit: { primary: '#95705b', secondary: '#293540', accent: '#76532f' },
}

export async function analyzeConceptFile(file: File, hint: ConceptSpeciesHint = 'auto'): Promise<ConceptAnalysis> {
  const bitmap = await createImageBitmap(file)
  const sourceWidth = bitmap.width
  const sourceHeight = bitmap.height
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Concept analysis could not start a canvas context.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  const samples: Sample[] = []
  let luminanceTotal = 0
  let saturationTotal = 0
  let warm = 0
  let green = 0
  let neutralLight = 0
  let sampled = 0

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const hsl = rgbToHsl(r, g, b)
    const luminance = hsl.l
    luminanceTotal += luminance
    saturationTotal += hsl.s
    sampled += 1
    if ((hsl.h < 48 || hsl.h > 330) && hsl.s > 0.18 && luminance > 0.12 && luminance < 0.76) warm += 1
    if (hsl.h > 65 && hsl.h < 175 && hsl.s > 0.08 && luminance > 0.12 && luminance < 0.72) green += 1
    if (hsl.s < 0.24 && luminance > 0.43 && luminance < 0.9) neutralLight += 1
    if (luminance > 0.08 && luminance < 0.92) samples.push({ r, g, b, ...hsl })
  }

  const total = Math.max(1, sampled)
  const metrics = {
    averageLuminance: luminanceTotal / total,
    averageSaturation: saturationTotal / total,
    warmRatio: warm / total,
    greenRatio: green / total,
    neutralLightRatio: neutralLight / total,
  }
  const species = hint === 'auto' ? inferSpecies(file.name, metrics) : hint
  const palette = extractPalette(samples, species)
  const confidence = hint === 'auto' ? inferConfidence(file.name, species, metrics) : 1

  return {
    sourceName: file.name,
    species,
    confidence,
    width: sourceWidth,
    height: sourceHeight,
    aspect: sourceHeight > 0 ? sourceWidth / sourceHeight : 1,
    palette,
    metrics,
  }
}

export function createFallbackConceptAnalysis(species: ForgeCharacterSpecies = 'skeleton'): ConceptAnalysis {
  return {
    sourceName: `Approved ${label(species)} target`,
    species,
    confidence: 1,
    width: 0,
    height: 0,
    aspect: 4 / 3,
    palette: { ...DEFAULT_PALETTES[species] },
    metrics: { averageLuminance: 0.34, averageSaturation: 0.28, warmRatio: species === 'bandit' ? 0.22 : 0.12, greenRatio: species === 'zombie' ? 0.3 : 0.04, neutralLightRatio: species === 'skeleton' ? 0.26 : 0.08 },
  }
}

export function buildConfigFromConcept(analysis: ConceptAnalysis): ForgeCharacterConfig {
  const config = cloneForgeCharacterConfig(analysis.species)
  const palette = analysis.palette
  if (analysis.species === 'skeleton') {
    Object.assign(config, { name: 'Crypt Skeleton Concept', height: 1.05, bulk: 1.07, shoulders: 1.12, headScale: 0.94, armLength: 1.03, legLength: 1.01, asymmetry: 0.08, armor: 'scrap', headwear: 'none', weapon: 'none' })
  } else if (analysis.species === 'zombie') {
    Object.assign(config, { name: 'Crypt Zombie Concept', height: 1.08, bulk: 1.22, shoulders: 1.13, headScale: 1.02, armLength: 1.06, legLength: 0.98, asymmetry: 0.4, armor: 'none', headwear: 'none', weapon: 'none' })
  } else {
    Object.assign(config, { name: 'Dungeon Bandit Concept', height: 1.02, bulk: 1.12, shoulders: 1.14, headScale: 0.94, armLength: 1, legLength: 1, asymmetry: 0.04, armor: 'scrap', headwear: 'hood', weapon: 'none' })
  }
  config.primary = palette.primary
  config.secondary = palette.secondary
  config.accent = palette.accent
  return config
}

export function validateConceptBuild(config: ForgeCharacterConfig): ConceptValidation {
  const build = createProceduralCharacter(config)
  const result: ConceptValidation = {
    bones: build.stats.bones,
    skinnedMeshes: build.stats.skinnedMeshes,
    triangles: build.stats.triangles,
    rig: 'ForgeHumanoidV1',
    gameReady: build.stats.bones >= 18 && build.stats.skinnedMeshes > 0 && build.stats.triangles > 250,
  }
  disposeForgeCharacter(build.root)
  return result
}

export function conceptRecipe(species: ForgeCharacterSpecies) {
  if (species === 'skeleton') return ['Skull + jaw', 'Rib cage + pelvis', 'Bone limbs + hands', 'Armor shells', 'Tattered cloth', 'Item Forge hand socket']
  if (species === 'zombie') return ['Hunched body', 'Damaged head', 'Asymmetric limbs', 'Torn cloth layers', 'Wounds + wraps', 'External weapon socket']
  return ['Human base', 'Headwear + face', 'Chest layers', 'Bracers + belt', 'Boots + cloth panels', 'External weapon socket']
}

function inferSpecies(filename: string, metrics: ConceptAnalysis['metrics']): ForgeCharacterSpecies {
  const name = filename.toLowerCase()
  if (name.includes('skeleton') || name.includes('skull') || name.includes('bone')) return 'skeleton'
  if (name.includes('zombie') || name.includes('undead') || name.includes('corpse')) return 'zombie'
  if (name.includes('bandit') || name.includes('rogue') || name.includes('human')) return 'bandit'
  if (metrics.greenRatio > 0.17) return 'zombie'
  if (metrics.neutralLightRatio > 0.18 && metrics.averageSaturation < 0.32) return 'skeleton'
  return 'bandit'
}

function inferConfidence(filename: string, species: ForgeCharacterSpecies, metrics: ConceptAnalysis['metrics']) {
  const name = filename.toLowerCase()
  if (name.includes(species) || (species === 'skeleton' && name.includes('skull'))) return 0.98
  if (species === 'zombie') return clamp(0.58 + metrics.greenRatio * 1.3, 0.55, 0.92)
  if (species === 'skeleton') return clamp(0.56 + metrics.neutralLightRatio * 1.2, 0.55, 0.9)
  return 0.68
}

function extractPalette(samples: Sample[], species: ForgeCharacterSpecies) {
  const defaults = DEFAULT_PALETTES[species]
  if (!samples.length) return { ...defaults }

  let primaryPool: Sample[]
  if (species === 'skeleton') primaryPool = samples.filter((sample) => sample.s < 0.3 && sample.l > 0.45 && sample.l < 0.86)
  else if (species === 'zombie') primaryPool = samples.filter((sample) => sample.h > 55 && sample.h < 175 && sample.s > 0.06 && sample.l > 0.2 && sample.l < 0.68)
  else primaryPool = samples.filter((sample) => (sample.h < 55 || sample.h > 330) && sample.s > 0.08 && sample.l > 0.28 && sample.l < 0.75)

  const darkPool = samples.filter((sample) => sample.l > 0.09 && sample.l < 0.34 && sample.s < 0.62)
  const accentPool = samples.filter((sample) => (sample.h < 45 || sample.h > 325) && sample.s > 0.2 && sample.l > 0.13 && sample.l < 0.62)
  return {
    primary: representative(primaryPool, defaults.primary),
    secondary: representative(darkPool, defaults.secondary),
    accent: representative(accentPool, defaults.accent),
  }
}

type Sample = { r: number; g: number; b: number; h: number; s: number; l: number }

function representative(samples: Sample[], fallback: string) {
  if (!samples.length) return fallback
  const bins = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (const sample of samples) {
    const key = `${Math.round(sample.r * 7)}:${Math.round(sample.g * 7)}:${Math.round(sample.b * 7)}`
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bin.count += 1; bin.r += sample.r; bin.g += sample.g; bin.b += sample.b; bins.set(key, bin)
  }
  const best = [...bins.values()].sort((a, b) => b.count - a.count)[0]
  if (!best) return fallback
  return rgbHex(best.r / best.count, best.g / best.count, best.b / best.count)
}

function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: Number.isFinite(s) ? s : 0, l }
}

function rgbHex(r: number, g: number, b: number) {
  const channel = (value: number) => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
function label(species: ForgeCharacterSpecies) { return species === 'skeleton' ? 'Crypt Skeleton' : species === 'zombie' ? 'Crypt Zombie' : 'Dungeon Bandit' }
