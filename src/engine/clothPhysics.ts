export type ForgeClothKind = 'cape' | 'cloak' | 'skirt' | 'banner'
export type ForgeClothSolver = 'verlet'
export type ForgeClothPinBone = 'Chest' | 'Spine' | 'UpperArm_L' | 'UpperArm_R'

export type ForgeClothPin = {
  bone: ForgeClothPinBone
  u: number
  v: number
  weight: number
}

export type ForgeClothProfile = {
  format: 'forge-cloth-profile'
  version: 1
  kind: ForgeClothKind
  solver: ForgeClothSolver
  segmentsX: number
  segmentsY: number
  stiffness: number
  bendStiffness: number
  damping: number
  gravityScale: number
  windResponse: number
  collisionRadius: number
  maxStretch: number
  lodDistance: number
  sleepDistance: number
  pins: ForgeClothPin[]
}

/**
 * Runtime-ready data contract for future Skillbound cloth wearables.
 * The actual cloth solver is intentionally separate from authored item geometry:
 * inventory/world-drop use the static master mesh, while equipped capes can opt into
 * simulation against the ForgeHumanoidV1 body capsules.
 */
export const DEFAULT_CAPE_CLOTH_PROFILE: ForgeClothProfile = {
  format: 'forge-cloth-profile',
  version: 1,
  kind: 'cape',
  solver: 'verlet',
  segmentsX: 10,
  segmentsY: 16,
  stiffness: 0.82,
  bendStiffness: 0.28,
  damping: 0.94,
  gravityScale: 0.82,
  windResponse: 0.45,
  collisionRadius: 0.08,
  maxStretch: 1.08,
  lodDistance: 18,
  sleepDistance: 35,
  pins: [
    { bone: 'Chest', u: 0.2, v: 0, weight: 1 },
    { bone: 'Chest', u: 0.5, v: 0, weight: 1 },
    { bone: 'Chest', u: 0.8, v: 0, weight: 1 },
  ],
}

export function cloneClothProfile(profile: ForgeClothProfile = DEFAULT_CAPE_CLOTH_PROFILE): ForgeClothProfile {
  return { ...profile, pins: profile.pins.map((pin) => ({ ...pin })) }
}
