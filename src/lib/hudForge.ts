export type SkillboundHudModuleId =
  | 'health'
  | 'resource'
  | 'hotbar'
  | 'potions'
  | 'xp'
  | 'gold'
  | 'minimap'
  | 'objective'
  | 'buffs'
  | 'debuffs'
  | 'party'
  | 'target'
  | 'boss'
  | 'cast'
  | 'interaction'
  | 'loot'
  | 'combatText'
  | 'inventory'

export type SkillboundHudAnchor = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type SkillboundHudPresetId = 'classic-arpg' | 'compact' | 'minimal' | 'ultrawide'
export type SkillboundHudPreviewMode = 'exploration' | 'combat' | 'boss' | 'low-health'
export type SkillboundHudDisplayMode = 'orb' | 'bar' | 'compact' | 'icons' | 'list'
export type SkillboundHudOrientation = 'horizontal' | 'vertical'
export type SkillboundHudVisibilityRule = 'always' | 'combat' | 'context'

export type HudEditorGrid = {
  columns: number
  rows: number
  snap: boolean
  show: boolean
}

export type SkillboundHudModule = {
  id: SkillboundHudModuleId
  visible: boolean
  anchor: SkillboundHudAnchor
  offsetX: number
  offsetY: number
  scale: number
  widthScale: number
  heightScale: number
  opacity: number
  displayMode: SkillboundHudDisplayMode
  orientation: SkillboundHudOrientation
  slotCount: number
  showNumbers: boolean
  showLabels: boolean
  visibilityRule: SkillboundHudVisibilityRule
}

export type SkillboundHudLayout = {
  format: 'forge-hud-layout'
  version: 1
  preset: SkillboundHudPresetId | 'custom'
  preview: SkillboundHudPreviewMode
  grid: HudEditorGrid
  modules: Record<SkillboundHudModuleId, SkillboundHudModule>
}

export const HUD_PREVIEW_MODES: Array<{ id: SkillboundHudPreviewMode; label: string; detail: string }> = [
  { id: 'exploration', label: 'Exploration', detail: 'Normal traversal with utility HUD visible.' },
  { id: 'combat', label: 'Combat', detail: 'Enemy target, cooldowns, buffs and combat feedback.' },
  { id: 'boss', label: 'Boss Fight', detail: 'Boss frame, debuffs, cast bar and combat pressure.' },
  { id: 'low-health', label: 'Low Health', detail: 'Critical life state for readability testing.' },
]

export const HUD_MODULES: Array<{ id: SkillboundHudModuleId; label: string; detail: string; runtime: 'Live' | 'Authored' }> = [
  { id: 'health', label: 'Health orb', detail: 'Player health. Classic layout uses one red liquid orb.', runtime: 'Live' },
  { id: 'resource', label: 'Mana orb', detail: 'Player mana/class resource. Classic layout uses one blue liquid orb.', runtime: 'Authored' },
  { id: 'hotbar', label: 'Skill hotbar', detail: 'Active abilities, keys and cooldowns.', runtime: 'Live' },
  { id: 'potions', label: 'Potion bar', detail: 'Consumables, charges and hotkeys.', runtime: 'Authored' },
  { id: 'xp', label: 'XP / level', detail: 'Experience progress and current level.', runtime: 'Authored' },
  { id: 'gold', label: 'Gold', detail: 'Primary currency counter.', runtime: 'Authored' },
  { id: 'minimap', label: 'Minimap', detail: 'Player, objectives, portals and nearby markers.', runtime: 'Authored' },
  { id: 'objective', label: 'Objective tracker', detail: 'Tracked quest and current objective.', runtime: 'Live' },
  { id: 'buffs', label: 'Buffs', detail: 'Positive status icons and timers.', runtime: 'Authored' },
  { id: 'debuffs', label: 'Debuffs', detail: 'Negative status icons and timers.', runtime: 'Authored' },
  { id: 'party', label: 'Party frames', detail: 'Player/party portraits, life and resource.', runtime: 'Authored' },
  { id: 'target', label: 'Target frame', detail: 'Normal enemy health, name and status.', runtime: 'Live' },
  { id: 'boss', label: 'Boss frame', detail: 'Boss health, phases and status markers.', runtime: 'Live' },
  { id: 'cast', label: 'Cast / channel bar', detail: 'Cast, channel and interrupt progress.', runtime: 'Authored' },
  { id: 'interaction', label: 'Interaction prompt', detail: 'Context action and key prompt.', runtime: 'Live' },
  { id: 'loot', label: 'Loot feed', detail: 'Pickup notifications and item rarity.', runtime: 'Live' },
  { id: 'combatText', label: 'Combat text', detail: 'Damage, healing and critical feedback.', runtime: 'Authored' },
  { id: 'inventory', label: 'Quick inventory', detail: 'Compact inventory/equipment shortcut.', runtime: 'Live' },
]

