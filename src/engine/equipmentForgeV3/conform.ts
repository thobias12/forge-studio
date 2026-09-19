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
  metal: THREE.MeshStandardMaterial,
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
      .5,
      .0022,
    )
  meshes.push(necklineTrim)
  meshes.push(
    ...createTunicSeamDetails(
      source,
      torso.geometry,
      trim,
    ),
  )

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
        createShoulderBridge(
          source,
          torso.geometry,
          left.geometry,
          cloth,
          'L',
        ),
      )
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
        createShoulderBridge(
          source,
          torso.geometry,
          right.geometry,
          cloth,
          'R',
        ),
      )
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
    const vest =
      createVestOverlay(
        source,
        torso.geometry,
        leather,
      )
    meshes.push(vest)
    meshes.push(
      ...createVestDetailTrim(
        source,
        vest.geometry,
        trim,
      ),
    )
    meshes.push(
      ...createVestPanelDetails(
        source,
        vest.geometry,
        leather,
        trim,
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
        .0045,
      ),
    )
    meshes.push(
      createBeltBuckle(
        source,
        torso.geometry,
        metal,
      ),
    )
    meshes.push(
      ...createBeltAccessories(
        source,
        torso.geometry,
        leather,
        trim,
        metal,
      ),
    )
  }

  if (recipe.layers.tabard) {
    const tabard =
      createFrontTabard(
        source,
        torso.geometry,
        frame,
        recipe,
        accent,
      )
    meshes.push(tabard)
    meshes.push(
      ...createTabardDetails(
        source,
        tabard.geometry,
        trim,
        leather,
      ),
    )
  }

  if (recipe.layers.cape) {
    const cape =
      createCapeLayer(
        source,
        sourceVertices,
        torso.geometry,
        frame,
        recipe,
        accent,
      )
    meshes.push(cape)
    meshes.push(
      ...createCapeDetails(
        source,
        cape.geometry,
        trim,
        leather,
        metal,
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
        .018 *
        Math.pow(1 - v, 2)
      const frontFactor =
        Math.max(
          0,
          radialNormal.z,
        )
      const chestEase =
        Math.exp(
          -Math.pow(
            (v - .63) / .17,
            2,
          ),
        ) *
        frontFactor
      const sideEase =
        Math.exp(
          -Math.pow(
            (v - .48) / .22,
            2,
          ),
        ) *
        (1 - Math.abs(radialNormal.z))

      const extra =
        frame.height *
          (.0026 +
            recipe.looseness *
              .0095 *
              THREE.MathUtils.lerp(
                waistFactor,
                1,
                v,
              ) +
            chestEase * .00125 +
            sideEase * .00055) +
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
    sleeve === 'long' ? .86 : .4
  const startFraction =
    sleeve === 'long' ? .025 : .035
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
  const candidateStart = 0
  const candidateEnd =
    sleeve === 'long' ? .96 : .54
  const maxArmRadius =
    armLength * .32

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

      const surface =
        sampleArmSurface(
          candidates,
          center,
          direction,
          radialDirection,
          armLength,
          ring < 2 ? .1 : .08,
        )

      const shoulderEase =
        THREE.MathUtils.lerp(
          1.08,
          .96,
          v,
        )
      const extra =
        armLength *
        (.011 +
          recipe.looseness *
            .008) *
        shoulderEase
      const position =
        center
          .clone()
          .addScaledVector(
            radialDirection,
            surface.radius + extra,
          )

      ringPositions.push(position)
      ringInfluences.push(
        readSkinInfluence(
          source.geometry,
          surface.vertex.index,
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

function sampleArmSurface(
  vertices: SourceVertex[],
  center: THREE.Vector3,
  direction: THREE.Vector3,
  radialDirection: THREE.Vector3,
  armLength: number,
  bandFraction: number,
) {
  const band =
    armLength * bandFraction
  const ranked:
    Array<{
      vertex: SourceVertex
      radius: number
      score: number
    }> = []

  for (const vertex of vertices) {
    const relative =
      vertex.position
        .clone()
        .sub(center)
    const axial =
      relative.dot(direction)

    if (
      Math.abs(axial) >
      band
    ) {
      continue
    }

    const radial =
      relative
        .clone()
        .addScaledVector(
          direction,
          -axial,
        )
    const radius =
      radial.length()

    if (radius < 1e-6) {
      continue
    }

    const alignment =
      radial
        .multiplyScalar(
          1 / radius,
        )
        .dot(radialDirection)

    if (alignment < .76) {
      continue
    }

    const score =
      Math.abs(axial) /
        Math.max(
          band,
          1e-6,
        ) +
      (1 - alignment) * 4

    let insertAt =
      ranked.length

    for (
      let index = 0;
      index < ranked.length;
      index += 1
    ) {
      if (
        score <
        ranked[index].score
      ) {
        insertAt = index
        break
      }
    }

    if (insertAt < 8) {
      ranked.splice(
        insertAt,
        0,
        {
          vertex,
          radius,
          score,
        },
      )
      if (ranked.length > 8) {
        ranked.pop()
      }
    } else if (
      ranked.length < 8
    ) {
      ranked.push({
        vertex,
        radius,
        score,
      })
    }
  }

  if (ranked.length === 0) {
    const fallback =
      nearestEuclideanVertex(
        vertices,
        center,
      )
    const relative =
      fallback.position
        .clone()
        .sub(center)
    const axial =
      relative.dot(direction)
    const radius =
      relative
        .addScaledVector(
          direction,
          -axial,
        )
        .length()

    return {
      vertex: fallback,
      radius:
        THREE.MathUtils.clamp(
          radius,
          armLength * .12,
          armLength * .3,
        ),
    }
  }

  const radii =
    ranked
      .map(
        (sample) =>
          sample.radius,
      )
      .sort(
        (a, b) => a - b,
      )

  const percentileIndex =
    Math.min(
      radii.length - 1,
      Math.floor(
        (radii.length - 1) *
          .8,
      ),
    )

  return {
    vertex: ranked[0].vertex,
    radius:
      THREE.MathUtils.clamp(
        radii[percentileIndex],
        armLength * .12,
        armLength * .3,
      ),
  }
}

function sampleBackSurfaceZ(
  vertices: SourceVertex[],
  targetX: number,
  targetY: number,
  height: number,
) {
  const ranked:
    Array<{
      z: number
      score: number
    }> = []

  for (const vertex of vertices) {
    if (
      vertex.position.z > 0
    ) {
      continue
    }

    const dx =
      Math.abs(
        vertex.position.x -
          targetX,
      ) /
      height
    const dy =
      Math.abs(
        vertex.position.y -
          targetY,
      ) /
      height

    if (
      dx > .16 ||
      dy > .08
    ) {
      continue
    }

    const score =
      dx * 2.4 +
      dy * 6

    let insertAt =
      ranked.length

    for (
      let index = 0;
      index < ranked.length;
      index += 1
    ) {
      if (
        score <
        ranked[index].score
      ) {
        insertAt = index
        break
      }
    }

    if (insertAt < 10) {
      ranked.splice(
        insertAt,
        0,
        {
          z: vertex.position.z,
          score,
        },
      )
      if (ranked.length > 10) {
        ranked.pop()
      }
    } else if (
      ranked.length < 10
    ) {
      ranked.push({
        z: vertex.position.z,
        score,
      })
    }
  }

  if (ranked.length === 0) {
    return -height * .05
  }

  return Math.min(
    ...ranked.map(
      (sample) => sample.z,
    ),
  )
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

function createShoulderBridge(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  sleeveGeometry: THREE.BufferGeometry,
  material: THREE.Material,
  side: 'L' | 'R',
) {
  const torsoPosition =
    torsoGeometry.getAttribute(
      'position',
    )
  const sleevePosition =
    sleeveGeometry.getAttribute(
      'position',
    )
  const torsoSegments =
    side === 'L'
      ? Array.from(
          { length: 9 },
          (_, index) => 8 + index,
        )
      : Array.from(
          { length: 9 },
          (_, index) => 32 + index,
        )

  const torsoSamples =
    torsoSegments.map(
      (segment) => {
        const index =
          18 * 48 +
          segment
        return {
          index,
          point:
            new THREE.Vector3(
              torsoPosition.getX(index),
              torsoPosition.getY(index),
              torsoPosition.getZ(index),
            ),
        }
      },
    )

  const sleeveSamples =
    Array.from(
      { length: 18 },
      (_, index) => ({
        index,
        point:
          new THREE.Vector3(
            sleevePosition.getX(index),
            sleevePosition.getY(index),
            sleevePosition.getZ(index),
          ),
      }),
    )

  const sleeveCenter =
    sleeveSamples.reduce(
      (sum, sample) =>
        sum.add(sample.point),
      new THREE.Vector3(),
    )
  sleeveCenter.multiplyScalar(
    1 /
      Math.max(
        1,
        sleeveSamples.length,
      ),
  )

  let innerSleeve =
    sleeveSamples.filter(
      (sample) =>
        side === 'L'
          ? sample.point.x <=
            sleeveCenter.x
          : sample.point.x >=
            sleeveCenter.x,
    )

  if (innerSleeve.length < 5) {
    innerSleeve =
      sleeveSamples
  }

  torsoSamples.sort(
    (a, b) =>
      a.point.z - b.point.z,
  )
  innerSleeve.sort(
    (a, b) =>
      a.point.z - b.point.z,
  )

  const count =
    torsoSamples.length
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const torsoSample =
      torsoSamples[index]
    const sleeveIndex =
      Math.round(
        (index /
          Math.max(1, count - 1)) *
          Math.max(
            0,
            innerSleeve.length - 1,
          ),
      )
    const sleeveSample =
      innerSleeve[sleeveIndex]

    const torsoPoint =
      torsoSample.point.clone()
    const sleevePoint =
      sleeveSample.point.clone()
    const middlePoint =
      torsoPoint
        .clone()
        .lerp(
          sleevePoint,
          .5,
        )

    const center =
      torsoPoint
        .clone()
        .add(sleevePoint)
        .multiplyScalar(.5)
    const radial =
      new THREE.Vector3(
        center.x,
        0,
        center.z,
      )
    if (
      radial.lengthSq() >
      1e-6
    ) {
      radial.normalize()
      torsoPoint.addScaledVector(
        radial,
        .0006,
      )
      sleevePoint.addScaledVector(
        radial,
        .0006,
      )
      middlePoint.addScaledVector(
        radial,
        .0014,
      )
    }
    middlePoint.y += .00035

    const torsoInfluence =
      readSkinInfluence(
        torsoGeometry,
        torsoSample.index,
      )
    const sleeveInfluence =
      readSkinInfluence(
        sleeveGeometry,
        sleeveSample.index,
      )

    positions.push(
      torsoPoint.x,
      torsoPoint.y,
      torsoPoint.z,
      middlePoint.x,
      middlePoint.y,
      middlePoint.z,
      sleevePoint.x,
      sleevePoint.y,
      sleevePoint.z,
    )
    const u =
      index /
      Math.max(1, count - 1)
    uvs.push(
      u, 0,
      u, .5,
      u, 1,
    )
    influences.push(
      torsoInfluence,
      blendSkinInfluence(
        torsoInfluence,
        sleeveInfluence,
        .5,
      ),
      sleeveInfluence,
    )
  }

  for (
    let index = 0;
    index < count - 1;
    index += 1
  ) {
    const a = index * 3
    const b = a + 1
    const c0 = a + 2
    const d = (index + 1) * 3
    const e = d + 1
    const f = d + 2
    indices.push(
      a, d, b,
      b, d, e,
      b, e, c0,
      c0, e, f,
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
    `EFV3_ShoulderBridge_${side}`,
  )
}

function createVestOverlay(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  const segments = 48
  const firstRow = 5
  const lastRow = 14
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
          .0034,
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
        segment <= 4 ||
        segment >= segments - 4
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

  const columns = 8
  const rows = 10
  const topRow = 3
  const topSpan = 5
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

  const topIndices =
    Array.from(
      {
        length:
          columns + 1,
      },
      (_, column) => {
        const u =
          column / columns
        const offset =
          Math.round(
            THREE.MathUtils.lerp(
              -topSpan,
              topSpan,
              u,
            ),
          )
        const segment =
          (offset + 48) % 48
        return (
          topRow * 48 +
          segment
        )
      },
    )

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const widthScale =
      THREE.MathUtils.lerp(
        1,
        1.1,
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
      const tailCenter =
        u < .5 ? .23 : .77
      const tailDistance =
        THREE.MathUtils.clamp(
          Math.abs(
            u - tailCenter,
          ) / .23,
          0,
          1,
        )
      const pointedHem =
        Math.pow(
          THREE.MathUtils.clamp(
            (v - .72) / .28,
            0,
            1,
          ),
          2,
        ) *
        .018 *
        (1 - tailDistance)
      const topIndex =
        topIndices[column]
      const top =
        new THREE.Vector3(
          sourcePosition.getX(
            topIndex,
          ),
          sourcePosition.getY(
            topIndex,
          ),
          sourcePosition.getZ(
            topIndex,
          ),
        )

      const point =
        new THREE.Vector3(
          top.x * widthScale +
            centered *
              .005 *
              v *
              v,
          top.y -
            v * length -
            Math.pow(v, 4) *
              .012 *
              (1 - edge * edge) -
            pointedHem,
          top.z +
            .0036 +
            Math.sin(
              v * Math.PI,
            ) *
              .006 -
            v * .0025,
        )

      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(u, v)
      influences.push(
        readSkinInfluence(
          torsoGeometry,
          topIndex,
        ),
      )
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
      // Open a narrow center slit through the lower third so the tabard
      // reads like a constructed garment instead of a single rectangle.
      if (
        row >= 5 &&
        (
          column === 3 ||
          column === 4
        )
      ) {
        continue
      }

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
  sourceVertices: SourceVertex[],
  torsoGeometry: THREE.BufferGeometry,
  frame: TunicTemplateFrame,
  recipe: EquipmentForgeV3Recipe,
  material: THREE.Material,
) {
  const sourcePosition =
    torsoGeometry.getAttribute(
      'position',
    )

  const columns = 10
  const rows = 14
  const topRow = 18
  const topSpan =
    Math.round(
      THREE.MathUtils.lerp(
        5,
        8,
        THREE.MathUtils.clamp(
          (recipe.cape.width -
            .18) /
            .32,
          0,
          1,
        ),
      ),
    )
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

  const topIndices =
    Array.from(
      {
        length:
          columns + 1,
      },
      (_, column) => {
        const u =
          column / columns
        const offset =
          Math.round(
            THREE.MathUtils.lerp(
              -topSpan,
              topSpan,
              u,
            ),
          )
        const segment =
          (24 + offset + 48) %
          48
        return (
          topRow * 48 +
          segment
        )
      },
    )

  // Build a dedicated cape attachment curve instead of copying the
  // tunic neckline. The old attachment inherited the neckline's varying
  // Y contour and produced the angular/W-shaped cape root visible from
  // above and behind.
  let topAnchors =
    topIndices.map(
      (topIndex, column) => {
        const u =
          column / columns
        const edge =
          Math.abs(u - .5) * 2
        const sourcePoint =
          new THREE.Vector3(
            sourcePosition.getX(
              topIndex,
            ),
            sourcePosition.getY(
              topIndex,
            ),
            sourcePosition.getZ(
              topIndex,
            ),
          )
        const y =
          frame.shoulderY -
          frame.height *
            (.028 +
              .026 *
                Math.pow(
                  edge,
                  1.65,
                ))
        const backZ =
          sampleBackSurfaceZ(
            sourceVertices,
            sourcePoint.x,
            y,
            frame.height,
          )
        const attachmentClearance =
          frame.height *
          recipe.cape.clearance *
          .78

        return new THREE.Vector3(
          sourcePoint.x,
          y,
          backZ -
            attachmentClearance,
        )
      },
    )

  for (
    let pass = 0;
    pass < 2;
    pass += 1
  ) {
    topAnchors =
      topAnchors.map(
        (point, index) => {
          if (
            index === 0 ||
            index ===
              topAnchors.length - 1
          ) {
            return point.clone()
          }

          return topAnchors[
            index - 1
          ]
            .clone()
            .multiplyScalar(.18)
            .addScaledVector(
              point,
              .64,
            )
            .addScaledVector(
              topAnchors[
                index + 1
              ],
              .18,
            )
        },
      )
  }

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const v = row / rows
    const widthT =
      v *
      v *
      (3 - 2 * v)
    const widthScale =
      1 +
      recipe.cape.flare *
        1.8 *
        widthT

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
      const topIndex =
        topIndices[column]
      const top =
        new THREE.Vector3(
          sourcePosition.getX(
            topIndex,
          ),
          sourcePosition.getY(
            topIndex,
          ),
          sourcePosition.getZ(
            topIndex,
          ),
        )

      const hipWeight =
        v * .32
      const chestWeight =
        1 - hipWeight
      const hemDrop =
        Math.pow(v, 4) *
        .035 *
        (1 - edge * edge)
      // Keep the shoulder attachment calm and let folds develop lower
      // down the cape. A non-zero top-row fold made the yoke look kinked
      // from above even when back clearance was technically valid.
      const fold =
        Math.sin(
          u * Math.PI * 6,
        ) *
        Math.pow(v, 1.65) *
        .0048

      const x =
        top.x * widthScale
      const y =
        top.y -
        v * length -
        hemDrop
      const surfaceClearance =
        frame.height *
        recipe.cape.clearance *
        THREE.MathUtils.lerp(
          .72,
          1.08,
          v,
        ) *
        THREE.MathUtils.lerp(
          .92,
          1.08,
          edge,
        )
      const sampledBackZ =
        sampleBackSurfaceZ(
          sourceVertices,
          x,
          y,
          frame.height,
        )
      const drapeZ =
        top.z -
        surfaceClearance -
        v * .008 -
        v * v * .014 +
        fold
      const safeZ =
        sampledBackZ -
        surfaceClearance

      const collisionSafeZ =
        Math.min(
          drapeZ,
          safeZ,
        )

      // Only keep the cape tightly coupled to the body at the shoulder
      // attachment. v1.77.5 constrained half the cape which could create
      // visible kinks from top/three-quarter views. Fade the anti-float
      // guard out smoothly by the upper quarter and let normal drape take
      // over below it.
      const upperT =
        THREE.MathUtils.clamp(
          v / .28,
          0,
          1,
        )
      const upperSmooth =
        upperT *
        upperT *
        (3 - 2 * upperT)
      const guardStrength =
        1 - upperSmooth
      const maxShoulderGap =
        frame.height * .0085
      const shoulderGuardZ =
        Math.max(
          collisionSafeZ,
          safeZ -
            maxShoulderGap,
        )
      const guardedZ =
        THREE.MathUtils.lerp(
          collisionSafeZ,
          shoulderGuardZ,
          guardStrength,
        )

      const point =
        new THREE.Vector3(
          x,
          y,
          guardedZ,
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

function createTunicSeamDetails(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  return [
    createGridColumnStrip(
      source,
      torsoGeometry,
      19,
      48,
      11,
      12,
      material,
      'EFV3_TunicSideSeam_L',
      'radial',
      .0016,
    ),
    createGridColumnStrip(
      source,
      torsoGeometry,
      19,
      48,
      35,
      36,
      material,
      'EFV3_TunicSideSeam_R',
      'radial',
      .0016,
    ),
  ]
}

function createVestPanelDetails(
  source: THREE.SkinnedMesh,
  vestGeometry: THREE.BufferGeometry,
  leather: THREE.Material,
  trim: THREE.Material,
) {
  return [
    // Narrow, mirrored side reinforcements. Keep the center chest clean
    // so the leather reads as garment construction rather than two
    // blocky plates stuck onto the front.
    createGridAreaPatch(
      source,
      vestGeometry,
      48,
      2,
      8,
      7,
      10,
      leather,
      'EFV3_VestPanel_L',
      'radial',
      .0052,
    ),
    createGridAreaPatch(
      source,
      vestGeometry,
      48,
      2,
      8,
      38,
      41,
      leather,
      'EFV3_VestPanel_R',
      'radial',
      .0052,
    ),
    createGridColumnStrip(
      source,
      vestGeometry,
      10,
      48,
      10,
      11,
      trim,
      'EFV3_VestPanelSeam_L',
      'radial',
      .0059,
    ),
    createGridColumnStrip(
      source,
      vestGeometry,
      10,
      48,
      37,
      38,
      trim,
      'EFV3_VestPanelSeam_R',
      'radial',
      .0059,
    ),
    createGridRowStrip(
      source,
      vestGeometry,
      48,
      2,
      3,
      7,
      10,
      trim,
      'EFV3_VestPanelBase_L',
      'radial',
      .0059,
    ),
    createGridRowStrip(
      source,
      vestGeometry,
      48,
      2,
      3,
      38,
      41,
      trim,
      'EFV3_VestPanelBase_R',
      'radial',
      .0059,
    ),
  ]
}

function createBeltAccessories(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  leather: THREE.Material,
  trim: THREE.Material,
  metal: THREE.Material,
) {
  return [
    createRaisedGridAreaPatch(
      source,
      torsoGeometry,
      48,
      0,
      4,
      8,
      14,
      leather,
      'EFV3_Pouch_L',
      .009,
      .006,
    ),
    createRaisedGridAreaPatch(
      source,
      torsoGeometry,
      48,
      1,
      4,
      35,
      39,
      leather,
      'EFV3_Pouch_R',
      .0085,
      .005,
    ),
    createGridAreaPatch(
      source,
      torsoGeometry,
      48,
      3,
      4,
      8,
      14,
      trim,
      'EFV3_PouchFlap_L',
      'radial',
      .013,
    ),
    createGridAreaPatch(
      source,
      torsoGeometry,
      48,
      3,
      4,
      35,
      39,
      trim,
      'EFV3_PouchFlap_R',
      'radial',
      .012,
    ),
    createGridPatch(
      source,
      torsoGeometry,
      48,
      3,
      4,
      10,
      11,
      metal,
      'EFV3_PouchStud_L',
      'radial',
      .014,
    ),
    createGridPatch(
      source,
      torsoGeometry,
      48,
      3,
      4,
      37,
      38,
      metal,
      'EFV3_PouchStud_R',
      'radial',
      .013,
    ),
    createGridPatch(
      source,
      torsoGeometry,
      48,
      2,
      4,
      17,
      18,
      trim,
      'EFV3_BeltKeeper_L',
      'radial',
      .0075,
    ),
    createGridPatch(
      source,
      torsoGeometry,
      48,
      2,
      4,
      30,
      31,
      trim,
      'EFV3_BeltKeeper_R',
      'radial',
      .0072,
    ),
  ]
}

function createTabardDetails(
  source: THREE.SkinnedMesh,
  tabardGeometry: THREE.BufferGeometry,
  material: THREE.Material,
  leather: THREE.Material,
) {
  return [
    createGridColumnStrip(
      source,
      tabardGeometry,
      11,
      9,
      0,
      1,
      material,
      'EFV3_TabardEdge_L',
      'radial',
      .0018,
    ),
    createGridColumnStrip(
      source,
      tabardGeometry,
      11,
      9,
      8,
      7,
      material,
      'EFV3_TabardEdge_R',
      'radial',
      .0018,
    ),
    createGridRowStrip(
      source,
      tabardGeometry,
      9,
      0,
      1,
      0,
      8,
      material,
      'EFV3_TabardTop',
      'radial',
      .0018,
    ),
    createGridRowStrip(
      source,
      tabardGeometry,
      9,
      10,
      9,
      0,
      3,
      material,
      'EFV3_TabardHem_L',
      'radial',
      .0018,
    ),
    createGridRowStrip(
      source,
      tabardGeometry,
      9,
      10,
      9,
      4,
      8,
      material,
      'EFV3_TabardHem_R',
      'radial',
      .0018,
    ),
    createGridAreaPatch(
      source,
      tabardGeometry,
      9,
      0,
      4,
      3,
      5,
      material,
      'EFV3_TabardCenterSeam',
      'radial',
      .0022,
    ),
    createGridAreaPatch(
      source,
      tabardGeometry,
      9,
      0,
      2,
      1,
      7,
      leather,
      'EFV3_TabardTopReinforcement',
      'radial',
      .0035,
    ),
    createGridAreaPatch(
      source,
      tabardGeometry,
      9,
      5,
      10,
      2,
      3,
      material,
      'EFV3_TabardSplitEdge_L',
      'radial',
      .0022,
    ),
    createGridAreaPatch(
      source,
      tabardGeometry,
      9,
      5,
      10,
      5,
      6,
      material,
      'EFV3_TabardSplitEdge_R',
      'radial',
      .0022,
    ),
  ]
}

function createRaisedGridAreaPatch(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  columnCount: number,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  material: THREE.Material,
  name: string,
  baseOffset: number,
  bulge: number,
) {
  const position =
    sourceGeometry.getAttribute(
      'position',
    )
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []
  const rows =
    Math.max(
      1,
      rowEnd - rowStart,
    )
  const columns =
    Math.max(
      1,
      columnEnd - columnStart,
    )

  for (
    let row = rowStart;
    row <= rowEnd;
    row += 1
  ) {
    const v =
      (row - rowStart) / rows

    for (
      let column = columnStart;
      column <= columnEnd;
      column += 1
    ) {
      const u =
        (column - columnStart) /
        columns
      const index =
        row * columnCount +
        column
      const point =
        new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        )
      const profile =
        Math.sin(u * Math.PI) *
        Math.sin(v * Math.PI)
      offsetDetailPoint(
        point,
        'radial',
        baseOffset +
          bulge * profile,
      )
      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(u, v)
      influences.push(
        readSkinInfluence(
          sourceGeometry,
          index,
        ),
      )
    }
  }

  const localColumns =
    columnEnd -
    columnStart +
    1

  for (
    let row = 0;
    row < rowEnd - rowStart;
    row += 1
  ) {
    for (
      let column = 0;
      column < localColumns - 1;
      column += 1
    ) {
      const a =
        row * localColumns +
        column
      const b = a + 1
      const c0 =
        (row + 1) *
          localColumns +
        column
      const d = c0 + 1
      indices.push(
        a, c0, b,
        b, c0, d,
      )
    }
  }

  return createDetailMesh(
    source,
    positions,
    uvs,
    indices,
    influences,
    material,
    name,
  )
}

function createGridPathStrip(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  columnCount: number,
  path: Array<{
    row: number
    column: number
  }>,
  material: THREE.Material,
  name: string,
  offsetMode: 'radial' | 'back',
  offset: number,
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
    let step = 0;
    step < path.length;
    step += 1
  ) {
    const entry = path[step]
    for (
      const [slot, column] of
        [
          entry.column,
          entry.column + 1,
        ].entries()
    ) {
      const index =
        entry.row *
          columnCount +
        column
      const point =
        new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        )
      offsetDetailPoint(
        point,
        offsetMode,
        offset,
      )
      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(
        slot,
        step /
          Math.max(
            1,
            path.length - 1,
          ),
      )
      influences.push(
        readSkinInfluence(
          sourceGeometry,
          index,
        ),
      )
    }
  }

  for (
    let step = 0;
    step < path.length - 1;
    step += 1
  ) {
    const a = step * 2
    const b = a + 1
    const c0 = a + 2
    const d = a + 3
    indices.push(
      a, c0, b,
      b, c0, d,
    )
  }

  return createDetailMesh(
    source,
    positions,
    uvs,
    indices,
    influences,
    material,
    name,
  )
}

function createGridAreaPatch(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  columnCount: number,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  material: THREE.Material,
  name: string,
  offsetMode: 'radial' | 'back',
  offset: number,
) {
  const position =
    sourceGeometry.getAttribute(
      'position',
    )
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []

  const rows =
    Math.max(
      1,
      rowEnd - rowStart,
    )
  const columns =
    Math.max(
      1,
      columnEnd - columnStart,
    )

  for (
    let row = rowStart;
    row <= rowEnd;
    row += 1
  ) {
    const v =
      (row - rowStart) / rows

    for (
      let column = columnStart;
      column <= columnEnd;
      column += 1
    ) {
      const u =
        (column - columnStart) /
        columns
      const index =
        row * columnCount +
        column
      const point =
        new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        )
      offsetDetailPoint(
        point,
        offsetMode,
        offset,
      )
      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(u, v)
      influences.push(
        readSkinInfluence(
          sourceGeometry,
          index,
        ),
      )
    }
  }

  const localColumns =
    columnEnd -
    columnStart +
    1

  for (
    let row = 0;
    row < rowEnd - rowStart;
    row += 1
  ) {
    for (
      let column = 0;
      column < localColumns - 1;
      column += 1
    ) {
      const a =
        row * localColumns +
        column
      const b = a + 1
      const c0 =
        (row + 1) *
          localColumns +
        column
      const d = c0 + 1
      indices.push(
        a, c0, b,
        b, c0, d,
      )
    }
  }

  return createDetailMesh(
    source,
    positions,
    uvs,
    indices,
    influences,
    material,
    name,
  )
}

function createVestDetailTrim(
  source: THREE.SkinnedMesh,
  vestGeometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  const rowCount = 10
  const columnCount = 48

  return [
    createGridColumnStrip(
      source,
      vestGeometry,
      rowCount,
      columnCount,
      5,
      6,
      material,
      'EFV3_VestEdge_L',
      'radial',
      .0022,
    ),
    createGridColumnStrip(
      source,
      vestGeometry,
      rowCount,
      columnCount,
      43,
      42,
      material,
      'EFV3_VestEdge_R',
      'radial',
      .0022,
    ),
    createGridRowStrip(
      source,
      vestGeometry,
      columnCount,
      0,
      1,
      5,
      43,
      material,
      'EFV3_VestHem',
      'radial',
      .0022,
    ),
    createGridRowStrip(
      source,
      vestGeometry,
      columnCount,
      9,
      8,
      5,
      43,
      material,
      'EFV3_VestShoulderSeam',
      'radial',
      .0022,
    ),
  ]
}

function createBeltBuckle(
  source: THREE.SkinnedMesh,
  torsoGeometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  const segments = 48
  const position =
    torsoGeometry.getAttribute(
      'position',
    )
  const corners = [
    4 * segments + 47,
    2 * segments + 47,
    4 * segments + 1,
    2 * segments + 1,
  ]
  const positions: number[] = []
  const influences: SkinInfluence[] = []

  for (const index of corners) {
    const point =
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      )
    offsetDetailPoint(
      point,
      'radial',
      .008,
    )
    positions.push(
      point.x,
      point.y,
      point.z,
    )
    influences.push(
      readSkinInfluence(
        torsoGeometry,
        index,
      ),
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
      [
        0, 1,
        0, 0,
        1, 1,
        1, 0,
      ],
      2,
    ),
  )
  geometry.setIndex([
    0, 1, 2,
    2, 1, 3,
  ])
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
    'EFV3_BeltBuckle',
  )
}

function createCapeDetails(
  source: THREE.SkinnedMesh,
  capeGeometry: THREE.BufferGeometry,
  trim: THREE.Material,
  leather: THREE.Material,
  metal: THREE.Material,
) {
  const rows = 15
  const columns = 11

  return [
    createGridColumnStrip(
      source,
      capeGeometry,
      rows,
      columns,
      0,
      1,
      trim,
      'EFV3_CapeBorder_L',
      'back',
      .0016,
    ),
    createGridColumnStrip(
      source,
      capeGeometry,
      rows,
      columns,
      10,
      9,
      trim,
      'EFV3_CapeBorder_R',
      'back',
      .0016,
    ),
    createGridRowStrip(
      source,
      capeGeometry,
      columns,
      14,
      13,
      0,
      10,
      trim,
      'EFV3_CapeHem',
      'back',
      .0016,
    ),
    // A narrow shoulder yoke follows the smooth attachment curve. The
    // previous rows 0..2 leather slab + diagonal strips dominated the
    // back/neck silhouette and looked like rigid polygons.
    createGridRowStrip(
      source,
      capeGeometry,
      columns,
      0,
      1,
      1,
      9,
      leather,
      'EFV3_CapeYoke',
      'back',
      .0018,
    ),
    createGridRowStrip(
      source,
      capeGeometry,
      columns,
      1,
      2,
      2,
      8,
      trim,
      'EFV3_CapeYokeLowerSeam',
      'back',
      .0021,
    ),
    createGridColumnStrip(
      source,
      capeGeometry,
      rows,
      columns,
      5,
      6,
      trim,
      'EFV3_CapeCenterSeam',
      'back',
      .0016,
    ),
    createGridPatch(
      source,
      capeGeometry,
      columns,
      0,
      1,
      2,
      3,
      metal,
      'EFV3_CapeFastener_L',
      'back',
      .0023,
    ),
    createGridPatch(
      source,
      capeGeometry,
      columns,
      0,
      1,
      7,
      8,
      metal,
      'EFV3_CapeFastener_R',
      'back',
      .0023,
    ),
  ]
}

function createGridColumnStrip(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  rowCount: number,
  columnCount: number,
  columnA: number,
  columnB: number,
  material: THREE.Material,
  name: string,
  offsetMode: 'radial' | 'back',
  offset: number,
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
    let row = 0;
    row < rowCount;
    row += 1
  ) {
    for (
      const [slot, column] of
        [columnA, columnB].entries()
    ) {
      const index =
        row * columnCount +
        column
      const point =
        new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        )
      offsetDetailPoint(
        point,
        offsetMode,
        offset,
      )
      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(
        slot,
        row /
          Math.max(
            1,
            rowCount - 1,
          ),
      )
      influences.push(
        readSkinInfluence(
          sourceGeometry,
          index,
        ),
      )
    }
  }

  for (
    let row = 0;
    row < rowCount - 1;
    row += 1
  ) {
    const a = row * 2
    const b = a + 1
    const c0 = a + 2
    const d = a + 3
    indices.push(
      a, c0, b,
      b, c0, d,
    )
  }

  return createDetailMesh(
    source,
    positions,
    uvs,
    indices,
    influences,
    material,
    name,
  )
}

function createGridRowStrip(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  columnCount: number,
  rowA: number,
  rowB: number,
  columnStart: number,
  columnEnd: number,
  material: THREE.Material,
  name: string,
  offsetMode: 'radial' | 'back',
  offset: number,
) {
  const position =
    sourceGeometry.getAttribute(
      'position',
    )
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const influences: SkinInfluence[] = []
  const columns =
    Math.max(
      1,
      columnEnd -
        columnStart,
    )

  for (
    let column = columnStart;
    column <= columnEnd;
    column += 1
  ) {
    const u =
      (column - columnStart) /
      columns

    for (
      const [slot, row] of
        [rowA, rowB].entries()
    ) {
      const index =
        row * columnCount +
        column
      const point =
        new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        )
      offsetDetailPoint(
        point,
        offsetMode,
        offset,
      )
      positions.push(
        point.x,
        point.y,
        point.z,
      )
      uvs.push(u, slot)
      influences.push(
        readSkinInfluence(
          sourceGeometry,
          index,
        ),
      )
    }
  }

  const pairCount =
    columnEnd -
    columnStart +
    1

  for (
    let column = 0;
    column < pairCount - 1;
    column += 1
  ) {
    const a = column * 2
    const b = a + 1
    const c0 = a + 2
    const d = a + 3
    indices.push(
      a, b, c0,
      c0, b, d,
    )
  }

  return createDetailMesh(
    source,
    positions,
    uvs,
    indices,
    influences,
    material,
    name,
  )
}

