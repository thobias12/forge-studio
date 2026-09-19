import {
  useEffect,
  useRef,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  loadCharacterAssetScene,
  setSkillboundBaseClothingVisible,
} from '../lib/characterAssetRegistry'
import type { LibraryAsset } from '../lib/library'
import type {
  EquipmentForgeSlot,
  EquipmentMaterialOverrides,
} from '../engine/equipmentForge'

export type EquipmentForgeMaterialInfo = {
  key: string
  assetId: string
  slot: EquipmentForgeSlot
  name: string
  color: string
  roughness: number
  metalness: number
}

type Props = {
  bodyAsset?: LibraryAsset
  slots: Partial<
    Record<EquipmentForgeSlot, LibraryAsset>
  >
  overrides: EquipmentMaterialOverrides
  animate: boolean
  baseClothingVisible: boolean
  onMaterials?: (
    materials: EquipmentForgeMaterialInfo[],
  ) => void
  onStatus?: (status: string) => void
}

type ViewportState = {
  scene?: THREE.Scene
  assembly?: THREE.Group
  bodyRoot?: THREE.Group
  equipmentRoot?: THREE.Group
  mixer?: THREE.AnimationMixer
  action?: THREE.AnimationAction
  materials: Map<
    string,
    THREE.MeshStandardMaterial[]
  >
  buildRevision: number
}

