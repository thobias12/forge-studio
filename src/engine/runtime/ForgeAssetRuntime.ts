import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { characterPackageDataToBlob, parseCharacterPackage } from '../../lib/characterPackage'
import { skillboundBodyTypeFromAsset } from '../../lib/characterAssetRegistry'
import { getAsset, type LibraryAsset } from '../../lib/library'
import { parseVfxPackage, type ForgeVfxEmitter, type ForgeVfxPackage } from '../../lib/vfxPackage'
import { resolveRuntimeBinding, type ForgeAnimationSet } from '../animationBindings'
import { createAnimationControllerV3, type ForgeAnimationControllerV3 } from '../animationV3'

export type ForgeAnimationCue = 'idle' | 'move' | 'attack' | 'hit' | 'death' | 'dodge'

type LoadedScene = { root: THREE.Object3D; animations: THREE.AnimationClip[] }

type SecondaryMotionState = {
  left: THREE.Bone
  right: THREE.Bone
  leftRest: THREE.Quaternion
  rightRest: THREE.Quaternion
  driver: THREE.Object3D
  previousDriverPosition: THREE.Vector3
  previousVelocity: THREE.Vector3
  smoothedAcceleration: THREE.Vector3
  rootWorldQuaternion: THREE.Quaternion
  inverseRootQuaternion: THREE.Quaternion
  localAcceleration: THREE.Vector3
  pitch: number
  pitchVelocity: number
  roll: number
  rollVelocity: number
  phase: number
  initialized: boolean
}

const vfxPackageCache = new Map<string, ForgeVfxPackage | null>()

export class ForgeCharacterVisualBinding {
  private animationV3?: ForgeAnimationControllerV3
  private mixer?: THREE.AnimationMixer
  private clips: THREE.AnimationClip[] = []
  private animationSet?: ForgeAnimationSet
  private active?: THREE.AnimationAction
  private activeKey = 'idle'
  private fallbackState?: {
    cue: 'idle' | 'move'
    clip: THREE.AnimationClip
    loop: boolean
    speed: number
  }
  private oneShot = false
  private disposed = false
  private secondaryMotion?: SecondaryMotionState

  constructor(readonly root: THREE.Object3D) {}

  setAnimationRuntimeV3(controller: ForgeAnimationControllerV3 | undefined) {
    this.animationV3?.dispose()
    this.animationV3 = controller
    if (!controller) return
    this.mixer?.stopAllAction()
    this.mixer = undefined
    this.clips = []
    this.active = undefined
    this.activeKey = ''
    this.fallbackState = undefined
    this.oneShot = false
  }

  getAnimationRuntimeV3() {
    return this.animationV3
  }

  enableSubtleChestSecondaryMotion() {
    const left = this.root.getObjectByName('breast_L')
    const right = this.root.getObjectByName('breast_R')
    if (!(left instanceof THREE.Bone) || !(right instanceof THREE.Bone)) return false

    this.root.updateMatrixWorld(true)
    const driver = left.parent ?? right.parent ?? this.root
    const previousDriverPosition = driver.getWorldPosition(new THREE.Vector3())

    this.secondaryMotion = {
      left,
      right,
      leftRest: left.quaternion.clone(),
      rightRest: right.quaternion.clone(),
      driver,
      previousDriverPosition,
      previousVelocity: new THREE.Vector3(),
      smoothedAcceleration: new THREE.Vector3(),
      rootWorldQuaternion: new THREE.Quaternion(),
      inverseRootQuaternion: new THREE.Quaternion(),
      localAcceleration: new THREE.Vector3(),
      pitch: 0,
      pitchVelocity: 0,
      roll: 0,
      rollVelocity: 0,
      phase: 0,
      initialized: false,
    }
    return true
  }

  setAnimationSet(set: ForgeAnimationSet | undefined) {
    this.animationSet = set
  }

  setAnimations(clips: THREE.AnimationClip[]) {
    this.clips = uniqueClips(clips)
    this.mixer?.stopAllAction()
    this.mixer = this.clips.length ? new THREE.AnimationMixer(this.root) : undefined
    this.active = undefined
    this.activeKey = ''
    this.fallbackState = undefined
    this.play('idle', true)
  }

  addAnimations(clips: THREE.AnimationClip[]) {
    if (!clips.length) return
    this.clips = uniqueClips([...this.clips, ...clips])
    if (!this.mixer) this.mixer = new THREE.AnimationMixer(this.root)
  }

