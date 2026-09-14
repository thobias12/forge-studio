import * as THREE from 'three'
import type { DungeonAtmosphere } from './dungeonAtmosphere'

export type CryptMaterialSet = {
  floor: THREE.MeshStandardMaterial
  floorDark: THREE.MeshStandardMaterial
  wall: THREE.MeshStandardMaterial
  wallLight: THREE.MeshStandardMaterial
  wallDark: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  bone: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  wet: THREE.MeshPhysicalMaterial
}

type TexturePack = {
  color: THREE.Texture
  bump: THREE.Texture
  roughness: THREE.Texture
}

const textureCache = new Map<string, TexturePack>()
const materialCache = new Map<string, CryptMaterialSet>()

export function createCryptMaterialSet(atmosphere: DungeonAtmosphere): CryptMaterialSet {
  const key = `${atmosphere.floor}-${atmosphere.wall}-${atmosphere.wallDark}`
  const cached = materialCache.get(key)
  if (cached) return cached

  const floorPack = texturePack('floor', atmosphere.floor, 0.22)
  const wallPack = texturePack('wall', atmosphere.wall, 0.14)
  const darkPack = texturePack('dark', atmosphere.wallDark, 0.1)

  const floor = keepMaterial(standard(floorPack, 0.78, 0.025, 0.075))
  const floorDark = keepMaterial(standard(darkPack, 0.92, 0.01, 0.045))
  const wall = keepMaterial(standard(wallPack, 0.88, 0.015, 0.09))
  const wallLight = keepMaterial(standard(wallPack, 0.82, 0.015, 0.105))
  wallLight.color.setHex(0xdce5eb)
  const wallDark = keepMaterial(standard(darkPack, 0.95, 0.005, 0.065))

  const iron = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x2c353d, roughness: 0.57, metalness: 0.5 }))
  const wood = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x443023, roughness: 0.91 }))
  const bone = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x968f7e, roughness: 0.9 }))
  const cloth = keepMaterial(new THREE.MeshStandardMaterial({ color: 0x263039, roughness: 0.96, side: THREE.DoubleSide }))
  const wet = keepMaterial(new THREE.MeshPhysicalMaterial({
    color: 0x0b1720,
    roughness: 0.13,
    metalness: 0.02,
    clearcoat: 0.92,
    clearcoatRoughness: 0.15,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  }))

  const set = { floor, floorDark, wall, wallLight, wallDark, iron, wood, bone, cloth, wet }
  materialCache.set(key, set)
  return set
}

function keepMaterial<T extends THREE.Material>(material: T): T {
  material.userData.forgeShared = true
  // Dungeon preview rebuilds dispose scene materials aggressively. These procedural
  // materials are app-level shared resources, so keep their GPU programs alive.
  material.dispose = () => undefined
  return material
}

function standard(pack: TexturePack, roughness: number, metalness: number, bumpScale: number) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: pack.color,
    bumpMap: pack.bump,
    bumpScale,
    roughness,
    roughnessMap: pack.roughness,
    metalness,
  })
}

