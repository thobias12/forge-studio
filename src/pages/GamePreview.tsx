import { useEffect, useMemo, useState } from 'react'
import { Box, Boxes, CheckCircle2, Clipboard, Download, Gauge, Gamepad2, Grid3X3, Heart, PackageOpen, Play, Pause, RefreshCcw, ScanLine, Triangle, WandSparkles } from 'lucide-react'
import GamePreviewViewport, { type GamePreviewReport, type PreviewEnvironment, type PreviewShape } from '../components/GamePreviewViewport'
import { listAssets, type LibraryAsset } from '../lib/library'
import '../game-preview.css'

export default function GamePreview() {
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [assetId, setAssetId] = useState('')
  const [query, setQuery] = useState('')
  const [environment, setEnvironment] = useState<PreviewEnvironment>('studio')
  const [shape, setShape] = useState<PreviewShape>('sphere')
  const [showGrid, setShowGrid] = useState(true)
  const [showBounds, setShowBounds] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [clipName, setClipName] = useState('')
  const [report, setReport] = useState<GamePreviewReport>()
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState('Choose a Forge asset to preview it under game-like conditions.')

  useEffect(() => {
    void listAssets().then((items) => {
      const supported = items.filter(isPreviewable)
      setAssets(supported)
      if (supported[0]) setAssetId(supported[0].id)
    }).catch(() => setStatus('Could not open the Shared Asset Library.'))
  }, [])

  const selected = assets.find((asset) => asset.id === assetId)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return assets
    return assets.filter((asset) => `${asset.name} ${asset.category} ${asset.kind} ${asset.tags.join(' ')}`.toLowerCase().includes(needle))
  }, [assets, query])

  useEffect(() => {
    setReport(undefined)
    setClipName('')
    setPlaying(true)
    if (selected) setStatus(`Previewing ${selected.name}.`)
  }, [selected?.id])

  useEffect(() => {
    if (!report?.animations.length) return
    if (!report.animations.some((clip) => clip.name === clipName)) setClipName(report.animations[0].name)
  }, [report, clipName])

  const code = integrationCode(selected)

  const copyCode = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const downloadRuntime = async () => {
    try {
      const response = await fetch('./runtime/ForgeRuntime.ts')
      if (!response.ok) throw new Error('Runtime source could not be loaded.')
      const source = await response.blob()
      const url = URL.createObjectURL(source)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'ForgeRuntime.ts'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus('ForgeRuntime.ts downloaded. Put it somewhere inside your game source tree.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not download Forge Runtime.')
    }
  }

  return (
    <div className="game-preview-page">
      <aside className="game-preview-assets">
        <div className="game-preview-panel-title"><Gamepad2 size={15} /><span>GAME PREVIEW</span></div>
        <div className="game-preview-search"><ScanLine size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search preview assets…" /></div>
        <div className="game-preview-asset-list">
          {filtered.map((asset) => (
            <button key={asset.id} className={asset.id === assetId ? 'active' : ''} onClick={() => setAssetId(asset.id)}>
              <span className="game-preview-asset-icon"><AssetIcon asset={asset} /></span>
              <span><strong>{asset.name}</strong><em>{asset.category} · {asset.kind}</em></span>
              {asset.favorite && <Heart size={11} fill="currentColor" />}
            </button>
          ))}
          {!filtered.length && <div className="game-preview-no-assets"><Boxes size={24} /><span>No matching preview assets.</span></div>}
        </div>
        <div className="game-preview-runtime-card">
          <span className="eyebrow">FORGE RUNTIME</span>
          <strong>Reusable Three.js loader</strong>
          <p>Load the same character and material manifests that Forge sends to your games.</p>
          <button className="secondary-button" onClick={() => void downloadRuntime()}><Download size={14} /> Download runtime</button>
        </div>
      </aside>

      <main className="game-preview-workspace">
        <header className="game-preview-toolbar">
          <div><span className="eyebrow">GAME PREVIEW STUDIO</span><strong>{selected?.name ?? 'No asset selected'}</strong></div>
          <div className="game-preview-toolbar-actions">
            <label>Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value as PreviewEnvironment)}><option value="studio">Studio</option><option value="neutral">Neutral</option><option value="night">Night</option></select></label>
            <button className={showGrid ? 'active' : ''} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={13} /> Grid</button>
            <button className={showBounds ? 'active' : ''} onClick={() => setShowBounds((value) => !value)}><Box size={13} /> Bounds</button>
            <button className={wireframe ? 'active' : ''} onClick={() => setWireframe((value) => !value)}><Triangle size={13} /> Wire</button>
          </div>
        </header>

        <div className="game-preview-stage">
          <GamePreviewViewport
            asset={selected}
            environment={environment}
            shape={shape}
            showGrid={showGrid}
            showBounds={showBounds}
            wireframe={wireframe}
            playing={playing}
            speed={speed}
            clipName={clipName}
            onReport={setReport}
          />
          {!selected && <div className="game-preview-empty"><Gamepad2 size={40} /><h2>Preview Forge assets like they are already in-game</h2><p>Choose a character, material, GLB or texture from the Shared Library.</p></div>}
          {selected?.category === 'materials' && (
            <div className="game-preview-shapes">
              {(['sphere', 'cube', 'plane'] as PreviewShape[]).map((item) => <button key={item} className={shape === item ? 'active' : ''} onClick={() => setShape(item)}>{item}</button>)}
            </div>
          )}
          {report?.animations.length ? (
            <div className="game-preview-animation">
              <button onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
              <select value={clipName} onChange={(event) => setClipName(event.target.value)}>{report.animations.map((clip) => <option key={clip.name} value={clip.name}>{clip.name} · {clip.duration.toFixed(2)}s</option>)}</select>
              <label>Speed <input type="range" min="0.25" max="2" step="0.05" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /><b>{speed.toFixed(2)}×</b></label>
              <button title="Restart clip" onClick={() => { const current = clipName; setClipName(''); requestAnimationFrame(() => setClipName(current)) }}><RefreshCcw size={13} /></button>
            </div>
          ) : null}
        </div>
      </main>

      <aside className="game-preview-inspector">
        <div className="game-preview-panel-title"><Gauge size={15} /><span>RUNTIME INSPECTOR</span></div>
        {report ? (
          <>
            <div className="game-preview-stats">
              <Stat label="Meshes" value={report.meshes.toLocaleString()} />
              <Stat label="Triangles" value={report.triangles.toLocaleString()} />
              <Stat label="Materials" value={report.materials.toLocaleString()} />
              <Stat label="Textures" value={report.textures.toLocaleString()} />
              <Stat label="Draw calls*" value={report.drawCalls.toLocaleString()} />
              <Stat label="Animations" value={report.animations.length.toLocaleString()} />
            </div>
            <div className="game-preview-block">
              <div className="property-title"><span>BOUNDS</span><em>METERS / GLTF UNITS</em></div>
              <div className="game-preview-bounds"><span>X <b>{report.bounds[0].toFixed(2)}</b></span><span>Y <b>{report.bounds[1].toFixed(2)}</b></span><span>Z <b>{report.bounds[2].toFixed(2)}</b></span></div>
            </div>
            <div className="game-preview-block">
              <div className="property-title"><span>RUNTIME CHECK</span><em>{report.warnings.length === 1 && report.warnings[0].startsWith('No obvious') ? 'GOOD' : 'CHECK'}</em></div>
              <div className="game-preview-warnings">
                {report.warnings.map((warning) => <div key={warning} className={warning.startsWith('No obvious') ? 'good' : ''}>{warning.startsWith('No obvious') ? <CheckCircle2 size={13} /> : <WandSparkles size={13} />}<span>{warning}</span></div>)}
              </div>
            </div>
          </>
        ) : <div className="game-preview-loading">{selected ? 'Analyzing asset…' : 'Select an asset to begin.'}</div>}

        <div className="game-preview-block game-preview-integration">
          <div className="property-title"><span>INTEGRATION</span><em>THREE.JS</em></div>
          <p>Send the asset to your game from Forge Library, add <code>ForgeRuntime.ts</code>, then load its Forge manifest.</p>
          <pre>{code || '// Select a previewable asset'}</pre>
          <button className="secondary-button" disabled={!code} onClick={() => void copyCode()}>{copied ? <CheckCircle2 size={14} /> : <Clipboard size={14} />} {copied ? 'Copied' : 'Copy integration code'}</button>
        </div>
        {status && <div className="game-preview-status">{status}</div>}
      </aside>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function AssetIcon({ asset }: { asset: LibraryAsset }) {
  if (asset.category === 'characters') return <PackageOpen size={15} />
  if (asset.category === 'materials') return <WandSparkles size={15} />
  return <Box size={15} />
}

