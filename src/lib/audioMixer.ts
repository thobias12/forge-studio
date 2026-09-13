import { decodeAudioBlob, encodePcm16Wav } from './audioProcessing'

export type MixerLayer = {
  id: string
  name: string
  blob: Blob
  duration: number
  offset: number
  gainDb: number
  pitchSemitones: number
  pan: number
  fadeIn: number
  fadeOut: number
  muted: boolean
  solo: boolean
  loop: boolean
}

export async function mixLayersToWav(layers: MixerLayer[], requestedDuration?: number) {
  const audible = layers.filter((layer) => !layer.muted)
  const hasSolo = audible.some((layer) => layer.solo)
  const active = audible.filter((layer) => !hasSolo || layer.solo)
  if (!active.length) throw new Error('No audible layers in the mix.')

  const decoded = await Promise.all(active.map(async (layer) => ({ layer, buffer: await decodeAudioBlob(layer.blob) })))
  const sampleRate = Math.max(...decoded.map(({ buffer }) => buffer.sampleRate), 44100)
  const naturalDuration = Math.max(...decoded.map(({ layer, buffer }) => {
    const rate = Math.pow(2, layer.pitchSemitones / 12)
    const pitched = buffer.duration / rate
    return layer.offset + pitched
  }), 0.1)
  const duration = Math.max(0.05, requestedDuration ?? naturalDuration)
  const frameCount = Math.ceil(duration * sampleRate)
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)

  for (const { layer, buffer } of decoded) {
    const rate = Math.pow(2, layer.pitchSemitones / 12)
    const offsetFrames = Math.max(0, Math.floor(layer.offset * sampleRate))
    const gain = Math.pow(10, layer.gainDb / 20)
    const pan = Math.max(-1, Math.min(1, layer.pan))
    const leftPan = Math.cos((pan + 1) * Math.PI / 4)
    const rightPan = Math.sin((pan + 1) * Math.PI / 4)
    const srcL = buffer.getChannelData(0)
    const srcR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcL
    const sourceFrames = buffer.length
    const outputFramesPerPass = Math.max(1, Math.floor((sourceFrames / buffer.sampleRate) / rate * sampleRate))
    const fadeInFrames = Math.floor(Math.max(0, layer.fadeIn) * sampleRate)
    const fadeOutFrames = Math.floor(Math.max(0, layer.fadeOut) * sampleRate)

    let destinationFrame = offsetFrames
    while (destinationFrame < frameCount) {
      for (let out = 0; out < outputFramesPerPass && destinationFrame + out < frameCount; out += 1) {
        const sourcePosition = (out / sampleRate) * buffer.sampleRate * rate
        if (sourcePosition >= sourceFrames - 1) break
        const index = Math.floor(sourcePosition)
        const fraction = sourcePosition - index
        const l = lerp(srcL[index] ?? 0, srcL[index + 1] ?? 0, fraction)
        const r = lerp(srcR[index] ?? 0, srcR[index + 1] ?? 0, fraction)
        let envelope = 1
        if (fadeInFrames > 0 && out < fadeInFrames) envelope *= out / fadeInFrames
        const fromEnd = outputFramesPerPass - 1 - out
        if (fadeOutFrames > 0 && fromEnd < fadeOutFrames) envelope *= Math.max(0, fromEnd / fadeOutFrames)
        const center = (l + r) * 0.5
        left[destinationFrame + out] += center * gain * leftPan
        right[destinationFrame + out] += center * gain * rightPan
      }
      if (!layer.loop) break
      destinationFrame += outputFramesPerPass
    }
  }

  let peak = 0
  for (let i = 0; i < frameCount; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  if (peak > 0.98) {
    const gain = 0.98 / peak
    for (let i = 0; i < frameCount; i += 1) {
      left[i] *= gain
      right[i] *= gain
    }
  }

  return { blob: encodePcm16Wav([left, right], sampleRate), duration, sampleRate, peak }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