function texturePack(kind: string, color: number, wetness: number): TexturePack {
  const key = `${kind}-${color.toString(16)}-${wetness}`
  const existing = textureCache.get(key)
  if (existing) return existing

  const size = 256
  const colorCanvas = canvas(size)
  const bumpCanvas = canvas(size)
  const roughCanvas = canvas(size)
  const colorCtx = colorCanvas.getContext('2d')!
  const bumpCtx = bumpCanvas.getContext('2d')!
  const roughCtx = roughCanvas.getContext('2d')!
  const base = new THREE.Color(color)
  const random = seededRandom(hash(key))

  colorCtx.fillStyle = css(base)
  colorCtx.fillRect(0, 0, size, size)
  bumpCtx.fillStyle = 'rgb(132,132,132)'
  bumpCtx.fillRect(0, 0, size, size)
  roughCtx.fillStyle = `rgb(${Math.round(218 - wetness * 60)},${Math.round(218 - wetness * 60)},${Math.round(218 - wetness * 60)})`
  roughCtx.fillRect(0, 0, size, size)

  for (let index = 0; index < 1500; index += 1) {
    const x = random() * size
    const y = random() * size
    const radius = 0.4 + random() * 3.8
    const lift = (random() - 0.5) * (kind === 'floor' ? 0.24 : 0.18)
    const tint = base.clone().offsetHSL((random() - 0.5) * 0.012, (random() - 0.5) * 0.035, lift)
    colorCtx.globalAlpha = 0.06 + random() * 0.14
    colorCtx.fillStyle = css(tint)
    colorCtx.beginPath()
    colorCtx.ellipse(x, y, radius * (0.6 + random()), radius, random() * Math.PI, 0, Math.PI * 2)
    colorCtx.fill()

    const height = Math.round(112 + random() * 56)
    bumpCtx.globalAlpha = 0.08 + random() * 0.18
    bumpCtx.fillStyle = `rgb(${height},${height},${height})`
    bumpCtx.fillRect(x, y, radius * 1.8, radius * 1.15)

    const rough = Math.round(165 + random() * 76)
    roughCtx.globalAlpha = 0.08 + random() * 0.16
    roughCtx.fillStyle = `rgb(${rough},${rough},${rough})`
    roughCtx.fillRect(x, y, radius * 2.1, radius * 1.4)
  }

  colorCtx.globalAlpha = 1
  bumpCtx.globalAlpha = 1
  roughCtx.globalAlpha = 1
  const fissures = kind === 'floor' ? 16 : 10
  for (let index = 0; index < fissures; index += 1) {
    const startX = random() * size
    const startY = random() * size
    const segments = 2 + Math.floor(random() * 4)
    colorCtx.strokeStyle = 'rgba(3,7,10,0.28)'
    colorCtx.lineWidth = 0.5 + random() * 1.2
    bumpCtx.strokeStyle = 'rgb(74,74,74)'
    bumpCtx.lineWidth = 1 + random() * 1.6
    colorCtx.beginPath(); bumpCtx.beginPath()
    colorCtx.moveTo(startX, startY); bumpCtx.moveTo(startX, startY)
    let px = startX, py = startY
    for (let segment = 0; segment < segments; segment += 1) {
      px += (random() - 0.5) * 34
      py += 10 + random() * 28
      colorCtx.lineTo(px, py)
      bumpCtx.lineTo(px, py)
    }
    colorCtx.stroke(); bumpCtx.stroke()
  }

  if (kind === 'floor') {
    for (let index = 0; index < 20; index += 1) {
      const x = random() * size
      const y = random() * size
      const rx = 5 + random() * 18
      const ry = 3 + random() * 10
      colorCtx.fillStyle = 'rgba(4,12,17,0.12)'
      roughCtx.fillStyle = `rgba(80,80,80,${0.09 + random() * 0.12})`
      colorCtx.beginPath(); roughCtx.beginPath()
      colorCtx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2)
      roughCtx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2)
      colorCtx.fill(); roughCtx.fill()
    }
  }

  const colorTexture = keepTexture(new THREE.CanvasTexture(colorCanvas))
  colorTexture.colorSpace = THREE.SRGBColorSpace
  const bumpTexture = keepTexture(new THREE.CanvasTexture(bumpCanvas))
  const roughTexture = keepTexture(new THREE.CanvasTexture(roughCanvas))
  for (const texture of [colorTexture, bumpTexture, roughTexture]) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(kind === 'floor' ? 2.6 : 2.15, kind === 'floor' ? 2.6 : 2.15)
    texture.needsUpdate = true
  }

  const pack = { color: colorTexture, bump: bumpTexture, roughness: roughTexture }
  textureCache.set(key, pack)
  return pack
}

function keepTexture<T extends THREE.Texture>(texture: T): T {
  texture.userData.forgeShared = true
  // Shared procedural textures survive scene rebuilds instead of being deleted
  // and uploaded again for every drag tick.
  texture.dispose = () => undefined
  return texture
}

function canvas(size: number) {
  const element = document.createElement('canvas')
  element.width = size
  element.height = size
  return element
}

function css(color: THREE.Color) {
  return `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function hash(value: string) {
  let seed = 2166136261
  for (let index = 0; index < value.length; index += 1) seed = Math.imul(seed ^ value.charCodeAt(index), 16777619)
  return seed >>> 0
}
