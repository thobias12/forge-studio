import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Bone, Box, CheckCircle2, Circle, Download, Eye, EyeOff, Gamepad2, Image as ImageIcon,
  Library, Loader2, Monitor, Palette, Pause, Play, Shield, SlidersHorizontal, Sparkles, Swords, Upload,
  UserRound, WandSparkles,
} from 'lucide-react'
import CharacterForgePreview from '../components/CharacterForgePreview'
import { analyzeConceptFile, buildConfigFromConcept, conceptRecipe, createFallbackConceptAnalysis, type ConceptAnalysis, type ConceptSpeciesHint, type ConceptValidation } from '../lib/conceptCharacter'
import { disposeForgeCharacter } from '../lib/proceduralCharacter'
import { createConceptCharacter, exportConceptCharacterGlb } from '../lib/conceptCryptSkeleton'
import { saveAsset } from '../lib/library'
import {
  CHARACTER_BLUEPRINT_PRESETS,
  blueprintFromConfig,
  blueprintToConfig,
  characterBlueprintBlob,
  cloneBlueprint,
  createCharacterBlueprint,
  type ForgeCharacterBlueprint,
  type ForgeCharacterEntityKind,
  type ForgeCharacterFaction,
  type ForgeCharacterRole,
  type ForgeCharacterTemperament,
} from '../engine/characterBlueprint'
import { FORGE_WEAPON_ANIMATION_PROFILES, type ForgeWeaponAnimationProfile } from '../engine/weaponAnimationProfiles'
import '../character-forge.css'
import '../concept-forge.css'

type StageId = 'reference' | 'analyze' | 'assemble' | 'rig' | 'materials' | 'validate'
type StageState = 'idle' | 'working' | 'done' | 'error'
type CameraMode = 'studio' | 'arpg'
type InspectorTab = 'identity' | 'body' | 'appearance' | 'behavior' | 'pipeline'

const STAGES: Array<{ id: StageId; label: string; detail: string }> = [
  { id: 'reference', label: 'Reference', detail: 'Use an image, a preset or your authored blueprint.' },
  { id: 'analyze', label: 'Analyze', detail: 'Extract lineage and palette locally when a concept image is present.' },
  { id: 'assemble', label: 'Assemble', detail: 'Build the body and appearance from the reusable character blueprint.' },
  { id: 'rig', label: 'Rig', detail: 'Fit the ForgeHumanoidV1 skeleton and runtime sockets.' },
  { id: 'materials', label: 'Materials', detail: 'Apply the authored palette and equipment styling.' },
  { id: 'validate', label: 'Game Test', detail: 'Validate geometry, animation clips, hitbox and ARPG readability.' },
]
const ANIMATIONS = ['Idle', 'Walk', 'Attack', 'Death']
const TABS: Array<{ id: InspectorTab; label: string; icon: typeof UserRound }> = [
  { id: 'identity', label: 'Identity', icon: UserRound },
  { id: 'body', label: 'Body', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'behavior', label: 'Gameplay', icon: Activity },
  { id: 'pipeline', label: 'Build', icon: WandSparkles },
]

