import type {
  ForgeAbilityDefinition,
  ForgeEnemyDefinition,
  ForgeItemDefinition,
  ForgeLootTableDefinition,
  ForgePlayerDefinition,
  ForgeProjectManifest,
  ForgeProjectWorkspace,
  ForgeRegionDefinition,
  ForgeWorldDefinition,
} from './forgeProject'

const DB_NAME = 'forge-project-persistence'
const DB_VERSION = 1
const CONNECTIONS = 'connections'
const SKILLBOUND_ID = 'skillbound'

export type ForgeProjectConnectionInfo = {
  projectId: string
  folderName: string
  projectFolderName: string
  connectedAt: string
  permission: 'granted' | 'prompt' | 'denied' | 'unsupported'
}

type StoredProjectConnection = {
  projectId: string
  folderName: string
  projectFolderName: string
  connectedAt: string
  handle: unknown
}

export function supportsProjectFolderPersistence() {
  return typeof (window as any).showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'
}

export async function connectSkillboundProjectFolder(): Promise<ForgeProjectConnectionInfo> {
  if (!supportsProjectFolderPersistence()) throw new Error('Connected project folders require a Chromium-based browser with File System Access support.')
  const selected = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  const projectHandle = await resolveSkillboundProjectRoot(selected)
  await ensurePermission(projectHandle, 'readwrite', true)
  const manifest = await readJson<ForgeProjectManifest>(projectHandle, 'project.forge.json')
  if (manifest.format !== 'forge-project' || manifest.id !== SKILLBOUND_ID) throw new Error('The selected folder does not contain the Skillbound Forge project.')

  const stored: StoredProjectConnection = {
    projectId: SKILLBOUND_ID,
    folderName: selected.name ?? 'Selected folder',
    projectFolderName: projectHandle.name ?? 'skillbound',
    connectedAt: new Date().toISOString(),
    handle: projectHandle,
  }
  await putConnection(stored)
  return toInfo(stored, 'granted')
}

export async function getSkillboundProjectConnection(): Promise<ForgeProjectConnectionInfo | undefined> {
  if (!supportsProjectFolderPersistence()) return undefined
  const stored = await getConnection(SKILLBOUND_ID)
  if (!stored) return undefined
  const handle = stored.handle as any
  const permission = await queryPermission(handle, 'readwrite')
  return toInfo(stored, permission)
}

export async function disconnectSkillboundProjectFolder() {
  if (!supportsProjectFolderPersistence()) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONNECTIONS, 'readwrite')
    tx.objectStore(CONNECTIONS).delete(SKILLBOUND_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not disconnect the Forge project folder.'))
    tx.onabort = () => reject(tx.error ?? new Error('Could not disconnect the Forge project folder.'))
  }).finally(() => db.close())
}

export async function loadSkillboundWorkspaceFromProjectFolder(editor?: ForgeProjectWorkspace['editor']): Promise<ForgeProjectWorkspace> {
  const handle = await getConnectedHandle(true)
  const manifest = await readJson<ForgeProjectManifest>(handle, 'project.forge.json')
  validateManifest(manifest)

  const [worlds, regions, player, abilities, enemies, items, lootTables] = await Promise.all([
    Promise.all(manifest.content.worlds.map((path) => readJson<ForgeWorldDefinition>(handle, path))),
    Promise.all(manifest.content.regions.map((path) => readJson<ForgeRegionDefinition>(handle, path))),
    readJson<ForgePlayerDefinition>(handle, manifest.content.player),
    Promise.all(manifest.content.abilities.map((path) => readJson<ForgeAbilityDefinition>(handle, path))),
    Promise.all(manifest.content.enemies.map((path) => readJson<ForgeEnemyDefinition>(handle, path))),
    Promise.all(manifest.content.items.map((path) => readJson<ForgeItemDefinition>(handle, path))),
    Promise.all(manifest.content.lootTables.map((path) => readJson<ForgeLootTableDefinition>(handle, path))),
  ])

  const selectedWorldId = worlds.some((world) => world.id === editor?.selectedWorldId) ? editor!.selectedWorldId : worlds[0]?.id ?? ''
  const selectedRegionId = regions.some((region) => region.id === editor?.selectedRegionId) ? editor!.selectedRegionId : regions[0]?.id ?? ''

  return {
    manifest,
    worlds,
    regions,
    gameplay: { player, abilities, enemies, items, lootTables },
    editor: {
      previewSeed: editor?.previewSeed ?? 8472152,
      selectedWorldId,
      selectedRegionId,
    },
    updatedAt: new Date().toISOString(),
  }
}

