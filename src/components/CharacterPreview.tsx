import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mapHumanoidRig, type HumanoidBoneKey, type RigInfo } from '../lib/retarget'
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
  rig?: ReturnType<typeof mapHumanoidRig>['rig']
  skeleton?: THREE.SkeletonHelper
  attachments: Map<string, { wrapper: THREE.Group; scene: THREE.Object3D }>
}

export default function CharacterPreview({ baseUrl, attachments, showRig, onRigInfo }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<PreviewState>()
  const callbackRef = useRef(onRigInfo)
  callbackRef.current = onRigInfo

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

    const state: PreviewState = { scene, attachments: new Map() }
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
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    render()

    ;(state as PreviewState & { camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).camera = camera
    ;(state as PreviewState & { camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).controls = controls

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
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
      const mapped = mapHumanoidRig(root)
      state.rig = mapped.rig
      callbackRef.current?.(mapped.info)
      fitCharacter(root, state)
      if (showRig) {
        state.skeleton = new THREE.SkeletonHelper(root)
        state.skeleton.material.transparent = true
        state.skeleton.material.opacity = 0.8
        state.scene.add(state.skeleton)
      }
    }).catch(() => callbackRef.current?.(undefined))

    return () => { cancelled = true }
  }, [baseUrl])

  useEffect(() => {
    const state = stateRef.current
    if (!state?.characterRoot) return
    if (showRig && !state.skeleton) {
      state.skeleton = new THREE.SkeletonHelper(state.characterRoot)
      state.skeleton.material.transparent = true
      state.skeleton.material.opacity = 0.8
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

  return <div className="character-preview" ref={mountRef} />
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
