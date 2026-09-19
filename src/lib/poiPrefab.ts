export type PoiPrefabCategory =
  | 'camp'
  | 'shrine'
  | 'ruins'
  | 'watchtower'
  | 'graveyard'
  | 'den'
  | 'custom'

export type PoiPartKind =
  | 'box'
  | 'cylinder'
  | 'rock'
  | 'tent'
  | 'log'
  | 'torch'
  | 'prop'
  | 'entry'

export type PoiMaterialPreset =
  | 'stone'
  | 'dark-stone'
  | 'wood'
  | 'cloth'
  | 'earth'
  | 'bone'
  | 'metal'
  | 'moss'

export type PoiPrefabPart = {
  id: string
  name: string
  kind: PoiPartKind
  material: PoiMaterialPreset
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color?: string
  assetRef?: string
  solid: boolean
}

export type PoiPrefab = {
  format: 'forge-poi-prefab'
  version: 1
  id: string
  name: string
  category: PoiPrefabCategory
  description: string
  bounds: {
    width: number
    depth: number
  }
  gridSize: number
  snap: boolean
  parts: PoiPrefabPart[]
  createdAt: string
  updatedAt: string
}

export type PoiPrefabValidation = {
  ready: boolean
  warnings: string[]
  solidCount: number
  entryCount: number
  outsideBoundsCount: number
}

export const POI_PREFAB_STORAGE_KEY = 'forge-poi-prefabs-v1'

export const POI_PART_LIBRARY: Array<{
  kind: PoiPartKind
  label: string
  material: PoiMaterialPreset
  scale: [number, number, number]
  y: number
}> = [
  { kind: 'box', label: 'Block / Wall', material: 'stone', scale: [2, 1, .45], y: .5 },
  { kind: 'cylinder', label: 'Pillar', material: 'stone', scale: [.7, 2.5, .7], y: 1.25 },
  { kind: 'rock', label: 'Rock', material: 'dark-stone', scale: [1.25, .85, 1.1], y: .42 },
  { kind: 'tent', label: 'Tent', material: 'cloth', scale: [1.5, 1.6, 1.5], y: .8 },
  { kind: 'log', label: 'Log / Beam', material: 'wood', scale: [1.8, .35, .35], y: .2 },
  { kind: 'torch', label: 'Torch / Light', material: 'wood', scale: [1, 1, 1], y: 0 },
  { kind: 'prop', label: 'Saved Prop', material: 'wood', scale: [1, 1, 1], y: 0 },
  { kind: 'entry', label: 'Access Marker', material: 'earth', scale: [1, 1, 1], y: 0 },
]

export const POI_MATERIALS: Array<{ id: PoiMaterialPreset; label: string }> = [
  { id: 'stone', label: 'Stone' },
  { id: 'dark-stone', label: 'Dark Stone' },
  { id: 'wood', label: 'Wood' },
  { id: 'cloth', label: 'Cloth' },
  { id: 'earth', label: 'Earth' },
  { id: 'bone', label: 'Bone' },
  { id: 'metal', label: 'Metal' },
  { id: 'moss', label: 'Moss' },
]

