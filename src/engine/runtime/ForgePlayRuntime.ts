import * as THREE from 'three'
import type { GeneratedRegion, GeneratedRegionNode } from '../guidedWorld'

export class ForgePlayRuntime {
  private readonly host: HTMLElement
  private readonly region: GeneratedRegion
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 800)
  private readonly player = new THREE.Group()
  private readonly keys = new Set<string>()
  private readonly mouseWorld = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly resizeObserver: ResizeObserver
  private cameraDistance = 31
  private lastFrame = performance.now()
  private animationFrame = 0
  private disposed = false

  constructor(host: HTMLElement, region: GeneratedRegion) {
    this.host = host
    this.region = region
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'skillbound-runtime-canvas'
    this.host.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x07110d)
    this.scene.fog = new THREE.FogExp2(0x07110d, 0.012)
    this.buildLighting()
    this.buildRegion()
    this.buildPlayer()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.host)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false })
    this.resize()
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0x9ab9a1, 0x15110d, 1.25))
    const sun = new THREE.DirectionalLight(0xffe3bd, 2.2)
    sun.position.set(-30, 42, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -80
    sun.shadow.camera.right = 80
    sun.shadow.camera.top = 80
    sun.shadow.camera.bottom = -80
    this.scene.add(sun)
  }

  private buildRegion() {
    const { bounds } = this.region
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.maxX - bounds.minX + 32, bounds.maxZ - bounds.minZ + 32),
      new THREE.MeshStandardMaterial({ color: biomeColor(this.region.biome), roughness: 0.98, metalness: 0 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set((bounds.minX + bounds.maxX) / 2, -0.12, (bounds.minZ + bounds.maxZ) / 2)
    ground.receiveShadow = true
    this.scene.add(ground)

    for (const link of this.region.connections) {
      const from = this.region.nodes.find((node) => node.id === link.from)
      const to = this.region.nodes.find((node) => node.id === link.to)
      if (from && to) this.scene.add(makePath(from, to, link.kind === 'main' ? 5.8 : 3.5))
    }
    for (const node of this.region.nodes) addNodeDressing(this.scene, node)
  }

  private buildPlayer() {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.6, 1.35, 12), new THREE.MeshStandardMaterial({ color: 0xb8c5ba, roughness: 0.62 }))
    body.position.y = 0.88
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd4b59a, roughness: 0.7 }))
    head.position.y = 1.75
    head.castShadow = true
    const facing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 8), new THREE.MeshStandardMaterial({ color: 0x7ea58b, roughness: 0.55 }))
    facing.rotation.x = Math.PI / 2
    facing.position.set(0, 1.05, -0.7)
    this.player.add(body, head, facing)

    const entry = this.region.nodes.find((node) => node.kind === 'entry') ?? this.region.nodes[0]
    this.player.position.set(entry?.x ?? 0, 0, entry?.z ?? 0)
    this.mouseWorld.set(this.player.position.x, 0, this.player.position.z - 4)
    this.scene.add(this.player)
  }

  private resize = () => {
    const rect = this.host.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return
    const key = event.key.toLowerCase()
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.keys.add(key)
      event.preventDefault()
    }
  }

  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase())

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.raycaster.ray.intersectPlane(this.floorPlane, this.mouseWorld)
  }

  private onWheel = (event: WheelEvent) => {
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + Math.sign(event.deltaY) * 2, 23, 43)
    event.preventDefault()
  }

  private animate = (now: number) => {
    if (this.disposed) return
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000))
    this.lastFrame = now
    this.updatePlayer(delta)
    this.updateCamera(delta)
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  private updatePlayer(delta: number) {
    const move = new THREE.Vector3(
      (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0),
      0,
      (this.keys.has('s') ? 1 : 0) - (this.keys.has('w') ? 1 : 0),
    )
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(9.2 * delta)
      this.player.position.add(move)
      this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, this.region.bounds.minX, this.region.bounds.maxX)
      this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, this.region.bounds.minZ, this.region.bounds.maxZ)
    }

    const aim = this.mouseWorld.clone().sub(this.player.position)
    aim.y = 0
    if (aim.lengthSq() > 0.01) this.player.rotation.y = Math.atan2(aim.x, aim.z)
  }

  private updateCamera(delta: number) {
    const offset = new THREE.Vector3(this.cameraDistance * 0.58, this.cameraDistance * 0.74, this.cameraDistance * 0.58)
    const desired = this.player.position.clone().add(offset)
    this.camera.position.lerp(desired, 1 - Math.pow(0.0008, delta))
    this.camera.lookAt(this.player.position.x, 0.8, this.player.position.z)
  }
}

function makePath(from: GeneratedRegionNode, to: GeneratedRegionNode, width: number) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.max(0.1, Math.hypot(dx, dz))
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.08, width),
    new THREE.MeshStandardMaterial({ color: 0x4c4030, roughness: 1 }),
  )
  mesh.position.set((from.x + to.x) / 2, -0.02, (from.z + to.z) / 2)
  mesh.rotation.y = -Math.atan2(dz, dx)
  mesh.receiveShadow = true
  return mesh
}

function addNodeDressing(scene: THREE.Scene, node: GeneratedRegionNode) {
  if (node.kind === 'landmark') {
    const landmark = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.7, 5.8, 8), new THREE.MeshStandardMaterial({ color: 0x6d7067, roughness: 0.94 }))
    landmark.position.set(node.x, 2.8, node.z)
    landmark.castShadow = true
    scene.add(landmark)
    return
  }
  if (node.kind === 'encounter') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 32), new THREE.MeshBasicMaterial({ color: 0x7d3028, side: THREE.DoubleSide, transparent: true, opacity: 0.68 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(node.x, 0.03, node.z)
    scene.add(ring)
    return
  }

  const count = node.kind === 'entry' || node.kind === 'exit' ? 5 : 3
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + node.x * 0.07
    const distance = node.radius * 0.72
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 3.2, 7), new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 1 }))
    trunk.position.set(node.x + Math.cos(angle) * distance, 1.5, node.z + Math.sin(angle) * distance)
    trunk.castShadow = true
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.8, 8), new THREE.MeshStandardMaterial({ color: 0x243c2c, roughness: 1 }))
    crown.position.set(trunk.position.x, 4.2, trunk.position.z)
    crown.castShadow = true
    scene.add(trunk, crown)
  }
}

function biomeColor(biome: string) {
  const value = biome.toLowerCase()
  if (value.includes('swamp') || value.includes('drowned')) return 0x263128
  if (value.includes('coast') || value.includes('ashen')) return 0x37362f
  if (value.includes('verdant')) return 0x263d2b
  return 0x2e342b
}
