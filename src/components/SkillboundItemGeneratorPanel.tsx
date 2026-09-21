import { useEffect, useMemo, useState } from 'react'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import * as THREE from 'three'
import { loadSkillboundWorkspace, saveSkillboundWorkspace, type ForgeItemDefinition, type ForgeItemRarity } from '../engine/forgeProject'
import { generateSkillboundItem, ITEM_FAMILIES, ITEM_PALETTES, ITEM_TIERS, replaceEquipmentPresentations, type SkillboundItemFamily, type SkillboundItemRecipe } from '../engine/skillboundItems'
import { attachGeneratedArmor, buildGeneratedItemModel, disposeGeneratedModel, isGeneratedArmor, loadEquipmentFoundation } from '../engine/skillboundItemModels'
import { resolveItemIcon } from '../engine/itemIcons'
import type { SkillboundBodyType } from '../lib/characterAssetRegistry'
import SkillboundItemPreview from './SkillboundItemPreview'
import '../item-generator.css'

export default function SkillboundItemGeneratorPanel() {
  const [family,setFamily]=useState<SkillboundItemFamily>('sword');const [seed,setSeed]=useState(18427);const [tier,setTier]=useState<ForgeItemRarity>('rare');const [level,setLevel]=useState(1)
  const [body,setBody]=useState<SkillboundBodyType>('female');const [mode,setMode]=useState<'item'|'equipped'|'drop'>('item')
  const [palette,setPalette]=useState<SkillboundItemRecipe['palette']>('woodland');const [construction,setConstruction]=useState<SkillboundItemRecipe['construction']>('leather')
  const [status,setStatus]=useState('One saved design supplies the icon, ground loot and both fitted body variants.');const [busy,setBusy]=useState(false);const [icon,setIcon]=useState<string>()
  const item=useMemo(()=>{const result=generateSkillboundItem(family,seed,level,tier);result.name=result.name.replace(result.procedural!.palette.charAt(0).toUpperCase()+result.procedural!.palette.slice(1),palette.charAt(0).toUpperCase()+palette.slice(1));result.procedural={...result.procedural!,palette,construction};return result},[family,seed,level,tier,palette,construction])
  useEffect(()=>{let cancelled=false;let url='';setIcon(undefined);void resolveItemIcon(item).then(blob=>{if(blob&&!cancelled){url=URL.createObjectURL(blob);setIcon(url)}});return()=>{cancelled=true;if(url)URL.revokeObjectURL(url)}},[item])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);try{await action()}catch(e){setStatus(e instanceof Error?e.message:'Unable to complete action.')}finally{setBusy(false)}}
  const save=()=>run(async()=>{
    const workspace=await loadSkillboundWorkspace();const items=workspace.gameplay.items.filter(entry=>entry.id!==item.id);items.push(item)
    saveSkillboundWorkspace({...workspace,gameplay:{...workspace.gameplay,items}})
    setStatus(`${item.name} saved. Select it in Gameplay Forge loot tables to roll this item family. Its recipe generates every presentation automatically.`)
    window.dispatchEvent(new CustomEvent('forge:workspace-updated'))
  })
  const replace=()=>run(async()=>{
    const workspace=await loadSkillboundWorkspace();const gameplay=replaceEquipmentPresentations(workspace.gameplay)
    // Seed the missing categories as ordinary editable definitions, not thousands of exported files.
    for(const f of ITEM_FAMILIES)if(!gameplay.items.some(entry=>entry.procedural?.family===f))gameplay.items.push(generateSkillboundItem(f,18427+ITEM_FAMILIES.indexOf(f)*977,1,'common',`skillbound-template-${f}`))
    saveSkillboundWorkspace({...workspace,gameplay})
    setStatus('New generation system applied to existing equipment. IDs, gameplay stats and loot tables are preserved. All 23 families are available in Gameplay Forge; restart the current run to load the changes.')
    window.dispatchEvent(new CustomEvent('forge:workspace-updated'))
  })
  const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const exportModel=()=>run(async()=>{
    let root:THREE.Object3D|undefined
    try {
      if(item.procedural&&isGeneratedArmor(item.procedural)){
        root=await loadEquipmentFoundation(body);if(!attachGeneratedArmor(root,item))throw new Error('Missing fitted armor.')
        root.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.skillboundEquipment)o.visible=false})
      }else root=await buildGeneratedItemModel(item,body)
      if(!root)throw new Error('No generated model available.')
      const data=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true})
      download(new Blob([data as ArrayBuffer],{type:'model/gltf-binary'}),`${item.id}-${body}.glb`)
      setStatus('GLB exported. Armor includes its matching skeleton and fitted equipment; body meshes are excluded.')
    }finally{if(root)disposeGeneratedModel(root)}
  })
  const label=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1)
  return <section className="item-generator-panel skillbound-item-generator">
    <header><div><span>SKILLBOUND EQUIPMENT GENERATOR</span><strong>{item.name}</strong><small>Original 3D parts · persistent recipes · fitted equipment</small></div>{icon&&<img src={icon} width={80} height={80} alt={`${item.name} inventory icon`}/>}</header>
    <div className="item-generator-body"><div className="item-generator-preview"><SkillboundItemPreview item={item} bodyType={body} mode={mode}/><div className="item-generator-actions">{(['item','drop','equipped'] as const).map(value=><button key={value} className={mode===value?'active':''} onClick={()=>setMode(value)}>{label(value)}</button>)}<select aria-label="Fitting body" value={body} onChange={e=>setBody(e.target.value as SkillboundBodyType)}><option value="female">Female Base v1</option><option value="male">Male Base v1</option></select></div></div>
    <div className="item-generator-controls">
      <label>Item family<select value={family} onChange={e=>setFamily(e.target.value as SkillboundItemFamily)}>{ITEM_FAMILIES.map(f=><option key={f}>{f}</option>)}</select></label>
      <label>Seed<input type="number" min={0} max={4294967295} value={seed} onChange={e=>setSeed(Number(e.target.value)>>>0)}/></label><button onClick={()=>setSeed((seed+104729)>>>0)}>New variation</button>
      <label>Rarity<select value={tier} onChange={e=>setTier(e.target.value as ForgeItemRarity)}>{ITEM_TIERS.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Item level<input type="number" min={1} max={100} value={level} onChange={e=>setLevel(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></label>
      <label>Material palette<select value={palette} onChange={e=>setPalette(e.target.value as SkillboundItemRecipe['palette'])}>{Object.keys(ITEM_PALETTES).map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Armor construction<select value={construction} onChange={e=>setConstruction(e.target.value as SkillboundItemRecipe['construction'])}>{['cloth','leather','plate'].map(c=><option key={c}>{c}</option>)}</select></label>
      <p>+{item.damageBonus} damage · +{item.defenseBonus??0} defense</p>{item.itemRoll?.affixes.map(a=><small key={a.name}>{a.name}: +{a.value} {a.stat}<br/></small>)}
    </div></div>
    <div className="item-generator-actions"><button disabled={busy} onClick={()=>void save()}>Save item</button><button disabled={busy} onClick={()=>void exportModel()}>Export {body} GLB</button><button disabled={busy||!icon} onClick={()=>void run(async()=>{const blob=await resolveItemIcon(item);if(blob)download(blob,`${item.id}-icon.png`)})}>Export icon</button><button disabled={busy} onClick={()=>download(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}),`${item.id}.json`)}>Export recipe</button></div>
    <p role="status">{busy?'Working…':status}</p>
    <button disabled={busy} onClick={()=>void replace()}>Use new system for existing equipment</button>
    <small>Replaces old model assignments in the project. Existing library files and the male/female foundation bodies remain available. Tools are equipment models; harvesting actions are not yet implemented.</small>
  </section>
}

