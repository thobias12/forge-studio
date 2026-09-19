export type PropCategory =
  | 'storage'
  | 'furniture'
  | 'camp'
  | 'architecture'
  | 'market'
  | 'graveyard'
  | 'dungeon'
  | 'lighting'
  | 'utility'
  | 'nature'
  | 'custom'

export type PropPartKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'rock'
  | 'cone'
  | 'plank'
  | 'post'
  | 'wheel'
  | 'ring'

export type PropMaterialPreset =
  | 'stone'
  | 'dark-stone'
  | 'wood'
  | 'dark-wood'
  | 'iron'
  | 'bronze'
  | 'cloth'
  | 'leather'
  | 'bone'
  | 'earth'
  | 'moss'
  | 'rope'
  | 'glass'
  | 'ember'

export type PropPart = {
  id: string
  name: string
  kind: PropPartKind
  material: PropMaterialPreset
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color?: string
  collision: boolean
  group: string
}

export type PropLodSettings = {
  enabled: boolean
  farDistance: number
  simplify: number
}

export type PropPrefab = {
  format: 'forge-prop-prefab'
  version: 1
  id: string
  name: string
  category: PropCategory
  description: string
  tags: string[]
  pivot: [number, number, number]
  gridSize: number
  snap: boolean
  lod: PropLodSettings
  parts: PropPart[]
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

export type PropValidation = {
  ready: boolean
  warnings: string[]
  partCount: number
  collisionCount: number
  groupCount: number
  bounds: {
    width: number
    height: number
    depth: number
  }
}

export const PROP_PREFAB_STORAGE_KEY = 'forge-prop-prefabs-v1'

export const PROP_PART_LIBRARY: Array<{
  kind: PropPartKind
  label: string
  material: PropMaterialPreset
  scale: [number, number, number]
  y: number
}> = [
  { kind: 'box', label: 'Box', material: 'wood', scale: [1, 1, 1], y: .5 },
  { kind: 'plank', label: 'Plank', material: 'wood', scale: [1.8, .18, .42], y: .09 },
  { kind: 'post', label: 'Post', material: 'wood', scale: [.28, 1.8, .28], y: .9 },
  { kind: 'cylinder', label: 'Cylinder', material: 'wood', scale: [1, 1, 1], y: .5 },
  { kind: 'sphere', label: 'Sphere', material: 'stone', scale: [1, 1, 1], y: .5 },
  { kind: 'rock', label: 'Rock', material: 'dark-stone', scale: [1.2, .8, 1], y: .4 },
  { kind: 'cone', label: 'Cone', material: 'cloth', scale: [1, 1, 1], y: .5 },
  { kind: 'wheel', label: 'Wheel', material: 'wood', scale: [1, 1, 1], y: .75 },
  { kind: 'ring', label: 'Ring', material: 'iron', scale: [1, 1, 1], y: .5 },
]

export const PROP_MATERIALS: Array<{
  id: PropMaterialPreset
  label: string
}> = [
  { id: 'stone', label: 'Stone' },
  { id: 'dark-stone', label: 'Dark Stone' },
  { id: 'wood', label: 'Wood' },
  { id: 'dark-wood', label: 'Dark Wood' },
  { id: 'iron', label: 'Iron' },
  { id: 'bronze', label: 'Bronze' },
  { id: 'cloth', label: 'Cloth' },
  { id: 'leather', label: 'Leather' },
  { id: 'bone', label: 'Bone' },
  { id: 'earth', label: 'Earth' },
  { id: 'moss', label: 'Moss' },
  { id: 'rope', label: 'Rope' },
  { id: 'glass', label: 'Glass' },
  { id: 'ember', label: 'Ember / Glow' },
]

export const PROP_CATEGORIES: Array<{
  id: PropCategory
  label: string
}> = [
  { id: 'storage', label: 'Storage' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'camp', label: 'Camp' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'market', label: 'Market' },
  { id: 'graveyard', label: 'Graveyard' },
  { id: 'dungeon', label: 'Dungeon' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'utility', label: 'Utility' },
  { id: 'nature', label: 'Nature' },
  { id: 'custom', label: 'Custom' },
]

export function createBlankPropPrefab(
  name = 'Untitled Prop',
): PropPrefab {
  const now = new Date().toISOString()
  return {
    format: 'forge-prop-prefab',
    version: 1,
    id: makeId('prop'),
    name,
    category: 'custom',
    description: 'Reusable modular Forge prop.',
    tags: [],
    pivot: [0, 0, 0],
    gridSize: .1,
    snap: true,
    lod: {
      enabled: true,
      farDistance: 32,
      simplify: .45,
    },
    parts: [
      createPropPart('box', {
        name: 'Body',
        scale: [1.2, 1, 1],
      }),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createPropPart(
  kind: PropPartKind,
  patch: Partial<PropPart> = {},
): PropPart {
  const preset = PROP_PART_LIBRARY.find((item) => item.kind === kind)
  return {
    id: patch.id ?? makeId('part'),
    name: patch.name ?? preset?.label ?? 'Part',
    kind,
    material: patch.material ?? preset?.material ?? 'wood',
    position: patch.position ?? [0, preset?.y ?? .5, 0],
    rotation: patch.rotation ?? [0, 0, 0],
    scale: patch.scale ?? preset?.scale ?? [1, 1, 1],
    color: patch.color,
    collision: patch.collision ?? true,
    group: patch.group ?? 'Main',
  }
}

export function clonePropPrefab(
  prefab: PropPrefab,
  name = `${prefab.name} Copy`,
): PropPrefab {
  const now = new Date().toISOString()
  const clone = deepClone(prefab)
  clone.id = makeId('prop')
  clone.name = name
  clone.thumbnail = undefined
  clone.createdAt = now
  clone.updatedAt = now
  clone.parts = clone.parts.map((part) => ({
    ...part,
    id: makeId('part'),
  }))
  return clone
}

export function touchPropPrefab(prefab: PropPrefab): PropPrefab {
  return {
    ...prefab,
    updatedAt: new Date().toISOString(),
  }
}

export function validatePropPrefab(
  prefab: PropPrefab,
): PropValidation {
  const warnings: string[] = []
  if (!prefab.parts.length) warnings.push('Add at least one primitive part.')
  if (!prefab.parts.some((part) => part.collision)) {
    warnings.push('No collision parts are enabled.')
  }
  if (prefab.parts.length > 80) {
    warnings.push('This prop has more than 80 parts. Consider simplifying it or splitting it into nested assets.')
  }
  if (
    prefab.lod.enabled &&
    prefab.lod.farDistance < 8
  ) {
    warnings.push('LOD far distance is very close for a world prop.')
  }

  const bounds = propPrefabBounds(prefab)
  const groupCount = new Set(
    prefab.parts.map((part) => part.group.trim() || 'Ungrouped'),
  ).size

  return {
    ready: warnings.length === 0,
    warnings,
    partCount: prefab.parts.length,
    collisionCount: prefab.parts.filter((part) => part.collision).length,
    groupCount,
    bounds,
  }
}

export function propPrefabBounds(prefab: PropPrefab) {
  if (!prefab.parts.length) {
    return { width: 0, height: 0, depth: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const part of prefab.parts) {
    const halfX = Math.max(.025, Math.abs(part.scale[0]) * .5)
    const halfY = Math.max(.025, Math.abs(part.scale[1]) * .5)
    const halfZ = Math.max(.025, Math.abs(part.scale[2]) * .5)
    minX = Math.min(minX, part.position[0] - halfX)
    maxX = Math.max(maxX, part.position[0] + halfX)
    minY = Math.min(minY, part.position[1] - halfY)
    maxY = Math.max(maxY, part.position[1] + halfY)
    minZ = Math.min(minZ, part.position[2] - halfZ)
    maxZ = Math.max(maxZ, part.position[2] + halfZ)
  }

  return {
    width: round3(maxX - minX),
    height: round3(maxY - minY),
    depth: round3(maxZ - minZ),
  }
}

export function loadPropPrefabs(): PropPrefab[] {
  if (typeof window === 'undefined') return starterPropPrefabs()
  const raw = window.localStorage.getItem(PROP_PREFAB_STORAGE_KEY)
  if (!raw) {
    const starters = starterPropPrefabs()
    savePropPrefabs(starters)
    return starters
  }
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error('Invalid prop library')
    const parsed = value
      .map(normalizePropPrefab)
      .filter(Boolean) as PropPrefab[]
    return parsed.length ? parsed : starterPropPrefabs()
  } catch {
    const starters = starterPropPrefabs()
    savePropPrefabs(starters)
    return starters
  }
}

export function savePropPrefabs(prefabs: PropPrefab[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    PROP_PREFAB_STORAGE_KEY,
    JSON.stringify(prefabs),
  )
}

export function parsePropPrefabJson(text: string): PropPrefab {
  const value = JSON.parse(text)
  const parsed = normalizePropPrefab(value)
  if (!parsed) {
    throw new Error('This file is not a valid Forge prop prefab.')
  }
  const now = new Date().toISOString()
  return {
    ...parsed,
    id: makeId('prop'),
    name: parsed.name.endsWith(' Import')
      ? parsed.name
      : `${parsed.name} Import`,
    thumbnail: undefined,
    createdAt: now,
    updatedAt: now,
    parts: parsed.parts.map((part) => ({
      ...part,
      id: makeId('part'),
    })),
  }
}

export function serializePropPrefab(prefab: PropPrefab) {
  return JSON.stringify(prefab, null, 2)
}

export function starterPropPrefabs(): PropPrefab[] {
  const now = new Date().toISOString()
  const make = (
    id: string,
    name: string,
    category: PropCategory,
    description: string,
    tags: string[],
    parts: PropPart[],
    pivot: [number, number, number] = [0, 0, 0],
    lod: Partial<PropLodSettings> = {},
  ): PropPrefab => ({
    format: 'forge-prop-prefab',
    version: 1,
    id,
    name,
    category,
    description,
    tags,
    pivot,
    gridSize: .1,
    snap: true,
    lod: {
      enabled: true,
      farDistance: 30,
      simplify: .45,
      ...lod,
    },
    parts,
    createdAt: now,
    updatedAt: now,
  })

  const p = (
    id: string,
    kind: PropPartKind,
    name: string,
    position: [number, number, number],
    scale: [number, number, number],
    material: PropMaterialPreset,
    rotation: [number, number, number] = [0, 0, 0],
    group = 'Main',
    collision = true,
  ) => createPropPart(kind, {
    id,
    name,
    position,
    scale,
    material,
    rotation,
    group,
    collision,
  })

  const legs = (
    prefix: string,
    x: number,
    z: number,
    height: number,
    material: PropMaterialPreset = 'wood',
    group = 'Frame',
  ) => [
    p(`${prefix}-fl`, 'post', 'Front left leg', [-x, height / 2, z], [.16, height, .16], material, [0, 0, 0], group),
    p(`${prefix}-fr`, 'post', 'Front right leg', [x, height / 2, z], [.16, height, .16], material, [0, 0, 0], group),
    p(`${prefix}-bl`, 'post', 'Back left leg', [-x, height / 2, -z], [.16, height, .16], material, [0, 0, 0], group),
    p(`${prefix}-br`, 'post', 'Back right leg', [x, height / 2, -z], [.16, height, .16], material, [0, 0, 0], group),
  ]

  return [
    make('prop-barrel', 'Oak Barrel', 'storage', 'Eight-sided storage barrel with iron hoops.', ['barrel', 'storage', 'tavern'], [
      p('barrel-body', 'cylinder', 'Barrel body', [0, .65, 0], [.95, 1.3, .95], 'wood'),
      p('barrel-hoop-a', 'ring', 'Lower hoop', [0, .28, 0], [1.02, 1.02, 1.02], 'iron', [Math.PI / 2, 0, 0], 'Metal', false),
      p('barrel-hoop-b', 'ring', 'Upper hoop', [0, 1.02, 0], [1.02, 1.02, 1.02], 'iron', [Math.PI / 2, 0, 0], 'Metal', false),
    ]),
    make('prop-crate', 'Wooden Crate', 'storage', 'Simple reinforced shipping crate.', ['crate', 'storage', 'cargo'], [
      p('crate-body', 'box', 'Crate body', [0, .5, 0], [1.15, 1, 1.05], 'wood'),
      p('crate-brace-a', 'plank', 'Front brace', [0, .5, .535], [1.22, .12, .08], 'dark-wood', [0, 0, .55], 'Braces', false),
      p('crate-brace-b', 'plank', 'Front brace', [0, .5, .55], [1.22, .12, .08], 'dark-wood', [0, 0, -.55], 'Braces', false),
    ]),
    make('prop-crate-stack', 'Supply Crate Stack', 'storage', 'Three mismatched crates stacked for camps and warehouses.', ['crate', 'stack', 'supplies'], [
      p('stack-a', 'box', 'Large crate', [-.35, .42, 0], [1.25, .84, 1.05], 'wood'),
      p('stack-b', 'box', 'Small crate', [.62, .32, .12], [.72, .64, .72], 'dark-wood', [0, .16, 0]),
      p('stack-c', 'box', 'Top crate', [-.15, 1.08, -.06], [.82, .62, .76], 'wood', [0, -.12, .04]),
    ]),
    make('prop-sacks', 'Supply Sack Pile', 'storage', 'Soft provision sacks for camps and markets.', ['sacks', 'food', 'supplies'], [
      p('sack-a', 'sphere', 'Large sack', [-.28, .38, .02], [.72, .82, .58], 'cloth', [0, .2, -.08], 'Sacks'),
      p('sack-b', 'sphere', 'Side sack', [.42, .3, .12], [.58, .64, .52], 'cloth', [0, -.4, .16], 'Sacks'),
      p('sack-c', 'sphere', 'Top sack', [.05, .75, -.08], [.54, .6, .48], 'leather', [0, .15, -.12], 'Sacks'),
    ]),
    make('prop-chest', 'Ironbound Chest', 'storage', 'Low wooden chest reinforced with dark iron.', ['chest', 'loot', 'storage'], [
      p('chest-body', 'box', 'Chest body', [0, .42, 0], [1.45, .72, .82], 'dark-wood'),
      p('chest-lid', 'box', 'Lid', [0, .84, -.04], [1.5, .22, .86], 'wood', [.05, 0, 0]),
      p('chest-band-a', 'plank', 'Iron band', [-.42, .55, .425], [.12, .94, .08], 'iron', [0, 0, 0], 'Metal', false),
      p('chest-band-b', 'plank', 'Iron band', [.42, .55, .425], [.12, .94, .08], 'iron', [0, 0, 0], 'Metal', false),
      p('chest-lock', 'box', 'Lock', [0, .52, .47], [.22, .3, .08], 'bronze', [0, 0, 0], 'Metal', false),
    ]),
    make('prop-bench', 'Camp Bench', 'furniture', 'Rough timber bench for camps and settlements.', ['bench', 'seat', 'camp'], [
      p('bench-seat', 'plank', 'Seat', [0, .55, 0], [1.9, .18, .5], 'wood'),
      p('bench-leg-l', 'post', 'Left leg', [-.68, .28, 0], [.18, .56, .36], 'dark-wood'),
      p('bench-leg-r', 'post', 'Right leg', [.68, .28, 0], [.18, .56, .36], 'dark-wood'),
    ]),
    make('prop-table', 'Rough Camp Table', 'furniture', 'Simple four-leg work table.', ['table', 'camp', 'furniture'], [
      p('table-top', 'box', 'Table top', [0, 1.02, 0], [2.1, .18, 1.05], 'wood'),
      ...legs('table', .82, .36, .96, 'dark-wood'),
    ]),
    make('prop-stool', 'Wooden Stool', 'furniture', 'Compact three-legged stool.', ['stool', 'seat', 'furniture'], [
      p('stool-seat', 'cylinder', 'Seat', [0, .72, 0], [.78, .16, .78], 'wood'),
      p('stool-leg-a', 'post', 'Leg', [-.22, .34, .15], [.14, .68, .14], 'dark-wood', [0, 0, .08]),
      p('stool-leg-b', 'post', 'Leg', [.22, .34, .15], [.14, .68, .14], 'dark-wood', [0, 0, -.08]),
      p('stool-leg-c', 'post', 'Leg', [0, .34, -.24], [.14, .68, .14], 'dark-wood', [.08, 0, 0]),
    ]),
    make('prop-bedrolls', 'Bedroll Bundle', 'camp', 'Rolled sleeping gear with leather straps.', ['bedroll', 'camp', 'sleep'], [
      p('roll-main', 'cylinder', 'Rolled blanket', [0, .25, 0], [.52, 1.3, .52], 'cloth', [0, 0, Math.PI / 2]),
      p('strap-a', 'ring', 'Leather strap', [-.35, .25, 0], [.57, .57, .57], 'leather', [0, Math.PI / 2, 0], 'Straps', false),
      p('strap-b', 'ring', 'Leather strap', [.35, .25, 0], [.57, .57, .57], 'leather', [0, Math.PI / 2, 0], 'Straps', false),
    ]),
    make('prop-cart', 'Merchant Cart', 'utility', 'Two-wheel timber cart with cargo bed.', ['cart', 'wagon', 'market'], [
      p('cart-bed', 'box', 'Cargo bed', [0, .88, 0], [2.5, .28, 1.45], 'wood'),
      p('cart-side-l', 'plank', 'Left rail', [0, 1.28, -.72], [2.55, .18, .16], 'dark-wood', [0, 0, 0], 'Rails'),
      p('cart-side-r', 'plank', 'Right rail', [0, 1.28, .72], [2.55, .18, .16], 'dark-wood', [0, 0, 0], 'Rails'),
      p('cart-front', 'plank', 'Front rail', [-1.18, 1.28, 0], [1.45, .18, .16], 'dark-wood', [0, Math.PI / 2, 0], 'Rails'),
      p('cart-wheel-l', 'wheel', 'Left wheel', [.45, .7, -.9], [1.25, 1.25, 1.25], 'wood', [Math.PI / 2, 0, 0], 'Wheels'),
      p('cart-wheel-r', 'wheel', 'Right wheel', [.45, .7, .9], [1.25, 1.25, 1.25], 'wood', [Math.PI / 2, 0, 0], 'Wheels'),
      p('cart-shaft-l', 'plank', 'Left shaft', [1.85, .72, -.42], [2.4, .14, .14], 'dark-wood', [0, 0, -.08], 'Shafts'),
      p('cart-shaft-r', 'plank', 'Right shaft', [1.85, .72, .42], [2.4, .14, .14], 'dark-wood', [0, 0, -.08], 'Shafts'),
    ], [0, 0, 0], { farDistance: 44 }),
    make('prop-handcart', 'Handcart', 'utility', 'Small single-axle handcart.', ['cart', 'handcart', 'utility'], [
      p('hand-bed', 'box', 'Bed', [0, .68, 0], [1.6, .2, 1.05], 'wood'),
      p('hand-wheel-l', 'wheel', 'Wheel', [0, .54, -.68], [.95, .95, .95], 'wood', [Math.PI / 2, 0, 0], 'Wheels'),
      p('hand-wheel-r', 'wheel', 'Wheel', [0, .54, .68], [.95, .95, .95], 'wood', [Math.PI / 2, 0, 0], 'Wheels'),
      p('hand-handle-a', 'plank', 'Handle', [1.28, .65, -.28], [1.7, .11, .11], 'dark-wood', [0, 0, -.12], 'Handles'),
      p('hand-handle-b', 'plank', 'Handle', [1.28, .65, .28], [1.7, .11, .11], 'dark-wood', [0, 0, -.12], 'Handles'),
    ]),
    make('prop-fence', 'Fence Segment', 'architecture', 'Reusable rough timber fence section.', ['fence', 'boundary', 'wood'], [
      p('fence-post-l', 'post', 'Left post', [-1.15, .8, 0], [.22, 1.6, .22], 'dark-wood'),
      p('fence-post-r', 'post', 'Right post', [1.15, .8, 0], [.22, 1.6, .22], 'dark-wood'),
      p('fence-rail-a', 'plank', 'Upper rail', [0, 1.05, 0], [2.35, .16, .18], 'wood', [0, 0, .02]),
      p('fence-rail-b', 'plank', 'Lower rail', [0, .52, 0], [2.35, .16, .18], 'wood', [0, 0, -.03]),
    ], [0, 0, 0], { farDistance: 38 }),
    make('prop-fence-corner', 'Fence Corner', 'architecture', 'Ninety-degree corner fence module.', ['fence', 'corner', 'wood'], [
      p('corner-post', 'post', 'Corner post', [0, .8, 0], [.25, 1.6, .25], 'dark-wood'),
      p('corner-x-a', 'plank', 'X rail upper', [1.05, 1.05, 0], [2.1, .16, .18], 'wood'),
      p('corner-x-b', 'plank', 'X rail lower', [1.05, .52, 0], [2.1, .16, .18], 'wood'),
      p('corner-z-a', 'plank', 'Z rail upper', [0, 1.05, 1.05], [2.1, .16, .18], 'wood', [0, Math.PI / 2, 0]),
      p('corner-z-b', 'plank', 'Z rail lower', [0, .52, 1.05], [2.1, .16, .18], 'wood', [0, Math.PI / 2, 0]),
    ]),
    make('prop-gate', 'Timber Gate', 'architecture', 'Simple settlement gate section.', ['gate', 'fence', 'entrance'], [
      p('gate-post-l', 'post', 'Left gate post', [-1.25, 1.1, 0], [.3, 2.2, .3], 'dark-wood'),
      p('gate-post-r', 'post', 'Right gate post', [1.25, 1.1, 0], [.3, 2.2, .3], 'dark-wood'),
      p('gate-top', 'plank', 'Top beam', [0, 2.05, 0], [2.8, .28, .3], 'dark-wood'),
      p('gate-door-a', 'plank', 'Gate plank', [-.72, .9, 0], [.24, 1.7, .16], 'wood', [0, 0, 0], 'Door'),
      p('gate-door-b', 'plank', 'Gate plank', [-.35, .9, 0], [.24, 1.7, .16], 'wood', [0, 0, 0], 'Door'),
      p('gate-door-c', 'plank', 'Gate plank', [.02, .9, 0], [.24, 1.7, .16], 'wood', [0, 0, 0], 'Door'),
      p('gate-door-d', 'plank', 'Gate plank', [.39, .9, 0], [.24, 1.7, .16], 'wood', [0, 0, 0], 'Door'),
      p('gate-door-e', 'plank', 'Gate plank', [.76, .9, 0], [.24, 1.7, .16], 'wood', [0, 0, 0], 'Door'),
      p('gate-brace', 'plank', 'Diagonal brace', [0, .92, .1], [1.95, .16, .14], 'dark-wood', [0, 0, .55], 'Door'),
    ]),
    make('prop-signpost', 'Road Signpost', 'utility', 'Branching wooden wayfinding sign.', ['sign', 'road', 'wayfinding'], [
      p('sign-post', 'post', 'Main post', [0, 1.25, 0], [.22, 2.5, .22], 'dark-wood'),
      p('sign-a', 'plank', 'Upper sign', [.48, 1.86, 0], [1.25, .28, .12], 'wood', [0, 0, .05], 'Signs', false),
      p('sign-b', 'plank', 'Lower sign', [-.42, 1.46, 0], [1.05, .26, .12], 'wood', [0, 0, -.07], 'Signs', false),
    ]),
    make('prop-lantern-post', 'Lantern Post', 'lighting', 'Tall roadside lantern post.', ['lantern', 'light', 'road'], [
      p('lantern-post', 'post', 'Post', [0, 1.45, 0], [.18, 2.9, .18], 'dark-wood'),
      p('lantern-arm', 'plank', 'Arm', [.38, 2.72, 0], [.78, .12, .12], 'dark-wood'),
      p('lantern-frame', 'box', 'Lantern frame', [.72, 2.46, 0], [.34, .5, .34], 'iron', [0, 0, 0], 'Lantern', false),
      p('lantern-glass', 'box', 'Lantern glow', [.72, 2.46, 0], [.23, .34, .23], 'ember', [0, 0, 0], 'Lantern', false),
    ]),
    make('prop-brazier', 'Stone Brazier', 'lighting', 'Low stone fire bowl on a pedestal.', ['brazier', 'fire', 'light'], [
      p('brazier-base', 'cylinder', 'Base', [0, .16, 0], [.8, .32, .8], 'dark-stone'),
      p('brazier-post', 'post', 'Pedestal', [0, .62, 0], [.38, .9, .38], 'stone'),
      p('brazier-bowl', 'cylinder', 'Fire bowl', [0, 1.08, 0], [1.05, .28, 1.05], 'iron'),
      p('brazier-fire', 'sphere', 'Embers', [0, 1.28, 0], [.62, .3, .62], 'ember', [0, 0, 0], 'Fire', false),
    ]),
    make('prop-well', 'Village Well', 'architecture', 'Circular stone well with timber roof.', ['well', 'village', 'water'], [
      p('well-base', 'cylinder', 'Stone well', [0, .62, 0], [1.8, 1.25, 1.8], 'stone'),
      p('well-mouth', 'cylinder', 'Dark opening', [0, 1.18, 0], [1.35, .08, 1.35], 'dark-stone', [0, 0, 0], 'Opening', false),
      p('well-post-l', 'post', 'Left roof post', [-.9, 1.75, 0], [.18, 2.4, .18], 'dark-wood'),
      p('well-post-r', 'post', 'Right roof post', [.9, 1.75, 0], [.18, 2.4, .18], 'dark-wood'),
      p('well-roof-a', 'plank', 'Roof slope', [0, 3.02, -.42], [2.5, .16, 1.15], 'wood', [.45, 0, 0], 'Roof'),
      p('well-roof-b', 'plank', 'Roof slope', [0, 3.02, .42], [2.5, .16, 1.15], 'wood', [-.45, 0, 0], 'Roof'),
      p('well-crossbar', 'plank', 'Bucket bar', [0, 1.98, 0], [2, .14, .14], 'dark-wood', [0, 0, 0], 'Mechanism'),
    ], [0, 0, 0], { farDistance: 48 }),
    make('prop-market-stall', 'Market Stall', 'market', 'Open timber stall with cloth canopy and counter.', ['market', 'stall', 'shop'], [
      p('stall-counter', 'box', 'Counter', [0, .92, 0], [2.5, .22, .72], 'wood'),
      p('stall-post-l', 'post', 'Left post', [-1.05, 1.5, -.28], [.18, 3, .18], 'dark-wood'),
      p('stall-post-r', 'post', 'Right post', [1.05, 1.5, -.28], [.18, 3, .18], 'dark-wood'),
      p('stall-canopy', 'box', 'Canopy', [0, 2.62, 0], [2.7, .12, 1.65], 'cloth', [.04, 0, 0], 'Canopy', false),
      p('stall-shelf', 'plank', 'Back shelf', [0, 1.45, -.62], [2.25, .16, .36], 'wood', [0, 0, 0], 'Display'),
    ], [0, 0, 0], { farDistance: 44 }),
    make('prop-weapon-rack', 'Weapon Rack', 'utility', 'Timber rack for swords, spears and tools.', ['rack', 'weapon', 'armory'], [
      p('rack-base', 'plank', 'Base', [0, .12, 0], [2, .22, .55], 'dark-wood'),
      p('rack-post-l', 'post', 'Left post', [-.82, .9, 0], [.18, 1.7, .18], 'wood'),
      p('rack-post-r', 'post', 'Right post', [.82, .9, 0], [.18, 1.7, .18], 'wood'),
      p('rack-top', 'plank', 'Top rail', [0, 1.56, 0], [1.8, .16, .2], 'dark-wood'),
      p('rack-weapon-a', 'plank', 'Stored spear', [-.45, 1.08, .1], [.08, 1.65, .08], 'iron', [0, 0, .08], 'Weapons', false),
      p('rack-weapon-b', 'plank', 'Stored spear', [.05, 1.03, .1], [.08, 1.55, .08], 'iron', [0, 0, -.04], 'Weapons', false),
      p('rack-weapon-c', 'plank', 'Stored weapon', [.48, .95, .1], [.1, 1.4, .1], 'iron', [0, 0, .14], 'Weapons', false),
    ]),
    make('prop-armor-stand', 'Armor Stand', 'utility', 'Simple wooden display stand for armor.', ['armor', 'stand', 'armory'], [
      p('armor-base', 'box', 'Base', [0, .12, 0], [.9, .24, .72], 'dark-wood'),
      p('armor-post', 'post', 'Center post', [0, 1.15, 0], [.16, 2.1, .16], 'wood'),
      p('armor-shoulder', 'plank', 'Shoulder bar', [0, 1.78, 0], [1.2, .14, .16], 'wood'),
      p('armor-head', 'sphere', 'Helmet block', [0, 2.12, 0], [.42, .48, .42], 'dark-wood', [0, 0, 0], 'Display', false),
    ]),
    make('prop-gravestone', 'Old Gravestone', 'graveyard', 'Weathered upright stone marker.', ['grave', 'stone', 'cemetery'], [
      p('grave-base', 'box', 'Base', [0, .12, 0], [.82, .24, .42], 'dark-stone'),
      p('grave-body', 'box', 'Marker', [0, .78, 0], [.62, 1.32, .28], 'stone', [0, .03, -.035]),
      p('grave-cap', 'sphere', 'Rounded cap', [0, 1.44, 0], [.62, .36, .3], 'stone', [0, 0, 0], 'Marker'),
    ]),
    make('prop-grave-cross', 'Wooden Grave Cross', 'graveyard', 'Rough improvised wooden grave marker.', ['grave', 'cross', 'cemetery'], [
      p('cross-post', 'post', 'Vertical timber', [0, .92, 0], [.18, 1.84, .18], 'dark-wood'),
      p('cross-arm', 'plank', 'Cross arm', [0, 1.32, 0], [.95, .16, .16], 'wood', [0, 0, .03]),
    ]),
    make('prop-coffin', 'Wooden Coffin', 'graveyard', 'Closed angular coffin for crypts and graveyards.', ['coffin', 'crypt', 'graveyard'], [
      p('coffin-body', 'box', 'Coffin body', [0, .28, 0], [.95, .56, 2.05], 'dark-wood'),
      p('coffin-lid', 'box', 'Lid', [0, .59, 0], [1, .14, 2.1], 'wood'),
      p('coffin-band-a', 'plank', 'Iron band', [0, .64, -.55], [1.02, .08, .1], 'iron', [0, 0, 0], 'Metal', false),
      p('coffin-band-b', 'plank', 'Iron band', [0, .64, .55], [1.02, .08, .1], 'iron', [0, 0, 0], 'Metal', false),
    ]),
    make('prop-rubble', 'Masonry Rubble Pile', 'architecture', 'Cluster of broken low-poly stones.', ['rubble', 'ruins', 'stone'], [
      p('rubble-a', 'rock', 'Large rubble', [-.45, .28, 0], [.95, .58, .78], 'dark-stone', [0, .25, .12]),
      p('rubble-b', 'rock', 'Rubble', [.42, .22, .18], [.72, .44, .62], 'stone', [0, -.48, -.08]),
      p('rubble-c', 'rock', 'Small rubble', [.08, .16, -.5], [.48, .32, .44], 'dark-stone', [0, .72, .04]),
      p('rubble-d', 'rock', 'Small rubble', [-.72, .12, -.38], [.38, .24, .42], 'stone', [0, -.2, .1]),
    ]),
    make('prop-broken-column', 'Broken Stone Column', 'architecture', 'Collapsed column with surviving stump and fallen drum.', ['column', 'ruins', 'stone'], [
      p('column-stump', 'cylinder', 'Standing stump', [-.45, .72, 0], [.72, 1.45, .72], 'stone'),
      p('column-cap', 'cylinder', 'Broken cap', [-.45, 1.48, 0], [.85, .18, .85], 'dark-stone'),
      p('column-fallen', 'cylinder', 'Fallen section', [.62, .3, .2], [.68, 1.7, .68], 'stone', [0, .32, Math.PI / 2]),
      p('column-rubble', 'rock', 'Chipped stone', [.2, .12, -.48], [.42, .25, .36], 'dark-stone', [0, .6, 0]),
    ]),
    make('prop-wall-torch', 'Dungeon Wall Torch', 'dungeon', 'Iron wall bracket with a bright flame.', ['torch', 'dungeon', 'light'], [
      p('torch-bracket', 'plank', 'Bracket', [0, .9, .12], [.12, .85, .12], 'iron', [0, 0, -.22]),
      p('torch-stick', 'post', 'Torch shaft', [0, 1.38, .02], [.12, .92, .12], 'dark-wood'),
      p('torch-flame', 'sphere', 'Flame', [0, 1.94, .02], [.32, .5, .32], 'ember', [0, 0, 0], 'Fire', false),
    ]),
    make('prop-barricade', 'Wooden Barricade', 'dungeon', 'Crossed defensive stakes for roads and dungeon rooms.', ['barricade', 'defense', 'wood'], [
      p('barricade-base', 'plank', 'Base beam', [0, .28, 0], [2.6, .22, .42], 'dark-wood'),
      p('barricade-stake-a', 'plank', 'Stake', [-.82, .92, 0], [.22, 1.75, .22], 'wood', [0, 0, -.34]),
      p('barricade-stake-b', 'plank', 'Stake', [0, 1.02, 0], [.22, 1.95, .22], 'wood', [0, 0, .22]),
      p('barricade-stake-c', 'plank', 'Stake', [.82, .86, 0], [.22, 1.62, .22], 'wood', [0, 0, -.24]),
      p('barricade-cross', 'plank', 'Cross brace', [0, .9, .12], [2.55, .18, .18], 'dark-wood', [0, 0, .16]),
    ]),
    make('prop-training-dummy', 'Training Dummy', 'utility', 'Straw training target on a timber stand.', ['dummy', 'training', 'combat'], [
      p('dummy-base', 'box', 'Base', [0, .12, 0], [.95, .24, .75], 'dark-wood'),
      p('dummy-post', 'post', 'Post', [0, 1.2, 0], [.18, 2.2, .18], 'wood'),
      p('dummy-body', 'cylinder', 'Straw torso', [0, 1.68, 0], [.7, .9, .7], 'rope', [0, 0, 0], 'Dummy', false),
      p('dummy-arm', 'plank', 'Cross arm', [0, 1.88, 0], [1.65, .18, .18], 'wood'),
      p('dummy-head', 'sphere', 'Head', [0, 2.38, 0], [.48, .52, .48], 'cloth', [0, 0, 0], 'Dummy', false),
    ]),
    make('prop-pedestal', 'Stone Pedestal', 'architecture', 'Small stepped pedestal for statues, loot or shrines.', ['pedestal', 'stone', 'display'], [
      p('pedestal-base', 'box', 'Lower base', [0, .16, 0], [1.5, .32, 1.5], 'dark-stone'),
      p('pedestal-mid', 'box', 'Middle base', [0, .4, 0], [1.18, .22, 1.18], 'stone'),
      p('pedestal-column', 'box', 'Column', [0, .9, 0], [.72, .82, .72], 'dark-stone'),
      p('pedestal-top', 'box', 'Top slab', [0, 1.38, 0], [1.05, .18, 1.05], 'stone'),
    ]),
    make('prop-rope-coil', 'Rope Coil', 'utility', 'Coiled rope bundle for carts, docks and camps.', ['rope', 'coil', 'utility'], [
      p('rope-ring-a', 'ring', 'Outer coil', [0, .09, 0], [1.05, 1.05, 1.05], 'rope', [Math.PI / 2, 0, 0], 'Rope', false),
      p('rope-ring-b', 'ring', 'Middle coil', [0, .13, 0], [.78, .78, .78], 'rope', [Math.PI / 2, 0, 0], 'Rope', false),
      p('rope-ring-c', 'ring', 'Inner coil', [0, .17, 0], [.52, .52, .52], 'rope', [Math.PI / 2, 0, 0], 'Rope', false),
    ]),
    make('prop-bucket', 'Wooden Bucket', 'utility', 'Small stave bucket with iron handle.', ['bucket', 'water', 'utility'], [
      p('bucket-body', 'cylinder', 'Bucket', [0, .38, 0], [.68, .72, .68], 'wood'),
      p('bucket-rim', 'ring', 'Iron rim', [0, .72, 0], [.72, .72, .72], 'iron', [Math.PI / 2, 0, 0], 'Metal', false),
      p('bucket-handle', 'ring', 'Handle', [0, .76, 0], [.72, .88, .72], 'iron', [0, 0, 0], 'Metal', false),
    ]),
    make('prop-wheelbarrow', 'Wheelbarrow', 'utility', 'Small one-wheel timber barrow.', ['wheelbarrow', 'farm', 'utility'], [
      p('barrow-bed', 'box', 'Tray', [0, .72, 0], [1.65, .28, .9], 'wood', [0, 0, -.08]),
      p('barrow-wheel', 'wheel', 'Wheel', [-.72, .42, 0], [.82, .82, .82], 'wood', [0, Math.PI / 2, 0], 'Wheel'),
      p('barrow-leg-l', 'post', 'Left support', [.25, .38, -.28], [.12, .72, .12], 'dark-wood', [0, 0, .15], 'Frame'),
      p('barrow-leg-r', 'post', 'Right support', [.25, .38, .28], [.12, .72, .12], 'dark-wood', [0, 0, .15], 'Frame'),
      p('barrow-handle-l', 'plank', 'Left handle', [1.12, .7, -.3], [1.65, .12, .12], 'dark-wood', [0, 0, -.1], 'Handles'),
      p('barrow-handle-r', 'plank', 'Right handle', [1.12, .7, .3], [1.65, .12, .12], 'dark-wood', [0, 0, -.1], 'Handles'),
    ]),
    make('prop-cooking-rack', 'Camp Cooking Rack', 'camp', 'Tripod cooking rack with hanging pot.', ['camp', 'cooking', 'fire'], [
      p('cook-leg-a', 'post', 'Tripod leg', [-.48, .85, .32], [.12, 1.8, .12], 'dark-wood', [0, 0, -.24], 'Frame'),
      p('cook-leg-b', 'post', 'Tripod leg', [.48, .85, .32], [.12, 1.8, .12], 'dark-wood', [0, 0, .24], 'Frame'),
      p('cook-leg-c', 'post', 'Tripod leg', [0, .85, -.52], [.12, 1.8, .12], 'dark-wood', [.24, 0, 0], 'Frame'),
      p('cook-pot', 'cylinder', 'Cooking pot', [0, .58, 0], [.62, .52, .62], 'iron', [0, 0, 0], 'Pot', false),
      p('cook-fire', 'sphere', 'Fire', [0, .2, 0], [.65, .22, .65], 'ember', [0, 0, 0], 'Fire', false),
    ]),
    make('prop-stone-bench', 'Stone Bench', 'furniture', 'Heavy stone bench for shrines and courtyards.', ['bench', 'stone', 'courtyard'], [
      p('stone-seat', 'box', 'Seat slab', [0, .62, 0], [2, .2, .62], 'stone'),
      p('stone-leg-l', 'box', 'Left support', [-.68, .31, 0], [.34, .62, .52], 'dark-stone'),
      p('stone-leg-r', 'box', 'Right support', [.68, .31, 0], [.34, .62, .52], 'dark-stone'),
    ]),
    make('prop-arch-fragment', 'Ruined Arch Fragment', 'architecture', 'Broken stone arch/gateway fragment.', ['arch', 'ruins', 'stone'], [
      p('arch-pillar-l', 'box', 'Left pillar', [-.88, 1.2, 0], [.48, 2.4, .58], 'stone'),
      p('arch-pillar-r', 'box', 'Right pillar', [.88, .92, 0], [.48, 1.84, .58], 'dark-stone'),
      p('arch-lintel-a', 'box', 'Broken lintel', [-.4, 2.28, 0], [.92, .46, .62], 'stone', [0, 0, .04]),
      p('arch-lintel-b', 'box', 'Broken lintel', [.48, 2.15, 0], [.52, .34, .58], 'dark-stone', [0, 0, -.1]),
      p('arch-rubble', 'rock', 'Fallen stone', [1.28, .24, .2], [.7, .48, .62], 'stone', [0, .55, .18]),
    ]),
    make('prop-mushroom-cluster', 'Forest Mushroom Cluster', 'nature', 'Small reusable mushroom patch for forest dressing.', ['mushroom', 'forest', 'nature'], [
      p('mush-stem-a', 'post', 'Stem', [-.25, .18, 0], [.1, .36, .1], 'bone', [0, 0, 0], 'Mushrooms', false),
      p('mush-cap-a', 'sphere', 'Cap', [-.25, .39, 0], [.38, .18, .38], 'leather', [0, 0, 0], 'Mushrooms', false),
      p('mush-stem-b', 'post', 'Stem', [.18, .13, .14], [.08, .26, .08], 'bone', [0, 0, 0], 'Mushrooms', false),
      p('mush-cap-b', 'sphere', 'Cap', [.18, .29, .14], [.3, .14, .3], 'leather', [0, 0, 0], 'Mushrooms', false),
      p('mush-stem-c', 'post', 'Stem', [.02, .1, -.25], [.07, .2, .07], 'bone', [0, 0, 0], 'Mushrooms', false),
      p('mush-cap-c', 'sphere', 'Cap', [.02, .23, -.25], [.24, .12, .24], 'moss', [0, 0, 0], 'Mushrooms', false),
    ]),
    make('prop-rock-cluster', 'Mossy Rock Cluster', 'nature', 'Low stone cluster for paths, rivers and ruins.', ['rock', 'moss', 'nature'], [
      p('rock-a', 'rock', 'Large rock', [-.35, .38, 0], [.95, .72, .82], 'dark-stone', [0, .3, .08]),
      p('rock-b', 'rock', 'Side rock', [.48, .25, .18], [.62, .48, .58], 'stone', [0, -.45, -.06]),
      p('rock-c', 'rock', 'Moss stone', [.08, .2, -.48], [.55, .4, .5], 'moss', [0, .7, .1]),
    ]),
    make('prop-market-crates', 'Market Produce Display', 'market', 'Crates and baskets for a market stall front.', ['market', 'produce', 'crates'], [
      p('market-box-a', 'box', 'Produce crate', [-.5, .25, 0], [.85, .5, .68], 'wood'),
      p('market-box-b', 'box', 'Produce crate', [.48, .2, .08], [.72, .4, .62], 'dark-wood', [0, -.1, 0]),
      p('market-basket', 'cylinder', 'Basket', [.08, .42, -.48], [.58, .44, .58], 'rope', [0, 0, 0], 'Basket', false),
      p('market-produce-a', 'sphere', 'Produce', [-.58, .58, 0], [.18, .18, .18], 'moss', [0, 0, 0], 'Produce', false),
      p('market-produce-b', 'sphere', 'Produce', [-.36, .58, .08], [.18, .18, .18], 'moss', [0, 0, 0], 'Produce', false),
      p('market-produce-c', 'sphere', 'Produce', [.04, .6, -.48], [.16, .16, .16], 'leather', [0, 0, 0], 'Produce', false),
    ]),
    make('prop-cage', 'Iron Prison Cage', 'dungeon', 'Compact iron-bar cage for dungeon rooms.', ['cage', 'dungeon', 'prison'], [
      p('cage-base', 'box', 'Stone base', [0, .12, 0], [1.8, .24, 1.8], 'dark-stone'),
      p('cage-top', 'box', 'Iron roof', [0, 2.1, 0], [1.75, .12, 1.75], 'iron'),
      ...[-.72, -.24, .24, .72].flatMap((x, column) => [
        p(`cage-front-${column}`, 'post', 'Front bar', [x, 1.12, .82], [.08, 2, .08], 'iron', [0, 0, 0], 'Bars'),
        p(`cage-back-${column}`, 'post', 'Back bar', [x, 1.12, -.82], [.08, 2, .08], 'iron', [0, 0, 0], 'Bars'),
      ]),
      p('cage-side-l-a', 'post', 'Side bar', [-.82, 1.12, -.28], [.08, 2, .08], 'iron', [0, 0, 0], 'Bars'),
      p('cage-side-l-b', 'post', 'Side bar', [-.82, 1.12, .28], [.08, 2, .08], 'iron', [0, 0, 0], 'Bars'),
      p('cage-side-r-a', 'post', 'Side bar', [.82, 1.12, -.28], [.08, 2, .08], 'iron', [0, 0, 0], 'Bars'),
      p('cage-side-r-b', 'post', 'Side bar', [.82, 1.12, .28], [.08, 2, .08], 'iron', [0, 0, 0], 'Bars'),
    ], [0, 0, 0], { farDistance: 42, simplify: .34 }),
    make('prop-altar', 'Dungeon Altar', 'dungeon', 'Dark stepped stone altar with glowing inset.', ['altar', 'dungeon', 'ritual'], [
      p('altar-base', 'box', 'Lower base', [0, .14, 0], [2.2, .28, 1.5], 'dark-stone'),
      p('altar-step', 'box', 'Upper step', [0, .38, -.08], [1.75, .22, 1.18], 'stone'),
      p('altar-slab', 'box', 'Offering slab', [0, .78, -.18], [1.45, .6, .8], 'dark-stone'),
      p('altar-gem', 'sphere', 'Ritual glow', [0, 1.18, -.18], [.25, .25, .25], 'ember', [0, 0, 0], 'Glow', false),
    ]),
    make('prop-bridge-rail', 'Bridge Rail Segment', 'architecture', 'Reusable timber railing segment.', ['bridge', 'rail', 'wood'], [
      p('rail-post-l', 'post', 'Left post', [-1.1, .62, 0], [.16, 1.24, .16], 'dark-wood'),
      p('rail-post-r', 'post', 'Right post', [1.1, .62, 0], [.16, 1.24, .16], 'dark-wood'),
      p('rail-top', 'plank', 'Top rail', [0, 1.02, 0], [2.25, .14, .14], 'wood'),
      p('rail-mid', 'plank', 'Middle rail', [0, .58, 0], [2.25, .12, .12], 'wood'),
    ]),
    make('prop-candle-cluster', 'Candle Cluster', 'lighting', 'Small devotional candle group.', ['candle', 'light', 'shrine'], [
      p('candle-a', 'post', 'Tall candle', [-.18, .22, .04], [.1, .44, .1], 'bone', [0, 0, 0], 'Candles', false),
      p('flame-a', 'sphere', 'Flame', [-.18, .5, .04], [.12, .18, .12], 'ember', [0, 0, 0], 'Flames', false),
      p('candle-b', 'post', 'Short candle', [.16, .16, .1], [.11, .32, .11], 'bone', [0, 0, 0], 'Candles', false),
      p('flame-b', 'sphere', 'Flame', [.16, .38, .1], [.11, .16, .11], 'ember', [0, 0, 0], 'Flames', false),
      p('candle-c', 'post', 'Small candle', [.02, .12, -.18], [.09, .24, .09], 'bone', [0, 0, 0], 'Candles', false),
      p('flame-c', 'sphere', 'Flame', [.02, .3, -.18], [.1, .14, .1], 'ember', [0, 0, 0], 'Flames', false),
    ]),
  ]
}

function normalizePropPrefab(value: unknown): PropPrefab | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Partial<PropPrefab>
  if (source.format !== 'forge-prop-prefab') return undefined
  if (!Array.isArray(source.parts)) return undefined

  const now = new Date().toISOString()
  const parts = source.parts
    .filter((item): item is PropPart => Boolean(item && typeof item === 'object'))
    .map((part) => ({
      id: typeof part.id === 'string' ? part.id : makeId('part'),
      name: typeof part.name === 'string' ? part.name : 'Part',
      kind: isPartKind(part.kind) ? part.kind : 'box',
      material: isMaterial(part.material) ? part.material : 'wood',
      position: tuple3(part.position, [0, .5, 0]),
      rotation: tuple3(part.rotation, [0, 0, 0]),
      scale: tuple3(part.scale, [1, 1, 1]),
      color: typeof part.color === 'string' ? part.color : undefined,
      collision: typeof part.collision === 'boolean' ? part.collision : true,
      group: typeof part.group === 'string' ? part.group : 'Main',
    }))

  return {
    format: 'forge-prop-prefab',
    version: 1,
    id: typeof source.id === 'string' ? source.id : makeId('prop'),
    name: typeof source.name === 'string' ? source.name : 'Imported Prop',
    category: isCategory(source.category) ? source.category : 'custom',
    description: typeof source.description === 'string' ? source.description : '',
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 32)
      : [],
    pivot: tuple3(source.pivot, [0, 0, 0]),
    gridSize: clampNumber(source.gridSize, .05, 4, .1),
    snap: typeof source.snap === 'boolean' ? source.snap : true,
    lod: {
      enabled: source.lod?.enabled !== false,
      farDistance: clampNumber(source.lod?.farDistance, 6, 250, 32),
      simplify: clampNumber(source.lod?.simplify, .1, .9, .45),
    },
    parts,
    thumbnail:
      typeof source.thumbnail === 'string' &&
      source.thumbnail.startsWith('data:image/')
        ? source.thumbnail
        : undefined,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now,
  }
}

function tuple3(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return [...fallback]
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
  ]
}

function isPartKind(value: unknown): value is PropPartKind {
  return [
    'box',
    'cylinder',
    'sphere',
    'rock',
    'cone',
    'plank',
    'post',
    'wheel',
    'ring',
  ].includes(String(value))
}

function isMaterial(value: unknown): value is PropMaterialPreset {
  return [
    'stone',
    'dark-stone',
    'wood',
    'dark-wood',
    'iron',
    'bronze',
    'cloth',
    'leather',
    'bone',
    'earth',
    'moss',
    'rope',
    'glass',
    'ember',
  ].includes(String(value))
}

function isCategory(value: unknown): value is PropCategory {
  return [
    'storage',
    'furniture',
    'camp',
    'architecture',
    'market',
    'graveyard',
    'dungeon',
    'lighting',
    'utility',
    'nature',
    'custom',
  ].includes(String(value))
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number = finiteNumber(value, fallback)
  return Math.min(max, Math.max(min, number))
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
