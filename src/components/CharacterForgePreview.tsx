import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createProceduralCharacter, disposeForgeCharacter, type ForgeCharacterConfig } from '../lib/proceduralCharacter'
import { createConceptForgeCharacter } from '../engine/conceptCharacterV2'
import { createProceduralBaseHumanoidV2 } from '../engine/proceduralHumanoidV2'
import { retargetForgeHumanoidClips } from '../engine/skillboundCharacterAnimation'
import { applyCharacterIdentityVisuals } from '../engine/characterIdentityVisuals'
import {
  loadCharacterAssetScene,
  setSkillboundBaseClothingVisible,
  skillboundBodyTypeFromAsset,
} from '../lib/characterAssetRegistry'
import type { CharacterIdentityRecipe } from '../lib/characterCreator'
import type { LibraryAsset } from '../lib/library'
import {
  FORGE_EQUIPMENT_SLOTS,
  type ForgeEquipmentSlot,
} from '../engine/equipment'
import type { ForgeItemDefinition } from '../engine/forgeProject'
import {
  bindEquipmentVisualModel,
  clearEquipmentVisualAnchors,
  clearEquipmentVisualModels,
} from '../engine/runtime/ForgeEquipmentVisuals'

type PreviewStats = { bones: number; skinnedMeshes: number; triangles: number }

type Props = {
  config: ForgeCharacterConfig
  animation: string
  playing: boolean
  showRig: boolean
  showHitbox: boolean
  cameraMode?: 'studio' | 'arpg'
  conceptMode?: boolean
  identity?: CharacterIdentityRecipe
  bodyAsset?: LibraryAsset
  headAsset?: LibraryAsset
  hairAsset?: LibraryAsset
  baseClothingVisible?: boolean
  paperDoll?: boolean
  equipmentItems?: Partial<
    Record<ForgeEquipmentSlot, ForgeItemDefinition>
  >
  onStats?: (stats: PreviewStats) => void
}

type PreviewState = {
  root?: THREE.Group
  helper?: THREE.SkeletonHelper
  hitbox?: THREE.Mesh
  mixer?: THREE.AnimationMixer
  action?: THREE.AnimationAction
  clips?: THREE.AnimationClip[]
  scene?: THREE.Scene
  camera?: THREE.PerspectiveCamera
  controls?: OrbitControls
  turntable?: THREE.Group
  equipmentModels?: Map<
    ForgeEquipmentSlot,
    THREE.Object3D
  >
  equipmentAnchors?: Map<
    ForgeEquipmentSlot,
    THREE.Group
  >
  equipmentRevision?: number
  paperDollYaw?: number
  paperDollYawTarget?: number
  paperDollDrag?: {
    pointerId: number
    startX: number
    startYaw: number
  }
}

