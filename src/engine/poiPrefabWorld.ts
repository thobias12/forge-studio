import * as THREE from 'three'
import type {
  GeneratedRegion,
  GeneratedWorldPoi,
  WorldPoiType,
} from './guidedWorld'
import { forgePoiPresentationRotation, forgePoiVisualScale } from './worldScale'
import {
  loadPoiPrefabs,
  type PoiMaterialPreset,
  type PoiPrefab,
  type PoiPrefabCategory,
  type PoiPrefabPart,
} from '../lib/poiPrefab'

export type AuthoredPoiOverride = {
  prefabId?: string
  variantOffset?: number
  scale?: number
  rotation?: number
}

export type AuthoredPoiSettings = {
  enabled: boolean
  overrides: Record<string, AuthoredPoiOverride>
}

export type ResolvedPoiPrefab = {
  prefab: PoiPrefab
  candidates: PoiPrefab[]
  index: number
  override: AuthoredPoiOverride
  worldRotation: number
  worldScale: number
}

export const AUTHORED_POI_SETTINGS_KEY = 'forge-authored-poi-settings-v1'

const DEFAULT_SETTINGS: AuthoredPoiSettings = {
  enabled: false,
  overrides: {},
}

export function loadAuthoredPoiSettings(): AuthoredPoiSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS, overrides: {} }
  const raw = window.localStorage.getItem(AUTHORED_POI_SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS, overrides: {} }
  try {
    const value = JSON.parse(raw) as Partial<AuthoredPoiSettings>
    return {
      enabled: value.enabled === true,
      overrides:
        value.overrides && typeof value.overrides === 'object'
          ? value.overrides
          : {},
    }
  } catch {
    return { ...DEFAULT_SETTINGS, overrides: {} }
  }
}

export function saveAuthoredPoiSettings(settings: AuthoredPoiSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    AUTHORED_POI_SETTINGS_KEY,
    JSON.stringify(settings),
  )
}

export function authoredPoiOverrideKey(
  region: Pick<GeneratedRegion, 'regionId' | 'seed'>,
  poi: Pick<GeneratedWorldPoi, 'id'>,
) {
  return `${region.regionId}:${region.seed}:${poi.id}`
}

export function authoredPoiOverride(
  settings: AuthoredPoiSettings,
  region: Pick<GeneratedRegion, 'regionId' | 'seed'>,
  poi: Pick<GeneratedWorldPoi, 'id'>,
) {
  return settings.overrides[authoredPoiOverrideKey(region, poi)] ?? {}
}

export function withAuthoredPoiOverride(
  settings: AuthoredPoiSettings,
  region: Pick<GeneratedRegion, 'regionId' | 'seed'>,
  poi: Pick<GeneratedWorldPoi, 'id'>,
  patch: Partial<AuthoredPoiOverride>,
): AuthoredPoiSettings {
  const key = authoredPoiOverrideKey(region, poi)
  const current = settings.overrides[key] ?? {}
  const next: AuthoredPoiOverride = {
    ...current,
    ...patch,
  }
  return {
    ...settings,
    overrides: {
      ...settings.overrides,
      [key]: next,
    },
  }
}

export function withoutAuthoredPoiOverride(
  settings: AuthoredPoiSettings,
  region: Pick<GeneratedRegion, 'regionId' | 'seed'>,
  poi: Pick<GeneratedWorldPoi, 'id'>,
): AuthoredPoiSettings {
  const key = authoredPoiOverrideKey(region, poi)
  const overrides = { ...settings.overrides }
  delete overrides[key]
  return { ...settings, overrides }
}

export function prefabCategoryForPoiType(
  type: WorldPoiType,
): PoiPrefabCategory | undefined {
  if (type === 'camp' || type === 'settlement') return 'camp'
  if (type === 'shrine') return 'shrine'
  if (type === 'ruins') return 'ruins'
  if (type === 'watchtower') return 'watchtower'
  if (type === 'graveyard') return 'graveyard'
  if (type === 'beast-den') return 'den'
  return undefined
}

