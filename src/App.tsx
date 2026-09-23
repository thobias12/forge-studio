import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  Box,
  Boxes,
  Clapperboard,
  Crown,
  Crosshair,
  FolderKanban,
  Gamepad2,
  Globe2,
  Hammer,
  Home,
  Layers3,
  LayoutGrid,
  Landmark,
  MapPinned,
  PackageOpen,
  PackagePlus,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRoundCog,
  WandSparkles,
  Zap,
  Skull,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProjectManager = lazy(() => import('./pages/ProjectManager'))
const ProjectPlay = lazy(() => import('./pages/ProjectPlay'))
const ProjectValidation = lazy(() => import('./pages/ProjectValidation'))
const WorldForge = lazy(() => import('./pages/WorldForge'))
const GameplayForge = lazy(() => import('./pages/GameplayForge'))
const SkillForge = lazy(() => import('./pages/SkillForge'))
const ItemForge = lazy(() => import('./pages/ItemForge'))
const LootForge = lazy(() => import('./pages/LootForge'))
const EncounterForge = lazy(() => import('./pages/EncounterForge'))
const BossForge = lazy(() => import('./pages/BossForge'))
const AnimationStudioRuntime2 = lazy(() => import('./pages/AnimationStudioRuntime2'))
const Models = lazy(() => import('./pages/Models'))
const ConceptForge = lazy(() => import('./pages/ConceptForge'))
const UIForge = lazy(() => import('./pages/UIForge'))
const EquipmentForge = lazy(() => import('./pages/EquipmentForge'))
const EquipmentLab = lazy(() => import('./pages/EquipmentLab'))
const CharacterForge = lazy(() => import('./pages/CharacterForge'))
const DestructionLab = lazy(() => import('./pages/DestructionLab'))
const AnimationBindings = lazy(() => import('./pages/AnimationBindings'))
const AssetLibrary = lazy(() => import('./pages/AssetLibrary'))
const TextureLab = lazy(() => import('./pages/TextureLab'))
const GamePreview = lazy(() => import('./pages/GamePreview'))
const AudioStudioWorkspace = lazy(() => import('./pages/AudioStudioWorkspace'))
const VfxStudio = lazy(() => import('./pages/VfxStudio'))
const MapStudio = lazy(() => import('./pages/MapStudio'))
const PoiForge = lazy(() => import('./pages/PoiForge'))
const PropForge = lazy(() => import('./pages/PropForge'))
const Capture = lazy(() => import('./pages/Capture'))
const EquipmentQaCapture = lazy(() => import('./pages/EquipmentQaCapture'))
const DungeonQaCapture = lazy(() => import('./pages/DungeonQaCapture'))
import { installHistoryShortcuts } from './lib/historyShortcuts'
import { listAssets } from './lib/library'
import { loadSkillboundWorkspace } from './engine/forgeProject'
import {
  CORE_REGISTRY_ENTRIES,
  buildContentRegistry,
  searchForgeRegistry,
  type ForgeContentEntry,
  type ForgeContentPage,
} from './engine/contentRegistry'
import { FORGE_BUILD, FORGE_VERSION } from './version'
import './styles.css'
import './retarget.css'
import './texture-v071.css'
import './character.css'
import './world-forge.css'
import './gameplay-forge.css'
import './item-forge.css'
import './equipment-forge.css'
import './equipment-lab.css'
import './encounter-boss-forge.css'
import './project-control-center.css'
import './project-theme.css'

