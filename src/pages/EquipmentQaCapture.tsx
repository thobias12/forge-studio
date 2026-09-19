import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  buildEquipmentForgeV3Visual,
  disposeEquipmentForgeV3Visual,
  getEquipmentForgeV3FitDiagnostics,
} from '../engine/equipmentForgeV3/assembler'
import type {
  EquipmentFitDiagnostics,
  EquipmentFitStatus,
  EquipmentFitZone,
} from '../engine/equipmentForgeV3/fitDiagnostics'
import {
  createEquipmentForgeV3Recipe,
  type EquipmentForgeV3Recipe,
} from '../engine/equipmentForgeV3/types'
import {
  OFFICIAL_SKILLBOUND_BASE_IDS,
  setSkillboundBaseClothingVisible,
  type SkillboundBodyType,
} from '../lib/characterAssetRegistry'
import {
  getAsset,
} from '../lib/library'
import {
  FORGE_BUILD,
  FORGE_VERSION,
} from '../version'
import './equipment-qa-capture.css'

type QaView = {
  id: string
  label: string
  yaw: number
  targetY: number
  distance: number
  cameraY: number
  fov: number
  kind: 'full' | 'fit'
}

type QaShot = {
  id: string
  dataUrl: string
}

const QA_VIEWS: QaView[] = [
  {
    id: 'front',
    label: 'Front',
    yaw: 0,
    targetY: .92,
    distance: 3.2,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'front-right',
    label: 'Front 45°',
    yaw: Math.PI / 4,
    targetY: .92,
    distance: 3.2,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'right',
    label: 'Right',
    yaw: Math.PI / 2,
    targetY: .92,
    distance: 3.15,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'back-right',
    label: 'Back 45°',
    yaw: Math.PI * .75,
    targetY: .92,
    distance: 3.2,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'back',
    label: 'Back',
    yaw: Math.PI,
    targetY: .92,
    distance: 3.2,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'back-left',
    label: 'Back -45°',
    yaw: -Math.PI * .75,
    targetY: .92,
    distance: 3.2,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'left',
    label: 'Left',
    yaw: -Math.PI / 2,
    targetY: .92,
    distance: 3.15,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'front-left',
    label: 'Front -45°',
    yaw: -Math.PI / 4,
    targetY: .92,
    distance: 3.2,
    cameraY: 1.04,
    fov: 30,
    kind: 'full',
  },
  {
    id: 'right-side-close',
    label: 'Right side · torso gap',
    yaw: Math.PI / 2,
    targetY: 1.04,
    distance: .92,
    cameraY: 1.05,
    fov: 25,
    kind: 'fit',
  },
  {
    id: 'left-side-close',
    label: 'Left side · torso gap',
    yaw: -Math.PI / 2,
    targetY: 1.04,
    distance: .92,
    cameraY: 1.05,
    fov: 25,
    kind: 'fit',
  },
  {
    id: 'right-underarm',
    label: 'Right underarm',
    yaw: Math.PI / 2,
    targetY: 1.27,
    distance: .76,
    cameraY: 1.3,
    fov: 23,
    kind: 'fit',
  },
  {
    id: 'left-underarm',
    label: 'Left underarm',
    yaw: -Math.PI / 2,
    targetY: 1.27,
    distance: .76,
    cameraY: 1.3,
    fov: 23,
    kind: 'fit',
  },
  {
    id: 'chest-close',
    label: 'Chest / neckline',
    yaw: 0,
    targetY: 1.28,
    distance: .9,
    cameraY: 1.3,
    fov: 24,
    kind: 'fit',
  },
  {
    id: 'back-shoulders-close',
    label: 'Back / shoulders',
    yaw: Math.PI,
    targetY: 1.27,
    distance: .9,
    cameraY: 1.3,
    fov: 24,
    kind: 'fit',
  },
  {
    id: 'cape-right-close',
    label: 'Cape / back gap · right',
    yaw: Math.PI * .72,
    targetY: 1.12,
    distance: .78,
    cameraY: 1.16,
    fov: 22,
    kind: 'fit',
  },
  {
    id: 'cape-left-close',
    label: 'Cape / back gap · left',
    yaw: -Math.PI * .72,
    targetY: 1.12,
    distance: .78,
    cameraY: 1.16,
    fov: 22,
    kind: 'fit',
  },
  {
    id: 'right-waist-close',
    label: 'Right waist / hem',
    yaw: Math.PI / 2,
    targetY: .78,
    distance: .78,
    cameraY: .8,
    fov: 22,
    kind: 'fit',
  },
  {
    id: 'left-waist-close',
    label: 'Left waist / hem',
    yaw: -Math.PI / 2,
    targetY: .78,
    distance: .78,
    cameraY: .8,
    fov: 22,
    kind: 'fit',
  },
]