export default function ConceptForge() {
  const [file, setFile] = useState<File | null>(null)
  const [referenceUrl, setReferenceUrl] = useState('')
  const [speciesHint, setSpeciesHint] = useState<ConceptSpeciesHint>('auto')
  const [analysis, setAnalysis] = useState<ConceptAnalysis | null>(null)
  const [validation, setValidation] = useState<ConceptValidation | null>(null)
  const [blueprint, setBlueprint] = useState<ForgeCharacterBlueprint>(() => createCharacterBlueprint('crypt-skeleton'))
  const [selectedPreset, setSelectedPreset] = useState('crypt-skeleton')
  const [stages, setStages] = useState<Record<StageId, StageState>>(() => stageMap('idle'))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Concept Forge 2.0 uses one reusable character blueprint for enemies, creatures, NPCs and the future player creator.')
  const [animation, setAnimation] = useState('Idle')
  const [playing, setPlaying] = useState(true)
  const [cameraMode, setCameraMode] = useState<CameraMode>('studio')
  const [showRig, setShowRig] = useState(false)
  const [showHitbox, setShowHitbox] = useState(false)
  const [stats, setStats] = useState({ bones: 0, skinnedMeshes: 0, triangles: 0 })
  const [tab, setTab] = useState<InspectorTab>('identity')

  useEffect(() => () => { if (referenceUrl) URL.revokeObjectURL(referenceUrl) }, [referenceUrl])

  const config = useMemo(() => blueprintToConfig(blueprint), [blueprint])
  const recipe = useMemo(() => conceptRecipe(blueprint.lineage), [blueprint.lineage])
  const updateStage = (id: StageId, value: StageState) => setStages((current) => ({ ...current, [id]: value }))
  const patchBlueprint = (patch: Partial<ForgeCharacterBlueprint>) => {
    setBlueprint((current) => ({ ...current, ...patch }))
    setValidation(null)
  }

  const loadFile = (next: File | null) => {
    if (!next) return
    if (!next.type.startsWith('image/')) { setStatus('Concept Forge needs a PNG, JPG or WebP reference image.'); return }
    if (referenceUrl) URL.revokeObjectURL(referenceUrl)
    setFile(next)
    setReferenceUrl(URL.createObjectURL(next))
    setAnalysis(null)
    setValidation(null)
    setStages(stageMap('idle'))
    setStatus(`${next.name} loaded. Build Blueprint will analyze it, then keep everything editable.`)
  }

  const applyPreset = (id: string) => {
    const preset = CHARACTER_BLUEPRINT_PRESETS.find((item) => item.id === id)
    if (!preset) return
    setSelectedPreset(id)
    setBlueprint(cloneBlueprint(preset.blueprint))
    setSpeciesHint(preset.blueprint.lineage)
    setAnalysis(null)
    setValidation(null)
    setStages(stageMap('idle'))
    setStatus(`${preset.label} loaded as an editable blueprint. Weapons stay external and come from Item Forge.`)
  }

  const buildCharacter = async () => {
    if (busy) return
    setBusy(true)
    setValidation(null)
    setStages(stageMap('idle'))
    let currentStage: StageId = 'reference'
    try {
      updateStage('reference', 'working'); await frame(); updateStage('reference', 'done')
      currentStage = 'analyze'; updateStage('analyze', 'working')
      let nextBlueprint = cloneBlueprint(blueprint)
      if (file) {
        setStatus('Analyzing the concept locally and merging it into the current blueprint…')
        const analyzed = await analyzeConceptFile(file, speciesHint)
        setAnalysis(analyzed)
        const analyzedConfig = buildConfigFromConcept(analyzed)
        nextBlueprint = blueprintFromConfig(analyzedConfig, { ...nextBlueprint, lineage: analyzed.species })
        nextBlueprint.name = blueprint.name || nextBlueprint.name
        nextBlueprint.entityKind = blueprint.entityKind
        nextBlueprint.role = blueprint.role
        nextBlueprint.faction = blueprint.faction
        nextBlueprint.level = blueprint.level
        nextBlueprint.combat = { ...blueprint.combat }
        nextBlueprint.npc = { ...blueprint.npc }
        nextBlueprint.tags = [...blueprint.tags]
      } else {
        const analyzed = createFallbackConceptAnalysis(nextBlueprint.lineage)
        setAnalysis(analyzed)
      }
      updateStage('analyze', 'done'); await frame()

      currentStage = 'assemble'; updateStage('assemble', 'working')
      setBlueprint(nextBlueprint); setAnimation('Idle'); setPlaying(true)
      const nextConfig = blueprintToConfig(nextBlueprint)
      updateStage('assemble', 'done'); await frame()

      currentStage = 'rig'; updateStage('rig', 'working')
      const build = createConceptCharacter(nextConfig)
      const checked: ConceptValidation = {
        bones: build.stats.bones,
        skinnedMeshes: build.stats.skinnedMeshes,
        triangles: build.stats.triangles,
        rig: 'ForgeHumanoidV1',
        gameReady: build.stats.bones >= 18 && build.stats.skinnedMeshes > 0 && build.stats.triangles > 250,
      }
      disposeForgeCharacter(build.root)
      if (!checked.gameReady) throw new Error('The blueprint failed the ForgeHumanoidV1 validation pass.')
      updateStage('rig', 'done'); await frame()

      currentStage = 'materials'; updateStage('materials', 'working'); await frame(); updateStage('materials', 'done')
      currentStage = 'validate'; updateStage('validate', 'working')
      setValidation(checked); setCameraMode('arpg'); await frame(); updateStage('validate', 'done')
      setStatus(`${nextBlueprint.name} is game-ready. The exported character is weaponless; Item Forge owns equipped weapons.`)
    } catch (error) {
      updateStage(currentStage, 'error')
      setStatus(error instanceof Error ? error.message : 'Concept build failed.')
    } finally { setBusy(false) }
  }

  const saveToLibrary = async () => {
    if (!validation) { setStatus('Build and validate the blueprint first.'); return }
    setBusy(true)
    try {
      const glb = await exportConceptCharacterGlb(config)
      const character = await saveAsset({
        name: blueprint.name, category: 'characters', kind: 'glb', mime: 'model/gltf-binary',
        tags: ['concept-forge-2', blueprint.entityKind, blueprint.lineage, blueprint.role, blueprint.faction, 'rigged', 'ForgeHumanoidV1', 'weaponless'],
        source: 'Forge Concept Forge 2.0', blob: glb,
      })
      const savedBlueprint = { ...blueprint, targetAssetId: character.id }
      await saveAsset({
        id: `forge-character-blueprint:${character.id}`,
        name: `${blueprint.name} Blueprint`, category: 'characters', kind: 'file', mime: 'application/x-forge-character-blueprint+json',
        tags: ['character-blueprint', 'concept-forge-2', blueprint.entityKind, blueprint.lineage, blueprint.role],
        source: 'Forge Concept Forge 2.0', blob: characterBlueprintBlob(savedBlueprint),
      })
      if (file) await saveAsset({ name: `${blueprint.name} Concept Reference`, category: 'textures', kind: 'image', mime: file.type || 'image/png', tags: ['concept-forge', 'reference', blueprint.lineage], source: 'Forge Concept Forge 2.0', blob: file })
      setStatus(`${blueprint.name} and its editable Blueprint v2 were saved. Action Bindings can now add combat animations and Item Forge equipment.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the concept build.') }
    finally { setBusy(false) }
  }

  const downloadGlb = async () => {
    if (!validation) { setStatus('Build and validate the blueprint first.'); return }
    setBusy(true)
    try {
      const blob = await exportConceptCharacterGlb(config)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${slug(blueprint.name)}.glb`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(`${blueprint.name}.glb exported weaponless with ForgeHumanoidV1 and the four base clips.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'GLB export failed.') }
    finally { setBusy(false) }
  }

  return <div className="concept-forge concept-forge-v2">
    <aside className="concept-left">
      <div className="concept-panel-title"><Sparkles size={16}/><div><span>CONCEPT FORGE 2.0</span><strong>Character blueprint studio</strong></div></div>
      <div className="concept-preset-list">
        {CHARACTER_BLUEPRINT_PRESETS.map((preset) => <button key={preset.id} className={selectedPreset === preset.id ? 'active' : ''} onClick={() => applyPreset(preset.id)}><strong>{preset.label}</strong><span>{preset.detail}</span></button>)}
      </div>
      <div className="concept-section-label">OPTIONAL CONCEPT REFERENCE</div>
      <label className={`concept-drop compact ${referenceUrl ? 'has-image' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); loadFile(event.dataTransfer.files?.[0] ?? null) }}>
        {referenceUrl ? <img src={referenceUrl} alt="Concept reference"/> : <div className="concept-drop-empty"><Upload size={21}/><strong>Drop concept here</strong><span>Palette + lineage analysis</span></div>}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => loadFile(event.target.files?.[0] ?? null)}/>
      </label>
      <label className="concept-field"><span>Image lineage hint</span><select value={speciesHint} onChange={(event) => setSpeciesHint(event.target.value as ConceptSpeciesHint)}><option value="auto">Auto detect</option><option value="skeleton">Skeleton</option><option value="zombie">Zombie / corpse</option><option value="bandit">Living humanoid</option></select></label>
      <div className="concept-local-note"><Shield size={14}/><span><strong>Shared DNA foundation</strong> Body proportions, appearance and identity are stored in Blueprint v2 so Skillbound's future player creator can reuse the same system.</span></div>
    </aside>

    <main className="concept-center">
      <header className="concept-toolbar">
        <div><span className="eyebrow">{blueprint.entityKind.toUpperCase()} · {blueprint.role.toUpperCase()}</span><strong>{blueprint.name}</strong></div>
        <div className="concept-toolbar-actions">
          <div className="concept-camera-toggle"><button className={cameraMode === 'studio' ? 'active' : ''} onClick={() => setCameraMode('studio')}><Monitor size={13}/> Studio</button><button className={cameraMode === 'arpg' ? 'active' : ''} onClick={() => setCameraMode('arpg')}><Gamepad2 size={13}/> ARPG</button></div>
          <button onClick={() => setShowRig((value) => !value)}>{showRig ? <EyeOff size={14}/> : <Eye size={14}/>} Rig</button>
          <button className={showHitbox ? 'active-tool' : ''} onClick={() => setShowHitbox((value) => !value)}><Box size={14}/> Hitbox</button>
          <button className="concept-build-compact" disabled={busy} onClick={() => void buildCharacter()}>{busy ? <Loader2 className="spin" size={14}/> : <WandSparkles size={14}/>} Build Blueprint</button>
        </div>
      </header>

      <div className="concept-preview-wrap">
        <CharacterForgePreview conceptMode config={config} animation={animation} playing={playing} showRig={showRig} showHitbox={showHitbox} cameraMode={cameraMode} onStats={setStats}/>
        <div className="concept-preview-badges"><span><Bone size={12}/>{stats.bones} bones</span><span>{stats.skinnedMeshes} skinned parts</span><span>{stats.triangles.toLocaleString()} tris</span><span><Swords size={12}/> external weapon</span></div>
        <div className="cf-animation-bar concept-animation-bar"><button className="cf-play" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>{ANIMATIONS.map((item) => <button className={animation === item ? 'active' : ''} key={item} onClick={() => { setAnimation(item); setPlaying(true) }}>{item}</button>)}</div>
      </div>
      <footer className="concept-status"><Sparkles size={13}/><span>{status}</span></footer>
    </main>

    <aside className="concept-right concept-inspector-v2">
      <div className="concept-inspector-tabs">{TABS.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={13}/><span>{label}</span></button>)}</div>
      <div className="concept-inspector-body">
        {tab === 'identity' && <IdentityEditor blueprint={blueprint} patch={patchBlueprint}/>} 
        {tab === 'body' && <BodyEditor blueprint={blueprint} patch={patchBlueprint}/>} 
        {tab === 'appearance' && <AppearanceEditor blueprint={blueprint} patch={patchBlueprint} recipe={recipe}/>} 
        {tab === 'behavior' && <BehaviorEditor blueprint={blueprint} patch={patchBlueprint}/>} 
        {tab === 'pipeline' && <PipelinePanel stages={stages} validation={validation} analysis={analysis} blueprint={blueprint} busy={busy} onBuild={buildCharacter} onSave={saveToLibrary} onDownload={downloadGlb}/>} 
      </div>
    </aside>
  </div>
}

