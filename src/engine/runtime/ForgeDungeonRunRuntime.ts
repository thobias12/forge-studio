// @ts-nocheck
import * as THREE from 'three'
import type { DungeonEncounter, DungeonMarker } from '../../lib/dungeonPackage'
import { hashSeed, pointInsideRoom, seededRandom } from './ForgeDungeonRuntimeHelpers'

type DirectorWaveEntry = {
  enemyId: string
  count: number
  eliteChance?: number
}

type DirectorWave = {
  id: string
  name: string
  delay?: number
  message?: string
  entries: DirectorWaveEntry[]
}

function encounterWaves(runtime: any, encounter: any): DirectorWave[] {
  const profile = runtime.resolveEncounterProfile?.(encounter)
  if (Array.isArray(profile?.waves) && profile.waves.length) {
    return profile.waves
      .map((wave: any, index: number) => ({
        id: String(wave.id || `wave-${index + 1}`),
        name: String(wave.name || `Wave ${index + 1}`),
        delay: Number.isFinite(wave.delay) ? Number(wave.delay) : undefined,
        message: wave.message ? String(wave.message) : undefined,
        entries: Array.isArray(wave.entries)
          ? wave.entries
              .map((entry: any) => ({
                enemyId: String(entry.enemyId || encounter.family),
                count: Math.max(0, Math.round(Number(entry.count ?? 0))),
                eliteChance: Number.isFinite(entry.eliteChance)
                  ? THREE.MathUtils.clamp(Number(entry.eliteChance), 0, 1)
                  : undefined,
              }))
              .filter((entry: DirectorWaveEntry) => entry.count > 0)
          : [],
      }))
      .filter((wave: DirectorWave) => wave.entries.length)
  }

  return [{
    id: 'wave-1',
    name: encounter.boss ? encounter.name : 'First Assault',
    delay: encounter.boss ? .55 : .4,
    entries: [{
      enemyId: String(profile?.enemyId || encounter.family),
      count: encounter.boss
        ? 1
        : Math.max(1, Math.round(profile?.count ?? encounter.count ?? 1)),
      eliteChance: encounter.boss
        ? 1
        : THREE.MathUtils.clamp(
            Number(profile?.eliteChance ?? encounter.eliteChance ?? 0),
            0,
            1,
          ),
    }],
  }]
}

function plannedEnemyCount(waves: DirectorWave[]) {
  return waves.reduce(
    (total, wave) =>
      total +
      wave.entries.reduce(
        (waveTotal, entry) => waveTotal + entry.count,
        0,
      ),
    0,
  )
}

function encounterProfile(runtime: any, encounter: any) {
  return runtime.resolveEncounterProfile?.(encounter)
}

function runStates(runtime: any) {
  return [...runtime.encounters.values()]
    .sort(
      (a: any, b: any) =>
        Number(a.runOrder ?? 0) - Number(b.runOrder ?? 0),
    )
}

function activeRunState(runtime: any) {
  return runStates(runtime).find((state: any) => state.active)
}

function nextRunState(runtime: any) {
  return runStates(runtime).find((state: any) => !state.cleared)
}

function encounterCanActivate(runtime: any, state: any) {
  return !runStates(runtime).some(
    (candidate: any) =>
      Number(candidate.runOrder ?? 0) <
        Number(state.runOrder ?? 0) &&
      !candidate.cleared,
  )
}

function spawnPosition(
  runtime: any,
  state: any,
  waveIndex: number,
  serial: number,
) {
  const encounter = state.definition
  const room = runtime.dungeon.rooms.find(
    (candidate: any) => candidate.id === encounter.roomId,
  )
  if (!room) return undefined

  const markerMap = new Map(
    runtime.dungeon.markers.map((marker: any) => [marker.id, marker]),
  )
  const spawns = encounter.spawnMarkerIds
    .map((id: string) => markerMap.get(id))
    .filter(Boolean)
  const random = seededRandom(
    hashSeed(
      `${runtime.dungeon.seed}:${encounter.id}:wave:${waveIndex}:spawn:${serial}`,
    ),
  )
  const marker = spawns[serial % Math.max(1, spawns.length)]
  const radius = encounter.boss
    ? 0
    : .95 + Math.sqrt(serial % 9) * .9
  const angle =
    serial * 2.399963229728653 + random() * .58

  return {
    room,
    x: THREE.MathUtils.clamp(
      (marker?.x ?? room.x) + Math.cos(angle) * radius,
      room.x - room.width / 2 + 1.15,
      room.x + room.width / 2 - 1.15,
    ),
    z: THREE.MathUtils.clamp(
      (marker?.z ?? room.z) + Math.sin(angle) * radius,
      room.z - room.depth / 2 + 1.15,
      room.z + room.depth / 2 - 1.15,
    ),
  }
}

