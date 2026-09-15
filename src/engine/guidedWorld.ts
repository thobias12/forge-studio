import type { ForgeRegionDefinition } from './forgeProject'

export type GeneratedRegionNodeKind = 'entry' | 'route' | 'exit' | 'branch' | 'landmark' | 'encounter'

export type GeneratedRegionNode = {
  id: string
  kind: GeneratedRegionNodeKind
  x: number
  z: number
  radius: number
  label: string
  parentId?: string
}

export type GeneratedRegionConnection = {
  id: string
  from: string
  to: string
  kind: 'main' | 'branch'
}

export type GeneratedRegion = {
  format: 'forge-generated-region'
  version: 1
  seed: number
  generationVersion: number
  regionId: string
  regionName: string
  biome: string
  nodes: GeneratedRegionNode[]
  connections: GeneratedRegionConnection[]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  validation: { valid: boolean; issues: string[] }
}

export function generateGuidedRegion(region: ForgeRegionDefinition, worldSeed: number, generationVersion: number): GeneratedRegion {
  const random = seededRandom(hashSeed(`${worldSeed}:${generationVersion}:${region.id}`))
  const chunkCount = intRange(random, region.chunkRange[0], region.chunkRange[1])
  const spacing = 16
  const wander = region.mainPath === 'direct' ? 3.5 : region.mainPath === 'winding' ? 8 : 12
  const nodes: GeneratedRegionNode[] = []
  const connections: GeneratedRegionConnection[] = []
  const mainIds: string[] = []

  let z = (random() - 0.5) * 8
  for (let index = 0; index <= chunkCount; index += 1) {
    if (index > 0 && index < chunkCount) z += (random() - 0.5) * wander
    z = clamp(z, -24, 24)
    const id = index === 0 ? 'entry' : index === chunkCount ? 'exit' : `route-${index}`
    const kind: GeneratedRegionNodeKind = index === 0 ? 'entry' : index === chunkCount ? 'exit' : 'route'
    nodes.push({ id, kind, x: index * spacing, z, radius: kind === 'route' ? 8.5 : 10, label: kind === 'entry' ? 'Entry' : kind === 'exit' ? 'Exit' : `Clearing ${index}` })
    mainIds.push(id)
    if (index > 0) connections.push({ id: `main-${index - 1}-${index}`, from: mainIds[index - 1], to: id, kind: 'main' })
  }

  const branchCount = intRange(random, region.branchRange[0], region.branchRange[1])
  const usableMain = mainIds.slice(1, -1)
  const usedAnchors = new Set<string>()
  for (let branchIndex = 0; branchIndex < branchCount && usableMain.length; branchIndex += 1) {
    let anchor = usableMain[Math.floor(random() * usableMain.length)]
    let guard = 0
    while (usedAnchors.has(anchor) && guard < 8) {
      anchor = usableMain[Math.floor(random() * usableMain.length)]
      guard += 1
    }
    usedAnchors.add(anchor)
    const anchorNode = nodes.find((item) => item.id === anchor)!
    const direction = random() > 0.5 ? 1 : -1
    const length = intRange(random, 1, 3)
    let previousId = anchor
    for (let step = 1; step <= length; step += 1) {
      const id = `branch-${branchIndex}-${step}`
      const branchNode: GeneratedRegionNode = {
        id,
        kind: 'branch',
        x: anchorNode.x + step * spacing * (0.35 + random() * 0.22),
        z: anchorNode.z + direction * step * spacing * (0.72 + random() * 0.16),
        radius: 7.5,
        label: `Side path ${branchIndex + 1}`,
        parentId: anchor,
      }
      nodes.push(branchNode)
      connections.push({ id: `branch-link-${branchIndex}-${step}`, from: previousId, to: id, kind: 'branch' })
      previousId = id
    }
  }

  const landmarkCount = intRange(random, region.landmarkRange[0], region.landmarkRange[1])
  const branchEnds = nodes.filter((item) => item.kind === 'branch' && !connections.some((link) => link.kind === 'branch' && link.from === item.id))
  const landmarkTargets = [...branchEnds, ...nodes.filter((item) => item.kind === 'route')]
  for (let index = 0; index < landmarkCount && landmarkTargets.length; index += 1) {
    const target = landmarkTargets.splice(Math.floor(random() * landmarkTargets.length), 1)[0]
    const feature = region.features[Math.floor(random() * Math.max(1, region.features.length))] ?? 'Landmark'
    nodes.push({
      id: `landmark-${index}`,
      kind: 'landmark',
      x: target.x + (random() - 0.5) * 5,
      z: target.z + (random() - 0.5) * 5,
      radius: 4.5,
      label: titleCase(feature),
      parentId: target.id,
    })
  }

  const combatCandidates = nodes.filter((item) => item.kind === 'route')
  if (combatCandidates.length) {
    const target = combatCandidates[Math.floor(combatCandidates.length * (0.45 + random() * 0.35))]
    nodes.push({
      id: 'encounter-1',
      kind: 'encounter',
      x: target.x + 2.5,
      z: target.z - 1.5,
      radius: 5,
      label: `${titleCase(region.enemyDensity)} encounter`,
      parentId: target.id,
    })
  }

  const bounds = calculateBounds(nodes)
  const validation = validateGeneratedRegion(nodes, connections)
  return {
    format: 'forge-generated-region',
    version: 1,
    seed: worldSeed,
    generationVersion,
    regionId: region.id,
    regionName: region.name,
    biome: region.biome,
    nodes,
    connections,
    bounds,
    validation,
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
  }

  for (const link of connections) {
    const from = nodes.find((item) => item.id === link.from)
    const to = nodes.find((item) => item.id === link.to)
    if (!from || !to) issues.push(`Broken connection ${link.id}.`)
    else if (Math.hypot(to.x - from.x, to.z - from.z) > 32) issues.push(`Connection ${link.id} is too long for reliable traversal.`)
  }

  return { valid: issues.length === 0, issues }
}

export function randomWorldSeed() {
  return Math.floor(1000000 + Math.random() * 8999999)
}

function calculateBounds(nodes: GeneratedRegionNode[]) {
  const xs = nodes.map((node) => node.x)
  const zs = nodes.map((node) => node.z)
  return {
    minX: Math.min(...xs) - 14,
    maxX: Math.max(...xs) + 14,
    minZ: Math.min(...zs) - 14,
    maxZ: Math.max(...zs) + 14,
  }
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
