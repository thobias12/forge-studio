import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { parseCharacterPackage, characterPackageDataToBlob } from '../lib/characterPackage'
import { parseMaterialPackage, dataUrlToBlob } from '../lib/materialPackage'
import { mapCharacterRig } from '../lib/characterRig'
import type { LibraryAsset } from '../lib/library'

export type PreviewEnvironment = 'studio' | 'neutral' | 'night'
export type PreviewShape = 'sphere' | 'cube' | 'plane'

export type GamePreviewReport = {
  meshes: number
  triangles: number
  materials: number
  textures: number
  drawCalls: number
  animations: Array<{ name: string; duration: number }>
  bounds: [number, number, number]
  warnings: string[]
}

type Props = {
  asset?: LibraryAsset
  environment: PreviewEnvironment
  shape: PreviewShape
  showGrid: boolean
  showBounds: boolean
  wireframe: boolean
  playing: boolean
  speed: number
  clipName: string
  onReport: (report?: GamePreviewReport) => void
}

type State = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  root?: THREE.Object3D
  mixer?: THREE.AnimationMixer
  clips: THREE.AnimationClip[]
  action?: THREE.AnimationAction
  boundsHelper?: THREE.Box3Helper
  tempUrls: string[]
  hemi: THREE.HemisphereLight
  key: THREE.DirectionalLight
  rim: THREE.DirectionalLight
}

export default function GamePreviewViewport(props: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<State>()
  const playingRef = useRef(props.playing)
  const speedRef = useRef(props.speed)
  playingRef.current = props.playing
  speedRef.current = props.speed

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200)
    camera.position.set(3.2, 2.3, 4.6)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)

    const hemi = new THREE.HemisphereLight(0xe5efff, 0x111722, 2)
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(4, 7, 5)
    key.castShadow = true
    const rim = new THREE.DirectionalLight(0x7eafff, 1.25)
    rim.position.set(-4, 3, -4)
    scene.add(hemi, key, rim)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x101821, roughness: 0.95, metalness: 0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const grid = new THREE.GridHelper(20, 40, 0x2d4259, 0x182635)
    grid.name = 'ForgePreviewGrid'
    grid.position.y = 0.003
    scene.add(grid)

    const state: State = { scene, camera, controls, clips: [], tempUrls: [], hemi, key, rim }
    stateRef.current = state

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const clock = new THREE.Clock()
    let raf = 0
    const render = () => {
      const delta = Math.min(0.05, clock.getDelta())
      if (playingRef.current) state.mixer?.update(delta * speedRef.current)
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      clearLoaded(state)
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    applyEnvironment(state, props.environment)
  }, [props.environment])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    const grid = state.scene.getObjectByName('ForgePreviewGrid')
    if (grid) grid.visible = props.showGrid
  }, [props.showGrid])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    let cancelled = false
    clearLoaded(state)
    props.onReport(undefined)
    if (!props.asset) return

    void loadAsset(props.asset, props.shape, state).then(({ root, clips }) => {
      if (cancelled) {
        disposeObject(root)
        return
      }
      state.root = root
      state.clips = clips
      state.scene.add(root)
      fitRoot(state, root)
      applyWireframe(root, props.wireframe)
      updateBounds(state, props.showBounds)
      const report = analyzeObject(root, clips)
      props.onReport(report)
      if (clips.length) {
        state.mixer = new THREE.AnimationMixer(root)
        const clip = clips.find((item) => item.name === props.clipName) ?? clips[0]
        state.action = state.mixer.clipAction(clip)
        state.action.play()
      }
    }).catch((error) => {
      if (!cancelled) props.onReport({ meshes: 0, triangles: 0, materials: 0, textures: 0, drawCalls: 0, animations: [], bounds: [0, 0, 0], warnings: [error instanceof Error ? error.message : 'Could not load preview asset.'] })
    })

    return () => { cancelled = true }
  }, [props.asset?.id, props.asset?.updatedAt, props.shape])

  useEffect(() => {
    const state = stateRef.current
    if (!state?.root) return
    applyWireframe(state.root, props.wireframe)
  }, [props.wireframe])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    updateBounds(state, props.showBounds)
  }, [props.showBounds])

  useEffect(() => {
    const state = stateRef.current
    if (!state?.mixer || !state.clips.length) return
    const next = state.clips.find((item) => item.name === props.clipName) ?? state.clips[0]
    if (!next) return
    state.action?.fadeOut(0.12)
    state.action = state.mixer.clipAction(next)
    state.action.reset().fadeIn(0.12).play()
  }, [props.clipName])

  return <div className="game-preview-canvas" ref={mountRef} />
}