export default function CharacterForgePreview({
  config,
  animation,
  playing,
  showRig,
  showHitbox,
  cameraMode = 'studio',
  conceptMode = false,
  identity,
  bodyAsset,
  headAsset,
  hairAsset,
  baseClothingVisible = true,
  paperDoll = false,
  equipmentItems,
  onStats,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<PreviewState>({})
  const callbackRef = useRef(onStats)
  callbackRef.current = onStats
  const equipmentItemsRef = useRef(equipmentItems)
  equipmentItemsRef.current = equipmentItems
  const equipmentSignature = FORGE_EQUIPMENT_SLOTS
    .map((slot) => equipmentItems?.[slot]?.id ?? '')
    .join('|')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = paperDoll
      ? null
      : new THREE.Color(0x070b10)
    scene.fog = paperDoll
      ? null
      : new THREE.Fog(0x070b10, 7, 18)

    const camera = new THREE.PerspectiveCamera(
      38,
      1,
      0.02,
      80,
    )
    camera.position.set(2.55, 1.65, -3.7)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: paperDoll,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 2),
    )
    renderer.outputColorSpace =
      THREE.SRGBColorSpace
    renderer.toneMapping =
      THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.shadowMap.enabled = !paperDoll
    renderer.domElement.style.touchAction = 'none'
    if (paperDoll) {
      renderer.setClearColor(0x000000, 0)
    }
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(
      camera,
      renderer.domElement,
    )
    controls.enableDamping = true
    controls.enablePan = false
    controls.rotateSpeed = 0.72
    controls.zoomSpeed = 0.85
    controls.target.set(0, 0.95, 0)
    controls.minDistance = 1.4
    controls.maxDistance = 10
    controls.enabled = !paperDoll

    scene.add(
      new THREE.HemisphereLight(
        0xd7e6f3,
        0x151b22,
        2.3,
      ),
    )
    const key = new THREE.DirectionalLight(
      0xfff3df,
      3.5,
    )
    key.position.set(3.8, 5.5, 4.4)
    key.castShadow = !paperDoll
    scene.add(key)
    const rim = new THREE.DirectionalLight(
      0x718fb0,
      2,
    )
    rim.position.set(-3.5, 3, -4)
    scene.add(rim)
    const warm = new THREE.PointLight(
      0xff9d5c,
      1.2,
      6,
      2,
    )
    warm.position.set(-2.4, 1.4, 2)
    scene.add(warm)

    if (!paperDoll) {
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(3, 48),
        new THREE.MeshStandardMaterial({
          color: 0x10171e,
          roughness: 0.93,
        }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)
      const grid = new THREE.GridHelper(
        8,
        24,
        0x2a3a48,
        0x17222c,
      )
      grid.position.y = 0.003
      scene.add(grid)
    }

    stateRef.current.scene = scene
    stateRef.current.camera = camera
    stateRef.current.controls = controls
    stateRef.current.paperDollYaw = 0
    stateRef.current.paperDollYawTarget = 0

    const canvas = renderer.domElement
    const onPointerDown = (event: PointerEvent) => {
      if (!paperDoll || event.button !== 0) return
      const state = stateRef.current
      if (!state.turntable) return
      event.preventDefault()
      event.stopPropagation()
      state.paperDollDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startYaw:
          state.paperDollYawTarget ?? 0,
      }
      canvas.setPointerCapture?.(event.pointerId)
      host.classList.add('is-rotating')
    }
    const onPointerMove = (event: PointerEvent) => {
      const state = stateRef.current
      const drag = state.paperDollDrag
      if (
        !paperDoll ||
        !drag ||
        drag.pointerId !== event.pointerId
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      state.paperDollYawTarget =
        drag.startYaw +
        (event.clientX - drag.startX) * 0.012
    }
    const stopRotate = (event: PointerEvent) => {
      const state = stateRef.current
      if (
        state.paperDollDrag?.pointerId !==
        event.pointerId
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      state.paperDollDrag = undefined
      if (
        canvas.hasPointerCapture?.(event.pointerId)
      ) {
        canvas.releasePointerCapture(event.pointerId)
      }
      host.classList.remove('is-rotating')
    }
    const resetRotate = (event: MouseEvent) => {
      if (!paperDoll) return
      event.preventDefault()
      event.stopPropagation()
      stateRef.current.paperDollYawTarget = 0
    }

    if (paperDoll) {
      canvas.addEventListener(
        'pointerdown',
        onPointerDown,
      )
      canvas.addEventListener(
        'pointermove',
        onPointerMove,
      )
      canvas.addEventListener(
        'pointerup',
        stopRotate,
      )
      canvas.addEventListener(
        'pointercancel',
        stopRotate,
      )
      canvas.addEventListener(
        'dblclick',
        resetRotate,
      )
    }

    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(
        rect.width,
        rect.height,
        false,
      )
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    let raf = 0
    let previous = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(
        0.05,
        Math.max(0, (now - previous) / 1000),
      )
      previous = now
      const state = stateRef.current
      state.mixer?.update(dt)
      if (state.turntable) {
        const current = state.paperDollYaw ?? 0
        const target =
          state.paperDollYawTarget ?? current
        const delta = Math.atan2(
          Math.sin(target - current),
          Math.cos(target - current),
        )
        const alpha = 1 - Math.exp(-dt * 16)
        const next = current + delta * alpha
        state.paperDollYaw = next
        state.turntable.rotation.y = next
      }
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      if (paperDoll) {
        canvas.removeEventListener(
          'pointerdown',
          onPointerDown,
        )
        canvas.removeEventListener(
          'pointermove',
          onPointerMove,
        )
        canvas.removeEventListener(
          'pointerup',
          stopRotate,
        )
        canvas.removeEventListener(
          'pointercancel',
          stopRotate,
        )
        canvas.removeEventListener(
          'dblclick',
          resetRotate,
        )
      }
      controls.dispose()
      clearPreview(stateRef.current)
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = {}
    }
  }, [paperDoll])

  useEffect(() => {
    const state = stateRef.current
    if (!state.scene) return
    let cancelled = false

    clearPreview(state)

    const rebuild = async () => {
      try {
        const preview = await buildPreview(
          config,
          identity,
          conceptMode,
          bodyAsset,
          headAsset,
          hairAsset,
          baseClothingVisible,
        )
        if (cancelled || !state.scene) {
          disposeRoot(preview.root)
          return
        }

        state.root = preview.root
        state.clips = preview.clips
        if (paperDoll) {
          const turntable = new THREE.Group()
          turntable.name = '__forge_paperdoll_turntable'
          turntable.rotation.y =
            state.paperDollYaw ?? 0
          turntable.add(preview.root)
          state.turntable = turntable
          state.scene.add(turntable)
        } else {
          state.scene.add(preview.root)
        }
        callbackRef.current?.(preview.stats)
        void refreshPreviewEquipment(
          state,
          preview.root,
          equipmentItemsRef.current,
        )

        state.mixer = new THREE.AnimationMixer(preview.root)
        const clip = preview.clips.find((entry) => entry.name === animation)
        if (clip) {
          const action = state.mixer.clipAction(clip)
          action.play()
          action.paused = !playing
          state.action = action
        }

        if (showRig) {
          state.helper = makeSkeletonHelper(preview.root)
          state.scene.add(state.helper)
        }
        if (showHitbox) {
          state.hitbox = addHitbox(
            state.scene,
            config,
          )
        }
        frameCamera(
          state,
          state.turntable ?? preview.root,
          cameraMode,
        )
        if (paperDoll && state.controls) {
          state.controls.enabled = false
        }
      } catch (error) {
        console.error('Character preview build failed', error)
      }
    }

    void rebuild()
    return () => { cancelled = true }
  }, [
    config,
    identity,
    conceptMode,
    bodyAsset,
    headAsset,
    hairAsset,
    baseClothingVisible,
    cameraMode,
    paperDoll,
  ])

  useEffect(() => {
    const state = stateRef.current
    if (!state.root || !state.clips?.length) return
    state.action?.stop()
    const clip = state.clips.find((entry) => entry.name === animation)
    if (!clip) {
      state.action = undefined
      return
    }
    const action = state.mixer?.clipAction(clip)
    if (!action) return
    action.reset().play()
    action.paused = !playing
    state.action = action
  }, [animation])

  useEffect(() => {
    if (stateRef.current.action) stateRef.current.action.paused = !playing
  }, [playing])

  useEffect(() => {
    const state = stateRef.current
    if (!state.scene || !state.root) return
    if (showRig && !state.helper) {
      state.helper = makeSkeletonHelper(state.root)
      state.scene.add(state.helper)
    } else if (!showRig && state.helper) {
      state.scene.remove(state.helper)
      state.helper.dispose()
      state.helper = undefined
    }
  }, [showRig])

  useEffect(() => {
    const state = stateRef.current
    if (!state.scene) return
    if (showHitbox && !state.hitbox) state.hitbox = addHitbox(state.scene, config)
    else if (!showHitbox && state.hitbox) {
      state.scene.remove(state.hitbox)
      state.hitbox.geometry.dispose()
      const material = state.hitbox.material
      if (!Array.isArray(material)) material.dispose()
      state.hitbox = undefined
    }
  }, [showHitbox, config])

  useEffect(() => {
    const state = stateRef.current
    if (!state.root) return
    void refreshPreviewEquipment(
      state,
      state.root,
      equipmentItems,
    )
    return () => {
      state.equipmentRevision =
        (state.equipmentRevision ?? 0) + 1
    }
  }, [equipmentSignature])

  return (
    <div
      className={`character-forge-preview${paperDoll ? ' paper-doll-preview' : ''}`}
      ref={hostRef}
    />
  )
}

