import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type ForgeRuntimeCharacter = {
  root: THREE.Group
  animations: THREE.AnimationClip[]
  mixer?: THREE.AnimationMixer
  play: (name?: string) => THREE.AnimationAction | undefined
  dispose: () => void
}

export type ForgeRuntimeMaterial = THREE.MeshStandardMaterial & {
  userData: { forgeManifest?: unknown }
}

export type ForgeRuntimeVfx = {
  root: THREE.Group
  manifest: VfxManifest
  play: () => void
  pause: () => void
  stop: () => void
  restart: () => void
  update: (deltaSeconds: number) => void
  dispose: () => void
}

type CharacterTransform = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

type CharacterManifest = {
  format: 'forge-character-runtime'
  version: number
  name: string
  base: string
  rig?: { mapped?: Record<string, string> }
  attachments?: Array<{
    targetBone: string
    file: string
    transform?: CharacterTransform
  }>
}

type MaterialManifest = {
  format: 'forge-material-runtime'
  version: number
  parameters: {
    repeat?: number
    roughness?: number
    metalness?: number
    normalStrength?: number
  }
  maps?: Record<string, string>
}

type VfxEmitterManifest = {
  id?: string
  name?: string
  enabled: boolean
  shape: 'point' | 'cone' | 'sphere' | 'box'
  style: 'soft' | 'spark' | 'square'
  blendMode: 'normal' | 'additive'
  looping: boolean
  duration: number
  spawnRate: number
  burst: number
  maxParticles: number
  lifetime: number
  lifetimeRandom: number
  speed: number
  speedRandom: number
  spreadDeg: number
  direction: [number, number, number]
  gravity: [number, number, number]
  drag: number
  startSize: number
  endSize: number
  startAlpha: number
  endAlpha: number
  startColor: string
  endColor: string
  spin?: number
  position: [number, number, number]
  boxSize: [number, number, number]
}

type VfxManifest = {
  format: 'forge-vfx-runtime' | 'forge-vfx-package'
  version: number
  name: string
  looping: boolean
  duration: number
  emitters: VfxEmitterManifest[]
}

type RuntimeUpdatable = { update: (deltaSeconds: number) => void }
type VfxParticle = {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  life: number
}
type VfxEmitterRuntime = {
  emitter: VfxEmitterManifest
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  particles: VfxParticle[]
  accumulator: number
  elapsed: number
  burstDone: boolean
  positions: Float32Array
  colors: Float32Array
  sizes: Float32Array
  alphas: Float32Array
}

export class ForgeRuntime {
  readonly gltf = new GLTFLoader()
  readonly textures = new THREE.TextureLoader()
  private readonly updatables = new Set<RuntimeUpdatable>()

  update(deltaSeconds: number) {
    const delta = Math.min(0.1, Math.max(0, deltaSeconds || 0))
    for (const item of this.updatables) item.update(delta)
  }

  async loadModel(url: string) {
    return this.gltf.loadAsync(url)
  }

