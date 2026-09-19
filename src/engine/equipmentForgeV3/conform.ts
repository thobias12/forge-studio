import * as THREE from 'three'
import {
  applySkinAttributes,
  readSkinInfluence,
  type SkinInfluence,
} from './skinWeights'
import type {
  EquipmentForgeV3Neckline,
  EquipmentForgeV3Recipe,
  EquipmentForgeV3Sleeve,
} from './types'

export type TunicTemplateFrame = {
  bottomY: number
  underarmY: number
  shoulderY: number
  torsoLimit: number
  height: number
  frontNeckRaise: number
  backNeckRaise: number
  shoulderRaise: number
}

type SourceVertex = {
  index: number
  position: THREE.Vector3
  normal: THREE.Vector3
  angle: number
}

export type ConformedTunicResult = {
  meshes: THREE.SkinnedMesh[]
  frame: TunicTemplateFrame
}

export function findPrimaryBodyMesh(
  root: THREE.Object3D,
) {
  let best:
    | THREE.SkinnedMesh
    | undefined
  let score = -1

  root.traverse((object) => {
    if (
      !(object instanceof THREE.SkinnedMesh)
    ) {
      return
    }

    const geometry = object.geometry
    const position =
      geometry?.getAttribute('position')
    if (
      !position ||
      !geometry.getAttribute('skinIndex') ||
      !geometry.getAttribute('skinWeight')
    ) {
      return
    }

    const lower =
      object.name.toLowerCase()
    if (
      lower.includes('eye') ||
      lower.includes('teeth') ||
      lower.includes('hair') ||
      lower.includes('optional')
    ) {
      return
    }

    const next =
      position.count +
      (lower.includes('body')
        ? 1_000_000
        : 0)

    if (next > score) {
      score = next
      best = object
    }
  })

  return best
}

export function buildConformedTunic(
  source: THREE.SkinnedMesh,
  recipe: EquipmentForgeV3Recipe,
  cloth: THREE.MeshStandardMaterial,
  trim: THREE.MeshStandardMaterial,
): ConformedTunicResult {
  source.updateMatrixWorld(true)

  const sourceVertices =
    collectSourceVertices(source)
  const frame =
    createTunicFrame(source)
  applyNeckline(
    frame,
    recipe.neckline,
  )

  const torso = createTorsoTemplate(
    source,
    sourceVertices,
    frame,
    recipe,
    cloth,
  )

  const meshes = [torso]
  void trim

  if (recipe.sleeve !== 'none') {
    const left = createSleeveTemplate(
      source,
      sourceVertices,
      recipe,
      cloth,
      'L',
      recipe.sleeve,
    )
    const right = createSleeveTemplate(
      source,
      sourceVertices,
      recipe,
      cloth,
      'R',
      recipe.sleeve,
    )
    if (left) meshes.push(left)
    if (right) meshes.push(right)
  }

  return { meshes, frame }
}

export function tunicTopY(
  frame: TunicTemplateFrame,
  angle: number,
) {
  const frontness =
    Math.max(0, Math.cos(angle))
  const backness =
    Math.max(0, -Math.cos(angle))
  const shoulderPeak =
    Math.pow(
      Math.abs(Math.sin(angle * 2)),
      .72,
    )

  return Math.min(
    frame.shoulderY +
      frame.height * .008,
    frame.underarmY +
      shoulderPeak *
        frame.shoulderRaise +
      frontness *
        frame.frontNeckRaise +
      backness *
        frame.backNeckRaise,
  )
}

