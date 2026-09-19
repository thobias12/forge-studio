import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  buildPropFarProxy,
  buildPropPartObject,
  buildPropPivotMarker,
  disposePropVisual,
} from '../engine/propPrefabVisual'
import {
  propPrefabBounds,
  type PropPart,
  type PropPrefab,
} from '../lib/propPrefab'

export type PropForgeTransformMode = 'translate' | 'rotate' | 'scale'
export type PropForgePreviewMode = 'full' | 'far'

type Props = {
  prefab: PropPrefab
  selectedPartId?: string
  mode: PropForgeTransformMode
  topDown: boolean
  showCollision: boolean
  showPivot: boolean
  previewMode: PropForgePreviewMode
  focusNonce: number
  captureNonce: number
  onSelectPart: (partId?: string) => void
  onCommitPart: (part: PropPart) => void
  onCaptureThumbnail: (dataUrl: string) => void
}

type ViewState = {
  renderer?: THREE.WebGLRenderer
  scene?: THREE.Scene
  camera?: THREE.PerspectiveCamera
  orbit?: OrbitControls
  transform?: TransformControls
  transformHelper?: THREE.Object3D
  root?: THREE.Group
  selection?: THREE.BoxHelper
  parts: Map<string, THREE.Group>
  collisionHelpers: THREE.BoxHelper[]
  pivotMarker?: THREE.Group
  framingKey?: string
  raf?: number
  observer?: ResizeObserver
}

