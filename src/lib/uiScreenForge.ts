export type SkillboundUiScreenId =
  | 'inventory'
  | 'character'
  | 'skills'
  | 'map'
  | 'quests'
  | 'pause'
  | 'settings'
  | 'main-menu'
  | 'load-game'
  | 'character-select'
  | 'character-creator'
  | 'stash'
  | 'vendor'
  | 'crafting'
  | 'dialogue'
  | 'death'
  | 'item-compare'
  | 'level-up'
  | 'waypoint'

export type UiScreenCategory = 'In Game' | 'Front End' | 'Gameplay Windows'
export type UiScreenElementKind =
  | 'title'
  | 'tabs'
  | 'character-model'
  | 'item-grid'
  | 'equipment'
  | 'stats'
  | 'skills'
  | 'map'
  | 'quest-list'
  | 'button-list'
  | 'character-cards'
  | 'creator-options'
  | 'stash-grid'
  | 'vendor-list'
  | 'crafting-list'
  | 'dialogue'
  | 'death-summary'
  | 'settings-list'
  | 'save-list'
  | 'item-compare'
  | 'level-up'
  | 'waypoint-list'
  | 'panel'

export type UiGridDefinition = {
  columns: number
  rows: number
  gap: number
  margin: number
  showGrid: boolean
}

export type UiGridPlacement = {
  column: number
  row: number
  columnSpan: number
  rowSpan: number
}

export type UiScreenElement = {
  id: string
  label: string
  kind: UiScreenElementKind
  placement: UiGridPlacement
  visible: boolean
  locked: boolean
}

export type SkillboundUiScreenLayout = {
  format: 'forge-ui-screen'
  version: 1
  id: SkillboundUiScreenId
  name: string
  grid: UiGridDefinition
  elements: UiScreenElement[]
}

export type SkillboundUiScreens = Record<SkillboundUiScreenId, SkillboundUiScreenLayout>

export const UI_SCREEN_META: Array<{ id: SkillboundUiScreenId; label: string; category: UiScreenCategory; detail: string }> = [
  { id: 'inventory', label: 'Inventory', category: 'In Game', detail: 'Equipment, backpack, currencies and item details.' },
  { id: 'character', label: 'Character', category: 'In Game', detail: 'Attributes, offense, defense and resistances.' },
  { id: 'skills', label: 'Skills', category: 'In Game', detail: 'Active skills, passives and loadout.' },
  { id: 'map', label: 'Map', category: 'In Game', detail: 'World map, region markers and navigation.' },
  { id: 'quests', label: 'Quest Log', category: 'In Game', detail: 'Tracked, completed and story quest entries.' },
  { id: 'pause', label: 'Pause / ESC', category: 'In Game', detail: 'Resume, menus, settings and exit actions.' },
  { id: 'settings', label: 'Settings', category: 'In Game', detail: 'Graphics, audio, controls, gameplay and accessibility.' },
  { id: 'main-menu', label: 'Main Menu', category: 'Front End', detail: 'Continue, character select, settings and quit.' },
  { id: 'load-game', label: 'Continue / Saves', category: 'Front End', detail: 'Character saves, locations, playtime and continue flow.' },
  { id: 'character-select', label: 'Character Select', category: 'Front End', detail: 'Saved heroes, progress and play action.' },
  { id: 'character-creator', label: 'Character Creator', category: 'Front End', detail: 'Blueprint-compatible appearance and identity flow.' },
  { id: 'stash', label: 'Stash', category: 'Gameplay Windows', detail: 'Shared storage and tabs.' },
  { id: 'vendor', label: 'Vendor', category: 'Gameplay Windows', detail: 'Buy, sell and compare items.' },
  { id: 'crafting', label: 'Crafting', category: 'Gameplay Windows', detail: 'Recipes, materials and result preview.' },
  { id: 'dialogue', label: 'Dialogue', category: 'Gameplay Windows', detail: 'NPC portrait, dialogue and choices.' },
  { id: 'death', label: 'Death / Respawn', category: 'Gameplay Windows', detail: 'Death summary and respawn actions.' },
  { id: 'item-compare', label: 'Item Compare', category: 'Gameplay Windows', detail: 'Ground, inventory and equipped item comparison.' },
  { id: 'level-up', label: 'Level Up', category: 'Gameplay Windows', detail: 'Level rewards, stat gains and unlocks.' },
  { id: 'waypoint', label: 'Waypoint / Travel', category: 'Gameplay Windows', detail: 'Unlocked destinations and fast travel.' },
]

