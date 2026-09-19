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
  boltRoot: THREE.Group
  impactRoot: THREE.Group
  hop: ForgeChainLightningHop
  delay: number
  lifetime: number
  boltMaterials: THREE.MeshBasicMaterial[]
  impactMaterials: THREE.MeshBasicMaterial[]
  light: THREE.PointLight
  flash: THREE.Mesh
  impacted: boolean
  frame: number
}

const FLICKER_INTERVAL = .028

export function normalizeChainConfig(config?: ForgeChainAbilityConfig) {
  return {
    maxJumps: THREE.MathUtils.clamp(Math.round(config?.maxJumps ?? 5), 1, 12),
    jumpRadius: THREE.MathUtils.clamp(config?.jumpRadius ?? 5.8, .5, 30),
    jumpDelay: THREE.MathUtils.clamp(config?.jumpDelay ?? .065, .015, .5),
    damageFalloff: THREE.MathUtils.clamp(config?.damageFalloff ?? .86, 0, 1.25),
    allowRepeatTargets: config?.allowRepeatTargets ?? false,
    selectionMode: config?.selectionMode ?? 'nearest' as ForgeChainSelectionMode,
    boltLifetime: THREE.MathUtils.clamp(config?.boltLifetime ?? .22, .06, .7),
    arcAmplitude: THREE.MathUtils.clamp(config?.arcAmplitude ?? .42, 0, 1.6),
    branchCount: THREE.MathUtils.clamp(Math.round(config?.branchCount ?? 3), 0, 6),
    glowWidth: THREE.MathUtils.clamp(config?.glowWidth ?? .085, .01, .28),
    lightFlashIntensity: THREE.MathUtils.clamp(config?.lightFlashIntensity ?? 8.5, 0, 24),
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
        const distance =
          a.position.distanceTo(current.position) -
          b.position.distanceTo(current.position)
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
  private readonly color: THREE.Color
  private readonly config: ReturnType<typeof normalizeChainConfig>
  private readonly seed: string
  private age = 0
  private disposed = false

  constructor(
    scene: THREE.Scene,
    hops: ForgeChainLightningHop[],
    options: ForgeChainLightningVisualOptions = {},
    private readonly onImpact?: (index: number) => void,
  ) {
    this.color = new THREE.Color(options.color ?? '#79bfff')
    this.config = normalizeChainConfig({
      boltLifetime: options.boltLifetime,
      arcAmplitude: options.arcAmplitude,
      branchCount: options.branchCount,
      glowWidth: options.glowWidth,
      lightFlashIntensity: options.lightFlashIntensity,
    })
    this.seed = options.seed ?? 'forge-chain-lightning'

    this.root.name = '__forge_chain_lightning'
    scene.add(this.root)

    for (const hop of hops) {
      const group = new THREE.Group()
      group.visible = false
      this.root.add(group)

      const boltRoot = new THREE.Group()
      boltRoot.name = '__forge_chain_bolt'
      group.add(boltRoot)

      const impactRoot = new THREE.Group()
      impactRoot.name = '__forge_chain_impact'
      group.add(impactRoot)

      const impactMaterials: THREE.MeshBasicMaterial[] = []
      const flashMaterial = new THREE.MeshBasicMaterial({
        color: this.color.clone().lerp(new THREE.Color('#ffffff'), .72),
        transparent: true,
        opacity: .88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      impactMaterials.push(flashMaterial)
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(.105, 10, 8),
        flashMaterial,
      )
      flash.position.copy(hop.to)
      impactRoot.add(flash)

      addImpactSparks(
        impactRoot,
        hop.to,
        this.color,
        `${this.seed}:hop:${hop.index}:sparks`,
        impactMaterials,
      )
      addImpactRings(
        impactRoot,
        hop.to,
        this.color,
        impactMaterials,
      )

      const light = new THREE.PointLight(
        this.color.clone().lerp(new THREE.Color('#ffffff'), .28),
        this.config.lightFlashIntensity,
        5.8,
        2,
      )
      light.position.copy(hop.to)
      light.userData.baseIntensity = this.config.lightFlashIntensity
      impactRoot.add(light)

      this.pieces.push({
        group,
        boltRoot,
        impactRoot,
        hop,
        delay: hop.delay,
        lifetime: this.config.boltLifetime,
        boltMaterials: [],
        impactMaterials,
        light,
        flash,
        impacted: false,
        frame: -1,
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
        this.rebuildBolt(piece, index, 0)
        this.onImpact?.(index)
      }

      if (local >= piece.lifetime) {
        piece.group.visible = false
        continue
      }

      alive = true
      const frame = Math.floor(local / FLICKER_INTERVAL)
      if (frame !== piece.frame) {
        this.rebuildBolt(piece, index, frame)
      }

      const life = THREE.MathUtils.clamp(local / piece.lifetime, 0, 1)
      const flicker =
        .76 +
        hashUnit(`${this.seed}:hop:${index}:flicker:${frame}`) * .24
      const boltEnvelope = Math.pow(1 - life, .42)

      for (const material of piece.boltMaterials) {
        material.opacity = THREE.MathUtils.clamp(
          boltEnvelope * flicker * Number(material.userData.baseOpacity ?? 1),
          0,
          1,
        )
      }

      const impactLife = THREE.MathUtils.clamp(local / .115, 0, 1)
      const impactEnvelope = Math.pow(1 - impactLife, 1.7)
      for (const material of piece.impactMaterials) {
        material.opacity = THREE.MathUtils.clamp(
          impactEnvelope * Number(material.userData.baseOpacity ?? .9),
          0,
          1,
        )
      }

      piece.light.intensity =
        Number(piece.light.userData.baseIntensity ?? 0) *
        Math.pow(1 - impactLife, 2.2)

      const flashScale =
        .85 +
        Math.sin(Math.min(1, impactLife * 1.8) * Math.PI) * 1.35
      piece.flash.scale.setScalar(flashScale)
    }

    if (!alive) this.dispose()
    return alive
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    disposeObjectTree(this.root)
  }

  private rebuildBolt(
    piece: LightningPiece,
    hopIndex: number,
    frame: number,
  ) {
    piece.frame = frame
    disposeObjectTree(piece.boltRoot, false)
    piece.boltRoot.clear()
    piece.boltMaterials = []

    const distance = piece.hop.from.distanceTo(piece.hop.to)
    const lift = THREE.MathUtils.clamp(
      .14 + distance * .035,
      .18,
      .52,
    )

    const mainPoints = buildLightningPoints(
      piece.hop.from,
      piece.hop.to,
      this.config.arcAmplitude,
      `${this.seed}:hop:${hopIndex}:frame:${frame}:main`,
      lift,
    )

    addBoltPath(
      piece.boltRoot,
      mainPoints,
      this.config.glowWidth * 1.35,
      this.color,
      .18,
      piece.boltMaterials,
    )
    addBoltPath(
      piece.boltRoot,
      mainPoints,
      Math.max(.014, this.config.glowWidth * .46),
      this.color.clone().lerp(new THREE.Color('#c7e8ff'), .58),
      .72,
      piece.boltMaterials,
    )
    addBoltPath(
      piece.boltRoot,
      mainPoints,
      Math.max(.0055, this.config.glowWidth * .14),
      new THREE.Color('#ffffff'),
      1,
      piece.boltMaterials,
    )

    // Two independent secondary strands make the effect read as electrical
    // discharge instead of one smooth magical tether.
    for (let strand = 0; strand < 2; strand += 1) {
      const points = buildLightningPoints(
        piece.hop.from,
        piece.hop.to,
        this.config.arcAmplitude * (.62 + strand * .08),
        `${this.seed}:hop:${hopIndex}:frame:${frame}:strand:${strand}`,
        lift * (.72 + strand * .08),
      )
      addBoltPath(
        piece.boltRoot,
        points,
        Math.max(.0045, this.config.glowWidth * .095),
        strand === 0
          ? new THREE.Color('#d9f2ff')
          : this.color.clone().lerp(new THREE.Color('#ffffff'), .62),
        strand === 0 ? .68 : .52,
        piece.boltMaterials,
      )
    }

    for (
      let branch = 0;
      branch < this.config.branchCount;
      branch += 1
    ) {
      const branchPoints = buildBranchPoints(
        mainPoints,
        this.config.arcAmplitude,
        `${this.seed}:hop:${hopIndex}:frame:${frame}:branch:${branch}`,
      )
      addBoltPath(
        piece.boltRoot,
        branchPoints,
        Math.max(.004, this.config.glowWidth * .08),
        new THREE.Color('#c7e8ff'),
        .62,
        piece.boltMaterials,
      )
    }
  }
}

function buildLightningPoints(
  from: THREE.Vector3,
  to: THREE.Vector3,
  amplitude: number,
  seed: string,
  verticalLift = 0,
) {
  const distance = Math.max(.001, from.distanceTo(to))
  const count = THREE.MathUtils.clamp(
    Math.round(distance * 1.45),
    7,
    15,
  )
  const direction = to.clone().sub(from).normalize()
  const helper =
    Math.abs(direction.y) < .92
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
  const side = new THREE.Vector3()
    .crossVectors(direction, helper)
    .normalize()
  const planeUp = new THREE.Vector3()
    .crossVectors(side, direction)
    .normalize()
  const worldUp = new THREE.Vector3(0, 1, 0)
  const points: THREE.Vector3[] = []

  for (let index = 0; index <= count; index += 1) {
    const t = index / count
    const point = from.clone().lerp(to, t)
    if (index > 0 && index < count) {
      const edge = Math.sin(Math.PI * t)
      const scale = amplitude * edge
      const sideOffset =
        (hashUnit(`${seed}:side:${index}`) * 2 - 1) *
        scale
      const planeOffset =
        (hashUnit(`${seed}:plane:${index}`) * 2 - 1) *
        scale *
        .68

      point.addScaledVector(side, sideOffset)
      point.addScaledVector(planeUp, planeOffset)
      point.addScaledVector(worldUp, verticalLift * edge)

      // Alternating kink makes consecutive segments change direction sharply
      // instead of approximating one smooth curve.
      point.addScaledVector(
        side,
        (index % 2 === 0 ? 1 : -1) *
          scale *
          (.16 + hashUnit(`${seed}:kink:${index}`) * .18),
      )
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
    1 +
      Math.floor(
        hashUnit(`${seed}:start`) *
          Math.max(1, source.length - 3),
      ),
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
  const side = new THREE.Vector3()
    .crossVectors(tangent, helper)
    .normalize()
  const up = new THREE.Vector3()
    .crossVectors(side, tangent)
    .normalize()
  const length =
    .28 +
    hashUnit(`${seed}:length`) * .72
  const direction = side
    .multiplyScalar(
      hashUnit(`${seed}:sign`) > .5 ? 1 : -1,
    )
    .addScaledVector(
      up,
      (hashUnit(`${seed}:up`) * 2 - 1) * .58,
    )
    .normalize()

  const end = start.clone().addScaledVector(direction, length)
  return buildLightningPoints(
    start,
    end,
    Math.min(.16, amplitude * .48),
    seed,
    .04,
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
  material.userData.baseOpacity = opacity
  materials.push(material)

  for (let index = 0; index < points.length - 1; index += 1) {
    parent.add(
      makeSegment(
        points[index],
        points[index + 1],
        radius,
        material,
      ),
    )
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
    color: color.clone().lerp(new THREE.Color('#ffffff'), .48),
    transparent: true,
    opacity: .82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  material.userData.baseOpacity = .82
  materials.push(material)

  for (let index = 0; index < 14; index += 1) {
    const theta =
      hashUnit(`${seed}:theta:${index}`) *
      Math.PI *
      2
    const height =
      (hashUnit(`${seed}:height:${index}`) * 2 - 1) *
      .64
    const direction = new THREE.Vector3(
      Math.cos(theta),
      height,
      Math.sin(theta),
    ).normalize()
    const length =
      .14 +
      hashUnit(`${seed}:length:${index}`) * .42
    const end = origin
      .clone()
      .addScaledVector(direction, length)
    parent.add(makeSegment(origin, end, .007, material))
  }
}

function addImpactRings(
  parent: THREE.Group,
  origin: THREE.Vector3,
  color: THREE.Color,
  materials: THREE.MeshBasicMaterial[],
) {
  const material = new THREE.MeshBasicMaterial({
    color: color.clone().lerp(new THREE.Color('#ffffff'), .35),
    transparent: true,
    opacity: .5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  material.userData.baseOpacity = .5
  materials.push(material)

  for (let axis = 0; axis < 2; axis += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.11, .135, 20),
      material,
    )
    ring.position.copy(origin)
    if (axis === 0) ring.rotation.x = Math.PI / 2
    else ring.rotation.y = Math.PI / 2
    parent.add(ring)
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
    new THREE.CylinderGeometry(
      radius,
      radius * .72,
      length,
      4,
      1,
      true,
    ),
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

function disposeObjectTree(
  root: THREE.Object3D,
  disposeMaterials = true,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    if (!disposeMaterials) return
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}
