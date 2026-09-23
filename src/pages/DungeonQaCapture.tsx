import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {
  addDungeonMasonryV3,
  dungeonWorldBoundsV3,
  type DungeonV3FlickerLight,
} from '../lib/dungeonForgeV3'
import {
  dungeonAtmosphere,
  dungeonLightingProfile,
} from '../lib/dungeonAtmosphere'
import type { DungeonWithProps } from '../lib/dungeonProps'
import { FORGE_BUILD, FORGE_VERSION } from '../version'

type DungeonRenderMetrics = {
  renderMs: {
    average: number
    p95: number
    max: number
    samples: number
  }
  drawCalls: number
  triangles: number
  points: number
  lines: number
  geometries: number
  textures: number
  objects: number
  meshes: number
  instancedMeshes: number
  instances: number
  lights: number
  shadowLights: number
  materials: number
}

type DungeonVisualMetrics = {
  averageLuminance: number
  p10Luminance: number
  p50Luminance: number
  p90Luminance: number
  contrastRange: number
  darkPixelRatio: number
  highlightPixelRatio: number
  warmPixelRatio: number
  cyanPixelRatio: number
}

type QaView = {
  id: string
  label: string
  detail: string
  image: string
  metrics: DungeonRenderMetrics
  visual: DungeonVisualMetrics
}

type DungeonRenderSummary = {
  maxDrawCalls: number
  maxTriangles: number
  maxGeometries: number
  maxTextures: number
  maxLights: number
  maxShadowLights: number
  slowestAverageRenderMs: number
  slowestP95RenderMs: number
}

type QaMetadata = {
  format: 'forge-dungeon-visual-qa'
  version: 2
  forgeVersion: string
  forgeBuild: string
  dungeonName: string
  dungeonTheme: string
  seed: number
  views: string[]
  renderMetrics: Record<string, DungeonRenderMetrics>
  visualMetrics: Record<string, DungeonVisualMetrics>
  renderSummary: DungeonRenderSummary
  errors: string[]
}

type QaWindow = Window & {
  __FORGE_DUNGEON_QA_READY__?: boolean
  __FORGE_DUNGEON_QA__?: QaMetadata
}

const VIEW_WIDTH = 960
const VIEW_HEIGHT = 640
const RENDER_SAMPLE_COUNT = 24