type Page = ForgeContentPage | 'gameplay' | 'skillforge' | 'itemforge' | 'lootforge' | 'encounterforge' | 'bossforge' | 'animationbindings' | 'poiforge' | 'propforge' | 'equipmentlab'
type NavItem = { id: Page; label: string; icon: LucideIcon }
type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: 'PROJECT',
    items: [
      { id: 'home', label: 'Control Center', icon: Home },
      { id: 'projects', label: 'Project Manager', icon: FolderKanban },
      { id: 'world', label: 'World Forge', icon: Globe2 },
      { id: 'play', label: 'Play Project', icon: Play },
    ],
  },
  {
    label: 'WORLD',
    items: [
      { id: 'poiforge', label: 'POI Forge', icon: Landmark },
      { id: 'maps', label: 'Dungeon Forge', icon: MapPinned },
      { id: 'destruction', label: 'Destruction Lab', icon: Hammer },
    ],
  },
  {
    label: 'CHARACTERS',
    items: [
      { id: 'conceptforge', label: 'Concept Forge', icon: Sparkles },
      { id: 'characterforge', label: 'Character Creator', icon: Skull },
      { id: 'characters', label: 'Equipment Forge', icon: UserRoundCog },
      { id: 'equipmentlab', label: 'Equipment Lab', icon: Box },
      { id: 'animations', label: 'Animation Studio', icon: Clapperboard },
    ],
  },
  {
    label: 'GAMEPLAY',
    items: [
      { id: 'gameplay', label: 'Gameplay Forge', icon: Swords },
      { id: 'skillforge', label: 'Skill Forge', icon: Zap },
      { id: 'encounterforge', label: 'Encounter Forge', icon: Crosshair },
      { id: 'bossforge', label: 'Boss Forge', icon: Crown },
      { id: 'itemforge', label: 'Item Forge', icon: PackagePlus },
      { id: 'lootforge', label: 'Loot & Containers', icon: PackageOpen },
      { id: 'uiforge', label: 'UI Forge', icon: LayoutGrid },
      { id: 'vfx', label: 'VFX Studio', icon: WandSparkles },
      { id: 'audio', label: 'Voice & Audio', icon: AudioLines },
    ],
  },
  {
    label: 'ASSETS',
    items: [
      { id: 'propforge', label: 'Prop Forge', icon: PackagePlus },
      { id: 'models', label: 'Models', icon: Box },
      { id: 'textures', label: 'Textures', icon: Layers3 },
      { id: 'assets', label: 'Asset Library', icon: Boxes },
      { id: 'preview', label: 'Asset Preview', icon: Gamepad2 },
    ],
  },
  {
    label: 'ENGINE',
    items: [
      { id: 'validation', label: 'Validation', icon: ShieldCheck },
    ],
  },
]

const nav: NavItem[] = navGroups.flatMap((group) => group.items)
const SKILLBOUND_CONTEXT_PAGES = new Set<Page>(['projects', 'world', 'poiforge', 'gameplay', 'skillforge', 'encounterforge', 'bossforge', 'itemforge', 'lootforge', 'uiforge', 'animations', 'play', 'validation'])

