import { useEffect, useMemo, useState } from 'react'
import { Bone, Box, CheckCircle2, Circle, Download, Eye, EyeOff, Gamepad2, Image as ImageIcon, Library, Loader2, Monitor, Palette, Pause, Play, Shield, Sparkles, Upload, WandSparkles } from 'lucide-react'
import CharacterForgePreview from '../components/CharacterForgePreview'
import { analyzeConceptFile, buildConfigFromConcept, conceptRecipe, createFallbackConceptAnalysis, validateConceptBuild, type ConceptAnalysis, type ConceptSpeciesHint, type ConceptValidation } from '../lib/conceptCharacter'
import { cloneForgeCharacterConfig, exportProceduralCharacterGlb, type ForgeCharacterConfig } from '../lib/proceduralCharacter'
import { saveAsset } from '../lib/library'
import '../character-forge.css'
import '../concept-forge.css'

type StageId = 'reference' | 'analyze' | 'assemble' | 'rig' | 'materials' | 'validate'
type StageState = 'idle' | 'working' | 'done' | 'error'
type CameraMode = 'studio' | 'arpg'

const STAGES: Array<{ id: StageId; label: string; detail: string }> = [
  { id: 'reference', label: 'Reference', detail: 'Load the approved concept or use the Crypt Skeleton target.' },
  { id: 'analyze', label: 'Analyze', detail: 'Detect archetype and extract a usable material palette locally.' },
  { id: 'assemble', label: 'Assemble', detail: 'Build the curated body, armor, cloth and weapon recipe.' },
  { id: 'rig', label: 'Rig', detail: 'Fit the ForgeHumanoidV1 skeleton and animation-compatible structure.' },
  { id: 'materials', label: 'Materials', detail: 'Apply the concept-derived dark ARPG palette.' },
  { id: 'validate', label: 'Game Test', detail: 'Validate skin, animation clips, triangle count and ARPG readability.' },
]

const ANIMATIONS = ['Idle', 'Walk', 'Attack', 'Death']

