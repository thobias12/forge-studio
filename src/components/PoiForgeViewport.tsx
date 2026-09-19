import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type {
  PoiMaterialPreset,
  PoiPrefab,
  PoiPrefabPart,
} from '../lib/poiPrefab'

export type PoiForgeTransformMode = 'translate' | 'rotate' | 'scale'

type Props = {
  prefab: PoiPrefab
  selectedPartId?: string
  mode: PoiForgeTransformMode
  topDown: boolean
  focusNonce: number
  onSelectPart: (partId?: string) => void
  onCommitPart: (part: PoiPrefabPart) => void
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
  raf?: number
  observer?: ResizeObserver
}

export default function PoiForgeViewport({
  prefab,
  selectedPartId,
  mode,
  topDown,
  focusNonce,
  onSelectPart,
  onCommitPart,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ViewState>({ parts: new Map() })
  const prefabRef = useRef(prefab)
  const selectRef = useRef(onSelectPart)
  const commitRef = useRef(onCommitPart)

  prefabRef.current = prefab
  selectRef.current = onSelectPart
  commitRef.current = onCommitPart

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.14
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'poi-forge-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0c1210)
    scene.fog = new THREE.Fog(0x0c1210, 36, 82)

    const camera = new THREE.PerspectiveCamera(44, 1, .1, 240)
    camera.position.set(15, 13, 17)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = .075
    orbit.target.set(0, 1.4, 0)
    orbit.minDistance = 4
    orbit.maxDistance = 65
    orbit.maxPolarAngle = Math.PI * .495

    const hemisphere = new THREE.HemisphereLight(0xd6e2d7, 0x1b241e, 1.85)
    scene.add(hemisphere)
    const sun = new THREE.DirectionalLight(0xffe1b9, 2.5)
    sun.position.set(-14, 24, 13)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -25
    sun.shadow.camera.right = 25
    sun.shadow.camera.top = 25
    sun.shadow.camera.bottom = -25
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x789b87, .55)
    fill.position.set(18, 12, -16)
    scene.add(fill)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({
        color: 0x101a14,
        roughness: 1,
        metalness: 0,
      }),
    )
    floor.name = 'PoiForgeFloor'
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -.025
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(60, 60, 0x4f6859, 0x25332b)
    grid.position.y = .006
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = .42
    scene.add(grid)

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode('translate')
    transform.setSize(.82)
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
    }
    stateRef.current = state

    ;(transform as any).addEventListener(
      'dragging-changed',
      (event: { value: boolean }) => {
        orbit.enabled = !event.value
        if (event.value) return
        const object = transform.object
        if (!(object instanceof THREE.Group)) return
        const partId = object.userData.poiPartId as string | undefined
        if (!partId) return
        const source = prefabRef.current.parts.find((part) => part.id === partId)
        if (!source) return
        commitRef.current({
          ...source,
          position: [
            round(object.position.x),
            round(Math.max(0, object.position.y)),
            round(object.position.z),
          ],
          rotation: [
            round(object.rotation.x, 4),
            round(object.rotation.y, 4),
            round(object.rotation.z, 4),
          ],
          scale: [
            round(Math.max(.05, object.scale.x)),
            round(Math.max(.05, object.scale.y)),
            round(Math.max(.05, object.scale.z)),
          ],
        })
      },
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onPointerDown = (event: PointerEvent) => {
      if ((transform as any).axis) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const root = stateRef.current.root
      if (!root) return
      const hits = raycaster.intersectObjects(root.children, true)
      const target = hits.find((hit) => {
        let current: THREE.Object3D | null = hit.object
        while (current && current !== root) {
          if (current.userData.poiPartId) return true
          current = current.parent
        }
        return false
      })
      if (!target) {
        selectRef.current(undefined)
        return
      }
      let current: THREE.Object3D | null = target.object
      while (current && current !== root) {
        const partId = current.userData.poiPartId as string | undefined
        if (partId) {
          selectRef.current(partId)
          return
        }
        current = current.parent
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)

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
      renderer.render(scene, camera)
      state.raf = requestAnimationFrame(frame)
    }
    state.raf = requestAnimationFrame(frame)

    return () => {
      if (state.raf) cancelAnimationFrame(state.raf)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      orbit.dispose()
      transform.detach()
      transform.dispose()
      disposeObject(state.root)
      if (state.selection) {
        scene.remove(state.selection)
        state.selection.geometry.dispose()
        ;(state.selection.material as THREE.Material).dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = { parts: new Map() }
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state.scene) return

    if (state.root) {
      state.scene.remove(state.root)
      disposeObject(state.root)
    }
    state.parts.clear()

    const root = new THREE.Group()
    root.name = 'PoiForgePrefab'
    addFootprint(root, prefab)

    for (const part of prefab.parts) {
      const object = buildPart(part)
      state.parts.set(part.id, object)
      root.add(object)
    }

    state.root = root
    state.scene.add(root)
    attachSelection(state, selectedPartId)
  }, [prefab])

  useEffect(() => {
    const state = stateRef.current
    if (!state.transform) return
    state.transform.setMode(mode)
    state.transform.setTranslationSnap(prefab.snap ? prefab.gridSize : null)
    state.transform.setRotationSnap(prefab.snap ? Math.PI / 12 : null)
    state.transform.setScaleSnap(prefab.snap ? .1 : null)
  }, [mode, prefab.snap, prefab.gridSize])

  useEffect(() => {
    attachSelection(stateRef.current, selectedPartId)
  }, [selectedPartId, prefab.parts.length])

  useEffect(() => {
    const state = stateRef.current
    if (!state.camera || !state.orbit) return
    const part = selectedPartId ? state.parts.get(selectedPartId) : undefined

    if (topDown) {
      state.orbit.target.set(
        part?.position.x ?? 0,
        0,
        part?.position.z ?? 0,
      )
      state.camera.position.set(
        part?.position.x ?? 0,
        28,
        (part?.position.z ?? 0) + .01,
      )
    } else if (part && focusNonce > 0) {
      state.orbit.target.copy(part.position)
      state.orbit.target.y = Math.max(.4, part.position.y)
      state.camera.position.set(
        part.position.x + 7.5,
        part.position.y + 6.5,
        part.position.z + 8.5,
      )
    } else {
      const span = Math.max(prefab.bounds.width, prefab.bounds.depth)
      state.orbit.target.set(0, 1.2, 0)
      state.camera.position.set(span * .82, span * .68, span * .92)
    }
    state.camera.lookAt(state.orbit.target)
    state.orbit.update()
  }, [topDown, focusNonce])

  const selected = selectedPartId
    ? prefab.parts.find((part) => part.id === selectedPartId)
    : undefined

  return (
    <div className="poi-forge-viewport" ref={hostRef}>
      <div className="poi-viewport-badge">
        <span>{prefab.bounds.width.toFixed(0)} × {prefab.bounds.depth.toFixed(0)} m</span>
        <strong>{selected ? selected.name : 'Click a part to select'}</strong>
      </div>
      <div className="poi-viewport-axis">
        <span className="x">X</span><span className="y">Y</span><span className="z">Z</span>
      </div>
    </div>
  )
}

