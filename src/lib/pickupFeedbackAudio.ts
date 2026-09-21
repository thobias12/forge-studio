export type PickupFeedbackKind = 'gold' | 'xp'

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | undefined
let master: GainNode | undefined
let compressor: DynamicsCompressorNode | undefined
let primed = false
let goldPhrase = 0
let lastGoldScheduledAt = 0

export function primePickupFeedbackAudio() {
  if (primed || typeof window === 'undefined') return
  primed = true
  const unlock = () => {
    const context = ensureAudioGraph()
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
  // XP is intentionally visual-only.
  if (kind !== 'gold') return

  const context = ensureAudioGraph()
  if (!context || !master) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }

  const requested = context.currentTime + Math.max(0, delaySeconds)
  const when = Math.max(requested, lastGoldScheduledAt + .065)
  const separated = when - lastGoldScheduledAt > .68
  lastGoldScheduledAt = when

  if (separated) goldPhrase = 0
  else goldPhrase = (goldPhrase + 1) % 5

  playGoldClink(context, when, goldPhrase, amount)
}

export function playLevelUpFeedbackSound(delaySeconds = 0) {
  const context = ensureAudioGraph()
  if (!context || !master) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }

  const when = context.currentTime + Math.max(0, delaySeconds)
  playTone(context, 392, 392, .38, .045, when, 'sine', .014)
  playTone(context, 523.25, 523.25, .42, .065, when + .045, 'sine', .012)
  playTone(context, 659.25, 659.25, .36, .052, when + .115, 'sine', .012)
  playTone(context, 783.99, 783.99, .32, .035, when + .18, 'sine', .014)
}

export function previewPickupFeedbackSound(kind: PickupFeedbackKind) {
  const context = ensureAudioGraph()
  if (!context) return
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
  playPickupFeedbackSound(kind, kind === 'gold' ? 42 : 186, .02)
}

function ensureAudioGraph() {
  if (audioContext) return audioContext
  if (typeof window === 'undefined') return undefined

  const AudioContextCtor =
    window.AudioContext ??
    (window as WebkitAudioWindow).webkitAudioContext
  if (!AudioContextCtor) return undefined

  audioContext = new AudioContextCtor({ latencyHint: 'interactive' })

  compressor = audioContext.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.knee.value = 10
  compressor.ratio.value = 3.2
  compressor.attack.value = .002
  compressor.release.value = .08

  master = audioContext.createGain()
  master.gain.value = .58
  master.connect(compressor)
  compressor.connect(audioContext.destination)

  return audioContext
}

function playGoldClink(
  context: AudioContext,
  when: number,
  phrase: number,
  amount: number,
) {
  const notes = [1, 1.059, 1.122, 1.189, 1.335]
  const note = notes[phrase] ?? 1
  const weight = Math.min(
    1.08,
    .9 + Math.log10(Math.max(1, amount) + 1) * .055,
  )

  // A short rounded bell-like "ching": clear attack, warm body, no noise layer.
  playTone(
    context,
    1180 * note,
    1320 * note,
    .115,
    .052 * weight,
    when,
    'sine',
    .0025,
  )
  playTone(
    context,
    1760 * note,
    1650 * note,
    .09,
    .019 * weight,
    when + .014,
    'sine',
    .0025,
  )
  playTone(
    context,
    660 * note,
    760 * note,
    .07,
    .012 * weight,
    when + .006,
    'sine',
    .003,
  )
}

function playTone(
  context: AudioContext,
  startFrequency: number,
  endFrequency: number,
  duration: number,
  volume: number,
  when: number,
  type: OscillatorType,
  attack: number,
) {
  if (!master) return

  const gain = context.createGain()
  gain.gain.setValueAtTime(.0001, when)
  gain.gain.exponentialRampToValueAtTime(
    Math.max(.0002, volume),
    when + Math.max(.002, attack),
  )
  gain.gain.exponentialRampToValueAtTime(
    .0001,
    when + duration,
  )
  gain.connect(master)

  const oscillator = context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(startFrequency, when)
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, endFrequency),
    when + duration,
  )
  oscillator.connect(gain)
  oscillator.start(when)
  oscillator.stop(when + duration + .01)
}
