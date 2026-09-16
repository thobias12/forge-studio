export type SkillboundHudModuleId = 'health' | 'hotbar' | 'objective' | 'target' | 'boss' | 'interaction' | 'loot' | 'inventory'
export type SkillboundHudAnchor = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type SkillboundHudPresetId = 'classic-arpg' | 'compact' | 'minimal' | 'ultrawide'

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
  opacity: number
}

export type SkillboundHudLayout = {
  format: 'forge-hud-layout'
  version: 1
  preset: SkillboundHudPresetId | 'custom'
  grid: HudEditorGrid
  modules: Record<SkillboundHudModuleId, SkillboundHudModule>
}

export const HUD_MODULES: Array<{ id: SkillboundHudModuleId; label: string; detail: string; runtime: string }> = [
  { id: 'health', label: 'Life orb', detail: 'Player health and maximum life.', runtime: 'Live' },
  { id: 'hotbar', label: 'Skill hotbar', detail: 'Primary attack, active skill and dodge.', runtime: 'Live' },
  { id: 'objective', label: 'Objective tracker', detail: 'Current region or dungeon objective.', runtime: 'Live' },
  { id: 'target', label: 'Target frame', detail: 'Normal enemy health and target name.', runtime: 'Live' },
  { id: 'boss', label: 'Boss bar', detail: 'Boss target health bar and name.', runtime: 'Live' },
  { id: 'interaction', label: 'Interaction prompt', detail: 'E-key interaction prompts and portals.', runtime: 'Live' },
  { id: 'loot', label: 'Combat / loot message', detail: 'Short runtime messages and pickup feedback.', runtime: 'Live' },
  { id: 'inventory', label: 'Quick inventory', detail: 'Collected items and equipment shortcuts.', runtime: 'Live' },
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

const classic = layout('classic-arpg', {
  health: module('health', 'bottom-center', -14.5, -5.2, 1, 1),
  hotbar: module('hotbar', 'bottom-center', 4, -4.8, 1, 1),
  objective: module('objective', 'top-left', 2.5, 3.2, .94, .96),
  target: module('target', 'top-center', 0, 4.2, 1, 1),
  boss: module('boss', 'top-center', 0, 9.6, 1.08, 1, false),
  interaction: module('interaction', 'bottom-center', 0, -14, 1, 1),
  loot: module('loot', 'bottom-left', 2.5, -4.5, .94, .95),
  inventory: module('inventory', 'top-right', -2.2, 3.2, .9, .96),
})

const compact = layout('compact', {
  health: module('health', 'bottom-left', 2.2, -4.2, .86, 1),
  hotbar: module('hotbar', 'bottom-center', 0, -4.2, .88, .96),
  objective: module('objective', 'top-left', 2, 2.8, .86, .92),
  target: module('target', 'top-center', 0, 4.2, .9, 1),
  boss: module('boss', 'top-center', 0, 9, .98, 1, false),
  interaction: module('interaction', 'bottom-center', 0, -12.5, .9, 1),
  loot: module('loot', 'bottom-left', 2, -3.8, .85, .92),
  inventory: module('inventory', 'top-right', -1.8, 3, .82, .92),
})

const minimal = layout('minimal', {
  health: module('health', 'bottom-left', 2.1, -3.8, .82, .92),
  hotbar: module('hotbar', 'bottom-center', 0, -3.8, .82, .92),
  objective: module('objective', 'top-left', 2, 2.8, .82, .88, false),
  target: module('target', 'top-center', 0, 3.8, .88, .96),
  boss: module('boss', 'top-center', 0, 8.8, .98, 1, false),
  interaction: module('interaction', 'bottom-center', 0, -11.5, .86, .96),
  loot: module('loot', 'bottom-left', 2, -3.5, .8, .88),
  inventory: module('inventory', 'top-right', -1.6, 3, .78, .86, false),
})

const ultrawide = layout('ultrawide', {
  health: module('health', 'bottom-center', -10.8, -4.6, 1, 1),
  hotbar: module('hotbar', 'bottom-center', 2.2, -4.5, 1, 1),
  objective: module('objective', 'top-right', -9, 3, .94, .94),
  target: module('target', 'top-center', 0, 4.2, 1, 1),
  boss: module('boss', 'top-center', 0, 9.4, 1.08, 1, false),
  interaction: module('interaction', 'bottom-center', 0, -13.2, .96, 1),
  loot: module('loot', 'bottom-left', 4, -4.2, .9, .92),
  inventory: module('inventory', 'top-right', -2.2, 4.5, .9, .94),
})

export const HUD_PRESETS: Array<{ id: SkillboundHudPresetId; label: string; detail: string; layout: SkillboundHudLayout }> = [
  { id: 'classic-arpg', label: 'Classic ARPG', detail: 'Central combat bar with strong life orb and utility kept clear of the combat center.', layout: classic },
  { id: 'compact', label: 'Compact', detail: 'Smaller controls for laptop and busy combat scenes.', layout: compact },
  { id: 'minimal', label: 'Minimal', detail: 'Only essential combat information stays visible.', layout: minimal },
  { id: 'ultrawide', label: 'Ultrawide', detail: 'Pulls utility information outward without moving combat focus.', layout: ultrawide },
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
      id: meta.id,
      visible: stored.visible !== false,
      anchor: HUD_ANCHORS.some((entry) => entry.id === stored.anchor) ? stored.anchor : modules[meta.id].anchor,
      offsetX: clampNumber(stored.offsetX, -60, 60, modules[meta.id].offsetX),
      offsetY: clampNumber(stored.offsetY, -60, 60, modules[meta.id].offsetY),
      scale: clampNumber(stored.scale, .55, 1.7, modules[meta.id].scale),
      opacity: clampNumber(stored.opacity, .2, 1, modules[meta.id].opacity),
    }
  }
  const grid = {
    columns: clampInt(value.grid?.columns, 8, 48, fallback.grid.columns),
    rows: clampInt(value.grid?.rows, 6, 30, fallback.grid.rows),
    snap: value.grid?.snap !== false,
    show: value.grid?.show !== false,
  }
  return { format: 'forge-hud-layout' as const, version: 1 as const, preset: value.preset ?? 'custom', grid, modules }
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

