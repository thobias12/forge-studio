import type { ForgeWeaponAnimationProfile } from './weaponAnimationProfiles'

export type ForgeAnimationActionId =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attackPrimary'
  | 'attackHeavy'
  | 'cast'
  | 'block'
  | 'hit'
  | 'stagger'
  | 'dodge'
  | 'death'
  | 'equip'
  | 'unequip'

export type ForgeAnimationEventKind = 'hit' | 'vfx' | 'sfx' | 'recovery'

export type ForgeAnimationEvent = {
  id: string
  kind: ForgeAnimationEventKind
  time: number
}

export type ForgeAnimationActionBinding = {
  clip?: string
  loop: boolean
  speed: number
  events?: ForgeAnimationEvent[]
}

export type ForgeAnimationSet = {
  format: 'forge-animation-set'
  version: 1
  targetAssetId: string
  rig: 'ForgeHumanoidV1'
  weaponProfile: ForgeWeaponAnimationProfile
  previewItemId?: string
  actions: Partial<Record<ForgeAnimationActionId, ForgeAnimationActionBinding>>
}

export type ForgeAnimationActionDefinition = {
  id: ForgeAnimationActionId
  label: string
  group: 'Movement' | 'Combat' | 'Reactions' | 'Equipment'
  loop: boolean
  aliases: RegExp[]
}

export const FORGE_ANIMATION_ACTIONS: ForgeAnimationActionDefinition[] = [
  { id: 'idle', label: 'Idle', group: 'Movement', loop: true, aliases: [/^idle$/i, /idle/i, /stand/i] },
  { id: 'walk', label: 'Walk', group: 'Movement', loop: true, aliases: [/^walk$/i, /walk/i, /locom/i] },
  { id: 'run', label: 'Run', group: 'Movement', loop: true, aliases: [/^run$/i, /run/i, /sprint/i] },
  { id: 'attackPrimary', label: 'Primary Attack', group: 'Combat', loop: false, aliases: [/^attack$/i, /attack.?1/i, /primary/i, /slash/i, /strike/i, /swing/i] },
  { id: 'attackHeavy', label: 'Heavy Attack', group: 'Combat', loop: false, aliases: [/heavy/i, /attack.?2/i, /power/i, /smash/i] },
  { id: 'cast', label: 'Cast', group: 'Combat', loop: false, aliases: [/cast/i, /spell/i, /magic/i] },
  { id: 'block', label: 'Block', group: 'Combat', loop: true, aliases: [/block/i, /guard/i, /defend/i] },
  { id: 'hit', label: 'Hit Reaction', group: 'Reactions', loop: false, aliases: [/^hit$/i, /hurt/i, /impact/i, /damage/i] },
  { id: 'stagger', label: 'Stagger', group: 'Reactions', loop: false, aliases: [/stagger/i, /stun/i, /recoil/i] },
  { id: 'dodge', label: 'Dodge / Roll', group: 'Reactions', loop: false, aliases: [/dodge/i, /roll/i, /evade/i, /dash/i] },
  { id: 'death', label: 'Death', group: 'Reactions', loop: false, aliases: [/death/i, /die/i, /dead/i] },
  { id: 'equip', label: 'Equip', group: 'Equipment', loop: false, aliases: [/equip/i, /draw/i, /unsheathe/i] },
  { id: 'unequip', label: 'Unequip', group: 'Equipment', loop: false, aliases: [/unequip/i, /sheathe/i, /holster/i] },
]

export function animationBindingAssetId(targetAssetId: string) {
  return `forge-animation-set:${targetAssetId}`
}

export function animationPackAssetId(targetAssetId: string) {
  return `forge-animation-pack:${targetAssetId}`
}

export function createAnimationSet(targetAssetId: string, clipNames: string[]): ForgeAnimationSet {
  const actions: ForgeAnimationSet['actions'] = {}
  for (const definition of FORGE_ANIMATION_ACTIONS) {
    const clip = findBestClip(clipNames, definition.aliases)
    if (clip) actions[definition.id] = { clip, loop: definition.loop, speed: 1 }
  }
  return { format: 'forge-animation-set', version: 1, targetAssetId, rig: 'ForgeHumanoidV1', weaponProfile: 'one-hand-sword', actions }
}

