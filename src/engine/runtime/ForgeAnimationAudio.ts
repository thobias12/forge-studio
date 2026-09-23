import { getAsset } from '../../lib/library'

let context: AudioContext | undefined
const buffers = new Map<string, AudioBuffer>()

function getContext() {
  if (context) return context
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return undefined
  context = new Ctor()
  return context
}

export function getForgeAudioContext() {
  return getContext()
}

export async function unlockForgeAudio() {
  const audio = getContext()
  if (audio?.state === 'suspended') await audio.resume().catch(() => undefined)
}

export async function playLibraryAudio(assetId: string | undefined, options: { volume?: number; playbackRate?: number } = {}) {
  if (!assetId) return false
  const audio = getContext()
  if (!audio) return false
  if (audio.state === 'suspended') await audio.resume().catch(() => undefined)

  let buffer = buffers.get(assetId)
  if (!buffer) {
    const asset = await getAsset(assetId).catch(() => undefined)
    if (!asset || asset.category !== 'audio') return false
    const bytes = await asset.blob.arrayBuffer()
    buffer = await audio.decodeAudioData(bytes.slice(0)).catch(() => undefined)
    if (!buffer) return false
    buffers.set(assetId, buffer)
  }

  const source = audio.createBufferSource()
  const gain = audio.createGain()
  source.buffer = buffer
  source.playbackRate.value = Math.max(.5, Math.min(2, options.playbackRate ?? 1))
  gain.gain.value = Math.max(0, Math.min(1, options.volume ?? .85))
  source.connect(gain)
  gain.connect(audio.destination)
  source.start()
  source.addEventListener('ended', () => {
    source.disconnect()
    gain.disconnect()
  }, { once: true })
  return true
}