export async function saveSkillboundWorkspaceToProjectFolder(workspace: ForgeProjectWorkspace): Promise<ForgeProjectWorkspace> {
  const handle = await getConnectedHandle(true)
  validateManifest(workspace.manifest)

  for (let index = 0; index < workspace.manifest.content.worlds.length; index += 1) {
    const path = workspace.manifest.content.worlds[index]
    const value = findDefinitionForPath(path, workspace.worlds, index, '.world.json')
    if (!value) throw new Error(`Could not resolve authored world for ${path}.`)
    await writeJson(handle, path, value)
  }
  for (let index = 0; index < workspace.manifest.content.regions.length; index += 1) {
    const path = workspace.manifest.content.regions[index]
    const value = findDefinitionForPath(path, workspace.regions, index, '.region.json')
    if (!value) throw new Error(`Could not resolve authored region for ${path}.`)
    await writeJson(handle, path, value)
  }

  await writeJson(handle, workspace.manifest.content.player, workspace.gameplay.player)

  for (let index = 0; index < workspace.manifest.content.abilities.length; index += 1) {
    const path = workspace.manifest.content.abilities[index]
    const value = findDefinitionForPath(path, workspace.gameplay.abilities, index, '.ability.json')
    if (!value) throw new Error(`Could not resolve authored ability for ${path}.`)
    await writeJson(handle, path, value)
  }
  for (let index = 0; index < workspace.manifest.content.enemies.length; index += 1) {
    const path = workspace.manifest.content.enemies[index]
    const value = findDefinitionForPath(path, workspace.gameplay.enemies, index, '.enemy.json')
    if (!value) throw new Error(`Could not resolve authored enemy for ${path}.`)
    await writeJson(handle, path, value)
  }
  for (let index = 0; index < workspace.manifest.content.items.length; index += 1) {
    const path = workspace.manifest.content.items[index]
    const value = findDefinitionForPath(path, workspace.gameplay.items, index, '.item.json')
    if (!value) throw new Error(`Could not resolve authored item for ${path}.`)
    await writeJson(handle, path, value)
  }
  for (let index = 0; index < workspace.manifest.content.lootTables.length; index += 1) {
    const path = workspace.manifest.content.lootTables[index]
    const value = findDefinitionForPath(path, workspace.gameplay.lootTables, index, '.loot.json')
    if (!value) throw new Error(`Could not resolve authored loot table for ${path}.`)
    await writeJson(handle, path, value)
  }

  const manifest = {
    ...workspace.manifest,
    contentRevision: Math.max(1, workspace.manifest.contentRevision ?? 1) + 1,
  }
  await writeJson(handle, 'project.forge.json', manifest)

  return { ...workspace, manifest, updatedAt: new Date().toISOString() }
}

async function resolveSkillboundProjectRoot(selected: any) {
  const candidates: string[][] = [
    [],
    ['public', 'projects', 'skillbound'],
    ['projects', 'skillbound'],
    ['skillbound'],
  ]

  for (const path of candidates) {
    try {
      let handle = selected
      for (const segment of path) handle = await handle.getDirectoryHandle(segment)
      const manifest = await readJson<ForgeProjectManifest>(handle, 'project.forge.json')
      if (manifest?.format === 'forge-project' && manifest.id === SKILLBOUND_ID) return handle
    } catch {
      // Try the next common project-root shape.
    }
  }
  throw new Error('Forge could not find public/projects/skillbound/project.forge.json in the selected folder. Select the forge-studio repository root or the Skillbound project folder itself.')
}

async function getConnectedHandle(requestPermission: boolean) {
  if (!supportsProjectFolderPersistence()) throw new Error('Connected project folders are not supported by this browser.')
  const stored = await getConnection(SKILLBOUND_ID)
  if (!stored) throw new Error('No Skillbound source folder is connected. Connect the forge-studio repository in Project Manager first.')
  const handle = stored.handle as any
  await ensurePermission(handle, 'readwrite', requestPermission)
  return handle
}

async function ensurePermission(handle: any, mode: 'read' | 'readwrite', request: boolean) {
  const current = await queryPermission(handle, mode)
  if (current === 'granted') return
  if (request && typeof handle.requestPermission === 'function') {
    const next = await handle.requestPermission({ mode })
    if (next === 'granted') return
  }
  throw new Error('Forge does not currently have permission to read/write the connected project folder. Reconnect the folder and allow access.')
}

async function queryPermission(handle: any, mode: 'read' | 'readwrite'): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (!handle || typeof handle.queryPermission !== 'function') return 'unsupported'
  try {
    return await handle.queryPermission({ mode })
  } catch {
    return 'denied'
  }
}

async function readJson<T>(root: any, path: string): Promise<T> {
  const fileHandle = await getFileHandleAtPath(root, path, false)
  const file = await fileHandle.getFile()
  return JSON.parse(await file.text()) as T
}

async function writeJson(root: any, path: string, value: unknown) {
  const fileHandle = await getFileHandleAtPath(root, path, true)
  const writer = await fileHandle.createWritable()
  await writer.write(`${JSON.stringify(value, null, 2)}\n`)
  await writer.close()
}

async function getFileHandleAtPath(root: any, path: string, create: boolean) {
  const parts = path.split('/').map((part) => part.trim()).filter(Boolean)
  const filename = parts.pop()
  if (!filename) throw new Error(`Invalid Forge project path: ${path}`)
  let directory = root
  for (const segment of parts) directory = await directory.getDirectoryHandle(segment, { create })
  return await directory.getFileHandle(filename, { create })
}

function findDefinitionForPath<T extends { id: string }>(path: string, values: T[], index: number, suffix: string) {
  const filename = path.split('/').pop() ?? ''
  const expectedId = filename.endsWith(suffix) ? filename.slice(0, -suffix.length) : filename.split('.')[0]
  return values.find((value) => value.id === expectedId) ?? values[index]
}

function validateManifest(manifest: ForgeProjectManifest) {
  if (manifest?.format !== 'forge-project' || manifest.id !== SKILLBOUND_ID) throw new Error('Connected source does not contain a valid Skillbound Forge manifest.')
  if (!manifest.content?.worlds?.length || !manifest.content?.regions?.length || !manifest.content?.player) throw new Error('Skillbound project manifest is incomplete.')
}

function toInfo(stored: StoredProjectConnection, permission: ForgeProjectConnectionInfo['permission']): ForgeProjectConnectionInfo {
  return {
    projectId: stored.projectId,
    folderName: stored.folderName,
    projectFolderName: stored.projectFolderName,
    connectedAt: stored.connectedAt,
    permission,
  }
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

async function putConnection(connection: StoredProjectConnection) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CONNECTIONS, 'readwrite')
    tx.objectStore(CONNECTIONS).put(connection)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not store Forge project connection.'))
    tx.onabort = () => reject(tx.error ?? new Error('Could not store Forge project connection.'))
  }).finally(() => db.close())
}
