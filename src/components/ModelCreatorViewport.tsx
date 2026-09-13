import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  bevelFace,
  createPrimitive,
  exportMeshGlb,
  extrudeFace,
  faceVertexIds,
  insetFace,
  mirrorGeometry,
  moveVertices,
  restoreSnapshot,
  snapshotMesh,
  type EditMode,
  type ModelSnapshot,
  type PrimitiveKind,
} from '../lib/modelCreator'

export type TransformTool = 'translate' | 'rotate' | 'scale'

export type ModelCreatorStats = {
  vertices: number
  faces: number
  selectedVertices: number
  selectedFace: number
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type ModelCreatorHandle = {
  newPrimitive: (kind: PrimitiveKind) => void
  setMode: (mode: EditMode) => void
  setTool: (tool: TransformTool) => void
  setSnap: (snap: number) => void
  setFlatShading: (enabled: boolean) => void
  nudgeSelection: (axis: 'x' | 'y' | 'z', direction: -1 | 1) => void
  selectAllVertices: () => void
  clearSelection: () => void
  extrudeSelectedFace: (distance?: number) => void
  insetSelectedFace: (amount?: number) => void
  bevelSelectedFace: (amount?: number, depth?: number) => void
  mirror: (axis?: 'x' | 'y' | 'z') => void
  undo: () => void
  redo: () => void
  resetView: () => void
  setObjectTransform: (kind: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => void
  exportGlb: (name: string) => Promise<Blob>
}

type Props = {
  onStats?: (stats: ModelCreatorStats) => void
  onStatus?: (status: string) => void
}

const ModelCreatorViewport = forwardRef<ModelCreatorHandle, Props>(function ModelCreatorViewport({ onStats, onStatus }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer
    scene?: THREE.Scene
    camera?: THREE.PerspectiveCamera
    orbit?: OrbitControls
    transform?: TransformControls
    mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    vertexPoints?: THREE.Points
    faceHighlight?: THREE.Mesh
    mode: EditMode
    tool: TransformTool
    snap: number
    flatShading: boolean
    selectedVertices: Set<number>
    selectedFace: number
    undo: ModelSnapshot[]
    redo: ModelSnapshot[]
    pointerDown?: { x: number; y: number }
  }>({ mode: 'object', tool: 'translate', snap: 0.1, flatShading: true, selectedVertices: new Set(), selectedFace: -1, undo: [], redo: [] })

  const emitStats = () => {
    const s = stateRef.current
    const mesh = s.mesh
    if (!mesh) return
    const vertices = mesh.geometry.getAttribute('position')?.count ?? 0
    const index = mesh.geometry.getIndex()
    const faces = index ? index.count / 3 : vertices / 3
    onStats?.({
      vertices,
      faces,
      selectedVertices: s.selectedVertices.size,
      selectedFace: s.selectedFace,
      position: mesh.position.toArray() as [number, number, number],
      rotation: [THREE.MathUtils.radToDeg(mesh.rotation.x), THREE.MathUtils.radToDeg(mesh.rotation.y), THREE.MathUtils.radToDeg(mesh.rotation.z)],
      scale: mesh.scale.toArray() as [number, number, number],
    })
  }

  const pushUndo = () => {
    const s = stateRef.current
    if (!s.mesh) return
    s.undo.push(snapshotMesh(s.mesh, s.flatShading))
    if (s.undo.length > 40) s.undo.shift()
    s.redo = []
  }

  const refreshMaterial = () => {
    const s = stateRef.current
    if (!s.mesh) return
    s.mesh.material.flatShading = s.flatShading
    s.mesh.material.needsUpdate = true
  }

  const rebuildHelpers = () => {
    const s = stateRef.current
    if (!s.scene || !s.mesh) return
    if (s.vertexPoints) {
      s.scene.remove(s.vertexPoints)
      s.vertexPoints.geometry.dispose()
      ;(s.vertexPoints.material as THREE.Material).dispose()
      s.vertexPoints = undefined
    }
    if (s.faceHighlight) {
      s.scene.remove(s.faceHighlight)
      s.faceHighlight.geometry.dispose()
      ;(s.faceHighlight.material as THREE.Material).dispose()
      s.faceHighlight = undefined
    }

    if (s.mode === 'vertex') {
      const source = s.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', source.clone())
      const colors: number[] = []
      for (let i = 0; i < source.count; i += 1) {
        if (s.selectedVertices.has(i)) colors.push(1, 0.35, 0.2)
        else colors.push(0.42, 0.72, 1)
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      const material = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false })
      const points = new THREE.Points(geometry, material)
      points.renderOrder = 8
      points.position.copy(s.mesh.position)
      points.rotation.copy(s.mesh.rotation)
      points.scale.copy(s.mesh.scale)
      s.scene.add(points)
      s.vertexPoints = points
    }

    if (s.mode === 'face' && s.selectedFace >= 0) {
      const ids = faceVertexIds(s.mesh.geometry, s.selectedFace)
      const attr = s.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      const positions: number[] = []
      ids.forEach((id) => positions.push(attr.getX(id), attr.getY(id), attr.getZ(id)))
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setIndex([0, 1, 2])
      geometry.computeVertexNormals()
      const material = new THREE.MeshBasicMaterial({ color: 0xff7f3f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false })
      const highlight = new THREE.Mesh(geometry, material)
      highlight.renderOrder = 7
      highlight.position.copy(s.mesh.position)
      highlight.rotation.copy(s.mesh.rotation)
      highlight.scale.copy(s.mesh.scale)
      s.scene.add(highlight)
      s.faceHighlight = highlight
    }
    emitStats()
  }

  const replaceGeometry = (geometry: THREE.BufferGeometry) => {
    const s = stateRef.current
    if (!s.mesh) return
    s.mesh.geometry.dispose()
    s.mesh.geometry = geometry
    s.selectedVertices.clear()
    s.selectedFace = -1
    rebuildHelpers()
  }

  const makePrimitive = (kind: PrimitiveKind) => {
    const s = stateRef.current
    if (!s.mesh) return
    if (s.mesh.geometry) s.mesh.geometry.dispose()
    s.mesh.geometry = createPrimitive(kind)
    s.mesh.position.set(0, kind === 'plane' ? 0.01 : 0.7, 0)
    s.mesh.rotation.set(kind === 'plane' ? -Math.PI / 2 : 0, 0, 0)
    s.mesh.scale.set(1, 1, 1)
    s.selectedVertices.clear()
    s.selectedFace = -1
    s.undo = []
    s.redo = []
    rebuildHelpers()
    onStatus?.(`Created ${kind}. Switch to Vertex or Face mode to edit the mesh.`)
  }

  const setMode = (mode: EditMode) => {
    const s = stateRef.current
    s.mode = mode
    if (s.transform && s.mesh) {
      if (mode === 'object') s.transform.attach(s.mesh)
      else s.transform.detach()
    }
    if (mode !== 'vertex') s.selectedVertices.clear()
    if (mode !== 'face') s.selectedFace = -1
    rebuildHelpers()
  }

  const applyUndoSnapshot = (snapshot: ModelSnapshot) => {
    const s = stateRef.current
    if (!s.mesh) return
    restoreSnapshot(s.mesh, snapshot)
    s.flatShading = snapshot.flatShading
    refreshMaterial()
    s.selectedVertices.clear()
    s.selectedFace = -1
    rebuildHelpers()
  }

  useImperativeHandle(ref, () => ({
    newPrimitive: makePrimitive,
    setMode,
    setTool: (tool) => {
      const s = stateRef.current
      s.tool = tool
      s.transform?.setMode(tool)
    },
    setSnap: (snap) => {
      const s = stateRef.current
      s.snap = Math.max(0, snap)
      s.transform?.setTranslationSnap(s.snap || null)
      s.transform?.setRotationSnap(s.snap ? THREE.MathUtils.degToRad(15) : null)
      s.transform?.setScaleSnap(s.snap || null)
    },
    setFlatShading: (enabled) => {
      const s = stateRef.current
      s.flatShading = enabled
      refreshMaterial()
      emitStats()
    },
    nudgeSelection: (axis, direction) => {
      const s = stateRef.current
      if (!s.mesh || s.mode !== 'vertex' || !s.selectedVertices.size) return
      pushUndo()
      const amount = s.snap || 0.05
      const delta = new THREE.Vector3()
      delta[axis] = amount * direction
      moveVertices(s.mesh.geometry, [...s.selectedVertices], delta, s.snap)
      rebuildHelpers()
    },
    selectAllVertices: () => {
      const s = stateRef.current
      if (!s.mesh || s.mode !== 'vertex') return
      const count = s.mesh.geometry.getAttribute('position').count
      s.selectedVertices = new Set(Array.from({ length: count }, (_, index) => index))
      rebuildHelpers()
    },
    clearSelection: () => {
      const s = stateRef.current
      s.selectedVertices.clear()
      s.selectedFace = -1
      rebuildHelpers()
    },
    extrudeSelectedFace: (distance = 0.18) => {
      const s = stateRef.current
      if (!s.mesh || s.selectedFace < 0) return
      pushUndo()
      const selected = s.selectedFace
      replaceGeometry(extrudeFace(s.mesh.geometry, selected, distance))
      onStatus?.('Face extruded. Select a new face to continue editing.')
    },
    insetSelectedFace: (amount = 0.22) => {
      const s = stateRef.current
      if (!s.mesh || s.selectedFace < 0) return
      pushUndo()
      const selected = s.selectedFace
      replaceGeometry(insetFace(s.mesh.geometry, selected, amount))
      onStatus?.('Face inset created.')
    },
    bevelSelectedFace: (amount = 0.18, depth = 0.06) => {
      const s = stateRef.current
      if (!s.mesh || s.selectedFace < 0) return
      pushUndo()
      const selected = s.selectedFace
      replaceGeometry(bevelFace(s.mesh.geometry, selected, amount, depth))
      onStatus?.('Face bevel applied.')
    },
    mirror: (axis = 'x') => {
      const s = stateRef.current
      if (!s.mesh) return
      pushUndo()
      replaceGeometry(mirrorGeometry(s.mesh.geometry, axis))
      onStatus?.(`Mirrored geometry across ${axis.toUpperCase()}.`)
    },
    undo: () => {
      const s = stateRef.current
      if (!s.mesh || !s.undo.length) return
      s.redo.push(snapshotMesh(s.mesh, s.flatShading))
      const snapshot = s.undo.pop()!
      applyUndoSnapshot(snapshot)
    },
    redo: () => {
      const s = stateRef.current
      if (!s.mesh || !s.redo.length) return
      s.undo.push(snapshotMesh(s.mesh, s.flatShading))
      const snapshot = s.redo.pop()!
      applyUndoSnapshot(snapshot)
    },
    resetView: () => {
      const s = stateRef.current
      s.camera?.position.set(3.4, 2.7, 4.2)
      s.orbit?.target.set(0, 0.65, 0)
      s.orbit?.update()
    },
    setObjectTransform: (kind, axis, value) => {
      const s = stateRef.current
      if (!s.mesh) return
      pushUndo()
      if (kind === 'position') s.mesh.position.setComponent(axis, s.snap ? Math.round(value / s.snap) * s.snap : value)
      if (kind === 'rotation') {
        const values = [s.mesh.rotation.x, s.mesh.rotation.y, s.mesh.rotation.z]
        values[axis] = THREE.MathUtils.degToRad(value)
        s.mesh.rotation.set(values[0], values[1], values[2])
      }
      if (kind === 'scale') s.mesh.scale.setComponent(axis, Math.max(0.01, value))
      rebuildHelpers()
    },
    exportGlb: async (name) => {
      const s = stateRef.current
      if (!s.mesh) throw new Error('No Forge model to export.')
      return await exportMeshGlb(s.mesh, name)
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const s = stateRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0f15)
    s.scene = scene

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200)
    camera.position.set(3.4, 2.7, 4.2)
    s.camera = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)
    s.renderer = renderer

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.target.set(0, 0.65, 0)
    orbit.update()
    s.orbit = orbit

    scene.add(new THREE.HemisphereLight(0xc8dcff, 0x26313c, 1.7))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(3, 5, 4)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8ab8ff, 1.3)
    rim.position.set(-4, 2, -3)
    scene.add(rim)

    const grid = new THREE.GridHelper(20, 40, 0x33485c, 0x172330)
    scene.add(grid)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x0d151e, roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.002
    floor.receiveShadow = true
    scene.add(floor)

    const material = new THREE.MeshStandardMaterial({ color: 0x7f9db8, roughness: 0.68, metalness: 0.04, flatShading: true, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(createPrimitive('cube'), material)
    mesh.name = 'ForgeModel'
    mesh.position.y = 0.7
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    s.mesh = mesh

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode('translate')
    transform.setTranslationSnap(s.snap)
    transform.addEventListener('dragging-changed', (event) => { orbit.enabled = !event.value })
    let transformStart: ModelSnapshot | undefined
    transform.addEventListener('mouseDown', () => { transformStart = snapshotMesh(mesh, s.flatShading) })
    transform.addEventListener('mouseUp', () => {
      if (transformStart) {
        s.undo.push(transformStart)
        if (s.undo.length > 40) s.undo.shift()
        s.redo = []
        transformStart = undefined
      }
      rebuildHelpers()
    })
    transform.addEventListener('objectChange', () => rebuildHelpers())
    transform.attach(mesh)
    scene.add(transform.getHelper())
    s.transform = transform

    const raycaster = new THREE.Raycaster()
    raycaster.params.Points!.threshold = 0.08
    const mouse = new THREE.Vector2()

    const selectAt = (clientX: number, clientY: number, additive: boolean) => {
      if (!s.mesh) return
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      if (s.mode === 'vertex' && s.vertexPoints) {
        const hit = raycaster.intersectObject(s.vertexPoints, false)[0]
        if (!additive) s.selectedVertices.clear()
        if (hit?.index !== undefined) {
          if (additive && s.selectedVertices.has(hit.index)) s.selectedVertices.delete(hit.index)
          else s.selectedVertices.add(hit.index)
        }
        rebuildHelpers()
      } else if (s.mode === 'face') {
        const hit = raycaster.intersectObject(s.mesh, false)[0]
        s.selectedFace = hit?.faceIndex ?? -1
        rebuildHelpers()
      }
    }

    const onPointerDown = (event: PointerEvent) => { s.pointerDown = { x: event.clientX, y: event.clientY } }
    const onPointerUp = (event: PointerEvent) => {
      if (!s.pointerDown || s.mode === 'object') return
      const distance = Math.hypot(event.clientX - s.pointerDown.x, event.clientY - s.pointerDown.y)
      s.pointerDown = undefined
      if (distance < 5) selectAt(event.clientX, event.clientY, event.shiftKey || event.ctrlKey)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const resize = () => {
      const width = host.clientWidth || 1
      const height = host.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    let frame = 0
    const loop = () => {
      orbit.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(loop)
    }
    loop()
    rebuildHelpers()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      transform.dispose()
      orbit.dispose()
      scene.traverse((object) => {
        const candidate = object as THREE.Mesh
        candidate.geometry?.dispose?.()
        const materials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : []
        materials.forEach((item) => item.dispose())
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={hostRef} className="model-creator-viewport" />
})

export default ModelCreatorViewport