  update(delta: number) {
    if (this.animationV3) {
      this.animationV3.update(delta)
      this.updateSecondaryMotion(delta)
      return
    }
    this.mixer?.update(delta)
    this.updateSecondaryMotion(delta)
    if (this.oneShot && this.active && !this.active.isRunning()) {
      // One-shot combat actions must leave no residual mixer weight behind.
      // Resume the exact locomotion clip object that was active/selected before
      // the action. Do not re-resolve by cue/name here: generated and authored
      // clips can intentionally share Idle/Walk-style names.
      this.oneShot = false
      this.active = undefined
      this.activeKey = ''
      this.mixer?.stopAllAction()

      const fallback = this.fallbackState
      if (
        fallback &&
        this.playClip(
          fallback.clip,
          `cue:${fallback.cue}:${fallback.clip.uuid}`,
          fallback.loop,
          fallback.speed,
        )
      ) {
        this.mixer?.update(0)
      }
    }
  }

  play(cue: ForgeAnimationCue, loop = cue === 'idle' || cue === 'move') {
    if (this.animationV3) return this.animationV3.playCue(cue)
    if (!this.mixer || !this.clips.length) return false

    const authored = resolveRuntimeBinding(this.animationSet, cue)
    const clip = authored?.clip
      ? findClipByName(this.clips, authored.clip)
      : findCueClip(this.clips, cue)

    // Published bindings are authoritative. If an authored Idle/Walk/etc. is
    // configured, never silently substitute a generic embedded animation with
    // a different arm/rest pose.
    if (!clip) return false

    const resolvedLoop = cue === 'idle' || cue === 'move'
      ? true
      : authored?.loop ?? loop
    const resolvedSpeed = authored?.speed ?? 1

    if (cue === 'idle' || cue === 'move') {
      this.fallbackState = {
        cue,
        clip,
        loop: resolvedLoop,
        speed: resolvedSpeed,
      }
      if (this.oneShot && this.active?.isRunning()) return false
    }

    return this.playClip(
      clip,
      `cue:${cue}:${clip.uuid}`,
      resolvedLoop,
      resolvedSpeed,
    )
  }

  playClipName(name: string, loop = false, speed = 1) {
    if (this.animationV3) return this.animationV3.playNamed(name, loop)
    if (!this.mixer || !this.clips.length) return false
    const clip = findClipByName(this.clips, name)
    if (!clip) return false
    return this.playClip(clip, `clip:${name}`, loop, speed)
  }