export const HUD_ANCHORS: Array<{ id: SkillboundHudAnchor; label: string }> = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-center', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'center-left', label: 'Center left' },
  { id: 'center', label: 'Center' },
  { id: 'center-right', label: 'Center right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'bottom-right', label: 'Bottom right' },
]

const DEFAULT_GRID: HudEditorGrid = { columns: 24, rows: 14, snap: true, show: true }

const defaultModuleOptions: Pick<SkillboundHudModule, 'widthScale' | 'heightScale' | 'displayMode' | 'orientation' | 'slotCount' | 'showNumbers' | 'showLabels' | 'visibilityRule'> = {
  widthScale: 1,
  heightScale: 1,
  displayMode: 'compact',
  orientation: 'horizontal',
  slotCount: 6,
  showNumbers: true,
  showLabels: true,
  visibilityRule: 'always',
}

const classic = layout('classic-arpg', {
  health: module('health', 'bottom-center', -17.2, -3.2, 1, 1, { displayMode: 'orb' }),
  resource: module('resource', 'bottom-center', 17.2, -3.2, 1, 1, { displayMode: 'orb' }),
  hotbar: module('hotbar', 'bottom-center', 0, -3.2, 1, 1, { slotCount: 6 }),
  potions: module('potions', 'bottom-center', -28.5, -3.2, .92, 1, { slotCount: 4 }),
  xp: module('xp', 'bottom-center', 0, -.7, 1, .94, { displayMode: 'bar', showLabels: false }),
  gold: module('gold', 'bottom-center', -28.5, -10.5, .9, .98, { displayMode: 'compact' }),
  minimap: module('minimap', 'top-right', -2.1, 2.2, 1, .98),
  objective: module('objective', 'top-right', -2.1, 20, .92, .98, { visibilityRule: 'context' }),
  buffs: module('buffs', 'top-left', 2.1, 12.5, .9, .96, { displayMode: 'icons', slotCount: 8, showLabels: false, visibilityRule: 'context' }),
  debuffs: module('debuffs', 'top-left', 2.1, 18.5, .9, .96, { displayMode: 'icons', slotCount: 6, showLabels: false, visibilityRule: 'combat' }),
  party: module('party', 'top-left', 2.1, 2.2, .9, .98, { displayMode: 'list', orientation: 'vertical', slotCount: 4 }),
  target: module('target', 'top-center', 0, 4.6, 1, 1, { displayMode: 'bar', visibilityRule: 'combat' }),
  boss: module('boss', 'top-center', 0, 9.6, 1.06, 1, { displayMode: 'bar', visibilityRule: 'context' }),
  cast: module('cast', 'bottom-center', 0, -13.2, .96, 1, { displayMode: 'bar', visibilityRule: 'context' }),
  interaction: module('interaction', 'bottom-center', 0, -18.2, .94, 1, { visibilityRule: 'context' }),
  loot: module('loot', 'center-right', -2.2, 8, .9, .95, { displayMode: 'list', orientation: 'vertical', slotCount: 4, visibilityRule: 'context' }),
  combatText: module('combatText', 'center', 0, -10, 1, 1, { displayMode: 'compact', showLabels: false, visibilityRule: 'combat' }),
  inventory: module('inventory', 'top-right', -2.1, 39, .88, .96, { displayMode: 'list', slotCount: 3, visibilityRule: 'context' }, false),
})

