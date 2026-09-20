import {
  useEffect,
  useRef,
} from 'react'
import * as THREE from 'three'
import {
  OrbitControls,
} from 'three/examples/jsm/controls/OrbitControls.js'
import {
  GLTFLoader,
} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  setSkillboundBaseClothingVisible,
} from '../lib/characterAssetRegistry'

type Props = {
  bodySrc?: string
  equipmentSrc?: string
  rawOnly?: boolean
  slot?: string
}

export default function EquipmentLabViewer({
  bodySrc,
  equipmentSrc,
  rawOnly = false,
  slot,
}: Props) {
  const mountRef =
    useRef<HTMLDivElement | null>(
      null,
    )

  useEffect(() => {
    const mount =
      mountRef.current
    if (!mount) return

    let disposed = false
    const scene =
      new THREE.Scene()
    scene.background =
      new THREE.Color(
        '#090d12',
      )

    const camera =
      new THREE.PerspectiveCamera(
        34,
        1,
        .01,
        100,
      )
    const renderer =
      new THREE.WebGLRenderer({
        antialias: true,
      })
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2,
      ),
    )
    renderer.outputColorSpace =
      THREE.SRGBColorSpace
    renderer.toneMapping =
      THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure =
      1.05
    mount.appendChild(
      renderer.domElement,
    )

    scene.add(
      new THREE.HemisphereLight(
        0xdce8fa,
        0x151a21,
        2.3,
      ),
    )
    const key =
      new THREE.DirectionalLight(
        0xfff2df,
        3.6,
      )
    key.position.set(
      4,
      6,
      -3,
    )
    scene.add(key)

    const rim =
      new THREE.DirectionalLight(
        0x7294c9,
        1.8,
      )
    rim.position.set(
      -4,
      3,
      4,
    )
    scene.add(rim)

    const grid =
      new THREE.GridHelper(
        6,
        24,
        0x2f3a49,
        0x17202a,
      )
    scene.add(grid)

    const controls =
      new OrbitControls(
        camera,
        renderer.domElement,
      )
    controls.enableDamping = true
    controls.dampingFactor = .08

    const content =
      new THREE.Group()
    scene.add(content)

    const loader =
      new GLTFLoader()
    const loadedRoots:
      THREE.Object3D[] = []

    const frameObject = (
      root: THREE.Object3D,
      bodyRoot?: THREE.Object3D,
    ) => {
      root.updateMatrixWorld(true)
      const box =
        new THREE.Box3().setFromObject(
          bodyRoot ?? root,
        )
      if (box.isEmpty()) return

      const size =
        box.getSize(
          new THREE.Vector3(),
        )
      const center =
        box.getCenter(
          new THREE.Vector3(),
        )

      root.position.x -= center.x
      root.position.z -= center.z
      root.position.y -= box.min.y
      root.updateMatrixWorld(true)

      const height =
        Math.max(
          .4,
          size.y,
        )
      const width =
        Math.max(
          size.x,
          size.z,
        )
      const span =
        Math.max(
          height,
          width * 1.25,
        )

      camera.position.set(
        span * 1.15,
        height * .62,
        span * 1.75,
      )
      controls.target.set(
        0,
        height * .52,
        0,
      )
      controls.update()
    }

    const load = async () => {
      try {
        if (rawOnly) {
          if (!equipmentSrc) {
            return
          }
          const gltf =
            await loader.loadAsync(
              equipmentSrc,
            )
          if (disposed) return
          loadedRoots.push(
            gltf.scene,
          )
          content.add(
            gltf.scene,
          )
          if (slot === 'chest') {
            autoOrientChestForPreview(
              gltf.scene,
            )
          }
          frameObject(content)
          return
        }

        let bodyRoot:
          THREE.Object3D | undefined

        if (bodySrc) {
          const bodyGltf =
            await loader.loadAsync(
              bodySrc,
            )
          if (disposed) return
          bodyRoot =
            bodyGltf.scene
          setSkillboundBaseClothingVisible(
            bodyRoot,
            false,
          )
          loadedRoots.push(
            bodyRoot,
          )
          content.add(
            bodyRoot,
          )
        }

        if (equipmentSrc) {
          const equipmentGltf =
            await loader.loadAsync(
              equipmentSrc,
            )
          if (disposed) return
          loadedRoots.push(
            equipmentGltf.scene,
          )
          content.add(
            equipmentGltf.scene,
          )
        }

        frameObject(
          content,
          bodyRoot,
        )
      } catch (error) {
        console.error(
          'Equipment Lab preview failed.',
          error,
        )
      }
    }

    void load()

    const resize = () => {
      const rect =
        mount.getBoundingClientRect()
      renderer.setSize(
        Math.max(1, rect.width),
        Math.max(1, rect.height),
        false,
      )
      camera.aspect =
        rect.width /
        Math.max(
          1,
          rect.height,
        )
      camera.updateProjectionMatrix()
    }

    const observer =
      new ResizeObserver(
        resize,
      )
    observer.observe(mount)

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(
        scene,
        camera,
      )
      raf =
        requestAnimationFrame(
          tick,
        )
    }

    resize()
    tick()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()

      for (
        const root of loadedRoots
      ) {
        disposeObject(root)
      }

      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [
    bodySrc,
    equipmentSrc,
    rawOnly,
    slot,
  ])

  return (
    <div
      className="equipment-lab-viewer"
      ref={mountRef}
    />
  )
}

