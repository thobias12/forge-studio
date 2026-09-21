import type {
  ForgeGameplayContent,
  ForgeItemDefinition,
} from './forgeProject'
import { itemClassification } from './itemTaxonomy'

export const SKILLBOUND_PACK_COLUMNS = 12
export const SKILLBOUND_PACK_ROWS = 6
export const SKILLBOUND_PACK_CELLS =
  SKILLBOUND_PACK_COLUMNS * SKILLBOUND_PACK_ROWS

export type ForgeInventoryPackLayout = Record<string, number>
export type ForgeInventorySortMode =
  | 'compact'
  | 'type'
  | 'rarity'
  | 'recent'

export type ForgeInventoryFootprint = {
  width: number
  height: number
}

export type ForgeInventoryPackEntry = {
  index: number
  item: ForgeItemDefinition
  cell?: number
  footprint: ForgeInventoryFootprint
  overflow: boolean
}

export function itemInventoryFootprint(
  item: ForgeItemDefinition,
): ForgeInventoryFootprint {
  const classification = itemClassification(item)
  const subtype = classification.subtype

  if (classification.itemType === 'weapon') {
    if (subtype === 'bow' || subtype === 'staff') {
      return { width: 2, height: 4 }
    }
    if (subtype === 'spear') {
      return { width: 1, height: 4 }
    }
    if (subtype === 'dagger') {
      return { width: 1, height: 2 }
    }
    return { width: 1, height: 3 }
  }

  if (classification.itemType === 'offhand') {
    return subtype === 'shield'
      ? { width: 2, height: 3 }
      : { width: 2, height: 2 }
  }

  if (classification.itemType === 'armor') {
    if (subtype === 'chest' || subtype === 'legs') {
      return { width: 2, height: 3 }
    }
    return { width: 2, height: 2 }
  }

  if (
    classification.itemType === 'consumable' ||
    classification.itemType === 'material'
  ) {
    return { width: 1, height: 1 }
  }

  return { width: 1, height: 2 }
}

export function resolveInventoryPack(
  gameplay: ForgeGameplayContent,
  inventory: string[],
  saved: ForgeInventoryPackLayout = {},
) {
  const entries = inventory
    .map((itemId, index) => {
      const item = gameplay.items.find(
        (candidate) => candidate.id === itemId,
      )
      return item
        ? {
            index,
            item,
            footprint: itemInventoryFootprint(item),
          }
        : undefined
    })
    .filter(
      (
        value,
      ): value is {
        index: number
        item: ForgeItemDefinition
        footprint: ForgeInventoryFootprint
      } => Boolean(value),
    )

  const layout: ForgeInventoryPackLayout = {}
  const occupied = new Set<number>()

  for (const entry of entries) {
    const preferred = saved[String(entry.index)]
    const cells =
      preferred === undefined
        ? undefined
        : inventoryFootprintCells(
            entry.footprint,
            preferred,
          )
    if (
      cells &&
      cells.every((cell) => !occupied.has(cell))
    ) {
      layout[String(entry.index)] = preferred
      cells.forEach((cell) => occupied.add(cell))
    }
  }

  for (const entry of entries) {
    if (layout[String(entry.index)] !== undefined) continue
    const cell = findInventoryPackSpace(
      entry.footprint,
      occupied,
    )
    if (cell === undefined) continue
    layout[String(entry.index)] = cell
    inventoryFootprintCells(entry.footprint, cell)
      ?.forEach((value) => occupied.add(value))
  }

  const packed: ForgeInventoryPackEntry[] = entries.map(
    (entry) => {
      const cell = layout[String(entry.index)]
      return {
        ...entry,
        cell,
        overflow: cell === undefined,
      }
    },
  )

  return {
    entries: packed,
    layout,
    occupied,
    overflow: packed.filter((entry) => entry.overflow),
  }
}

export function moveInventoryPackItem(
  gameplay: ForgeGameplayContent,
  inventory: string[],
  saved: ForgeInventoryPackLayout,
  index: number,
  targetCell: number,
) {
  const itemId = inventory[index]
  const item = gameplay.items.find(
    (candidate) => candidate.id === itemId,
  )
  if (!item) return undefined

  const footprint = itemInventoryFootprint(item)
  const targetCells = inventoryFootprintCells(
    footprint,
    targetCell,
  )
  if (!targetCells) return undefined

  const current = resolveInventoryPack(
    gameplay,
    inventory,
    saved,
  )
  const occupied = new Set<number>()
  for (const entry of current.entries) {
    if (entry.index === index || entry.cell === undefined) {
      continue
    }
    inventoryFootprintCells(
      entry.footprint,
      entry.cell,
    )?.forEach((cell) => occupied.add(cell))
  }
  if (targetCells.some((cell) => occupied.has(cell))) {
    return undefined
  }

  return {
    ...current.layout,
    [String(index)]: targetCell,
  }
}

