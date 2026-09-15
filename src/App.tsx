import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  Box,
  Boxes,
  Clapperboard,
  FolderKanban,
  Gamepad2,
  Globe2,
  Hammer,
  Home,
  Layers3,
  LayoutGrid,
  MapPinned,
  Play,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
  WandSparkles,
  Skull,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import ProjectManager from './pages/ProjectManager'
import ProjectPlay from './pages/ProjectPlay'
import ProjectValidation from './pages/ProjectValidation'
import WorldForge from './pages/WorldForge'
import MocapStudio from './pages/MocapStudio'
import Models from './pages/Models'
import ConceptForge from './pages/ConceptForge'
import UIForge from './pages/UIForge'
import CharacterStudio from './pages/CharacterStudio'
import CharacterForge from './pages/CharacterForge'
import DestructionLab from './pages/DestructionLab'
import AnimationStudio from './pages/AnimationStudio'
import AssetLibrary from './pages/AssetLibrary'
import TextureLab from './pages/TextureLab'
import GamePreview from './pages/GamePreview'
import AudioStudioWorkspace from './pages/AudioStudioWorkspace'
import VfxStudio from './pages/VfxStudio'
import MapStudio from './pages/MapStudio'
import Capture from './pages/Capture'
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
import { FORGE_VERSION } from './version'
import './styles.css'
import './retarget.css'
import './texture-v071.css'
import './character.css'
import './world-forge.css'
import './project-control-center.css'

type Page = ForgeContentPage

const navGroups = [
  {
    label: 'PROJECT',
    items: [
      { id: 'home' as const, label: 'Control Center', icon: Home },
      { id: 'projects' as const, label: 'Project Manager', icon: FolderKanban },
      { id: 'world' as const, label: 'World Forge', icon: Globe2 },
      { id: 'play' as const, label: 'Play Project', icon: Play },
    ],
  },
  {
    label: 'WORLD',
    items: [
      { id: 'maps' as const, label: 'Map Studio', icon: MapPinned },
      { id: 'destruction' as const, label: 'Destruction Lab', icon: Hammer },
    ],
  },
  {
    label: 'CHARACTERS',
    items: [
      { id: 'conceptforge' as const, label: 'Concept Forge', icon: Sparkles },
      { id: 'characterforge' as const, label: 'Character Forge', icon: Skull },
      { id: 'characters' as const, label: 'Character Assembly', icon: UserRoundCog },
      { id: 'animations' as const, label: 'Animations', icon: Clapperboard },
      { id: 'mocap' as const, label: 'Mocap', icon: ScanLine },
    ],
  },
  {
    label: 'GAMEPLAY',
    items: [
      { id: 'uiforge' as const, label: 'UI Forge', icon: LayoutGrid },
      { id: 'vfx' as const, label: 'VFX Studio', icon: WandSparkles },
      { id: 'audio' as const, label: 'Voice & Audio', icon: AudioLines },
    ],
  },
  {
    label: 'ASSETS',
    items: [
      { id: 'models' as const, label: 'Models', icon: Box },
      { id: 'textures' as const, label: 'Textures', icon: Layers3 },
      { id: 'assets' as const, label: 'Asset Library', icon: Boxes },
      { id: 'preview' as const, label: 'Asset Preview', icon: Gamepad2 },
    ],
  },
  {
    label: 'ENGINE',
    items: [
      { id: 'validation' as const, label: 'Validation', icon: ShieldCheck },
    ],
  },
]

const nav = navGroups.flatMap((group) => group.items)

export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('capture') === '1') return <Capture />

  const [page, setPage] = useState<Page>(() => {
    const value = window.location.hash.replace('#/', '') as Page
    return nav.some((item) => item.id === value) ? value : 'home'
  })
  const [registry, setRegistry] = useState<ForgeContentEntry[]>(CORE_REGISTRY_ENTRIES)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

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
      .map((item) => ({ key: `tool:${item.id}`, name: item.label, detail: 'Forge tool', page: item.id as Page }))
    const contentResults = searchForgeRegistry(registry, searchQuery)
      .map((entry) => ({ key: `content:${entry.id}`, name: entry.name, detail: entry.id, page: entry.page as Page }))
    return [...toolResults, ...contentResults].slice(0, 9)
  }, [registry, searchQuery])

  const navigate = (next: ForgeContentPage) => {
    setPage(next)
    setSearchQuery('')
    setSearchFocused(false)
  }

  return (
    <div className="studio-shell">
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
        <div className="build-tag">FORGE v{FORGE_VERSION}</div>
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
          <div className="topbar-right"><span className="engine-pill">FORGE RUNTIME · THREE.JS</span><span className="session-dot" /> Skillbound project</div>
        </header>
        <div className="content-area">
          {page === 'home' && <Dashboard registry={registry} onNavigate={navigate} />}
          {page === 'projects' && <ProjectManager onOpenWorld={() => navigate('world')} />}
          {page === 'world' && <WorldForge />}
          {page === 'play' && <ProjectPlay onOpenWorld={() => navigate('world')} onBackHome={() => navigate('home')} />}
          {page === 'validation' && <ProjectValidation registry={registry} onNavigate={navigate} />}
          {page === 'mocap' && <MocapStudio />}
          {page === 'models' && <Models />}
          {page === 'destruction' && <DestructionLab />}
          {page === 'conceptforge' && <ConceptForge />}
          {page === 'uiforge' && <UIForge />}
          {page === 'characterforge' && <CharacterForge />}
          {page === 'characters' && <CharacterStudio />}
          {page === 'animations' && <AnimationStudio />}
          {page === 'textures' && <TextureLab />}
          {page === 'audio' && <AudioStudioWorkspace />}
          {page === 'vfx' && <VfxStudio />}
          {page === 'maps' && <MapStudio />}
          {page === 'preview' && <GamePreview />}
          {page === 'assets' && <AssetLibrary />}
        </div>
      </div>
    </div>
  )
}
