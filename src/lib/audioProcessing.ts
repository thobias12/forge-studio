export type AudioProcessOptions = {
  trimStart: number
  trimEnd: number
  fadeIn: number
  fadeOut: number
  gainDb: number
  normalize: boolean
  pitchSemitones?: number
  lowpassHz?: number
  highpassHz?: number
  distortion?: number
  space?: number
}

export async function decodeAudioBlob(blob: Blob) {
  const context = new AudioContext()
  try {
    const data = await blob.arrayBuffer()
    return await context.decodeAudioData(data.slice(0))
  } finally {
    await context.close().catch(() => undefined)
  }
}

export async function processAudioToWav(blob: Blob, options: AudioProcessOptions) {
  const buffer = await decodeAudioBlob(blob)
  const duration = buffer.duration
  const start = clamp(options.trimStart, 0, Math.max(0, duration - 0.001))
  const end = clamp(options.trimEnd || duration, start + 0.001, duration)
  const startFrame = Math.floor(start * buffer.sampleRate)
  const endFrame = Math.max(startFrame + 1, Math.floor(end * buffer.sampleRate))
  const frameCount = endFrame - startFrame
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels))
  let rendered = Array.from({ length: channels }, () => new Float32Array(frameCount))

  for (let channel = 0; channel < channels; channel += 1) {
    const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1))
    rendered[channel].set(source.subarray(startFrame, endFrame))
  }

  const pitchSemitones = clamp(options.pitchSemitones ?? 0, -24, 24)
  if (Math.abs(pitchSemitones) > 0.001) rendered = resamplePitch(rendered, Math.pow(2, pitchSemitones / 12))

  const highpassHz = clamp(options.highpassHz ?? 0, 0, buffer.sampleRate * 0.45)
  const lowpassHz = clamp(options.lowpassHz ?? 0, 0, buffer.sampleRate * 0.45)
  if (highpassHz > 15) rendered.forEach((channel) => highpass(channel, buffer.sampleRate, highpassHz))
  if (lowpassHz > 30) rendered.forEach((channel) => lowpass(channel, buffer.sampleRate, lowpassHz))

  const distortion = clamp(options.distortion ?? 0, 0, 1)
  if (distortion > 0.001) {
    const drive = 1 + distortion * 18
    const norm = Math.tanh(drive)
    rendered.forEach((channel) => {
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.tanh(channel[i] * drive) / norm
    })
  }

  const space = clamp(options.space ?? 0, 0, 1)
  if (space > 0.001) rendered = applySpace(rendered, buffer.sampleRate, space)

  let peak = findPeak(rendered)
  const baseGain = Math.pow(10, options.gainDb / 20)
  const normalizeGain = options.normalize && peak > 0.00001 ? 0.98 / peak : 1
  const finalGain = baseGain * normalizeGain
  const finalFrames = rendered[0]?.length ?? 0
  const fadeInFrames = Math.min(finalFrames, Math.floor(Math.max(0, options.fadeIn) * buffer.sampleRate))
  const fadeOutFrames = Math.min(finalFrames, Math.floor(Math.max(0, options.fadeOut) * buffer.sampleRate))

  for (const channel of rendered) {
    for (let i = 0; i < channel.length; i += 1) {
      let envelope = 1
      if (fadeInFrames > 0 && i < fadeInFrames) envelope *= i / fadeInFrames
      const fromEnd = channel.length - 1 - i
      if (fadeOutFrames > 0 && fromEnd < fadeOutFrames) envelope *= fromEnd / fadeOutFrames
      channel[i] = clamp(channel[i] * finalGain * envelope, -1, 1)
    }
  }
  peak = findPeak(rendered)

  return {
    blob: encodePcm16Wav(rendered, buffer.sampleRate),
    duration: finalFrames / buffer.sampleRate,
    sampleRate: buffer.sampleRate,
    channels,
    peak,
  }
}

function resamplePitch(channels: Float32Array[], factor: number) {
  const sourceLength = channels[0]?.length ?? 0
  const targetLength = Math.max(1, Math.round(sourceLength / factor))
  return channels.map((source) => {
    const target = new Float32Array(targetLength)
    for (let i = 0; i < targetLength; i += 1) {
      const position = i * factor
      const left = Math.min(sourceLength - 1, Math.floor(position))
      const right = Math.min(sourceLength - 1, left + 1)
      const mix = position - left
      target[i] = (source[left] ?? 0) * (1 - mix) + (source[right] ?? 0) * mix
    }
    return target
  })
}

function lowpass(data: Float32Array, sampleRate: number, cutoff: number) {
  const dt = 1 / sampleRate
  const rc = 1 / (Math.PI * 2 * cutoff)
  const alpha = dt / (rc + dt)
  let value = data[0] ?? 0
  for (let i = 0; i < data.length; i += 1) {
    value += alpha * (data[i] - value)
    data[i] = value
  }
}

function highpass(data: Float32Array, sampleRate: number, cutoff: number) {
  const dt = 1 / sampleRate
  const rc = 1 / (Math.PI * 2 * cutoff)
  const alpha = rc / (rc + dt)
  let previousOut = 0
  let previousIn = data[0] ?? 0
  for (let i = 0; i < data.length; i += 1) {
    const input = data[i]
    const output = alpha * (previousOut + input - previousIn)
    data[i] = output
    previousOut = output
    previousIn = input
  }
}

function applySpace(channels: Float32Array[], sampleRate: number, amount: number) {
  const tailSeconds = 0.16 + amount * 0.62
  const targetLength = (channels[0]?.length ?? 0) + Math.floor(tailSeconds * sampleRate)
  const taps = [
    { seconds: 0.055 + amount * 0.025, gain: 0.23 + amount * 0.12 },
    { seconds: 0.121 + amount * 0.04, gain: 0.15 + amount * 0.16 },
    { seconds: 0.237 + amount * 0.075, gain: 0.09 + amount * 0.19 },
    { seconds: 0.39 + amount * 0.11, gain: amount * 0.18 },
  ]
  return channels.map((source, channelIndex) => {
    const out = new Float32Array(targetLength)
    out.set(source)
    for (const tap of taps) {
      const offset = Math.floor(tap.seconds * sampleRate)
      const stereoGain = tap.gain * (channelIndex === 0 ? 0.98 : 1.02)
      for (let i = 0; i < source.length && i + offset < out.length; i += 1) out[i + offset] += source[i] * stereoGain
    }
    return out
  })
}

function findPeak(channels: Float32Array[]) {
  let peak = 0
  for (const channel of channels) for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]))
  return peak
}

export function encodePcm16Wav(channels: Float32Array[], sampleRate: number) {
  const channelCount = channels.length
  const frameCount = channels[0]?.length ?? 0
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clamp(channels[channel][frame] ?? 0, -1, 1)
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
