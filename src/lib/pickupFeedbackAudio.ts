export type PickupFeedbackKind = 'gold' | 'xp'

type WebkitAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }

let audioContext: AudioContext | undefined
let primed = false
const lastScheduledAt: Record<PickupFeedbackKind, number> = { gold: 0, xp: 0 }

export function primePickupFeedbackAudio() {
  if (primed || typeof window === 'undefined') return
  primed = true
  const unlock = () => {
    const context = ensureAudioContext()
    if (context?.state === 'suspended') void context.resume().catch(() => undefined)
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

export function playPickupFeedbackSound(kind: PickupFeedbackKind, amount = 1, delaySeconds = 0) {
  const context = ensureAudioContext()
  if (!context) return
  if (context.state === 'suspended') void context.resume().catch(() => undefined)

  const spacing = kind === 'gold' ? 0.055 : 0.07
  const requested = context.currentTime + Math.max(0, delaySeconds)
  const when = Math.max(requested, lastScheduledAt[kind] + spacing)
  lastScheduledAt[kind] = when
  const intensity = Math.min(1.35, 0.88 + Math.log10(Math.max(1, amount) + 1) * 0.2)

  if (kind === 'gold') playGoldClink(context, when, intensity)
  else playXpPing(context, when, intensity)
}

export function previewPickupFeedbackSound(kind: PickupFeedbackKind) {
  const context = ensureAudioContext()
  if (!context) return
  if (context.state === 'suspended') void context.resume().catch(() => undefined)
  playPickupFeedbackSound(kind, kind === 'gold' ? 42 : 186, kind === 'gold' ? 0.31 : 0.35)
}

function ensureAudioContext() {
  if (audioContext) return audioContext
  if (typeof window === 'undefined') return undefined
  const AudioContextCtor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext
  if (!AudioContextCtor) return undefined
  audioContext = new AudioContextCtor({ latencyHint: 'interactive' })
  return audioContext
}

function playGoldClink(context: AudioContext, when: number, intensity: number) {
  const master = context.createGain()
  master.gain.setValueAtTime(0.0001, when)
  master.gain.exponentialRampToValueAtTime(0.12 * intensity, when + 0.004)
  master.gain.exponentialRampToValueAtTime(0.0001, when + 0.115)
  master.connect(context.destination)

  const pitch = 0.97 + Math.random() * 0.07
  const primary = context.createOscillator()
  primary.type = 'triangle'
  primary.frequency.setValueAtTime(2150 * pitch, when)
  primary.frequency.exponentialRampToValueAtTime(1280 * pitch, when + 0.085)
  primary.connect(master)
  primary.start(when)
  primary.stop(when + 0.12)

  const sparkleGain = context.createGain()
  sparkleGain.gain.setValueAtTime(0.0001, when)
  sparkleGain.gain.exponentialRampToValueAtTime(0.052 * intensity, when + 0.003)
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.075)
  sparkleGain.connect(context.destination)
  const sparkle = context.createOscillator()
  sparkle.type = 'sine'
  sparkle.frequency.setValueAtTime(3650 * pitch, when)
  sparkle.frequency.exponentialRampToValueAtTime(2480 * pitch, when + 0.062)
  sparkle.connect(sparkleGain)
  sparkle.start(when)
  sparkle.stop(when + 0.082)

  addTransientNoise(context, when, 0.032, 3600, 0.035 * intensity)
}

function playXpPing(context: AudioContext, when: number, intensity: number) {
  const master = context.createGain()
  master.gain.setValueAtTime(0.0001, when)
  master.gain.exponentialRampToValueAtTime(0.085 * intensity, when + 0.006)
  master.gain.exponentialRampToValueAtTime(0.0001, when + 0.17)
  master.connect(context.destination)

  const pitch = 0.98 + Math.random() * 0.05
  const low = context.createOscillator()
  low.type = 'sine'
  low.frequency.setValueAtTime(880 * pitch, when)
  low.frequency.exponentialRampToValueAtTime(1160 * pitch, when + 0.115)
  low.connect(master)
  low.start(when)
  low.stop(when + 0.18)

  const highGain = context.createGain()
  highGain.gain.setValueAtTime(0.0001, when)
  highGain.gain.exponentialRampToValueAtTime(0.042 * intensity, when + 0.008)
  highGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13)
  highGain.connect(context.destination)
  const high = context.createOscillator()
  high.type = 'triangle'
  high.frequency.setValueAtTime(1760 * pitch, when)
  high.frequency.exponentialRampToValueAtTime(2310 * pitch, when + 0.105)
  high.connect(highGain)
  high.start(when)
  high.stop(when + 0.145)

  addTransientNoise(context, when + 0.005, 0.045, 4800, 0.018 * intensity)
}

function addTransientNoise(context: AudioContext, when: number, duration: number, cutoff: number, gainValue: number) {
  const frames = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < frames; index += 1) data[index] = Math.random() * 2 - 1

  const source = context.createBufferSource()
  source.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(cutoff, when)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(when)
  source.stop(when + duration)
}
