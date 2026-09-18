import type { ForgeRegionDefinition } from './forgeProject'

export type GeneratedRegionNodeKind = 'entry' | 'route' | 'exit' | 'branch' | 'landmark' | 'encounter'
export type WorldPoiType = 'ruins' | 'camp' | 'shrine' | 'standing-stones' | 'beast-den' | 'graveyard' | 'watchtower' | 'settlement' | 'dungeon'
export type WorldDressingType = 'tree' | 'dead-tree' | 'rock' | 'fern' | 'fallen-log' | 'stump' | 'grass' | 'shrub' | 'reeds' | 'bank-patch' | 'leaf-patch' | 'flower-patch' | 'mud-patch' | 'corrupt-scar' | 'rock-outcrop' | 'hedge' | 'root-cluster'
export type WorldMicroBiomeType = 'forest-floor' | 'moss' | 'meadow' | 'scrub' | 'rocky'
export type WorldMood = 'normal' | 'dark' | 'deadwood' | 'bleak'

const WORLD_SPATIAL_SCALE = 1.45
const WORLD_CLEARING_SCALE = 1.24
const WORLD_TREE_SCALE = 1.3
const WORLD_DRESSING_DENSITY_SCALE = 1.28
const WORLD_CLUSTER_RADIUS_SCALE = 1.18

export type GeneratedMicroBiome = {
  id: string
  type: WorldMicroBiomeType
  x: number
  z: number
  radius: number
  strength: number
}

export type GeneratedRegionNode = {
  id: string
  kind: GeneratedRegionNodeKind
  x: number
  z: number
  radius: number
  label: string
  parentId?: string
  poiType?: WorldPoiType
  contentType?: 'dungeon'
  contentRef?: string
}

export type GeneratedRegionConnection = {
  id: string
  from: string
  to: string
  kind: 'main' | 'branch'
}

export type GeneratedWorldPoint = { x: number; z: number }

export type GeneratedWorldPath = {
  id: string
  kind: 'main' | 'branch'
  fromNodeId: string
  toNodeId: string
  width: number
  points: GeneratedWorldPoint[]
  widths: number[]
}

export type GeneratedWorldCrossing = {
  id: string
  kind: 'bridge' | 'ford'
  x: number
  z: number
  rotation: number
  width: number
  pathId: string
}

export type GeneratedWorldPoi = {
  id: string
  type: WorldPoiType
  label: string
  x: number
  z: number
  radius: number
  rotation: number
  nodeId: string
  contentRef?: string
}

export type GeneratedWorldDressing = {
  id: string
  type: WorldDressingType
  x: number
  y: number
  z: number
  scale: number
  rotation: number
  variant: number
}

export type GeneratedWorldTerrain = {
  resolution: number
  width: number
  depth: number
  heights: number[]
  waterLevel: number
  stream: GeneratedWorldPoint[]
  streamWidths: number[]
  streamHeights: number[]
  microBiomes: GeneratedMicroBiome[]
  clearings: Array<{ x: number; z: number; radius: number }>
}

type TerrainFoundation = {
  resolution: number
  width: number
  depth: number
  heights: number[]
}

type FrozenHydrology = {
  points: GeneratedWorldPoint[]
  widths: number[]
  heights: number[]
}

export type RiverOccupancyMask = {
  points: GeneratedWorldPoint[]
  widths: number[]
  bankPadding: number
}

export type WorldGenerationLayerSeeds = {
  terrain: number
  routes: number
  pois: number
  dressing: number
}

export type GeneratedRegion = {
  format: 'forge-generated-region'
  version: 5
  seed: number
  masterSeed: number
  layerSeeds: WorldGenerationLayerSeeds
  generationVersion: number
  regionId: string
  regionName: string
  biome: string
  mood: WorldMood
  nodes: GeneratedRegionNode[]
  connections: GeneratedRegionConnection[]
  paths: GeneratedWorldPath[]
  crossings: GeneratedWorldCrossing[]
  pois: GeneratedWorldPoi[]
  dressing: GeneratedWorldDressing[]
  terrain: GeneratedWorldTerrain
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  validation: { valid: boolean; issues: string[] }
}

export function createWorldLayerSeeds(masterSeed: number): WorldGenerationLayerSeeds {
  return {
    terrain: hashSeed(`${masterSeed}:terrain`),
    routes: hashSeed(`${masterSeed}:routes`),
    pois: hashSeed(`${masterSeed}:pois`),
    dressing: hashSeed(`${masterSeed}:dressing`),
  }
}

export function composeWorldSeed(seeds: WorldGenerationLayerSeeds) {
  return hashSeed(`${seeds.terrain}:${seeds.routes}:${seeds.pois}:${seeds.dressing}`)
}

export function generateGuidedRegion(
  region: ForgeRegionDefinition,
  worldSeed: number,
  generationVersion: number,
  layerSeeds: WorldGenerationLayerSeeds = createWorldLayerSeeds(worldSeed),
): GeneratedRegion {
  const routeRandom = seededRandom(layerSeeds.routes)
  const poiRandom = seededRandom(layerSeeds.pois)
  const settings = worldSettings(region)
  const mood = resolveWorldMood(region.biome, region.worldGen?.mood ?? 'auto', layerSeeds.dressing)
  const sizeScale = settings.size === 'small' ? .82 : settings.size === 'large' ? 1.22 : 1
  const chunkCount = Math.max(4, Math.round(intRange(routeRandom, region.chunkRange[0], region.chunkRange[1]) * sizeScale))
  const spacing = 17.5 * sizeScale * WORLD_SPATIAL_SCALE
  const wanderBase = region.mainPath === 'direct' ? 4 : region.mainPath === 'winding' ? 9 : 14
  const wander =
    wanderBase *
    (0.7 + settings.exploration * .7) *
    1.28
  const nodes: GeneratedRegionNode[] = []
  const connections: GeneratedRegionConnection[] = []
  const mainIds: string[] = []

  let z = (routeRandom() - .5) * 12.5
  for (let index = 0; index <= chunkCount; index += 1) {
    if (index > 0 && index < chunkCount) z += (routeRandom() - .5) * wander
    z = clamp(
      z,
      -30 * sizeScale * 1.32,
      30 * sizeScale * 1.32,
    )
    const id = index === 0 ? 'entry' : index === chunkCount ? 'exit' : `route-${index}`
    const kind: GeneratedRegionNodeKind = index === 0 ? 'entry' : index === chunkCount ? 'exit' : 'route'
    nodes.push({
      id,
      kind,
      x: index * spacing,
      z,
      radius:
        (kind === 'route' ? 9 + settings.openSpace * 4 : 11) *
        WORLD_CLEARING_SCALE,
      label: kind === 'entry' ? 'Forest Edge' : kind === 'exit' ? 'Old Road' : `Clearing ${index}`,
    })
    mainIds.push(id)
    if (index > 0) connections.push({ id: `main-${index - 1}-${index}`, from: mainIds[index - 1], to: id, kind: 'main' })
  }

  const branchTarget = intRange(routeRandom, region.branchRange[0], region.branchRange[1])
  const branchCount = Math.max(1, Math.round(branchTarget * (.34 + settings.exploration * .52 + settings.secretPaths * .18)))
  const usableMain = mainIds.slice(1, -1)
  const usedAnchors = new Set<string>()

  for (let branchIndex = 0; branchIndex < branchCount && usableMain.length; branchIndex += 1) {
    let anchor = usableMain[Math.floor(routeRandom() * usableMain.length)]
    let guard = 0
    while (usedAnchors.has(anchor) && guard < 12) {
      anchor = usableMain[Math.floor(routeRandom() * usableMain.length)]
      guard += 1
    }
    usedAnchors.add(anchor)

    const anchorNode = nodes.find((item) => item.id === anchor)!
    const frame = routeFrameAt(nodes, mainIds, anchor)
    const side = routeRandom() > .5 ? 1 : -1
    const sideNormal = {
      x: frame.normal.x * side,
      z: frame.normal.z * side,
    }
    let heading = normalized2(
      sideNormal.x + frame.tangent.x * ((routeRandom() - .5) * .28),
      sideNormal.z + frame.tangent.z * ((routeRandom() - .5) * .28),
    )
    const length = intRange(routeRandom, 1, 2)
    let previousId = anchor
    let previousNode = anchorNode

    for (let step = 1; step <= length; step += 1) {
      const id = `branch-${branchIndex}-${step}`
      const segmentLength = spacing * (.44 + routeRandom() * .12)
      const turn = (routeRandom() - .5) * .34
      heading = normalized2(
        heading.x + frame.tangent.x * turn + sideNormal.x * .1,
        heading.z + frame.tangent.z * turn + sideNormal.z * .1,
      )

      const branchNode: GeneratedRegionNode = {
        id,
        kind: 'branch',
        x: previousNode.x + heading.x * segmentLength,
        z: previousNode.z + heading.z * segmentLength,
        radius:
          (7 + settings.openSpace * 2.5) * WORLD_CLEARING_SCALE,
        label: `Side Trail ${branchIndex + 1}`,
        parentId: previousId,
      }
      nodes.push(branchNode)
      connections.push({
        id: `branch-link-${branchIndex}-${step}`,
        from: previousId,
        to: id,
        kind: 'branch',
      })
      previousId = id
      previousNode = branchNode
    }

    // Side-trail loops are intentionally disabled here. They were the last
    // source of large triangles/parallel shortcuts around rivers. Local spurs
    // are more predictable and keep the generated road network readable.
  }

  const landmarkCount = Math.max(3, Math.round(intRange(poiRandom, region.landmarkRange[0], region.landmarkRange[1]) * (.75 + settings.poiDensity * .6)))
  const branchEnds = nodes.filter((item) => item.kind === 'branch' && !connections.some((link) => link.kind === 'branch' && link.from === item.id))
  const landmarkTargets = [...branchEnds, ...shuffle(nodes.filter((item) => item.kind === 'route'), poiRandom)]
  const poiTypes = poiPool(region)
  let poiCycle = shuffle([...new Set(poiTypes)], poiRandom)

  for (let index = 0; index < landmarkCount && landmarkTargets.length; index += 1) {
    const target = landmarkTargets.splice(Math.floor(poiRandom() * landmarkTargets.length), 1)[0]
    if (!poiCycle.length) poiCycle = shuffle([...new Set(poiTypes)], poiRandom)
    const type = poiCycle.shift() ?? 'ruins'
    const baseOffset = poiApproachDistance(type)
    let approachDirection: GeneratedWorldPoint

    if (target.kind === 'branch' && target.parentId) {
      const parent = nodes.find((item) => item.id === target.parentId)
      const outward = parent
        ? normalized2(target.x - parent.x, target.z - parent.z)
        : { x: 0, z: 1 }
      const lateral = { x: -outward.z, z: outward.x }
      const jitter = (poiRandom() - .5) * .42
      approachDirection = normalized2(
        outward.x + lateral.x * jitter,
        outward.z + lateral.z * jitter,
      )
    } else {
      const frame = routeFrameAt(nodes, mainIds, target.id)
      const side = poiRandom() > .5 ? 1 : -1
      const jitter = (poiRandom() - .5) * .28
      approachDirection = normalized2(
        frame.normal.x * side + frame.tangent.x * jitter,
        frame.normal.z * side + frame.tangent.z * jitter,
      )
    }

    const offsetDistance = target.kind === 'branch'
      ? baseOffset * (.78 + poiRandom() * .18)
      : baseOffset * (.96 + poiRandom() * .18)
    const node: GeneratedRegionNode = {
      id: `landmark-${index}`,
      kind: 'landmark',
      x: target.x + approachDirection.x * offsetDistance,
      z: target.z + approachDirection.z * offsetDistance,
      radius: poiRadius(type),
      label: poiLabel(type),
      parentId: target.id,
      poiType: type,
    }
    nodes.push(node)
    const shouldApproach = type !== 'beast-den' || poiRandom() < .55
    if (shouldApproach) {
      connections.push({ id: `poi-link-${index}`, from: target.id, to: node.id, kind: 'branch' })
    }
  }

  if (poiRandom() < region.settlementChance) {
    const target = nodes.filter((node) => node.kind === 'route')[Math.max(0, Math.floor(chunkCount * .55) - 1)]
    if (target) {
      const frame = routeFrameAt(nodes, mainIds, target.id)
      const side = poiRandom() > .5 ? 1 : -1
      const direction = normalized2(
        frame.normal.x * side + frame.tangent.x * ((poiRandom() - .5) * .22),
        frame.normal.z * side + frame.tangent.z * ((poiRandom() - .5) * .22),
      )
      const settlementDistance =
        (13.5 + poiRandom() * 2.5) * 1.28
      nodes.push({
        id: 'settlement-1',
        kind: 'landmark',
        x: target.x + direction.x * settlementDistance,
        z: target.z + direction.z * settlementDistance,
        radius: poiRadius('settlement'),
        label: 'Wayfarer Camp',
        parentId: target.id,
        poiType: 'settlement',
      })
      connections.push({ id: 'settlement-link-1', from: target.id, to: 'settlement-1', kind: 'branch' })
    }
  }

  if (region.linkedDungeonId) {
    const currentBranchEnds = nodes.filter((item) => item.kind === 'branch' && !connections.some((link) => link.kind === 'branch' && link.from === item.id))
    const fallback = nodes.filter((item) => item.kind === 'route')
    const candidates = currentBranchEnds.length ? currentBranchEnds : fallback
    const anchor = candidates.length ? candidates[Math.floor(poiRandom() * candidates.length)] : nodes.find((item) => item.kind === 'exit') ?? nodes[0]
    if (anchor) {
      const direction = anchor.z >= 0 ? 1 : -1
      const id = `dungeon-${region.linkedDungeonId}`
      const dungeonNode: GeneratedRegionNode = {
        id,
        kind: 'landmark',
        x: anchor.x + (7 + poiRandom() * 4) * 1.24,
        z: anchor.z + direction * (8 + poiRandom() * 5) * 1.24,
        radius: poiRadius('dungeon'),
        label: titleCase(region.linkedDungeonId),
        parentId: anchor.id,
        poiType: 'dungeon',
        contentType: 'dungeon',
        contentRef: region.linkedDungeonId,
      }
      nodes.push(dungeonNode)
      connections.push({ id: `dungeon-link-${region.linkedDungeonId}`, from: anchor.id, to: id, kind: 'branch' })
    }
  }

  const combatCandidates = nodes.filter((item) => item.kind === 'route' || item.kind === 'branch')
  const encounterCount = region.enemyDensity === 'high' ? 3 : region.enemyDensity === 'low' ? 1 : 2
  for (let index = 0; index < encounterCount && combatCandidates.length; index += 1) {
    const targetIndex = Math.min(combatCandidates.length - 1, Math.floor((index + 1) / (encounterCount + 1) * combatCandidates.length))
    const target = combatCandidates[targetIndex]
    nodes.push({
      id: `encounter-${index + 1}`,
      kind: 'encounter',
      x: target.x + (2 + poiRandom() * 2) * 1.2,
      z: target.z + (poiRandom() - .5) * 5.2,
      radius: 6.4,
      label: `${titleCase(region.enemyDensity)} encounter`,
      parentId: target.id,
    })
  }

  const bounds = calculateBounds(nodes, sizeScale)

  // River Occupancy Pipeline:
  // 1) freeze hydrology from the untouched terrain foundation,
  // 2) derive one bank-aware occupancy corridor from that frozen river,
  // 3) move world nodes outside the corridor before final paths are built,
  // 4) permit roads inside it only at explicit crossing anchors,
  // 5) reuse the same mask for terrain shaping, dressing and validation.
  const terrainFoundation = buildTerrainFoundation(region, bounds, layerSeeds.terrain)
  const frozenHydrology = buildFrozenHydrology(
    terrainFoundation,
    bounds,
    layerSeeds.terrain,
    settings.water,
  )
  const riverMask = buildRiverOccupancyMask(
    frozenHydrology.points,
    frozenHydrology.widths,
  )

  resolveNodesOutsideRiverMask(nodes, connections, riverMask, bounds)
  separatePostRiverLandmarks(nodes, riverMask, bounds)
  resolveNodesOutsideRiverMask(nodes, connections, riverMask, bounds)
  separatePostRiverLandmarks(nodes, riverMask, bounds)

  // POIs that intentionally have an access path must never lose it just because
  // their original parent landed across the river. Re-anchor them to a nearby
  // main-road node with a short river-safe spur; if necessary, move the POI
  // locally beside that road instead of silently dropping its rendered path.
  repairPoiRoadAccess(nodes, connections, riverMask, bounds)

  pruneBadLoopConnections(nodes, connections)
  pruneOrphanBranchTopology(nodes, connections)

  let paths = buildWorldPaths(nodes, connections, layerSeeds.routes)
  smoothWorldJunctions(paths, nodes)
  shapeLandmarkApproaches(paths, nodes)

  if (separatePoisFromRenderedMainRoad(nodes, paths, riverMask, bounds)) {
    repairPoiRoadAccess(nodes, connections, riverMask, bounds)
    paths = buildWorldPaths(nodes, connections, layerSeeds.routes)
    smoothWorldJunctions(paths, nodes)
    shapeLandmarkApproaches(paths, nodes)
  }

  // Final stabilization rule: side trails never own a river crossing. Any
  // branch/POI spur that would enter the river corridor is omitted, together
  // with downstream disconnected trail pieces, instead of being stretched to a
  // bridge or pushed into a long bank-hugging detour.
  paths = filterBankLocalSideTrails(paths, riverMask)

  const crossings = buildCrossings(paths, frozenHydrology.points, layerSeeds.routes, settings)
  for (const crossing of crossings) {
    const path = paths.find((item) => item.id === crossing.pathId)
    if (path) shapePathAtCrossing(path, crossing)
  }

  // Only the main road is allowed to be corrected through/around the river.
  // Branch paths are already guaranteed clear by filterBankLocalSideTrails and
  // are deliberately left untouched so the safety solver cannot deform them.
  const mainPaths = paths.filter((path) => path.kind === 'main')
  enforcePathsOutsideRiverMask(mainPaths, riverMask, crossings, bounds)
  repairResidualRiverPathIncursions(mainPaths, riverMask, crossings, bounds)

  const clearings = nodes
    .filter((node) => ['entry', 'route', 'exit', 'landmark', 'encounter'].includes(node.kind))
    .map((node) => ({ x: node.x, z: node.z, radius: node.radius + (node.kind === 'landmark' ? 2 : 0) }))

  const pois = nodes
    .filter((node): node is GeneratedRegionNode & { poiType: WorldPoiType } => Boolean(node.poiType))
    .map((node, index) => ({
      id: `poi-${index}`,
      type: node.poiType,
      label: node.label,
      x: node.x,
      z: node.z,
      radius: node.radius,
      rotation: poiRandom() * Math.PI * 2,
      nodeId: node.id,
      contentRef: node.contentRef,
    }))

  const terrain = buildTerrainFromFrozenHydrology(
    region,
    bounds,
    paths,
    clearings,
    pois,
    layerSeeds.terrain,
    terrainFoundation,
    frozenHydrology,
    riverMask,
  )

  const dressing = buildDressing(
    region,
    mood,
    bounds,
    terrain,
    paths,
    pois,
    riverMask,
    layerSeeds.dressing,
    layerSeeds.terrain,
  )
  const validation = validateGeneratedRegion(
    nodes,
    connections,
    paths,
    crossings,
    terrain.stream,
    bounds,
    riverMask,
    pois,
  )
  const seed = composeWorldSeed(layerSeeds)

  return {
    format: 'forge-generated-region',
    version: 5,
    seed,
    masterSeed: worldSeed,
    layerSeeds,
    generationVersion,
    regionId: region.id,
    regionName: region.name,
    biome: region.biome,
    mood,
    nodes,
    connections,
    paths,
    crossings,
    pois,
    dressing,
    terrain,
    bounds,
    validation,
  }
}

export function sampleTerrainHeight(region: Pick<GeneratedRegion, 'terrain' | 'bounds'>, x: number, z: number) {
  const { terrain, bounds } = region
  const resolution = terrain.resolution
  if (resolution < 2 || terrain.heights.length !== resolution * resolution) return 0
  const u = clamp((x - bounds.minX) / Math.max(.001, bounds.maxX - bounds.minX), 0, 1)
  const v = clamp((z - bounds.minZ) / Math.max(.001, bounds.maxZ - bounds.minZ), 0, 1)
  const gx = u * (resolution - 1)
  const gz = v * (resolution - 1)
  const x0 = Math.floor(gx), z0 = Math.floor(gz)
  const x1 = Math.min(resolution - 1, x0 + 1), z1 = Math.min(resolution - 1, z0 + 1)
  const tx = gx - x0, tz = gz - z0
  const h00 = terrain.heights[z0 * resolution + x0] ?? 0
  const h10 = terrain.heights[z0 * resolution + x1] ?? h00
  const h01 = terrain.heights[z1 * resolution + x0] ?? h00
  const h11 = terrain.heights[z1 * resolution + x1] ?? h00
  const a = h00 + (h10 - h00) * tx
  const b = h01 + (h11 - h01) * tx
  return a + (b - a) * tz
}

export function sampleRenderedTerrainHeight(
  region: Pick<GeneratedRegion, 'terrain' | 'bounds'>,
  x: number,
  z: number,
) {
  const { terrain, bounds } = region
  const resolution = terrain.resolution
  if (resolution < 2 || terrain.heights.length !== resolution * resolution) return 0

  const u = clamp((x - bounds.minX) / Math.max(.001, bounds.maxX - bounds.minX), 0, 1)
  const v = clamp((z - bounds.minZ) / Math.max(.001, bounds.maxZ - bounds.minZ), 0, 1)
  const gx = u * (resolution - 1)
  const gz = v * (resolution - 1)
  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const x1 = Math.min(resolution - 1, x0 + 1)
  const z1 = Math.min(resolution - 1, z0 + 1)
  const tx = gx - x0
  const tz = gz - z0

  const h00 = terrain.heights[z0 * resolution + x0] ?? 0
  const h10 = terrain.heights[z0 * resolution + x1] ?? h00
  const h01 = terrain.heights[z1 * resolution + x0] ?? h00
  const h11 = terrain.heights[z1 * resolution + x1] ?? h00

  // Match the actual terrain mesh triangles exactly:
  // first triangle  a,d,b  when tx + tz <= 1
  // second triangle b,d,c  when tx + tz > 1
  if (tx + tz <= 1) {
    return h00 + tx * (h10 - h00) + tz * (h01 - h00)
  }

  return h11
    + (1 - tx) * (h01 - h11)
    + (1 - tz) * (h10 - h11)
}

