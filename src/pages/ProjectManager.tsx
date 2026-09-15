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

  return <div className="forge-project-page">
    <header className="forge-project-hero">
      <div><span className="eyebrow">ACTIVE FORGE PROJECT</span><h1>{workspace.manifest.name}</h1><p>Skillbound 2 is now represented as project data consumed by Forge Runtime, not as a separate hardcoded prototype.</p></div>
      <div className="forge-project-hero-actions"><button onClick={() => void load(true)}><RefreshCcw size={14}/> Restore project defaults</button><button className="primary" onClick={onOpenWorld}><Play size={14}/> Open World Forge</button></div>
    </header>

    <section className="forge-project-summary">
      <ProjectStat icon={Gamepad2} label="Runtime" value="Forge Runtime" sub="Single-player · Three.js"/>
      <ProjectStat icon={Globe2} label="Entry world" value={world?.name ?? workspace.manifest.runtime.entryWorld} sub={`Generation v${workspace.manifest.generationVersion}`}/>
      <ProjectStat icon={MapPinned} label="Regions" value={`${regionCount} authored grammar`} sub="Seeded at runtime"/>
      <ProjectStat icon={CheckCircle2} label="Project state" value="Runtime connected" sub="Editor save → play mode"/>
    </section>

    <section className="forge-project-grid">
      <div className="forge-project-panel project-tree-panel">
        <div className="forge-project-panel-title"><FolderKanban size={16}/><span>PROJECT TREE</span></div>
        <ProjectTree workspace={workspace}/>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Braces size={16}/><span>ENGINE BOUNDARY</span></div>
        <div className="forge-boundary">
          <BoundaryRow name="Forge Runtime" detail="rendering · input · world generation · persistence contracts" active/>
          <BoundaryRow name="Skillbound project" detail="campaign graph · region grammar · UI · items · enemies · abilities" active/>
          <BoundaryRow name="Legacy prototypes" detail="kept outside the new runtime architecture"/>
        </div>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Layers3 size={16}/><span>PHASE 1 PIPELINE</span></div>
        <div className="forge-pipeline"><span>Project data</span><i>→</i><span>World Forge</span><i>→</i><span>Generate</span><i>→</i><span>Save</span><i>→</i><span>Play mode</span></div>
        <p className="forge-project-note">The editor and play mode operate on the same project workspace. Export/download is no longer the core integration path for Skillbound.</p>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Boxes size={16}/><span>EXISTING FORGE TOOLS</span></div>
        <div className="forge-tool-tags"><span>Map Studio</span><span>UI Forge</span><span>Character Forge</span><span>Animations</span><span>VFX Studio</span><span>Asset Library</span></div>
        <p className="forge-project-note">These remain valuable authoring tools. Later phases move their output behind the same project data/runtime contracts instead of rewriting them.</p>
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
    <div><strong>future content/</strong><span>scenes · dungeons · characters · enemies · abilities · items · loot · ui · vfx · audio</span></div>
  </div>
}

function ProjectStat({ icon: Icon, label, value, sub }: { icon: typeof Globe2; label: string; value: string; sub: string }) {
  return <div className="forge-project-stat"><Icon size={18}/><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>
}

function BoundaryRow({ name, detail, active = false }: { name: string; detail: string; active?: boolean }) {
  return <div className={active ? 'active' : ''}><i/><span><strong>{name}</strong><small>{detail}</small></span></div>
}
