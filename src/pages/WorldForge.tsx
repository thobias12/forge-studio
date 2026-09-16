import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleDot, Eye, EyeOff, Globe2, MapPinned, Play, RefreshCcw, RotateCcw, Save, Shuffle, Square, StopCircle, Waypoints } from 'lucide-react'
import WorldForgeViewport from '../components/WorldForgeViewport'
import SkillboundFrontend from '../components/SkillboundFrontend'
import { generateGuidedRegion, randomWorldSeed } from '../engine/guidedWorld'
import {
  clearSkillboundWorkspace,
  loadSkillboundWorkspace,
  patchRegion,
  saveSkillboundWorkspace,
  type ForgeDensity,
  type ForgePathStyle,
  type ForgeProjectWorkspace,
  type ForgeRegionDefinition,
} from '../engine/forgeProject'

export default function WorldForge() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [status, setStatus] = useState('Loading Skillbound project…')
  const [playMode, setPlayMode] = useState(false)
  const [showRoute, setShowRoute] = useState(true)
  const [showBranches, setShowBranches] = useState(true)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showBiome, setShowBiome] = useState(true)

  useEffect(() => {
    void loadSkillboundWorkspace().then((next) => { setWorkspace(next); setStatus('Project loaded. Generate, tune, save, then Play From Here.') }).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load Skillbound project.'))
  }, [])

  const world = workspace?.worlds.find((item) => item.id === workspace.editor.selectedWorldId) ?? workspace?.worlds[0]
  const region = workspace?.regions.find((item) => item.id === workspace.editor.selectedRegionId) ?? workspace?.regions[0]
  const generated = useMemo(() => {
    if (!workspace || !region) return undefined
    return generateGuidedRegion(region, workspace.editor.previewSeed, workspace.manifest.generationVersion)
  }, [workspace, region])

  const updateRegion = (patch: Partial<ForgeRegionDefinition>) => {
    if (!workspace || !region) return
    setWorkspace(patchRegion(workspace, { ...region, ...patch }))
    setPlayMode(false)
  }

  const setSeed = (seed: number) => {
    if (!workspace) return
    setWorkspace({ ...workspace, editor: { ...workspace.editor, previewSeed: Math.max(1, Math.floor(seed || 1)) } })
    setPlayMode(false)
  }

  const selectNode = (nodeId: string) => {
    if (!workspace || !world) return
    const node = world.nodes.find((item) => item.id === nodeId)
    if (node?.type !== 'procedural-region' || !node.ref) { setStatus(`${node?.label ?? 'That node'} is an authored campaign anchor; its dedicated editor comes in a later phase.`); return }
    setWorkspace({ ...workspace, editor: { ...workspace.editor, selectedRegionId: node.ref } })
    setPlayMode(false)
  }

  const save = () => {
    if (!workspace) return
    const next = saveSkillboundWorkspace(workspace)
    setWorkspace(next)
    setStatus(`Saved ${region?.name ?? 'region'} to the Skillbound Forge project. Play mode now consumes this exact workspace.`)
  }

  const restore = async () => {
    clearSkillboundWorkspace()
    const next = await loadSkillboundWorkspace(true)
    setWorkspace(next); setPlayMode(false); setStatus('Bundled Skillbound project restored.')
  }

  if (!workspace || !world || !region || !generated) return <div className="forge-project-loading"><Globe2 size={28}/><strong>Opening World Forge</strong><span>{status}</span></div>

  return <div className="world-forge-page">
    <aside className="world-forge-left">
      <header className="world-forge-panel-heading"><Globe2 size={16}/><div><span>WORLD FORGE</span><strong>{workspace.manifest.name}</strong></div></header>
      <section className="world-forge-section">
        <h3>World identity</h3>
        <label className="world-forge-field"><span>Seed</span><div className="world-forge-seed"><input type="number" value={workspace.editor.previewSeed} onChange={(event) => setSeed(Number(event.target.value))}/><button title="New seed" onClick={() => setSeed(randomWorldSeed())}><Shuffle size={13}/></button></div></label>
        <div className="world-forge-meta"><span>Generation version</span><strong>v{workspace.manifest.generationVersion}</strong></div>
      </section>
      <section className="world-forge-section campaign-graph">
        <h3>Campaign · Act {world.act}</h3>
        {world.nodes.map((node, index) => <button key={node.id} className={node.ref === region.id ? 'active' : ''} onClick={() => selectNode(node.id)}>
          <i className={`node-icon ${node.type}`}>{node.type === 'procedural-region' ? <MapPinned size={13}/> : node.type === 'town' ? <Square size={12}/> : <CircleDot size={12}/>}</i>
          <span><strong>{node.label}</strong><small>{node.type.replace('-', ' ')}</small></span>
          {index < world.nodes.length - 1 && <em>↓</em>}
        </button>)}
      </section>
      <section className="world-forge-section world-forge-save-state">
        <button onClick={() => void restore()}><RotateCcw size={13}/> Restore defaults</button>
        <button className="primary" onClick={save}><Save size={13}/> Save project</button>
      </section>
    </aside>

    <main className="world-forge-center">
      <header className="world-forge-toolbar">
        <div><span className="eyebrow">GENERATED CANDIDATE</span><strong>{region.name}</strong><small>Seed {workspace.editor.previewSeed} · {generated.nodes.length} runtime nodes</small></div>
        <div className="world-forge-toolbar-actions">
          <button onClick={() => setSeed(workspace.editor.previewSeed)}><RefreshCcw size={13}/> Regenerate</button>
          <button onClick={() => setSeed(randomWorldSeed())}><Shuffle size={13}/> New Seed</button>
          <button className={playMode ? 'danger' : 'primary'} onClick={() => setPlayMode((value) => !value)}>{playMode ? <StopCircle size={14}/> : <Play size={14}/>} {playMode ? 'Stop' : 'Play From Here'}</button>
        </div>
      </header>
      <div className="world-forge-overlay-bar">
        <OverlayButton label="Main route" active={showRoute} onClick={() => setShowRoute((value) => !value)}/>
        <OverlayButton label="Branches" active={showBranches} onClick={() => setShowBranches((value) => !value)}/>
        <OverlayButton label="Landmarks" active={showLandmarks} onClick={() => setShowLandmarks((value) => !value)}/>
        <OverlayButton label="Biome" active={showBiome} onClick={() => setShowBiome((value) => !value)}/>
        <span className={generated.validation.valid ? 'validation-good' : 'validation-bad'}>{generated.validation.valid ? <CheckCircle2 size={13}/> : <Waypoints size={13}/>} {generated.validation.valid ? 'Navigation valid' : `${generated.validation.issues.length} issues`}</span>
      </div>
      <div className="world-forge-stage">
        {playMode ? <SkillboundFrontend workspace={workspace} region={generated} autoPlayActive onOpenWorld={() => setPlayMode(false)} onBackHome={() => setPlayMode(false)}/> : <WorldForgeViewport region={generated} showRoute={showRoute} showBranches={showBranches} showLandmarks={showLandmarks} showBiome={showBiome}/>} 
      </div>
      <footer className="world-forge-status"><span>{status}</span><strong>{playMode ? 'Play From Here starts the active character in this generated region.' : 'Geography → route → branches → landmarks → dressing.'}</strong></footer>
    </main>

    <aside className="world-forge-right">
      <header className="world-forge-panel-heading"><MapPinned size={16}/><div><span>REGION INSPECTOR</span><strong>{region.name}</strong></div></header>
      <section className="world-forge-section">
        <h3>Grammar</h3>
        <Field label="Biome"><input value={region.biome} onChange={(event) => updateRegion({ biome: event.target.value })}/></Field>
        <Field label="Main path"><select value={region.mainPath} onChange={(event) => updateRegion({ mainPath: event.target.value as ForgePathStyle })}><option value="direct">Direct</option><option value="winding">Winding</option><option value="meandering">Meandering</option></select></Field>
        <RangePair label="Chunks" value={region.chunkRange} min={3} max={12} onChange={(value) => updateRegion({ chunkRange: value })}/>
        <RangePair label="Branches" value={region.branchRange} min={0} max={6} onChange={(value) => updateRegion({ branchRange: value })}/>
        <RangePair label="Landmarks" value={region.landmarkRange} min={0} max={6} onChange={(value) => updateRegion({ landmarkRange: value })}/>
        <Field label="Enemy density"><select value={region.enemyDensity} onChange={(event) => updateRegion({ enemyDensity: event.target.value as ForgeDensity })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
        <Slider label="Optional dungeon" value={region.optionalDungeonChance} onChange={(value) => updateRegion({ optionalDungeonChance: value })}/>
        <Slider label="Settlement" value={region.settlementChance} onChange={(value) => updateRegion({ settlementChance: value })}/>
      </section>
      <section className="world-forge-section">
        <h3>Generation features</h3>
        <div className="world-forge-features">{['roads','clearings','streams','grave clusters','ruins','fallen trees'].map((feature) => {
          const checked = region.features.includes(feature)
          return <label key={feature}><input type="checkbox" checked={checked} onChange={() => updateRegion({ features: checked ? region.features.filter((item) => item !== feature) : [...region.features, feature] })}/><span>{feature}</span></label>
        })}</div>
      </section>
      <section className="world-forge-section validation-panel">
        <h3>Generation debug</h3>
        <DebugRow label="Main route nodes" value={generated.nodes.filter((node) => ['entry','route','exit'].includes(node.kind)).length}/>
        <DebugRow label="Branch nodes" value={generated.nodes.filter((node) => node.kind === 'branch').length}/>
        <DebugRow label="Landmarks" value={generated.nodes.filter((node) => node.kind === 'landmark').length}/>
        <DebugRow label="Connections" value={generated.connections.length}/>
        {generated.validation.valid ? <div className="world-forge-valid"><CheckCircle2 size={14}/> Entry can reach exit.</div> : generated.validation.issues.map((issue) => <div className="world-forge-invalid" key={issue}>{issue}</div>)}
      </section>
    </aside>
  </div>
}

function OverlayButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{active ? <Eye size={12}/> : <EyeOff size={12}/>} {label}</button>
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="world-forge-field"><span>{label}</span>{children}</label> }
function RangePair({ label, value, min, max, onChange }: { label: string; value: [number, number]; min: number; max: number; onChange: (value: [number, number]) => void }) {
  const set = (index: 0 | 1, next: number) => { const copy: [number, number] = [...value]; copy[index] = Math.max(min, Math.min(max, next)); if (copy[0] > copy[1]) copy[index === 0 ? 1 : 0] = copy[index]; onChange(copy) }
  return <label className="world-forge-field"><span>{label}</span><div className="range-pair"><input type="number" min={min} max={max} value={value[0]} onChange={(event) => set(0, Number(event.target.value))}/><em>to</em><input type="number" min={min} max={max} value={value[1]} onChange={(event) => set(1, Number(event.target.value))}/></div></label>
}
function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="world-forge-field slider-field"><span>{label}</span><div><input type="range" min="0" max="1" step="0.05" value={value} onChange={(event) => onChange(Number(event.target.value))}/><b>{Math.round(value * 100)}%</b></div></label> }
function DebugRow({ label, value }: { label: string; value: number }) { return <div className="debug-row"><span>{label}</span><strong>{value}</strong></div> }