async function buildPreview(
  config: ForgeCharacterConfig,
  identity: CharacterIdentityRecipe | undefined,
  conceptMode: boolean,
  bodyAsset?: LibraryAsset,
  headAsset?: LibraryAsset,
  hairAsset?: LibraryAsset,
  baseClothingVisible = true,
): Promise<{ root: THREE.Group; clips: THREE.AnimationClip[]; stats: PreviewStats }> {
  if (!identity && !bodyAsset) {
    const build = conceptMode
      ? createConceptForgeCharacter(config)
      : createProceduralCharacter(config)
    return {
      root: build.root,
      clips: build.clips,
      stats: build.stats,
    }
  }

  if (!bodyAsset) {
    if (!identity) {
      throw new Error(
        'Character preview requires an identity when no authored body is selected.',
      )
    }
    const build = createProceduralBaseHumanoidV2(
      config,
      identity.classId,
    )
    const appearanceIdentity: CharacterIdentityRecipe = hairAsset
      ? {
          ...identity,
          appearance: {
            ...identity.appearance,
            hairStyle: 'none',
          },
        }
      : identity
    applyCharacterIdentityVisuals(build, appearanceIdentity)

    if (headAsset) {
      hideReplaceableHeadMeshes(build.root)
      await attachHeadPart(
        build.root,
        headAsset,
        'head',
        identity.body.headScale,
      )
    }
    if (hairAsset) {
      await attachHeadPart(
        build.root,
        hairAsset,
        'hair',
        identity.body.headScale,
      )
    }

    build.root.updateMatrixWorld(true)
    return {
      root: build.root,
      clips: build.clips,
      stats: recountRoot(build.root),
    }
  }

  const loaded = await loadCharacterAssetScene(bodyAsset.blob)
  const root = loaded.scene
  root.name = 'CharacterCreator_CustomBody'
  normalizeImportedBody(root, identity?.body.height ?? config.height)
  const skillboundBodyType = skillboundBodyTypeFromAsset(bodyAsset)
  if (skillboundBodyType) {
    setSkillboundBaseClothingVisible(root, baseClothingVisible)
    // Astra's foundation GLBs face +Z. Character Forge's studio camera
    // looks toward +Z from negative Z, so rotate the official base once
    // to present its front consistently with Forge's procedural characters.
    root.rotation.y = Math.PI
    root.updateMatrixWorld(true)
  }

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = false
    object.frustumCulled = false
  })

  if (headAsset) {
    hideReplaceableHeadMeshes(root)
    await attachHeadPart(
      root,
      headAsset,
      'head',
      identity?.body.headScale ?? config.headScale,
    )
  }
  if (hairAsset) {
    await attachHeadPart(
      root,
      hairAsset,
      'hair',
      identity?.body.headScale ?? config.headScale,
    )
  }

  let clips = loaded.animations
  if (skillboundBodyType) {
    const animationSource = createConceptForgeCharacter(config)
    try {
      clips = retargetForgeHumanoidClips(
        animationSource.root,
        root,
        animationSource.clips,
      )
    } finally {
      disposeForgeCharacter(animationSource.root)
    }
  }

  root.userData.characterIdentity = {
    ...(identity ?? {}),
    externalBodyAssetId: bodyAsset.id,
    externalHeadAssetId: headAsset?.id,
    externalHairAssetId: hairAsset?.id,
  }
  root.updateMatrixWorld(true)
  return { root, clips, stats: recountRoot(root) }
}

