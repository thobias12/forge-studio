import { useEffect, useState } from 'react'
import { Boxes, Braces, CheckCircle2, Download, FolderKanban, FolderOpen, Gamepad2, Globe2, Layers3, MapPinned, Play, RefreshCcw, Save, Swords, Unplug, Upload } from 'lucide-react'
import { clearSkillboundWorkspace, loadSkillboundWorkspace, saveSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'
import {
  connectSkillboundProjectFolder,
  disconnectSkillboundProjectFolder,
  getSkillboundProjectConnection,
  loadSkillboundWorkspaceFromProjectFolder,
  saveSkillboundWorkspaceToProjectFolder,
  supportsProjectFolderPersistence,
  type ForgeProjectConnectionInfo,
} from '../engine/projectPersistence'
import '../project-persistence.css'

export default function ProjectManager({ onOpenWorld, onOpenGameplay }: { onOpenWorld: () => void; onOpenGameplay: () => void }) {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [connection, setConnection] = useState<ForgeProjectConnectionInfo>()
  const [status, setStatus] = useState('Loading Skillbound project…')
  const [sourceBusy, setSourceBusy] = useState(false)

  const refreshConnection = async () => setConnection(await getSkillboundProjectConnection())

  const load = async (forceBundled = false) => {
    try {
      if (forceBundled) clearSkillboundWorkspace()
      const project = await loadSkillboundWorkspace(forceBundled)
      setWorkspace(project)
      await refreshConnection()
      setStatus(forceBundled ? 'Bundled Skillbound project restored to the browser workspace. Connected source files were not overwritten.' : 'Skillbound project ready.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load Skillbound project.')
    }
  }

  useEffect(() => { void load() }, [])

  const connectSource = async () => {
    setSourceBusy(true)
    try {
      const next = await connectSkillboundProjectFolder()
      setConnection(next)
      setStatus(`Connected ${next.folderName}. Forge can now load and write the real Skillbound project JSON files.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect the Skillbound project folder.')
    } finally {
      setSourceBusy(false)
    }
  }

  const writeSource = async () => {
    if (!workspace) return
    setSourceBusy(true)
    try {
      const persisted = await saveSkillboundWorkspaceToProjectFolder(workspace)
      const next = saveSkillboundWorkspace(persisted)
      setWorkspace(next)
      await refreshConnection()
      setStatus(`Wrote Skillbound project revision ${next.manifest.contentRevision ?? 1} to the connected source folder.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not write the connected Skillbound project.')
    } finally {
      setSourceBusy(false)
    }
  }

  const readSource = async () => {
    setSourceBusy(true)
    try {
      const loaded = await loadSkillboundWorkspaceFromProjectFolder(workspace?.editor)
      const next = saveSkillboundWorkspace(loaded)
      setWorkspace(next)
      await refreshConnection()
      setStatus(`Loaded project revision ${next.manifest.contentRevision ?? 1} from the connected source folder into the working workspace.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load the connected Skillbound project.')
    } finally {
      setSourceBusy(false)
    }
  }

  const disconnectSource = async () => {
    await disconnectSkillboundProjectFolder()
    setConnection(undefined)
    setStatus('Disconnected the source folder. Browser workspace data is still available.')
  }

  if (!workspace) return <div className="forge-project-loading"><FolderKanban size={28}/><strong>Opening Forge project</strong><span>{status}</span></div>

  const world = workspace.worlds.find((item) => item.id === workspace.editor.selectedWorldId) ?? workspace.worlds[0]
  const regionCount = workspace.regions.length
  const gameplayCount = workspace.gameplay.enemies.length + workspace.gameplay.abilities.length + workspace.gameplay.items.length + workspace.gameplay.lootTables.length
  const folderSupported = supportsProjectFolderPersistence()
  const sourceConnected = Boolean(connection)
  const sourceWritable = connection?.permission === 'granted'

  return <div className="forge-project-page">
    <header className="forge-project-hero">
      <div><span className="eyebrow">ACTIVE FORGE PROJECT</span><h1>{workspace.manifest.name}</h1><p>Skillbound is authored as Forge project data and consumed directly by Forge Runtime. Forge 1.17 adds a real connected source-folder workflow so browser authoring can be written back to source-controlled project JSON.</p></div>
      <div className="forge-project-hero-actions"><button onClick={() => void load(true)}><RefreshCcw size={14}/> Restore browser defaults</button><button onClick={onOpenGameplay}><Swords size={14}/> Gameplay Forge</button><button className="primary" onClick={onOpenWorld}><Play size={14}/> World Forge / Play</button></div>
    </header>

    <section className="forge-project-summary">
      <ProjectStat icon={Gamepad2} label="Runtime" value="Forge Runtime" sub="Single-player · Three.js"/>
      <ProjectStat icon={Globe2} label="Entry world" value={world?.name ?? workspace.manifest.runtime.entryWorld} sub={`Generation v${workspace.manifest.generationVersion}`}/>
      <ProjectStat icon={MapPinned} label="Regions" value={`${regionCount} authored grammar`} sub="Seeded at runtime"/>
      <ProjectStat icon={Swords} label="Gameplay definitions" value={`${gameplayCount} authored`} sub={`Content revision ${workspace.manifest.contentRevision ?? 1}`}/>
    </section>

    <section className="forge-project-grid">
      <div className="forge-project-panel project-tree-panel">
        <div className="forge-project-panel-title"><FolderKanban size={16}/><span>PROJECT TREE</span></div>
        <ProjectTree workspace={workspace}/>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Braces size={16}/><span>ENGINE BOUNDARY</span></div>
        <div className="forge-boundary">
          <BoundaryRow name="Forge Runtime" detail="rendering · input · A* navigation · combat feedback · gameplay save" active/>
          <BoundaryRow name="Skillbound project" detail="world · enemies · abilities · items · loot · source JSON" active/>
          <BoundaryRow name="Shared Asset Library" detail="characters · animations · VFX · item models" active/>
          <BoundaryRow name="Browser workspace" detail="fast working copy between source-file saves" active/>
        </div>
      </div>

      <div className="forge-project-panel forge-source-panel">
        <div className="forge-project-panel-title"><FolderOpen size={16}/><span>SOURCE PROJECT</span></div>
        <div className={`source-connection-state ${sourceConnected ? sourceWritable ? 'ready' : 'warning' : 'offline'}`}>
          <i/>
          <div><strong>{sourceConnected ? 'Connected project folder' : 'Browser workspace only'}</strong><small>{sourceConnected ? `${connection?.folderName} · ${connection?.permission === 'granted' ? 'read/write ready' : 'permission required'}` : folderSupported ? 'Connect the forge-studio repository or public/projects/skillbound folder.' : 'This browser does not support File System Access.'}</small></div>
        </div>
        <div className="source-project-actions">
          <button disabled={!folderSupported || sourceBusy} onClick={() => void connectSource()}><FolderOpen size={13}/>{sourceConnected ? 'Reconnect folder' : 'Connect folder'}</button>
          <button disabled={!sourceConnected || sourceBusy} onClick={() => void readSource()}><Download size={13}/>Load source</button>
          <button className="primary" disabled={!sourceConnected || sourceBusy} onClick={() => void writeSource()}><Upload size={13}/>Write source</button>
          <button disabled={!sourceConnected || sourceBusy} onClick={() => void disconnectSource()}><Unplug size={13}/>Disconnect</button>
        </div>
        <p className="forge-project-note"><Save size={12}/> <strong>Write source</strong> updates the real `project.forge.json`, worlds, regions, player, enemies, abilities, items and loot JSON files. Your Git client can then commit those normal source changes.</p>
      </div>

      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Layers3 size={16}/><span>FORGE 1.17 PIPELINE</span></div>
        <div className="forge-pipeline"><span>Forge tools</span><i>→</i><span>Working data</span><i>→</i><span>Validate refs</span><i>→</i><span>Write source</span><i>→</i><span>Git</span></div>
        <p className="forge-project-note">Runtime save data stays separate from authored project files. The connected source workflow only writes content definitions; player progress still uses the runtime persistence boundary.</p>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Boxes size={16}/><span>CONNECTED AUTHORING</span></div>
        <div className="forge-tool-tags"><span>Gameplay Forge</span><span>Character Forge</span><span>Animations</span><span>VFX Studio</span><span>Asset Library</span><span>Validation</span></div>
        <p className="forge-project-note"><CheckCircle2 size={12}/> Dependency Validation now tracks project-to-project references and Library bindings so dangling IDs are visible before runtime.</p>
      </div>
    </section>

    <footer className="forge-project-status">{sourceBusy ? 'Working with connected project folder…' : status} · Last working save {new Date(workspace.updatedAt).toLocaleString()}</footer>
  </div>
}

function ProjectTree({ workspace }: { workspace: ForgeProjectWorkspace }) {
  return <div className="forge-project-tree">
    <strong>projects/skillbound</strong>
    <div><span>project.forge.json</span></div>
    <div><strong>worlds/</strong>{workspace.worlds.map((world) => <span key={world.id}>↳ {world.id}.world.json</span>)}</div>
    <div><strong>regions/</strong>{workspace.regions.map((region) => <span key={region.id}>↳ {region.id}.region.json</span>)}</div>
    <div><strong>players/</strong><span>↳ {workspace.gameplay.player.id}.player.json</span></div>
    <div><strong>enemies/</strong>{workspace.gameplay.enemies.map((entry) => <span key={entry.id}>↳ {entry.id}.enemy.json</span>)}</div>
    <div><strong>abilities/</strong>{workspace.gameplay.abilities.map((entry) => <span key={entry.id}>↳ {entry.id}.ability.json</span>)}</div>
    <div><strong>items/</strong>{workspace.gameplay.items.map((entry) => <span key={entry.id}>↳ {entry.id}.item.json</span>)}</div>
    <div><strong>loot/</strong>{workspace.gameplay.lootTables.map((entry) => <span key={entry.id}>↳ {entry.id}.loot.json</span>)}</div>
    <div><strong>reserved/</strong><span>scenes · dungeons · ui · audio</span></div>
  </div>
}

function ProjectStat({ icon: Icon, label, value, sub }: { icon: typeof Globe2; label: string; value: string; sub: string }) {
  return <div className="forge-project-stat"><Icon size={18}/><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>
}

function BoundaryRow({ name, detail, active = false }: { name: string; detail: string; active?: boolean }) {
  return <div className={active ? 'active' : ''}><i/><span><strong>{name}</strong><small>{detail}</small></span></div>
}