export function sortInventoryPack(
  gameplay: ForgeGameplayContent,
  inventory: string[],
  mode: ForgeInventorySortMode,
) {
  const entries = inventory
    .map((itemId, index) => {
      const item = gameplay.items.find(
        (candidate) => candidate.id === itemId,
      )
      return item
        ? {
            index,
            item,
            footprint: itemInventoryFootprint(item),
          }
        : undefined
    })
    .filter(
      (
        value,
      ): value is {
        index: number
        item: ForgeItemDefinition
        footprint: ForgeInventoryFootprint
      } => Boolean(value),
    )

  const rarityRank = {
    common: 1,
    magic: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    unique: 6,
  } as const

  entries.sort((a, b) => {
    if (mode === 'recent') return b.index - a.index

    if (mode === 'rarity') {
      return (
        rarityRank[b.item.rarity] -
          rarityRank[a.item.rarity] ||
        itemTypeKey(a.item).localeCompare(
          itemTypeKey(b.item),
        ) ||
        b.index - a.index
      )
    }

    if (mode === 'type') {
      return (
        itemTypeKey(a.item).localeCompare(
          itemTypeKey(b.item),
        ) ||
        rarityRank[b.item.rarity] -
          rarityRank[a.item.rarity] ||
        b.index - a.index
      )
    }

    const aArea =
      a.footprint.width * a.footprint.height
    const bArea =
      b.footprint.width * b.footprint.height
    return (
      bArea - aArea ||
      b.footprint.height - a.footprint.height ||
      b.footprint.width - a.footprint.width ||
      a.index - b.index
    )
  })

  const layout: ForgeInventoryPackLayout = {}
  const occupied = new Set<number>()
  for (const entry of entries) {
    const cell = findInventoryPackSpace(
      entry.footprint,
      occupied,
    )
    if (cell === undefined) continue
    layout[String(entry.index)] = cell
    inventoryFootprintCells(
      entry.footprint,
      cell,
    )?.forEach((value) => occupied.add(value))
  }
  return layout
}

export function inventoryFootprintCells(
  footprint: ForgeInventoryFootprint,
  cell: number,
) {
  if (
    !Number.isInteger(cell) ||
    cell < 0 ||
    cell >= SKILLBOUND_PACK_CELLS
  ) {
    return undefined
  }

  const column = cell % SKILLBOUND_PACK_COLUMNS
  const row = Math.floor(
    cell / SKILLBOUND_PACK_COLUMNS,
  )
  if (
    column + footprint.width >
      SKILLBOUND_PACK_COLUMNS ||
    row + footprint.height > SKILLBOUND_PACK_ROWS
  ) {
    return undefined
  }

  const cells: number[] = []
  for (
    let y = 0;
    y < footprint.height;
    y += 1
  ) {
    for (
      let x = 0;
      x < footprint.width;
      x += 1
    ) {
      cells.push(
        cell +
          x +
          y * SKILLBOUND_PACK_COLUMNS,
      )
    }
  }
  return cells
}

export function firstFreeInventoryCell(
  gameplay: ForgeGameplayContent,
  inventory: string[],
  saved: ForgeInventoryPackLayout,
  itemId: string,
) {
  const item = gameplay.items.find(
    (candidate) => candidate.id === itemId,
  )
  if (!item) return undefined
  const current = resolveInventoryPack(
    gameplay,
    inventory,
    saved,
  )
  return findInventoryPackSpace(
    itemInventoryFootprint(item),
    current.occupied,
  )
}

function findInventoryPackSpace(
  footprint: ForgeInventoryFootprint,
  occupied: ReadonlySet<number>,
) {
  for (
    let cell = 0;
    cell < SKILLBOUND_PACK_CELLS;
    cell += 1
  ) {
    const cells = inventoryFootprintCells(
      footprint,
      cell,
    )
    if (
      cells &&
      cells.every((value) => !occupied.has(value))
    ) {
      return cell
    }
  }
  return undefined
}

function itemTypeKey(item: ForgeItemDefinition) {
  const classification = itemClassification(item)
  return `${classification.itemType}:${classification.subtype}`
}