function attachSelection(state: ViewState, selectedPartId?: string) {
  if (!state.scene || !state.transform) return
  const selected = selectedPartId ? state.parts.get(selectedPartId) : undefined
  state.transform.detach()

  if (state.selection) {
    state.scene.remove(state.selection)
    state.selection.geometry.dispose()
    ;(state.selection.material as THREE.Material).dispose()
    state.selection = undefined
  }

  if (!selected) return
  state.transform.attach(selected)
  const helper = new THREE.BoxHelper(selected, 0x8fd7a7)
  ;(helper.material as THREE.LineBasicMaterial).transparent = true
  ;(helper.material as THREE.LineBasicMaterial).opacity = .78
  state.scene.add(helper)
  state.selection = helper
}

function addFootprint(root: THREE.Group, prefab: PoiPrefab) {
  const width = prefab.bounds.width
  const depth = prefab.bounds.depth
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      color: 0x4d725c,
      transparent: true,
      opacity: .075,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  plane.name = 'PoiForgeFootprint'
  plane.rotation.x = -Math.PI / 2
  plane.position.y = .012
  root.add(plane)

  const points = [
    new THREE.Vector3(-width / 2, .035, -depth / 2),
    new THREE.Vector3(width / 2, .035, -depth / 2),
    new THREE.Vector3(width / 2, .035, depth / 2),
    new THREE.Vector3(-width / 2, .035, depth / 2),
  ]
  const geometry = new THREE.BufferGeometry().setFromPoints([
    ...points,
    points[0],
  ])
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x6ca57e,
      transparent: true,
      opacity: .78,
    }),
  )
  line.name = 'PoiForgeFootprintOutline'
  root.add(line)
}