  async loadTexture(url: string, srgb = true) {
    const texture = await this.textures.loadAsync(url)
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  async loadCharacter(manifestUrl: string): Promise<ForgeRuntimeCharacter> {
    const manifest = await fetchJson<CharacterManifest>(manifestUrl)
    if (manifest.format !== 'forge-character-runtime') throw new Error('Not a Forge character runtime manifest.')

    const baseUrl = resolveRelative(manifestUrl, manifest.base)
    const gltf = await this.gltf.loadAsync(baseUrl)
    const root = gltf.scene
    root.name ||= manifest.name

    for (const attachment of manifest.attachments ?? []) {
      const mappedName = manifest.rig?.mapped?.[attachment.targetBone]
      const target = (mappedName && root.getObjectByName(mappedName)) || root.getObjectByName(attachment.targetBone)
      if (!target) continue

      const part = await this.gltf.loadAsync(resolveRelative(manifestUrl, attachment.file))
      const wrapper = new THREE.Group()
      wrapper.name = `ForgeAttachment_${attachment.targetBone}`
      wrapper.add(part.scene)
      applyTransform(wrapper, attachment.transform)
      target.add(wrapper)
    }

    const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : undefined
    let active: THREE.AnimationAction | undefined
    const animationUpdater = mixer ? { update: (delta: number) => mixer.update(delta) } : undefined
    if (animationUpdater) this.updatables.add(animationUpdater)

    const play = (name?: string) => {
      if (!mixer || !gltf.animations.length) return undefined
      const clip = name ? THREE.AnimationClip.findByName(gltf.animations, name) : gltf.animations[0]
      if (!clip) return undefined
      active?.fadeOut(0.12)
      active = mixer.clipAction(clip)
      active.reset().fadeIn(0.12).play()
      return active
    }

    return {
      root,
      animations: gltf.animations,
      mixer,
      play,
      dispose: () => {
        if (animationUpdater) this.updatables.delete(animationUpdater)
        mixer?.stopAllAction()
        disposeObject(root)
      },
    }
  }

  async loadMaterial(manifestUrl: string): Promise<ForgeRuntimeMaterial> {
    const manifest = await fetchJson<MaterialManifest>(manifestUrl)
    if (manifest.format !== 'forge-material-runtime') throw new Error('Not a Forge material runtime manifest.')

    const repeat = Math.max(0.01, manifest.parameters.repeat ?? 1)
    const loadMap = async (key: string, srgb = false) => {
      const file = manifest.maps?.[key]
      if (!file) return undefined
      const texture = await this.textures.loadAsync(resolveRelative(manifestUrl, file))
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(repeat, repeat)
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }

    const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
      loadMap('baseColor', true),
      loadMap('normal'),
      loadMap('roughness'),
      loadMap('ao'),
    ])

    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughnessMap,
      aoMap,
      roughness: manifest.parameters.roughness ?? 0.75,
      metalness: manifest.parameters.metalness ?? 0,
    }) as ForgeRuntimeMaterial
    const normalStrength = manifest.parameters.normalStrength ?? 1
    material.normalScale.set(normalStrength, normalStrength)
    material.userData.forgeManifest = manifest
    return material
  }

  async loadVfx(manifestUrl: string): Promise<ForgeRuntimeVfx> {
    const manifest = normalizeVfxManifest(await fetchJson<VfxManifest>(manifestUrl))
    if (manifest.format !== 'forge-vfx-runtime' && manifest.format !== 'forge-vfx-package') {
      throw new Error('Not a Forge VFX manifest.')
    }

    const root = new THREE.Group()
    root.name = `ForgeVFX_${manifest.name}`
    root.userData.forgeManifest = manifest
    const runtimes = manifest.emitters.map((emitter) => createVfxEmitterRuntime(emitter, root))
    const state = { elapsed: 0, playing: false }

    const reset = () => {
      state.elapsed = 0
      for (const runtime of runtimes) {
        runtime.particles = []
        runtime.accumulator = 0
        runtime.elapsed = 0
        runtime.burstDone = false
        runtime.points.visible = runtime.emitter.enabled
        clearVfxAttributes(runtime)
      }
    }

    const update = (deltaSeconds: number) => {
      if (!state.playing) return
      updateVfxSimulation(runtimes, state, manifest, Math.min(0.1, Math.max(0, deltaSeconds || 0)))
    }

    const updatable = { update }
    this.updatables.add(updatable)

    return {
      root,
      manifest,
      play: () => { state.playing = true },
      pause: () => { state.playing = false },
      stop: () => { state.playing = false; reset() },
      restart: () => { reset(); state.playing = true },
      update,
      dispose: () => {
        this.updatables.delete(updatable)
        root.removeFromParent()
        for (const runtime of runtimes) {
          runtime.points.geometry.dispose()
          runtime.points.material.dispose()
        }
      },
    }
  }
}

function createVfxEmitterRuntime(emitter: VfxEmitterManifest, root: THREE.Group): VfxEmitterRuntime {
  const max = Math.max(8, Math.min(2000, Math.round(emitter.maxParticles || 220)))
  const positions = new Float32Array(max * 3)
  const colors = new Float32Array(max * 3)
  const sizes = new Float32Array(max)
  const alphas = new Float32Array(max)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setDrawRange(0, 0)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: emitter.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uPixelRatio: { value: Math.min(globalThis.devicePixelRatio || 1, 2) },
      uStyle: { value: emitter.style === 'soft' ? 0 : emitter.style === 'spark' ? 1 : 2 },
    },
    vertexShader: `attribute vec3 aColor;attribute float aSize;attribute float aAlpha;varying vec3 vColor;varying float vAlpha;uniform float uPixelRatio;void main(){vColor=aColor;vAlpha=aAlpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=max(1.0,aSize*uPixelRatio*(320.0/max(0.2,-mv.z)));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor;varying float vAlpha;uniform float uStyle;void main(){vec2 p=gl_PointCoord*2.0-1.0;float a=1.0;if(uStyle<0.5){a=smoothstep(1.0,0.15,length(p));}else if(uStyle<1.5){a=smoothstep(1.0,0.0,abs(p.x)+abs(p.y)*0.32);}else{a=step(max(abs(p.x),abs(p.y)),1.0);}if(a<0.01)discard;gl_FragColor=vec4(vColor,vAlpha*a);}`,
  })

  const points = new THREE.Points(geometry, material)
  points.name = `ForgeVFXEmitter_${emitter.name || 'Emitter'}`
  points.frustumCulled = false
  points.visible = emitter.enabled
  root.add(points)

  return { emitter, points, particles: [], accumulator: 0, elapsed: 0, burstDone: false, positions, colors, sizes, alphas }
}