function disposeObject(
  root: THREE.Object3D,
) {
  const geometries =
    new Set<
      THREE.BufferGeometry
    >()
  const materials =
    new Set<
      THREE.Material
    >()

  root.traverse(
    (object) => {
      if (
        !(
          object instanceof
          THREE.Mesh
        )
      ) {
        return
      }

      if (object.geometry) {
        geometries.add(
          object.geometry,
        )
      }

      const list =
        Array.isArray(
          object.material,
        )
          ? object.material
          : [object.material]

      for (
        const material of list
      ) {
        if (material) {
          materials.add(
            material,
          )
        }
      }
    },
  )

  for (
    const geometry of geometries
  ) {
    geometry.dispose()
  }
  for (
    const material of materials
  ) {
    material.dispose()
  }
}


function autoOrientChestForPreview(
  root: THREE.Object3D,
) {
  const original =
    root.quaternion.clone()
  let best =
    original.clone()
  let bestScore =
    Number.POSITIVE_INFINITY

  const targetWidthRatio =
    1.18
  const targetDepthRatio =
    0.62

  for (
    const x of [
      0,
      Math.PI / 2,
      Math.PI,
      Math.PI * 1.5,
    ]
  ) {
    for (
      const y of [
        0,
        Math.PI / 2,
        Math.PI,
        Math.PI * 1.5,
      ]
    ) {
      for (
        const z of [
          0,
          Math.PI / 2,
          Math.PI,
          Math.PI * 1.5,
        ]
      ) {
        const candidate =
          new THREE.Quaternion()
            .setFromEuler(
              new THREE.Euler(
                x,
                y,
                z,
                'XYZ',
              ),
            )
        root.quaternion
          .copy(original)
          .multiply(candidate)
        root.updateMatrixWorld(true)

        const size =
          new THREE.Box3()
            .setFromObject(root)
            .getSize(
              new THREE.Vector3(),
            )
        const height =
          Math.max(
            size.y,
            1e-5,
          )
        const width =
          Math.max(
            size.x,
            1e-5,
          )
        const depth =
          Math.max(
            size.z,
            1e-5,
          )

        const score =
          Math.abs(
            Math.log(
              (width / height) /
              targetWidthRatio,
            ),
          ) +
          1.25 *
          Math.abs(
            Math.log(
              (depth / height) /
              targetDepthRatio,
            ),
          )

        if (
          score < bestScore
        ) {
          bestScore = score
          best.copy(
            root.quaternion,
          )
        }
      }
    }
  }

  root.quaternion.copy(best)
  root.updateMatrixWorld(true)
}