export function streamRenderProfile(region: GeneratedRegion, extension = 52) {
  const points = region.terrain.stream
  if (points.length < 2) {
    return {
      points: points.map((point) => ({ ...point })),
      widths: [...region.terrain.streamWidths],
      heights: [...region.terrain.streamHeights],
    }
  }

  const widths = region.terrain.streamWidths.length === points.length
    ? region.terrain.streamWidths
    : points.map(() => 2.3)
  const heights = region.terrain.streamHeights.length === points.length
    ? region.terrain.streamHeights
    : points.map(() => region.terrain.waterLevel)

  const startLookahead = points[Math.min(points.length - 1, 3)]
  const endLookback = points[Math.max(0, points.length - 4)]
  const startTangent = normalized2(
    points[0].x - startLookahead.x,
    points[0].z - startLookahead.z,
  )
  const endTangent = normalized2(
    points[points.length - 1].x - endLookback.x,
    points[points.length - 1].z - endLookback.z,
  )
  const startDir = outwardStreamDirection(points[0], region.bounds, startTangent)
  const endDir = outwardStreamDirection(
    points[points.length - 1],
    region.bounds,
    endTangent,
  )
  const startSlope = heights.length > 1 ? heights[0] - heights[1] : 0
  const endSlope = heights.length > 1 ? heights[heights.length - 1] - heights[heights.length - 2] : 0

  const extendedPoints: GeneratedWorldPoint[] = []
  const extendedWidths: number[] = []
  const extendedHeights: number[] = []
  const steps = 7
  const startCurveSign = hashSeed(`${region.seed}:river-render-start`) % 2 === 0 ? 1 : -1
  const endCurveSign = hashSeed(`${region.seed}:river-render-end`) % 2 === 0 ? 1 : -1

  for (let step = steps; step >= 1; step -= 1) {
    const t = step / steps
    const distance = extension * t
    const curve = Math.sin(t * Math.PI * .5) * Math.min(6.5, extension * .13) * startCurveSign
    const perpendicular = { x: -startDir.z, z: startDir.x }
    extendedPoints.push({
      x: points[0].x + startDir.x * distance + perpendicular.x * curve,
      z: points[0].z + startDir.z * distance + perpendicular.z * curve,
    })
    const taper = offMapStreamWidthScale(t, extension)
    extendedWidths.push(widths[0] * taper)
    extendedHeights.push(heights[0] + startSlope * step)
  }

  for (let index = 0; index < points.length; index += 1) {
    extendedPoints.push({ ...points[index] })
    extendedWidths.push(widths[index])
    extendedHeights.push(heights[index])
  }

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const distance = extension * t
    const curve = Math.sin(t * Math.PI * .5) * Math.min(6.5, extension * .13) * endCurveSign
    const perpendicular = { x: -endDir.z, z: endDir.x }
    extendedPoints.push({
      x: points[points.length - 1].x + endDir.x * distance + perpendicular.x * curve,
      z: points[points.length - 1].z + endDir.z * distance + perpendicular.z * curve,
    })
    const taper = offMapStreamWidthScale(t, extension)
    extendedWidths.push(widths[widths.length - 1] * taper)
    extendedHeights.push(heights[heights.length - 1] + endSlope * step)
  }

  return densifyStreamRenderProfile(
    extendedPoints,
    extendedWidths,
    extendedHeights,
    .55,
  )
}

export function worldBoundaryBackdropHeight(region: GeneratedRegion, margin = 1.25) {
  const terrainFloor = region.terrain.heights.reduce(
    (lowest, height) => Number.isFinite(height) ? Math.min(lowest, height) : lowest,
    Infinity,
  )
  const renderProfile = streamRenderProfile(region)
  const riverFloor = renderProfile.heights.reduce(
    (lowest, height) => Number.isFinite(height) ? Math.min(lowest, height) : lowest,
    Infinity,
  )
  const sceneFloor = Math.min(terrainFloor, riverFloor)

  // The boundary backdrop spans underneath the whole playable terrain. Keep it
  // below every terrain and rendered-river height so deep channels can never
  // disappear behind this otherwise invisible support plane.
  return Number.isFinite(sceneFloor)
    ? sceneFloor - Math.max(.5, margin)
    : -3
}

function densifyStreamRenderProfile(
  points: GeneratedWorldPoint[],
  widths: number[],
  heights: number[],
  spacing: number,
) {
  if (points.length < 2) {
    return {
      points: points.map((point) => ({ ...point })),
      widths: [...widths],
      heights: [...heights],
    }
  }

  const densePoints: GeneratedWorldPoint[] = [{ ...points[0] }]
  const denseWidths: number[] = [widths[0] ?? 1]
  const denseHeights: number[] = [heights[0] ?? 0]
  const maxSpacing = Math.max(.65, spacing)

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const previousWidth = widths[index - 1] ?? widths[0] ?? 1
    const currentWidth = widths[index] ?? previousWidth
    const previousHeight = heights[index - 1] ?? heights[0] ?? 0
    const currentHeight = heights[index] ?? previousHeight
    const distance = Math.hypot(current.x - previous.x, current.z - previous.z)
    const sections = Math.max(1, Math.ceil(distance / maxSpacing))

    for (let section = 1; section <= sections; section += 1) {
      const t = section / sections
      densePoints.push({
        x: lerp(previous.x, current.x, t),
        z: lerp(previous.z, current.z, t),
      })
      denseWidths.push(lerp(previousWidth, currentWidth, t))
      denseHeights.push(lerp(previousHeight, currentHeight, t))
    }
  }

  return {
    points: densePoints,
    widths: denseWidths,
    heights: denseHeights,
  }
}

function offMapStreamWidthScale(t: number, extension: number) {
  // The editor/runtime backdrop extends ~45 world units beyond the terrain.
  // Hold normal width until the continuation is outside that visible backdrop,
  // then taper rapidly where the artificial cap cannot be seen.
  const taperStart = clamp(47 / Math.max(1, extension), .58, .92)
  if (t <= taperStart) return 1
  const taperT = clamp((t - taperStart) / Math.max(.001, 1 - taperStart), 0, 1)
  return lerp(1, .04, smoothstep(taperT))
}

function outwardStreamDirection(
  point: GeneratedWorldPoint,
  bounds: GeneratedRegion['bounds'],
  tangent: GeneratedWorldPoint,
) {
  const candidates = [
    { distance: Math.abs(point.x - bounds.minX), normal: { x: -1, z: 0 } },
    { distance: Math.abs(point.x - bounds.maxX), normal: { x: 1, z: 0 } },
    { distance: Math.abs(point.z - bounds.minZ), normal: { x: 0, z: -1 } },
    { distance: Math.abs(point.z - bounds.maxZ), normal: { x: 0, z: 1 } },
  ].sort((a, b) => a.distance - b.distance)

  const normal = candidates[0].normal
  let direction = normalized2(tangent.x, tangent.z)
  let alignment = direction.x * normal.x + direction.z * normal.z

  // If the tangent happens to point back into the playable terrain, flip it.
  if (alignment < 0) {
    direction = { x: -direction.x, z: -direction.z }
    alignment = -alignment
  }

  // Near-tangential exits can still skim along the backdrop and leave the
  // artificial cap visible. Bias them outward while keeping the river's shape.
  if (alignment < .42) {
    const outwardBias = .42 - alignment + .28
    direction = normalized2(
      direction.x + normal.x * outwardBias,
      direction.z + normal.z * outwardBias,
    )
  }

  return direction
}

export function visibleStreamRenderHeight(
  region: GeneratedRegion,
  nominalHeight: number,
  x: number,
  z: number,
  offset = .055,
) {
  const inside =
    x >= region.bounds.minX - .001 &&
    x <= region.bounds.maxX + .001 &&
    z >= region.bounds.minZ - .001 &&
    z <= region.bounds.maxZ + .001

  if (!inside) return nominalHeight + offset

  // The heightfield is relatively coarse compared with a narrow stream.
  // Clamp visible water above the final bilinear terrain sample so a terrain
  // triangle can never bridge across the carved channel and hide the river.
  return Math.max(
    nominalHeight + offset,
    sampleRenderedTerrainHeight(region, x, z) + Math.max(.055, offset),
  )
}

export function streamWaterSurfaceRows(
  region: GeneratedRegion,
  laneCount = 5,
  clearance = .065,
) {
  const profile = streamRenderProfile(region)
  const lanes = Math.max(3, laneCount % 2 === 0 ? laneCount + 1 : laneCount)
  const rows: Array<{
    x: number
    z: number
    y: number
    width: number
    nominalHeight: number
    points: Array<{ x: number; z: number; y: number }>
  }> = []

  for (let index = 0; index < profile.points.length; index += 1) {
    const center = profile.points[index]
    const previous = profile.points[Math.max(0, index - 1)]
    const next = profile.points[Math.min(profile.points.length - 1, index + 1)]
    let tangent = normalized2(next.x - previous.x, next.z - previous.z)

    if (
      Math.abs(next.x - previous.x) < .00001 &&
      Math.abs(next.z - previous.z) < .00001
    ) {
      tangent = { x: 1, z: 0 }
    }

    const normal = { x: -tangent.z, z: tangent.x }
    const width = Math.max(.04, profile.widths[index] ?? profile.widths[0] ?? 1)
    const halfWidth = width * .5
    const nominalHeight = profile.heights[index] ?? profile.heights[0] ?? region.terrain.waterLevel
    const lanePoints: Array<{ x: number; z: number; y: number }> = []
    const waterHeight = visibleStreamRenderHeight(
      region,
      nominalHeight,
      center.x,
      center.z,
      clearance,
    )

    for (let lane = 0; lane < lanes; lane += 1) {
      const across = lanes === 1 ? 0 : lane / (lanes - 1) * 2 - 1
      const x = center.x + normal.x * halfWidth * across
      const z = center.z + normal.z * halfWidth * across
      lanePoints.push({
        x,
        z,
        y: visibleStreamRenderHeight(region, nominalHeight, x, z, clearance),
      })
    }

    rows.push({
      x: center.x,
      z: center.z,
      y: waterHeight,
      width,
      nominalHeight,
      points: lanePoints,
    })
  }

  return { rows, laneCount: lanes }
}

export function streamRenderContinuityIssues(region: GeneratedRegion) {
  const profile = streamRenderProfile(region)
  const issues: string[] = []

  if (
    profile.points.length !== profile.widths.length ||
    profile.points.length !== profile.heights.length
  ) {
    issues.push('Stream render profile arrays have mismatched lengths.')
    return issues
  }

  for (let index = 1; index < profile.points.length; index += 1) {
    const previous = profile.points[index - 1]
    const current = profile.points[index]
    const distance = Math.hypot(current.x - previous.x, current.z - previous.z)
    const localWidth = Math.max(profile.widths[index - 1] ?? 1, profile.widths[index] ?? 1)
    const allowed = Math.max(1.65, localWidth * 1.15)
    if (distance > allowed) {
      issues.push(`Stream render segment ${index - 1}->${index} is too long (${round(distance, 2)}).`)
    }
  }

  const surface = streamWaterSurfaceRows(region, 9, .085)
  for (let rowIndex = 0; rowIndex < surface.rows.length; rowIndex += 1) {
    const row = surface.rows[rowIndex]
    const nextRow = surface.rows[Math.min(surface.rows.length - 1, rowIndex + 1)]
    for (let laneIndex = 0; laneIndex < row.points.length; laneIndex += 1) {
      const point = row.points[laneIndex]
      const samples = [{ x: point.x, z: point.z, waterY: point.y }]

      if (nextRow && nextRow !== row) {
        const nextPoint = nextRow.points[laneIndex]
        if (nextPoint) {
          samples.push({
            x: (point.x + nextPoint.x) * .5,
            z: (point.z + nextPoint.z) * .5,
            waterY: (point.y + nextPoint.y) * .5,
          })
        }
      }

      for (const sample of samples) {
        const inside =
          sample.x >= region.bounds.minX &&
          sample.x <= region.bounds.maxX &&
          sample.z >= region.bounds.minZ &&
          sample.z <= region.bounds.maxZ
        if (!inside) continue
        const terrainHeight = sampleRenderedTerrainHeight(region, sample.x, sample.z)
        if (sample.waterY < terrainHeight + .06) {
          issues.push(`Terrain protrudes through stream row ${rowIndex}, lane ${laneIndex}.`)
          break
        }
      }
    }
  }

  return issues
}

export function sampleStreamHeight(region: GeneratedRegion, x: number, z: number) {
  if (region.terrain.stream.length < 2 || region.terrain.streamHeights.length !== region.terrain.stream.length) {
    return region.terrain.waterLevel
  }
  return nearestHydrologySample(
    x,
    z,
    region.terrain.stream,
    region.terrain.streamWidths,
    region.terrain.streamHeights,
  ).height
}

export function sampleTerrainSurface(region: GeneratedRegion, x: number, z: number) {
  const seed = region.layerSeeds.terrain
  const broad = valueNoise2D(x * .021 + 8.7, z * .021 - 13.4, seed ^ 0x51ED270B)
  const medium = valueNoise2D(x * .057 - 19.2, z * .057 + 27.5, seed ^ 0xC3A5C85C)
  const fine = valueNoise2D(x * .135 + 4.1, z * .135 - 7.8, seed ^ 0x9E3779B9)

  let poiWear = 0
  let poiSoil = 0
  for (const poi of region.pois) {
    const distance = Math.hypot(x - poi.x, z - poi.z)
    const surfaceScale =
      poi.type === 'settlement' ? 1 :
        poi.type === 'camp' ? .88 :
          poi.type === 'graveyard' || poi.type === 'ruins' ? .78 :
            poi.type === 'watchtower' || poi.type === 'dungeon' ? .7 :
              poi.type === 'shrine' || poi.type === 'standing-stones' ? .66 :
                .74
    const radius = poi.radius * surfaceScale
    if (distance > radius * 1.35) continue

    const localNoise = valueNoise2D(
      (x - poi.x) * .16 + hashSeed(poi.id) % 17,
      (z - poi.z) * .16 - hashSeed(poi.id) % 13,
      seed ^ hashSeed(poi.id),
    )
    const irregularRadius = radius * (.78 + localNoise * .4)
    const normalized = distance / Math.max(.001, irregularRadius)
    const influence =
      (1 - smoothstep(clamp((normalized - .18) / .9, 0, 1))) *
      (.82 + localNoise * .18)
    const strength = poi.type === 'settlement'
      ? .9
      : poi.type === 'camp'
        ? .82
        : poi.type === 'graveyard' || poi.type === 'ruins'
          ? .58
          : poi.type === 'watchtower' || poi.type === 'dungeon'
            ? .48
            : .4
    poiWear = Math.max(poiWear, influence * strength)
    poiSoil = Math.max(
      poiSoil,
      influence * (
        poi.type === 'camp' || poi.type === 'settlement'
          ? .76
          : .42
      ),
    )
  }

  const micro = microBiomeInfluence(region.terrain.microBiomes, x, z)
  const clearing = clearingSurfaceInfluence(region.terrain.clearings, x, z, seed)
  const crossingWear = crossingApproachWear(region.crossings, x, z)
  const roadWear = Math.max(
    pathEdgeWear(region.paths, region.crossings, x, z, seed),
    crossingWear * .62,
  )
  const forestFloor = clamp(
    ((.58 - broad) * .82 + (medium - .5) * .24 + micro['forest-floor'] * 1.08) *
      (1 - clearing * .5),
    0,
    1,
  )
  const moss = clamp(
    ((broad - .42) * .72 + (fine - .5) * .18 + micro.moss * 1.16) *
      (1 - clearing * .26),
    0,
    1,
  )
  const meadow = clamp(
    micro.meadow * 1.08 + clearing * (.34 + medium * .2),
    0,
    1,
  )
  const scrub = clamp(micro.scrub * 1.08 * (1 - clearing * .34), 0, 1)
  const soil = clamp(
    (medium - .48) * .7 +
      (1 - broad) * .18 +
      poiSoil +
      micro.rocky * .2 +
      roadWear * .76 +
      crossingWear * .2 +
      clearing * .12,
    0,
    1,
  )

  return {
    broad,
    medium,
    fine,
    forestFloor,
    moss,
    soil,
    meadow,
    scrub,
    rocky: micro.rocky,
    roadWear,
    crossingWear,
    poiWear: clamp(poiWear, 0, 1),
    clearing,
  }
}

export function validateGeneratedRegion(
  nodes: GeneratedRegionNode[],
  connections: GeneratedRegionConnection[],
  paths: GeneratedWorldPath[] = [],
  crossings: GeneratedWorldCrossing[] = [],
  stream: GeneratedWorldPoint[] = [],
  bounds?: GeneratedRegion['bounds'],
  riverMask?: RiverOccupancyMask,
  pois: GeneratedWorldPoi[] = [],
) {
  const issues: string[] = []
  const entry = nodes.find((item) => item.kind === 'entry')
  const exit = nodes.find((item) => item.kind === 'exit')
  if (!entry) issues.push('Missing region entry.')
  if (!exit) issues.push('Missing region exit.')

  if (entry && exit) {
    const adjacency = new Map<string, string[]>()
    for (const node of nodes) adjacency.set(node.id, [])
    for (const link of connections) {
      adjacency.get(link.from)?.push(link.to)
      adjacency.get(link.to)?.push(link.from)
    }
    const seen = new Set<string>([entry.id])
    const queue = [entry.id]
    while (queue.length) {
      const current = queue.shift()!
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    if (!seen.has(exit.id)) issues.push('Entry cannot reach exit.')
    for (const dungeon of nodes.filter((node) => node.contentType === 'dungeon')) {
      if (!seen.has(dungeon.id)) issues.push(`${dungeon.label} dungeon entrance is unreachable from the region entry.`)
    }
  }

  for (const link of connections) {
    const from = nodes.find((item) => item.id === link.from)
    const to = nodes.find((item) => item.id === link.to)
    if (!from || !to) issues.push(`Broken connection ${link.id}.`)
    else if (Math.hypot(to.x - from.x, to.z - from.z) > 52) issues.push(`Connection ${link.id} is too long for reliable traversal.`)
  }

  if (stream.length > 1 && bounds) {
    const firstSides = boundarySides(stream[0], bounds)
    const lastSides = boundarySides(stream[stream.length - 1], bounds)
    const opposite: Record<string, string> = {
      minX: 'maxX',
      maxX: 'minX',
      minZ: 'maxZ',
      maxZ: 'minZ',
    }
    if (!firstSides.length || !lastSides.length) {
      issues.push('River must begin and end on the region boundary.')
    } else if (!firstSides.some((side) => lastSides.includes(opposite[side]))) {
      issues.push('River endpoints must terminate on opposite region boundaries.')
    }
  }

  if (stream.length > 1) {
    for (const crossing of crossings) {
      const path = paths.find((item) => item.id === crossing.pathId)
      if (!path) {
        issues.push(`Crossing ${crossing.id} references a missing road.`)
        continue
      }
      const streamDistance = distanceToPolyline(crossing.x, crossing.z, stream)
      const roadDistance = distanceToPolyline(crossing.x, crossing.z, path.points)
      if (streamDistance > .2) issues.push(`Crossing ${crossing.id} is not centered on the final river.`)
      if (roadDistance > .25) issues.push(`Crossing ${crossing.id} is not centered on its road.`)
    }
  }

  for (const landmark of nodes.filter((node) => node.kind === 'landmark')) {
    const accessLinks = connections.filter((connection) =>
      connection.kind === 'branch' &&
      (connection.from === landmark.id || connection.to === landmark.id)
    )
    if (!accessLinks.length) continue

    const rendered = accessLinks.some((connection) =>
      paths.some((path) => path.id === connection.id)
    )
    if (!rendered) {
      issues.push(
        `${landmark.label} has a logical access link but no rendered road/trail path.`,
      )
    }
  }

  const mainRoadPaths = paths.filter((path) => path.kind === 'main')
  for (const poi of pois) {
    const nearest = nearestPathSample(mainRoadPaths, poi.x, poi.z)
    if (!nearest) continue
    const required =
      poi.radius +
      pathFootprintHalfWidth(nearest.width) +
      1.35
    if (nearest.distance < required) {
      issues.push(
        `${poi.label} overlaps the final main-road footprint.`,
      )
    }
  }

  for (let index = 0; index < pois.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < pois.length; otherIndex += 1) {
      const a = pois[index]
      const b = pois[otherIndex]
      const distance = Math.hypot(a.x - b.x, a.z - b.z)
      const required = a.radius + b.radius + 1.2
      if (distance < required) {
        issues.push(
          `${a.label} overlaps ${b.label} after final world-layout resolution.`,
        )
      }
    }
  }

  if (riverMask && riverMask.points.length > 1) {
    for (const poi of pois) {
      const sample = riverOccupancySample(riverMask, poi.x, poi.z)
      if (sample.signedDistance < poi.radius + .5) {
        issues.push(`${poi.label} overlaps the final river occupancy corridor.`)
      }
    }

    for (const path of paths) {
      let illegal = false
      for (const point of pathClearanceSamples(path)) {
        const river = riverOccupancySample(riverMask, point.x, point.z)
        const footprintHalfWidth = pathFootprintHalfWidth(point.width)
        const required = footprintHalfWidth + .2

        if (river.signedDistance >= required) continue
        if (crossingAllowsRiverOccupancy(
          point.x,
          point.z,
          crossings,
          river.radius,
          footprintHalfWidth,
        )) continue

        illegal = true
        break
      }

      if (illegal) {
        issues.push(`Path ${path.id} enters the river occupancy corridor outside an explicit crossing.`)
      }
    }
  }

  return { valid: issues.length === 0, issues }
}

function boundarySides(
  point: GeneratedWorldPoint,
  bounds: GeneratedRegion['bounds'],
  tolerance = .015,
) {
  const sides: string[] = []
  if (Math.abs(point.x - bounds.minX) <= tolerance) sides.push('minX')
  if (Math.abs(point.x - bounds.maxX) <= tolerance) sides.push('maxX')
  if (Math.abs(point.z - bounds.minZ) <= tolerance) sides.push('minZ')
  if (Math.abs(point.z - bounds.maxZ) <= tolerance) sides.push('maxZ')
  return sides
}

export function randomWorldSeed() {
  return Math.floor(1000000 + Math.random() * 8999999)
}

export function buildRiverOccupancyMask(
  points: GeneratedWorldPoint[],
  widths: number[],
  bankPadding = .9,
): RiverOccupancyMask {
  return {
    points: points.map((point) => ({ ...point })),
    widths: points.map((_, index) => widths[index] ?? widths[0] ?? 2),
    bankPadding,
  }
}

function riverOccupancyRadius(width: number, bankPadding: number) {
  // Must match the rendered bank ribbon in World Forge / Play Region:
  // bank full width = streamWidth * 1.72 + .55.
  return (width * 1.72 + .55) * .5 + bankPadding
}

