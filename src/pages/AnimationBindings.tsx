import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Activity, CheckCircle2, Link2, Loader2, Pause, Play, RotateCcw, Save, Sparkles, Swords } from 'lucide-react'
import AnimationPreview, { type AnimationPreviewAttachment } from '../components/AnimationPreview'
import {
  FORGE_ANIMATION_ACTIONS,
  animationBindingAssetId,
  animationSetBlob,
  createAnimationSet,
  normalizeAnimationSet,
  parseAnimationSet,
  type ForgeAnimationActionId,
  type ForgeAnimationSet,
} from '../engine/animationBindings'
import { FORGE_WEAPON_ANIMATION_PROFILES, type ForgeWeaponAnimationProfile } from '../engine/weaponAnimationProfiles'
import { loadSkillboundWorkspace, type ForgeItemDefinition } from '../engine/forgeProject'
import { itemVisual, resolveItemModelAssetId } from '../engine/itemPresentation'
import { characterPackageDataToBlob, parseCharacterPackage } from '../lib/characterPackage'
import { getAsset, listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import '../animation-bindings.css'

type LoadedClip = { clip: THREE.AnimationClip; duration: number }
const GROUPS = ['Movement', 'Combat', 'Reactions', 'Equipment'] as const

export default function AnimationBindings() {
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [weaponItems, setWeaponItems] = useState<ForgeItemDefinition[]>([])
  const [characterId, setCharacterId] = useState('')
  const [animationSourceId, setAnimationSourceId] = useState('embedded')
  const [clips, setClips] = useState<LoadedClip[]>([])
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewAttachment, setPreviewAttachment] = useState<AnimationPreviewAttachment>()
  const [set, setSet] = useState<ForgeAnimationSet>()
  const [selectedAction, setSelectedAction] = useState<ForgeAnimationActionId>('idle')
  const [playing, setPlaying] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Select a character to bind gameplay actions to its animation clips.')

  const characters = useMemo(() => assets.filter((asset) => asset.category === 'characters' && (asset.kind === 'glb' || asset.mime.includes('forge-character'))), [assets])
  const animationAssets = useMemo(() => assets.filter((asset) => asset.category === 'animations' && asset.kind === 'glb'), [assets])
  const character = characters.find((asset) => asset.id === characterId)
  const selectedBinding = set?.actions[selectedAction]
  const selectedClip = clips.find((item) => item.clip.name === selectedBinding?.clip)?.clip
  const previewItem = weaponItems.find((item) => item.id === set?.previewItemId)

  useEffect(() => {
    let cancelled = false
    void Promise.all([listAssets(), loadSkillboundWorkspace()]).then(([items, workspace]) => {
      if (cancelled) return
      setAssets(items)
      setWeaponItems(workspace.gameplay.items.filter((item) => item.slot === 'weapon'))
      const first = items.find((asset) => asset.category === 'characters' && (asset.kind === 'glb' || asset.mime.includes('forge-character')))
      if (first) setCharacterId((current) => current || first.id)
    }).catch(() => setStatus('Could not read the Shared Asset Library or Skillbound workspace.'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!characterId) return
    let cancelled = false
    let nextUrl = ''
    setBusy(true)
    setPlaying(false)
    setClips([])
    setSet(undefined)
    setStatus('Reading rig and animation clips…')
    void (async () => {
      const target = await getAsset(characterId)
      if (!target) throw new Error('The selected character is no longer in the Shared Library.')
      const modelBlob = await characterModelBlob(target)
      const clipAsset = animationSourceId === 'embedded' ? undefined : await getAsset(animationSourceId)
      const clipBlob = clipAsset?.blob ?? modelBlob
      const loadedClips = await loadClips(clipBlob)
      if (!loadedClips.length) throw new Error('This source does not contain animation clips.')
      nextUrl = URL.createObjectURL(modelBlob)
      const bindingAsset = await getAsset(animationBindingAssetId(characterId))
      const existing = bindingAsset ? await parseAnimationSet(bindingAsset.blob, characterId) : undefined
      if (cancelled) { URL.revokeObjectURL(nextUrl); return }
      setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return nextUrl })
      setClips(loadedClips)
      setSet(normalizeAnimationSet(existing, characterId, loadedClips.map((entry) => entry.clip.name)))
      setStatus(existing ? 'Saved action bindings loaded. Runtime will use these mappings.' : 'Clips detected. Forge auto-bound the obvious actions; review and save them.')
      setPlaying(true)
    })().catch((error) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load animation bindings.')
    }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [characterId, animationSourceId])

  useEffect(() => {
    if (!set || set.weaponProfile === 'unarmed' || set.previewItemId || !weaponItems.length) return
    setSet({ ...set, previewItemId: weaponItems[0].id })
  }, [set, weaponItems])

  useEffect(() => {
    let disposed = false
    let objectUrl = ''
    const item = weaponItems.find((candidate) => candidate.id === set?.previewItemId)
    if (!item || set?.weaponProfile === 'unarmed') { setPreviewAttachment(undefined); return }
    const assetId = resolveItemModelAssetId(item, 'equipped')
    if (!assetId) { setPreviewAttachment(undefined); return }
    void getAsset(assetId).then((asset) => {
      if (!asset || disposed) return
      objectUrl = URL.createObjectURL(asset.blob)
      const visual = itemVisual(item)
      setPreviewAttachment({ src: objectUrl, socket: visual.equipped.socket, transform: visual.equipped.transform })
    }).catch(() => setPreviewAttachment(undefined))
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [set?.previewItemId, set?.weaponProfile, weaponItems])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const updateAction = (id: ForgeAnimationActionId, patch: { clip?: string; loop?: boolean; speed?: number }) => {
    if (!set) return
    const definition = FORGE_ANIMATION_ACTIONS.find((item) => item.id === id)
    const current = set.actions[id]
    const clip = patch.clip !== undefined ? patch.clip : current?.clip
    const actions = { ...set.actions }
    if (!clip) delete actions[id]
    else actions[id] = {
      clip,
      loop: patch.loop ?? current?.loop ?? definition?.loop ?? false,
      speed: Math.min(3, Math.max(0.1, patch.speed ?? current?.speed ?? 1)),
    }
    setSet({ ...set, actions })
  }

  const autoBind = () => {
    if (!characterId || !clips.length) return
    const next = createAnimationSet(characterId, clips.map((entry) => entry.clip.name))
    setSet({ ...next, weaponProfile: set?.weaponProfile ?? next.weaponProfile, previewItemId: set?.previewItemId })
    setStatus('Auto Bind refreshed the action map from clip names. Save when it looks right.')
  }

  const save = async () => {
    if (!set || !character) return
    setBusy(true)
    try {
      const mapped = Object.values(set.actions).filter((entry) => entry?.clip).length
      await saveAsset({
        id: animationBindingAssetId(character.id),
        name: `${character.name} Action Bindings`,
        category: 'animations',
        kind: 'file',
        mime: 'application/x-forge-animation-set+json',
        tags: ['animation-bindings', 'ForgeHumanoidV1', set.weaponProfile, character.id],
        source: 'Forge Action Bindings',
        blob: animationSetBlob(set),
      })
      setStatus(`${mapped} gameplay actions saved for ${character.name}. ${set.weaponProfile} is now the authored combat profile.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the animation bindings.')
    } finally { setBusy(false) }
  }

  if (!characters.length) return <div className="animation-bindings-empty"><Link2 size={30}/><span className="eyebrow">ACTION BINDINGS</span><h1>No character assets yet</h1><p>Save the Crypt Skeleton or another rigged character to the Shared Asset Library first. Then Forge can map its clips to gameplay actions.</p></div>

  return <div className="animation-bindings-page">
    <header className="ab-toolbar">
      <div><span className="eyebrow">ANIMATION AUTHORING</span><h1>Action Bindings</h1><p>Bind gameplay actions to clips, choose a combat profile and preview the real Item Forge weapon in the character's hand.</p></div>
      <div className="ab-toolbar-actions"><button onClick={autoBind} disabled={busy || !clips.length}><Sparkles size={15}/> Auto Bind</button><button className="primary" onClick={() => void save()} disabled={busy || !set}>{busy ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Save Bindings</button></div>
    </header>

    <section className="ab-source-bar">
      <label><span>Character / model</span><select value={characterId} onChange={(event) => setCharacterId(event.target.value)}>{characters.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>
      <label><span>Animation source</span><select value={animationSourceId} onChange={(event) => setAnimationSourceId(event.target.value)}><option value="embedded">Embedded clips in character</option>{animationAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>
      <label><span>Combat profile</span><select value={set?.weaponProfile ?? 'one-hand-sword'} disabled={!set} onChange={(event) => set && setSet({ ...set, weaponProfile: event.target.value as ForgeWeaponAnimationProfile, previewItemId: event.target.value === 'unarmed' ? undefined : set.previewItemId })}>{FORGE_WEAPON_ANIMATION_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
      <label><span>Preview weapon</span><select value={set?.previewItemId ?? ''} disabled={!set || set.weaponProfile === 'unarmed'} onChange={(event) => set && setSet({ ...set, previewItemId: event.target.value || undefined })}><option value="">No preview weapon</option>{weaponItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="ab-source-summary"><Activity size={15}/><div><span>Detected</span><strong>{clips.length} clips</strong></div></div>
      <div className="ab-source-summary"><Swords size={15}/><div><span>Preview</span><strong>{set?.weaponProfile === 'unarmed' ? 'Unarmed' : previewItem?.name ?? 'No weapon'}</strong></div></div>
    </section>

    <div className="ab-workspace">
      <section className="ab-preview-panel">
        <header><div><span>GAMEPLAY PREVIEW</span><strong>{FORGE_ANIMATION_ACTIONS.find((item) => item.id === selectedAction)?.label}</strong></div><button className="ab-play" disabled={!selectedClip} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button></header>
        <div className="ab-preview-stage">{previewUrl && selectedClip ? <AnimationPreview src={previewUrl} clip={selectedClip} playing={playing} loop={selectedBinding?.loop ?? false} speed={selectedBinding?.speed ?? 1} attachment={previewAttachment} onEnded={() => setPlaying(false)}/> : <div className="ab-preview-empty"><Play size={24}/><span>Select an action with a bound clip.</span></div>}</div>
        <div className="ab-preview-meta"><span>Action <b>{selectedAction}</b></span><span>Clip <b>{selectedBinding?.clip ?? 'Not bound'}</b></span><span>Weapon <b>{previewItem?.name ?? (set?.weaponProfile === 'unarmed' ? 'Unarmed' : 'None')}</b></span></div>
      </section>

      <section className="ab-editor">
        {GROUPS.map((group) => <div className="ab-group" key={group}><header><span>{group.toUpperCase()}</span><b>{FORGE_ANIMATION_ACTIONS.filter((item) => item.group === group && set?.actions[item.id]?.clip).length}/{FORGE_ANIMATION_ACTIONS.filter((item) => item.group === group).length}</b></header>{FORGE_ANIMATION_ACTIONS.filter((item) => item.group === group).map((definition) => {
          const binding = set?.actions[definition.id]
          const active = selectedAction === definition.id
          return <div className={`ab-row ${active ? 'active' : ''}`} key={definition.id} onClick={() => setSelectedAction(definition.id)}>
            <div className="ab-action-name"><strong>{definition.label}</strong><small>{definition.id}</small></div>
            <select value={binding?.clip ?? ''} onClick={(event) => event.stopPropagation()} onChange={(event) => { updateAction(definition.id, { clip: event.target.value }); setSelectedAction(definition.id); setPlaying(true) }}><option value="">Not bound</option>{clips.map((entry) => <option value={entry.clip.name} key={entry.clip.name}>{entry.clip.name} · {entry.duration.toFixed(2)}s</option>)}</select>
            <label className="ab-loop" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={binding?.loop ?? definition.loop} disabled={!binding?.clip} onChange={(event) => updateAction(definition.id, { loop: event.target.checked })}/><span>Loop</span></label>
            <label className="ab-speed" onClick={(event) => event.stopPropagation()}><span>Speed</span><input type="number" min="0.1" max="3" step="0.05" disabled={!binding?.clip} value={(binding?.speed ?? 1).toFixed(2)} onChange={(event) => updateAction(definition.id, { speed: Number(event.target.value) })}/></label>
            <button className="ab-preview-button" disabled={!binding?.clip} onClick={(event) => { event.stopPropagation(); setSelectedAction(definition.id); setPlaying(true) }}><Play size={13}/> Preview</button>
          </div>
        })}</div>)}
      </section>
    </div>

    <footer className="ab-status"><div>{status.includes('saved') || status.includes('Runtime') ? <CheckCircle2 size={14}/> : <RotateCcw size={14}/>}<span>{status}</span></div><strong>Gameplay action → animation clip · Item Forge weapon → hand socket</strong></footer>
  </div>
}

async function characterModelBlob(asset: LibraryAsset) {
  const pkg = await parseCharacterPackage(asset.blob)
  return pkg ? characterPackageDataToBlob(pkg.base.data) : asset.blob
}

async function loadClips(blob: Blob): Promise<LoadedClip[]> {
  const url = URL.createObjectURL(blob)
  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const result = gltf.animations.map((clip) => ({ clip: clip.clone(), duration: clip.duration }))
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry?.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    return result
  } finally {
    URL.revokeObjectURL(url)
  }
}
