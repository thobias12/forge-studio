import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createForgeMannequin } from '../lib/mannequin'
import { hasStableFootContact, prepareRetargetPose } from '../lib/poseInput'
import { applyPoseToRig, createRetargetRuntime, type RigInfo, type RetargetRuntime } from '../lib/retarget'
import type { PosePoint } from '../types'

export type RetargetDiagnosticsSnapshot = {
  capturedAt: number
  smoothing: number
  mirrorX: boolean
  bodyPointCount: number
  leftHandPointCount: number
  rightHandPointCount: number
  stableFootContact: boolean
  supportReferenceY?: number
  currentSupportY?: number
  supportDelta?: number
  modelPosition?: [number, number, number]
  modelQuaternion?: [number, number, number, number]
  bones: Record<string, {
    name: string
    localPosition: [number, number, number]
    worldPosition: [number, number, number]
    localQuaternion: [number, number, number, number]
    worldQuaternion: [number, number, number, number]
  }>
}

type Props = {
  src?: string
  landmarks?: PosePoint[]
  worldLandmarks?: PosePoint[]
  leftHandLandmarks?: PosePoint[]
  rightHandLandmarks?: PosePoint[]
  leftHandWorldLandmarks?: PosePoint[]
  rightHandWorldLandmarks?: PosePoint[]
  className?: string
  smoothing?: number
  mirrorX?: boolean
  showRig?: boolean
  onRigInfo?: (info?: RigInfo) => void
  onDiagnostics?: (snapshot: RetargetDiagnosticsSnapshot) => void
}

