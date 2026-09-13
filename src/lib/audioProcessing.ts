export type AudioProcessOptions = {
  trimStart: number
  trimEnd: number
  fadeIn: number
  fadeOut: number
  gainDb: number
  normalize: boolean
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
  const rendered = Array.from({ length: channels }, () => new Float32Array(frameCount))

  let peak = 0
  for (let channel = 0; channel < channels; channel += 1) {
    const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1))
    const target = rendered[channel]
    for (let i = 0; i < frameCount; i += 1) {
      const value = source[startFrame + i] ?? 0
      target[i] = value
      peak = Math.max(peak, Math.abs(value))
    }
  }

  const baseGain = Math.pow(10, options.gainDb / 20)
  const normalizeGain = options.normalize && peak > 0.00001 ? 0.98 / peak : 1
  const finalGain = baseGain * normalizeGain
  const fadeInFrames = Math.min(frameCount, Math.floor(Math.max(0, options.fadeIn) * buffer.sampleRate))
  const fadeOutFrames = Math.min(frameCount, Math.floor(Math.max(0, options.fadeOut) * buffer.sampleRate))

  for (const channel of rendered) {
    for (let i = 0; i < channel.length; i += 1) {
      let envelope = 1
      if (fadeInFrames > 0 && i < fadeInFrames) envelope *= i / fadeInFrames
      const fromEnd = channel.length - 1 - i
      if (fadeOutFrames > 0 && fromEnd < fadeOutFrames) envelope *= fromEnd / fadeOutFrames
      channel[i] = clamp(channel[i] * finalGain * envelope, -1, 1)
    }
  }

  return {
    blob: encodePcm16Wav(rendered, buffer.sampleRate),
    duration: frameCount / buffer.sampleRate,
    sampleRate: buffer.sampleRate,
    channels,
    peak,
  }
}

function encodePcm16Wav(channels: Float32Array[], sampleRate: number) {
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
