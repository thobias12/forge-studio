import {
  cloneBlueprint,
  createCharacterBlueprint,
  type ForgeCharacterBlueprint,
} from './characterBlueprint'

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

export function listPlayerProfiles(): SkillboundPlayerProfile[] {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isProfile).sort((a, b) => (b.lastPlayedAt ?? b.updatedAt).localeCompare(a.lastPlayedAt ?? a.updatedAt))
  } catch {
    return []
  }
}

export function createPlayerProfile(name = 'Wanderer', blueprint?: ForgeCharacterBlueprint) {
  const now = new Date().toISOString()
  const base = blueprint ? cloneBlueprint(blueprint) : createDefaultPlayerBlueprint(name)
  base.name = sanitizeName(name)
  base.entityKind = 'player'
  base.faction = 'neutral'
  base.creatorCompatible = true
  const profile: SkillboundPlayerProfile = {
    format: 'skillbound-player-profile',
    version: 1,
    id: `hero-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: base.name,
    blueprint: base,
    createdAt: now,
    updatedAt: now,
  }
  savePlayerProfile(profile)
  setActivePlayerProfileId(profile.id)
  return profile
}

export function createDefaultPlayerBlueprint(name = 'Wanderer') {
  const blueprint = createCharacterBlueprint('villager')
  blueprint.name = sanitizeName(name)
  blueprint.entityKind = 'player'
  blueprint.role = 'melee'
  blueprint.faction = 'neutral'
  blueprint.level = 1
  blueprint.body.asymmetry = 0
  blueprint.appearance.armor = 'none'
  blueprint.appearance.headwear = 'none'
  blueprint.combat.weaponProfile = 'one-hand-sword'
  blueprint.combat.temperament = 'defensive'
  blueprint.combat.aggression = 0.25
  blueprint.combat.preferredRange = 1.6
  blueprint.npc = { occupation: '', dialogueStyle: 'none', important: false }
  blueprint.tags = ['player', 'human', 'adventurer']
  blueprint.creatorCompatible = true
  return blueprint
}

export function savePlayerProfile(profile: SkillboundPlayerProfile) {
  const profiles = listPlayerProfiles()
  const now = new Date().toISOString()
  const next: SkillboundPlayerProfile = {
    ...profile,
    name: sanitizeName(profile.name),
    blueprint: { ...cloneBlueprint(profile.blueprint), name: sanitizeName(profile.name), entityKind: 'player', creatorCompatible: true },
    updatedAt: now,
  }
  const exists = profiles.some((entry) => entry.id === next.id)
  const merged = exists ? profiles.map((entry) => entry.id === next.id ? next : entry) : [next, ...profiles]
  localStorage.setItem(PROFILE_KEY, JSON.stringify(merged))
  return next
}

export function touchPlayerProfile(profileId: string) {
  const profile = listPlayerProfiles().find((entry) => entry.id === profileId)
  if (!profile) return undefined
  const next = savePlayerProfile({ ...profile, lastPlayedAt: new Date().toISOString() })
  setActivePlayerProfileId(profileId)
  return next
}

export function deletePlayerProfile(profileId: string) {
  const remaining = listPlayerProfiles().filter((entry) => entry.id !== profileId)
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

function isProfile(value: unknown): value is SkillboundPlayerProfile {
  const candidate = value as Partial<SkillboundPlayerProfile> | undefined
  return Boolean(candidate && candidate.format === 'skillbound-player-profile' && candidate.version === 1 && candidate.id && candidate.name && candidate.blueprint?.format === 'forge-character-blueprint')
}

function sanitizeName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 24)
  return cleaned || 'Wanderer'
}