export function riverOccupancySample(mask: RiverOccupancyMask, x: number, z: number) {
  if (mask.points.length < 2) {
    return {
      distance: Infinity,
      radius: 0,
      signedDistance: Infinity,
      x,
      z,
      tangentX: 1,
      tangentZ: 0,
    }
  }

  let best = {
    distance: Infinity,
    radius: riverOccupancyRadius(mask.widths[0] ?? 2, mask.bankPadding),
    signedDistance: Infinity,
    x: mask.points[0].x,
    z: mask.points[0].z,
    tangentX: 1,
    tangentZ: 0,
  }

  for (let index = 1; index < mask.points.length; index += 1) {
    const a = mask.points[index - 1]
    const b = mask.points[index]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz
    const t = lengthSq > .00001
      ? clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
      : 0
    const px = a.x + dx * t
    const pz = a.z + dz * t
    const distance = Math.hypot(x - px, z - pz)
    if (distance >= best.distance) continue

    const width = lerp(
      mask.widths[index - 1] ?? mask.widths[0] ?? 2,
      mask.widths[index] ?? mask.widths[index - 1] ?? 2,
      t,
    )
    const radius = riverOccupancyRadius(width, mask.bankPadding)
    const tangent = normalized2(dx, dz)
    best = {
      distance,
      radius,
      signedDistance: distance - radius,
      x: px,
      z: pz,
      tangentX: tangent.x,
      tangentZ: tangent.z,
    }
  }

  return best
}

function resolveNodesOutsideRiverMask(
  nodes: GeneratedRegionNode[],
  connections: GeneratedRegionConnection[],
  mask: RiverOccupancyMask,
  bounds: GeneratedRegion['bounds'],
) {
  if (mask.points.length < 2) return

  const incidentKinds = new Map<string, Set<GeneratedRegionConnection['kind']>>()
  for (const connection of connections) {
    for (const nodeId of [connection.from, connection.to]) {
      const kinds = incidentKinds.get(nodeId) ?? new Set<GeneratedRegionConnection['kind']>()
      kinds.add(connection.kind)
      incidentKinds.set(nodeId, kinds)
    }
  }

  for (let pass = 0; pass < 3; pass += 1) {
    for (const node of nodes) {
      const sample = riverOccupancySample(mask, node.x, node.z)
      const kinds = incidentKinds.get(node.id)
      const isMainBranchJunction =
        node.kind === 'route' &&
        kinds?.has('main') === true &&
        kinds?.has('branch') === true
      const clearance =
        node.kind === 'landmark'
          ? node.radius + 1.5
          : node.kind === 'encounter'
            ? node.radius + .85
            : isMainBranchJunction
              ? 9.2
              : 2.8

      if (sample.signedDistance >= clearance) continue

      let dx = node.x - sample.x
      let dz = node.z - sample.z
      let length = Math.hypot(dx, dz)
      if (length < .001) {
        const sign = hashSeed(`river-node-side:${node.id}`) % 2 === 0 ? 1 : -1
        dx = -sample.tangentZ * sign
        dz = sample.tangentX * sign
        length = 1
      }

      const targetDistance = sample.radius + clearance
      node.x = clamp(
        sample.x + dx / length * targetDistance,
        bounds.minX + 1.25,
        bounds.maxX - 1.25,
      )
      node.z = clamp(
        sample.z + dz / length * targetDistance,
        bounds.minZ + 1.25,
        bounds.maxZ - 1.25,
      )
    }
  }
}

function separatePostRiverLandmarks(
  nodes: GeneratedRegionNode[],
  mask: RiverOccupancyMask,
  bounds: GeneratedRegion['bounds'],
) {
  const landmarks = nodes.filter((node) => node.kind === 'landmark')
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  for (let index = 0; index < landmarks.length; index += 1) {
    const node = landmarks[index]
    const earlier = landmarks.slice(0, index)
    const river = riverOccupancySample(mask, node.x, node.z)
    const overlaps = earlier.some((other) =>
      Math.hypot(node.x - other.x, node.z - other.z) <
        node.radius + other.radius + 2.6
    )
    if (!overlaps && river.signedDistance >= node.radius + 1.5) continue

    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined
    const center = parent ?? node
    const currentDistance = parent
      ? Math.hypot(node.x - parent.x, node.z - parent.z)
      : node.radius + 7
    const baseDistance = Math.max(node.radius + 5.5, currentDistance)
    const preferredAngle = parent
      ? Math.atan2(node.z - parent.z, node.x - parent.x)
      : (hashSeed(`poi-separation:${node.id}`) % 6283) / 1000
    const angleOffsets = [
      0,
      .18, -.18,
      .36, -.36,
      .58, -.58,
      .82, -.82,
      1.08, -1.08,
      1.42, -1.42,
      Math.PI,
    ]

    let best:
      | { x: number; z: number; score: number; valid: boolean }
      | undefined

    for (const ringScale of [1, 1.18, 1.38, 1.6]) {
      const radius = baseDistance * ringScale
      for (const angleOffset of angleOffsets) {
        const angle = preferredAngle + angleOffset
        const x = center.x + Math.cos(angle) * radius
        const z = center.z + Math.sin(angle) * radius
        if (
          x <= bounds.minX + node.radius ||
          x >= bounds.maxX - node.radius ||
          z <= bounds.minZ + node.radius ||
          z >= bounds.maxZ - node.radius
        ) continue

        const riverSample = riverOccupancySample(mask, x, z)
        const riverGap = riverSample.signedDistance - (node.radius + 1.5)
        let landmarkGap = Infinity
        for (const other of earlier) {
          landmarkGap = Math.min(
            landmarkGap,
            Math.hypot(x - other.x, z - other.z) -
              (node.radius + other.radius + 2.6),
          )
        }

        const valid = riverGap >= 0 && landmarkGap >= 0
        const score =
          Math.min(12, riverGap) * .55 +
          Math.min(14, landmarkGap) -
          Math.abs(ringScale - 1) * 2.2

        if (
          !best ||
          (valid && !best.valid) ||
          (valid === best.valid && score > best.score)
        ) {
          best = { x, z, score, valid }
        }
      }
    }

    if (best) {
      node.x = round(best.x, 3)
      node.z = round(best.z, 3)
    }
  }
}

function repairPoiRoadAccess(
  nodes: GeneratedRegionNode[],
  connections: GeneratedRegionConnection[],
  mask: RiverOccupancyMask,
  bounds: GeneratedRegion['bounds'],
) {
  const routeNodes = nodes.filter((node) =>
    node.kind === 'route' || node.kind === 'entry' || node.kind === 'exit'
  )
  const landmarks = nodes.filter((node) => node.kind === 'landmark')
  if (!routeNodes.length || !landmarks.length) return

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const mainSegments = connections
    .filter((connection) => connection.kind === 'main')
    .flatMap((connection) => {
      const from = nodeMap.get(connection.from)
      const to = nodeMap.get(connection.to)
      return from && to ? [{ from, to }] : []
    })

  const accessWidth = .96
  const pathClearance = pathFootprintHalfWidth(accessWidth) + 1.15
  const mainRoadDistance = (x: number, z: number) => {
    let best = Infinity
    for (const segment of mainSegments) {
      best = Math.min(
        best,
        distanceToSegment(x, z, segment.from, segment.to),
      )
    }
    return best
  }
  const poiRoadClearance = (landmark: GeneratedRegionNode) =>
    landmark.radius + 4.2
  const clearOfMainRoad = (
    landmark: GeneratedRegionNode,
    x: number,
    z: number,
  ) => mainRoadDistance(x, z) >= poiRoadClearance(landmark)

  const segmentIsSafe = (
    a: GeneratedWorldPoint,
    b: GeneratedWorldPoint,
    extraClearance = 0,
  ) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(2, Math.ceil(length / .48))
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = lerp(a.x, b.x, t)
      const z = lerp(a.z, b.z, t)
      const river = riverOccupancySample(mask, x, z)
      if (river.signedDistance < pathClearance + extraClearance) return false
    }
    return true
  }

  const hasLandmarkSpace = (
    landmark: GeneratedRegionNode,
    x: number,
    z: number,
  ) => {
    for (const other of landmarks) {
      if (other.id === landmark.id) continue
      const required = landmark.radius + other.radius + 2.2
      if (Math.hypot(x - other.x, z - other.z) < required) return false
    }
    return true
  }

  const rewire = (
    connection: GeneratedRegionConnection,
    landmark: GeneratedRegionNode,
    anchor: GeneratedRegionNode,
  ) => {
    if (connection.from === landmark.id) connection.to = anchor.id
    else connection.from = anchor.id
    landmark.parentId = anchor.id
  }

  for (const landmark of landmarks) {
    const connection = connections.find((item) =>
      item.kind === 'branch' &&
      (item.from === landmark.id || item.to === landmark.id)
    )
    if (!connection) continue

    const currentAnchorId =
      connection.from === landmark.id ? connection.to : connection.from
    const currentAnchor = nodes.find((node) => node.id === currentAnchorId)
    const currentLength = currentAnchor
      ? Math.hypot(landmark.x - currentAnchor.x, landmark.z - currentAnchor.z)
      : Infinity

    // A direct main-road spur that is already short and river-safe is ideal.
    if (
      currentAnchor &&
      (currentAnchor.kind === 'route' ||
        currentAnchor.kind === 'entry' ||
        currentAnchor.kind === 'exit') &&
      currentLength <= 30 &&
      segmentIsSafe(currentAnchor, landmark, .35) &&
      clearOfMainRoad(landmark, landmark.x, landmark.z)
    ) {
      landmark.parentId = currentAnchor.id
      continue
    }

    const direct = [...routeNodes]
      .map((anchor) => ({
        anchor,
        distance: Math.hypot(landmark.x - anchor.x, landmark.z - anchor.z),
      }))
      .filter(({ anchor, distance }) =>
        distance <= 30 &&
        riverOccupancySample(mask, anchor.x, anchor.z).signedDistance >= pathClearance + .35 &&
        segmentIsSafe(anchor, landmark, .35) &&
        clearOfMainRoad(landmark, landmark.x, landmark.z)
      )
      .sort((a, b) => a.distance - b.distance)[0]

    if (direct) {
      rewire(connection, landmark, direct.anchor)
      continue
    }

    // No clean direct spur from the current POI position. Keep the landmark in
    // the same local area where possible, but move it beside the nearest safe
    // main-road chunk rather than leaving it stranded across the river.
    const original = { x: landmark.x, z: landmark.z }
    const routeCandidates = [...routeNodes]
      .sort((a, b) =>
        Math.hypot(a.x - original.x, a.z - original.z) -
        Math.hypot(b.x - original.x, b.z - original.z)
      )
      .slice(0, 8)

    let best:
      | {
          anchor: GeneratedRegionNode
          x: number
          z: number
          score: number
        }
      | undefined

    for (const anchor of routeCandidates) {
      const incident = mainSegments.filter(
        (segment) =>
          segment.from.id === anchor.id || segment.to.id === anchor.id,
      )
      let tangent = { x: 1, z: 0 }
      if (incident.length >= 2) {
        const a = incident[0].from.id === anchor.id
          ? incident[0].to
          : incident[0].from
        const b = incident[incident.length - 1].from.id === anchor.id
          ? incident[incident.length - 1].to
          : incident[incident.length - 1].from
        tangent = normalized2(b.x - a.x, b.z - a.z)
      } else if (incident.length === 1) {
        const other = incident[0].from.id === anchor.id
          ? incident[0].to
          : incident[0].from
        tangent = normalized2(other.x - anchor.x, other.z - anchor.z)
      }
      const normal = { x: -tangent.z, z: tangent.x }
      const originalOffset = {
        x: original.x - anchor.x,
        z: original.z - anchor.z,
      }
      const sideDot = originalOffset.x * normal.x + originalOffset.z * normal.z
      const preferredSide = Math.abs(sideDot) > .01
        ? Math.sign(sideDot)
        : (hashSeed(`poi-road-side:${landmark.id}:${anchor.id}`) % 2 === 0 ? 1 : -1)
      const sides = [preferredSide, -preferredSide]
      const baseRadius = clamp(
        Math.max(
          poiRoadClearance(landmark) + .8,
          poiApproachDistance(landmark.poiType ?? 'ruins') + 3,
        ),
        11.5,
        20,
      )

      for (const side of sides) {
        for (const radiusScale of [1, 1.14, 1.3]) {
          const radius = baseRadius * radiusScale
          for (const along of [0, 2.4, -2.4, 4.5, -4.5]) {
            const x =
              anchor.x +
              normal.x * side * radius +
              tangent.x * along
            const z =
              anchor.z +
              normal.z * side * radius +
              tangent.z * along

            if (
              x <= bounds.minX + landmark.radius ||
              x >= bounds.maxX - landmark.radius ||
              z <= bounds.minZ + landmark.radius ||
              z >= bounds.maxZ - landmark.radius
            ) continue

            const river = riverOccupancySample(mask, x, z)
            if (river.signedDistance < landmark.radius + 1.8) continue
            if (!hasLandmarkSpace(landmark, x, z)) continue
            if (!clearOfMainRoad(landmark, x, z)) continue
            if (!segmentIsSafe(anchor, { x, z }, .5)) continue

            const moveDistance = Math.hypot(x - original.x, z - original.z)
            const accessDistance = Math.hypot(x - anchor.x, z - anchor.z)
            const sidePenalty = side === preferredSide ? 0 : 3
            const score =
              moveDistance +
              accessDistance * .14 +
              Math.abs(radiusScale - 1) * 3 +
              Math.abs(along) * .08 +
              sidePenalty

            if (!best || score < best.score) {
              best = { anchor, x, z, score }
            }
          }
        }
      }
    }

    if (best) {
      landmark.x = round(best.x, 3)
      landmark.z = round(best.z, 3)
      rewire(connection, landmark, best.anchor)
    }
  }
}

function pruneOrphanBranchTopology(
  nodes: GeneratedRegionNode[],
  connections: GeneratedRegionConnection[],
) {
  let changed = true

  while (changed) {
    changed = false
    const protectedParents = new Set(
      nodes
        .filter((node) =>
          node.parentId &&
          (node.kind === 'landmark' || node.kind === 'encounter')
        )
        .map((node) => node.parentId!),
    )

    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]
      if (node.kind !== 'branch' || protectedParents.has(node.id)) continue

      const incident = connections.filter(
        (connection) => connection.from === node.id || connection.to === node.id,
      )
      const touchesLandmark = incident.some((connection) => {
        const otherId = connection.from === node.id ? connection.to : connection.from
        return nodes.find((candidate) => candidate.id === otherId)?.kind === 'landmark'
      })
      if (touchesLandmark || incident.length > 1) continue

      nodes.splice(index, 1)
      for (let connectionIndex = connections.length - 1; connectionIndex >= 0; connectionIndex -= 1) {
        const connection = connections[connectionIndex]
        if (connection.from === node.id || connection.to === node.id) {
          connections.splice(connectionIndex, 1)
        }
      }
      changed = true
    }
  }
}

function pruneBadLoopConnections(
  nodes: GeneratedRegionNode[],
  connections: GeneratedRegionConnection[],
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const mainConnections = connections.filter((connection) => connection.kind === 'main')
  const rejected = new Set<string>()

  for (const connection of connections) {
    if (!connection.id.startsWith('loop-')) continue
    const from = nodeMap.get(connection.from)
    const to = nodeMap.get(connection.to)
    if (!from || !to) {
      rejected.add(connection.id)
      continue
    }

    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 8) {
      rejected.add(connection.id)
      continue
    }

    let bad = false
    for (const main of mainConnections) {
      if (
        main.from === connection.from ||
        main.to === connection.from ||
        main.from === connection.to ||
        main.to === connection.to
      ) continue

      const a = nodeMap.get(main.from)
      const b = nodeMap.get(main.to)
      if (!a || !b) continue
      const hit = segmentIntersection(from, to, a, b)
      if (hit) {
        bad = true
        break
      }

      const mainDirection = normalized2(b.x - a.x, b.z - a.z)
      const loopDirection = normalized2(dx, dz)
      const cross = Math.abs(
        mainDirection.x * loopDirection.z -
        mainDirection.z * loopDirection.x,
      )
      if (cross >= .32) continue

      let closeSamples = 0
      for (const t of [.25, .5, .75]) {
        const x = lerp(from.x, to.x, t)
        const z = lerp(from.z, to.z, t)
        if (distanceToSegment(x, z, a, b) < 3.6) closeSamples += 1
      }
      if (closeSamples >= 2) {
        bad = true
        break
      }
    }

    if (!bad) {
      const routeEndpoint =
        from.kind === 'route' ? from :
          to.kind === 'route' ? to :
            undefined
      if (routeEndpoint && length > 15) {
        const incoming = normalized2(
          (routeEndpoint === from ? to.x - from.x : from.x - to.x),
          (routeEndpoint === from ? to.z - from.z : from.z - to.z),
        )
        const mainNeighbors = mainConnections.flatMap((main) => {
          if (main.from === routeEndpoint.id) {
            const neighbor = nodeMap.get(main.to)
            return neighbor ? [neighbor] : []
          }
          if (main.to === routeEndpoint.id) {
            const neighbor = nodeMap.get(main.from)
            return neighbor ? [neighbor] : []
          }
          return []
        })

        if (mainNeighbors.length) {
          const axis = normalized2(
            mainNeighbors[mainNeighbors.length - 1].x - mainNeighbors[0].x,
            mainNeighbors[mainNeighbors.length - 1].z - mainNeighbors[0].z,
          )
          const cross = Math.abs(axis.x * incoming.z - axis.z * incoming.x)
          if (cross < .3) bad = true
        }
      }
    }

    if (bad) rejected.add(connection.id)
  }

  for (let index = connections.length - 1; index >= 0; index -= 1) {
    if (rejected.has(connections[index].id)) connections.splice(index, 1)
  }
}

function reanchorBranchesAwayFromCrossings(
  nodes: GeneratedRegionNode[],
  connections: GeneratedRegionConnection[],
  crossings: GeneratedWorldCrossing[],
) {
  if (!crossings.length) return false

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const mainConnections = connections.filter((connection) => connection.kind === 'main')
  const mainNeighbors = new Map<string, Set<string>>()
  const branchLoad = new Map<string, number>()

  for (const connection of mainConnections) {
    const from = mainNeighbors.get(connection.from) ?? new Set<string>()
    const to = mainNeighbors.get(connection.to) ?? new Set<string>()
    from.add(connection.to)
    to.add(connection.from)
    mainNeighbors.set(connection.from, from)
    mainNeighbors.set(connection.to, to)
  }

  for (const connection of connections) {
    if (connection.kind !== 'branch') continue
    for (const nodeId of [connection.from, connection.to]) {
      const node = nodeMap.get(nodeId)
      if (node?.kind === 'route') {
        branchLoad.set(node.id, (branchLoad.get(node.id) ?? 0) + 1)
      }
    }
  }

  let changed = false
  for (const connection of connections) {
    if (connection.kind !== 'branch') continue
    if (!/^branch-link-\d+-1$/.test(connection.id)) continue
    if (crossings.some((crossing) => crossing.pathId === connection.id)) continue

    const from = nodeMap.get(connection.from)
    const to = nodeMap.get(connection.to)
    if (!from || !to) continue

    const anchor =
      from.kind === 'route' ? from :
        to.kind === 'route' ? to :
          undefined
    if (!anchor) continue

    const nearestCrossing = [...crossings].sort((a, b) =>
      Math.hypot(anchor.x - a.x, anchor.z - a.z) -
      Math.hypot(anchor.x - b.x, anchor.z - b.z)
    )[0]
    if (!nearestCrossing) continue
    const crossingDistance = Math.hypot(
      anchor.x - nearestCrossing.x,
      anchor.z - nearestCrossing.z,
    )
    if (crossingDistance >= 12) continue

    const other = anchor === from ? to : from
    if (other.kind !== 'branch') continue

    // Bridge avoidance may only slide the root to an immediately neighboring
    // main-road node. Never jump across two route chunks and never touch POI links.
    const candidateIds = new Set<string>(mainNeighbors.get(anchor.id) ?? [])
    const currentLength = Math.hypot(other.x - anchor.x, other.z - anchor.z)
    const candidates = [...candidateIds]
      .map((id) => nodeMap.get(id))
      .filter((candidate): candidate is GeneratedRegionNode =>
        Boolean(candidate) &&
        (candidate!.kind === 'route' ||
          candidate!.kind === 'entry' ||
          candidate!.kind === 'exit')
      )
      .filter((candidate) => {
        const minCrossingDistance = Math.min(
          ...crossings.map((crossing) =>
            Math.hypot(candidate.x - crossing.x, candidate.z - crossing.z)
          ),
        )
        const length = Math.hypot(other.x - candidate.x, other.z - candidate.z)
        return (
          minCrossingDistance >= 13 &&
          length <= Math.min(22, currentLength * 1.22 + 5)
        )
      })
      .sort((a, b) => {
        const aScore =
          Math.hypot(other.x - a.x, other.z - a.z) +
          (branchLoad.get(a.id) ?? 0) * 7
        const bScore =
          Math.hypot(other.x - b.x, other.z - b.z) +
          (branchLoad.get(b.id) ?? 0) * 7
        return aScore - bScore
      })

    const candidate = candidates[0]
    if (!candidate) continue

    if (connection.from === anchor.id) connection.from = candidate.id
    else connection.to = candidate.id
    if (other.parentId === anchor.id) other.parentId = candidate.id

    branchLoad.set(anchor.id, Math.max(0, (branchLoad.get(anchor.id) ?? 1) - 1))
    branchLoad.set(candidate.id, (branchLoad.get(candidate.id) ?? 0) + 1)
    changed = true
  }

  return changed
}

