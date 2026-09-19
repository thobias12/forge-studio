// @ts-nocheck
import * as THREE from 'three'
import { itemVisual } from '../itemPresentation'
import { itemClassification } from '../itemTaxonomy'
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
import { disposeBoundObject } from './ForgeAssetRuntime'
import { bindRuntimeItemModel, findRuntimeItemSocket } from './ForgeItemRuntime'
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
    const revision = (this.__forgeEquipmentVisualRevision ?? 0) + 1
    this.__forgeEquipmentVisualRevision = revision
    clearEquipmentModels(this)

    const models = new Map<ForgeEquipmentSlot, THREE.Object3D>()
    this.__forgeEquippedModels = models
    for (const slot of FORGE_EQUIPMENT_SLOTS) {
      const itemId = equipment[slot]
      const item = itemId ? this.gameplay?.items?.find((candidate: any) => candidate.id === itemId) : undefined
      if (!item) continue
      const target = equipmentTarget(this, item, slot)
      try {
        let model = await bindRuntimeItemModel(target, item, 'equipped')
        if (!model) {
          model = createFallbackEquipmentModel(item, slot)
          target.add(model)
        }
        if (this.disposed || revision !== this.__forgeEquipmentVisualRevision || ensureEquipment(this)[slot] !== item.id) {
          model.parent?.remove(model)
          disposeBoundObject(model)
          continue
        }
        models.set(slot, model)
      } catch {
        const fallback = createFallbackEquipmentModel(item, slot)
        target.add(fallback)
        if (revision === this.__forgeEquipmentVisualRevision && ensureEquipment(this)[slot] === item.id) models.set(slot, fallback)
        else { fallback.removeFromParent(); disposeBoundObject(fallback) }
      }
    }
    this.equippedModel = models.get('MainHand')
    if (!models.size && typeof originalRefresh === 'function' && !Object.keys(equipment).length) return originalRefresh.call(this)
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
  const models = runtime.__forgeEquippedModels as Map<ForgeEquipmentSlot, THREE.Object3D> | undefined
  models?.forEach((model) => {
    model.parent?.remove(model)
    disposeBoundObject(model)
  })
  models?.clear()
  runtime.__forgeEquippedModels = new Map()
  runtime.equippedModel = undefined
}

function equipmentTarget(runtime: any, item: any, slot: ForgeEquipmentSlot) {
  const character = runtime.player?.getObjectByName?.('__forge_bound_character') as THREE.Object3D | undefined
  if (character) {
    if (slot === 'MainHand') {
      const socket = itemVisual(item).equipped.socket
      const target = findRuntimeItemSocket(character, socket)
      if (target) return target
    }
    if (slot === 'OffHand') {
      const target = findRuntimeItemSocket(character, 'LeftHand')
      if (target) return target
    }
    const target = findNamedTarget(character, slotAliases(slot))
    if (target) return target
  }
  const anchors = runtime.__forgeEquipmentAnchors ?? new Map<ForgeEquipmentSlot, THREE.Group>()
  runtime.__forgeEquipmentAnchors = anchors
  let anchor = anchors.get(slot)
  if (!anchor) {
    anchor = new THREE.Group()
    anchor.name = `__forge_equipment_anchor_${slot}`
    anchor.position.set(...fallbackPosition(slot))
    runtime.player?.add?.(anchor)
    anchors.set(slot, anchor)
  }
  return anchor
}

function findNamedTarget(root: THREE.Object3D, aliases: string[]) {
  let best: THREE.Object3D | undefined
  root.traverse((child) => {
    if (best) return
    const name = child.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (name && aliases.some((alias) => name === alias || name.endsWith(alias) || name.includes(alias))) best = child
  })
  return best
}

function slotAliases(slot: ForgeEquipmentSlot) {
  if (slot === 'Head') return ['head', 'mixamorighead', 'neck']
  if (slot === 'Chest') return ['upperchest', 'chest', 'spine2', 'spine1', 'spine']
  if (slot === 'Hands') return ['upperchest', 'chest', 'spine2', 'spine1', 'spine']
  if (slot === 'Legs') return ['hips', 'pelvis', 'mixamorighips']
  if (slot === 'Feet') return ['hips', 'pelvis', 'mixamorighips']
  return []
}

function fallbackPosition(slot: ForgeEquipmentSlot): [number, number, number] {
  if (slot === 'MainHand') return [0.58, 1.12, 0]
  if (slot === 'OffHand') return [-0.58, 1.12, 0]
  if (slot === 'Head') return [0, 1.82, 0]
  if (slot === 'Chest') return [0, 1.35, 0]
  if (slot === 'Hands') return [0, 1.24, 0]
  if (slot === 'Legs') return [0, 0.72, 0]
  return [0, 0.32, 0]
}

function createFallbackEquipmentModel(item: any, slot: ForgeEquipmentSlot) {
  const group = new THREE.Group()
  group.name = `__forge_fallback_equipment_${item.id}`
  const color = new THREE.Color(item.color || '#8e8a80')
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12 })
  const dark = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.58), roughness: 0.82, metalness: 0.08 })
  const add = (geometry: THREE.BufferGeometry, position: [number, number, number], rotation?: [number, number, number], source = material) => {
    const mesh = new THREE.Mesh(geometry, source)
    mesh.position.set(...position)
    if (rotation) mesh.rotation.set(...rotation)
    mesh.castShadow = true
    group.add(mesh)
  }
  const subtype = itemClassification(item).subtype
  if (slot === 'MainHand') {
    if (subtype === 'bow') {
      add(new THREE.TorusGeometry(.62, .045, 6, 22, Math.PI * 1.25), [0, .02, 0], [0, 0, Math.PI * .38])
      add(new THREE.BoxGeometry(.025, 1.08, .025), [0, .02, 0], undefined, dark)
    } else if (subtype === 'staff' || subtype === 'spear') {
      add(new THREE.CylinderGeometry(.035, .045, 1.72, 8), [0, .45, 0], undefined, dark)
      add(new THREE.OctahedronGeometry(.14), [0, 1.32, 0])
    } else {
      add(new THREE.BoxGeometry(.1, 1.08, .08), [0, .46, 0], undefined, material)
      add(new THREE.BoxGeometry(.38, .07, .11), [0, -.06, 0], undefined, dark)
    }
  } else if (slot === 'OffHand') {
    add(new THREE.CylinderGeometry(.42, .42, .09, 18), [0, 0, 0], [Math.PI / 2, 0, 0])
    add(new THREE.SphereGeometry(.11, 10, 8), [0, 0, -.08], undefined, dark)
  } else if (slot === 'Head') {
    add(new THREE.SphereGeometry(.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * .62), [0, .05, 0])
  } else if (slot === 'Chest') {
    add(new THREE.BoxGeometry(.72, .72, .4), [0, -.02, 0])
    add(new THREE.BoxGeometry(.82, .12, .46), [0, .34, 0], undefined, dark)
  } else if (slot === 'Hands') {
    add(new THREE.BoxGeometry(.2, .3, .22), [-.55, -.08, 0])
    add(new THREE.BoxGeometry(.2, .3, .22), [.55, -.08, 0])
  } else if (slot === 'Legs') {
    add(new THREE.BoxGeometry(.22, .72, .28), [-.16, -.34, 0])
    add(new THREE.BoxGeometry(.22, .72, .28), [.16, -.34, 0])
  } else if (slot === 'Feet') {
    add(new THREE.BoxGeometry(.24, .18, .42), [-.16, -.72, -.08])
    add(new THREE.BoxGeometry(.24, .18, .42), [.16, -.72, -.08])
  }
  return group
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
