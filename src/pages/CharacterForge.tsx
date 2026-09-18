import { useMemo, useState } from 'react'
import {
  Bone, Box, Download, Eye, EyeOff, Library, Pause, Play, RefreshCw, Save,
  Sparkles, Swords, UserRound, WandSparkles,
} from 'lucide-react'
import CharacterForgePreview from '../components/CharacterForgePreview'
import {
  CLASS_DEFINITIONS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  createDefaultIdentity,
  identityToForgeConfig,
  randomizeIdentity,
  type CharacterIdentityRecipe,
  type FacePreset,
  type FacialHairStyle,
  type HairStyle,
  type SkillboundClass,
} from '../lib/characterCreator'
import { saveAsset } from '../lib/library'
import '../character-forge.css'

const PRESET_KEY = 'forge-character-creator-identities-v1'
const animations = ['Idle', 'Walk', 'Attack', 'Death']

type SavedIdentity = { id: string; recipe: CharacterIdentityRecipe }

const HAIR_STYLES: Array<[HairStyle, string]> = [
  ['none', 'None'],
  ['cropped', 'Cropped'],
  ['swept', 'Swept'],
  ['undercut', 'Undercut'],
  ['long', 'Long'],
  ['tied', 'Tied back'],
]

const BEARD_STYLES: Array<[FacialHairStyle, string]> = [
  ['none', 'None'],
  ['stubble', 'Stubble'],
  ['short', 'Short beard'],
  ['full', 'Full beard'],
]

const FACE_PRESETS: Array<[FacePreset, string]> = [
  ['balanced', 'Balanced'],
  ['angular', 'Angular'],
  ['narrow', 'Narrow'],
  ['broad', 'Broad'],
]

