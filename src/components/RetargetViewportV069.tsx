import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createForgeMannequin } from '../lib/mannequin'
import { createMocapPolishState, polishPoseFrame, type MocapPolishQuality } from '../lib/mocapPolish'
import { applyModelFootLocks, createModelFootLockState, resetModelFootLockState } from '../lib/modelFootLock'
import { hasStableFootContact, prepareRetargetPose } from '../lib/poseInput'
import { applyPoseToRig, createRetargetRuntime, getMocapPreviewFacingYaw, type RigInfo, type RetargetRuntime } from '../lib/retarget'
import type { PosePoint } from '../types'

export type RetargetQualityHistoryEntry = {
  capturedAt: number
  bodyScore: number
  handCount: number
  footCount: number
  ikKneeCount: number
  recoveredPoints: number
  leftFootLocked: boolean
  rightFootLocked: boolean
  weakJoints: string[]
  bodySpace: 'world' | 'image'
}

export type RetargetDiagnosticsSnapshot = {
  capturedAt: number
  smoothing: number
  mirrorX: boolean
  bodySource: 'world' | 'image'
  bodyPointCount: number
  leftHandPointCount: number
  rightHandPointCount: number
  stableFootContact: boolean
  supportReferenceY?: number
  currentSupportY?: number
  supportDelta?: number
  modelPosition?: [number, number, number]
  modelQuaternion?: [number, number, number, number]
  polish?: MocapPolishQuality
  qualityHistory?: RetargetQualityHistoryEntry[]
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
  groundedNeutral?: boolean
  onRigInfo?: (info?: RigInfo) => void
  onDiagnostics?: (snapshot: RetargetDiagnosticsSnapshot) => void
}

