import { useEffect, useMemo, useState } from 'react'
import { Copy, Plus, Save, Trash2, Upload, Swords, Link2, RefreshCw } from 'lucide-react'
import { createEncounterProfile, validateEncounterProfile, type ForgeEncounterProfile } from '../engine/encounterForge'
import { duplicateName, uniqueContentId } from '../engine/contentManagement'
import {
  loadSkillboundWorkspace,
  patchEncounterProfiles,
  saveSkillboundWorkspace,
  type ForgeProjectWorkspace,
} from '../engine/forgeProject'
import {
  getSkillboundProjectConnection,
  saveSkillboundWorkspaceToProjectFolder,
  type ForgeProjectConnectionInfo,
} from '../engine/projectPersistence'

export default function EncounterForge() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [selectedId, setSelectedId] = useState('')
  const [connection, setConnection] = useState<ForgeProjectConnectionInfo>()
  const [status, setStatus] = useState('Loading Skillbound encounter content…')

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadSkillboundWorkspace(), getSkillboundProjectConnection().catch(() => undefined)])
      .then(([loaded, connected]) => {
        if (cancelled) return
        setWorkspace(loaded)
        setSelectedId(loaded.encounterProfiles[0]?.id ?? '')
        setConnection(connected)
        setStatus(`${loaded.encounterProfiles.length} reusable encounter profile${loaded.encounterProfiles.length === 1 ? '' : 's'} loaded.`)
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load Encounter Forge.'))
    return () => { cancelled = true }
  }, [])

  const profile = workspace?.encounterProfiles.find((entry) => entry.id === selectedId)
  const references = useMemo(() => {
    if (!workspace || !selectedId) return []
    return workspace.dungeons.flatMap((dungeon) => (dungeon.logic?.encounters ?? [])
      .filter((entry) => !entry.boss && (entry as typeof entry & { encounterProfileId?: string }).encounterProfileId === selectedId)
      .map((entry) => `${dungeon.name} · ${entry.name}`))
  }, [workspace, selectedId])

  const commit = (next: ForgeProjectWorkspace, message = 'Encounter Forge saved to Skillbound workspace.') => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
    return saved
  }

  const updateProfile = (patch: Partial<ForgeEncounterProfile>) => {
    if (!workspace || !profile) return
    const profiles = workspace.encounterProfiles.map((entry) => entry.id === profile.id ? { ...entry, ...patch } : entry)
    commit(patchEncounterProfiles(workspace, profiles), `${profile.name} updated.`)
  }

  const addProfile = () => {
    if (!workspace) return
    const id = uniqueId('encounter', workspace.encounterProfiles.map((entry) => entry.id))
    const nextProfile = { ...createEncounterProfile(id), name: 'New Encounter Profile' }
    const manifest = {
      ...workspace.manifest,
      content: {
        ...workspace.manifest.content,
        encounters: [...(workspace.manifest.content.encounters ?? []), `encounters/${id}.encounter.json`],
      },
    }
    const next = commit({ ...workspace, manifest, encounterProfiles: [...workspace.encounterProfiles, nextProfile] }, 'New encounter profile created.')
    setSelectedId(nextProfile.id)
    setWorkspace(next)
  }

  const duplicateProfile = () => {
    if (!workspace || !profile) return
    const id = uniqueContentId(`${profile.id}-copy`, workspace.encounterProfiles.map((entry) => entry.id))
    const copy: ForgeEncounterProfile = { ...profile, id, name: duplicateName(profile.name) }
    const manifest = {
      ...workspace.manifest,
      content: {
        ...workspace.manifest.content,
        encounters: [...(workspace.manifest.content.encounters ?? []), `encounters/${id}.encounter.json`],
      },
    }
    const next = commit({ ...workspace, manifest, encounterProfiles: [...workspace.encounterProfiles, copy] }, `${copy.name} duplicated from ${profile.name}.`)
    setWorkspace(next)
    setSelectedId(id)
  }

  const removeProfile = () => {
    if (!workspace || !profile) return
    if (!window.confirm(`Delete ${profile.name}? Dungeon bindings using it will fall back to their inline Map Studio values.`)) return
    const encounterProfiles = workspace.encounterProfiles.filter((entry) => entry.id !== profile.id)
    const dungeons = workspace.dungeons.map((dungeon) => ({
      ...dungeon,
      logic: dungeon.logic ? {
        ...dungeon.logic,
        encounters: dungeon.logic.encounters.map((entry) => {
          const enriched = entry as typeof entry & { encounterProfileId?: string }
          if (enriched.encounterProfileId !== profile.id) return entry
          const { encounterProfileId: _removed, ...rest } = enriched
          return rest
        }),
      } : dungeon.logic,
    }))
    const manifest = {
      ...workspace.manifest,
      content: {
        ...workspace.manifest.content,
        encounters: (workspace.manifest.content.encounters ?? []).filter((path) => !path.endsWith(`/${profile.id}.encounter.json`)),
      },
    }
    commit({ ...workspace, manifest, encounterProfiles, dungeons }, `${profile.name} removed.`)
    setSelectedId(encounterProfiles[0]?.id ?? '')
  }

  const bindDungeonEncounter = (dungeonId: string, encounterId: string, profileId: string) => {
    if (!workspace) return
    const dungeons = workspace.dungeons.map((dungeon) => dungeon.id !== dungeonId ? dungeon : ({
      ...dungeon,
      logic: dungeon.logic ? {
        ...dungeon.logic,
        encounters: dungeon.logic.encounters.map((entry) => entry.id !== encounterId ? entry : ({
          ...entry,
          encounterProfileId: profileId || undefined,
        })),
      } : dungeon.logic,
    }))
    commit({ ...workspace, dungeons }, 'Dungeon encounter binding updated.')
  }

  const writeSource = async () => {
    if (!workspace) return
    try {
      setStatus('Writing Encounter Forge content to connected source…')
      const saved = await saveSkillboundWorkspaceToProjectFolder(workspace)
      const cached = saveSkillboundWorkspace(saved)
      setWorkspace(cached)
      setStatus(`Source written · revision ${saved.manifest.contentRevision ?? 1}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not write connected source.')
    }
  }

  if (!workspace) return <div className="forge-authoring-loading">{status}</div>

  const warnings = profile ? validateEncounterProfile(profile) : []
  const nonBossEncounters = workspace.dungeons.flatMap((dungeon) => (dungeon.logic?.encounters ?? [])
    .filter((entry) => !entry.boss)
    .map((entry) => ({ dungeon, encounter: entry, profileId: (entry as typeof entry & { encounterProfileId?: string }).encounterProfileId ?? '' })))

  return <div className="forge-authoring-shell">
    <header className="forge-authoring-header">
      <div><span className="eyebrow">FORGE GAMEPLAY SYSTEM</span><h1>Encounter Forge</h1><p>Author reusable enemy-pack behavior once, then bind it to Map Studio encounters.</p></div>
      <div className="forge-authoring-actions">
        <button onClick={() => setWorkspace(saveSkillboundWorkspace(workspace))}><Save size={15}/> Save Workspace</button>
        <button className="primary" disabled={!connection || connection.permission === 'denied'} onClick={writeSource}><Upload size={15}/> Write Source</button>
      </div>
    </header>

    <div className="forge-authoring-status"><RefreshCw size={13}/><span>{status}</span><em>{connection ? `source: ${connection.permission}` : 'browser workspace'}</em></div>

    <div className="forge-authoring-grid">
      <aside className="forge-definition-list">
        <div className="forge-list-title"><span>Profiles</span><button title="New encounter profile" onClick={addProfile}><Plus size={14}/></button></div>
        {workspace.encounterProfiles.map((entry) => <button key={entry.id} className={entry.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(entry.id)}>
          <Swords size={15}/><span><strong>{entry.name}</strong><small>{entry.count} × {workspace.gameplay.enemies.find((enemy) => enemy.id === entry.enemyId)?.name ?? entry.enemyId ?? 'unbound enemy'}</small></span>
        </button>)}
        {!workspace.encounterProfiles.length && <p className="forge-list-empty">No encounter profiles yet.</p>}
      </aside>

      <main className="forge-definition-editor">
        {!profile ? <div className="forge-empty-editor"><Swords size={28}/><strong>Create an encounter profile</strong><span>Profiles keep enemy composition separate from dungeon geometry.</span><button onClick={addProfile}><Plus size={14}/> New Encounter</button></div> : <>
          <section className="forge-editor-card hero-card">
            <div className="forge-card-heading"><div><span>ENCOUNTER PROFILE</span><h2>{profile.name}</h2></div><div className="forge-heading-actions"><button onClick={duplicateProfile}><Copy size={14}/> Duplicate</button><button className="danger" onClick={removeProfile}><Trash2 size={14}/> Delete</button></div></div>
            <div className="forge-form-grid two">
              <label><span>Name</span><input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })}/></label>
              <label><span>ID</span><input value={profile.id} disabled/></label>
              <label><span>Enemy definition</span><select value={profile.enemyId} onChange={(e) => {
                const enemy = workspace.gameplay.enemies.find((entry) => entry.id === e.target.value)
                updateProfile({ enemyId: e.target.value, family: enemy?.id ?? profile.family })
              }}><option value="">Select enemy…</option>{workspace.gameplay.enemies.map((enemy) => <option key={enemy.id} value={enemy.id}>{enemy.name}</option>)}</select></label>
              <label><span>Family / tag</span><input value={profile.family} onChange={(e) => updateProfile({ family: e.target.value })}/></label>
              <NumberField label="Enemy count" value={profile.count} min={1} max={30} step={1} onChange={(count) => updateProfile({ count: Math.round(count) })}/>
              <NumberField label="Difficulty" value={profile.difficulty} min={0.25} max={10} step={0.25} onChange={(difficulty) => updateProfile({ difficulty })}/>
              <NumberField label="Elite chance" value={profile.eliteChance * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => updateProfile({ eliteChance: value / 100 })}/>
              <label><span>Reward loot table</span><select value={profile.rewardLootTableId ?? ''} onChange={(e) => updateProfile({ rewardLootTableId: e.target.value || undefined })}><option value="">Enemy/default loot</option>{workspace.gameplay.lootTables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
              <label className="wide"><span>Intro message</span><input value={profile.introMessage ?? ''} onChange={(e) => updateProfile({ introMessage: e.target.value || undefined })}/></label>
            </div>
            <div className={`forge-validation-strip ${warnings.length ? 'warning' : 'ready'}`}><strong>{warnings.length ? `${warnings.length} issue${warnings.length === 1 ? '' : 's'}` : 'Runtime ready'}</strong><span>{warnings[0] ?? `${references.length} dungeon binding${references.length === 1 ? '' : 's'} currently use this profile.`}</span></div>
          </section>
        </>}

        <section className="forge-editor-card">
          <div className="forge-card-heading"><div><span>DUNGEON BINDINGS</span><h2>Map Studio encounters</h2></div><Link2 size={17}/></div>
          <p className="forge-card-copy">Rooms, triggers and gates stay authored in Map Studio. Encounter Forge supplies reusable composition and difficulty.</p>
          <div className="forge-binding-table">
            {nonBossEncounters.map(({ dungeon, encounter, profileId }) => <div key={`${dungeon.id}:${encounter.id}`}>
              <span><strong>{encounter.name}</strong><small>{dungeon.name} · {encounter.roomId}</small></span>
              <select value={profileId} onChange={(e) => bindDungeonEncounter(dungeon.id, encounter.id, e.target.value)}>
                <option value="">Use inline Map Studio values</option>
                {workspace.encounterProfiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </div>)}
          </div>
        </section>
      </main>
    </div>
  </div>
}

function NumberField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label><span>{label}</span><div className="number-with-suffix"><input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}/>{suffix && <i>{suffix}</i>}</div></label>
}

function uniqueId(prefix: string, ids: string[]) {
  let index = ids.length + 1
  let value = `${prefix}-${index}`
  while (ids.includes(value)) value = `${prefix}-${++index}`
  return value
}
