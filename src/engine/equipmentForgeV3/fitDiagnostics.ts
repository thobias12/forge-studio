import * as THREE from 'three'

export type EquipmentFitStatus =
  | 'clean'
  | 'check'
  | 'problem'

export type EquipmentFitZone = {
  id: string
  label: string
  samples: number
  averageGap: number
  p95Gap: number
  maxGap: number
  minimumSignedGap: number
  clippingPercent: number
  floatingPercent: number
  status: EquipmentFitStatus
}

export type EquipmentFitDiagnostics = {
  bodyHeight: number
  idealGap: number
  floatingThreshold: number
  clippingTolerance: number
  overall: EquipmentFitZone
  zones: EquipmentFitZone[]
}

type BodySample = {
  position: THREE.Vector3
  normal: THREE.Vector3
}

type GapSample = {
  distance: number
  signedDistance: number
}

type ZoneDefinition = {
  id: string
  label: string
  names: RegExp
}

const FIT_ZONES: ZoneDefinition[] = [
  {
    id: 'torso',
    label: 'Torso',
    names: /^EFV3_TunicFitted$/,
  },
  {
    id: 'left-sleeve',
    label: 'Left sleeve',
    names:
      /^EFV3_(?:Sleeve|ShoulderBridge)_L$/,
  },
  {
    id: 'right-sleeve',
    label: 'Right sleeve',
    names:
      /^EFV3_(?:Sleeve|ShoulderBridge)_R$/,
  },
]

export function analyzeEquipmentForgeV3Fit(
  source: THREE.SkinnedMesh,
  meshes: THREE.SkinnedMesh[],
): EquipmentFitDiagnostics {
  if (!source.geometry.boundingBox) {
    source.geometry.computeBoundingBox()
  }

  const box =
    source.geometry.boundingBox
  const bodyHeight =
    Math.max(
      .001,
      box
        ? box.max.y - box.min.y
        : 1,
    )
  const idealGap =
    bodyHeight * .006
  const floatingThreshold =
    bodyHeight * .015
  const clippingTolerance =
    bodyHeight * .0015

  const bodySamples =
    collectBodySamples(source)

  const zones =
    FIT_ZONES.map((zone) => {
      const zoneMeshes =
        meshes.filter((mesh) =>
          zone.names.test(mesh.name),
        )
      return summarizeZone(
        zone.id,
        zone.label,
        collectGapSamples(
          bodySamples,
          zoneMeshes,
        ),
        idealGap,
        floatingThreshold,
        clippingTolerance,
      )
    }).filter(
      (zone) => zone.samples > 0,
    )

  const allSamples =
    collectGapSamples(
      bodySamples,
      meshes.filter((mesh) =>
        FIT_ZONES.some((zone) =>
          zone.names.test(mesh.name),
        ),
      ),
    )

  return {
    bodyHeight,
    idealGap,
    floatingThreshold,
    clippingTolerance,
    overall: summarizeZone(
      'overall',
      'Overall fitted garment',
      allSamples,
      idealGap,
      floatingThreshold,
      clippingTolerance,
    ),
    zones,
  }
}

function collectBodySamples(
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
    return [] as BodySample[]
  }

  const stride =
    position.count > 9_000
      ? 2
      : 1
  const samples: BodySample[] = []

  for (
    let index = 0;
    index < position.count;
    index += stride
  ) {
    const point =
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      )
    const direction =
      normal
        ? new THREE.Vector3(
            normal.getX(index),
            normal.getY(index),
            normal.getZ(index),
          )
        : new THREE.Vector3(
            point.x,
            0,
            point.z,
          )

    if (
      direction.lengthSq() <
      1e-8
    ) {
      direction.set(0, 1, 0)
    } else {
      direction.normalize()
    }

    samples.push({
      position: point,
      normal: direction,
    })
  }

  return samples
}

function collectGapSamples(
  bodySamples: BodySample[],
  meshes: THREE.SkinnedMesh[],
) {
  const samples: GapSample[] = []

  for (const mesh of meshes) {
    const position =
      mesh.geometry.getAttribute(
        'position',
      )
    if (!position) continue

    const stride =
      position.count > 1_500
        ? 2
        : 1

    for (
      let index = 0;
      index < position.count;
      index += stride
    ) {
      const point =
        new THREE.Vector3(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
        )
      const nearest =
        nearestBodySample(
          point,
          bodySamples,
        )
      if (!nearest) continue

      const delta =
        point
          .clone()
          .sub(nearest.position)
      const distance =
        delta.length()
      const direction =
        Math.sign(
          delta.dot(nearest.normal),
        )

      samples.push({
        distance,
        signedDistance:
          distance *
          (direction === 0
            ? 1
            : direction),
      })
    }
  }

  return samples
}

function nearestBodySample(
  point: THREE.Vector3,
  samples: BodySample[],
) {
  let nearest:
    | BodySample
    | undefined
  let nearestDistance =
    Number.POSITIVE_INFINITY

  for (const sample of samples) {
    const distance =
      point.distanceToSquared(
        sample.position,
      )

    if (
      distance <
      nearestDistance
    ) {
      nearest = sample
      nearestDistance = distance
    }
  }

  return nearest
}

function summarizeZone(
  id: string,
  label: string,
  samples: GapSample[],
  idealGap: number,
  floatingThreshold: number,
  clippingTolerance: number,
): EquipmentFitZone {
  if (samples.length === 0) {
    return {
      id,
      label,
      samples: 0,
      averageGap: 0,
      p95Gap: 0,
      maxGap: 0,
      minimumSignedGap: 0,
      clippingPercent: 0,
      floatingPercent: 0,
      status: 'check',
    }
  }

  const distances =
    samples
      .map(
        (sample) =>
          sample.distance,
      )
      .sort((a, b) => a - b)

  const averageGap =
    distances.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    distances.length
  const p95Gap =
    distances[
      Math.min(
        distances.length - 1,
        Math.floor(
          distances.length * .95,
        ),
      )
    ]
  const maxGap =
    distances[
      distances.length - 1
    ]
  const minimumSignedGap =
    Math.min(
      ...samples.map(
        (sample) =>
          sample.signedDistance,
      ),
    )
  const clipping =
    samples.filter(
      (sample) =>
        sample.signedDistance <
        -clippingTolerance,
    ).length
  const floating =
    samples.filter(
      (sample) =>
        sample.distance >
        floatingThreshold,
    ).length
  const clippingPercent =
    (clipping /
      samples.length) *
    100
  const floatingPercent =
    (floating /
      samples.length) *
    100

  let status:
    EquipmentFitStatus =
      'clean'

  if (
    clippingPercent > 2 ||
    floatingPercent > 8 ||
    p95Gap >
      floatingThreshold * 1.35
  ) {
    status = 'problem'
  } else if (
    clippingPercent > .4 ||
    floatingPercent > 2 ||
    averageGap >
      idealGap * 1.75
  ) {
    status = 'check'
  }

  return {
    id,
    label,
    samples: samples.length,
    averageGap,
    p95Gap,
    maxGap,
    minimumSignedGap,
    clippingPercent,
    floatingPercent,
    status,
  }
}