function updateVfxSimulation(
  runtimes: VfxEmitterRuntime[],
  state: { elapsed: number; playing: boolean },
  manifest: VfxManifest,
  delta: number,
) {
  state.elapsed += delta
  const effectDuration = Math.max(0.05, manifest.duration || 1)
  if (manifest.looping && state.elapsed >= effectDuration) {
    state.elapsed %= effectDuration
    for (const runtime of runtimes) {
      runtime.elapsed = 0
      runtime.burstDone = false
    }
  }

  for (const runtime of runtimes) {
    const emitter = runtime.emitter
    runtime.points.visible = emitter.enabled
    if (!emitter.enabled) continue
    runtime.elapsed += delta

    const effectCanEmit = manifest.looping || state.elapsed <= effectDuration
    const emitterCanEmit = emitter.looping || runtime.elapsed <= Math.max(0.05, emitter.duration || effectDuration)
    const canEmit = effectCanEmit && emitterCanEmit

    if (canEmit && !runtime.burstDone && emitter.burst > 0) {
      const burst = Math.min(2000, Math.max(0, Math.round(emitter.burst)))
      for (let i = 0; i < burst; i += 1) spawnVfxParticle(runtime)
      runtime.burstDone = true
    }

    if (canEmit && emitter.spawnRate > 0) {
      runtime.accumulator += delta * Math.min(2000, emitter.spawnRate)
      while (runtime.accumulator >= 1) {
        spawnVfxParticle(runtime)
        runtime.accumulator -= 1
      }
    }

    for (let i = runtime.particles.length - 1; i >= 0; i -= 1) {
      const particle = runtime.particles[i]
      particle.age += delta
      if (particle.age >= particle.life) {
        runtime.particles.splice(i, 1)
        continue
      }
      const drag = Math.max(0, 1 - Math.max(0, emitter.drag) * delta)
      particle.velocity.x = (particle.velocity.x + emitter.gravity[0] * delta) * drag
      particle.velocity.y = (particle.velocity.y + emitter.gravity[1] * delta) * drag
      particle.velocity.z = (particle.velocity.z + emitter.gravity[2] * delta) * drag
      particle.position.addScaledVector(particle.velocity, delta)
    }

    writeVfxAttributes(runtime)
  }
}

function spawnVfxParticle(runtime: VfxEmitterRuntime) {
  const emitter = runtime.emitter
  const max = (runtime.positions.length / 3) | 0
  if (runtime.particles.length >= max) runtime.particles.shift()

  const position = new THREE.Vector3(...emitter.position)
  if (emitter.shape === 'sphere') {
    position.add(randomUnitVector().multiplyScalar(Math.cbrt(Math.random()) * 0.45))
  } else if (emitter.shape === 'box') {
    position.x += (Math.random() - 0.5) * emitter.boxSize[0]
    position.y += (Math.random() - 0.5) * emitter.boxSize[1]
    position.z += (Math.random() - 0.5) * emitter.boxSize[2]
  }

  const direction = new THREE.Vector3(...emitter.direction)
  if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0)
  direction.normalize()
  const spread = Math.sin(THREE.MathUtils.degToRad(Math.max(0, emitter.spreadDeg) * 0.5))
  direction.addScaledVector(randomUnitVector(), spread * Math.random()).normalize()
  const speed = Math.max(0, emitter.speed) * (1 + (Math.random() * 2 - 1) * Math.max(0, emitter.speedRandom))
  const life = Math.max(0.04, emitter.lifetime * (1 + (Math.random() * 2 - 1) * Math.max(0, emitter.lifetimeRandom)))

  runtime.particles.push({ position, velocity: direction.multiplyScalar(speed), age: 0, life })
}