export function createBlankPoiPrefab(name = 'Untitled Landmark'): PoiPrefab {
  const now = new Date().toISOString()
  return {
    format: 'forge-poi-prefab',
    version: 1,
    id: makeId('poi'),
    name,
    category: 'custom',
    description: 'Reusable World Forge landmark prefab.',
    bounds: { width: 14, depth: 14 },
    gridSize: .5,
    snap: true,
    parts: [
      createPoiPart('entry', {
        name: 'Main access',
        position: [0, 0, 5],
        solid: false,
      }),
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function createPoiPart(
  kind: PoiPartKind,
  patch: Partial<PoiPrefabPart> = {},
): PoiPrefabPart {
  const preset = POI_PART_LIBRARY.find((item) => item.kind === kind)
  return {
    id: makeId('part'),
    name: patch.name ?? preset?.label ?? 'Part',
    kind,
    material: patch.material ?? preset?.material ?? 'stone',
    position: patch.position ?? [0, preset?.y ?? 0, 0],
    rotation: patch.rotation ?? [0, 0, 0],
    scale: patch.scale ?? preset?.scale ?? [1, 1, 1],
    color: patch.color,
    assetRef: patch.assetRef,
    solid: patch.solid ?? (kind !== 'entry' && kind !== 'torch'),
  }
}

export function clonePoiPrefab(
  prefab: PoiPrefab,
  name = `${prefab.name} Copy`,
): PoiPrefab {
  const now = new Date().toISOString()
  const clone = deepClone(prefab)
  clone.id = makeId('poi')
  clone.name = name
  clone.createdAt = now
  clone.updatedAt = now
  clone.parts = clone.parts.map((part) => ({
    ...part,
    id: makeId('part'),
  }))
  return clone
}

export function touchPoiPrefab(prefab: PoiPrefab): PoiPrefab {
  return {
    ...prefab,
    updatedAt: new Date().toISOString(),
  }
}

export function validatePoiPrefab(prefab: PoiPrefab): PoiPrefabValidation {
  const entries = prefab.parts.filter((part) => part.kind === 'entry')
  const solids = prefab.parts.filter((part) => part.solid && part.kind !== 'entry')
  const halfWidth = prefab.bounds.width / 2
  const halfDepth = prefab.bounds.depth / 2
  const outside = prefab.parts.filter((part) => {
    const radius = Math.max(part.scale[0], part.scale[2]) * .5
    return (
      Math.abs(part.position[0]) + radius > halfWidth ||
      Math.abs(part.position[2]) + radius > halfDepth
    )
  })
  const warnings: string[] = []
  if (!entries.length) warnings.push('Add an Access Marker so World Forge knows which side faces the approach path.')
  if (entries.length > 1) warnings.push('Use one Access Marker per prefab.')
  if (!solids.length) warnings.push('Prefab has no solid landmark geometry.')
  const missingNestedProps = prefab.parts.filter(
    (part) => part.kind === 'prop' && !part.assetRef,
  )
  if (missingNestedProps.length) {
    warnings.push(
      `${missingNestedProps.length} saved prop part${missingNestedProps.length === 1 ? '' : 's'} need an asset reference.`,
    )
  }
  if (outside.length) warnings.push(`${outside.length} part${outside.length === 1 ? '' : 's'} extend beyond the authored footprint.`)
  if (prefab.bounds.width < 4 || prefab.bounds.depth < 4) warnings.push('Footprint is unusually small for a world landmark.')
  return {
    ready: warnings.length === 0,
    warnings,
    solidCount: solids.length,
    entryCount: entries.length,
    outsideBoundsCount: outside.length,
  }
}

export function loadPoiPrefabs(): PoiPrefab[] {
  if (typeof window === 'undefined') return starterPoiPrefabs()
  const raw = window.localStorage.getItem(POI_PREFAB_STORAGE_KEY)
  if (!raw) {
    const starters = starterPoiPrefabs()
    savePoiPrefabs(starters)
    return starters
  }
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error('Invalid prefab library')
    const parsed = value.map(normalizePoiPrefab).filter(Boolean) as PoiPrefab[]
    return parsed.length ? parsed : starterPoiPrefabs()
  } catch {
    const starters = starterPoiPrefabs()
    savePoiPrefabs(starters)
    return starters
  }
}

export function savePoiPrefabs(prefabs: PoiPrefab[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(POI_PREFAB_STORAGE_KEY, JSON.stringify(prefabs))
}

export function parsePoiPrefabJson(text: string): PoiPrefab {
  const value = JSON.parse(text)
  const parsed = normalizePoiPrefab(value)
  if (!parsed) throw new Error('This file is not a valid Forge POI prefab.')
  return {
    ...parsed,
    id: makeId('poi'),
    name: parsed.name.endsWith(' Import') ? parsed.name : `${parsed.name} Import`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parts: parsed.parts.map((part) => ({ ...part, id: makeId('part') })),
  }
}

export function serializePoiPrefab(prefab: PoiPrefab) {
  return JSON.stringify(prefab, null, 2)
}

export function starterPoiPrefabs(): PoiPrefab[] {
  const now = new Date().toISOString()
  const make = (
    id: string,
    name: string,
    category: PoiPrefabCategory,
    description: string,
    width: number,
    depth: number,
    parts: PoiPrefabPart[],
  ): PoiPrefab => ({
    format: 'forge-poi-prefab',
    version: 1,
    id,
    name,
    category,
    description,
    bounds: { width, depth },
    gridSize: .5,
    snap: true,
    parts,
    createdAt: now,
    updatedAt: now,
  })

  return [
    make(
      'starter-wayfarer-camp',
      'Wayfarer Camp',
      'camp',
      'Loose tents, central fire and travel supplies with a clear road-facing approach.',
      15,
      14,
      [
        createPoiPart('entry', { id: 'camp-entry', name: 'Path approach', position: [0, 0, 6], solid: false }),
        createPoiPart('tent', { id: 'camp-tent-a', name: 'West tent', position: [-3.3, .9, -.8], rotation: [0, .35, 0], scale: [1.7, 1.8, 1.55] }),
        createPoiPart('tent', { id: 'camp-tent-b', name: 'East tent', position: [3.1, .82, -.3], rotation: [0, -.48, 0], scale: [1.55, 1.65, 1.45] }),
        createPoiPart('cylinder', { id: 'camp-fire', name: 'Fire ring', position: [0, .12, .35], scale: [1.25, .18, 1.25], material: 'dark-stone', solid: false }),
        createPoiPart('torch', { id: 'camp-light', name: 'Campfire glow', position: [0, 0, .35], solid: false }),
        createPoiPart('log', { id: 'camp-bench-a', name: 'Log bench', position: [-.4, .25, 2], rotation: [0, .08, 0], scale: [1.8, .35, .35] }),
        createPoiPart('box', { id: 'camp-crate-a', name: 'Supply crate', position: [2.15, .35, 2.2], scale: [.7, .7, .7], material: 'wood' }),
        createPoiPart('box', { id: 'camp-crate-b', name: 'Supply crate small', position: [2.75, .25, 2.05], scale: [.5, .5, .5], material: 'wood' }),
      ],
    ),
    make(
      'starter-wayside-shrine',
      'Wayside Shrine',
      'shrine',
      'Compact roadside altar with a strong frame silhouette and warm devotional light.',
      10,
      10,
      [
        createPoiPart('entry', { id: 'shrine-entry', name: 'Path approach', position: [0, 0, 4.2], solid: false }),
        createPoiPart('box', { id: 'shrine-base-a', name: 'Lower plinth', position: [0, .12, .35], scale: [3.6, .24, 3.1], material: 'dark-stone' }),
        createPoiPart('box', { id: 'shrine-base-b', name: 'Upper plinth', position: [0, .32, .35], scale: [2.9, .22, 2.45], material: 'stone' }),
        createPoiPart('box', { id: 'shrine-altar', name: 'Altar', position: [0, .78, -.05], scale: [1.55, .7, .92], material: 'dark-stone' }),
        createPoiPart('box', { id: 'shrine-pillar-l', name: 'Left pillar', position: [-1.2, 1.5, -.8], scale: [.4, 2.5, .45], material: 'dark-stone' }),
        createPoiPart('box', { id: 'shrine-pillar-r', name: 'Right pillar', position: [1.2, 1.5, -.8], scale: [.4, 2.5, .45], material: 'dark-stone' }),
        createPoiPart('box', { id: 'shrine-lintel', name: 'Lintel', position: [0, 2.72, -.8], scale: [2.85, .36, .5], material: 'dark-stone' }),
        createPoiPart('torch', { id: 'shrine-light-a', name: 'Offering light', position: [-.45, .55, .1], scale: [.75, .75, .75], solid: false }),
        createPoiPart('torch', { id: 'shrine-light-b', name: 'Offering light', position: [.45, .55, .1], scale: [.75, .75, .75], solid: false }),
      ],
    ),
    make(
      'starter-ruined-watchtower',
      'Ruined Watchtower',
      'watchtower',
      'Broken tower crown, doorway and collapsed masonry authored as a reusable landmark.',
      13,
      13,
      [
        createPoiPart('entry', { id: 'tower-entry', name: 'Door approach', position: [0, 0, 5.3], solid: false }),
        createPoiPart('cylinder', { id: 'tower-body', name: 'Tower body', position: [0, 2.65, 0], scale: [3.8, 5.3, 3.8], material: 'stone' }),
        createPoiPart('box', { id: 'tower-door-dark', name: 'Door recess', position: [0, 1, 1.86], scale: [1.05, 1.8, .18], material: 'dark-stone', solid: false }),
        createPoiPart('box', { id: 'tower-crown-a', name: 'Broken crown', position: [-.9, 5.6, -.15], rotation: [0, .15, .08], scale: [1.65, .8, .65], material: 'dark-stone' }),
        createPoiPart('box', { id: 'tower-crown-b', name: 'Broken crown', position: [.85, 5.8, .35], rotation: [0, -.2, -.05], scale: [1.25, 1.05, .65], material: 'dark-stone' }),
        createPoiPart('rock', { id: 'tower-rubble-a', name: 'Collapsed stone', position: [2.35, .42, -1.5], scale: [1.2, .8, 1], material: 'dark-stone' }),
        createPoiPart('rock', { id: 'tower-rubble-b', name: 'Collapsed stone', position: [2.85, .28, -1.1], scale: [.8, .55, .7], material: 'stone' }),
      ],
    ),
    make(
      'starter-old-graveyard',
      'Old Graveyard',
      'graveyard',
      'Fenced burial yard with uneven grave rows and a clear entrance.',
      15,
      13,
      [
        createPoiPart('entry', { id: 'grave-entry', name: 'Gate approach', position: [0, 0, 5.7], solid: false }),
        ...Array.from({ length: 9 }, (_, index) => {
          const col = index % 3
          const row = Math.floor(index / 3)
          return createPoiPart('box', {
            id: `grave-stone-${index}`,
            name: `Gravestone ${index + 1}`,
            position: [-2.5 + col * 2.5 + (row % 2) * .28, .55, -2.5 + row * 2.15],
            rotation: [0, (index % 3 - 1) * .08, (index % 2 ? .04 : -.03)],
            scale: [.55, 1.1 + (index % 2) * .2, .22],
            material: index % 3 === 0 ? 'dark-stone' : 'stone',
          })
        }),
        createPoiPart('box', { id: 'grave-fence-l', name: 'Left fence', position: [-5.4, .55, 0], scale: [.16, 1.1, 9.8], material: 'wood' }),
        createPoiPart('box', { id: 'grave-fence-r', name: 'Right fence', position: [5.4, .55, 0], scale: [.16, 1.1, 9.8], material: 'wood' }),
        createPoiPart('box', { id: 'grave-fence-back', name: 'Back fence', position: [0, .55, -4.85], scale: [10.8, 1.1, .16], material: 'wood' }),
      ],
    ),
    make(
      'starter-beast-den',
      'Beast Den',
      'den',
      'Asymmetric rock mound with recessed cave mouth and scattered remains.',
      12,
      11,
      [
        createPoiPart('entry', { id: 'den-entry', name: 'Den approach', position: [0, 0, 4.6], solid: false }),
        createPoiPart('rock', { id: 'den-rock-a', name: 'West boulder', position: [-1.55, .9, .25], scale: [1.8, 2.25, 1.7], material: 'dark-stone' }),
        createPoiPart('rock', { id: 'den-rock-b', name: 'East boulder', position: [1.45, .86, .2], scale: [1.75, 2.1, 1.65], material: 'stone' }),
        createPoiPart('rock', { id: 'den-rock-c', name: 'Crown boulder', position: [-.3, 1.8, -.15], scale: [2.35, 1.8, 1.8], material: 'dark-stone' }),
        createPoiPart('rock', { id: 'den-rock-d', name: 'Rear boulder', position: [.8, .62, -1.55], scale: [2.2, 1.2, 1.9], material: 'stone' }),
        createPoiPart('box', { id: 'den-mouth', name: 'Cave darkness', position: [0, .95, .82], scale: [2.45, 1.9, .12], material: 'dark-stone', color: '#050705', solid: false }),
        createPoiPart('log', { id: 'den-bone-a', name: 'Bone fragment', position: [-.45, .1, 2.25], rotation: [0, .5, 0], scale: [.7, .12, .12], material: 'bone', solid: false }),
      ],
    ),
    make(
      'starter-forest-ruins',
      'Forest Ruins',
      'ruins',
      'Broken walls and columns designed to frame a readable approach without a solid ground disk.',
      16,
      15,
      [
        createPoiPart('entry', { id: 'ruins-entry', name: 'Arch approach', position: [0, 0, 6.1], solid: false }),
        createPoiPart('box', { id: 'ruins-wall-l', name: 'West wall', position: [-3.8, 1.05, -.2], rotation: [0, .06, 0], scale: [.65, 2.1, 5.5], material: 'stone' }),
        createPoiPart('box', { id: 'ruins-wall-r', name: 'East wall', position: [3.65, .72, -1], rotation: [0, -.12, 0], scale: [.65, 1.45, 3.8], material: 'dark-stone' }),
        createPoiPart('cylinder', { id: 'ruins-column-a', name: 'Standing column', position: [-1.7, 1.3, 2.7], scale: [.72, 2.6, .72], material: 'stone' }),
        createPoiPart('cylinder', { id: 'ruins-column-b', name: 'Broken column', position: [1.55, .42, -2.25], rotation: [0, .35, 1.52], scale: [.68, 2.55, .68], material: 'dark-stone' }),
        createPoiPart('box', { id: 'ruins-lintel-l', name: 'Broken lintel', position: [-.9, 2.55, 2.75], rotation: [0, 0, .04], scale: [1.15, .5, .7], material: 'dark-stone' }),
        createPoiPart('box', { id: 'ruins-lintel-r', name: 'Broken lintel', position: [.95, 2.42, 2.75], rotation: [0, 0, -.08], scale: [.75, .42, .68], material: 'dark-stone' }),
        createPoiPart('rock', { id: 'ruins-rubble-a', name: 'Rubble', position: [2.2, .28, 1.85], scale: [.9, .55, .8], material: 'stone' }),
        createPoiPart('rock', { id: 'ruins-rubble-b', name: 'Rubble', position: [2.9, .22, 1.25], scale: [.65, .45, .6], material: 'dark-stone' }),
      ],
    ),
  ]
}

function normalizePoiPrefab(value: unknown): PoiPrefab | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Partial<PoiPrefab>
  if (source.format !== 'forge-poi-prefab') return undefined
  if (!Array.isArray(source.parts)) return undefined
  const now = new Date().toISOString()
  const parts = source.parts
    .filter((item): item is PoiPrefabPart => Boolean(item && typeof item === 'object'))
    .map((part) => ({
      id: typeof part.id === 'string' ? part.id : makeId('part'),
      name: typeof part.name === 'string' ? part.name : 'Part',
      kind: isPartKind(part.kind) ? part.kind : 'box',
      material: isMaterialPreset(part.material) ? part.material : 'stone',
      position: tuple3(part.position, [0, .5, 0]),
      rotation: tuple3(part.rotation, [0, 0, 0]),
      scale: tuple3(part.scale, [1, 1, 1]),
      color: typeof part.color === 'string' ? part.color : undefined,
      assetRef: typeof part.assetRef === 'string' ? part.assetRef : undefined,
      solid: typeof part.solid === 'boolean' ? part.solid : part.kind !== 'entry',
    }))

  return {
    format: 'forge-poi-prefab',
    version: 1,
    id: typeof source.id === 'string' ? source.id : makeId('poi'),
    name: typeof source.name === 'string' ? source.name : 'Imported Landmark',
    category: isCategory(source.category) ? source.category : 'custom',
    description: typeof source.description === 'string' ? source.description : '',
    bounds: {
      width: clampNumber(source.bounds?.width, 4, 80, 14),
      depth: clampNumber(source.bounds?.depth, 4, 80, 14),
    },
    gridSize: clampNumber(source.gridSize, .1, 4, .5),
    snap: typeof source.snap === 'boolean' ? source.snap : true,
    parts,
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

function isPartKind(value: unknown): value is PoiPartKind {
  return ['box', 'cylinder', 'rock', 'tent', 'log', 'torch', 'prop', 'entry'].includes(String(value))
}

function isMaterialPreset(value: unknown): value is PoiMaterialPreset {
  return ['stone', 'dark-stone', 'wood', 'cloth', 'earth', 'bone', 'metal', 'moss'].includes(String(value))
}

function isCategory(value: unknown): value is PoiPrefabCategory {
  return ['camp', 'shrine', 'ruins', 'watchtower', 'graveyard', 'den', 'custom'].includes(String(value))
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
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