function IdentityEditor({ blueprint, patch }: { blueprint: ForgeCharacterBlueprint; patch: (patch: Partial<ForgeCharacterBlueprint>) => void }) {
  return <>
    <InspectorTitle title="Identity & purpose" detail="The same identity layer can later drive enemies, NPCs and player characters."/>
    <Field label="Name"><input value={blueprint.name} onChange={(event) => patch({ name: event.target.value })}/></Field>
    <div className="concept-field-grid"><Field label="Entity kind"><select value={blueprint.entityKind} onChange={(event) => patch({ entityKind: event.target.value as ForgeCharacterEntityKind })}><option value="enemy">Enemy</option><option value="creature">Creature</option><option value="npc">NPC</option><option value="player">Player-compatible</option></select></Field><Field label="Base lineage"><select value={blueprint.lineage} onChange={(event) => patch({ lineage: event.target.value as ForgeCharacterBlueprint['lineage'] })}><option value="skeleton">Skeleton</option><option value="zombie">Zombie / corpse</option><option value="bandit">Living humanoid</option></select></Field></div>
    <div className="concept-field-grid"><Field label="Role"><select value={blueprint.role} onChange={(event) => patch({ role: event.target.value as ForgeCharacterRole })}><option value="melee">Melee</option><option value="ranged">Ranged</option><option value="caster">Caster</option><option value="tank">Tank / brute</option><option value="civilian">Civilian</option><option value="vendor">Vendor</option><option value="quest">Quest NPC</option></select></Field><Field label="Faction"><select value={blueprint.faction} onChange={(event) => patch({ faction: event.target.value as ForgeCharacterFaction })}><option value="undead">Undead</option><option value="bandits">Bandits</option><option value="cult">Cult</option><option value="town">Town</option><option value="wild">Wild</option><option value="neutral">Neutral</option></select></Field></div>
    <Field label="Level"><input type="number" min="1" max="100" value={blueprint.level} onChange={(event) => patch({ level: clampNumber(event.target.value, 1, 100) })}/></Field>
    <div className="concept-info-card"><UserRound size={15}/><div><strong>Future Skillbound Character Creator</strong><span>Blueprint v2 deliberately separates identity, body and appearance from gameplay equipment. A player creator can reuse these same body controls later.</span></div></div>
  </>
}

