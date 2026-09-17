import type { ForgeCharacterRole } from './characterBlueprint'
import type { ForgeGameplayContent, ForgePlayerDefinition } from './forgeProject'

export type SkillboundArchetypeRole = Extract<ForgeCharacterRole, 'melee' | 'ranged' | 'caster'>
export type SkillboundArchetypeLoadout = {
  label?: string
  basicAbility: string
  activeAbilities: string[]
  startingItems: string[]
  maxHealth?: number
  moveSpeed?: number
  dodgeDistance?: number
  dodgeCooldown?: number
}

type PlayerWithArchetypes = ForgePlayerDefinition & {
  archetypeLoadouts?: Partial<Record<SkillboundArchetypeRole, SkillboundArchetypeLoadout>>
}

export function resolvePlayerLoadout(player: ForgePlayerDefinition, role?: ForgeCharacterRole): SkillboundArchetypeLoadout {
  const base: SkillboundArchetypeLoadout = {
    basicAbility: player.basicAbility,
    activeAbilities: [...player.activeAbilities],
    startingItems: [...player.startingItems],
    maxHealth: player.maxHealth,
    moveSpeed: player.moveSpeed,
    dodgeDistance: player.dodgeDistance,
    dodgeCooldown: player.dodgeCooldown,
  }
  if (role !== 'melee' && role !== 'ranged' && role !== 'caster') return base
  const loadout = (player as PlayerWithArchetypes).archetypeLoadouts?.[role]
  return loadout ? {
    label: loadout.label,
    basicAbility: loadout.basicAbility || base.basicAbility,
    activeAbilities: loadout.activeAbilities?.length ? [...loadout.activeAbilities] : [...base.activeAbilities],
    startingItems: loadout.startingItems ? [...loadout.startingItems] : [...base.startingItems],
    maxHealth: finiteOr(loadout.maxHealth, base.maxHealth),
    moveSpeed: finiteOr(loadout.moveSpeed, base.moveSpeed),
    dodgeDistance: finiteOr(loadout.dodgeDistance, base.dodgeDistance),
    dodgeCooldown: finiteOr(loadout.dodgeCooldown, base.dodgeCooldown),
  } : base
}

export function resolveGameplayForRole(gameplay: ForgeGameplayContent, role?: ForgeCharacterRole): ForgeGameplayContent {
  const loadout = resolvePlayerLoadout(gameplay.player, role)
  return {
    ...gameplay,
    player: {
      ...gameplay.player,
      maxHealth: loadout.maxHealth ?? gameplay.player.maxHealth,
      moveSpeed: loadout.moveSpeed ?? gameplay.player.moveSpeed,
      dodgeDistance: loadout.dodgeDistance ?? gameplay.player.dodgeDistance,
      dodgeCooldown: loadout.dodgeCooldown ?? gameplay.player.dodgeCooldown,
      basicAbility: loadout.basicAbility,
      activeAbilities: [...loadout.activeAbilities],
      startingItems: [...loadout.startingItems],
    },
  }
}

export function archetypeLabel(role?: ForgeCharacterRole) {
  if (role === 'ranged') return 'Thornwarden'
  if (role === 'caster') return 'Voidweaver'
  return 'Duskstrider'
}

function finiteOr(value: number | undefined, fallback: number | undefined) {
  return Number.isFinite(value) ? value : fallback
}
