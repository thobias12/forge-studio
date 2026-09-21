// @ts-nocheck
import * as THREE from 'three'
import {
  FORGE_EQUIPMENT_SLOTS,
  bestEquipmentState,
  equipItemIntoState,
  equipmentStats,
  itemEquipmentSlot,
  itemRuntimeDescription,
  mitigateEquipmentDamage,
  normalizeEquipment,
  unequipItemFromState,
  type ForgeEquipmentSlot,
  type ForgeEquipmentState,
} from '../equipment'
import {
  bindEquipmentVisualModel,
  clearEquipmentVisualModels,
} from './ForgeEquipmentVisuals'
import { loadRuntimeSave, writeRuntimeSave } from './ForgeGameSave'
import { ForgePlayRuntime } from './ForgePlayRuntime'
import { ForgeDungeonRuntime } from './ForgeDungeonRuntime'

export type ForgeEquipmentSnapshotExtension = {
  equipment: ForgeEquipmentState
  defense: number
  attackBonus: number
}

const installed = new WeakSet<object>()

export function installForgeEquipmentRuntime(RuntimeClass: { prototype: any }) {
  const proto = RuntimeClass.prototype
  if (installed.has(proto)) return
  installed.add(proto)

  proto.equipItem = function (itemId: string) {
    const item = this.gameplay?.items?.find((candidate: any) => candidate.id === itemId)
    if (!item || !this.inventory?.includes(itemId)) return
    const slot = itemEquipmentSlot(item)
    if (!slot) {
      this.setMessage?.(`${item.name} is not equippable.`, 2.2)
      return
    }
    const current = ensureEquipment(this)
    const result = equipItemIntoState(this.gameplay, current, item)
    this.__forgeEquipment = result.equipment
    this.equippedWeaponId = result.equipment.MainHand
    const stats = equipmentStats(this.gameplay, result.equipment)
    this.setMessage?.(`${item.name} equipped to ${slotLabel(slot)}. ${itemRuntimeDescription(item)} · ${stats.defense} total defense.`, 3)
    void this.refreshEquippedModel?.()
    if (typeof this.saveGame === 'function') this.saveGame(false)
    else this.emitState?.()
  }

  proto.unequipItem = function (slot: ForgeEquipmentSlot) {
    const current = ensureEquipment(this)
    if (!current[slot]) return false
    const previousId = current[slot]
    this.__forgeEquipment = unequipItemFromState(current, slot)
    this.equippedWeaponId = this.__forgeEquipment.MainHand
    const item = this.gameplay?.items?.find(
      (candidate: any) => candidate.id === previousId,
    )
    this.setMessage?.(
      `${item?.name ?? slotLabel(slot)} unequipped.`,
      2.2,
    )
    void this.refreshEquippedModel?.()
    if (typeof this.saveGame === 'function') this.saveGame(false)
    else this.emitState?.()
    return true
  }

  proto.equipBest = function () {
    const current = ensureEquipment(this)
    const next = bestEquipmentState(
      this.gameplay,
      current,
      this.inventory ?? [],
    )
    const before = equipmentStats(this.gameplay, current)
    const after = equipmentStats(this.gameplay, next)
    const changed = FORGE_EQUIPMENT_SLOTS.some(
      (slot) => current[slot] !== next[slot],
    )
    if (!changed) {
      this.setMessage?.('Your best available gear is already equipped.', 2.4)
      return false
    }
    this.__forgeEquipment = next
    this.equippedWeaponId = next.MainHand
    this.setMessage?.(
      `Best gear equipped · ${after.damageBonus} gear attack · ${after.defense} defense (${signedDelta(after.damageBonus - before.damageBonus)} ATK, ${signedDelta(after.defense - before.defense)} DEF).`,
      3.2,
    )
    void this.refreshEquippedModel?.()
    if (typeof this.saveGame === 'function') this.saveGame(false)
    else this.emitState?.()
    return true
  }

  const originalRefresh = proto.refreshEquippedModel
  proto.refreshEquippedModel = async function () {
    const equipment = ensureEquipment(this)
    const revision =
      (this.__forgeEquipmentVisualRevision ?? 0) + 1
    this.__forgeEquipmentVisualRevision = revision
    clearEquipmentModels(this)

    const models =
      new Map<ForgeEquipmentSlot, THREE.Object3D>()
    const anchors =
      this.__forgeEquipmentAnchors ??
      new Map<ForgeEquipmentSlot, THREE.Group>()
    this.__forgeEquippedModels = models
    this.__forgeEquipmentAnchors = anchors

    const character =
      this.player?.getObjectByName?.(
        '__forge_bound_character',
      ) as THREE.Object3D | undefined
    const fallbackParent =
      this.player ?? character
    if (!fallbackParent) return

    for (const slot of FORGE_EQUIPMENT_SLOTS) {
      const itemId = equipment[slot]
      const item = itemId
        ? this.gameplay?.items?.find(
            (candidate: any) =>
              candidate.id === itemId,
          )
        : undefined
      if (!item) continue

      try {
        const model = await bindEquipmentVisualModel(
          {
            characterRoot: character,
            fallbackParent,
            anchors,
          },
          item,
          slot,
        )
        if (
          this.disposed ||
          revision !==
            this.__forgeEquipmentVisualRevision ||
          ensureEquipment(this)[slot] !== item.id
        ) {
          model.parent?.remove(model)
          clearEquipmentVisualModels(
            new Map([[slot, model]]),
          )
          continue
        }
        models.set(slot, model)
      } catch {
        // The shared visual binder already provides the same
        // deterministic fallback geometry used by previews.
      }
    }

    this.equippedModel = models.get('MainHand')
    if (
      !models.size &&
      typeof originalRefresh === 'function' &&
      !Object.keys(equipment).length
    ) {
      return originalRefresh.call(this)
    }
  }

  proto.getEquippedItem = function () {
    const equipment = ensureEquipment(this)
    const id = equipment.MainHand
    return id ? this.gameplay?.items?.find((item: any) => item.id === id) : undefined
  }

  proto.getEquippedDamageBonus = function () {
    return equipmentStats(this.gameplay, ensureEquipment(this)).damageBonus
  }

  const originalSnapshot = proto.makeSnapshot
  if (typeof originalSnapshot === 'function') {
    proto.makeSnapshot = function (...args: unknown[]) {
      const base = originalSnapshot.apply(this, args)
      const equipment = ensureEquipment(this)
      const stats = equipmentStats(this.gameplay, equipment)
      return {
        ...base,
        generatedItems: this.gameplay.items.filter(item => item.itemRoll?.sourceId),
        equipment: { ...equipment },
        equippedWeaponId: equipment.MainHand,
        defense: stats.defense,
        attackBonus: stats.damageBonus,
      }
    }
  }

  const originalPlayerState = proto.playerState
  if (typeof originalPlayerState === 'function') {
    proto.playerState = function (...args: unknown[]) {
      const base = originalPlayerState.apply(this, args)
      const equipment = ensureEquipment(this)
      return { ...base, equipment: { ...equipment }, equippedWeaponId: equipment.MainHand }
    }
  }

  const originalSave = proto.saveGame
  if (typeof originalSave === 'function') {
    proto.saveGame = function (...args: unknown[]) {
      const result = originalSave.apply(this, args)
      const equipment = ensureEquipment(this)
      if (this.saveKey) {
        const save = loadRuntimeSave(this.saveKey)
        if (save) writeRuntimeSave(this.saveKey, { ...save, equipment: { ...equipment }, equippedWeaponId: equipment.MainHand })
      }
      return result
    }
  }

  const originalReset = proto.resetProgress
  if (typeof originalReset === 'function') {
    proto.resetProgress = function (...args: unknown[]) {
      this.__forgeEquipment = undefined
      clearEquipmentModels(this)
      return originalReset.apply(this, args)
    }
  }

  const originalDamagePlayer = proto.damagePlayer
  if (typeof originalDamagePlayer === 'function') {
    proto.damagePlayer = function (damage: number, ...args: unknown[]) {
      const defense = equipmentStats(this.gameplay, ensureEquipment(this)).defense
      return originalDamagePlayer.call(this, mitigateEquipmentDamage(damage, defense), ...args)
    }
  }

  const originalResolveEnemyAttack = proto.resolveEnemyAttack
  if (typeof originalResolveEnemyAttack === 'function') {
    proto.resolveEnemyAttack = function (enemy: any, ...args: unknown[]) {
      const originalDamage = enemy?.damage
      if (enemy && Number.isFinite(originalDamage)) {
        const defense = equipmentStats(this.gameplay, ensureEquipment(this)).defense
        enemy.damage = mitigateEquipmentDamage(originalDamage, defense)
      }
      try { return originalResolveEnemyAttack.call(this, enemy, ...args) }
      finally { if (enemy && Number.isFinite(originalDamage)) enemy.damage = originalDamage }
    }
  }

  const originalDispose = proto.dispose
  if (typeof originalDispose === 'function') {
    proto.dispose = function (...args: unknown[]) {
      clearEquipmentModels(this)
      return originalDispose.apply(this, args)
    }
  }
}

