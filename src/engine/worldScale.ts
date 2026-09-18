/**
 * Forge world-scale contract.
 *
 * World Forge treats one world unit as roughly one metre. Gameplay actors,
 * generated spacing, landmarks and editor/runtime renderers should use these
 * values rather than independently inflating or shrinking the scene.
 */
export const FORGE_WORLD_SCALE = {
  metersPerUnit: 1,
  characterHeight: 1.85,

  routeNodeSpacing: 31,
  routeWanderScale: 1.34,
  routeInitialLateralJitter: 14,
  routeLateralExtentScale: 1.45,

  clearingRadiusScale: 1.28,
  treeScale: 1.32,
  dressingDensityScale: 1.4,
  dressingClusterRadiusScale: 1.22,

  poiApproachScale: 1.35,
  poiRadiusScale: 1.25,
  poiVisualScale: 1.2,

  regionEdgeMargin: 30.5,

  playCameraFov: 48,
  playCameraDistance: 23.5,
  playCameraMinDistance: 20.5,
  playCameraMaxDistance: 36,
  playCameraWheelStep: 1.5,
  playCameraHorizontalScale: 0.63,
  playCameraVerticalScale: 0.6,
  playCameraLookAtHeight: 1.05,

  largeTreeSoftCapStart: 1.75,
  largeTreeCompression: 0.62,

  bridgeDeckWidthScale: 0.96,
  bridgeLengthScale: 1.58,
  bridgeMinimumLength: 5.4,
  bridgeRailHeight: 0.78,
  bridgeRailThickness: 0.14,
  bridgePostHeight: 0.9,
} as const

export function forgeTreePresentationScale(scale: number) {
  const threshold = FORGE_WORLD_SCALE.largeTreeSoftCapStart
  if (scale <= threshold) return scale
  return threshold +
    (scale - threshold) * FORGE_WORLD_SCALE.largeTreeCompression
}

export function forgePoiVisualScale(type: string) {
  const base = FORGE_WORLD_SCALE.poiVisualScale
  if (type === 'settlement') return base * 1.15
  if (type === 'ruins' || type === 'graveyard') return base * 1.12
  if (type === 'watchtower' || type === 'dungeon') return base * 1.08
  if (type === 'camp') return base * 1.06
  if (type === 'shrine' || type === 'standing-stones') return base * 1.05
  return base
}

export function forgePoiPresentationRotation(
  nodes: readonly { id: string; x: number; z: number; parentId?: string }[],
  poi: { nodeId: string; x: number; z: number; rotation: number },
) {
  const node = nodes.find((candidate) => candidate.id === poi.nodeId)
  const parent = node?.parentId
    ? nodes.find((candidate) => candidate.id === node.parentId)
    : undefined
  if (!parent) return poi.rotation

  const dx = parent.x - poi.x
  const dz = parent.z - poi.z
  if (Math.hypot(dx, dz) < .001) return poi.rotation

  // Local +Z is the authored entrance side for Forge POIs.
  return Math.atan2(dx, dz)
}

export function forgePoiDressingClearanceRadius(type: string, radius: number) {
  const factor =
    type === 'settlement' ? 1 :
      type === 'graveyard' || type === 'ruins' ? .92 :
        type === 'watchtower' || type === 'dungeon' ? .88 :
          type === 'camp' ? .86 :
            .82
  return Math.max(4.6, radius * factor)
}

export function forgePoiClearsDressing(
  pois: readonly { type: string; x: number; z: number; radius: number }[],
  x: number,
  z: number,
) {
  return pois.some((poi) =>
    Math.hypot(x - poi.x, z - poi.z) <
    forgePoiDressingClearanceRadius(poi.type, poi.radius)
  )
}

export function forgeBridgeDimensions(crossingWidth: number) {
  return {
    width: crossingWidth * FORGE_WORLD_SCALE.bridgeDeckWidthScale,
    length: Math.max(
      FORGE_WORLD_SCALE.bridgeMinimumLength,
      crossingWidth * FORGE_WORLD_SCALE.bridgeLengthScale,
    ),
  }
}
