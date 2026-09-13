import { decodeAudioBlob, encodePcm16Wav } from './audioProcessing'

export type SoundDesignGroup = 'sfx' | 'foley' | 'ambience'
export type SoundRecipeId =
  | 'heavy-impact'
  | 'sword-clash'
  | 'whoosh'
  | 'ui-click'
  | 'bow-shot'
  | 'magic-pulse'
  | 'footstep-stone'
  | 'footstep-wood'
  | 'cloth-rustle'
  | 'wind'
  | 'rain'
  | 'fire'
  | 'cave'

export type SoundDesignSettings = {
  intensity: number
  brightness: number
  length: number
  variation: number
  stereo: number
}

export type SoundRecipe = {
  id: SoundRecipeId
  name: string
  group: SoundDesignGroup
  description: string
  tags: string[]
  baseDuration: number
}

export const SOUND_RECIPES: SoundRecipe[] = [
  { id: 'heavy-impact', name: 'Heavy Impact', group: 'sfx', description: 'Low thump, crack and body for hits, doors and destruction.', tags: ['impact', 'hit', 'thump'], baseDuration: 0.9 },
  { id: 'sword-clash', name: 'Sword Clash', group: 'sfx', description: 'Metal strike with ringing resonances and a sharp transient.', tags: ['sword', 'metal', 'clash'], baseDuration: 1.2 },
  { id: 'whoosh', name: 'Whoosh', group: 'sfx', description: 'Fast movement layer for swings, dodges and transitions.', tags: ['whoosh', 'swing', 'movement'], baseDuration: 0.65 },
  { id: 'ui-click', name: 'UI Click', group: 'sfx', description: 'Short clean game-interface tick with adjustable character.', tags: ['ui', 'click', 'interface'], baseDuration: 0.16 },
  { id: 'bow-shot', name: 'Bow Shot', group: 'sfx', description: 'String snap, body twang and air movement.', tags: ['bow', 'arrow', 'weapon'], baseDuration: 0.75 },
  { id: 'magic-pulse', name: 'Magic Pulse', group: 'sfx', description: 'Synthetic pulse with shimmer for abilities and pickups.', tags: ['magic', 'ability', 'pulse'], baseDuration: 1.0 },
  { id: 'footstep-stone', name: 'Stone Footstep', group: 'foley', description: 'Hard footfall with grit and a short stone slap.', tags: ['footstep', 'stone', 'foley'], baseDuration: 0.42 },
  { id: 'footstep-wood', name: 'Wood Footstep', group: 'foley', description: 'Hollow plank knock with a soft shoe impact.', tags: ['footstep', 'wood', 'foley'], baseDuration: 0.5 },
  { id: 'cloth-rustle', name: 'Cloth Rustle', group: 'foley', description: 'Short textured movement useful under character animation.', tags: ['cloth', 'rustle', 'foley'], baseDuration: 0.7 },
  { id: 'wind', name: 'Wind Bed', group: 'ambience', description: 'Loop-friendly moving air bed for outdoor scenes.', tags: ['wind', 'outdoor', 'ambience'], baseDuration: 8 },
  { id: 'rain', name: 'Rain Bed', group: 'ambience', description: 'Broad rain texture with randomized droplets.', tags: ['rain', 'weather', 'ambience'], baseDuration: 8 },
  { id: 'fire', name: 'Fire Bed', group: 'ambience', description: 'Low flame noise with randomized crackles.', tags: ['fire', 'campfire', 'ambience'], baseDuration: 8 },
  { id: 'cave', name: 'Cave Tone', group: 'ambience', description: 'Low air, distant resonances and occasional drips.', tags: ['cave', 'dungeon', 'ambience'], baseDuration: 9 },
]

const SAMPLE_RATE = 48000

export function generateSoundRecipe(id: SoundRecipeId, settings: SoundDesignSettings) {
  const recipe = SOUND_RECIPES.find((item) => item.id === id) ?? SOUND_RECIPES[0]
  const intensity = clamp(settings.intensity, 0, 1)
  const brightness = clamp(settings.brightness, 0, 1)
  const length = clamp(settings.length, 0.35, 2.5)
  const variation = Math.max(1, Math.floor(settings.variation))
  const stereo = clamp(settings.stereo, 0, 1)
  const duration = Math.max(0.06, recipe.baseDuration * length)
  const frames = Math.max(1, Math.round(duration * SAMPLE_RATE))
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const random = mulberry32(hashString(`${id}:${variation}`))

  synthRecipe(id, left, right, random, intensity, brightness, stereo)
  softenEdges(left, recipe.group === 'ambience' ? 0.15 : 0.002)
  softenEdges(right, recipe.group === 'ambience' ? 0.15 : 0.002)
  normalizeStereo(left, right, 0.92)

  return {
    recipe,
    blob: encodePcm16Wav([left, right], SAMPLE_RATE),
    duration,
  }
}

