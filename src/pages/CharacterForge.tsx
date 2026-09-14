import { useMemo, useState } from 'react'
import { Bone, Box, Download, Eye, EyeOff, Library, Pause, Play, RefreshCw, Save, Shield, Skull, Sparkles, Swords, UserRound, WandSparkles } from 'lucide-react'
import CharacterForgePreview from '../components/CharacterForgePreview'
import { cloneForgeCharacterConfig, exportProceduralCharacterGlb, type ForgeCharacterConfig, type ForgeCharacterSpecies } from '../lib/proceduralCharacter'
import { saveAsset } from '../lib/library'
import '../character-forge.css'

const PRESET_KEY = 'forge-character-forge-presets-v1'
const animations = ['Idle', 'Walk', 'Attack', 'Death']

type SavedPreset = { id: string; config: ForgeCharacterConfig }

export default function CharacterForge() {
  const [config, setConfig] = useState<ForgeCharacterConfig>(() => cloneForgeCharacterConfig('skeleton'))
  const [animation, setAnimation] = useState('Idle')
  const [playing, setPlaying] = useState(true)
  const [showRig, setShowRig] = useState(false)
  const [showHitbox, setShowHitbox] = useState(false)
  const [stats, setStats] = useState({ bones: 0, skinnedMeshes: 0, triangles: 0 })
  const [status, setStatus] = useState('Choose a template, shape it, preview animation, then export a rigged GLB.')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<SavedPreset[]>(() => readPresets())
  const [savedId, setSavedId] = useState('')

  const speciesInfo = useMemo(() => ({
    skeleton: ['Skeleton', 'Exposed bones, crypt armor and readable joints.'],
    zombie: ['Zombie', 'Chunky undead silhouette with torn clothing and asymmetry.'],
    bandit: ['Bandit', 'Reusable humanoid enemy with clothing and equipment.'],
  } as const), [])

  const patch = <K extends keyof ForgeCharacterConfig>(key: K, value: ForgeCharacterConfig[K]) => setConfig((current) => ({ ...current, [key]: value }))
  const chooseSpecies = (species: ForgeCharacterSpecies) => { setConfig(cloneForgeCharacterConfig(species)); setAnimation('Idle'); setStatus(`${speciesInfo[species][0]} template loaded.`) }

  const randomize = () => {
    setConfig((current) => ({
      ...current,
      height: round(0.9 + Math.random() * 0.2), bulk: round(0.82 + Math.random() * 0.38), shoulders: round(0.9 + Math.random() * 0.2),
      headScale: round(0.9 + Math.random() * 0.16), armLength: round(0.94 + Math.random() * 0.12), legLength: round(0.94 + Math.random() * 0.12),
      asymmetry: round(current.species === 'zombie' ? 0.18 + Math.random() * 0.35 : Math.random() * 0.16),
    }))
    setStatus('Variant randomized while keeping the same rig and animation compatibility.')
  }

  const savePreset = () => {
    const item = { id: crypto.randomUUID(), config: { ...config } }
    const next = [item, ...saved].slice(0, 24); setSaved(next); setSavedId(item.id); localStorage.setItem(PRESET_KEY, JSON.stringify(next)); setStatus(`${config.name} preset saved in this browser.`)
  }
  const loadPreset = () => { const item = saved.find((entry) => entry.id === savedId); if (!item) return; setConfig({ ...item.config }); setStatus(`${item.config.name} restored.`) }

  const makeGlb = async () => {
    setBusy(true); setStatus('Building skinned meshes, shared rig and animation clips…')
    try { return await exportProceduralCharacterGlb(config) }
    finally { setBusy(false) }
  }
  const downloadGlb = async () => {
    try {
      const blob = await makeGlb(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${slug(config.name)}.glb`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(`${config.name}.glb exported with ForgeHumanoidV1 rig and four animation clips.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'GLB export failed.') }
  }
  const saveToLibrary = async () => {
    try {
      const blob = await makeGlb(); await saveAsset({ name: config.name, category: 'characters', kind: 'glb', mime: 'model/gltf-binary', tags: ['character-forge', config.species, 'rigged', 'ForgeHumanoidV1'], source: 'Forge Character Forge', blob }); setStatus(`${config.name} saved to Shared Asset Library as a rigged GLB.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the GLB.') }
  }

  return <div className="character-forge">
    <aside className="character-forge-left">
      <div className="cf-panel-title"><Skull size={16}/><span>BASE CREATURE</span></div>
      <div className="cf-template-list">
        {(Object.keys(speciesInfo) as ForgeCharacterSpecies[]).map((species) => <button key={species} className={config.species === species ? 'active' : ''} onClick={() => chooseSpecies(species)}>
          <span className="cf-template-icon">{species === 'skeleton' ? <Skull size={20}/> : species === 'zombie' ? <UserRound size={20}/> : <Swords size={20}/>}</span>
          <span><strong>{speciesInfo[species][0]}</strong><em>{speciesInfo[species][1]}</em></span>
        </button>)}
      </div>

      <div className="cf-section"><span className="cf-label">SAVED PRESETS</span><div className="cf-preset-row"><select value={savedId} onChange={(event) => setSavedId(event.target.value)}><option value="">Choose preset…</option>{saved.map((item) => <option value={item.id} key={item.id}>{item.config.name}</option>)}</select><button disabled={!savedId} onClick={loadPreset}>Load</button></div><button className="cf-wide-button" onClick={savePreset}><Save size={13}/> Save current preset</button></div>

      <div className="cf-section cf-info-card"><Bone size={16}/><div><strong>ForgeHumanoidV1</strong><span>All three templates share the same named bone hierarchy, so the same animation set can be reused in-game.</span></div></div>
    </aside>

    <main className="character-forge-center">
      <header className="cf-toolbar"><div><span className="eyebrow">CHARACTER FORGE</span><strong>{config.name}</strong></div><div className="cf-toolbar-actions"><button onClick={randomize}><RefreshCw size={14}/> Randomize</button><button onClick={() => setShowRig((value) => !value)}>{showRig ? <EyeOff size={14}/> : <Eye size={14}/>} Rig</button><button onClick={() => setShowHitbox((value) => !value)}><Box size={14}/> Hitbox</button></div></header>
      <div className="cf-preview-wrap">
        <CharacterForgePreview config={config} animation={animation} playing={playing} showRig={showRig} showHitbox={showHitbox} onStats={setStats}/>
        <div className="cf-preview-badges"><span><Bone size={12}/>{stats.bones} bones</span><span>{stats.skinnedMeshes} skinned parts</span><span>{stats.triangles.toLocaleString()} tris</span></div>
        <div className="cf-animation-bar"><button className="cf-play" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>{animations.map((item) => <button className={animation === item ? 'active' : ''} key={item} onClick={() => { setAnimation(item); setPlaying(true) }}>{item}</button>)}</div>
      </div>
      <footer className="cf-status"><Sparkles size={13}/><span>{status}</span></footer>
    </main>

    <aside className="character-forge-right">
      <div className="cf-panel-title"><WandSparkles size={16}/><span>CHARACTER BUILD</span></div>
      <label className="cf-field"><span>Name</span><input value={config.name} onChange={(event) => patch('name', event.target.value)}/></label>
      <div className="cf-slider-group">
        <Slider label="Height" value={config.height} min={0.85} max={1.18} step={0.01} onChange={(value) => patch('height', value)}/>
        <Slider label="Body bulk" value={config.bulk} min={0.75} max={1.35} step={0.01} onChange={(value) => patch('bulk', value)}/>
        <Slider label="Shoulders" value={config.shoulders} min={0.82} max={1.22} step={0.01} onChange={(value) => patch('shoulders', value)}/>
        <Slider label="Head size" value={config.headScale} min={0.82} max={1.2} step={0.01} onChange={(value) => patch('headScale', value)}/>
        <Slider label="Arm length" value={config.armLength} min={0.88} max={1.14} step={0.01} onChange={(value) => patch('armLength', value)}/>
        <Slider label="Leg length" value={config.legLength} min={0.9} max={1.12} step={0.01} onChange={(value) => patch('legLength', value)}/>
        <Slider label="Asymmetry" value={config.asymmetry} min={0} max={0.55} step={0.01} onChange={(value) => patch('asymmetry', value)}/>
      </div>

      <div className="cf-inspector-section"><span className="cf-label"><Shield size={12}/> GEAR</span><label className="cf-field"><span>Armor</span><select value={config.armor} onChange={(event) => patch('armor', event.target.value as ForgeCharacterConfig['armor'])}><option value="none">None</option><option value="scrap">Scrap armor</option><option value="heavy">Heavy armor</option></select></label><label className="cf-field"><span>Headwear</span><select value={config.headwear} onChange={(event) => patch('headwear', event.target.value as ForgeCharacterConfig['headwear'])}><option value="none">None</option><option value="hood">Hood</option><option value="helmet">Helmet</option></select></label><label className="cf-field"><span>Weapon</span><select value={config.weapon} onChange={(event) => patch('weapon', event.target.value as ForgeCharacterConfig['weapon'])}><option value="none">None</option><option value="sword">Sword</option><option value="axe">Axe</option><option value="mace">Mace</option></select></label></div>

      <div className="cf-inspector-section"><span className="cf-label">MATERIAL PALETTE</span><ColorField label={config.species === 'skeleton' ? 'Bone' : 'Skin'} value={config.primary} onChange={(value) => patch('primary', value)}/><ColorField label="Cloth" value={config.secondary} onChange={(value) => patch('secondary', value)}/><ColorField label="Accent" value={config.accent} onChange={(value) => patch('accent', value)}/></div>

      <div className="cf-export"><button className="cf-library-button" disabled={busy} onClick={() => void saveToLibrary()}><Library size={14}/>{busy ? 'Building…' : 'Save GLB to Library'}</button><button className="cf-export-button" disabled={busy} onClick={() => void downloadGlb()}><Download size={14}/>{busy ? 'Building…' : 'Export rigged GLB'}</button><small>Includes skin weights, ForgeHumanoidV1 bones, Idle / Walk / Attack / Death clips and socket metadata.</small></div>
    </aside>
  </div>
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) { return <label className="cf-slider"><span><b>{label}</b><em>{value.toFixed(2)}</em></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="cf-color"><span>{label}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)}/><input value={value} onChange={(event) => /^#[0-9a-f]{6}$/i.test(event.target.value) && onChange(event.target.value)}/></div></label> }
function round(value: number) { return Math.round(value * 100) / 100 }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge-character' }
function readPresets(): SavedPreset[] { try { const parsed = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] } }