function separatePoisFromRenderedMainRoad(
  nodes: GeneratedRegionNode[],
  paths: GeneratedWorldPath[],
  mask: RiverOccupancyMask,
  bounds: GeneratedRegion['bounds'],
) {
  const mainPaths = paths.filter((path) => path.kind === 'main')
  const landmarks = nodes.filter((node) => node.kind === 'landmark')
  if (!mainPaths.length || !landmarks.length) return false

  const pathDistanceAt = (x: number, z: number) =>
    nearestPathSample(mainPaths, x, z)
  let changed = false

  for (const landmark of landmarks) {
    const nearest = pathDistanceAt(landmark.x, landmark.z)
    if (!nearest) continue

    const required =
      landmark.radius +
      pathFootprintHalfWidth(nearest.width) +
      1.8
    if (nearest.distance >= required) continue

    const original = { x: landmark.x, z: landmark.z }
    let preferredAngle = Math.atan2(
      landmark.z - nearest.z,
      landmark.x - nearest.x,
    )
    if (nearest.distance < .01) {
      preferredAngle =
        (hashSeed(`rendered-road-poi:${landmark.id}`) % 6283) / 1000
    }

    let best:
      | { x: number; z: number; score: number }
      | undefined

    for (const radiusScale of [1, 1.12, 1.26]) {
      const radius = (required + .9) * radiusScale
      for (const offset of [
        0,
        .22, -.22,
        .45, -.45,
        .72, -.72,
        1.02, -1.02,
        1.35, -1.35,
        Math.PI,
      ]) {
        const angle = preferredAngle + offset
        const x = nearest.x + Math.cos(angle) * radius
        const z = nearest.z + Math.sin(angle) * radius

        if (
          x <= bounds.minX + landmark.radius ||
          x >= bounds.maxX - landmark.radius ||
          z <= bounds.minZ + landmark.radius ||
          z >= bounds.maxZ - landmark.radius
        ) continue

        const river = riverOccupancySample(mask, x, z)
        if (river.signedDistance < landmark.radius + 1.8) continue

        let overlaps = false
        for (const other of landmarks) {
          if (other.id === landmark.id) continue
          if (
            Math.hypot(x - other.x, z - other.z) <
            landmark.radius + other.radius + 2.2
          ) {
            overlaps = true
            break
          }
        }
        if (overlaps) continue

        const road = pathDistanceAt(x, z)
        if (!road) continue
        const candidateRequired =
          landmark.radius +
          pathFootprintHalfWidth(road.width) +
          1.8
        if (road.distance < candidateRequired) continue

        // Do not move a POI through the river just to gain road clearance.
        const moveLength = Math.hypot(x - original.x, z - original.z)
        const steps = Math.max(2, Math.ceil(moveLength / .6))
        let crossesRiver = false
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps
          const sample = riverOccupancySample(
            mask,
            lerp(original.x, x, t),
            lerp(original.z, z, t),
          )
          if (sample.signedDistance < landmark.radius + .5) {
            crossesRiver = true
            break
          }
        }
        if (crossesRiver) continue

        const score =
          Math.hypot(x - original.x, z - original.z) +
          Math.abs(radiusScale - 1) * 2 +
          Math.abs(offset) * .35
        if (!best || score < best.score) best = { x, z, score }
      }
    }

    if (best) {
      landmark.x = round(best.x, 3)
      landmark.z = round(best.z, 3)
      changed = true
    }
  }

  return changed
}

function filterBankLocalSideTrails(
  paths: GeneratedWorldPath[],
  mask: RiverOccupancyMask,
) {
  if (mask.points.length < 2) return paths

  const mainPaths = paths.filter((path) => path.kind === 'main')
  const reachable = new Set<string>()
  for (const path of mainPaths) {
    reachable.add(path.fromNodeId)
    reachable.add(path.toNodeId)
  }

  const safeBranches = paths.filter((path) => {
    if (path.kind !== 'branch') return false

    // Generated side trails and POI approaches must remain comfortably outside
    // the rendered river/bank footprint. There is no crossing exception here.
    for (const point of pathClearanceSamples(path, .48)) {
      const river = riverOccupancySample(mask, point.x, point.z)
      const required = pathFootprintHalfWidth(point.width) + .72
      if (river.signedDistance < required) return false
    }

    return true
  })

  const kept = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const path of safeBranches) {
      if (kept.has(path.id)) continue
      const fromReachable = reachable.has(path.fromNodeId)
      const toReachable = reachable.has(path.toNodeId)
      if (!fromReachable && !toReachable) continue

      kept.add(path.id)
      reachable.add(path.fromNodeId)
      reachable.add(path.toNodeId)
      changed = true
    }
  }

  return paths.filter((path) =>
    path.kind === 'main' || kept.has(path.id)
  )
}

function pathFootprintHalfWidth(width: number) {
  // The rendered road ribbon permits a miter up to 1.16x its nominal half-width.
  // Use that same upper bound for generation/validation so the full visible road
  // footprint, not just its centerline, stays outside the river corridor.
  return Math.max(.04, width * .5) * 1.16
}

function pathClearanceSamples(path: GeneratedWorldPath, maxSpacing = .72) {
  const samples: Array<{
    x: number
    z: number
    width: number
    pointIndex?: number
    segmentIndex?: number
    t?: number
  }> = []

  for (let index = 0; index < path.points.length; index += 1) {
    const point = path.points[index]
    samples.push({
      x: point.x,
      z: point.z,
      width: path.widths[Math.min(index, path.widths.length - 1)] ?? path.width,
      pointIndex: index,
    })

    if (index === 0) continue
    const previous = path.points[index - 1]
    const previousWidth = path.widths[Math.min(index - 1, path.widths.length - 1)] ?? path.width
    const currentWidth = path.widths[Math.min(index, path.widths.length - 1)] ?? path.width
    const length = Math.hypot(point.x - previous.x, point.z - previous.z)
    const steps = Math.max(2, Math.ceil(length / Math.max(.2, maxSpacing)))

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps
      samples.push({
        x: lerp(previous.x, point.x, t),
        z: lerp(previous.z, point.z, t),
        width: lerp(previousWidth, currentWidth, t),
        segmentIndex: index,
        t,
      })
    }
  }

  return samples
}

function crossingAllowsRiverOccupancy(
  x: number,
  z: number,
  crossings: GeneratedWorldCrossing[],
  sampleRadius: number,
  pathHalfWidth = 0,
) {
  return crossings.some((crossing) => {
    const dx = x - crossing.x
    const dz = z - crossing.z
    const directionX = Math.cos(crossing.rotation)
    const directionZ = Math.sin(crossing.rotation)
    const along = Math.abs(dx * directionX + dz * directionZ)
    const across = Math.abs(-dx * directionZ + dz * directionX)

    // Treat a crossing as an oriented bridge/ford plus approach envelope rather
    // than a large circle. This allows the aligned approach geometry to enter the
    // river corridor while preventing nearby parallel roads from being exempted.
    const approachHalfLength =
      sampleRadius +
      Math.max(6.4, crossing.width * 1.85) +
      pathHalfWidth * .3
    const approachHalfWidth = Math.max(
      crossing.width * .72,
      pathHalfWidth + .7,
    )

    if (along <= approachHalfLength && across <= approachHalfWidth) return true

    // Small rounded corners avoid a hard rectangular cutoff where a shaped
    // approach transitions back into the ordinary path.
    const beyondAlong = Math.max(0, along - approachHalfLength)
    const beyondAcross = Math.max(0, across - approachHalfWidth)
    return Math.hypot(beyondAlong, beyondAcross) <= 1.15
  })
}

function enforcePathsOutsideRiverMask(
  paths: GeneratedWorldPath[],
  mask: RiverOccupancyMask,
  crossings: GeneratedWorldCrossing[],
  bounds: GeneratedRegion['bounds'],
) {
  if (mask.points.length < 2) return

  const clampPathPoint = (point: GeneratedWorldPoint) => {
    point.x = clamp(point.x, bounds.minX + .5, bounds.maxX - .5)
    point.z = clamp(point.z, bounds.minZ + .5, bounds.maxZ - .5)
  }

  const pushPointOutside = (
    path: GeneratedWorldPath,
    point: GeneratedWorldPoint,
    pathWidth: number,
    key: string,
  ) => {
    const sample = riverOccupancySample(mask, point.x, point.z)
    const footprintHalfWidth = pathFootprintHalfWidth(pathWidth)
    const requiredClearance = footprintHalfWidth + .5

    if (sample.signedDistance >= requiredClearance) return false
    if (crossingAllowsRiverOccupancy(
      point.x,
      point.z,
      crossings,
      sample.radius,
      footprintHalfWidth,
    )) return false

    let dx = point.x - sample.x
    let dz = point.z - sample.z
    let length = Math.hypot(dx, dz)
    if (length < .001) {
      const sign = hashSeed(`river-path-side:${path.id}:${key}`) % 2 === 0 ? 1 : -1
      dx = -sample.tangentZ * sign
      dz = sample.tangentX * sign
      length = 1
    }

    const targetDistance = sample.radius + requiredClearance + .1
    point.x = sample.x + dx / length * targetDistance
    point.z = sample.z + dz / length * targetDistance
    clampPathPoint(point)
    return true
  }

  // Work on the same conservative footprint used by validation. Segment probes
  // are spaced by distance rather than fixed quarters, and corrections account
  // for how much each movable endpoint actually influences that probe.
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false

    for (const path of paths) {
      for (let index = 1; index < path.points.length - 1; index += 1) {
        if (pushPointOutside(
          path,
          path.points[index],
          path.widths[index] ?? path.width,
          `vertex:${index}`,
        )) {
          changed = true
        }
      }

      for (let index = 1; index < path.points.length; index += 1) {
        const previous = path.points[index - 1]
        const current = path.points[index]
        const previousWidth = path.widths[index - 1] ?? path.width
        const currentWidth = path.widths[index] ?? path.width
        const segmentLength = Math.hypot(current.x - previous.x, current.z - previous.z)
        const steps = Math.max(2, Math.ceil(segmentLength / .72))

        for (let step = 1; step < steps; step += 1) {
          const t = step / steps
          const probe = {
            x: lerp(previous.x, current.x, t),
            z: lerp(previous.z, current.z, t),
          }
          const width = lerp(previousWidth, currentWidth, t)
          const footprintHalfWidth = pathFootprintHalfWidth(width)
          const sample = riverOccupancySample(mask, probe.x, probe.z)
          const requiredClearance = footprintHalfWidth + .5

          if (sample.signedDistance >= requiredClearance) continue
          if (crossingAllowsRiverOccupancy(
            probe.x,
            probe.z,
            crossings,
            sample.radius,
            footprintHalfWidth,
          )) continue

          let dx = probe.x - sample.x
          let dz = probe.z - sample.z
          let length = Math.hypot(dx, dz)
          if (length < .001) {
            const sign = hashSeed(`river-path-segment:${path.id}:${index}:${step}`) % 2 === 0 ? 1 : -1
            dx = -sample.tangentZ * sign
            dz = sample.tangentX * sign
            length = 1
          }

          const previousMovable = index - 1 > 0
          const currentMovable = index < path.points.length - 1
          const influence =
            (previousMovable ? 1 - t : 0) +
            (currentMovable ? t : 0)
          if (influence <= .001) continue

          const deficit = sample.radius + requiredClearance + .12 - sample.distance
          const nx = dx / length
          const nz = dz / length
          // If only one endpoint can move, compensate for its interpolation
          // weight. Example: at t=.25 the current endpoint contributes only 25%
          // of the probe position, so it must move ~4x farther to clear it.
          const shift = Math.min(10, deficit * 1.08 / influence)

          if (previousMovable) {
            previous.x += nx * shift
            previous.z += nz * shift
            clampPathPoint(previous)
          }
          if (currentMovable) {
            current.x += nx * shift
            current.z += nz * shift
            clampPathPoint(current)
          }
          changed = true
        }
      }
    }

    if (!changed) break
  }
}

function findResidualRiverPathViolation(
  path: GeneratedWorldPath,
  mask: RiverOccupancyMask,
  crossings: GeneratedWorldCrossing[],
) {
  for (const point of pathClearanceSamples(path, .42)) {
    const river = riverOccupancySample(mask, point.x, point.z)
    const footprintHalfWidth = pathFootprintHalfWidth(point.width)
    const required = footprintHalfWidth + .34
    if (river.signedDistance >= required) continue
    if (crossingAllowsRiverOccupancy(
      point.x,
      point.z,
      crossings,
      river.radius,
      footprintHalfWidth,
    )) continue

    return {
      point,
      river,
      footprintHalfWidth,
    }
  }

  return undefined
}

function repairResidualRiverPathIncursions(
  paths: GeneratedWorldPath[],
  mask: RiverOccupancyMask,
  crossings: GeneratedWorldCrossing[],
  bounds: GeneratedRegion['bounds'],
) {
  if (mask.points.length < 2) return

  const clampDetour = (point: GeneratedWorldPoint) => ({
    x: clamp(point.x, bounds.minX + .6, bounds.maxX - .6),
    z: clamp(point.z, bounds.minZ + .6, bounds.maxZ - .6),
  })

  // The iterative solver handles almost every case. Remaining failures are
  // usually tangential branch segments whose endpoints are both legal but whose
  // straight chord still cuts the curved river corridor. Insert a local detour
  // control point on the same bank, then let the normal solver relax it.
  for (let repairPass = 0; repairPass < 12; repairPass += 1) {
    let inserted = false

    for (const path of paths) {
      const violation = findResidualRiverPathViolation(path, mask, crossings)
      if (!violation) continue

      const segmentIndex = violation.point.segmentIndex
      const pointIndex = violation.point.pointIndex
      const width = violation.point.width
      const river = violation.river
      let dx = violation.point.x - river.x
      let dz = violation.point.z - river.z
      let length = Math.hypot(dx, dz)

      if (length < .001) {
        const sign = hashSeed(
          `river-detour:${path.id}:${segmentIndex ?? pointIndex ?? 0}:${repairPass}`,
        ) % 2 === 0 ? 1 : -1
        dx = -river.tangentZ * sign
        dz = river.tangentX * sign
        length = 1
      }

      const targetDistance =
        river.radius +
        pathFootprintHalfWidth(width) +
        .92
      const detour = clampDetour({
        x: river.x + dx / length * targetDistance,
        z: river.z + dz / length * targetDistance,
      })

      if (
        pointIndex !== undefined &&
        pointIndex > 0 &&
        pointIndex < path.points.length - 1
      ) {
        path.points[pointIndex] = detour
        inserted = true
        continue
      }

      if (segmentIndex === undefined || segmentIndex <= 0) continue

      path.points.splice(segmentIndex, 0, detour)
      path.widths.splice(
        segmentIndex,
        0,
        round(Math.min(width, path.width * 1.02), 3),
      )
      inserted = true
    }

    if (!inserted) break
    enforcePathsOutsideRiverMask(paths, mask, crossings, bounds)
  }

  // Rare fallback: if a long/tangential path still has an incursion after
  // local detours, densify that path and project every non-crossing sample onto
  // the safe bank. This runs before terrain/validation, so an invalid path is
  // repaired in generation rather than merely reported by the viewport.
  for (const path of paths) {
    if (!findResidualRiverPathViolation(path, mask, crossings)) continue

    const nextPoints: GeneratedWorldPoint[] = []
    const nextWidths: number[] = []

    for (let segmentIndex = 1; segmentIndex < path.points.length; segmentIndex += 1) {
      const a = path.points[segmentIndex - 1]
      const b = path.points[segmentIndex]
      const aWidth = path.widths[segmentIndex - 1] ?? path.width
      const bWidth = path.widths[segmentIndex] ?? path.width
      const segmentLength = Math.hypot(b.x - a.x, b.z - a.z)
      const steps = Math.max(2, Math.ceil(segmentLength / .42))

      for (let step = 0; step <= steps; step += 1) {
        if (segmentIndex > 1 && step === 0) continue
        const t = step / steps
        const width = lerp(aWidth, bWidth, t)
        let point = {
          x: lerp(a.x, b.x, t),
          z: lerp(a.z, b.z, t),
        }
        const river = riverOccupancySample(mask, point.x, point.z)
        const footprintHalfWidth = pathFootprintHalfWidth(width)
        const required = footprintHalfWidth + .62
        const isFixedEndpoint =
          (segmentIndex === 1 && step === 0) ||
          (segmentIndex === path.points.length - 1 && step === steps)

        if (
          !isFixedEndpoint &&
          river.signedDistance < required &&
          !crossingAllowsRiverOccupancy(
            point.x,
            point.z,
            crossings,
            river.radius,
            footprintHalfWidth,
          )
        ) {
          let dx = point.x - river.x
          let dz = point.z - river.z
          let length = Math.hypot(dx, dz)
          if (length < .001) {
            const sign = hashSeed(
              `river-dense-side:${path.id}:${segmentIndex}:${step}`,
            ) % 2 === 0 ? 1 : -1
            dx = -river.tangentZ * sign
            dz = river.tangentX * sign
            length = 1
          }
          const targetDistance = river.radius + required + .22
          point = clampDetour({
            x: river.x + dx / length * targetDistance,
            z: river.z + dz / length * targetDistance,
          })
        }

        nextPoints.push(point)
        nextWidths.push(round(width, 3))
      }
    }

    path.points = nextPoints
    path.widths = nextWidths
  }

  // Finish with the ordinary footprint solver so any newly inserted/densified
  // points and their neighboring chords satisfy the same contract as validation.
  enforcePathsOutsideRiverMask(paths, mask, crossings, bounds)
}

function buildWorldPaths(nodes: GeneratedRegionNode[], connections: GeneratedRegionConnection[], seed: number) {
  return connections.flatMap((link) => {
    const from = nodes.find((node) => node.id === link.from)
    const to = nodes.find((node) => node.id === link.to)
    if (!from || !to) return []
    const random = seededRandom(hashSeed(`${seed}:${link.id}`))
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.max(.001, Math.hypot(dx, dz))
    const nx = -dz / length
    const nz = dx / length
    const bend = (random() - .5) * Math.min(link.kind === 'main' ? 7.5 : 3.1, length * (link.kind === 'main' ? .22 : .15))
    const secondBend = (random() - .5) * Math.min(link.kind === 'main' ? 3.2 : 1.25, length * (link.kind === 'main' ? .11 : .065))
    const baseWidth = link.kind === 'main' ? 3.05 : .96
    const points: GeneratedWorldPoint[] = []
    const widths: number[] = []
    const segments = Math.max(10, Math.round(length / 2.35))
    const widthPhase = random() * Math.PI * 2

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments
      const progress = link.kind === 'main' ? smoothstep(t) : t
      const lateral =
        Math.sin(t * Math.PI) * bend +
        Math.sin(t * Math.PI * 2) * secondBend +
        Math.sin(t * Math.PI * 3 + widthPhase) * Math.min(link.kind === 'main' ? .65 : .32, length * .018)
      points.push({
        x: from.x + dx * progress + nx * lateral,
        z: from.z + dz * progress + nz * lateral,
      })
      const junctionBlend = .9 + Math.pow(Math.abs(t - .5) * 2, 2) * .13
      const naturalVariation =
        1 +
        Math.sin(t * Math.PI * 1.35 + widthPhase) * .045 +
        Math.sin(t * Math.PI * .62 + widthPhase * .37) * .025
      widths.push(round(baseWidth * junctionBlend * naturalVariation, 3))
    }

    return [{
      id: link.id,
      kind: link.kind,
      fromNodeId: link.from,
      toNodeId: link.to,
      width: baseWidth,
      points,
      widths,
    } satisfies GeneratedWorldPath]
  })
}

function smoothWorldJunctions(paths: GeneratedWorldPath[], nodes: GeneratedRegionNode[]) {
  for (const path of paths) path.points = smoothPolyline(path.points, 2)

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incident = new Map<string, GeneratedWorldPath[]>()

  for (const path of paths) {
    for (const nodeId of [path.fromNodeId, path.toNodeId]) {
      const list = incident.get(nodeId) ?? []
      list.push(path)
      incident.set(nodeId, list)
    }
  }

  for (const [nodeId, connected] of incident) {
    if (connected.length < 2) continue
    const node = nodeMap.get(nodeId)
    if (!node) continue

    const main = connected.filter((path) => path.kind === 'main')
    const mainAxis =
      main.length >= 2
        ? junctionMainAxis(node, main)
        : connected.length >= 3
          ? junctionMainAxis(node, connected)
          : undefined
    const sharedMainWidth = main.length ? Math.max(...main.map((path) => path.width)) : 0

    for (const path of connected) {
      const atStart = path.fromNodeId === nodeId
      const endpointIndex = atStart ? 0 : path.points.length - 1
      const neighborIndex = atStart ? 1 : path.points.length - 2
      const secondIndex = atStart ? 2 : path.points.length - 3
      const thirdIndex = atStart ? 3 : path.points.length - 4
      const neighbor = path.points[neighborIndex]
      const endpoint = path.points[endpointIndex]
      if (!neighbor || !endpoint) continue

      path.points[endpointIndex] = { x: node.x, z: node.z }

      let away = normalized2(neighbor.x - node.x, neighbor.z - node.z)
      if (path.kind === 'main' && mainAxis) {
        const sign = away.x * mainAxis.x + away.z * mainAxis.z >= 0 ? 1 : -1
        away = { x: mainAxis.x * sign, z: mainAxis.z * sign }
      } else if (mainAxis && path.kind === 'branch') {
        // Pull side trails into the main road on a shallow tangent instead of a sharp wedge.
        const axisSign = away.x * mainAxis.x + away.z * mainAxis.z >= 0 ? 1 : -1
        const alongMain = { x: mainAxis.x * axisSign, z: mainAxis.z * axisSign }
        away = normalized2(
          away.x * .72 + alongMain.x * .28,
          away.z * .72 + alongMain.z * .28,
        )
      }

      const distance1 = Math.max(1.35, Math.hypot(neighbor.x - node.x, neighbor.z - node.z))
      path.points[neighborIndex] = {
        x: node.x + away.x * distance1,
        z: node.z + away.z * distance1,
      }

      const second = path.points[secondIndex]
      if (second) {
        const distance2 = Math.max(distance1 + 1.2, Math.hypot(second.x - node.x, second.z - node.z))
        const originalAway = normalized2(second.x - node.x, second.z - node.z)
        const blended = normalized2(
          away.x * .68 + originalAway.x * .32,
          away.z * .68 + originalAway.z * .32,
        )
        path.points[secondIndex] = {
          x: node.x + blended.x * distance2,
          z: node.z + blended.z * distance2,
        }
      }

      const endpointWidth = path.kind === 'main'
        ? Math.max(path.width, sharedMainWidth)
        : sharedMainWidth > 0
          ? Math.min(path.width * .24, sharedMainWidth * .1)
          : path.width * .62
      path.widths[endpointIndex] = round(endpointWidth, 3)
      if (path.widths[neighborIndex] !== undefined) {
        path.widths[neighborIndex] = round(lerp(endpointWidth, path.width, .38), 3)
      }
      if (path.widths[secondIndex] !== undefined) {
        path.widths[secondIndex] = round(lerp(endpointWidth, path.width, .68), 3)
      }
      if (path.widths[thirdIndex] !== undefined) {
        path.widths[thirdIndex] = round(lerp(endpointWidth, path.width, .9), 3)
      }
    }
  }
}

function junctionMainAxis(node: GeneratedRegionNode, paths: GeneratedWorldPath[]) {
  const directions = paths.map((path) => {
    const atStart = path.fromNodeId === node.id
    const neighbor = path.points[atStart ? 1 : path.points.length - 2]
    return normalized2(neighbor.x - node.x, neighbor.z - node.z)
  })

  let bestA = directions[0]
  let bestB = directions[1]
  let bestDot = 1
  for (let a = 0; a < directions.length; a += 1) {
    for (let b = a + 1; b < directions.length; b += 1) {
      const dot = directions[a].x * directions[b].x + directions[a].z * directions[b].z
      if (dot < bestDot) {
        bestDot = dot
        bestA = directions[a]
        bestB = directions[b]
      }
    }
  }

  return normalized2(bestA.x - bestB.x, bestA.z - bestB.z)
}