export async function mixAudioBlobs(baseBlob: Blob, layerBlob: Blob, layerGainDb = -2) {
  const [base, layer] = await Promise.all([decodeAudioBlob(baseBlob), decodeAudioBlob(layerBlob)])
  const duration = Math.max(base.duration, layer.duration)
  const frames = Math.max(1, Math.ceil(duration * SAMPLE_RATE))
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const layerGain = Math.pow(10, layerGainDb / 20)

  mixBufferInto(base, left, right, 1)
  mixBufferInto(layer, left, right, layerGain)
  normalizeStereo(left, right, 0.96)

  return { blob: encodePcm16Wav([left, right], SAMPLE_RATE), duration }
}

function synthRecipe(id: SoundRecipeId, left: Float32Array, right: Float32Array, random: () => number, intensity: number, brightness: number, stereo: number) {
  const frames = left.length
  let smoothL = 0
  let smoothR = 0
  let lastNoiseL = 0
  let lastNoiseR = 0

  for (let i = 0; i < frames; i += 1) {
    const t = i / SAMPLE_RATE
    const p = i / Math.max(1, frames - 1)
    const noiseL = random() * 2 - 1
    const noiseR = random() * 2 - 1
    const shared = (noiseL + noiseR) * 0.5
    const nL = shared * (1 - stereo) + noiseL * stereo
    const nR = shared * (1 - stereo) + noiseR * stereo
    const smoothAmount = 0.015 + (1 - brightness) * 0.11
    smoothL += (nL - smoothL) * smoothAmount
    smoothR += (nR - smoothR) * smoothAmount
    lastNoiseL = nL
    lastNoiseR = nR

    let l = 0
    let r = 0

    if (id === 'heavy-impact') {
      const thump = Math.sin(t * Math.PI * 2 * (62 + brightness * 34)) * Math.exp(-t * (7 - intensity * 2.4))
      const crackEnv = Math.exp(-t * 34)
      const body = Math.sin(t * Math.PI * 2 * 122) * Math.exp(-t * 12)
      l = thump * 0.62 + nL * crackEnv * (0.28 + brightness * 0.3) + body * 0.2
      r = thump * 0.62 + nR * crackEnv * (0.28 + brightness * 0.3) + body * 0.2
    } else if (id === 'sword-clash') {
      const hit = Math.exp(-t * 48)
      const ring = Math.exp(-t * (2.5 + (1 - intensity) * 1.6))
      const f1 = 1120 + brightness * 1700
      const f2 = 1830 + brightness * 2200
      l = nL * hit * 0.35 + (Math.sin(t * f1 * Math.PI * 2) * 0.38 + Math.sin(t * f2 * Math.PI * 2) * 0.22) * ring
      r = nR * hit * 0.35 + (Math.sin(t * (f1 * 1.013) * Math.PI * 2) * 0.38 + Math.sin(t * (f2 * 0.987) * Math.PI * 2) * 0.22) * ring
    } else if (id === 'whoosh') {
      const env = Math.pow(Math.sin(Math.PI * p), 1.3)
      const sweep = 0.25 + 0.75 * Math.sin(Math.PI * p)
      l = (smoothL * (0.6 + brightness * 0.7) + lastNoiseL * brightness * 0.14) * env * sweep
      r = (smoothR * (0.6 + brightness * 0.7) + lastNoiseR * brightness * 0.14) * env * sweep
    } else if (id === 'ui-click') {
      const env = Math.exp(-t * 38)
      const freq = 520 + brightness * 1800
      const click = Math.sin(t * freq * Math.PI * 2) + 0.35 * Math.sin(t * freq * 2.05 * Math.PI * 2)
      l = click * env * 0.6 + nL * Math.exp(-t * 80) * 0.1
      r = click * env * 0.6 + nR * Math.exp(-t * 80) * 0.1
    } else if (id === 'bow-shot') {
      const snap = nL * Math.exp(-t * 55) * 0.25
      const twang = Math.sin(t * Math.PI * 2 * (150 + brightness * 100)) * Math.exp(-t * 10)
      const airEnv = Math.pow(Math.max(0, 1 - p), 3)
      l = snap + twang * 0.45 + smoothL * airEnv * 0.18
      r = nR * Math.exp(-t * 55) * 0.25 + twang * 0.45 + smoothR * airEnv * 0.18
    } else if (id === 'magic-pulse') {
      const freq = 180 + p * (420 + brightness * 1000)
      const env = Math.pow(Math.sin(Math.PI * p), 0.7) * Math.exp(-p * 0.8)
      const shimmer = Math.sin(t * Math.PI * 2 * freq) + 0.32 * Math.sin(t * Math.PI * 2 * freq * 2.01)
      l = shimmer * env * 0.48 + smoothL * env * 0.15
      r = Math.sin(t * Math.PI * 2 * freq * 1.007) * env * 0.48 + smoothR * env * 0.15
    } else if (id === 'footstep-stone') {
      const thump = Math.sin(t * Math.PI * 2 * 92) * Math.exp(-t * 19)
      const slap = nL * Math.exp(-t * 31)
      const gritWindow = p > 0.06 && p < 0.45 ? Math.sin(((p - 0.06) / 0.39) * Math.PI) : 0
      l = thump * 0.45 + slap * 0.27 + lastNoiseL * gritWindow * (0.08 + brightness * 0.12)
      r = thump * 0.45 + nR * Math.exp(-t * 31) * 0.27 + lastNoiseR * gritWindow * (0.08 + brightness * 0.12)
    } else if (id === 'footstep-wood') {
      const knock = Math.sin(t * Math.PI * 2 * (135 + brightness * 65)) * Math.exp(-t * 16)
      const hollow = Math.sin(t * Math.PI * 2 * 255) * Math.exp(-t * 9)
      l = knock * 0.48 + hollow * 0.18 + smoothL * Math.exp(-t * 24) * 0.18
      r = knock * 0.48 + hollow * 0.18 + smoothR * Math.exp(-t * 24) * 0.18
    } else if (id === 'cloth-rustle') {
      const movement = Math.pow(Math.sin(Math.PI * p), 1.1)
      const flutter = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * (6 + intensity * 9))
      l = (lastNoiseL * 0.16 + smoothL * 0.62) * movement * flutter
      r = (lastNoiseR * 0.16 + smoothR * 0.62) * movement * (1.1 - flutter * 0.18)
    } else if (id === 'wind') {
      const gust = 0.48 + 0.28 * Math.sin(t * 0.72) + 0.18 * Math.sin(t * 0.19 + 1.2)
      l = smoothL * gust * (0.55 + intensity * 0.4)
      r = smoothR * (0.52 + 0.3 * Math.sin(t * 0.67 + 0.8)) * (0.55 + intensity * 0.4)
    } else if (id === 'rain') {
      const hissL = lastNoiseL * (0.13 + brightness * 0.18) + smoothL * 0.35
      const hissR = lastNoiseR * (0.13 + brightness * 0.18) + smoothR * 0.35
      const drop = random() > 0.996 - intensity * 0.0025 ? (random() * 2 - 1) * 0.7 : 0
      l = hissL * 0.58 + drop
      r = hissR * 0.58 + drop * (0.75 + random() * 0.25)
    } else if (id === 'fire') {
      const bedL = smoothL * 0.48
      const bedR = smoothR * 0.48
      const crack = random() > 0.9984 - intensity * 0.001 ? (0.35 + random() * 0.65) * (random() > 0.5 ? 1 : -1) : 0
      l = bedL + crack
      r = bedR + crack * (0.72 + random() * 0.22)
    } else if (id === 'cave') {
      const rumble = Math.sin(t * Math.PI * 2 * 42) * 0.09 + Math.sin(t * Math.PI * 2 * 67) * 0.05
      const air = smoothL * 0.35
      const dripChance = random() > 0.99955 - intensity * 0.00025
      const drip = dripChance ? 0.7 : 0
      l = rumble + air + drip
      r = rumble + smoothR * 0.35 + drip * 0.82
    }

    const master = 0.45 + intensity * 0.5
    left[i] = clamp(l * master, -1, 1)
    right[i] = clamp(r * master, -1, 1)
  }
}