function BodyEditor({ blueprint, patch }: { blueprint: ForgeCharacterBlueprint; patch: (patch: Partial<ForgeCharacterBlueprint>) => void }) {
  const setBody = (key: keyof ForgeCharacterBlueprint['body'], value: number) => patch({ body: { ...blueprint.body, [key]: value } })
  return <>
    <InspectorTitle title="Body DNA" detail="All sliders rebuild the live rigged preview immediately."/>
    <Slider label="Height" value={blueprint.body.height} min={0.8} max={1.28} step={0.01} onChange={(value) => setBody('height', value)}/>
    <Slider label="Bulk" value={blueprint.body.bulk} min={0.7} max={1.55} step={0.01} onChange={(value) => setBody('bulk', value)}/>
    <Slider label="Shoulders" value={blueprint.body.shoulders} min={0.78} max={1.4} step={0.01} onChange={(value) => setBody('shoulders', value)}/>
    <Slider label="Head scale" value={blueprint.body.headScale} min={0.78} max={1.3} step={0.01} onChange={(value) => setBody('headScale', value)}/>
    <Slider label="Arm length" value={blueprint.body.armLength} min={0.82} max={1.22} step={0.01} onChange={(value) => setBody('armLength', value)}/>
    <Slider label="Leg length" value={blueprint.body.legLength} min={0.82} max={1.22} step={0.01} onChange={(value) => setBody('legLength', value)}/>
    <Slider label="Asymmetry" value={blueprint.body.asymmetry} min={0} max={0.6} step={0.01} onChange={(value) => setBody('asymmetry', value)}/>
  </>
}

