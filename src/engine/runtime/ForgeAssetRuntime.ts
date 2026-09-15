import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { characterPackageDataToBlob, parseCharacterPackage } from '../../lib/characterPackage'
import { getAsset, type LibraryAsset } from '../../lib/library'
import { parseVfxPackage, type ForgeVfxEmitter, type ForgeVfxPackage } from '../../lib/vfxPackage'

export type ForgeAnimationCue = 'idle' | 'move' | 'attack' | 'hit' | 'death' | 'dodge'

type LoadedScene = { root: THREE.Object3D; animations: THREE.AnimationClip[] }
const vfxPackageCache = new Map<string, ForgeVfxPackage | null>()

export class ForgeCharacterVisualBinding {
  private mixer?: THREE.AnimationMixer
  private clips: THREE.AnimationClip[] = []
  private active?: THREE.AnimationAction
  private activeKey = 'idle'
  private fallbackCue: 'idle' | 'move' = 'idle'
  private oneShot = false
  private disposed = false

  constructor(private readonly root: THREE.Object3D) {}

  setAnimations(clips: THREE.AnimationClip[]) {
    this.clips = uniqueClips(clips)
    this.mixer?.stopAllAction()
    this.mixer = this.clips.length ? new THREE.AnimationMixer(this.root) : undefined
    this.active = undefined
    this.activeKey = ''
    this.play('idle', true)
  }

  addAnimations(clips: THREE.AnimationClip[]) {
    if (!clips.length) return
    this.clips = uniqueClips([...this.clips, ...clips])
    if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.root)
  }

  update(delta: number) {
    this.mixer?.update(delta)
    if (this.oneShot && this.active && !this.active.isRunning()) {
      this.oneShot = false
      this.active = undefined
      this.activeKey = ''
      this.play(this.fallbackCue, true)
    }
  }

  play(cue: ForgeAnimationCue, loop = cue === 'idle' || cue === 'move') {
    if (!this.mixer || !this.clips.length) return false
    if (cue === 'idle' || cue === 'move') {
      this.fallbackCue = cue
      if (this.oneShot && this.active?.isRunning()) return false
    }
    const clip = findCueClip(this.clips, cue)
    if (!clip) return false
    return this.playClip(clip, `cue:${cue}`, loop)
  }

  playClipName(name: string, loop = false) {
    if (!this.mixer || !this.clips.length) return false
    const clip = this.clips.find((entry) => entry.name === name)
    if (!clip) return false
    return this.playClip(clip, `clip:${name}`, loop)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.mixer?.stopAllAction()
    disposeBoundObject(this.root)
  }

  private playClip(clip: THREE.AnimationClip, key: string, loop: boolean) {
    if (!this.mixer) return false
    if (this.activeKey === key && this.active?.isRunning()) return true
    const next = this.mixer.clipAction(clip)
    next.reset()
    next.enabled = true
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = !loop
    next.fadeIn(0.08).play()
    if (this.active && this.active !== next) this.active.fadeOut(0.08)
    this.active = next
    this.activeKey = key
    this.oneShot = !loop
    return true
  }
}

export async function bindCharacterAsset(
  target: THREE.Object3D,
  characterAssetId?: string,
  animationAssetId?: string,
  desiredHeight = 1.9,
) {
  if (!characterAssetId) return undefined
  const asset = await getAsset(characterAssetId)
  if (!asset) return undefined
  const loaded = await loadCharacterLibraryAsset(asset)
  if (!loaded) return undefined

  normalizeCharacter(loaded.root, desiredHeight)
  loaded.root.name = '__forge_bound_character'
  loaded.root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
  })
  target.add(loaded.root)
  hidePlaceholder(target)

  const binding = new ForgeCharacterVisualBinding(loaded.root)
  let clips = loaded.animations
  if (animationAssetId) {
    const external = await loadLibraryAnimationClips(animationAssetId)
    if (external.length) clips = external
  }
  binding.setAnimations(clips)
  return binding
}

export async function loadLibraryAnimationClips(animationAssetId?: string) {
  if (!animationAssetId) return [] as THREE.AnimationClip[]
  const animationAsset = await getAsset(animationAssetId)
  if (!animationAsset) return [] as THREE.AnimationClip[]
  const external = await loadGlbAsset(animationAsset).catch(() => undefined)
  if (!external) return [] as THREE.AnimationClip[]
  const clips = external.animations.map((clip) => clip.clone())
  disposeBoundObject(external.root)
  return clips
}

export async function bindModelAsset(target: THREE.Object3D, modelAssetId?: string, desiredHeight = 0.9) {
  if (!modelAssetId) return undefined
  const asset = await getAsset(modelAssetId)
  if (!asset) return undefined
  const loaded = await loadGlbAsset(asset).catch(() => undefined)
  if (!loaded) return undefined
  normalizeCharacter(loaded.root, desiredHeight)
  loaded.root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
  })
  target.add(loaded.root)
  return loaded.root
}

