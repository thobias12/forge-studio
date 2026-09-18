import type { ForgeRegionDefinition } from './forgeProject'

export type GeneratedRegionNodeKind = 'entry' | 'route' | 'exit' | 'branch' | 'landmark' | 'encounter'
export type WorldPoiType = 'ruins' | 'camp' | 'shrine' | 'standing-stones' | 'beast-den' | 'graveyard' | 'watchtower' | 'settlement' | 'dungeon'
export type WorldDressingType = 'tree' | 'rock' | 'fern' | 'fallen-log' | 'stump' | 'grass' | 'shrub' | 'reeds'
export type WorldMicroBiomeType = 'forest-floor' | 'moss' | 'meadow' | 'scrub' | 'rocky'

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
  let poiCycle = shuffle([...new Set(poiTypes)], poiRandom)

  for (let index = 0; index < landmarkCount && landmarkTargets.length; index += 1) {
    const target = landmarkTargets.splice(Math.floor(poiRandom() * landmarkTargets.length), 1)[0]
    if (!poiCycle.length) poiCycle = shuffle([...new Set(poiTypes)], poiRandom)
    const type = poiCycle.shift() ?? 'ruins'
    const offsetAngle = poiRandom() * Math.PI * 2
    const baseOffset = poiApproachDistance(type)
    const offsetDistance = target.kind === 'branch'
      ? baseOffset * (.64 + poiRandom() * .24)
      : baseOffset * (.9 + poiRandom() * .32)
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
  smoothWorldJunctions(paths, nodes)
  shapeLandmarkApproaches(paths, nodes)

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
  const terrainDraft = buildTerrain(region, bounds, paths, clearings, pois, layerSeeds.terrain)
  const crossings = buildCrossings(paths, terrainDraft.stream, layerSeeds.routes, settings)
  const terrain = buildTerrain(region, bounds, paths, clearings, pois, layerSeeds.terrain)
  const dressing = buildDressing(region, bounds, terrain, paths, pois, layerSeeds.dressing)
  const validation = validateGeneratedRegion(nodes, connections)
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
    const radius = poi.radius * (poi.type === 'settlement' ? 1.22 : 1.08)
    if (distance > radius * 1.4) continue

    const localNoise = valueNoise2D(
      (x - poi.x) * .16 + hashSeed(poi.id) % 17,
      (z - poi.z) * .16 - hashSeed(poi.id) % 13,
      seed ^ hashSeed(poi.id),
    )
    const irregularRadius = radius * (.82 + localNoise * .34)
    const normalized = distance / Math.max(.001, irregularRadius)
    const influence = 1 - smoothstep(clamp((normalized - .45) / .7, 0, 1))
    const strength = poi.type === 'settlement' || poi.type === 'camp'
      ? 1
      : poi.type === 'graveyard' || poi.type === 'ruins'
        ? .76
        : poi.type === 'watchtower' || poi.type === 'dungeon'
          ? .68
          : .52
    poiWear = Math.max(poiWear, influence * strength)
    poiSoil = Math.max(poiSoil, influence * (poi.type === 'camp' || poi.type === 'settlement' ? .94 : .62))
  }

  const micro = microBiomeInfluence(region.terrain.microBiomes, x, z)
  const crossingWear = crossingApproachWear(region.crossings, x, z)
  const roadWear = Math.max(pathEdgeWear(region.paths, x, z), crossingWear * .7)
  const forestFloor = clamp((.58 - broad) * .9 + (medium - .5) * .28 + micro['forest-floor'] * .92, 0, 1)
  const moss = clamp((broad - .42) * .85 + (fine - .5) * .22 + micro.moss * 1.02, 0, 1)
  const soil = clamp((medium - .48) * .7 + (1 - broad) * .18 + poiSoil + micro.rocky * .2 + roadWear * .76 + crossingWear * .38, 0, 1)

  return {
    broad,
    medium,
    fine,
    forestFloor,
    moss,
    soil,
    meadow: micro.meadow,
    scrub: micro.scrub,
    rocky: micro.rocky,
    roadWear,
    crossingWear,
    poiWear: clamp(poiWear, 0, 1),
  }
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
    const baseWidth = link.kind === 'main' ? 3.15 : 1.32
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
    const mainAxis = main.length >= 2 ? junctionMainAxis(node, main) : undefined
    const sharedMainWidth = main.length ? Math.max(...main.map((path) => path.width)) : 0

    for (const path of connected) {
      const atStart = path.fromNodeId === nodeId
      const endpointIndex = atStart ? 0 : path.points.length - 1
      const neighborIndex = atStart ? 1 : path.points.length - 2
      const secondIndex = atStart ? 2 : path.points.length - 3
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
          away.x * .82 + alongMain.x * .18,
          away.z * .82 + alongMain.z * .18,
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
          ? Math.min(path.width * .94, sharedMainWidth * .44)
          : path.width * .94
      path.widths[endpointIndex] = round(endpointWidth, 3)
      if (path.widths[neighborIndex] !== undefined) {
        path.widths[neighborIndex] = round(lerp(endpointWidth, path.width, .58), 3)
      }
      if (path.widths[secondIndex] !== undefined) {
        path.widths[secondIndex] = round(lerp(endpointWidth, path.width, .82), 3)
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
        const centerQuality = 1 - Math.abs(streamT - .5) * 2
        candidates.push({
          path,
          pathIndex,
          streamIndex,
          hit,
          rotation: Math.atan2(b.z - a.z, b.x - a.x),
          score:
            (path.kind === 'main' ? 8 : 2.5) +
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
      const kind: GeneratedWorldCrossing['kind'] =
        index === 0 || candidate.path.kind === 'main'
          ? 'bridge'
          : 'ford'
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

  // Every road that touches the river is routed toward one of the planned crossings.
  // This makes the river a meaningful navigation barrier instead of a row of bridges.
  const byPath = new Map<string, CrossingCandidate[]>()
  for (const candidate of candidates) {
    const list = byPath.get(candidate.path.id) ?? []
    list.push(candidate)
    byPath.set(candidate.path.id, list)
  }

  for (const [pathId, pathCandidates] of byPath) {
    const path = pathCandidates[0].path
    const alreadySelected = selected.find(({ candidate }) => candidate.path.id === pathId)
    if (alreadySelected) {
      shapePathAtCrossing(path, alreadySelected.crossing)
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
  for (const [offset, distance] of [[-2, 4.6], [-1, 2.35], [1, 2.35], [2, 4.6]] as const) {
    const index = pivot + offset
    if (index <= 0 || index >= path.points.length - 1) continue
    const sign = offset < 0 ? -1 : 1
    path.points[index] = {
      x: crossing.x + direction.x * distance * sign,
      z: crossing.z + direction.z * distance * sign,
    }
    if (path.widths[index] !== undefined) {
      path.widths[index] = round(path.width * (Math.abs(offset) === 1 ? .96 : .9), 3)
    }
  }
  if (path.widths[pivot] !== undefined) path.widths[pivot] = round(path.width * .98, 3)
}


function buildTerrain(
  region: ForgeRegionDefinition,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  clearings: GeneratedWorldTerrain['clearings'],
  pois: GeneratedWorldPoi[],
  seed: number,
): GeneratedWorldTerrain {
  const settings = worldSettings(region)
  const resolution = settings.size === 'large' ? 73 : settings.size === 'small' ? 53 : 65
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const heights: number[] = []
  const amplitude = (.55 + settings.elevation * 4.7) * (.68 + settings.verticality * .64)

  // Pass 1: build uninterrupted land. Water does not dictate the shape yet.
  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * depth
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * width
      const n0 = valueNoise2D(x * .011 - 8.6, z * .011 + 14.2, seed ^ 0x27D4EB2D)
      const n1 = valueNoise2D(x * .026, z * .026, seed)
      const n2 = valueNoise2D(x * .061 + 17.2, z * .061 - 9.4, seed ^ 0x9E3779B9)
      const n3 = valueNoise2D(x * .13 - 31.8, z * .13 + 11.7, seed ^ 0x85EBCA6B)
      const valley = valueNoise2D(x * .0075 + 23.1, z * .0075 - 17.4, seed ^ 0xB5297A4D)
      let height = ((n0 - .5) * .86 + (n1 - .5) * 1.5 + (n2 - .5) * .58 + (n3 - .5) * .18 + (valley - .5) * .52) * amplitude

      if (settings.cliffs > .08) {
        const ridge = Math.abs(valueNoise2D(x * .035 + 41, z * .035 - 23, seed ^ 0xC2B2AE35) - .5) * 2
        if (ridge > .68) height += (ridge - .68) * 5.5 * settings.cliffs
      }
      heights.push(round(height, 4))
    }
  }

  // Pass 2: solve a low-cost route over the actual heightfield and make it flow from
  // the higher map edge toward the lower one.
  const hydrology = settings.water > .08
    ? solveHydrology(bounds, resolution, heights, seed, settings.water)
    : { points: [] as GeneratedWorldPoint[], widths: [] as number[], heights: [] as number[] }

  // Pass 3: carve a bed and sloped banks into the heightfield around that route.
  if (hydrology.points.length > 1) {
    for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
      const z = bounds.minZ + zIndex / (resolution - 1) * depth
      for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
        const x = bounds.minX + xIndex / (resolution - 1) * width
        const index = zIndex * resolution + xIndex
        const sample = nearestHydrologySample(x, z, hydrology.points, hydrology.widths, hydrology.heights)
        const bankWidth = sample.width * 2.15 + 2.8
        if (sample.distance >= bankWidth) continue

        const normalized = sample.distance / Math.max(.001, bankWidth)
        const channel = 1 - smoothstep(clamp(normalized, 0, 1))
        const bedTarget = sample.height - .34 + Math.pow(normalized, 1.45) * 1.08
        heights[index] = round(Math.min(heights[index], lerp(heights[index], bedTarget, channel * .94)), 4)
      }
    }
  }

  // Pass 4: preserve readable hills while relaxing the terrain immediately under roads.
  // This keeps the broad landscape stronger without turning traversal routes into rollercoasters.
  const preRoadHeights = [...heights]
  for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
    const z = bounds.minZ + zIndex / (resolution - 1) * depth
    for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
      const x = bounds.minX + xIndex / (resolution - 1) * width
      const nearest = nearestPathSample(paths, x, z)
      if (!nearest) continue
      const corridor = nearest.width * .7 + (nearest.kind === 'main' ? 2.7 : 1.8)
      if (nearest.distance >= corridor) continue
      if (hydrology.points.length > 1) {
        const river = nearestHydrologySample(x, z, hydrology.points, hydrology.widths, hydrology.heights)
        if (river.distance < river.width * 1.9 + 1.6) continue
      }
      const influence = 1 - smoothstep(clamp(nearest.distance / corridor, 0, 1))
      const targetHeight = sampleGridHeight(bounds, resolution, preRoadHeights, nearest.x, nearest.z)
      const index = zIndex * resolution + xIndex
      heights[index] = round(lerp(heights[index], targetHeight, influence * (nearest.kind === 'main' ? .72 : .56)), 4)
    }
  }

  // Pass 5: POIs gently terrace the existing landscape instead of placing a flat disc.
  for (const poi of pois) {
    const centerHeight = sampleGridHeight(bounds, resolution, heights, poi.x, poi.z)
    for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
      const z = bounds.minZ + zIndex / (resolution - 1) * depth
      for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
        const x = bounds.minX + xIndex / (resolution - 1) * width
        const distance = Math.hypot(x - poi.x, z - poi.z)
        const terraceRadius = poi.radius * (poi.type === 'settlement' ? 1.02 : .78)
        if (distance >= terraceRadius) continue
        const riverDistance = hydrology.points.length > 1 ? distanceToPolyline(x, z, hydrology.points) : Infinity
        if (riverDistance < 3.5) continue
        const influence = 1 - smoothstep(clamp(distance / terraceRadius, 0, 1))
        const index = zIndex * resolution + xIndex
        heights[index] = round(lerp(heights[index], centerHeight, influence * .48), 4)
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
    seed,
    settings,
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
    stream: hydrology.points,
    streamWidths: hydrology.widths,
    streamHeights: hydrology.heights,
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

  const random = seededRandom(hashSeed(`${seed}:hydrology-width`))
  const widths = points.map((_, index) => {
    const t = index / Math.max(1, points.length - 1)
    const pulse = Math.sin(t * Math.PI * 4 + random() * .35) * .16
    return round(1.15 + water * 1.05 + t * (.75 + water * .75) + pulse, 3)
  })

  const streamHeights: number[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const raw = sampleGridHeight(bounds, resolution, heights, point.x, point.z) - .18
    if (index === 0) streamHeights.push(raw)
    else streamHeights.push(Math.min(raw, streamHeights[index - 1] - .006))
  }

  return {
    points,
    widths,
    heights: streamHeights.map((height) => round(height, 3)),
  }
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
  seed: number,
  settings: ReturnType<typeof worldSettings>,
) {
  const random = seededRandom(hashSeed(`${seed}:micro-biomes`))
  const count = Math.round((settings.size === 'large' ? 28 : settings.size === 'small' ? 16 : 22) * (.92 + settings.openSpace * .34))
  const biomes: GeneratedMicroBiome[] = []

  for (let index = 0; index < count; index += 1) {
    const x = bounds.minX + random() * (bounds.maxX - bounds.minX)
    const z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ)
    const height = sampleGridHeight(bounds, resolution, heights, x, z)
    const streamDistance = stream.length > 1 ? distanceToPolyline(x, z, stream) : Infinity
    const pathDistance = distanceToPaths(x, z, paths)
    const clearing = nearestClearing(x, z, clearings)
    const noise = valueNoise2D(x * .037 + 5.2, z * .037 - 11.4, seed ^ 0xD3A2646C)

    let type: WorldMicroBiomeType
    if (streamDistance < 8) type = 'moss'
    else if (height > .95 + settings.elevation * .8 || noise > .82) type = 'rocky'
    else if (clearing || (noise > .63 && pathDistance < 12)) type = 'meadow'
    else if (noise < .34) type = 'forest-floor'
    else type = 'scrub'

    biomes.push({
      id: `micro-${index}`,
      type,
      x: round(x, 2),
      z: round(z, 2),
      radius: round(10 + random() * 15, 2),
      strength: round(.58 + random() * .3, 3),
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
          ? .64
          : .42 + ((lobeSeed >>> 17) % 1000) / 1000 * .22
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
  bounds: GeneratedRegion['bounds'],
  terrain: GeneratedWorldTerrain,
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  seed: number,
) {
  const random = seededRandom(seed)
  const settings = worldSettings(region)
  const sizeFactor = settings.size === 'large' ? 1.35 : settings.size === 'small' ? .72 : 1
  const target = Math.round((250 + settings.forestDensity * 560) * sizeFactor)
  const dressing: GeneratedWorldDressing[] = []
  const clusterCount = Math.max(6, Math.round((7 + settings.forestDensity * 10) * sizeFactor))
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: bounds.minX + random() * (bounds.maxX - bounds.minX),
    z: bounds.minZ + random() * (bounds.maxZ - bounds.minZ),
    radius: 13 + random() * 20,
    strength: .48 + random() * .52,
  }))
  let attempts = 0

  while (dressing.length < target && attempts < target * 16) {
    attempts += 1
    const x = bounds.minX + random() * (bounds.maxX - bounds.minX)
    const z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ)
    const pathDistance = distanceToPaths(x, z, paths)
    const streamDistance = terrain.stream.length ? distanceToPolyline(x, z, terrain.stream) : Infinity
    const clearing = nearestClearing(x, z, terrain.clearings)
    const poiDistance = pois.reduce((best, poi) => Math.min(best, Math.hypot(x - poi.x, z - poi.z) - poi.radius), Infinity)
    const micro = microBiomeInfluence(terrain.microBiomes, x, z)

    if (pathDistance < 2.35 || poiDistance < 3.6 || streamDistance < 1.15) continue
    const openPenalty = clearing ? clamp(1 - clearing.distance / Math.max(1, clearing.radius), 0, 1) : 0
    if (random() < openPenalty * (.76 + settings.openSpace * .18)) continue

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
    let density = clamp(
      settings.forestDensity * (.18 + clusterDensity * 1.08 + broadNoise * .42) + edgeBoost,
      0,
      1,
    )
    density *= 1 - micro.meadow * .72
    density *= 1 - micro.rocky * .18
    density += micro['forest-floor'] * .12 + micro.scrub * .08

    const nearRiver = streamDistance < 5
    if (!nearRiver && random() > clamp(density, .05, 1)) continue

    const roll = random()
    let type: WorldDressingType
    const treeThreshold = clamp(.4 + density * .44, .42, .88)

    if (nearRiver && random() < .58) type = 'reeds'
    else if (micro.rocky > .45 && roll < .58) type = 'rock'
    else if (micro.meadow > .42 && roll < .66) type = roll < .38 ? 'grass' : 'shrub'
    else if (micro.scrub > .42 && roll < .68) type = roll < .42 ? 'shrub' : 'fern'
    else if (roll < treeThreshold) type = 'tree'
    else if (roll < treeThreshold + .1) type = 'rock'
    else if (roll < treeThreshold + .19) type = 'fern'
    else if (roll < treeThreshold + .25) type = 'fallen-log'
    else if (roll < treeThreshold + .3) type = 'stump'
    else type = random() > .5 ? 'shrub' : 'grass'

    const y = sampleTerrainHeight({ terrain, bounds }, x, z)
    const clusterVariation = .88 + broadNoise * .26
    const baseScale = type === 'tree'
      ? .7 + random() * .9
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

  appendRiverbankDressing(dressing, terrain, bounds, paths, pois, random)
  return dressing
}

