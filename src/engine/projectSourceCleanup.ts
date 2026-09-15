import type { ForgeProjectManifest } from './forgeProject'

const DB_NAME = 'forge-project-persistence'
const DB_VERSION = 1
const CONNECTIONS = 'connections'
const SKILLBOUND_ID = 'skillbound'

type StoredProjectConnection = { projectId: string; handle: unknown }

export async function findStaleSkillboundSourcePaths(nextManifest: ForgeProjectManifest) {
  const handle = await getConnectedHandle()
  if (!handle) return []
  let current: ForgeProjectManifest
  try {
    current = await readJson<ForgeProjectManifest>(handle, 'project.forge.json')
  } catch {
    return []
  }
  const next = new Set(managedPaths(nextManifest))
  return managedPaths(current).filter((path) => !next.has(path))
}

export async function removeSkillboundSourcePaths(paths: string[]) {
  if (!paths.length) return 0
  const handle = await getConnectedHandle()
  if (!handle) return 0
  let removed = 0
  for (const path of paths) {
    try {
      await removeFileAtPath(handle, path)
      removed += 1
    } catch (error) {
      if ((error as DOMException)?.name === 'NotFoundError') continue
      throw error
    }
  }
  return removed
}

function managedPaths(manifest: ForgeProjectManifest) {
  return [
    ...manifest.content.worlds,
    ...manifest.content.regions,
    ...(manifest.content.dungeons ?? []),
    ...(manifest.content.encounters ?? []),
    ...(manifest.content.bosses ?? []),
    ...manifest.content.abilities,
    ...manifest.content.enemies,
    ...manifest.content.items,
    ...manifest.content.lootTables,
  ]
}

async function getConnectedHandle() {
  if (typeof indexedDB === 'undefined') return undefined
  const connection = await getConnection(SKILLBOUND_ID)
  if (!connection?.handle) return undefined
  const handle = connection.handle as any
  if (typeof handle.queryPermission === 'function') {
    let permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission !== 'granted' && typeof handle.requestPermission === 'function') permission = await handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') return undefined
  }
  return handle
}

async function readJson<T>(root: any, path: string): Promise<T> {
  const file = await (await getFileHandleAtPath(root, path)).getFile()
  return JSON.parse(await file.text()) as T
}

async function getFileHandleAtPath(root: any, path: string) {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error(`Invalid Forge project path: ${path}`)
  let directory = root
  for (const segment of parts) directory = await directory.getDirectoryHandle(segment)
  return await directory.getFileHandle(filename)
}

async function removeFileAtPath(root: any, path: string) {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error(`Invalid Forge project path: ${path}`)
  let directory = root
  for (const segment of parts) directory = await directory.getDirectoryHandle(segment)
  if (typeof directory.removeEntry !== 'function') throw new Error('The connected browser file system cannot remove source files.')
  await directory.removeEntry(filename)
}

async function getConnection(projectId: string) {
  const db = await openDb()
  return await new Promise<StoredProjectConnection | undefined>((resolve, reject) => {
    const tx = db.transaction(CONNECTIONS, 'readonly')
    const request = tx.objectStore(CONNECTIONS).get(projectId)
    request.onsuccess = () => resolve(request.result as StoredProjectConnection | undefined)
    request.onerror = () => reject(request.error ?? new Error('Could not read Forge project connection.'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}

async function openDb() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CONNECTIONS)) db.createObjectStore(CONNECTIONS, { keyPath: 'projectId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open Forge project connection storage.'))
  })
}