function AppearanceEditor({ blueprint, patch, recipe }: { blueprint: ForgeCharacterBlueprint; patch: (patch: Partial<ForgeCharacterBlueprint>) => void; recipe: string[] }) {
  const setAppearance = <K extends keyof ForgeCharacterBlueprint['appearance']>(key: K, value: ForgeCharacterBlueprint['appearance'][K]) => patch({ appearance: { ...blueprint.appearance, [key]: value } })
  return <>
    <InspectorTitle title="Appearance" detail="Author the body look here. Runtime weapons are intentionally owned by Item Forge."/>
    <div className="concept-field-grid"><Field label="Armor shell"><select value={blueprint.appearance.armor} onChange={(event) => setAppearance('armor', event.target.value as ForgeCharacterBlueprint['appearance']['armor'])}><option value="none">None</option><option value="scrap">Scrap / light</option><option value="heavy">Heavy</option></select></Field><Field label="Headwear"><select value={blueprint.appearance.headwear} onChange={(event) => setAppearance('headwear', event.target.value as ForgeCharacterBlueprint['appearance']['headwear'])}><option value="none">None</option><option value="hood">Hood</option><option value="helmet">Helmet</option></select></Field></div>
    <ColorField label={blueprint.lineage === 'skeleton' ? 'Bone / body' : 'Body / skin'} value={blueprint.appearance.primary} onChange={(value) => setAppearance('primary', value)}/>
    <ColorField label="Cloth / secondary" value={blueprint.appearance.secondary} onChange={(value) => setAppearance('secondary', value)}/>
    <ColorField label="Accent / leather" value={blueprint.appearance.accent} onChange={(value) => setAppearance('accent', value)}/>
    <div className="concept-summary compact-summary"><h3>Generated modules</h3><div className="concept-recipe">{recipe.map((item) => <span key={item}>{item}</span>)}</div></div>
    <div className="concept-info-card weaponless"><Swords size={15}/><div><strong>Weaponless character export</strong><span>Concept Forge no longer bakes a sword into the skeleton. Item Forge + Action Bindings attach the actual equipped weapon to the hand socket.</span></div></div>
  </>
}

