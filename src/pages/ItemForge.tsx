import { useEffect, useMemo, useState } from 'react'
import { Box, Check, Copy, FolderSync, Image, PackagePlus, Save, Sword, WandSparkles } from 'lucide-react'
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
import { getSkillboundProjectConnection, saveSkillboundWorkspaceToProjectFolder } from '../engine/projectPersistence'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'

export default function ItemForge() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('Opening Skillbound items…')
  const [sourceConnected, setSourceConnected] = useState(false)

  const refresh = async () => {
    const [project, library, connection] = await Promise.all([
      loadSkillboundWorkspace(),
      listAssets(),
      getSkillboundProjectConnection().catch(() => undefined),
    ])
    setWorkspace(project)
    setAssets(library)
    setSelectedId((current) => current && project.gameplay.items.some((item) => item.id === current) ? current : project.gameplay.items[0]?.id ?? '')
    setSourceConnected(connection?.permission === 'granted' || connection?.permission === 'prompt')
    setStatus('One master visual drives inventory, world drop and equipped presentation.')
  }

  useEffect(() => { void refresh().catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Item Forge.')) }, [])

  const item = workspace?.gameplay.items.find((entry) => entry.id === selectedId) ?? workspace?.gameplay.items[0]
  const modelAssets = useMemo(() => assets.filter((asset) => asset.kind === 'glb'), [assets])

  const commit = (next: ForgeProjectWorkspace, message = 'Saved to Skillbound working project.') => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
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

  const createItem = () => {
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
    commit(next, `${created.name} created. Assign a master model to derive all presentations.`)
    setSelectedId(id)
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
    commit(next, `${copy.name} created from ${item.name}.`)
    setSelectedId(id)
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

  return <div className="item-forge-page">
    <header className="item-forge-toolbar">
      <div><span className="eyebrow">SKILLBOUND / ITEM AUTHORING</span><strong>Item Forge</strong><small>One authoritative item → inventory icon · world drop · equipped presentation</small></div>
      <div className="item-forge-actions">
        <button onClick={createItem}><PackagePlus size={14}/> New Item</button>
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
          <AssetSelect label="Master visual · GLB" value={visual.masterAssetId ?? ''} assets={modelAssets} onChange={(masterAssetId) => patchItem({ modelAssetId: masterAssetId || undefined, visual: { ...visual, masterAssetId: masterAssetId || undefined } })}/>
          <p className="item-system-note"><Check size={13}/> Inventory, ground loot and equipment reuse this model by default. Overrides are optional, not separate items.</p>
        </section>

        <section className="item-presentation-grid">
          <PresentationCard title="Inventory" badge={visual.inventory.iconAssetId ? 'ICON READY' : 'AUTO'} icon={<Image size={15}/>}>
            <ItemModelPreview item={item} mode="inventory"/>
            <div className="item-card-controls">
              <SelectField label="Camera" value={visual.inventory.cameraPreset} options={['three-quarter','front','side']} onChange={(cameraPreset) => patchVisual({ inventory: { ...visual.inventory, cameraPreset: cameraPreset as ForgeItemVisualDefinition['inventory']['cameraPreset'] } })}/>
              <VectorField label="Rotation" value={visual.inventory.rotation} onChange={(rotation) => patchVisual({ inventory: { ...visual.inventory, rotation } })}/>
              <NumberField label="Scale" value={visual.inventory.scale} step={0.05} onChange={(scale) => patchVisual({ inventory: { ...visual.inventory, scale } })}/>
              <button className="item-generate-icon" onClick={() => void generateIcon()}><WandSparkles size={13}/> Generate 256px icon</button>
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
  return <label className="item-field item-asset-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><small>{value ? value : 'Forge Runtime will use its placeholder until a model is assigned.'}</small></label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="item-toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/></label>
}

function VectorField({ label, value, onChange }: { label: string; value: [number, number, number]; onChange: (value: [number, number, number]) => void }) {
  return <label className="item-vector"><span>{label}</span><div>{(['X','Y','Z'] as const).map((axis, index) => <label key={axis}><i>{axis}</i><input type="number" step="0.05" value={value[index]} onChange={(event) => { const next = [...value] as [number, number, number]; next[index] = Number(event.target.value) || 0; onChange(next) }}/></label>)}</div></label>
}

function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function titleCase(value: string) { return value.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ') }