const compact = layout('compact', {
  health: module('health', 'bottom-left', 1.8, -2.1, .82, 1, { displayMode: 'bar' }),
  resource: module('resource', 'bottom-left', 1.8, -7.3, .82, 1, { displayMode: 'bar' }),
  hotbar: module('hotbar', 'bottom-center', 0, -1.9, .86, .96, { slotCount: 5 }),
  potions: module('potions', 'bottom-right', -1.8, -2, .8, .96, { slotCount: 3 }),
  xp: module('xp', 'bottom-center', 0, -.4, .9, .9, { displayMode: 'bar', showLabels: false }),
  gold: module('gold', 'bottom-right', -1.8, -9, .8, .94, { displayMode: 'compact' }),
  minimap: module('minimap', 'top-right', -1.6, 1.8, .82, .94),
  objective: module('objective', 'top-right', -1.8, 15, .8, .92, { visibilityRule: 'context' }),
  buffs: module('buffs', 'top-left', 1.6, 9.5, .78, .92, { displayMode: 'icons', slotCount: 6, showLabels: false, visibilityRule: 'context' }),
  debuffs: module('debuffs', 'top-left', 1.6, 14.5, .78, .92, { displayMode: 'icons', slotCount: 5, showLabels: false, visibilityRule: 'combat' }),
  party: module('party', 'top-left', 1.6, 1.6, .78, .94, { displayMode: 'list', orientation: 'vertical', slotCount: 3 }),
  target: module('target', 'top-center', 0, 4, .88, 1, { displayMode: 'bar', visibilityRule: 'combat' }),
  boss: module('boss', 'top-center', 0, 8.3, .94, 1, { displayMode: 'bar', visibilityRule: 'context' }),
  cast: module('cast', 'bottom-center', 0, -10, .84, .96, { displayMode: 'bar', visibilityRule: 'context' }),
  interaction: module('interaction', 'bottom-center', 0, -13.8, .82, .96, { visibilityRule: 'context' }),
  loot: module('loot', 'center-right', -1.6, 6, .78, .9, { displayMode: 'list', orientation: 'vertical', slotCount: 3, visibilityRule: 'context' }),
  combatText: module('combatText', 'center', 0, -9, .86, .96, { showLabels: false, visibilityRule: 'combat' }),
  inventory: module('inventory', 'top-right', -1.6, 33, .78, .9, { displayMode: 'list', slotCount: 2 }, false),
})

const minimal = layout('minimal', {
  health: module('health', 'bottom-left', 1.6, -1.8, .78, .92, { displayMode: 'bar', showLabels: false }),
  resource: module('resource', 'bottom-left', 1.6, -6.4, .78, .92, { displayMode: 'bar', showLabels: false }),
  hotbar: module('hotbar', 'bottom-center', 0, -1.6, .8, .92, { slotCount: 4, showLabels: false }),
  potions: module('potions', 'bottom-right', -1.4, -1.7, .74, .9, { slotCount: 2, showLabels: false }),
  xp: module('xp', 'bottom-center', 0, -.3, .82, .76, { displayMode: 'bar', showLabels: false, showNumbers: false }),
  gold: module('gold', 'bottom-right', -1.4, -7.3, .72, .84, { displayMode: 'compact', showLabels: false }),
  minimap: module('minimap', 'top-right', -1.4, 1.5, .76, .86),
  objective: module('objective', 'top-right', -1.5, 13.5, .74, .84, { visibilityRule: 'context' }, false),
  buffs: module('buffs', 'top-left', 1.4, 8, .72, .84, { displayMode: 'icons', slotCount: 5, showLabels: false, visibilityRule: 'context' }),
  debuffs: module('debuffs', 'top-left', 1.4, 12.5, .72, .84, { displayMode: 'icons', slotCount: 4, showLabels: false, visibilityRule: 'combat' }),
  party: module('party', 'top-left', 1.4, 1.4, .72, .86, { displayMode: 'list', orientation: 'vertical', slotCount: 3 }, false),
  target: module('target', 'top-center', 0, 3.5, .82, .94, { displayMode: 'bar', visibilityRule: 'combat' }),
  boss: module('boss', 'top-center', 0, 7.2, .9, .96, { displayMode: 'bar', visibilityRule: 'context' }),
  cast: module('cast', 'bottom-center', 0, -8.5, .78, .9, { displayMode: 'bar', visibilityRule: 'context' }),
  interaction: module('interaction', 'bottom-center', 0, -11.8, .78, .9, { visibilityRule: 'context' }),
  loot: module('loot', 'center-right', -1.3, 5.5, .7, .8, { displayMode: 'list', orientation: 'vertical', slotCount: 2, visibilityRule: 'context' }),
  combatText: module('combatText', 'center', 0, -8, .78, .9, { showLabels: false, visibilityRule: 'combat' }),
  inventory: module('inventory', 'top-right', -1.2, 30, .72, .82, { displayMode: 'list', slotCount: 2 }, false),
})

