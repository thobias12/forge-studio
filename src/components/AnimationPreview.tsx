import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type SeekRequest = { id: number; time: number }

type Props = {
  src: string
  clip?: THREE.AnimationClip
  className?: string
  playing: boolean
  loop: boolean
  seekRequest?: SeekRequest
  onTime?: (time: number) => void
  onEnded?: () => void
}

export default function AnimationPreview({ src, clip, className, playing, loop, seekRequest, onTime, onEnded }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | undefined>(undefined)
  const actionRef = useRef<THREE.AnimationAction | undefined>(undefined)
  const onTimeRef = useRef(onTime)
  const onEndedRef = useRef(onEnded)
  const playingRef = useRef(playing)
  const loopRef = useRef(loop)
  onTimeRef.current = onTime
  onEndedRef.current = onEnded
  playingRef.current = playing
  loopRef.current = loop

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#090c12')
    scene.fog = new THREE.Fog('#090c12', 7, 24)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    camera.position.set(3.3, 2.25, 5.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)
    controls.minDistance = 1.5
    controls.maxDistance = 12

    scene.add(new THREE.HemisphereLight(0xc7dcff, 0x11161d, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(4, 7, 5)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x79aefe, 1.2)
    rim.position.set(-4, 4, -5)
    scene.add(rim)
    scene.add(new THREE.GridHelper(14, 28, 0x29384a, 0x151f2b))

    let model: THREE.Object3D | undefined
    let mixer: THREE.AnimationMixer | undefined
    let disposed = false
    let animationFrame = 0
    let lastTick = performance.now()
    let lastNotify = 0
    let endedSent = false

    const loader = new GLTFLoader()
    loader.load(src, (gltf) => {
      if (disposed) return
      model = gltf.scene
      model.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      scene.add(model)

      const initialBox = new THREE.Box3().setFromObject(model)
      const initialSize = initialBox.getSize(new THREE.Vector3())
      const scale = initialSize.y > 0.001 ? 2 / initialSize.y : 1
      model.scale.multiplyScalar(scale)
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y
      model.updateMatrixWorld(true)

      const fitted = new THREE.Box3().setFromObject(model)
      const size = fitted.getSize(new THREE.Vector3())
      const maxSize = Math.max(size.x, size.y, size.z, 1)
      camera.position.set(maxSize * 1.35, size.y * 0.65, maxSize * 2.2)
      controls.target.set(0, Math.max(0.8, size.y * 0.48), 0)

      mixer = new THREE.AnimationMixer(model)
      mixerRef.current = mixer
    })

    const render = () => {
      const now = performance.now()
      const delta = Math.min(0.05, (now - lastTick) / 1000)
      lastTick = now
      if (mixer) mixer.update(delta)

      const action = actionRef.current
      if (action) {
        if (now - lastNotify > 50) {
          onTimeRef.current?.(action.time)
          lastNotify = now
        }
        if (!loopRef.current && playingRef.current && action.time >= Math.max(0, action.getClip().duration - 0.002)) {
          if (!endedSent) {
            endedSent = true
            onEndedRef.current?.()
          }
        } else {
          endedSent = false
        }
      }

      controls.update()
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(render)
    }

    const resize = () => {
      const rect = mount.getBoundingClientRect()
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      controls.dispose()
      actionRef.current?.stop()
      mixer?.stopAllAction()
      mixerRef.current = undefined
      actionRef.current = undefined
      if (model) scene.remove(model)
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [src])

  useEffect(() => {
    const mixer = mixerRef.current
    if (!mixer || !clip) return
    actionRef.current?.stop()
    const action = mixer.clipAction(clip)
    action.reset()
    action.enabled = true
    action.clampWhenFinished = !loop
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.play()
    action.paused = !playing
    actionRef.current = action
    mixer.setTime(0)
    onTimeRef.current?.(0)
    return () => {
      action.stop()
    }
  }, [clip, loop])

  useEffect(() => {
    if (actionRef.current) actionRef.current.paused = !playing
  }, [playing])

  useEffect(() => {
    if (!seekRequest || !actionRef.current) return
    const duration = actionRef.current.getClip().duration
    const time = THREE.MathUtils.clamp(seekRequest.time, 0, Math.max(0, duration))
    actionRef.current.time = time
    mixerRef.current?.update(0)
    onTimeRef.current?.(time)
  }, [seekRequest])

  return <div className={className} ref={mountRef} />
}
