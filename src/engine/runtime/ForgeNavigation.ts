import * as THREE from 'three'

export type ForgeNavigationBounds = { minX: number; maxX: number; minZ: number; maxZ: number }
export type ForgeNavigationObstacle = { x: number; z: number; radius: number }

type Cell = { x: number; z: number }

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const

export class ForgeNavigationGrid {
  private readonly cols: number
  private readonly rows: number
  private readonly blocked: Uint8Array

  constructor(
    private readonly bounds: ForgeNavigationBounds,
    private readonly obstacles: ForgeNavigationObstacle[],
    private readonly cellSize = 1.75,
    private readonly clearance = 0.72,
  ) {
    this.cols = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / cellSize) + 1)
    this.rows = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize) + 1)
    this.blocked = new Uint8Array(this.cols * this.rows)
    for (let z = 0; z < this.rows; z += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        const point = this.cellToWorld({ x, z })
        if (obstacles.some((obstacle) => Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < obstacle.radius + clearance)) {
          this.blocked[this.index(x, z)] = 1
        }
      }
    }
  }

  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, radius = 0.55) {
    for (const obstacle of this.obstacles) {
      if (distancePointToSegment(obstacle.x, obstacle.z, from.x, from.z, to.x, to.z) < obstacle.radius + radius) return false
    }
    return true
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3) {
    if (this.hasLineOfSight(from, to)) return [new THREE.Vector3(to.x, 0, to.z)]
    const start = this.nearestWalkable(this.worldToCell(from))
    const goal = this.nearestWalkable(this.worldToCell(to))
    if (!start || !goal) return [new THREE.Vector3(to.x, 0, to.z)]

    const startIndex = this.index(start.x, start.z)
    const goalIndex = this.index(goal.x, goal.z)
    const size = this.cols * this.rows
    const g = new Float32Array(size); g.fill(Number.POSITIVE_INFINITY)
    const f = new Float32Array(size); f.fill(Number.POSITIVE_INFINITY)
    const parent = new Int32Array(size); parent.fill(-1)
    const open = new Set<number>([startIndex])
    g[startIndex] = 0
    f[startIndex] = heuristic(start, goal)
    let iterations = 0

    while (open.size && iterations < size * 2) {
      iterations += 1
      let current = -1
      let best = Number.POSITIVE_INFINITY
      for (const candidate of open) {
        if (f[candidate] < best) { best = f[candidate]; current = candidate }
      }
      if (current === goalIndex) break
      open.delete(current)
      const cell = this.fromIndex(current)

      for (const [dx, dz, cost] of NEIGHBORS) {
        const nx = cell.x + dx
        const nz = cell.z + dz
        if (!this.walkable(nx, nz)) continue
        if (dx !== 0 && dz !== 0 && (!this.walkable(cell.x + dx, cell.z) || !this.walkable(cell.x, cell.z + dz))) continue
        const nextIndex = this.index(nx, nz)
        const tentative = g[current] + cost
        if (tentative >= g[nextIndex]) continue
        parent[nextIndex] = current
        g[nextIndex] = tentative
        f[nextIndex] = tentative + heuristic({ x: nx, z: nz }, goal)
        open.add(nextIndex)
      }
    }

    if (goalIndex !== startIndex && parent[goalIndex] === -1) return [new THREE.Vector3(to.x, 0, to.z)]
    const cells: Cell[] = []
    let current = goalIndex
    cells.push(this.fromIndex(current))
    while (current !== startIndex && parent[current] !== -1) {
      current = parent[current]
      cells.push(this.fromIndex(current))
    }
    cells.reverse()
    const points = cells.slice(1).map((cell) => this.cellToWorld(cell))
    if (!points.length) points.push(new THREE.Vector3(to.x, 0, to.z))
    else points[points.length - 1].set(to.x, 0, to.z)
    return this.smoothPath(from, points)
  }

  private smoothPath(start: THREE.Vector3, points: THREE.Vector3[]) {
    const result: THREE.Vector3[] = []
    let anchor = start
    let index = 0
    while (index < points.length) {
      let furthest = index
      for (let candidate = index + 1; candidate < points.length; candidate += 1) {
        if (!this.hasLineOfSight(anchor, points[candidate])) break
        furthest = candidate
      }
      const point = points[furthest]
      result.push(point)
      anchor = point
      index = furthest + 1
    }
    return result
  }

  private worldToCell(point: THREE.Vector3): Cell {
    return {
      x: THREE.MathUtils.clamp(Math.round((point.x - this.bounds.minX) / this.cellSize), 0, this.cols - 1),
      z: THREE.MathUtils.clamp(Math.round((point.z - this.bounds.minZ) / this.cellSize), 0, this.rows - 1),
    }
  }

  private cellToWorld(cell: Cell) {
    return new THREE.Vector3(this.bounds.minX + cell.x * this.cellSize, 0, this.bounds.minZ + cell.z * this.cellSize)
  }

  private nearestWalkable(origin: Cell) {
    if (this.walkable(origin.x, origin.z)) return origin
    for (let radius = 1; radius <= 5; radius += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (Math.abs(x) !== radius && Math.abs(z) !== radius) continue
          const cell = { x: origin.x + x, z: origin.z + z }
          if (this.walkable(cell.x, cell.z)) return cell
        }
      }
    }
    return undefined
  }

  private walkable(x: number, z: number) {
    return x >= 0 && z >= 0 && x < this.cols && z < this.rows && this.blocked[this.index(x, z)] === 0
  }

  private index(x: number, z: number) { return z * this.cols + x }
  private fromIndex(index: number): Cell { return { x: index % this.cols, z: Math.floor(index / this.cols) } }
}

function heuristic(a: Cell, b: Cell) { return Math.hypot(a.x - b.x, a.z - b.z) }

function distancePointToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax
  const abz = bz - az
  const lengthSq = abx * abx + abz * abz
  if (lengthSq <= 1e-8) return Math.hypot(px - ax, pz - az)
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lengthSq))
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}
