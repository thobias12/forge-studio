import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box, Check, Copy, FolderSync, Hammer, Image, PackagePlus, RotateCcw, Save, ScanLine, ShieldCheck, Sparkles, Sword, Upload, WandSparkles } from 'lucide-react'
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
import { autoFitItemPresentation, type ItemAutoFitProfile, type ItemAutoFitScope } from '../engine/itemAutoFit'
import {
  beginItemModelCreator,
  consumeItemModelCreatorResult,
  createStarterItemMaster,
  importItemMasterGlb,
} from '../engine/itemMasterModel'
import {
  BODY_REGION_OPTIONS,
  ITEM_TYPE_OPTIONS,
  classificationPatch,
  itemClassification,
  starterModelLabel,
  subtypeOptions,
  taxonomyLabel,
  type ForgeAuthoredItem,
  type ForgeBodyRegion,
  type ForgeItemAuthoringFields,
  type ForgeItemEquipSlot,
  type ForgeItemSubtype,
  type ForgeItemType,
} from '../engine/itemTaxonomy'
import { getSkillboundProjectConnection, saveSkillboundWorkspaceToProjectFolder } from '../engine/projectPersistence'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import '../item-master-flow.css'
import '../item-autofit.css'
import '../item-forge-v2.css'

type Props = { onOpenModelCreator?: () => void }
type ItemPatch = Partial<ForgeItemDefinition> & ForgeItemAuthoringFields

const EQUIP_SLOTS: ForgeItemEquipSlot[] = ['MainHand', 'OffHand', 'Head', 'Chest', 'Hands', 'Legs', 'Feet', 'None']