export default function EquipmentForgeViewport({
  bodyAsset,
  slots,
  overrides,
  animate,
  baseClothingVisible,
  onMaterials,
  onStatus,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ViewportState>({
    materials: new Map(),
    buildRevision: 0,
  })
  const callbacksRef = useRef({
    onMaterials,
    onStatus,
  })
  callbacksRef.current = {
    onMaterials,
    onStatus,
  }

  const slotSignature = Object.entries(slots)
    .map(([slot, asset]) =>
      `${slot}:${asset?.id ?? ''}`,
    )
    .sort()
    .join('|')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x090d12)
    scene.fog = new THREE.Fog(
      0x090d12,
      8,
      18,
    )

    const camera =
      new THREE.PerspectiveCamera(
        34,
        1,
        .02,
        80,
      )
    camera.position.set(2.55, 1.48, -3.65)

    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      })
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 2),
    )
    renderer.outputColorSpace =
      THREE.SRGBColorSpace
    renderer.toneMapping =
      THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(
      camera,
      renderer.domElement,
    )
    controls.enableDamping = true
    controls.enablePan = false
    controls.target.set(0, .98, 0)
    controls.minDistance = 1.45
    controls.maxDistance = 7

    scene.add(
      new THREE.HemisphereLight(
        0xe4edf7,
        0x161b22,
        2.1,
      ),
    )

    const key = new THREE.DirectionalLight(
      0xfff0db,
      3.8,
    )
    key.position.set(3.8, 5.2, -3.2)
    key.castShadow = true
    scene.add(key)

    const rim = new THREE.DirectionalLight(
      0x6d8fc6,
      2.2,
    )
    rim.position.set(-4, 3, 3.4)
    scene.add(rim)

    const fill = new THREE.PointLight(
      0xd6b185,
      1.35,
      6,
      2,
    )
    fill.position.set(-1.8, 1.5, -1.8)
    scene.add(fill)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 56),
      new THREE.MeshStandardMaterial({
        color: 0x111820,
        roughness: .94,
        metalness: 0,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const grid = new THREE.GridHelper(
      8,
      28,
      0x263442,
      0x17212b,
    )
    grid.position.y = .002
    scene.add(grid)

    const assembly = new THREE.Group()
    assembly.name = '__equipment_forge_assembly'
    assembly.rotation.y = Math.PI
    scene.add(assembly)

    stateRef.current.scene = scene
    stateRef.current.assembly = assembly

    const observer = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(
        rect.width,
        rect.height,
        false,
      )
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    })
    observer.observe(host)

    let raf = 0
    let previous = performance.now()
    const frame = (now: number) => {
      const delta = Math.min(
        .05,
        Math.max(0, (now - previous) / 1000),
      )
      previous = now
      stateRef.current.mixer?.update(delta)
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      clearAssembly(stateRef.current)
      ground.geometry.dispose()
      ;(
        ground.material as THREE.Material
      ).dispose()
      renderer.dispose()
      renderer.domElement.remove()
      stateRef.current = {
        materials: new Map(),
        buildRevision: 0,
      }
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current
    if (!state.assembly) return
    const revision =
      ++state.buildRevision
    clearAssembly(state)

    if (!bodyAsset) {
      callbacksRef.current.onMaterials?.([])
      callbacksRef.current.onStatus?.(
        'Install or choose a Skillbound base character to begin.',
      )
      return
    }

    const rebuild = async () => {
      callbacksRef.current.onStatus?.(
        `Loading ${bodyAsset.name}…`,
      )
      try {
        const body = await loadCharacterAssetScene(
          bodyAsset.blob,
        )
        if (
          revision !==
          stateRef.current.buildRevision
        ) {
          disposeObject(body.scene)
          return
        }

        const bodyRoot = body.scene
        bodyRoot.name =
          '__equipment_forge_body'
        bodyRoot.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.castShadow = true
          object.receiveShadow = false
          object.frustumCulled = false
        })
        setSkillboundBaseClothingVisible(
          bodyRoot,
          baseClothingVisible,
        )
        state.bodyRoot = bodyRoot
        state.assembly?.add(bodyRoot)

        if (body.animations.length) {
          const mixer =
            new THREE.AnimationMixer(bodyRoot)
          const clip =
            body.animations.find((entry) =>
              entry.name
                .toLowerCase()
                .includes('qa_deformation'),
            ) ?? body.animations[0]
          const action = mixer.clipAction(clip)
          action.play()
          action.paused = !animate
          state.mixer = mixer
          state.action = action
        }

        const equipmentRoot =
          new THREE.Group()
        equipmentRoot.name =
          '__equipment_forge_slots'
        bodyRoot.add(equipmentRoot)
        state.equipmentRoot =
          equipmentRoot
        state.materials.clear()

        const catalog:
          EquipmentForgeMaterialInfo[] = []

        for (
          const [slot, asset] of Object.entries(
            slots,
          ) as [
            EquipmentForgeSlot,
            LibraryAsset,
          ][]
        ) {
          if (!asset) continue
          const loaded =
            await loadCharacterAssetScene(
              asset.blob,
            )
          if (
            revision !==
            stateRef.current.buildRevision
          ) {
            disposeObject(loaded.scene)
            return
          }

          bindEquipmentScene(
            loaded.scene,
            bodyRoot,
            equipmentRoot,
            asset,
            slot,
            state.materials,
            catalog,
          )
          disposeSourceSkeletonOnly(
            loaded.scene,
          )
        }

        applyMaterialOverrides(
          state.materials,
          overrides,
        )
        callbacksRef.current.onMaterials?.(
          uniqueCatalog(catalog),
        )
        callbacksRef.current.onStatus?.(
          `Ready · ${Object.keys(slots).length} equipped slot${
            Object.keys(slots).length === 1
              ? ''
              : 's'
          }`,
        )
        frameAssembly(
          state.assembly,
          stateRef.current.scene,
        )
      } catch (error) {
        callbacksRef.current.onStatus?.(
          error instanceof Error
            ? error.message
            : 'Could not assemble that equipment.',
        )
      }
    }

    void rebuild()
    return () => {
      if (
        revision ===
        stateRef.current.buildRevision
      ) {
        stateRef.current.buildRevision += 1
      }
    }
  }, [
    bodyAsset?.id,
    slotSignature,
  ])

  useEffect(() => {
    const state = stateRef.current
    if (!state.bodyRoot) return
    setSkillboundBaseClothingVisible(
      state.bodyRoot,
      baseClothingVisible,
    )
  }, [baseClothingVisible])

  useEffect(() => {
    if (stateRef.current.action) {
      stateRef.current.action.paused = !animate
    }
  }, [animate])

  useEffect(() => {
    applyMaterialOverrides(
      stateRef.current.materials,
      overrides,
    )
  }, [overrides])

  return (
    <div
      ref={hostRef}
      className="equipment-forge-viewport-canvas"
    />
  )
}