function smoothPolyline(points: GeneratedWorldPoint[], passes: number) {
  let current = points.map((point) => ({ ...point }))
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((point) => ({ ...point }))
    for (let index = 1; index < current.length - 1; index += 1) {
      next[index] = {
        x: (current[index - 1].x + current[index].x * 2 + current[index + 1].x) / 4,
        z: (current[index - 1].z + current[index].z * 2 + current[index + 1].z) / 4,
      }
    }
    current = next
  }
  return current
}

function normalized2(x: number, z: number) {
  const length = Math.max(.00001, Math.hypot(x, z))
  return { x: x / length, z: z / length }
}

function buildCrossings(
  paths: GeneratedWorldPath[],
  stream: GeneratedWorldPoint[],
  seed: number,
  settings: ReturnType<typeof worldSettings>,
) {
  if (stream.length < 2) return [] as GeneratedWorldCrossing[]

  type CrossingCandidate = {
    path: GeneratedWorldPath
    pathIndex: number
    streamIndex: number
    hit: GeneratedWorldPoint
    rotation: number
    score: number
  }

  const candidates: CrossingCandidate[] = []
  for (const path of paths) {
    if (path.kind !== 'main') continue
    for (let pathIndex = 1; pathIndex < path.points.length; pathIndex += 1) {
      const a = path.points[pathIndex - 1]
      const b = path.points[pathIndex]
      const roadDir = normalized2(b.x - a.x, b.z - a.z)
      for (let streamIndex = 1; streamIndex < stream.length; streamIndex += 1) {
        const c = stream[streamIndex - 1]
        const d = stream[streamIndex]
        const hit = segmentIntersection(a, b, c, d)
        if (!hit) continue

        const streamDir = normalized2(d.x - c.x, d.z - c.z)
        const perpendicular = Math.abs(roadDir.x * streamDir.z - roadDir.z * streamDir.x)
        const streamT = streamIndex / Math.max(1, stream.length - 1)

        // Entrances/exits must read as river boundaries, not bridge locations.
        // Reserve the first/last 15% of the frozen river as crossing-free space.
        if (streamT < .15 || streamT > .85) continue

        const centerQuality = 1 - Math.abs(streamT - .5) * 2
        candidates.push({
          path,
          pathIndex,
          streamIndex,
          hit,
          rotation: Math.atan2(b.z - a.z, b.x - a.x),
          score:
            8 +
            path.width * .55 +
            perpendicular * 2.8 +
            centerQuality * .65,
        })
      }
    }
  }
  if (!candidates.length) return []

  // Collapse multiple triangle/segment hits at the same physical crossing.
  const representatives: CrossingCandidate[] = []
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (representatives.some((item) => Math.hypot(item.hit.x - candidate.hit.x, item.hit.z - candidate.hit.z) < 8.5)) {
      continue
    }
    representatives.push(candidate)
  }

  const primary = representatives[0]
  const minSpacing = settings.size === 'large' ? 34 : 29
  const distantMain = representatives.find((candidate) =>
    candidate.path.kind === 'main' &&
    candidate !== primary &&
    Math.hypot(candidate.hit.x - primary.hit.x, candidate.hit.z - primary.hit.z) >= minSpacing,
  )
  const allowSecondary =
    settings.size === 'large' ||
    settings.water > .58 ||
    settings.exploration > .84 ||
    Boolean(distantMain)

  const selectedCandidates: CrossingCandidate[] = [primary]
  if (allowSecondary) {
    const secondary = [...representatives]
      .filter((candidate) =>
        candidate !== primary &&
        Math.hypot(candidate.hit.x - primary.hit.x, candidate.hit.z - primary.hit.z) >= minSpacing,
      )
      .sort((a, b) => {
        // A distant main-road crossing wins; otherwise prefer the best perpendicular crossing.
        const aMain = a.path.kind === 'main' ? 2.5 : 0
        const bMain = b.path.kind === 'main' ? 2.5 : 0
        return (b.score + bMain) - (a.score + aMain)
      })[0]
    if (secondary) selectedCandidates.push(secondary)
  }

  const selected: Array<{ crossing: GeneratedWorldCrossing; candidate: CrossingCandidate }> =
    selectedCandidates.map((candidate, index) => {
      const kind: GeneratedWorldCrossing['kind'] = 'bridge'
      return {
        candidate,
        crossing: {
          id: `crossing-${index}`,
          kind,
          x: round(candidate.hit.x, 3),
          z: round(candidate.hit.z, 3),
          rotation: round(candidate.rotation, 4),
          width: round((candidate.path.width || 2) * (kind === 'bridge' ? 1.08 : 1.38), 3),
          pathId: candidate.path.id,
        },
      }
    })

  // Only main-road chunks are candidates here. Side trails are kept on their
  // local bank and never redirected toward a bridge.
  const byPath = new Map<string, CrossingCandidate[]>()
  for (const candidate of candidates) {
    const list = byPath.get(candidate.path.id) ?? []
    list.push(candidate)
    byPath.set(candidate.path.id, list)
  }

  for (const [pathId, pathCandidates] of byPath) {
    const path = pathCandidates[0].path
    const pathSelections = selected.filter(({ candidate }) => candidate.path.id === pathId)
    if (pathSelections.length) {
      const distinctHits: CrossingCandidate[] = []
      for (const candidate of [...pathCandidates].sort((a, b) => b.score - a.score)) {
        if (distinctHits.some((item) => Math.hypot(item.hit.x - candidate.hit.x, item.hit.z - candidate.hit.z) < 8.5)) continue
        distinctHits.push(candidate)
      }

      if (pathSelections.length === 1 && distinctHits.length > 1) {
        reroutePathViaCrossing(path, pathSelections[0].crossing)
      }
      for (const selection of pathSelections) shapePathAtCrossing(path, selection.crossing)
      continue
    }

    const representative = [...pathCandidates].sort((a, b) => b.score - a.score)[0]
    const target = [...selected].sort((a, b) =>
      Math.hypot(a.crossing.x - representative.hit.x, a.crossing.z - representative.hit.z) -
      Math.hypot(b.crossing.x - representative.hit.x, b.crossing.z - representative.hit.z)
    )[0]
    if (!target) continue

    reroutePathViaCrossing(path, target.crossing)
    shapePathAtCrossing(path, target.crossing)
  }

  return selected.map(({ crossing }) => crossing)
}
function shapeLandmarkApproaches(paths: GeneratedWorldPath[], nodes: GeneratedRegionNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  for (const path of paths) {
    const startNode = nodeMap.get(path.fromNodeId)
    const endNode = nodeMap.get(path.toNodeId)
    const endpoint =
      endNode?.kind === 'landmark'
        ? { node: endNode, atStart: false }
        : startNode?.kind === 'landmark'
          ? { node: startNode, atStart: true }
          : undefined
    if (!endpoint || path.points.length < 5) continue

    const endpointIndex = endpoint.atStart ? 0 : path.points.length - 1
    const step = endpoint.atStart ? 1 : -1
    const neighbor = path.points[endpointIndex + step]
    if (!neighbor) continue

    const away = normalized2(neighbor.x - endpoint.node.x, neighbor.z - endpoint.node.z)
    path.points[endpointIndex] = { x: endpoint.node.x, z: endpoint.node.z }

    const distances = [2.2, 4.7, 7.5]
    for (let offset = 1; offset <= 3; offset += 1) {
      const index = endpointIndex + step * offset
      if (index < 0 || index >= path.points.length) continue
      const original = path.points[index]
      const target = {
        x: endpoint.node.x + away.x * distances[offset - 1],
        z: endpoint.node.z + away.z * distances[offset - 1],
      }
      const blend = offset === 1 ? .92 : offset === 2 ? .72 : .42
      path.points[index] = {
        x: lerp(original.x, target.x, blend),
        z: lerp(original.z, target.z, blend),
      }
    }

    // Approach trails taper into the POI instead of ending in a triangular road blob.
    const base = path.width
    path.widths[endpointIndex] = round(base * .78, 3)
    if (path.widths[endpointIndex + step] !== undefined) path.widths[endpointIndex + step] = round(base * .82, 3)
    if (path.widths[endpointIndex + step * 2] !== undefined) path.widths[endpointIndex + step * 2] = round(base * .9, 3)
  }
}

function reroutePathViaCrossing(path: GeneratedWorldPath, crossing: GeneratedWorldCrossing) {
  if (path.points.length < 6) return
  const start = path.points[0]
  const end = path.points[path.points.length - 1]
  const firstLength = Math.hypot(crossing.x - start.x, crossing.z - start.z)
  const secondLength = Math.hypot(end.x - crossing.x, end.z - crossing.z)
  const totalLength = Math.max(.001, firstLength + secondLength)
  const count = path.points.length
  const pivot = clamp(Math.round((firstLength / totalLength) * (count - 1)), 2, count - 3)

  const next: GeneratedWorldPoint[] = []
  for (let index = 0; index < count; index += 1) {
    if (index <= pivot) {
      const t = index / Math.max(1, pivot)
      const eased = smoothstep(t)
      next.push({
        x: lerp(start.x, crossing.x, eased),
        z: lerp(start.z, crossing.z, eased),
      })
    } else {
      const t = (index - pivot) / Math.max(1, count - 1 - pivot)
      const eased = smoothstep(t)
      next.push({
        x: lerp(crossing.x, end.x, eased),
        z: lerp(crossing.z, end.z, eased),
      })
    }
  }
  next[pivot] = { x: crossing.x, z: crossing.z }
  path.points = smoothPolyline(next, 1)
}

function shapePathAtCrossing(path: GeneratedWorldPath, crossing: GeneratedWorldCrossing) {
  if (path.points.length < 5) return
  let pivot = 0
  let bestDistance = Infinity
  for (let index = 0; index < path.points.length; index += 1) {
    const distance = Math.hypot(path.points[index].x - crossing.x, path.points[index].z - crossing.z)
    if (distance < bestDistance) {
      bestDistance = distance
      pivot = index
    }
  }

  const prev = path.points[Math.max(0, pivot - 1)]
  const next = path.points[Math.min(path.points.length - 1, pivot + 1)]
  let direction = normalized2(Math.cos(crossing.rotation), Math.sin(crossing.rotation))
  const travel = normalized2(next.x - prev.x, next.z - prev.z)
  if (direction.x * travel.x + direction.z * travel.z < 0) {
    direction = { x: -direction.x, z: -direction.z }
  }

  path.points[pivot] = { x: crossing.x, z: crossing.z }
  for (const [offset, distance] of [
    [-3, 7.15],
    [-2, 4.85],
    [-1, 2.45],
    [1, 2.45],
    [2, 4.85],
    [3, 7.15],
  ] as const) {
    const index = pivot + offset
    if (index <= 0 || index >= path.points.length - 1) continue
    const sign = offset < 0 ? -1 : 1
    path.points[index] = {
      x: crossing.x + direction.x * distance * sign,
      z: crossing.z + direction.z * distance * sign,
    }
    if (path.widths[index] !== undefined) {
      const distanceFromBridge = Math.abs(offset)
      const widthScale =
        distanceFromBridge === 1 ? .94 :
          distanceFromBridge === 2 ? .9 :
            .94
      path.widths[index] = round(path.width * widthScale, 3)
    }
  }
  if (path.widths[pivot] !== undefined) path.widths[pivot] = round(path.width * .95, 3)
}


function buildTerrainFoundation(
  region: ForgeRegionDefinition,
  bounds: GeneratedRegion['bounds'],
  seed: number,
): TerrainFoundation {
  const settings = worldSettings(region)
  const resolution =
    settings.size === 'large' ? 91 :
      settings.size === 'small' ? 65 :
        81
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const heights: number[] = []
  const amplitude = (.55 + settings.elevation * 4.7) * (.68 + settings.verticality * .64)

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * depth
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * width
      const n0 = valueNoise2D(x * .011 - 8.6, z * .011 + 14.2, seed ^ 0x27D4EB2D)
      const n1 = valueNoise2D(x * .026, z * .026, seed)
      const n2 = valueNoise2D(x * .061 + 17.2, z * .061 - 9.4, seed ^ 0x9E3779B9)
      const n3 = valueNoise2D(x * .13 - 31.8, z * .13 + 11.7, seed ^ 0x85EBCA6B)
      const valley = valueNoise2D(x * .0075 + 23.1, z * .0075 - 17.4, seed ^ 0xB5297A4D)
      let height = (
        (n0 - .5) * .86 +
        (n1 - .5) * 1.5 +
        (n2 - .5) * .58 +
        (n3 - .5) * .18 +
        (valley - .5) * .52
      ) * amplitude

      if (settings.cliffs > .08) {
        const ridge = Math.abs(
          valueNoise2D(x * .035 + 41, z * .035 - 23, seed ^ 0xC2B2AE35) - .5,
        ) * 2
        if (ridge > .68) height += (ridge - .68) * 5.5 * settings.cliffs
      }
      heights.push(round(height, 4))
    }
  }

  return { resolution, width, depth, heights }
}

function buildFrozenHydrology(
  foundation: TerrainFoundation,
  bounds: GeneratedRegion['bounds'],
  seed: number,
  water: number,
): FrozenHydrology {
  if (water <= .08) return { points: [], widths: [], heights: [] }
  return solveHydrology(
    bounds,
    foundation.resolution,
    foundation.heights,
    seed,
    water,
  )
}

function applyEnvironmentRelief(
  bounds: GeneratedRegion['bounds'],
  resolution: number,
  heights: number[],
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  riverMask: RiverOccupancyMask,
  seed: number,
  settings: ReturnType<typeof worldSettings>,
  profile: ReturnType<typeof biomeIdentityProfile>,
) {
  const random = seededRandom(hashSeed(`${seed}:environment-relief`))
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const baseFeatureCount =
    settings.size === 'large' ? 7 :
      settings.size === 'small' ? 4 :
        5
  const featureCount = Math.max(
    3,
    Math.round(baseFeatureCount * profile.reliefFeatureScale),
  )

  const features = Array.from({ length: featureCount }, (_, index) => {
    const positive = index % 3 !== 2
    const radius =
      (13 + random() * (settings.size === 'large' ? 17 : 13)) *
      (.92 + profile.reliefFeatureScale * .08)
    const amplitudeBase = (
      .28 +
      settings.elevation * .38 +
      settings.verticality * .48
    ) * profile.reliefScale
    return {
      x: bounds.minX + width * (.1 + random() * .8),
      z: bounds.minZ + depth * (.1 + random() * .8),
      radius,
      amplitude:
        amplitudeBase *
        (.62 + random() * .62) *
        (positive ? 1 : -.58),
      stretch: .68 + random() * .68,
      angle: random() * Math.PI * 2,
      seed: seed ^ hashSeed(`relief:${index}`),
    }
  })

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * depth
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * width
      const pathDistance = distanceToPaths(x, z, paths)
      if (pathDistance < 5.5) continue

      const poiDistance = pois.reduce(
        (best, poi) =>
          Math.min(
            best,
            Math.hypot(x - poi.x, z - poi.z) - poi.radius,
          ),
        Infinity,
      )
      if (poiDistance < 4.5) continue

      const riverClearance = riverMask.points.length > 1
        ? riverOccupancySample(riverMask, x, z).signedDistance
        : Infinity
      if (riverClearance < 5.8) continue

      let offset = 0
      for (const feature of features) {
        const dx = x - feature.x
        const dz = z - feature.z
        const cos = Math.cos(feature.angle)
        const sin = Math.sin(feature.angle)
        const rx = dx * cos - dz * sin
        const rz = dx * sin + dz * cos
        const edgeNoise = valueNoise2D(
          x * .045 + 3.7,
          z * .045 - 8.2,
          feature.seed,
        )
        const localRadius = feature.radius * (.82 + edgeNoise * .28)
        const distance = Math.hypot(
          rx / feature.stretch,
          rz * feature.stretch,
        )
        if (distance >= localRadius) continue

        const normalized = clamp(distance / Math.max(.001, localRadius), 0, 1)
        const dome = 1 - smoothstep(normalized)
        const interior = valueNoise2D(
          x * .085 - 5.1,
          z * .085 + 6.4,
          feature.seed ^ 0x9E3779B9,
        )
        offset +=
          feature.amplitude *
          dome *
          (.76 + interior * .24)
      }

      if (Math.abs(offset) < .005) continue
      const index = zIndex * resolution + xIndex
      heights[index] = round(heights[index] + offset, 4)
    }
  }
}

function buildTerrainFromFrozenHydrology(
  region: ForgeRegionDefinition,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  clearings: GeneratedWorldTerrain['clearings'],
  pois: GeneratedWorldPoi[],
  seed: number,
  foundation: TerrainFoundation,
  hydrology: FrozenHydrology,
  riverMask: RiverOccupancyMask,
): GeneratedWorldTerrain {
  const settings = worldSettings(region)
  const biomeProfile = biomeIdentityProfile(region.biome)
  const { resolution, width, depth } = foundation
  const heights = [...foundation.heights]

  // Carve the already-frozen river. No hydrology solving is allowed after this point.
  if (hydrology.points.length > 1) {
    for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
      const z = bounds.minZ + zIndex / (resolution - 1) * depth
      for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
        const x = bounds.minX + xIndex / (resolution - 1) * width
        const index = zIndex * resolution + xIndex
        const sample = nearestHydrologySample(
          x,
          z,
          hydrology.points,
          hydrology.widths,
          hydrology.heights,
        )
        const bankWidth = sample.width * 2.15 + 2.8
        if (sample.distance >= bankWidth) continue

        const normalized = sample.distance / Math.max(.001, bankWidth)
        const channel = 1 - smoothstep(clamp(normalized, 0, 1))
        const bedTarget = sample.height - .34 + Math.pow(normalized, 1.45) * 1.08
        heights[index] = round(
          Math.min(heights[index], lerp(heights[index], bedTarget, channel * .94)),
          4,
        )
      }
    }
  }

  applyEnvironmentRelief(
    bounds,
    resolution,
    heights,
    paths,
    pois,
    riverMask,
    seed,
    settings,
    biomeProfile,
  )

  // Roads react to the frozen river, never the other way around.
  const preRoadHeights = [...heights]
  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * depth
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * width
      const nearest = nearestPathSample(paths, x, z)
      if (!nearest) continue
      const shoulderNoise = valueNoise2D(
        x * .12 + 7.3,
        z * .12 - 4.6,
        seed ^ 0x68E31DA4,
      )
      const baseCorridor =
        nearest.kind === 'main'
          ? nearest.width * .56 + 1.82
          : nearest.width * .42 + .78
      const corridor = baseCorridor * (.9 + shoulderNoise * .2)
      if (nearest.distance >= corridor) continue

      if (riverMask.points.length > 1) {
        const river = riverOccupancySample(riverMask, x, z)
        if (river.signedDistance < 1.05) continue
      }

      const edgeBreakup = .82 + valueNoise2D(
        x * .21 - 2.1,
        z * .21 + 8.4,
        seed ^ 0xB5297A4D,
      ) * .28
      const junctionTaper = nearest.kind === 'branch'
        ? smoothstep(clamp((nearest.endpointDistance - 1.6) / 5.4, 0, 1))
        : 1
      const influence =
        (1 - smoothstep(clamp(nearest.distance / corridor, 0, 1))) *
        edgeBreakup *
        lerp(.18, 1, junctionTaper)
      const targetHeight = sampleGridHeight(
        bounds,
        resolution,
        preRoadHeights,
        nearest.x,
        nearest.z,
      )
      const index = zIndex * resolution + xIndex
      heights[index] = round(
        lerp(
          heights[index],
          targetHeight,
          influence * (nearest.kind === 'main' ? .6 : .34),
        ),
        4,
      )
    }
  }

  // POIs terrace locally but may not overwrite the frozen river corridor.
  // Warp each terrace edge so landmarks sit in naturally shaped pockets rather
  // than identical circular pads.
  for (const poi of pois) {
    const centerHeight = sampleGridHeight(bounds, resolution, heights, poi.x, poi.z)
    const poiSeed = seed ^ hashSeed(`terrain-poi:${poi.id}`)
    for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
      const z = bounds.minZ + zIndex / (resolution - 1) * depth
      for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
        const x = bounds.minX + xIndex / (resolution - 1) * width
        const distance = Math.hypot(x - poi.x, z - poi.z)
        const terraceScale =
          poi.type === 'settlement' ? .9 :
            poi.type === 'camp' ? .72 :
              poi.type === 'graveyard' || poi.type === 'ruins' ? .6 :
                poi.type === 'watchtower' || poi.type === 'dungeon' ? .56 :
                  poi.type === 'shrine' || poi.type === 'standing-stones' ? .52 :
                    .6
        const terraceRadius = poi.radius * terraceScale
        const edgeNoise = valueNoise2D(
          (x - poi.x) * .14 + 6.1,
          (z - poi.z) * .14 - 3.7,
          poiSeed,
        )
        const irregularRadius = terraceRadius * (.84 + edgeNoise * .28)
        if (distance >= irregularRadius) continue
        const riverClearance = riverMask.points.length > 1
          ? riverOccupancySample(riverMask, x, z).signedDistance
          : Infinity
        if (riverClearance < 1.5) continue
        const normalized = distance / Math.max(.001, irregularRadius)
        const influence =
          (1 - smoothstep(clamp(normalized, 0, 1))) *
          (.82 + edgeNoise * .18)
        const index = zIndex * resolution + xIndex
        heights[index] = round(
          lerp(heights[index], centerHeight, influence * .32),
          4,
        )
      }
    }
  }

  // Final water-footprint safety carve.
  // Water now stays on the smooth frozen hydrology surface instead of being
  // lifted row-by-row above terrain. To guarantee that the rendered terrain
  // can never poke through the water from any camera angle, lower every grid
  // vertex that could belong to a triangle intersecting the visible river.
  if (hydrology.points.length > 1) {
    const cellWidth = width / Math.max(1, resolution - 1)
    const cellDepth = depth / Math.max(1, resolution - 1)
    const trianglePadding = Math.hypot(cellWidth, cellDepth) * 1.08
    const bedClearance = .18

    for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
      const z = bounds.minZ + zIndex / (resolution - 1) * depth
      for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
        const x = bounds.minX + xIndex / (resolution - 1) * width
        const sample = nearestHydrologySample(
          x,
          z,
          hydrology.points,
          hydrology.widths,
          hydrology.heights,
        )
        const protectedRadius = sample.width * .5 + trianglePadding
        if (sample.distance > protectedRadius) continue

        const index = zIndex * resolution + xIndex
        const target = sample.height - bedClearance
        if (heights[index] > target) heights[index] = round(target, 4)
      }
    }
  }

  const microBiomes = buildMicroBiomes(
    bounds,
    resolution,
    heights,
    hydrology.points,
    paths,
    clearings,
    pois,
    seed,
    settings,
    biomeProfile,
  )
  const waterLevel = hydrology.heights.length
    ? hydrology.heights.reduce((sum, height) => sum + height, 0) / hydrology.heights.length
    : -.4

  return {
    resolution,
    width,
    depth,
    heights,
    waterLevel: round(waterLevel, 3),
    stream: hydrology.points.map((point) => ({ ...point })),
    streamWidths: [...hydrology.widths],
    streamHeights: [...hydrology.heights],
    microBiomes,
    clearings,
  }
}

