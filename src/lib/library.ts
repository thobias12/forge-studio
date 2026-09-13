export type AssetCategory = 'characters' | 'animations' | 'props' | 'materials' | 'textures' | 'environment' | 'audio'
export type AssetKind = 'glb' | 'motion' | 'image' | 'audio' | 'file'

export type LibraryAsset = {
  id: string
  name: string
  category: AssetCategory
  kind: AssetKind
  mime: string
  size: number
  createdAt: string
  updatedAt: string
  tags: string[]
  favorite: boolean
  source?: string
  blob: Blob
}

export type ProjectProfile = {
  id: string
  name: string
  repo?: string
  assetPath: string
  connectedFolderName?: string
  directoryHandle?: unknown
}

const DB_NAME = 'forge-studio-library'
const DB_VERSION = 1
const ASSETS = 'assets'
const PROJECTS = 'projects'

const DEFAULT_PROJECTS: ProjectProfile[] = [
  { id: 'ashford', name: 'Ashford', repo: 'thobias12/ashford', assetPath: 'public/assets/forge' },
  { id: 'wobblepaws', name: 'WobblePaws', repo: 'thobias12/WobblePaws', assetPath: 'public/assets/forge' },
  { id: 'crown-stone', name: 'Crown & Stone', assetPath: 'public/assets/forge' },
  { id: 'dwarf-mine', name: 'Dwarf Mining', assetPath: 'public/assets/forge' },
]

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open Forge Library.'))
  })
}

function withStore<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = work(tx.objectStore(storeName))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Forge Library request failed.'))
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onerror = () => { const error = tx.error ?? new Error('Forge Library transaction failed.'); db.close(); reject(error) }
    tx.onabort = () => { const error = tx.error ?? new Error('Forge Library transaction was aborted.'); db.close(); reject(error) }
  }))
}


export async function listAssets() {
  const items = await withStore(ASSETS, 'readonly', (store) => store.getAll()) as LibraryAsset[]
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getAsset(id: string) {
  return await withStore(ASSETS, 'readonly', (store) => store.get(id)) as LibraryAsset | undefined
}

export async function saveAsset(input: Omit<LibraryAsset, 'id' | 'size' | 'createdAt' | 'updatedAt' | 'favorite'> & { id?: string; favorite?: boolean }) {
  const now = new Date().toISOString()
  const asset: LibraryAsset = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    category: input.category,
    kind: input.kind,
    mime: input.mime || input.blob.type || 'application/octet-stream',
    size: input.blob.size,
    createdAt: now,
    updatedAt: now,
    tags: input.tags ?? [],
    favorite: input.favorite ?? false,
    source: input.source,
    blob: input.blob,
  }
  await withStore(ASSETS, 'readwrite', (store) => store.put(asset))
  return asset
}

export async function updateAsset(asset: LibraryAsset) {
  const next = { ...asset, updatedAt: new Date().toISOString(), size: asset.blob.size }
  await withStore(ASSETS, 'readwrite', (store) => store.put(next))
  return next
}

export async function deleteAsset(id: string) {
  await withStore(ASSETS, 'readwrite', (store) => store.delete(id))
}

export async function listProjects() {
  const items = await withStore(PROJECTS, 'readonly', (store) => store.getAll()) as ProjectProfile[]
  if (items.length) return items
  for (const project of DEFAULT_PROJECTS) await saveProject(project)
  return DEFAULT_PROJECTS
}

export async function saveProject(project: ProjectProfile) {
  await withStore(PROJECTS, 'readwrite', (store) => store.put(project))
  return project
}

export async function deleteProject(id: string) {
  await withStore(PROJECTS, 'readwrite', (store) => store.delete(id))
}

export function detectAssetCategory(file: File): AssetCategory {
  const name = file.name.toLowerCase()
  if (name.endsWith('.forge-motion.json')) return 'animations'
  if (name.endsWith('.glb') || name.endsWith('.gltf')) return 'props'
  if (/\.(png|jpe?g|webp|ktx2|hdr)$/i.test(name)) return 'textures'
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio'
  return 'props'
}

export function detectAssetKind(file: File): AssetKind {
  const name = file.name.toLowerCase()
  if (name.endsWith('.forge-motion.json')) return 'motion'
  if (name.endsWith('.glb') || name.endsWith('.gltf')) return 'glb'
  if (/\.(png|jpe?g|webp|ktx2|hdr)$/i.test(name)) return 'image'
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio'
  return 'file'
}

export function safeAssetFilename(name: string, kind: AssetKind) {
  const base = name.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'forge-asset'
  if (kind === 'glb' && !base.toLowerCase().endsWith('.glb')) return `${base}.glb`
  if (kind === 'motion' && !base.toLowerCase().endsWith('.json')) return `${base}.forge-motion.json`
  return base
}

export async function sendAssetToProject(asset: LibraryAsset, project: ProjectProfile) {
  const filename = safeAssetFilename(asset.name, asset.kind)
  const manifest = {
    format: 'forge-game-asset',
    version: 1,
    asset: {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      kind: asset.kind,
      file: filename,
      tags: asset.tags,
      source: asset.source,
    },
    project: { id: project.id, name: project.name, repo: project.repo, assetPath: project.assetPath },
    exportedAt: new Date().toISOString(),
  }

  const handle = project.directoryHandle as any
  if (handle && typeof handle.getDirectoryHandle === 'function') {
    const permission = typeof handle.queryPermission === 'function' ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
    const granted = permission === 'granted' || (typeof handle.requestPermission === 'function' && await handle.requestPermission({ mode: 'readwrite' }) === 'granted')
    if (!granted) throw new Error('Forge needs write permission for the connected game folder.')

    let directory = handle
    const segments = project.assetPath.split('/').map((part) => part.trim()).filter(Boolean)
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true })

    const assetHandle = await directory.getFileHandle(filename, { create: true })
    const assetWriter = await assetHandle.createWritable()
    await assetWriter.write(asset.blob)
    await assetWriter.close()

    const manifestHandle = await directory.getFileHandle(`${filename}.forge-asset.json`, { create: true })
    const manifestWriter = await manifestHandle.createWritable()
    await manifestWriter.write(JSON.stringify(manifest, null, 2))
    await manifestWriter.close()
    return { mode: 'folder' as const, filename }
  }

  download(asset.blob, filename)
  download(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), `${filename}.forge-asset.json`)
  return { mode: 'download' as const, filename }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
