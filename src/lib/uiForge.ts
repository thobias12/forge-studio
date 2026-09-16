import { createDefaultHudLayout, type SkillboundHudLayout } from './hudForge'
import { createDefaultUiScreens, type SkillboundUiScreens } from './uiScreenForge'

export type UiForgeScreen = 'hud' | 'inventory' | 'character' | 'skills' | 'map' | 'quests' | 'pause' | 'main-menu' | 'character-select' | 'character-creator' | 'stash' | 'vendor' | 'crafting' | 'dialogue' | 'death'
export type UiForgePanelStyle = 'metal' | 'leather' | 'stone' | 'glass'
export type UiForgeAccent = 'bronze' | 'gold' | 'crimson' | 'arcane' | 'poison'
export type UiForgeOrnament = 'minimal' | 'medium' | 'ornate'
export type UiForgeCorner = 'sharp' | 'bevel' | 'runes'
export type UiForgeSlotStyle = 'inset' | 'etched' | 'clean'
export type UiForgeButtonStyle = 'solid' | 'ghost'
export type UiForgeDensity = 'compact' | 'comfortable'
export type UiForgeFontStyle = 'hybrid' | 'serif' | 'sans'

export type SkillboundUiTheme = {
  id: string
  name: string
  panelStyle: UiForgePanelStyle
  accent: UiForgeAccent
  accentColor: string
  accentSoft: string
  borderColor: string
  panelColor: string
  panelColorAlt: string
  textColor: string
  mutedTextColor: string
  healthColor: string
  manaColor: string
  poisonColor: string
  ornamentLevel: UiForgeOrnament
  cornerStyle: UiForgeCorner
  slotStyle: UiForgeSlotStyle
  buttonStyle: UiForgeButtonStyle
  density: UiForgeDensity
  fontStyle: UiForgeFontStyle
  uiScale: number
  fontScale: number
  transparency: number
  borderWidth: number
  shadowStrength: number
}

export type ForgeUiThemeDefinition = {
  format: 'forge-ui-theme'
  version: 1
  id: string
  projectId: string
  theme: SkillboundUiTheme
  hud?: SkillboundHudLayout
  screens?: SkillboundUiScreens
}

export type UiForgeViewport = {
  id: string
  label: string
  detail: string
  width: number
  height: number
}

export const UI_FORGE_VIEWPORTS: UiForgeViewport[] = [
  { id: 'hd', label: '1366×768', detail: 'Laptop', width: 1366, height: 768 },
  { id: 'fhd', label: '1920×1080', detail: '1080p', width: 1920, height: 1080 },
  { id: 'qhd', label: '2560×1440', detail: '1440p', width: 2560, height: 1440 },
  { id: 'ultrawide', label: '3440×1440', detail: '21:9', width: 3440, height: 1440 },
  { id: 'compact', label: '1280×720', detail: 'Compact', width: 1280, height: 720 },
]

export const UI_FORGE_PRESETS: SkillboundUiTheme[] = [
  {
    id: 'dark-arpg', name: 'Dark ARPG', panelStyle: 'metal', accent: 'bronze', accentColor: '#a77a3c', accentSoft: '#6f542f',
    borderColor: '#6f542f', panelColor: '#11161c', panelColorAlt: '#181e25', textColor: '#e8e0d2', mutedTextColor: '#8f98a2',
    healthColor: '#861f26', manaColor: '#245c8f', poisonColor: '#53734b', ornamentLevel: 'medium', cornerStyle: 'bevel',
    slotStyle: 'inset', buttonStyle: 'solid', density: 'comfortable', fontStyle: 'hybrid', uiScale: 1, fontScale: 1,
    transparency: 0.94, borderWidth: 1, shadowStrength: 0.7,
  },
  {
    id: 'clean-fantasy', name: 'Clean Fantasy', panelStyle: 'glass', accent: 'gold', accentColor: '#c49a57', accentSoft: '#7e6b4f',
    borderColor: '#605c52', panelColor: '#15191d', panelColorAlt: '#1d2328', textColor: '#f0eadf', mutedTextColor: '#9ba2a6',
    healthColor: '#8b3131', manaColor: '#316b9a', poisonColor: '#607b52', ornamentLevel: 'minimal', cornerStyle: 'bevel',
    slotStyle: 'clean', buttonStyle: 'ghost', density: 'comfortable', fontStyle: 'sans', uiScale: 1, fontScale: 1,
    transparency: 0.9, borderWidth: 1, shadowStrength: 0.45,
  },
  {
    id: 'rune-ornate', name: 'Rune / Ornate', panelStyle: 'stone', accent: 'gold', accentColor: '#c19a52', accentSoft: '#7c633e',
    borderColor: '#7d6842', panelColor: '#141617', panelColorAlt: '#20201d', textColor: '#efe5cf', mutedTextColor: '#9c9485',
    healthColor: '#7b1f24', manaColor: '#29557d', poisonColor: '#4f7043', ornamentLevel: 'ornate', cornerStyle: 'runes',
    slotStyle: 'etched', buttonStyle: 'solid', density: 'compact', fontStyle: 'serif', uiScale: 1, fontScale: 1,
    transparency: 0.96, borderWidth: 2, shadowStrength: 0.85,
  },
  {
    id: 'minimal-combat', name: 'Minimal Combat', panelStyle: 'metal', accent: 'crimson', accentColor: '#9e3940', accentSoft: '#633034',
    borderColor: '#4d535a', panelColor: '#10151a', panelColorAlt: '#171d23', textColor: '#e8ecef', mutedTextColor: '#89939c',
    healthColor: '#8f252b', manaColor: '#2a628f', poisonColor: '#4f7752', ornamentLevel: 'minimal', cornerStyle: 'sharp',
    slotStyle: 'clean', buttonStyle: 'ghost', density: 'compact', fontStyle: 'sans', uiScale: 0.96, fontScale: 0.96,
    transparency: 0.88, borderWidth: 1, shadowStrength: 0.3,
  },
]