export default function DungeonQaCapture() {
  const [views, setViews] = useState<QaView[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const qaWindow = window as QaWindow
      qaWindow.__FORGE_DUNGEON_QA_READY__ = false
      const errors: string[] = []

      try {
        const source = new URL(
          './projects/skillbound/dungeons/hollow-vault.dungeon.json',
          window.location.href,
        )
        const response = await fetch(source)
        if (!response.ok) {
          throw new Error(
            `Could not load Hollow Vault QA fixture: HTTP ${response.status}`,
          )
        }

        const dungeon = await response.json() as DungeonWithProps
        const nextViews = await renderDungeonQaViews(dungeon)

        if (cancelled) return
        setViews(nextViews)
        qaWindow.__FORGE_DUNGEON_QA__ = {
          format: 'forge-dungeon-visual-qa',
          version: 2,
          forgeVersion: FORGE_VERSION,
          forgeBuild: FORGE_BUILD,
          dungeonName: dungeon.name,
          dungeonTheme: dungeon.theme,
          seed: dungeon.seed,
          views: nextViews.map((view) => view.id),
          renderMetrics: Object.fromEntries(
            nextViews.map((view) => [
              view.id,
              view.metrics,
            ]),
          ),
          visualMetrics: Object.fromEntries(
            nextViews.map((view) => [
              view.id,
              view.visual,
            ]),
          ),
          renderSummary: summarizeRenderMetrics(nextViews),
          errors,
        }
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : String(reason)
        errors.push(message)
        if (!cancelled) setError(message)
        qaWindow.__FORGE_DUNGEON_QA__ = {
          format: 'forge-dungeon-visual-qa',
          version: 2,
          forgeVersion: FORGE_VERSION,
          forgeBuild: FORGE_BUILD,
          dungeonName: 'Hollow Vault',
          dungeonTheme: 'crypt',
          seed: 0,
          views: [],
          renderMetrics: {},
          visualMetrics: {},
          renderSummary: {
            maxDrawCalls: 0,
            maxTriangles: 0,
            maxGeometries: 0,
            maxTextures: 0,
            maxLights: 0,
            maxShadowLights: 0,
            slowestAverageRenderMs: 0,
            slowestP95RenderMs: 0,
          },
          errors,
        }
      } finally {
        if (!cancelled) {
          qaWindow.__FORGE_DUNGEON_QA_READY__ = true
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>FORGE VISUAL REGRESSION</div>
          <h1 style={titleStyle}>Dungeon Visual QA</h1>
          <p style={subtitleStyle}>
            Fixed Hollow Vault views rendered from the same Dungeon V3 art pipeline
            used by Dungeon Forge and Skillbound runtime.
          </p>
        </div>
        <div style={buildStyle}>
          <strong>Forge v{FORGE_VERSION}</strong>
          <span>{FORGE_BUILD}</span>
        </div>
      </header>

      {error && (
        <section style={errorStyle}>
          <strong>QA render failed</strong>
          <span>{error}</span>
        </section>
      )}

      {!error && views.length === 0 && (
        <section style={loadingStyle}>
          Rendering deterministic dungeon QA views…
        </section>
      )}

      <section style={gridStyle}>
        {views.map((view) => (
          <article
            key={view.id}
            data-dungeon-qa-view={view.id}
            style={cardStyle}
          >
            <div style={cardHeadingStyle}>
              <div style={cardTitleStyle}>
                <strong>{view.label}</strong>
                <span>{view.detail}</span>
              </div>
              <code>{view.id}</code>
            </div>
            <img
              src={view.image}
              alt={view.label}
              style={imageStyle}
            />
            <div style={metricsStyle}>
              <span><b>{view.metrics.drawCalls}</b> calls</span>
              <span><b>{formatNumber(view.metrics.triangles)}</b> tris</span>
              <span><b>{view.metrics.lights}</b> lights</span>
              <span><b>{view.metrics.geometries}</b> geo</span>
              <span><b>{view.metrics.textures}</b> tex</span>
              <span>
                <b>{view.metrics.renderMs.average.toFixed(1)} ms</b> avg
              </span>
              <span>
                <b>{view.metrics.renderMs.p95.toFixed(1)} ms</b> p95
              </span>
              <span>
                <b>{view.visual.averageLuminance.toFixed(3)}</b> luma
              </span>
              <span>
                <b>{view.visual.contrastRange.toFixed(3)}</b> contrast
              </span>
              <span>
                <b>{formatPercent(view.visual.warmPixelRatio)}</b> warm
              </span>
              <span>
                <b>{formatPercent(view.visual.cyanPixelRatio)}</b> cyan
              </span>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

async function renderDungeonQaViews(
  dungeon: DungeonWithProps,
): Promise<QaView[]> {
  const rooms = new Map(
    dungeon.rooms.map((room) => [room.id, room]),
  )
  const crossroads = rooms.get('hv-crossroads')
  const reliquary = rooms.get('hv-reliquary')
  const ossuary = rooms.get('hv-ossuary')
  const sanctum = rooms.get('hv-sanctum')

  if (!crossroads || !reliquary || !ossuary || !sanctum) {
    throw new Error(
      'Hollow Vault QA fixture is missing one or more canonical rooms.',
    )
  }

  const corridorTarget = {
    x: (crossroads.x + ossuary.x) / 2,
    z: (crossroads.z + ossuary.z) / 2,
  }

  const specs: Array<{
    id: string
    label: string
    detail: string
    target?: { x: number; z: number }
    room?: typeof crossroads
    overview?: boolean
    distance?: number
  }> = [
    {
      id: 'overview',
      label: 'Full Dungeon Overview',
      detail: 'Whole Hollow Vault · authoritative ARPG renderer',
      overview: true,
    },
    {
      id: 'crossroads',
      label: 'Drowned Crossroads',
      detail: 'Combat room · floor material + warm/cold hierarchy',
      room: crossroads,
    },
    {
      id: 'corridor',
      label: 'Crossroads → Ossuary',
      detail: 'Connector · wall silhouette + threshold rhythm',
      target: corridorTarget,
      distance: 27,
    },
    {
      id: 'reliquary',
      label: 'Sunken Reliquary',
      detail: 'Treasure room · staged focal composition',
      room: reliquary,
    },
    {
      id: 'ossuary',
      label: 'Ossuary Hall',
      detail: 'Elite room · architecture + cyan/warm balance',
      room: ossuary,
    },
    {
      id: 'sanctum',
      label: 'Warden Sanctum',
      detail: 'Boss room · inlay + ceremonial framing',
      room: sanctum,
    },
  ]

  const rendered: QaView[] = []
  for (const spec of specs) {
    const result = await renderDungeonView(dungeon, spec)
    rendered.push({
      id: spec.id,
      label: spec.label,
      detail: spec.detail,
      image: result.image,
      metrics: result.metrics,
      visual: result.visual,
    })
  }
  return rendered
}

async function renderDungeonView(
  dungeon: DungeonWithProps,
  spec: {
    overview?: boolean
    target?: { x: number; z: number }
    room?: DungeonWithProps['rooms'][number]
    distance?: number
  },
) {
  const atmosphere = dungeonAtmosphere(dungeon.theme)
  const lighting = dungeonLightingProfile(
    atmosphere,
    dungeon.settings,
  )

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(1)
  renderer.setSize(VIEW_WIDTH, VIEW_HEIGHT, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = lighting.exposure
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.info.autoReset = false

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(atmosphere.background)
  scene.fog = new THREE.FogExp2(
    atmosphere.fog,
    lighting.fogDensity,
  )

  const camera = new THREE.PerspectiveCamera(
    spec.overview ? 46 : 44,
    VIEW_WIDTH / VIEW_HEIGHT,
    .08,
    320,
  )

  const world = new THREE.Group()
  scene.add(world)
  const flickerLights: DungeonV3FlickerLight[] = []
  addDungeonMasonryV3(
    world,
    dungeon,
    atmosphere,
    flickerLights,
    'arpg',
  )

  scene.add(
    new THREE.HemisphereLight(
      atmosphere.sky,
      atmosphere.ground,
      lighting.ambientIntensity,
    ),
  )
  scene.add(
    new THREE.AmbientLight(
      atmosphere.sky,
      lighting.fillIntensity,
    ),
  )
  const key = new THREE.DirectionalLight(
    atmosphere.key,
    lighting.keyIntensity,
  )
  key.position.set(12, 22, 9)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -70
  key.shadow.camera.right = 70
  key.shadow.camera.top = 70
  key.shadow.camera.bottom = -70
  key.shadow.camera.near = 1
  key.shadow.camera.far = 150
  key.shadow.bias = -.0005
  scene.add(key)

  if (spec.overview) {
    const bounds = dungeonWorldBoundsV3(dungeon, 3)
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2
    const span = Math.max(
      bounds.maxX - bounds.minX,
      bounds.maxZ - bounds.minZ,
    )
    camera.position.set(
      centerX + span * .28,
      Math.max(58, span * .72),
      centerZ + span * .34,
    )
    camera.lookAt(centerX, .2, centerZ)
  } else {
    const room = spec.room
    const targetX = room?.x ?? spec.target?.x ?? 0
    const targetZ = room?.z ?? spec.target?.z ?? 0
    const targetY = room?.floorLevel ?? 0
    const distance =
      spec.distance ??
      THREE.MathUtils.clamp(
        Math.max(
          room?.width ?? 18,
          room?.depth ?? 18,
        ) * 1.02 + 3,
        18,
        36,
      )

    camera.position.set(
      targetX + distance * .43,
      targetY + distance * .94,
      targetZ + distance * .43,
    )
    camera.lookAt(
      targetX,
      targetY + .8,
      targetZ,
    )
  }

  const composer = new EffectComposer(renderer)
  composer.setSize(VIEW_WIDTH, VIEW_HEIGHT)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(
      VIEW_WIDTH,
      VIEW_HEIGHT,
    ),
    lighting.bloomStrength,
    atmosphere.bloomRadius,
    atmosphere.bloomThreshold,
  )
  composer.addPass(bloom)

  // Warm up shadows, shader programs and post-processing targets before
  // measuring. The benchmark is intentionally synchronous so it reports
  // renderer cost rather than requestAnimationFrame scheduling latency.
  for (let index = 0; index < 3; index += 1) {
    renderer.info.reset()
    composer.render()
  }
  await new Promise<void>((resolvePromise) =>
    requestAnimationFrame(() => resolvePromise()),
  )

  const durations: number[] = []
  let drawCalls = 0
  let triangles = 0
  let points = 0
  let lines = 0

  for (let index = 0; index < RENDER_SAMPLE_COUNT; index += 1) {
    renderer.info.reset()
    const started = performance.now()
    composer.render()
    durations.push(performance.now() - started)
    drawCalls = Math.max(drawCalls, renderer.info.render.calls)
    triangles = Math.max(triangles, renderer.info.render.triangles)
    points = Math.max(points, renderer.info.render.points)
    lines = Math.max(lines, renderer.info.render.lines)
  }

  const sceneStats = collectSceneStats(scene)
  const sortedDurations = [...durations].sort((a, b) => a - b)
  const p95Index = Math.min(
    sortedDurations.length - 1,
    Math.ceil(sortedDurations.length * .95) - 1,
  )
  const metrics: DungeonRenderMetrics = {
    renderMs: {
      average: roundMetric(
        durations.reduce((sum, value) => sum + value, 0) /
          durations.length,
      ),
      p95: roundMetric(sortedDurations[p95Index] ?? 0),
      max: roundMetric(Math.max(...durations)),
      samples: durations.length,
    },
    drawCalls,
    triangles,
    points,
    lines,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    ...sceneStats,
  }

  const visual = measureVisualHealth(renderer.domElement)
  const image = renderer.domElement.toDataURL('image/png')

  composer.dispose()
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose())
    } else {
      material?.dispose?.()
    }
  })
  renderer.dispose()

  return {
    image,
    metrics,
    visual,
  }
}

function measureVisualHealth(
  source: HTMLCanvasElement,
): DungeonVisualMetrics {
  const sampleCanvas = document.createElement('canvas')
  const width = Math.max(1, Math.floor(source.width / 4))
  const height = Math.max(1, Math.floor(source.height / 4))
  sampleCanvas.width = width
  sampleCanvas.height = height

  const context = sampleCanvas.getContext(
    '2d',
    {
      willReadFrequently: true,
    },
  )
  if (!context) {
    return {
      averageLuminance: 0,
      p10Luminance: 0,
      p50Luminance: 0,
      p90Luminance: 0,
      contrastRange: 0,
      darkPixelRatio: 0,
      highlightPixelRatio: 0,
      warmPixelRatio: 0,
      cyanPixelRatio: 0,
    }
  }

  context.drawImage(
    source,
    0,
    0,
    width,
    height,
  )
  const pixels = context.getImageData(
    0,
    0,
    width,
    height,
  ).data

  const luminance: number[] = []
  let sum = 0
  let dark = 0
  let highlight = 0
  let warm = 0
  let cyan = 0

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] / 255
    const g = pixels[index + 1] / 255
    const b = pixels[index + 2] / 255
    const luma = r * .2126 + g * .7152 + b * .0722

    luminance.push(luma)
    sum += luma
    if (luma < .07) dark += 1
    if (luma > .7) highlight += 1
    if (
      luma > .08 &&
      r > g * 1.12 &&
      r > b * 1.28
    ) {
      warm += 1
    }
    if (
      luma > .08 &&
      b > r * 1.14 &&
      g > r * 1.06
    ) {
      cyan += 1
    }
  }

  luminance.sort((a, b) => a - b)
  const count = Math.max(1, luminance.length)
  const percentile = (value: number) =>
    luminance[
      Math.min(
        luminance.length - 1,
        Math.max(
          0,
          Math.floor(
            (luminance.length - 1) * value,
          ),
        ),
      )
    ] ?? 0

  const p10 = percentile(.1)
  const p50 = percentile(.5)
  const p90 = percentile(.9)

  return {
    averageLuminance: roundMetric(sum / count),
    p10Luminance: roundMetric(p10),
    p50Luminance: roundMetric(p50),
    p90Luminance: roundMetric(p90),
    contrastRange: roundMetric(p90 - p10),
    darkPixelRatio: roundMetric(dark / count),
    highlightPixelRatio: roundMetric(highlight / count),
    warmPixelRatio: roundMetric(warm / count),
    cyanPixelRatio: roundMetric(cyan / count),
  }
}

function collectSceneStats(scene: THREE.Scene) {
  let objects = 0
  let meshes = 0
  let instancedMeshes = 0
  let instances = 0
  let lights = 0
  let shadowLights = 0
  const materials = new Set<THREE.Material>()

  scene.traverse((object) => {
    objects += 1
    if ((object as THREE.Light).isLight) {
      lights += 1
      if ((object as THREE.Light).castShadow) {
        shadowLights += 1
      }
    }

    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    meshes += 1
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      instancedMeshes += 1
      instances += (mesh as THREE.InstancedMesh).count
    }
    const meshMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    meshMaterials.forEach((material) => materials.add(material))
  })

  return {
    objects,
    meshes,
    instancedMeshes,
    instances,
    lights,
    shadowLights,
    materials: materials.size,
  }
}

