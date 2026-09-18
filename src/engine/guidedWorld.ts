import type { ForgeRegionDefinition } from './forgeProject'

export type GeneratedRegionNodeKind = 'entry' | 'route' | 'exit' | 'branch' | 'landmark' | 'encounter'
export type WorldPoiType = 'ruins' | 'camp' | 'shrine' | 'standing-stones' | 'beast-den' | 'graveyard' | 'watchtower' | 'settlement' | 'dungeon'
export type WorldDressingType = 'tree' | 'rock' | 'fern' | 'fallen-log' | 'stump'

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
  clearings: Array<{ x: number; z: number; radius: number }>
}

export type WorldGenerationLayerSeeds = {
  terrain: number
  routes: number
  pois: number
  dressing: number
}

export type GeneratedRegion = {
  format: 'forge-generated-region'
  version: 2
  seed: number
  masterSeed: number
  layerSeeds: WorldGenerationLayerSeeds
  generationVersion: number
  regionId: string
  regionName: string
  biome: string
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
  const sizeScale = settings.size === 'small' ? .82 : settings.size === 'large' ? 1.22 : 1
  const chunkCount = Math.max(4, Math.round(intRange(routeRandom, region.chunkRange[0], region.chunkRange[1]) * sizeScale))
  const spacing = 17.5 * sizeScale
  const wanderBase = region.mainPath === 'direct' ? 4 : region.mainPath === 'winding' ? 9 : 14
  const wander = wanderBase * (0.7 + settings.exploration * .7)
  const nodes: GeneratedRegionNode[] = []
  const connections: GeneratedRegionConnection[] = []
  const mainIds: string[] = []

  let z = (routeRandom() - .5) * 10
  for (let index = 0; index <= chunkCount; index += 1) {
    if (index > 0 && index < chunkCount) z += (routeRandom() - .5) * wander
    z = clamp(z, -30 * sizeScale, 30 * sizeScale)
    const id = index === 0 ? 'entry' : index === chunkCount ? 'exit' : `route-${index}`
    const kind: GeneratedRegionNodeKind = index === 0 ? 'entry' : index === chunkCount ? 'exit' : 'route'
    nodes.push({
      id,
      kind,
      x: index * spacing,
      z,
      radius: kind === 'route' ? 9 + settings.openSpace * 4 : 11,
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
    const direction = routeRandom() > .5 ? 1 : -1
    const length = intRange(routeRandom, 1, settings.exploration > .78 ? 3 : 2)
    let previousId = anchor

    for (let step = 1; step <= length; step += 1) {
      const id = `branch-${branchIndex}-${step}`
      const branchNode: GeneratedRegionNode = {
        id,
        kind: 'branch',
        x: anchorNode.x + step * spacing * (.28 + routeRandom() * .32),
        z: anchorNode.z + direction * step * spacing * (.68 + routeRandom() * .22),
        radius: 7 + settings.openSpace * 2.5,
        label: `Side Trail ${branchIndex + 1}`,
        parentId: anchor,
      }
      nodes.push(branchNode)
      connections.push({ id: `branch-link-${branchIndex}-${step}`, from: previousId, to: id, kind: 'branch' })
      previousId = id
    }

    if (settings.loops > .45 && routeRandom() < settings.loops * .55 && usableMain.length > 2) {
      const candidates = nodes.filter((item) => item.kind === 'route' && item.id !== anchor && Math.abs(item.x - anchorNode.x) > spacing * 1.3)
      const reconnect = candidates.sort((a, b) => distance2D(a, nodes.find((item) => item.id === previousId)!) - distance2D(b, nodes.find((item) => item.id === previousId)!))[0]
      if (reconnect && distance2D(reconnect, nodes.find((item) => item.id === previousId)!) < 38 * sizeScale) {
        connections.push({ id: `loop-${branchIndex}`, from: previousId, to: reconnect.id, kind: 'branch' })
      }
    }
  }

  const landmarkCount = Math.max(3, Math.round(intRange(poiRandom, region.landmarkRange[0], region.landmarkRange[1]) * (.75 + settings.poiDensity * .6)))
  const branchEnds = nodes.filter((item) => item.kind === 'branch' && !connections.some((link) => link.kind === 'branch' && link.from === item.id))
  const landmarkTargets = [...branchEnds, ...shuffle(nodes.filter((item) => item.kind === 'route'), poiRandom)]
  const poiTypes = poiPool(region)

  for (let index = 0; index < landmarkCount && landmarkTargets.length; index += 1) {
    const target = landmarkTargets.splice(Math.floor(poiRandom() * landmarkTargets.length), 1)[0]
    const type = poiTypes[Math.floor(poiRandom() * poiTypes.length)]
    const offsetAngle = poiRandom() * Math.PI * 2
    const offsetDistance = target.kind === 'branch' ? 1.5 + poiRandom() * 2 : 3 + poiRandom() * 5
    const node: GeneratedRegionNode = {
      id: `landmark-${index}`,
      kind: 'landmark',
      x: target.x + Math.cos(offsetAngle) * offsetDistance,
      z: target.z + Math.sin(offsetAngle) * offsetDistance,
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
      nodes.push({
        id: 'settlement-1',
        kind: 'landmark',
        x: target.x + 4,
        z: target.z + 5,
        radius: 10,
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
        x: anchor.x + 7 + poiRandom() * 4,
        z: anchor.z + direction * (8 + poiRandom() * 5),
        radius: 7,
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

  const paths = buildWorldPaths(nodes, connections, layerSeeds.routes)

  const combatCandidates = nodes.filter((item) => item.kind === 'route' || item.kind === 'branch')
  const encounterCount = region.enemyDensity === 'high' ? 3 : region.enemyDensity === 'low' ? 1 : 2
  for (let index = 0; index < encounterCount && combatCandidates.length; index += 1) {
    const targetIndex = Math.min(combatCandidates.length - 1, Math.floor((index + 1) / (encounterCount + 1) * combatCandidates.length))
    const target = combatCandidates[targetIndex]
    nodes.push({
      id: `encounter-${index + 1}`,
      kind: 'encounter',
      x: target.x + 2 + poiRandom() * 2,
      z: target.z + (poiRandom() - .5) * 4,
      radius: 5.5,
      label: `${titleCase(region.enemyDensity)} encounter`,
      parentId: target.id,
    })
  }

  const bounds = calculateBounds(nodes, sizeScale)
  const clearings = nodes
    .filter((node) => ['entry', 'route', 'exit', 'landmark', 'encounter'].includes(node.kind))
    .map((node) => ({ x: node.x, z: node.z, radius: node.radius + (node.kind === 'landmark' ? 2 : 0) }))

  const streamResult = settings.water > .08
    ? buildStream(bounds, layerSeeds.terrain, settings.water)
    : { points: [] as GeneratedWorldPoint[], widths: [] as number[] }
  const terrain = buildTerrain(region, bounds, paths, clearings, streamResult.points, streamResult.widths, layerSeeds.terrain)
  const crossings = buildCrossings(paths, streamResult.points, layerSeeds.routes)
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
  const dressing = buildDressing(region, bounds, terrain, paths, pois, layerSeeds.dressing)
  const validation = validateGeneratedRegion(nodes, connections)
  const seed = composeWorldSeed(layerSeeds)

  return {
    format: 'forge-generated-region',
    version: 2,
    seed,
    masterSeed: worldSeed,
    layerSeeds,
    generationVersion,
    regionId: region.id,
    regionName: region.name,
    biome: region.biome,
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

export function validateGeneratedRegion(nodes: GeneratedRegionNode[], connections: GeneratedRegionConnection[]) {
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

  return { valid: issues.length === 0, issues }
}

export function randomWorldSeed() {
  return Math.floor(1000000 + Math.random() * 8999999)
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
    const bend = (random() - .5) * Math.min(link.kind === 'main' ? 7.5 : 5.5, length * .22)
    const secondBend = (random() - .5) * Math.min(link.kind === 'main' ? 3.2 : 2.3, length * .11)
    const baseWidth = link.kind === 'main' ? 3.15 : 1.55
    const points: GeneratedWorldPoint[] = []
    const widths: number[] = []
    const segments = Math.max(10, Math.round(length / 2.35))
    const widthPhase = random() * Math.PI * 2

    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments
      const eased = smoothstep(t)
      const lateral =
        Math.sin(t * Math.PI) * bend +
        Math.sin(t * Math.PI * 2) * secondBend +
        Math.sin(t * Math.PI * 3 + widthPhase) * Math.min(.65, length * .018)
      points.push({
        x: from.x + dx * eased + nx * lateral,
        z: from.z + dz * eased + nz * lateral,
      })
      const junctionBlend = .9 + Math.pow(Math.abs(t - .5) * 2, 2) * .13
      const naturalVariation = 1 + Math.sin(t * Math.PI * 2 + widthPhase) * .07
      widths.push(round(baseWidth * junctionBlend * naturalVariation, 3))
    }

    return [{
      id: link.id,
      kind: link.kind,
      width: baseWidth,
      points,
      widths,
    } satisfies GeneratedWorldPath]
  })
}

function buildStream(bounds: GeneratedRegion['bounds'], seed: number, water: number) {
  const random = seededRandom(hashSeed(`${seed}:stream`))
  const points: GeneratedWorldPoint[] = []
  const widths: number[] = []
  const count = 34
  const baseZ = bounds.minZ + (bounds.maxZ - bounds.minZ) * (.28 + random() * .44)
  const amplitude = 5 + water * 11
  const phaseA = random() * Math.PI * 2
  const phaseB = random() * Math.PI * 2

  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1)
    const x = bounds.minX - 7 + (bounds.maxX - bounds.minX + 14) * t
    const broad = Math.sin(t * Math.PI * 1.45 + phaseA) * amplitude * .46
    const fine = Math.sin(t * Math.PI * 4.1 + phaseB) * amplitude * .18
    const noise = (valueNoise2D(x * .025, baseZ * .025 + t * 2.7, seed ^ 0x27D4EB2D) - .5) * amplitude * .72
    points.push({ x, z: baseZ + broad + fine + noise })
    widths.push(round(1.45 + water * 1.35 + Math.sin(t * Math.PI * 3 + phaseB) * .32, 3))
  }
  return { points, widths }
}

function buildCrossings(paths: GeneratedWorldPath[], stream: GeneratedWorldPoint[], seed: number) {
  if (stream.length < 2) return [] as GeneratedWorldCrossing[]
  const random = seededRandom(hashSeed(`${seed}:crossings`))
  const crossings: GeneratedWorldCrossing[] = []

  for (const path of paths) {
    for (let pathIndex = 1; pathIndex < path.points.length; pathIndex += 1) {
      const a = path.points[pathIndex - 1]
      const b = path.points[pathIndex]
      for (let streamIndex = 1; streamIndex < stream.length; streamIndex += 1) {
        const c = stream[streamIndex - 1]
        const d = stream[streamIndex]
        const hit = segmentIntersection(a, b, c, d)
        if (!hit) continue
        if (crossings.some((item) => Math.hypot(item.x - hit.x, item.z - hit.z) < 8)) continue
        const rotation = Math.atan2(b.z - a.z, b.x - a.x)
        const kind: GeneratedWorldCrossing['kind'] = path.kind === 'main' || random() > .5 ? 'bridge' : 'ford'
        crossings.push({
          id: `crossing-${crossings.length}`,
          kind,
          x: round(hit.x, 3),
          z: round(hit.z, 3),
          rotation: round(rotation, 4),
          width: round((path.width || 2) * (kind === 'bridge' ? 1.55 : 1.85), 3),
          pathId: path.id,
        })
      }
    }
  }
  return crossings
}

function buildTerrain(
  region: ForgeRegionDefinition,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  clearings: GeneratedWorldTerrain['clearings'],
  stream: GeneratedWorldPoint[],
  streamWidths: number[],
  seed: number,
): GeneratedWorldTerrain {
  const settings = worldSettings(region)
  const resolution = settings.size === 'large' ? 53 : settings.size === 'small' ? 39 : 47
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const heights: number[] = []
  const amplitude = (.55 + settings.elevation * 4.7) * (.68 + settings.verticality * .64)
  const waterLevel = -.38 - settings.water * .18

  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * depth
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * width
      const n1 = valueNoise2D(x * .026, z * .026, seed)
      const n2 = valueNoise2D(x * .061 + 17.2, z * .061 - 9.4, seed ^ 0x9E3779B9)
      const n3 = valueNoise2D(x * .13 - 31.8, z * .13 + 11.7, seed ^ 0x85EBCA6B)
      let height = ((n1 - .5) * 1.45 + (n2 - .5) * .58 + (n3 - .5) * .18) * amplitude

      if (settings.cliffs > .08) {
        const ridge = Math.abs(valueNoise2D(x * .035 + 41, z * .035 - 23, seed ^ 0xC2B2AE35) - .5) * 2
        if (ridge > .68) height += (ridge - .68) * 5.5 * settings.cliffs
      }

      if (stream.length > 1) {
        const streamDistance = distanceToPolyline(x, z, stream)
        const valleyWidth = 4.5 + settings.water * 4
        if (streamDistance < valleyWidth) {
          const weight = 1 - streamDistance / valleyWidth
          height = Math.min(height, waterLevel - .12 + (1 - weight) * .7)
        }
      }

      heights.push(round(height, 3))
    }
  }

  return { resolution, width, depth, heights, waterLevel, stream, streamWidths, clearings }
}

function buildDressing(
  region: ForgeRegionDefinition,
  bounds: GeneratedRegion['bounds'],
  terrain: GeneratedWorldTerrain,
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  seed: number,
) {
  const random = seededRandom(seed)
  const settings = worldSettings(region)
  const sizeFactor = settings.size === 'large' ? 1.35 : settings.size === 'small' ? .72 : 1
  const target = Math.round((210 + settings.forestDensity * 500) * sizeFactor)
  const dressing: GeneratedWorldDressing[] = []
  const clusterCount = Math.max(6, Math.round((7 + settings.forestDensity * 10) * sizeFactor))
  const clusters = Array.from({ length: clusterCount }, (_, index) => ({
    x: bounds.minX + random() * (bounds.maxX - bounds.minX),
    z: bounds.minZ + random() * (bounds.maxZ - bounds.minZ),
    radius: 13 + random() * 20,
    strength: .48 + random() * .52,
    phase: index * 1.91 + random() * 4,
  }))
  let attempts = 0

  while (dressing.length < target && attempts < target * 14) {
    attempts += 1
    const x = bounds.minX + random() * (bounds.maxX - bounds.minX)
    const z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ)
    const pathDistance = distanceToPaths(x, z, paths)
    const streamDistance = terrain.stream.length ? distanceToPolyline(x, z, terrain.stream) : Infinity
    const clearing = nearestClearing(x, z, terrain.clearings)
    const poiDistance = pois.reduce((best, poi) => Math.min(best, Math.hypot(x - poi.x, z - poi.z) - poi.radius), Infinity)

    if (pathDistance < 2.45 || streamDistance < 3.1 || poiDistance < 3.8) continue
    const openPenalty = clearing ? clamp(1 - clearing.distance / Math.max(1, clearing.radius), 0, 1) : 0
    if (random() < openPenalty * (.82 + settings.openSpace * .16)) continue

    const edgeDistance = Math.min(
      x - bounds.minX,
      bounds.maxX - x,
      z - bounds.minZ,
      bounds.maxZ - z,
    )
    const edgeBoost = clamp(1 - edgeDistance / 16, 0, 1) * .82
    let clusterDensity = 0
    for (const cluster of clusters) {
      const distance = Math.hypot(x - cluster.x, z - cluster.z)
      if (distance >= cluster.radius) continue
      const influence = 1 - distance / cluster.radius
      clusterDensity = Math.max(clusterDensity, influence * influence * cluster.strength)
    }
    const broadNoise = valueNoise2D(x * .031 + 12.3, z * .031 - 17.7, seed ^ 0xA24BAED4)
    const density = clamp(
      settings.forestDensity * (.18 + clusterDensity * 1.08 + broadNoise * .42) + edgeBoost,
      0,
      1,
    )
    if (random() > density) continue

    const roll = random()
    let type: WorldDressingType
    const treeThreshold = clamp(.42 + density * .46, .48, .9)
    if (roll < treeThreshold) type = 'tree'
    else if (roll < treeThreshold + .12) type = 'rock'
    else if (roll < treeThreshold + .22) type = 'fern'
    else if (roll < treeThreshold + .28) type = 'fallen-log'
    else type = 'stump'

    const y = sampleTerrainHeight({ terrain, bounds }, x, z)
    const clusterVariation = .88 + broadNoise * .26
    dressing.push({
      id: `dress-${dressing.length}`,
      type,
      x: round(x, 2),
      y: round(y, 2),
      z: round(z, 2),
      scale: round(
        type === 'tree'
          ? (.7 + random() * .9) * clusterVariation
          : (.55 + random() * .82) * clusterVariation,
        2,
      ),
      rotation: round(random() * Math.PI * 2, 3),
      variant: Math.floor(random() * 4),
    })
  }

  return dressing
}

function poiPool(region: ForgeRegionDefinition): WorldPoiType[] {
  const features = new Set(region.features.map((feature) => feature.toLowerCase()))
  const pool: WorldPoiType[] = ['ruins', 'camp', 'shrine', 'standing-stones', 'beast-den', 'watchtower']
  if (features.has('grave clusters') || features.has('graveyards')) pool.push('graveyard')
  if (features.has('ruins')) pool.push('ruins', 'watchtower')
  return pool
}

function poiRadius(type: WorldPoiType) {
  if (type === 'settlement') return 10
  if (type === 'watchtower' || type === 'dungeon') return 7
  if (type === 'graveyard' || type === 'ruins') return 6.5
  return 5.5
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
  const margin = 19 * sizeScale
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  }
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