const ultrawide = layout('ultrawide', {
  health: module('health', 'bottom-center', -13.2, -2.5, 1, 1, { displayMode: 'orb' }),
  resource: module('resource', 'bottom-center', 13.2, -2.5, 1, 1, { displayMode: 'orb' }),
  hotbar: module('hotbar', 'bottom-center', 0, -2.5, 1, 1, { slotCount: 7 }),
  potions: module('potions', 'bottom-center', -21.5, -2.5, .9, .98, { slotCount: 4 }),
  xp: module('xp', 'bottom-center', 0, -.5, 1, .9, { displayMode: 'bar', showLabels: false }),
  gold: module('gold', 'bottom-center', -21.5, -9.4, .86, .92, { displayMode: 'compact' }),
  minimap: module('minimap', 'top-right', -8.5, 2, .94, .96),
  objective: module('objective', 'top-right', -8.5, 18.5, .9, .94, { visibilityRule: 'context' }),
  buffs: module('buffs', 'top-left', 8.5, 11, .86, .94, { displayMode: 'icons', slotCount: 8, showLabels: false, visibilityRule: 'context' }),
  debuffs: module('debuffs', 'top-left', 8.5, 16.5, .86, .94, { displayMode: 'icons', slotCount: 6, showLabels: false, visibilityRule: 'combat' }),
  party: module('party', 'top-left', 8.5, 2, .86, .96, { displayMode: 'list', orientation: 'vertical', slotCount: 4 }),
  target: module('target', 'top-center', 0, 4.2, .98, 1, { displayMode: 'bar', visibilityRule: 'combat' }),
  boss: module('boss', 'top-center', 0, 8.8, 1.08, 1, { displayMode: 'bar', visibilityRule: 'context' }),
  cast: module('cast', 'bottom-center', 0, -11.5, .94, .98, { displayMode: 'bar', visibilityRule: 'context' }),
  interaction: module('interaction', 'bottom-center', 0, -15.5, .92, .98, { visibilityRule: 'context' }),
  loot: module('loot', 'center-right', -8.5, 6, .86, .9, { displayMode: 'list', orientation: 'vertical', slotCount: 4, visibilityRule: 'context' }),
  combatText: module('combatText', 'center', 0, -9, .96, 1, { showLabels: false, visibilityRule: 'combat' }),
  inventory: module('inventory', 'top-right', -8.5, 37, .84, .92, { displayMode: 'list', slotCount: 3 }, false),
})

export const HUD_PRESETS: Array<{ id: SkillboundHudPresetId; label: string; detail: string; layout: SkillboundHudLayout }> = [
  { id: 'classic-arpg', label: 'Classic ARPG', detail: 'One red health orb, one blue mana orb, central skills and full combat information.', layout: classic },
  { id: 'compact', label: 'Compact', detail: 'Dense bars and smaller utility modules for laptop screens.', layout: compact },
  { id: 'minimal', label: 'Minimal', detail: 'Reduced chrome while preserving combat readability.', layout: minimal },
  { id: 'ultrawide', label: 'Ultrawide', detail: 'Keeps combat focus central while utility stays within a safe zone.', layout: ultrawide },
]

export function createDefaultHudLayout() { return cloneHudLayout(classic) }

export function cloneHudPreset(id: SkillboundHudPresetId | string) {
  const preset = HUD_PRESETS.find((entry) => entry.id === id)?.layout ?? classic
  return cloneHudLayout(preset)
}

export function normalizeHudLayout(value?: Partial<SkillboundHudLayout>) {
  const fallback = createDefaultHudLayout()
  if (!value || value.format !== 'forge-hud-layout' || value.version !== 1) return fallback
  const modules = { ...fallback.modules }
  for (const meta of HUD_MODULES) {
    const stored = value.modules?.[meta.id]
    if (!stored) continue
    modules[meta.id] = {
      ...modules[meta.id],
      ...stored,
      id: meta.id,
      visible: stored.visible !== false,
      anchor: HUD_ANCHORS.some((entry) => entry.id === stored.anchor) ? stored.anchor : modules[meta.id].anchor,
      offsetX: clampNumber(stored.offsetX, -60, 60, modules[meta.id].offsetX),
      offsetY: clampNumber(stored.offsetY, -60, 60, modules[meta.id].offsetY),
      scale: clampNumber(stored.scale, .25, 2.5, modules[meta.id].scale),
      widthScale: clampNumber(stored.widthScale, .4, 2.5, modules[meta.id].widthScale),
      heightScale: clampNumber(stored.heightScale, .4, 2.5, modules[meta.id].heightScale),
      opacity: clampNumber(stored.opacity, .2, 1, modules[meta.id].opacity),
      slotCount: clampInt(stored.slotCount, 1, 12, modules[meta.id].slotCount),
    }
  }
  const grid = {
    columns: clampInt(value.grid?.columns, 8, 48, fallback.grid.columns),
    rows: clampInt(value.grid?.rows, 6, 30, fallback.grid.rows),
    snap: value.grid?.snap !== false,
    show: value.grid?.show !== false,
  }
  const preview = HUD_PREVIEW_MODES.some((mode) => mode.id === value.preview) ? value.preview! : fallback.preview
  return { format: 'forge-hud-layout' as const, version: 1 as const, preset: value.preset ?? 'custom', preview, grid, modules }
}

