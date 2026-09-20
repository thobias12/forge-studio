import * as THREE from 'three'
import {
  tunicTopY,
  type TunicTemplateFrame,
} from './conform'
import type {
  EquipmentForgeV3Sleeve,
} from './types'

export type BodyMaskRestore = () => void

export function maskBodyUnderTunic(
  source: THREE.SkinnedMesh,
  frame: TunicTemplateFrame,
  length: number,
  sleeve: EquipmentForgeV3Sleeve = 'none',
): BodyMaskRestore {
  const original =
    source.geometry
  const position =
    original.getAttribute('position')

  if (!position) {
    return () => undefined
  }

  const geometry =
    original.clone()
  const originalIndex =
    original.index
  const triangleCount =
    originalIndex
      ? Math.floor(
          originalIndex.count / 3,
        )
      : Math.floor(
          position.count / 3,
        )

  const bottomY =
    frame.bottomY -
    (length - 1) *
      frame.height *
      .12

  const kept: number[] = []

  const vertexIndex = (
    triangle: number,
    corner: number,
  ) =>
    originalIndex
      ? originalIndex.getX(
          triangle * 3 + corner,
        )
      : triangle * 3 + corner

  const center =
    new THREE.Vector3()
  const skinnedA =
    new THREE.Vector3()
  const skinnedB =
    new THREE.Vector3()
  const skinnedC =
    new THREE.Vector3()

  const readSkinnedPosition = (
    index: number,
    target: THREE.Vector3,
  ) => {
    target.set(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    )
    source.applyBoneTransform(
      index,
      target,
    )
    return target
  }

  const sleeveRanges =
    sleeve === 'none'
      ? []
      : [
          createSleeveMaskRange(
            source,
            'L',
            sleeve,
          ),
          createSleeveMaskRange(
            source,
            'R',
            sleeve,
          ),
        ].filter(
          (
            value,
          ): value is SleeveMaskRange =>
            Boolean(value),
        )

  // The authored short sleeve is intentionally rooted from the clavicle
  // for broad shoulder coverage. Add a second, tightly bounded mask based
  // on the real upper-arm axis so body triangles cannot show through the
  // inner shoulder transition from steep/top-down cameras.
  const shoulderOcclusionRanges =
    sleeve === 'short'
      ? [
          createShoulderOcclusionRange(
            source,
            'L',
          ),
          createShoulderOcclusionRange(
            source,
            'R',
          ),
        ].filter(
          (
            value,
          ): value is ShoulderOcclusionRange =>
            Boolean(value),
        )
      : []

  for (
    let triangle = 0;
    triangle < triangleCount;
    triangle += 1
  ) {
    const a =
      vertexIndex(triangle, 0)
    const b =
      vertexIndex(triangle, 1)
    const c =
      vertexIndex(triangle, 2)

    readSkinnedPosition(
      a,
      skinnedA,
    )
    readSkinnedPosition(
      b,
      skinnedB,
    )
    readSkinnedPosition(
      c,
      skinnedC,
    )

    center
      .copy(skinnedA)
      .add(skinnedB)
      .add(skinnedC)
      .multiplyScalar(1 / 3)

    const angle =
      Math.atan2(
        center.x,
        center.z,
      )
    // Preserve more of the real chest directly behind the front
    // neckline. Without this, the body mask removes the chest too high
    // and the camera sees the dark far/interior wall of the tunic through
    // the V opening.
    const frontAmount =
      Math.max(
        0,
        Math.cos(angle),
      )
    const frontNeckT =
      THREE.MathUtils.smoothstep(
        frontAmount,
        .72,
        .98,
      )
    const topInset =
      frame.height *
      THREE.MathUtils.lerp(
        .024,
        .055,
        frontNeckT,
      )
    const bottomInset =
      frame.height * .018
    const torsoCovered =
      center.y >=
        bottomY + bottomInset &&
      center.y <=
        tunicTopY(
          frame,
          angle,
        ) -
          topInset &&
      Math.abs(center.x) <=
        frame.torsoLimit * .92

    const sleeveCovered =
      sleeveRanges.some(
        (range) =>
          pointInsideSleeveMask(
            center,
            range,
          ),
      )
    const shoulderCovered =
      shoulderOcclusionRanges.some(
        (range) =>
          pointInsideShoulderOcclusion(
            center,
            range,
          ),
      )

    if (
      !torsoCovered &&
      !sleeveCovered &&
      !shoulderCovered
    ) {
      kept.push(a, b, c)
    }
  }

  geometry.setIndex(kept)
  geometry.computeBoundingSphere()
  source.geometry = geometry

  return () => {
    if (
      source.geometry === geometry
    ) {
      source.geometry = original
    }
    geometry.dispose()
  }
}


