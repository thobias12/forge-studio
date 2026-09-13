import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type TexturePreviewShape = 'sphere' | 'cube' | 'plane'

type Props = {
  baseColorUrl?: string
  normalUrl?: string
  roughnessUrl?: string
  aoUrl?: string
  repeat: number
  roughness: number
  metalness: number
  normalStrength: number
  shape: TexturePreviewShape
}

export default function TextureMaterialPreview({ baseColorUrl, normalUrl, roughnessUrl, aoUrl, repeat, roughness, metalness, normalStrength, shape }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<{ material: THREE.MeshStandardMaterial; mesh: THREE.Mesh; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls }>()

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#090d13')
    scene.fog = new THREE.Fog('#090d13', 7, 16)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    camera.position.set(2.5, 1.8, 3.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.8, 0)
    controls.minDistance = 1.8
    controls.maxDistance = 7

    scene.add(new THREE.HemisphereLight(0xdcecff, 0x111827, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.5)
    key.position.set(3.5, 5, 4)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x78aef5, 1.6)
    rim.position.set(-4, 2.2, -3)
    scene.add(rim)

    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshStandardMaterial({ color: 0x111a25, roughness: 0.92, metalness: 0.02 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    ground.receiveShadow = true
    scene.add(ground)
    scene.add(new THREE.GridHelper(8, 20, 0x26384d, 0x182230))

    const material = new THREE.MeshStandardMaterial({ color: 0x9ba9b8, roughness: 0.62, metalness: 0 })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 96, 64), material)
    mesh.position.y = 0.95
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    stateRef.current = { material, mesh, renderer, scene, camera, controls }

    const resize = () => {
      const width = mount.clientWidth || 1
      const height = mount.clientHeight || 1
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let raf = 0
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        const candidate = object as THREE.Mesh
        candidate.geometry?.dispose?.()
        if (Array.isArray(candidate.material)) candidate.material.forEach((item) => item.dispose())
        else candidate.material?.dispose?.()
      })
      material.map?.dispose(); material.normalMap?.dispose(); material.roughnessMap?.dispose(); material.aoMap?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    state.material.roughness = roughness
    state.material.metalness = metalness
    state.material.normalScale.set(normalStrength, normalStrength)
    state.material.needsUpdate = true
  }, [roughness, metalness, normalStrength])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    const oldGeometry = state.mesh.geometry
    if (shape === 'cube') state.mesh.geometry = new THREE.BoxGeometry(1.55, 1.55, 1.55, 8, 8, 8)
    else if (shape === 'plane') state.mesh.geometry = new THREE.PlaneGeometry(2, 2, 32, 32)
    else state.mesh.geometry = new THREE.SphereGeometry(0.9, 96, 64)
    state.mesh.position.y = shape === 'plane' ? 1.05 : 0.95
    if (shape === 'plane') state.mesh.rotation.x = -0.15
    else state.mesh.rotation.set(0, 0, 0)
    oldGeometry.dispose()
  }, [shape])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    let cancelled = false
    const loader = new THREE.TextureLoader()
    const apply = async (url: string | undefined, key: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', color = false) => {
      const previous = state.material[key]
      if (!url) {
        if (previous) previous.dispose()
        state.material[key] = null
        state.material.needsUpdate = true
        return
      }
      try {
        const texture = await loader.loadAsync(url)
        if (cancelled) { texture.dispose(); return }
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(repeat, repeat)
        texture.anisotropy = Math.min(8, state.renderer.capabilities.getMaxAnisotropy())
        if (color) texture.colorSpace = THREE.SRGBColorSpace
        else texture.colorSpace = THREE.NoColorSpace
        if (previous && previous !== texture) previous.dispose()
        state.material[key] = texture
        if (key === 'aoMap') state.material.aoMapIntensity = 1
        state.material.needsUpdate = true
      } catch {}
    }
    void apply(baseColorUrl, 'map', true)
    void apply(normalUrl, 'normalMap')
    void apply(roughnessUrl, 'roughnessMap')
    void apply(aoUrl, 'aoMap')
    return () => { cancelled = true }
  }, [baseColorUrl, normalUrl, roughnessUrl, aoUrl])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    for (const texture of [state.material.map, state.material.normalMap, state.material.roughnessMap, state.material.aoMap]) {
      texture?.repeat.set(repeat, repeat)
      if (texture) texture.needsUpdate = true
    }
  }, [repeat])

  return <div className="texture-material-preview" ref={mountRef} />
}
