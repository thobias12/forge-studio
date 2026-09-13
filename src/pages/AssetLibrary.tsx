import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Box, Boxes, Check, Download, FileUp, FolderGit2, FolderOpen, Heart, Plus, Search, Send, Trash2, X } from 'lucide-react'
import ModelViewer from '../components/ModelViewer'
import {
  deleteAsset,
  detectAssetCategory,
  detectAssetKind,
  listAssets,
  listProjects,
  saveAsset,
  saveProject,
  sendAssetToProject,
  updateAsset,
  type AssetCategory,
  type LibraryAsset,
  type ProjectProfile,
} from '../lib/library'
import '../library.css'
import '../library-v084.css'

const categories: { id: 'all' | AssetCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'characters', label: 'Characters' },
  { id: 'animations', label: 'Animations' },
  { id: 'props', label: 'Props' },
  { id: 'materials', label: 'Materials' },
  { id: 'textures', label: 'Textures' },
  { id: 'environment', label: 'Environment' },
  { id: 'audio', label: 'Audio' },
]

type SortMode = 'updated' | 'name' | 'size'

export default function AssetLibrary() {
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [projects, setProjects] = useState<ProjectProfile[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [batchIds, setBatchIds] = useState<string[]>([])
  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState<'all' | AssetCategory>('all')
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})

  const refresh = async () => {
    const [nextAssets, nextProjects] = await Promise.all([listAssets(), listProjects()])
    setAssets(nextAssets)
    setProjects(nextProjects)
    setBatchIds((ids) => ids.filter((id) => nextAssets.some((asset) => asset.id === id)))
    if (!selectedId && nextAssets[0]) setSelectedId(nextAssets[0].id)
    if (!projectId && nextProjects[0]) setProjectId(nextProjects[0].id)
  }

  useEffect(() => { void refresh() }, [])

  const selected = assets.find((asset) => asset.id === selectedId)
  const project = projects.find((item) => item.id === projectId)
  const batchedAssets = assets.filter((asset) => batchIds.includes(asset.id))
  const sendTargets = batchedAssets.length ? batchedAssets : selected ? [selected] : []

  useEffect(() => {
    if (!selected || !['glb', 'image', 'audio'].includes(selected.kind)) {
      setPreviewUrl('')
      return undefined
    }
    const url = URL.createObjectURL(selected.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selected?.id, selected?.updatedAt])

  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const asset of assets) {
      if (asset.kind !== 'image') continue
      urls[asset.id] = URL.createObjectURL(asset.blob)
    }
    setThumbnailUrls(urls)
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
  }, [assets])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const result = assets.filter((asset) => {
      if (category !== 'all' && asset.category !== category) return false
      if (favoritesOnly && !asset.favorite) return false
      if (!needle) return true
      return `${asset.name} ${asset.category} ${asset.tags.join(' ')} ${asset.source ?? ''}`.toLowerCase().includes(needle)
    })

    return [...result].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name)
      if (sortMode === 'size') return b.size - a.size
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [assets, category, favoritesOnly, query, sortMode])

  const importFiles = async (files?: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        await saveAsset({
          name: file.name.replace(/\.(glb|gltf|forge-motion\.json)$/i, ''),
          category: detectAssetCategory(file),
          kind: detectAssetKind(file),
          mime: file.type || 'application/octet-stream',
          tags: [],
          source: 'Imported into Forge',
          blob: file,
        })
      }
      setStatus(`${files.length} asset${files.length === 1 ? '' : 's'} added to the shared library.`)
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import the asset.')
    } finally {
      setBusy(false)
    }
  }

  const patchSelected = async (patch: Partial<LibraryAsset>) => {
    if (!selected) return
    const next = await updateAsset({ ...selected, ...patch })
    setAssets((items) => items.map((item) => item.id === next.id ? next : item))
  }

  const removeSelected = async () => {
    if (!selected) return
    await deleteAsset(selected.id)
    const remaining = assets.filter((asset) => asset.id !== selected.id)
    setAssets(remaining)
    setBatchIds((ids) => ids.filter((id) => id !== selected.id))
    setSelectedId(remaining[0]?.id ?? '')
    setStatus(`${selected.name} removed from Forge Library.`)
  }

  const connectProjectFolder = async () => {
    if (!project) return
    const picker = (window as any).showDirectoryPicker
    if (typeof picker !== 'function') {
      setStatus('Direct folder connection needs a Chromium desktop browser. Send to Game will use downloads instead.')
      return
    }
    try {
      const directoryHandle = await picker({ mode: 'readwrite' })
      const next = { ...project, directoryHandle, connectedFolderName: directoryHandle.name }
      await saveProject(next)
      setProjects((items) => items.map((item) => item.id === next.id ? next : item))
      setStatus(`${project.name} connected to ${directoryHandle.name}.`)
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') setStatus('Could not connect that project folder.')
    }
  }

  const updateProjectPath = async (assetPath: string) => {
    if (!project) return
    const next = { ...project, assetPath }
    await saveProject(next)
    setProjects((items) => items.map((item) => item.id === next.id ? next : item))
  }

  const addProject = async () => {
    const name = window.prompt('Project name')?.trim()
    if (!name) return
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`
    const next: ProjectProfile = { id, name, assetPath: 'public/assets/forge' }
    await saveProject(next)
    setProjects((items) => [...items, next])
    setProjectId(id)
    setStatus(`${name} added as a Forge project.`)
  }

  const toggleBatch = (id: string) => {
    setBatchIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])
  }

  const selectAllFiltered = () => {
    setBatchIds((ids) => [...new Set([...ids, ...filtered.map((asset) => asset.id)])])
  }

  const sendSelected = async () => {
    if (!sendTargets.length || !project) return
    setBusy(true)
    const names = sendTargets.map((asset) => asset.name)
    setStatus(`Sending ${sendTargets.length === 1 ? names[0] : `${sendTargets.length} assets`} to ${project.name}…`)
    try {
      let folderWrites = 0
      let downloads = 0
      for (const asset of sendTargets) {
        const result = await sendAssetToProject(asset, project)
        if (result.mode === 'folder') folderWrites += 1
        else downloads += 1
      }
      if (folderWrites === sendTargets.length) {
        setStatus(`${sendTargets.length} asset${sendTargets.length === 1 ? '' : 's'} written directly to ${project.name}/${project.assetPath}.`)
      } else if (downloads === sendTargets.length) {
        setStatus(`${sendTargets.length} asset${sendTargets.length === 1 ? '' : 's'} exported with Forge manifests. Connect a local repo folder for direct writes.`)
      } else {
        setStatus(`${folderWrites} direct write${folderWrites === 1 ? '' : 's'} and ${downloads} download export${downloads === 1 ? '' : 's'} completed.`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Send to Game failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="library-page">
      <header className="library-toolbar">
        <div><span className="eyebrow">SHARED ASSET LIBRARY</span><h1>Forge Library</h1></div>
        <div className="library-toolbar-actions">
          {batchIds.length > 0 && <span className="library-selection-count">{batchIds.length} selected</span>}
          <label className="secondary-button file-button"><FileUp size={16} /> Import assets<input multiple type="file" onChange={(event) => void importFiles(event.target.files)} /></label>
        </div>
      </header>

      <div className="library-layout">
        <aside className="library-left">
          <div className="library-search"><Search size={15} /><input placeholder="Search assets…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <button className={`library-favorites-filter ${favoritesOnly ? 'active' : ''}`} onClick={() => setFavoritesOnly((value) => !value)}><Heart size={13} fill={favoritesOnly ? 'currentColor' : 'none'} /><span>Favorites only</span><b>{assets.filter((asset) => asset.favorite).length}</b></button>
          <div className="library-categories">
            {categories.map((item) => (
              <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}>
                <span>{item.label}</span><b>{item.id === 'all' ? assets.length : assets.filter((asset) => asset.category === item.id).length}</b>
              </button>
            ))}
          </div>
          <div className="library-projects-title"><span>PROJECTS</span><button onClick={addProject}><Plus size={13} /></button></div>
          <div className="library-project-list">
            {projects.map((item) => <button key={item.id} className={item.id === projectId ? 'active' : ''} onClick={() => setProjectId(item.id)}><FolderGit2 size={14} /><span>{item.name}</span>{item.connectedFolderName && <i />}</button>)}
          </div>
        </aside>

        <main className="library-main">
          <div className="library-grid-heading library-grid-toolbar">
            <div><span>{category === 'all' ? 'ALL ASSETS' : category.toUpperCase()}</span><b>{filtered.length} items</b></div>
            <div className="library-grid-actions">
              <button disabled={!filtered.length} onClick={selectAllFiltered}><Check size={12} /> Select visible</button>
              {batchIds.length > 0 && <button onClick={() => setBatchIds([])}><X size={12} /> Clear</button>}
              <label><ArrowUpDown size={12} /><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="updated">Recently updated</option><option value="name">Name A-Z</option><option value="size">Largest first</option></select></label>
            </div>
          </div>
          {batchIds.length > 0 && (
            <div className="library-batch-bar">
              <span><strong>{batchIds.length}</strong> asset{batchIds.length === 1 ? '' : 's'} selected</span>
              <button className="primary-button" disabled={busy || !project} onClick={sendSelected}><Send size={14} /> {busy ? 'Working…' : `Send batch to ${project?.name ?? 'game'}`}</button>
            </div>
          )}
          {filtered.length ? (
            <div className="library-grid">
              {filtered.map((asset) => {
                const checked = batchIds.includes(asset.id)
                return (
                  <div key={asset.id} role="button" tabIndex={0} className={`library-card ${selectedId === asset.id ? 'active' : ''} ${checked ? 'batch-selected' : ''}`} onClick={() => setSelectedId(asset.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(asset.id) }}>
                    <button className={`library-card-check ${checked ? 'active' : ''}`} title={checked ? 'Remove from batch' : 'Add to batch'} onClick={(event) => { event.stopPropagation(); toggleBatch(asset.id) }}>{checked ? <Check size={12} /> : null}</button>
                    <div className={`library-card-art kind-${asset.kind}`}>
                      {asset.kind === 'image' && thumbnailUrls[asset.id] ? <img className="library-card-image" src={thumbnailUrls[asset.id]} alt="" /> : <AssetGlyph kind={asset.kind} />}
                      <span>{asset.kind.toUpperCase()}</span>
                      {asset.favorite && <Heart size={13} fill="currentColor" />}
                    </div>
                    <div className="library-card-copy"><strong>{asset.name}</strong><span>{asset.category} · {formatBytes(asset.size)}</span></div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="library-empty"><Boxes size={34} /><h3>No assets here</h3><p>{favoritesOnly ? 'No favorites match the current filters.' : 'Import a file or save something from another Forge studio.'}</p></div>
          )}
        </main>

        <aside className="library-inspector">
          <div className="panel-heading"><span>ASSET INSPECTOR</span></div>
          {selected ? (
            <>
              <div className={`library-preview preview-${selected.kind}`}>
                {selected.kind === 'glb' && previewUrl ? <ModelViewer src={previewUrl} /> : null}
                {selected.kind === 'image' && previewUrl ? <img className="library-image-preview" src={previewUrl} alt={selected.name} /> : null}
                {selected.kind === 'audio' && previewUrl ? <div className="library-audio-preview"><AssetGlyph kind="audio" /><audio controls src={previewUrl} /></div> : null}
                {!['glb', 'image', 'audio'].includes(selected.kind) && <div className="library-preview-placeholder"><AssetGlyph kind={selected.kind} /><span>{selected.kind.toUpperCase()}</span></div>}
              </div>
              <div className="library-property"><label>Name</label><input value={selected.name} onChange={(event) => void patchSelected({ name: event.target.value })} /></div>
              <div className="library-property"><label>Category</label><select value={selected.category} onChange={(event) => void patchSelected({ category: event.target.value as AssetCategory })}>{categories.filter((item) => item.id !== 'all').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
              <div className="library-property"><label>Tags</label><input value={selected.tags.join(', ')} placeholder="walk, medieval, player" onChange={(event) => void patchSelected({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></div>
              <button className={`library-favorite ${selected.favorite ? 'active' : ''}`} onClick={() => void patchSelected({ favorite: !selected.favorite })}><Heart size={15} fill={selected.favorite ? 'currentColor' : 'none'} /> {selected.favorite ? 'Favorited' : 'Add to favorites'}</button>

              <div className="send-panel">
                <div className="property-title"><span>SEND TO GAME</span><em>{project?.connectedFolderName ? 'DIRECT' : 'EXPORT'}</em></div>
                {batchIds.length > 0 && <div className="library-batch-note">Batch mode: {batchIds.length} selected asset{batchIds.length === 1 ? '' : 's'} will be sent.</div>}
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                {project && <input value={project.assetPath} onChange={(event) => void updateProjectPath(event.target.value)} placeholder="public/assets/forge" />}
                <button className="secondary-button connect-project" onClick={connectProjectFolder}><FolderOpen size={15} /> {project?.connectedFolderName ? `Connected: ${project.connectedFolderName}` : 'Connect local game repo'}</button>
                <button className="primary-button send-game-button" disabled={busy || !project || !sendTargets.length} onClick={sendSelected}><Send size={15} /> {busy ? 'Working…' : batchIds.length ? `Send ${batchIds.length} to ${project?.name ?? 'game'}` : `Send to ${project?.name ?? 'game'}`}</button>
                <p>Connected projects are written directly into the selected asset path. Without a folder connection Forge downloads each asset plus its game manifest.</p>
              </div>

              <button className="library-delete" onClick={() => void removeSelected()}><Trash2 size={14} /> Remove from library</button>
            </>
          ) : <div className="library-inspector-empty">Select an asset to inspect it.</div>}
          {status && <div className="library-status">{status}</div>}
        </aside>
      </div>
    </div>
  )
}

function AssetGlyph({ kind }: { kind: LibraryAsset['kind'] }) {
  if (kind === 'glb') return <Box size={28} />
  if (kind === 'motion') return <span className="motion-glyph">M</span>
  if (kind === 'image') return <span className="motion-glyph">T</span>
  if (kind === 'audio') return <span className="motion-glyph">A</span>
  return <Download size={26} />
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
