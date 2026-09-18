import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CheckCircle2, CircleDot, Eye, EyeOff, Globe2, Lock, MapPinned, Play, RefreshCcw,
  RotateCcw, Save, Shuffle, Square, StopCircle, Unlock, Waypoints,
} from 'lucide-react'
import WorldForgeViewport from '../components/WorldForgeViewport'
import SkillboundFrontend from '../components/SkillboundFrontend'
import {
  createWorldLayerSeeds,
  generateGuidedRegion,
  randomWorldSeed,
  type WorldGenerationLayerSeeds,
} from '../engine/guidedWorld'
import {
  clearSkillboundWorkspace,
  loadSkillboundWorkspace,
  patchRegion,
  saveSkillboundWorkspace,
  type ForgeDensity,
  type ForgePathStyle,
  type ForgeProjectWorkspace,
  type ForgeRegionDefinition,
  type ForgeRegionSize,
  type ForgeRegionWorldGeneration,
} from '../engine/forgeProject'

type GenerationLayer = keyof WorldGenerationLayerSeeds
type GenerationLocks = Record<GenerationLayer, boolean>

const DEFAULT_WORLD_GEN: ForgeRegionWorldGeneration = {
  size: 'medium',
  elevation: .45,
  cliffs: .28,
  water: .4,
  forestDensity: .78,
  openSpace: .38,
  exploration: .72,
  loops: .5,
  secretPaths: .45,
  verticality: .45,
  poiDensity: .7,
}

const BIOMES = [
  'Ancient Forest',
  'Autumn Woodland',
  'Highlands',
  'Ruined Farmland',
  'Marsh',
  'Corrupted Wilds',
]

