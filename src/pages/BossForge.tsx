import { useEffect, useMemo, useState } from 'react'
import { Copy, Crown, Link2, Plus, Save, Sparkles, Trash2, Upload } from 'lucide-react'
import {
  createBossDefinition,
  createBossPhase,
  normalizeBossPhases,
  validateBossDefinition,
  type ForgeBossDefinition,
  type ForgeBossPhaseDefinition,
} from '../engine/encounterForge'
import { duplicateName, uniqueContentId } from '../engine/contentManagement'
import {
  loadSkillboundWorkspace,
  patchBossProfiles,
  saveSkillboundWorkspace,
  type ForgeProjectWorkspace,
} from '../engine/forgeProject'
import {
  getSkillboundProjectConnection,
  saveSkillboundWorkspaceToProjectFolder,
  type ForgeProjectConnectionInfo,
} from '../engine/projectPersistence'
import { listAssets, type LibraryAsset } from '../lib/library'

export default function BossForge() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [selectedId, setSelectedId] = useState('')
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [connection, setConnection] = useState<ForgeProjectConnectionInfo>()
  const [status, setStatus] = useState('Loading Boss Forge…')

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      loadSkillboundWorkspace(),
      listAssets().catch(() => []),
      getSkillboundProjectConnection().catch(() => undefined),
    ]).then(([loaded, library, connected]) => {
      if (cancelled) return
      setWorkspace(loaded)
      setAssets(library)
      setConnection(connected)
      setSelectedId(loaded.bossProfiles[0]?.id ?? '')
      setStatus(`${loaded.bossProfiles.length} reusable boss profile${loaded.bossProfiles.length === 1 ? '' : 's'} loaded.`)
    }).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load Boss Forge.'))
    return () => { cancelled = true }
  }, [])

  const boss = workspace?.bossProfiles.find((entry) => entry.id === selectedId)
  const vfxAssets = useMemo(() => assets.filter((asset) => asset.category === 'vfx' || /vfx/i.test(asset.mime ?? '')), [assets])
  const references = useMemo(() => {
    if (!workspace || !selectedId) return []
    return workspace.dungeons.flatMap((dungeon) => (dungeon.logic?.encounters ?? [])
      .filter((entry) => entry.boss && (entry as typeof entry & { bossProfileId?: string }).bossProfileId === selectedId)
      .map((entry) => `${dungeon.name} · ${entry.name}`))
  }, [workspace, selectedId])

  const commit = (next: ForgeProjectWorkspace, message: string) => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
    return saved
  }

  const updateBoss = (patch: Partial<ForgeBossDefinition>) => {
    if (!workspace || !boss) return
    const bosses = workspace.bossProfiles.map((entry) => entry.id === boss.id ? { ...entry, ...patch } : entry)
    commit(patchBossProfiles(workspace, bosses), `${boss.name} updated.`)
  }

  const addBoss = () => {
    if (!workspace) return
    const id = uniqueId('boss', workspace.bossProfiles.map((entry) => entry.id))
    const nextBoss = { ...createBossDefinition(id), name: 'New Boss Profile' }
    const manifest = {
      ...workspace.manifest,
      content: {
        ...workspace.manifest.content,
        bosses: [...(workspace.manifest.content.bosses ?? []), `bosses/${id}.boss.json`],
      },
    }
    const next = commit({ ...workspace, manifest, bossProfiles: [...workspace.bossProfiles, nextBoss] }, 'New boss profile created.')
    setWorkspace(next)
    setSelectedId(id)
  }

  const duplicateBoss = () => {
    if (!workspace || !boss) return
    const id = uniqueContentId(`${boss.id}-copy`, workspace.bossProfiles.map((entry) => entry.id))
    const copy = { ...JSON.parse(JSON.stringify(boss)) as ForgeBossDefinition, id, name: duplicateName(boss.name) }
    const manifest = {
      ...workspace.manifest,
      content: {
        ...workspace.manifest.content,
        bosses: [...(workspace.manifest.content.bosses ?? []), `bosses/${id}.boss.json`],
      },
    }
    const next = commit({ ...workspace, manifest, bossProfiles: [...workspace.bossProfiles, copy] }, `${copy.name} duplicated from ${boss.name}.`)
    setWorkspace(next)
    setSelectedId(id)
  }

  const removeBoss = () => {
    if (!workspace || !boss) return
    if (!window.confirm(`Delete ${boss.name}? Dungeon bindings using it will fall back to their inline Map Studio boss settings.`)) return
    const bossProfiles = workspace.bossProfiles.filter((entry) => entry.id !== boss.id)
    const dungeons = workspace.dungeons.map((dungeon) => ({
      ...dungeon,
      logic: dungeon.logic ? {
        ...dungeon.logic,
        encounters: dungeon.logic.encounters.map((entry) => {
          const enriched = entry as typeof entry & { bossProfileId?: string }
          if (enriched.bossProfileId !== boss.id) return entry
          const { bossProfileId: _removed, ...rest } = enriched
          return rest
        }),
      } : dungeon.logic,
    }))
    const manifest = {
      ...workspace.manifest,
      content: {
        ...workspace.manifest.content,
        bosses: (workspace.manifest.content.bosses ?? []).filter((path) => !path.endsWith(`/${boss.id}.boss.json`)),
      },
    }
    commit({ ...workspace, manifest, bossProfiles, dungeons }, `${boss.name} removed.`)
    setSelectedId(bossProfiles[0]?.id ?? '')
  }

  const updatePhase = (phaseId: string, patch: Partial<ForgeBossPhaseDefinition>) => {
    if (!boss) return
    updateBoss({ phases: normalizeBossPhases(boss.phases.map((phase) => phase.id === phaseId ? { ...phase, ...patch } : phase)) })
  }

  const addPhase = () => {
    if (!boss) return
    const nextIndex = boss.phases.length + 1
    const threshold = Math.max(0.1, 1 - boss.phases.length * 0.25)
    updateBoss({ phases: normalizeBossPhases([...boss.phases, createBossPhase(`phase-${nextIndex}`, `Phase ${nextIndex}`, threshold)]) })
  }

  const removePhase = (phaseId: string) => {
    if (!boss || boss.phases.length <= 1) return
    updateBoss({ phases: boss.phases.filter((phase) => phase.id !== phaseId) })
  }

  const bindDungeonBoss = (dungeonId: string, encounterId: string, bossProfileId: string) => {
    if (!workspace) return
    const dungeons = workspace.dungeons.map((dungeon) => dungeon.id !== dungeonId ? dungeon : ({
      ...dungeon,
      logic: dungeon.logic ? {
        ...dungeon.logic,
        encounters: dungeon.logic.encounters.map((entry) => entry.id !== encounterId ? entry : ({
          ...entry,
          bossProfileId: bossProfileId || undefined,
        })),
      } : dungeon.logic,
    }))
    commit({ ...workspace, dungeons }, 'Dungeon boss binding updated.')
  }

  const writeSource = async () => {
    if (!workspace) return
    try {
      setStatus('Writing Boss Forge content to connected source…')
      const saved = await saveSkillboundWorkspaceToProjectFolder(workspace)
      const cached = saveSkillboundWorkspace(saved)
      setWorkspace(cached)
      setStatus(`Source written · revision ${saved.manifest.contentRevision ?? 1}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not write connected source.')
    }
  }

  if (!workspace) return <div className="forge-authoring-loading">{status}</div>

  const warnings = boss ? validateBossDefinition(boss) : []
  const bossEncounters = workspace.dungeons.flatMap((dungeon) => (dungeon.logic?.encounters ?? [])
    .filter((entry) => entry.boss)
    .map((entry) => ({ dungeon, encounter: entry, profileId: (entry as typeof entry & { bossProfileId?: string }).bossProfileId ?? '' })))

  return <div className="forge-authoring-shell">
    <header className="forge-authoring-header">
      <div><span className="eyebrow">FORGE GAMEPLAY SYSTEM</span><h1>Boss Forge</h1><p>Build reusable boss stat profiles, health phases, summons, VFX transitions and rewards.</p></div>
      <div className="forge-authoring-actions">
        <button onClick={() => setWorkspace(saveSkillboundWorkspace(workspace))}><Save size={15}/> Save Workspace</button>
        <button className="primary" disabled={!connection || connection.permission === 'denied'} onClick={writeSource}><Upload size={15}/> Write Source</button>
      </div>
    </header>

    <div className="forge-authoring-status"><Crown size={13}/><span>{status}</span><em>{connection ? `source: ${connection.permission}` : 'browser workspace'}</em></div>

    <div className="forge-authoring-grid">
      <aside className="forge-definition-list boss-list">
        <div className="forge-list-title"><span>Boss Profiles</span><button title="New boss profile" onClick={addBoss}><Plus size={14}/></button></div>
        {workspace.bossProfiles.map((entry) => <button key={entry.id} className={entry.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(entry.id)}>
          <Crown size={15}/><span><strong>{entry.name}</strong><small>{entry.phases.length} phase{entry.phases.length === 1 ? '' : 's'} · ×{entry.healthMultiplier.toFixed(1)} HP</small></span>
        </button>)}
        {!workspace.bossProfiles.length && <p className="forge-list-empty">No boss profiles yet.</p>}
      </aside>

      <main className="forge-definition-editor">
        {!boss ? <div className="forge-empty-editor"><Crown size={28}/><strong>Create a boss profile</strong><span>Boss Forge definitions are reusable across any dungeon or arena.</span><button onClick={addBoss}><Plus size={14}/> New Boss</button></div> : <>
          <section className="forge-editor-card hero-card boss-hero">
            <div className="forge-card-heading"><div><span>BOSS PROFILE</span><h2>{boss.name}</h2></div><div className="forge-heading-actions"><button onClick={duplicateBoss}><Copy size={14}/> Duplicate</button><button className="danger" onClick={removeBoss}><Trash2 size={14}/> Delete</button></div></div>
            <div className="forge-form-grid two">
              <label><span>Name</span><input value={boss.name} onChange={(e) => updateBoss({ name: e.target.value })}/></label>
              <label><span>ID</span><input value={boss.id} disabled/></label>
              <label><span>Base enemy</span><select value={boss.enemyId} onChange={(e) => updateBoss({ enemyId: e.target.value })}><option value="">Select enemy…</option>{workspace.gameplay.enemies.map((enemy) => <option key={enemy.id} value={enemy.id}>{enemy.name}</option>)}</select></label>
              <label><span>Guaranteed item</span><select value={boss.guaranteedItemId ?? ''} onChange={(e) => updateBoss({ guaranteedItemId: e.target.value || undefined })}><option value="">None</option>{workspace.gameplay.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <Metric label="Health multiplier" value={boss.healthMultiplier} min={0.25} max={20} step={0.1} onChange={(healthMultiplier) => updateBoss({ healthMultiplier })}/>
              <Metric label="Damage multiplier" value={boss.damageMultiplier} min={0.1} max={10} step={0.05} onChange={(damageMultiplier) => updateBoss({ damageMultiplier })}/>
              <Metric label="Move multiplier" value={boss.moveSpeedMultiplier} min={0.1} max={3} step={0.05} onChange={(moveSpeedMultiplier) => updateBoss({ moveSpeedMultiplier })}/>
              <Metric label="Attack cooldown multiplier" value={boss.attackCooldownMultiplier} min={0.2} max={3} step={0.05} onChange={(attackCooldownMultiplier) => updateBoss({ attackCooldownMultiplier })}/>
              <Metric label="Character scale" value={boss.scale} min={0.5} max={3} step={0.05} onChange={(scale) => updateBoss({ scale })}/>
              <label><span>Reward loot table</span><select value={boss.rewardLootTableId ?? ''} onChange={(e) => updateBoss({ rewardLootTableId: e.target.value || undefined })}><option value="">Enemy/default loot</option>{workspace.gameplay.lootTables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
            </div>
            <div className={`forge-validation-strip ${warnings.length ? 'warning' : 'ready'}`}><strong>{warnings.length ? `${warnings.length} issue${warnings.length === 1 ? '' : 's'}` : 'Runtime ready'}</strong><span>{warnings[0] ?? `${references.length} dungeon boss binding${references.length === 1 ? '' : 's'} use this profile.`}</span></div>
          </section>

          <section className="forge-editor-card">
            <div className="forge-card-heading"><div><span>PHASE GRAPH</span><h2>Health-driven phases</h2></div><button onClick={addPhase}><Plus size={14}/> Add phase</button></div>
            <p className="forge-card-copy">A phase activates when boss health falls below its threshold. Stat multipliers are relative to the Boss Forge base values.</p>
            <div className="boss-phase-stack">
              {normalizeBossPhases(boss.phases).map((phase, index) => <div className="boss-phase-card" key={phase.id}>
                <div className="boss-phase-index"><span>{index + 1}</span><i style={{ height: `${Math.max(8, phase.startsAtHealth * 100)}%` }}/></div>
                <div className="boss-phase-body">
                  <div className="boss-phase-heading"><input value={phase.name} onChange={(e) => updatePhase(phase.id, { name: e.target.value })}/><strong>{Math.round(phase.startsAtHealth * 100)}% HP</strong>{boss.phases.length > 1 && <button className="icon danger" onClick={() => removePhase(phase.id)}><Trash2 size={13}/></button>}</div>
                  <div className="forge-form-grid phase-grid">
                    <Metric label="Starts at HP" value={phase.startsAtHealth * 100} min={1} max={100} step={1} suffix="%" onChange={(value) => updatePhase(phase.id, { startsAtHealth: value / 100 })}/>
                    <Metric label="Damage ×" value={phase.damageMultiplier} min={0.1} max={5} step={0.05} onChange={(damageMultiplier) => updatePhase(phase.id, { damageMultiplier })}/>
                    <Metric label="Move ×" value={phase.moveSpeedMultiplier} min={0.1} max={3} step={0.05} onChange={(moveSpeedMultiplier) => updatePhase(phase.id, { moveSpeedMultiplier })}/>
                    <Metric label="Cooldown ×" value={phase.attackCooldownMultiplier} min={0.15} max={3} step={0.05} onChange={(attackCooldownMultiplier) => updatePhase(phase.id, { attackCooldownMultiplier })}/>
                    <Metric label="Wind-up ×" value={phase.windupMultiplier} min={0.15} max={3} step={0.05} onChange={(windupMultiplier) => updatePhase(phase.id, { windupMultiplier })}/>
                    <Metric label="Summon count" value={phase.summonCount ?? 0} min={0} max={12} step={1} onChange={(summonCount) => updatePhase(phase.id, { summonCount: Math.round(summonCount) })}/>
                    <label><span>Summon enemy</span><select value={phase.summonEnemyId ?? ''} onChange={(e) => updatePhase(phase.id, { summonEnemyId: e.target.value || undefined })}><option value="">No summons</option>{workspace.gameplay.enemies.map((enemy) => <option key={enemy.id} value={enemy.id}>{enemy.name}</option>)}</select></label>
                    <label><span>Phase VFX</span><select value={phase.vfxAssetId ?? ''} onChange={(e) => updatePhase(phase.id, { vfxAssetId: e.target.value || undefined })}><option value="">Built-in pulse</option>{vfxAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
                    <label className="wide"><span>Phase message</span><input value={phase.message ?? ''} onChange={(e) => updatePhase(phase.id, { message: e.target.value || undefined })}/></label>
                  </div>
                </div>
              </div>)}
            </div>
          </section>
        </>}

        <section className="forge-editor-card">
          <div className="forge-card-heading"><div><span>DUNGEON BINDINGS</span><h2>Boss encounters</h2></div><Link2 size={17}/></div>
          <p className="forge-card-copy">Map Studio owns room layout, trigger markers and gates. Boss Forge supplies reusable stats, phases, summons and rewards.</p>
          <div className="forge-binding-table">
            {bossEncounters.map(({ dungeon, encounter, profileId }) => <div key={`${dungeon.id}:${encounter.id}`}>
              <span><strong>{encounter.name}</strong><small>{dungeon.name} · {encounter.roomId}</small></span>
              <select value={profileId} onChange={(e) => bindDungeonBoss(dungeon.id, encounter.id, e.target.value)}>
                <option value="">Use inline Map Studio boss</option>
                {workspace.bossProfiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>)}
          </div>
        </section>
      </main>
    </div>
  </div>
}

function Metric({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label><span>{label}</span><div className="number-with-suffix"><input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}/>{suffix && <i>{suffix}</i>}</div></label>
}

function uniqueId(prefix: string, ids: string[]) {
  let index = ids.length + 1
  let value = `${prefix}-${index}`
  while (ids.includes(value)) value = `${prefix}-${++index}`
  return value
}
