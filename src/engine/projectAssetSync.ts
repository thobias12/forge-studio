import type { ForgeProjectWorkspace } from './forgeProject'
import { itemVisual } from './itemPresentation'
import { getAsset, safeAssetFilename, saveAsset, type LibraryAsset } from '../lib/library'

export const SKILLBOUND_PROJECT_ASSET_INDEX = './projects/skillbound/assets/library/index.json'
const SOURCE_INDEX_PATH = 'assets/library/index.json'
const CONNECTION_DB = 'forge-project-persistence'
const CONNECTION_DB_VERSION = 1
const CONNECTION_STORE = 'connections'
const PROJECT_ID = 'skillbound'

type ExtendedAbility = ForgeProjectWorkspace['gameplay']['abilities'][number] & {
  sfxAssetId?: string
  iconAssetId?: string
}

export type ForgeProjectAssetIndexEntry = {
  id: string
  name: string
  category: LibraryAsset['category']
  kind: LibraryAsset['kind']
  mime: string
  size: number
  createdAt: string
  updatedAt: string
  tags: string[]
  favorite: boolean
  source?: string
  file: string
}

export type ForgeProjectAssetIndex = {
  format: 'forge-project-asset-index'
  version: 1
  projectId: 'skillbound'
  generatedAt: string
  assets: ForgeProjectAssetIndexEntry[]
}

export type ForgeProjectAssetSyncReport = {
  syncedIds: string[]
  missingIds: string[]
  filesWritten: number
  indexPath: string
}

type AssetBundle = {
  index: ForgeProjectAssetIndex
  files: Array<{ path: string; blob: Blob }>
  syncedIds: string[]
  missingIds: string[]
}

let hydratePromise: Promise<ForgeProjectAssetIndex | undefined> | undefined

export function collectSkillboundBoundAssetIds(workspace: ForgeProjectWorkspace, assets: LibraryAsset[] = []) {
  const ids = new Set<string>()
  const add = (id?: string) => { if (id) ids.add(id) }

  add(workspace.gameplay.player.characterAssetId)
  add(workspace.gameplay.player.animationAssetId)

  for (const enemy of workspace.gameplay.enemies) {
    add(enemy.characterAssetId)
    add(enemy.animationAssetId)
    add(enemy.attackVfxAssetId)
    add(enemy.hitVfxAssetId)
    add(enemy.deathVfxAssetId)
  }

  for (const raw of workspace.gameplay.abilities) {
    const ability = raw as ExtendedAbility
    add(ability.animationAssetId)
    add(ability.vfxAssetId)
    add(ability.sfxAssetId)
    add(ability.iconAssetId)
  }

  for (const item of workspace.gameplay.items) {
    const visual = itemVisual(item)
    add(visual.masterAssetId ?? item.modelAssetId)
    if (!visual.drop.useMaster) add(visual.drop.modelAssetId)
    if (!visual.equipped.useMaster) add(visual.equipped.modelAssetId)
    add(visual.inventory.iconAssetId)
  }

  for (const boss of workspace.bossProfiles) {
    for (const phase of boss.phases) add(phase.vfxAssetId)
  }

  // UI Forge and newer authoring tools may add asset IDs before the core schema
  // knows about those fields. Preserve any real Library references found in UI data.
  if (assets.length) {
    const known = new Set(assets.map((asset) => asset.id))
    collectKnownAssetStrings(workspace.ui, known, ids)
  }

  return [...ids]
}

export function buildSkillboundProjectAssetBundle(workspace: ForgeProjectWorkspace, assets: LibraryAsset[]): AssetBundle {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const boundIds = collectSkillboundBoundAssetIds(workspace, assets)
  const files: AssetBundle['files'] = []
  const indexAssets: ForgeProjectAssetIndexEntry[] = []
  const missingIds: string[] = []
  const syncedIds: string[] = []

  for (const id of boundIds) {
    const asset = byId.get(id)
    if (!asset) {
      missingIds.push(id)
      continue
    }
    const folder = sourceFolderForAsset(asset.id)
    const filename = safeAssetFilename(asset.name, asset.kind, asset.mime)
    const relativeFile = `${folder}/${filename}`
    indexAssets.push({
      id: asset.id,
      name: asset.name,
      category: asset.category,
      kind: asset.kind,
      mime: asset.mime,
      size: asset.size,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      tags: [...asset.tags],
      favorite: asset.favorite,
      source: asset.source,
      file: relativeFile,
    })
    files.push({ path: `assets/library/${relativeFile}`, blob: asset.blob })
    syncedIds.push(asset.id)
  }

  return {
    index: {
      format: 'forge-project-asset-index',
      version: 1,
      projectId: PROJECT_ID,
      generatedAt: new Date().toISOString(),
      assets: indexAssets.sort((a, b) => a.id.localeCompare(b.id)),
    },
    files,
    syncedIds,
    missingIds,
  }
}