function solveHydrology(
  bounds: GeneratedRegion['bounds'],
  resolution: number,
  heights: number[],
  seed: number,
  water: number,
) {
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const minHeight = Math.min(...heights)
  const maxHeight = Math.max(...heights)
  const heightRange = Math.max(.001, maxHeight - minHeight)
  const edgeAverage = (xIndex: number) => {
    let total = 0
    let count = 0
    for (let z = 2; z < resolution - 2; z += 1) {
      total += heights[z * resolution + xIndex]
      count += 1
    }
    return total / Math.max(1, count)
  }

  const flowLeftToRight = edgeAverage(0) >= edgeAverage(resolution - 1)
  const columnForStep = (step: number) => flowLeftToRight ? step : resolution - 1 - step
  const previousRows: number[][] = Array.from({ length: resolution }, () => Array(resolution).fill(-1))
  const rowMargin = Math.max(4, Math.round(resolution * .08))
  const corridorPhase = (hashSeed(`${seed}:river-corridor`) % 1000) / 1000 * Math.PI * 2
  const targetRow = (step: number) => {
    const t = step / Math.max(1, resolution - 1)
    const wave = Math.sin(t * Math.PI * 1.6 + corridorPhase) * .13
    const noise = (valueNoise2D(step * .07, seed * .00001, seed ^ 0x94D049BB) - .5) * .12
    return clamp(.5 + wave + noise, .28, .72)
  }
  let costs = Array(resolution).fill(Infinity)

  for (let row = rowMargin; row < resolution - rowMargin; row += 1) {
    const column = columnForStep(0)
    const height = heights[row * resolution + column]
    const normalized = (height - minHeight) / heightRange
    const rowNorm = row / (resolution - 1)
    const interiorPenalty = Math.pow(Math.abs(rowNorm - targetRow(0)) / .5, 2) * 1.25
    costs[row] = -normalized * .65 + interiorPenalty
  }

  for (let step = 1; step < resolution; step += 1) {
    const column = columnForStep(step)
    const nextCosts = Array(resolution).fill(Infinity)
    const desiredRow = targetRow(step)
    for (let row = rowMargin; row < resolution - rowMargin; row += 1) {
      const height = heights[row * resolution + column]
      const normalized = (height - minHeight) / heightRange
      const noise = valueNoise2D(column * .17, row * .17, seed ^ 0x165667B1)
      const rowNorm = row / (resolution - 1)
      const interiorPenalty = Math.pow(Math.abs(rowNorm - desiredRow) / .5, 2) * 1.15
      const hardEdgePenalty = Math.pow(Math.abs(rowNorm - .5) * 2, 6) * 1.5

      for (let delta = -3; delta <= 3; delta += 1) {
        const previousRow = row + delta
        if (previousRow < rowMargin || previousRow >= resolution - rowMargin) continue
        const previousCost = costs[previousRow]
        if (!Number.isFinite(previousCost)) continue
        const bendPenalty = delta * delta * .052
        const score = previousCost + normalized * 1.42 + bendPenalty + interiorPenalty + hardEdgePenalty + noise * .08
        if (score < nextCosts[row]) {
          nextCosts[row] = score
          previousRows[step][row] = previousRow
        }
      }
    }
    costs = nextCosts
  }

  let row = rowMargin
  for (let candidate = rowMargin + 1; candidate < resolution - rowMargin; candidate += 1) {
    if (costs[candidate] < costs[row]) row = candidate
  }

  const gridPath: Array<{ column: number; row: number }> = []
  for (let step = resolution - 1; step >= 0; step -= 1) {
    gridPath.push({ column: columnForStep(step), row })
    const previous = previousRows[step][row]
    if (step > 0 && previous >= 0) row = previous
  }
  gridPath.reverse()

  let points = gridPath.map(({ column, row }) => ({
    x: bounds.minX + column / (resolution - 1) * width,
    z: bounds.minZ + row / (resolution - 1) * depth,
  }))
  points = smoothPolyline(points, 2)
  points = meanderHydrologyPath(points, bounds, resolution, heights, seed, water)
  points = limitHydrologyCurvature(points, water)
  points = smoothPolyline(points, 1)
  points = limitHydrologyCurvature(points, water)
  points = pinHydrologyEndpoints(points, bounds, flowLeftToRight)

  const random = seededRandom(hashSeed(`${seed}:hydrology-width`))
  const widths = points.map((_, index) => {
    const t = index / Math.max(1, points.length - 1)
    const pulse = Math.sin(t * Math.PI * 4 + random() * .35) * .16
    return round(1.15 + water * 1.05 + t * (.75 + water * .75) + pulse, 3)
  })

  // Build a visually stable river grade from the local landscape instead of
  // carrying the lowest sample forward forever. The old cumulative minimum
  // could make one depression drag the whole downstream river far below the
  // later terrain, leaving the water hidden behind its own trench walls.
  const terrainProfile = points.map((point) =>
    sampleGridHeight(bounds, resolution, heights, point.x, point.z),
  )
  const smoothedTerrain = terrainProfile.map((_, index) => {
    let weighted = 0
    let totalWeight = 0
    for (let offset = -2; offset <= 2; offset += 1) {
      const sampleIndex = clamp(index + offset, 0, terrainProfile.length - 1)
      const weight = 3 - Math.abs(offset)
      weighted += terrainProfile[sampleIndex] * weight
      totalWeight += weight
    }
    return weighted / Math.max(.001, totalWeight)
  })

  let streamHeights: number[] = []
  for (let index = 0; index < points.length; index += 1) {
    const localTerrain = terrainProfile[index]
    const target = smoothedTerrain[index] - .16
    const visibleFloor = localTerrain - .46
    const bankCeiling = localTerrain - .08

    if (index === 0) {
      streamHeights.push(clamp(target, visibleFloor, bankCeiling))
      continue
    }

    const previous = streamHeights[index - 1]
    const segmentLength = Math.max(
      .001,
      Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].z - points[index - 1].z,
      ),
    )
    const maxDrop = .035 + segmentLength * .035
    const maxRise = .03 + segmentLength * .028
    const graded = clamp(target, previous - maxDrop, previous + maxRise)

    // Local visibility wins over strict monotonic flow. If generated terrain
    // rises after a depression, let the stylised river recover gradually
    // instead of burying every downstream section.
    streamHeights.push(clamp(graded, visibleFloor, bankCeiling))
  }

  // Two light relaxation passes remove small kinks introduced by the local
  // visibility bounds while preserving the guaranteed incision range.
  for (let pass = 0; pass < 2; pass += 1) {
    const source = [...streamHeights]
    const next = [...streamHeights]
    for (let index = 1; index < source.length - 1; index += 1) {
      const localTerrain = terrainProfile[index]
      const visibleFloor = localTerrain - .46
      const bankCeiling = localTerrain - .08
      const neighborAverage = (source[index - 1] + source[index] * 2 + source[index + 1]) / 4
      next[index] = clamp(
        lerp(source[index], neighborAverage, .42),
        visibleFloor,
        bankCeiling,
      )
    }
    streamHeights = next
  }

  return {
    points,
    widths,
    heights: streamHeights.map((height) => round(height, 3)),
  }
}

function pinHydrologyEndpoints(
  points: GeneratedWorldPoint[],
  bounds: GeneratedRegion['bounds'],
  flowLeftToRight: boolean,
) {
  if (points.length < 2) return points
  const result = points.map((point) => ({ ...point }))
  const firstX = flowLeftToRight ? bounds.minX : bounds.maxX
  const lastX = flowLeftToRight ? bounds.maxX : bounds.minX

  result[0] = {
    x: firstX,
    z: clamp(result[0].z, bounds.minZ, bounds.maxZ),
  }
  result[result.length - 1] = {
    x: lastX,
    z: clamp(result[result.length - 1].z, bounds.minZ, bounds.maxZ),
  }

  // Keep the first interior samples moving inward from the pinned edge so the
  // river cannot double back and visually terminate just inside the map.
  if (result.length >= 4) {
    const inset = Math.max(.75, (bounds.maxX - bounds.minX) / Math.max(24, result.length * .7))
    result[1].x = flowLeftToRight
      ? Math.max(result[1].x, bounds.minX + inset)
      : Math.min(result[1].x, bounds.maxX - inset)
    result[result.length - 2].x = flowLeftToRight
      ? Math.min(result[result.length - 2].x, bounds.maxX - inset)
      : Math.max(result[result.length - 2].x, bounds.minX + inset)
  }

  return result
}

function nearestHydrologySample(
  x: number,
  z: number,
  points: GeneratedWorldPoint[],
  widths: number[],
  heights: number[],
) {
  let best = { distance: Infinity, width: widths[0] ?? 2, height: heights[0] ?? 0 }
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz
    const t = lengthSq > .00001
      ? clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
      : 0
    const px = a.x + dx * t
    const pz = a.z + dz * t
    const distance = Math.hypot(x - px, z - pz)
    if (distance >= best.distance) continue
    best = {
      distance,
      width: lerp(widths[index - 1] ?? 2, widths[index] ?? 2, t),
      height: lerp(heights[index - 1] ?? 0, heights[index] ?? 0, t),
    }
  }
  return best
}

function sampleGridHeight(
  bounds: GeneratedRegion['bounds'],
  resolution: number,
  heights: number[],
  x: number,
  z: number,
) {
  const u = clamp((x - bounds.minX) / Math.max(.001, bounds.maxX - bounds.minX), 0, 1)
  const v = clamp((z - bounds.minZ) / Math.max(.001, bounds.maxZ - bounds.minZ), 0, 1)
  const gx = u * (resolution - 1)
  const gz = v * (resolution - 1)
  const x0 = Math.floor(gx), z0 = Math.floor(gz)
  const x1 = Math.min(resolution - 1, x0 + 1), z1 = Math.min(resolution - 1, z0 + 1)
  const tx = gx - x0, tz = gz - z0
  const h00 = heights[z0 * resolution + x0] ?? 0
  const h10 = heights[z0 * resolution + x1] ?? h00
  const h01 = heights[z1 * resolution + x0] ?? h00
  const h11 = heights[z1 * resolution + x1] ?? h00
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz)
}

function buildMicroBiomes(
  bounds: GeneratedRegion['bounds'],
  resolution: number,
  heights: number[],
  stream: GeneratedWorldPoint[],
  paths: GeneratedWorldPath[],
  clearings: GeneratedWorldTerrain['clearings'],
  pois: GeneratedWorldPoi[],
  seed: number,
  settings: ReturnType<typeof worldSettings>,
  profile: ReturnType<typeof biomeIdentityProfile>,
) {
  const random = seededRandom(hashSeed(`${seed}:micro-biomes`))
  const count = Math.round(
    (settings.size === 'large' ? 36 : settings.size === 'small' ? 20 : 29) *
      (.94 + settings.openSpace * .32) *
      profile.microScale,
  )
  const biomes: GeneratedMicroBiome[] = []
  const poiAnchors = shuffle(pois, random).slice(
    0,
    Math.min(pois.length, Math.max(2, Math.round(count * .32))),
  )
  const clearingAnchors = shuffle(clearings, random).slice(
    0,
    Math.min(clearings.length, Math.max(2, Math.round(count * .24))),
  )
  const signatureTypes = profile.signatureTypes

  const poiType = (poi: GeneratedWorldPoi): WorldMicroBiomeType => {
    const roll = random()
    if (poi.type === 'camp' || poi.type === 'settlement') {
      return roll < .78 ? 'meadow' : 'forest-floor'
    }
    if (poi.type === 'graveyard' || poi.type === 'ruins' || poi.type === 'watchtower' || poi.type === 'dungeon') {
      return roll < .58 ? 'rocky' : 'forest-floor'
    }
    if (poi.type === 'shrine' || poi.type === 'standing-stones') {
      return roll < .56 ? 'moss' : 'rocky'
    }
    if (poi.type === 'beast-den') {
      return roll < .62 ? 'scrub' : 'rocky'
    }
    return 'forest-floor'
  }

  for (let index = 0; index < count; index += 1) {
    let x: number
    let z: number
    let anchoredType: WorldMicroBiomeType | undefined
    let radiusScale = 1
    const signatureIndex =
      index - poiAnchors.length - clearingAnchors.length
    const signatureType =
      signatureIndex >= 0 && signatureIndex < signatureTypes.length
        ? signatureTypes[signatureIndex]
        : undefined

    if (index < poiAnchors.length) {
      const poi = poiAnchors[index]
      const angle = random() * Math.PI * 2
      const offset = poi.radius * (.55 + random() * .78)
      x = clamp(poi.x + Math.cos(angle) * offset, bounds.minX + 2, bounds.maxX - 2)
      z = clamp(poi.z + Math.sin(angle) * offset, bounds.minZ + 2, bounds.maxZ - 2)
      anchoredType = poiType(poi)
      radiusScale = .72 + random() * .25
    } else if (index < poiAnchors.length + clearingAnchors.length) {
      const clearing = clearingAnchors[index - poiAnchors.length]
      const angle = random() * Math.PI * 2
      const offset = clearing.radius * random() * .58
      x = clamp(clearing.x + Math.cos(angle) * offset, bounds.minX + 2, bounds.maxX - 2)
      z = clamp(clearing.z + Math.sin(angle) * offset, bounds.minZ + 2, bounds.maxZ - 2)
      anchoredType = random() < .76 ? 'meadow' : random() < .6 ? 'forest-floor' : 'scrub'
      radiusScale = .7 + random() * .24
    } else if (signatureType === 'moss' && stream.length > 2) {
      const streamIndex = Math.min(
        stream.length - 2,
        Math.max(1, Math.floor(random() * (stream.length - 1))),
      )
      const point = stream[streamIndex]
      const prev = stream[streamIndex - 1]
      const next = stream[streamIndex + 1]
      const tangent = normalized2(next.x - prev.x, next.z - prev.z)
      const normal = { x: -tangent.z, z: tangent.x }
      const side = random() > .5 ? 1 : -1
      const offset = 5.5 + random() * 5.5
      x = clamp(point.x + normal.x * side * offset, bounds.minX + 2, bounds.maxX - 2)
      z = clamp(point.z + normal.z * side * offset, bounds.minZ + 2, bounds.maxZ - 2)
      anchoredType = 'moss'
      radiusScale = 1.08 + random() * .24
    } else {
      x = bounds.minX + random() * (bounds.maxX - bounds.minX)
      z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ)
      if (signatureType) {
        anchoredType = signatureType
        radiusScale = 1.08 + random() * .3
      }
    }

    const height = sampleGridHeight(bounds, resolution, heights, x, z)
    const streamDistance = stream.length > 1 ? distanceToPolyline(x, z, stream) : Infinity
    const pathDistance = distanceToPaths(x, z, paths)
    const clearing = nearestClearing(x, z, clearings)
    const noise = valueNoise2D(x * .037 + 5.2, z * .037 - 11.4, seed ^ 0xD3A2646C)

    let type: WorldMicroBiomeType
    if (streamDistance < 7 && profile.mossBias >= .65) type = 'moss'
    else if (anchoredType) type = anchoredType
    else {
      const rockyScore =
        profile.rockBias *
        ((height > .95 + settings.elevation * .8 ? .92 : .18) +
          Math.max(0, noise - .62) * 1.4)
      const meadowScore =
        profile.meadowBias *
        ((clearing ? .86 : .16) +
          (pathDistance < 12 ? .12 : 0) +
          Math.max(0, noise - .48) * .45)
      const forestFloorScore =
        profile.forestFloorBias *
        (.2 + Math.max(0, .58 - noise) * 1.1)
      const scrubScore =
        profile.scrubBias *
        (.28 + Math.abs(noise - .5) * .55)
      const mossScore =
        profile.mossBias *
        (.14 + (streamDistance < 11 ? .72 : 0))

      const scores: Array<[WorldMicroBiomeType, number]> = [
        ['rocky', rockyScore],
        ['meadow', meadowScore],
        ['forest-floor', forestFloorScore],
        ['scrub', scrubScore],
        ['moss', mossScore],
      ]
      scores.sort((a, b) => b[1] - a[1])
      type = scores[0][0]
    }

    biomes.push({
      id: `micro-${index}`,
      type,
      x: round(x, 2),
      z: round(z, 2),
      radius: round(
        (12 + random() * 18) *
        radiusScale *
        profile.microRadiusScale,
        2,
      ),
      strength: round(.7 + random() * .28, 3),
    })
  }

  return biomes
}

function microBiomeInfluence(microBiomes: GeneratedMicroBiome[], x: number, z: number) {
  const result: Record<WorldMicroBiomeType, number> = {
    'forest-floor': 0,
    moss: 0,
    meadow: 0,
    scrub: 0,
    rocky: 0,
  }

  for (const biome of microBiomes) {
    const biomeSeed = hashSeed(biome.id)
    const lobeCount = 3 + (biomeSeed % 2)
    let biomeInfluence = 0

    for (let lobe = 0; lobe < lobeCount; lobe += 1) {
      const lobeSeed = hashSeed(`${biome.id}:lobe:${lobe}`)
      const angle = ((lobeSeed % 6283) / 1000) + lobe * 1.77
      const offsetRadius = lobe === 0
        ? 0
        : biome.radius * (.16 + ((lobeSeed >>> 8) % 1000) / 1000 * .28)
      const centerX = biome.x + Math.cos(angle) * offsetRadius
      const centerZ = biome.z + Math.sin(angle) * offsetRadius

      const warpScale = biome.radius * (.12 + lobe * .018)
      const warpX = (valueNoise2D(x * .055 + lobe * 5.7, z * .055 - 9.2, lobeSeed ^ 0xA24BAED4) - .5) * warpScale
      const warpZ = (valueNoise2D(x * .055 - 7.4, z * .055 + lobe * 6.1, lobeSeed ^ 0x9FB21C65) - .5) * warpScale
      const dx = x + warpX - centerX
      const dz = z + warpZ - centerZ

      const rotate = ((lobeSeed >>> 3) % 6283) / 1000
      const cos = Math.cos(rotate)
      const sin = Math.sin(rotate)
      const rx = dx * cos - dz * sin
      const rz = dx * sin + dz * cos
      const stretch = .72 + ((lobeSeed >>> 11) % 1000) / 1000 * .58
      const lobeRadius = biome.radius * (
        lobe === 0
          ? .72
          : .48 + ((lobeSeed >>> 17) % 1000) / 1000 * .24
      )
      const edgeNoise = (valueNoise2D(x * .11, z * .11, lobeSeed ^ 0xD3A2646C) - .5) * lobeRadius * .18
      const warpedDistance = Math.hypot(rx / stretch, rz * stretch) + edgeNoise
      if (warpedDistance >= lobeRadius * 1.08) continue

      const normalized = clamp(warpedDistance / Math.max(.001, lobeRadius), 0, 1)
      const base = 1 - smoothstep(normalized)
      const interiorA = valueNoise2D(x * .12 + lobe * 2.7, z * .12 - lobe * 1.9, lobeSeed ^ 0x7FEB352D)
      const interiorB = valueNoise2D(x * .24 - 3.1, z * .24 + 6.7, lobeSeed ^ 0x846CA68B)
      const breakup = .58 + interiorA * .3 + interiorB * .12
      const lobeInfluence = base * breakup * biome.strength
      biomeInfluence = Math.max(biomeInfluence, lobeInfluence)
    }

    result[biome.type] = Math.max(result[biome.type], clamp(biomeInfluence, 0, 1))
  }
  return result
}

