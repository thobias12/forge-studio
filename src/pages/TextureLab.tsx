import { useEffect, useMemo, useState } from 'react'
import { Download, FileImage, FileUp, Layers3, RefreshCw, Save, Sparkles, Waves } from 'lucide-react'
import TextureMaterialPreview, { type TexturePreviewShape } from '../components/TextureMaterialPreview'
import { saveAsset } from '../lib/library'
import { createMaterialPackage, materialPackageBlob, materialSlug } from '../lib/materialPackage'
import { generateTextureSet, makeSeamlessTexture, normalizeTextureImage, type TextureChannel } from '../lib/textureProcessing'
import '../texture.css'

type ChannelState = Partial<Record<TextureChannel, Blob>>

const channelInfo: Array<{ id: TextureChannel; label: string; hint: string }> = [
  { id: 'baseColor', label: 'Base Color', hint: 'sRGB surface color' },
  { id: 'normal', label: 'Normal', hint: 'surface direction detail' },
  { id: 'roughness', label: 'Roughness', hint: 'white = matte' },
  { id: 'ao', label: 'Ambient Occlusion', hint: 'cavity shading' },
]

export default function TextureLab() {
  const [name, setName] = useState('New Material')
  const [channels, setChannels] = useState<ChannelState>({})
  const [sourceBase, setSourceBase] = useState<Blob>()
  const [urls, setUrls] = useState<Partial<Record<TextureChannel, string>>>({})
  const [activeChannel, setActiveChannel] = useState<TextureChannel>('baseColor')
  const [shape, setShape] = useState<TexturePreviewShape>('sphere')
  const [repeat, setRepeat] = useState(2)
  const [roughness, setRoughness] = useState(0.62)
  const [metalness, setMetalness] = useState(0)
  const [normalStrength, setNormalStrength] = useState(1)
  const [seamBlend, setSeamBlend] = useState(0.22)
  const [seamApplied, setSeamApplied] = useState(false)
  const [resolution, setResolution] = useState('—')
  const [status, setStatus] = useState('Import a base-color image to begin.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const next: Partial<Record<TextureChannel, string>> = {}
    for (const [key, blob] of Object.entries(channels) as Array<[TextureChannel, Blob | undefined]>) if (blob) next[key] = URL.createObjectURL(blob)
    setUrls((previous) => {
      Object.values(previous).forEach((url) => url && URL.revokeObjectURL(url))
      return next
    })
    return () => Object.values(next).forEach((url) => url && URL.revokeObjectURL(url))
  }, [channels])

  const hasBase = !!channels.baseColor
  const populatedCount = channelInfo.filter((channel) => !!channels[channel.id]).length
  const materialLabel = useMemo(() => `${name} · ${populatedCount}/4 maps${seamApplied ? ' · seamless' : ''}`, [name, populatedCount, seamApplied])
  const parameters = { repeat, roughness, metalness, normalStrength }

  const importBase = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const normalized = await normalizeTextureImage(file)
      setSourceBase(normalized)
      setChannels({ baseColor: normalized })
      setName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
      const dimensions = await getImageDimensions(normalized)
      setResolution(`${dimensions.width} × ${dimensions.height}`)
      setActiveChannel('baseColor')
      setSeamApplied(false)
      setStatus('Base color loaded. Make it seamless, generate PBR maps, or replace channels individually.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import that texture.')
    } finally {
      setBusy(false)
    }
  }

  const replaceChannel = async (channel: TextureChannel, file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const normalized = await normalizeTextureImage(file)
      setChannels((current) => ({ ...current, [channel]: normalized }))
      if (channel === 'baseColor') {
        setSourceBase(normalized)
        setSeamApplied(false)
      }
      setActiveChannel(channel)
      setStatus(`${channelInfo.find((item) => item.id === channel)?.label ?? channel} replaced.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load that channel image.')
    } finally {
      setBusy(false)
    }
  }

  const makeSeamless = async () => {
    if (!sourceBase) return
    setBusy(true)
    setStatus('Building a wrap-safe seamless base texture…')
    try {
      const seamless = await makeSeamlessTexture(sourceBase, seamBlend)
      setChannels({ baseColor: seamless })
      setSeamApplied(true)
      setStatus('Seamless base created. Generate PBR maps to rebuild all channels from it.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not make this texture seamless.')
    } finally {
      setBusy(false)
    }
  }

  const restoreSource = () => {
    if (!sourceBase) return
    setChannels({ baseColor: sourceBase })
    setSeamApplied(false)
    setStatus('Original imported base color restored.')
  }

  const generateMaps = async () => {
    if (!channels.baseColor) return
    setBusy(true)
    setStatus('Generating normal, roughness and AO maps…')
    try {
      const generated = await generateTextureSet(channels.baseColor, normalStrength, roughness)
      setChannels({ baseColor: generated.baseColor, normal: generated.normal, roughness: generated.roughness, ao: generated.ao })
      setResolution(`${generated.width} × ${generated.height}`)
      setStatus('PBR maps generated locally in your browser.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PBR generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const exportChannel = (channel: TextureChannel) => {
    const blob = channels[channel]
    if (!blob) return
    downloadBlob(blob, `${materialSlug(name)}-${channel}.png`)
  }

  const buildPackage = async () => createMaterialPackage(name, channels, parameters)

  const exportPackage = async () => {
    if (!channels.baseColor) return
    setBusy(true)
    try {
      const packageData = await buildPackage()
      downloadBlob(materialPackageBlob(packageData), `${materialSlug(name)}.forge-material.json`)
      setStatus('Game-ready Forge material package exported.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not export this material package.')
    } finally {
      setBusy(false)
    }
  }

  const saveMaterial = async () => {
    if (!channels.baseColor) return
    setBusy(true)
    setStatus('Saving textures and packaged material to Shared Asset Library…')
    try {
      for (const channel of channelInfo) {
        const blob = channels[channel.id]
        if (!blob) continue
        await saveAsset({
          name: `${name} ${channel.label}`,
          category: 'textures',
          kind: 'image',
          mime: 'image/png',
          tags: ['pbr', materialSlug(name), channel.id, ...(seamApplied ? ['seamless'] : [])],
          source: `Texture Lab · ${name}`,
          blob,
        })
      }

      const packageData = await buildPackage()
      await saveAsset({
        name,
        category: 'materials',
        kind: 'file',
        mime: 'application/x-forge-material+json',
        tags: ['pbr', 'material', 'package', materialSlug(name), ...(seamApplied ? ['seamless'] : [])],
        source: 'Forge Texture Lab',
        blob: materialPackageBlob(packageData),
      })
      setStatus(`${name} saved as a packaged material plus ${populatedCount} reusable texture maps. Send the material asset to a game to expand it automatically.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save this material.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="texture-lab">
      <section className="texture-workspace">
        <header className="viewport-toolbar texture-toolbar">
          <div><span className="eyebrow">TEXTURE LAB</span><strong>{materialLabel}</strong></div>
          <div className="toolbar-actions">
            <label className="secondary-button file-button"><FileUp size={15} /> Import image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importBase(event.target.files?.[0])} /></label>
            <button className="secondary-button" disabled={!hasBase || busy} onClick={() => void makeSeamless()}><Waves size={15} /> Make seamless</button>
            <button className="secondary-button" disabled={!hasBase || busy} onClick={() => void generateMaps()}><Sparkles size={15} /> Generate PBR</button>
            <button className="primary-button" disabled={!hasBase || busy} onClick={() => void saveMaterial()}><Save size={15} /> Save material</button>
          </div>
        </header>

        <div className="texture-preview-stage">
          <TextureMaterialPreview baseColorUrl={urls.baseColor} normalUrl={urls.normal} roughnessUrl={urls.roughness} aoUrl={urls.ao} repeat={repeat} roughness={roughness} metalness={metalness} normalStrength={normalStrength} shape={shape} />
          {!hasBase && <div className="texture-empty-state"><div><FileImage size={35} /></div><span className="eyebrow">PBR AUTHORING</span><h2>Drop in a surface image</h2><p>Forge can make it tileable, generate PBR maps and package the complete material for your Three.js games.</p><label className="primary-button file-button"><FileUp size={15} /> Choose image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void importBase(event.target.files?.[0])} /></label></div>}
          <div className="texture-shape-picker">{(['sphere', 'cube', 'plane'] as TexturePreviewShape[]).map((item) => <button key={item} className={shape === item ? 'active' : ''} onClick={() => setShape(item)}>{item}</button>)}</div>
        </div>

        <div className="texture-channel-strip">
          {channelInfo.map((channel) => <button key={channel.id} className={`texture-channel-card ${activeChannel === channel.id ? 'active' : ''}`} onClick={() => setActiveChannel(channel.id)}><div className="texture-channel-thumb">{urls[channel.id] ? <img src={urls[channel.id]} alt="" /> : <Layers3 size={20} />}</div><div><strong>{channel.label}</strong><span>{channels[channel.id] ? channel.hint : 'Not assigned'}</span></div><i className={channels[channel.id] ? 'ready' : ''} /></button>)}
        </div>
      </section>

      <aside className="texture-inspector">
        <div className="inspector-heading"><Layers3 size={15} /> Material Inspector</div>
        <div className="texture-inspector-block">
          <label className="property-label">Material name</label>
          <input className="texture-text-input" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="texture-meta-row"><span>Resolution</span><strong>{resolution}</strong></div>
          <div className="texture-meta-row"><span>Maps</span><strong>{populatedCount}/4</strong></div>
          <div className="texture-meta-row"><span>Tileable</span><strong className={seamApplied ? 'status-good' : ''}>{seamApplied ? 'YES' : 'SOURCE'}</strong></div>
        </div>

        <div className="texture-inspector-block seamless-panel">
          <div className="property-title"><span>SEAMLESS / TILING</span><em>{seamApplied ? 'ACTIVE' : 'READY'}</em></div>
          <TextureSlider label="Seam blend" value={seamBlend} min={0.06} max={0.35} step={0.01} display={`${Math.round(seamBlend * 100)}%`} onChange={setSeamBlend} />
          <p>Forge offsets the source, blends the wrapped seams, then lets PBR generation use the tileable result.</p>
          <div className="seamless-actions"><button className="secondary-button" disabled={!sourceBase || busy} onClick={() => void makeSeamless()}><Waves size={14} /> Apply</button><button className="secondary-button" disabled={!sourceBase || !seamApplied || busy} onClick={restoreSource}><RefreshCw size={14} /> Original</button></div>
        </div>

        <div className="texture-inspector-block">
          <span className="property-label">Material response</span>
          <TextureSlider label="Tiling" value={repeat} min={0.25} max={8} step={0.25} display={`${repeat.toFixed(2)}×`} onChange={setRepeat} />
          <TextureSlider label="Roughness" value={roughness} min={0} max={1} step={0.01} display={`${Math.round(roughness * 100)}%`} onChange={setRoughness} />
          <TextureSlider label="Metalness" value={metalness} min={0} max={1} step={0.01} display={`${Math.round(metalness * 100)}%`} onChange={setMetalness} />
          <TextureSlider label="Normal strength" value={normalStrength} min={0} max={2.5} step={0.05} display={normalStrength.toFixed(2)} onChange={setNormalStrength} />
          <button className="texture-regenerate" disabled={!hasBase || busy} onClick={() => void generateMaps()}><RefreshCw size={14} /> Regenerate generated maps</button>
        </div>

        <div className="texture-inspector-block channel-inspector">
          <div className="property-title"><span>{channelInfo.find((item) => item.id === activeChannel)?.label.toUpperCase()}</span><em>{channels[activeChannel] ? 'READY' : 'EMPTY'}</em></div>
          <div className="channel-large-preview">{urls[activeChannel] ? <img src={urls[activeChannel]} alt="" /> : <Layers3 size={32} />}</div>
          <div className="channel-actions"><label className="secondary-button file-button"><FileUp size={14} /> Replace<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void replaceChannel(activeChannel, event.target.files?.[0])} /></label><button className="secondary-button" disabled={!channels[activeChannel]} onClick={() => exportChannel(activeChannel)}><Download size={14} /> PNG</button></div>
        </div>

        <div className="texture-inspector-block material-package-panel"><span className="property-label">Game package</span><p>One Forge package carries the PBR maps and Three.js material parameters. Sending it to a connected game expands the maps into a ready-to-load folder.</p><button className="secondary-button package-export" disabled={!hasBase || busy} onClick={() => void exportPackage()}><Download size={14} /> Export .forge-material</button></div>
        <div className="texture-status">{busy && <span className="texture-spinner" />}{status}</div>
      </aside>
    </div>
  )
}

function TextureSlider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return <div className="texture-slider"><div><span>{label}</span><strong>{display}</strong></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>
}

function getImageDimensions(blob: Blob) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not inspect the texture dimensions.')) }
    image.src = url
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