function scheduleWave(runtime: any, state: any, index: number, initial = false) {
  const wave = state.waves?.[index]
  if (!wave) return
  const profile = encounterProfile(runtime, state.definition)
  const fallbackDelay =
    initial
      ? .45
      : Number.isFinite(profile?.betweenWaveDelay)
        ? Number(profile.betweenWaveDelay)
        : 1.15

  state.nextWaveIndex = index
  state.wavePending = true
  state.waveSpawned = false
  state.waveDelay = Math.max(
    0,
    Number.isFinite(wave.delay)
      ? Number(wave.delay)
      : fallbackDelay,
  )

  if (!initial) {
    runtime.setMessage?.(
      `Wave ${index}/${state.waves.length} cleared · reinforcements incoming.`,
      Math.max(.9, Math.min(1.7, state.waveDelay)),
    )
  }
}

function spawnWave(runtime: any, state: any) {
  const index = Number(state.nextWaveIndex ?? state.waveIndex + 1)
  const wave: DirectorWave | undefined = state.waves?.[index]
  if (!wave) return

  state.waveIndex = index
  state.wavePending = false
  state.waveSpawned = true
  state.waveDelay = 0

  let localSerial = 0
  for (const entry of wave.entries) {
    const count = state.definition.boss
      ? Math.min(1, entry.count)
      : Math.min(12, entry.count)

    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      const position = spawnPosition(
        runtime,
        state,
        index,
        state.spawnSerial + localSerial,
      )
      if (!position) continue

      const spawnEncounter =
        state.definition.boss
          ? state.definition
          : {
              ...state.definition,
              family: entry.enemyId,
              count: 1,
              boss: false,
              eliteChance:
                entry.eliteChance ??
                state.definition.eliteChance ??
                0,
              __bossProfileId: undefined,
            }

      runtime.spawnEnemy(
        spawnEncounter,
        position.room,
        state.spawnSerial + localSerial,
        position.x,
        position.z,
      )
      localSerial += 1
    }
  }

  state.spawnSerial += localSerial
  const waveRoom = runtime.dungeon.rooms.find(
    (candidate: any) =>
      candidate.id === state.definition.roomId,
  )
  runtime.spawnPulse?.(
    new THREE.Vector3(
      waveRoom?.x ?? runtime.player.position.x,
      waveRoom?.floorLevel ?? runtime.player.position.y,
      waveRoom?.z ?? runtime.player.position.z,
    ),
    state.definition.boss ? '#d75b58' : '#b77952',
    state.definition.boss ? 3.4 : 2.25,
    .26,
  )

  runtime.setMessage?.(
    wave.message ||
      `${state.definition.name} · ${wave.name} · Wave ${index + 1}/${state.waves.length}`,
    state.definition.boss ? 3.2 : 2.35,
  )
  runtime.emitState?.()
}

function updateDirector(runtime: any, delta: number) {
  for (const state of runStates(runtime)) {
    if (!state.active || state.cleared || !state.wavePending) continue
    state.waveDelay = Math.max(0, Number(state.waveDelay ?? 0) - delta)
    if (state.waveDelay <= 0) spawnWave(runtime, state)
  }
}

function aliveMembers(runtime: any, encounterId: string) {
  return [...runtime.enemies.values()].filter(
    (enemy: any) =>
      enemy.encounterId === encounterId && enemy.health > 0,
  )
}

function allMembers(runtime: any, encounterId: string) {
  return [...runtime.enemies.values()].filter(
    (enemy: any) => enemy.encounterId === encounterId,
  )
}

function completeEncounter(runtime: any, state: any) {
  if (state.cleared) return
  state.cleared = true
  state.active = false
  state.wavePending = false
  state.definition.lockDoorIds.forEach(
    (id: string) => runtime.lockedDoorIds.delete(id),
  )

  const members = allMembers(runtime, state.definition.id)
  const defeatedBoss = state.definition.boss
    ? members.find((enemy: any) => enemy.boss)
    : undefined
  let rewardLabel: string | undefined

  if (!state.rewardSpawned) {
    state.rewardSpawned = true
    for (const markerId of state.definition.rewardMarkerIds) {
      const marker = runtime.dungeon.markers.find(
        (candidate: any) => candidate.id === markerId,
      )
      if (!marker) continue
      rewardLabel =
        runtime.spawnReward(
          marker,
          state.definition,
          defeatedBoss?.group.position,
        ) ?? rewardLabel
    }

    if (state.definition.boss && defeatedBoss && !rewardLabel) {
      const fallbackMarker: DungeonMarker = {
        id: `${state.definition.id}-director-fallback-reward`,
        type: 'loot',
        x: defeatedBoss.group.position.x,
        y: defeatedBoss.group.position.y,
        z: defeatedBoss.group.position.z,
        roomId: state.definition.roomId,
        name: 'Boss reward',
        radius: .75,
        data: {},
      }
      rewardLabel = runtime.spawnReward(
        fallbackMarker,
        state.definition,
        defeatedBoss.group.position,
      )
    }
  }

  const profile = encounterProfile(runtime, state.definition)
  if (state.definition.boss) {
    runtime.setMessage?.(
      rewardLabel
        ? `${state.definition.name} defeated. ${rewardLabel} dropped nearby. The return portal is active.`
        : `${state.definition.name} defeated. The return portal is active.`,
      5.2,
    )
    runtime.updatePortalVisual?.()
  } else {
    runtime.setMessage?.(
      profile?.completionMessage ||
        `${state.definition.name} cleared.`,
      3.1,
    )
  }
  runtime.emitState?.()
}

