import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Check, Copy, FolderSync, Hammer, Image, PackagePlus, Save, Sparkles, Sword, Upload, WandSparkles } from 'lucide-react'
import ItemModelPreview from '../components/ItemModelPreview'
import {
  loadSkillboundWorkspace,
  saveSkillboundWorkspace,
  type ForgeItemDefinition,
  type ForgeItemTransform,
  type ForgeItemVisualDefinition,
  type ForgeProjectWorkspace,
} from '../engine/forgeProject'
import { defaultItemVisual, itemVisual, renderItemIconBlob } from '../engine/itemPresentation'
import {
  beginItemModelCreator,
  consumeItemModelCreatorResult,
  createStarterItemMaster,
  importItemMasterGlb,
} from '../engine/itemMasterModel'
import { getSkillboundProjectConnection, saveSkillboundWorkspaceToProjectFolder } from '../engine/projectPersistence'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import '../item-master-flow.css'

type Props = { onOpenModelCreator?: () => void }

export default function ItemForge({ onOpenModelCreator }: Props) {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('Opening Skillbound items…')
  const [sourceConnected, setSourceConnected] = useState(false)
  const [masterBusy, setMasterBusy] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const [loadedProject, library, connection] = await Promise.all([
      loadSkillboundWorkspace(),
      listAssets(),
      getSkillboundProjectConnection().catch(() => undefined),
    ])

    let project = loadedProject
    const result = consumeItemModelCreatorResult()
    if (result && project.gameplay.items.some((entry) => entry.id === result.itemId)) {
      project = assignMasterInWorkspace(project, result.itemId, result.assetId)
      project = saveSkillboundWorkspace(project)
      setSelectedId(result.itemId)
      setStatus('Model Creator output assigned as the item master model. All three presentations now use it.')
    } else {
      setStatus('One master visual drives inventory, world drop and equipped presentation.')
    }

    setWorkspace(project)
    setAssets(library)
    setSelectedId((current) => current && project.gameplay.items.some((entry) => entry.id === current) ? current : project.gameplay.items[0]?.id ?? '')
    setSourceConnected(connection?.permission === 'granted' || connection?.permission === 'prompt')
  }

  useEffect(() => { void refresh().catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Item Forge.')) }, [])

  const item = workspace?.gameplay.items.find((entry) => entry.id === selectedId) ?? workspace?.gameplay.items[0]
  const modelAssets = useMemo(() => assets.filter((asset) => asset.kind === 'glb'), [assets])

  const commit = (next: ForgeProjectWorkspace, message = 'Saved to Skillbound working project.') => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
    return saved
  }

  const patchItem = (patch: Partial<ForgeItemDefinition>) => {
    if (!workspace || !item) return
    const items = workspace.gameplay.items.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry)
    commit({ ...workspace, gameplay: { ...workspace.gameplay, items } })
  }

  const patchVisual = (patch: Partial<ForgeItemVisualDefinition>) => {
    if (!item) return
    patchItem({ visual: { ...itemVisual(item), ...patch } })
  }

  const assignMaster = (targetItemId: string, assetId: string, message: string) => {
    if (!workspace) return
    commit(assignMasterInWorkspace(workspace, targetItemId, assetId), message)
  }

  const createItem = async () => {
    if (!workspace) return
    const raw = window.prompt('Item ID', `new-item-${workspace.gameplay.items.length + 1}`)
    const id = slug(raw ?? '')
    if (!id) return
    if (workspace.gameplay.items.some((entry) => entry.id === id)) {
      setStatus(`Item ${id} already exists.`)
      return
    }

    const created: ForgeItemDefinition = {
      format: 'forge-item', version: 1, id, name: titleCase(id), slot: 'weapon', rarity: 'common', damageBonus: 0, color: '#8e8a80', visual: defaultItemVisual(),
    }
    const path = `items/${id}.item.json`
    const next: ForgeProjectWorkspace = {
      ...workspace,
      manifest: { ...workspace.manifest, content: { ...workspace.manifest.content, items: [...workspace.manifest.content.items, path] } },
      gameplay: { ...workspace.gameplay, items: [...workspace.gameplay.items, created] },
    }
    const saved = commit(next, `${created.name} created. Forge is building a starter master model…`)
    setSelectedId(id)
    setMasterBusy(true)
    try {
      const asset = await createStarterItemMaster(created)
      setAssets(await listAssets())
      commit(assignMasterInWorkspace(saved, id, asset.id), `${created.name} created with a starter sword master model. Replace or edit it whenever you are ready.`)
    } catch (error) {
      setStatus(error instanceof Error ? `${created.name} was created, but its starter model failed: ${error.message}` : `${created.name} was created without a starter model.`)
    } finally {
      setMasterBusy(false)
    }
  }

  const duplicateItem = () => {
    if (!workspace || !item) return
    const base = `${item.id}-copy`
    let id = base
    let suffix = 2
    while (workspace.gameplay.items.some((entry) => entry.id === id)) id = `${base}-${suffix++}`
    const copy: ForgeItemDefinition = { ...item, id, name: `${item.name} Copy`, visual: itemVisual(item) }
    const next: ForgeProjectWorkspace = {
      ...workspace,
      manifest: { ...workspace.manifest, content: { ...workspace.manifest.content, items: [...workspace.manifest.content.items, `items/${id}.item.json`] } },
      gameplay: { ...workspace.gameplay, items: [...workspace.gameplay.items, copy] },
    }
    commit(next, `${copy.name} created from ${item.name}. It currently shares the same master model.`)
    setSelectedId(id)
  }

  const createStarter = async () => {
    if (!item) return
    setMasterBusy(true)
    setStatus(`Building a low-poly starter master model for ${item.name}…`)
    try {
      const asset = await createStarterItemMaster(item)
      setAssets(await listAssets())
      assignMaster(item.id, asset.id, 'Starter master model created. Inventory, drop and equipped previews now share it.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the starter model.')
    } finally {
      setMasterBusy(false)
    }
  }

  const importMaster = async (file?: File) => {
    if (!item || !file) return
    setMasterBusy(true)
    setStatus(`Importing ${file.name} as the master model…`)
    try {
      const asset = await importItemMasterGlb(file, item)
      setAssets(await listAssets())
      assignMaster(item.id, asset.id, `${file.name} imported and assigned. The same GLB now drives all item presentations.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import this master model.')
    } finally {
      setMasterBusy(false)
      if (importInput.current) importInput.current.value = ''
    }
  }

  const openModelCreator = () => {
    if (!item) return
    beginItemModelCreator({ itemId: item.id, itemName: item.name })
    if (onOpenModelCreator) onOpenModelCreator()
    else {
      window.location.hash = '/models'
      window.location.reload()
    }
  }

  const generateIcon = async () => {
    if (!item) return
    try {
      setStatus('Rendering 256×256 inventory icon from the master model…')
      const blob = await renderItemIconBlob(item, 256)
      const iconId = item.visual?.inventory.iconAssetId ?? `skillbound:item-icon:${item.id}`
      await saveAsset({
        id: iconId,
        name: `${item.name} Inventory Icon`,
        category: 'textures',
        kind: 'image',
        mime: 'image/png',
        tags: ['skillbound', 'item-icon', item.id],
        source: 'Item Forge auto-render',
        blob,
      })
      const visual = itemVisual(item)
      patchItem({ visual: { ...visual, inventory: { ...visual.inventory, iconAssetId: iconId, autoIcon: true } } })
      setAssets(await listAssets())
      setStatus('Inventory icon regenerated from the same master item model.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not generate inventory icon.')
    }
  }

  const writeSource = async () => {
    if (!workspace) return
    try {
      setStatus('Writing authored item definitions to the connected Skillbound project folder…')
      const written = await saveSkillboundWorkspaceToProjectFolder(workspace)
      const saved = saveSkillboundWorkspace(written)
      setWorkspace(saved)
      setStatus(`Source files written · project content revision ${written.manifest.contentRevision ?? 1}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not write project source.')
    }
  }

  if (!workspace || !item) return <div className="item-forge-loading"><Sword size={28}/><strong>Opening Item Forge</strong><span>{status}</span></div>
  const visual = itemVisual(item)
  const masterAsset = modelAssets.find((asset) => asset.id === visual.masterAssetId)

  return <div className="item-forge-page">
    <header className="item-forge-toolbar">
      <div><span className="eyebrow">SKILLBOUND / ITEM AUTHORING</span><strong>Item Forge</strong><small>Create the item and its master 3D asset in one workflow</small></div>
      <div className="item-forge-actions">
        <button onClick={() => void createItem()}><PackagePlus size={14}/> New Item</button>
        <button onClick={duplicateItem}><Copy size={14}/> Duplicate</button>
        <button onClick={() => commit(workspace)}><Save size={14}/> Save Workspace</button>
        <button className="primary" disabled={!sourceConnected} onClick={() => void writeSource()}><FolderSync size={14}/> Write Source</button>
      </div>
    </header>

    <div className="item-forge-shell">
      <aside className="item-forge-list">
        <div className="item-forge-list-title"><Sword size={14}/> ITEMS <span>{workspace.gameplay.items.length}</span></div>
        {workspace.gameplay.items.map((entry) => <button className={entry.id === item.id ? 'active' : ''} key={entry.id} onClick={() => setSelectedId(entry.id)}>
          <i style={{ background: entry.color }}/><span><strong>{entry.name}</strong><small>{entry.id}</small></span><em>{entry.rarity}</em>
        </button>)}
      </aside>

      <main className="item-forge-main">
        <section className="item-forge-general item-panel">
          <header><div><span>ITEM DEFINITION</span><h1>{item.name}</h1></div><code>item.{item.id}</code></header>
          <div className="item-field-grid">
            <TextField label="Name" value={item.name} onChange={(name) => patchItem({ name })}/>
            <SelectField label="Rarity" value={item.rarity} options={['common','magic','rare']} onChange={(rarity) => patchItem({ rarity: rarity as ForgeItemDefinition['rarity'] })}/>
            <NumberField label="Damage bonus" value={item.damageBonus} step={1} onChange={(damageBonus) => patchItem({ damageBonus })}/>
            <ColorField label="Fallback color" value={item.color} onChange={(color) => patchItem({ color })}/>
          </div>
        </section>

        <section className={`item-master-workbench item-panel ${visual.masterAssetId ? 'has-master' : 'needs-master'}`}>
          <div className="item-master-heading">
            <div className="item-master-icon">{visual.masterAssetId ? <Check size={19}/> : <Sparkles size={19}/>}</div>
            <div><span>MASTER 3D MODEL</span><strong>{masterAsset?.name ?? (visual.masterAssetId ? 'Assigned Library model' : 'No model needed beforehand')}</strong><small>{visual.masterAssetId ? 'This one model feeds inventory, world drop and equipped views.' : 'Start here. Forge can create a usable placeholder, import your GLB, or hand off to Model Creator.'}</small></div>
            <b>{visual.masterAssetId ? 'READY' : 'CREATE'}</b>
          </div>

          <div className="item-master-actions">
            <button disabled={masterBusy} onClick={() => void createStarter()}><Sparkles size={16}/><span><strong>{visual.masterAssetId ? 'Replace with starter' : 'Create starter model'}</strong><small>Instant low-poly sword GLB</small></span></button>
            <button disabled={masterBusy} onClick={openModelCreator}><Hammer size={16}/><span><strong>Build in Model Creator</strong><small>Returns here and assigns it</small></span></button>
            <button disabled={masterBusy} onClick={() => importInput.current?.click()}><Upload size={16}/><span><strong>Import GLB</strong><small>Use your own finished model</small></span></button>
            <input ref={importInput} className="item-master-file-input" type="file" accept=".glb,model/gltf-binary" onChange={(event) => void importMaster(event.target.files?.[0])}/>
          </div>

          <div className="item-master-dropzone" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={(event) => { event.preventDefault(); void importMaster(event.dataTransfer.files?.[0]) }}>
            <Upload size={15}/><span>Drop a .glb here to make it the master model</span>
          </div>

          <AssetSelect label="Or choose an existing GLB from Shared Library" value={visual.masterAssetId ?? ''} assets={modelAssets} onChange={(masterAssetId) => {
            if (!masterAssetId) patchItem({ modelAssetId: undefined, visual: { ...visual, masterAssetId: undefined } })
            else assignMaster(item.id, masterAssetId, 'Existing Library model assigned as the master item model.')
          }}/>
          <p className="item-system-note"><Check size={13}/> You never need separate inventory, drop and equipped models unless you deliberately enable an override.</p>
        </section>

        <section className="item-presentation-grid">
          <PresentationCard title="Inventory" badge={visual.inventory.iconAssetId ? 'ICON READY' : visual.masterAssetId ? 'READY TO RENDER' : 'NEEDS MASTER'} icon={<Image size={15}/>}>
            <ItemModelPreview item={item} mode="inventory"/>
            <div className="item-card-controls">
              <SelectField label="Camera" value={visual.inventory.cameraPreset} options={['three-quarter','front','side']} onChange={(cameraPreset) => patchVisual({ inventory: { ...visual.inventory, cameraPreset: cameraPreset as ForgeItemVisualDefinition['inventory']['cameraPreset'] } })}/>
              <VectorField label="Rotation" value={visual.inventory.rotation} onChange={(rotation) => patchVisual({ inventory: { ...visual.inventory, rotation } })}/>
              <NumberField label="Scale" value={visual.inventory.scale} step={0.05} onChange={(scale) => patchVisual({ inventory: { ...visual.inventory, scale } })}/>
              <button className="item-generate-icon" disabled={!visual.masterAssetId} onClick={() => void generateIcon()}><WandSparkles size={13}/> Generate 256px icon</button>
            </div>
          </PresentationCard>

          <PresentationCard title="World Drop" badge={visual.drop.useMaster ? 'MASTER MODEL' : 'OVERRIDE'} icon={<Box size={15}/>}>
            <ItemModelPreview item={item} mode="drop"/>
            <div className="item-card-controls">
              <Toggle label="Use master model" checked={visual.drop.useMaster} onChange={(useMaster) => patchVisual({ drop: { ...visual.drop, useMaster } })}/>
              {!visual.drop.useMaster && <AssetSelect label="Drop override" value={visual.drop.modelAssetId ?? ''} assets={modelAssets} onChange={(modelAssetId) => patchVisual({ drop: { ...visual.drop, modelAssetId: modelAssetId || undefined } })}/>} 
              <TransformFields value={visual.drop.transform} onChange={(transform) => patchVisual({ drop: { ...visual.drop, transform } })}/>
              <NumberField label="Ground offset" value={visual.drop.groundOffset} step={0.01} onChange={(groundOffset) => patchVisual({ drop: { ...visual.drop, groundOffset } })}/>
            </div>
          </PresentationCard>

          <PresentationCard title="Equipped" badge={visual.equipped.useMaster ? visual.equipped.socket : 'OVERRIDE'} icon={<Sword size={15}/>}>
            <ItemModelPreview item={item} mode="equipped"/>
            <div className="item-card-controls">
              <Toggle label="Use master model" checked={visual.equipped.useMaster} onChange={(useMaster) => patchVisual({ equipped: { ...visual.equipped, useMaster } })}/>
              {!visual.equipped.useMaster && <AssetSelect label="Equipped override" value={visual.equipped.modelAssetId ?? ''} assets={modelAssets} onChange={(modelAssetId) => patchVisual({ equipped: { ...visual.equipped, modelAssetId: modelAssetId || undefined } })}/>} 
              <SelectField label="Socket" value={visual.equipped.socket} options={['RightHand','LeftHand','Back','HipLeft','HipRight']} onChange={(socket) => patchVisual({ equipped: { ...visual.equipped, socket: socket as ForgeItemVisualDefinition['equipped']['socket'] } })}/>
              <TransformFields value={visual.equipped.transform} onChange={(transform) => patchVisual({ equipped: { ...visual.equipped, transform } })}/>
            </div>
          </PresentationCard>
        </section>
      </main>
    </div>

    <footer className="item-forge-status"><span>{status}</span><strong>{sourceConnected ? 'Connected source folder available' : 'Workspace mode · connect source folder in Project Manager to write JSON'}</strong></footer>
  </div>
}

