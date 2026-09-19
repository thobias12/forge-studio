import * as THREE from 'three'

export type SkinInfluence = {
  indices: [number, number, number, number]
  weights: [number, number, number, number]
}

export function readSkinInfluence(
  geometry: THREE.BufferGeometry,
  index: number,
): SkinInfluence {
  const skinIndex =
    geometry.getAttribute('skinIndex')
  const skinWeight =
    geometry.getAttribute('skinWeight')

  if (!skinIndex || !skinWeight) {
    return {
      indices: [0, 0, 0, 0],
      weights: [1, 0, 0, 0],
    }
  }

  return {
    indices: [
      skinIndex.getX(index),
      skinIndex.getY(index),
      skinIndex.getZ(index),
      skinIndex.getW(index),
    ],
    weights: [
      skinWeight.getX(index),
      skinWeight.getY(index),
      skinWeight.getZ(index),
      skinWeight.getW(index),
    ],
  }
}

export function applySkinAttributes(
  geometry: THREE.BufferGeometry,
  influences: SkinInfluence[],
) {
  const indices: number[] = []
  const weights: number[] = []

  for (const influence of influences) {
    indices.push(...influence.indices)
    weights.push(...influence.weights)
  }

  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(
      indices,
      4,
    ),
  )
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      weights,
      4,
    ),
  )
}
