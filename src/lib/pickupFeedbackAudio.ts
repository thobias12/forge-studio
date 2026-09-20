export type PickupFeedbackKind = 'gold' | 'xp'

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | undefined
let primed = false
let soundSequence = 0
const lastScheduledAt: Record<PickupFeedbackKind, number> = {
  gold: 0,
  xp: 0,
}

export function primePickupFeedbackAudio() {
  if (primed || typeof window === 'undefined') return
  primed = true
  const unlock = () => {
    const context = ensureAudioContext()
    if (context?.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

export function playPickupFeedbackSound(
  kind: PickupFeedbackKind,
  amount = 1,
  delaySeconds = 0,
) {
  const context = ensureAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }

  const spacing = kind === 'gold' ? .048 : .062
  const requested = context.currentTime + Math.max(0, delaySeconds)
  const when = Math.max(requested, lastScheduledAt[kind] + spacing)
  lastScheduledAt[kind] = when

  const intensity = Math.min(
    1.35,
    .86 + Math.log10(Math.max(1, amount) + 1) * .19,
  )
  const sequence = soundSequence++
  if (kind === 'gold') playGoldPickup(context, when, intensity, sequence)
  else playXpPickup(context, when, intensity, sequence)
}

export function playLevelUpFeedbackSound(delaySeconds = 0) {
  const context = ensureAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
  const when = context.currentTime + Math.max(0, delaySeconds)
  const notes = [659.25, 830.61, 987.77]
  notes.forEach((frequency, index) => {
    playBellPartial(
      context,
      when + index * .065,
      frequency,
      .07 - index * .008,
      .28,
      1.7,
    )
  })
}

export function previewPickupFeedbackSound(kind: PickupFeedbackKind) {
  const context = ensureAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
  playPickupFeedbackSound(kind, kind === 'gold' ? 42 : 186, .08)
}

function ensureAudioContext() {
  if (audioContext) return audioContext
  if (typeof window === 'undefined') return undefined
  const AudioContextCtor =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext
  if (!AudioContextCtor) return undefined
  audioContext = new AudioContextCtor({ latencyHint: 'interactive' })
  return audioContext
}

function playGoldPickup(
  context: AudioContext,
  when: number,
  intensity: number,
  sequence: number,
) {
  const pitch = 1 + ((sequence % 5) - 2) * .018
  const bus = createImpactBus(context, when, .22, .125 * intensity)

  const body = context.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(620 * pitch, when)
  body.frequency.exponentialRampToValueAtTime(405 * pitch, when + .095)
  body.connect(bus.input)
  body.start(when)
  body.stop(when + .12)

  const partials = [
    { frequency: 1320, gain: .62, decay: .16 },
    { frequency: 1975, gain: .42, decay: .13 },
    { frequency: 2860, gain: .22, decay: .1 },
  ]
  partials.forEach((partial, index) => {
    const gain = context.createGain()
    gain.gain.setValueAtTime(.0001, when)
    gain.gain.exponentialRampToValueAtTime(
      partial.gain * .085 * intensity,
      when + .003 + index * .001,
    )
    gain.gain.exponentialRampToValueAtTime(
      .0001,
      when + partial.decay,
    )
    gain.connect(bus.input)

    const oscillator = context.createOscillator()
    oscillator.type = index === 0 ? 'triangle' : 'sine'
    oscillator.frequency.setValueAtTime(partial.frequency * pitch, when)
    oscillator.frequency.exponentialRampToValueAtTime(
      partial.frequency * pitch * .93,
      when + partial.decay,
    )
    oscillator.connect(gain)
    oscillator.start(when)
    oscillator.stop(when + partial.decay + .01)
  })

  addTransientNoise(
    context,
    bus.input,
    when,
    .038,
    1750,
    4800,
    .042 * intensity,
  )

  playBellPartial(
    context,
    when + .022,
    1540 * pitch,
    .026 * intensity,
    .09,
    .96,
    bus.input,
  )
}

function playXpPickup(
  context: AudioContext,
  when: number,
  intensity: number,
  sequence: number,
) {
  const pitch = 1 + ((sequence % 4) - 1.5) * .012
  const bus = createImpactBus(context, when, .3, .09 * intensity)

  const lowGain = context.createGain()
  lowGain.gain.setValueAtTime(.0001, when)
  lowGain.gain.exponentialRampToValueAtTime(.075 * intensity, when + .012)
  lowGain.gain.exponentialRampToValueAtTime(.0001, when + .25)
  lowGain.connect(bus.input)
  const low = context.createOscillator()
  low.type = 'sine'
  low.frequency.setValueAtTime(620 * pitch, when)
  low.frequency.exponentialRampToValueAtTime(825 * pitch, when + .19)
  low.connect(lowGain)
  low.start(when)
  low.stop(when + .27)

  const upperGain = context.createGain()
  upperGain.gain.setValueAtTime(.0001, when)
  upperGain.gain.exponentialRampToValueAtTime(.048 * intensity, when + .018)
  upperGain.gain.exponentialRampToValueAtTime(.0001, when + .22)
  upperGain.connect(bus.input)
  const upper = context.createOscillator()
  upper.type = 'triangle'
  upper.frequency.setValueAtTime(930 * pitch, when)
  upper.frequency.exponentialRampToValueAtTime(1315 * pitch, when + .18)
  upper.connect(upperGain)
  upper.start(when)
  upper.stop(when + .24)

  const shimmerGain = context.createGain()
  shimmerGain.gain.setValueAtTime(.0001, when + .018)
  shimmerGain.gain.exponentialRampToValueAtTime(.026 * intensity, when + .04)
  shimmerGain.gain.exponentialRampToValueAtTime(.0001, when + .2)
  shimmerGain.connect(bus.input)
  const shimmer = context.createOscillator()
  shimmer.type = 'sine'
  shimmer.frequency.setValueAtTime(1860 * pitch, when + .018)
  shimmer.frequency.exponentialRampToValueAtTime(2440 * pitch, when + .17)
  shimmer.connect(shimmerGain)
  shimmer.start(when + .018)
  shimmer.stop(when + .21)

  addTransientNoise(
    context,
    bus.input,
    when + .01,
    .055,
    2900,
    6200,
    .015 * intensity,
  )
}

function createImpactBus(
  context: AudioContext,
  when: number,
  duration: number,
  peak: number,
) {
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.setValueAtTime(-20, when)
  compressor.knee.setValueAtTime(16, when)
  compressor.ratio.setValueAtTime(3, when)
  compressor.attack.setValueAtTime(.003, when)
  compressor.release.setValueAtTime(.08, when)

  const master = context.createGain()
  master.gain.setValueAtTime(.0001, when)
  master.gain.exponentialRampToValueAtTime(peak, when + .004)
  master.gain.exponentialRampToValueAtTime(.0001, when + duration)
  master.connect(compressor)
  compressor.connect(context.destination)

  return { input: master }
}

function playBellPartial(
  context: AudioContext,
  when: number,
  frequency: number,
  gainValue: number,
  duration: number,
  endPitchMultiplier: number,
  destination: AudioNode = context.destination,
) {
  const gain = context.createGain()
  gain.gain.setValueAtTime(.0001, when)
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002, gainValue), when + .004)
  gain.gain.exponentialRampToValueAtTime(.0001, when + duration)
  gain.connect(destination)

  const oscillator = context.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, when)
  oscillator.frequency.exponentialRampToValueAtTime(
    frequency * endPitchMultiplier,
    when + duration,
  )
  oscillator.connect(gain)
  oscillator.start(when)
  oscillator.stop(when + duration + .01)
}

function addTransientNoise(
  context: AudioContext,
  destination: AudioNode,
  when: number,
  duration: number,
  lowCut: number,
  highCut: number,
  gainValue: number,
) {
  const frames = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < frames; index += 1) {
    const envelope = 1 - index / frames
    data[index] = (Math.random() * 2 - 1) * envelope
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const highpass = context.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.setValueAtTime(lowCut, when)
  const lowpass = context.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(highCut, when)

  const gain = context.createGain()
  gain.gain.setValueAtTime(.0001, when)
  gain.gain.exponentialRampToValueAtTime(
    Math.max(.0002, gainValue),
    when + .002,
  )
  gain.gain.exponentialRampToValueAtTime(.0001, when + duration)

  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(destination)
  source.start(when)
  source.stop(when + duration)
}
