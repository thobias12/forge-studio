import { useEffect, useMemo, useState } from 'react'
import { Copy, FolderSync, Gauge, Library, Plus, Save, Sparkles, Trash2, Volume2, WandSparkles, Zap } from 'lucide-react'
import {
  loadSkillboundWorkspace,
  saveSkillboundWorkspace,
  type ForgeAbilityDefinition,
  type ForgePlayerDefinition,
  type ForgeProjectWorkspace,
} from '../engine/forgeProject'
import { addManagedManifestPath, removeManagedManifestPath, slugContentId, uniqueContentId } from '../engine/contentManagement'
import { getSkillboundProjectConnection, saveSkillboundWorkspaceToProjectFolder } from '../engine/projectPersistence'
import { listAssets, type LibraryAsset } from '../lib/library'
import '../skill-forge.css'

type SkillAbility = ForgeAbilityDefinition & {
  manaCost?: number
  iconAssetId?: string
  sfxAssetId?: string
}

type SkillPlayer = ForgePlayerDefinition & {
  maxMana?: number
  manaRegen?: number
  hotbar?: string[]
}

const EMPTY_SLOT = ''

export default function SkillForge() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [sourceConnected, setSourceConnected] = useState(false)
  const [status, setStatus] = useState('Loading Skill Forge…')

  useEffect(() => {
    void Promise.all([
      loadSkillboundWorkspace(),
      listAssets().catch(() => []),
      getSkillboundProjectConnection().catch(() => undefined),
    ]).then(([project, library, connection]) => {
      setWorkspace(project)
      setAssets(library)
      setSelectedId(project.gameplay.abilities.find((ability) => ability.id !== project.gameplay.player.basicAbility)?.id ?? project.gameplay.abilities[0]?.id ?? '')
      setSourceConnected(connection?.permission === 'granted' || connection?.permission === 'prompt')
      setStatus('Skill Forge is live · edits update the active Skillbound workspace immediately.')
    }).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Skill Forge.'))
  }, [])

  const ability = workspace?.gameplay.abilities.find((candidate) => candidate.id === selectedId) as SkillAbility | undefined
  const player = workspace?.gameplay.player as SkillPlayer | undefined
  const hotbar = useMemo(() => normalizeHotbar(player), [player])
  const vfxAssets = assets.filter((asset) => asset.category === 'vfx' || asset.tags.includes('vfx'))
  const audioAssets = assets.filter((asset) => asset.category === 'audio' || asset.mime.startsWith('audio/'))
  const animationAssets = assets.filter((asset) => asset.category === 'animations' && asset.kind === 'glb')
  const iconAssets = assets.filter((asset) => asset.category === 'textures' || asset.mime.startsWith('image/'))

  const commit = (next: ForgeProjectWorkspace, message: string) => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
    return saved
  }

  const patchAbility = (patch: Partial<SkillAbility>) => {
    if (!workspace || !ability) return
    const abilities = workspace.gameplay.abilities.map((entry) => entry.id === ability.id ? { ...entry, ...patch } : entry)
    commit({ ...workspace, gameplay: { ...workspace.gameplay, abilities } }, `${patch.name ?? ability.name} updated.`)
  }

  const patchPlayer = (patch: Partial<SkillPlayer>, message = 'Player skill runtime updated.') => {
    if (!workspace) return
    commit({ ...workspace, gameplay: { ...workspace.gameplay, player: { ...workspace.gameplay.player, ...patch } } }, message)
  }

  const createSkill = () => {
    if (!workspace) return
    const name = window.prompt('Skill name', 'New Skill')?.trim()
    if (!name) return
    const id = uniqueContentId(slugContentId(name), workspace.gameplay.abilities.map((entry) => entry.id))
    const created: SkillAbility = {
      format: 'forge-ability', version: 1, id, name, kind: 'area', input: 'skill-1',
      damage: 24, cooldown: 1.6, range: 5, radius: 2.1, color: '#68aee8', manaCost: 14,
    }
    const next = commit({
      ...workspace,
      manifest: addManagedManifestPath(workspace.manifest, 'ability', id),
      gameplay: { ...workspace.gameplay, abilities: [...workspace.gameplay.abilities, created] },
    }, `${name} created. Assign it to a hotbar slot when ready.`)
    setWorkspace(next)
    setSelectedId(id)
  }

  const duplicateSkill = () => {
    if (!workspace || !ability) return
    const id = uniqueContentId(`${ability.id}-copy`, workspace.gameplay.abilities.map((entry) => entry.id))
    const copy: SkillAbility = { ...ability, id, name: `${ability.name} Copy` }
    const next = commit({
      ...workspace,
      manifest: addManagedManifestPath(workspace.manifest, 'ability', id),
      gameplay: { ...workspace.gameplay, abilities: [...workspace.gameplay.abilities, copy] },
    }, `${copy.name} created.`)
    setWorkspace(next)
    setSelectedId(id)
  }

  const deleteSkill = () => {
    if (!workspace || !ability) return
    const used = workspace.gameplay.player.basicAbility === ability.id || workspace.gameplay.player.activeAbilities.includes(ability.id) || hotbar.includes(ability.id)
    if (used) { setStatus(`${ability.name} is still assigned to the player. Remove it from Primary / Active Abilities / Hotbar first.`); return }
    if (!window.confirm(`Delete ${ability.name}?`)) return
    const remaining = workspace.gameplay.abilities.filter((entry) => entry.id !== ability.id)
    commit({
      ...workspace,
      manifest: removeManagedManifestPath(workspace.manifest, 'ability', ability.id),
      gameplay: { ...workspace.gameplay, abilities: remaining },
    }, `${ability.name} removed.`)
    setSelectedId(remaining[0]?.id ?? '')
  }

  const setHotbarSlot = (slot: number, abilityId: string) => {
    const next = normalizeHotbar(player)
    next[slot] = abilityId
    const activeAbilities = next.filter(Boolean)
    patchPlayer({ hotbar: next, activeAbilities }, `Hotbar slot ${slot + 1} assigned.`)
  }

  const writeSource = async () => {
    if (!workspace) return
    try {
      setStatus('Writing Skill Forge data to the connected Skillbound source…')
      const written = await saveSkillboundWorkspaceToProjectFolder(workspace)
      setWorkspace(saveSkillboundWorkspace(written))
      setStatus(`Skill source written · content revision ${written.manifest.contentRevision ?? 1}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not write Skill Forge source.')
    }
  }

  if (!workspace || !player) return <div className="skill-forge-loading"><Zap size={30}/><strong>Opening Skill Forge</strong><span>{status}</span></div>

  return <div className="skill-forge-page">
    <header className="skill-forge-toolbar">
      <div><span className="eyebrow">SKILLBOUND / ABILITY AUTHORING</span><strong>Skill Forge</strong><small>Author gameplay numbers, mana, animation, VFX, SFX and the live 1–5 hotbar in one place.</small></div>
      <div className="skill-forge-toolbar-actions">
        <button onClick={() => void listAssets().then(setAssets)}><Library size={14}/> Refresh Library</button>
        <button onClick={() => { setWorkspace(saveSkillboundWorkspace(workspace)); setStatus('Skillbound skill workspace saved.') }}><Save size={14}/> Save</button>
        <button className="primary" disabled={!sourceConnected} onClick={() => void writeSource()}><FolderSync size={14}/> Write Source</button>
      </div>
    </header>

    <div className="skill-forge-layout">
      <aside className="skill-forge-list">
        <div className="skill-list-heading"><span>SKILLS</span><button onClick={createSkill}><Plus size={14}/> New</button></div>
        {workspace.gameplay.abilities.map((entry) => {
          const skill = entry as SkillAbility
          const selected = skill.id === selectedId
          const assigned = hotbar.indexOf(skill.id)
          return <button className={selected ? 'skill-row active' : 'skill-row'} key={skill.id} onClick={() => setSelectedId(skill.id)}>
            <i style={{ background: skill.color }}/><span><strong>{skill.name}</strong><small>{skill.kind} · {skill.damage} dmg · {manaCost(skill, player.basicAbility)} mana</small></span>{assigned >= 0 && <em>{assigned + 1}</em>}
          </button>
        })}
      </aside>

      <main className="skill-forge-editor">
        {!ability ? <div className="skill-forge-empty">Create or select a skill.</div> : <>
          <div className="skill-editor-title">
            <div><span className="eyebrow">ABILITY</span><input value={ability.name} onChange={(event) => patchAbility({ name: event.target.value })}/><small>{ability.id}</small></div>
            <div><button onClick={duplicateSkill}><Copy size={14}/> Duplicate</button><button className="danger" onClick={deleteSkill}><Trash2 size={14}/> Delete</button></div>
          </div>

          <section className="skill-forge-section">
            <header><Gauge size={16}/><div><strong>Gameplay</strong><small>These values are consumed directly by the runtime.</small></div></header>
            <div className="skill-form-grid">
              <label><span>Behavior</span><select value={ability.kind} onChange={(event) => patchAbility({ kind: event.target.value as ForgeAbilityDefinition['kind'] })}><option value="melee">Melee arc</option><option value="area">Targeted area</option></select></label>
              <label><span>Delivery</span><select value={ability.delivery ?? 'standard'} onChange={(event) => patchAbility({ delivery: event.target.value as ForgeAbilityDefinition['delivery'] })}><option value="standard">Standard hit / area</option><option value="chain">Chain / bouncing</option></select></label>
              <NumberField label="Damage" value={ability.damage} min={0} step={1} onChange={(damage) => patchAbility({ damage })}/>
              <NumberField label="Mana cost" value={manaCost(ability, player.basicAbility)} min={0} step={1} onChange={(manaCost) => patchAbility({ manaCost })}/>
              <NumberField label="Cooldown" value={ability.cooldown} min={0} step={0.05} suffix="s" onChange={(cooldown) => patchAbility({ cooldown })}/>
              <NumberField label="Range" value={ability.range} min={0.5} step={0.1} suffix="m" onChange={(range) => patchAbility({ range })}/>
              <NumberField label="Radius" value={ability.radius} min={0.1} step={0.1} suffix="m" onChange={(radius) => patchAbility({ radius })}/>
              <label><span>Gameplay color</span><input type="color" value={ability.color} onChange={(event) => patchAbility({ color: event.target.value })}/></label>
              <label><span>Input role</span><select value={ability.id === player.basicAbility ? 'primary' : 'skill'} onChange={(event) => {
                if (event.target.value === 'primary') patchPlayer({ basicAbility: ability.id }, `${ability.name} is now the primary LMB skill.`)
              }}><option value="skill">Hotbar skill</option><option value="primary">Primary · LMB</option></select></label>
            </div>
          </section>

          {ability.delivery === 'chain' && <section className="skill-forge-section">
            <header><Zap size={16}/><div><strong>Chain delivery</strong><small>Target-to-target bounce behavior and the built-in deterministic lightning presentation.</small></div></header>
            <div className="skill-form-grid">
              <NumberField label="Max jumps" value={ability.chain?.maxJumps ?? 5} min={1} step={1} onChange={(maxJumps) => patchAbility({ chain: { ...ability.chain, maxJumps } })}/>
              <NumberField label="Jump radius" value={ability.chain?.jumpRadius ?? 5.8} min={0.5} step={0.1} suffix="m" onChange={(jumpRadius) => patchAbility({ chain: { ...ability.chain, jumpRadius } })}/>
              <NumberField label="Jump delay" value={ability.chain?.jumpDelay ?? 0.075} min={0.015} step={0.005} suffix="s" onChange={(jumpDelay) => patchAbility({ chain: { ...ability.chain, jumpDelay } })}/>
              <NumberField label="Damage falloff" value={ability.chain?.damageFalloff ?? 0.86} min={0} step={0.01} onChange={(damageFalloff) => patchAbility({ chain: { ...ability.chain, damageFalloff } })}/>
              <NumberField label="Bolt lifetime" value={ability.chain?.boltLifetime ?? 0.155} min={0.05} step={0.005} suffix="s" onChange={(boltLifetime) => patchAbility({ chain: { ...ability.chain, boltLifetime } })}/>
              <NumberField label="Arc jitter" value={ability.chain?.arcAmplitude ?? 0.32} min={0} step={0.01} onChange={(arcAmplitude) => patchAbility({ chain: { ...ability.chain, arcAmplitude } })}/>
              <NumberField label="Side branches" value={ability.chain?.branchCount ?? 2} min={0} step={1} onChange={(branchCount) => patchAbility({ chain: { ...ability.chain, branchCount } })}/>
              <NumberField label="Glow width" value={ability.chain?.glowWidth ?? 0.075} min={0.01} step={0.005} onChange={(glowWidth) => patchAbility({ chain: { ...ability.chain, glowWidth } })}/>
              <NumberField label="Light flash" value={ability.chain?.lightFlashIntensity ?? 7.5} min={0} step={0.5} onChange={(lightFlashIntensity) => patchAbility({ chain: { ...ability.chain, lightFlashIntensity } })}/>
              <label><span>Target selection</span><select value={ability.chain?.selectionMode ?? 'nearest'} onChange={() => patchAbility({ chain: { ...ability.chain, selectionMode: 'nearest' } })}><option value="nearest">Nearest unused target</option></select></label>
              <label><span>Repeat targets</span><select value={ability.chain?.allowRepeatTargets ? 'yes' : 'no'} onChange={(event) => patchAbility({ chain: { ...ability.chain, allowRepeatTargets: event.target.value === 'yes' } })}><option value="no">No · each target once</option><option value="yes">Yes</option></select></label>
            </div>
          </section>}

          <section className="skill-forge-section">
            <header><Sparkles size={16}/><div><strong>Presentation</strong><small>Link the authored assets that make this skill feel complete.</small></div></header>
            <div className="skill-asset-grid">
              <AssetSelect icon={<WandSparkles size={15}/>} label="Animation" value={ability.animationAssetId} assets={animationAssets} onChange={(animationAssetId) => patchAbility({ animationAssetId: animationAssetId || undefined })}/>
              <AssetSelect icon={<Sparkles size={15}/>} label="VFX" value={ability.vfxAssetId} assets={vfxAssets} onChange={(vfxAssetId) => patchAbility({ vfxAssetId: vfxAssetId || undefined })}/>
              <AssetSelect icon={<Volume2 size={15}/>} label="SFX" value={ability.sfxAssetId} assets={audioAssets} onChange={(sfxAssetId) => patchAbility({ sfxAssetId: sfxAssetId || undefined })}/>
              <AssetSelect icon={<Library size={15}/>} label="Hotbar icon" value={ability.iconAssetId} assets={iconAssets} onChange={(iconAssetId) => patchAbility({ iconAssetId: iconAssetId || undefined })}/>
            </div>
          </section>
        </>}
      </main>

      <aside className="skill-forge-runtime">
        <section>
          <span className="property-label">REAL MANA</span>
          <div className="mana-preview"><i/><div><strong>{Math.round(player.maxMana ?? 100)}</strong><small>MAX MANA</small></div></div>
          <NumberField label="Max mana" value={player.maxMana ?? 100} min={1} step={5} onChange={(maxMana) => patchPlayer({ maxMana }, 'Maximum mana updated.')}/>
          <NumberField label="Regen / sec" value={player.manaRegen ?? 14} min={0} step={0.5} onChange={(manaRegen) => patchPlayer({ manaRegen }, 'Mana regeneration updated.')}/>
        </section>

        <section>
          <span className="property-label">LIVE HOTBAR · 1–5</span>
          <p>Number keys use these exact authored skills in both the overworld and dungeons. Q remains an alias for slot 1.</p>
          <div className="skill-hotbar-authoring">
            {hotbar.map((id, index) => <label key={index}><b>{index + 1}</b><select value={id} onChange={(event) => setHotbarSlot(index, event.target.value)}><option value={EMPTY_SLOT}>Empty</option>{workspace.gameplay.abilities.filter((entry) => entry.id !== player.basicAbility).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>)}
          </div>
        </section>

        <section className="skill-runtime-summary">
          <span className="property-label">RUNTIME CONTRACT</span>
          <div><Zap size={14}/><span>Mana spends on successful casts and regenerates continuously.</span></div>
          <div><WandSparkles size={14}/><span>Standard skills use linked VFX; chain skills add deterministic endpoint-aware arcs and can layer linked VFX on impacts.</span></div>
          <div><Volume2 size={14}/><span>SFX plays from the selected Library audio asset.</span></div>
        </section>
      </aside>
    </div>
    <footer className="skill-forge-status">{status}</footer>
  </div>
}

function normalizeHotbar(player?: SkillPlayer) {
  const source = player?.hotbar?.length ? player.hotbar : player?.activeAbilities ?? []
  const result = source.slice(0, 5)
  while (result.length < 5) result.push(EMPTY_SLOT)
  return result
}

function manaCost(ability: SkillAbility, basicId: string) {
  return Number.isFinite(Number(ability.manaCost)) ? Math.max(0, Number(ability.manaCost)) : ability.id === basicId ? 0 : 12
}

function NumberField({ label, value, min, step, suffix, onChange }: { label: string; value: number; min: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="skill-number-field"><span>{label}</span><div><input type="number" value={Number(value.toFixed(2))} min={min} step={step} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}/>{suffix && <em>{suffix}</em>}</div></label>
}

function AssetSelect({ icon, label, value, assets, onChange }: { icon: React.ReactNode; label: string; value?: string; assets: LibraryAsset[]; onChange: (id: string) => void }) {
  return <label className="skill-asset-select"><span>{icon}<b>{label}</b></span><select value={value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">None / runtime fallback</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
}
