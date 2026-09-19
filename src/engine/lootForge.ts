import type {
  ForgeLootEntry,
  ForgeLootTableDefinition,
} from './forgeProject'

export type ForgeLootRollItem = {
  itemId: string
  quantity: number
  entryIndex: number
}

export type ForgeLootRollResult = {
  items: ForgeLootRollItem[]
  gold: number
  xp: number
}

export type ForgeLootSimulationRow = {
  itemId: string
  totalQuantity: number
  hitRuns: number
}

export type ForgeLootSimulationResult = {
  runs: number
  rows: ForgeLootSimulationRow[]
  averageItems: number
  averageGold: number
  averageXp: number
  emptyRuns: number
}

export function lootEntryChance(entry: ForgeLootEntry) {
  return clamp01(
    Number.isFinite(entry.chance)
      ? entry.chance
      : .5,
  )
}

export function lootEntryWeight(entry: ForgeLootEntry) {
  return Math.max(
    0,
    typeof entry.weight === 'number' &&
    Number.isFinite(entry.weight)
      ? entry.weight
      : Math.max(.01, lootEntryChance(entry) * 100),
  )
}

export function lootEntryQuantityRange(
  entry: ForgeLootEntry,
): [number, number] {
  const min = clampInt(entry.minQuantity, 1, 99, 1)
  const max = clampInt(entry.maxQuantity, min, 99, min)
  return [min, max]
}

export function lootTableRollRange(
  table: ForgeLootTableDefinition,
): [number, number] {
  const source = table.rolls
  const min = clampInt(source?.[0], 1, 20, 1)
  const max = clampInt(source?.[1], min, 20, min)
  return [min, max]
}

export function rollLootTable(
  table: ForgeLootTableDefinition,
  seed: string,
): ForgeLootRollResult {
  const items: ForgeLootRollItem[] = []
  const mode = table.rollMode ?? 'independent'
  const [rollMin, rollMax] = lootTableRollRange(table)
  const rollCount = deterministicInt(
    `${seed}:roll-count`,
    rollMin,
    rollMax,
  )

  if (mode === 'weighted') {
    const available = table.entries
      .map((entry, index) => ({
        entry,
        index,
        weight: lootEntryWeight(entry),
      }))
      .filter((candidate) => candidate.weight > 0)

    const used = new Set<number>()
    for (let roll = 0; roll < rollCount; roll += 1) {
      const pool = available.filter(
        (candidate) =>
          (table.allowDuplicates ?? true) ||
          !used.has(candidate.index),
      )
      const nothingWeight = Math.max(
        0,
        table.nothingWeight ?? 0,
      )
      const total =
        pool.reduce(
          (sum, candidate) => sum + candidate.weight,
          0,
        ) + nothingWeight
      if (total <= 0) break

      let cursor =
        hashUnit(`${seed}:weighted:${roll}`) *
        total
      if (cursor < nothingWeight) continue
      cursor -= nothingWeight

      const selected =
        pool.find((candidate) => {
          cursor -= candidate.weight
          return cursor <= 0
        }) ?? pool[pool.length - 1]
      if (!selected) continue

      used.add(selected.index)
      const [minQuantity, maxQuantity] =
        lootEntryQuantityRange(selected.entry)
      const quantity = deterministicInt(
        `${seed}:quantity:${roll}:${selected.index}`,
        minQuantity,
        maxQuantity,
      )
      mergeItem(
        items,
        selected.entry.itemId,
        quantity,
        selected.index,
      )
    }
  } else {
    for (
      let cycle = 0;
      cycle < rollCount;
      cycle += 1
    ) {
      table.entries.forEach((entry, index) => {
        const roll = hashUnit(
          `${seed}:independent:${cycle}:${index}:${entry.itemId}`,
        )
        if (roll > lootEntryChance(entry)) return
        const [minQuantity, maxQuantity] =
          lootEntryQuantityRange(entry)
        const quantity = deterministicInt(
          `${seed}:quantity:${cycle}:${index}`,
          minQuantity,
          maxQuantity,
        )
        mergeItem(
          items,
          entry.itemId,
          quantity,
          index,
        )
      })
    }
  }

  return {
    items,
    gold: rollRewardRange(
      table.gold,
      `${seed}:gold`,
    ),
    xp: rollRewardRange(
      table.xp,
      `${seed}:xp`,
    ),
  }
}

export function simulateLootTable(
  table: ForgeLootTableDefinition,
  runs = 100,
  seed = 'loot-forge-preview',
): ForgeLootSimulationResult {
  const safeRuns = clampInt(runs, 1, 5000, 100)
  const totals = new Map<
    string,
    { totalQuantity: number; hitRuns: number }
  >()
  let totalItems = 0
  let totalGold = 0
  let totalXp = 0
  let emptyRuns = 0

  for (let run = 0; run < safeRuns; run += 1) {
    const result = rollLootTable(
      table,
      `${seed}:${run}`,
    )
    totalGold += result.gold
    totalXp += result.xp
    const quantityThisRun = result.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    )
    totalItems += quantityThisRun
    if (
      quantityThisRun === 0 &&
      result.gold === 0 &&
      result.xp === 0
    ) {
      emptyRuns += 1
    }

    for (const item of result.items) {
      const current = totals.get(item.itemId) ?? {
        totalQuantity: 0,
        hitRuns: 0,
      }
      current.totalQuantity += item.quantity
      current.hitRuns += 1
      totals.set(item.itemId, current)
    }
  }

  return {
    runs: safeRuns,
    rows: [...totals.entries()]
      .map(([itemId, value]) => ({
        itemId,
        ...value,
      }))
      .sort(
        (a, b) =>
          b.totalQuantity - a.totalQuantity,
      ),
    averageItems: totalItems / safeRuns,
    averageGold: totalGold / safeRuns,
    averageXp: totalXp / safeRuns,
    emptyRuns,
  }
}

function rollRewardRange(
  range:
    | {
        min: number
        max: number
        chance: number
      }
    | undefined,
  seed: string,
) {
  if (!range) return 0
  if (hashUnit(`${seed}:chance`) > clamp01(range.chance)) {
    return 0
  }
  const min = clampInt(range.min, 0, 100000, 0)
  const max = clampInt(range.max, min, 100000, min)
  return deterministicInt(seed, min, max)
}

function mergeItem(
  items: ForgeLootRollItem[],
  itemId: string,
  quantity: number,
  entryIndex: number,
) {
  if (!itemId || quantity <= 0) return
  const existing = items.find(
    (item) => item.itemId === itemId,
  )
  if (existing) {
    existing.quantity += quantity
    return
  }
  items.push({
    itemId,
    quantity,
    entryIndex,
  })
}

function deterministicInt(
  seed: string,
  min: number,
  max: number,
) {
  if (max <= min) return min
  return (
    min +
    Math.floor(
      hashUnit(seed) * (max - min + 1),
    )
  )
}

export function hashUnit(value: string) {
  let hash = 2166136261
  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function clamp01(value: number) {
  return Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(value) ? value : 0,
    ),
  )
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number =
    typeof value === 'number' &&
    Number.isFinite(value)
      ? Math.round(value)
      : fallback
  return Math.max(min, Math.min(max, number))
}