function buildDressing(
  region: ForgeRegionDefinition,
  mood: WorldMood,
  bounds: GeneratedRegion['bounds'],
  terrain: GeneratedWorldTerrain,
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  riverMask: RiverOccupancyMask,
  seed: number,
  terrainSeed: number,
) {
  const random = seededRandom(seed)
  const settings = worldSettings(region)
  const profile = biomeIdentityProfile(region.biome)
  const moodProfile = worldMoodDressingProfile(mood)
  const biome = region.biome.toLowerCase()
  const sizeFactor = settings.size === 'large' ? 1.35 : settings.size === 'small' ? .72 : 1
  const effectiveForestDensity = clamp(
    settings.forestDensity * profile.forestScale * moodProfile.forestScale,
    .08,
    1,
  )
  const target = Math.round(
    (250 + effectiveForestDensity * 560) *
    sizeFactor *
    profile.dressingScale *
    moodProfile.dressingScale *
    WORLD_DRESSING_DENSITY_SCALE,
  )
  const dressing: GeneratedWorldDressing[] = []
  const clusterCount = Math.max(
    3,
    Math.round(
      (7 + effectiveForestDensity * 10) *
      sizeFactor *
      profile.clusterScale * moodProfile.clusterScale,
    ),
  )
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: bounds.minX + random() * (bounds.maxX - bounds.minX),
    z: bounds.minZ + random() * (bounds.maxZ - bounds.minZ),
    radius:
      (13 + random() * 20) *
      profile.clusterRadiusScale *
      WORLD_CLUSTER_RADIUS_SCALE,
    strength: .48 + random() * .52,
  }))
  let attempts = 0

  while (dressing.length < target && attempts < target * 16) {
    attempts += 1
    const x = bounds.minX + random() * (bounds.maxX - bounds.minX)
    const z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ)
    const pathDistance = distanceToPaths(x, z, paths)
    const riverClearance = riverMask.points.length
      ? riverOccupancySample(riverMask, x, z).signedDistance
      : Infinity
    const poiDistance = pois.reduce((best, poi) => Math.min(best, Math.hypot(x - poi.x, z - poi.z) - poi.radius), Infinity)
    const micro = microBiomeInfluence(terrain.microBiomes, x, z)

    if (pathDistance < 2.35 || poiDistance < 2.25 || riverClearance < .55) continue
    const openPenalty = clearingSurfaceInfluence(
      terrain.clearings,
      x,
      z,
      terrainSeed,
    )
    if (
      random() <
      clamp(
        openPenalty *
          (.8 + settings.openSpace * .16) *
          profile.clearingStrength,
        0,
        .98,
      )
    ) continue

    const edgeDistance = Math.min(
      x - bounds.minX,
      bounds.maxX - x,
      z - bounds.minZ,
      bounds.maxZ - z,
    )
    const edgeBoost =
      clamp(1 - edgeDistance / 16, 0, 1) *
      .82 *
      profile.edgeScale
    let clusterDensity = 0
    for (const cluster of clusters) {
      const distance = Math.hypot(x - cluster.x, z - cluster.z)
      if (distance >= cluster.radius) continue
      const influence = 1 - distance / cluster.radius
      clusterDensity = Math.max(clusterDensity, influence * influence * cluster.strength)
    }

    const broadNoise = valueNoise2D(x * .031 + 12.3, z * .031 - 17.7, seed ^ 0xA24BAED4)
    const groveNoise = valueNoise2D(x * .014 - 21.7, z * .014 + 6.3, seed ^ 0x7FEB352D)
    const gapNoise = valueNoise2D(x * .022 + 2.8, z * .022 - 14.1, seed ^ 0x846CA68B)
    let density = clamp(
      effectiveForestDensity * (
        .08 +
        clusterDensity * 1.16 +
        broadNoise * .28 +
        Math.max(0, groveNoise - .42) * .86
      ) + edgeBoost,
      0,
      1,
    )
    if (gapNoise < .28) density *= .36 + gapNoise
    density *= 1 - micro.meadow * clamp(.42 * profile.meadowBias, .24, .94)
    density *= 1 - micro.rocky * clamp(.18 * profile.rockBias, .08, .62)
    density *= 1 - micro.moss * clamp(.12 * profile.mossBias, .06, .4)
    density +=
      micro['forest-floor'] * .2 * profile.forestFloorBias +
      micro.scrub * .06 * profile.scrubBias

    const nearRiver = riverClearance < 3.8
    if (!nearRiver && random() > clamp(density, .05, 1)) continue

    const roll = random()
    let type: WorldDressingType
    const treeThreshold = clamp(
      (.24 +
      density * .56 +
      (profile.treeBias - 1) * .24) * moodProfile.treeDensityScale,
      .12,
      .93,
    )

    if (nearRiver && random() < clamp(.58 * profile.reedBias, .22, .92)) type = 'reeds'
    else if (micro.rocky * profile.rockBias > .38 && roll < clamp(.5 + profile.rockBias * .16, .58, .9)) type = 'rock'
    else if (micro.meadow * profile.meadowBias > .36 && roll < clamp(.54 + profile.meadowBias * .16, .64, .94)) type = roll < .62 ? 'grass' : 'shrub'
    else if (micro.moss * profile.mossBias > .42 && roll < clamp(.45 + profile.mossBias * .13, .54, .88)) type = roll < .22 ? 'rock' : 'fern'
    else if (micro.scrub * profile.scrubBias > .38 && roll < clamp(.5 + profile.scrubBias * .14, .6, .9)) type = roll < .5 ? 'shrub' : 'fern'
    else if (roll < treeThreshold) {
      type = random() < clamp(profile.deadTreeBias + moodProfile.deadTreeAdd, 0, .86) ? 'dead-tree' : 'tree'
    } else if (roll < treeThreshold + .08 * profile.rockBias) type = 'rock'
    else if (roll < treeThreshold + .19) type = 'fern'
    else if (roll < treeThreshold + .25) type = 'fallen-log'
    else if (roll < treeThreshold + .3) type = 'stump'
    else type = random() > .5 ? 'shrub' : 'grass'

    // Corrupt ground cover should read as damaged growth rather than normal,
    // healthy green underbrush.
    if (
      biome.includes('highland') &&
      type === 'rock' &&
      random() < .72
    ) {
      type = random() < .58 ? 'grass' : 'shrub'
    }

    if (
      biome.includes('marsh') || biome.includes('swamp') || biome.includes('drowned')
    ) {
      if (
        (type === 'grass' || type === 'shrub' || type === 'fern') &&
        micro.moss < .12 &&
        riverClearance > 8 &&
        random() < .72
      ) {
        type = random() < .62 ? 'stump' : 'dead-tree'
      } else if (
        (type === 'grass' || type === 'shrub') &&
        (micro.moss > .2 || riverClearance < 6.8) &&
        random() < .78
      ) {
        type = 'reeds'
      }
    }

    if (
      biome.includes('corrupt') &&
      (type === 'shrub' || type === 'fern' || type === 'grass') &&
      random() < .56
    ) {
      const damagedRoll = random()
      type =
        damagedRoll < .5
          ? 'stump'
          : damagedRoll < .82
            ? 'dead-tree'
            : 'rock'
    }

    if (
      mood === 'deadwood' &&
      (type === 'grass' || type === 'shrub' || type === 'fern') &&
      random() < .34
    ) {
      type = random() < .56 ? 'stump' : 'fallen-log'
    } else if (
      mood === 'bleak' &&
      (type === 'grass' || type === 'shrub' || type === 'fern') &&
      random() < .28
    ) {
      type = random() < .66 ? 'rock' : 'stump'
    }

    const y = sampleTerrainHeight({ terrain, bounds }, x, z)
    const clusterVariation = .88 + broadNoise * .26
    const baseScale = type === 'tree' || type === 'dead-tree'
      ? (.62 + random() * 1.08) * profile.treeScale * WORLD_TREE_SCALE
      : type === 'rock'
        ? (.55 + random() * .82) * profile.rockScale
        : type === 'grass' || type === 'reeds'
          ? .45 + random() * .55
          : type === 'shrub'
            ? .55 + random() * .65
            : .55 + random() * .82

    dressing.push({
      id: `dress-${dressing.length}`,
      type,
      x: round(x, 2),
      y: round(y, 2),
      z: round(z, 2),
      scale: round(baseScale * clusterVariation, 2),
      rotation: round(random() * Math.PI * 2, 3),
      variant: Math.floor(random() * 4),
    })
  }

  appendPoiTransitionDressing(dressing, terrain, bounds, paths, pois, riverMask, random)
  appendRiverbankDressing(dressing, terrain, bounds, paths, pois, riverMask, random)
  appendBiomeSignatureDressing(
    region,
    dressing,
    terrain,
    bounds,
    paths,
    pois,
    riverMask,
    random,
  )
  appendMoodSignatureDressing(
    mood,
    dressing,
    terrain,
    bounds,
    paths,
    pois,
    riverMask,
    random,
  )
  return dressing
}

function appendBiomeSignatureDressing(
  region: ForgeRegionDefinition,
  dressing: GeneratedWorldDressing[],
  terrain: GeneratedWorldTerrain,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  riverMask: RiverOccupancyMask,
  random: () => number,
) {
  const biome = region.biome.toLowerCase()
  const settings = worldSettings(region)
  const sizeFactor =
    settings.size === 'large' ? 1.35 :
      settings.size === 'small' ? .72 :
        1

  const pushSignature = (
    type: WorldDressingType,
    count: number,
    options: {
      minPath?: number
      minRiver?: number
      minPoi?: number
      scaleMin: number
      scaleMax: number
      accept?: (
        x: number,
        z: number,
        micro: ReturnType<typeof microBiomeInfluence>,
        pathDistance: number,
        riverClearance: number,
      ) => boolean
    },
  ) => {
    let placed = 0
    let attempts = 0
    const target = Math.max(1, Math.round(count * sizeFactor))

    while (placed < target && attempts < target * 28) {
      attempts += 1
      const x = bounds.minX + 2.2 + random() * (bounds.maxX - bounds.minX - 4.4)
      const z = bounds.minZ + 2.2 + random() * (bounds.maxZ - bounds.minZ - 4.4)
      const pathDistance = distanceToPaths(x, z, paths)
      if (pathDistance < (options.minPath ?? 3.2)) continue

      const riverClearance = riverMask.points.length
        ? riverOccupancySample(riverMask, x, z).signedDistance
        : Infinity
      if (riverClearance < (options.minRiver ?? 1.2)) continue

      const poiDistance = pois.reduce(
        (best, poi) =>
          Math.min(
            best,
            Math.hypot(x - poi.x, z - poi.z) - poi.radius,
          ),
        Infinity,
      )
      if (poiDistance < (options.minPoi ?? 2.8)) continue

      const micro = microBiomeInfluence(terrain.microBiomes, x, z)
      if (options.accept && !options.accept(x, z, micro, pathDistance, riverClearance)) {
        continue
      }

      dressing.push({
        id: `biome-signature-${type}-${placed}`,
        type,
        x: round(x, 2),
        y: round(sampleTerrainHeight({ terrain, bounds }, x, z), 2),
        z: round(z, 2),
        scale: round(
          options.scaleMin +
          random() * (options.scaleMax - options.scaleMin),
          2,
        ),
        rotation: round(random() * Math.PI * 2, 3),
        variant: Math.floor(random() * 4),
      })
      placed += 1
    }
  }

  if (biome.includes('autumn')) {
    pushSignature('leaf-patch', 46, {
      minPath: 2.6,
      minRiver: 1,
      minPoi: 2.2,
      scaleMin: .9,
      scaleMax: 1.75,
      accept: (_x, _z, micro) =>
        micro['forest-floor'] > .1 ||
        micro.meadow > .1 ||
        random() < .42,
    })
    pushSignature('root-cluster', 8, {
      minPath: 3.6,
      minRiver: 1.4,
      scaleMin: .7,
      scaleMax: 1.15,
      accept: (_x, _z, micro) =>
        micro['forest-floor'] > .18 || random() < .3,
    })
    return
  }

  if (biome.includes('highland')) {
    pushSignature('rock-outcrop', 22, {
      minPath: 4.2,
      minRiver: 1.9,
      minPoi: 3.6,
      scaleMin: 1.18,
      scaleMax: 2.15,
      accept: (x, z, micro) =>
        micro.rocky > .16 ||
        sampleTerrainHeight({ terrain, bounds }, x, z) > 1.3 ||
        random() < .24,
    })
    return
  }

  if (
    biome.includes('marsh') ||
    biome.includes('swamp') ||
    biome.includes('drowned')
  ) {
    pushSignature('mud-patch', 34, {
      minPath: 2.7,
      minRiver: .72,
      minPoi: 2.4,
      scaleMin: 1.28,
      scaleMax: 2.55,
      accept: (_x, _z, micro, _pathDistance, riverClearance) =>
        micro.moss > .16 ||
        riverClearance < 7.2,
    })
    pushSignature('root-cluster', 12, {
      minPath: 3.3,
      minRiver: 1,
      scaleMin: .75,
      scaleMax: 1.25,
      accept: (_x, _z, micro, _pathDistance, riverClearance) =>
        micro.moss > .14 ||
        riverClearance < 7.5,
    })
    pushSignature('reeds', 48, {
      minPath: 2.8,
      minRiver: .58,
      minPoi: 2.6,
      scaleMin: .94,
      scaleMax: 1.5,
      accept: (_x, _z, micro, _pathDistance, riverClearance) =>
        riverClearance < 8.2 ||
        micro.moss > .17,
    })
    return
  }

  if (biome.includes('corrupt')) {
    pushSignature('corrupt-scar', 32, {
      minPath: 2.8,
      minRiver: .9,
      minPoi: 2.4,
      scaleMin: 1,
      scaleMax: 2.1,
      accept: (_x, _z, micro) =>
        micro.scrub > .1 ||
        micro.rocky > .1 ||
        random() < .3,
    })
    pushSignature('root-cluster', 20, {
      minPath: 3.4,
      minRiver: 1,
      scaleMin: .8,
      scaleMax: 1.35,
      accept: (_x, _z, micro) =>
        micro.scrub > .14 ||
        micro['forest-floor'] > .14 ||
        random() < .24,
    })
    return
  }

  if (
    biome.includes('farmland') ||
    biome.includes('meadow') ||
    biome.includes('grassland')
  ) {
    pushSignature('flower-patch', 28, {
      minPath: 2.9,
      minRiver: 1.1,
      minPoi: 2.5,
      scaleMin: .8,
      scaleMax: 1.45,
      accept: (_x, _z, micro) =>
        micro.meadow > .1 || random() < .34,
    })
    pushSignature('hedge', 12, {
      minPath: 4.5,
      minRiver: 1.7,
      minPoi: 3.2,
      scaleMin: .78,
      scaleMax: 1.18,
      accept: (_x, _z, micro, pathDistance) =>
        (micro.meadow > .08 && pathDistance < 19) ||
        random() < .16,
    })
    return
  }

  // Ancient Forest / default woodland gets a small amount of exposed roots
  // rather than a new bright surface treatment.
  pushSignature('root-cluster', 11, {
    minPath: 3.7,
    minRiver: 1.2,
    scaleMin: .78,
    scaleMax: 1.3,
    accept: (_x, _z, micro) =>
      micro['forest-floor'] > .12 ||
      micro.moss > .12 ||
      random() < .22,
  })
}

function appendPoiTransitionDressing(
  dressing: GeneratedWorldDressing[],
  terrain: GeneratedWorldTerrain,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  riverMask: RiverOccupancyMask,
  random: () => number,
) {
  const pickType = (poi: GeneratedWorldPoi): WorldDressingType => {
    const roll = random()
    if (poi.type === 'camp' || poi.type === 'settlement') {
      if (roll < .34) return 'grass'
      if (roll < .6) return 'shrub'
      if (roll < .82) return 'fallen-log'
      return 'stump'
    }
    if (poi.type === 'ruins' || poi.type === 'watchtower' || poi.type === 'dungeon' || poi.type === 'graveyard') {
      if (roll < .46) return 'rock'
      if (roll < .68) return 'fern'
      if (roll < .86) return 'shrub'
      return 'fallen-log'
    }
    if (poi.type === 'shrine' || poi.type === 'standing-stones') {
      if (roll < .44) return 'rock'
      if (roll < .7) return 'grass'
      if (roll < .88) return 'fern'
      return 'shrub'
    }
    if (roll < .38) return 'rock'
    if (roll < .66) return 'shrub'
    if (roll < .84) return 'fallen-log'
    return 'fern'
  }

  for (let poiIndex = 0; poiIndex < pois.length; poiIndex += 1) {
    const poi = pois[poiIndex]
    const count =
      poi.type === 'settlement'
        ? 11
        : poi.type === 'camp'
          ? 9
          : poi.type === 'ruins' || poi.type === 'graveyard'
            ? 8
            : 6
    const startAngle = random() * Math.PI * 2

    for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
      const angle =
        startAngle +
        itemIndex / count * Math.PI * 2 +
        (random() - .5) * .62
      const radius = poi.radius + 1.25 + random() * 3.35
      const x = poi.x + Math.cos(angle) * radius
      const z = poi.z + Math.sin(angle) * radius

      if (
        x <= bounds.minX + .8 ||
        x >= bounds.maxX - .8 ||
        z <= bounds.minZ + .8 ||
        z >= bounds.maxZ - .8
      ) continue
      if (distanceToPaths(x, z, paths) < 1.75) continue

      const riverClearance = riverMask.points.length > 1
        ? riverOccupancySample(riverMask, x, z).signedDistance
        : Infinity
      if (riverClearance < .8) continue

      const overlapsOtherPoi = pois.some((other) =>
        other.id !== poi.id &&
        Math.hypot(x - other.x, z - other.z) < other.radius + 1.5
      )
      if (overlapsOtherPoi) continue

      const type = pickType(poi)
      const baseScale =
        type === 'rock'
          ? .42 + random() * .5
          : type === 'grass' || type === 'fern'
            ? .4 + random() * .4
            : type === 'fallen-log'
              ? .58 + random() * .48
              : .48 + random() * .46

      dressing.push({
        id: `poi-transition-${poiIndex}-${itemIndex}`,
        type,
        x: round(x, 2),
        y: round(sampleTerrainHeight({ terrain, bounds }, x, z), 2),
        z: round(z, 2),
        scale: round(baseScale, 2),
        rotation: round(random() * Math.PI * 2, 3),
        variant: Math.floor(random() * 4),
      })
    }
  }
}

function appendRiverbankDressing(
  dressing: GeneratedWorldDressing[],
  terrain: GeneratedWorldTerrain,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  riverMask: RiverOccupancyMask,
  random: () => number,
) {
  if (terrain.stream.length < 4 || riverMask.points.length < 2) return

  const isClearBankPoint = (x: number, z: number, pathClearance: number) => {
    if (x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ) return false
    if (distanceToPaths(x, z, paths) < pathClearance) return false
    if (pois.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.radius + 2.4)) return false
    return true
  }

  for (let index = 2; index < terrain.stream.length - 2; index += 5) {
    const point = terrain.stream[index]
    const prev = terrain.stream[index - 1]
    const next = terrain.stream[index + 1]
    const tangent = normalized2(next.x - prev.x, next.z - prev.z)
    const normal = { x: -tangent.z, z: tangent.x }
    const localWidth = terrain.streamWidths[index] ?? terrain.streamWidths[0] ?? 2
    const halfWaterWidth = localWidth * .5

    for (const side of [-1, 1]) {
      // A low, irregular earth patch breaks up the mathematically clean grass/water
      // seam without introducing another river mesh or touching water depth logic.
      if (random() < .5) {
        const patchOffset = halfWaterWidth + .32 + random() * .72
        const patchAlong = (random() - .5) * 5.2
        const patchX = point.x + normal.x * patchOffset * side + tangent.x * patchAlong
        const patchZ = point.z + normal.z * patchOffset * side + tangent.z * patchAlong
        const hydro = nearestHydrologySample(
          patchX,
          patchZ,
          terrain.stream,
          terrain.streamWidths,
          terrain.streamHeights,
        )

        if (
          hydro.distance >= hydro.width * .5 + .12 &&
          hydro.distance <= hydro.width * .5 + 1.45 &&
          isClearBankPoint(patchX, patchZ, 3.2)
        ) {
          dressing.push({
            id: `riverbank-patch-${index}-${side}`,
            type: 'bank-patch',
            x: round(patchX, 2),
            y: round(sampleTerrainHeight({ terrain, bounds }, patchX, patchZ), 2),
            z: round(patchZ, 2),
            scale: round(1.05 + random() * 1.65, 2),
            rotation: round(Math.atan2(-tangent.z, tangent.x) + (random() - .5) * .28, 3),
            variant: Math.floor(random() * 4),
          })
        }
      }

      // Shoreline props intentionally sit much closer to the actual water edge than
      // general biome dressing, which still respects the wider gameplay occupancy mask.
      const clusterSize = 1 + Math.floor(random() * 2)
      for (let itemIndex = 0; itemIndex < clusterSize; itemIndex += 1) {
        const bankOffset = halfWaterWidth + .48 + random() * 1.3
        const along = (random() - .5) * 4
        const x = point.x + normal.x * bankOffset * side + tangent.x * along
        const z = point.z + normal.z * bankOffset * side + tangent.z * along
        if (!isClearBankPoint(x, z, 2.75)) continue

        const hydro = nearestHydrologySample(
          x,
          z,
          terrain.stream,
          terrain.streamWidths,
          terrain.streamHeights,
        )
        if (hydro.distance < hydro.width * .5 + .16 || hydro.distance > hydro.width * .5 + 2.15) continue

        const roll = random()
        const type: WorldDressingType =
          roll < .42 ? 'reeds'
            : roll < .7 ? 'rock'
              : roll < .88 ? 'grass'
                : 'shrub'
        dressing.push({
          id: `riverbank-${index}-${side}-${itemIndex}`,
          type,
          x: round(x, 2),
          y: round(sampleTerrainHeight({ terrain, bounds }, x, z), 2),
          z: round(z, 2),
          scale: round(
            type === 'rock'
              ? .42 + random() * .58
              : type === 'grass'
                ? .42 + random() * .42
                : .48 + random() * .5,
            2,
          ),
          rotation: round(random() * Math.PI * 2, 3),
          variant: Math.floor(random() * 4),
        })
      }
    }
  }
}


function appendMoodSignatureDressing(
  mood: WorldMood,
  dressing: GeneratedWorldDressing[],
  terrain: GeneratedWorldTerrain,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  riverMask: RiverOccupancyMask,
  random: () => number,
) {
  if (mood === 'normal') return

  const pushMood = (
    type: WorldDressingType,
    count: number,
    scaleMin: number,
    scaleMax: number,
    minPath = 3.1,
    minRiver = 1.2,
  ) => {
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < count * 30) {
      attempts += 1
      const x = bounds.minX + 2.4 + random() * (bounds.maxX - bounds.minX - 4.8)
      const z = bounds.minZ + 2.4 + random() * (bounds.maxZ - bounds.minZ - 4.8)
      if (distanceToPaths(x, z, paths) < minPath) continue

      const riverClearance = riverMask.points.length
        ? riverOccupancySample(riverMask, x, z).signedDistance
        : Infinity
      if (riverClearance < minRiver) continue

      const poiDistance = pois.reduce(
        (best, poi) =>
          Math.min(best, Math.hypot(x - poi.x, z - poi.z) - poi.radius),
        Infinity,
      )
      if (poiDistance < 2.8) continue

      dressing.push({
        id: `mood-${mood}-${type}-${placed}`,
        type,
        x: round(x, 2),
        y: round(sampleTerrainHeight({ terrain, bounds }, x, z), 2),
        z: round(z, 2),
        scale: round(
          (scaleMin + random() * (scaleMax - scaleMin)) *
          (type === 'tree' || type === 'dead-tree' ? WORLD_TREE_SCALE : 1),
          2,
        ),
        rotation: round(random() * Math.PI * 2, 3),
        variant: Math.floor(random() * 4),
      })
      placed += 1
    }
  }

  if (mood === 'dark') {
    pushMood('dead-tree', 9, .72, 1.35, 3.5, 1.4)
    pushMood('stump', 7, .62, 1.05)
    pushMood('fallen-log', 6, .72, 1.28)
    pushMood('mud-patch', 7, 1.1, 2)
    return
  }

  if (mood === 'deadwood') {
    pushMood('dead-tree', 26, .68, 1.48, 3.4, 1.35)
    pushMood('stump', 17, .62, 1.18)
    pushMood('fallen-log', 15, .72, 1.42)
    pushMood('mud-patch', 10, 1.15, 2.15)
    return
  }

  pushMood('dead-tree', 11, .64, 1.28, 3.7, 1.5)
  pushMood('stump', 8, .58, 1.02)
  pushMood('rock-outcrop', 12, 1.08, 1.88, 4.1, 1.7)
  pushMood('fallen-log', 5, .68, 1.18)
}

function poiPool(region: ForgeRegionDefinition): WorldPoiType[] {
  const features = new Set(region.features.map((feature) => feature.toLowerCase()))
  const pool: WorldPoiType[] = ['ruins', 'camp', 'shrine', 'standing-stones', 'beast-den', 'watchtower']
  if (features.has('grave clusters') || features.has('graveyards')) pool.push('graveyard')
  if (features.has('ruins')) pool.push('ruins', 'watchtower')
  return pool
}

function poiApproachDistance(type: WorldPoiType) {
  const base =
    type === 'watchtower' || type === 'ruins' ? 10.5 :
      type === 'graveyard' || type === 'standing-stones' ? 9 :
        type === 'beast-den' ? 11.5 :
          type === 'camp' ? 8 :
            type === 'shrine' ? 7 :
              9
  return base * 1.28
}