const GRID: UiGridDefinition = { columns: 12, rows: 8, gap: 1, margin: 2, showGrid: true }

const p = (column: number, row: number, columnSpan: number, rowSpan: number): UiGridPlacement => ({ column, row, columnSpan, rowSpan })
const e = (id: string, label: string, kind: UiScreenElementKind, placement: UiGridPlacement, locked = false): UiScreenElement => ({ id, label, kind, placement, visible: true, locked })
const screen = (id: SkillboundUiScreenId, name: string, elements: UiScreenElement[], grid: Partial<UiGridDefinition> = {}): SkillboundUiScreenLayout => ({
  format: 'forge-ui-screen', version: 1, id, name, grid: { ...GRID, ...grid }, elements,
})

export function createDefaultUiScreens(): SkillboundUiScreens {
  return {
    inventory: screen('inventory', 'Inventory', [
      e('title', 'Inventory Header', 'title', p(1, 1, 12, 1), true),
      e('equipment', 'Equipment', 'equipment', p(1, 2, 4, 6)),
      e('bag', 'Backpack Grid', 'item-grid', p(5, 2, 5, 6)),
      e('details', 'Item Details', 'panel', p(10, 2, 3, 6)),
    ]),
    character: screen('character', 'Character', [
      e('title', 'Character Header', 'title', p(1, 1, 12, 1), true),
      e('offense', 'Offense & Core Stats', 'stats', p(1, 2, 3, 6)),
      e('model', 'Character Model', 'character-model', p(4, 2, 6, 6)),
      e('defense', 'Defense & Resistances', 'stats', p(10, 2, 3, 6)),
    ]),
    skills: screen('skills', 'Skills', [
      e('title', 'Skills Header', 'title', p(1, 1, 12, 1), true),
      e('tree', 'Skill Tree', 'skills', p(1, 2, 8, 6)),
      e('details', 'Selected Skill', 'panel', p(9, 2, 4, 6)),
    ]),
    map: screen('map', 'World Map', [
      e('title', 'Map Header', 'title', p(1, 1, 12, 1), true),
      e('map', 'World Map', 'map', p(1, 2, 9, 6)),
      e('legend', 'Legend & Region', 'panel', p(10, 2, 3, 6)),
    ]),
    quests: screen('quests', 'Quest Log', [
      e('title', 'Quest Log Header', 'title', p(1, 1, 12, 1), true),
      e('list', 'Quest List', 'quest-list', p(1, 2, 4, 6)),
      e('details', 'Quest Details', 'panel', p(5, 2, 8, 6)),
    ]),
    pause: screen('pause', 'Pause', [
      e('title', 'Skillbound Logo / Title', 'title', p(4, 1, 6, 1), true),
      e('nav', 'Pause Navigation', 'button-list', p(5, 2, 4, 6)),
    ]),
    settings: screen('settings', 'Settings', [
      e('title', 'Settings Header', 'title', p(1, 1, 12, 1), true),
      e('tabs', 'Settings Tabs', 'tabs', p(1, 2, 3, 6)),
      e('settings', 'Settings Controls', 'settings-list', p(4, 2, 7, 6)),
      e('actions', 'Apply / Reset', 'button-list', p(11, 2, 2, 6)),
    ]),
    'main-menu': screen('main-menu', 'Main Menu', [
      e('title', 'Skillbound Logo', 'title', p(4, 1, 6, 2), true),
      e('hero', 'Selected Character', 'character-model', p(1, 2, 6, 7)),
      e('nav', 'Main Navigation', 'button-list', p(8, 3, 4, 4)),
    ], { rows: 9 }),
    'load-game': screen('load-game', 'Continue / Saves', [
      e('title', 'Continue Header', 'title', p(1, 1, 12, 1), true),
      e('saves', 'Save Slots', 'save-list', p(1, 2, 7, 6)),
      e('details', 'Save Details', 'panel', p(8, 2, 3, 6)),
      e('actions', 'Continue Actions', 'button-list', p(11, 2, 2, 6)),
    ]),
    'character-select': screen('character-select', 'Character Select', [
      e('title', 'Character Select Header', 'title', p(1, 1, 12, 1), true),
      e('characters', 'Character Cards', 'character-cards', p(1, 2, 5, 6)),
      e('preview', 'Selected Character', 'character-model', p(6, 2, 5, 6)),
      e('actions', 'Play / Create', 'button-list', p(11, 2, 2, 6)),
    ]),
    'character-creator': screen('character-creator', 'Character Creator', [
      e('title', 'Create Character Header', 'title', p(1, 1, 12, 1), true),
      e('options', 'Creator Options', 'creator-options', p(1, 2, 4, 6)),
      e('preview', 'Character Preview', 'character-model', p(5, 2, 5, 6)),
      e('summary', 'Identity & Confirm', 'panel', p(10, 2, 3, 6)),
    ]),
    stash: screen('stash', 'Stash', [
      e('title', 'Stash Header', 'title', p(1, 1, 12, 1), true),
      e('tabs', 'Stash Tabs', 'tabs', p(1, 2, 12, 1)),
      e('grid', 'Stash Grid', 'stash-grid', p(1, 3, 9, 5)),
      e('details', 'Item Details', 'panel', p(10, 3, 3, 5)),
    ]),
    vendor: screen('vendor', 'Vendor', [
      e('title', 'Vendor Header', 'title', p(1, 1, 12, 1), true),
      e('vendor', 'Vendor Stock', 'vendor-list', p(1, 2, 5, 6)),
      e('details', 'Compare & Purchase', 'panel', p(6, 2, 4, 6)),
      e('inventory', 'Player Inventory', 'item-grid', p(10, 2, 3, 6)),
    ]),
    crafting: screen('crafting', 'Crafting', [
      e('title', 'Crafting Header', 'title', p(1, 1, 12, 1), true),
      e('recipes', 'Recipe List', 'crafting-list', p(1, 2, 4, 6)),
      e('result', 'Crafting Result', 'panel', p(5, 2, 5, 6)),
      e('materials', 'Materials', 'item-grid', p(10, 2, 3, 6)),
    ]),
    dialogue: screen('dialogue', 'Dialogue', [
      e('portrait', 'NPC Portrait', 'character-model', p(1, 4, 3, 4)),
      e('dialogue', 'Dialogue', 'dialogue', p(4, 5, 7, 3)),
      e('choices', 'Dialogue Choices', 'button-list', p(11, 5, 2, 3)),
    ]),
    death: screen('death', 'Death / Respawn', [
      e('summary', 'Death Summary', 'death-summary', p(4, 2, 6, 3)),
      e('actions', 'Respawn Actions', 'button-list', p(5, 5, 4, 2)),
    ]),
    'item-compare': screen('item-compare', 'Item Compare', [
      e('title', 'Item Compare Header', 'title', p(2, 1, 10, 1), true),
      e('current', 'Equipped Item', 'item-compare', p(2, 2, 5, 5)),
      e('candidate', 'Compared Item', 'item-compare', p(7, 2, 5, 5)),
      e('actions', 'Compare Actions', 'button-list', p(5, 7, 4, 1)),
    ]),
    'level-up': screen('level-up', 'Level Up', [
      e('title', 'Level Up Header', 'title', p(3, 1, 8, 1), true),
      e('summary', 'Level Rewards', 'level-up', p(3, 2, 8, 4)),
      e('actions', 'Continue', 'button-list', p(5, 6, 4, 2)),
    ]),
    waypoint: screen('waypoint', 'Waypoint / Travel', [
      e('title', 'Waypoint Header', 'title', p(1, 1, 12, 1), true),
      e('locations', 'Destinations', 'waypoint-list', p(1, 2, 4, 6)),
      e('map', 'Travel Map', 'map', p(5, 2, 6, 6)),
      e('actions', 'Travel Actions', 'button-list', p(11, 2, 2, 6)),
    ]),
  }
}

