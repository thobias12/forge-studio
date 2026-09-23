import { getForgeAudioContext, playLibraryAudio } from './ForgeAnimationAudio'

export type ForgeCombatAudioCue =
  | 'player.attack-release'
  | 'player.cast-release'
  | 'player.dodge'
  | 'enemy.attack-release'
  | 'enemy.projectile-launch'
  | 'enemy.impact'
  | 'enemy.poise-break'
  | 'enemy.death'
  | 'elite.death'
  | 'caster.grave-zone'
  | 'boss.phase-shift'
  | 'encounter.start'
  | 'encounter.wave'
  | 'encounter.clear'
  | 'boss.awaken'
  | 'boss.defeat'
  | 'portal.activate'

export type ForgeCombatAudioOptions = {
  role?: 'skirmisher' | 'brute' | 'ranged' | 'caster' | string
  boss?: boolean
  elite?: boolean
  intensity?: number
  playbackRate?: number
  volume?: number
  position?: { x: number; z: number }
}

type AudioState = {
  sequence: number
  lastCueAt: Map<string, number>
  activeByGroup: Map<string, number>
  noiseBuffer?: AudioBuffer
}

const states = new WeakMap<AudioContext, AudioState>()

const groupLimits: Record<string, number> = {
  attack: 6,
  impact: 6,
  movement: 2,
  stinger: 2,
}

const cueCooldownMs: Partial<Record<ForgeCombatAudioCue, number>> = {
  'player.attack-release': 46,
  'player.cast-release': 70,
  'player.dodge': 90,
  'enemy.attack-release': 50,
  'enemy.projectile-launch': 42,
  'enemy.impact': 40,
  'enemy.poise-break': 90,
  'enemy.death': 72,
  'elite.death': 95,
  'caster.grave-zone': 150,
  'boss.phase-shift': 260,
  'encounter.start': 500,
  'encounter.wave': 420,
  'encounter.clear': 500,
  'boss.awaken': 700,
  'boss.defeat': 900,
  'portal.activate': 700,
}

function audioState(context: AudioContext) {
  let state = states.get(context)
  if (!state) {
    state = {
      sequence: 0,
      lastCueAt: new Map(),
      activeByGroup: new Map(),
    }
    states.set(context, state)
  }
  return state
}

function cueGroup(cue: ForgeCombatAudioCue) {
  if (
    cue === 'player.attack-release' ||
    cue === 'player.cast-release' ||
    cue === 'enemy.attack-release' ||
    cue === 'enemy.projectile-launch' ||
    cue === 'caster.grave-zone'
  ) return 'attack'
  if (
    cue === 'enemy.impact' ||
    cue === 'enemy.poise-break' ||
    cue === 'enemy.death' ||
    cue === 'elite.death'
  ) return 'impact'
  if (cue === 'player.dodge') return 'movement'
  return 'stinger'
}

function cueDuration(cue: ForgeCombatAudioCue) {
  if (cue === 'boss.defeat') return .95
  if (
    cue === 'boss.phase-shift' ||
    cue === 'boss.awaken' ||
    cue === 'portal.activate'
  ) return .72
  if (
    cue === 'encounter.start' ||
    cue === 'encounter.wave' ||
    cue === 'encounter.clear'
  ) return .52
  if (cue === 'caster.grave-zone') return .45
  if (cue === 'enemy.death' || cue === 'elite.death') return .38
  return .24
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function resolveCueAsset(runtime: any, cue: ForgeCombatAudioCue) {
  const map =
    runtime?.options?.combatAudioCues ??
    runtime?.combatAudioCues
  const value = map?.[cue]
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function masterVolume(options: ForgeCombatAudioOptions) {
  const requested = Number(options.volume ?? .68)
  return Math.max(0, Math.min(1, requested))
}

function rolePitch(role?: string) {
  if (role === 'brute') return .74
  if (role === 'caster') return 1.08
  if (role === 'ranged') return 1.18
  return 1
}

function spatialPan(runtime: any, options: ForgeCombatAudioOptions) {
  if (!options.position || !runtime?.player?.position) return 0
  const dx =
    Number(options.position.x) -
    Number(runtime.player.position.x ?? 0)
  return Math.max(-.72, Math.min(.72, dx / 9))
}

function createOutput(
  context: AudioContext,
  runtime: any,
  options: ForgeCombatAudioOptions,
) {
  const gain = context.createGain()
  gain.gain.value = masterVolume(options)
  const StereoPannerCtor = context.createStereoPanner?.bind(context)
  if (StereoPannerCtor) {
    const panner = StereoPannerCtor()
    panner.pan.value = spatialPan(runtime, options)
    gain.connect(panner)
    panner.connect(context.destination)
    return { input: gain, dispose: () => {
      gain.disconnect()
      panner.disconnect()
    } }
  }
  gain.connect(context.destination)
  return { input: gain, dispose: () => gain.disconnect() }
}

function tone(
  context: AudioContext,
  destination: AudioNode,
  start: number,
  fromHz: number,
  toHz: number,
  duration: number,
  level: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(Math.max(25, fromHz), start)
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(25, toHz),
    start + duration,
  )
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(
    Math.max(.0001, level),
    start + Math.min(.018, duration * .18),
  )
  gain.gain.exponentialRampToValueAtTime(
    .0001,
    start + duration,
  )
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(start)
  oscillator.stop(start + duration + .015)
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect()
    gain.disconnect()
  }, { once: true })
}