declare global {
  interface Window {
    __FORGE_EQUIPMENT_QA_READY__?: boolean
    __FORGE_EQUIPMENT_QA__?: {
      version: string
      build: string
      bodyType: SkillboundBodyType
      modelUrl: string
      recipe: EquipmentForgeV3Recipe
      views: string[]
      errors: string[]
      fitDiagnostics?: EquipmentFitDiagnostics
    }
    __FORGE_EQUIPMENT_QA_RECIPE__?: Partial<EquipmentForgeV3Recipe>
    __FORGE_EQUIPMENT_QA_MODEL_URL__?: string
    __FORGE_EQUIPMENT_QA_BODY__?: SkillboundBodyType
    __FORGE_EQUIPMENT_QA_FORCE__?: boolean
  }
}

export default function EquipmentQaCapture() {
  const params = useMemo(
    () => {
      const parsed =
        new URLSearchParams(
          window.location.search,
        )
      const qaValue =
        parsed.get('equipmentQa')

      if (
        qaValue?.startsWith('1&')
      ) {
        const embedded =
          new URLSearchParams(
            qaValue.slice(2),
          )
        for (const [key, value] of embedded) {
          if (!parsed.has(key)) {
            parsed.set(key, value)
          }
        }
        parsed.set(
          'equipmentQa',
          '1',
        )
      }

      return parsed
    },
    [],
  )

  const bodyType: SkillboundBodyType =
    params.get('body') === 'male'
      ? 'male'
      : params.get('body') === 'female'
        ? 'female'
        : window.__FORGE_EQUIPMENT_QA_BODY__ ??
          'female'

  const modelUrl =
    params.get('model') ??
    window.__FORGE_EQUIPMENT_QA_MODEL_URL__ ??
    'library'

  const recipe = useMemo(() => {
    const base =
      createEquipmentForgeV3Recipe(
        bodyType,
      )
    let queryOverride:
      | Partial<EquipmentForgeV3Recipe>
      | undefined

    const rawRecipe =
      params.get('recipe')
    if (rawRecipe) {
      try {
        queryOverride =
          JSON.parse(rawRecipe) as
            Partial<EquipmentForgeV3Recipe>
      } catch {
        queryOverride = undefined
      }
    }

    const override =
      window.__FORGE_EQUIPMENT_QA_RECIPE__ ??
      queryOverride

    return {
      ...base,
      ...override,
      bodyType,
      enabled: true,
      layers: {
        ...base.layers,
        ...(override?.layers ?? {}),
      },
      cape: {
        ...base.cape,
        ...(override?.cape ?? {}),
      },
      materials: {
        ...base.materials,
        ...(override?.materials ?? {}),
      },
    } as EquipmentForgeV3Recipe
  }, [bodyType, params])

  const [source, setSource] =
    useState<THREE.Group>()
  const [shots, setShots] =
    useState<QaShot[]>([])
  const [
    fitDiagnostics,
    setFitDiagnostics,
  ] =
    useState<
      EquipmentFitDiagnostics
      | undefined
    >()
  const [error, setError] =
    useState('')

  useEffect(() => {
    let cancelled = false
    let localObjectUrl:
      | string
      | undefined

    setError('')
    setSource(undefined)
    setShots([])
    setFitDiagnostics(undefined)

    const load = async () => {
      try {
        let resolvedModelUrl =
          modelUrl

        if (modelUrl === 'library') {
          const asset =
            await getAsset(
              OFFICIAL_SKILLBOUND_BASE_IDS[
                bodyType
              ],
            )

          if (!asset) {
            throw new Error(
              `The Skillbound ${bodyType} foundation is not installed in this browser. Open Equipment Forge once and install Skillbound-Base-Characters-v1.zip.`,
            )
          }

          localObjectUrl =
            URL.createObjectURL(
              asset.blob,
            )
          resolvedModelUrl =
            localObjectUrl
        }

        const loader =
          new GLTFLoader()
        const gltf =
          await loader.loadAsync(
            resolvedModelUrl,
          )

        if (cancelled) {
          disposeScene(gltf.scene)
          return
        }

        gltf.scene.updateMatrixWorld(true)
        setSource(gltf.scene)
      } catch (cause) {
        if (cancelled) return
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause),
        )
      }
    }

    void load()

    return () => {
      cancelled = true
      if (localObjectUrl) {
        URL.revokeObjectURL(
          localObjectUrl,
        )
      }
    }
  }, [modelUrl, bodyType])

  useEffect(() => {
    if (!source) return

    let cancelled = false

    const capture = async () => {
      let bodyRoot:
        | THREE.Group
        | undefined
      let renderer:
        | THREE.WebGLRenderer
        | undefined
      let ground:
        | THREE.Mesh
        | undefined

      try {
        const scene =
          new THREE.Scene()
        scene.background =
          new THREE.Color(0x090d12)

        const camera =
          new THREE.PerspectiveCamera(
            30,
            1,
            .02,
            30,
          )

        renderer =
          new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference:
              'high-performance',
          })
        renderer.setPixelRatio(1)
        renderer.setSize(
          768,
          768,
          false,
        )
        renderer.outputColorSpace =
          THREE.SRGBColorSpace
        renderer.toneMapping =
          THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure =
          1.1
        renderer.shadowMap.enabled =
          true

        scene.add(
          new THREE.HemisphereLight(
            0xe7eef7,
            0x151a21,
            2.15,
          ),
        )

        const key =
          new THREE.DirectionalLight(
            0xfff1de,
            3.7,
          )
        key.position.set(
          3.6,
          5,
          -3,
        )
        key.castShadow = true
        scene.add(key)

        const rim =
          new THREE.DirectionalLight(
            0x6e8fc6,
            2,
          )
        rim.position.set(
          -4,
          3.1,
          3.2,
        )
        scene.add(rim)

        ground =
          new THREE.Mesh(
            new THREE.CircleGeometry(
              3,
              48,
            ),
            new THREE.MeshStandardMaterial({
              color: 0x111820,
              roughness: .95,
              metalness: 0,
            }),
          )
        ground.rotation.x =
          -Math.PI / 2
        ground.receiveShadow = true
        scene.add(ground)

        bodyRoot =
          cloneSkeleton(
            source,
          ) as THREE.Group
        bodyRoot.name =
          '__equipment_qa_body'
        bodyRoot.traverse((object) => {
          if (
            object instanceof THREE.Mesh
          ) {
            object.castShadow = true
            object.receiveShadow = false
            object.frustumCulled = false
          }
        })

        setSkillboundBaseClothingVisible(
          bodyRoot,
          false,
        )
        scene.add(bodyRoot)
        bodyRoot.updateMatrixWorld(true)

        buildEquipmentForgeV3Visual(
          bodyRoot,
          recipe,
          {
            analyzeFit: true,
          },
        )
        bodyRoot.updateMatrixWorld(true)

        const diagnostics =
          getEquipmentForgeV3FitDiagnostics(
            bodyRoot,
          )

        if (!cancelled) {
          setFitDiagnostics(
            diagnostics,
          )
        }

        const nextShots:
          QaShot[] = []

        for (const view of QA_VIEWS) {
          if (cancelled) break

          bodyRoot.rotation.y =
            Math.PI + view.yaw
          bodyRoot.updateMatrixWorld(true)

          camera.fov = view.fov
          camera.position.set(
            0,
            view.cameraY,
            -view.distance,
          )
          camera.lookAt(
            new THREE.Vector3(
              0,
              view.targetY,
              0,
            ),
          )
          camera.updateProjectionMatrix()

          renderer.render(
            scene,
            camera,
          )
          renderer.render(
            scene,
            camera,
          )

          nextShots.push({
            id: view.id,
            dataUrl:
              renderer.domElement.toDataURL(
                'image/png',
              ),
          })

          await new Promise<void>(
            (resolve) =>
              requestAnimationFrame(
                () => resolve(),
              ),
          )
        }

        if (!cancelled) {
          setShots(nextShots)
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : String(cause),
          )
        }
      } finally {
        if (bodyRoot) {
          disposeEquipmentForgeV3Visual(
            bodyRoot,
          )
          bodyRoot.removeFromParent()
        }
        if (ground) {
          ground.geometry.dispose()
          const material =
            ground.material
          if (
            Array.isArray(material)
          ) {
            material.forEach(
              (entry) =>
                entry.dispose(),
            )
          } else {
            material.dispose()
          }
        }
        renderer?.dispose()
      }
    }

    void capture()

    return () => {
      cancelled = true
    }
  }, [source, recipe])

  const allReady =
    shots.length ===
    QA_VIEWS.length
  const readyViewIds =
    shots.map(
      (shot) => shot.id,
    )

  useEffect(() => {
    window.__FORGE_EQUIPMENT_QA_READY__ =
      allReady || Boolean(error)
    window.__FORGE_EQUIPMENT_QA__ = {
      version: FORGE_VERSION,
      build: FORGE_BUILD,
      bodyType,
      modelUrl,
      recipe,
      views: readyViewIds,
      errors: error
        ? [error]
        : [],
      fitDiagnostics,
    }
  }, [
    allReady,
    error,
    bodyType,
    modelUrl,
    recipe,
    readyViewIds,
    fitDiagnostics,
  ])

  const shotMap =
    useMemo(
      () =>
        new Map(
          shots.map(
            (shot) => [
              shot.id,
              shot.dataUrl,
            ],
          ),
        ),
      [shots],
    )

  const fullViews =
    QA_VIEWS.filter(
      (view) =>
        view.kind === 'full',
    )
  const fitViews =
    QA_VIEWS.filter(
      (view) =>
        view.kind === 'fit',
    )

  return (
    <main className="equipment-qa-page">
      <header className="equipment-qa-header">
        <div>
          <span>
            FORGE · EQUIPMENT QA
          </span>
          <h1>
            V3 360° + fit inspection
          </h1>
          <p>
            {bodyType} · {recipe.name}
            {modelUrl === 'library'
              ? ' · live Forge Library model'
              : ''}
          </p>
        </div>
        <div className="equipment-qa-build">
          v{FORGE_VERSION} · {FORGE_BUILD}
        </div>
      </header>

      {error ? (
        <section className="equipment-qa-error">
          <strong>
            QA model could not load.
          </strong>
          <span>{error}</span>
          <code>{modelUrl}</code>
        </section>
      ) : (
        <>
          <FitDiagnosticsPanel
            diagnostics={
              fitDiagnostics
            }
          />

          <QaSection
            title="360° full body"
            description="Eight fixed angles for silhouette, attachment and layer checks."
            views={fullViews}
            shots={shotMap}
          />

          <QaSection
            title="Close-up fit checks"
            description="Tighter side, underarm, chest, shoulder and waist views for spotting body-to-clothing gaps and clipping."
            views={fitViews}
            shots={shotMap}
          />
        </>
      )}
    </main>
  )
}

