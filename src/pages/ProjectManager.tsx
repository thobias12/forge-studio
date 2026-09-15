import { useEffect, useState } from 'react'
import { Boxes, Braces, CheckCircle2, FolderKanban, Gamepad2, Globe2, Layers3, MapPinned, Play, RefreshCcw } from 'lucide-react'
import { clearSkillboundWorkspace, loadSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'

export default function ProjectManager({ onOpenWorld }: { onOpenWorld: () => void }) {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [status, setStatus] = useState('Loading Skillbound project…')

  const load = async (forceBundled = false) => {
    try {
      if (forceBundled) clearSkillboundWorkspace()
      const project = await loadSkillboundWorkspace(forceBundled)
      setWorkspace(project)
      setStatus(forceBundled ? 'Bundled Skillbound project restored.' : 'Skillbound project ready.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load Skillbound project.')
    }
  }

  useEffect(() => { void load() }, [])

  if (!workspace) return <div className="forge-project-loading"><FolderKanban size={28}/><strong>Opening Forge project</strong><span>{status}</span></div>

  const world = workspace.worlds.find((item) => item.id === workspace.editor.selectedWorldId) ?? workspace.worlds[0]
  const regionCount = workspace.regions.length
  const gameplayCount = 1 + workspace.gameplay.abilities.length + workspace.gameplay.enemies.length + workspace.gameplay.items.length + workspace.gameplay.lootTables.length

  return <div className="forge-project-page">
    <header className="forge-project-hero">
      <div><span className="eyebrow">ACTIVE FORGE PROJECT</span><h1>{workspace.manifest.name}</h1><p>Skillbound is project data consumed by Forge Runtime. The first complete ARPG loop now lives behind this project contract rather than inside editor pages.</p></div>
      <div className="forge-project-hero-actions"><button onClick={() => void load(true)}><RefreshCcw size={14}/> Restore project defaults</button><button className="primary" onClick={onOpenWorld}><Play size={14}/> Open World Forge</button></div>
    </header>

    <section className="forge-project-summary">
      <ProjectStat icon={Gamepad2} label="Runtime" value="Forge Runtime" sub="Combat · loot · HUD · save"/>
      <ProjectStat icon={Globe2} label="Entry world" value={world?.name ?? workspace.manifest.runtime.entryWorld} sub={`Generation v${workspace.manifest.generationVersion}`}/>
      <ProjectStat icon={MapPinned} label="Regions" value={`${regionCount} authored grammar`} sub="Seeded at runtime"/>
      <ProjectStat icon={CheckCircle2} label="Project state" value="Vertical slice playable" sub={`${gameplayCount} gameplay definitions`}/>
    </section>

    <section className="forge-project-grid">
      <div className="forge-project-panel project-tree-panel">
        <div className="forge-project-panel-title"><FolderKanban size={16}/><span>PROJECT TREE</span></div>
        <ProjectTree workspace={workspace}/>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Braces size={16}/><span>ENGINE BOUNDARY</span></div>
        <div className="forge-boundary">
          <BoundaryRow name="Forge Runtime" detail="rendering · input · collision · combat · inventory · persistence" active/>
          <BoundaryRow name="Skillbound project" detail="worlds · regions · player · enemies · abilities · items · loot" active/>
          <BoundaryRow name="Presentation integration" detail="characters · animation · VFX · audio · final item visuals"/>
        </div>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Layers3 size={16}/><span>PROJECT PIPELINE</span></div>
        <div className="forge-pipeline"><span>Project data</span><i>→</i><span>World Forge</span><i>→</i><span>Runtime</span><i>→</i><span>Combat</span><i>→</i><span>Loot + Save</span></div>
        <p className="forge-project-note">Phase 2 proves the full data-driven loop. The next passes should connect authored Forge characters, animation, VFX and audio to these same definitions rather than creating parallel systems.</p>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Boxes size={16}/><span>AUTHORING TOOLS</span></div>
        <div className="forge-tool-tags"><span>Map Studio</span><span>UI Forge</span><span>Character Forge</span><span>Animations</span><span>VFX Studio</span><span>Asset Library</span></div>
        <p className="forge-project-note">The Control Center and Content Registry now provide the overview across these tools. Each authoring tool should eventually write directly to the same Forge project contracts.</p>
      </div>
    </section>

    <footer className="forge-project-status">{status} · Last editor save {new Date(workspace.updatedAt).toLocaleString()}</footer>
  </div>
}

function ProjectTree({ workspace }: { workspace: ForgeProjectWorkspace }) {
  return <div className="forge-project-tree">
    <strong>projects/skillbound</strong>
    <div><span>project.forge.json</span></div>
    <div><strong>worlds/</strong>{workspace.worlds.map((world) => <span key={world.id}>↳ {world.id}.world.json</span>)}</div>
    <div><strong>regions/</strong>{workspace.regions.map((region) => <span key={region.id}>↳ {region.id}.region.json</span>)}</div>
    <div><strong>gameplay/</strong>
      <span>↳ player · {workspace.gameplay.player.id}</span>
      <span>↳ abilities · {workspace.gameplay.abilities.map((item) => item.id).join(', ')}</span>
      <span>↳ enemies · {workspace.gameplay.enemies.map((item) => item.id).join(', ')}</span>
      <span>↳ items · {workspace.gameplay.items.map((item) => item.id).join(', ')}</span>
      <span>↳ loot · {workspace.gameplay.lootTables.map((item) => item.id).join(', ')}</span>
    </div>
    <div><strong>next content/</strong><span>scenes · dungeons · characters · ui · vfx · audio</span></div>
  </div>
}

function ProjectStat({ icon: Icon, label, value, sub }: { icon: typeof Globe2; label: string; value: string; sub: string }) {
  return <div className="forge-project-stat"><Icon size={18}/><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>
}

function BoundaryRow({ name, detail, active = false }: { name: string; detail: string; active?: boolean }) {
  return <div className={active ? 'active' : ''}><i/><span><strong>{name}</strong><small>{detail}</small></span></div>
}