async function loadAsset(asset: LibraryAsset, shape: PreviewShape, state: State) {
  if (asset.category === 'characters') {
    const character = await parseCharacterPackage(asset.blob)
    if (character) return loadCharacterPackage(character, state)
  }
  if (asset.category === 'materials') {
    const material = await parseMaterialPackage(asset.blob)
    if (material) return loadMaterialPackage(material, shape, state)
  }
  if (asset.kind === 'glb') {
    const url = makeUrl(asset.blob, state)
    const gltf = await new GLTFLoader().loadAsync(url)
    prepMeshes(gltf.scene)
    return { root: gltf.scene, clips: gltf.animations }
  }
  if (asset.kind === 'image') {
    const url = makeUrl(asset.blob, state)
    const texture = await new THREE.TextureLoader().loadAsync(url)
    texture.colorSpace = THREE.SRGBColorSpace
    const aspect = imageAspect(texture)
    const root = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
    root.rotation.x = -Math.PI / 2
    root.position.y = 0.01
    return { root, clips: [] as THREE.AnimationClip[] }
  }
  throw new Error('This asset type is not previewable yet.')
}

async function loadCharacterPackage(character: Awaited<ReturnType<typeof parseCharacterPackage>> & {}, state: State) {
  const loader = new GLTFLoader()
  const baseUrl = makeUrl(characterPackageDataToBlob(character.base.data), state)
  const gltf = await loader.loadAsync(baseUrl)
  const root = gltf.scene
  prepMeshes(root)
  const mapped = mapCharacterRig(root).rig

  for (const item of character.attachments) {
    const target = mapped[item.targetBone]
    if (!target) continue
    const url = makeUrl(characterPackageDataToBlob(item.data), state)
    const part = await loader.loadAsync(url)
    prepMeshes(part.scene)
    const wrapper = new THREE.Group()
    wrapper.name = `ForgeAttachment_${item.slot}`
    wrapper.add(part.scene)
    wrapper.position.fromArray(item.transform.position)
    wrapper.rotation.set(...item.transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number])
    wrapper.scale.fromArray(item.transform.scale)
    target.add(wrapper)
  }
  return { root, clips: gltf.animations }
}

async function loadMaterialPackage(material: Awaited<ReturnType<typeof parseMaterialPackage>> & {}, shape: PreviewShape, state: State) {
  const loader = new THREE.TextureLoader()
  const repeat = Math.max(0.01, material.parameters.repeat || 1)
  const load = async (key: keyof typeof material.channels, srgb = false) => {
    const entry = material.channels[key]
    if (!entry) return undefined
    const texture = await loader.loadAsync(makeUrl(dataUrlToBlob(entry.data), state))
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat, repeat)
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([load('baseColor', true), load('normal'), load('roughness'), load('ao')])
  const surface = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, aoMap, roughness: material.parameters.roughness, metalness: material.parameters.metalness })
  surface.normalScale.set(material.parameters.normalStrength, material.parameters.normalStrength)
  let geometry: THREE.BufferGeometry
  if (shape === 'cube') geometry = new THREE.BoxGeometry(1.7, 1.7, 1.7, 6, 6, 6)
  else if (shape === 'plane') geometry = new THREE.PlaneGeometry(3, 3, 16, 16)
  else geometry = new THREE.SphereGeometry(1.15, 64, 48)
  const mesh = new THREE.Mesh(geometry, surface)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.y = shape === 'plane' ? 0.02 : 1.2
  if (shape === 'plane') mesh.rotation.x = -Math.PI / 2
  return { root: mesh, clips: [] as THREE.AnimationClip[] }
}

function prepMeshes(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
}