export async function loadBundledSkillboundProjectAssetIndex() {
  const result = await fetchProjectAssetIndex()
  return result?.index
}

export async function hydrateSkillboundProjectAssets() {
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    const result = await fetchProjectAssetIndex()
    if (!result) return undefined

    for (const entry of result.index.assets) {
      const existing = await getAsset(entry.id)
      if (existing) continue
      try {
        const response = await fetch(new URL(entry.file, result.url))
        if (!response.ok) continue
        const blob = await response.blob()
        await saveAsset({
          id: entry.id,
          name: entry.name,
          category: entry.category,
          kind: entry.kind,
          mime: entry.mime || blob.type || 'application/octet-stream',
          tags: [...entry.tags, 'project-source'],
          favorite: entry.favorite,
          source: entry.source ?? 'Skillbound project source',
          blob,
        })
      } catch {
        // A bad optional presentation asset must never prevent Forge from opening.
      }
    }
    return result.index
  })()
  return hydratePromise
}

export async function syncSkillboundProjectAssetsToConnectedSource(workspace: ForgeProjectWorkspace, assets: LibraryAsset[]): Promise<ForgeProjectAssetSyncReport> {
  const root = await getConnectedSkillboundHandle()
  const bundle = buildSkillboundProjectAssetBundle(workspace, assets)

  for (const file of bundle.files) await writeBlobAtPath(root, file.path, file.blob)
  await writeBlobAtPath(root, SOURCE_INDEX_PATH, new Blob([`${JSON.stringify(bundle.index, null, 2)}\n`], { type: 'application/json' }))

  return {
    syncedIds: bundle.syncedIds,
    missingIds: bundle.missingIds,
    filesWritten: bundle.files.length + 1,
    indexPath: SOURCE_INDEX_PATH,
  }
}

async function fetchProjectAssetIndex(): Promise<{ index: ForgeProjectAssetIndex; url: string } | undefined> {
  try {
    const response = await fetch(SKILLBOUND_PROJECT_ASSET_INDEX, { cache: 'no-store' })
    if (!response.ok) return undefined
    const index = await response.json() as ForgeProjectAssetIndex
    if (index?.format !== 'forge-project-asset-index' || index.version !== 1 || index.projectId !== PROJECT_ID || !Array.isArray(index.assets)) return undefined
    return { index, url: response.url }
  } catch {
    return undefined
  }
}

function collectKnownAssetStrings(value: unknown, known: Set<string>, target: Set<string>) {
  if (typeof value === 'string') {
    if (known.has(value)) target.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectKnownAssetStrings(item, known, target)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const nested of Object.values(value as Record<string, unknown>)) collectKnownAssetStrings(nested, known, target)
}

function sourceFolderForAsset(id: string) {
  const slug = id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'asset'
  return `${slug}-${shortHash(id)}`
}

function shortHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).slice(0, 7)
}

async function getConnectedSkillboundHandle() {
  if (typeof indexedDB === 'undefined') throw new Error('Connected project source is not supported by this browser.')
  const db = await openConnectionDb()
  const stored = await new Promise<{ handle?: unknown } | undefined>((resolve, reject) => {
    const tx = db.transaction(CONNECTION_STORE, 'readonly')
    const request = tx.objectStore(CONNECTION_STORE).get(PROJECT_ID)
    request.onsuccess = () => resolve(request.result as { handle?: unknown } | undefined)
    request.onerror = () => reject(request.error ?? new Error('Could not read the Skillbound source connection.'))
  }).finally(() => db.close())

  const handle = stored?.handle as any
  if (!handle) throw new Error('No Skillbound source folder is connected. Connect the repository in Project Manager first.')
  let permission = typeof handle.queryPermission === 'function' ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
  if (permission !== 'granted' && typeof handle.requestPermission === 'function') permission = await handle.requestPermission({ mode: 'readwrite' })
  if (permission !== 'granted') throw new Error('Forge needs read/write permission for the connected Skillbound source folder.')
  return handle
}

async function openConnectionDb() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CONNECTION_DB, CONNECTION_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CONNECTION_STORE)) db.createObjectStore(CONNECTION_STORE, { keyPath: 'projectId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open Forge project connection storage.'))
  })
}

async function writeBlobAtPath(root: any, path: string, blob: Blob) {
  const parts = path.split('/').filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error(`Invalid project asset path: ${path}`)
  let directory = root
  for (const segment of parts) directory = await directory.getDirectoryHandle(segment, { create: true })
  const file = await directory.getFileHandle(filename, { create: true })
  const writer = await file.createWritable()
  await writer.write(blob)
  await writer.close()
}
