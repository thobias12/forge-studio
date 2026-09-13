export type TextureChannel = 'baseColor' | 'normal' | 'roughness' | 'ao'

export type GeneratedTextureSet = {
  baseColor: Blob
  normal: Blob
  roughness: Blob
  ao: Blob
  width: number
  height: number
}

export async function generateTextureSet(source: Blob, normalStrength = 1, roughnessBias = 0.62): Promise<GeneratedTextureSet> {
  const image = await loadImage(source)
  const maxSize = 2048
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(2, Math.round(image.naturalWidth * scale))
  const height = Math.max(2, Math.round(image.naturalHeight * scale))

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = width
  sourceCanvas.height = height
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Canvas processing is not available in this browser.')
  sourceContext.drawImage(image, 0, 0, width, height)
  const sourceData = sourceContext.getImageData(0, 0, width, height)
  const luminance = makeLuminance(sourceData.data)

  const normalCanvas = document.createElement('canvas')
  normalCanvas.width = width
  normalCanvas.height = height
  const normalContext = normalCanvas.getContext('2d')!
  const normalImage = normalContext.createImageData(width, height)
  buildNormalMap(luminance, width, height, normalImage.data, normalStrength)
  normalContext.putImageData(normalImage, 0, 0)

  const roughnessCanvas = document.createElement('canvas')
  roughnessCanvas.width = width
  roughnessCanvas.height = height
  const roughnessContext = roughnessCanvas.getContext('2d')!
  const roughnessImage = roughnessContext.createImageData(width, height)
  buildRoughnessMap(luminance, width, height, roughnessImage.data, roughnessBias)
  roughnessContext.putImageData(roughnessImage, 0, 0)

  const aoCanvas = document.createElement('canvas')
  aoCanvas.width = width
  aoCanvas.height = height
  const aoContext = aoCanvas.getContext('2d')!
  const aoImage = aoContext.createImageData(width, height)
  buildAoMap(luminance, width, height, aoImage.data)
  aoContext.putImageData(aoImage, 0, 0)

  return {
    baseColor: await canvasBlob(sourceCanvas),
    normal: await canvasBlob(normalCanvas),
    roughness: await canvasBlob(roughnessCanvas),
    ao: await canvasBlob(aoCanvas),
    width,
    height,
  }
}

export async function normalizeTextureImage(source: Blob) {
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas processing is not available in this browser.')
  context.drawImage(image, 0, 0)
  return canvasBlob(canvas)
}

export async function makeSeamlessTexture(source: Blob, blendStrength = 0.22) {
  const image = await loadImage(source)
  const maxSize = 2048
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(4, Math.round(image.naturalWidth * scale))
  const height = Math.max(4, Math.round(image.naturalHeight * scale))

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = width
  sourceCanvas.height = height
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Canvas processing is not available in this browser.')
  sourceContext.drawImage(image, 0, 0, width, height)
  const original = sourceContext.getImageData(0, 0, width, height)

  const shifted = new Uint8ClampedArray(original.data.length)
  const halfW = Math.floor(width / 2)
  const halfH = Math.floor(height / 2)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = (x + halfW) % width
      const sy = (y + halfH) % height
      copyPixel(original.data, shifted, (sy * width + sx) * 4, (y * width + x) * 4)
    }
  }

  const output = new Uint8ClampedArray(shifted)
  const bandX = Math.max(3, Math.round(width * Math.max(0.04, Math.min(0.35, blendStrength))))
  const bandY = Math.max(3, Math.round(height * Math.max(0.04, Math.min(0.35, blendStrength))))
  const centerX = width / 2
  const centerY = height / 2

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = Math.abs(x - centerX)
      const dy = Math.abs(y - centerY)
      const wx = dx < bandX ? smoothstep(1 - dx / bandX) : 0
      const wy = dy < bandY ? smoothstep(1 - dy / bandY) : 0
      if (wx <= 0 && wy <= 0) continue

      const index = (y * width + x) * 4
      const mirroredX = Math.max(0, Math.min(width - 1, Math.round(width - 1 - x)))
      const mirroredY = Math.max(0, Math.min(height - 1, Math.round(height - 1 - y)))
      const ix = (y * width + mirroredX) * 4
      const iy = (mirroredY * width + x) * 4
      const ixy = (mirroredY * width + mirroredX) * 4
      const total = 1 + wx + wy + wx * wy
      for (let channel = 0; channel < 3; channel += 1) {
        output[index + channel] = Math.round((
          shifted[index + channel] +
          shifted[ix + channel] * wx +
          shifted[iy + channel] * wy +
          shifted[ixy + channel] * wx * wy
        ) / total)
      }
      output[index + 3] = shifted[index + 3]
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas processing is not available in this browser.')
  const imageData = context.createImageData(width, height)
  imageData.data.set(output)
  context.putImageData(imageData, 0, 0)
  return canvasBlob(canvas)
}