function bindEquipmentScene(
  sourceRoot: THREE.Group,
  bodyRoot: THREE.Group,
  equipmentRoot: THREE.Group,
  asset: LibraryAsset,
  slot: EquipmentForgeSlot,
  materialMap: Map<
    string,
    THREE.MeshStandardMaterial[]
  >,
  catalog: EquipmentForgeMaterialInfo[],
) {
  sourceRoot.updateMatrixWorld(true)
  bodyRoot.updateMatrixWorld(true)

  const bodyBones =
    new Map<string, THREE.Bone>()
  bodyRoot.traverse((object) => {
    if (object instanceof THREE.Bone) {
      bodyBones.set(object.name, object)
    }
  })

  const inverseBody =
    bodyRoot.matrixWorld.clone().invert()

  sourceRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return

    const localMatrix = inverseBody
      .clone()
      .multiply(object.matrixWorld)

    if (
      object instanceof THREE.SkinnedMesh &&
      object.skeleton?.bones.length
    ) {
      const mapped = object.skeleton.bones.map(
        (bone) => bodyBones.get(bone.name),
      )
      if (mapped.some((bone) => !bone)) {
        return
      }

      const mesh = new THREE.SkinnedMesh(
        object.geometry.clone(),
        cloneMaterials(
          object.material,
          asset,
          slot,
          materialMap,
          catalog,
        ),
      )
      mesh.name = `EF_${slot}_${object.name}`
      mesh.bindMode = object.bindMode
      localMatrix.decompose(
        mesh.position,
        mesh.quaternion,
        mesh.scale,
      )
      const skeleton = new THREE.Skeleton(
        mapped as THREE.Bone[],
        object.skeleton.boneInverses.map(
          (matrix) => matrix.clone(),
        ),
      )
      mesh.bind(
        skeleton,
        object.bindMatrix.clone(),
      )
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      mesh.userData.equipmentAssetId =
        asset.id
      mesh.userData.equipmentSlot = slot
      equipmentRoot.add(mesh)
      return
    }

    const mesh = object.clone(false)
    mesh.geometry = object.geometry.clone()
    mesh.material = cloneMaterials(
      object.material,
      asset,
      slot,
      materialMap,
      catalog,
    )
    localMatrix.decompose(
      mesh.position,
      mesh.quaternion,
      mesh.scale,
    )
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    mesh.userData.equipmentAssetId =
      asset.id
    mesh.userData.equipmentSlot = slot
    equipmentRoot.add(mesh)
  })
}

function cloneMaterials(
  input: THREE.Material | THREE.Material[],
  asset: LibraryAsset,
  slot: EquipmentForgeSlot,
  materialMap: Map<
    string,
    THREE.MeshStandardMaterial[]
  >,
  catalog: EquipmentForgeMaterialInfo[],
) {
  const sourceList =
    Array.isArray(input) ? input : [input]
  const cloned = sourceList.map((source, index) => {
    const material = source.clone()
    const fallbackName =
      `${slot} Material ${index + 1}`
    material.name =
      source.name || fallbackName

    if (
      material instanceof
        THREE.MeshStandardMaterial
    ) {
      const key =
        `${asset.id}::${material.name}`
      const list =
        materialMap.get(key) ?? []
      list.push(material)
      materialMap.set(key, list)
      catalog.push({
        key,
        assetId: asset.id,
        slot,
        name: material.name,
        color: `#${material.color.getHexString()}`,
        roughness: material.roughness,
        metalness: material.metalness,
      })
    }
    return material
  })

  return Array.isArray(input)
    ? cloned
    : cloned[0]
}

function applyMaterialOverrides(
  materials: Map<
    string,
    THREE.MeshStandardMaterial[]
  >,
  overrides: EquipmentMaterialOverrides,
) {
  materials.forEach((instances, key) => {
    const separator = key.indexOf('::')
    if (separator < 0) return
    const assetId = key.slice(0, separator)
    const materialName =
      key.slice(separator + 2)
    const override =
      overrides[assetId]?.[materialName]
    if (!override) return
    for (const material of instances) {
      material.color.set(override.color)
      material.roughness =
        THREE.MathUtils.clamp(
          override.roughness,
          0,
          1,
        )
      material.metalness =
        THREE.MathUtils.clamp(
          override.metalness,
          0,
          1,
        )
      material.needsUpdate = true
    }
  })
}

function uniqueCatalog(
  catalog: EquipmentForgeMaterialInfo[],
) {
  const seen = new Set<string>()
  return catalog.filter((entry) => {
    if (seen.has(entry.key)) return false
    seen.add(entry.key)
    return true
  })
}

function clearAssembly(
  state: ViewportState,
) {
  state.mixer?.stopAllAction()
  state.mixer = undefined
  state.action = undefined
  if (state.bodyRoot) {
    state.bodyRoot.removeFromParent()
    disposeObject(state.bodyRoot)
    state.bodyRoot = undefined
  }
  state.equipmentRoot = undefined
  state.materials.clear()
}

function disposeSourceSkeletonOnly(
  root: THREE.Object3D,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry?.dispose()
    const materials =
      Array.isArray(object.material)
        ? object.material
        : [object.material]
    materials.forEach((material) =>
      material?.dispose(),
    )
  })
}

function disposeObject(
  root: THREE.Object3D,
) {
  const materials =
    new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry?.dispose()
    const list =
      Array.isArray(object.material)
        ? object.material
        : [object.material]
    list.forEach((material) => {
      if (material) materials.add(material)
    })
  })
  materials.forEach((material) =>
    material.dispose(),
  )
}

function frameAssembly(
  assembly?: THREE.Object3D,
  scene?: THREE.Scene,
) {
  void assembly
  void scene
}