export const UI_FORGE_ACCENTS: Record<UiForgeAccent, { label: string; color: string; soft: string }> = {
  bronze: { label: 'Bronze', color: '#a77a3c', soft: '#6f542f' },
  gold: { label: 'Gold', color: '#c49a57', soft: '#7e6b4f' },
  crimson: { label: 'Crimson', color: '#a23a42', soft: '#653239' },
  arcane: { label: 'Arcane blue', color: '#4382b7', soft: '#2c5678' },
  poison: { label: 'Poison green', color: '#678854', soft: '#455d3c' },
}

export function cloneUiForgePreset(id: string): SkillboundUiTheme {
  const preset = UI_FORGE_PRESETS.find((item) => item.id === id) ?? UI_FORGE_PRESETS[0]
  return { ...preset }
}

export function createDefaultSkillboundUiDefinition(): ForgeUiThemeDefinition {
  return {
    format: 'forge-ui-theme',
    version: 1,
    id: 'skillbound-ui',
    projectId: 'skillbound',
    theme: cloneUiForgePreset('dark-arpg'),
    hud: createDefaultHudLayout(),
    screens: createDefaultUiScreens(),
  }
}

export function withAccent(theme: SkillboundUiTheme, accent: UiForgeAccent): SkillboundUiTheme {
  const next = UI_FORGE_ACCENTS[accent]
  return { ...theme, accent, accentColor: next.color, accentSoft: next.soft, borderColor: next.soft }
}

export function uiForgeFontStack(style: UiForgeFontStyle) {
  if (style === 'serif') return 'Georgia, Cambria, "Times New Roman", serif'
  if (style === 'sans') return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

export function skillboundUiCssVariables(theme: SkillboundUiTheme): Record<string, string> {
  return {
    '--sb-accent': theme.accentColor,
    '--sb-accent-soft': theme.accentSoft,
    '--sb-border': theme.borderColor,
    '--sb-panel': hexAlpha(theme.panelColor, theme.transparency),
    '--sb-panel-alt': hexAlpha(theme.panelColorAlt, Math.min(1, theme.transparency + 0.03)),
    '--sb-text': theme.textColor,
    '--sb-muted': theme.mutedTextColor,
    '--sb-health': theme.healthColor,
    '--sb-mana': theme.manaColor,
    '--sb-poison': theme.poisonColor,
    '--sb-border-width': `${theme.borderWidth}px`,
    '--sb-shadow': `${theme.shadowStrength}`,
    '--sb-ui-scale': `${theme.uiScale}`,
    '--sb-font-scale': `${theme.fontScale}`,
    '--sb-font': uiForgeFontStack(theme.fontStyle),
    '--sb-gap': theme.density === 'compact' ? '8px' : '12px',
    '--sb-radius': theme.cornerStyle === 'sharp' ? '2px' : theme.cornerStyle === 'runes' ? '9px' : '6px',
  }
}

function hexAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const value = clean.length === 3 ? clean.split('').map((item) => item + item).join('') : clean
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
