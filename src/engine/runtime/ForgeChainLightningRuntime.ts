import * as THREE from 'three'

export type ForgeChainSelectionMode = 'nearest'

export type ForgeChainAbilityConfig = {
  maxJumps?: number
  jumpRadius?: number
  jumpDelay?: number
  damageFalloff?: number
  allowRepeatTargets?: boolean
  selectionMode?: ForgeChainSelectionMode
  boltLifetime?: number
  arcAmplitude?: number
  branchCount?: number
  glowWidth?: number
  lightFlashIntensity?: number
}

export type ForgeChainCandidate<T> = {
  id: string
  value: T
  position: THREE.Vector3
}

export type ForgeChainResolvedTarget<T> = ForgeChainCandidate<T> & {
  index: number
  damageMultiplier: number
}

export type ForgeChainLightningHop = {
  index: number
  from: THREE.Vector3
  to: THREE.Vector3
  delay: number
}

export type ForgeChainLightningVisualOptions = {
  color?: string
  boltLifetime?: number
  arcAmplitude?: number
  branchCount?: number
  glowWidth?: number
  lightFlashIntensity?: number
  seed?: string
}

type LightningPiece = {
  group: THREE.Group
  delay: number
  lifetime: number
  materials: THREE.MeshBasicMaterial[]
  light: THREE.PointLight
  flash: THREE.Mesh
  impacted: boolean
}

export function normalizeChainConfig(config?: ForgeChainAbilityConfig) {
  return {
    maxJumps: THREE.MathUtils.clamp(Math.round(config?.maxJumps ?? 5), 1, 12),
    jumpRadius: THREE.MathUtils.clamp(config?.jumpRadius ?? 5.8, .5, 30),
    jumpDelay: THREE.MathUtils.clamp(config?.jumpDelay ?? .075, .015, .5),
    damageFalloff: THREE.MathUtils.clamp(config?.damageFalloff ?? .86, 0, 1.25),
    allowRepeatTargets: config?.allowRepeatTargets ?? false,
    selectionMode: config?.selectionMode ?? 'nearest' as ForgeChainSelectionMode,
    boltLifetime: THREE.MathUtils.clamp(config?.boltLifetime ?? .155, .05, .6),
    arcAmplitude: THREE.MathUtils.clamp(config?.arcAmplitude ?? .32, 0, 1.4),
    branchCount: THREE.MathUtils.clamp(Math.round(config?.branchCount ?? 2), 0, 5),
    glowWidth: THREE.MathUtils.clamp(config?.glowWidth ?? .075, .01, .25),
    lightFlashIntensity: THREE.MathUtils.clamp(config?.lightFlashIntensity ?? 7.5, 0, 20),
  }
}

export function resolveForgeChainTargets<T>(
  first: ForgeChainCandidate<T>,
  candidates: ForgeChainCandidate<T>[],
  config?: ForgeChainAbilityConfig,
) {
  const resolved = normalizeChainConfig(config)
  const result: ForgeChainResolvedTarget<T>[] = []
  const visited = new Set<string>()
  let current = first

  for (let index = 0; index < resolved.maxJumps && current; index += 1) {
    result.push({
      ...current,
      index,
      damageMultiplier: Math.pow(resolved.damageFalloff, index),
    })
    if (!resolved.allowRepeatTargets) visited.add(current.id)

    const next = candidates
      .filter((candidate) => {
        if (candidate.id === current.id) return false
        if (!resolved.allowRepeatTargets && visited.has(candidate.id)) return false
        return candidate.position.distanceTo(current.position) <= resolved.jumpRadius
      })
      .sort((a, b) => {
        const distance = a.position.distanceTo(current.position) - b.position.distanceTo(current.position)
        if (Math.abs(distance) > 1e-6) return distance
        return a.id.localeCompare(b.id)
      })[0]

    if (!next) break
    current = next
  }

  return result
}

export class ForgeChainLightningEffect {
  private readonly root = new THREE.Group()
  private readonly pieces: LightningPiece[] = []
  private age = 0
  private disposed = false