function makeLuminance(data: Uint8ClampedArray) {
  const output = new Float32Array(data.length / 4)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    output[p] = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255
  }
  return output
}

function buildNormalMap(lum: Float32Array, width: number, height: number, out: Uint8ClampedArray, strength: number) {
  const gain = Math.max(0.05, strength) * 3.2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = sample(lum, width, height, x - 1, y)
      const right = sample(lum, width, height, x + 1, y)
      const up = sample(lum, width, height, x, y - 1)
      const down = sample(lum, width, height, x, y + 1)
      let nx = (left - right) * gain
      let ny = (up - down) * gain
      let nz = 1
      const length = Math.hypot(nx, ny, nz) || 1
      nx /= length; ny /= length; nz /= length
      const index = (y * width + x) * 4
      out[index] = (nx * 0.5 + 0.5) * 255
      out[index + 1] = (ny * 0.5 + 0.5) * 255
      out[index + 2] = (nz * 0.5 + 0.5) * 255
      out[index + 3] = 255
    }
  }
}

function buildRoughnessMap(lum: Float32Array, width: number, height: number, out: Uint8ClampedArray, bias: number) {
  const base = clamp01(bias)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = sample(lum, width, height, x, y)
      const local = (
        sample(lum, width, height, x - 1, y) + sample(lum, width, height, x + 1, y) +
        sample(lum, width, height, x, y - 1) + sample(lum, width, height, x, y + 1)
      ) * 0.25
      const detail = Math.min(1, Math.abs(center - local) * 5)
      const value = clamp01(base + (0.5 - center) * 0.22 - detail * 0.18)
      const byte = Math.round(value * 255)
      const index = (y * width + x) * 4
      out[index] = byte; out[index + 1] = byte; out[index + 2] = byte; out[index + 3] = 255
    }
  }
}

function buildAoMap(lum: Float32Array, width: number, height: number, out: Uint8ClampedArray) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = sample(lum, width, height, x, y)
      let neighborhood = 0
      let count = 0
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          if (!ox && !oy) continue
          neighborhood += sample(lum, width, height, x + ox, y + oy)
          count += 1
        }
      }
      const average = neighborhood / Math.max(1, count)
      const cavity = Math.max(0, average - center)
      const value = clamp01(0.92 - cavity * 1.8)
      const byte = Math.round(value * 255)
      const index = (y * width + x) * 4
      out[index] = byte; out[index + 1] = byte; out[index + 2] = byte; out[index + 3] = 255
    }
  }
}

function sample(data: Float32Array, width: number, height: number, x: number, y: number) {
  const wrappedX = ((x % width) + width) % width
  const wrappedY = ((y % height) + height) % height
  return data[wrappedY * width + wrappedX]
}

function copyPixel(source: Uint8ClampedArray, target: Uint8ClampedArray, sourceIndex: number, targetIndex: number) {
  target[targetIndex] = source[sourceIndex]
  target[targetIndex + 1] = source[sourceIndex + 1]
  target[targetIndex + 2] = source[sourceIndex + 2]
  target[targetIndex + 3] = source[sourceIndex + 3]
}

function smoothstep(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Forge could not read that image.')) }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Forge could not encode the generated texture.')), 'image/png')
  })
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