function summarizeRenderMetrics(
  views: QaView[],
): DungeonRenderSummary {
  return {
    maxDrawCalls: Math.max(0, ...views.map((view) => view.metrics.drawCalls)),
    maxTriangles: Math.max(0, ...views.map((view) => view.metrics.triangles)),
    maxGeometries: Math.max(0, ...views.map((view) => view.metrics.geometries)),
    maxTextures: Math.max(0, ...views.map((view) => view.metrics.textures)),
    maxLights: Math.max(0, ...views.map((view) => view.metrics.lights)),
    maxShadowLights: Math.max(0, ...views.map((view) => view.metrics.shadowLights)),
    slowestAverageRenderMs: Math.max(
      0,
      ...views.map((view) => view.metrics.renderMs.average),
    ),
    slowestP95RenderMs: Math.max(
      0,
      ...views.map((view) => view.metrics.renderMs.p95),
    ),
  }
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

const pageStyle = {
  minHeight: '100vh',
  padding: '28px',
  background: '#05090d',
  color: '#dbe9f2',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const

const headerStyle = {
  maxWidth: '1980px',
  margin: '0 auto 22px',
  padding: '18px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '24px',
  alignItems: 'center',
  border: '1px solid #213545',
  borderRadius: '10px',
  background: '#0a1219',
} as const

const eyebrowStyle = {
  color: '#71c8ee',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '.16em',
} as const

const titleStyle = {
  margin: '5px 0 3px',
  fontSize: '24px',
} as const

const subtitleStyle = {
  margin: 0,
  maxWidth: '900px',
  color: '#879ba9',
  fontSize: '13px',
} as const

const buildStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  color: '#7992a3',
  fontSize: '12px',
} as const

const loadingStyle = {
  maxWidth: '1980px',
  margin: '0 auto',
  padding: '80px 20px',
  textAlign: 'center',
  color: '#7f9aab',
} as const

const errorStyle = {
  maxWidth: '1980px',
  margin: '0 auto 20px',
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  border: '1px solid #773d49',
  background: '#241116',
  color: '#ffc4ce',
} as const

const gridStyle = {
  maxWidth: '1980px',
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '18px',
} as const

const cardStyle = {
  overflow: 'hidden',
  border: '1px solid #1d3140',
  borderRadius: '10px',
  background: '#081017',
  boxShadow: '0 18px 44px rgba(0,0,0,.28)',
} as const

const cardHeadingStyle = {
  minHeight: '54px',
  padding: '10px 13px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '18px',
  alignItems: 'center',
  borderBottom: '1px solid #172a37',
  color: '#c9d9e4',
  fontSize: '12px',
} as const

const cardTitleStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
} as const

const imageStyle = {
  display: 'block',
  width: '100%',
  height: 'auto',
  background: '#010307',
} as const

const metricsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '7px 12px',
  padding: '9px 12px 11px',
  borderTop: '1px solid #142531',
  color: '#7f9bad',
  fontSize: '10px',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const
