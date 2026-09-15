import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildProceduralItemGroup } from '../engine/proceduralItemGeometry'
import type { ForgeItemGeneratorRecipe } from '../engine/itemGeneratorTypes'

export default function ProceduralItemRecipePreview({ recipe }: { recipe: ForgeItemGeneratorRecipe }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a1017)
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 60)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.rotateSpeed = 0.65
    controls.zoomSpeed = 0.8

    scene.add(new THREE.HemisphereLight(0xdcecff, 0x10151d, 1.8))
    const key = new THREE.DirectionalLight(0xffffff, 2.7)
    key.position.set(4, 6, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x739dce, 1.15)
    rim.position.set(-4, 2, -3)
    scene.add(rim)

    const root = buildProceduralItemGroup(recipe)
    scene.add(root)
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.y, size.z, 0.8)
    root.position.sub(center)
    controls.target.set(0, 0, 0)
    camera.position.set(span * 1.05, span * 0.55, span * 1.55)
    camera.lookAt(0, 0, 0)

    const resize = () => {
      const width = Math.max(120, host.clientWidth)
      const height = Math.max(180, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    let frame = 0
    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      const materials = new Set<THREE.Material>()
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const entries = Array.isArray(object.material) ? object.material : [object.material]
        entries.forEach((material) => materials.add(material))
      })
      materials.forEach((material) => material.dispose())
    }
  }, [recipe])

  return <div className="item-generator-live-preview" ref={hostRef}/>
}
