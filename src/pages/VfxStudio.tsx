import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Eye, Grid3X3, Library, Pause, Play, Plus, Redo2, RotateCcw, Save, Sparkles, Trash2, Undo2, WandSparkles } from 'lucide-react'
import VfxPreview, { type VfxPreviewHandle } from '../components/VfxPreview'
import { registerHistoryScope } from '../lib/historyShortcuts'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import { VFX_PRESETS, emitterFromPreset, newVfxPackage, packageFromPreset, parseVfxPackage, vfxPackageBlob, type ForgeVfxEmitter, type ForgeVfxPackage, type VfxPreset } from '../lib/vfxPackage'
import '../vfx-studio.css'

type PresetGroup = 'all' | VfxPreset['group']
const MAX_HISTORY = 50

export default function VfxStudio() {
  const preview = useRef<VfxPreviewHandle>(null)
  const [value, setValue] = useState<ForgeVfxPackage>(() => packageFromPreset(VFX_PRESETS[0]))
  const [selectedEmitterId, setSelectedEmitterId] = useState(value.emitters[0]?.id ?? '')
  const [group, setGroup] = useState<PresetGroup>('all')
  const [playing, setPlaying] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [background, setBackground] = useState<'studio' | 'dark' | 'outdoor'>('studio')
  const [status, setStatus] = useState('Choose a preset or build an effect from multiple emitters.')
  const [savedVfx, setSavedVfx] = useState<LibraryAsset[]>([])
  const [savedId, setSavedId] = useState('')
  const undoStack = useRef<ForgeVfxPackage[]>([])
  const redoStack = useRef<ForgeVfxPackage[]>([])

  const refreshLibrary = async () => {
    const assets = await listAssets()
    const vfx = assets.filter((asset) => asset.category === 'vfx')
    setSavedVfx(vfx)
    if (!savedId && vfx[0]) setSavedId(vfx[0].id)
  }
  useEffect(() => { void refreshLibrary() }, [])

  const clone = (source: ForgeVfxPackage) => JSON.parse(JSON.stringify(source)) as ForgeVfxPackage
  const commit = useCallback((next: ForgeVfxPackage, message?: string) => {
    undoStack.current.push(clone(value)); if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift(); redoStack.current=[]; setValue(next); if(message)setStatus(message)
  }, [value])
  const undo = useCallback(()=>{const previous=undoStack.current.pop();if(!previous)return;redoStack.current.push(clone(value));setValue(previous);setSelectedEmitterId(previous.emitters[0]?.id??'');setStatus('Undid the last VFX action.')},[value])
  const redo = useCallback(()=>{const next=redoStack.current.pop();if(!next)return;undoStack.current.push(clone(value));setValue(next);setSelectedEmitterId(next.emitters[0]?.id??'');setStatus('Redid the last VFX action.')},[value])
  useEffect(()=>registerHistoryScope({undo,redo,label:'VFX Studio'}),[undo,redo])

  const selected = value.emitters.find((item)=>item.id===selectedEmitterId) ?? value.emitters[0]
  useEffect(()=>{if(selected&&!selectedEmitterId)setSelectedEmitterId(selected.id)},[selected?.id])

  const applyPreset = (preset: VfxPreset) => {
    const next=packageFromPreset(preset); commit(next,`${preset.name} preset loaded.`); setSelectedEmitterId(next.emitters[0]?.id??''); setPlaying(true); window.setTimeout(()=>preview.current?.restart(),0)
  }
  const patchPackage = (patch:Partial<ForgeVfxPackage>) => commit({...value,...patch})
  const patchEmitter = (patch:Partial<ForgeVfxEmitter>,history=true) => {
    if(!selected)return
    const next={...value,emitters:value.emitters.map((item)=>item.id===selected.id?{...item,...patch}:item)}
    if(history)commit(next);else setValue(next)
  }
  const addEmitter = () => {const emitter=emitterFromPreset({name:`Emitter ${value.emitters.length+1}`});commit({...value,emitters:[...value.emitters,emitter]},'Emitter added.');setSelectedEmitterId(emitter.id)}
  const duplicateEmitter = () => {if(!selected)return;const copy={...clone({...value,emitters:[selected]}).emitters[0],id:crypto.randomUUID(),name:`${selected.name} Copy`};const index=value.emitters.findIndex((e)=>e.id===selected.id);const emitters=[...value.emitters];emitters.splice(index+1,0,copy);commit({...value,emitters},'Emitter duplicated.');setSelectedEmitterId(copy.id)}
  const removeEmitter = () => {if(!selected||value.emitters.length<=1)return;const emitters=value.emitters.filter((item)=>item.id!==selected.id);commit({...value,emitters},`${selected.name} removed.`);setSelectedEmitterId(emitters[0]?.id??'')}

  const saveToLibrary = async () => {
    const blob=vfxPackageBlob(value)
    await saveAsset({name:value.name.trim()||'Forge VFX',category:'vfx',kind:'file',mime:'application/x-forge-vfx+json',tags:['vfx',...value.emitters.map((e)=>e.style)],source:'Forge VFX Studio',blob})
    setStatus(`${value.name} saved to the Shared Asset Library.`);await refreshLibrary()
  }
  const exportVfx = () => {download(vfxPackageBlob(value),`${safeName(value.name)}.forge-vfx.json`);setStatus(`${value.name} exported as Forge VFX.`)}
  const loadSaved = async () => {const asset=savedVfx.find((item)=>item.id===savedId);if(!asset)return;const parsed=await parseVfxPackage(asset.blob);if(!parsed){setStatus('That library item is not a valid Forge VFX package.');return}commit(parsed,`${asset.name} loaded from the Shared Library.`);setSelectedEmitterId(parsed.emitters[0]?.id??'');setPlaying(true)}
  const filteredPresets=useMemo(()=>VFX_PRESETS.filter((preset)=>group==='all'||preset.group===group),[group])

  return (
    <div className="vfx-studio-page">
      <aside className="vfx-browser">
        <div className="vfx-panel-title"><WandSparkles size={15}/> VFX PRESETS</div>
        <div className="vfx-group-tabs">{(['all','combat','magic','environment','stylized'] as PresetGroup[]).map((item)=><button key={item} className={group===item?'active':''} onClick={()=>setGroup(item)}>{item}</button>)}</div>
        <div className="vfx-preset-list">{filteredPresets.map((preset)=><button key={preset.id} onClick={()=>applyPreset(preset)}><Sparkles size={14}/><span><strong>{preset.name}</strong><em>{preset.description}</em></span></button>)}</div>
        <section className="vfx-library-load"><b>SAVED VFX</b><select value={savedId} onChange={(e)=>setSavedId(e.target.value)}><option value="">Choose effect…</option>{savedVfx.map((asset)=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button disabled={!savedId} onClick={()=>void loadSaved()}><Library size={13}/> Load from Library</button></section>
      </aside>

      <main className="vfx-main">
        <header className="vfx-toolbar">
          <div><span className="eyebrow">VFX STUDIO / LIVE PREVIEW</span><input value={value.name} onChange={(e)=>setValue({...value,name:e.target.value})}/></div>
          <div className="vfx-toolbar-actions"><button title="Undo · Ctrl+Z" onClick={undo}><Undo2 size={14}/></button><button title="Redo · Ctrl+Y" onClick={redo}><Redo2 size={14}/></button><button onClick={()=>{setPlaying(!playing)}}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?'Pause':'Play'}</button><button onClick={()=>{preview.current?.restart();setPlaying(true)}}><RotateCcw size={14}/> Restart</button></div>
        </header>
        <div className="vfx-stage"><VfxPreview ref={preview} value={value} playing={playing} showGrid={showGrid} background={background}/><div className="vfx-preview-controls"><button className={showGrid?'active':''} onClick={()=>setShowGrid(!showGrid)}><Grid3X3 size={13}/> Grid</button><select value={background} onChange={(e)=>setBackground(e.target.value as typeof background)}><option value="studio">Studio</option><option value="dark">Dark</option><option value="outdoor">Outdoor</option></select><span>{value.emitters.filter((e)=>e.enabled).length} active emitters</span></div></div>
        <div className="vfx-timeline"><div className="vfx-timeline-head"><span>Effect duration</span><b>{value.duration.toFixed(2)}s</b><label><input type="checkbox" checked={value.looping} onChange={()=>patchPackage({looping:!value.looping})}/> Loop effect</label></div><input type="range" min="0.1" max="10" step="0.1" value={value.duration} onChange={(e)=>patchPackage({duration:Number(e.target.value)})}/></div>
        <footer className="vfx-status"><span>{status}</span><b>Ctrl+Z undo · Ctrl+Y redo</b></footer>
      </main>

      <aside className="vfx-inspector">
        <div className="vfx-panel-title"><Eye size={15}/> EMITTERS</div>
        <div className="vfx-emitter-list">{value.emitters.map((emitter)=><button key={emitter.id} className={emitter.id===selected?.id?'active':''} onClick={()=>setSelectedEmitterId(emitter.id)}><span className={emitter.enabled?'on':''}/><b>{emitter.name}</b><em>{emitter.style}</em></button>)}</div>
        <div className="vfx-emitter-actions"><button onClick={addEmitter}><Plus size={12}/> Add</button><button disabled={!selected} onClick={duplicateEmitter}><Copy size={12}/> Copy</button><button disabled={!selected||value.emitters.length<=1} onClick={removeEmitter}><Trash2 size={12}/> Delete</button></div>
        {selected&&<>
          <section className="vfx-section"><label>Name<input value={selected.name} onChange={(e)=>patchEmitter({name:e.target.value},false)}/></label><div className="vfx-toggle-row"><label><input type="checkbox" checked={selected.enabled} onChange={()=>patchEmitter({enabled:!selected.enabled})}/> Enabled</label><label><input type="checkbox" checked={selected.looping} onChange={()=>patchEmitter({looping:!selected.looping})}/> Loop emitter</label></div><div className="vfx-select-grid"><label>Shape<select value={selected.shape} onChange={(e)=>patchEmitter({shape:e.target.value as ForgeVfxEmitter['shape']})}><option value="point">Point</option><option value="cone">Cone</option><option value="sphere">Sphere</option><option value="box">Box</option></select></label><label>Style<select value={selected.style} onChange={(e)=>patchEmitter({style:e.target.value as ForgeVfxEmitter['style']})}><option value="soft">Soft</option><option value="spark">Spark</option><option value="square">Square</option></select></label><label>Blend<select value={selected.blendMode} onChange={(e)=>patchEmitter({blendMode:e.target.value as ForgeVfxEmitter['blendMode']})}><option value="additive">Additive</option><option value="normal">Normal</option></select></label></div></section>
          <section className="vfx-section"><div className="vfx-section-title">EMISSION</div><Range label="Spawn / sec" value={selected.spawnRate} min={0} max={250} step={1} onChange={(v)=>patchEmitter({spawnRate:v})}/><Range label="Burst" value={selected.burst} min={0} max={300} step={1} onChange={(v)=>patchEmitter({burst:v})}/><Range label="Max particles" value={selected.maxParticles} min={20} max={1000} step={10} onChange={(v)=>patchEmitter({maxParticles:v})}/><Range label="Lifetime" value={selected.lifetime} min={.05} max={6} step={.05} unit="s" onChange={(v)=>patchEmitter({lifetime:v})}/><Range label="Speed" value={selected.speed} min={0} max={12} step={.1} onChange={(v)=>patchEmitter({speed:v})}/><Range label="Spread" value={selected.spreadDeg} min={0} max={180} step={1} unit="°" onChange={(v)=>patchEmitter({spreadDeg:v})}/><Range label="Drag" value={selected.drag} min={0} max={4} step={.05} onChange={(v)=>patchEmitter({drag:v})}/></section>
          <section className="vfx-section"><div className="vfx-section-title">OVER LIFETIME</div><div className="vfx-color-row"><label>Start<input type="color" value={selected.startColor} onChange={(e)=>patchEmitter({startColor:e.target.value})}/></label><span>→</span><label>End<input type="color" value={selected.endColor} onChange={(e)=>patchEmitter({endColor:e.target.value})}/></label></div><Range label="Start size" value={selected.startSize} min={.005} max={1.2} step={.005} onChange={(v)=>patchEmitter({startSize:v})}/><Range label="End size" value={selected.endSize} min={0} max={1.2} step={.005} onChange={(v)=>patchEmitter({endSize:v})}/><Range label="Start alpha" value={selected.startAlpha} min={0} max={1} step={.02} onChange={(v)=>patchEmitter({startAlpha:v})}/><Range label="End alpha" value={selected.endAlpha} min={0} max={1} step={.02} onChange={(v)=>patchEmitter({endAlpha:v})}/></section>
          <section className="vfx-section"><div className="vfx-section-title">PHYSICS</div><Vector label="Direction" value={selected.direction} step={.1} onChange={(v)=>patchEmitter({direction:v})}/><Vector label="Gravity" value={selected.gravity} step={.1} onChange={(v)=>patchEmitter({gravity:v})}/><Vector label="Position" value={selected.position} step={.05} onChange={(v)=>patchEmitter({position:v})}/>{selected.shape==='box'&&<Vector label="Box size" value={selected.boxSize} step={.1} onChange={(v)=>patchEmitter({boxSize:v})}/>}</section>
        </>}
        <section className="vfx-output"><button className="primary-button" onClick={()=>void saveToLibrary()}><Save size={14}/> Save VFX to Library</button><button className="secondary-button" onClick={exportVfx}><Download size={14}/> Export Forge VFX</button></section>
      </aside>
    </div>
  )
}

function Range({label,value,min,max,step,unit='',onChange}:{label:string;value:number;min:number;max:number;step:number;unit?:string;onChange:(v:number)=>void}){return <label className="vfx-range"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))}/><b>{value.toFixed(step<.1?2:step<1?1:0)}{unit}</b></label>}
function Vector({label,value,step,onChange}:{label:string;value:[number,number,number];step:number;onChange:(v:[number,number,number])=>void}){return <div className="vfx-vector"><span>{label}</span><div>{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}><i>{axis}</i><input type="number" step={step} value={Number(value[i].toFixed(2))} onChange={(e)=>{const next=[...value] as [number,number,number];next[i]=Number(e.target.value);onChange(next)}}/></label>)}</div></div>}
function safeName(value:string){return value.trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'forge-vfx'}
function download(blob:Blob,filename:string){const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1200)}