export default function PropForgeViewport({
  prefab,
  selectedPartId,
  mode,
  topDown,
  showCollision,
  showPivot,
  previewMode,
  focusNonce,
  captureNonce,
  onSelectPart,
  onCommitPart,
  onCaptureThumbnail,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ViewState>({
    parts: new Map(),
    collisionHelpers: [],
  })
  const prefabRef = useRef(prefab)
  const selectRef = useRef(onSelectPart)
  const commitRef = useRef(onCommitPart)
  const captureRef = useRef(onCaptureThumbnail)

  prefabRef.current = prefab
  selectRef.current = onSelectPart
  commitRef.current = onCommitPart
  captureRef.current = onCaptureThumbnail

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.16
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'prop-forge-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b110e)
    scene.fog = new THREE.Fog(0x0b110e, 32, 78)

    const camera = new THREE.PerspectiveCamera(44, 1, .1, 220)
    camera.position.set(7.5, 6.4, 8.5)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = .075
    orbit.target.set(0, .8, 0)
    orbit.minDistance = 2.4
    orbit.maxDistance = 75
    orbit.maxPolarAngle = Math.PI * .495

    const hemisphere = new THREE.HemisphereLight(
      0xd5e1d8,
      0x19231d,
      1.9,
    )
    scene.add(hemisphere)
    const sun = new THREE.DirectionalLight(0xffdfb3, 2.7)
    sun.position.set(-12, 20, 13)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -18
    sun.shadow.camera.right = 18
    sun.shadow.camera.top = 18
    sun.shadow.camera.bottom = -18
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x759783, .58)
    fill.position.set(16, 10, -14)
    scene.add(fill)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({
        color: 0x101813,
        roughness: 1,
      }),
    )
    floor.name = 'PropForgeFloor'
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -.025
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(
      60,
      120,
      0x4c6657,
      0x233229,
    )
    grid.position.y = .006
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = .4
    scene.add(grid)

    const transform = new TransformControls(
      camera,
      renderer.domElement,
    )
    transform.setMode('translate')
    transform.setSize(.78)
    const transformHelper = transform.getHelper()
    scene.add(transformHelper)

    const state: ViewState = {
      renderer,
      scene,
      camera,
      orbit,
      transform,
      transformHelper,
      parts: new Map(),
      collisionHelpers: [],
    }
    stateRef.current = state

    ;(transform as any).addEventListener(
      'dragging-changed',
      (event: { value: boolean }) => {
        orbit.enabled = !event.value
        if (event.value) return

        const object = transform.object
        if (!(object instanceof THREE.Group)) return
        const partId = object.userData.propPartId as string | undefined
        if (!partId) return
        const source = prefabRef.current.parts.find(
          (part) => part.id === partId,
        )
        if (!source) return

        commitRef.current({
          ...source,
          position: [
            round(object.position.x),
            round(Math.max(-20, object.position.y)),
            round(object.position.z),
          ],
          rotation: [
            round(object.rotation.x, 4),
            round(object.rotation.y, 4),
            round(object.rotation.z, 4),
          ],
          scale: [
            round(Math.max(.025, object.scale.x)),
            round(Math.max(.025, object.scale.y)),
            round(Math.max(.025, object.scale.z)),
          ],
        })
      },
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerStart:
      | { x: number; y: number }
      | undefined

    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = (event: PointerEvent) => {
      const start = pointerStart
      pointerStart = undefined
      if (
        !start ||
        previewMode === 'far' ||
        Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        ) > 5
      ) {
        return
      }

      const root = stateRef.current.root
      if (!root) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(root.children, true)

      for (const hit of hits) {
        let current: THREE.Object3D | null = hit.object
        while (current && current !== root) {
          const partId = current.userData.propPartId as
            | string
            | undefined
          if (partId) {
            selectRef.current(partId)
            return
          }
          current = current.parent
        }
      }
      selectRef.current(undefined)
    }

    renderer.domElement.addEventListener(
      'pointerdown',
      onPointerDown,
    )
    renderer.domElement.addEventListener(
      'pointerup',
      onPointerUp,
    )

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    state.observer = observer
    resize()

    const frame = () => {
      orbit.update()
      state.selection?.update()
      state.collisionHelpers.forEach((helper) => helper.update())
      renderer.render(scene, camera)
      state.raf = requestAnimationFrame(frame)
    }
    state.raf = requestAnimationFrame(frame)

    return () => {
      if (state.raf) cancelAnimationFrame(state.raf)
      observer.disconnect()
      renderer.domElement.removeEventListener(
        'pointerdown',
        onPointerDown,
      )
      renderer.domElement.removeEventListener(
        'pointerup',
        onPointerUp,
      )
      orbit.dispose()
      transform.detach()
      transform.dispose()
      clearSelection(state)
      clearCollisionHelpers(state)
      if (state.pivotMarker) {
        scene.remove(state.pivotMarker)
        disposePropVisual(state.pivotMarker)
      }
      if (state.root) {
        scene.remove(state.root)
        disposePropVisual(state.root)
      }
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = {
        parts: new Map(),
        collisionHelpers: [],
      }
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (
      !state.scene ||
      !state.camera ||
      !state.orbit ||
      !state.transform
    ) {
      return
    }

    state.transform.detach()
    clearSelection(state)
    clearCollisionHelpers(state)
    state.parts.clear()

    if (state.root) {
      state.scene.remove(state.root)
      disposePropVisual(state.root)
    }
    if (state.pivotMarker) {
      state.scene.remove(state.pivotMarker)
      disposePropVisual(state.pivotMarker)
      state.pivotMarker = undefined
    }

    const root = new THREE.Group()
    root.name = 'PropForgeAsset'

    if (previewMode === 'far') {
      root.add(buildPropFarProxy(prefab))
    } else {
      const content = new THREE.Group()
      content.name = 'PropForgeContent'
      content.position.set(
        -prefab.pivot[0],
        -prefab.pivot[1],
        -prefab.pivot[2],
      )
      root.add(content)

      for (const part of prefab.parts) {
        const object = buildPropPartObject(part)
        state.parts.set(part.id, object)
        content.add(object)
      }
    }

    state.root = root
    state.scene.add(root)

    if (showPivot) {
      const pivotMarker = buildPropPivotMarker()
      state.scene.add(pivotMarker)
      state.pivotMarker = pivotMarker
    }

    if (showCollision && previewMode === 'full') {
      rebuildCollisionHelpers(state, prefab)
    }

    attachSelection(
      state,
      previewMode === 'full' ? selectedPartId : undefined,
    )

    const framingKey = prefab.id
    if (state.framingKey !== framingKey) {
      framePrefab(state, prefab, topDown)
      state.framingKey = framingKey
    }
  }, [
    prefab,
    previewMode,
    showCollision,
    showPivot,
  ])

  useEffect(() => {
    const state = stateRef.current
    if (!state.transform) return
    state.transform.setMode(mode)
    state.transform.setTranslationSnap(
      prefab.snap ? prefab.gridSize : null,
    )
    state.transform.setRotationSnap(
      prefab.snap ? Math.PI / 12 : null,
    )
    state.transform.setScaleSnap(
      prefab.snap ? .05 : null,
    )
  }, [mode, prefab.snap, prefab.gridSize])

  useEffect(() => {
    attachSelection(
      stateRef.current,
      previewMode === 'full' ? selectedPartId : undefined,
    )
  }, [selectedPartId, previewMode])

  useEffect(() => {
    const state = stateRef.current
    if (!state.camera || !state.orbit) return

    const part = selectedPartId
      ? state.parts.get(selectedPartId)
      : undefined

    if (topDown) {
      const x = part?.position.x ?? 0
      const z = part?.position.z ?? 0
      const bounds = propPrefabBounds(prefab)
      const height = Math.max(
        6,
        Math.max(bounds.width, bounds.depth) * 2.2,
      )
      state.orbit.target.set(x, 0, z)
      state.camera.position.set(x, height, z + .01)
      state.camera.lookAt(state.orbit.target)
      state.orbit.update()
      return
    }

    if (focusNonce > 0 && part) {
      const center = new THREE.Vector3()
      part.getWorldPosition(center)
      state.orbit.target.copy(center)
      state.camera.position.set(
        center.x + 3.8,
        center.y + 3.1,
        center.z + 4.4,
      )
      state.camera.lookAt(center)
      state.orbit.update()
    } else if (focusNonce > 0) {
      framePrefab(state, prefab, false)
    }
  }, [topDown, focusNonce])

  useEffect(() => {
    if (captureNonce <= 0) return
    const state = stateRef.current
    if (
      !state.renderer ||
      !state.scene ||
      !state.camera
    ) {
      return
    }
    state.renderer.render(state.scene, state.camera)
    const thumbnail = captureThumbnail(
      state.renderer.domElement,
    )
    captureRef.current(thumbnail)
  }, [captureNonce])

  const bounds = propPrefabBounds(prefab)
  const selected = selectedPartId
    ? prefab.parts.find((part) => part.id === selectedPartId)
    : undefined

  return (
    <div className="prop-forge-viewport" ref={hostRef}>
      <div className="prop-viewport-badge">
        <span>
          {bounds.width.toFixed(1)} × {bounds.height.toFixed(1)} × {bounds.depth.toFixed(1)} m
        </span>
        <strong>
          {previewMode === 'far'
            ? `LOD proxy · ${prefab.lod.farDistance}m`
            : selected?.name ?? 'Click a part to select'}
        </strong>
      </div>
      <div className="prop-viewport-axis">
        <span className="x">X</span>
        <span className="y">Y</span>
        <span className="z">Z</span>
      </div>
    </div>
  )
}

