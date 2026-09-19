import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  buildEquipmentForgeV3Visual,
  disposeEquipmentForgeV3Visual,
} from '../engine/equipmentForgeV3/assembler'
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
  kind: 'full' | 'detail'
}

const QA_VIEWS: QaView[] = [
  {
    id: 'front',
    label: 'Front',
    yaw: 0,
    targetY: .92,
    distance: 3.35,
    cameraY: 1.05,
    kind: 'full',
  },
  {
    id: 'front-right',
    label: 'Front 45°',
    yaw: Math.PI / 4,
    targetY: .92,
    distance: 3.35,
    cameraY: 1.05,
    kind: 'full',
  },
  {
    id: 'right',
    label: 'Right',
    yaw: Math.PI / 2,
    targetY: .92,
    distance: 3.35,
    cameraY: 1.05,
    kind: 'full',
  },
  {
    id: 'back',
    label: 'Back',
    yaw: Math.PI,
    targetY: .92,
    distance: 3.35,
    cameraY: 1.05,
    kind: 'full',
  },
  {
    id: 'left',
    label: 'Left',
    yaw: -Math.PI / 2,
    targetY: .92,
    distance: 3.35,
    cameraY: 1.05,
    kind: 'full',
  },
  {
    id: 'front-left',
    label: 'Front -45°',
    yaw: -Math.PI / 4,
    targetY: .92,
    distance: 3.35,
    cameraY: 1.05,
    kind: 'full',
  },
  {
    id: 'shoulders',
    label: 'Neck / Shoulders',
    yaw: .18,
    targetY: 1.42,
    distance: 1.25,
    cameraY: 1.48,
    kind: 'detail',
  },
  {
    id: 'hem',
    label: 'Waist / Hem',
    yaw: -.12,
    targetY: .72,
    distance: 1.28,
    cameraY: .76,
    kind: 'detail',
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
    }
    __FORGE_EQUIPMENT_QA_RECIPE__?: Partial<EquipmentForgeV3Recipe>
    __FORGE_EQUIPMENT_QA_MODEL_URL__?: string
    __FORGE_EQUIPMENT_QA_BODY__?: SkillboundBodyType
    __FORGE_EQUIPMENT_QA_FORCE__?: boolean
  }
}

export default function EquipmentQaCapture() {
  const params = useMemo(
    () =>
      new URLSearchParams(
        window.location.search,
      ),
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
      materials: {
        ...base.materials,
        ...(override?.materials ?? {}),
      },
    } as EquipmentForgeV3Recipe
  }, [bodyType, params])

  const [source, setSource] =
    useState<THREE.Group>()
  const [error, setError] =
    useState('')
  const [readyViews, setReadyViews] =
    useState<string[]>([])
  const [viewErrors, setViewErrors] =
    useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    let localObjectUrl:
      | string
      | undefined

    setError('')
    setSource(undefined)
    setReadyViews([])
    setViewErrors([])

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
        const message =
          cause instanceof Error
            ? cause.message
            : String(cause)
        setError(message)
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
    const allReady =
      readyViews.length ===
      QA_VIEWS.length

    window.__FORGE_EQUIPMENT_QA_READY__ =
      allReady || Boolean(error)
    window.__FORGE_EQUIPMENT_QA__ = {
      version: FORGE_VERSION,
      build: FORGE_BUILD,
      bodyType,
      modelUrl,
      recipe,
      views: [...readyViews],
      errors: [
        ...(error ? [error] : []),
        ...viewErrors,
      ],
    }
  }, [
    readyViews,
    viewErrors,
    error,
    bodyType,
    modelUrl,
    recipe,
  ])

  const markReady = useCallback(
    (id: string) => {
      setReadyViews((current) =>
        current.includes(id)
          ? current
          : [...current, id],
      )
    },
    [],
  )

  const markError = useCallback(
    (
      id: string,
      message: string,
    ) => {
      setViewErrors((current) =>
        current.includes(
          `${id}: ${message}`,
        )
          ? current
          : [
              ...current,
              `${id}: ${message}`,
            ],
      )
      markReady(id)
    },
    [markReady],
  )

  return (
    <main className="equipment-qa-page">
      <header className="equipment-qa-header">
        <div>
          <span>
            FORGE · EQUIPMENT QA
          </span>
          <h1>
            V3 360° regression capture
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
        <section className="equipment-qa-grid">
          {QA_VIEWS.map((view) => (
            <EquipmentQaView
              key={view.id}
              view={view}
              source={source}
              recipe={recipe}
              onReady={() =>
                markReady(view.id)
              }
              onError={(message) =>
                markError(
                  view.id,
                  message,
                )
              }
            />
          ))}
        </section>
      )}
    </main>
  )
}

function EquipmentQaView({
  view,
  source,
  recipe,
  onReady,
  onError,
}: {
  view: QaView
  source?: THREE.Group
  recipe: EquipmentForgeV3Recipe
  onReady: () => void
  onError: (message: string) => void
}) {
  const hostRef =
    useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!source || !hostRef.current) {
      return
    }

    const host = hostRef.current
    let bodyRoot:
      | THREE.Group
      | undefined
    let renderer:
      | THREE.WebGLRenderer
      | undefined
    let disposed = false
    let raf = 0

    try {
      const scene =
        new THREE.Scene()
      scene.background =
        new THREE.Color(0x090d12)

      const camera =
        new THREE.PerspectiveCamera(
          view.kind === 'detail'
            ? 30
            : 31,
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
      renderer.setSize(640, 640, false)
      renderer.outputColorSpace =
        THREE.SRGBColorSpace
      renderer.toneMapping =
        THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure =
        1.1
      renderer.shadowMap.enabled = true
      host.appendChild(
        renderer.domElement,
      )

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

      const ground = new THREE.Mesh(
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
      bodyRoot.rotation.y =
        Math.PI + view.yaw
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
      )
      bodyRoot.updateMatrixWorld(true)

      const target =
        new THREE.Vector3(
          0,
          view.targetY,
          0,
        )
      camera.position.set(
        0,
        view.cameraY,
        -view.distance,
      )
      camera.lookAt(target)

      const renderStable = (
        frame: number,
      ) => {
        if (
          disposed ||
          !renderer
        ) {
          return
        }

        renderer.render(
          scene,
          camera,
        )

        if (frame >= 4) {
          onReady()
          return
        }

        raf =
          requestAnimationFrame(
            () =>
              renderStable(
                frame + 1,
              ),
          )
      }

      raf =
        requestAnimationFrame(
          () => renderStable(0),
        )

      return () => {
        disposed = true
        cancelAnimationFrame(raf)
        if (bodyRoot) {
          disposeEquipmentForgeV3Visual(
            bodyRoot,
          )
          bodyRoot.removeFromParent()
        }
        ground.geometry.dispose()
        ;(
          ground.material as THREE.Material
        ).dispose()
        renderer?.dispose()
        renderer?.domElement.remove()
      }
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : String(cause)
      onError(message)

      return () => {
        disposed = true
        cancelAnimationFrame(raf)
        renderer?.dispose()
        renderer?.domElement.remove()
      }
    }
  }, [
    source,
    recipe,
    view,
    onReady,
    onError,
  ])

  return (
    <article
      className="equipment-qa-view"
      data-qa-view={view.id}
    >
      <header>
        <strong>{view.label}</strong>
        <span>{view.id}</span>
      </header>
      <div
        className="equipment-qa-canvas"
        ref={hostRef}
      />
    </article>
  )
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
