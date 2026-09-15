import { useState } from 'react'
import { Box, Info, Layers3, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import ProceduralItemGeneratorPanel from '../components/ProceduralItemGeneratorPanel'
import ItemForgeV2 from './ItemForgeV2'
import '../item-forge-navigation.css'

type Props = { onOpenModelCreator?: () => void }

export default function ItemForge({ onOpenModelCreator }: Props) {
  const [generatorOpen, setGeneratorOpen] = useState(false)

  const jumpTo = (selector: string) => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="item-forge-workspace-shell">
    <nav className="item-forge-commandbar" aria-label="Item Forge sections">
      <div className="item-forge-commandbar-title">
        <SlidersHorizontal size={15}/>
        <span><strong>Item Forge</strong><small>Work one step at a time</small></span>
      </div>
      <div className="item-forge-commandbar-nav">
        <button onClick={() => jumpTo('.item-v2-definition')}><Info size={13}/><span>Details</span></button>
        <button onClick={() => jumpTo('.item-master-workbench')}><Box size={13}/><span>Model</span></button>
        <button onClick={() => jumpTo('.item-presentation-grid')}><Layers3 size={13}/><span>Presentations</span></button>
        <button className="generator" onClick={() => setGeneratorOpen(true)}><Sparkles size={13}/><span>Procedural Generator</span></button>
      </div>
    </nav>

    <ItemForgeV2 onOpenModelCreator={onOpenModelCreator}/>

    {generatorOpen && <div className="item-generator-overlay" role="dialog" aria-modal="true" aria-label="Procedural Item Generator" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setGeneratorOpen(false)
    }}>
      <aside className="item-generator-drawer">
        <header className="item-generator-drawer-header">
          <div><span>ITEM FORGE</span><strong>Procedural Generator</strong><small>Generate and iterate the selected item without leaving Item Forge.</small></div>
          <button aria-label="Close generator" onClick={() => setGeneratorOpen(false)}><X size={17}/></button>
        </header>
        <div className="item-generator-drawer-content">
          <ProceduralItemGeneratorPanel/>
        </div>
      </aside>
    </div>}
  </div>
}
