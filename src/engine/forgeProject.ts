export type ForgeProjectManifest = {
  format: 'forge-project'
  version: 1
  id: string
  name: string
  generationVersion: number
  runtime: {
    renderer: 'three'
    entryWorld: string
    mode: 'single-player'
  }
  content: {
    worlds: string[]
    regions: string[]
  }
}

export type ForgeWorldNodeType = 'procedural-region' | 'town' | 'dungeon'

export type ForgeWorldNode = {
  id: string
  label: string
  type: ForgeWorldNodeType
  ref?: string
  required: boolean
}

export type ForgeWorldDefinition = {
  format: 'forge-world'
  version: 1
  id: string
  name: string
  act: number
  nodes: ForgeWorldNode[]
}

export type ForgePathStyle = 'direct' | 'winding' | 'meandering'
export type ForgeDensity = 'low' | 'medium' | 'high'

export type ForgeRegionDefinition = {
  format: 'forge-region'
  version: 1
  id: string
  name: string
  biome: string
  chunkRange: [number, number]
  mainPath: ForgePathStyle
  branchRange: [number, number]
  landmarkRange: [number, number]
  enemyDensity: ForgeDensity
  optionalDungeonChance: number
  settlementChance: number
  features: string[]
}

export type ForgeProjectWorkspace = {
  manifest: ForgeProjectManifest
  worlds: ForgeWorldDefinition[]
  regions: ForgeRegionDefinition[]
  editor: {
    previewSeed: number
    selectedWorldId: string
    selectedRegionId: string
  }
  updatedAt: string
}

const WORKSPACE_KEY = 'forge-project:skillbound:v1'
const PROJECT_ROOT = './projects/skillbound/'

export async function loadSkillboundWorkspace(forceBundled = false): Promise<ForgeProjectWorkspace> {
  if (!forceBundled) {
    const cached = localStorage.getItem(WORKSPACE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ForgeProjectWorkspace
        if (parsed.manifest?.format === 'forge-project' && parsed.manifest.id === 'skillbound') return parsed
      } catch {
        // Fall through to the bundled project if the editor cache is invalid.
      }
    }
  }

  const manifest = await fetchJson<ForgeProjectManifest>(`${PROJECT_ROOT}project.forge.json`)
  const worlds = await Promise.all(manifest.content.worlds.map((path) => fetchJson<ForgeWorldDefinition>(`${PROJECT_ROOT}${path}`)))
  const regions = await Promise.all(manifest.content.regions.map((path) => fetchJson<ForgeRegionDefinition>(`${PROJECT_ROOT}${path}`)))
  const firstWorld = worlds[0]
  const firstRegion = regions[0]

  return {
    manifest,
    worlds,
    regions,
    editor: {
      previewSeed: 8472152,
      selectedWorldId: firstWorld?.id ?? '',
      selectedRegionId: firstRegion?.id ?? '',
    },
    updatedAt: new Date().toISOString(),
  }
}

export function saveSkillboundWorkspace(workspace: ForgeProjectWorkspace) {
  const next: ForgeProjectWorkspace = { ...workspace, updatedAt: new Date().toISOString() }
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('forge-project-saved', { detail: { projectId: next.manifest.id } }))
  return next
}

export function clearSkillboundWorkspace() {
  localStorage.removeItem(WORKSPACE_KEY)
}

export function patchRegion(workspace: ForgeProjectWorkspace, region: ForgeRegionDefinition): ForgeProjectWorkspace {
  return {
    ...workspace,
    regions: workspace.regions.map((item) => item.id === region.id ? region : item),
    updatedAt: new Date().toISOString(),
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load Forge project file: ${url}`)
  return await response.json() as T
}