export function installDungeonRunDirector(Runtime: any) {
  if (Runtime.prototype.__forgeDungeonRunDirectorV2) return
  Runtime.prototype.__forgeDungeonRunDirectorV2 = true
  const proto = Runtime.prototype

  const baseUpdateEnemies = proto.updateEnemies
  const baseMakeSnapshot = proto.makeSnapshot

  proto.buildEncounters = function () {
    this.encounters.clear()
    const authored = this.dungeon.logic?.encounters ?? []

    authored.forEach((source: DungeonEncounter, order: number) => {
      const encounter =
        this.resolveEncounterDefinition?.(source) ?? source
      const room = this.dungeon.rooms.find(
        (candidate: any) => candidate.id === encounter.roomId,
      )
      if (!room) return

      const waves = encounterWaves(this, encounter)
      this.encounters.set(encounter.id, {
        definition: encounter,
        active: false,
        cleared: false,
        rewardSpawned: false,
        runOrder: order,
        waves,
        waveIndex: -1,
        nextWaveIndex: 0,
        wavePending: false,
        waveSpawned: false,
        waveDelay: 0,
        spawnSerial: 0,
        plannedEnemyCount: plannedEnemyCount(waves),
        directorStarted: false,
      })
    })
  }

  proto.activateEncounters = function () {
    for (const state of runStates(this)) {
      if (
        state.active ||
        state.cleared ||
        !encounterCanActivate(this, state)
      ) {
        continue
      }

      const encounter = state.definition
      const room = this.dungeon.rooms.find(
        (candidate: any) => candidate.id === encounter.roomId,
      )
      if (!room) continue

      let activate =
        encounter.trigger === 'room-enter'
          ? pointInsideRoom(
              room,
              this.player.position.x,
              this.player.position.z,
              0,
            )
          : false

      if (!activate && encounter.triggerMarkerId) {
        const marker = this.dungeon.markers.find(
          (candidate: any) =>
            candidate.id === encounter.triggerMarkerId,
        )
        if (marker) {
          activate =
            Math.hypot(
              this.player.position.x - marker.x,
              this.player.position.z - marker.z,
            ) <= (marker.radius ?? 2)
        }
      }

      if (!activate) continue
      state.active = true
      state.directorStarted = true
      encounter.lockDoorIds.forEach(
        (id: string) => this.lockedDoorIds.add(id),
      )

      const profile = encounterProfile(this, encounter)
      this.setMessage?.(
        profile?.introMessage ||
          (encounter.boss
            ? `${encounter.name} awakens.`
            : `${encounter.name} begins.`),
        2.8,
      )
      scheduleWave(this, state, 0, true)
      this.emitState?.()
    }
  }

  proto.updateEnemies = function (delta: number) {
    updateDirector(this, delta)
    return baseUpdateEnemies.call(this, delta)
  }

  proto.checkEncounterClears = function () {
    for (const state of runStates(this)) {
      if (!state.active || state.cleared) continue
      if (state.wavePending || state.waveIndex < 0) continue
      if (aliveMembers(this, state.definition.id).length) continue

      const nextIndex = state.waveIndex + 1
      if (nextIndex < state.waves.length) {
        scheduleWave(this, state, nextIndex, false)
        this.emitState?.()
        continue
      }

      completeEncounter(this, state)
    }
  }

  proto.makeSnapshot = function (...args: any[]) {
    const snapshot = baseMakeSnapshot.apply(this, args)
    const states = runStates(this)
    const active = activeRunState(this)
    const next = nextRunState(this)
    const cleared = states.filter((state: any) => state.cleared).length
    const total = states.length
    const waveCurrent = active
      ? Math.max(0, Number(active.waveIndex ?? -1) + 1)
      : 0
    const waveTotal = active?.waves?.length ?? 0
    const waveName =
      active && active.waveIndex >= 0
        ? active.waves?.[active.waveIndex]?.name
        : undefined
    const waveAlive = active
      ? aliveMembers(this, active.definition.id).length
      : 0

    return {
      ...snapshot,
      encounter:
        active
          ? active.wavePending
            ? `${active.definition.name} · Wave ${Math.min(waveTotal, waveCurrent + 1)}/${waveTotal} incoming`
            : `${active.definition.name} · Wave ${waveCurrent}/${waveTotal} · ${waveAlive} remaining`
          : next
            ? `Reach ${next.definition.name}`
            : snapshot.encounter,
      runEncountersCleared: cleared,
      runEncountersTotal: total,
      runProgress:
        total > 0
          ? THREE.MathUtils.clamp(cleared / total, 0, 1)
          : 0,
      runState:
        active
          ? 'encounter'
          : cleared >= total && total > 0
            ? 'complete'
            : 'exploring',
      waveCurrent,
      waveTotal,
      waveName,
      waveAlive,
      wavePending: Boolean(active?.wavePending),
      plannedEnemies:
        states.reduce(
          (sum: number, state: any) =>
            sum + Number(state.plannedEnemyCount ?? 0),
          0,
        ),
    }
  }
}