  constructor(
    scene: THREE.Scene,
    hops: ForgeChainLightningHop[],
    options: ForgeChainLightningVisualOptions = {},
    private readonly onImpact?: (index: number) => void,
  ) {
    const color = new THREE.Color(options.color ?? '#79bfff')
    const config = normalizeChainConfig({
      boltLifetime: options.boltLifetime,
      arcAmplitude: options.arcAmplitude,
      branchCount: options.branchCount,
      glowWidth: options.glowWidth,
      lightFlashIntensity: options.lightFlashIntensity,
    })
    const seed = options.seed ?? 'forge-chain-lightning'

    this.root.name = '__forge_chain_lightning'
    scene.add(this.root)

    for (const hop of hops) {
      const group = new THREE.Group()
      group.visible = false
      this.root.add(group)

      const materials: THREE.MeshBasicMaterial[] = []
      const points = buildLightningPoints(
        hop.from,
        hop.to,
        config.arcAmplitude,
        `${seed}:hop:${hop.index}`,
      )

      addBoltPath(group, points, config.glowWidth, color, .26, materials)
      addBoltPath(group, points, Math.max(.014, config.glowWidth * .42), color.clone().lerp(new THREE.Color('#d7eeff'), .58), .72, materials)
      addBoltPath(group, points, Math.max(.006, config.glowWidth * .16), new THREE.Color('#ffffff'), 1, materials)

      for (let branch = 0; branch < config.branchCount; branch += 1) {
        const branchPoints = buildBranchPoints(
          points,
          config.arcAmplitude,
          `${seed}:hop:${hop.index}:branch:${branch}`,
        )
        addBoltPath(group, branchPoints, Math.max(.005, config.glowWidth * .1), new THREE.Color('#c7e8ff'), .74, materials)
      }

      const flashMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      materials.push(flashMaterial)
      const flash = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), flashMaterial)
      flash.position.copy(hop.to)
      group.add(flash)

      addImpactSparks(
        group,
        hop.to,
        color,
        `${seed}:hop:${hop.index}:sparks`,
        materials,
      )

      const light = new THREE.PointLight(color, config.lightFlashIntensity, 5.5, 2)
      light.position.copy(hop.to)
      group.add(light)

      this.pieces.push({
        group,
        delay: hop.delay,
        lifetime: config.boltLifetime,
        materials,
        light,
        flash,
        impacted: false,
      })
    }
  }

  update(delta: number) {
    if (this.disposed) return false
    this.age += Math.max(0, delta)
    let alive = false

    for (let index = 0; index < this.pieces.length; index += 1) {
      const piece = this.pieces[index]
      const local = this.age - piece.delay
      if (local < 0) {
        alive = true
        continue
      }

      if (!piece.impacted) {
        piece.impacted = true
        piece.group.visible = true
        this.onImpact?.(index)
      }

      if (local >= piece.lifetime) {
        piece.group.visible = false
        continue
      }

      alive = true
      const life = THREE.MathUtils.clamp(local / piece.lifetime, 0, 1)
      const envelope = Math.pow(1 - life, .58)
      const flicker =
        .82 +
        hashUnit(`flicker:${index}:${Math.floor(local * 90)}`) * .18

      for (const material of piece.materials) {
        material.opacity = THREE.MathUtils.clamp(
          envelope * flicker,
          0,
          1,
        )
      }

      piece.light.intensity =
        piece.light.userData.baseIntensity ??
        piece.light.intensity
      if (piece.light.userData.baseIntensity === undefined) {
        piece.light.userData.baseIntensity = piece.light.intensity
      }
      piece.light.intensity =
        Number(piece.light.userData.baseIntensity) *
        Math.pow(1 - life, 1.8)

      const flashScale =
        1 +
        Math.sin(Math.min(1, life * 2.4) * Math.PI) * 1.7
      piece.flash.scale.setScalar(flashScale)
    }

    if (!alive) this.dispose()
    return alive
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    })
  }
}

