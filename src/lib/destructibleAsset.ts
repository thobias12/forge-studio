import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { DungeonDestructible } from './dungeonProps'

export type ForgeDestructibleMetadata = {
  version?: number
  type: 'forge-destructible'
  template?: string
  health?: number
  mass?: number
  impulse?: number
  bounce?: number
  fragmentLifetime?: number
  intactGroup?: string
  fragmentsGroup?: string
  loot?: { enabled?: boolean; chance?: number; socket?: string }
  networking?: { authoritativeBreak?: boolean; cosmeticFragments?: boolean }
}

export function isForgeDestructibleMetadata(value: unknown): value is ForgeDestructibleMetadata {
  return Boolean(value && typeof value === 'object' && (value as { type?: unknown }).type === 'forge-destructible')
}

export function findDestructibleRoot(root: THREE.Object3D) {
  let match: THREE.Object3D | undefined
  root.traverse((object) => {
    if (!match && isForgeDestructibleMetadata(object.userData.forgeDestructible)) match = object
  })
  return match
}

export function definitionFromMetadata(metadata: ForgeDestructibleMetadata): DungeonDestructible {
  return {
    enabled: true,
    template: metadata.template,
    health: Math.max(1, Number(metadata.health ?? 20)),
    mass: Math.max(0.1, Number(metadata.mass ?? 2)),
    impulse: Math.max(0.5, Number(metadata.impulse ?? 4)),
    bounce: THREE.MathUtils.clamp(Number(metadata.bounce ?? 0.18), 0, 0.9),
    fragmentLifetime: Math.max(0.5, Number(metadata.fragmentLifetime ?? 7)),
    lootEnabled: Boolean(metadata.loot?.enabled),
    lootChance: THREE.MathUtils.clamp(Number(metadata.loot?.chance ?? 0), 0, 1),
  }
}

export async function readDestructibleDefinition(blob: Blob): Promise<DungeonDestructible | undefined> {
  const url = URL.createObjectURL(blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const root = findDestructibleRoot(gltf.scene)
    const metadata = root?.userData.forgeDestructible
    return isForgeDestructibleMetadata(metadata) ? definitionFromMetadata(metadata) : undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function materialKindFromTemplate(template?: string): 'wood' | 'stone' | 'ceramic' {
  if (template === 'crate' || template === 'barrel' || template === 'chest') return 'wood'
  if (template === 'stone-pot') return 'stone'
  return 'ceramic'
}

export function playDestructibleBreakSound(template?: string) {
  try {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    const ctx = new Context()
    const kind = materialKindFromTemplate(template)
    const now = ctx.currentTime
    const duration = kind === 'wood' ? 0.18 : 0.12
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, kind === 'wood' ? 1.6 : 1.1)
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = kind === 'ceramic' ? 2200 : kind === 'stone' ? 900 : 650
    filter.Q.value = kind === 'ceramic' ? 0.8 : 0.55
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.24, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(now)
    const thud = ctx.createOscillator()
    const thudGain = ctx.createGain()
    thud.type = 'triangle'
    thud.frequency.setValueAtTime(kind === 'wood' ? 120 : 92, now)
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.09)
    thudGain.gain.setValueAtTime(0.11, now)
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
    thud.connect(thudGain).connect(ctx.destination)
    thud.start(now)
    thud.stop(now + 0.12)
    window.setTimeout(() => void ctx.close(), 450)
  } catch { /* cosmetic audio */ }
}