export default function CharacterForge() {
  const [identity, setIdentity] = useState<CharacterIdentityRecipe>(() => createDefaultIdentity('duskstrider'))
  const [animation, setAnimation] = useState('Idle')
  const [playing, setPlaying] = useState(true)
  const [showRig, setShowRig] = useState(false)
  const [showHitbox, setShowHitbox] = useState(false)
  const [stats, setStats] = useState({ bones: 0, skinnedMeshes: 0, triangles: 0 })
  const [status, setStatus] = useState('Create the player identity here. Armor, clothing and weapons stay in the separate equipment system.')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<SavedIdentity[]>(() => readPresets())
  const [savedId, setSavedId] = useState('')

  const config = useMemo(() => identityToForgeConfig(identity), [identity])
  const classDefinition = CLASS_DEFINITIONS[identity.classId]

  const patchAppearance = <K extends keyof CharacterIdentityRecipe['appearance']>(
    key: K,
    value: CharacterIdentityRecipe['appearance'][K],
  ) => setIdentity((current) => ({
    ...current,
    appearance: { ...current.appearance, [key]: value },
  }))

  const patchBody = <K extends keyof CharacterIdentityRecipe['body']>(
    key: K,
    value: CharacterIdentityRecipe['body'][K],
  ) => setIdentity((current) => ({
    ...current,
    body: { ...current.body, [key]: value },
  }))

  const chooseClass = (classId: SkillboundClass) => {
    setIdentity((current) => {
      const previousDefault = CLASS_DEFINITIONS[current.classId].name
      const nextDefinition = CLASS_DEFINITIONS[classId]
      return {
        ...current,
        classId,
        seed: Math.floor(Math.random() * 1_000_000),
        name: current.name === previousDefault ? nextDefinition.name : current.name,
        body: { ...nextDefinition.bodyDefaults },
      }
    })
    setAnimation('Idle')
    setStatus(CLASS_DEFINITIONS[classId].name + ' selected. Its starter equipment is assigned separately when the character enters the game.')
  }

  const randomize = () => {
    setIdentity((current) => randomizeIdentity(current))
    setStatus('Appearance randomized. Equipment and starting loadout were not changed.')
  }

  const savePreset = () => {
    const item: SavedIdentity = {
      id: crypto.randomUUID(),
      recipe: structuredClone(identity),
    }
    const next = [item, ...saved].slice(0, 30)
    setSaved(next)
    setSavedId(item.id)
    localStorage.setItem(PRESET_KEY, JSON.stringify(next))
    setStatus(identity.name + ' identity saved in this browser.')
  }

  const loadPreset = () => {
    const item = saved.find((entry) => entry.id === savedId)
    if (!item) return
    setIdentity(structuredClone(item.recipe))
    setStatus(item.recipe.name + ' restored.')
  }

  const saveToLibrary = async () => {
    setBusy(true)
    try {
      const blob = recipeBlob(identity)
      await saveAsset({
        name: identity.name,
        category: 'characters',
        kind: 'file',
        mime: 'application/x-skillbound-character-identity+json',
        tags: ['character-creator', 'identity', identity.classId, 'equipment-independent'],
        source: 'Forge Character Creator',
        blob,
      })
      setStatus(identity.name + ' identity recipe saved to the Shared Asset Library.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the character identity.')
    } finally {
      setBusy(false)
    }
  }

  const downloadRecipe = () => {
    const blob = recipeBlob(identity)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = slug(identity.name) + '.character.json'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus(identity.name + ' identity recipe downloaded. It contains no equipped armor or weapons.')
  }

  return <div className="character-forge character-creator-v1">
    <aside className="character-forge-left">
      <div className="cf-panel-title"><UserRound size={16}/><span>CHOOSE CLASS</span></div>
      <div className="cf-template-list">
        {(Object.keys(CLASS_DEFINITIONS) as SkillboundClass[]).map((classId) => {
          const info = CLASS_DEFINITIONS[classId]
          return <button
            key={classId}
            className={identity.classId === classId ? 'active' : ''}
            onClick={() => chooseClass(classId)}
          >
            <span className="cf-template-icon">{classId === 'duskstrider' ? <Swords size={20}/> : classId === 'thornwarden' ? <UserRound size={20}/> : <Sparkles size={20}/>}</span>
            <span><strong>{info.name}</strong><em>{info.subtitle} · {info.description}</em></span>
          </button>
        })}
      </div>

      <div className="cf-section">
        <span className="cf-label">SAVED CHARACTERS</span>
        <div className="cf-preset-row">
          <select value={savedId} onChange={(event) => setSavedId(event.target.value)}>
            <option value="">Choose identity…</option>
            {saved.map((item) => <option value={item.id} key={item.id}>{item.recipe.name} · {CLASS_DEFINITIONS[item.recipe.classId].name}</option>)}
          </select>
          <button disabled={!savedId} onClick={loadPreset}>Load</button>
        </div>
        <button className="cf-wide-button" onClick={savePreset}><Save size={13}/> Save current identity</button>
      </div>

      <div className="cf-section cf-info-card">
        <Bone size={16}/>
        <div>
          <strong>Identity and equipment are separate</strong>
          <span>This creator stores class, face, hair, colors and body features only. Armor, clothing and weapons are equipped by the game/equipment system.</span>
        </div>
      </div>
    </aside>

    <main className="character-forge-center">
      <header className="cf-toolbar">
        <div><span className="eyebrow">SKILLBOUND CHARACTER CREATOR</span><strong>{identity.name} · {classDefinition.name}</strong></div>
        <div className="cf-toolbar-actions">
          <button onClick={randomize}><RefreshCw size={14}/> Randomize</button>
          <button onClick={() => setShowRig((value) => !value)}>{showRig ? <EyeOff size={14}/> : <Eye size={14}/>} Rig</button>
          <button onClick={() => setShowHitbox((value) => !value)}><Box size={14}/> Hitbox</button>
        </div>
      </header>
      <div className="cf-preview-wrap">
        <CharacterForgePreview
          config={config}
          identity={identity}
          animation={animation}
          playing={playing}
          showRig={showRig}
          showHitbox={showHitbox}
          onStats={setStats}
        />
        <div className="cf-preview-badges">
          <span><Bone size={12}/>{stats.bones} bones</span>
          <span>{stats.triangles.toLocaleString()} tris</span>
          <span>identity only</span>
        </div>
        <div className="cf-animation-bar">
          <button className="cf-play" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
          {animations.map((item) => <button
            className={animation === item ? 'active' : ''}
            key={item}
            onClick={() => { setAnimation(item); setPlaying(true) }}
          >{item}</button>)}
        </div>
      </div>
      <footer className="cf-status"><Sparkles size={13}/><span>{status}</span></footer>
    </main>

    <aside className="character-forge-right">
      <div className="cf-panel-title"><WandSparkles size={16}/><span>CHARACTER IDENTITY</span></div>
      <label className="cf-field"><span>Name</span><input value={identity.name} onChange={(event) => setIdentity((current) => ({ ...current, name: event.target.value }))}/></label>

      <div className="cf-inspector-section">
        <span className="cf-label">FACE & HAIR</span>
        <label className="cf-field">
          <span>Face shape</span>
          <select value={identity.appearance.facePreset} onChange={(event) => patchAppearance('facePreset', event.target.value as FacePreset)}>
            {FACE_PRESETS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="cf-field">
          <span>Hair style</span>
          <select value={identity.appearance.hairStyle} onChange={(event) => patchAppearance('hairStyle', event.target.value as HairStyle)}>
            {HAIR_STYLES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="cf-field">
          <span>Facial hair</span>
          <select value={identity.appearance.facialHairStyle} onChange={(event) => patchAppearance('facialHairStyle', event.target.value as FacialHairStyle)}>
            {BEARD_STYLES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <Swatches label="Skin" values={SKIN_TONES} value={identity.appearance.skinTone} onChange={(value) => patchAppearance('skinTone', value)}/>
        <Swatches label="Hair" values={HAIR_COLORS} value={identity.appearance.hairColor} onChange={(value) => {
          patchAppearance('hairColor', value)
          patchAppearance('facialHairColor', value)
        }}/>
        <Swatches label="Eyes" values={EYE_COLORS} value={identity.appearance.eyeColor} onChange={(value) => patchAppearance('eyeColor', value)}/>
      </div>

      <div className="cf-inspector-section">
        <span className="cf-label">BODY FEATURES</span>
        <div className="cf-slider-group cf-slider-group-compact">
          <Slider label="Height" value={identity.body.height} min={.9} max={1.08} step={.01} onChange={(value) => patchBody('height', value)}/>
          <Slider label="Build" value={identity.body.build} min={.86} max={1.08} step={.01} onChange={(value) => patchBody('build', value)}/>
          <Slider label="Shoulders" value={identity.body.shoulders} min={.9} max={1.08} step={.01} onChange={(value) => patchBody('shoulders', value)}/>
          <Slider label="Chest" value={identity.body.chest} min={.9} max={1.08} step={.01} onChange={(value) => patchBody('chest', value)}/>
          <Slider label="Waist" value={identity.body.waist} min={.88} max={1.08} step={.01} onChange={(value) => patchBody('waist', value)}/>
          <Slider label="Hips" value={identity.body.hips} min={.9} max={1.08} step={.01} onChange={(value) => patchBody('hips', value)}/>
          <Slider label="Head size" value={identity.body.headScale} min={.94} max={1.06} step={.01} onChange={(value) => patchBody('headScale', value)}/>
          <Slider label="Arm length" value={identity.body.armLength} min={.92} max={1.04} step={.01} onChange={(value) => patchBody('armLength', value)}/>
          <Slider label="Leg length" value={identity.body.legLength} min={.94} max={1.07} step={.01} onChange={(value) => patchBody('legLength', value)}/>
        </div>
      </div>

      <div className="cf-inspector-section">
        <span className="cf-label">STARTING LOADOUT · READ ONLY</span>
        <div className="cf-loadout-list">
          {classDefinition.startingLoadout.map((item) => <div className="cf-loadout-item" key={item.id}>
            <span>{loadoutSlotLabel(item.slot)}</span><strong>{item.label}</strong>
          </div>)}
        </div>
        <p className="cf-equipment-note">This is spawn equipment, not part of the character identity. It will be replaceable by normal loot and equipment in-game.</p>
      </div>

      <div className="cf-export">
        <button className="cf-library-button" disabled={busy} onClick={() => void saveToLibrary()}><Library size={14}/>{busy ? 'Saving…' : 'Save identity to Library'}</button>
        <button className="cf-export-button" onClick={downloadRecipe}><Download size={14}/>Download character recipe</button>
        <small>Recipe contains class + body/appearance choices only. Equipment uses separate item IDs and slots.</small>
      </div>
    </aside>
  </div>
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return <label className="cf-slider">
    <span><b>{label}</b><em>{value.toFixed(2)}</em></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/>
  </label>
}

function Swatches({ label, values, value, onChange }: {
  label: string
  values: readonly string[]
  value: string
  onChange: (value: string) => void
}) {
  return <div className="cf-swatches">
    <span>{label}</span>
    <div>{values.map((color) => <button
      key={color}
      type="button"
      className={color.toLowerCase() === value.toLowerCase() ? 'active' : ''}
      style={{ background: color }}
      title={color}
      onClick={() => onChange(color)}
    />)}<input type="color" value={value} title={'Custom ' + label.toLowerCase() + ' color'} onChange={(event) => onChange(event.target.value)}/></div>
  </div>
}

function recipeBlob(identity: CharacterIdentityRecipe) {
  return new Blob([JSON.stringify(identity, null, 2)], { type: 'application/x-skillbound-character-identity+json' })
}

function loadoutSlotLabel(slot: string) {
  if (slot === 'mainHand') return 'Weapon'
  if (slot === 'offHand') return 'Off hand'
  return slot.charAt(0).toUpperCase() + slot.slice(1)
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skillbound-character'
}

function readPresets(): SavedIdentity[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
