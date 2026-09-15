import { useEffect, useState } from 'react'
import { Box, Info, Layers3, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import ProceduralItemGeneratorPanel from '../components/ProceduralItemGeneratorPanel'
import ItemForgeV2 from './ItemForgeV2'
import '../item-forge-navigation.css'

type Props = { onOpenModelCreator?: () => void }
type ItemForgeStep = 'details' | 'model' | 'presentations'

export default function ItemForge({ onOpenModelCreator }: Props) {
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [activeStep, setActiveStep] = useState<ItemForgeStep>('details')
  const [workspaceRevision, setWorkspaceRevision] = useState(0)

  useEffect(() => {
    const handleApplied = () => {
      setGeneratorOpen(false)
      setActiveStep('presentations')
      setWorkspaceRevision((value) => value + 1)
    }
    window.addEventListener('forge:item-generator-applied', handleApplied)
    return () => window.removeEventListener('forge:item-generator-applied', handleApplied)
  }, [])

  return <div className="item-forge-workspace-shell" data-step={activeStep}>
    <nav className="item-forge-commandbar" aria-label="Item Forge sections">
      <div className="item-forge-commandbar-title">
        <SlidersHorizontal size={15}/>
        <span><strong>Item Forge</strong><small>Build one part at a time</small></span>
      </div>
      <div className="item-forge-commandbar-nav">
        <button className={activeStep === 'details' ? 'active' : ''} onClick={() => setActiveStep('details')}><Info size={13}/><span>1 · Item</span></button>
        <button className={activeStep === 'model' ? 'active' : ''} onClick={() => setActiveStep('model')}><Box size={13}/><span>2 · Model</span></button>
        <button className={activeStep === 'presentations' ? 'active' : ''} onClick={() => setActiveStep('presentations')}><Layers3 size={13}/><span>3 · Presentations</span></button>
        <button className={`generator ${generatorOpen ? 'active' : ''}`} onClick={() => setGeneratorOpen(true)}><Sparkles size={13}/><span>Procedural Generator</span></button>
      </div>
    </nav>

    <ItemForgeV2 key={workspaceRevision} onOpenModelCreator={onOpenModelCreator}/>

    {generatorOpen && <div className="item-generator-overlay" role="dialog" aria-modal="true" aria-label="Procedural Item Generator" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setGeneratorOpen(false)
    }}>
      <aside className="item-generator-drawer">
        <header className="item-generator-drawer-header">
          <div><span>ITEM FORGE</span><strong>Procedural Generator</strong><small>Edit the recipe, then apply it directly to the selected item.</small></div>
          <button aria-label="Close generator" onClick={() => setGeneratorOpen(false)}><X size={17}/></button>
        </header>
        <div className="item-generator-drawer-content">
          <ProceduralItemGeneratorPanel/>
        </div>
      </aside>
    </div>}
  </div>
}