function createTorsoTemplate(
  source: THREE.SkinnedMesh,
  sourceVertices: SourceVertex[],
  frame: TunicTemplateFrame,
  recipe: EquipmentForgeV3Recipe,
  material: THREE.MeshStandardMaterial,
) {
  const rings = 18
  const segments = 48
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  const bottomShift =
    (recipe.length - 1) *
    frame.height *
    .12
  const bottomY =
    frame.bottomY - bottomShift

  const candidates =
    sourceVertices.filter((vertex) =>
      vertex.position.y >=
        bottomY - frame.height * .04 &&
      vertex.position.y <=
        frame.shoulderY +
          frame.height * .035 &&
      Math.abs(vertex.position.x) <=
        frame.torsoLimit,
    )

  for (
    let ring = 0;
    ring <= rings;
    ring += 1
  ) {
    const v = ring / rings
    const ringPositions:
      THREE.Vector3[] = []
    const ringInfluences:
      SkinInfluence[] = []

    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const u = segment / segments
      const angle =
        u * Math.PI * 2
      const targetTop =
        tunicTopY(frame, angle)
      const targetY =
        THREE.MathUtils.lerp(
          bottomY,
          targetTop,
          v,
        )

      const nearest =
        nearestAngularVertex(
          candidates,
          targetY,
          angle,
          frame.height,
        )

      const position =
        nearest.position.clone()

      // V3.1: the garment topology owns
      // its vertical contour. The old
      // nearest-vertex Y produced the
      // saw-tooth hem and torn neckline
      // visible in v1.76.0.
      position.y = targetY

      const radialNormal =
        nearest.normal.clone()
      radialNormal.y = 0
      if (
        radialNormal.lengthSq() <
        1e-5
      ) {
        radialNormal.set(
          position.x,
          0,
          position.z,
        )
      }
      radialNormal.normalize()

      const waistFactor =
        1 -
        recipe.waistTaper *
          (1 - v) *
          .7
      const extra =
        frame.height *
        (.004 +
          recipe.looseness *
            .018 *
            THREE.MathUtils.lerp(
              waistFactor,
              1,
              v,
            ))

      position.addScaledVector(
        radialNormal,
        extra,
      )

      ringPositions.push(position)
      ringInfluences.push(
        readSkinInfluence(
          source.geometry,
          nearest.index,
        ),
      )
    }

    const smoothPasses =
      ring === 0
        ? 3
        : ring === rings
          ? 2
          : 1
    const smoothed =
      smoothCircularRingXZ(
        ringPositions,
        smoothPasses,
      )

    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const u = segment / segments
      const position =
        smoothed[segment]
      positions.push(
        position.x,
        position.y,
        position.z,
      )
      uvs.push(u, v)
      influences.push(
        ringInfluences[segment],
      )
    }
  }

  for (
    let ring = 0;
    ring < rings;
    ring += 1
  ) {
    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const next =
        (segment + 1) % segments
      const a =
        ring * segments + segment
      const b =
        ring * segments + next
      const c =
        (ring + 1) *
          segments +
        segment
      const d =
        (ring + 1) *
          segments +
        next

      indices.push(
        a,
        c,
        b,
        b,
        c,
        d,
      )
    }
  }

  const geometry =
    new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      positions,
      3,
    ),
  )
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  applySkinAttributes(
    geometry,
    influences,
  )
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return makeSkinnedTemplate(
    source,
    geometry,
    material,
    'EFV3_TunicFitted',
  )
}