export class ForgeLibraryVfxInstance {
  private readonly particles: Array<{
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    gravity: THREE.Vector3
    drag: number
    age: number
    lifetime: number
    startSize: number
    endSize: number
    startColor: THREE.Color
    endColor: THREE.Color
    startAlpha: number
    endAlpha: number
  }> = []
  private disposed = false

  constructor(private readonly scene: THREE.Scene, pkg: ForgeVfxPackage, position: THREE.Vector3) {
    const random = seededRandom(hashSeed(`${pkg.name}:${position.x.toFixed(2)}:${position.z.toFixed(2)}`))
    for (const emitter of pkg.emitters.filter((item) => item.enabled)) this.spawnEmitter(emitter, position, random)
  }

  update(delta: number) {
    if (this.disposed) return false
    for (const particle of [...this.particles]) {
      particle.age += delta
      const t = Math.min(1, particle.age / Math.max(0.01, particle.lifetime))
      particle.velocity.addScaledVector(particle.gravity, delta)
      particle.velocity.multiplyScalar(Math.max(0, 1 - particle.drag * delta))
      particle.mesh.position.addScaledVector(particle.velocity, delta)
      particle.mesh.rotation.y += delta * 1.8
      particle.mesh.scale.setScalar(THREE.MathUtils.lerp(particle.startSize, particle.endSize, t))
      const material = particle.mesh.material as THREE.MeshBasicMaterial
      material.color.copy(particle.startColor).lerp(particle.endColor, t)
      material.opacity = THREE.MathUtils.lerp(particle.startAlpha, particle.endAlpha, t)
      if (t < 1) continue
      this.scene.remove(particle.mesh)
      particle.mesh.geometry.dispose()
      material.dispose()
      this.particles.splice(this.particles.indexOf(particle), 1)
    }
    if (!this.particles.length) this.disposed = true
    return !this.disposed
  }