function rebuildCollisionHelpers(
  state: ViewState,
  prefab: PropPrefab,
) {
  clearCollisionHelpers(state)
  if (!state.scene) return

  for (const part of prefab.parts) {
    if (!part.collision) continue
    const object = state.parts.get(part.id)
    if (!object) continue
    const helper = new THREE.BoxHelper(
      object,
      0xff725d,
    )
    helper.name = `CollisionHelper_${part.id}`
    helper.renderOrder = 94
    const material = helper.material as THREE.LineBasicMaterial
    material.transparent = true
    material.opacity = .42
    material.depthTest = false
    state.scene.add(helper)
    state.collisionHelpers.push(helper)
  }
}

function clearCollisionHelpers(state: ViewState) {
  if (!state.scene) {
    state.collisionHelpers = []
    return
  }
  for (const helper of state.collisionHelpers) {
    state.scene.remove(helper)
    helper.geometry.dispose()
    ;(helper.material as THREE.Material).dispose()
  }
  state.collisionHelpers = []
}

function attachSelection(
  state: ViewState,
  selectedPartId?: string,
) {
  if (!state.scene || !state.transform) return
  state.transform.detach()
  clearSelection(state)

  if (!selectedPartId) return
  const selected = state.parts.get(selectedPartId)
  if (!selected) return

  state.transform.attach(selected)
  const helper = new THREE.BoxHelper(
    selected,
    0x8fd7a7,
  )
  const material = helper.material as THREE.LineBasicMaterial
  material.transparent = true
  material.opacity = .84
  material.depthTest = false
  helper.renderOrder = 96
  state.scene.add(helper)
  state.selection = helper
}

function clearSelection(state: ViewState) {
  if (!state.selection || !state.scene) return
  state.scene.remove(state.selection)
  state.selection.geometry.dispose()
  ;(state.selection.material as THREE.Material).dispose()
  state.selection = undefined
}

function framePrefab(
  state: ViewState,
  prefab: PropPrefab,
  topDown: boolean,
) {
  if (!state.camera || !state.orbit) return
  const bounds = propPrefabBounds(prefab)
  const span = Math.max(
    1.5,
    bounds.width,
    bounds.height,
    bounds.depth,
  )
  const targetY = Math.max(.35, bounds.height * .42)
  state.orbit.target.set(0, targetY, 0)

  if (topDown) {
    state.camera.position.set(
      0,
      Math.max(6, span * 2.25),
      .01,
    )
  } else {
    state.camera.position.set(
      span * 1.45,
      span * 1.05,
      span * 1.6,
    )
  }
  state.camera.lookAt(state.orbit.target)
  state.orbit.minDistance = Math.max(1.4, span * .55)
  state.orbit.maxDistance = Math.max(30, span * 9)
  state.orbit.update()
}

function captureThumbnail(
  source: HTMLCanvasElement,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 200
  const context = canvas.getContext('2d')
  if (!context) {
    return source.toDataURL('image/jpeg', .72)
  }

  const sourceRatio = source.width / source.height
  const targetRatio = canvas.width / canvas.height
  let sx = 0
  let sy = 0
  let sw = source.width
  let sh = source.height

  if (sourceRatio > targetRatio) {
    sw = source.height * targetRatio
    sx = (source.width - sw) * .5
  } else {
    sh = source.width / targetRatio
    sy = (source.height - sh) * .5
  }

  context.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL('image/jpeg', .72)
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