function createSleeveTemplate(
  source: THREE.SkinnedMesh,
  sourceVertices: SourceVertex[],
  recipe: EquipmentForgeV3Recipe,
  material: THREE.MeshStandardMaterial,
  side: 'L' | 'R',
  sleeve: EquipmentForgeV3Sleeve,
) {
  const upper = findSkeletonBone(
    source,
    `upperarm_${side}`,
    `clavicle_${side}`,
  )
  const lower = findSkeletonBone(
    source,
    `lowerarm_${side}`,
    `forearm_${side}`,
  )
  if (!upper || !lower) return undefined

  const start =
    objectPositionInMesh(source, upper)
  const end =
    objectPositionInMesh(source, lower)
  const arm = end.clone().sub(start)
  const armLength = arm.length()
  if (armLength < .05) return undefined

  const direction =
    arm.clone().normalize()
  const endFraction =
    sleeve === 'long' ? .84 : .4
  const startFraction =
    sleeve === 'long' ? .07 : .1
  const sleeveStart =
    start.clone().addScaledVector(
      arm,
      startFraction,
    )
  const sleeveEnd =
    start.clone().addScaledVector(
      arm,
      endFraction,
    )

  const radius =
    armLength * .17
  const helper =
    Math.abs(direction.y) < .88
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
  const axisA =
    new THREE.Vector3()
      .crossVectors(direction, helper)
      .normalize()
  const axisB =
    new THREE.Vector3()
      .crossVectors(direction, axisA)
      .normalize()

  const sideSign =
    Math.sign(start.x) ||
    (side === 'L' ? 1 : -1)
  const candidateStart =
    sleeve === 'long' ? .025 : .055
  const candidateEnd =
    sleeve === 'long' ? .94 : .52
  const maxArmRadius =
    armLength * .235

  // Only sample vertices that actually belong to the upper/lower arm tube.
  // The old filter used a hard-coded X sign and no radial limit, so chest
  // and shoulder-cap vertices could be selected and stretched into spikes.
  const candidates =
    sourceVertices.filter((vertex) => {
      const projected =
        projectOnLine(
          vertex.position,
          start,
          direction,
        )
      if (
        projected <
          armLength * candidateStart ||
        projected >
          armLength * candidateEnd
      ) {
        return false
      }

      const closest =
        start
          .clone()
          .addScaledVector(
            direction,
            projected,
          )
      const radialDistance =
        vertex.position.distanceTo(
          closest,
        )

      const sameSide =
        vertex.position.x *
          sideSign >
        -armLength * .015

      return (
        sameSide &&
        radialDistance <=
          maxArmRadius
      )
    })

  if (candidates.length < 24) {
    return undefined
  }

  const rings =
    sleeve === 'long' ? 12 : 7
  const segments = 18
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  for (
    let ring = 0;
    ring <= rings;
    ring += 1
  ) {
    const v = ring / rings
    const center =
      sleeveStart
        .clone()
        .lerp(sleeveEnd, v)
    const ringPositions:
      THREE.Vector3[] = []
    const ringInfluences:
      SkinInfluence[] = []

    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const u = segment / segments
      const angle =
        u * Math.PI * 2
      const desired =
        center
          .clone()
          .addScaledVector(
            axisA,
            Math.cos(angle) *
              radius,
          )
          .addScaledVector(
            axisB,
            Math.sin(angle) *
              radius,
          )

      const nearest =
        nearestEuclideanVertex(
          candidates,
          desired,
        )
      const position =
        nearest.position.clone()
      const outward =
        position
          .clone()
          .sub(center)

      if (
        outward.lengthSq() <
        1e-6
      ) {
        outward.copy(
          axisA
            .clone()
            .multiplyScalar(
              Math.cos(angle),
            )
            .addScaledVector(
              axisB,
              Math.sin(angle),
            ),
        )
      }
      outward.normalize()

      const extra =
        armLength *
        (.008 +
          recipe.looseness * .018)
      position.addScaledVector(
        outward,
        extra,
      )

      ringPositions.push(position)
      ringInfluences.push(
        readSkinInfluence(
          source.geometry,
          nearest.index,
        ),
      )
    }

    const smoothed =
      smoothCircularRing3D(
        ringPositions,
        ring === 0 ? 3 : 2,
      )

    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const u = segment / segments
      const position =
        smoothed[segment]
      positions.push(
        position.x,
        position.y,
        position.z,
      )
      uvs.push(u, v)
      influences.push(
        ringInfluences[segment],
      )
    }
  }

  for (
    let ring = 0;
    ring < rings;
    ring += 1
  ) {
    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const next =
        (segment + 1) % segments
      const a =
        ring * segments + segment
      const b =
        ring * segments + next
      const c =
        (ring + 1) *
          segments +
        segment
      const d =
        (ring + 1) *
          segments +
        next

      indices.push(
        a,
        c,
        b,
        b,
        c,
        d,
      )
    }
  }

  const geometry =
    new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      positions,
      3,
    ),
  )
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2,
    ),
  )
  geometry.setIndex(indices)
  applySkinAttributes(
    geometry,
    influences,
  )
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return makeSkinnedTemplate(
    source,
    geometry,
    material,
    `EFV3_Sleeve_${side}`,
  )
}

