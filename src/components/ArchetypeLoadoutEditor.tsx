import type { ForgeGameplayContent, ForgePlayerDefinition } from '../engine/forgeProject'
import { resolvePlayerLoadout, type SkillboundArchetypeLoadout, type SkillboundArchetypeRole } from '../engine/playerLoadout'

const ROLES: Array<{ id: SkillboundArchetypeRole; label: string; detail: string }> = [
  { id: 'melee', label: 'Vanguard', detail: 'Durable frontliner · shield pressure · shorter dodge' },
  { id: 'ranged', label: 'Ranger', detail: 'Fast skirmisher · ranged pressure · longer dodge' },
  { id: 'caster', label: 'Arcanist', detail: 'Fragile spellcaster · burst area damage · mobile positioning' },
]

type Props = {
  player: ForgePlayerDefinition
  gameplay: ForgeGameplayContent
  onPatch: (patch: Partial<ForgePlayerDefinition>) => void
}

export default function ArchetypeLoadoutEditor({ player, gameplay, onPatch }: Props) {
  const abilityOptions = gameplay.abilities.map((ability) => [ability.id, ability.name] as const)
  const itemOptions = gameplay.items.map((item) => [item.id, item.name] as const)

  const patchRole = (role: SkillboundArchetypeRole, patch: Partial<SkillboundArchetypeLoadout>) => {
    const current = resolvePlayerLoadout(player, role)
    const archetypeLoadouts = {
      ...(player.archetypeLoadouts ?? {}),
      [role]: { ...current, ...patch },
    }
    onPatch({ archetypeLoadouts } as Partial<ForgePlayerDefinition>)
  }

  return <section className="archetype-loadout-editor">
    <header>
      <div><span>PLAYABLE ARCHETYPES</span><strong>Runtime loadouts</strong></div>
      <p>These values are resolved before World Forge or dungeon play starts, so the same authored profile drives both runtimes.</p>
    </header>
    <div className="archetype-loadout-grid">
      {ROLES.map(({ id, label, detail }) => {
        const value = resolvePlayerLoadout(player, id)
        const gear = [...value.startingItems]
        while (gear.length < 3) gear.push('')
        return <article className={`archetype-loadout-card role-${id}`} key={id}>
          <div className="archetype-loadout-title"><span>{label.toUpperCase()}</span><small>{detail}</small></div>
          <label><span>Display name</span><input value={value.label ?? label} onChange={(event) => patchRole(id, { label: event.target.value })}/></label>
          <div className="archetype-loadout-pair">
            <label><span>LMB · Primary</span><select value={value.basicAbility} onChange={(event) => patchRole(id, { basicAbility: event.target.value })}>{abilityOptions.map(([abilityId, name]) => <option value={abilityId} key={abilityId}>{name}</option>)}</select></label>
            <label><span>Q · Active</span><select value={value.activeAbilities[0] ?? ''} onChange={(event) => patchRole(id, { activeAbilities: event.target.value ? [event.target.value] : [] })}><option value="">None</option>{abilityOptions.map(([abilityId, name]) => <option value={abilityId} key={abilityId}>{name}</option>)}</select></label>
          </div>
          <div className="archetype-loadout-stats">
            <NumberField label="Health" value={value.maxHealth ?? player.maxHealth} min={40} max={500} step={5} onChange={(maxHealth) => patchRole(id, { maxHealth })}/>
            <NumberField label="Move" value={value.moveSpeed ?? player.moveSpeed} min={3} max={18} step={0.1} onChange={(moveSpeed) => patchRole(id, { moveSpeed })}/>
            <NumberField label="Dodge dist." value={value.dodgeDistance ?? player.dodgeDistance} min={1} max={12} step={0.1} onChange={(dodgeDistance) => patchRole(id, { dodgeDistance })}/>
            <NumberField label="Dodge CD" value={value.dodgeCooldown ?? player.dodgeCooldown} min={0.2} max={4} step={0.05} onChange={(dodgeCooldown) => patchRole(id, { dodgeCooldown })}/>
          </div>
          <div className="archetype-starting-gear">
            <span>STARTING EQUIPMENT</span>
            {gear.slice(0, 3).map((itemId, index) => <select key={index} value={itemId} onChange={(event) => {
              const next = [...gear]
              next[index] = event.target.value
              patchRole(id, { startingItems: next.filter(Boolean) })
            }}><option value="">Empty slot</option>{itemOptions.map(([candidateId, name]) => <option value={candidateId} key={candidateId}>{name}</option>)}</select>)}
          </div>
        </article>
      })}
    </div>
  </section>
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}/></label>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}