function analyzeObject(root: THREE.Object3D, clips: THREE.AnimationClip[]): GamePreviewReport {
  let meshes = 0
  let triangles = 0
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  let largestTexture = 0

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    meshes += 1
    const position = mesh.geometry.getAttribute('position')
    triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : position ? position.count / 3 : 0
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of list) {
      materials.add(material)
      const record = material as unknown as Record<string, unknown>
      for (const value of Object.values(record)) {
        const texture = value as THREE.Texture
        if (!texture?.isTexture) continue
        textures.add(texture)
        const image = texture.image as { width?: number; height?: number } | undefined
        largestTexture = Math.max(largestTexture, image?.width ?? 0, image?.height ?? 0)
      }
    }
  })

  const box = new THREE.Box3().setFromObject(root)
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3())
  const warnings: string[] = []
  if (triangles > 150_000) warnings.push(`High triangle count: ${Math.round(triangles).toLocaleString()}. Consider LODs or mesh simplification.`)
  else if (triangles > 75_000) warnings.push(`Moderate triangle count: ${Math.round(triangles).toLocaleString()}. Check your target platform.`)
  if (materials.size > 12) warnings.push(`${materials.size} materials can increase draw calls. Consider atlasing compatible surfaces.`)
  if (textures.size > 16) warnings.push(`${textures.size} textures are loaded by this asset.`)
  if (largestTexture > 4096) warnings.push(`A texture exceeds 4096 px (${largestTexture}px). Consider reducing it for runtime use.`)
  if (Math.max(size.x, size.y, size.z) > 25) warnings.push('Asset bounds are unusually large. Check export scale/units.')
  if (Math.max(size.x, size.y, size.z) > 0 && Math.max(size.x, size.y, size.z) < 0.02) warnings.push('Asset bounds are extremely small. Check export scale/units.')
  if (!warnings.length) warnings.push('No obvious runtime issues detected.')

  return {
    meshes,
    triangles: Math.round(triangles),
    materials: materials.size,
    textures: textures.size,
    drawCalls: meshes,
    animations: clips.map((clip) => ({ name: clip.name || 'Unnamed clip', duration: clip.duration })),
    bounds: [size.x, size.y, size.z],
    warnings,
  }
}

function applyWireframe(root: THREE.Object3D, enabled: boolean) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of list) {
      if ('wireframe' in material) {
        ;(material as THREE.MeshStandardMaterial).wireframe = enabled
        material.needsUpdate = true
      }
    }
  })
}

function updateBounds(state: State, show: boolean) {
  if (state.boundsHelper) {
    state.scene.remove(state.boundsHelper)
    state.boundsHelper.dispose()
    state.boundsHelper = undefined
  }
  if (!show || !state.root) return
  const box = new THREE.Box3().setFromObject(state.root)
  if (box.isEmpty()) return
  state.boundsHelper = new THREE.Box3Helper(box, 0x72b8ff)
  state.scene.add(state.boundsHelper)
}

function fitRoot(state: State, root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(0.4, size.length() * 0.55)
  state.controls.target.copy(center)
  state.camera.position.set(center.x + radius * 1.25, center.y + radius * 0.55, center.z + radius * 1.85)
  state.camera.near = Math.max(0.005, radius / 300)
  state.camera.far = Math.max(50, radius * 30)
  state.camera.updateProjectionMatrix()
  state.controls.update()
}

function applyEnvironment(state: State, environment: PreviewEnvironment) {
  if (environment === 'night') {
    state.scene.background = new THREE.Color(0x03060a)
    state.hemi.intensity = 0.55
    state.key.intensity = 1.35
    state.rim.intensity = 2.2
  } else if (environment === 'neutral') {
    state.scene.background = new THREE.Color(0x161a1f)
    state.hemi.intensity = 2.3
    state.key.intensity = 2.2
    state.rim.intensity = 0.7
  } else {
    state.scene.background = new THREE.Color(0x080d14)
    state.hemi.intensity = 2
    state.key.intensity = 3.2
    state.rim.intensity = 1.25
  }
}

function clearLoaded(state: State) {
  state.mixer?.stopAllAction()
  state.mixer = undefined
  state.action = undefined
  state.clips = []
  if (state.boundsHelper) {
    state.scene.remove(state.boundsHelper)
    state.boundsHelper.dispose()
    state.boundsHelper = undefined
  }
  if (state.root) {
    state.scene.remove(state.root)
    disposeObject(state.root)
    state.root = undefined
  }
  for (const url of state.tempUrls) URL.revokeObjectURL(url)
  state.tempUrls = []
}

function makeUrl(blob: Blob, state: State) {
  const url = URL.createObjectURL(blob)
  state.tempUrls.push(url)
  return url
}

function imageAspect(texture: THREE.Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined
  return Math.max(0.2, Math.min(5, (image?.width ?? 1) / Math.max(1, image?.height ?? 1)))
}

function disposeObject(root?: THREE.Object3D) {
  if (!root) return
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of list) {
      const record = material as unknown as Record<string, unknown>
      for (const value of Object.values(record)) if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose()
      material.dispose()
    }
  })
}
