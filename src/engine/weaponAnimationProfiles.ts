export type ForgeWeaponAnimationProfile = 'unarmed' | 'one-hand-sword' | 'two-hand-sword' | 'axe-mace' | 'spear' | 'bow' | 'staff'

export const FORGE_WEAPON_ANIMATION_PROFILES: Array<{ id: ForgeWeaponAnimationProfile; label: string; detail: string }> = [
  { id: 'unarmed', label: 'Unarmed', detail: 'No equipped weapon; punches, claws or generic locomotion.' },
  { id: 'one-hand-sword', label: 'One-Handed Sword', detail: 'Primary hand weapon with the off-hand free.' },
  { id: 'two-hand-sword', label: 'Two-Handed Sword', detail: 'Heavy blade profile prepared for a future secondary grip target.' },
  { id: 'axe-mace', label: 'Axe / Mace', detail: 'One-handed chopping and blunt weapon stance.' },
  { id: 'spear', label: 'Spear / Polearm', detail: 'Long reach thrusting weapon stance.' },
  { id: 'bow', label: 'Bow', detail: 'Ranged bow stance and firing actions.' },
  { id: 'staff', label: 'Staff', detail: 'Staff, wand and caster weapon stance.' },
]

export function weaponAnimationProfileLabel(id: ForgeWeaponAnimationProfile) {
  return FORGE_WEAPON_ANIMATION_PROFILES.find((profile) => profile.id === id)?.label ?? id
}