export function compatiblePoiPrefabs(
  prefabs: PoiPrefab[],
  type: WorldPoiType,
) {
  const category = prefabCategoryForPoiType(type)
  if (!category) return []
  return prefabs.filter((prefab) => prefab.category === category)
}

export function resolvePoiPrefab(
  prefabs: PoiPrefab[],
  region: GeneratedRegion,
  poi: GeneratedWorldPoi,
  settings: AuthoredPoiSettings,
): ResolvedPoiPrefab | undefined {
  if (!settings.enabled) return undefined
  const candidates = compatiblePoiPrefabs(prefabs, poi.type)
  if (!candidates.length) return undefined

  const override = authoredPoiOverride(settings, region, poi)
  let index = deterministicVariantIndex(region.seed, poi.id, candidates.length)

  if (override.prefabId) {
    const explicitIndex = candidates.findIndex(
      (candidate) => candidate.id === override.prefabId,
    )
    if (explicitIndex >= 0) index = explicitIndex
  } else if (override.variantOffset) {
    index = positiveModulo(index + override.variantOffset, candidates.length)
  }

  const prefab = candidates[index]
  const accessRotation = poiPrefabAccessRotation(prefab)
  const baseRotation = forgePoiPresentationRotation(region.nodes, poi)
  const worldRotation =
    baseRotation +
    accessRotation +
    THREE.MathUtils.degToRad(override.rotation ?? 0)
  const worldScale =
    forgePoiVisualScale(poi.type) *
    THREE.MathUtils.clamp(override.scale ?? 1, .55, 1.8)

  return {
    prefab,
    candidates,
    index,
    override,
    worldRotation,
    worldScale,
  }
}

export function loadResolvedPoiPrefab(
  region: GeneratedRegion,
  poi: GeneratedWorldPoi,
) {
  const settings = loadAuthoredPoiSettings()
  if (!settings.enabled) return undefined
  return resolvePoiPrefab(loadPoiPrefabs(), region, poi, settings)
}

export function poiPrefabAccessRotation(prefab: PoiPrefab) {
  const entry = prefab.parts.find((part) => part.kind === 'entry')
  if (!entry) return 0
  const [x, , z] = entry.position
  if (Math.hypot(x, z) < .001) return 0
  // World Forge's authored POI frame points local +Z toward the generated
  // approach. Rotate the prefab so the authored Access Marker occupies +Z.
  return -Math.atan2(x, z)
}

export function poiPrefabApproxHeight(prefab: PoiPrefab) {
  let highest = 2
  for (const part of prefab.parts) {
    if (part.kind === 'entry') continue
    const halfHeight = partVisualHeight(part) * .5
    highest = Math.max(
      highest,
      part.position[1] + halfHeight * Math.max(.05, part.scale[1]),
    )
  }
  return highest
}

export function buildPoiPrefabVisual(prefab: PoiPrefab) {
  const group = new THREE.Group()
  group.name = `AuthoredPoiPrefab_${prefab.id}`
  group.userData.forgePoiPrefabId = prefab.id
  group.userData.forgePoiPrefabName = prefab.name
  group.userData.forgePoiPrefabCategory = prefab.category

  for (const part of prefab.parts) {
    if (part.kind === 'entry') continue
    group.add(buildPoiPrefabPartObject(part))
  }

  return group
}

