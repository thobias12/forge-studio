import type { ForgeCharacterBuild, ForgeCharacterConfig } from '../lib/proceduralCharacter'
import {
  createProceduralStarterHumanoidV2,
  type SkillboundStarterClass,
} from './proceduralHumanoidV2'

export type { SkillboundStarterClass } from './proceduralHumanoidV2'
export type StarterClassCharacterConfig = ForgeCharacterConfig & { starterClass?: SkillboundStarterClass }

export function createStarterClassCharacter(
  config: ForgeCharacterConfig,
  starterClass: SkillboundStarterClass,
): ForgeCharacterBuild {
  return createProceduralStarterHumanoidV2(config, starterClass)
}
