import { dataUrlToBlob, materialSlug, parseMaterialPackage } from './materialPackage'

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
  if (name.endsWith('.forge-material.json')) return 'materials'
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

export function safeAssetFilename(name: string, kind: AssetKind, mime = '') {
  const base = name.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'forge-asset'
  if (kind === 'glb' && !base.toLowerCase().endsWith('.glb')) return `${base}.glb`
  if (kind === 'motion' && !base.toLowerCase().endsWith('.json')) return `${base}.forge-motion.json`
  if (kind === 'image' && !/\.(png|jpe?g|webp|ktx2|hdr)$/i.test(base)) {
    const extension = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
    return `${base}.${extension}`
  }
  if (kind === 'audio' && !/\.(mp3|wav|ogg|m4a)$/i.test(base)) {
    const extension = mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'wav'
    return `${base}.${extension}`
  }
  if (kind === 'file' && mime.includes('json') && !base.toLowerCase().endsWith('.json')) return `${base}.json`
  return base
}

export async function sendAssetToProject(asset: LibraryAsset, project: ProjectProfile) {
  const materialPackage = asset.category === 'materials' ? await parseMaterialPackage(asset.blob) : undefined
  if (materialPackage) return sendMaterialPackageToProject(asset, project, materialPackage)

  const filename = safeAssetFilename(asset.name, asset.kind, asset.mime)
  const manifest = buildAssetManifest(asset, project, filename)
  const handle = project.directoryHandle as any
  if (handle && typeof handle.getDirectoryHandle === 'function') {
    const directory = await getProjectAssetDirectory(handle, project.assetPath)
    await writeFile(directory, filename, asset.blob)
    await writeFile(directory, `${filename}.forge-asset.json`, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }))
    return { mode: 'folder' as const, filename }
  }

  download(asset.blob, filename)
  download(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), `${filename}.forge-asset.json`)
  return { mode: 'download' as const, filename }
}

async function sendMaterialPackageToProject(asset: LibraryAsset, project: ProjectProfile, material: Awaited<ReturnType<typeof parseMaterialPackage>> & {}) {
  const slug = materialSlug(material.name)
  const handle = project.directoryHandle as any
  const packageFilename = `${slug}.forge-material.json`

  if (handle && typeof handle.getDirectoryHandle === 'function') {
    const baseDirectory = await getProjectAssetDirectory(handle, project.assetPath)
    const materialDirectory = await baseDirectory.getDirectoryHandle(slug, { create: true })
    const maps: Record<string, string> = {}

    for (const [channel, embedded] of Object.entries(material.channels)) {
      if (!embedded) continue
      const blob = dataUrlToBlob(embedded.data)
      const filename = embedded.file || `${channel}.png`
      await writeFile(materialDirectory, filename, blob)
      maps[channel] = filename
    }

    const runtimeManifest = {
      format: 'forge-material-runtime',
      version: 1,
      name: material.name,
      parameters: material.parameters,
      maps,
      three: {
        material: 'MeshStandardMaterial',
        baseColorColorSpace: 'srgb',
        dataMapColorSpace: 'none',
        wrap: 'repeat',
      },
      forge: { assetId: asset.id, source: asset.source, exportedAt: new Date().toISOString() },
    }
    await writeFile(materialDirectory, 'material.forge.json', new Blob([JSON.stringify(runtimeManifest, null, 2)], { type: 'application/json' }))
    await writeFile(materialDirectory, packageFilename, asset.blob)
    return { mode: 'folder' as const, filename: `${slug}/material.forge.json` }
  }

  download(asset.blob, packageFilename)
  const manifest = buildAssetManifest(asset, project, packageFilename)
  download(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), `${packageFilename}.forge-asset.json`)
  return { mode: 'download' as const, filename: packageFilename }
}

function buildAssetManifest(asset: LibraryAsset, project: ProjectProfile, filename: string) {
  return {
    format: 'forge-game-asset',
    version: 1,
    asset: { id: asset.id, name: asset.name, category: asset.category, kind: asset.kind, file: filename, tags: asset.tags, source: asset.source },
    project: { id: project.id, name: project.name, repo: project.repo, assetPath: project.assetPath },
    exportedAt: new Date().toISOString(),
  }
}

async function getProjectAssetDirectory(handle: any, assetPath: string) {
  const permission = typeof handle.queryPermission === 'function' ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
  const granted = permission === 'granted' || (typeof handle.requestPermission === 'function' && await handle.requestPermission({ mode: 'readwrite' }) === 'granted')
  if (!granted) throw new Error('Forge needs write permission for the connected game folder.')

  let directory = handle
  const segments = assetPath.split('/').map((part) => part.trim()).filter(Boolean)
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true })
  return directory
}

async function writeFile(directory: any, filename: string, blob: Blob) {
  const fileHandle = await directory.getFileHandle(filename, { create: true })
  const writer = await fileHandle.createWritable()
  await writer.write(blob)
  await writer.close()
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
