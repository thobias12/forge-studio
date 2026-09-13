import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { POSE_CONNECTIONS } from '../lib/pose'
import type { PosePoint } from '../types'

type Props = {
  landmarks?: PosePoint[]
  worldLandmarks?: PosePoint[]
  className?: string
}

export default function PoseViewport({ landmarks, worldLandmarks, className }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const poseRef = useRef({ landmarks, worldLandmarks })
  poseRef.current = { landmarks, worldLandmarks }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#090c12')
    scene.fog = new THREE.Fog('#090c12', 8, 22)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(4.7, 2.9, 7.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1.15, 0)
    controls.minDistance = 2
    controls.maxDistance = 14

    const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x172131, 1.4)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(4, 8, 5)
    scene.add(key)

    const grid = new THREE.GridHelper(14, 28, 0x283548, 0x17202d)
    grid.position.y = 0
    scene.add(grid)

    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 64),
      new THREE.MeshBasicMaterial({ color: 0x273c56, transparent: true, opacity: 0.14, depthWrite: false }),
    )
    floorGlow.rotation.x = -Math.PI / 2
    floorGlow.position.y = 0.01
    scene.add(floorGlow)

    const jointGeometry = new THREE.SphereGeometry(0.045, 12, 10)
    const jointMaterial = new THREE.MeshStandardMaterial({ color: 0xcfe4ff, emissive: 0x263b53, roughness: 0.35 })
    const jointMeshes = Array.from({ length: 33 }, () => {
      const mesh = new THREE.Mesh(jointGeometry, jointMaterial)
      scene.add(mesh)
      return mesh
    })

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x80b8ff, transparent: true, opacity: 0.85 })
    const lines = POSE_CONNECTIONS.map(() => {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
      const line = new THREE.Line(geometry, lineMaterial)
      scene.add(line)
      return line
    })

    const placeholderGroup = new THREE.Group()
    scene.add(placeholderGroup)
    const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0x29313e, roughness: 0.8 })
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 5, 12), placeholderMaterial)
    torso.position.y = 1.25
    placeholderGroup.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), placeholderMaterial)
    head.position.y = 2.02
    placeholderGroup.add(head)

    const limbs: THREE.Mesh[] = []
    const limbGeometry = new THREE.CapsuleGeometry(0.07, 0.65, 4, 8)
    ;[
      [-0.42, 1.38, 0, Math.PI / 10],
      [0.42, 1.38, 0, -Math.PI / 10],
      [-0.16, 0.55, 0, 0],
      [0.16, 0.55, 0, 0],
    ].forEach(([x, y, z, rz]) => {
      const limb = new THREE.Mesh(limbGeometry, placeholderMaterial)
      limb.position.set(x, y, z)
      limb.rotation.z = rz
      placeholderGroup.add(limb)
      limbs.push(limb)
    })

    function pointToVector(point: PosePoint, useWorld: boolean, hip?: PosePoint) {
      if (useWorld) {
        return new THREE.Vector3(
          (point.x - (hip?.x ?? 0)) * 2.2,
          -(point.y - (hip?.y ?? 0)) * 2.2 + 1.05,
          -(point.z - (hip?.z ?? 0)) * 2.2,
        )
      }
      return new THREE.Vector3((point.x - 0.5) * 3.2, (1 - point.y) * 3.2 - 0.1, -point.z * 2.2)
    }

    let animationFrame = 0
    const render = () => {
      const currentWorld = poseRef.current.worldLandmarks
      const current = currentWorld?.length === 33 ? currentWorld : poseRef.current.landmarks
      const useWorld = current === currentWorld && !!currentWorld?.length
      const hasPose = !!current?.length
      placeholderGroup.visible = !hasPose

      if (hasPose && current) {
        const hip = useWorld
          ? {
              x: (current[23].x + current[24].x) / 2,
              y: (current[23].y + current[24].y) / 2,
              z: (current[23].z + current[24].z) / 2,
            }
          : undefined
        const vectors = current.map((point) => pointToVector(point, useWorld, hip))
        jointMeshes.forEach((mesh, index) => {
          const point = current[index]
          mesh.visible = (point?.visibility ?? 1) > 0.25
          if (vectors[index]) mesh.position.copy(vectors[index])
        })
        lines.forEach((line, index) => {
          const [a, b] = POSE_CONNECTIONS[index]
          const position = line.geometry.attributes.position as THREE.BufferAttribute
          position.setXYZ(0, vectors[a].x, vectors[a].y, vectors[a].z)
          position.setXYZ(1, vectors[b].x, vectors[b].y, vectors[b].z)
          position.needsUpdate = true
          line.visible = (current[a]?.visibility ?? 1) > 0.25 && (current[b]?.visibility ?? 1) > 0.25
        })
      } else {
        jointMeshes.forEach((mesh) => (mesh.visible = false))
        lines.forEach((line) => (line.visible = false))
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
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      jointGeometry.dispose()
      jointMaterial.dispose()
      lineMaterial.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div className={className} ref={mountRef} />
}
