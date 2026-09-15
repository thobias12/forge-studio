import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Boxes, Download, Hammer, PackagePlus, RefreshCcw, Shuffle, Sparkles } from 'lucide-react'
import { saveAsset } from '../lib/library'
import '../destruction.css'

type Template = 'urn' | 'crate' | 'barrel' | 'stone-pot' | 'chest'
type MaterialKind = 'ceramic' | 'wood' | 'stone'

type Settings = {
  name: string
  template: Template
  width: number
  height: number
  depth: number
  chunkCount: number
  health: number
  mass: number
  impulse: number
  bounce: number
  fragmentLifetime: number
  lootEnabled: boolean
  lootChance: number
  mainColor: string
  accentColor: string
}

type BuiltAsset = {
  root: THREE.Group
  intact: THREE.Group
  fragments: THREE.Group
  fragmentMeshes: THREE.Mesh[]
  materialKind: MaterialKind
}

type PreviewRuntime = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  asset?: BuiltAsset
  dust: THREE.Mesh[]
  pauseUntil: number
}

const TEMPLATE_LABELS: Record<Template, string> = {
  urn: 'Crypt Urn',
  crate: 'Wooden Crate',
  barrel: 'Barrel',
  'stone-pot': 'Stone Pot',
  chest: 'Small Chest',
}

const TEMPLATE_DEFAULTS: Record<Template, Pick<Settings, 'width' | 'height' | 'depth' | 'chunkCount' | 'health' | 'mass' | 'impulse' | 'bounce' | 'mainColor' | 'accentColor'>> = {
  urn: { width: 1.05, height: 1.55, depth: 1.05, chunkCount: 14, health: 18, mass: 2.2, impulse: 4.8, bounce: 0.24, mainColor: '#75685e', accentColor: '#9a8776' },
  crate: { width: 1.35, height: 1.2, depth: 1.35, chunkCount: 12, health: 28, mass: 4.2, impulse: 4.1, bounce: 0.16, mainColor: '#76543b', accentColor: '#3f2d22' },
  barrel: { width: 1.2, height: 1.55, depth: 1.2, chunkCount: 16, health: 30, mass: 4.8, impulse: 4.4, bounce: 0.18, mainColor: '#6f4c34', accentColor: '#3c4143' },
  'stone-pot': { width: 1.25, height: 1.05, depth: 1.25, chunkCount: 15, health: 24, mass: 4.4, impulse: 4.3, bounce: 0.2, mainColor: '#626a6c', accentColor: '#879092' },
  chest: { width: 1.65, height: 1.15, depth: 1.05, chunkCount: 14, health: 34, mass: 5.2, impulse: 3.9, bounce: 0.14, mainColor: '#684830', accentColor: '#444a4c' },
}

const DEFAULTS: Settings = {
  name: 'Crypt Urn',
  template: 'urn',
  ...TEMPLATE_DEFAULTS.urn,
  fragmentLifetime: 7,
  lootEnabled: true,
  lootChance: 35,
}

