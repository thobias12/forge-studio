import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type Props = { src?: string }

export default function ModelViewer({ src }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#090c12')
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
    camera.position.set(3.8, 2.7, 5.2)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xc8dcff, 0x1a1d25, 2.2))
    const light = new THREE.DirectionalLight(0xffffff, 3.6)
    light.position.set(5, 8, 4)
    scene.add(light)
    scene.add(new THREE.GridHelper(16, 32, 0x2f3b4d, 0x17202b))

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)

    let root: THREE.Object3D | undefined
    let mixer: THREE.AnimationMixer | undefined
    const clock = new THREE.Clock()

    const fallback = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: 0x34445a, roughness: 0.65, metalness: 0.05 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.2, 6, 16), mat)
    body.position.y = 1.3
    fallback.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), mat)
    head.position.y = 2.25
    fallback.add(head)
    scene.add(fallback)

    if (src) {
      const loader = new GLTFLoader()
      loader.load(src, (gltf) => {
        fallback.visible = false
        root = gltf.scene
        scene.add(root)
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        root.position.sub(center)
        root.position.y += size.y / 2
        const max = Math.max(size.x, size.y, size.z)
        camera.position.set(max * 1.4, max * 0.9, max * 2)
        controls.target.set(0, size.y * 0.45, 0)
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(root)
          mixer.clipAction(gltf.animations[0]).play()
        }
      })
    }

    const resize = () => {
      const rect = mount.getBoundingClientRect()
      renderer.setSize(rect.width, rect.height, false)
      camera.aspect = rect.width / Math.max(1, rect.height)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    let raf = 0
    const tick = () => {
      mixer?.update(clock.getDelta())
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    resize()
    tick()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      mixer?.stopAllAction()
      if (root) scene.remove(root)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [src])

  return <div className="viewer-surface" ref={mountRef} />
}