function createGridPatch(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  columnCount: number,
  rowA: number,
  rowB: number,
  columnA: number,
  columnB: number,
  material: THREE.Material,
  name: string,
  offsetMode: 'radial' | 'back',
  offset: number,
) {
  const position =
    sourceGeometry.getAttribute(
      'position',
    )
  const sourceIndices = [
    rowA * columnCount +
      columnA,
    rowB * columnCount +
      columnA,
    rowA * columnCount +
      columnB,
    rowB * columnCount +
      columnB,
  ]
  const positions: number[] = []
  const influences: SkinInfluence[] = []

  for (const index of sourceIndices) {
    const point =
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      )
    offsetDetailPoint(
      point,
      offsetMode,
      offset,
    )
    positions.push(
      point.x,
      point.y,
      point.z,
    )
    influences.push(
      readSkinInfluence(
        sourceGeometry,
        index,
      ),
    )
  }

  return createDetailMesh(
    source,
    positions,
    [
      0, 1,
      0, 0,
      1, 1,
      1, 0,
    ],
    [
      0, 1, 2,
      2, 1, 3,
    ],
    influences,
    material,
    name,
  )
}

function offsetDetailPoint(
  point: THREE.Vector3,
  mode: 'radial' | 'back',
  offset: number,
) {
  if (mode === 'back') {
    point.z -= offset
    return
  }

  const radial =
    new THREE.Vector3(
      point.x,
      0,
      point.z,
    )

  if (
    radial.lengthSq() >
    1e-7
  ) {
    point.addScaledVector(
      radial.normalize(),
      offset,
    )
  }
}

