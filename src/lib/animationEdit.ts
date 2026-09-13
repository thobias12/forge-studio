import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type RootMotionMode = 'keep' | 'horizontal' | 'all'

export type AnimationClipEdit = {
  name: string
  trimStart: number
  trimEnd: number
  speed: number
  closeLoop: boolean
  rootMotion: RootMotionMode
}

export function defaultClipEdit(clip: THREE.AnimationClip): AnimationClipEdit {
  return {
    name: clip.name || 'Animation',
    trimStart: 0,
    trimEnd: Math.max(0.01, clip.duration || 0.01),
    speed: 1,
    closeLoop: false,
    rootMotion: 'keep',
  }
}

export function createEditedClip(source: THREE.AnimationClip, edit: AnimationClipEdit) {
  const duration = Math.max(0.01, source.duration || 0.01)
  const start = THREE.MathUtils.clamp(edit.trimStart, 0, Math.max(0, duration - 0.001))
  const end = THREE.MathUtils.clamp(edit.trimEnd, start + 0.001, duration)
  const speed = THREE.MathUtils.clamp(edit.speed, 0.1, 4)

  const tracks = source.tracks.map((track) => {
    const next = track.clone()
    next.trim(start, end)
    next.shift(-start)
    next.scale(1 / speed)
    return next
  })

  applyRootMotionMode(tracks, edit.rootMotion)
  if (edit.closeLoop) closeLoop(tracks)

  const clip = new THREE.AnimationClip(edit.name.trim() || source.name || 'Animation', -1, tracks)
  clip.resetDuration()
  clip.optimize()
  return clip
}

function findRootPositionTrack(tracks: THREE.KeyframeTrack[]) {
  const positions = tracks.filter((track) => track.name.toLowerCase().endsWith('.position'))
  if (!positions.length) return undefined
  return positions.find((track) => /(hips|pelvis|root|armature)/i.test(track.name)) ?? positions[0]
}

function applyRootMotionMode(tracks: THREE.KeyframeTrack[], mode: RootMotionMode) {
  if (mode === 'keep') return
  const track = findRootPositionTrack(tracks)
  if (!track || track.getValueSize() < 3 || track.values.length < 3) return

  const baseX = Number(track.values[0])
  const baseY = Number(track.values[1])
  const baseZ = Number(track.values[2])
  const stride = track.getValueSize()

  for (let offset = 0; offset < track.values.length; offset += stride) {
    track.values[offset] = baseX
    track.values[offset + 2] = baseZ
    if (mode === 'all') track.values[offset + 1] = baseY
  }
}

function closeLoop(tracks: THREE.KeyframeTrack[]) {
  for (const track of tracks) {
    const stride = track.getValueSize()
    if (stride <= 0 || track.times.length < 2 || track.values.length < stride * 2) continue
    const lastOffset = track.values.length - stride
    for (let component = 0; component < stride; component += 1) {
      track.values[lastOffset + component] = track.values[component]
    }
  }
}

export async function exportAnimationSet(characterSrc: string, clips: THREE.AnimationClip[]) {
  if (!clips.length) throw new Error('There are no animation clips to export.')
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(characterSrc)
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(gltf.scene, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations: clips,
  })
  if (!(result instanceof ArrayBuffer)) throw new Error('Forge expected binary GLB output.')
  return new Blob([result], { type: 'model/gltf-binary' })
}

export function formatSeconds(value: number) {
  if (!Number.isFinite(value)) return '0.00 s'
  return `${value.toFixed(2)} s`
}