function createTunicFrame(
  source: THREE.SkinnedMesh,
): TunicTemplateFrame {
  if (!source.geometry.boundingBox) {
    source.geometry.computeBoundingBox()
  }
  const box =
    source.geometry.boundingBox
  if (!box) {
    throw new Error(
      'The Skillbound body does not expose usable bounds.',
    )
  }

  const height =
    Math.max(
      .5,
      box.max.y - box.min.y,
    )

  const pelvis =
    findSkeletonBone(
      source,
      'pelvis',
      'hips',
      'spine_01',
    )
  const spine =
    findSkeletonBone(
      source,
      'spine_03',
      'spine_02',
      'chest',
    )
  const leftShoulder =
    findSkeletonBone(
      source,
      'upperarm_L',
      'clavicle_L',
    )
  const rightShoulder =
    findSkeletonBone(
      source,
      'upperarm_R',
      'clavicle_R',
    )

  const pelvisPosition =
    pelvis
      ? objectPositionInMesh(
          source,
          pelvis,
        )
      : new THREE.Vector3(
          0,
          box.min.y +
            height * .5,
          0,
        )

  const spinePosition =
    spine
      ? objectPositionInMesh(
          source,
          spine,
        )
      : new THREE.Vector3(
          0,
          box.min.y +
            height * .7,
          0,
        )

  const leftPosition =
    leftShoulder
      ? objectPositionInMesh(
          source,
          leftShoulder,
        )
      : new THREE.Vector3(
          height * .16,
          box.min.y +
            height * .78,
          0,
        )
  const rightPosition =
    rightShoulder
      ? objectPositionInMesh(
          source,
          rightShoulder,
        )
      : new THREE.Vector3(
          -height * .16,
          box.min.y +
            height * .78,
          0,
        )

  const shoulderY =
    (leftPosition.y +
      rightPosition.y) *
    .5
  const shoulderHalfWidth =
    Math.abs(
      leftPosition.x -
        rightPosition.x,
    ) * .5

  const torsoLimit =
    THREE.MathUtils.clamp(
      shoulderHalfWidth * .88,
      height * .105,
      height * .205,
    )

  const bottomY =
    THREE.MathUtils.lerp(
      pelvisPosition.y,
      spinePosition.y,
      .05,
    )
  const underarmY =
    shoulderY -
    height * .071

  return {
    bottomY,
    underarmY,
    shoulderY,
    torsoLimit,
    height,
    frontNeckRaise:
      height * .05,
    backNeckRaise:
      height * .071,
    shoulderRaise:
      height * .105,
  }
}

function applyNeckline(
  frame: TunicTemplateFrame,
  neckline: EquipmentForgeV3Neckline,
) {
  if (neckline === 'high') {
    frame.frontNeckRaise =
      frame.height * .075
    frame.backNeckRaise =
      frame.height * .08
    return
  }

  if (neckline === 'scoop') {
    frame.frontNeckRaise =
      frame.height * .032
    frame.backNeckRaise =
      frame.height * .067
    return
  }

  frame.frontNeckRaise =
    frame.height * .05
  frame.backNeckRaise =
    frame.height * .071
}

function collectSourceVertices(
  source: THREE.SkinnedMesh,
) {
  const position =
    source.geometry.getAttribute(
      'position',
    )
  const normal =
    source.geometry.getAttribute(
      'normal',
    )

  if (!position) {
    throw new Error(
      'The Skillbound body has no vertex positions.',
    )
  }

  const vertices: SourceVertex[] = []

  for (
    let index = 0;
    index < position.count;
    index += 1
  ) {
    const point =
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      )
    const vertexNormal =
      normal
        ? new THREE.Vector3(
            normal.getX(index),
            normal.getY(index),
            normal.getZ(index),
          )
        : point
            .clone()
            .setY(0)
            .normalize()

    vertices.push({
      index,
      position: point,
      normal: vertexNormal,
      angle: Math.atan2(
        point.x,
        point.z,
      ),
    })
  }

  return vertices
}

function smoothCircularRingXZ(
  input: THREE.Vector3[],
  passes: number,
) {
  let current =
    input.map((point) =>
      point.clone(),
    )

  for (
    let pass = 0;
    pass < passes;
    pass += 1
  ) {
    const next =
      current.map((point, index) => {
        const previous =
          current[
            (index -
              1 +
              current.length) %
              current.length
          ]
        const following =
          current[
            (index + 1) %
              current.length
          ]

        return new THREE.Vector3(
          previous.x * .22 +
            point.x * .56 +
            following.x * .22,
          point.y,
          previous.z * .22 +
            point.z * .56 +
            following.z * .22,
        )
      })
    current = next
  }

  return current
}

function smoothCircularRing3D(
  input: THREE.Vector3[],
  passes: number,
) {
  let current =
    input.map((point) =>
      point.clone(),
    )

  for (
    let pass = 0;
    pass < passes;
    pass += 1
  ) {
    current =
      current.map((point, index) => {
        const previous =
          current[
            (index -
              1 +
              current.length) %
              current.length
          ]
        const following =
          current[
            (index + 1) %
              current.length
          ]

        return previous
          .clone()
          .multiplyScalar(.2)
          .addScaledVector(
            point,
            .6,
          )
          .addScaledVector(
            following,
            .2,
          )
      })
  }

  return current
}