function mixBufferInto(buffer: AudioBuffer, left: Float32Array, right: Float32Array, gain: number) {
  const leftSource = buffer.getChannelData(0)
  const rightSource = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1))
  for (let i = 0; i < left.length; i += 1) {
    const sourcePosition = (i / SAMPLE_RATE) * buffer.sampleRate
    const index = Math.floor(sourcePosition)
    if (index >= leftSource.length) break
    const next = Math.min(leftSource.length - 1, index + 1)
    const mix = sourcePosition - index
    left[i] += ((leftSource[index] ?? 0) * (1 - mix) + (leftSource[next] ?? 0) * mix) * gain
    right[i] += ((rightSource[index] ?? 0) * (1 - mix) + (rightSource[next] ?? 0) * mix) * gain
  }
}

function normalizeStereo(left: Float32Array, right: Float32Array, target: number) {
  let peak = 0
  for (let i = 0; i < left.length; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  if (peak <= target || peak <= 0.000001) return
  const gain = target / peak
  for (let i = 0; i < left.length; i += 1) {
    left[i] *= gain
    right[i] *= gain
  }
}

function softenEdges(data: Float32Array, seconds: number) {
  const frames = Math.min(data.length >> 1, Math.max(1, Math.floor(seconds * SAMPLE_RATE)))
  for (let i = 0; i < frames; i += 1) {
    const gain = i / frames
    data[i] *= gain
    data[data.length - 1 - i] *= gain
  }
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