  private updateSecondaryMotion(delta: number) {
    const motion = this.secondaryMotion
    if (!motion) return

    const dt = THREE.MathUtils.clamp(delta, 1 / 240, 1 / 30)
    motion.phase += dt

    motion.driver.updateWorldMatrix(true, false)
    const driverPosition = motion.driver.getWorldPosition(
      new THREE.Vector3(),
    )

    if (!motion.initialized || delta > .12) {
      motion.previousDriverPosition.copy(driverPosition)
      motion.previousVelocity.set(0, 0, 0)
      motion.smoothedAcceleration.set(0, 0, 0)
      motion.pitch = 0
      motion.pitchVelocity = 0
      motion.roll = 0
      motion.rollVelocity = 0
      motion.initialized = true
    }

    const velocity = driverPosition
      .clone()
      .sub(motion.previousDriverPosition)
      .divideScalar(dt)
    const worldAcceleration = velocity
      .clone()
      .sub(motion.previousVelocity)
      .divideScalar(dt)

    motion.rootWorldQuaternion.copy(
      this.root.getWorldQuaternion(
        motion.rootWorldQuaternion,
      ),
    )
    motion.inverseRootQuaternion
      .copy(motion.rootWorldQuaternion)
      .invert()
    motion.localAcceleration
      .copy(worldAcceleration)
      .applyQuaternion(motion.inverseRootQuaternion)

    motion.localAcceleration.x = THREE.MathUtils.clamp(
      motion.localAcceleration.x,
      -18,
      18,
    )
    motion.localAcceleration.y = THREE.MathUtils.clamp(
      motion.localAcceleration.y,
      -18,
      18,
    )
    motion.localAcceleration.z = THREE.MathUtils.clamp(
      motion.localAcceleration.z,
      -18,
      18,
    )

    const accelerationResponse = 1 - Math.exp(-12 * dt)
    motion.smoothedAcceleration.lerp(
      motion.localAcceleration,
      accelerationResponse,
    )

    motion.previousDriverPosition.copy(driverPosition)
    motion.previousVelocity.copy(velocity)

    const moving = this.activeKey.includes('cue:move:')
    const attacking = this.activeKey.includes('cue:attack:')
    const dodging = this.activeKey.includes('cue:dodge:')
    const hit = this.activeKey.includes('cue:hit:')

    const gaitDrive = moving
      ? Math.sin(motion.phase * 10.5) * .0055
      : 0
    const actionDrive = dodging
      ? Math.sin(motion.phase * 13.5) * .009
      : attacking
        ? Math.sin(motion.phase * 12.5) * .0065
        : hit
          ? Math.sin(motion.phase * 15.5) * .0075
          : Math.sin(motion.phase * 2.2) * .0012

    const targetPitch = THREE.MathUtils.clamp(
      -motion.smoothedAcceleration.y * .0015 +
      motion.smoothedAcceleration.z * .00115 +
      gaitDrive +
      actionDrive,
      -.052,
      .052,
    )
    const targetRoll = THREE.MathUtils.clamp(
      motion.smoothedAcceleration.x * .001 +
      (moving
        ? Math.sin(motion.phase * 5.25 + .7) * .0016
        : 0),
      -.026,
      .026,
    )

    integrateSpringAxis(
      motion,
      'pitch',
      'pitchVelocity',
      targetPitch,
      dt,
      92,
      15.5,
      .065,
    )
    integrateSpringAxis(
      motion,
      'roll',
      'rollVelocity',
      targetRoll,
      dt,
      78,
      14,
      .034,
    )

    const leftOffset = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        motion.pitch,
        0,
        motion.roll,
      ),
    )
    const rightOffset = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        motion.pitch,
        0,
        -motion.roll,
      ),
    )

    motion.left.quaternion
      .copy(motion.leftRest)
      .multiply(leftOffset)
    motion.right.quaternion
      .copy(motion.rightRest)
      .multiply(rightOffset)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.animationV3?.dispose()
    this.animationV3 = undefined
    this.mixer?.stopAllAction()
    disposeBoundObject(this.root)
  }

  private playClip(clip: THREE.AnimationClip, key: string, loop: boolean, speed = 1) {
    if (!this.mixer) return false
    if (this.activeKey === key && this.active?.isRunning()) return true

    const previous = this.active
    const next = this.mixer.clipAction(clip)
    next.reset()
    next.enabled = true
    next.setEffectiveTimeScale(Math.min(3, Math.max(0.1, speed)))
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = false

    if (previous && previous !== next && previous.isRunning()) {
      next.fadeIn(0.08).play()
      previous.fadeOut(0.08)
    } else {
      // When returning from an already-finished one-shot there is no live action
      // to crossfade from. Start the fallback at full weight so the rest/T-pose
      // cannot flash through while Idle fades in from zero.
      next.setEffectiveWeight(1)
      next.play()
      if (previous && previous !== next) previous.stop()
    }

    this.active = next
    this.activeKey = key
    this.oneShot = !loop
    return true
  }
}

type SpringScalarKey =
  | 'pitch'
  | 'roll'
type SpringVelocityKey =
  | 'pitchVelocity'
  | 'rollVelocity'