export function hydrateRuntimeEquipment(runtime: any, equipment?: ForgeEquipmentState) {
  runtime.__forgeEquipment = normalizeEquipment(equipment, runtime.equippedWeaponId)
  runtime.equippedWeaponId = runtime.__forgeEquipment.MainHand
  void runtime.refreshEquippedModel?.()
  runtime.emitState?.()
}

function ensureEquipment(runtime: any): ForgeEquipmentState {
  let equipment = runtime.__forgeEquipment as ForgeEquipmentState | undefined
  if (!equipment) {
    const save = runtime.saveKey ? loadRuntimeSave(runtime.saveKey) : undefined
    equipment = normalizeEquipment(save?.equipment as ForgeEquipmentState | undefined, runtime.equippedWeaponId)
    if (!save && runtime.saveKey) {
      for (const itemId of runtime.gameplay?.player?.startingItems ?? []) {
        const item = runtime.gameplay?.items?.find((candidate: any) => candidate.id === itemId)
        if (!item) continue
        equipment = equipItemIntoState(runtime.gameplay, equipment, item).equipment
      }
    }
    runtime.__forgeEquipment = equipment
  }
  if (runtime.equippedWeaponId && !equipment.MainHand && runtime.inventory?.includes(runtime.equippedWeaponId)) equipment.MainHand = runtime.equippedWeaponId
  runtime.equippedWeaponId = equipment.MainHand
  return equipment
}

function clearEquipmentModels(runtime: any) {
  const models = runtime.__forgeEquippedModels as
    | Map<ForgeEquipmentSlot, THREE.Object3D>
    | undefined
  clearEquipmentVisualModels(models)
  runtime.__forgeEquippedModels = new Map()
  runtime.equippedModel = undefined
}

function signedDelta(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

function slotLabel(slot: ForgeEquipmentSlot) {
  if (slot === 'MainHand') return 'Main Hand'
  if (slot === 'OffHand') return 'Off Hand'
  return slot
}

installForgeEquipmentRuntime(ForgePlayRuntime)
installForgeEquipmentRuntime(ForgeDungeonRuntime)
