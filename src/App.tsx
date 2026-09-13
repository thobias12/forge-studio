import { useEffect, useState, type ReactNode } from 'react'
import { Box, Boxes, Clapperboard, Home, Layers3, ScanLine, Settings, Sparkles } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import MocapStudio from './pages/MocapStudio'
import Models from './pages/Models'
import Capture from './pages/Capture'
import './styles.css'

type Page = 'home' | 'mocap' | 'models' | 'animations' | 'textures' | 'assets'

const nav = [
  { id: 'home' as const, label: 'Home', icon: Home },
  { id: 'mocap' as const, label: 'Mocap', icon: ScanLine },
  { id: 'models' as const, label: 'Models', icon: Box },
  { id: 'animations' as const, label: 'Animations', icon: Clapperboard },
  { id: 'textures' as const, label: 'Textures', icon: Layers3 },
  { id: 'assets' as const, label: 'Asset Library', icon: Boxes },
]

export default function App() {
  if (window.location.pathname === '/capture') return <Capture />

  const [page, setPage] = useState<Page>(() => {
    const value = window.location.hash.replace('#/', '') as Page
    return nav.some((item) => item.id === value) ? value : 'home'
  })

  useEffect(() => {
    window.location.hash = `/${page}`
  }, [page])

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <button className="forge-brand" onClick={() => setPage('home')}>
          <div className="forge-logo">F</div>
          <div><strong>FORGE</strong><span>STUDIO</span></div>
        </button>
        <nav className="sidebar-nav">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
              <Icon size={18} /><span>{label}</span>{(id === 'animations' || id === 'textures') && <small>SOON</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="project-card">
          <div className="project-icon"><Sparkles size={16} /></div>
          <div><span>Workspace</span><strong>Shared Library</strong></div>
        </div>
        <button className="sidebar-settings"><Settings size={17} /><span>Settings</span></button>
        <div className="build-tag">FORGE v0.1.0</div>
      </aside>

      <div className="studio-body">
        <header className="topbar">
          <div className="breadcrumb"><span>FORGE</span><b>/</b><strong>{nav.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-right"><span className="engine-pill">THREE.JS</span><span className="session-dot" /> Local workspace</div>
        </header>
        <div className="content-area">
          {page === 'home' && <Dashboard onOpenMocap={() => setPage('mocap')} />}
          {page === 'mocap' && <MocapStudio />}
          {page === 'models' && <Models />}
          {page === 'animations' && <ComingSoon icon={<Clapperboard size={30} />} title="Animation Studio" text="Timeline editing, cleanup, loop tools, IK and skeleton retargeting are the next part of the Forge pipeline." />}
          {page === 'textures' && <ComingSoon icon={<Layers3 size={30} />} title="Texture Lab" text="PBR material authoring, texture channel generation and reusable material presets will live here." />}
          {page === 'assets' && <AssetLibrary />}
        </div>
      </div>
    </div>
  )
}

function ComingSoon({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="center-state"><div className="center-state-icon">{icon}</div><span className="eyebrow">FORGE PIPELINE</span><h2>{title}</h2><p>{text}</p><div className="soon-chip">FOUNDATION IN PLACE</div></div>
}

function AssetLibrary() {
  const items = [
    ['Characters', 'Humanoid bases, creatures and NPC rigs'],
    ['Animations', 'Mocap clips and reusable movement sets'],
    ['Props', 'Weapons, furniture, tools and world objects'],
    ['Materials', 'Stone, wood, metal, terrain and PBR presets'],
    ['Environment', 'Trees, rocks, buildings and modular kits'],
    ['Audio', 'Sound effects, ambience and music references'],
  ]
  return <div className="page-scroll asset-page"><div className="section-heading"><div><span className="eyebrow">SHARED LIBRARY</span><h1>Assets</h1></div><span className="muted">The common asset source for every Forge-connected game.</span></div><div className="asset-grid">{items.map(([title, text]) => <article className="asset-folder" key={title}><div className="asset-folder-icon"><Boxes size={23} /></div><div><h3>{title}</h3><p>{text}</p></div><span>0 items</span></article>)}</div></div>
}
