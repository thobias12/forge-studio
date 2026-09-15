import { useEffect, useState } from 'react'
import { AudioLines, Box, Boxes, Clapperboard, Gamepad2, Hammer, Home, Layers3, MapPinned, ScanLine, Settings, Sparkles, UserRoundCog, WandSparkles, Skull } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import MocapStudio from './pages/MocapStudio'
import Models from './pages/Models'
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
import { FORGE_VERSION } from './version'
import './styles.css'
import './retarget.css'
import './texture-v071.css'
import './character.css'

type Page = 'home' | 'mocap' | 'models' | 'destruction' | 'characterforge' | 'characters' | 'animations' | 'textures' | 'audio' | 'vfx' | 'maps' | 'preview' | 'assets'

const nav = [
  { id: 'home' as const, label: 'Home', icon: Home },
  { id: 'mocap' as const, label: 'Mocap', icon: ScanLine },
  { id: 'models' as const, label: 'Models', icon: Box },
  { id: 'destruction' as const, label: 'Destruction Lab', icon: Hammer },
  { id: 'characterforge' as const, label: 'Character Forge', icon: Skull },
  { id: 'characters' as const, label: 'Character Assembly', icon: UserRoundCog },
  { id: 'animations' as const, label: 'Animations', icon: Clapperboard },
  { id: 'textures' as const, label: 'Textures', icon: Layers3 },
  { id: 'audio' as const, label: 'Voice & Audio', icon: AudioLines },
  { id: 'vfx' as const, label: 'VFX Studio', icon: WandSparkles },
  { id: 'maps' as const, label: 'Map Studio', icon: MapPinned },
  { id: 'preview' as const, label: 'Game Preview', icon: Gamepad2 },
  { id: 'assets' as const, label: 'Asset Library', icon: Boxes },
]

export default function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('capture') === '1') return <Capture />

  const [page, setPage] = useState<Page>(() => {
    const value = window.location.hash.replace('#/', '') as Page
    return nav.some((item) => item.id === value) ? value : 'home'
  })

  useEffect(() => { window.location.hash = `/${page}` }, [page])
  useEffect(() => installHistoryShortcuts(), [])

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <button className="forge-brand" onClick={() => setPage('home')}>
          <div className="forge-logo">F</div><div><strong>FORGE</strong><span>STUDIO</span></div>
        </button>
        <nav className="sidebar-nav">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="project-card"><div className="project-icon"><Sparkles size={16} /></div><div><span>Workspace</span><strong>Shared Library</strong></div></div>
        <button className="sidebar-settings"><Settings size={17} /><span>Settings</span></button>
        <div className="build-tag">FORGE v{FORGE_VERSION}</div>
      </aside>

      <div className="studio-body">
        <header className="topbar">
          <div className="breadcrumb"><span>FORGE</span><b>/</b><strong>{nav.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-right"><span className="engine-pill">THREE.JS</span><span className="session-dot" /> GitHub workspace</div>
        </header>
        <div className="content-area">
          {page === 'home' && <Dashboard onOpenMocap={() => setPage('mocap')} />}
          {page === 'mocap' && <MocapStudio />}
          {page === 'models' && <Models />}
          {page === 'destruction' && <DestructionLab />}
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