function buildLightningPoints(
  from: THREE.Vector3,
  to: THREE.Vector3,
  amplitude: number,
  seed: string,
) {
  const distance = Math.max(.001, from.distanceTo(to))
  const count = THREE.MathUtils.clamp(
    Math.round(distance * 2.35),
    9,
    22,
  )
  const direction = to.clone().sub(from).normalize()
  const helper =
    Math.abs(direction.y) < .92
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
  const side = new THREE.Vector3().crossVectors(direction, helper).normalize()
  const up = new THREE.Vector3().crossVectors(side, direction).normalize()
  const points: THREE.Vector3[] = []

  for (let index = 0; index <= count; index += 1) {
    const t = index / count
    const point = from.clone().lerp(to, t)
    if (index > 0 && index < count) {
      const edge = Math.sin(Math.PI * t)
      const scale = amplitude * edge
      const sx = (hashUnit(`${seed}:x:${index}`) * 2 - 1) * scale
      const sy = (hashUnit(`${seed}:y:${index}`) * 2 - 1) * scale
      point.addScaledVector(side, sx)
      point.addScaledVector(up, sy)
    }
    points.push(point)
  }
  return points
}

function buildBranchPoints(
  source: THREE.Vector3[],
  amplitude: number,
  seed: string,
) {
  const startIndex = THREE.MathUtils.clamp(
    2 + Math.floor(hashUnit(`${seed}:start`) * Math.max(1, source.length - 5)),
    1,
    source.length - 2,
  )
  const start = source[startIndex].clone()
  const previous = source[Math.max(0, startIndex - 1)]
  const next = source[Math.min(source.length - 1, startIndex + 1)]
  const tangent = next.clone().sub(previous).normalize()
  const helper =
    Math.abs(tangent.y) < .9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
  const side = new THREE.Vector3().crossVectors(tangent, helper).normalize()
  const up = new THREE.Vector3().crossVectors(side, tangent).normalize()
  const length = .35 + hashUnit(`${seed}:length`) * .7
  const direction = side
    .multiplyScalar(hashUnit(`${seed}:sign`) > .5 ? 1 : -1)
    .addScaledVector(up, (hashUnit(`${seed}:up`) * 2 - 1) * .55)
    .normalize()

  const end = start.clone().addScaledVector(direction, length)
  return buildLightningPoints(
    start,
    end,
    Math.min(.18, amplitude * .55),
    seed,
  )
}

function addBoltPath(
  parent: THREE.Group,
  points: THREE.Vector3[],
  radius: number,
  color: THREE.Color,
  opacity: number,
  materials: THREE.MeshBasicMaterial[],
) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  materials.push(material)

  for (let index = 0; index < points.length - 1; index += 1) {
    const mesh = makeSegment(points[index], points[index + 1], radius, material)
    parent.add(mesh)
  }
}

function addImpactSparks(
  parent: THREE.Group,
  origin: THREE.Vector3,
  color: THREE.Color,
  seed: string,
  materials: THREE.MeshBasicMaterial[],
) {
  const material = new THREE.MeshBasicMaterial({
    color: color.clone().lerp(new THREE.Color('#ffffff'), .5),
    transparent: true,
    opacity: .86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  materials.push(material)

  for (let index = 0; index < 10; index += 1) {
    const theta = hashUnit(`${seed}:theta:${index}`) * Math.PI * 2
    const height = (hashUnit(`${seed}:height:${index}`) * 2 - 1) * .55
    const direction = new THREE.Vector3(
      Math.cos(theta),
      height,
      Math.sin(theta),
    ).normalize()
    const length = .12 + hashUnit(`${seed}:length:${index}`) * .36
    const end = origin.clone().addScaledVector(direction, length)
    parent.add(makeSegment(origin, end, .009, material))
  }
}

function makeSegment(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const delta = to.clone().sub(from)
  const length = Math.max(.001, delta.length())
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * .86, length, 5, 1, true),
    material,
  )
  mesh.position.copy(from).add(to).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  )
  mesh.renderOrder = 24
  return mesh
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}
