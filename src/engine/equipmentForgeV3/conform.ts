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
  leather: THREE.MeshStandardMaterial,
  accent: THREE.MeshStandardMaterial,
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

  const necklineTrim =
    createSkinnedRowBand(
      source,
      torso.geometry,
      18,
      17,
      48,
      trim,
      'EFV3_NecklineTrim',
      .34,
    )
  meshes.push(necklineTrim)

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

    const sleeveRings =
      recipe.sleeve === 'long'
        ? 12
        : 7

    if (left) {
      meshes.push(left)
      meshes.push(
        createSkinnedRowBand(
          source,
          left.geometry,
          sleeveRings,
          sleeveRings - 1,
          18,
          trim,
          'EFV3_SleeveCuff_L',
          .5,
        ),
      )
    }

    if (right) {
      meshes.push(right)
      meshes.push(
        createSkinnedRowBand(
          source,
          right.geometry,
          sleeveRings,
          sleeveRings - 1,
          18,
          trim,
          'EFV3_SleeveCuff_R',
          .5,
        ),
      )
    }
  }

  if (recipe.layers.vest) {
    meshes.push(
      createVestOverlay(
        source,
        torso.geometry,
        leather,
      ),
    )
  }

  if (recipe.layers.belt) {
    meshes.push(
      createSkinnedRowBand(
        source,
        torso.geometry,
        4,
        2,
        48,
        leather,
        'EFV3_Belt',
        1,
      ),
    )
  }

  if (recipe.layers.tabard) {
    meshes.push(
      createFrontTabard(
        source,
        torso.geometry,
        frame,
        recipe,
        accent,
      ),
    )
  }

  if (recipe.layers.cape) {
    meshes.push(
      createCapeLayer(
        source,
        torso.geometry,
        frame,
        recipe,
        accent,
      ),
    )
  }

  return { meshes, frame }
}