function integrateSpringAxis(
  motion: SecondaryMotionState,
  valueKey: SpringScalarKey,
  velocityKey: SpringVelocityKey,
  target: number,
  delta: number,
  stiffness: number,
  damping: number,
  limit: number,
) {
  const value = motion[valueKey]
  const velocity = motion[velocityKey]
  const acceleration =
    (target - value) * stiffness -
    velocity * damping
  const nextVelocity = THREE.MathUtils.clamp(
    velocity + acceleration * delta,
    -1.2,
    1.2,
  )
  const nextValue = THREE.MathUtils.clamp(
    value + nextVelocity * delta,
    -limit,
    limit,
  )
  motion[velocityKey] = nextVelocity
  motion[valueKey] = nextValue
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
  if (skillboundBodyTypeFromAsset(asset) === 'female') {
    binding.enableSubtleChestSecondaryMotion()
  }

  // Runtime 3 profiles are keyed by the semantic character/profile target, not
  // by a GLB animation pack. Generic characters and NPCs use their character
  // asset ID as that stable target. Embedded clips are converted once into
  // semantic fallback actions for anything not yet authored in Animation Studio.
  void animationAssetId
  const controller = await createAnimationControllerV3({
    targetRoot: loaded.root,
    targetId: animationAssetId || characterAssetId,
    fallbackSource: {
      root: loaded.root,
      clips: loaded.animations,
      sourceAssetId: characterAssetId,
    },
  })
  binding.setAnimationRuntimeV3(controller)
  ;(binding as ForgeCharacterVisualBinding & { forgeAnimationRuntime?: 'v3' }).forgeAnimationRuntime = 'v3'
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
    for (const emitter of pkg.emitters) {
      if (!emitter.enabled) continue
      this.spawnEmitter(emitter, position, random)
    }
  }

  update(delta: number) {
    if (this.disposed) return false
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]
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
      particle.mesh.parent?.remove(particle.mesh)
      material.dispose()
      this.particles.splice(index, 1)
    }
    if (!this.particles.length) this.disposed = true
    return !this.disposed
  }

  dispose() {
    if (this.disposed && !this.particles.length) return
    this.disposed = true
    for (const particle of this.particles) {
      particle.mesh.parent?.remove(particle.mesh)
      const material = particle.mesh.material as THREE.Material
      material.dispose()
    }
    this.particles.length = 0
  }

  private spawnEmitter(emitter: ForgeVfxEmitter, position: THREE.Vector3, random: () => number) {
    const count = Math.min(
      90,
      Math.max(
        1,
        Math.round(
          emitter.burst ||
          Math.min(24, emitter.spawnRate * Math.min(0.25, emitter.duration)) ||
          8,
        ),
      ),
    )
    const baseDirection = new THREE.Vector3(...emitter.direction)
    if (baseDirection.lengthSq() < 0.001) baseDirection.set(0, 1, 0)
    baseDirection.normalize()
    const geometry = geometryForStyle(emitter.style)
    const gravity = new THREE.Vector3(...emitter.gravity)
    const startColor = new THREE.Color(emitter.startColor)
    const endColor = new THREE.Color(emitter.endColor)

    for (let index = 0; index < count; index += 1) {
      const direction = randomDirection(baseDirection, emitter.spreadDeg, random)
      const speed = Math.max(
        0,
        emitter.speed *
          (1 + (random() * 2 - 1) * emitter.speedRandom),
      )
      const lifetime = Math.max(
        0.05,
        emitter.lifetime *
          (1 + (random() * 2 - 1) * emitter.lifetimeRandom),
      )
      const material = new THREE.MeshBasicMaterial({
        color: emitter.startColor,
        transparent: true,
        opacity: emitter.startAlpha,
        depthWrite: false,
        blending:
          emitter.blendMode === 'additive'
            ? THREE.AdditiveBlending
            : THREE.NormalBlending,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const local = randomEmitterOffset(emitter, random)
      mesh.position.set(
        position.x + emitter.position[0] + local.x,
        Math.max(
          0.08,
          position.y + emitter.position[1] + local.y,
        ),
        position.z + emitter.position[2] + local.z,
      )
      mesh.rotation.set(
        random() * Math.PI,
        random() * Math.PI,
        random() * Math.PI,
      )
      this.scene.add(mesh)
      this.particles.push({
        mesh,
        velocity: direction.multiplyScalar(speed),
        gravity,
        drag: emitter.drag,
        age: 0,
        lifetime,
        startSize: Math.max(0.02, emitter.startSize),
        endSize: Math.max(0.005, emitter.endSize),
        startColor,
        endColor,
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

function findClipByName(clips: THREE.AnimationClip[], name: string) {
  return clips.find((clip) => clip.name === name) ?? clips.find((clip) => clip.name.toLowerCase() === name.toLowerCase())
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

const vfxGeometryCache = new Map<
  ForgeVfxEmitter['style'],
  THREE.BufferGeometry
>()

function geometryForStyle(style: ForgeVfxEmitter['style']) {
  const cached = vfxGeometryCache.get(style)
  if (cached) return cached

  const geometry =
    style === 'ring'
      ? new THREE.RingGeometry(0.45, 0.7, 16)
      : style === 'square' || style === 'diamond'
        ? new THREE.BoxGeometry(0.65, 0.65, 0.12)
        : style === 'spark'
          ? new THREE.BoxGeometry(0.12, 0.12, 0.95)
          : style === 'star'
            ? new THREE.OctahedronGeometry(0.5, 0)
            : new THREE.SphereGeometry(0.45, 7, 5)

  vfxGeometryCache.set(style, geometry)
  return geometry
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