function QaSection({
  title,
  description,
  views,
  shots,
}: {
  title: string
  description: string
  views: QaView[]
  shots: Map<string, string>
}) {
  return (
    <section className="equipment-qa-section">
      <header className="equipment-qa-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span>
          {views.length} views
        </span>
      </header>

      <div className="equipment-qa-grid">
        {views.map((view) => {
          const dataUrl =
            shots.get(view.id)

          return (
            <article
              className="equipment-qa-view"
              data-qa-view={view.id}
              key={view.id}
            >
              <header>
                <strong>
                  {view.label}
                </strong>
                <span>{view.id}</span>
              </header>

              <div className="equipment-qa-image">
                {dataUrl ? (
                  <img
                    src={dataUrl}
                    alt={view.label}
                  />
                ) : (
                  <div className="equipment-qa-loading">
                    Rendering…
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function FitDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics?: EquipmentFitDiagnostics
}) {
  if (!diagnostics) {
    return (
      <section className="equipment-fit-diagnostics">
        <div className="equipment-fit-diagnostics-loading">
          Measuring body-to-clothing clearance…
        </div>
      </section>
    )
  }

  return (
    <section className="equipment-fit-diagnostics">
      <header>
        <div>
          <span>
            BODY ↔ GARMENT
          </span>
          <h2>Fit diagnostics</h2>
          <p>
            Signed nearest-surface sampling catches excessive clearance and likely clipping before visual polish.
          </p>
        </div>
        <FitStatusPill
          status={
            diagnostics.overall.status
          }
        />
      </header>

      <div className="equipment-fit-summary">
        <FitMetric
          label="Average clearance"
          value={formatDistance(
            diagnostics,
            diagnostics.overall
              .averageGap,
          )}
        />
        <FitMetric
          label="95th percentile"
          value={formatDistance(
            diagnostics,
            diagnostics.overall.p95Gap,
          )}
        />
        <FitMetric
          label="Clipping samples"
          value={formatPercent(
            diagnostics.overall
              .clippingPercent,
          )}
        />
        <FitMetric
          label="Floating samples"
          value={formatPercent(
            diagnostics.overall
              .floatingPercent,
          )}
        />
      </div>

      <div className="equipment-fit-zones">
        {diagnostics.zones.map(
          (zone) => (
            <FitZoneRow
              key={zone.id}
              diagnostics={
                diagnostics
              }
              zone={zone}
            />
          ),
        )}
      </div>
    </section>
  )
}

function FitZoneRow({
  diagnostics,
  zone,
}: {
  diagnostics: EquipmentFitDiagnostics
  zone: EquipmentFitZone
}) {
  return (
    <div className="equipment-fit-zone">
      <div>
        <strong>{zone.label}</strong>
        <span>
          {zone.samples.toLocaleString()}
          {' '}samples
        </span>
      </div>
      <div>
        <span>avg</span>
        <strong>
          {formatDistance(
            diagnostics,
            zone.averageGap,
          )}
        </strong>
      </div>
      <div>
        <span>p95</span>
        <strong>
          {formatDistance(
            diagnostics,
            zone.p95Gap,
          )}
        </strong>
      </div>
      <div>
        <span>clip</span>
        <strong>
          {formatPercent(
            zone.clippingPercent,
          )}
        </strong>
      </div>
      <div>
        <span>float</span>
        <strong>
          {formatPercent(
            zone.floatingPercent,
          )}
        </strong>
      </div>
      <FitStatusPill
        status={zone.status}
      />
    </div>
  )
}

function FitMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="equipment-fit-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FitStatusPill({
  status,
}: {
  status: EquipmentFitStatus
}) {
  const label =
    status === 'clean'
      ? 'Clean'
      : status === 'check'
        ? 'Check'
        : 'Problem'

  return (
    <span
      className={
        `equipment-fit-status ${status}`
      }
    >
      {label}
    </span>
  )
}

function formatDistance(
  diagnostics: EquipmentFitDiagnostics,
  value: number,
) {
  if (
    diagnostics.bodyHeight >= 1 &&
    diagnostics.bodyHeight <= 3
  ) {
    return `${(
      value * 100
    ).toFixed(1)} cm`
  }

  return `${(
    (value /
      diagnostics.bodyHeight) *
    100
  ).toFixed(2)}% H`
}

function formatPercent(
  value: number,
) {
  return `${value.toFixed(1)}%`
}

function disposeScene(
  root: THREE.Object3D,
) {
  const geometries =
    new Set<THREE.BufferGeometry>()
  const materials =
    new Set<THREE.Material>()

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    if (object.geometry) {
      geometries.add(
        object.geometry,
      )
    }
    const list =
      Array.isArray(object.material)
        ? object.material
        : [object.material]
    for (const material of list) {
      if (material) {
        materials.add(material)
      }
    }
  })

  for (const geometry of geometries) {
    geometry.dispose()
  }
  for (const material of materials) {
    material.dispose()
  }
}
