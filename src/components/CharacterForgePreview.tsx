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
  onStats,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<PreviewState>({})
  const callbackRef = useRef(onStats)
  callbackRef.current = onStats

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x070b10)
    scene.fog = new THREE.Fog(0x070b10, 7, 18)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 80)
    camera.position.set(2.55, 1.65, -3.7)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.shadowMap.enabled = true
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.rotateSpeed = 0.72
    controls.zoomSpeed = 0.85
    controls.target.set(0, 0.95, 0)
    controls.minDistance = 1.4
    controls.maxDistance = 10
    scene.add(new THREE.HemisphereLight(0xd7e6f3, 0x151b22, 2.3))
    const key = new THREE.DirectionalLight(0xfff3df, 3.5)
    key.position.set(3.8, 5.5, 4.4)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x718fb0, 2)
    rim.position.set(-3.5, 3, -4)
    scene.add(rim)
    const warm = new THREE.PointLight(0xff9d5c, 1.2, 6, 2)
    warm.position.set(-2.4, 1.4, 2)
    scene.add(warm)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 48),
      new THREE.MeshStandardMaterial({ color: 0x10171e, roughness: 0.93 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const grid = new THREE.GridHelper(8, 24, 0x2a3a48, 0x17222c)
    grid.position.y = 0.003
    scene.add(grid)

    stateRef.current.scene = scene
    stateRef.current.camera = camera
    stateRef.current.controls = controls

    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    let raf = 0
    let previous = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
      previous = now
      stateRef.current.mixer?.update(dt)
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      clearPreview(stateRef.current)
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = {}
    }
  }, [])

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
        state.scene.add(preview.root)
        callbackRef.current?.(preview.stats)

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
        if (showHitbox) state.hitbox = addHitbox(state.scene, config)
        frameCamera(state, preview.root, cameraMode)
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

  return <div className="character-forge-preview" ref={hostRef} />
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
    const build = createProceduralBaseHumanoidV2(config, identity.classId)
    const appearanceIdentity: CharacterIdentityRecipe = hairAsset
      ? { ...identity, appearance: { ...identity.appearance, hairStyle: 'none' } }
      : identity
    applyCharacterIdentityVisuals(build, appearanceIdentity)

    if (headAsset) {
      hideReplaceableHeadMeshes(build.root)
      await attachHeadPart(build.root, headAsset, 'head', identity.body.headScale)
    }
    if (hairAsset) await attachHeadPart(build.root, hairAsset, 'hair', identity.body.headScale)

    build.root.updateMatrixWorld(true)
    return { root: build.root, clips: build.clips, stats: recountRoot(build.root) }
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

function clearPreview(state: PreviewState) {
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
  if (state.root && state.scene) {
    state.scene.remove(state.root)
    disposeRoot(state.root)
    state.root = undefined
  }
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