function poiRadius(type: WorldPoiType) {
  const base =
    type === 'settlement' ? 11 :
      type === 'camp' ? 7.2 :
        type === 'watchtower' || type === 'dungeon' ? 7.8 :
          type === 'graveyard' || type === 'ruins' ? 7.4 :
            type === 'standing-stones' || type === 'beast-den' ? 6.8 :
              type === 'shrine' ? 6.2 :
                5.8
  return base * 1.18
}

function poiLabel(type: WorldPoiType) {
  return ({
    ruins: 'Forgotten Ruins',
    camp: 'Abandoned Camp',
    shrine: 'Wayside Shrine',
    'standing-stones': 'Standing Stones',
    'beast-den': 'Beast Den',
    graveyard: 'Old Graveyard',
    watchtower: 'Ruined Watchtower',
    settlement: 'Wayfarer Camp',
    dungeon: 'Dungeon Entrance',
  } satisfies Record<WorldPoiType, string>)[type]
}

function biomeIdentityProfile(biome: string) {
  const value = biome.toLowerCase()

  if (value.includes('autumn')) {
    return {
      reliefScale: .92,
      reliefFeatureScale: .92,
      forestScale: .82,
      edgeScale: .78,
      clusterScale: .9,
      clusterRadiusScale: 1.05,
      clearingStrength: 1.08,
      dressingScale: .96,
      microScale: 1.04,
      microRadiusScale: 1.08,
      treeBias: .88,
      treeScale: 1.02,
      rockBias: .82,
      rockScale: .98,
      meadowBias: 1.35,
      mossBias: .72,
      scrubBias: 1.02,
      forestFloorBias: .92,
      reedBias: .72,
      deadTreeBias: .025,
      signatureTypes: [
        'meadow', 'meadow', 'forest-floor', 'scrub',
        'rocky', 'meadow', 'forest-floor',
      ] as WorldMicroBiomeType[],
    }
  }

  if (value.includes('highland')) {
    return {
      reliefScale: 1.9,
      reliefFeatureScale: 1.32,
      forestScale: .5,
      edgeScale: .32,
      clusterScale: .68,
      clusterRadiusScale: .82,
      clearingStrength: .82,
      dressingScale: .72,
      microScale: 1.12,
      microRadiusScale: 1.16,
      treeBias: .48,
      treeScale: .92,
      rockBias: .54,
      rockScale: .94,
      meadowBias: .72,
      mossBias: .42,
      scrubBias: 1.15,
      forestFloorBias: .58,
      reedBias: .45,
      deadTreeBias: .08,
      signatureTypes: [
        'rocky', 'rocky', 'rocky', 'scrub',
        'meadow', 'rocky', 'forest-floor',
      ] as WorldMicroBiomeType[],
    }
  }

  if (value.includes('marsh') || value.includes('swamp') || value.includes('drowned')) {
    return {
      reliefScale: .5,
      reliefFeatureScale: .72,
      forestScale: .5,
      edgeScale: .38,
      clusterScale: .9,
      clusterRadiusScale: 1.22,
      clearingStrength: 1.14,
      dressingScale: .9,
      microScale: 1.22,
      microRadiusScale: 1.22,
      treeBias: .44,
      treeScale: .88,
      rockBias: .38,
      rockScale: .86,
      meadowBias: .48,
      mossBias: 2.2,
      scrubBias: .9,
      forestFloorBias: .92,
      reedBias: 2.15,
      deadTreeBias: .3,
      signatureTypes: [
        'moss', 'moss', 'moss', 'scrub',
        'forest-floor', 'moss', 'meadow',
      ] as WorldMicroBiomeType[],
    }
  }

  if (value.includes('corrupt')) {
    return {
      reliefScale: 1.18,
      reliefFeatureScale: 1.08,
      forestScale: .55,
      edgeScale: .38,
      clusterScale: .86,
      clusterRadiusScale: 1.05,
      clearingStrength: .9,
      dressingScale: .94,
      microScale: 1.1,
      microRadiusScale: 1.12,
      treeBias: .36,
      treeScale: .92,
      rockBias: 1.18,
      rockScale: 1.04,
      meadowBias: .24,
      mossBias: .34,
      scrubBias: 1.08,
      forestFloorBias: .52,
      reedBias: .42,
      deadTreeBias: .5,
      signatureTypes: [
        'scrub', 'rocky', 'scrub', 'forest-floor',
        'rocky', 'scrub', 'moss',
      ] as WorldMicroBiomeType[],
    }
  }

  if (value.includes('farmland') || value.includes('meadow') || value.includes('grassland')) {
    return {
      reliefScale: .62,
      reliefFeatureScale: .72,
      forestScale: .34,
      edgeScale: .12,
      clusterScale: .55,
      clusterRadiusScale: .9,
      clearingStrength: 1.48,
      dressingScale: .82,
      microScale: 1.08,
      microRadiusScale: 1.28,
      treeBias: .34,
      treeScale: .9,
      rockBias: .48,
      rockScale: .92,
      meadowBias: 2.0,
      mossBias: .4,
      scrubBias: .62,
      forestFloorBias: .38,
      reedBias: .5,
      deadTreeBias: .015,
      signatureTypes: [
        'meadow', 'meadow', 'meadow', 'scrub',
        'meadow', 'forest-floor', 'meadow',
      ] as WorldMicroBiomeType[],
    }
  }

  // Ancient Forest / default woodland: dense interior groves, a strong but
  // irregular woodland edge, darker forest-floor pockets and relatively little
  // exposed meadow or stone.
  return {
    reliefScale: 1,
    reliefFeatureScale: .96,
    forestScale: 1.16,
    edgeScale: 1.12,
    clusterScale: 1.2,
    clusterRadiusScale: 1.18,
    clearingStrength: .76,
    dressingScale: 1.12,
    microScale: 1.05,
    microRadiusScale: 1.08,
    treeBias: 1.2,
    treeScale: 1.06,
    rockBias: .7,
    rockScale: .94,
    meadowBias: .52,
    mossBias: 1.12,
    scrubBias: .78,
    forestFloorBias: 1.55,
    reedBias: .78,
    deadTreeBias: .035,
    signatureTypes: [
      'forest-floor', 'forest-floor', 'moss', 'scrub',
      'forest-floor', 'meadow', 'moss',
    ] as WorldMicroBiomeType[],
  }
}


function resolveWorldMood(
  biome: string,
  requested: string,
  seed: number,
): WorldMood {
  if (
    requested === 'normal' ||
    requested === 'dark' ||
    requested === 'deadwood' ||
    requested === 'bleak'
  ) {
    return requested
  }

  const value = biome.toLowerCase()
  const roll = (hashSeed(`${seed}:${value}:mood`) % 10000) / 10000

  if (value.includes('dead')) {
    if (roll < .16) return 'normal'
    if (roll < .46) return 'dark'
    return 'deadwood'
  }
  if (value.includes('corrupt')) {
    if (roll < .35) return 'normal'
    if (roll < .7) return 'bleak'
    return 'deadwood'
  }
  if (value.includes('highland')) return roll < .68 ? 'normal' : 'bleak'
  if (
    value.includes('farmland') ||
    value.includes('meadow') ||
    value.includes('grassland')
  ) {
    return roll < .74 ? 'normal' : 'bleak'
  }
  if (value.includes('autumn')) {
    if (roll < .56) return 'normal'
    if (roll < .8) return 'dark'
    return 'deadwood'
  }
  if (
    value.includes('marsh') ||
    value.includes('swamp') ||
    value.includes('drowned')
  ) {
    if (roll < .5) return 'normal'
    if (roll < .74) return 'dark'
    return 'deadwood'
  }

  if (roll < .56) return 'normal'
  if (roll < .82) return 'dark'
  return 'deadwood'
}

function worldMoodDressingProfile(mood: WorldMood) {
  if (mood === 'dark') {
    return {
      forestScale: 1.03,
      dressingScale: 1.04,
      clusterScale: 1.04,
      treeDensityScale: 1.02,
      deadTreeAdd: .12,
    }
  }
  if (mood === 'deadwood') {
    return {
      forestScale: .9,
      dressingScale: 1.03,
      clusterScale: .9,
      treeDensityScale: .91,
      deadTreeAdd: .36,
    }
  }
  if (mood === 'bleak') {
    return {
      forestScale: .62,
      dressingScale: .84,
      clusterScale: .68,
      treeDensityScale: .72,
      deadTreeAdd: .2,
    }
  }
  return {
    forestScale: 1,
    dressingScale: 1,
    clusterScale: 1,
    treeDensityScale: 1,
    deadTreeAdd: 0,
  }
}

function worldSettings(region: ForgeRegionDefinition) {
  return {
    size: region.worldGen?.size ?? 'medium',
    elevation: clamp(region.worldGen?.elevation ?? .45, 0, 1),
    cliffs: clamp(region.worldGen?.cliffs ?? .28, 0, 1),
    water: clamp(region.worldGen?.water ?? .4, 0, 1),
    forestDensity: clamp(region.worldGen?.forestDensity ?? .78, 0, 1),
    openSpace: clamp(region.worldGen?.openSpace ?? .38, 0, 1),
    exploration: clamp(region.worldGen?.exploration ?? .72, 0, 1),
    loops: clamp(region.worldGen?.loops ?? .5, 0, 1),
    secretPaths: clamp(region.worldGen?.secretPaths ?? .45, 0, 1),
    verticality: clamp(region.worldGen?.verticality ?? .45, 0, 1),
    poiDensity: clamp(region.worldGen?.poiDensity ?? .7, 0, 1),
  } as const
}

function calculateBounds(nodes: GeneratedRegionNode[], sizeScale: number) {
  const xs = nodes.map((node) => node.x)
  const zs = nodes.map((node) => node.z)
  const margin = 19 * sizeScale * 1.34
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  }
}

function nearestPathSample(paths: GeneratedWorldPath[], x: number, z: number) {
  let best: {
    distance: number
    x: number
    z: number
    width: number
    kind: GeneratedWorldPath['kind']
    pathId: string
    endpointDistance: number
  } | undefined

  for (const path of paths) {
    const start = path.points[0]
    const end = path.points[path.points.length - 1]
    const endpointDistance = Math.min(
      Math.hypot(x - start.x, z - start.z),
      Math.hypot(x - end.x, z - end.z),
    )

    for (let index = 1; index < path.points.length; index += 1) {
      const a = path.points[index - 1]
      const b = path.points[index]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const lengthSq = dx * dx + dz * dz
      const t = lengthSq > .00001
        ? clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
        : 0
      const px = a.x + dx * t
      const pz = a.z + dz * t
      const distance = Math.hypot(x - px, z - pz)
      if (best && distance >= best.distance) continue
      const width = lerp(path.widths[index - 1] ?? path.width, path.widths[index] ?? path.width, t)
      best = {
        distance,
        x: px,
        z: pz,
        width,
        kind: path.kind,
        pathId: path.id,
        endpointDistance,
      }
    }
  }
  return best
}

function meanderHydrologyPath(
  points: GeneratedWorldPoint[],
  bounds: GeneratedRegion['bounds'],
  resolution: number,
  heights: number[],
  seed: number,
  water: number,
) {
  if (points.length < 5) return points
  const result = points.map((point) => ({ ...point }))
  const baseAmplitude = 1.35 + water * 2.15
  const phase = (hashSeed(`${seed}:meander-phase`) % 6283) / 1000

  for (let index = 2; index < points.length - 2; index += 1) {
    const point = points[index]
    const prev = points[index - 1]
    const next = points[index + 1]
    const prevFar = points[index - 2]
    const nextFar = points[index + 2]
    const tangent = normalized2(nextFar.x - prevFar.x, nextFar.z - prevFar.z)
    const normal = { x: -tangent.z, z: tangent.x }
    const localSpacing = Math.max(
      .001,
      Math.min(
        Math.hypot(point.x - prev.x, point.z - prev.z),
        Math.hypot(next.x - point.x, next.z - point.z),
      ),
    )
    const incoming = normalized2(point.x - prev.x, point.z - prev.z)
    const outgoing = normalized2(next.x - point.x, next.z - point.z)
    const turnDot = clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1)
    const sharpness = (1 - turnDot) * .5
    const curvatureAllowance = 1 - sharpness * .72
    const localMaxOffset = Math.max(
      .45,
      Math.min(baseAmplitude, localSpacing * (.58 + water * .08)) * curvatureAllowance,
    )

    const t = index / Math.max(1, points.length - 1)
    const noise = valueNoise2D(point.x * .035, point.z * .035, seed ^ 0x68E31DA4) - .5
    const rawDesired =
      Math.sin(t * Math.PI * 4.6 + phase) * baseAmplitude * .62 +
      noise * baseAmplitude * .72
    const desired = clamp(rawDesired, -localMaxOffset, localMaxOffset)

    let best = point
    let bestScore = Infinity
    for (let sampleIndex = -3; sampleIndex <= 3; sampleIndex += 1) {
      const offset = clamp(
        desired + sampleIndex * localMaxOffset * .18,
        -localMaxOffset,
        localMaxOffset,
      )
      const x = clamp(point.x + normal.x * offset, bounds.minX + 4, bounds.maxX - 4)
      const z = clamp(point.z + normal.z * offset, bounds.minZ + 4, bounds.maxZ - 4)
      const height = sampleGridHeight(bounds, resolution, heights, x, z)
      const deviationPenalty = Math.abs(offset - desired) * .17
      const bendPenalty = sharpness * Math.abs(offset) * .22
      const score = height * .5 + deviationPenalty + bendPenalty
      if (score < bestScore) {
        bestScore = score
        best = { x, z }
      }
    }
    result[index] = best
  }

  return result
}

function limitHydrologyCurvature(points: GeneratedWorldPoint[], water: number) {
  if (points.length < 5) return points
  const result = points.map((point) => ({ ...point }))
  const minDot = .28 - water * .08

  for (let pass = 0; pass < 2; pass += 1) {
    const source = result.map((point) => ({ ...point }))
    for (let index = 1; index < source.length - 1; index += 1) {
      const prev = source[index - 1]
      const point = source[index]
      const next = source[index + 1]
      const incoming = normalized2(point.x - prev.x, point.z - prev.z)
      const outgoing = normalized2(next.x - point.x, next.z - point.z)
      const dot = clamp(incoming.x * outgoing.x + incoming.z * outgoing.z, -1, 1)
      if (dot >= minDot) continue

      const midpoint = {
        x: (prev.x + next.x) * .5,
        z: (prev.z + next.z) * .5,
      }
      const correction = clamp((minDot - dot) / (1 + minDot), 0, .68)
      result[index] = {
        x: lerp(point.x, midpoint.x, correction),
        z: lerp(point.z, midpoint.z, correction),
      }
    }
  }

  return result
}

function crossingApproachWear(crossings: GeneratedWorldCrossing[], x: number, z: number) {
  let best = 0
  for (const crossing of crossings) {
    const dx = x - crossing.x
    const dz = z - crossing.z
    const cos = Math.cos(-crossing.rotation)
    const sin = Math.sin(-crossing.rotation)
    const along = dx * cos - dz * sin
    const across = dx * sin + dz * cos
    const alongRadius = crossing.kind === 'bridge' ? 4.9 : 4
    const acrossRadius = Math.max(1.35, crossing.width * .68)
    const normalized = Math.hypot(along / alongRadius, across / acrossRadius)
    if (normalized >= 1) continue
    best = Math.max(best, 1 - smoothstep(clamp(normalized, 0, 1)))
  }
  return best
}

function pathEdgeWear(
  paths: GeneratedWorldPath[],
  crossings: GeneratedWorldCrossing[],
  x: number,
  z: number,
  seed = 0,
) {
  const nearest = nearestPathSample(paths, x, z)
  if (!nearest) return 0

  const shoulderWarp = (
    valueNoise2D(x * .16 + 9.4, z * .16 - 5.8, seed ^ 0x9E3779B9) - .5
  ) * (nearest.kind === 'main' ? .58 : .2)
  const halfWidth = nearest.width * .5
  const fadeBase = nearest.kind === 'main'
    ? nearest.width * .54 + .48
    : nearest.width * .34 + .2
  const fadeNoise = valueNoise2D(
    x * .085 - 12.6,
    z * .085 + 3.2,
    seed ^ 0x7FEB352D,
  )
  const fade = fadeBase * (.82 + fadeNoise * .34)
  const effectiveDistance = Math.max(0, nearest.distance + shoulderWarp)
  if (effectiveDistance > halfWidth + fade) return 0

  const edgeDistance = Math.max(0, effectiveDistance - halfWidth)
  const influence =
    1 - smoothstep(clamp(edgeDistance / Math.max(.001, fade), 0, 1))
  const breakup = .82 + valueNoise2D(
    x * .23 + 2.7,
    z * .23 - 8.1,
    seed ^ 0x846CA68B,
  ) * .18

  let junctionScale = 1
  if (nearest.kind === 'branch') {
    const endpointFade = smoothstep(
      clamp((nearest.endpointDistance - 1.4) / 5.8, 0, 1),
    )
    junctionScale *= lerp(.12, 1, endpointFade)

    let crossingDistance = Infinity
    for (const crossing of crossings) {
      crossingDistance = Math.min(
        crossingDistance,
        Math.hypot(x - crossing.x, z - crossing.z),
      )
    }
    const bridgeFade = smoothstep(
      clamp((crossingDistance - 5.5) / 5.5, 0, 1),
    )
    junctionScale *= lerp(.14, 1, bridgeFade)
  }

  const trailStrength = nearest.kind === 'branch' ? .72 : 1
  return clamp(influence * breakup * junctionScale * trailStrength, 0, 1)
}

function distanceToPaths(x: number, z: number, paths: GeneratedWorldPath[]) {
  let best = Infinity
  for (const path of paths) best = Math.min(best, distanceToPolyline(x, z, path.points))
  return best
}

function distanceToPolyline(x: number, z: number, points: GeneratedWorldPoint[]) {
  let best = Infinity
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(x, z, points[index - 1], points[index]))
  }
  return best
}

function segmentIntersection(
  a: GeneratedWorldPoint,
  b: GeneratedWorldPoint,
  c: GeneratedWorldPoint,
  d: GeneratedWorldPoint,
) {
  const rX = b.x - a.x
  const rZ = b.z - a.z
  const sX = d.x - c.x
  const sZ = d.z - c.z
  const denominator = rX * sZ - rZ * sX
  if (Math.abs(denominator) < .00001) return undefined
  const qX = c.x - a.x
  const qZ = c.z - a.z
  const t = (qX * sZ - qZ * sX) / denominator
  const u = (qX * rZ - qZ * rX) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return undefined
  return { x: a.x + rX * t, z: a.z + rZ * t }
}

function distanceToSegment(x: number, z: number, a: GeneratedWorldPoint, b: GeneratedWorldPoint) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  if (lengthSq <= .00001) return Math.hypot(x - a.x, z - a.z)
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
}

function clearingSurfaceInfluence(
  clearings: GeneratedWorldTerrain['clearings'],
  x: number,
  z: number,
  seed: number,
) {
  let best = 0

  for (const clearing of clearings) {
    const dx = x - clearing.x
    const dz = z - clearing.z
    const distance = Math.hypot(dx, dz)
    if (distance > clearing.radius * 1.28) continue

    const localSeed = hashSeed(
      `${seed}:clearing:${Math.round(clearing.x * 10)}:${Math.round(clearing.z * 10)}`,
    )
    const angle = (localSeed % 6283) / 1000
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const rx = dx * cos - dz * sin
    const rz = dx * sin + dz * cos
    const stretch = .76 + ((localSeed >>> 9) % 1000) / 1000 * .48
    const edgeNoise = valueNoise2D(
      x * .095 + 4.4,
      z * .095 - 6.9,
      localSeed ^ 0x68E31DA4,
    )
    const localRadius = clearing.radius * (.82 + edgeNoise * .3)
    const warpedDistance = Math.hypot(rx / stretch, rz * stretch)
    const normalized = warpedDistance / Math.max(.001, localRadius)
    if (normalized >= 1.08) continue

    const interior = valueNoise2D(
      x * .17 - 7.1,
      z * .17 + 2.8,
      localSeed ^ 0xB5297A4D,
    )
    const influence =
      (1 - smoothstep(clamp((normalized - .18) / .88, 0, 1))) *
      (.78 + interior * .22)
    best = Math.max(best, influence)
  }

  return clamp(best, 0, 1)
}

function nearestClearing(x: number, z: number, clearings: GeneratedWorldTerrain['clearings']) {
  let best: { distance: number; radius: number } | undefined
  for (const clearing of clearings) {
    const distance = Math.hypot(x - clearing.x, z - clearing.z)
    if (distance > clearing.radius) continue
    if (!best || distance / clearing.radius < best.distance / best.radius) best = { distance, radius: clearing.radius }
  }
  return best
}

function valueNoise2D(x: number, z: number, seed: number) {
  const x0 = Math.floor(x), z0 = Math.floor(z)
  const tx = smoothstep(x - x0), tz = smoothstep(z - z0)
  const a = hash2D(x0, z0, seed)
  const b = hash2D(x0 + 1, z0, seed)
  const c = hash2D(x0, z0 + 1, seed)
  const d = hash2D(x0 + 1, z0 + 1, seed)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz)
}

function hash2D(x: number, z: number, seed: number) {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed * 69069
  value = Math.imul(value ^ value >>> 13, 1274126177)
  return ((value ^ value >>> 16) >>> 0) / 4294967295
}

function hashSeed(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed || 1
  return () => {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function intRange(random: () => number, min: number, max: number) {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  return Math.floor(low + random() * (high - low + 1))
}

function shuffle<T>(values: T[], random: () => number) {
  const next = [...values]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[next[index], next[target]] = [next[target], next[index]]
  }
  return next
}

function distance2D(a: GeneratedRegionNode, b: GeneratedRegionNode) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function routeFrameAt(
  nodes: GeneratedRegionNode[],
  mainIds: string[],
  nodeId: string,
) {
  const index = mainIds.indexOf(nodeId)
  const node = nodes.find((item) => item.id === nodeId)
  if (!node || index < 0) {
    return {
      tangent: { x: 1, z: 0 },
      normal: { x: 0, z: 1 },
    }
  }

  const previous = nodes.find((item) => item.id === mainIds[Math.max(0, index - 1)])
  const next = nodes.find((item) => item.id === mainIds[Math.min(mainIds.length - 1, index + 1)])
  const tangent = normalized2(
    (next?.x ?? node.x + 1) - (previous?.x ?? node.x - 1),
    (next?.z ?? node.z) - (previous?.z ?? node.z),
  )

  return {
    tangent,
    normal: { x: -tangent.z, z: tangent.x },
  }
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits: number) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
