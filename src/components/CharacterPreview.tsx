import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { HumanoidBoneKey, RigInfo } from '../lib/retarget'
import { mapCharacterRig, type CharacterRig } from '../lib/characterRig'
import type { CharacterTransform } from '../lib/characterPackage'

export type CharacterPreviewAttachment = {
  id: string
  url: string
  targetBone: HumanoidBoneKey
  transform: CharacterTransform
  visible: boolean
}

type Props = {
  baseUrl?: string
  attachments: CharacterPreviewAttachment[]
  showRig: boolean
  onRigInfo?: (info?: RigInfo) => void
}

type PreviewState = {
  scene: THREE.Scene
  characterRoot?: THREE.Object3D
  rig?: CharacterRig
  skeleton?: THREE.SkeletonHelper
  attachments: Map<string, { wrapper: THREE.Group; scene: THREE.Object3D }>
  mixer?: THREE.AnimationMixer
  animations: THREE.AnimationClip[]
  action?: THREE.AnimationAction
}

type ClipInfo = { name: string; duration: number }

export default function CharacterPreview({ baseUrl, attachments, showRig, onRigInfo }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<PreviewState>()
  const callbackRef = useRef(onRigInfo)
  const [clips, setClips] = useState<ClipInfo[]>([])
  const [selectedClip, setSelectedClip] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const selectedClipRef = useRef(0)
  const playbackRef = useRef({ playing: false, loop: true, speed: 1 })

  callbackRef.current = onRigInfo
  selectedClipRef.current = selectedClip
  playbackRef.current = { playing, loop, speed }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#080c12')
    scene.fog = new THREE.Fog('#080c12', 8, 20)

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100)
    camera.position.set(2.5, 1.8, 4)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)
    controls.minDistance = 1.2
    controls.maxDistance = 12

    scene.add(new THREE.HemisphereLight(0xdcecff, 0x111722, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.1)
    key.position.set(3.5, 6, 4)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x7eb5ff, 1.4)
    rim.position.set(-4, 2.5, -3)
    scene.add(rim)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x0f1721, roughness: 0.94, metalness: 0.02 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const grid = new THREE.GridHelper(9, 28, 0x26394e, 0x172333)
    grid.position.y = 0.002
    scene.add(grid)

    const state: PreviewState = { scene, attachments: new Map(), animations: [] }
    stateRef.current = state

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
    let previousFrame = performance.now()
    let lastUiUpdate = 0
    const render = (now: number) => {
      const delta = Math.min(Math.max((now - previousFrame) / 1000, 0), 0.05)
      previousFrame = now
      state.mixer?.update(delta)
      controls.update()
      renderer.render(scene, camera)

      if (state.action && now - lastUiUpdate > 80) {
        lastUiUpdate = now
        const duration = state.animations[selectedClipRef.current]?.duration ?? 0
        setCurrentTime(Math.min(state.action.time, duration))
        if (!playbackRef.current.loop && duration > 0 && state.action.time >= duration - 0.002 && playbackRef.current.playing) {
          setPlaying(false)
        }
      }

      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    ;(state as PreviewState & { camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).camera = camera
    ;(state as PreviewState & { camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).controls = controls

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      state.mixer?.stopAllAction()
      controls.dispose()
      disposeObject(state.characterRoot)
      state.attachments.forEach((item) => disposeObject(item.scene))
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = undefined
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    let cancelled = false
    const loader = new GLTFLoader()

    state.mixer?.stopAllAction()
    state.mixer = undefined
    state.action = undefined
    state.animations = []
    setClips([])
    setSelectedClip(0)
    setCurrentTime(0)
    setPlaying(false)

    if (state.skeleton) {
      state.scene.remove(state.skeleton)
      state.skeleton.dispose()
      state.skeleton = undefined
    }
    state.attachments.forEach((item) => {
      item.wrapper.removeFromParent()
      disposeObject(item.scene)
    })
    state.attachments.clear()
    if (state.characterRoot) {
      state.scene.remove(state.characterRoot)
      disposeObject(state.characterRoot)
      state.characterRoot = undefined
      state.rig = undefined
    }
    callbackRef.current?.(undefined)

    if (!baseUrl) return

    void loader.loadAsync(baseUrl).then((gltf) => {
      if (cancelled) { disposeObject(gltf.scene); return }
      const root = gltf.scene
      root.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      state.scene.add(root)
      state.characterRoot = root
      root.updateMatrixWorld(true)
      const mapped = mapCharacterRig(root)
      state.rig = mapped.rig
      callbackRef.current?.(mapped.info)
      fitCharacter(root, state)

      state.animations = gltf.animations
      setClips(gltf.animations.map((clip, index) => ({ name: clip.name || `Clip ${index + 1}`, duration: clip.duration })))
      if (gltf.animations.length > 0) {
        state.mixer = new THREE.AnimationMixer(root)
        const action = state.mixer.clipAction(gltf.animations[0])
        configureAction(action, true, true, speed)
        action.play()
        state.action = action
        setSelectedClip(0)
        setCurrentTime(0)
        setPlaying(true)
      }

      if (showRig) {
        state.skeleton = new THREE.SkeletonHelper(root)
        styleSkeleton(state.skeleton)
        state.scene.add(state.skeleton)
      }
    }).catch(() => callbackRef.current?.(undefined))

    return () => { cancelled = true }
  }, [baseUrl])

  useEffect(() => {
    const state = stateRef.current
    if (!state?.mixer || !state.animations[selectedClip]) return
    const clip = state.animations[selectedClip]
    state.action?.stop()
    const action = state.mixer.clipAction(clip)
    action.reset()
    configureAction(action, playing, loop, speed)
    action.play()
    action.paused = !playing
    state.action = action
    setCurrentTime(0)
  }, [selectedClip])

  useEffect(() => {
    const action = stateRef.current?.action
    if (!action) return
    configureAction(action, playing, loop, speed)
  }, [playing, loop, speed])

  useEffect(() => {
    const state = stateRef.current
    if (!state?.characterRoot) return
    if (showRig && !state.skeleton) {
      state.skeleton = new THREE.SkeletonHelper(state.characterRoot)
      styleSkeleton(state.skeleton)
      state.scene.add(state.skeleton)
    } else if (!showRig && state.skeleton) {
      state.scene.remove(state.skeleton)
      state.skeleton.dispose()
      state.skeleton = undefined
    }
  }, [showRig])

  useEffect(() => {
    const state = stateRef.current
    if (!state?.rig) return
    let cancelled = false
    const loader = new GLTFLoader()
    const wantedIds = new Set(attachments.map((item) => item.id))

    for (const [id, current] of state.attachments) {
      if (!wantedIds.has(id)) {
        current.wrapper.removeFromParent()
        disposeObject(current.scene)
        state.attachments.delete(id)
      }
    }

    for (const attachment of attachments) {
      const existing = state.attachments.get(attachment.id)
      if (existing) {
        applyTransform(existing.wrapper, attachment.transform)
        existing.wrapper.visible = attachment.visible
        const target = state.rig[attachment.targetBone]
        if (target && existing.wrapper.parent !== target) target.add(existing.wrapper)
        continue
      }

      const target = state.rig[attachment.targetBone]
      if (!target) continue
      void loader.loadAsync(attachment.url).then((gltf) => {
        if (cancelled || !stateRef.current) { disposeObject(gltf.scene); return }
        const wrapper = new THREE.Group()
        wrapper.name = `ForgeAttachment_${attachment.id}`
        wrapper.add(gltf.scene)
        gltf.scene.traverse((object) => {
          const mesh = object as THREE.Mesh
          if (mesh.isMesh) {
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
        })
        applyTransform(wrapper, attachment.transform)
        wrapper.visible = attachment.visible
        target.add(wrapper)
        state.attachments.set(attachment.id, { wrapper, scene: gltf.scene })
      }).catch(() => undefined)
    }

    return () => { cancelled = true }
  }, [attachments])

  const duration = clips[selectedClip]?.duration ?? 0
  const seek = (value: number) => {
    const state = stateRef.current
    const clamped = THREE.MathUtils.clamp(value, 0, duration)
    setCurrentTime(clamped)
    if (!state?.action) return
    state.action.time = clamped
    state.mixer?.update(0)
  }

  const restart = () => {
    const action = stateRef.current?.action
    if (!action) return
    action.reset()
    configureAction(action, playing, loop, speed)
    action.play()
    action.paused = !playing
    setCurrentTime(0)
  }

  return (
    <div className="character-preview-shell">
      <div className="character-preview" ref={mountRef} />
      {clips.length > 0 && (
        <div className="character-animation-dock">
          <div className="character-animation-controls">
            <span className="character-animation-label">ANIMATION</span>
            <select value={selectedClip} onChange={(event) => setSelectedClip(Number(event.target.value))}>
              {clips.map((clip, index) => <option key={`${clip.name}-${index}`} value={index}>{clip.name}</option>)}
            </select>
            <button onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={restart}>Restart</button>
            <button className={loop ? 'active' : ''} onClick={() => setLoop((value) => !value)}>Loop</button>
            <select className="character-speed-select" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </div>
          <div className="character-animation-timeline">
            <input type="range" min={0} max={Math.max(duration, 0.001)} step={0.001} value={Math.min(currentTime, duration)} onChange={(event) => seek(Number(event.target.value))} />
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function configureAction(action: THREE.AnimationAction, playing: boolean, loop: boolean, speed: number) {
  action.enabled = true
  action.paused = !playing
  action.clampWhenFinished = !loop
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
  action.setEffectiveTimeScale(speed)
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00.0'
  const minutes = Math.floor(value / 60)
  const seconds = value - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

function styleSkeleton(helper: THREE.SkeletonHelper) {
  const materials = Array.isArray(helper.material) ? helper.material : [helper.material]
  for (const material of materials) {
    material.transparent = true
    material.opacity = 0.8
  }
}

function applyTransform(group: THREE.Group, transform: CharacterTransform) {
  group.position.fromArray(transform.position)
  group.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation[0]),
    THREE.MathUtils.degToRad(transform.rotation[1]),
    THREE.MathUtils.degToRad(transform.rotation[2]),
  )
  group.scale.fromArray(transform.scale)
}

function fitCharacter(root: THREE.Object3D, state: PreviewState) {
  const camera = (state as PreviewState & { camera?: THREE.PerspectiveCamera }).camera
  const controls = (state as PreviewState & { controls?: OrbitControls }).controls
  if (!camera || !controls) return
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const height = Math.max(0.4, size.y)
  const radius = Math.max(size.x, size.y, size.z)
  controls.target.copy(center)
  camera.position.set(center.x + radius * 1.6, center.y + height * 0.18, center.z + radius * 2.35)
  camera.near = Math.max(0.01, radius / 150)
  camera.far = Math.max(40, radius * 20)
  camera.updateProjectionMatrix()
  controls.update()
}

function disposeObject(root?: THREE.Object3D) {
  if (!root) return
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      const record = material as unknown as Record<string, unknown>
      for (const value of Object.values(record)) if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose()
      material.dispose()
    }
  })
}