function buildPart(part: PoiPrefabPart) {
  const root = new THREE.Group()
  root.name = `PoiPart_${part.kind}`
  root.userData.poiPartId = part.id
  root.position.set(...part.position)
  root.rotation.set(...part.rotation)
  root.scale.set(...part.scale)

  if (part.kind === 'entry') {
    const material = new THREE.MeshBasicMaterial({
      color: 0x75d394,
      transparent: true,
      opacity: .9,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.52, .055, 6, 22),
      material,
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = .055
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(.16, .48, 6),
      material,
    )
    arrow.rotation.x = Math.PI / 2
    arrow.position.set(0, .11, -.7)
    root.add(ring, arrow)
    return root
  }

  if (part.kind === 'torch') {
    const wood = materialForPart({
      ...part,
      material: 'wood',
      color: undefined,
    })
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(.055, .075, 1.2, 6),
      wood,
    )
    post.position.y = .6
    post.castShadow = true
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(.12, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffb25e,
        emissive: 0xff6e28,
        emissiveIntensity: 2,
        roughness: .45,
      }),
    )
    ember.position.y = 1.25
    const glow = new THREE.PointLight(0xff8b3d, 1.45, 7)
    glow.position.y = 1.3
    root.add(post, ember, glow)
    return root
  }

  const material = materialForPart(part)
  let geometry: THREE.BufferGeometry
  if (part.kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(.5, .54, 1, 8)
  } else if (part.kind === 'rock') {
    geometry = new THREE.DodecahedronGeometry(.5, 0)
  } else if (part.kind === 'tent') {
    geometry = new THREE.ConeGeometry(.58, 1, 4)
    geometry.rotateY(Math.PI / 4)
  } else if (part.kind === 'log') {
    geometry = new THREE.CylinderGeometry(.5, .5, 1, 7)
    geometry.rotateZ(Math.PI / 2)
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1)
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.poiPartId = part.id
  mesh.castShadow = part.kind !== 'log' || part.scale[1] > .1
  mesh.receiveShadow = true
  root.add(mesh)
  return root
}

function materialForPart(part: PoiPrefabPart) {
  const preset = materialPreset(part.material)
  const color = part.color
    ? new THREE.Color(part.color)
    : new THREE.Color(preset.color)
  return new THREE.MeshStandardMaterial({
    color,
    emissive: preset.emissive,
    emissiveIntensity: preset.emissiveIntensity,
    roughness: preset.roughness,
    metalness: preset.metalness,
  })
}

function materialPreset(material: PoiMaterialPreset) {
  if (material === 'dark-stone') {
    return { color: 0x3f433d, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  if (material === 'wood') {
    return { color: 0x5b412d, emissive: 0x000000, emissiveIntensity: 0, roughness: .96, metalness: 0 }
  }
  if (material === 'cloth') {
    return { color: 0x6a5941, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  if (material === 'earth') {
    return { color: 0x514634, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  if (material === 'bone') {
    return { color: 0xbcb49a, emissive: 0x000000, emissiveIntensity: 0, roughness: .9, metalness: 0 }
  }
  if (material === 'metal') {
    return { color: 0x606966, emissive: 0x000000, emissiveIntensity: 0, roughness: .55, metalness: .55 }
  }
  if (material === 'moss') {
    return { color: 0x415c3d, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  return { color: 0x686b61, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
}

function disposeObject(root?: THREE.Object3D) {
  if (!root) return
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material]
      list.forEach((material) => materials.add(material))
    }
  })
  materials.forEach((material) => material.dispose())
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
