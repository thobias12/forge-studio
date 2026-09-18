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
  playCameraDistance: 31,
  playCameraMinDistance: 23,
  playCameraMaxDistance: 43,

  bridgeDeckWidthScale: 0.96,
  bridgeLengthScale: 1.58,
  bridgeMinimumLength: 5.4,
  bridgeRailHeight: 0.78,
  bridgeRailThickness: 0.14,
  bridgePostHeight: 0.9,
} as const

export function forgeBridgeDimensions(crossingWidth: number) {
  return {
    width: crossingWidth * FORGE_WORLD_SCALE.bridgeDeckWidthScale,
    length: Math.max(
      FORGE_WORLD_SCALE.bridgeMinimumLength,
      crossingWidth * FORGE_WORLD_SCALE.bridgeLengthScale,
    ),
  }
}