  dispose() {
    if (this.disposed && !this.particles.length) return
    this.disposed = true
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh)
      particle.mesh.geometry.dispose()
      const material = particle.mesh.material as THREE.Material
      material.dispose()
    }
    this.particles.length = 0
  }

  private spawnEmitter(emitter: ForgeVfxEmitter, position: THREE.Vector3, random: () => number) {
    const count = Math.min(90, Math.max(1, Math.round(emitter.burst || Math.min(24, emitter.spawnRate * Math.min(0.25, emitter.duration)) || 8)))
    const baseDirection = new THREE.Vector3(...emitter.direction)
    if (baseDirection.lengthSq() < 0.001) baseDirection.set(0, 1, 0)
    baseDirection.normalize()
    for (let index = 0; index < count; index += 1) {
      const direction = randomDirection(baseDirection, emitter.spreadDeg, random)
      const speed = Math.max(0, emitter.speed * (1 + (random() * 2 - 1) * emitter.speedRandom))
      const lifetime = Math.max(0.05, emitter.lifetime * (1 + (random() * 2 - 1) * emitter.lifetimeRandom))
      const geometry = geometryForStyle(emitter.style)
      const material = new THREE.MeshBasicMaterial({
        color: emitter.startColor,
        transparent: true,
        opacity: emitter.startAlpha,
        depthWrite: false,
        blending: emitter.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const local = randomEmitterOffset(emitter, random)
      mesh.position.set(position.x + emitter.position[0] + local.x, Math.max(0.08, position.y + emitter.position[1] + local.y), position.z + emitter.position[2] + local.z)
      mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
      this.scene.add(mesh)
      this.particles.push({
        mesh,
        velocity: direction.multiplyScalar(speed),
        gravity: new THREE.Vector3(...emitter.gravity),
        drag: emitter.drag,
        age: 0,
        lifetime,
        startSize: Math.max(0.02, emitter.startSize),
        endSize: Math.max(0.005, emitter.endSize),
        startColor: new THREE.Color(emitter.startColor),
        endColor: new THREE.Color(emitter.endColor),
        startAlpha: emitter.startAlpha,
        endAlpha: emitter.endAlpha,
      })
    }
  }
}

export async function spawnLibraryVfx(scene: THREE.Scene, assetId: string | undefined, position: THREE.Vector3) {
  if (!assetId) return undefined
  let pkg = vfxPackageCache.get(assetId)
  if (pkg === undefined) {
    const asset = await getAsset(assetId)
    pkg = asset ? await parseVfxPackage(asset.blob) ?? null : null
    vfxPackageCache.set(assetId, pkg)
  }
  if (!pkg) return undefined
  return new ForgeLibraryVfxInstance(scene, pkg, position)
}

async function loadCharacterLibraryAsset(asset: LibraryAsset): Promise<LoadedScene | undefined> {
  const pkg = await parseCharacterPackage(asset.blob)
  if (!pkg) return loadGlbAsset(asset).catch(() => undefined)
  const base = await loadBlobGlb(characterPackageDataToBlob(pkg.base.data))
  for (const attachment of pkg.attachments) {
    try {
      const loaded = await loadBlobGlb(characterPackageDataToBlob(attachment.data))
      const boneName = pkg.rig.mapped[attachment.targetBone]
      const parent = boneName ? base.root.getObjectByName(boneName) ?? base.root : base.root
      loaded.root.position.fromArray(attachment.transform.position)
      loaded.root.rotation.set(...attachment.transform.rotation)
      loaded.root.scale.fromArray(attachment.transform.scale)
      parent.add(loaded.root)
      base.animations.push(...loaded.animations)
    } catch {
      // A single optional attachment should not prevent the base character from loading.
    }
  }
  return base
}

async function loadGlbAsset(asset: LibraryAsset) { return loadBlobGlb(asset.blob) }

async function loadBlobGlb(blob: Blob): Promise<LoadedScene> {
  const url = URL.createObjectURL(blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    return { root: gltf.scene, animations: gltf.animations.map((clip) => clip.clone()) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function normalizeCharacter(root: THREE.Object3D, desiredHeight: number) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  if (!Number.isFinite(size.y) || size.y < 0.001) return
  const scale = desiredHeight / size.y
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)
  const normalized = new THREE.Box3().setFromObject(root)
  const center = normalized.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= normalized.min.y
}

function hidePlaceholder(target: THREE.Object3D) {
  target.children.filter((child) => child.name === '__forge_placeholder').forEach((child) => { child.visible = false })
}

function findCueClip(clips: THREE.AnimationClip[], cue: ForgeAnimationCue) {
  const aliases: Record<ForgeAnimationCue, RegExp[]> = {
    idle: [/idle/i, /stand/i],
    move: [/run/i, /walk/i, /move/i, /locom/i],
    attack: [/attack/i, /slash/i, /strike/i, /swing/i, /cast/i],
    hit: [/hit/i, /hurt/i, /impact/i, /damage/i],
    death: [/death/i, /die/i, /dead/i],
    dodge: [/dodge/i, /roll/i, /evade/i, /dash/i],
  }
  for (const pattern of aliases[cue]) {
    const match = clips.find((clip) => pattern.test(clip.name))
    if (match) return match
  }
  return cue === 'idle' ? clips[0] : undefined
}

function uniqueClips(clips: THREE.AnimationClip[]) {
  const map = new Map<string, THREE.AnimationClip>()
  for (const clip of clips) map.set(clip.name || `clip-${map.size}`, clip)
  return [...map.values()]
}

function geometryForStyle(style: ForgeVfxEmitter['style']) {
  if (style === 'ring') return new THREE.RingGeometry(0.45, 0.7, 16)
  if (style === 'square' || style === 'diamond') return new THREE.BoxGeometry(0.65, 0.65, 0.12)
  if (style === 'spark') return new THREE.BoxGeometry(0.12, 0.12, 0.95)
  if (style === 'star') return new THREE.OctahedronGeometry(0.5, 0)
  return new THREE.SphereGeometry(0.45, 7, 5)
}

function randomEmitterOffset(emitter: ForgeVfxEmitter, random: () => number) {
  if (emitter.shape === 'box') return new THREE.Vector3((random() - 0.5) * emitter.boxSize[0], (random() - 0.5) * emitter.boxSize[1], (random() - 0.5) * emitter.boxSize[2])
  if (emitter.shape === 'sphere') {
    const direction = randomUnit(random)
    return direction.multiplyScalar(Math.cbrt(random()) * 0.65)
  }
  if (emitter.shape === 'cone') return new THREE.Vector3((random() - 0.5) * 0.35, random() * 0.18, (random() - 0.5) * 0.35)
  return new THREE.Vector3()
}

function randomDirection(base: THREE.Vector3, spreadDeg: number, random: () => number) {
  const spread = THREE.MathUtils.degToRad(Math.max(0, Math.min(180, spreadDeg)))
  if (spread >= Math.PI * 0.95) return randomUnit(random)
  const randomVector = randomUnit(random)
  return base.clone().lerp(randomVector, Math.sin(spread * 0.5)).normalize()
}

function randomUnit(random: () => number) {
  const y = random() * 2 - 1
  const angle = random() * Math.PI * 2
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
}

export function disposeBoundObject(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      const typed = material as THREE.MeshStandardMaterial
      typed.map?.dispose?.()
      typed.normalMap?.dispose?.()
      typed.roughnessMap?.dispose?.()
      typed.metalnessMap?.dispose?.()
      typed.emissiveMap?.dispose?.()
      material.dispose()
    })
  })
}

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed || 1
  return () => {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