async function attachHeadPart(
  root: THREE.Group,
  asset: LibraryAsset,
  role: 'head' | 'hair',
  headScale: number,
) {
  const loaded = await loadCharacterAssetScene(asset.blob)
  const part = loaded.scene
  part.name = role === 'head' ? 'CharacterCreator_HeadAsset' : 'CharacterCreator_HairAsset'
  prepareHeadPart(part, role, headScale)
  const head = findHeadAnchor(root)
  if (head) head.add(part)
  else {
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    part.position.y += center.y + size.y * .38
    root.add(part)
  }
}

function prepareHeadPart(part: THREE.Group, role: 'head' | 'hair', headScale: number) {
  part.updateMatrixWorld(true)
  let box = new THREE.Box3().setFromObject(part)
  let size = box.getSize(new THREE.Vector3())
  const targetHeight = (role === 'head' ? .28 : .31) * headScale

  if (size.y > .001 && (size.y > .65 || size.y < .08)) {
    const factor = targetHeight / size.y
    part.scale.multiplyScalar(factor)
    part.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(part)
    size = box.getSize(new THREE.Vector3())
  }

  const center = box.getCenter(new THREE.Vector3())
  part.position.x -= center.x
  part.position.y -= center.y
  part.position.z -= center.z
  if (role === 'hair') part.position.y += .035 * headScale

  part.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = false
    object.frustumCulled = false
  })
}