export default function RetargetViewport({
  src,
  landmarks,
  worldLandmarks,
  leftHandLandmarks,
  rightHandLandmarks,
  leftHandWorldLandmarks,
  rightHandWorldLandmarks,
  className,
  smoothing = 0.5,
  mirrorX = false,
  showRig = false,
  onRigInfo,
  onDiagnostics,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const poseRef = useRef({ landmarks, worldLandmarks, leftHandLandmarks, rightHandLandmarks, leftHandWorldLandmarks, rightHandWorldLandmarks, smoothing, mirrorX, showRig })
  const infoCallbackRef = useRef(onRigInfo)
  const diagnosticsCallbackRef = useRef(onDiagnostics)
  poseRef.current = { landmarks, worldLandmarks, leftHandLandmarks, rightHandLandmarks, leftHandWorldLandmarks, rightHandWorldLandmarks, smoothing, mirrorX, showRig }
  infoCallbackRef.current = onRigInfo
  diagnosticsCallbackRef.current = onDiagnostics

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#090c12')
    scene.fog = new THREE.Fog('#090c12', 7, 22)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    camera.position.set(3.4, 2.3, 5.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1.05, 0)
    controls.minDistance = 1.5
    controls.maxDistance = 12

    scene.add(new THREE.HemisphereLight(0xc8ddff, 0x141922, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.4)
    key.position.set(4, 7, 5)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8cbcff, 1.4)
    rim.position.set(-4, 4, -5)
    scene.add(rim)
    scene.add(new THREE.GridHelper(14, 28, 0x2b394c, 0x17202c))

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 64),
      new THREE.MeshBasicMaterial({ color: 0x2e496a, transparent: true, opacity: 0.12, depthWrite: false }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.008
    scene.add(floor)

    let model: THREE.Object3D | undefined
    let runtime: RetargetRuntime | undefined
    let skeletonHelper: THREE.SkeletonHelper | undefined
    let supportReferenceY: number | undefined
    let lastDiagnosticsAt = 0
    let disposed = false
    const smoothState: Record<string, { input?: PosePoint[]; points?: PosePoint[] }> = {}

    const getSupportY = (target: RetargetRuntime) => {
      const supportBones = [target.rig.leftToes ?? target.rig.leftFoot, target.rig.rightToes ?? target.rig.rightFoot]
        .filter((bone): bone is THREE.Bone => !!bone)
      if (!supportBones.length) return undefined
      return Math.min(...supportBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()).y))
    }

    const prepareModel = (nextModel: THREE.Object3D) => {
      if (disposed) return
      model = nextModel
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
      model.scale.multiplyScalar(initialSize.y > 0.001 ? 2 / initialSize.y : 1)
      model.updateMatrixWorld(true)

      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box.min.y
      model.updateMatrixWorld(true)

      runtime = createRetargetRuntime(model)
      runtime.targetBodyBasis = undefined
      runtime.sourceAlignment = undefined
      runtime.calibrationMirrorX = undefined
      supportReferenceY = getSupportY(runtime)
      infoCallbackRef.current?.(runtime.info)

      skeletonHelper = new THREE.SkeletonHelper(model)
      skeletonHelper.visible = poseRef.current.showRig
      const helperMaterial = skeletonHelper.material as THREE.LineBasicMaterial
      helperMaterial.color.set(0x75b7ff)
      helperMaterial.transparent = true
      helperMaterial.opacity = 0.72
      scene.add(skeletonHelper)

      const fittedBox = new THREE.Box3().setFromObject(model)
      const fittedSize = fittedBox.getSize(new THREE.Vector3())
      const maxSize = Math.max(fittedSize.x, fittedSize.y, fittedSize.z, 1)
      camera.position.set(maxSize * 1.4, fittedSize.y * 0.65, maxSize * 2.2)
      controls.target.set(0, Math.max(0.8, fittedSize.y * 0.48), 0)
    }

    if (src) new GLTFLoader().load(src, (gltf) => prepareModel(gltf.scene), undefined, () => infoCallbackRef.current?.(undefined))
    else prepareModel(createForgeMannequin())

    const smooth = (keyName: string, source?: PosePoint[]) => {
      if (!source?.length) return undefined
      const state = smoothState[keyName] ?? (smoothState[keyName] = {})
      if (source !== state.input) {
        const amount = THREE.MathUtils.clamp(1 - poseRef.current.smoothing, 0.08, 1)
        if (!state.points || state.points.length !== source.length) {
          state.points = source.map((point) => ({ ...point }))
        } else {
          state.points = source.map((point, index) => {
            const previous = state.points![index]
            if ((point.visibility ?? 1) < 0.22) return { ...previous, visibility: point.visibility }
            return {
              x: THREE.MathUtils.lerp(previous.x, point.x, amount),
              y: THREE.MathUtils.lerp(previous.y, point.y, amount),
              z: THREE.MathUtils.lerp(previous.z, point.z, amount),
              visibility: point.visibility,
            }
          })
        }
        state.input = source
      }
      return state.points
    }

    const emitDiagnostics = (points: PosePoint[] | undefined, currentSupportY: number | undefined) => {
      if (!runtime || !model || !diagnosticsCallbackRef.current) return
      const now = performance.now()
      if (now - lastDiagnosticsAt < 250) return
      lastDiagnosticsAt = now

      const bones: RetargetDiagnosticsSnapshot['bones'] = {}
      for (const [keyName, bone] of Object.entries(runtime.rig)) {
        if (!bone) continue
        bones[keyName] = {
          name: bone.name || keyName,
          localPosition: vector3Tuple(bone.position),
          worldPosition: vector3Tuple(bone.getWorldPosition(new THREE.Vector3())),
          localQuaternion: quaternionTuple(bone.quaternion),
          worldQuaternion: quaternionTuple(bone.getWorldQuaternion(new THREE.Quaternion())),
        }
      }

      diagnosticsCallbackRef.current({
        capturedAt: Date.now(),
        smoothing: poseRef.current.smoothing,
        mirrorX: poseRef.current.mirrorX,
        bodyPointCount: poseRef.current.landmarks?.length ?? 0,
        leftHandPointCount: poseRef.current.leftHandLandmarks?.length ?? 0,
        rightHandPointCount: poseRef.current.rightHandLandmarks?.length ?? 0,
        stableFootContact: !!points && hasStableFootContact(points),
        supportReferenceY,
        currentSupportY,
        supportDelta: supportReferenceY !== undefined && currentSupportY !== undefined ? roundNumber(supportReferenceY - currentSupportY) : undefined,
        modelPosition: vector3Tuple(model.position),
        modelQuaternion: quaternionTuple(model.quaternion),
        bones,
      })
    }

    let animationFrame = 0
    const render = () => {
      const bodyRaw = poseRef.current.landmarks
      const leftRaw = poseRef.current.leftHandLandmarks
      const rightRaw = poseRef.current.rightHandLandmarks
      let preparedPoints: PosePoint[] | undefined
      let currentSupportY: number | undefined

      if (runtime && model && bodyRaw?.length === 33) {
        const smoothedBody = smooth('body', bodyRaw)
        preparedPoints = prepareRetargetPose(smoothedBody)
        if (preparedPoints) {
          applyPoseToRig(runtime, preparedPoints, {
            mirrorX: !poseRef.current.mirrorX,
            blend: THREE.MathUtils.lerp(0.88, 0.46, poseRef.current.smoothing),
            leftHand: smooth('leftHand', leftRaw),
            rightHand: smooth('rightHand', rightRaw),
          })

          runtime.root.updateMatrixWorld(true)
          currentSupportY = getSupportY(runtime)
          if (supportReferenceY !== undefined && currentSupportY !== undefined && hasStableFootContact(preparedPoints)) {
            const delta = THREE.MathUtils.clamp(supportReferenceY - currentSupportY, -0.09, 0.09)
            model.position.y += delta * 0.58
            model.updateMatrixWorld(true)
            currentSupportY = getSupportY(runtime)
          }
        }
      }

      emitDiagnostics(preparedPoints, currentSupportY)
      if (skeletonHelper) skeletonHelper.visible = poseRef.current.showRig
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
      infoCallbackRef.current?.(undefined)
      if (skeletonHelper) scene.remove(skeletonHelper)
      if (model) scene.remove(model)
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
    }
  }, [src])

  return <div className={className} ref={mountRef} />
}

function roundNumber(value: number) {
  return Number(value.toFixed(5))
}

function vector3Tuple(value: THREE.Vector3): [number, number, number] {
  return [roundNumber(value.x), roundNumber(value.y), roundNumber(value.z)]
}

function quaternionTuple(value: THREE.Quaternion): [number, number, number, number] {
  return [roundNumber(value.x), roundNumber(value.y), roundNumber(value.z), roundNumber(value.w)]
}