function assignMasterInWorkspace(workspace: ForgeProjectWorkspace, itemId: string, assetId: string): ForgeProjectWorkspace {
  const items = workspace.gameplay.items.map((entry) => {
    if (entry.id !== itemId) return entry
    const visual = itemVisual(entry)
    return { ...entry, modelAssetId: assetId, visual: { ...visual, masterAssetId: assetId } }
  })
  return { ...workspace, gameplay: { ...workspace.gameplay, items } }
}

function PresentationCard({ title, badge, icon, children }: { title: string; badge: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <article className="item-presentation-card"><header>{icon}<strong>{title}</strong><span>{badge}</span></header>{children}</article>
}

function TransformFields({ value, onChange }: { value: ForgeItemTransform; onChange: (value: ForgeItemTransform) => void }) {
  return <div className="item-transform-fields"><VectorField label="Position" value={value.position} onChange={(position) => onChange({ ...value, position })}/><VectorField label="Rotation" value={value.rotation} onChange={(rotation) => onChange({ ...value, rotation })}/><NumberField label="Scale" value={value.scale} step={0.05} onChange={(scale) => onChange({ ...value, scale })}/></div>
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="item-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)}/></label>
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  return <label className="item-field"><span>{label}</span><input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)}/></label>
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="item-field item-color-field"><span>{label}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)}/><code>{value}</code></div></label>
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="item-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function AssetSelect({ label, value, assets, onChange }: { label: string; value: string; assets: LibraryAsset[]; onChange: (value: string) => void }) {
  return <label className="item-field item-asset-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><small>{value ? value : 'No master GLB assigned yet.'}</small></label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="item-toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/></label>
}

function VectorField({ label, value, onChange }: { label: string; value: [number, number, number]; onChange: (value: [number, number, number]) => void }) {
  return <label className="item-vector"><span>{label}</span><div>{(['X','Y','Z'] as const).map((axis, index) => <label key={axis}><i>{axis}</i><input type="number" step="0.05" value={value[index]} onChange={(event) => { const next = [...value] as [number, number, number]; next[index] = Number(event.target.value) || 0; onChange(next) }}/></label>)}</div></label>
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function titleCase(value: string) {
  return value.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