export function snapHudOffset(value: number, axis: 'x' | 'y', grid: HudEditorGrid) {
  if (!grid.snap) return Math.round(value * 10) / 10
  const step = 100 / (axis === 'x' ? grid.columns : grid.rows)
  return Math.round(value / step) * step
}

export function hudModuleStyle(moduleValue: SkillboundHudModule, globalScale = 1): Record<string, string | number> {
  const [x, y] = anchorPoint(moduleValue.anchor)
  const translateX = x === 0 ? '0%' : x === 50 ? '-50%' : '-100%'
  const translateY = y === 0 ? '0%' : y === 50 ? '-50%' : '-100%'
  return {
    position: 'absolute',
    left: `calc(${x}% + ${moduleValue.offsetX}%)`,
    top: `calc(${y}% + ${moduleValue.offsetY}%)`,
    right: 'auto',
    bottom: 'auto',
    transform: `translate(${translateX}, ${translateY}) scale(${moduleValue.scale * globalScale})`,
    transformOrigin: `${x === 0 ? 'left' : x === 50 ? 'center' : 'right'} ${y === 0 ? 'top' : y === 50 ? 'center' : 'bottom'}`,
    opacity: moduleValue.opacity,
  }
}

export function hudModuleVisible(layoutValue: SkillboundHudLayout, id: SkillboundHudModuleId) {
  return layoutValue.modules[id]?.visible !== false
}

export function anchorPoint(anchor: SkillboundHudAnchor): [number, number] {
  const x = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 100 : 50
  const y = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 100 : 50
  return [x, y]
}

function module(id: SkillboundHudModuleId, anchor: SkillboundHudAnchor, offsetX: number, offsetY: number, scale: number, opacity: number, visible = true): SkillboundHudModule {
  return { id, visible, anchor, offsetX, offsetY, scale, opacity }
}

function layout(preset: SkillboundHudPresetId, modules: Record<SkillboundHudModuleId, SkillboundHudModule>): SkillboundHudLayout {
  return { format: 'forge-hud-layout', version: 1, preset, grid: { ...DEFAULT_GRID }, modules }
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