export function normalizeUiScreens(value?: Partial<SkillboundUiScreens>): SkillboundUiScreens {
  const defaults = createDefaultUiScreens()
  const next = { ...defaults }
  for (const meta of UI_SCREEN_META) {
    const stored = value?.[meta.id]
    if (!stored || stored.format !== 'forge-ui-screen' || stored.version !== 1) continue
    const grid = normalizeGrid(stored.grid)
    const elements = stored.elements?.map((element) => ({
      ...element,
      visible: element.visible !== false,
      locked: element.locked === true,
      placement: clampPlacement(element.placement, grid),
    })) ?? defaults[meta.id].elements
    next[meta.id] = { ...stored, id: meta.id, grid, elements }
  }
  return next
}

export function patchScreenElement(layout: SkillboundUiScreenLayout, elementId: string, patch: Partial<Omit<UiScreenElement, 'id'>>) {
  return {
    ...layout,
    elements: layout.elements.map((element) => element.id === elementId ? { ...element, ...patch, id: element.id } : element),
  }
}

export function patchScreenGrid(layout: SkillboundUiScreenLayout, patch: Partial<UiGridDefinition>) {
  const grid = normalizeGrid({ ...layout.grid, ...patch })
  return { ...layout, grid, elements: layout.elements.map((element) => ({ ...element, placement: clampPlacement(element.placement, grid) })) }
}

