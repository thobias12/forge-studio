import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { ForgeVfxEmitter, ForgeVfxPackage } from '../lib/vfxPackage'

export type VfxPreviewHandle = { restart: () => void; frame: () => void }
type Props = { value: ForgeVfxPackage; playing: boolean; showGrid: boolean; background: 'studio' | 'dark' | 'outdoor' }

type AdvancedShape = ForgeVfxEmitter['shape'] | 'ring' | 'shell' | 'arc' | 'line' | 'spiral' | 'vortex' | 'groundCircle'
type AdvancedStyle = ForgeVfxEmitter['style'] | 'streak' | 'flare' | 'smoke' | 'rune' | 'shockwave' | 'ember' | 'mist'
type AdvancedEmitter = ForgeVfxEmitter & {
  shape?: AdvancedShape
  style?: AdvancedStyle
  radialAccel?: number
  inwardAccel?: number
  orbitStrength?: number
  turbulence?: number
  delay?: number
  spawnRadius?: number
  innerRadius?: number
  lineLength?: number
  arcDeg?: number
  spiralTurns?: number
  bloomBoost?: number
  shakeStrength?: number
  beamLength?: number
  beamWidth?: number
  trailLength?: number
  trailRadius?: number
  groundDecal?: boolean
  decalSize?: number
  decalOpacity?: number
  zoneLinger?: number
  zonePulse?: number
  lightIntensity?: number
  lightRange?: number
  lightColor?: string
  distortionStrength?: number
  lightningBranches?: number
  lightningJitter?: number
}

type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; age: number; life: number; spin: number }
type EmitterRuntime = {
  emitter: ForgeVfxEmitter
  points: THREE.Points
  particleMaterial: THREE.ShaderMaterial
  particles: Particle[]
  accumulator: number
  elapsed: number
  burstDone: boolean
  positions: Float32Array
  colors: Float32Array
  sizes: Float32Array
  alphas: Float32Array
  beam?: THREE.Mesh
  beamMaterial?: THREE.MeshBasicMaterial
  trail?: THREE.Mesh
  trailMaterial?: THREE.MeshBasicMaterial
  trailHead: THREE.Vector3
  trailPoints: THREE.Vector3[]
  decal?: THREE.Mesh
  decalMaterial?: THREE.MeshBasicMaterial
  zone?: THREE.Mesh
  zoneMaterial?: THREE.MeshBasicMaterial
  halo?: THREE.Mesh
  haloMaterial?: THREE.MeshBasicMaterial
  light?: THREE.PointLight
  lightning?: THREE.LineSegments
  lightningMaterial?: THREE.LineBasicMaterial
}

type PreviewState = {
  renderer?: THREE.WebGLRenderer
  composer?: EffectComposer
  bloom?: UnrealBloomPass
  scene?: THREE.Scene
  camera?: THREE.PerspectiveCamera
  orbit?: OrbitControls
  grid?: THREE.GridHelper
  floor?: THREE.Mesh
  runtimes: EmitterRuntime[]
  last: number
  elapsed: number
  shake: number
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

const VfxPreview = forwardRef<VfxPreviewHandle, Props>(function VfxPreview({ value, playing, showGrid, background }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playingRef = useRef(playing)
  const valueRef = useRef(value)
  const state = useRef<PreviewState>({ runtimes: [], last: 0, elapsed: 0, shake: 0 })

  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { valueRef.current = value }, [value])

  const resetRuntimes = () => {
    const s = state.current
    s.elapsed = 0
    s.shake = 0
    for (const runtime of s.runtimes) {
      runtime.particles = []
      runtime.accumulator = 0
      runtime.elapsed = 0
      runtime.burstDone = false
      runtime.points.visible = runtime.emitter.enabled
      runtime.trailHead.copy(new THREE.Vector3(...runtime.emitter.position))
      runtime.trailPoints = []
      if (runtime.beam) runtime.beam.visible = false
      if (runtime.trail) runtime.trail.visible = false
      if (runtime.decal) runtime.decal.visible = false
      if (runtime.zone) runtime.zone.visible = false
      if (runtime.halo) runtime.halo.visible = false
      if (runtime.light) runtime.light.intensity = 0
      if (runtime.lightning) runtime.lightning.visible = false
      clearAttributes(runtime)
    }
  }

  useImperativeHandle(ref, () => ({ restart: resetRuntimes, frame: () => state.current.orbit?.update() }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const s = state.current
    const scene = new THREE.Scene()
    s.scene = scene
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 120)
    camera.position.set(6.4, 3.5, 7.2)
    s.camera = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)
    s.renderer = renderer

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.35, 0.8, 0.18)
    composer.addPass(bloom)
    s.composer = composer
    s.bloom = bloom

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.target.set(0, 1.1, 0)
    orbit.update()
    s.orbit = orbit

    scene.add(new THREE.HemisphereLight(0xc7deff, 0x25303b, 1.75))
    const key = new THREE.DirectionalLight(0xffffff, 2.9)
    key.position.set(5, 7, 4)
    key.castShadow = true
    scene.add(key)

    const grid = new THREE.GridHelper(18, 36, 0x455e73, 0x1c2833)
    scene.add(grid)
    s.grid = grid

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ color: 0x111922, roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    s.floor = floor

    const origin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), new THREE.MeshStandardMaterial({ color: 0x7fb6de, emissive: 0x284d6d, emissiveIntensity: 1.2 }))
    origin.position.y = 0.06
    scene.add(origin)

    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      composer.setSize(rect.width, rect.height)
      bloom.setSize(rect.width, rect.height)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    let raf = 0
    const tick = (now: number) => {
      const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0
      s.last = now
      orbit.update()
      if (playingRef.current) updateSimulation(s, dt, valueRef.current)
      const baseCamera = camera.position.clone()
      applyCameraShake(s, camera, baseCamera)
      composer.render()
      camera.position.copy(baseCamera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      disposeRuntimes(s)
      orbit.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      s.last = 0
    }
  }, [])

  useEffect(() => {
    const s = state.current
    if (!s.scene) return
    disposeRuntimes(s)
    s.runtimes = value.emitters.map((emitter) => createRuntime(emitter, s.scene!))
    resetRuntimes()
  }, [JSON.stringify(value.emitters)])

  useEffect(() => {
    const s = state.current
    if (s.grid) s.grid.visible = showGrid
    if (s.floor) s.floor.visible = showGrid
  }, [showGrid])

  useEffect(() => {
    const scene = state.current.scene
    if (!scene) return
    scene.background = new THREE.Color(background === 'dark' ? 0x030508 : background === 'outdoor' ? 0x263847 : 0x0a1017)
  }, [background])

  return <div ref={hostRef} className="vfx-preview-canvas" />
})

