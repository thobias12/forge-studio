export type ForgeEncounterWaveEntry = {
  enemyId: string
  count: number
  eliteChance?: number
}

export type ForgeEncounterWaveDefinition = {
  id: string
  name: string
  delay?: number
  message?: string
  entries: ForgeEncounterWaveEntry[]
}

export type ForgeEncounterProfile = {
  format: 'forge-encounter-profile'
  version: 1
  id: string
  name: string
  enemyId: string
  family: string
  count: number
  eliteChance: number
  difficulty: number
  introMessage?: string
  rewardLootTableId?: string
  betweenWaveDelay?: number
  completionMessage?: string
  waves?: ForgeEncounterWaveDefinition[]
}

export type ForgeBossPhaseDefinition = {
  id: string
  name: string
  startsAtHealth: number
  damageMultiplier: number
  moveSpeedMultiplier: number
  attackCooldownMultiplier: number
  windupMultiplier: number
  message?: string
  summonEnemyId?: string
  summonCount?: number
  vfxAssetId?: string
}

export type ForgeBossDefinition = {
  format: 'forge-boss'
  version: 1
  id: string
  name: string
  enemyId: string
  healthMultiplier: number
  damageMultiplier: number
  moveSpeedMultiplier: number
  attackCooldownMultiplier: number
  scale: number
  rewardLootTableId?: string
  guaranteedItemId?: string
  phases: ForgeBossPhaseDefinition[]
}

export function createEncounterProfile(id: string = crypto.randomUUID()): ForgeEncounterProfile {
  return {
    format: 'forge-encounter-profile',
    version: 1,
    id,
    name: 'New Encounter',
    enemyId: '',
    family: '',
    count: 5,
    eliteChance: 0.1,
    difficulty: 1,
    introMessage: 'Enemies approach.',
    betweenWaveDelay: 1.2,
    waves: [],
  }
}

export function createBossDefinition(id: string = crypto.randomUUID()): ForgeBossDefinition {
  return {
    format: 'forge-boss',
    version: 1,
    id,
    name: 'New Boss',
    enemyId: '',
    healthMultiplier: 3.2,
    damageMultiplier: 1.65,
    moveSpeedMultiplier: 0.9,
    attackCooldownMultiplier: 1,
    scale: 1.12,
    phases: [
      createBossPhase('phase-1', 'Phase I', 1),
      createBossPhase('phase-2', 'Phase II', 0.65),
      createBossPhase('phase-3', 'Phase III', 0.3),
    ],
  }
}

export function createBossPhase(id: string = crypto.randomUUID(), name = 'New Phase', startsAtHealth = 0.5): ForgeBossPhaseDefinition {
  return {
    id,
    name,
    startsAtHealth,
    damageMultiplier: 1,
    moveSpeedMultiplier: 1,
    attackCooldownMultiplier: 1,
    windupMultiplier: 1,
    summonCount: 0,
  }
}

export function normalizeBossPhases(phases: ForgeBossPhaseDefinition[]) {
  return [...phases]
    .map((phase) => ({ ...phase, startsAtHealth: clamp(phase.startsAtHealth, 0.01, 1) }))
    .sort((a, b) => b.startsAtHealth - a.startsAtHealth)
}

export function activeBossPhase(phases: ForgeBossPhaseDefinition[], healthRatio: number) {
  const ordered = normalizeBossPhases(phases)
  let active = ordered[0]
  for (const phase of ordered) if (healthRatio <= phase.startsAtHealth + 0.0001) active = phase
  return active
}

export function validateEncounterProfile(profile: ForgeEncounterProfile) {
  const warnings: string[] = []
  if (!profile.name.trim()) warnings.push('Encounter needs a name.')
  if (!profile.enemyId && !profile.family) warnings.push('Bind an enemy definition or family.')
  if (profile.count < 1) warnings.push('Encounter count must be at least 1.')
  if (profile.eliteChance < 0 || profile.eliteChance > 1) warnings.push('Elite chance must be between 0 and 1.')
  return warnings
}

export function validateBossDefinition(boss: ForgeBossDefinition) {
  const warnings: string[] = []
  if (!boss.name.trim()) warnings.push('Boss needs a name.')
  if (!boss.enemyId) warnings.push('Boss needs an enemy definition.')
  if (boss.healthMultiplier <= 0) warnings.push('Health multiplier must be above 0.')
  if (!boss.phases.length) warnings.push('Boss needs at least one phase.')
  const ids = new Set<string>()
  for (const phase of boss.phases) {
    if (ids.has(phase.id)) warnings.push(`Duplicate phase id: ${phase.id}`)
    ids.add(phase.id)
    if (phase.startsAtHealth <= 0 || phase.startsAtHealth > 1) warnings.push(`${phase.name} health threshold must be 1–100%.`)
  }
  return warnings
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
