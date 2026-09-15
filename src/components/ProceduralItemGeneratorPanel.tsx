import { useEffect, useMemo, useState } from 'react'
import { Boxes, Dices, Save, Sparkles } from 'lucide-react'
import ProceduralItemRecipePreview from './ProceduralItemRecipePreview'
import { loadSkillboundWorkspace, saveSkillboundWorkspace, type ForgeItemDefinition, type ForgeProjectWorkspace } from '../engine/forgeProject'
import { autoFitItemPresentation } from '../engine/itemAutoFit'
import { applyGeneratorPreset, generatorForItem, itemGeneratorRecipe, randomizeGeneratorRecipe, updateGeneratorMaterial, updateGeneratorParam, variationRecipes } from '../engine/itemGenerator'
import { generateProceduralItemMaster } from '../engine/itemGeneratorAsset'
import type { ForgeItemGeneratorRecipe } from '../engine/itemGeneratorTypes'
import { itemVisual, renderItemIconBlob } from '../engine/itemPresentation'
import { saveAsset } from '../lib/library'
import '../item-generator.css'

type GeneratedItem = ForgeItemDefinition & { generatorRecipe?: ForgeItemGeneratorRecipe }

export default function ProceduralItemGeneratorPanel() {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<ForgeItemGeneratorRecipe>()
  const [variations, setVariations] = useState<ForgeItemGeneratorRecipe[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Recipe changes only affect the preview until you apply them to the item.')

  useEffect(() => { void loadSkillboundWorkspace().then((project) => {
    setWorkspace(project)
    const first = project.gameplay.items.find((entry) => generatorForItem(entry))
    setSelectedId(first?.id ?? '')
    setDraft(first ? itemGeneratorRecipe(first) : undefined)
  }).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open generator.')) }, [])

  const supported = useMemo(() => workspace?.gameplay.items.filter((entry) => generatorForItem(entry)) ?? [], [workspace])
  const item = supported.find((entry) => entry.id === selectedId)
  const generator = item ? generatorForItem(item) : undefined

  const choose = (id: string) => {
    setSelectedId(id)
    const next = supported.find((entry) => entry.id === id)
    setDraft(next ? itemGeneratorRecipe(next) : undefined)
    setVariations([])
  }

  const saveRecipe = () => {
    if (!workspace || !item || !draft) return
    const items = workspace.gameplay.items.map((entry) => entry.id === item.id ? ({ ...entry, generatorRecipe: draft } as ForgeItemDefinition) : entry)
    const saved = saveSkillboundWorkspace({ ...workspace, gameplay: { ...workspace.gameplay, items } })
    setWorkspace(saved)
    setStatus(`Recipe saved · seed ${draft.seed}. The current master model was not changed.`)
  }

  const applyToItem = async () => {
    if (!workspace || !item || !draft) return
    setBusy(true)
    try {
      setStatus('Building the master GLB from this recipe…')
      const asset = await generateProceduralItemMaster(item, draft)
      let next: GeneratedItem = { ...item, generatorRecipe: draft, modelAssetId: asset.id, visual: { ...itemVisual(item), masterAssetId: asset.id } }

      setStatus('Auto-fitting inventory, world-drop and equipped presentations…')
      const fitted = await autoFitItemPresentation(next, 'all')
      next = { ...next, visual: fitted.visual }

      setStatus('Rendering the inventory icon…')
      const iconId = `skillbound:item-icon:${item.id}`
      const blob = await renderItemIconBlob(next, 256)
      await saveAsset({ id: iconId, name: `${item.name} Inventory Icon`, category: 'textures', kind: 'image', mime: 'image/png', tags: ['skillbound','item-icon',item.id,'procedural'], source: `Item Forge generator · seed ${draft.seed}`, blob })
      next = { ...next, visual: { ...next.visual!, inventory: { ...next.visual!.inventory, iconAssetId: iconId, autoIcon: true } } }

      const items = workspace.gameplay.items.map((entry) => entry.id === item.id ? next : entry)
      const saved = saveSkillboundWorkspace({ ...workspace, gameplay: { ...workspace.gameplay, items } })
      setWorkspace(saved)
      setStatus(`Applied to ${item.name} · master GLB replaced, presentations fitted and inventory icon regenerated.`)

      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('forge:item-generator-applied', { detail: { itemId: item.id, assetId: asset.id } }))
      }, 300)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not apply this generated model.')
    } finally { setBusy(false) }
  }

  if (!workspace) return <section className="item-generator-panel compact"><Sparkles size={14}/><span>{status}</span></section>
  if (!supported.length) return <section className="item-generator-panel compact"><Sparkles size={14}/><span>Create a Weapon → Sword item to use the procedural generator.</span></section>
  if (!item || !generator || !draft) return null

  const groups = Array.from(new Set(generator.fields.map((field) => field.group)))
  return <section className="item-generator-panel">
    <header>
      <div><span>PROCEDURAL MODEL GENERATOR</span><strong>{generator.label}</strong><small>Edit the recipe live. Apply only when the preview is the model you want this item to use.</small></div>
      <div className="item-generator-actions">
        <select value={selectedId} onChange={(e) => choose(e.target.value)}>{supported.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
        <button onClick={saveRecipe} title="Save the editable recipe without replacing the current item model"><Save size={12}/>Save recipe</button>
        <button className="primary" disabled={busy} onClick={() => void applyToItem()} title="Create the GLB, assign it as this item's master model, auto-fit all presentations and regenerate its inventory icon"><Boxes size={12}/>{busy ? 'Applying…' : 'Apply to item'}</button>
      </div>
    </header>

    <div className="item-generator-body">
      <div className="item-generator-preview">
        <ProceduralItemRecipePreview recipe={draft}/>
        <div className="seed-row"><input type="number" min="1" value={draft.seed} onChange={(e) => setDraft({ ...draft, seed: Math.max(1, Math.floor(Number(e.target.value) || 1)), preset: 'custom' })}/><button onClick={() => setDraft(randomizeGeneratorRecipe(draft))}><Dices size={12}/>Randomize</button><button onClick={() => setVariations(variationRecipes(draft, 12))}><Sparkles size={12}/>Generate 12</button></div>
        <p><strong>Preview only.</strong> Randomize and sliders do not alter the item until you press <b>Apply to item</b>.</p>
      </div>

      <div className="item-generator-controls">
        <label className="preset"><span>Preset</span><select value={draft.preset} onChange={(e) => setDraft(applyGeneratorPreset(draft, e.target.value))}><option value="custom">Custom</option>{generator.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        {groups.map((group) => <fieldset key={group}><legend>{group}</legend>{generator.fields.filter((field) => field.group === group).map((field) => field.kind === 'range' ? <label key={field.key}><span>{field.label}<b>{Number(draft.params[field.key] ?? field.min).toFixed(2)}</b></span><input type="range" min={field.min} max={field.max} step={field.step} value={Number(draft.params[field.key] ?? field.min)} onChange={(e) => setDraft(updateGeneratorParam(draft, field.key, Number(e.target.value)))}/></label> : <label key={field.key}><span>{field.label}</span><select value={String(draft.params[field.key] ?? '')} onChange={(e) => setDraft(updateGeneratorParam(draft, field.key, e.target.value))}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</fieldset>)}
        <fieldset><legend>Materials</legend>{generator.materials.map((field) => <label key={field.key}><span>{field.label}</span><select value={draft.materials[field.key] ?? ''} onChange={(e) => setDraft(updateGeneratorMaterial(draft, field.key, e.target.value))}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</fieldset>
      </div>
    </div>

    {variations.length > 0 && <div className="item-generator-variations">{variations.map((recipe, index) => <button className={draft.seed === recipe.seed ? 'active' : ''} aria-pressed={draft.seed === recipe.seed} key={`${recipe.seed}-${index}`} onClick={() => setDraft(recipe)}><b>#{index + 1}</b><span>Seed {recipe.seed}</span><small>{String(recipe.params.bladeStyle)} · {Number(recipe.params.bladeLength).toFixed(2)} · {String(recipe.params.guardStyle)}</small></button>)}</div>}

    <footer><span>{status}</span><strong>Apply to item = master GLB + auto-fit + inventory icon</strong></footer>
  </section>
}