function appendRiverbankDressing(
  dressing: GeneratedWorldDressing[],
  terrain: GeneratedWorldTerrain,
  bounds: GeneratedRegion['bounds'],
  paths: GeneratedWorldPath[],
  pois: GeneratedWorldPoi[],
  random: () => number,
) {
  if (terrain.stream.length < 4) return
  for (let index = 2; index < terrain.stream.length - 2; index += 3) {
    const point = terrain.stream[index]
    const prev = terrain.stream[index - 1]
    const next = terrain.stream[index + 1]
    const tangent = normalized2(next.x - prev.x, next.z - prev.z)
    const normal = { x: -tangent.z, z: tangent.x }
    const width = terrain.streamWidths[index] ?? 2

    for (const side of [-1, 1]) {
      const clusterSize = 1 + Math.floor(random() * 3)
      for (let itemIndex = 0; itemIndex < clusterSize; itemIndex += 1) {
        const bankOffset = width * .7 + 1 + random() * 2.4
        const along = (random() - .5) * 4.2
        const x = point.x + normal.x * bankOffset * side + tangent.x * along
        const z = point.z + normal.z * bankOffset * side + tangent.z * along
        if (x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ) continue
        if (distanceToPaths(x, z, paths) < 2) continue
        if (pois.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.radius + 2)) continue

        const roll = random()
        const type: WorldDressingType = roll < .5 ? 'reeds' : roll < .78 ? 'rock' : 'shrub'
        dressing.push({
          id: `riverbank-${index}-${side}-${itemIndex}`,
          type,
          x: round(x, 2),
          y: round(sampleTerrainHeight({ terrain, bounds }, x, z), 2),
          z: round(z, 2),
          scale: round(type === 'rock' ? .55 + random() * .65 : .5 + random() * .55, 2),
          rotation: round(random() * Math.PI * 2, 3),
          variant: Math.floor(random() * 4),
        })
      }
    }
  }
}