function findHeadAnchor(root: THREE.Object3D) {
  const exact = root.getObjectByName('Head')
  if (exact) return exact
  let candidate: THREE.Object3D | undefined
  root.traverse((object) => {
    if (candidate || !(object instanceof THREE.Bone)) return
    const normalized = object.name.toLowerCase().replace(/[^a-z]/g, '')
    if (normalized === 'head' || normalized.endsWith('head')) candidate = object
  })
  return candidate
}

function hideReplaceableHeadMeshes(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const name = object.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const procedural = name === 'v2head' || name.startsWith('v2eye') || name === 'v2nose'
    const authored = name.includes('headmesh') || name.includes('basehead') || name.includes('headgeo') || name.includes('facemesh') || name.includes('facegeo')
    if (procedural || authored) object.visible = false
  })
}

function normalizeImportedBody(root: THREE.Group, requestedHeight: number) {
  root.updateMatrixWorld(true)
  let box = new THREE.Box3().setFromObject(root)
  let size = box.getSize(new THREE.Vector3())
  const targetHeight = 1.8 * requestedHeight

  if (size.y > .001) {
    const factor = targetHeight / size.y
    root.scale.multiplyScalar(factor)
    root.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(root)
    size = box.getSize(new THREE.Vector3())
  }

  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)
}

function recountRoot(root: THREE.Object3D): PreviewStats {
  let bones = 0
  let skinnedMeshes = 0
  let triangles = 0
  root.traverse((object) => {
    if (object instanceof THREE.Bone) bones += 1
    if (!(object instanceof THREE.Mesh)) return
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes += 1
    const geometry = object.geometry
    if (!geometry?.attributes.position) return
    triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
  })
  return { bones, skinnedMeshes, triangles: Math.round(triangles) }
}

function makeSkeletonHelper(root: THREE.Object3D) {
  const helper = new THREE.SkeletonHelper(root)
  const materials = Array.isArray(helper.material) ? helper.material : [helper.material]
  materials.forEach((material) => {
    material.transparent = true
    material.opacity = .82
  })
  return helper
}

