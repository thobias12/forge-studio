import {
  blueprintToConfig,
  cloneBlueprint,
  createCharacterBlueprint,
  type ForgeCharacterBlueprint,
} from './characterBlueprint'
import { exportConceptForgeCharacterGlb } from './conceptCharacterV2'
import { getAsset, saveAsset } from '../lib/library'

export type SkillboundPlayerProfile = {
  format: 'skillbound-player-profile'
  version: 1
  id: string
  name: string
  blueprint: ForgeCharacterBlueprint
  createdAt: string
  updatedAt: string
  lastPlayedAt?: string
}

const PROFILE_KEY = 'skillbound-player-profiles:v1'
const ACTIVE_KEY = 'skillbound-player-profile:active:v1'
const syncingProfiles = new Set<string>()

export function playerAnimationTargetId(profileId: string) {
  return `skillbound-player:${profileId}`
}

export function listPlayerProfiles(): SkillboundPlayerProfile[] {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const profiles = parsed
      .filter(isProfile)
      .map(withAnimationTarget)
      .sort((a, b) => (b.lastPlayedAt ?? b.updatedAt).localeCompare(a.lastPlayedAt ?? a.updatedAt))
    profiles.forEach((profile) => { void ensurePlayerAnimationCharacter(profile) })
    return profiles
  } catch {
    return []
  }
}

export function createPlayerProfile(name = 'Wanderer', blueprint?: ForgeCharacterBlueprint) {
  const now = new Date().toISOString()
  const id = `hero-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const base = blueprint ? cloneBlueprint(blueprint) : createDefaultPlayerBlueprint(name)
  base.name = sanitizeName(name)
  base.entityKind = 'player'
  base.faction = 'neutral'
  base.creatorCompatible = true
  base.targetAssetId = playerAnimationTargetId(id)
  const profile: SkillboundPlayerProfile = {
    format: 'skillbound-player-profile',
    version: 1,
    id,
    name: base.name,
    blueprint: base,
    createdAt: now,
    updatedAt: now,
  }
  savePlayerProfile(profile)
  setActivePlayerProfileId(profile.id)
  void ensurePlayerAnimationCharacter(profile, true)
  return profile
}

export function createDefaultPlayerBlueprint(name = 'Wanderer') {
  const blueprint = createCharacterBlueprint('villager')
  blueprint.name = sanitizeName(name)
  blueprint.entityKind = 'player'
  blueprint.role = 'melee'
  blueprint.faction = 'neutral'
  blueprint.level = 1
  blueprint.body = {
    height: 1.0,
    bulk: 0.82,
    shoulders: 0.9,
    headScale: 1.08,
    armLength: 0.98,
    legLength: 1.03,
    asymmetry: 0.025,
  }
  blueprint.appearance = {
    armor: 'none',
    headwear: 'hood',
    primary: blueprint.appearance.primary,
    secondary: '#263a39',
    accent: '#92364e',
  }
  blueprint.combat.weaponProfile = 'one-hand-sword'
  blueprint.combat.temperament = 'defensive'
  blueprint.combat.aggression = 0.25
  blueprint.combat.preferredRange = 1.6
  blueprint.npc = { occupation: '', dialogueStyle: 'none', important: false }
  blueprint.tags = ['player', 'human', 'duskstrider', 'melee']
  blueprint.creatorCompatible = true
  return blueprint
}

export function savePlayerProfile(profile: SkillboundPlayerProfile) {
  const profiles = readProfiles()
  const now = new Date().toISOString()
  const next: SkillboundPlayerProfile = {
    ...profile,
    name: sanitizeName(profile.name),
    blueprint: {
      ...cloneBlueprint(profile.blueprint),
      name: sanitizeName(profile.name),
      entityKind: 'player',
      creatorCompatible: true,
      targetAssetId: profile.blueprint.targetAssetId || playerAnimationTargetId(profile.id),
    },
    updatedAt: now,
  }
  const exists = profiles.some((entry) => entry.id === next.id)
  const merged = exists ? profiles.map((entry) => entry.id === next.id ? next : entry) : [next, ...profiles]
  localStorage.setItem(PROFILE_KEY, JSON.stringify(merged))
  void ensurePlayerAnimationCharacter(next, true)
  return next
}

export function touchPlayerProfile(profileId: string) {
  const profile = readProfiles().map(withAnimationTarget).find((entry) => entry.id === profileId)
  if (!profile) return undefined
  const next = savePlayerProfile({ ...profile, lastPlayedAt: new Date().toISOString() })
  setActivePlayerProfileId(profileId)
  return next
}

export function deletePlayerProfile(profileId: string) {
  const remaining = readProfiles().filter((entry) => entry.id !== profileId)
  localStorage.setItem(PROFILE_KEY, JSON.stringify(remaining))
  if (getActivePlayerProfileId() === profileId) localStorage.removeItem(ACTIVE_KEY)
  return remaining
}

export function getActivePlayerProfileId() {
  return localStorage.getItem(ACTIVE_KEY) ?? undefined
}

export function setActivePlayerProfileId(profileId: string) {
  localStorage.setItem(ACTIVE_KEY, profileId)
}

async function ensurePlayerAnimationCharacter(profile: SkillboundPlayerProfile, refresh = false) {
  const id = playerAnimationTargetId(profile.id)
  if (syncingProfiles.has(id)) return
  syncingProfiles.add(id)
  try {
    const existing = await getAsset(id).catch(() => undefined)
    if (existing && !refresh) return
    const blob = await exportConceptForgeCharacterGlb(blueprintToConfig(profile.blueprint))
    await saveAsset({
      id,
      name: `${profile.name} · Skillbound Player`,
      category: 'characters',
      kind: 'glb',
      mime: 'model/gltf-binary',
      tags: ['skillbound-player-profile', 'animation-target', 'ForgeHumanoidV1', profile.id],
      source: 'Skillbound Player Creator · Animation target',
      blob,
    })
  } catch {
    // The playable procedural character remains valid even if its animation authoring mirror cannot be refreshed.
  } finally {
    syncingProfiles.delete(id)
  }
}

function readProfiles(): SkillboundPlayerProfile[] {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(isProfile) : []
  } catch {
    return []
  }
}

function withAnimationTarget(profile: SkillboundPlayerProfile): SkillboundPlayerProfile {
  if (profile.blueprint.targetAssetId) return profile
  return {
    ...profile,
    blueprint: { ...cloneBlueprint(profile.blueprint), targetAssetId: playerAnimationTargetId(profile.id) },
  }
}

function isProfile(value: unknown): value is SkillboundPlayerProfile {
  const candidate = value as Partial<SkillboundPlayerProfile> | undefined
  return Boolean(candidate && candidate.format === 'skillbound-player-profile' && candidate.version === 1 && candidate.id && candidate.name && candidate.blueprint?.format === 'forge-character-blueprint')
}

function sanitizeName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 24)
  return cleaned || 'Wanderer'
}