export function patchHudModule(layoutValue: SkillboundHudLayout, id: SkillboundHudModuleId, patch: Partial<Omit<SkillboundHudModule, 'id'>>) {
  return {
    ...layoutValue,
    preset: 'custom' as const,
    modules: { ...layoutValue.modules, [id]: { ...layoutValue.modules[id], ...patch, id } },
  }
}

export function patchHudGrid(layoutValue: SkillboundHudLayout, patch: Partial<HudEditorGrid>) {
  return {
    ...layoutValue,
    grid: {
      columns: clampInt(patch.columns ?? layoutValue.grid.columns, 8, 48, layoutValue.grid.columns),
      rows: clampInt(patch.rows ?? layoutValue.grid.rows, 6, 30, layoutValue.grid.rows),
      snap: patch.snap ?? layoutValue.grid.snap,
      show: patch.show ?? layoutValue.grid.show,
    },
  }
}

export function patchHudPreview(layoutValue: SkillboundHudLayout, preview: SkillboundHudPreviewMode) {
  return { ...layoutValue, preview }
}

export function snapHudOffset(value: number, axis: 'x' | 'y', grid: HudEditorGrid) {
  if (!grid.snap) return Math.round(value * 10) / 10
  const step = 100 / (axis === 'x' ? grid.columns : grid.rows)
  return Math.round(value / step) * step
}

export function hudModuleStyle(moduleValue: SkillboundHudModule, globalScale = 1): Record<string, string | number> {
  const [x, y] = anchorPoint(moduleValue.anchor)
  const translateX = x === 0 ? '0%' : x === 50 ? '-50%' : '-100%'
  const translateY = y === 0 ? '0%' : y === 50 ? '-50%' : '-100%'
  const scaleX = moduleValue.scale * moduleValue.widthScale * globalScale
  const scaleY = moduleValue.scale * moduleValue.heightScale * globalScale
  return {
    position: 'absolute',
    left: `calc(${x}% + ${moduleValue.offsetX}%)`,
    top: `calc(${y}% + ${moduleValue.offsetY}%)`,
    right: 'auto',
    bottom: 'auto',
    transform: `translate(${translateX}, ${translateY}) scale(${scaleX}, ${scaleY})`,
    transformOrigin: `${x === 0 ? 'left' : x === 50 ? 'center' : 'right'} ${y === 0 ? 'top' : y === 50 ? 'center' : 'bottom'}`,
    opacity: moduleValue.opacity,
  }
}

export function hudModuleVisible(layoutValue: SkillboundHudLayout, id: SkillboundHudModuleId) {
  return layoutValue.modules[id]?.visible !== false
}

export function hudModuleVisibleInPreview(layoutValue: SkillboundHudLayout, id: SkillboundHudModuleId) {
  if (!hudModuleVisible(layoutValue, id)) return false
  if (layoutValue.preview === 'boss') return id !== 'target'
  if (layoutValue.preview === 'combat' || layoutValue.preview === 'low-health') return id !== 'boss'
  return !['target', 'boss', 'cast', 'debuffs', 'combatText'].includes(id)
}

export function anchorPoint(anchor: SkillboundHudAnchor): [number, number] {
  const x = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 100 : 50
  const y = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 100 : 50
  return [x, y]
}

function module(id: SkillboundHudModuleId, anchor: SkillboundHudAnchor, offsetX: number, offsetY: number, scale: number, opacity: number, options: Partial<Omit<SkillboundHudModule, 'id' | 'anchor' | 'offsetX' | 'offsetY' | 'scale' | 'opacity' | 'visible'>> = {}, visible = true): SkillboundHudModule {
  return { id, visible, anchor, offsetX, offsetY, scale, opacity, ...defaultModuleOptions, ...options }
}

function layout(preset: SkillboundHudPresetId, modules: Record<SkillboundHudModuleId, SkillboundHudModule>): SkillboundHudLayout {
  return { format: 'forge-hud-layout', version: 1, preset, preview: 'combat', grid: { ...DEFAULT_GRID }, modules }
}

function cloneHudLayout(value: SkillboundHudLayout): SkillboundHudLayout {
  return JSON.parse(JSON.stringify(value)) as SkillboundHudLayout
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}