export function normalizeAnimationSet(value: Partial<ForgeAnimationSet> | undefined, targetAssetId: string, clipNames: string[] = []): ForgeAnimationSet {
  const fallback = createAnimationSet(targetAssetId, clipNames)
  const rawActions = value?.actions ?? {}
  const actions: ForgeAnimationSet['actions'] = {}
  for (const definition of FORGE_ANIMATION_ACTIONS) {
    const raw = rawActions[definition.id]
    const fallbackBinding = fallback.actions[definition.id]
    const clip = typeof raw?.clip === 'string' ? raw.clip : fallbackBinding?.clip
    if (!clip) continue
    actions[definition.id] = {
      clip,
      loop: typeof raw?.loop === 'boolean' ? raw.loop : definition.loop,
      speed: clampSpeed(raw?.speed),
      events: normalizeEvents(raw?.events),
    }
  }
  return {
    format: 'forge-animation-set',
    version: 1,
    targetAssetId,
    rig: 'ForgeHumanoidV1',
    weaponProfile: value?.weaponProfile ?? 'one-hand-sword',
    previewItemId: value?.previewItemId,
    actions,
  }
}

export async function parseAnimationSet(blob: Blob, targetAssetId = ''): Promise<ForgeAnimationSet | undefined> {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<ForgeAnimationSet>
    if (parsed.format !== 'forge-animation-set' || parsed.version !== 1 || !parsed.actions) return undefined
    const target = parsed.targetAssetId || targetAssetId
    if (!target) return undefined
    return normalizeAnimationSet(parsed, target)
  } catch {
    return undefined
  }
}

export function animationSetBlob(set: ForgeAnimationSet) {
  return new Blob([JSON.stringify(set, null, 2)], { type: 'application/x-forge-animation-set+json' })
}

export function actionDefinition(id: ForgeAnimationActionId) {
  return FORGE_ANIMATION_ACTIONS.find((item) => item.id === id)
}

export function actionEventTime(set: ForgeAnimationSet | undefined, action: ForgeAnimationActionId, kind: ForgeAnimationEventKind) {
  const event = set?.actions[action]?.events?.find((item) => item.kind === kind)
  return event?.time
}

export function resolveRuntimeBinding(set: ForgeAnimationSet | undefined, cue: 'idle' | 'move' | 'attack' | 'hit' | 'death' | 'dodge') {
  if (!set) return undefined
  if (cue === 'idle') return set.actions.idle
  if (cue === 'move') return set.actions.run ?? set.actions.walk
  if (cue === 'attack') return set.actions.attackPrimary
  if (cue === 'hit') return set.actions.hit ?? set.actions.stagger
  if (cue === 'death') return set.actions.death
  return set.actions.dodge
}

function normalizeEvents(value: unknown): ForgeAnimationEvent[] | undefined {
  if (!Array.isArray(value)) return undefined
  const allowed = new Set<ForgeAnimationEventKind>(['hit', 'vfx', 'sfx', 'recovery'])
  const events = value
    .map((raw) => raw as Partial<ForgeAnimationEvent>)
    .filter((raw) => typeof raw.kind === 'string' && allowed.has(raw.kind as ForgeAnimationEventKind) && Number.isFinite(Number(raw.time)))
    .map((raw, index) => ({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `${raw.kind}-${index}`,
      kind: raw.kind as ForgeAnimationEventKind,
      time: Math.max(0, Number(raw.time)),
    }))
    .sort((a, b) => a.time - b.time)
  return events.length ? events : undefined
}

function findBestClip(names: string[], aliases: RegExp[]) {
  for (const alias of aliases) {
    const match = names.find((name) => alias.test(name))
    if (match) return match
  }
  return undefined
}

function clampSpeed(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(3, Math.max(0.1, number)) : 1
}