export function tunicTopY(
  frame: TunicTemplateFrame,
  angle: number,
) {
  const front =
    Math.cos(angle) >= 0
  const side =
    Math.abs(Math.sin(angle))

  // V3.2: shape the top edge as a broad neckline that rises over the
  // shoulder crown, then falls into the arm opening. The old sin(angle*2)
  // profile only lowered a single front vertex and read as a strapless
  // tube with a tiny notch.
  const neckY =
    frame.shoulderY -
    (front
      ? frame.frontNeckRaise
      : frame.backNeckRaise)

  const shoulderCrown =
    Math.exp(
      -Math.pow(
        (side - .68) / .22,
        2,
      ),
    )

  let result =
    THREE.MathUtils.lerp(
      neckY,
      frame.shoulderY,
      shoulderCrown,
    )

  const armT =
    THREE.MathUtils.clamp(
      (side - .84) / .16,
      0,
      1,
    )
  const armSmooth =
    armT *
    armT *
    (3 - 2 * armT)

  result =
    THREE.MathUtils.lerp(
      result,
      frame.underarmY,
      armSmooth,
    )

  return Math.min(
    frame.shoulderY +
      frame.height * .004,
    result,
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
      const hemFlare =
        frame.height *
        recipe.hemFlare *
        .024 *
        Math.pow(1 - v, 2)

      const extra =
        frame.height *
          (.004 +
            recipe.looseness *
              .018 *
              THREE.MathUtils.lerp(
                waistFactor,
                1,
                v,
              )) +
        hemFlare

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
    sleeve === 'long' ? .86 : .42
  const startFraction =
    sleeve === 'long' ? .025 : -.025
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
    sleeve === 'long' ? 0 : -.045
  const candidateEnd =
    sleeve === 'long' ? .96 : .54
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

      const radialDirection =
        axisA
          .clone()
          .multiplyScalar(
            Math.cos(angle),
          )
          .addScaledVector(
            axisB,
            Math.sin(angle),
          )
          .normalize()

      const fromCenter =
        nearest.position
          .clone()
          .sub(center)
      const axialDistance =
        fromCenter.dot(direction)
      const sampledRadius =
        fromCenter
          .addScaledVector(
            direction,
            -axialDistance,
          )
          .length()

      const cleanRadius =
        THREE.MathUtils.clamp(
          sampledRadius,
          armLength * .11,
          armLength * .235,
        )
      const extra =
        armLength *
        (.008 +
          recipe.looseness * .018)
      const position =
        center
          .clone()
          .addScaledVector(
            radialDirection,
            cleanRadius + extra,
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
    height * .045

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
  // These values are drops below the shoulder line. Keeping them in the
  // frame avoids body-specific magic coordinates while letting every
  // neckline share the same smooth shoulder/armhole contour.
  if (neckline === 'high') {
    frame.frontNeckRaise =
      frame.height * .018
    frame.backNeckRaise =
      frame.height * .014
    return
  }

  if (neckline === 'scoop') {
    frame.frontNeckRaise =
      frame.height * .055
    frame.backNeckRaise =
      frame.height * .028
    return
  }

  frame.frontNeckRaise =
    frame.height * .035
  frame.backNeckRaise =
    frame.height * .022
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

function createVestOverlay(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  const segments = 48
  const firstRow = 7
  const lastRow = 16
  const sourcePosition =
    torsoGeometry.getAttribute(
      'position',
    )
  const positions: number[] = []
  const uvs: number[] = []
  const influences: SkinInfluence[] = []
  const indices: number[] = []
  const rows =
    lastRow - firstRow

  for (
    let row = firstRow;
    row <= lastRow;
    row += 1
  ) {
    const v =
      (row - firstRow) /
      Math.max(1, rows)

    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      const sourceIndex =
        row * segments +
        segment
      const point =
        new THREE.Vector3(
          sourcePosition.getX(
            sourceIndex,
          ),
          sourcePosition.getY(
            sourceIndex,
          ),
          sourcePosition.getZ(
            sourceIndex,
          ),
        )
      const radial =
        new THREE.Vector3(
          point.x,
          0,
          point.z,
        )
      if (
        radial.lengthSq() >
        1e-6
      ) {
        point.addScaledVector(
          radial.normalize(),
          .0065,
        )
      }

      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(
        segment / segments,
        v,
      )
      influences.push(
        readSkinInfluence(
          torsoGeometry,
          sourceIndex,
        ),
      )
    }
  }

  const localRows =
    lastRow - firstRow

  for (
    let row = 0;
    row < localRows;
    row += 1
  ) {
    for (
      let segment = 0;
      segment < segments;
      segment += 1
    ) {
      // Leave a clean split down the front of the leather vest.
      const frontGap =
        segment <= 1 ||
        segment >= segments - 2
      if (frontGap) continue

      const next =
        (segment + 1) %
        segments
      const a =
        row * segments +
        segment
      const b =
        row * segments +
        next
      const c0 =
        (row + 1) *
          segments +
        segment
      const d =
        (row + 1) *
          segments +
        next

      indices.push(
        a,
        c0,
        b,
        b,
        c0,
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
    'EFV3_SplitLeatherVest',
  )
}

function createFrontTabard(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  frame: TunicTemplateFrame,
  recipe: EquipmentForgeV3Recipe,
  material: THREE.Material,
) {
  const sourcePosition =
    torsoGeometry.getAttribute(
      'position',
    )
  const anchorIndex =
    3 * 48
  const anchor =
    new THREE.Vector3(
      sourcePosition.getX(
        anchorIndex,
      ),
      sourcePosition.getY(
        anchorIndex,
      ),
      sourcePosition.getZ(
        anchorIndex,
      ),
    )

  const columns = 6
  const rows = 9
  const width =
    frame.height * .105
  const length =
    frame.height *
    THREE.MathUtils.lerp(
      .16,
      .25,
      THREE.MathUtils.clamp(
        (recipe.length - .72) /
          .56,
        0,
        1,
      ),
    )
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  const pelvis =
    findSkeletonBone(
      source,
      'pelvis',
      'hips',
    )
  const pelvisIndex =
    pelvis
      ? Math.max(
          0,
          source.skeleton.bones.indexOf(
            pelvis,
          ),
        )
      : 0

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const rowWidth =
      width *
      THREE.MathUtils.lerp(
        1,
        .72,
        v,
      )

    for (
      let column = 0;
      column <= columns;
      column += 1
    ) {
      const u =
        column / columns
      const centered =
        u - .5
      const edge =
        Math.abs(centered) * 2
      const point =
        new THREE.Vector3(
          anchor.x +
            centered * rowWidth,
          anchor.y -
            v * length -
            Math.pow(v, 4) *
              .025 *
              (1 - edge * edge),
          anchor.z +
            .012 +
            Math.sin(v * Math.PI) *
              .012,
        )

      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(u, v)
      influences.push({
        indices: [
          pelvisIndex,
          0,
          0,
          0,
        ],
        weights: [1, 0, 0, 0],
      })
    }
  }

  for (
    let row = 0;
    row < rows;
    row += 1
  ) {
    for (
      let column = 0;
      column < columns;
      column += 1
    ) {
      const a =
        row *
          (columns + 1) +
        column
      const b = a + 1
      const c0 =
        a + columns + 1
      const d = c0 + 1
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
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
    'EFV3_FrontTabard',
  )
}

function createCapeLayer(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  frame: TunicTemplateFrame,
  recipe: EquipmentForgeV3Recipe,
  material: THREE.Material,
) {
  const sourcePosition =
    torsoGeometry.getAttribute(
      'position',
    )
  const backSegment = 24
  const backIndex =
    18 * 48 +
    backSegment
  const back =
    new THREE.Vector3(
      sourcePosition.getX(
        backIndex,
      ),
      sourcePosition.getY(
        backIndex,
      ),
      sourcePosition.getZ(
        backIndex,
      ),
    )

  const columns = 10
  const rows = 14
  const topWidth =
    frame.height *
    recipe.cape.width *
    .42
  const bottomWidth =
    topWidth *
    (1 +
      recipe.cape.flare * 2.15)
  const length =
    frame.height *
    recipe.cape.length *
    .55
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  const spine =
    findSkeletonBone(
      source,
      'spine_03',
      'spine_02',
    )
  const pelvis =
    findSkeletonBone(
      source,
      'pelvis',
      'hips',
    )
  const spineIndex =
    spine
      ? Math.max(
          0,
          source.skeleton.bones.indexOf(
            spine,
          ),
        )
      : 0
  const pelvisIndex =
    pelvis
      ? Math.max(
          0,
          source.skeleton.bones.indexOf(
            pelvis,
          ),
        )
      : spineIndex

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    for (
      let column = 0;
      column <= columns;
      column += 1
    ) {
      const u =
        column / columns
      const centered =
        u - .5
      const edge =
        Math.abs(centered) * 2
      const hipWeight =
        v * .32
      const chestWeight =
        1 - hipWeight

      const widthT =
        v * v *
        (3 - 2 * v)
      const shapedWidth =
        THREE.MathUtils.lerp(
          topWidth,
          bottomWidth,
          widthT,
        )
      const shoulderLift =
        (1 - v) *
        edge *
        .014
      const hemDrop =
        Math.pow(v, 4) *
        .045 *
        (1 - edge * edge)
      const fold =
        Math.sin(
          u * Math.PI * 6,
        ) *
        (.004 +
          v * .009)

      const point =
        new THREE.Vector3(
          centered * shapedWidth,
          frame.shoulderY -
            frame.height * .024 +
            shoulderLift -
            v * length -
            hemDrop,
          back.z -
            .008 -
            v * .035 -
            v * v * .055 +
            fold,
        )

      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(u, v)
      influences.push({
        indices: [
          spineIndex,
          pelvisIndex,
          0,
          0,
        ],
        weights: [
          chestWeight,
          hipWeight,
          0,
          0,
        ],
      })
    }
  }

  for (
    let row = 0;
    row < rows;
    row += 1
  ) {
    for (
      let column = 0;
      column < columns;
      column += 1
    ) {
      const a =
        row *
          (columns + 1) +
        column
      const b = a + 1
      const c0 =
        a + columns + 1
      const d = c0 + 1
      indices.push(
        a,
        c0,
        b,
        b,
        c0,
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
    'EFV3_Cape',
  )
}

function createSkinnedRowBand(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  outerRow: number,
  innerRow: number,
  segments: number,
  material: THREE.Material,
  name: string,
  widthFraction: number,
) {
  const position =
    sourceGeometry.getAttribute(
      'position',
    )

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  for (
    let segment = 0;
    segment < segments;
    segment += 1
  ) {
    const outerIndex =
      outerRow * segments +
      segment
    const innerIndex =
      innerRow * segments +
      segment

    const outer =
      new THREE.Vector3(
        position.getX(outerIndex),
        position.getY(outerIndex),
        position.getZ(outerIndex),
      )
    const inner =
      new THREE.Vector3(
        position.getX(innerIndex),
        position.getY(innerIndex),
        position.getZ(innerIndex),
      )

    const inset =
      outer
        .clone()
        .lerp(
          inner,
          widthFraction,
        )

    const radial =
      new THREE.Vector3(
        outer.x,
        0,
        outer.z,
      )
    if (
      radial.lengthSq() >
      1e-6
    ) {
      radial
        .normalize()
        .multiplyScalar(.0018)
      outer.add(radial)
      inset.add(radial)
    }

    positions.push(
      outer.x,
      outer.y,
      outer.z,
      inset.x,
      inset.y,
      inset.z,
    )
    uvs.push(
      segment / segments,
      1,
      segment / segments,
      0,
    )
    influences.push(
      readSkinInfluence(
        sourceGeometry,
        outerIndex,
      ),
      readSkinInfluence(
        sourceGeometry,
        innerIndex,
      ),
    )
  }

  for (
    let segment = 0;
    segment < segments;
    segment += 1
  ) {
    const next =
      (segment + 1) %
      segments
    const a = segment * 2
    const b = a + 1
    const c0 = next * 2
    const d = c0 + 1
    indices.push(
      a,
      b,
      c0,
      c0,
      b,
      d,
    )
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
    name,
  )
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
