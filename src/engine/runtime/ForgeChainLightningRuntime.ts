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

export type ForgeChainResolvedTarget<T> =
  ForgeChainCandidate<T> & {
    index: number
    damageMultiplier: number
  }

export type ForgeChainLightningHop = {
  index: number
  from: THREE.Vector3
  to: THREE.Vector3
  delay: number
  travel?: number
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

type BoltPathPool = {
  material: THREE.MeshBasicMaterial
  meshes: THREE.Mesh[]
  radius: number
  points: THREE.Vector3[]
}

type LightningPiece = {
  group: THREE.Group
  impactRoot: THREE.Group
  hop: ForgeChainLightningHop
  delay: number
  travel: number
  lifetime: number
  primaryPaths: BoltPathPool[]
  strandPaths: BoltPathPool[]
  branchPaths: BoltPathPool[]
  boltMaterials: THREE.MeshBasicMaterial[]
  impactMaterials: THREE.MeshBasicMaterial[]
  impactRings: THREE.Mesh[]
  light: THREE.PointLight
  flash: THREE.Mesh
  tip: THREE.Mesh
  tipMaterial: THREE.MeshBasicMaterial
  impacted: boolean
  frame: number
}

const FLICKER_INTERVAL = .024
const MAX_SEGMENTS = 16
const SEGMENT_GEOMETRY = new THREE.CylinderGeometry(
  1,
  .72,
  1,
  4,
  1,
  true,
)
const FLASH_GEOMETRY = new THREE.SphereGeometry(
  .16,
  12,
  9,
)
const TIP_GEOMETRY = new THREE.SphereGeometry(
  .082,
  10,
  8,
)
const RING_GEOMETRY = new THREE.RingGeometry(
  .14,
  .18,
  24,
)
const UNIT_Y = new THREE.Vector3(0, 1, 0)
const TEMP_DELTA = new THREE.Vector3()
const TEMP_PARTIAL = new THREE.Vector3()
const TEMP_HEAD = new THREE.Vector3()

export function normalizeChainConfig(
  config?: ForgeChainAbilityConfig,
) {
  return {
    maxJumps: THREE.MathUtils.clamp(
      Math.round(config?.maxJumps ?? 5),
      1,
      12,
    ),
    jumpRadius: THREE.MathUtils.clamp(
      config?.jumpRadius ?? 5.8,
      .5,
      30,
    ),
    jumpDelay: THREE.MathUtils.clamp(
      config?.jumpDelay ?? .065,
      .015,
      .5,
    ),
    damageFalloff: THREE.MathUtils.clamp(
      config?.damageFalloff ?? .86,
      0,
      1.25,
    ),
    allowRepeatTargets:
      config?.allowRepeatTargets ?? false,
    selectionMode:
      config?.selectionMode ??
      ('nearest' as ForgeChainSelectionMode),
    boltLifetime: THREE.MathUtils.clamp(
      config?.boltLifetime ?? .28,
      .06,
      .7,
    ),
    arcAmplitude: THREE.MathUtils.clamp(
      config?.arcAmplitude ?? .55,
      0,
      1.6,
    ),
    branchCount: THREE.MathUtils.clamp(
      Math.round(config?.branchCount ?? 4),
      0,
      6,
    ),
    glowWidth: THREE.MathUtils.clamp(
      config?.glowWidth ?? .115,
      .01,
      .28,
    ),
    lightFlashIntensity: THREE.MathUtils.clamp(
      config?.lightFlashIntensity ?? 11,
      0,
      24,
    ),
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

  for (
    let index = 0;
    index < resolved.maxJumps && current;
    index += 1
  ) {
    result.push({
      ...current,
      index,
      damageMultiplier:
        Math.pow(resolved.damageFalloff, index),
    })
    if (!resolved.allowRepeatTargets) {
      visited.add(current.id)
    }

    const next = candidates
      .filter((candidate) => {
        if (candidate.id === current.id) return false
        if (
          !resolved.allowRepeatTargets &&
          visited.has(candidate.id)
        ) {
          return false
        }
        return (
          candidate.position.distanceTo(current.position) <=
          resolved.jumpRadius
        )
      })
      .sort((a, b) => {
        const distance =
          a.position.distanceTo(current.position) -
          b.position.distanceTo(current.position)
        if (Math.abs(distance) > 1e-6) {
          return distance
        }
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
  private readonly config:
    ReturnType<typeof normalizeChainConfig>
  private readonly seed: string
  private age = 0
  private disposed = false

  constructor(
    scene: THREE.Scene,
    hops: ForgeChainLightningHop[],
    options: ForgeChainLightningVisualOptions = {},
    private readonly onImpact?: (
      index: number,
    ) => void,
  ) {
    this.color = new THREE.Color(
      options.color ?? '#79bfff',
    )
    this.config = normalizeChainConfig({
      boltLifetime: options.boltLifetime,
      arcAmplitude: options.arcAmplitude,
      branchCount: options.branchCount,
      glowWidth: options.glowWidth,
      lightFlashIntensity:
        options.lightFlashIntensity,
    })
    this.seed =
      options.seed ?? 'forge-chain-lightning'

    this.root.name = '__forge_chain_lightning'
    scene.add(this.root)

    const outerColor = new THREE.Color('#667ee8')
    const innerColor = new THREE.Color('#c5e3ff')
    const coreColor = new THREE.Color('#f4fcff')
    const strandA = new THREE.Color('#bcecff')
    const strandB = new THREE.Color('#b1a0ff')
    const branchColor = new THREE.Color('#9bbcff')

    for (const hop of hops) {
      const group = new THREE.Group()
      group.visible = false
      this.root.add(group)

      const boltRoot = new THREE.Group()
      boltRoot.name = '__forge_chain_bolt'
      group.add(boltRoot)

      const primaryPaths = [
        createBoltPath(
          boltRoot,
          this.config.glowWidth * 2.05,
          outerColor,
          .12,
        ),
        createBoltPath(
          boltRoot,
          this.config.glowWidth * .86,
          this.color,
          .42,
        ),
        createBoltPath(
          boltRoot,
          Math.max(
            .018,
            this.config.glowWidth * .34,
          ),
          innerColor,
          .92,
        ),
        createBoltPath(
          boltRoot,
          Math.max(
            .0075,
            this.config.glowWidth * .12,
          ),
          coreColor,
          1,
        ),
      ]

      const strandPaths = [
        createBoltPath(
          boltRoot,
          Math.max(
            .007,
            this.config.glowWidth * .115,
          ),
          strandA,
          .56,
        ),
        createBoltPath(
          boltRoot,
          Math.max(
            .006,
            this.config.glowWidth * .1,
          ),
          strandB,
          .46,
        ),
      ]

      const branchPaths = Array.from(
        { length: this.config.branchCount },
        () =>
          createBoltPath(
            boltRoot,
            Math.max(
              .006,
              this.config.glowWidth * .085,
            ),
            branchColor,
            .54,
          ),
      )

      const tipMaterial = new THREE.MeshBasicMaterial({
        color: coreColor,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      tipMaterial.userData.baseOpacity = 1
      const tip = new THREE.Mesh(
        TIP_GEOMETRY,
        tipMaterial,
      )
      tip.visible = false
      tip.renderOrder = 26
      group.add(tip)

      const impactRoot = new THREE.Group()
      impactRoot.name = '__forge_chain_impact'
      impactRoot.visible = false
      group.add(impactRoot)

      const impactMaterials:
        THREE.MeshBasicMaterial[] = []
      const flashMaterial =
        new THREE.MeshBasicMaterial({
          color: coreColor,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      flashMaterial.userData.baseOpacity = 1
      impactMaterials.push(flashMaterial)

      const flash = new THREE.Mesh(
        FLASH_GEOMETRY,
        flashMaterial,
      )
      flash.position.copy(hop.to)
      flash.renderOrder = 25
      impactRoot.add(flash)

      addImpactSparks(
        impactRoot,
        hop.to,
        this.color,
        `${this.seed}:hop:${hop.index}:sparks`,
        impactMaterials,
      )
      const impactRings = addImpactRings(
        impactRoot,
        hop.to,
        this.color,
        impactMaterials,
      )

      const light = new THREE.PointLight(
        new THREE.Color('#a5baff'),
        0,
        7.5,
        2,
      )
      light.position.copy(hop.from)
      light.userData.baseIntensity =
        this.config.lightFlashIntensity
      group.add(light)

      const boltMaterials = [
        ...primaryPaths,
        ...strandPaths,
        ...branchPaths,
      ].map((path) => path.material)

      this.pieces.push({
        group,
        impactRoot,
        hop,
        delay: hop.delay,
        travel: THREE.MathUtils.clamp(
          hop.travel ?? .085,
          .035,
          .18,
        ),
        lifetime: this.config.boltLifetime,
        primaryPaths,
        strandPaths,
        branchPaths,
        boltMaterials,
        impactMaterials,
        impactRings,
        light,
        flash,
        tip,
        tipMaterial,
        impacted: false,
        frame: -1,
      })
    }
  }

  update(delta: number) {
    if (this.disposed) return false
    this.age += Math.max(0, delta)
    let alive = false

    for (
      let index = 0;
      index < this.pieces.length;
      index += 1
    ) {
      const piece = this.pieces[index]
      const local = this.age - piece.delay
      if (local < 0) {
        alive = true
        continue
      }

      piece.group.visible = true
      const travelProgress =
        THREE.MathUtils.clamp(
          local / piece.travel,
          0,
          1,
        )
      const frame = Math.floor(
        local / FLICKER_INTERVAL,
      )
      if (frame !== piece.frame) {
        this.reshapeBolt(
          piece,
          index,
          frame,
        )
      }

      for (const path of [
        ...piece.primaryPaths,
        ...piece.strandPaths,
        ...piece.branchPaths,
      ]) {
        updateBoltPathProgress(
          path,
          travelProgress,
        )
      }

      const headPath =
        piece.primaryPaths[2] ??
        piece.primaryPaths[0]
      pointAlongPath(
        headPath.points,
        travelProgress,
        TEMP_HEAD,
      )

      const travelFlicker =
        .8 +
        hashUnit(
          `${this.seed}:hop:${index}:travel:${frame}`,
        ) *
          .2
      piece.tip.visible = travelProgress < 1
      piece.tip.position.copy(TEMP_HEAD)
      piece.tip.scale.setScalar(
        .7 +
          Math.sin(
            Math.min(1, travelProgress * 1.4) *
              Math.PI,
          ) *
            .65,
      )
      piece.tipMaterial.opacity =
        travelProgress < 1
          ? .82 + travelFlicker * .18
          : 0
      piece.light.position.copy(TEMP_HEAD)

      if (!piece.impacted && travelProgress >= 1) {
        piece.impacted = true
        piece.tip.visible = false
        piece.impactRoot.visible = true
        this.onImpact?.(index)
      }

      const flicker =
        .72 +
        hashUnit(
          `${this.seed}:hop:${index}:flicker:${frame}`,
        ) *
          .28

      if (!piece.impacted) {
        alive = true
        for (const material of piece.boltMaterials) {
          material.opacity =
            THREE.MathUtils.clamp(
              flicker *
                Number(
                  material.userData.baseOpacity ??
                    1,
                ),
              0,
              1,
            )
        }
        piece.light.intensity =
          this.config.lightFlashIntensity *
          (.24 + travelFlicker * .2)
        continue
      }

      const sinceImpact = local - piece.travel
      if (sinceImpact >= piece.lifetime) {
        piece.group.visible = false
        continue
      }

      alive = true
      const life = THREE.MathUtils.clamp(
        sinceImpact / piece.lifetime,
        0,
        1,
      )
      const boltEnvelope =
        Math.pow(1 - life, .5)

      for (const material of piece.boltMaterials) {
        material.opacity =
          THREE.MathUtils.clamp(
            boltEnvelope *
              flicker *
              Number(
                material.userData.baseOpacity ??
                  1,
              ),
            0,
            1,
          )
      }

      const impactLife =
        THREE.MathUtils.clamp(
          sinceImpact / .16,
          0,
          1,
        )
      const impactEnvelope =
        Math.pow(1 - impactLife, 1.55)
      for (
        const material of piece.impactMaterials
      ) {
        material.opacity =
          THREE.MathUtils.clamp(
            impactEnvelope *
              Number(
                material.userData.baseOpacity ??
                  .9,
              ),
            0,
            1,
          )
      }

      const impactLight =
        this.config.lightFlashIntensity *
        Math.pow(1 - impactLife, 2.05)
      piece.light.position.copy(piece.hop.to)
      piece.light.intensity = Math.max(
        impactLight,
        this.config.lightFlashIntensity *
          .14 *
          boltEnvelope,
      )

      const flashScale =
        .9 +
        Math.sin(
          Math.min(
            1,
            impactLife * 1.65,
          ) * Math.PI,
        ) *
          2.2
      piece.flash.scale.setScalar(
        flashScale,
      )

      const ringScale =
        .72 + impactLife * 2.7
      for (const ring of piece.impactRings) {
        ring.scale.setScalar(ringScale)
      }
    }

    if (!alive) this.dispose()
    return alive
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    disposeMaterials(this.root)
  }

  private reshapeBolt(
    piece: LightningPiece,
    hopIndex: number,
    frame: number,
  ) {
    piece.frame = frame

    const distance =
      piece.hop.from.distanceTo(piece.hop.to)
    const lift = THREE.MathUtils.clamp(
      .2 + distance * .05,
      .24,
      .72,
    )

    const mainPoints =
      buildLightningPoints(
        piece.hop.from,
        piece.hop.to,
        this.config.arcAmplitude,
        `${this.seed}:hop:${hopIndex}:frame:${frame}:main`,
        lift,
      )

    for (
      const path of piece.primaryPaths
    ) {
      setBoltPathPoints(
        path,
        mainPoints,
      )
    }

    for (
      let strand = 0;
      strand < piece.strandPaths.length;
      strand += 1
    ) {
      const points =
        buildLightningPoints(
          piece.hop.from,
          piece.hop.to,
          this.config.arcAmplitude *
            (.72 + strand * .1),
          `${this.seed}:hop:${hopIndex}:frame:${frame}:strand:${strand}`,
          lift *
            (.78 + strand * .08),
        )
      setBoltPathPoints(
        piece.strandPaths[strand],
        points,
      )
    }

    for (
      let branch = 0;
      branch < piece.branchPaths.length;
      branch += 1
    ) {
      const branchPoints =
        buildBranchPoints(
          mainPoints,
          this.config.arcAmplitude,
          `${this.seed}:hop:${hopIndex}:frame:${frame}:branch:${branch}`,
        )
      setBoltPathPoints(
        piece.branchPaths[branch],
        branchPoints,
      )
    }
  }
}

function createBoltPath(
}

function createBoltPath(
  parent: THREE.Group,
  radius: number,
  color: THREE.Color,
  opacity: number,
): BoltPathPool {
  const material =
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  material.userData.baseOpacity = opacity

  const meshes = Array.from(
    { length: MAX_SEGMENTS },
    () => {
      const mesh = new THREE.Mesh(
        SEGMENT_GEOMETRY,
        material,
      )
      mesh.visible = false
      mesh.renderOrder = 24
      parent.add(mesh)
      return mesh
    },
  )

  return {
    material,
    meshes,
    radius,
    points: [],
  }
}

function setBoltPathPoints(
  path: BoltPathPool,
  points: THREE.Vector3[],
) {
  path.points = points
}

function updateBoltPathProgress(
  path: BoltPathPool,
  progress: number,
) {
  const points = path.points
  const segmentCount = Math.min(
    path.meshes.length,
    Math.max(0, points.length - 1),
  )
  const position =
    THREE.MathUtils.clamp(progress, 0, 1) *
    segmentCount
  const fullSegments = Math.floor(position)
  const partial = position - fullSegments

  for (
    let index = 0;
    index < path.meshes.length;
    index += 1
  ) {
    const mesh = path.meshes[index]
    if (index < fullSegments) {
      mesh.visible = true
      updateSegmentTransform(
        mesh,
        points[index],
        points[index + 1],
        path.radius,
      )
      continue
    }

    if (
      index === fullSegments &&
      partial > .001 &&
      index < segmentCount
    ) {
      mesh.visible = true
      TEMP_PARTIAL
        .copy(points[index])
        .lerp(points[index + 1], partial)
      updateSegmentTransform(
        mesh,
        points[index],
        TEMP_PARTIAL,
        path.radius,
      )
      continue
    }

    mesh.visible = false
  }
}

function pointAlongPath(
  points: THREE.Vector3[],
  progress: number,
  target: THREE.Vector3,
) {
  if (!points.length) return target.set(0, 0, 0)
  if (points.length === 1) return target.copy(points[0])
  const at =
    THREE.MathUtils.clamp(progress, 0, 1) *
    (points.length - 1)
  const index = Math.min(
    points.length - 2,
    Math.floor(at),
  )
  return target
    .copy(points[index])
    .lerp(points[index + 1], at - index)
}

function buildLightningPoints(
  from: THREE.Vector3,
  to: THREE.Vector3,
  amplitude: number,
  seed: string,
  verticalLift = 0,
) {
  const distance =
    Math.max(.001, from.distanceTo(to))
  const count = THREE.MathUtils.clamp(
    Math.round(distance * 1.6),
    8,
    MAX_SEGMENTS,
  )
  const direction = to
    .clone()
    .sub(from)
    .normalize()
  const helper =
    Math.abs(direction.y) < .92
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
  const side = new THREE.Vector3()
    .crossVectors(direction, helper)
    .normalize()
  const planeUp =
    new THREE.Vector3()
      .crossVectors(side, direction)
      .normalize()
  const points: THREE.Vector3[] = []

  for (
    let index = 0;
    index <= count;
    index += 1
  ) {
    const t = index / count
    const point =
      from.clone().lerp(to, t)
    if (
      index > 0 &&
      index < count
    ) {
      const edge =
        Math.sin(Math.PI * t)
      const kick =
        hashUnit(`${seed}:kick-strength:${index}`) > .72
          ? 1.38
          : 1
      const scale =
        amplitude * edge * kick
      const alternating =
        index % 2 === 0 ? 1 : -1
      const sideOffset =
        (
          hashUnit(
            `${seed}:side:${index}`,
          ) *
            2 -
          1
        ) *
          scale +
        alternating *
          scale *
          (
            .28 +
            hashUnit(
              `${seed}:kink:${index}`,
            ) *
              .24
          )
      const planeOffset =
        (
          hashUnit(
            `${seed}:plane:${index}`,
          ) *
            2 -
          1
        ) *
        scale *
        .78

      point.addScaledVector(
        side,
        sideOffset,
      )
      point.addScaledVector(
        planeUp,
        planeOffset,
      )
      point.y +=
        verticalLift * edge
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
  const startIndex =
    THREE.MathUtils.clamp(
      1 +
        Math.floor(
          hashUnit(
            `${seed}:start`,
          ) *
            Math.max(
              1,
              source.length - 3,
            ),
        ),
      1,
      source.length - 2,
    )
  const start =
    source[startIndex].clone()
  const previous =
    source[
      Math.max(
        0,
        startIndex - 1,
      )
    ]
  const next =
    source[
      Math.min(
        source.length - 1,
        startIndex + 1,
      )
    ]
  const tangent =
    next
      .clone()
      .sub(previous)
      .normalize()
  const helper =
    Math.abs(tangent.y) < .9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
  const side =
    new THREE.Vector3()
      .crossVectors(
        tangent,
        helper,
      )
      .normalize()
  const up =
    new THREE.Vector3()
      .crossVectors(
        side,
        tangent,
      )
      .normalize()
  const length =
    .42 +
    hashUnit(
      `${seed}:length`,
    ) *
      1.05
  const direction =
    side
      .multiplyScalar(
        hashUnit(
          `${seed}:sign`,
        ) > .5
          ? 1
          : -1,
      )
      .addScaledVector(
        up,
        (
          hashUnit(
            `${seed}:up`,
          ) *
            2 -
          1
        ) *
          .72,
      )
      .normalize()

  const end =
    start
      .clone()
      .addScaledVector(
        direction,
        length,
      )
  return buildLightningPoints(
    start,
    end,
    Math.min(
      .24,
      amplitude * .58,
    ),
    seed,
    .07,
  )
}

function addImpactSparks(

function addImpactSparks(
  parent: THREE.Group,
  origin: THREE.Vector3,
  color: THREE.Color,
  seed: string,
  materials: THREE.MeshBasicMaterial[],
) {
  const material =
    new THREE.MeshBasicMaterial({
      color: color
        .clone()
        .lerp(
          new THREE.Color('#ffffff'),
          .58,
        ),
      transparent: true,
      opacity: .9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  material.userData.baseOpacity = .9
  materials.push(material)

  for (
    let index = 0;
    index < 18;
    index += 1
  ) {
    const theta =
      hashUnit(
        `${seed}:theta:${index}`,
      ) *
      Math.PI *
      2
    const height =
      (
        hashUnit(
          `${seed}:height:${index}`,
        ) *
          2 -
        1
      ) *
      .64
    const direction =
      new THREE.Vector3(
        Math.cos(theta),
        height,
        Math.sin(theta),
      ).normalize()
    const length =
      .2 +
      hashUnit(
        `${seed}:length:${index}`,
      ) *
        .58
    const end =
      origin
        .clone()
        .addScaledVector(
          direction,
          length,
        )
    const mesh =
      new THREE.Mesh(
        SEGMENT_GEOMETRY,
        material,
      )
    mesh.renderOrder = 24
    updateSegmentTransform(
      mesh,
      origin,
      end,
      .009,
    )
    parent.add(mesh)
  }
}

function addImpactRings(
  parent: THREE.Group,
  origin: THREE.Vector3,
  color: THREE.Color,
  materials: THREE.MeshBasicMaterial[],
) {
  const material =
    new THREE.MeshBasicMaterial({
      color: color
        .clone()
        .lerp(
          new THREE.Color('#ffffff'),
          .48,
        ),
      transparent: true,
      opacity: .62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  material.userData.baseOpacity = .62
  materials.push(material)

  const rings: THREE.Mesh[] = []
  for (
    let axis = 0;
    axis < 2;
    axis += 1
  ) {
    const ring = new THREE.Mesh(
      RING_GEOMETRY,
      material,
    )
    ring.position.copy(origin)
    ring.renderOrder = 25
    if (axis === 0) {
      ring.rotation.x = Math.PI / 2
    } else {
      ring.rotation.y = Math.PI / 2
    }
    parent.add(ring)
    rings.push(ring)
  }
  return rings
}

function updateSegmentTransform(

function updateSegmentTransform(
  mesh: THREE.Mesh,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
) {
  TEMP_DELTA.subVectors(to, from)
  const length =
    Math.max(.001, TEMP_DELTA.length())
  mesh.position
    .copy(from)
    .add(to)
    .multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(
    UNIT_Y,
    TEMP_DELTA.multiplyScalar(
      1 / length,
    ),
  )
  mesh.scale.set(
    radius,
    length,
    radius,
  )
}

function disposeMaterials(
  root: THREE.Object3D,
) {
  const materials =
    new Set<THREE.Material>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const list =
      Array.isArray(object.material)
        ? object.material
        : [object.material]
    list.forEach((material) => {
      materials.add(material)
    })
  })
  materials.forEach((material) =>
    material.dispose(),
  )
}

function hashUnit(value: string) {
  let hash = 2166136261
  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(
      hash,
      16777619,
    )
  }
  return (
    (hash >>> 0) /
    4294967295
  )
}