export default function App() {
  const params = new URLSearchParams(window.location.search)

  // Be tolerant of links where the remaining query string was URL-encoded
  // into the equipmentQa value, e.g. equipmentQa=1%26body%3Dfemale%26model%3Dlibrary.
  const equipmentQaValue =
    params.get('equipmentQa')
  if (
    equipmentQaValue?.startsWith('1&')
  ) {
    const embedded =
      new URLSearchParams(
        equipmentQaValue.slice(2),
      )
    for (const [key, value] of embedded) {
      if (!params.has(key)) {
        params.set(key, value)
      }
    }
    params.set('equipmentQa', '1')
  }

  if (
    params.get('equipmentQa') === '1' ||
    window.__FORGE_EQUIPMENT_QA_FORCE__ === true
  ) {
    return <EquipmentQaCapture />
  }
  if (params.get('dungeonQa') === '1') {
    return <DungeonQaCapture />
  }
  if (params.get('capture') === '1') return <Capture />

  const [page, setPage] = useState<Page>(() => {
    const value = window.location.hash.replace('#/', '') as Page
    if (value === 'mocap' || value === 'animationbindings') return 'animations'
    return nav.some((item) => item.id === value) ? value : 'home'
  })
  const [registry, setRegistry] = useState<ForgeContentEntry[]>(CORE_REGISTRY_ENTRIES)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const projectContext = SKILLBOUND_CONTEXT_PAGES.has(page)

  useEffect(() => { window.location.hash = `/${page}` }, [page])
  useEffect(() => installHistoryShortcuts(), [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadSkillboundWorkspace().catch(() => undefined), listAssets().catch(() => [])])
      .then(([workspace, assets]) => {
        if (!cancelled) setRegistry(buildContentRegistry(workspace, assets))
      })
    return () => { cancelled = true }
  }, [page])

  const searchResults = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    if (!needle) return []
    const toolResults = nav
      .filter((item) => item.label.toLowerCase().includes(needle) || item.id.includes(needle))
      .map((item) => ({ key: `tool:${item.id}`, name: item.label, detail: 'Forge tool', page: item.id }))
    const contentResults = searchForgeRegistry(registry, searchQuery)
      .map((entry) => ({ key: `content:${entry.id}`, name: entry.name, detail: entry.id, page: (entry.page === 'mocap' ? 'animations' : entry.page) as Page }))
    return [...toolResults, ...contentResults].slice(0, 9)
  }, [registry, searchQuery])

  const navigate = (next: Page) => {
    setPage(next === 'mocap' || next === 'animationbindings' ? 'animations' : next)
    setSearchQuery('')
    setSearchFocused(false)
  }

  return (
    <div className={`studio-shell ${projectContext ? 'project-context-skillbound' : 'forge-context-default'}`} data-project-context={projectContext ? 'skillbound' : 'forge'}>
      <aside className="sidebar">
        <button className="forge-brand" onClick={() => navigate('home')}>
          <div className="forge-logo">F</div><div><strong>FORGE</strong><span>STUDIO</span></div>
        </button>
        <nav className="sidebar-nav">
          {navGroups.map((group) => <div className="sidebar-nav-group" key={group.label}>
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map(({ id, label, icon: Icon }) => (
              <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
          </div>)}
        </nav>
        <div className="sidebar-spacer" />
        <button className="project-card" onClick={() => navigate('projects')}><div className="project-icon"><Sparkles size={16} /></div><div><span>Active project</span><strong>Skillbound</strong></div></button>
        <button className="sidebar-settings"><Settings size={17} /><span>Settings</span></button>
        <div className="build-tag">FORGE v{FORGE_VERSION} · {FORGE_BUILD}</div>
      </aside>

      <div className="studio-body">
        <header className="topbar">
          <div className="breadcrumb"><span>FORGE</span><b>/</b><strong>{nav.find((item) => item.id === page)?.label ?? 'Skillbound'}</strong></div>
          <div className="global-forge-search">
            <Search size={14}/>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder="Search Forge…"
              aria-label="Search Forge"
            />
            {searchFocused && searchQuery.trim() && <div className="global-search-results">
              {searchResults.map((result) => <button key={result.key} onMouseDown={(event) => event.preventDefault()} onClick={() => navigate(result.page)}>
                <span><strong>{result.name}</strong><small>{result.detail}</small></span>
                <em>Open</em>
              </button>)}
              {!searchResults.length && <div className="global-search-empty">No Forge tools or content found.</div>}
            </div>}
          </div>
          <div className="topbar-right"><span className="engine-pill">{projectContext ? 'SKILLBOUND · PROJECT CONTEXT' : 'FORGE RUNTIME · THREE.JS'}</span><span className="session-dot" /> Skillbound project</div>
        </header>
        <div className="content-area"><Suspense fallback={<div className="center-state">Loading Forge tool…</div>}>
          {page === 'home' && <Dashboard registry={registry} onNavigate={(target) => navigate(target)} />}
          {page === 'projects' && <ProjectManager onOpenWorld={() => navigate('world')} onOpenGameplay={() => navigate('gameplay')} />}
          {page === 'world' && <WorldForge />}
          {page === 'gameplay' && <GameplayForge onOpenTool={(target) => navigate(target)} />}
          {page === 'skillforge' && <SkillForge />}
          {page === 'encounterforge' && <EncounterForge />}
          {page === 'bossforge' && <BossForge />}
          {page === 'itemforge' && <ItemForge />}
          {page === 'lootforge' && <LootForge />}
          {page === 'play' && <ProjectPlay onOpenWorld={() => navigate('world')} onBackHome={() => navigate('home')} />}
          {page === 'validation' && <ProjectValidation registry={registry} onNavigate={(target) => navigate(target)} />}
          {page === 'mocap' && <AnimationStudioRuntime2 onTestGame={() => navigate('play')} />}
          {page === 'models' && <Models />}
          {page === 'destruction' && <DestructionLab />}
          {page === 'conceptforge' && <ConceptForge />}
          {page === 'uiforge' && <UIForge />}
          {page === 'characterforge' && <CharacterForge />}
          {page === 'characters' && <EquipmentForge />}
          {page === 'equipmentlab' && <EquipmentLab />}
          {page === 'animations' && <AnimationStudioRuntime2 onTestGame={() => navigate('play')} />}
          {page === 'animationbindings' && <AnimationBindings />}
          {page === 'textures' && <TextureLab />}
          {page === 'audio' && <AudioStudioWorkspace />}
          {page === 'vfx' && <VfxStudio />}
          {page === 'poiforge' && <PoiForge />}
          {page === 'propforge' && <PropForge />}
          {page === 'maps' && <MapStudio />}
          {page === 'preview' && <GamePreview />}
          {page === 'assets' && <AssetLibrary />}
        </div>
      </div>
    </div>
  )
}
