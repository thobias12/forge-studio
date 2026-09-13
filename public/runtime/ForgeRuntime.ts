import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type ForgeRuntimeCharacter = {
  root: THREE.Group
  animations: THREE.AnimationClip[]
  mixer?: THREE.AnimationMixer
  play: (name?: string) => THREE.AnimationAction | undefined
  dispose: () => void
}

export type ForgeRuntimeMaterial = THREE.MeshStandardMaterial & {
  userData: { forgeManifest?: unknown }
}

type CharacterManifest = {
  format: 'forge-character-runtime'
  version: number
  name: string
  base: string
  rig?: { mapped?: Record<string, string> }
  attachments?: Array<{
    targetBone: string
    file: string
    transform?: {
      position?: [number, number, number]
      rotation?: [number, number, number]
      scale?: [number, number, number]
    }
  }>
}

type MaterialManifest = {
  format: 'forge-material-runtime'
  version: number
  parameters: {
    repeat?: number
    roughness?: number
    metalness?: number
    normalStrength?: number
  }
  maps?: Record<string, string>
}

export class ForgeRuntime {
  readonly gltf = new GLTFLoader()
  readonly textures = new THREE.TextureLoader()

  async loadModel(url: string) {
    return this.gltf.loadAsync(url)
  }

  async loadTexture(url: string, srgb = true) {
    const texture = await this.textures.loadAsync(url)
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  async loadCharacter(manifestUrl: string): Promise<ForgeRuntimeCharacter> {
    const manifest = await fetchJson<CharacterManifest>(manifestUrl)
    if (manifest.format !== 'forge-character-runtime') throw new Error('Not a Forge character runtime manifest.')

    const baseUrl = resolveRelative(manifestUrl, manifest.base)
    const gltf = await this.gltf.loadAsync(baseUrl)
    const root = gltf.scene
    root.name ||= manifest.name

    for (const attachment of manifest.attachments ?? []) {
      const mappedName = manifest.rig?.mapped?.[attachment.targetBone]
      const target = (mappedName && root.getObjectByName(mappedName)) || root.getObjectByName(attachment.targetBone)
      if (!target) continue

      const part = await this.gltf.loadAsync(resolveRelative(manifestUrl, attachment.file))
      const wrapper = new THREE.Group()
      wrapper.name = `ForgeAttachment_${attachment.targetBone}`
      wrapper.add(part.scene)
      applyTransform(wrapper, attachment.transform)
      target.add(wrapper)
    }

    const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : undefined
    let active: THREE.AnimationAction | undefined
    const play = (name?: string) => {
      if (!mixer || !gltf.animations.length) return undefined
      const clip = name ? THREE.AnimationClip.findByName(gltf.animations, name) : gltf.animations[0]
      if (!clip) return undefined
      active?.fadeOut(0.12)
      active = mixer.clipAction(clip)
      active.reset().fadeIn(0.12).play()
      return active
    }

    return {
      root,
      animations: gltf.animations,
      mixer,
      play,
      dispose: () => {
        mixer?.stopAllAction()
        disposeObject(root)
      },
    }
  }

  async loadMaterial(manifestUrl: string): Promise<ForgeRuntimeMaterial> {
    const manifest = await fetchJson<MaterialManifest>(manifestUrl)
    if (manifest.format !== 'forge-material-runtime') throw new Error('Not a Forge material runtime manifest.')

    const repeat = Math.max(0.01, manifest.parameters.repeat ?? 1)
    const loadMap = async (key: string, srgb = false) => {
      const file = manifest.maps?.[key]
      if (!file) return undefined
      const texture = await this.textures.loadAsync(resolveRelative(manifestUrl, file))
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(repeat, repeat)
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }

    const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
      loadMap('baseColor', true),
      loadMap('normal'),
      loadMap('roughness'),
      loadMap('ao'),
    ])

    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      roughnessMap,
      aoMap,
      roughness: manifest.parameters.roughness ?? 0.75,
      metalness: manifest.parameters.metalness ?? 0,
    }) as ForgeRuntimeMaterial
    const normalStrength = manifest.parameters.normalStrength ?? 1
    material.normalScale.set(normalStrength, normalStrength)
    material.userData.forgeManifest = manifest
    return material
  }
}

function resolveRelative(manifestUrl: string, file: string) {
  return new URL(file, new URL(manifestUrl, window.location.href)).toString()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Forge asset request failed: ${response.status}`)
  return await response.json() as T
}

function applyTransform(group: THREE.Group, transform?: CharacterManifest['attachments'][number]['transform']) {
  if (!transform) return
  if (transform.position) group.position.fromArray(transform.position)
  if (transform.rotation) group.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number])
  if (transform.scale) group.scale.fromArray(transform.scale)
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose?.()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      const record = material as unknown as Record<string, unknown>
      for (const value of Object.values(record)) if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose()
      material.dispose()
    }
  })
}
