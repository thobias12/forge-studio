import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Swords, Volume2, WandSparkles } from 'lucide-react'
import * as THREE from 'three'
import {
  actionDefinition,
  animationPackAssetId,
  type ForgeAnimationActionId,
  type ForgeAnimationSet,
} from '../engine/animationBindings'
import { unlockForgeAudio, playLibraryAudio } from '../engine/runtime/ForgeAnimationAudio'
import {
  bindCharacterAsset,
  type ForgeCharacterVisualBinding,
  type ForgeLibraryVfxInstance,
  spawnLibraryVfx,
} from '../engine/runtime/ForgeAssetRuntime'
import type { LibraryAsset } from '../lib/library'

type Props = {
  target?: LibraryAsset
  animationSet?: ForgeAnimationSet
  action: ForgeAnimationActionId
}

export default function AnimationCombatTestArena({ target, animationSet, action }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const bindingRef = useRef<ForgeCharacterVisualBinding>()
  const sceneRef = useRef<THREE.Scene>()
  const dummyRef = useRef<THREE.Mesh>()
  const vfxRef = useRef<ForgeLibraryVfxInstance[]>([])
  const timersRef = useRef<number[]>([])
  const [ready, setReady] = useState(false)
  const [health, setHealth] = useState(100)
  const [eventLabel, setEventLabel] = useState('Ready')

  const binding = animationSet?.actions[action]
  const events = useMemo(() => [...(binding?.events ?? [])].sort((a, b) => a.time - b.time), [binding?.events])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !target) { setReady(false); return }
    let disposed = false
    let raf = 0
    let last = performance.now()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.domElement.className = 'animation-arena-canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0e13)
    scene.fog = new THREE.Fog(0x0a0e13, 8, 18)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(42, 1, .1, 40)
    camera.position.set(4.6, 3.1, 6.7)
    camera.lookAt(0, 1.05, 0)

    scene.add(new THREE.HemisphereLight(0xaec6de, 0x17110d, 1.6))
    const key = new THREE.DirectionalLight(0xffddb4, 2.4)
    key.position.set(-3, 7, 5)
    key.castShadow = true
    scene.add(key)
    const rim = new THREE.PointLight(0x5d79aa, 8, 10)
    rim.position.set(3, 3, -2)
    scene.add(rim)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: .9, metalness: .08 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 1.86, 48),
      new THREE.MeshBasicMaterial({ color: 0x6f5133, transparent: true, opacity: .55, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = .006
    scene.add(ring)

    const player = new THREE.Group()
    player.position.set(0, 0, 1.15)
    scene.add(player)

    const dummyMaterial = new THREE.MeshStandardMaterial({ color: 0x4d3130, roughness: .62, metalness: .15, emissive: 0x000000 })
    const dummy = new THREE.Mesh(new THREE.CapsuleGeometry(.48, 1.05, 6, 12), dummyMaterial)
    dummy.position.set(0, 1.02, -1.55)
    dummy.castShadow = true
    scene.add(dummy)
    dummyRef.current = dummy

    const dummyBase = new THREE.Mesh(
      new THREE.CylinderGeometry(.72, .82, .18, 24),
      new THREE.MeshStandardMaterial({ color: 0x26272a, roughness: .75, metalness: .4 }),
    )
    dummyBase.position.set(0, .09, -1.55)
    dummyBase.receiveShadow = true
    scene.add(dummyBase)

    const animationTargetId = animationSet?.targetAssetId ?? target.id
    void bindCharacterAsset(player, target.id, animationPackAssetId(animationTargetId), 1.9).then((visual) => {
      if (disposed) { visual?.dispose(); return }
      bindingRef.current = visual
      visual?.setAnimationSet(animationSet)
      setReady(Boolean(visual))
      if (visual) visual.play('idle', true)
    }).catch(() => setReady(false))

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const animate = (now: number) => {
      const delta = Math.min(.05, Math.max(0, (now - last) / 1000))
      last = now
      bindingRef.current?.update(delta)
      vfxRef.current = vfxRef.current.filter((effect) => effect.update(delta))
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current = []
      vfxRef.current.forEach((effect) => effect.dispose())
      vfxRef.current = []
      bindingRef.current?.dispose()
      bindingRef.current = undefined
      dummyRef.current = undefined
      sceneRef.current = undefined
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
      renderer.dispose()
      renderer.domElement.remove()
      setReady(false)
    }
  }, [target?.id, animationSet?.targetAssetId])

  const trigger = async () => {
    if (!bindingRef.current || !target) return
    await unlockForgeAudio()
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
    setEventLabel(`${actionDefinition(action)?.label ?? action} playing`)

    if (binding?.clip) bindingRef.current.playClipName(binding.clip, binding.loop, binding.speed)
    else bindingRef.current.play(cueForAction(action), action === 'idle' || action === 'walk' || action === 'run')

    for (const event of events) {
      const timer = window.setTimeout(() => fireEvent(event.kind, event.assetId), Math.max(0, event.time * 1000))
      timersRef.current.push(timer)
    }
  }

  const fireEvent = (kind: 'hit' | 'vfx' | 'sfx' | 'recovery', assetId?: string) => {
    if (kind === 'hit') {
      setEventLabel('HIT')
      setHealth((value) => Math.max(0, value - 18))
      const dummy = dummyRef.current
      if (dummy) {
        const material = dummy.material as THREE.MeshStandardMaterial
        material.emissive.set(0xd7473f)
        dummy.position.z -= .08
        const timer = window.setTimeout(() => {
          material.emissive.set(0x000000)
          dummy.position.z += .08
        }, 95)
        timersRef.current.push(timer)
      }
      return
    }
    if (kind === 'vfx') {
      setEventLabel('VFX')
      if (assetId && sceneRef.current && dummyRef.current) {
        void spawnLibraryVfx(sceneRef.current, assetId, dummyRef.current.position.clone()).then((effect) => {
          if (effect) vfxRef.current.push(effect)
        })
      }
      return
    }
    if (kind === 'sfx') {
      setEventLabel('SFX')
      void playLibraryAudio(assetId, { volume: .9 })
      return
    }
    setEventLabel('Recovery')
  }

  const reset = () => {
    setHealth(100)
    setEventLabel('Ready')
    bindingRef.current?.play('idle', true)
  }

  return <section className="animation-combat-arena">
    <header>
      <div><span className="eyebrow">COMBAT TEST ARENA</span><strong>{target?.name ?? 'Choose a character'}</strong><small>Preview the exact animation, hit timing, VFX and SFX without leaving Animation Studio.</small></div>
      <div className="animation-arena-actions"><button className="secondary-button" onClick={reset}><RotateCcw size={14}/> Reset</button><button className="primary-button" disabled={!ready} onClick={() => void trigger()}><Swords size={15}/> Test {actionDefinition(action)?.label ?? 'Action'}</button></div>
    </header>
    <div className="animation-arena-body">
      <div className="animation-arena-stage" ref={hostRef}>
        {!target && <div className="animation-arena-empty">Select a character above.</div>}
        {target && !ready && <div className="animation-arena-loading">Loading authored character + animation pack…</div>}
        <div className="animation-arena-dummy-hud"><span>TRAINING DUMMY</span><i><b style={{ width: `${health}%` }}/></i><small>{health} / 100</small></div>
        <div className="animation-arena-event-flash">{eventLabel}</div>
      </div>
      <aside className="animation-arena-sequence">
        <strong>EVENT SEQUENCE</strong>
        <div className="arena-sequence-clip"><span>0.00s</span><b>{binding?.clip ?? 'No authored clip'}</b></div>
        {events.map((event) => <div className={`arena-sequence-event event-${event.kind}`} key={event.id}>
          <span>{event.time.toFixed(2)}s</span>
          {event.kind === 'vfx' ? <WandSparkles size={13}/> : event.kind === 'sfx' ? <Volume2 size={13}/> : <Swords size={13}/>} 
          <b>{event.kind.toUpperCase()}</b>
          <small>{event.assetId ? 'asset linked' : event.kind === 'hit' || event.kind === 'recovery' ? 'gameplay marker' : 'no asset selected'}</small>
        </div>)}
        {!events.length && <p>Add Hit / VFX / SFX markers above, save them, then test the full sequence here.</p>}
      </aside>
    </div>
  </section>
}

function cueForAction(action: ForgeAnimationActionId) {
  if (action === 'idle') return 'idle' as const
  if (action === 'walk' || action === 'run') return 'move' as const
  if (action === 'dodge') return 'dodge' as const
  if (action === 'hit' || action === 'stagger') return 'hit' as const
  if (action === 'death') return 'death' as const
  return 'attack' as const
}