function createDetailMesh(
  source: THREE.SkinnedMesh,
  positions: number[],
  uvs: number[],
  indices: number[],
  influences: SkinInfluence[],
  material: THREE.Material,
  name: string,
) {
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

function createSkinnedRowBand(
  source: THREE.SkinnedMesh,
  sourceGeometry: THREE.BufferGeometry,
  outerRow: number,
  innerRow: number,
  segments: number,
  material: THREE.Material,
  name: string,
  widthFraction: number,
  outwardOffset = .0018,
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
        .multiplyScalar(
          outwardOffset,
        )
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

function blendSkinInfluence(
  a: SkinInfluence,
  b: SkinInfluence,
  t: number,
): SkinInfluence {
  const weights =
    new Map<number, number>()
  const add = (
    influence: SkinInfluence,
    scale: number,
  ) => {
    influence.indices.forEach(
      (bone, index) => {
        weights.set(
          bone,
          (weights.get(bone) ?? 0) +
            influence.weights[index] *
              scale,
        )
      },
    )
  }

  add(a, 1 - t)
  add(b, t)

  const ranked =
    [...weights.entries()]
      .filter(
        ([, weight]) =>
          weight > 1e-6,
      )
      .sort(
        (left, right) =>
          right[1] - left[1],
      )
      .slice(0, 4)
  const total =
    ranked.reduce(
      (sum, [, weight]) =>
        sum + weight,
      0,
    ) || 1

  while (ranked.length < 4) {
    ranked.push([0, 0])
  }

  return {
    indices: ranked.map(
      ([bone]) => bone,
    ) as [
      number,
      number,
      number,
      number,
    ],
    weights: ranked.map(
      ([, weight]) =>
        weight / total,
    ) as [
      number,
      number,
      number,
      number,
    ],
  }
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
