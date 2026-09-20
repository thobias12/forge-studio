// @ts-nocheck
import * as THREE from 'three'
import { rollSkillboundLoot } from '../skillboundItems'
import type { DungeonEncounter, DungeonMarker } from '../../lib/dungeonPackage'

export function installDungeonRewardMethods(Runtime: any) {
  Object.assign(Runtime.prototype, dungeonRewardMethods)
}

const dungeonRewardMethods = {
  checkEncounterClears() {
    for (const state of this.encounters.values()) {
      if (!state.active || state.cleared) continue
      const members = [...this.enemies.values()].filter((enemy) => enemy.encounterId === state.definition.id)
      if (!members.length || members.some((enemy) => enemy.health > 0)) continue

      state.cleared = true
      state.active = false
      state.definition.lockDoorIds.forEach((id) => this.lockedDoorIds.delete(id))

      const defeatedBoss = state.definition.boss ? members.find((enemy) => enemy.boss) : undefined
      let rewardLabel: string | undefined

      if (!state.rewardSpawned) {
        state.rewardSpawned = true
        for (const markerId of state.definition.rewardMarkerIds) {
          const marker = this.dungeon.markers.find((candidate) => candidate.id === markerId)
          if (!marker) continue
          rewardLabel = this.spawnReward(marker, state.definition, defeatedBoss?.group.position) ?? rewardLabel
        }

        // A boss should always produce a visible gameplay reward. This fallback
        // also protects old cached dungeon packages that predate reward markers.
        if (state.definition.boss && defeatedBoss && !rewardLabel) {
          const fallbackMarker = {
            id: `${state.definition.id}-fallback-reward`,
            type: 'loot',
            x: defeatedBoss.group.position.x,
            y: defeatedBoss.group.position.y,
            z: defeatedBoss.group.position.z,
            roomId: state.definition.roomId,
            name: 'Boss reward',
            radius: 0.75,
            data: {},
          }
          rewardLabel = this.spawnReward(fallbackMarker, state.definition, defeatedBoss.group.position)
        }
      }

      if (state.definition.boss) {
        this.setMessage(
          rewardLabel
            ? `Vault Warden defeated. ${rewardLabel} dropped nearby. The return portal is active.`
            : 'Vault Warden defeated. The return portal is active, but no valid reward item is configured.',
          5.2,
        )
        this.updatePortalVisual()
      } else this.setMessage(`${state.definition.name} cleared.`, 2.8)
    }
  },

  spawnReward(marker: DungeonMarker, encounter: DungeonEncounter, bossPosition?: THREE.Vector3) {
    const explicitItemId = typeof marker.data.itemId === 'string' ? marker.data.itemId : undefined
    let item = explicitItemId ? this.gameplay.items.find((candidate) => candidate.id === explicitItemId) : undefined

    if (!item) {
      const fallbackId = this.rewardItemForEncounter(encounter)
      item = fallbackId ? this.gameplay.items.find((candidate) => candidate.id === fallbackId) : undefined
    }

    if (!item) {
      this.setMessage(`Reward error: ${explicitItemId ?? marker.name} does not resolve to a Skillbound item.`, 5)
      return undefined
    }

    let x = marker.x
    let z = marker.z
    if (bossPosition) {
      let dx = marker.x - bossPosition.x
      let dz = marker.z - bossPosition.z
      let length = Math.hypot(dx, dz)
      if (length < 0.001) { dx = 1; dz = 0; length = 1 }
      // Keep the reward close to the corpse but outside the automatic pickup radius
      // so the player can actually see the boss drop before collecting it.
      x = bossPosition.x + dx / length * 1.4
      z = bossPosition.z + dz / length * 1.4
    }

    return this.spawnLoot(`${encounter.id}:${marker.id}`, item.id, x, z) ? item.name : undefined
  },

  spawnLoot(id: string, itemId: string, x: number, z: number) {
    if (this.loot.some((drop) => drop.id === id)) return false
    const template = this.gameplay.items.find((candidate) => candidate.id === itemId)
    const item = template ? rollSkillboundLoot(template, this.dungeon.id + ':' + id + ':' + this.gameplay.items.length, template.itemRoll?.level ?? 1) : undefined
    if (item) { itemId = item.id; if (!this.gameplay.items.some(entry => entry.id === item.id)) this.gameplay.items.push(item) }
    if (!item) {
      this.setMessage(`Loot error: item ${itemId} is missing from Gameplay Forge.`, 5)
      return false
    }

    const group = new THREE.Group()
    group.position.set(x, this.floorHeightAt(x, z), z)

    const glow = new THREE.PointLight(item.color, 2.8, 7)
    glow.position.y = 1.0

    const fallback = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshStandardMaterial({
        color: item.color,
        emissive: item.color,
        emissiveIntensity: 0.75,
        roughness: 0.34,
        metalness: 0.18,
      }),
    )
    fallback.position.y = 0.58
    fallback.castShadow = true

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.72, 32),
      new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.04

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.2, 3.4, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
    )
    beam.position.y = 1.7

    group.add(fallback, glow, ring, beam)
    this.world.add(group)

    const drop = { id, itemId, group, fallback, age: 0 }
    this.loot.push(drop)
    void this.bindLootPresentation(drop, item)
    return true
  },
}
