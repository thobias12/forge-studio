import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'plane'
export type EditMode = 'object' | 'vertex' | 'face'

export type ModelSnapshot = {
  positions: number[]
  indices?: number[]
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  flatShading: boolean
}

export function createPrimitive(kind: PrimitiveKind) {
  let geometry: THREE.BufferGeometry
  if (kind === 'sphere') geometry = new THREE.IcosahedronGeometry(0.75, 2)
  else if (kind === 'cylinder') geometry = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12, 1)
  else if (kind === 'plane') geometry = new THREE.PlaneGeometry(1.5, 1.5, 2, 2)
  else geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2, 1, 1, 1)
  return weldGeometry(geometry)
}

export function weldGeometry(input: THREE.BufferGeometry, tolerance = 1e-5) {
  const source = input.toNonIndexed()
  const position = source.getAttribute('position')
  const vertices: number[] = []
  const indices: number[] = []
  const map = new Map<string, number>()
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
    const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`
    let index = map.get(key)
    if (index === undefined) {
      index = vertices.length / 3
      vertices.push(x, y, z)
      map.set(key, index)
    }
    indices.push(index)
  }
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  result.setIndex(indices)
  result.computeVertexNormals()
  result.computeBoundingBox()
  result.computeBoundingSphere()
  source.dispose()
  return result
}

export function moveVertices(geometry: THREE.BufferGeometry, vertexIds: number[], delta: THREE.Vector3, snap = 0) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const ids = new Set(vertexIds)
  ids.forEach((id) => {
    let x = position.getX(id) + delta.x
    let y = position.getY(id) + delta.y
    let z = position.getZ(id) + delta.z
    if (snap > 0) {
      x = Math.round(x / snap) * snap
      y = Math.round(y / snap) * snap
      z = Math.round(z / snap) * snap
    }
    position.setXYZ(id, x, y, z)
  })
  position.needsUpdate = true
  refreshGeometry(geometry)
}

export function faceVertexIds(geometry: THREE.BufferGeometry, faceIndex: number) {
  const index = geometry.getIndex()
  const offset = faceIndex * 3
  if (index) return [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
  return [offset, offset + 1, offset + 2]
}

export function extrudeFace(input: THREE.BufferGeometry, faceIndex: number, distance: number) {
  const geometry = ensureIndexedClone(input)
  const positions = Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array as Iterable<number>)
  const indices = Array.from((geometry.getIndex() as THREE.BufferAttribute).array as Iterable<number>)
  const triOffset = faceIndex * 3
  if (triOffset < 0 || triOffset + 2 >= indices.length) return geometry
  const original = indices.slice(triOffset, triOffset + 3)
  const a = readVec(positions, original[0]), b = readVec(positions, original[1]), c = readVec(positions, original[2])
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().multiplyScalar(distance)
  const top = [a.clone().add(normal), b.clone().add(normal), c.clone().add(normal)]
  const newIds = top.map((point) => {
    const id = positions.length / 3
    positions.push(point.x, point.y, point.z)
    return id
  })
  indices.splice(triOffset, 3, ...newIds)
  const [a0, b0, c0] = original
  const [a1, b1, c1] = newIds
  indices.push(a0, b0, b1, a0, b1, a1)
  indices.push(b0, c0, c1, b0, c1, b1)
  indices.push(c0, a0, a1, c0, a1, c1)
  return geometryFromArrays(positions, indices)
}

export function insetFace(input: THREE.BufferGeometry, faceIndex: number, amount = 0.22) {
  const geometry = ensureIndexedClone(input)
  const positions = Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array as Iterable<number>)
  const indices = Array.from((geometry.getIndex() as THREE.BufferAttribute).array as Iterable<number>)
  const offset = faceIndex * 3
  if (offset < 0 || offset + 2 >= indices.length) return geometry
  const original = indices.slice(offset, offset + 3)
  const verts = original.map((id) => readVec(positions, id))
  const centroid = verts[0].clone().add(verts[1]).add(verts[2]).multiplyScalar(1 / 3)
  const inset = verts.map((point) => point.clone().lerp(centroid, THREE.MathUtils.clamp(amount, 0.02, 0.85)))
  const insetIds = inset.map((point) => {
    const id = positions.length / 3
    positions.push(point.x, point.y, point.z)
    return id
  })
  const [a, b, c] = original
  const [ia, ib, ic] = insetIds
  indices.splice(offset, 3, ia, ib, ic)
  indices.push(a, b, ib, a, ib, ia)
  indices.push(b, c, ic, b, ic, ib)
  indices.push(c, a, ia, c, ia, ic)
  return geometryFromArrays(positions, indices)
}

export function bevelFace(input: THREE.BufferGeometry, faceIndex: number, amount = 0.12, depth = 0.06) {
  const inset = insetFace(input, faceIndex, amount)
  return extrudeFace(inset, faceIndex, depth)
}

export function mirrorGeometry(input: THREE.BufferGeometry, axis: 'x' | 'y' | 'z' = 'x') {
  const geometry = ensureIndexedClone(input)
  const positions = Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array as Iterable<number>)
  const indices = Array.from((geometry.getIndex() as THREE.BufferAttribute).array as Iterable<number>)
  const baseCount = positions.length / 3
  for (let i = 0; i < baseCount; i += 1) {
    const point = readVec(positions, i)
    if (axis === 'x') point.x *= -1
    if (axis === 'y') point.y *= -1
    if (axis === 'z') point.z *= -1
    positions.push(point.x, point.y, point.z)
  }
  const originalIndices = [...indices]
  for (let i = 0; i < originalIndices.length; i += 3) {
    indices.push(originalIndices[i] + baseCount, originalIndices[i + 2] + baseCount, originalIndices[i + 1] + baseCount)
  }
  return geometryFromArrays(positions, indices)
}

export function snapshotMesh(mesh: THREE.Mesh, flatShading: boolean): ModelSnapshot {
  const geometry = ensureIndexedClone(mesh.geometry)
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  const snapshot: ModelSnapshot = {
    positions: Array.from(position.array as Iterable<number>),
    indices: index ? Array.from(index.array as Iterable<number>) : undefined,
    position: mesh.position.toArray() as [number, number, number],
    rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    scale: mesh.scale.toArray() as [number, number, number],
    flatShading,
  }
  geometry.dispose()
  return snapshot
}

export function restoreSnapshot(mesh: THREE.Mesh, snapshot: ModelSnapshot) {
  mesh.geometry.dispose()
  mesh.geometry = geometryFromArrays(snapshot.positions, snapshot.indices ?? [])
  mesh.position.fromArray(snapshot.position)
  mesh.rotation.set(...snapshot.rotation)
  mesh.scale.fromArray(snapshot.scale)
}

export async function exportMeshGlb(mesh: THREE.Mesh, name: string) {
  const clone = mesh.clone()
  clone.geometry = mesh.geometry.clone()
  clone.name = name || 'ForgeModel'
  const root = new THREE.Group()
  root.name = name || 'ForgeModel'
  root.add(clone)
  const exporter = new GLTFExporter()
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(root, (value) => {
      if (value instanceof ArrayBuffer) resolve(value)
      else reject(new Error('Forge expected binary GLB output.'))
    }, reject, { binary: true, trs: true, onlyVisible: false })
  })
  return new Blob([result], { type: 'model/gltf-binary' })
}

function ensureIndexedClone(input: THREE.BufferGeometry) {
  const source = input.index ? input.clone() : weldGeometry(input)
  if (!source.getIndex()) source.setIndex(Array.from({ length: source.getAttribute('position').count }, (_, index) => index))
  return source
}

function geometryFromArrays(positions: number[], indices: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (indices.length) geometry.setIndex(indices)
  refreshGeometry(geometry)
  return geometry
}

function refreshGeometry(geometry: THREE.BufferGeometry) {
  geometry.deleteAttribute('normal')
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
}

function readVec(positions: number[], id: number) {
  const offset = id * 3
  return new THREE.Vector3(positions[offset], positions[offset + 1], positions[offset + 2])
}
