import type { ForgeCharacterRole } from './characterBlueprint'
import type { ForgeGameplayContent, ForgePlayerDefinition } from './forgeProject'

export type SkillboundArchetypeRole = Extract<ForgeCharacterRole, 'melee' | 'ranged' | 'caster'>
export type SkillboundArchetypeLoadout = {
  label?: string
  basicAbility: string
  activeAbilities: string[]
  startingItems: string[]
}

type PlayerWithArchetypes = ForgePlayerDefinition & {
  archetypeLoadouts?: Partial<Record<SkillboundArchetypeRole, SkillboundArchetypeLoadout>>
}

export function resolvePlayerLoadout(player: ForgePlayerDefinition, role?: ForgeCharacterRole): SkillboundArchetypeLoadout {
  const base: SkillboundArchetypeLoadout = {
    basicAbility: player.basicAbility,
    activeAbilities: [...player.activeAbilities],
    startingItems: [...player.startingItems],
  }
  if (role !== 'melee' && role !== 'ranged' && role !== 'caster') return base
  const loadout = (player as PlayerWithArchetypes).archetypeLoadouts?.[role]
  return loadout ? {
    label: loadout.label,
    basicAbility: loadout.basicAbility || base.basicAbility,
    activeAbilities: loadout.activeAbilities?.length ? [...loadout.activeAbilities] : [...base.activeAbilities],
    startingItems: loadout.startingItems ? [...loadout.startingItems] : [...base.startingItems],
  } : base
}

export function resolveGameplayForRole(gameplay: ForgeGameplayContent, role?: ForgeCharacterRole): ForgeGameplayContent {
  const loadout = resolvePlayerLoadout(gameplay.player, role)
  return {
    ...gameplay,
    player: {
      ...gameplay.player,
      basicAbility: loadout.basicAbility,
      activeAbilities: [...loadout.activeAbilities],
      startingItems: [...loadout.startingItems],
    },
  }
}

export function archetypeLabel(role?: ForgeCharacterRole) {
  if (role === 'ranged') return 'Ranger'
  if (role === 'caster') return 'Arcanist'
  return 'Vanguard'
}
