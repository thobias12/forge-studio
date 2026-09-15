import type { GeneratedRegion } from '../engine/guidedWorld'

type Props = {
  region: GeneratedRegion
  showRoute: boolean
  showBranches: boolean
  showLandmarks: boolean
  showBiome: boolean
}

export default function WorldForgeViewport({ region, showRoute, showBranches, showLandmarks, showBiome }: Props) {
  const width = Math.max(1, region.bounds.maxX - region.bounds.minX)
  const depth = Math.max(1, region.bounds.maxZ - region.bounds.minZ)
  const point = (x: number, z: number) => ({
    x: ((x - region.bounds.minX) / width) * 1000,
    y: ((z - region.bounds.minZ) / depth) * 600,
  })

  return (
    <div className={`world-forge-map biome-${slug(region.biome)}`}>
      <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${region.regionName} generated region preview`}>
        <defs>
          <pattern id="forge-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" opacity=".1"/></pattern>
          <filter id="forge-glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect width="1000" height="600" className="world-forge-map-bg"/>
        <rect width="1000" height="600" fill="url(#forge-grid)"/>
        {showBiome && <path className="world-forge-biome-field" d="M0 78 C180 10 286 96 430 56 C590 12 690 112 1000 36 L1000 600 L0 600 Z"/>}
        {region.connections.map((link) => {
          if (link.kind === 'main' && !showRoute) return null
          if (link.kind === 'branch' && !showBranches) return null
          const from = region.nodes.find((node) => node.id === link.from)
          const to = region.nodes.find((node) => node.id === link.to)
          if (!from || !to) return null
          const a = point(from.x, from.z), b = point(to.x, to.z)
          return <line key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`world-forge-link ${link.kind}`}/>
        })}
        {region.nodes.map((node) => {
          if (node.kind === 'landmark' && !showLandmarks) return null
          if (node.kind === 'branch' && !showBranches) return null
          if (['entry','route','exit'].includes(node.kind) && !showRoute) return null
          const p = point(node.x, node.z)
          return <g key={node.id} className={`world-forge-node ${node.kind}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r={node.kind === 'entry' || node.kind === 'exit' ? 15 : node.kind === 'landmark' ? 10 : 8}/>
            {(node.kind === 'entry' || node.kind === 'exit' || node.kind === 'landmark' || node.kind === 'encounter') && <text y={-18} textAnchor="middle">{node.label}</text>}
          </g>
        })}
      </svg>
      <div className="world-forge-map-legend">
        <span><i className="main"/>Main route</span><span><i className="branch"/>Exploration</span><span><i className="landmark"/>Landmark</span><span><i className="encounter"/>Encounter</span>
      </div>
    </div>
  )
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