function poiPool(region: ForgeRegionDefinition): WorldPoiType[] {
  const features = new Set(region.features.map((feature) => feature.toLowerCase()))
  const pool: WorldPoiType[] = ['ruins', 'camp', 'shrine', 'standing-stones', 'beast-den', 'watchtower']
  if (features.has('grave clusters') || features.has('graveyards')) pool.push('graveyard')
  if (features.has('ruins')) pool.push('ruins', 'watchtower')
  return pool
}

function poiApproachDistance(type: WorldPoiType) {
  if (type === 'watchtower' || type === 'ruins') return 10.5
  if (type === 'graveyard' || type === 'standing-stones') return 9
  if (type === 'beast-den') return 11.5
  if (type === 'camp') return 8
  if (type === 'shrine') return 7
  return 9
}

function poiRadius(type: WorldPoiType) {
  if (type === 'settlement') return 11
  if (type === 'camp') return 7.2
  if (type === 'watchtower' || type === 'dungeon') return 7.8
  if (type === 'graveyard' || type === 'ruins') return 7.4
  if (type === 'standing-stones' || type === 'beast-den') return 6.8
  if (type === 'shrine') return 6.2
  return 5.8
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

function nearestPathSample(paths: GeneratedWorldPath[], x: number, z: number) {
  let best: { distance: number; x: number; z: number; width: number; kind: GeneratedWorldPath['kind'] } | undefined
  for (const path of paths) {
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
      best = { distance, x: px, z: pz, width, kind: path.kind }
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
    const alongRadius = crossing.kind === 'bridge' ? 7.2 : 5.6
    const acrossRadius = Math.max(2.4, crossing.width * 1.15)
    const normalized = Math.hypot(along / alongRadius, across / acrossRadius)
    if (normalized >= 1) continue
    best = Math.max(best, 1 - smoothstep(clamp(normalized, 0, 1)))
  }
  return best
}

function pathEdgeWear(paths: GeneratedWorldPath[], x: number, z: number) {
  let best = 0
  for (const path of paths) {
    const distance = distanceToPolyline(x, z, path.points)
    const halfWidth = path.width * .5
    const fade = path.kind === 'main' ? path.width * .9 + .9 : path.width * 1.05 + .65
    if (distance > halfWidth + fade) continue
    const edgeDistance = Math.max(0, distance - halfWidth)
    const influence = 1 - smoothstep(clamp(edgeDistance / Math.max(.001, fade), 0, 1))
    best = Math.max(best, influence)
  }
  return best
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
