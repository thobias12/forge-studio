import { useEffect, useMemo, useState } from 'react'
import { Bone, Eye, EyeOff, FileUp, PackagePlus, RotateCcw, Save, Shirt, Trash2, UserRoundCog } from 'lucide-react'
import CharacterPreview, { type CharacterPreviewAttachment } from '../components/CharacterPreview'
import {
  CHARACTER_SLOT_BONES,
  CHARACTER_SLOT_LABELS,
  DEFAULT_CHARACTER_TRANSFORM,
  characterPackageBlob,
  characterPackageDataToBlob,
  createCharacterPackage,
  parseCharacterPackage,
  type CharacterSlot,
  type CharacterTransform,
} from '../lib/characterPackage'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import type { HumanoidBoneKey, RigInfo } from '../lib/retarget'
import '../character.css'

type LocalFile = { blob: Blob; filename: string; url: string; assetId?: string }
type Attachment = {
  id: string
  name: string
  slot: CharacterSlot
  targetBone: HumanoidBoneKey
  file: Blob
  filename: string
  url: string
  transform: CharacterTransform
  visible: boolean
}

const slots = Object.keys(CHARACTER_SLOT_LABELS) as CharacterSlot[]

export default function CharacterStudio() {
  const [name, setName] = useState('New Character')
  const [base, setBase] = useState<LocalFile>()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [rigInfo, setRigInfo] = useState<RigInfo>()
  const [showRig, setShowRig] = useState(false)
  const [library, setLibrary] = useState<LibraryAsset[]>([])
  const [libraryId, setLibraryId] = useState('')
  const [presetId, setPresetId] = useState('')
  const [status, setStatus] = useState('Load a rigged GLB to begin assembling a reusable character.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void listAssets().then((items) => setLibrary(items)).catch(() => undefined)
  }, [])

  useEffect(() => () => {
    if (base?.url) URL.revokeObjectURL(base.url)
    for (const item of attachments) URL.revokeObjectURL(item.url)
  }, [])

  const selected = attachments.find((item) => item.id === selectedId)
  const libraryModels = useMemo(() => library.filter((item) => item.kind === 'glb'), [library])
  const equipmentModels = useMemo(
    () => library.filter((item) => item.kind === 'glb' && item.category === 'props' && item.id !== base?.assetId),
    [library, base?.assetId],
  )
  const characterPresets = useMemo(() => library.filter((item) => item.category === 'characters' && item.mime.includes('forge-character')), [library])
  const previewAttachments: CharacterPreviewAttachment[] = attachments.map((item) => ({
    id: item.id,
    url: item.url,
    targetBone: item.targetBone,
    transform: item.transform,
    visible: item.visible,
  }))

  const setBaseBlob = (blob: Blob, filename: string, assetId?: string) => {
    if (base?.url) URL.revokeObjectURL(base.url)
    const url = URL.createObjectURL(blob)
    setBase({ blob, filename, url, assetId })
    setRigInfo(undefined)
    setStatus(`Loaded ${filename}. Forge is mapping the humanoid skeleton…`)
  }

  const importBase = (file?: File) => {
    if (!file) return
    setBaseBlob(file, file.name)
    setName(file.name.replace(/\.(glb|gltf)$/i, '').replace(/[-_]+/g, ' '))
  }

  const loadBaseFromLibrary = () => {
    const asset = libraryModels.find((item) => item.id === libraryId)
    if (!asset) return
    setBaseBlob(asset.blob, `${safeName(asset.name)}.glb`, asset.id)
    setName(asset.name)
    setStatus(`${asset.name} loaded from Shared Asset Library.`)
  }

  const attachFile = (slot: CharacterSlot, file?: File) => {
    if (!file) return
    const current = attachments.find((item) => item.slot === slot)
    if (current) URL.revokeObjectURL(current.url)
    const next: Attachment = {
      id: current?.id ?? crypto.randomUUID(),
      name: file.name.replace(/\.(glb|gltf)$/i, '').replace(/[-_]+/g, ' '),
      slot,
      targetBone: CHARACTER_SLOT_BONES[slot],
      file,
      filename: file.name,
      url: URL.createObjectURL(file),
      transform: current?.transform ?? cloneTransform(DEFAULT_CHARACTER_TRANSFORM),
      visible: true,
    }
    setAttachments((items) => [...items.filter((item) => item.slot !== slot), next])
    setSelectedId(next.id)
    setStatus(`${next.name} attached to ${CHARACTER_SLOT_LABELS[slot]}. Fine-tune it in the inspector.`)
  }

  const loadAttachmentFromLibrary = (slot: CharacterSlot, assetId: string) => {
    if (!assetId) return
    if (assetId === base?.assetId) {
      setStatus('The active base character cannot also be equipped as an armor piece.')
      return
    }
    const asset = equipmentModels.find((item) => item.id === assetId)
    if (!asset) {
      setStatus('Only GLB assets stored as Props can be equipped from the Shared Library. Import other armor directly if needed.')
      return
    }
    const file = new File([asset.blob], `${safeName(asset.name)}.glb`, { type: asset.mime || 'model/gltf-binary' })
    attachFile(slot, file)
  }

  const patchAttachment = (patch: Partial<Attachment>) => {
    if (!selected) return
    setAttachments((items) => items.map((item) => item.id === selected.id ? { ...item, ...patch } : item))
  }

  const patchTransform = (group: keyof CharacterTransform, index: number, value: number) => {
    if (!selected) return
    const next = cloneTransform(selected.transform)
    next[group][index] = value
    patchAttachment({ transform: next })
  }

  const removeAttachment = (id: string) => {
    const item = attachments.find((entry) => entry.id === id)
    if (item) URL.revokeObjectURL(item.url)
    setAttachments((items) => items.filter((entry) => entry.id !== id))
    if (selectedId === id) setSelectedId('')
  }

  const resetSelected = () => {
    if (!selected) return
    patchAttachment({ transform: cloneTransform(DEFAULT_CHARACTER_TRANSFORM) })
  }

  const saveCharacter = async () => {
    if (!base || !rigInfo) return
    setBusy(true)
    setStatus('Packaging character, armor and slot transforms…')
    try {
      const packageData = await createCharacterPackage(
        name,
        base.blob,
        base.filename,
        { mapped: { ...rigInfo.mapped } as Record<string, string>, missing: rigInfo.missing },
        attachments.map((item) => ({
          id: item.id,
          name: item.name,
          slot: item.slot,
          targetBone: item.targetBone,
          file: item.file,
          filename: item.filename,
          transform: item.transform,
        })),
      )
      const asset = await saveAsset({
        name,
        category: 'characters',
        kind: 'file',
        mime: 'application/x-forge-character+json',
        tags: ['character', 'humanoid', 'assembly'],
        source: 'Forge Character Studio',
        blob: characterPackageBlob(packageData),
      })
      setLibrary((items) => [asset, ...items])
      setPresetId(asset.id)
      setStatus(`${name} saved to Shared Asset Library with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the character preset.')
    } finally {
      setBusy(false)
    }
  }

  const loadPreset = async () => {
    const asset = characterPresets.find((item) => item.id === presetId)
    if (!asset) return
    setBusy(true)
    try {
      const packageData = await parseCharacterPackage(asset.blob)
      if (!packageData) throw new Error('That library item is not a valid Forge character package.')
      const baseBlob = characterPackageDataToBlob(packageData.base.data)
      setBaseBlob(baseBlob, packageData.base.file)
      for (const item of attachments) URL.revokeObjectURL(item.url)
      const restored: Attachment[] = packageData.attachments.map((item) => {
        const blob = characterPackageDataToBlob(item.data)
        return {
          id: item.id || crypto.randomUUID(),
          name: item.name,
          slot: item.slot,
          targetBone: item.targetBone,
          file: blob,
          filename: item.file,
          url: URL.createObjectURL(blob),
          transform: cloneTransform(item.transform),
          visible: true,
        }
      })
      setAttachments(restored)
      setSelectedId(restored[0]?.id ?? '')
      setName(packageData.name)
      setStatus(`${packageData.name} restored from Shared Asset Library.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load that character preset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="character-studio">
      <aside className="character-slots-panel">
        <div className="character-panel-heading"><Shirt size={15} /><span>EQUIPMENT SLOTS</span></div>
        <div className="character-base-card">
          <span className="property-label">Base character</span>
          <strong>{base?.filename ?? 'No character loaded'}</strong>
          <label className="secondary-button file-button"><FileUp size={14} /> {base ? 'Replace GLB' : 'Load rigged GLB'}<input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={(event) => importBase(event.target.files?.[0])} /></label>
          {libraryModels.length > 0 && <div className="character-library-pick"><select value={libraryId} onChange={(event) => setLibraryId(event.target.value)}><option value="">From library…</option>{libraryModels.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select><button disabled={!libraryId} onClick={loadBaseFromLibrary}>Load</button></div>}
        </div>

        <div className="character-slot-list">
          {slots.map((slot) => {
            const item = attachments.find((attachment) => attachment.slot === slot)
            return <div className={`character-slot ${item?.id === selectedId ? 'active' : ''}`} key={slot}>
              <button className="character-slot-main" onClick={() => item && setSelectedId(item.id)}>
                <span className="character-slot-icon"><Bone size={14} /></span>
                <span><strong>{CHARACTER_SLOT_LABELS[slot]}</strong><em>{item?.name ?? CHARACTER_SLOT_BONES[slot]}</em></span>
                {item && <i className="slot-ready" />}
              </button>
              <div className="character-slot-actions">
                <label title="Import GLB"><FileUp size={12} /><input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={(event) => attachFile(slot, event.target.files?.[0])} /></label>
                {equipmentModels.length > 0
                  ? <select value="" title="Attach prop GLB from library" onChange={(event) => loadAttachmentFromLibrary(slot, event.target.value)}><option value="">Library props</option>{equipmentModels.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select>
                  : <select value="" disabled title="Save armor/equipment GLBs as Props in the Asset Library"><option value="">No prop GLBs</option></select>}
                {item && <button title="Remove" onClick={() => removeAttachment(item.id)}><Trash2 size={12} /></button>}
              </div>
            </div>
          })}
        </div>
      </aside>

      <main className="character-workspace">
        <header className="viewport-toolbar character-toolbar">
          <div><span className="eyebrow">CHARACTER STUDIO</span><strong>{name}</strong></div>
          <div className="toolbar-actions">
            <button className="secondary-button" disabled={!base} onClick={() => setShowRig((value) => !value)}>{showRig ? <EyeOff size={14} /> : <Eye size={14} />} {showRig ? 'Hide rig' : 'Show rig'}</button>
            <button className="primary-button" disabled={!base || !rigInfo || busy} onClick={() => void saveCharacter()}><Save size={14} /> {busy ? 'Working…' : 'Save character'}</button>
          </div>
        </header>
        <div className="character-preview-wrap">
          <CharacterPreview baseUrl={base?.url} attachments={previewAttachments} showRig={showRig} onRigInfo={setRigInfo} />
          {!base && <div className="character-empty"><div><UserRoundCog size={36} /></div><span className="eyebrow">HUMANOID ASSEMBLY</span><h2>Build a game-ready character</h2><p>Load a rigged GLB, then attach armor, clothing and equipment directly to detected humanoid bones.</p><label className="primary-button file-button"><FileUp size={15} /> Load character<input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={(event) => importBase(event.target.files?.[0])} /></label></div>}
          {base && <div className="character-rig-status"><span className={rigInfo && rigInfo.coreMappedCount > 0 ? 'good' : ''} />{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal} core bones · ${rigInfo.fingerMappedCount} finger bones` : 'Mapping skeleton…'}</div>}
        </div>
      </main>

      <aside className="character-inspector">
        <div className="inspector-heading"><UserRoundCog size={15} /> Character Inspector</div>
        <div className="character-inspector-block">
          <label className="property-label">Character name</label>
          <input className="character-text-input" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="character-meta"><span>Rig</span><strong>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal}` : '—'}</strong></div>
          <div className="character-meta"><span>Finger bones</span><strong>{rigInfo?.fingerMappedCount ?? '—'}</strong></div>
          <div className="character-meta"><span>Attachments</span><strong>{attachments.length}</strong></div>
          {!!rigInfo?.missing.length && <div className="character-warning">Missing: {rigInfo.missing.join(', ')}</div>}
        </div>

        {selected ? <>
          <div className="character-inspector-block">
            <div className="property-title"><span>SELECTED PART</span><em>{CHARACTER_SLOT_LABELS[selected.slot]}</em></div>
            <input className="character-text-input" value={selected.name} onChange={(event) => patchAttachment({ name: event.target.value })} />
            <label className="character-visible"><input type="checkbox" checked={selected.visible} onChange={(event) => patchAttachment({ visible: event.target.checked })} /> Visible in preview</label>
            <label className="property-label character-target-label">Attach bone</label>
            <select className="character-select" value={selected.targetBone} onChange={(event) => patchAttachment({ targetBone: event.target.value as HumanoidBoneKey })}>
              {Object.entries(rigInfo?.mapped ?? {}).map(([key, bone]) => <option value={key} key={key}>{key} · {bone}</option>)}
            </select>
          </div>
          <TransformEditor title="POSITION" values={selected.transform.position} step={0.005} onChange={(index, value) => patchTransform('position', index, value)} />
          <TransformEditor title="ROTATION" values={selected.transform.rotation} step={1} suffix="°" onChange={(index, value) => patchTransform('rotation', index, value)} />
          <TransformEditor title="SCALE" values={selected.transform.scale} step={0.01} onChange={(index, value) => patchTransform('scale', index, value)} />
          <div className="character-inspector-block"><button className="secondary-button character-reset" onClick={resetSelected}><RotateCcw size={13} /> Reset transform</button></div>
        </> : <div className="character-inspector-empty">Select an equipped part to adjust its bone, position, rotation and scale.</div>}

        <div className="character-inspector-block character-preset-block">
          <span className="property-label">Saved character presets</span>
          <div className="character-library-pick"><select value={presetId} onChange={(event) => setPresetId(event.target.value)}><option value="">Choose preset…</option>{characterPresets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select><button disabled={!presetId || busy} onClick={() => void loadPreset()}><PackagePlus size={13} /> Load</button></div>
        </div>
        <div className="character-status">{status}</div>
      </aside>
    </div>
  )
}

function TransformEditor({ title, values, step, suffix = '', onChange }: { title: string; values: [number, number, number]; step: number; suffix?: string; onChange: (index: number, value: number) => void }) {
  const labels = ['X', 'Y', 'Z']
  return <div className="character-inspector-block transform-editor"><span className="property-label">{title}</span><div className="transform-grid">{values.map((value, index) => <label key={labels[index]}><span>{labels[index]}</span><input type="number" step={step} value={Number(value.toFixed(step < 1 ? 3 : 1))} onChange={(event) => onChange(index, Number(event.target.value))} /><em>{suffix}</em></label>)}</div></div>
}

function cloneTransform(value: CharacterTransform): CharacterTransform {
  return {
    position: [...value.position] as [number, number, number],
    rotation: [...value.rotation] as [number, number, number],
    scale: [...value.scale] as [number, number, number],
  }
}

function safeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'
}