function noiseBuffer(context: AudioContext, state: AudioState) {
  if (state.noiseBuffer) return state.noiseBuffer
  const length = Math.max(1, Math.floor(context.sampleRate * .5))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 0x13579bdf
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    data[index] = (seed / 4294967295) * 2 - 1
  }
  state.noiseBuffer = buffer
  return buffer
}

function noise(
  context: AudioContext,
  state: AudioState,
  destination: AudioNode,
  start: number,
  duration: number,
  level: number,
  frequency: number,
  type: BiquadFilterType = 'bandpass',
) {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = noiseBuffer(context, state)
  filter.type = type
  filter.frequency.setValueAtTime(
    Math.max(80, frequency),
    start,
  )
  filter.Q.value = type === 'bandpass' ? 1.35 : .72
  gain.gain.setValueAtTime(.0001, start)
  gain.gain.linearRampToValueAtTime(
    Math.max(.0001, level),
    start + Math.min(.014, duration * .15),
  )
  gain.gain.exponentialRampToValueAtTime(
    .0001,
    start + duration,
  )
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.start(start)
  source.stop(start + duration + .015)
  source.addEventListener('ended', () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }, { once: true })
}

function synthCue(
  context: AudioContext,
  state: AudioState,
  runtime: any,
  cue: ForgeCombatAudioCue,
  options: ForgeCombatAudioOptions,
) {
  const output = createOutput(context, runtime, options)
  const now = context.currentTime + .004
  const intensity = Math.max(
    .45,
    Math.min(1.6, Number(options.intensity ?? 1)),
  )
  const roleScale = rolePitch(options.role)
  const variation =
    .94 +
    hashUnit(`${cue}:${state.sequence}`) * .12
  const pitch =
    roleScale *
    variation *
    Math.max(.72, Math.min(1.35, Number(options.playbackRate ?? 1)))

  switch (cue) {
    case 'player.attack-release':
      noise(context, state, output.input, now, .12, .18 * intensity, 1750)
      tone(context, output.input, now, 215 * pitch, 105 * pitch, .13, .11 * intensity, 'triangle')
      break
    case 'player.cast-release':
      tone(context, output.input, now, 360 * pitch, 620 * pitch, .18, .12 * intensity, 'sine')
      tone(context, output.input, now + .025, 720 * pitch, 410 * pitch, .2, .065 * intensity, 'triangle')
      break
    case 'player.dodge':
      noise(context, state, output.input, now, .18, .13 * intensity, 1100, 'highpass')
      tone(context, output.input, now, 190 * pitch, 95 * pitch, .15, .055 * intensity, 'sine')
      break
    case 'enemy.attack-release':
      noise(context, state, output.input, now, .12, .15 * intensity, options.role === 'brute' ? 520 : 1350)
      tone(context, output.input, now, (options.role === 'brute' ? 120 : 250) * pitch, (options.role === 'brute' ? 62 : 125) * pitch, .15, .1 * intensity, options.role === 'caster' ? 'sine' : 'triangle')
      break
    case 'enemy.projectile-launch':
      noise(context, state, output.input, now, .1, .11 * intensity, 2300, 'highpass')
      tone(context, output.input, now, 480 * pitch, 250 * pitch, .11, .07 * intensity, 'square')
      break
    case 'enemy.impact':
      noise(context, state, output.input, now, .11, .15 * intensity, options.role === 'brute' ? 320 : 720, 'lowpass')
      tone(context, output.input, now, (options.role === 'brute' ? 92 : 145) * pitch, 55 * pitch, .17, .13 * intensity, 'triangle')
      break
    case 'enemy.poise-break':
      noise(context, state, output.input, now, .18, .2 * intensity, 1250)
      tone(context, output.input, now, 760 * pitch, 260 * pitch, .24, .14 * intensity, 'square')
      tone(context, output.input, now + .018, 1180 * pitch, 430 * pitch, .2, .07 * intensity, 'triangle')
      break
    case 'enemy.death':
    case 'elite.death':
      noise(context, state, output.input, now, .22, (cue === 'elite.death' ? .19 : .13) * intensity, 460, 'lowpass')
      tone(context, output.input, now, (cue === 'elite.death' ? 175 : 145) * pitch, 46 * pitch, cue === 'elite.death' ? .34 : .27, .14 * intensity, 'sawtooth')
      break
    case 'caster.grave-zone':
      tone(context, output.input, now, 155 * pitch, 92 * pitch, .42, .11 * intensity, 'sine')
      tone(context, output.input, now + .06, 440 * pitch, 260 * pitch, .34, .07 * intensity, 'triangle')
      noise(context, state, output.input, now, .34, .075 * intensity, 820)
      break
    case 'boss.phase-shift':
      tone(context, output.input, now, 68 * pitch, 142 * pitch, .58, .16 * intensity, 'sawtooth')
      tone(context, output.input, now + .08, 330 * pitch, 660 * pitch, .48, .08 * intensity, 'sine')
      noise(context, state, output.input, now, .46, .08 * intensity, 1250)
      break
    case 'encounter.start':
      tone(context, output.input, now, 110, 145, .28, .11 * intensity, 'triangle')
      tone(context, output.input, now + .15, 165, 220, .3, .085 * intensity, 'triangle')
      break
    case 'encounter.wave':
      tone(context, output.input, now, 180, 260, .18, .09 * intensity, 'triangle')
      tone(context, output.input, now + .11, 240, 360, .2, .07 * intensity, 'sine')
      break
    case 'encounter.clear':
      tone(context, output.input, now, 220, 330, .22, .085 * intensity, 'sine')
      tone(context, output.input, now + .12, 330, 495, .28, .075 * intensity, 'sine')
      break
    case 'boss.awaken':
      tone(context, output.input, now, 62, 92, .52, .17 * intensity, 'sawtooth')
      noise(context, state, output.input, now + .05, .42, .09 * intensity, 360, 'lowpass')
      tone(context, output.input, now + .2, 185, 125, .36, .065 * intensity, 'triangle')
      break
    case 'boss.defeat':
      tone(context, output.input, now, 115, 54, .62, .17 * intensity, 'sawtooth')
      noise(context, state, output.input, now, .48, .13 * intensity, 420, 'lowpass')
      tone(context, output.input, now + .26, 260, 390, .48, .08 * intensity, 'sine')
      break
    case 'portal.activate':
      tone(context, output.input, now, 220, 440, .42, .095 * intensity, 'sine')
      tone(context, output.input, now + .12, 330, 660, .46, .072 * intensity, 'sine')
      tone(context, output.input, now + .24, 440, 880, .42, .052 * intensity, 'triangle')
      break
  }

  window.setTimeout(
    output.dispose,
    Math.ceil((cueDuration(cue) + .18) * 1000),
  )
}