function createRuntime(emitter: ForgeVfxEmitter, scene: THREE.Scene): EmitterRuntime {
  const advanced = emitter as AdvancedEmitter
  const max = Math.max(8, Math.min(2200, Math.round(emitter.maxParticles)))
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
    vertexColors: true,
    uniforms: {
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      uStyle: { value: styleIndex(advanced.style ?? emitter.style) },
      uBloomBoost: { value: num(advanced.bloomBoost, 0) },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uPixelRatio;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uPixelRatio * (340.0 / max(0.2, -mv.z)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uStyle;
      uniform float uBloomBoost;
      float circle(vec2 p, float r) { return 1.0 - smoothstep(r - 0.12, r + 0.12, length(p)); }
      float noise(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = 1.0;
        if (uStyle < 0.5) {
          a = 1.0 - smoothstep(0.15, 1.0, length(p));
        } else if (uStyle < 1.5) {
          a = 1.0 - smoothstep(0.0, 1.0, abs(p.x) + abs(p.y) * 0.32);
        } else if (uStyle < 2.5) {
          a = step(max(abs(p.x), abs(p.y)), 1.0);
        } else if (uStyle < 3.5) {
          a = 1.0 - smoothstep(0.035, 0.18, abs(length(p) - 0.62));
        } else if (uStyle < 4.5) {
          a = 1.0 - smoothstep(0.68, 1.0, abs(p.x) + abs(p.y));
        } else if (uStyle < 5.5) {
          float axis = min(abs(p.x), abs(p.y));
          float diag = min(abs(p.x + p.y), abs(p.x - p.y)) * 0.7071;
          float rays = 1.0 - smoothstep(0.055, 0.23, min(axis, diag));
          float fade = 1.0 - smoothstep(0.52, 1.05, length(p));
          a = rays * fade;
        } else if (uStyle < 6.5) {
          vec2 q = vec2(p.x * 0.35, p.y);
          a = (1.0 - smoothstep(0.0, 1.05, length(q))) * (1.0 - smoothstep(0.45, 1.0, abs(p.y)));
        } else if (uStyle < 7.5) {
          float core = 1.0 - smoothstep(0.0, 0.55, length(p));
          float halo = 1.0 - smoothstep(0.2, 1.1, length(p));
          a = max(core, halo * 0.65);
        } else if (uStyle < 8.5) {
          float smoke = 1.0 - smoothstep(0.15, 1.1, length(vec2(p.x * 0.92, p.y * 1.08)));
          a = smoke * (0.48 + 0.22 * noise(p * 4.0));
        } else if (uStyle < 9.5) {
          float outer = 1.0 - smoothstep(0.56, 0.76, length(p));
          float inner = smoothstep(0.18, 0.26, length(p));
          float cross = 1.0 - smoothstep(0.05, 0.11, min(abs(p.x), abs(p.y)));
          a = max(outer * inner, cross * 0.35);
        } else if (uStyle < 10.5) {
          a = circle(p, 0.78) * (1.0 - smoothstep(0.0, 0.48, length(p)) * 0.6);
        } else if (uStyle < 11.5) {
          float hot = 1.0 - smoothstep(0.0, 0.32, length(p));
          float shell = 1.0 - smoothstep(0.1, 0.9, length(p));
          a = max(hot, shell * 0.65);
        } else if (uStyle < 12.5) {
          a = (1.0 - smoothstep(0.1, 1.12, length(p))) * 0.75;
        } else {
          a = 1.0 - smoothstep(0.15, 1.0, length(p));
        }
        if (a < 0.01) discard;
        vec3 boosted = vColor * (1.0 + uBloomBoost * 0.55);
        gl_FragColor = vec4(boosted, vAlpha * max(0.0, a));
      }
    `,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)

  const runtime: EmitterRuntime = { emitter, points, particleMaterial: material, particles: [], accumulator: 0, elapsed: 0, burstDone: false, positions, colors, sizes, alphas, trailHead: new THREE.Vector3(...emitter.position), trailPoints: [] }

  const beamMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(emitter.startColor), transparent: true, opacity: emitter.startAlpha, blending: THREE.AdditiveBlending, depthWrite: false })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), beamMaterial)
  beam.visible = false
  scene.add(beam)
  runtime.beam = beam
  runtime.beamMaterial = beamMaterial

  const trailMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(emitter.startColor), transparent: true, opacity: emitter.startAlpha, blending: THREE.AdditiveBlending, depthWrite: false })
  const trail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)), 4, 0.05, 6, false), trailMaterial)
  trail.visible = false
  scene.add(trail)
  runtime.trail = trail
  runtime.trailMaterial = trailMaterial

  const decalMaterial = new THREE.MeshBasicMaterial({ map: makeDecalTexture(), transparent: true, opacity: num(advanced.decalOpacity, 0.6), color: new THREE.Color(emitter.endColor), depthWrite: false, blending: THREE.NormalBlending })
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMaterial)
  decal.rotation.x = -Math.PI / 2
  decal.position.y = 0.02
  decal.visible = false
  scene.add(decal)
  runtime.decal = decal
  runtime.decalMaterial = decalMaterial

  const zoneMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(emitter.endColor), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const zone = new THREE.Mesh(new THREE.CircleGeometry(1, 48), zoneMaterial)
  zone.rotation.x = -Math.PI / 2
  zone.position.y = 0.025
  zone.visible = false
  scene.add(zone)
  runtime.zone = zone
  runtime.zoneMaterial = zoneMaterial

  const haloMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(emitter.startColor), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 48), haloMaterial)
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.03
  halo.visible = false
  scene.add(halo)
  runtime.halo = halo
  runtime.haloMaterial = haloMaterial

  const light = new THREE.PointLight(new THREE.Color(advanced.lightColor ?? emitter.startColor), 0, num(advanced.lightRange, Math.max(3, num(advanced.spawnRadius, 1.5) * 3.2)), 2)
  light.position.set(...emitter.position)
  scene.add(light)
  runtime.light = light

  const lightningMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(emitter.startColor), transparent: true, opacity: 0.88, depthWrite: false })
  const lightningGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
  const lightning = new THREE.LineSegments(lightningGeometry, lightningMaterial)
  lightning.visible = false
  scene.add(lightning)
  runtime.lightning = lightning
  runtime.lightningMaterial = lightningMaterial

  return runtime
}

function updateSimulation(s: PreviewState, dt: number, pkg: ForgeVfxPackage) {
  s.elapsed += dt
  if (!pkg.looping && s.elapsed > pkg.duration + 1.5) return
  if (pkg.looping && s.elapsed > Math.max(0.1, pkg.duration)) {
    s.elapsed = 0
    for (const r of s.runtimes) {
      r.burstDone = false
      r.elapsed = 0
      r.trailHead.set(...r.emitter.position)
      r.trailPoints = []
    }
  }

  let shakeTarget = 0
  let bloomTarget = 1.2

  for (const runtime of s.runtimes) {
    const e = runtime.emitter
    const advanced = e as AdvancedEmitter
    if (!e.enabled) {
      runtime.points.visible = false
      hideSecondaryVisuals(runtime)
      continue
    }

    runtime.points.visible = true
    runtime.elapsed += dt
    const delay = num(advanced.delay, 0)
    const localTime = runtime.elapsed - delay
    const activeWindow = e.looping || localTime <= Math.max(0.05, e.duration)
    const active = localTime >= 0 && activeWindow

    updateBeamMesh(runtime, active, localTime)
    updateTrailMesh(runtime, dt, active, localTime)
    updateDecalMesh(runtime, active, localTime)
    updateZoneMesh(runtime, active, localTime)
    updateHaloMesh(runtime, active, localTime)
    updateLightning(runtime, active, localTime)
    updateImpactLight(runtime, active, localTime)

    if (localTime < 0) {
      writeAttributes(runtime)
      continue
    }

    if (active && !runtime.burstDone && e.burst > 0) {
      for (let i = 0; i < e.burst; i += 1) spawn(runtime)
      runtime.burstDone = true
    }
    if (active && e.spawnRate > 0) {
      runtime.accumulator += dt * e.spawnRate
      while (runtime.accumulator >= 1) {
        spawn(runtime)
        runtime.accumulator -= 1
      }
    }

    const center = new THREE.Vector3(...e.position)
    for (let i = runtime.particles.length - 1; i >= 0; i -= 1) {
      const p = runtime.particles[i]
      p.age += dt
      if (p.age >= p.life) {
        runtime.particles.splice(i, 1)
        continue
      }
      const offset = p.position.clone().sub(center)
      if (offset.lengthSq() > 0.0001) {
        if (num(advanced.radialAccel, 0) !== 0) p.velocity.addScaledVector(offset.clone().normalize(), num(advanced.radialAccel, 0) * dt)
        if (num(advanced.inwardAccel, 0) !== 0) p.velocity.addScaledVector(offset.clone().normalize(), -num(advanced.inwardAccel, 0) * dt)
        if (num(advanced.orbitStrength, 0) !== 0) {
          const tangent = new THREE.Vector3(-offset.z, 0, offset.x)
          if (tangent.lengthSq() > 0.0001) p.velocity.addScaledVector(tangent.normalize(), num(advanced.orbitStrength, 0) * dt)
        }
      }
      if (num(advanced.turbulence, 0) > 0) {
        const t = num(advanced.turbulence, 0) * dt
        p.velocity.x += (Math.random() * 2 - 1) * t
        p.velocity.y += (Math.random() * 2 - 1) * t
        p.velocity.z += (Math.random() * 2 - 1) * t
      }
      const drag = Math.max(0, 1 - e.drag * dt)
      p.velocity.x = (p.velocity.x + e.gravity[0] * dt) * drag
      p.velocity.y = (p.velocity.y + e.gravity[1] * dt) * drag
      p.velocity.z = (p.velocity.z + e.gravity[2] * dt) * drag
      p.position.addScaledVector(p.velocity, dt)
    }

    writeAttributes(runtime)
    if (active) {
      shakeTarget = Math.max(shakeTarget, num(advanced.shakeStrength, 0), num(advanced.lightIntensity, 0) * 0.35)
      bloomTarget = Math.max(bloomTarget, 1.2 + num(advanced.bloomBoost, 0) * 0.38 + num(advanced.distortionStrength, 0) * 0.12)
    }
  }

  s.shake = THREE.MathUtils.lerp(s.shake, shakeTarget, 0.12)
  if (s.bloom) s.bloom.strength = THREE.MathUtils.lerp(s.bloom.strength, bloomTarget, 0.08)
}

function hideSecondaryVisuals(runtime: EmitterRuntime) {
  if (runtime.beam) runtime.beam.visible = false
  if (runtime.trail) runtime.trail.visible = false
  if (runtime.decal) runtime.decal.visible = false
  if (runtime.zone) runtime.zone.visible = false
  if (runtime.halo) runtime.halo.visible = false
  if (runtime.light) runtime.light.intensity = 0
  if (runtime.lightning) runtime.lightning.visible = false
}

function updateBeamMesh(runtime: EmitterRuntime, active: boolean, localTime: number) {
  const beam = runtime.beam
  const material = runtime.beamMaterial
  if (!beam || !material) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const style = advanced.style ?? emitter.style
  const isBeamLike = emitter.shape === 'line' || style === 'flare' || style === 'streak' || style === 'shockwave'
  if (!active || !isBeamLike) {
    beam.visible = false
    return
  }
  const dir = new THREE.Vector3(...emitter.direction)
  if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0)
  dir.normalize()
  const t = THREE.MathUtils.clamp(localTime / Math.max(0.05, emitter.duration), 0, 1)
  const pulse = 0.82 + Math.sin(localTime * 18) * 0.12 + (1 - t) * 0.18
  const length = num(advanced.beamLength, Math.max(2.2, num(advanced.lineLength, 4.6)))
  const width = num(advanced.beamWidth, style === 'streak' ? 0.08 : 0.14)
  beam.visible = emitter.shape === 'line' || num(advanced.beamLength, 0) > 0
  beam.position.set(...emitter.position).addScaledVector(dir, length * 0.5)
  beam.quaternion.setFromUnitVectors(Y_AXIS, dir)
  beam.scale.set(width * pulse, length, width * pulse)
  material.color.copy(new THREE.Color(emitter.startColor).lerp(new THREE.Color(emitter.endColor), t))
  material.opacity = THREE.MathUtils.clamp(THREE.MathUtils.lerp(emitter.startAlpha, emitter.endAlpha, t) * (1.15 - t * 0.35), 0, 1)
}

function updateTrailMesh(runtime: EmitterRuntime, dt: number, active: boolean, localTime: number) {
  const trail = runtime.trail
  const material = runtime.trailMaterial
  if (!trail || !material) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const dir = new THREE.Vector3(...emitter.direction)
  if (dir.lengthSq() < 0.0001) dir.set(1, 0.15, 0)
  dir.normalize()
  const style = advanced.style ?? emitter.style
  const wantsTrail = style === 'ember' || style === 'mist' || style === 'smoke' || emitter.shape === 'spiral' || emitter.shape === 'vortex' || num(advanced.trailLength, 0) > 0

  if (active && wantsTrail) {
    const speed = Math.max(1, emitter.speed * 0.9)
    const step = dir.clone().multiplyScalar(speed * dt)
    if (num(advanced.orbitStrength, 0) !== 0 && runtime.trailPoints.length > 0) {
      const off = runtime.trailHead.clone().sub(new THREE.Vector3(...emitter.position))
      const tangent = new THREE.Vector3(-off.z, 0, off.x)
      if (tangent.lengthSq() > 0.0001) step.addScaledVector(tangent.normalize(), num(advanced.orbitStrength, 0) * dt * 0.25)
    }
    if (num(advanced.turbulence, 0) > 0) {
      step.x += (Math.random() * 2 - 1) * num(advanced.turbulence, 0) * dt * 0.35
      step.y += (Math.random() * 2 - 1) * num(advanced.turbulence, 0) * dt * 0.2
      step.z += (Math.random() * 2 - 1) * num(advanced.turbulence, 0) * dt * 0.35
    }
    if (runtime.trailPoints.length === 0) runtime.trailHead.set(...emitter.position)
    runtime.trailHead.add(step)
    runtime.trailPoints.push(runtime.trailHead.clone())
    const maxPoints = Math.max(6, Math.min(40, Math.round(num(advanced.trailLength, 18))))
    while (runtime.trailPoints.length > maxPoints) runtime.trailPoints.shift()
  } else if (runtime.trailPoints.length > 0) {
    runtime.trailPoints.shift()
  }

  if (runtime.trailPoints.length < 2 || !wantsTrail) {
    trail.visible = false
    return
  }

  const curve = new THREE.CatmullRomCurve3(runtime.trailPoints)
  const radius = num(advanced.trailRadius, 0.08)
  const nextGeometry = new THREE.TubeGeometry(curve, Math.max(8, runtime.trailPoints.length * 2), radius, 6, false)
  trail.geometry.dispose()
  trail.geometry = nextGeometry
  trail.visible = true
  const t = THREE.MathUtils.clamp(Math.max(0, localTime) / Math.max(0.05, emitter.duration), 0, 1)
  material.color.copy(new THREE.Color(emitter.startColor).lerp(new THREE.Color(emitter.endColor), t))
  material.opacity = THREE.MathUtils.clamp(THREE.MathUtils.lerp(emitter.startAlpha, emitter.endAlpha, t) * 0.95, 0, 1)
}

function updateDecalMesh(runtime: EmitterRuntime, active: boolean, localTime: number) {
  const decal = runtime.decal
  const material = runtime.decalMaterial
  if (!decal || !material) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const shape = advanced.shape ?? emitter.shape
  const wants = shape === 'groundCircle' || Boolean(advanced.groundDecal) || styleNeedsGround(advanced.style ?? emitter.style)
  const lingerTime = emitter.duration + num(advanced.zoneLinger, 0.8)
  const linger = localTime >= 0 && localTime <= lingerTime
  if (!wants || (!linger && !active)) {
    decal.visible = false
    return
  }
  const t = THREE.MathUtils.clamp(Math.max(0, localTime) / Math.max(0.05, lingerTime), 0, 1)
  const size = num(advanced.decalSize, Math.max(1.8, num(advanced.spawnRadius, 1) * 2.5)) * (0.72 + t * 0.46)
  decal.visible = true
  decal.position.set(emitter.position[0], 0.02, emitter.position[2])
  decal.scale.set(size, size, 1)
  material.color.copy(new THREE.Color(emitter.endColor).lerp(new THREE.Color(0x161618), 0.55))
  material.opacity = num(advanced.decalOpacity, 0.58) * (1 - t)
}

function updateZoneMesh(runtime: EmitterRuntime, active: boolean, localTime: number) {
  const zone = runtime.zone
  const material = runtime.zoneMaterial
  if (!zone || !material) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const shape = advanced.shape ?? emitter.shape
  const style = advanced.style ?? emitter.style
  const linger = num(advanced.zoneLinger, styleNeedsGround(style) ? 1.4 : 0.7)
  const valid = shape === 'groundCircle' || styleNeedsGround(style) || num(advanced.zonePulse, 0) > 0
  const total = emitter.duration + linger
  if (!valid || localTime < 0 || localTime > total) {
    zone.visible = false
    return
  }
  const t = THREE.MathUtils.clamp(localTime / Math.max(0.05, total), 0, 1)
  const pulse = 1 + Math.sin(localTime * (3 + num(advanced.zonePulse, 0) * 2)) * 0.07 * num(advanced.zonePulse, 1)
  const radius = Math.max(1.2, num(advanced.spawnRadius, 1.2) * 2.3) * (0.86 + t * 0.3) * pulse
  zone.visible = true
  zone.position.set(emitter.position[0], 0.024, emitter.position[2])
  zone.scale.set(radius, radius, 1)
  material.color.copy(new THREE.Color(emitter.endColor).lerp(new THREE.Color(emitter.startColor), 0.18))
  material.opacity = Math.max(0, (0.22 + num(advanced.distortionStrength, 0) * 0.06) * (1 - t))
}

function updateHaloMesh(runtime: EmitterRuntime, active: boolean, localTime: number) {
  const halo = runtime.halo
  const material = runtime.haloMaterial
  if (!halo || !material) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const style = advanced.style ?? emitter.style
  const distortion = num(advanced.distortionStrength, style === 'flare' || style === 'shockwave' ? 0.8 : 0)
  if (!active || distortion <= 0) {
    halo.visible = false
    return
  }
  const t = THREE.MathUtils.clamp(localTime / Math.max(0.05, emitter.duration), 0, 1)
  const radius = Math.max(0.7, num(advanced.spawnRadius, 1) * 1.5) * (0.85 + t * (1.4 + distortion * 0.5))
  halo.visible = true
  halo.position.set(emitter.position[0], emitter.position[1] + 0.03, emitter.position[2])
  halo.scale.set(radius, radius, 1)
  halo.rotation.z += 0.012 + distortion * 0.01
  material.color.copy(new THREE.Color(emitter.startColor).lerp(new THREE.Color(emitter.endColor), 0.4))
  material.opacity = Math.max(0, (0.35 + distortion * 0.08) * (1 - t))
}

function updateImpactLight(runtime: EmitterRuntime, active: boolean, localTime: number) {
  const light = runtime.light
  if (!light) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const strength = num(advanced.lightIntensity, num(advanced.bloomBoost, 0) * 1.8 + num(advanced.shakeStrength, 0) * 0.9)
  if (!active || strength <= 0) {
    light.intensity = THREE.MathUtils.lerp(light.intensity, 0, 0.18)
    return
  }
  const t = THREE.MathUtils.clamp(localTime / Math.max(0.05, emitter.duration), 0, 1)
  light.position.set(emitter.position[0], emitter.position[1] + Math.max(0.4, num(advanced.spawnRadius, 0.6) * 0.6), emitter.position[2])
  light.distance = num(advanced.lightRange, Math.max(3, num(advanced.spawnRadius, 1.2) * 3.2))
  light.color = new THREE.Color(advanced.lightColor ?? emitter.startColor)
  const flash = (1 - t) * strength * (1.05 + Math.sin(localTime * 20) * 0.08)
  light.intensity = THREE.MathUtils.lerp(light.intensity, flash, 0.32)
}

function updateLightning(runtime: EmitterRuntime, active: boolean, localTime: number) {
  const line = runtime.lightning
  const material = runtime.lightningMaterial
  if (!line || !material) return
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const style = advanced.style ?? emitter.style
  const wants = (style === 'streak' || style === 'spark' || style === 'shockwave') && (emitter.shape === 'line' || num(advanced.lightningBranches, 0) > 0 || num(advanced.turbulence, 0) > 1.2)
  if (!active || !wants) {
    line.visible = false
    return
  }
  const dir = new THREE.Vector3(...emitter.direction)
  if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0)
  dir.normalize()
  const branches = Math.max(2, Math.round(num(advanced.lightningBranches, 4)))
  const jitter = num(advanced.lightningJitter, 0.22 + num(advanced.turbulence, 0) * 0.05)
  const length = Math.max(1.2, num(advanced.beamLength, num(advanced.lineLength, 4.4)))
  const positions: number[] = []
  for (let b = 0; b < branches; b += 1) {
    const root = new THREE.Vector3(...emitter.position)
    const segments = 5 + Math.floor(Math.random() * 3)
    let prev = root.clone()
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments
      const next = root.clone().addScaledVector(dir, length * t)
      const side = new THREE.Vector3(dir.z, 0, -dir.x)
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0)
      side.normalize()
      const lift = new THREE.Vector3(0, 1, 0).cross(dir).normalize()
      next.addScaledVector(side, (Math.random() * 2 - 1) * jitter * length * (1 - t * 0.4))
      if (lift.lengthSq() > 0.0001) next.addScaledVector(lift, (Math.random() * 2 - 1) * jitter * length * 0.3)
      positions.push(prev.x, prev.y, prev.z, next.x, next.y, next.z)
      prev = next
      if (b > 0 && i === Math.floor(segments * 0.55)) {
        const childEnd = next.clone().add(side.clone().multiplyScalar((Math.random() * 2 - 1) * jitter * length * 1.4)).addScaledVector(dir, length * 0.18)
        positions.push(next.x, next.y, next.z, childEnd.x, childEnd.y, childEnd.z)
      }
    }
  }
  line.geometry.dispose()
  line.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  line.visible = true
  const t = THREE.MathUtils.clamp(localTime / Math.max(0.05, emitter.duration), 0, 1)
  material.color.copy(new THREE.Color(emitter.startColor).lerp(new THREE.Color(emitter.endColor), t * 0.6))
  material.opacity = Math.max(0, 0.95 * (1 - t * 0.8))
}

function spawn(runtime: EmitterRuntime) {
  const emitter = runtime.emitter
  const advanced = emitter as AdvancedEmitter
  const max = (runtime.positions.length / 3) | 0
  if (runtime.particles.length >= max) runtime.particles.shift()
  const p = new THREE.Vector3(...emitter.position)
  const shape = (advanced.shape ?? emitter.shape) as AdvancedShape
  const spawnRadius = num(advanced.spawnRadius, 1)
  const innerRadius = num(advanced.innerRadius, 0)

  if (shape === 'sphere') {
    const r = Math.cbrt(Math.random()) * 0.45
    p.add(randomUnit().multiplyScalar(r))
  } else if (shape === 'box') {
    p.x += (Math.random() - 0.5) * emitter.boxSize[0]
    p.y += (Math.random() - 0.5) * emitter.boxSize[1]
    p.z += (Math.random() - 0.5) * emitter.boxSize[2]
  } else if (shape === 'ring' || shape === 'vortex') {
    const angle = Math.random() * Math.PI * 2
    const radius = innerRadius + Math.random() * Math.max(0.001, spawnRadius - innerRadius)
    p.x += Math.cos(angle) * radius
    p.z += Math.sin(angle) * radius
  } else if (shape === 'shell') {
    p.add(randomUnit().multiplyScalar(spawnRadius))
  } else if (shape === 'arc') {
    const span = THREE.MathUtils.degToRad(num(advanced.arcDeg, 120))
    const angle = (Math.random() - 0.5) * span
    const radius = innerRadius + Math.random() * Math.max(0.001, spawnRadius - innerRadius)
    p.x += Math.cos(angle) * radius
    p.z += Math.sin(angle) * radius
  } else if (shape === 'line') {
    const dir = new THREE.Vector3(...emitter.direction)
    if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0)
    dir.normalize()
    p.addScaledVector(dir, (Math.random() - 0.5) * num(advanced.lineLength, 3))
  } else if (shape === 'spiral') {
    const t = Math.random()
    const turns = num(advanced.spiralTurns, 2)
    const angle = t * Math.PI * 2 * turns
    const radius = innerRadius + (spawnRadius - innerRadius) * t
    p.x += Math.cos(angle) * radius
    p.z += Math.sin(angle) * radius
  } else if (shape === 'groundCircle') {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * spawnRadius
    p.x += Math.cos(angle) * radius
    p.z += Math.sin(angle) * radius
  }

  const direction = new THREE.Vector3(...emitter.direction)
  if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0)
  direction.normalize()
  const spread = Math.sin(THREE.MathUtils.degToRad(emitter.spreadDeg * 0.5))
  direction.addScaledVector(randomUnit(), spread * Math.random()).normalize()
  const speed = emitter.speed * (1 + (Math.random() * 2 - 1) * emitter.speedRandom)
  runtime.particles.push({ position: p, velocity: direction.multiplyScalar(speed), age: 0, life: Math.max(0.04, emitter.lifetime * (1 + (Math.random() * 2 - 1) * emitter.lifetimeRandom)), spin: Math.random() * Math.PI * 2 })
}

function writeAttributes(runtime: EmitterRuntime) {
  const emitter = runtime.emitter
  const start = new THREE.Color(emitter.startColor)
  const end = new THREE.Color(emitter.endColor)
  const temp = new THREE.Color()
  const count = Math.min(runtime.particles.length, runtime.positions.length / 3)
  for (let i = 0; i < count; i += 1) {
    const p = runtime.particles[i]
    const t = Math.min(1, p.age / p.life)
    const idx = i * 3
    runtime.positions[idx] = p.position.x
    runtime.positions[idx + 1] = p.position.y
    runtime.positions[idx + 2] = p.position.z
    temp.copy(start).lerp(end, t)
    runtime.colors[idx] = temp.r
    runtime.colors[idx + 1] = temp.g
    runtime.colors[idx + 2] = temp.b
    runtime.sizes[i] = THREE.MathUtils.lerp(emitter.startSize, emitter.endSize, t)
    runtime.alphas[i] = THREE.MathUtils.lerp(emitter.startAlpha, emitter.endAlpha, t)
  }
  runtime.points.geometry.setDrawRange(0, count)
  for (const key of ['position', 'aColor', 'aSize', 'aAlpha']) {
    const attr = runtime.points.geometry.getAttribute(key) as THREE.BufferAttribute
    attr.needsUpdate = true
  }
}

function clearAttributes(runtime: EmitterRuntime) {
  runtime.points.geometry.setDrawRange(0, 0)
  for (const key of ['position', 'aColor', 'aSize', 'aAlpha']) {
    const attr = runtime.points.geometry.getAttribute(key) as THREE.BufferAttribute
    attr.needsUpdate = true
  }
}

function applyCameraShake(s: PreviewState, camera: THREE.PerspectiveCamera, basePosition: THREE.Vector3) {
  const amount = Math.min(0.62, s.shake * 0.05)
  if (amount <= 0.0001) return
  camera.position.set(basePosition.x + (Math.random() * 2 - 1) * amount, basePosition.y + (Math.random() * 2 - 1) * amount * 0.72, basePosition.z + (Math.random() * 2 - 1) * amount)
}

function styleIndex(style: AdvancedStyle): number {
  switch (style) {
    case 'soft': return 0
    case 'spark': return 1
    case 'square': return 2
    case 'ring': return 3
    case 'diamond': return 4
    case 'star': return 5
    case 'streak': return 6
    case 'flare': return 7
    case 'smoke': return 8
    case 'rune': return 9
    case 'shockwave': return 10
    case 'ember': return 11
    case 'mist': return 12
    default: return 0
  }
}

function styleNeedsGround(style: AdvancedStyle) {
  return style === 'smoke' || style === 'mist' || style === 'rune' || style === 'shockwave'
}

function makeDecalTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 128, 18, 128, 128, 118)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.3, 'rgba(180,180,180,0.55)')
  gradient.addColorStop(0.65, 'rgba(95,95,95,0.18)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(15,15,15,0.55)'
  ctx.lineWidth = 3
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(128, 128)
    ctx.lineTo(128 + Math.cos(a) * (60 + (i % 3) * 18), 128 + Math.sin(a) * (60 + ((i + 1) % 4) * 14))
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function randomUnit() {
  const z = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a))
}

function num(value: number | undefined, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }

function disposeRuntimes(s: { scene?: THREE.Scene; runtimes: EmitterRuntime[] }) {
  for (const runtime of s.runtimes) {
    s.scene?.remove(runtime.points)
    runtime.points.geometry.dispose()
    runtime.particleMaterial.dispose()
    if (runtime.beam) { s.scene?.remove(runtime.beam); runtime.beam.geometry.dispose(); runtime.beamMaterial?.dispose() }
    if (runtime.trail) { s.scene?.remove(runtime.trail); runtime.trail.geometry.dispose(); runtime.trailMaterial?.dispose() }
    if (runtime.decal) { s.scene?.remove(runtime.decal); runtime.decal.geometry.dispose(); runtime.decalMaterial?.map?.dispose(); runtime.decalMaterial?.dispose() }
    if (runtime.zone) { s.scene?.remove(runtime.zone); runtime.zone.geometry.dispose(); runtime.zoneMaterial?.dispose() }
    if (runtime.halo) { s.scene?.remove(runtime.halo); runtime.halo.geometry.dispose(); runtime.haloMaterial?.dispose() }
    if (runtime.light) { s.scene?.remove(runtime.light) }
    if (runtime.lightning) { s.scene?.remove(runtime.lightning); runtime.lightning.geometry.dispose(); runtime.lightningMaterial?.dispose() }
  }
  s.runtimes = []
}

export default VfxPreview