function writeVfxAttributes(runtime: VfxEmitterRuntime) {
  const emitter = runtime.emitter
  const start = new THREE.Color(emitter.startColor)
  const end = new THREE.Color(emitter.endColor)
  const mixed = new THREE.Color()
  const count = Math.min(runtime.particles.length, runtime.positions.length / 3)

  for (let i = 0; i < count; i += 1) {
    const particle = runtime.particles[i]
    const t = Math.min(1, particle.age / particle.life)
    const index = i * 3
    runtime.positions[index] = particle.position.x
    runtime.positions[index + 1] = particle.position.y
    runtime.positions[index + 2] = particle.position.z
    mixed.copy(start).lerp(end, t)
    runtime.colors[index] = mixed.r
    runtime.colors[index + 1] = mixed.g
    runtime.colors[index + 2] = mixed.b
    runtime.sizes[i] = THREE.MathUtils.lerp(emitter.startSize, emitter.endSize, t)
    runtime.alphas[i] = THREE.MathUtils.lerp(emitter.startAlpha, emitter.endAlpha, t)
  }

  runtime.points.geometry.setDrawRange(0, count)
  markVfxAttributesDirty(runtime)
}

function clearVfxAttributes(runtime: VfxEmitterRuntime) {
  runtime.points.geometry.setDrawRange(0, 0)
  markVfxAttributesDirty(runtime)
}

function markVfxAttributesDirty(runtime: VfxEmitterRuntime) {
  for (const key of ['position', 'aColor', 'aSize', 'aAlpha']) {
    const attribute = runtime.points.geometry.getAttribute(key) as THREE.BufferAttribute
    attribute.needsUpdate = true
  }
}

function normalizeVfxManifest(input: VfxManifest): VfxManifest {
  if (!input || !Array.isArray(input.emitters)) throw new Error('Forge VFX manifest is missing emitters.')
  return {
    ...input,
    name: input.name || 'Forge VFX',
    looping: !!input.looping,
    duration: Math.max(0.05, Number(input.duration) || 1),
    emitters: input.emitters.slice(0, 32).map((emitter) => ({
      ...emitter,
      enabled: emitter.enabled !== false,
      duration: Math.max(0.05, Number(emitter.duration) || 1),
      spawnRate: Math.max(0, Number(emitter.spawnRate) || 0),
      burst: Math.max(0, Number(emitter.burst) || 0),
      maxParticles: Math.max(8, Math.min(2000, Number(emitter.maxParticles) || 220)),
      lifetime: Math.max(0.04, Number(emitter.lifetime) || 0.7),
      lifetimeRandom: Math.max(0, Math.min(1, Number(emitter.lifetimeRandom) || 0)),
      speed: Math.max(0, Number(emitter.speed) || 0),
      speedRandom: Math.max(0, Math.min(1, Number(emitter.speedRandom) || 0)),
      spreadDeg: Math.max(0, Math.min(360, Number(emitter.spreadDeg) || 0)),
      drag: Math.max(0, Number(emitter.drag) || 0),
      startSize: Math.max(0.001, Number(emitter.startSize) || 0.05),
      endSize: Math.max(0.001, Number(emitter.endSize) || 0.01),
      startAlpha: Math.max(0, Math.min(1, Number(emitter.startAlpha) || 0)),
      endAlpha: Math.max(0, Math.min(1, Number(emitter.endAlpha) || 0)),
      direction: emitter.direction ?? [0, 1, 0],
      gravity: emitter.gravity ?? [0, 0, 0],
      position: emitter.position ?? [0, 0, 0],
      boxSize: emitter.boxSize ?? [1, 1, 1],
    })),
  }
}

function randomUnitVector() {
  const z = Math.random() * 2 - 1
  const angle = Math.random() * Math.PI * 2
  const radius = Math.sqrt(Math.max(0, 1 - z * z))
  return new THREE.Vector3(radius * Math.cos(angle), z, radius * Math.sin(angle))
}

function resolveRelative(manifestUrl: string, file: string) {
  const base = typeof window !== 'undefined' ? window.location.href : manifestUrl
  return new URL(file, new URL(manifestUrl, base)).toString()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Forge asset request failed: ${response.status}`)
  return await response.json() as T
}

function applyTransform(group: THREE.Group, transform?: CharacterTransform) {
  if (!transform) return
  if (transform.position) group.position.fromArray(transform.position)
  if (transform.rotation) group.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number])
  if (transform.scale) group.scale.fromArray(transform.scale)
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      const record = material as unknown as Record<string, unknown>
      for (const value of Object.values(record)) if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose()
      material.dispose()
    }
  })
}