function BehaviorEditor({ blueprint, patch }: { blueprint: ForgeCharacterBlueprint; patch: (patch: Partial<ForgeCharacterBlueprint>) => void }) {
  const setCombat = <K extends keyof ForgeCharacterBlueprint['combat']>(key: K, value: ForgeCharacterBlueprint['combat'][K]) => patch({ combat: { ...blueprint.combat, [key]: value } })
  const setNpc = <K extends keyof ForgeCharacterBlueprint['npc']>(key: K, value: ForgeCharacterBlueprint['npc'][K]) => patch({ npc: { ...blueprint.npc, [key]: value } })
  return <>
    <InspectorTitle title="Gameplay intent" detail="This metadata describes how the character should be used; Action Bindings owns the exact clips."/>
    <Field label="Combat / weapon profile"><select value={blueprint.combat.weaponProfile} onChange={(event) => setCombat('weaponProfile', event.target.value as ForgeWeaponAnimationProfile)}>{FORGE_WEAPON_ANIMATION_PROFILES.map((profile) => <option value={profile.id} key={profile.id}>{profile.label}</option>)}</select></Field>
    <Field label="Temperament"><select value={blueprint.combat.temperament} onChange={(event) => setCombat('temperament', event.target.value as ForgeCharacterTemperament)}><option value="passive">Passive</option><option value="defensive">Defensive</option><option value="aggressive">Aggressive</option><option value="fearless">Fearless</option></select></Field>
    <Slider label="Aggression" value={blueprint.combat.aggression} min={0} max={1} step={0.01} onChange={(value) => setCombat('aggression', value)}/>
    <Slider label="Preferred range" value={blueprint.combat.preferredRange} min={0} max={12} step={0.1} suffix="m" onChange={(value) => setCombat('preferredRange', value)}/>
    {(blueprint.entityKind === 'npc' || blueprint.entityKind === 'player') && <><div className="concept-subheading">NPC / SOCIAL</div><Field label="Occupation"><input value={blueprint.npc.occupation} placeholder="Blacksmith, guard, villager…" onChange={(event) => setNpc('occupation', event.target.value)}/></Field><Field label="Dialogue tone"><select value={blueprint.npc.dialogueStyle} onChange={(event) => setNpc('dialogueStyle', event.target.value as ForgeCharacterBlueprint['npc']['dialogueStyle'])}><option value="none">None</option><option value="brief">Brief</option><option value="friendly">Friendly</option><option value="grim">Grim</option><option value="mysterious">Mysterious</option></select></Field><label className="concept-check-row"><input type="checkbox" checked={blueprint.npc.important} onChange={(event) => setNpc('important', event.target.checked)}/><span>Important / named NPC</span></label></>}
    <Field label="Tags"><input value={blueprint.tags.join(', ')} onChange={(event) => patch({ tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="undead, elite, caster"/></Field>
  </>
}

function PipelinePanel({ stages, validation, analysis, blueprint, busy, onBuild, onSave, onDownload }: { stages: Record<StageId, StageState>; validation: ConceptValidation | null; analysis: ConceptAnalysis | null; blueprint: ForgeCharacterBlueprint; busy: boolean; onBuild: () => Promise<void>; onSave: () => Promise<void>; onDownload: () => Promise<void> }) {
  return <>
    <InspectorTitle title="Build & validation" detail="Generate the rigged model only after the editable blueprint looks right."/>
    <button className="concept-build-button" disabled={busy} onClick={() => void onBuild()}>{busy ? <Loader2 className="spin" size={16}/> : <WandSparkles size={16}/>} {busy ? 'Building…' : 'Build / Validate Blueprint'}</button>
    <div className="concept-stages">{STAGES.map((stage) => <div className={`concept-stage ${stages[stage.id]}`} key={stage.id}><StageIcon state={stages[stage.id]}/><div><strong>{stage.label}</strong><span>{stage.detail}</span></div></div>)}</div>
    <section className="concept-summary"><h3><Bone size={13}/> Runtime checks</h3><Check label="ForgeHumanoidV1 rig" ok={Boolean(validation?.bones && validation.bones >= 18)}/><Check label="Skinned geometry" ok={Boolean(validation?.skinnedMeshes)}/><Check label="Idle / Walk / Attack / Death" ok={Boolean(validation)}/><Check label="External Item Forge weapon policy" ok={Boolean(validation)}/>{validation && <div className="concept-runtime-meta"><span>{validation.bones} bones</span><span>{validation.skinnedMeshes} parts</span><span>{validation.triangles.toLocaleString()} tris</span></div>}</section>
    <section className="concept-summary"><h3>Blueprint metadata</h3><div className="concept-runtime-meta"><span>{blueprint.entityKind}</span><span>{blueprint.role}</span><span>{blueprint.faction}</span><span>Lv {blueprint.level}</span><span>{blueprint.combat.weaponProfile}</span></div>{analysis && <p className="concept-mini-copy">Concept analysis confidence: {Math.round(analysis.confidence * 100)}%</p>}</section>
    <div className="concept-export"><button disabled={!validation || busy} onClick={() => void onSave()}><Library size={14}/> Save GLB + editable blueprint</button><button className="primary" disabled={!validation || busy} onClick={() => void onDownload()}><Download size={14}/> Export weaponless GLB</button></div>
  </>
}

function InspectorTitle({ title, detail }: { title: string; detail: string }) { return <div className="concept-inspector-title"><strong>{title}</strong><span>{detail}</span></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="concept-editor-field"><span>{label}</span>{children}</label> }
function Slider({ label, value, min, max, step, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) { return <label className="concept-slider"><div><span>{label}</span><b>{value.toFixed(step < 0.1 ? 2 : 1)}{suffix}</b></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="concept-color-field"><span>{label}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)}/><input value={value} onChange={(event) => onChange(event.target.value)}/></div></label> }
function StageIcon({ state }: { state: StageState }) { if (state === 'working') return <Loader2 className="spin" size={15}/>; if (state === 'done') return <CheckCircle2 size={15}/>; return <Circle size={15}/> }
function Check({ label, ok }: { label: string; ok: boolean }) { return <div className={`concept-check ${ok ? 'ok' : ''}`}>{ok ? <CheckCircle2 size={13}/> : <Circle size={13}/>}<span>{label}</span></div> }
function stageMap(value: StageState): Record<StageId, StageState> { return { reference: value, analyze: value, assemble: value, rig: value, materials: value, validate: value } }
function frame() { return new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge-character' }
function clampNumber(value: string, min: number, max: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min }