export async function playCombatAudioCue(
  runtime: any,
  cue: ForgeCombatAudioCue,
  options: ForgeCombatAudioOptions = {},
) {
  if (typeof window === 'undefined') return false
  const context = getForgeAudioContext()
  if (!context) return false
  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined)
  }
  if (context.state !== 'running') return false

  const state = audioState(context)
  const nowMs = performance.now()
  const cooldown = cueCooldownMs[cue] ?? 60
  const last = state.lastCueAt.get(cue) ?? -Infinity
  if (nowMs - last < cooldown) return false

  const group = cueGroup(cue)
  const active = state.activeByGroup.get(group) ?? 0
  if (active >= (groupLimits[group] ?? 4)) return false

  state.lastCueAt.set(cue, nowMs)
  state.activeByGroup.set(group, active + 1)
  state.sequence += 1

  const release = () => {
    const current = state.activeByGroup.get(group) ?? 1
    state.activeByGroup.set(group, Math.max(0, current - 1))
  }
  window.setTimeout(
    release,
    Math.ceil((cueDuration(cue) + .08) * 1000),
  )

  const assetId = resolveCueAsset(runtime, cue)
  if (assetId) {
    const played = await playLibraryAudio(assetId, {
      volume: masterVolume(options),
      playbackRate:
        Math.max(.72, Math.min(1.35, Number(options.playbackRate ?? 1))) *
        rolePitch(options.role),
    }).catch(() => false)
    if (played) return true
  }

  synthCue(context, state, runtime, cue, options)
  return true
}
