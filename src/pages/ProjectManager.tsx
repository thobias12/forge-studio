import { useEffect, useState } from 'react'
import { Boxes, Braces, CheckCircle2, FolderKanban, Gamepad2, Globe2, Layers3, MapPinned, Play, RefreshCcw, Swords } from 'lucide-react'
import { clearSkillboundWorkspace, loadSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'

export default function ProjectManager({ onOpenWorld, onOpenGameplay }: { onOpenWorld: () => void; onOpenGameplay: () => void }) {
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
  const gameplayCount = workspace.gameplay.enemies.length + workspace.gameplay.abilities.length + workspace.gameplay.items.length + workspace.gameplay.lootTables.length

  return <div className="forge-project-page">
    <header className="forge-project-hero">
      <div><span className="eyebrow">ACTIVE FORGE PROJECT</span><h1>{workspace.manifest.name}</h1><p>Skillbound is authored as Forge project data and consumed directly by Forge Runtime. Phase 2.1 adds visual gameplay authoring, shared Library bindings and reusable combat/navigation feedback.</p></div>
      <div className="forge-project-hero-actions"><button onClick={() => void load(true)}><RefreshCcw size={14}/> Restore project defaults</button><button onClick={onOpenGameplay}><Swords size={14}/> Gameplay Forge</button><button className="primary" onClick={onOpenWorld}><Play size={14}/> World Forge / Play</button></div>
    </header>

    <section className="forge-project-summary">
      <ProjectStat icon={Gamepad2} label="Runtime" value="Forge Runtime" sub="Single-player · Three.js"/>
      <ProjectStat icon={Globe2} label="Entry world" value={world?.name ?? workspace.manifest.runtime.entryWorld} sub={`Generation v${workspace.manifest.generationVersion}`}/>
      <ProjectStat icon={MapPinned} label="Regions" value={`${regionCount} authored grammar`} sub="Seeded at runtime"/>
      <ProjectStat icon={Swords} label="Gameplay definitions" value={`${gameplayCount} authored`} sub="Enemies · abilities · items · loot"/>
    </section>

    <section className="forge-project-grid">
      <div className="forge-project-panel project-tree-panel">
        <div className="forge-project-panel-title"><FolderKanban size={16}/><span>PROJECT TREE</span></div>
        <ProjectTree workspace={workspace}/>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Braces size={16}/><span>ENGINE BOUNDARY</span></div>
        <div className="forge-boundary">
          <BoundaryRow name="Forge Runtime" detail="rendering · input · A* navigation · combat feedback · persistence" active/>
          <BoundaryRow name="Skillbound project" detail="campaign · region grammar · enemies · abilities · items · loot · asset bindings" active/>
          <BoundaryRow name="Shared Asset Library" detail="Character Forge rigs · animation GLBs · VFX packages · item models" active/>
          <BoundaryRow name="Legacy prototypes" detail="kept outside the new runtime architecture"/>
        </div>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Layers3 size={16}/><span>PHASE 2.1 PIPELINE</span></div>
        <div className="forge-pipeline"><span>Forge tools</span><i>→</i><span>Shared Library</span><i>→</i><span>Gameplay Forge</span><i>→</i><span>Save</span><i>→</i><span>World Forge Play</span></div>
        <p className="forge-project-note">Gameplay Forge writes the same working project consumed by Play Mode. Missing visual assets safely fall back to runtime placeholders so systems remain testable.</p>
      </div>
      <div className="forge-project-panel">
        <div className="forge-project-panel-title"><Boxes size={16}/><span>CONNECTED AUTHORING</span></div>
        <div className="forge-tool-tags"><span>Gameplay Forge</span><span>Character Forge</span><span>Animations</span><span>VFX Studio</span><span>Asset Library</span><span>World Forge</span></div>
        <p className="forge-project-note"><CheckCircle2 size={12}/> Combat definitions now expose Library asset bindings rather than hardcoding presentation in the game renderer.</p>
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