export default function DestructionLab() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<PreviewRuntime>()
  const settingsRef = useRef(DEFAULTS)
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [broken, setBroken] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const [impactPulse, setImpactPulse] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Choose a template, tune the break, then smash it.')
  settingsRef.current = settings

  const materialKind = useMemo(() => materialKindFor(settings.template), [settings.template])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x070b0f)
    scene.fog = new THREE.Fog(0x070b0f, 7, 18)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80)
    camera.position.set(3.3, 2.25, 4.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.7, 0)
    controls.minDistance = 2.2
    controls.maxDistance = 10
    controls.maxPolarAngle = Math.PI * 0.49

    scene.add(new THREE.HemisphereLight(0xbad8eb, 0x121516, 1.8))
    const key = new THREE.DirectionalLight(0xffe0bd, 3.2)
    key.position.set(3.5, 6, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x6e9fc2, 1.65)
    rim.position.set(-4, 3, -3)
    scene.add(rim)

    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.92, metalness: 0.02 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const grid = new THREE.GridHelper(8, 20, 0x344553, 0x1b2730)
    grid.position.y = 0.004
    scene.add(grid)

    const runtime: PreviewRuntime = { scene, camera, controls, dust: [], pauseUntil: 0 }
    runtimeRef.current = runtime

    const resize = () => {
      const rect = mount.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let raf = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.04, Math.max(0, (now - previous) / 1000))
      previous = now
      controls.update()

      const asset = runtime.asset
      if (asset?.fragments.visible && now >= runtime.pauseUntil) {
        for (const mesh of asset.fragmentMeshes) {
          const velocity = mesh.userData.velocity as THREE.Vector3 | undefined
          const angular = mesh.userData.angularVelocity as THREE.Vector3 | undefined
          if (!velocity || !angular) continue
          velocity.y -= 9.8 * dt
          mesh.position.addScaledVector(velocity, dt)
          mesh.rotation.x += angular.x * dt
          mesh.rotation.y += angular.y * dt
          mesh.rotation.z += angular.z * dt
          const radius = Number(mesh.userData.floorRadius ?? 0.08)
          if (mesh.position.y < radius && velocity.y < 0) {
            mesh.position.y = radius
            velocity.y *= -settingsRef.current.bounce
            velocity.x *= 0.78
            velocity.z *= 0.78
            angular.multiplyScalar(0.84)
          }
        }
      }

      for (let index = runtime.dust.length - 1; index >= 0; index -= 1) {
        const particle = runtime.dust[index]
        const velocity = particle.userData.velocity as THREE.Vector3
        const life = Number(particle.userData.life ?? 0) - dt
        particle.userData.life = life
        velocity.y -= 4.2 * dt
        particle.position.addScaledVector(velocity, dt)
        particle.rotation.x += dt * 3
        particle.rotation.y += dt * 2.2
        const material = particle.material as THREE.MeshBasicMaterial
        material.opacity = Math.max(0, life / 0.62) * 0.36
        if (life <= 0) {
          particle.removeFromParent()
          particle.geometry.dispose()
          material.dispose()
          runtime.dust.splice(index, 1)
        }
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      if (runtime.asset) disposeObject(runtime.asset.root)
      for (const dust of runtime.dust) disposeObject(dust)
      renderer.dispose()
      renderer.domElement.remove()
      runtimeRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    if (runtime.asset) {
      runtime.asset.root.removeFromParent()
      disposeObject(runtime.asset.root)
    }
    for (const dust of runtime.dust) disposeObject(dust)
    runtime.dust.length = 0
    const asset = createDestructibleAsset(settings)
    runtime.asset = asset
    runtime.scene.add(asset.root)
    runtime.controls.target.set(0, Math.max(0.5, settings.height * 0.46), 0)
    setBroken(false)
  }, [settings, resetToken])

  const patch = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }))

  const selectTemplate = (template: Template) => {
    const preset = TEMPLATE_DEFAULTS[template]
    setSettings((current) => ({ ...current, template, name: TEMPLATE_LABELS[template], ...preset }))
    setStatus(`${TEMPLATE_LABELS[template]} loaded. Double-click the preview or press Smash.`)
  }

  const smash = () => {
    const runtime = runtimeRef.current
    const asset = runtime?.asset
    if (!runtime || !asset || asset.fragments.visible) return
    asset.intact.visible = false
    asset.fragments.visible = true
    asset.root.updateMatrixWorld(true)
    const center = new THREE.Vector3(0, settings.height * 0.48, 0)
    const random = seededRandom(hashString(`${settings.name}-${Date.now()}`))
    for (const mesh of asset.fragmentMeshes) {
      const outward = mesh.position.clone().sub(center)
      outward.y = Math.max(0.18, outward.y * 0.35 + 0.25)
      if (outward.lengthSq() < 0.001) outward.set(random() - 0.5, 0.3, random() - 0.5)
      outward.normalize()
      const power = settings.impulse * (0.62 + random() * 0.72)
      mesh.userData.velocity = outward.multiplyScalar(power).add(new THREE.Vector3((random() - 0.5) * 1.9, 1.2 + random() * 2.1, (random() - 0.5) * 1.9))
      mesh.userData.angularVelocity = new THREE.Vector3((random() - 0.5) * 8, (random() - 0.5) * 9, (random() - 0.5) * 8)
    }
    runtime.pauseUntil = performance.now() + 42
    spawnDust(runtime, settings, asset.materialKind)
    playBreakSound(asset.materialKind)
    setBroken(true)
    setImpactPulse((value) => value + 1)
    setStatus(`${settings.name} shattered into ${asset.fragmentMeshes.length} prepared chunks.`)
  }

  const reset = () => {
    setResetToken((value) => value + 1)
    setStatus('Reset. Ready for another hit.')
  }

  const randomize = () => {
    const base = TEMPLATE_DEFAULTS[settings.template]
    setSettings((current) => ({
      ...current,
      width: clamp(base.width * (0.85 + Math.random() * 0.34), 0.65, 2.4),
      height: clamp(base.height * (0.84 + Math.random() * 0.38), 0.65, 2.7),
      depth: clamp(base.depth * (0.86 + Math.random() * 0.3), 0.65, 2.2),
      chunkCount: Math.round(clamp(base.chunkCount + (Math.random() - 0.5) * 8, 6, 28)),
      impulse: clamp(base.impulse * (0.85 + Math.random() * 0.32), 2.4, 7.5),
    }))
    setStatus('Generated a new destructible variant.')
  }

  const exportGlb = async (saveToLibrary: boolean) => {
    setBusy(true)
    setStatus(saveToLibrary ? 'Building destructible GLB for the Asset Library…' : 'Building destructible GLB…')
    try {
      const asset = createDestructibleAsset(settings)
      asset.intact.visible = true
      asset.fragments.visible = false
      asset.root.userData.forgeDestructible = buildMetadata(settings, asset.fragmentMeshes)
      const blob = await exportBinary(asset.root)
      disposeObject(asset.root)
      if (saveToLibrary) {
        await saveAsset({
          name: settings.name,
          category: 'props',
          kind: 'glb',
          mime: 'model/gltf-binary',
          tags: ['destructible', settings.template, materialKind],
          source: 'Forge Destruction Lab',
          blob,
        })
        setStatus(`${settings.name} saved to the Shared Asset Library as a destructible GLB.`)
      } else {
        downloadBlob(blob, `${slug(settings.name)}.destructible.glb`)
        setStatus(`${settings.name} exported with intact mesh, fragment group and break metadata.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not export the destructible GLB.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="destruction-lab">
      <aside className="destruction-panel destruction-left">
        <div className="destruction-heading"><Hammer size={16} /><span>DESTRUCTION LAB</span></div>
        <p className="destruction-copy">Build pre-fractured game props with fast runtime break swaps.</p>

        <label className="destruction-label">Template</label>
        <div className="destruction-template-grid">
          {(Object.keys(TEMPLATE_LABELS) as Template[]).map((template) => (
            <button key={template} className={settings.template === template ? 'active' : ''} onClick={() => selectTemplate(template)}>
              <span className={`destruction-template-icon ${template}`}><Boxes size={18} /></span>
              <strong>{TEMPLATE_LABELS[template]}</strong>
            </button>
          ))}
        </div>

        <div className="destruction-section">
          <label className="destruction-label">Asset name</label>
          <input className="destruction-input" value={settings.name} onChange={(event) => patch('name', event.target.value)} />
        </div>

        <div className="destruction-section">
          <div className="destruction-section-title">SHAPE</div>
          <Range label="Width" value={settings.width} min={0.6} max={2.5} step={0.05} onChange={(value) => patch('width', value)} />
          <Range label="Height" value={settings.height} min={0.6} max={2.8} step={0.05} onChange={(value) => patch('height', value)} />
          <Range label="Depth" value={settings.depth} min={0.6} max={2.3} step={0.05} onChange={(value) => patch('depth', value)} />
        </div>

        <div className="destruction-section">
          <div className="destruction-section-title">MATERIAL</div>
          <div className="destruction-color-row"><label>Main</label><input type="color" value={settings.mainColor} onChange={(event) => patch('mainColor', event.target.value)} /><span>{settings.mainColor}</span></div>
          <div className="destruction-color-row"><label>Accent</label><input type="color" value={settings.accentColor} onChange={(event) => patch('accentColor', event.target.value)} /><span>{settings.accentColor}</span></div>
        </div>
      </aside>

      <main className="destruction-workspace">
        <header className="destruction-toolbar">
          <div><span className="eyebrow">BREAK PREVIEW</span><strong>{settings.name}</strong></div>
          <div className="destruction-toolbar-actions">
            <button onClick={randomize}><Shuffle size={14} /> Variant</button>
            <button onClick={reset}><RefreshCcw size={14} /> Reset</button>
            <button className="smash" disabled={broken} onClick={smash}><Hammer size={15} /> {broken ? 'Broken' : 'Smash'}</button>
          </div>
        </header>

        <div className={`destruction-preview impact-${impactPulse % 2}`} onDoubleClick={smash}>
          <div ref={mountRef} className="destruction-canvas" />
          <div className="destruction-preview-hint"><strong>DOUBLE-CLICK TO SMASH</strong><span>Drag to orbit · wheel to zoom · Reset to replay</span></div>
          <div className="destruction-runtime-badge"><i className={broken ? 'broken' : ''} />{broken ? 'FRACTURE ACTIVE' : 'INTACT STATE'}</div>
        </div>

        <div className="destruction-bottom-bar">
          <div className="destruction-status"><Sparkles size={13} /><span>{status}</span></div>
          <div className="destruction-export-actions">
            <button disabled={busy} onClick={() => void exportGlb(true)}><PackagePlus size={14} /> Save to Library</button>
            <button className="primary" disabled={busy} onClick={() => void exportGlb(false)}><Download size={14} /> {busy ? 'Building…' : 'Export GLB'}</button>
          </div>
        </div>
      </main>

      <aside className="destruction-panel destruction-right">
        <div className="destruction-heading"><Sparkles size={16} /><span>BREAK FEEL</span></div>

        <div className="destruction-section first">
          <div className="destruction-section-title">FRACTURE</div>
          <Range label="Prepared chunks" value={settings.chunkCount} min={6} max={28} step={1} digits={0} onChange={(value) => patch('chunkCount', Math.round(value))} />
          <Range label="Break health" value={settings.health} min={1} max={100} step={1} digits={0} onChange={(value) => patch('health', Math.round(value))} />
          <Range label="Break impulse" value={settings.impulse} min={2} max={8} step={0.1} onChange={(value) => patch('impulse', value)} />
        </div>

        <div className="destruction-section">
          <div className="destruction-section-title">PHYSICS</div>
          <Range label="Total mass" value={settings.mass} min={0.5} max={12} step={0.1} onChange={(value) => patch('mass', value)} />
          <Range label="Bounce" value={settings.bounce} min={0} max={0.7} step={0.01} onChange={(value) => patch('bounce', value)} />
          <Range label="Fragment lifetime" value={settings.fragmentLifetime} min={1} max={20} step={0.5} suffix="s" onChange={(value) => patch('fragmentLifetime', value)} />
        </div>

        <div className="destruction-section">
          <div className="destruction-section-title">GAMEPLAY</div>
          <label className="destruction-check"><input type="checkbox" checked={settings.lootEnabled} onChange={(event) => patch('lootEnabled', event.target.checked)} /><span><strong>Loot socket</strong><em>Spawn loot from the object center on authoritative break.</em></span></label>
          {settings.lootEnabled && <Range label="Loot chance" value={settings.lootChance} min={0} max={100} step={1} digits={0} suffix="%" onChange={(value) => patch('lootChance', Math.round(value))} />}
        </div>

        <div className="destruction-info-card">
          <strong>Runtime package</strong>
          <span>Intact mesh + hidden pre-fractured group</span>
          <span>Simple collider + health + mass metadata</span>
          <span>Directional impulse multiplier</span>
          <span>Loot socket and deterministic chunk names</span>
          <em>Only the break event needs game/server authority. Chunk movement can stay cosmetic.</em>
        </div>
      </aside>
    </div>
  )
}

function Range({ label, value, min, max, step, digits = 2, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step: number; digits?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="destruction-range"><div><span>{label}</span><strong>{value.toFixed(digits)}{suffix}</strong></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function createDestructibleAsset(settings: Settings): BuiltAsset {
  const root = new THREE.Group()
  root.name = `Destructible_${slug(settings.name)}`
  const intact = new THREE.Group()
  intact.name = 'Intact'
  const fragments = new THREE.Group()
  fragments.name = 'Fragments'
  fragments.visible = false
  root.add(intact, fragments)

  const main = materialFor(settings.mainColor, settings.template)
  const accent = materialFor(settings.accentColor, settings.template === 'barrel' || settings.template === 'chest' ? 'metal' : settings.template)
  const fragmentMeshes: THREE.Mesh[] = []

  if (settings.template === 'urn' || settings.template === 'stone-pot') {
    buildPotIntact(intact, settings, main, accent)
    buildPotFragments(fragments, fragmentMeshes, settings, main)
  } else if (settings.template === 'crate') {
    buildCrateIntact(intact, settings, main, accent)
    buildBoxFragments(fragments, fragmentMeshes, settings, main, 'Plank')
  } else if (settings.template === 'barrel') {
    buildBarrelIntact(intact, settings, main, accent)
    buildBarrelFragments(fragments, fragmentMeshes, settings, main, accent)
  } else {
    buildChestIntact(intact, settings, main, accent)
    buildBoxFragments(fragments, fragmentMeshes, settings, main, 'ChestPiece')
  }

  for (const mesh of fragmentMeshes) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.mass = settings.mass / Math.max(1, fragmentMeshes.length)
    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    mesh.userData.floorRadius = Math.max(0.045, Math.min(size.x, size.y, size.z) * 0.32)
  }
  intact.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true } })

  root.userData.forgeDestructible = buildMetadata(settings, fragmentMeshes)
  root.userData.collider = { type: 'box', size: [settings.width * 0.86, settings.height, settings.depth * 0.86], center: [0, settings.height / 2, 0] }
  root.userData.lootSocket = { name: 'LootSocket', position: [0, Math.min(settings.height * 0.55, 0.75), 0] }
  return { root, intact, fragments, fragmentMeshes, materialKind: materialKindFor(settings.template) }
}

function buildPotIntact(group: THREE.Group, settings: Settings, main: THREE.Material, accent: THREE.Material) {
  const w = settings.width
  const h = settings.height
  const pot = settings.template === 'stone-pot'
  const points = pot
    ? [[0.2, 0], [0.48, 0.06], [0.56, 0.24], [0.6, 0.5], [0.54, 0.73], [0.42, 0.9], [0.46, 1]]
    : [[0.18, 0], [0.38, 0.05], [0.48, 0.22], [0.52, 0.48], [0.45, 0.72], [0.28, 0.84], [0.25, 0.97], [0.34, 1]]
  const profile = points.map(([x, y]) => new THREE.Vector2(x * w, y * h))
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, pot ? 18 : 22), main)
  body.scale.z = settings.depth / settings.width
  group.add(body)
  const lip = new THREE.Mesh(new THREE.TorusGeometry((pot ? 0.46 : 0.34) * w, 0.055 * w, 7, 20), accent)
  lip.rotation.x = Math.PI / 2
  lip.position.y = h * 0.99
  lip.scale.z = settings.depth / settings.width
  group.add(lip)
  if (!pot) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.47 * w, 0.035 * w, 6, 20), accent)
    band.rotation.x = Math.PI / 2
    band.position.y = h * 0.52
    band.scale.z = settings.depth / settings.width
    group.add(band)
  }
}

function buildPotFragments(group: THREE.Group, output: THREE.Mesh[], settings: Settings, material: THREE.Material) {
  const count = Math.max(6, settings.chunkCount)
  const bands = Math.max(2, Math.round(Math.sqrt(count * 0.55)))
  const sectors = Math.max(3, Math.ceil(count / bands))
  let made = 0
  for (let band = 0; band < bands && made < count; band += 1) {
    const y0 = band / bands
    const y1 = (band + 1) / bands
    const bandH = settings.height / bands * 0.92
    const centerY = (y0 + y1) * 0.5 * settings.height
    const silhouette = settings.template === 'stone-pot' ? 0.52 + Math.sin((y0 + y1) * Math.PI) * 0.07 : 0.34 + Math.sin((y0 + y1) * Math.PI) * 0.16
    for (let sector = 0; sector < sectors && made < count; sector += 1) {
      const angle = sector / sectors * Math.PI * 2
      const nextAngle = (sector + 0.84) / sectors * Math.PI * 2
      const radiusX = silhouette * settings.width
      const radiusZ = silhouette * settings.depth
      const arc = Math.max(0.12, (nextAngle - angle) * Math.max(radiusX, radiusZ) * 0.72)
      const piece = new THREE.Mesh(new THREE.BoxGeometry(arc, bandH, Math.max(0.07, settings.width * 0.07)), material)
      const mid = (angle + nextAngle) / 2
      piece.position.set(Math.cos(mid) * radiusX, centerY, Math.sin(mid) * radiusZ)
      piece.rotation.y = -mid + Math.PI / 2
      piece.rotation.z = (band % 2 ? 1 : -1) * 0.035
      piece.name = `Shard_${String(made + 1).padStart(2, '0')}`
      group.add(piece)
      output.push(piece)
      made += 1
    }
  }
}

function buildCrateIntact(group: THREE.Group, settings: Settings, main: THREE.Material, accent: THREE.Material) {
  const core = new THREE.Mesh(new THREE.BoxGeometry(settings.width, settings.height, settings.depth), main)
  core.position.y = settings.height / 2
  group.add(core)
  const t = Math.max(0.055, settings.width * 0.055)
  for (const z of [-settings.depth / 2 - t * 0.15, settings.depth / 2 + t * 0.15]) {
    for (const x of [-settings.width * 0.38, settings.width * 0.38]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(t, settings.height * 0.92, t * 1.5), accent)
      rail.position.set(x, settings.height / 2, z)
      group.add(rail)
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(settings.width * 0.95, t, t * 1.5), accent)
    cross.position.set(0, settings.height / 2, z)
    cross.rotation.z = z > 0 ? 0.55 : -0.55
    group.add(cross)
  }
}

function buildBarrelIntact(group: THREE.Group, settings: Settings, main: THREE.Material, accent: THREE.Material) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(settings.width * 0.45, settings.width * 0.4, settings.height, 16, 3), main)
  body.position.y = settings.height / 2
  body.scale.z = settings.depth / settings.width
  group.add(body)
  for (const y of [settings.height * 0.18, settings.height * 0.5, settings.height * 0.82]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(settings.width * 0.455, Math.max(0.025, settings.width * 0.027), 6, 20), accent)
    band.rotation.x = Math.PI / 2
    band.position.y = y
    band.scale.z = settings.depth / settings.width
    group.add(band)
  }
}

function buildBarrelFragments(group: THREE.Group, output: THREE.Mesh[], settings: Settings, wood: THREE.Material, metal: THREE.Material) {
  const staveCount = Math.max(6, settings.chunkCount - 3)
  const radiusX = settings.width * 0.42
  const radiusZ = settings.depth * 0.42
  for (let index = 0; index < staveCount; index += 1) {
    const angle = index / staveCount * Math.PI * 2
    const stave = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.11, settings.width * 0.18), settings.height * (0.68 + (index % 3) * 0.08), Math.max(0.065, settings.width * 0.065)), wood)
    stave.position.set(Math.cos(angle) * radiusX, settings.height * 0.5, Math.sin(angle) * radiusZ)
    stave.rotation.y = -angle + Math.PI / 2
    stave.rotation.z = (index % 2 ? 1 : -1) * 0.035
    stave.name = `Stave_${String(index + 1).padStart(2, '0')}`
    group.add(stave)
    output.push(stave)
  }
  for (let index = 0; index < 3 && output.length < settings.chunkCount; index += 1) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(settings.width * 0.43, settings.width * 0.025, 5, 9, Math.PI * 1.25), metal)
    band.rotation.x = Math.PI / 2
    band.rotation.z = index * 1.2
    band.position.y = settings.height * (0.2 + index * 0.3)
    band.scale.z = settings.depth / settings.width
    band.name = `Band_${index + 1}`
    group.add(band)
    output.push(band)
  }
}

function buildChestIntact(group: THREE.Group, settings: Settings, wood: THREE.Material, metal: THREE.Material) {
  const lowerH = settings.height * 0.65
  const base = new THREE.Mesh(new THREE.BoxGeometry(settings.width, lowerH, settings.depth), wood)
  base.position.y = lowerH / 2
  group.add(base)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(settings.width * 1.02, settings.height * 0.28, settings.depth * 1.02), wood)
  lid.position.y = lowerH + settings.height * 0.14
  group.add(lid)
  const lock = new THREE.Mesh(new THREE.BoxGeometry(settings.width * 0.12, settings.height * 0.24, 0.08), metal)
  lock.position.set(0, settings.height * 0.58, settings.depth * 0.54)
  group.add(lock)
  for (const x of [-settings.width * 0.38, settings.width * 0.38]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(settings.width * 0.06, settings.height * 0.92, settings.depth * 1.04), metal)
    strap.position.set(x, settings.height * 0.46, 0)
    group.add(strap)
  }
}

function buildBoxFragments(group: THREE.Group, output: THREE.Mesh[], settings: Settings, material: THREE.Material, prefix: string) {
  const count = Math.max(6, settings.chunkCount)
  const random = seededRandom(hashString(`${settings.template}-${count}`))
  for (let index = 0; index < count; index += 1) {
    const side = index % 6
    const sx = settings.width * (0.18 + random() * 0.28)
    const sy = settings.height * (0.16 + random() * 0.28)
    const sz = settings.depth * (0.14 + random() * 0.3)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    const edgeX = (random() - 0.5) * settings.width * 0.75
    const edgeZ = (random() - 0.5) * settings.depth * 0.75
    mesh.position.set(edgeX, sy / 2 + random() * Math.max(0.05, settings.height - sy), edgeZ)
    if (side === 0) mesh.position.x = -settings.width * 0.38
    if (side === 1) mesh.position.x = settings.width * 0.38
    if (side === 2) mesh.position.z = -settings.depth * 0.38
    if (side === 3) mesh.position.z = settings.depth * 0.38
    if (side === 4) mesh.position.y = settings.height * 0.76
    mesh.rotation.set((random() - 0.5) * 0.15, (random() - 0.5) * 0.18, (random() - 0.5) * 0.12)
    mesh.name = `${prefix}_${String(index + 1).padStart(2, '0')}`
    group.add(mesh)
    output.push(mesh)
  }
}

function buildMetadata(settings: Settings, fragments: THREE.Mesh[]) {
  return {
    version: 1,
    type: 'forge-destructible',
    template: settings.template,
    health: settings.health,
    mass: settings.mass,
    impulse: settings.impulse,
    bounce: settings.bounce,
    fragmentLifetime: settings.fragmentLifetime,
    intactGroup: 'Intact',
    fragmentsGroup: 'Fragments',
    chunks: fragments.map((mesh, index) => ({ name: mesh.name, mass: settings.mass / Math.max(1, fragments.length), order: index })),
    loot: { enabled: settings.lootEnabled, chance: settings.lootChance / 100, socket: 'LootSocket' },
    networking: { authoritativeBreak: true, cosmeticFragments: true },
  }
}

function materialFor(color: string, kind: Template | 'metal') {
  if (kind === 'metal') return new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.62, flatShading: true })
  const wood = kind === 'crate' || kind === 'barrel' || kind === 'chest'
  const ceramic = kind === 'urn'
  return new THREE.MeshStandardMaterial({ color, roughness: wood ? 0.84 : ceramic ? 0.76 : 0.9, metalness: 0.015, flatShading: true, side: THREE.DoubleSide })
}

function materialKindFor(template: Template): MaterialKind {
  if (template === 'crate' || template === 'barrel' || template === 'chest') return 'wood'
  if (template === 'stone-pot') return 'stone'
  return 'ceramic'
}

function spawnDust(runtime: PreviewRuntime, settings: Settings, kind: MaterialKind) {
  const color = new THREE.Color(kind === 'wood' ? 0x8b684d : kind === 'stone' ? 0x899195 : 0x9b8776)
  const random = seededRandom(hashString(`${settings.name}-${performance.now()}`))
  for (let index = 0; index < 28; index += 1) {
    const size = 0.025 + random() * 0.065
    const particle = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }))
    particle.position.set((random() - 0.5) * settings.width * 0.5, settings.height * (0.25 + random() * 0.45), (random() - 0.5) * settings.depth * 0.5)
    particle.userData.velocity = new THREE.Vector3((random() - 0.5) * 2.8, 0.8 + random() * 2.4, (random() - 0.5) * 2.8)
    particle.userData.life = 0.38 + random() * 0.26
    runtime.scene.add(particle)
    runtime.dust.push(particle)
  }
}

function playBreakSound(kind: MaterialKind) {
  try {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    const ctx = new Context()
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
    gain.gain.setValueAtTime(0.26, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(now)

    const thud = ctx.createOscillator()
    const thudGain = ctx.createGain()
    thud.type = 'triangle'
    thud.frequency.setValueAtTime(kind === 'wood' ? 120 : 92, now)
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.09)
    thudGain.gain.setValueAtTime(0.13, now)
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
    thud.connect(thudGain).connect(ctx.destination)
    thud.start(now)
    thud.stop(now + 0.12)
    window.setTimeout(() => void ctx.close(), 450)
  } catch { /* audio is cosmetic */ }
}

function exportBinary(root: THREE.Object3D) {
  return new Promise<Blob>((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(root, (result) => {
      if (!(result instanceof ArrayBuffer)) { reject(new Error('Forge expected binary GLB output.')); return }
      resolve(new Blob([result], { type: 'model/gltf-binary' }))
    }, (error) => reject(error), { binary: true, onlyVisible: false, trs: true })
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) material.dispose()
  })
  root.removeFromParent()
}

function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'destructible' }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
function hashString(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619); return hash >>> 0 }
function seededRandom(seed: number) { let state = seed >>> 0; return () => { state += 0x6D2B79F5; let next = state; next = Math.imul(next ^ next >>> 15, next | 1); next ^= next + Math.imul(next ^ next >>> 7, next | 61); return ((next ^ next >>> 14) >>> 0) / 4294967296 } }