export default function WorldForge() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [status, setStatus] = useState('Loading Skillbound project…')
  const [playMode, setPlayMode] = useState(false)
  const [showRoute, setShowRoute] = useState(true)
  const [showBranches, setShowBranches] = useState(true)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showBiome, setShowBiome] = useState(true)
  const [showBoundary, setShowBoundary] = useState(false)
  const [showRiverDebug, setShowRiverDebug] = useState(false)
  const [locks, setLocks] = useState<GenerationLocks>({
    terrain: false,
    routes: false,
    pois: false,
    dressing: false,
  })

  useEffect(() => {
    void loadSkillboundWorkspace()
      .then((next) => {
        setWorkspace(next)
        setStatus('World Forge 2 · Landscape Generation loaded. Terrain now drives rivers, micro-biomes and POI composition.')
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Could not load Skillbound project.'))
  }, [])

  const world = workspace?.worlds.find((item) => item.id === workspace.editor.selectedWorldId) ?? workspace?.worlds[0]
  const region = workspace?.regions.find((item) => item.id === workspace.editor.selectedRegionId) ?? workspace?.regions[0]
  const worldGen = useMemo(() => {
    if (!workspace || !region) return DEFAULT_WORLD_GEN
    return normalizeWorldGen(region.worldGen, workspace.editor.previewSeed)
  }, [region, workspace?.editor.previewSeed])

  const generated = useMemo(() => {
    if (!workspace || !region) return undefined
    return generateGuidedRegion(
      region,
      workspace.editor.previewSeed,
      workspace.manifest.generationVersion,
      worldGen.layerSeeds ?? createWorldLayerSeeds(workspace.editor.previewSeed),
    )
  }, [workspace, region, worldGen])

  const updateRegion = (patch: Partial<ForgeRegionDefinition>) => {
    if (!workspace || !region) return
    setWorkspace(patchRegion(workspace, { ...region, ...patch }))
    setPlayMode(false)
  }

  const updateWorldGen = (patch: Partial<ForgeRegionWorldGeneration>) => {
    if (!workspace || !region) return
    const next = { ...worldGen, ...patch }
    updateRegion({ worldGen: next })
  }

  const setMasterSeed = (seed: number) => {
    if (!workspace || !region) return
    const masterSeed = Math.max(1, Math.floor(seed || 1))
    const generatedSeeds = createWorldLayerSeeds(masterSeed)
    const currentSeeds = worldGen.layerSeeds ?? createWorldLayerSeeds(workspace.editor.previewSeed)
    const nextSeeds: WorldGenerationLayerSeeds = {
      terrain: locks.terrain ? currentSeeds.terrain : generatedSeeds.terrain,
      routes: locks.routes ? currentSeeds.routes : generatedSeeds.routes,
      pois: locks.pois ? currentSeeds.pois : generatedSeeds.pois,
      dressing: locks.dressing ? currentSeeds.dressing : generatedSeeds.dressing,
    }
    const nextRegion = { ...region, worldGen: { ...worldGen, layerSeeds: nextSeeds } }
    const withRegion = patchRegion(workspace, nextRegion)
    setWorkspace({
      ...withRegion,
      editor: { ...withRegion.editor, previewSeed: masterSeed },
    })
    setPlayMode(false)
    setStatus('New master seed applied. Locked layers were preserved.')
  }

  const rerollUnlocked = () => {
    if (!workspace || !region) return
    const variation = createWorldLayerSeeds(randomWorldSeed())
    const current = worldGen.layerSeeds ?? createWorldLayerSeeds(workspace.editor.previewSeed)
    const nextSeeds: WorldGenerationLayerSeeds = {
      terrain: locks.terrain ? current.terrain : variation.terrain,
      routes: locks.routes ? current.routes : variation.routes,
      pois: locks.pois ? current.pois : variation.pois,
      dressing: locks.dressing ? current.dressing : variation.dressing,
    }
    updateWorldGen({ layerSeeds: nextSeeds })
    setStatus('Regenerated unlocked layers. Locked terrain/routes/POIs/dressing stayed unchanged.')
  }

  const applyAncientForestPreset = () => {
    if (!region) return
    updateRegion({
      biome: 'Ancient Forest',
      mainPath: 'winding',
      branchRange: [2, 5],
      landmarkRange: [4, 7],
      settlementChance: .25,
      worldGen: {
        ...worldGen,
        size: 'medium',
        elevation: .46,
        cliffs: .25,
        water: .46,
        forestDensity: .82,
        openSpace: .36,
        exploration: .78,
        loops: .56,
        secretPaths: .5,
        verticality: .44,
        poiDensity: .76,
      },
    })
    setStatus('Ancient Forest preset applied.')
  }

  const toggleLock = (layer: GenerationLayer) => {
    setLocks((current) => ({ ...current, [layer]: !current[layer] }))
  }

  const selectNode = (nodeId: string) => {
    if (!workspace || !world) return
    const node = world.nodes.find((item) => item.id === nodeId)
    if (node?.type !== 'procedural-region' || !node.ref) {
      setStatus(`${node?.label ?? 'That node'} is an authored campaign anchor; its dedicated editor comes in a later phase.`)
      return
    }
    setWorkspace({ ...workspace, editor: { ...workspace.editor, selectedRegionId: node.ref } })
    setPlayMode(false)
  }

  const save = () => {
    if (!workspace) return
    const next = saveSkillboundWorkspace(workspace)
    setWorkspace(next)
    setStatus(`Saved ${region?.name ?? 'region'} with Landscape Generation settings.`)
  }

  const restore = async () => {
    clearSkillboundWorkspace()
    const next = await loadSkillboundWorkspace(true)
    setWorkspace(next)
    setPlayMode(false)
    setLocks({ terrain: false, routes: false, pois: false, dressing: false })
    setStatus('Bundled Skillbound project restored.')
  }

  if (!workspace || !world || !region || !generated) {
    return <div className="forge-project-loading"><Globe2 size={28}/><strong>Opening World Forge 2</strong><span>{status}</span></div>
  }

  return <div className="world-forge-page world-forge-v2">
    <aside className="world-forge-left">
      <header className="world-forge-panel-heading"><Globe2 size={16}/><div><span>WORLD FORGE 2</span><strong>{workspace.manifest.name}</strong></div></header>

      <section className="world-forge-section">
        <h3>World identity</h3>
        <label className="world-forge-field">
          <span>Master seed</span>
          <div className="world-forge-seed">
            <input type="number" value={workspace.editor.previewSeed} onChange={(event) => setMasterSeed(Number(event.target.value))}/>
            <button title="New seed" onClick={() => setMasterSeed(randomWorldSeed())}><Shuffle size={13}/></button>
          </div>
        </label>
        <div className="world-forge-meta"><span>Generator</span><strong>Landscape Generation v3</strong></div>
        <button className="world-forge-preset" onClick={applyAncientForestPreset}>Apply Ancient Forest preset</button>
      </section>

      <section className="world-forge-section generation-locks">
        <h3>Generation locks</h3>
        <p>Lock the layers you like, then reroll only the rest.</p>
        {(['terrain', 'routes', 'pois', 'dressing'] as GenerationLayer[]).map((layer) =>
          <button key={layer} className={locks[layer] ? 'locked' : ''} onClick={() => toggleLock(layer)}>
            {locks[layer] ? <Lock size={12}/> : <Unlock size={12}/>}
            <span>{layerLabel(layer)}</span>
            <em>{locks[layer] ? 'Locked' : 'Reroll'}</em>
          </button>
        )}
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
        <div>
          <span className="eyebrow">OUTDOOR REGION</span>
          <strong>{region.name}</strong>
          <small>Seed {workspace.editor.previewSeed} · {generated.pois.length} POIs · {generated.dressing.length} dressing objects · {generated.paths.length} paths</small>
        </div>
        <div className="world-forge-toolbar-actions">
          <button onClick={rerollUnlocked}><RefreshCcw size={13}/> Regenerate unlocked</button>
          <button onClick={() => setMasterSeed(randomWorldSeed())}><Shuffle size={13}/> New Seed</button>
          <button className={playMode ? 'danger' : 'primary'} onClick={() => setPlayMode((value) => !value)}>
            {playMode ? <StopCircle size={14}/> : <Play size={14}/>}
            {playMode ? 'Stop' : 'Play Region'}
          </button>
        </div>
      </header>

      <div className="world-forge-overlay-bar">
        <OverlayButton label="Main road" active={showRoute} onClick={() => setShowRoute((value) => !value)}/>
        <OverlayButton label="Side trails" active={showBranches} onClick={() => setShowBranches((value) => !value)}/>
        <OverlayButton label="POIs" active={showLandmarks} onClick={() => setShowLandmarks((value) => !value)}/>
        <OverlayButton label="Dressing" active={showBiome} onClick={() => setShowBiome((value) => !value)}/>
        <OverlayButton label="Bounds" active={showBoundary} onClick={() => setShowBoundary((value) => !value)}/>
        <OverlayButton label="River Debug" active={showRiverDebug} onClick={() => setShowRiverDebug((value) => !value)}/>
        <span className={generated.validation.valid ? 'validation-good' : 'validation-bad'}>
          {generated.validation.valid ? <CheckCircle2 size={13}/> : <Waypoints size={13}/>}
          {generated.validation.valid ? 'Navigation valid' : `${generated.validation.issues.length} issues`}
        </span>
      </div>

      <div className="world-forge-stage">
        {playMode
          ? <SkillboundFrontend workspace={workspace} region={generated} autoPlayActive onOpenWorld={() => setPlayMode(false)} onBackHome={() => setPlayMode(false)}/>
          : <WorldForgeViewport region={generated} showRoute={showRoute} showBranches={showBranches} showLandmarks={showLandmarks} showBiome={showBiome} showBoundary={showBoundary} showRiverDebug={showRiverDebug}/>}
      </div>

      <footer className="world-forge-status">
        <span>{status}</span>
        <strong>{playMode ? 'Play mode consumes the generated region composition.' : 'Terrain → hydrology → routes → micro-biomes → POIs → dressing.'}</strong>
      </footer>
    </main>

    <aside className="world-forge-right">
      <header className="world-forge-panel-heading"><MapPinned size={16}/><div><span>REGION GENERATOR</span><strong>{region.name}</strong></div></header>

      <section className="world-forge-section">
        <h3>Region</h3>
        <Field label="Biome">
          <select value={BIOMES.includes(region.biome) ? region.biome : 'Ancient Forest'} onChange={(event) => updateRegion({ biome: event.target.value })}>
            {BIOMES.map((biome) => <option value={biome} key={biome}>{biome}</option>)}
          </select>
        </Field>
        <Field label="Size">
          <select value={worldGen.size} onChange={(event) => updateWorldGen({ size: event.target.value as ForgeRegionSize })}>
            <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
          </select>
        </Field>
        <Field label="Main path">
          <select value={region.mainPath} onChange={(event) => updateRegion({ mainPath: event.target.value as ForgePathStyle })}>
            <option value="direct">Direct</option><option value="winding">Winding</option><option value="meandering">Meandering</option>
          </select>
        </Field>
      </section>

      <section className="world-forge-section">
        <h3>Geography</h3>
        <Slider label="Elevation" value={worldGen.elevation} onChange={(value) => updateWorldGen({ elevation: value })}/>
        <Slider label="Cliffs" value={worldGen.cliffs} onChange={(value) => updateWorldGen({ cliffs: value })}/>
        <Slider label="Water / streams" value={worldGen.water} onChange={(value) => updateWorldGen({ water: value })}/>
        <Slider label="Forest density" value={worldGen.forestDensity} onChange={(value) => updateWorldGen({ forestDensity: value })}/>
        <Slider label="Open space" value={worldGen.openSpace} onChange={(value) => updateWorldGen({ openSpace: value })}/>
        <Slider label="Verticality" value={worldGen.verticality} onChange={(value) => updateWorldGen({ verticality: value })}/>
      </section>

      <section className="world-forge-section">
        <h3>Exploration</h3>
        <Slider label="Exploration" value={worldGen.exploration} onChange={(value) => updateWorldGen({ exploration: value })}/>
        <Slider label="Loops" value={worldGen.loops} onChange={(value) => updateWorldGen({ loops: value })}/>
        <Slider label="Secret paths" value={worldGen.secretPaths} onChange={(value) => updateWorldGen({ secretPaths: value })}/>
        <Slider label="POI density" value={worldGen.poiDensity} onChange={(value) => updateWorldGen({ poiDensity: value })}/>
        <RangePair label="Branches" value={region.branchRange} min={0} max={7} onChange={(value) => updateRegion({ branchRange: value })}/>
        <RangePair label="Landmarks" value={region.landmarkRange} min={2} max={9} onChange={(value) => updateRegion({ landmarkRange: value })}/>
      </section>

      <section className="world-forge-section">
        <h3>Gameplay content</h3>
        <Field label="Enemy density">
          <select value={region.enemyDensity} onChange={(event) => updateRegion({ enemyDensity: event.target.value as ForgeDensity })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </Field>
        <Slider label="Optional dungeon" value={region.optionalDungeonChance} onChange={(value) => updateRegion({ optionalDungeonChance: value })}/>
        <Slider label="Settlement" value={region.settlementChance} onChange={(value) => updateRegion({ settlementChance: value })}/>
      </section>

      <section className="world-forge-section validation-panel">
        <h3>Generated region</h3>
        <DebugRow label="Terrain grid" value={generated.terrain.resolution * generated.terrain.resolution}/>
        <DebugRow label="Micro-biomes" value={generated.terrain.microBiomes.length}/>
        <DebugRow label="River samples" value={generated.terrain.stream.length}/>
        <DebugRow label="Crossings" value={generated.crossings.length}/>
        <DebugRow label="Road / trail paths" value={generated.paths.length}/>
        <DebugRow label="Points of interest" value={generated.pois.length}/>
        <DebugRow label="Biome dressing" value={generated.dressing.length}/>
        <DebugRow label="Encounters" value={generated.nodes.filter((node) => node.kind === 'encounter').length}/>
        {generated.validation.valid
          ? <div className="world-forge-valid"><CheckCircle2 size={14}/> Entry, exit and dungeon traversal are valid.</div>
          : generated.validation.issues.map((issue) => <div className="world-forge-invalid" key={issue}>{issue}</div>)}
      </section>
    </aside>
  </div>
}

function normalizeWorldGen(value: ForgeRegionWorldGeneration | undefined, masterSeed: number): ForgeRegionWorldGeneration {
  return {
    ...DEFAULT_WORLD_GEN,
    ...(value ?? {}),
    layerSeeds: value?.layerSeeds ?? createWorldLayerSeeds(masterSeed),
  }
}

function layerLabel(layer: GenerationLayer) {
  if (layer === 'terrain') return 'Terrain'
  if (layer === 'routes') return 'Roads & trails'
  if (layer === 'pois') return 'Points of interest'
  return 'Biome dressing'
}

function OverlayButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{active ? <Eye size={12}/> : <EyeOff size={12}/>} {label}</button>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="world-forge-field"><span>{label}</span>{children}</label>
}

function RangePair({ label, value, min, max, onChange }: {
  label: string
  value: [number, number]
  min: number
  max: number
  onChange: (value: [number, number]) => void
}) {
  const set = (index: 0 | 1, next: number) => {
    const copy: [number, number] = [...value]
    copy[index] = Math.max(min, Math.min(max, next))
    if (copy[0] > copy[1]) copy[index === 0 ? 1 : 0] = copy[index]
    onChange(copy)
  }
  return <label className="world-forge-field"><span>{label}</span><div className="range-pair">
    <input type="number" min={min} max={max} value={value[0]} onChange={(event) => set(0, Number(event.target.value))}/>
    <em>to</em>
    <input type="number" min={min} max={max} value={value[1]} onChange={(event) => set(1, Number(event.target.value))}/>
  </div></label>
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="world-forge-field slider-field"><span>{label}</span><div>
    <input type="range" min="0" max="1" step="0.05" value={value} onChange={(event) => onChange(Number(event.target.value))}/>
    <b>{Math.round(value * 100)}%</b>
  </div></label>
}

function DebugRow({ label, value }: { label: string; value: number }) {
  return <div className="debug-row"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>
}
