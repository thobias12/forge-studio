import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createProceduralCharacter, disposeForgeCharacter, type ForgeCharacterConfig } from '../lib/proceduralCharacter'
import { createConceptCharacter } from '../lib/conceptCryptSkeleton'

type Props = {
  config: ForgeCharacterConfig
  animation: string
  playing: boolean
  showRig: boolean
  showHitbox: boolean
  cameraMode?: 'studio' | 'arpg'
  onStats?: (stats: { bones: number; skinnedMeshes: number; triangles: number }) => void
}

export default function CharacterForgePreview({ config, animation, playing, showRig, showHitbox, cameraMode = 'studio', onStats }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{ root?: THREE.Group; helper?: THREE.SkeletonHelper; hitbox?: THREE.Mesh; mixer?: THREE.AnimationMixer; action?: THREE.AnimationAction; clips?: THREE.AnimationClip[] }>({})
  const callbackRef = useRef(onStats)
  callbackRef.current = onStats

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x070b10)
    scene.fog = new THREE.Fog(0x070b10, 7, 18)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 80)
    camera.position.set(2.55, 1.65, 3.7)
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
    controls.target.set(0, 0.95, 0)
    controls.minDistance = 1.4
    controls.maxDistance = 10
    scene.add(new THREE.HemisphereLight(0xd7e6f3, 0x151b22, 2.3))
    const key = new THREE.DirectionalLight(0xfff3df, 3.5); key.position.set(3.8, 5.5, 4.4); key.castShadow = true; scene.add(key)
    const rim = new THREE.DirectionalLight(0x718fb0, 2); rim.position.set(-3.5, 3, -4); scene.add(rim)
    const warm = new THREE.PointLight(0xff9d5c, 1.2, 6, 2); warm.position.set(-2.4, 1.4, 2); scene.add(warm)

    const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x10171e, roughness: 0.93 }))
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
    const grid = new THREE.GridHelper(8, 24, 0x2a3a48, 0x17222c); grid.position.y = 0.003; scene.add(grid)

    ;(stateRef.current as typeof stateRef.current & { scene?: THREE.Scene; camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).scene = scene
    ;(stateRef.current as typeof stateRef.current & { scene?: THREE.Scene; camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).camera = camera
    ;(stateRef.current as typeof stateRef.current & { scene?: THREE.Scene; camera?: THREE.PerspectiveCamera; controls?: OrbitControls }).controls = controls

    const resize = () => {
      const rect = host.getBoundingClientRect(); if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize); observer.observe(host); resize()
    let raf = 0, previous = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000)); previous = now
      stateRef.current.mixer?.update(dt)
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); controls.dispose(); stateRef.current.mixer?.stopAllAction()
      disposeForgeCharacter(stateRef.current.root); stateRef.current.helper?.dispose(); stateRef.current.hitbox?.geometry.dispose()
      const material = stateRef.current.hitbox?.material; if (material && !Array.isArray(material)) material.dispose()
      renderer.dispose(); renderer.domElement.remove(); stateRef.current = {}
    }
  }, [])

  useEffect(() => {
    const state = stateRef.current as typeof stateRef.current & { scene?: THREE.Scene; camera?: THREE.PerspectiveCamera; controls?: OrbitControls }
    if (!state.scene) return
    state.mixer?.stopAllAction(); state.mixer = undefined; state.action = undefined
    if (state.helper) { state.scene.remove(state.helper); state.helper.dispose(); state.helper = undefined }
    if (state.hitbox) { state.scene.remove(state.hitbox); state.hitbox.geometry.dispose(); const mat = state.hitbox.material; if (!Array.isArray(mat)) mat.dispose(); state.hitbox = undefined }
    if (state.root) { state.scene.remove(state.root); disposeForgeCharacter(state.root) }

    const conceptBuild = config.name.toLowerCase().includes('concept')
    const build = conceptBuild ? createConceptCharacter(config) : createProceduralCharacter(config)
    state.root = build.root; state.clips = build.clips; state.scene.add(build.root); callbackRef.current?.(build.stats)
    state.mixer = new THREE.AnimationMixer(build.root)
    const clip = build.clips.find((entry) => entry.name === animation) ?? build.clips[0]
    if (clip) { const action = state.mixer.clipAction(clip); action.play(); action.paused = !playing; state.action = action }
    if (showRig) { state.helper = new THREE.SkeletonHelper(build.root); const mats = Array.isArray(state.helper.material) ? state.helper.material : [state.helper.material]; mats.forEach((m) => { m.transparent = true; m.opacity = 0.82 }); state.scene.add(state.helper) }
    if (showHitbox) state.hitbox = addHitbox(state.scene, config)

    const box = new THREE.Box3().setFromObject(build.root)
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), radius = Math.max(size.x, size.y, size.z)
    if (state.controls && state.camera) {
      if (cameraMode === 'arpg') {
        const distance = Math.max(4.6, size.y * 2.65)
        state.camera.fov = 35
        state.camera.updateProjectionMatrix()
        state.controls.enabled = false
        state.controls.target.set(center.x, Math.max(0.72, center.y * 0.74), center.z)
        state.camera.position.set(center.x + distance * 0.62, center.y + distance * 0.74, center.z + distance * 0.78)
        state.camera.lookAt(state.controls.target)
      } else {
        state.camera.fov = 38
        state.camera.updateProjectionMatrix()
        state.controls.enabled = true
        state.controls.target.set(center.x, Math.max(0.8, center.y), center.z)
        state.camera.position.set(center.x + radius * 1.2, center.y + size.y * 0.08, center.z + radius * 1.9)
        state.controls.update()
      }
    }
  }, [config, cameraMode])

  useEffect(() => {
    const state = stateRef.current
    if (!state.root || !state.clips?.length) return
    state.action?.stop()
    const clip = state.clips.find((entry) => entry.name === animation) ?? state.clips[0]
    const action = state.mixer?.clipAction(clip)
    if (!action) return
    action.reset().play(); action.paused = !playing; state.action = action
  }, [animation])

  useEffect(() => { if (stateRef.current.action) stateRef.current.action.paused = !playing }, [playing])

  useEffect(() => {
    const state = stateRef.current as typeof stateRef.current & { scene?: THREE.Scene }
    if (!state.scene || !state.root) return
    if (showRig && !state.helper) { state.helper = new THREE.SkeletonHelper(state.root); const mats = Array.isArray(state.helper.material) ? state.helper.material : [state.helper.material]; mats.forEach((m) => { m.transparent = true; m.opacity = 0.82 }); state.scene.add(state.helper) }
    else if (!showRig && state.helper) { state.scene.remove(state.helper); state.helper.dispose(); state.helper = undefined }
  }, [showRig])

  useEffect(() => {
    const state = stateRef.current as typeof stateRef.current & { scene?: THREE.Scene }
    if (!state.scene) return
    if (showHitbox && !state.hitbox) state.hitbox = addHitbox(state.scene, config)
    else if (!showHitbox && state.hitbox) { state.scene.remove(state.hitbox); state.hitbox.geometry.dispose(); const mat = state.hitbox.material; if (!Array.isArray(mat)) mat.dispose(); state.hitbox = undefined }
  }, [showHitbox])

  return <div className="character-forge-preview" ref={hostRef} />
}

function addHitbox(scene: THREE.Scene, config: ForgeCharacterConfig) {
  const height = 1.8 * config.height, radius = 0.31 * config.bulk
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.2, height - radius * 2), 6, 12), new THREE.MeshBasicMaterial({ color: 0x76c9ff, transparent: true, opacity: 0.12, wireframe: true, depthWrite: false }))
  mesh.position.y = height / 2; scene.add(mesh); return mesh
}
