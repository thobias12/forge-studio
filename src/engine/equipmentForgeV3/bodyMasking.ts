import * as THREE from 'three'
import {
  tunicTopY,
  type TunicTemplateFrame,
} from './conform'

export type BodyMaskRestore = () => void

export function maskBodyUnderTunic(
  source: THREE.SkinnedMesh,
  frame: TunicTemplateFrame,
  length: number,
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

    center.set(
      (
        position.getX(a) +
        position.getX(b) +
        position.getX(c)
      ) / 3,
      (
        position.getY(a) +
        position.getY(b) +
        position.getY(c)
      ) / 3,
      (
        position.getZ(a) +
        position.getZ(b) +
        position.getZ(c)
      ) / 3,
    )

    const angle =
      Math.atan2(
        center.x,
        center.z,
      )
    const covered =
      center.y >=
        bottomY - frame.height * .015 &&
      center.y <=
        tunicTopY(
          frame,
          angle,
        ) +
          frame.height * .008 &&
      Math.abs(center.x) <=
        frame.torsoLimit * 1.04

    if (!covered) {
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