export default function ItemForgeV2({ onOpenModelCreator }: Props) {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('Opening Skillbound items…')
  const [sourceConnected, setSourceConnected] = useState(false)
  const [masterBusy, setMasterBusy] = useState(false)
  const [fitBusy, setFitBusy] = useState(false)
  const [fitProfile, setFitProfile] = useState<ItemAutoFitProfile>()
  const importInput = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const [loadedProject, library, connection] = await Promise.all([
      loadSkillboundWorkspace(),
      listAssets(),
      getSkillboundProjectConnection().catch(() => undefined),
    ])

    let project = loadedProject
    let nextStatus = 'Item type now drives its starter model, auto-fit and equipped presentation.'
    const result = consumeItemModelCreatorResult()
    if (result && project.gameplay.items.some((entry) => entry.id === result.itemId)) {
      project = assignMasterInWorkspace(project, result.itemId, result.assetId)
      try {
        const fitted = await autoFitWorkspaceItem(project, result.itemId, 'all')
        project = fitted.workspace
        setFitProfile(fitted.profile)
        nextStatus = `Model Creator output assigned and Auto Setup applied as ${fitted.profile.label}.`
      } catch {
        nextStatus = 'Model Creator output assigned. Use Auto Setup to align its presentations.'
      }
      project = saveSkillboundWorkspace(project)
      setSelectedId(result.itemId)
    }

    setWorkspace(project)
    setAssets(library)
    setSelectedId((current) => current && project.gameplay.items.some((entry) => entry.id === current) ? current : project.gameplay.items[0]?.id ?? '')
    setSourceConnected(connection?.permission === 'granted' || connection?.permission === 'prompt')
    setStatus(nextStatus)
  }

  useEffect(() => { void refresh().catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Item Forge.')) }, [])

  const item = workspace?.gameplay.items.find((entry) => entry.id === selectedId) ?? workspace?.gameplay.items[0]
  const authored = item as ForgeAuthoredItem | undefined
  const classification = item ? itemClassification(item) : undefined
  const modelAssets = useMemo(() => assets.filter((asset) => asset.kind === 'glb'), [assets])
  const visual = item ? itemVisual(item) : undefined
  const masterAsset = visual ? modelAssets.find((asset) => asset.id === visual.masterAssetId) : undefined
  const isStarter = Boolean(masterAsset?.tags.includes('starter'))
  const equippable = classification ? classification.equipSlot !== 'None' : false

  useEffect(() => {
    if (!item || !visual?.masterAssetId) {
      setFitProfile(undefined)
      return
    }
    let cancelled = false
    void autoFitItemPresentation(item, 'inventory').then((result) => {
      if (!cancelled) setFitProfile(result.profile)
    }).catch(() => {
      if (!cancelled) setFitProfile(undefined)
    })
    return () => { cancelled = true }
  }, [item?.id, visual?.masterAssetId, authored?.itemType, authored?.subtype, authored?.equipSlot])

  const commit = (next: ForgeProjectWorkspace, message = 'Saved to Skillbound working project.') => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
    return saved
  }

  const patchItem = (patch: ItemPatch, message?: string) => {
    if (!workspace || !item) return
    const items = workspace.gameplay.items.map((entry) => entry.id === item.id ? ({ ...entry, ...patch } as ForgeItemDefinition) : entry)
    commit({ ...workspace, gameplay: { ...workspace.gameplay, items } }, message)
  }

  const patchVisual = (patch: Partial<ForgeItemVisualDefinition>) => {
    if (!item) return
    patchItem({ visual: { ...itemVisual(item), ...patch } })
  }

  const changeType = (itemType: ForgeItemType) => {
    if (!item) return
    const patch = classificationPatch(item, itemType)
    patchItem(patch, `${taxonomyLabel(itemType)} selected. ${visual?.masterAssetId ? 'Run Auto Setup or regenerate the starter to refit the model.' : 'Create a starter model when ready.'}`)
  }

  const changeSubtype = (subtype: ForgeItemSubtype) => {
    if (!item || !classification) return
    const patch = classificationPatch(item, classification.itemType, subtype)
    patchItem(patch, `${taxonomyLabel(subtype)} preset selected. ${visual?.masterAssetId ? 'Run Auto Setup or regenerate the starter to apply the new fit.' : ''}`)
  }

  const assignMasterAndFit = async (base: ForgeProjectWorkspace, targetItemId: string, assetId: string, message: string) => {
    setFitBusy(true)
    let assigned = assignMasterInWorkspace(base, targetItemId, assetId)
    assigned = commit(assigned, `${message} Running Auto Setup…`)
    try {
      const fitted = await autoFitWorkspaceItem(assigned, targetItemId, 'all')
      setFitProfile(fitted.profile)
      commit(fitted.workspace, `${message} Auto Setup: ${fitted.profile.label} · inventory, drop and equipped views fitted.`)
    } catch (error) {
      setStatus(error instanceof Error ? `${message} ${error.message}` : `${message} Auto Setup could not finish.`)
    } finally {
      setFitBusy(false)
    }
  }

  const autoFit = async (scope: ItemAutoFitScope) => {
    if (!workspace || !item || !visual?.masterAssetId) return
    setFitBusy(true)
    setStatus(scope === 'all' ? 'Analyzing the master model and fitting every presentation…' : `Auto fitting ${scope} presentation…`)
    try {
      const fitted = await autoFitWorkspaceItem(workspace, item.id, scope)
      setFitProfile(fitted.profile)
      commit(fitted.workspace, `${scope === 'all' ? 'Auto Setup' : 'Auto Fit'} applied · ${fitted.profile.label}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not auto fit this item.')
    } finally {
      setFitBusy(false)
    }
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

    const created = {
      format: 'forge-item',
      version: 1,
      id,
      name: titleCase(id),
      slot: 'weapon',
      rarity: 'common',
      damageBonus: 0,
      color: '#8e8a80',
      itemType: 'weapon',
      subtype: 'sword',
      equipSlot: 'MainHand',
      armorFitMode: 'rigid',
      bodyMask: [],
      defenseBonus: 0,
      visual: defaultItemVisual(),
    } as ForgeAuthoredItem
    const path = `items/${id}.item.json`
    const next: ForgeProjectWorkspace = {
      ...workspace,
      manifest: { ...workspace.manifest, content: { ...workspace.manifest.content, items: [...workspace.manifest.content.items, path] } },
      gameplay: { ...workspace.gameplay, items: [...workspace.gameplay.items, created as ForgeItemDefinition] },
    }
    const saved = commit(next, `${created.name} created. Forge is building and fitting a sword starter…`)
    setSelectedId(id)
    setMasterBusy(true)
    try {
      const asset = await createStarterItemMaster(created)
      setAssets(await listAssets())
      await assignMasterAndFit(saved, id, asset.id, `${created.name} created with a starter model.`)
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
    if (!workspace || !item || !classification) return
    setMasterBusy(true)
    setStatus(`Building ${starterModelLabel(item).toLowerCase()} for ${item.name}…`)
    try {
      const asset = await createStarterItemMaster(item)
      setAssets(await listAssets())
      await assignMasterAndFit(workspace, item.id, asset.id, isStarter ? `${taxonomyLabel(classification.subtype)} starter regenerated.` : 'Starter master model created.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the starter model.')
    } finally {
      setMasterBusy(false)
    }
  }

  const importMaster = async (file?: File) => {
    if (!workspace || !item || !file) return
    setMasterBusy(true)
    setStatus(`Importing ${file.name} as the master model…`)
    try {
      const asset = await importItemMasterGlb(file, item)
      setAssets(await listAssets())
      await assignMasterAndFit(workspace, item.id, asset.id, `${file.name} imported.`)
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
      setStatus('Rendering 256×256 inventory icon from the fitted master model…')
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
      const current = itemVisual(item)
      patchItem({ visual: { ...current, inventory: { ...current.inventory, iconAssetId: iconId, autoIcon: true } } })
      setAssets(await listAssets())
      setStatus('Inventory icon regenerated from the fitted master item model.')
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

  const toggleBodyRegion = (region: ForgeBodyRegion) => {
    if (!item || !classification) return
    const next = classification.bodyMask.includes(region)
      ? classification.bodyMask.filter((entry) => entry !== region)
      : [...classification.bodyMask, region]
    patchItem({ bodyMask: next }, `Body mask updated · ${next.length} region${next.length === 1 ? '' : 's'} hidden under this armor.`)
  }

  if (!workspace || !item || !visual || !classification || !authored) return <div className="item-forge-loading"><Sword size={28}/><strong>Opening Item Forge</strong><span>{status}</span></div>

  return <div className="item-forge-page item-forge-v2">
    <header className="item-forge-toolbar">
      <div><span className="eyebrow">SKILLBOUND / ITEM AUTHORING</span><strong>Item Forge</strong><small>One item definition · taxonomy · master model · inventory · drop · equipped</small></div>
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
        {workspace.gameplay.items.map((entry) => {
          const entryClassification = itemClassification(entry)
          return <button className={entry.id === item.id ? 'active' : ''} key={entry.id} onClick={() => setSelectedId(entry.id)}>
            <i style={{ background: entry.color }}/><span><strong>{entry.name}</strong><small>{taxonomyLabel(entryClassification.itemType)} · {taxonomyLabel(entryClassification.subtype)}</small></span><em>{entry.rarity}</em>
          </button>
        })}
      </aside>

      <main className="item-forge-main">
        <section className="item-forge-general item-panel item-v2-definition">
          <header><div><span>ITEM DEFINITION</span><h1>{item.name}</h1></div><code>item.{item.id}</code></header>
          <div className="item-v2-taxonomy-row">
            <TextField label="Name" value={item.name} onChange={(name) => patchItem({ name })}/>
            <SelectField label="Type" value={classification.itemType} options={ITEM_TYPE_OPTIONS} labeler={taxonomyLabel} onChange={(value) => changeType(value as ForgeItemType)}/>
            <SelectField label="Subtype" value={classification.subtype} options={subtypeOptions(classification.itemType)} labeler={taxonomyLabel} onChange={(value) => changeSubtype(value as ForgeItemSubtype)}/>
            <SelectField label="Equip slot" value={classification.equipSlot} options={EQUIP_SLOTS} labeler={taxonomyLabel} onChange={(equipSlot) => patchItem({ equipSlot: equipSlot as ForgeItemEquipSlot }, 'Equip slot updated. Run Auto Setup to refit the equipped presentation.')}/>
          </div>
          <div className="item-field-grid item-v2-stat-row">
            <SelectField label="Rarity" value={item.rarity} options={['common','magic','rare']} labeler={taxonomyLabel} onChange={(rarity) => patchItem({ rarity: rarity as ForgeItemDefinition['rarity'] })}/>
            {classification.itemType === 'armor'
              ? <NumberField label="Defense bonus" value={authored.defenseBonus ?? 0} step={1} onChange={(defenseBonus) => patchItem({ defenseBonus })}/>
              : <NumberField label="Damage bonus" value={item.damageBonus} step={1} onChange={(damageBonus) => patchItem({ damageBonus })}/>} 
            <ColorField label="Fallback color" value={item.color} onChange={(color) => patchItem({ color })}/>
            <div className="item-v2-classification-badge"><span>Authoring preset</span><strong>{taxonomyLabel(classification.itemType)} / {taxonomyLabel(classification.subtype)}</strong><small>{classification.equipSlot === 'None' ? 'Inventory + drop only' : `Equips to ${taxonomyLabel(classification.equipSlot)}`}</small></div>
          </div>
        </section>

        {classification.itemType === 'armor' && <section className="item-panel item-armor-contract">
          <header><div><span>ARMOR CONTRACT</span><h2>{taxonomyLabel(classification.subtype)} fit</h2></div><b><ShieldCheck size={14}/> ForgeHumanoidV1</b></header>
          <div className="item-armor-contract-grid">
            <SelectField label="Fit mode" value={classification.armorFitMode} options={['rigid','skinned']} labeler={taxonomyLabel} onChange={(armorFitMode) => patchItem({ armorFitMode: armorFitMode as 'rigid' | 'skinned' }, 'Armor fit mode updated.')}/>
            <div className="item-body-mask"><span>Body masking</span><div>{BODY_REGION_OPTIONS.map((region) => <button key={region} className={classification.bodyMask.includes(region) ? 'active' : ''} onClick={() => toggleBodyRegion(region)}>{taxonomyLabel(region)}</button>)}</div></div>
          </div>
          <p><Check size={13}/> The item stores its wearable slot, fit mode and body mask with the same master asset used for its icon and world drop.</p>
        </section>}

        <section className={`item-master-workbench item-panel ${visual.masterAssetId ? 'has-master' : 'needs-master'}`}>
          <div className="item-master-heading">
            <div className="item-master-icon">{visual.masterAssetId ? <Check size={19}/> : <Sparkles size={19}/>}</div>
            <div><span>MASTER 3D MODEL</span><strong>{masterAsset?.name ?? (visual.masterAssetId ? 'Assigned Library model' : 'No model needed beforehand')}</strong><small>{visual.masterAssetId ? `${taxonomyLabel(classification.itemType)} / ${taxonomyLabel(classification.subtype)} controls how Forge fits this one model.` : `Forge can create a ${starterModelLabel(item).toLowerCase()}, import a GLB, or hand off to Model Creator.`}</small></div>
            <b>{visual.masterAssetId ? 'READY' : 'CREATE'}</b>
          </div>

          <div className="item-master-actions item-master-actions-autofit">
            <button disabled={masterBusy} onClick={() => void createStarter()}><Sparkles size={16}/><span><strong>{!visual.masterAssetId ? 'Create starter model' : isStarter ? 'Regenerate starter' : 'Replace with starter'}</strong><small>{starterModelLabel(item)}</small></span></button>
            <button disabled={masterBusy} onClick={openModelCreator}><Hammer size={16}/><span><strong>{visual.masterAssetId ? 'Edit / rebuild model' : 'Build in Model Creator'}</strong><small>Returns here and assigns it</small></span></button>
            <button disabled={masterBusy} onClick={() => importInput.current?.click()}><Upload size={16}/><span><strong>Import GLB</strong><small>Use your own finished model</small></span></button>
            <button className="auto-setup" disabled={!visual.masterAssetId || fitBusy} onClick={() => void autoFit('all')}><ScanLine size={16}/><span><strong>{fitBusy ? 'Analyzing…' : 'Auto Setup'}</strong><small>Fit icon · drop · equipped</small></span></button>
            <input ref={importInput} className="item-master-file-input" type="file" accept=".glb,model/gltf-binary" onChange={(event) => void importMaster(event.target.files?.[0])}/>
          </div>

          <div className="item-master-dropzone" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={(event) => { event.preventDefault(); void importMaster(event.dataTransfer.files?.[0]) }}>
            <Upload size={15}/><span>Drop a .glb here to make it the master model and auto-fit it</span>
          </div>

          <AssetSelect label="Or choose an existing GLB from Shared Library" value={visual.masterAssetId ?? ''} assets={modelAssets} onChange={(masterAssetId) => {
            if (!masterAssetId) patchItem({ modelAssetId: undefined, visual: { ...visual, masterAssetId: undefined } })
            else void assignMasterAndFit(workspace, item.id, masterAssetId, 'Existing Library model assigned.')
          }}/>

          {fitProfile && <div className="item-fit-summary">
            <span><b>Preset</b>{fitProfile.label}</span>
            <span><b>Bounds</b>{fitProfile.size.map((value) => value.toFixed(2)).join(' × ')}</span>
            <span><b>Long axis</b>{fitProfile.longestAxis.toUpperCase()}</span>
            <span><b>Mesh</b>{fitProfile.triangles.toLocaleString()} tris</span>
            <span><b>Source</b>{shortSource(fitProfile.source)}</span>
          </div>}
          <p className="item-system-note"><Check size={13}/> Explicit type/subtype now wins over geometry guessing. Auto Setup is only the baseline; the controls below remain fine tuning.</p>
        </section>

        <section className={`item-presentation-grid ${equippable ? '' : 'two-column'}`}>
          <PresentationCard title="Inventory" badge={visual.inventory.iconAssetId ? 'ICON READY' : visual.masterAssetId ? 'AUTO FIT' : 'NEEDS MASTER'} icon={<Image size={15}/> }>
            <ItemModelPreview item={item} mode="inventory"/>
            <div className="item-card-controls">
              <ControlHeader onAutoFit={() => void autoFit('inventory')} disabled={!visual.masterAssetId || fitBusy}/>
              <SelectField label="Camera" value={visual.inventory.cameraPreset} options={['three-quarter','front','side']} labeler={taxonomyLabel} onChange={(cameraPreset) => patchVisual({ inventory: { ...visual.inventory, cameraPreset: cameraPreset as ForgeItemVisualDefinition['inventory']['cameraPreset'] } })}/>
              <VectorField label="Rotation" value={visual.inventory.rotation} onChange={(rotation) => patchVisual({ inventory: { ...visual.inventory, rotation } })}/>
              <NumberField label="Scale" value={visual.inventory.scale} step={0.05} onChange={(scale) => patchVisual({ inventory: { ...visual.inventory, scale } })}/>
              <button className="item-generate-icon" disabled={!visual.masterAssetId} onClick={() => void generateIcon()}><WandSparkles size={13}/> Generate 256px icon</button>
            </div>
          </PresentationCard>

          <PresentationCard title="World Drop" badge={visual.drop.useMaster ? 'MASTER MODEL' : 'OVERRIDE'} icon={<Box size={15}/> }>
            <ItemModelPreview item={item} mode="drop"/>
            <div className="item-card-controls">
              <ControlHeader onAutoFit={() => void autoFit('drop')} disabled={!visual.masterAssetId || fitBusy}/>
              <Toggle label="Use master model" checked={visual.drop.useMaster} onChange={(useMaster) => patchVisual({ drop: { ...visual.drop, useMaster } })}/>
              {!visual.drop.useMaster && <AssetSelect label="Drop override" value={visual.drop.modelAssetId ?? ''} assets={modelAssets} onChange={(modelAssetId) => patchVisual({ drop: { ...visual.drop, modelAssetId: modelAssetId || undefined } })}/>} 
              <TransformFields value={visual.drop.transform} onChange={(transform) => patchVisual({ drop: { ...visual.drop, transform } })}/>
              <NumberField label="Ground offset" value={visual.drop.groundOffset} step={0.01} onChange={(groundOffset) => patchVisual({ drop: { ...visual.drop, groundOffset } })}/>
            </div>
          </PresentationCard>

          {equippable && <PresentationCard title="Equipped" badge={classification.itemType === 'armor' ? classification.equipSlot : visual.equipped.socket} icon={classification.itemType === 'armor' ? <ShieldCheck size={15}/> : <Sword size={15}/> }>
            <ItemModelPreview item={item} mode="equipped"/>
            <div className="item-card-controls">
              <ControlHeader onAutoFit={() => void autoFit('equipped')} disabled={!visual.masterAssetId || fitBusy}/>
              <Toggle label="Use master model" checked={visual.equipped.useMaster} onChange={(useMaster) => patchVisual({ equipped: { ...visual.equipped, useMaster } })}/>
              {!visual.equipped.useMaster && <AssetSelect label="Equipped override" value={visual.equipped.modelAssetId ?? ''} assets={modelAssets} onChange={(modelAssetId) => patchVisual({ equipped: { ...visual.equipped, modelAssetId: modelAssetId || undefined } })}/>} 
              {classification.itemType === 'armor'
                ? <div className="item-wearable-summary"><span>Wearable target</span><strong>{taxonomyLabel(classification.equipSlot)} · {taxonomyLabel(classification.armorFitMode)}</strong><small>{classification.bodyMask.length ? `Masks ${classification.bodyMask.map((region) => taxonomyLabel(region)).join(', ')}` : 'No body regions masked'}</small></div>
                : <SelectField label="Socket" value={visual.equipped.socket} options={['RightHand','LeftHand','Back','HipLeft','HipRight']} labeler={taxonomyLabel} onChange={(socket) => patchVisual({ equipped: { ...visual.equipped, socket: socket as ForgeItemVisualDefinition['equipped']['socket'] } })}/>} 
              <TransformFields value={visual.equipped.transform} onChange={(transform) => patchVisual({ equipped: { ...visual.equipped, transform } })}/>
            </div>
          </PresentationCard>}
        </section>
      </main>
    </div>

    <footer className="item-forge-status"><span>{status}</span><strong>{sourceConnected ? 'Connected source folder available' : 'Workspace mode · connect source folder in Project Manager to write JSON'}</strong></footer>
  </div>
}

async function autoFitWorkspaceItem(workspace: ForgeProjectWorkspace, itemId: string, scope: ItemAutoFitScope) {
  const item = workspace.gameplay.items.find((entry) => entry.id === itemId)
  if (!item) throw new Error(`Could not find item ${itemId}.`)
  const result = await autoFitItemPresentation(item, scope)
  return { workspace: setItemVisualInWorkspace(workspace, itemId, result.visual), profile: result.profile }
}

function setItemVisualInWorkspace(workspace: ForgeProjectWorkspace, itemId: string, visual: ForgeItemVisualDefinition): ForgeProjectWorkspace {
  const items = workspace.gameplay.items.map((entry) => entry.id === itemId ? { ...entry, visual } : entry)
  return { ...workspace, gameplay: { ...workspace.gameplay, items } }
}

function assignMasterInWorkspace(workspace: ForgeProjectWorkspace, itemId: string, assetId: string): ForgeProjectWorkspace {
  const items = workspace.gameplay.items.map((entry) => {
    if (entry.id !== itemId) return entry
    const visual = itemVisual(entry)
    return { ...entry, modelAssetId: assetId, visual: { ...visual, masterAssetId: assetId } }
  })
  return { ...workspace, gameplay: { ...workspace.gameplay, items } }
}

function ControlHeader({ onAutoFit, disabled }: { onAutoFit: () => void; disabled: boolean }) {
  return <div className="item-control-header"><span>Fine tuning</span><button disabled={disabled} onClick={onAutoFit}><RotateCcw size={11}/> Auto Fit / Reset</button></div>
}

function PresentationCard({ title, badge, icon, children }: { title: string; badge: string; icon: ReactNode; children: ReactNode }) {
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

function SelectField({ label, value, options, onChange, labeler = (option) => option }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; labeler?: (value: string) => string }) {
  return <label className="item-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{labeler(option)}</option>)}</select></label>
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

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function titleCase(value: string) {
  return value.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function shortSource(value: string) {
  return value.length > 36 ? `${value.slice(0, 33)}…` : value
}