export function buildPoiPrefabPartObject(part: PoiPrefabPart) {
  const root = new THREE.Group()
  root.name = `PoiPart_${part.kind}`
  root.userData.poiPartId = part.id
  root.userData.forgePoiPartKind = part.kind
  root.userData.forgePoiPartSolid = part.solid
  root.position.set(...part.position)
  root.rotation.set(...part.rotation)
  root.scale.set(...part.scale)

  if (part.kind === 'entry') {
    const material = new THREE.MeshBasicMaterial({
      color: 0x75d394,
      transparent: true,
      opacity: .9,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.52, .055, 6, 22),
      material,
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = .055
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(.16, .48, 6),
      material,
    )
    arrow.rotation.x = Math.PI / 2
    arrow.position.set(0, .11, -.7)
    root.add(ring, arrow)
    return root
  }

  if (part.kind === 'torch') {
    const wood = poiPrefabMaterial({
      ...part,
      material: 'wood',
      color: undefined,
    })
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(.055, .075, 1.2, 6),
      wood,
    )
    post.position.y = .6
    post.castShadow = true

    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(.12, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffb25e,
        emissive: 0xff6e28,
        emissiveIntensity: 2,
        roughness: .45,
      }),
    )
    ember.position.y = 1.25
    const glow = new THREE.PointLight(0xff8b3d, 1.45, 7)
    glow.position.y = 1.3
    glow.userData.forgeEnvironmentLightBase = 1.45
    root.add(post, ember, glow)
    return root
  }

  const material = poiPrefabMaterial(part)
  let geometry: THREE.BufferGeometry
  if (part.kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(.5, .54, 1, 8)
  } else if (part.kind === 'rock') {
    geometry = new THREE.DodecahedronGeometry(.5, 0)
  } else if (part.kind === 'tent') {
    geometry = new THREE.ConeGeometry(.58, 1, 4)
    geometry.rotateY(Math.PI / 4)
  } else if (part.kind === 'log') {
    geometry = new THREE.CylinderGeometry(.5, .5, 1, 7)
    geometry.rotateZ(Math.PI / 2)
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1)
  }

  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.poiPartId = part.id
  mesh.userData.forgePoiPartSolid = part.solid
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return root
}

export function poiPrefabMaterial(part: PoiPrefabPart) {
  const preset = poiPrefabMaterialPreset(part.material)
  const color = part.color
    ? new THREE.Color(part.color)
    : new THREE.Color(preset.color)
  return new THREE.MeshStandardMaterial({
    color,
    emissive: preset.emissive,
    emissiveIntensity: preset.emissiveIntensity,
    roughness: preset.roughness,
    metalness: preset.metalness,
  })
}

export function poiPrefabMaterialPreset(material: PoiMaterialPreset) {
  if (material === 'dark-stone') {
    return { color: 0x3f433d, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  if (material === 'wood') {
    return { color: 0x5b412d, emissive: 0x000000, emissiveIntensity: 0, roughness: .96, metalness: 0 }
  }
  if (material === 'cloth') {
    return { color: 0x6a5941, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  if (material === 'earth') {
    return { color: 0x514634, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  if (material === 'bone') {
    return { color: 0xbcb49a, emissive: 0x000000, emissiveIntensity: 0, roughness: .9, metalness: 0 }
  }
  if (material === 'metal') {
    return { color: 0x606966, emissive: 0x000000, emissiveIntensity: 0, roughness: .55, metalness: .55 }
  }
  if (material === 'moss') {
    return { color: 0x415c3d, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
  }
  return { color: 0x686b61, emissive: 0x000000, emissiveIntensity: 0, roughness: 1, metalness: 0 }
}

export function authoredPoiRuntimeObstacleRadius(type: WorldPoiType) {
  if (type === 'ruins') return 3
  if (type === 'camp') return 3.7
  if (type === 'settlement') return 4.5
  if (type === 'watchtower') return 2.2
  return undefined
}

function partVisualHeight(part: PoiPrefabPart) {
  if (part.kind === 'torch') return 1.45
  if (part.kind === 'entry') return .2
  return 1
}

function deterministicVariantIndex(seed: number, id: string, count: number) {
  if (count <= 1) return 0
  return hashString(`${seed}:${id}:poi-prefab`) % count
}

function positiveModulo(value: number, divisor: number) {
  if (divisor <= 0) return 0
  return ((value % divisor) + divisor) % divisor
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