function frameCamera(state: PreviewState, root: THREE.Object3D, cameraMode: 'studio' | 'arpg') {
  if (!state.controls || !state.camera) return
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.x, size.y, size.z)
  state.controls.enabled = true

  if (cameraMode === 'arpg') {
    const distance = Math.max(4.6, size.y * 2.65)
    state.camera.fov = 35
    state.camera.updateProjectionMatrix()
    state.controls.target.set(center.x, Math.max(.72, center.y * .74), center.z)
    state.camera.position.set(center.x + distance * .62, center.y + distance * .74, center.z - distance * .78)
  } else {
    state.camera.fov = 38
    state.camera.updateProjectionMatrix()
    state.controls.target.set(center.x, Math.max(.8, center.y), center.z)
    state.camera.position.set(center.x + radius * 1.2, center.y + size.y * .08, center.z - radius * 1.9)
  }

  state.camera.lookAt(state.controls.target)
  state.controls.update()
}

async function refreshPreviewEquipment(
  state: PreviewState,
  root: THREE.Object3D,
  equipmentItems:
    | Partial<
        Record<
          ForgeEquipmentSlot,
          ForgeItemDefinition
        >
      >
    | undefined,
) {
  clearPreviewEquipment(state)
  const revision = state.equipmentRevision ?? 0
  const models =
    new Map<ForgeEquipmentSlot, THREE.Object3D>()
  const anchors =
    new Map<ForgeEquipmentSlot, THREE.Group>()
  state.equipmentModels = models
  state.equipmentAnchors = anchors

  for (const slot of FORGE_EQUIPMENT_SLOTS) {
    const item = equipmentItems?.[slot]
    if (!item) continue
    try {
      const model = await bindEquipmentVisualModel(
        {
          characterRoot: root,
          fallbackParent: root,
          anchors,
        },
        item,
        slot,
      )
      if (
        revision !== state.equipmentRevision ||
        state.root !== root
      ) {
        clearEquipmentVisualModels(
          new Map([[slot, model]]),
        )
        continue
      }
      models.set(slot, model)
    } catch {
      // Keep the character visible even if one optional
      // equipment asset cannot be loaded.
    }
  }
}

function clearPreviewEquipment(
  state: PreviewState,
) {
  state.equipmentRevision =
    (state.equipmentRevision ?? 0) + 1
  clearEquipmentVisualModels(
    state.equipmentModels,
  )
  clearEquipmentVisualAnchors(
    state.equipmentAnchors,
  )
  state.equipmentModels = undefined
  state.equipmentAnchors = undefined
}

function clearPreview(state: PreviewState) {
  clearPreviewEquipment(state)
  state.mixer?.stopAllAction()
  state.mixer = undefined
  state.action = undefined
  if (state.helper && state.scene) {
    state.scene.remove(state.helper)
    state.helper.dispose()
    state.helper = undefined
  }
  if (state.hitbox && state.scene) {
    state.scene.remove(state.hitbox)
    state.hitbox.geometry.dispose()
    const material = state.hitbox.material
    if (!Array.isArray(material)) material.dispose()
    state.hitbox = undefined
  }
  if (state.turntable && state.scene) {
    state.scene.remove(state.turntable)
    if (state.root) {
      state.turntable.remove(state.root)
    }
    state.turntable = undefined
  }
  if (state.root) {
    state.root.removeFromParent()
    disposeRoot(state.root)
    state.root = undefined
  }
  state.paperDollDrag = undefined
  state.clips = undefined
}

function disposeRoot(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry?.dispose()
    const list = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of list) if (material) materials.add(material)
  })
  for (const material of materials) material.dispose()
}

function addHitbox(scene: THREE.Scene, config: ForgeCharacterConfig) {
  const height = 1.8 * config.height
  const radius = .31 * config.bulk
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(.2, height - radius * 2), 6, 12),
    new THREE.MeshBasicMaterial({
      color: 0x76c9ff,
      transparent: true,
      opacity: .12,
      wireframe: true,
      depthWrite: false,
    }),
  )
  mesh.position.y = height / 2
  scene.add(mesh)
  return mesh
}