export default function RetargetViewportV069({
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
  groundedNeutral = false,
  onRigInfo,
  onDiagnostics,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [quality, setQuality] = useState<MocapPolishQuality>()
  const poseRef = useRef({ landmarks, worldLandmarks, leftHandLandmarks, rightHandLandmarks, leftHandWorldLandmarks, rightHandWorldLandmarks, smoothing, mirrorX, showRig, groundedNeutral })
  const infoCallbackRef = useRef(onRigInfo)
  const diagnosticsCallbackRef = useRef(onDiagnostics)
  poseRef.current = { landmarks, worldLandmarks, leftHandLandmarks, rightHandLandmarks, leftHandWorldLandmarks, rightHandWorldLandmarks, smoothing, mirrorX, showRig, groundedNeutral }
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
    let lastQualityAt = 0
    let lastHistoryInput: PosePoint[] | undefined
    let disposed = false
    const smoothState: Record<string, { input?: PosePoint[]; points?: PosePoint[] }> = {}
    const polishState = createMocapPolishState()
    const footLockState = createModelFootLockState()
    const qualityHistory: RetargetQualityHistoryEntry[] = []

    const getSupportY = (target: RetargetRuntime) => {
      const supportBones = [target.rig.leftToes ?? target.rig.leftFoot, target.rig.rightToes ?? target.rig.rightFoot]
        .filter((bone): bone is THREE.Bone => !!bone)
      if (!supportBones.length) return undefined
      return Math.min(...supportBones.map((bone) => bone.getWorldPosition(new THREE.Vector3()).y))
    }

    const prepareModel = (nextModel: THREE.Object3D) => {
      if (disposed) return
      model = nextModel
      const previewFacingYaw = getMocapPreviewFacingYaw(model)
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
      resetModelFootLockState(footLockState)
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
      const cameraOffset = new THREE.Vector3(maxSize * 1.4, fittedSize.y * 0.65, maxSize * 2.2)
      if (Math.abs(previewFacingYaw) > 1e-5) cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), previewFacingYaw)
      camera.position.copy(cameraOffset)
      controls.target.set(0, Math.max(0.8, fittedSize.y * 0.48), 0)
      controls.update()
    }

    if (src) new GLTFLoader().load(src, (gltf) => prepareModel(gltf.scene), undefined, () => infoCallbackRef.current?.(undefined))
    else prepareModel(createForgeMannequin())

    const smooth = (keyName: string, source?: PosePoint[], ignoreVisibility = false) => {
      if (!source?.length) return undefined
      const state = smoothState[keyName] ?? (smoothState[keyName] = {})
      if (source !== state.input) {
        const baseAmount = THREE.MathUtils.clamp(1 - poseRef.current.smoothing, 0.08, 1)
        if (!state.points || state.points.length !== source.length) {
          state.points = source.map((point) => ({ ...point }))
        } else {
          state.points = source.map((point, index) => {
            const previous = state.points![index]
            if (!ignoreVisibility && (point.visibility ?? 1) < 0.22) return { ...previous, visibility: point.visibility }
            const movement = Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z)
            const responseScale = keyName.includes('body-world') ? 0.055 : keyName.includes('Hand') ? 0.035 : 0.028
            const speedResponse = THREE.MathUtils.clamp(movement / responseScale, 0, 1)
            const amount = THREE.MathUtils.lerp(baseAmount, 0.94, Math.pow(speedResponse, 0.7))
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

    const emitDiagnostics = (bodySource: 'world' | 'image', points: PosePoint[] | undefined, currentSupportY: number | undefined, polish?: MocapPolishQuality) => {
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
        bodySource,
        bodyPointCount: points?.length ?? 0,
        leftHandPointCount: poseRef.current.leftHandLandmarks?.length ?? 0,
        rightHandPointCount: poseRef.current.rightHandLandmarks?.length ?? 0,
        stableFootContact: !!points && hasStableFootContact(points, bodySource),
        supportReferenceY,
        currentSupportY,
        supportDelta: supportReferenceY !== undefined && currentSupportY !== undefined ? roundNumber(supportReferenceY - currentSupportY) : undefined,
        modelPosition: vector3Tuple(model.position),
        modelQuaternion: quaternionTuple(model.quaternion),
        polish,
        qualityHistory: qualityHistory.slice(-260).map((entry) => ({ ...entry, weakJoints: [...entry.weakJoints] })),
        bones,
      })
    }

    let animationFrame = 0
    const render = () => {
      let preparedPoints: PosePoint[] | undefined
      let currentSupportY: number | undefined
      let currentQuality: MocapPolishQuality | undefined
      let bodySource: 'world' | 'image' = poseRef.current.worldLandmarks?.length === 33 ? 'world' : 'image'
      const rawInput = poseRef.current.worldLandmarks?.length === 33 ? poseRef.current.worldLandmarks : poseRef.current.landmarks

      if (runtime && model && rawInput?.length === 33) {
        const polished = polishPoseFrame({
          t: performance.now(),
          landmarks: poseRef.current.landmarks ?? [],
          worldLandmarks: poseRef.current.worldLandmarks,
          leftHandLandmarks: poseRef.current.leftHandLandmarks,
          rightHandLandmarks: poseRef.current.rightHandLandmarks,
          leftHandWorldLandmarks: poseRef.current.leftHandWorldLandmarks,
          rightHandWorldLandmarks: poseRef.current.rightHandWorldLandmarks,
        }, polishState, {
          calibrationFrames: 36,
          dropoutHoldMs: 240,
          jointStability: 0.76,
          handStability: 0.64,
          footLock: true,
          footLockStrength: 0.92,
        })

        if (polished) {
          currentQuality = polished.quality
          bodySource = polished.bodySpace
          if (rawInput !== lastHistoryInput) {
            lastHistoryInput = rawInput
            qualityHistory.push({
              capturedAt: Date.now(),
              bodyScore: currentQuality.bodyScore,
              handCount: currentQuality.handCount,
              footCount: currentQuality.footCount,
              ikKneeCount: currentQuality.ikKneeCount,
              recoveredPoints: currentQuality.recoveredPoints,
              leftFootLocked: currentQuality.leftFootLocked,
              rightFootLocked: currentQuality.rightFootLocked,
              weakJoints: [...currentQuality.weakJoints],
              bodySpace: currentQuality.bodySpace,
            })
            if (qualityHistory.length > 320) qualityHistory.splice(0, qualityHistory.length - 320)
          }

          const smoothedBody = smooth(`body-${bodySource}`, polished.body)
          preparedPoints = prepareRetargetPose(smoothedBody, bodySource)
          if (preparedPoints) {
            const leftHand = smooth('leftHandPolished', polished.leftHand, true)
            const rightHand = smooth('rightHandPolished', polished.rightHand, true)

            applyPoseToRig(runtime, preparedPoints, {
              mirrorX: !poseRef.current.mirrorX,
              blend: THREE.MathUtils.lerp(0.92, 0.56, poseRef.current.smoothing),
              bodySpace: polished.bodySpace,
              leftHand,
              rightHand,
              handPointsIgnoreVisibility: true,
              groundedNeutral: poseRef.current.groundedNeutral,
            })

            runtime.root.updateMatrixWorld(true)
            currentSupportY = getSupportY(runtime)
            if (supportReferenceY !== undefined && currentSupportY !== undefined && hasStableFootContact(preparedPoints, bodySource)) {
              const delta = THREE.MathUtils.clamp(supportReferenceY - currentSupportY, -0.12, 0.12)
              const lockBoost = currentQuality.leftFootLocked || currentQuality.rightFootLocked ? 0.88 : 0.68
              model.position.y += delta * lockBoost
              model.updateMatrixWorld(true)
            }

            applyModelFootLocks(model, runtime, currentQuality, footLockState, 0.92)
            currentSupportY = getSupportY(runtime)
          }
        }
      }

      const now = performance.now()
      if (currentQuality && now - lastQualityAt >= 180) {
        lastQualityAt = now
        setQuality({ ...currentQuality, weakJoints: [...currentQuality.weakJoints] })
      }
      emitDiagnostics(bodySource, preparedPoints, currentSupportY, currentQuality)
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

  return (
    <div className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {quality && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, zIndex: 4, minWidth: 220, padding: '10px 12px', borderRadius: 10, background: 'rgba(8,12,18,.82)', border: '1px solid rgba(126,174,232,.18)', backdropFilter: 'blur(8px)', pointerEvents: 'none', fontSize: 11, lineHeight: 1.35 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
            <strong style={{ color: '#dbeaff' }}>{quality.calibrated ? 'MOCAP CALIBRATED' : `CALIBRATING ${quality.calibrationProgress}%`}</strong>
            <span style={{ color: quality.bodyScore >= 75 ? '#83e6b4' : '#ffd27a' }}>{quality.bodyScore}%</span>
          </div>
          <div style={{ display: 'flex', gap: 12, color: '#9db0c8' }}>
            <span>Hands {quality.handCount}/2</span><span>Feet {quality.footCount}/2</span><span>{quality.bodySpace.toUpperCase()}</span>
          </div>
          <div style={{ marginTop: 4, color: quality.leftFootLocked || quality.rightFootLocked ? '#83e6b4' : '#76879c' }}>
            Foot lock {quality.leftFootLocked ? 'L' : '—'} / {quality.rightFootLocked ? 'R' : '—'}
            {quality.ikKneeCount > 0 ? ` · IK knees ${quality.ikKneeCount}` : ''}
            {quality.recoveredPoints > 0 ? ` · recovered ${quality.recoveredPoints}` : ''}
          </div>
          {quality.weakJoints.length > 0 && <div style={{ marginTop: 4, color: '#e8b67c' }}>Weak: {quality.weakJoints.slice(0, 3).join(', ')}{quality.weakJoints.length > 3 ? '…' : ''}</div>}
        </div>
      )}
    </div>
  )
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
