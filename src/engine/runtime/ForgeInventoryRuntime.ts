// @ts-nocheck
import { normalizeEquipment } from '../equipment'
import {
  moveInventoryPackItem,
  resolveInventoryPack,
  sortInventoryPack,
  type ForgeInventoryPackLayout,
  type ForgeInventorySortMode,
} from '../inventoryPack'
import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'
import { ForgePlayRuntime } from './ForgePlayRuntime'
import { ForgeDungeonRuntime } from './ForgeDungeonRuntime'

export type ForgeInventorySnapshotExtension = {
  inventoryLayout: ForgeInventoryPackLayout
}

const installed = new WeakSet<object>()

export function installForgeInventoryRuntime(
  RuntimeClass: { prototype: any },
) {
  const proto = RuntimeClass.prototype
  if (installed.has(proto)) return
  installed.add(proto)

  proto.moveInventoryItem = function (
    index: number,
    cell: number,
  ) {
    const current = ensureInventoryLayout(this)
    const next = moveInventoryPackItem(
      this.gameplay,
      runtimeBagInventory(this),
      current,
      index,
      cell,
    )
    if (!next) return false
    this.__forgeInventoryLayout = next
    this.setMessage?.('Pack layout updated.', 1.2)
    if (typeof this.saveGame === 'function') {
      this.saveGame(false)
    } else {
      this.emitState?.()
    }
    return true
  }

  proto.sortInventory = function (
    mode: ForgeInventorySortMode,
  ) {
    this.__forgeInventoryLayout =
      sortInventoryPack(
        this.gameplay,
        runtimeBagInventory(this),
        mode,
      )
    this.setMessage?.(
      mode === 'compact'
        ? 'Pack auto-sorted.'
        : `Pack sorted by ${mode}.`,
      1.6,
    )
    if (typeof this.saveGame === 'function') {
      this.saveGame(false)
    } else {
      this.emitState?.()
    }
    return true
  }

  const originalSnapshot = proto.makeSnapshot
  if (typeof originalSnapshot === 'function') {
    proto.makeSnapshot = function (...args: unknown[]) {
      const base = originalSnapshot.apply(this, args)
      return {
        ...base,
        inventoryLayout: {
          ...ensureInventoryLayout(this),
        },
      }
    }
  }

  const originalPlayerState = proto.playerState
  if (typeof originalPlayerState === 'function') {
    proto.playerState = function (...args: unknown[]) {
      const base = originalPlayerState.apply(this, args)
      return {
        ...base,
        inventoryLayout: {
          ...ensureInventoryLayout(this),
        },
      }
    }
  }

  const originalSave = proto.saveGame
  if (typeof originalSave === 'function') {
    proto.saveGame = function (...args: unknown[]) {
      const result = originalSave.apply(this, args)
      if (this.saveKey) {
        const save = loadRuntimeSave(this.saveKey)
        if (save) {
          writeRuntimeSave(this.saveKey, {
            ...save,
            inventoryLayout: {
              ...ensureInventoryLayout(this),
            },
          })
        }
      }
      return result
    }
  }
}

function runtimeBagInventory(runtime: any) {
  const inventory = [...(runtime.inventory ?? [])]
  const save = runtime.saveKey
    ? loadRuntimeSave(runtime.saveKey)
    : undefined
  const equipment = normalizeEquipment(
    runtime.__forgeEquipment ?? save?.equipment,
    runtime.equippedWeaponId ?? save?.equippedWeaponId,
  )
  const used = new Set<number>()

  for (const itemId of Object.values(equipment)) {
    if (!itemId) continue
    const index = inventory.findIndex(
      (candidate, candidateIndex) =>
        candidate === itemId &&
        !used.has(candidateIndex),
    )
    if (index < 0) continue
    used.add(index)
    inventory[index] =
      `__equipped__:${index}:${itemId}`
  }
  return inventory
}

function ensureInventoryLayout(
  runtime: any,
): ForgeInventoryPackLayout {
  const saved =
    runtime.__forgeInventoryLayout ??
    (runtime.saveKey
      ? loadRuntimeSave(runtime.saveKey)?.inventoryLayout
      : undefined) ??
    {}

  const resolved = resolveInventoryPack(
    runtime.gameplay,
    runtimeBagInventory(runtime),
    saved,
  )
  runtime.__forgeInventoryLayout = resolved.layout
  return runtime.__forgeInventoryLayout
}

installForgeInventoryRuntime(ForgePlayRuntime)
installForgeInventoryRuntime(ForgeDungeonRuntime)