function isPreviewable(asset: LibraryAsset) {
  return asset.kind === 'glb' || asset.kind === 'image' || asset.category === 'characters' || asset.category === 'materials'
}

function integrationCode(asset?: LibraryAsset) {
  if (!asset) return ''
  const slug = safeSlug(asset.name)
  if (asset.category === 'characters') {
    return `import { ForgeRuntime } from './forge/ForgeRuntime'\n\nconst forge = new ForgeRuntime()\nconst character = await forge.loadCharacter('/assets/forge/${slug}/character.forge.json')\nscene.add(character.root)\ncharacter.play()`
  }
  if (asset.category === 'materials') {
    return `import { ForgeRuntime } from './forge/ForgeRuntime'\n\nconst forge = new ForgeRuntime()\nconst material = await forge.loadMaterial('/assets/forge/${slug}/material.forge.json')\nmesh.material = material`
  }
  if (asset.kind === 'image') {
    return `import { ForgeRuntime } from './forge/ForgeRuntime'\n\nconst forge = new ForgeRuntime()\nconst texture = await forge.loadTexture('/assets/forge/${safeFilename(asset.name, 'png')}')\nmaterial.map = texture`
  }
  return `import { ForgeRuntime } from './forge/ForgeRuntime'\n\nconst forge = new ForgeRuntime()\nconst model = await forge.loadModel('/assets/forge/${safeFilename(asset.name, 'glb')}')\nscene.add(model.scene)`
}

function safeSlug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'forge-asset'
}

function safeFilename(name: string, extension: string) {
  const base = name.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'forge-asset'
  return `${base}.${extension}`
}