export function moveElement(layout: SkillboundUiScreenLayout, elementId: string, column: number, row: number) {
  const element = layout.elements.find((candidate) => candidate.id === elementId)
  if (!element || element.locked) return layout
  return patchScreenElement(layout, elementId, { placement: clampPlacement({ ...element.placement, column, row }, layout.grid) })
}

export function resizeElement(layout: SkillboundUiScreenLayout, elementId: string, columnSpan: number, rowSpan: number) {
  const element = layout.elements.find((candidate) => candidate.id === elementId)
  if (!element || element.locked) return layout
  return patchScreenElement(layout, elementId, { placement: clampPlacement({ ...element.placement, columnSpan, rowSpan }, layout.grid) })
}

export function gridPlacementStyle(placement: UiGridPlacement) {
  return {
    gridColumn: `${placement.column} / span ${placement.columnSpan}`,
    gridRow: `${placement.row} / span ${placement.rowSpan}`,
  }
}

function normalizeGrid(value?: Partial<UiGridDefinition>): UiGridDefinition {
  return {
    columns: clampInt(value?.columns, 6, 24, GRID.columns),
    rows: clampInt(value?.rows, 4, 16, GRID.rows),
    gap: clampNumber(value?.gap, 0, 3, GRID.gap),
    margin: clampNumber(value?.margin, 0, 6, GRID.margin),
    showGrid: value?.showGrid !== false,
  }
}

function clampPlacement(value: UiGridPlacement, grid: UiGridDefinition): UiGridPlacement {
  const columnSpan = clampInt(value?.columnSpan, 1, grid.columns, 1)
  const rowSpan = clampInt(value?.rowSpan, 1, grid.rows, 1)
  const column = clampInt(value?.column, 1, Math.max(1, grid.columns - columnSpan + 1), 1)
  const row = clampInt(value?.row, 1, Math.max(1, grid.rows - rowSpan + 1), 1)
  return { column, row, columnSpan, rowSpan }
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