type ShoulderOcclusionRange = {
  start: THREE.Vector3
  direction: THREE.Vector3
  length: number
  startDistance: number
  endDistance: number
  radius: number
  sideSign: number
  maxOutwardX: number
}

function createShoulderOcclusionRange(
  source: THREE.SkinnedMesh,
  side: 'L' | 'R',
): ShoulderOcclusionRange | undefined {
  const upper =
    findBone(
      source,
      `upperarm_${side}`,
    )
  const lower =
    findBone(
      source,
      `lowerarm_${side}`,
    ) ??
    findBone(
      source,
      `forearm_${side}`,
    )

  if (!upper || !lower) {
    return undefined
  }

  const start =
    objectPositionInMesh(
      source,
      upper,
    )
  const end =
    objectPositionInMesh(
      source,
      lower,
    )
  const vector =
    end.clone().sub(start)
  const length =
    vector.length()

  if (length < .05) {
    return undefined
  }

  return {
    start,
    direction:
      vector.clone().normalize(),
    length,
    startDistance:
      length * -.18,
    endDistance:
      length * .46,
    radius:
      length * .235,
    sideSign:
      Math.sign(start.x) ||
      (side === 'L' ? 1 : -1),
    maxOutwardX:
      Math.abs(start.x) +
      length * .2,
  }
}

function pointInsideShoulderOcclusion(
  point: THREE.Vector3,
  range: ShoulderOcclusionRange,
) {
  const signedX =
    point.x * range.sideSign

  if (
    signedX <
      Math.abs(range.start.x) * .88 ||
    signedX >
      range.maxOutwardX
  ) {
    return false
  }

  const offset =
    point
      .clone()
      .sub(range.start)
  const projected =
    offset.dot(range.direction)

  if (
    projected <
      range.startDistance ||
    projected >
      range.endDistance
  ) {
    return false
  }

  const closest =
    range.start
      .clone()
      .addScaledVector(
        range.direction,
        projected,
      )

  return (
    point.distanceTo(closest) <=
    range.radius
  )
}


type SleeveMaskRange = {
  start: THREE.Vector3
  direction: THREE.Vector3
  length: number
  startDistance: number
  endDistance: number
  radius: number
  sideSign: number
}

function createSleeveMaskRange(
  source: THREE.SkinnedMesh,
  side: 'L' | 'R',
  sleeve: EquipmentForgeV3Sleeve,
): SleeveMaskRange | undefined {
  const upper =
    findBone(
      source,
      `upperarm_${side}`,
      `clavicle_${side}`,
    )
  const lower =
    findBone(
      source,
      `lowerarm_${side}`,
      `forearm_${side}`,
    )
  if (!upper || !lower) {
    return undefined
  }

  const start =
    objectPositionInMesh(
      source,
      upper,
    )
  const end =
    objectPositionInMesh(
      source,
      lower,
    )
  const vector =
    end.clone().sub(start)
  const length =
    vector.length()
  if (length < .05) {
    return undefined
  }

  return {
    start,
    direction:
      vector.clone().normalize(),
    length,
    // The generated short sleeve begins slightly inside the shoulder
    // root. Mask the body over the same overlap so isolated upper-arm
    // triangles cannot poke through the bridge from top-down views.
    startDistance:
      length *
      (sleeve === 'short'
        ? -.035
        : .015),
    endDistance:
      length *
      (sleeve === 'long'
        ? .83
        : .39),
    radius:
      length * .2,
    sideSign:
      Math.sign(start.x) ||
      (side === 'L' ? 1 : -1),
  }
}

function pointInsideSleeveMask(
  point: THREE.Vector3,
  range: SleeveMaskRange,
) {
  if (
    point.x * range.sideSign <
    Math.abs(range.start.x) * .9
  ) {
    return false
  }

  const offset =
    point
      .clone()
      .sub(range.start)
  const projected =
    offset.dot(range.direction)

  if (
    projected <
      range.startDistance ||
    projected >
      range.endDistance
  ) {
    return false
  }

  const closest =
    range.start
      .clone()
      .addScaledVector(
        range.direction,
        projected,
      )

  return (
    point.distanceTo(closest) <=
    range.radius
  )
}

function findBone(
  source: THREE.SkinnedMesh,
  ...names: string[]
) {
  const normalized =
    names.map((value) =>
      value.toLowerCase(),
    )

  return source.skeleton.bones.find(
    (bone) => {
      const lower =
        bone.name.toLowerCase()
      return normalized.some(
        (name) =>
          lower === name ||
          lower.endsWith(name) ||
          lower.includes(name),
      )
    },
  )
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