function nearestAngularVertex(
  vertices: SourceVertex[],
  targetY: number,
  targetAngle: number,
  height: number,
) {
  const nearest:
    Array<{
      vertex: SourceVertex
      score: number
    }> = []

  for (const vertex of vertices) {
    const dy =
      Math.abs(
        vertex.position.y -
          targetY,
      ) /
      height
    const da =
      angularDistance(
        vertex.angle,
        targetAngle,
      ) /
      Math.PI
    const score =
      dy * 5.4 +
      da * .85

    let insertAt =
      nearest.length
    for (
      let index = 0;
      index < nearest.length;
      index += 1
    ) {
      if (
        score <
        nearest[index].score
      ) {
        insertAt = index
        break
      }
    }

    if (insertAt < 5) {
      nearest.splice(
        insertAt,
        0,
        { vertex, score },
      )
      if (nearest.length > 5) {
        nearest.pop()
      }
    } else if (
      nearest.length < 5
    ) {
      nearest.push({
        vertex,
        score,
      })
    }
  }

  const best = nearest[0]
  if (!best) {
    throw new Error(
      'Could not conform the tunic template to the body.',
    )
  }

  // Blend several nearby samples instead of snapping the garment to one
  // raw body vertex. This removes the center-front/back ridge and small
  // surface dents that were still visible in v1.76.2.
  const position =
    new THREE.Vector3()
  const normal =
    new THREE.Vector3()
  let totalWeight = 0

  for (const sample of nearest) {
    const weight =
      1 /
      Math.pow(
        sample.score + .018,
        2,
      )
    position.addScaledVector(
      sample.vertex.position,
      weight,
    )
    normal.addScaledVector(
      sample.vertex.normal,
      weight,
    )
    totalWeight += weight
  }

  if (totalWeight > 0) {
    position.multiplyScalar(
      1 / totalWeight,
    )
    normal.multiplyScalar(
      1 / totalWeight,
    )
  }

  return {
    ...best.vertex,
    position,
    normal:
      normal.lengthSq() > 1e-6
        ? normal.normalize()
        : best.vertex.normal.clone(),
    angle: targetAngle,
  }
}

function nearestEuclideanVertex(
  vertices: SourceVertex[],
  target: THREE.Vector3,
) {
  let best = vertices[0]
  let bestDistance =
    Number.POSITIVE_INFINITY

  for (const vertex of vertices) {
    const distance =
      vertex.position.distanceToSquared(
        target,
      )
    if (distance < bestDistance) {
      best = vertex
      bestDistance = distance
    }
  }

  if (!best) {
    throw new Error(
      'Could not conform the sleeve template to the body.',
    )
  }
  return best
}

function makeSkinnedTemplate(
  source: THREE.SkinnedMesh,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const mesh =
    new THREE.SkinnedMesh(
      geometry,
      material,
    )
  mesh.name = name
  mesh.bindMode = source.bindMode
  mesh.position.copy(source.position)
  mesh.quaternion.copy(
    source.quaternion,
  )
  mesh.scale.copy(source.scale)
  mesh.bind(
    source.skeleton,
    source.bindMatrix.clone(),
  )
  mesh.castShadow = true
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  mesh.userData.equipmentForgeV3 =
    true
  source.parent?.add(mesh)
  return mesh
}

function findSkeletonBone(
  source: THREE.SkinnedMesh,
  ...names: string[]
) {
  const normalized =
    names.map(normalizeName)

  for (const bone of source.skeleton.bones) {
    const lower =
      normalizeName(bone.name)
    if (
      normalized.includes(lower)
    ) {
      return bone
    }
  }

  for (const bone of source.skeleton.bones) {
    const lower =
      normalizeName(bone.name)
    if (
      normalized.some(
        (name) =>
          lower.endsWith(name) ||
          lower.includes(name),
      )
    ) {
      return bone
    }
  }

  return undefined
}

function objectPositionInMesh(
  source: THREE.SkinnedMesh,
  object: THREE.Object3D,
) {
  const world =
    object.getWorldPosition(
      new THREE.Vector3(),
    )
  return source.worldToLocal(world)
}

function projectOnLine(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
) {
  return point
    .clone()
    .sub(origin)
    .dot(direction)
}

function angularDistance(
  a: number,
  b: number,
) {
  const raw =
    Math.abs(a - b) %
    (Math.PI * 2)
  return Math.min(
    raw,
    Math.PI * 2 - raw,
  )
}

function normalizeName(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}