export default function ConceptForge() {
  const [file, setFile] = useState<File | null>(null)
  const [referenceUrl, setReferenceUrl] = useState('')
  const [speciesHint, setSpeciesHint] = useState<ConceptSpeciesHint>('auto')
  const [analysis, setAnalysis] = useState<ConceptAnalysis | null>(null)
  const [validation, setValidation] = useState<ConceptValidation | null>(null)
  const [config, setConfig] = useState<ForgeCharacterConfig>(() => cloneForgeCharacterConfig('skeleton'))
  const [stages, setStages] = useState<Record<StageId, StageState>>(() => stageMap('idle'))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Drop in the approved concept and Forge will build the first game-ready draft locally.')
  const [animation, setAnimation] = useState('Idle')
  const [playing, setPlaying] = useState(true)
  const [cameraMode, setCameraMode] = useState<CameraMode>('studio')
  const [showRig, setShowRig] = useState(false)
  const [showHitbox, setShowHitbox] = useState(false)
  const [stats, setStats] = useState({ bones: 0, skinnedMeshes: 0, triangles: 0 })

  useEffect(() => () => { if (referenceUrl) URL.revokeObjectURL(referenceUrl) }, [referenceUrl])

  const recipe = useMemo(() => conceptRecipe(analysis?.species ?? config.species), [analysis?.species, config.species])

  const loadFile = (next: File | null) => {
    if (!next) return
    if (!next.type.startsWith('image/')) { setStatus('Concept Forge needs a PNG, JPG or WebP reference image.'); return }
    if (referenceUrl) URL.revokeObjectURL(referenceUrl)
    setFile(next)
    setReferenceUrl(URL.createObjectURL(next))
    setAnalysis(null)
    setValidation(null)
    setStages(stageMap('idle'))
    setStatus(`${next.name} loaded. Click Build Character and Forge will handle the pipeline.`)
  }

  const updateStage = (id: StageId, value: StageState) => setStages((current) => ({ ...current, [id]: value }))

  const buildCharacter = async () => {
    if (busy) return
    setBusy(true)
    setValidation(null)
    setStages(stageMap('idle'))
    try {
      updateStage('reference', 'working')
      await frame()
      updateStage('reference', 'done')

      updateStage('analyze', 'working')
      setStatus(file ? 'Analyzing the concept locally…' : 'Using the approved Crypt Skeleton production target…')
      const analyzed = file
        ? await analyzeConceptFile(file, speciesHint)
        : createFallbackConceptAnalysis(speciesHint === 'auto' ? 'skeleton' : speciesHint)
      setAnalysis(analyzed)
      updateStage('analyze', 'done')
      await frame()

      updateStage('assemble', 'working')
      const nextConfig = buildConfigFromConcept(analyzed)
      setConfig(nextConfig)
      setAnimation('Idle')
      setPlaying(true)
      updateStage('assemble', 'done')
      await frame()

      updateStage('rig', 'working')
      const checked = validateConceptBuild(nextConfig)
      if (!checked.gameReady) throw new Error('The local build failed the ForgeHumanoidV1 validation pass.')
      updateStage('rig', 'done')
      await frame()

      updateStage('materials', 'working')
      await frame()
      updateStage('materials', 'done')

      updateStage('validate', 'working')
      setValidation(checked)
      setCameraMode('arpg')
      await frame()
      updateStage('validate', 'done')
      setStatus(`${nextConfig.name} built locally. Review it at ARPG distance, then save or export if the silhouette is moving in the right direction.`)
    } catch (error) {
      const active = STAGES.find((item) => stages[item.id] === 'working')?.id
      if (active) updateStage(active, 'error')
      setStatus(error instanceof Error ? error.message : 'Concept build failed.')
    } finally {
      setBusy(false)
    }
  }

  const saveToLibrary = async () => {
    if (!validation) { setStatus('Build the concept first.'); return }
    setBusy(true)
    try {
      const glb = await exportProceduralCharacterGlb(config)
      await saveAsset({ name: config.name, category: 'characters', kind: 'glb', mime: 'model/gltf-binary', tags: ['concept-forge', config.species, 'rigged', 'ForgeHumanoidV1', 'dark-arpg'], source: 'Forge Concept Forge', blob: glb })
      if (file) await saveAsset({ name: `${config.name} Concept Reference`, category: 'textures', kind: 'image', mime: file.type || 'image/png', tags: ['concept-forge', 'reference', config.species], source: 'Forge Concept Forge', blob: file })
      setStatus(`${config.name} and its concept reference were saved to the Shared Asset Library.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the concept build.') }
    finally { setBusy(false) }
  }

  const downloadGlb = async () => {
    if (!validation) { setStatus('Build the concept first.'); return }
    setBusy(true)
    try {
      const blob = await exportProceduralCharacterGlb(config)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${slug(config.name)}.glb`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(`${config.name}.glb exported with ForgeHumanoidV1 and the four combat clips.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'GLB export failed.') }
    finally { setBusy(false) }
  }

  return <div className="concept-forge">
    <aside className="concept-left">
      <div className="concept-panel-title"><ImageIcon size={16}/><div><span>CREATE FROM CONCEPT</span><strong>Hands-off local pipeline</strong></div></div>

      <label className={`concept-drop ${referenceUrl ? 'has-image' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); loadFile(event.dataTransfer.files?.[0] ?? null) }}>
        {referenceUrl ? <img src={referenceUrl} alt="Concept reference"/> : <div className="concept-drop-empty"><Upload size={24}/><strong>Drop concept sheet here</strong><span>PNG, JPG or WebP</span></div>}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => loadFile(event.target.files?.[0] ?? null)}/>
        {referenceUrl && <span className="concept-replace"><Upload size={12}/> Replace reference</span>}
      </label>

      <div className="concept-local-note"><Shield size={14}/><span><strong>Local-first V1</strong> No external image-to-3D service is required. Forge uses the reference to choose a curated build recipe and palette.</span></div>

      <label className="concept-field"><span>Archetype</span><select value={speciesHint} onChange={(event) => setSpeciesHint(event.target.value as ConceptSpeciesHint)}><option value="auto">Auto detect</option><option value="skeleton">Skeleton</option><option value="zombie">Zombie</option><option value="bandit">Human / Bandit</option></select></label>

      <button className="concept-build-button" disabled={busy} onClick={() => void buildCharacter()}>{busy ? <Loader2 className="spin" size={16}/> : <WandSparkles size={16}/>} {busy ? 'Building character…' : file ? 'Build Character' : 'Build Approved Skeleton Target'}</button>

      <div className="concept-stages">
        {STAGES.map((stage) => <div className={`concept-stage ${stages[stage.id]}`} key={stage.id}>
          <StageIcon state={stages[stage.id]}/><div><strong>{stage.label}</strong><span>{stage.detail}</span></div>
        </div>)}
      </div>
    </aside>

    <main className="concept-center">
      <header className="concept-toolbar">
        <div><span className="eyebrow">CONCEPT FORGE</span><strong>{validation ? config.name : 'Automatic Character Builder'}</strong></div>
        <div className="concept-toolbar-actions">
          <div className="concept-camera-toggle"><button className={cameraMode === 'studio' ? 'active' : ''} onClick={() => setCameraMode('studio')}><Monitor size={13}/> Studio</button><button className={cameraMode === 'arpg' ? 'active' : ''} onClick={() => setCameraMode('arpg')}><Gamepad2 size={13}/> ARPG</button></div>
          <button onClick={() => setShowRig((value) => !value)}>{showRig ? <EyeOff size={14}/> : <Eye size={14}/>} Rig</button>
          <button onClick={() => setShowHitbox((value) => !value)}><Box size={14}/> Hitbox</button>
        </div>
      </header>

      <div className="concept-preview-wrap">
        <CharacterForgePreview config={config} animation={animation} playing={playing} showRig={showRig} showHitbox={showHitbox} cameraMode={cameraMode} onStats={setStats}/>
        {!validation && <div className="concept-preview-placeholder"><Sparkles size={26}/><strong>Concept → character</strong><span>Upload your approved sheet or use the Crypt Skeleton target, then click Build Character.</span></div>}
        <div className="concept-preview-badges"><span><Bone size={12}/>{stats.bones} bones</span><span>{stats.skinnedMeshes} skinned parts</span><span>{stats.triangles.toLocaleString()} tris</span><span>{cameraMode === 'arpg' ? 'Game-distance view' : 'Studio view'}</span></div>
        <div className="cf-animation-bar concept-animation-bar"><button className="cf-play" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>{ANIMATIONS.map((item) => <button className={animation === item ? 'active' : ''} key={item} onClick={() => { setAnimation(item); setPlaying(true) }}>{item}</button>)}</div>
      </div>
      <footer className="concept-status"><Sparkles size={13}/><span>{status}</span></footer>
    </main>

    <aside className="concept-right">
      <div className="concept-panel-title"><WandSparkles size={16}/><div><span>AUTOMATIC BUILD</span><strong>{analysis ? `${Math.round(analysis.confidence * 100)}% archetype confidence` : 'Waiting for build'}</strong></div></div>

      <section className="concept-summary">
        <h3>Target recipe</h3>
        <div className="concept-recipe">{recipe.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      <section className="concept-summary">
        <h3><Palette size={13}/> Concept palette</h3>
        <div className="concept-palette">
          <PaletteChip label={config.species === 'skeleton' ? 'Bone' : 'Body'} color={config.primary}/>
          <PaletteChip label="Cloth" color={config.secondary}/>
          <PaletteChip label="Accent" color={config.accent}/>
        </div>
      </section>

      <section className="concept-summary">
        <h3><Bone size={13}/> Runtime checks</h3>
        <Check label="ForgeHumanoidV1 rig" ok={Boolean(validation?.bones && validation.bones >= 18)}/>
        <Check label="Skinned geometry" ok={Boolean(validation?.skinnedMeshes)}/>
        <Check label="Idle / Walk / Attack / Death" ok={Boolean(validation)}/>
        <Check label="ARPG camera validation" ok={Boolean(validation)}/>
        {validation && <div className="concept-runtime-meta"><span>{validation.bones} bones</span><span>{validation.skinnedMeshes} parts</span><span>{validation.triangles.toLocaleString()} tris</span></div>}
      </section>

      <section className="concept-summary concept-roadmap">
        <h3>Automation roadmap</h3>
        <p>V1 establishes the zero-service workflow and production stages. Next passes replace more of the temporary template geometry with curated modular skeleton parts, then add automatic fit/weight refinement.</p>
      </section>

      <div className="concept-export"><button disabled={!validation || busy} onClick={() => void saveToLibrary()}><Library size={14}/> Save build to Library</button><button className="primary" disabled={!validation || busy} onClick={() => void downloadGlb()}><Download size={14}/> Export rigged GLB</button></div>
    </aside>
  </div>
}

function StageIcon({ state }: { state: StageState }) {
  if (state === 'working') return <Loader2 className="spin" size={15}/>
  if (state === 'done') return <CheckCircle2 size={15}/>
  return <Circle size={15}/>
}

function PaletteChip({ label, color }: { label: string; color: string }) { return <div><i style={{ background: color }}/><span>{label}</span><code>{color}</code></div> }
function Check({ label, ok }: { label: string; ok: boolean }) { return <div className={`concept-check ${ok ? 'ok' : ''}`}>{ok ? <CheckCircle2 size={13}/> : <Circle size={13}/>}<span>{label}</span></div> }
function stageMap(value: StageState): Record<StageId, StageState> { return { reference: value, analyze: value, assemble: value, rig: value, materials: value, validate: value } }
function frame() { return new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge-character' }
