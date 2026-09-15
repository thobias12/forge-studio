import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Gamepad2, Globe2 } from 'lucide-react'
import SkillboundPlayViewport from '../components/SkillboundPlayViewport'
import { generateGuidedRegion } from '../engine/guidedWorld'
import { loadSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'

export default function ProjectPlay({ onOpenWorld, onBackHome }: { onOpenWorld: () => void; onBackHome: () => void }) {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [error, setError] = useState('')

  useEffect(() => {
    void loadSkillboundWorkspace()
      .then(setWorkspace)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load Skillbound project.'))
  }, [])

  const region = workspace?.regions.find((item) => item.id === workspace.editor.selectedRegionId) ?? workspace?.regions[0]
  const generated = useMemo(() => {
    if (!workspace || !region) return undefined
    return generateGuidedRegion(region, workspace.editor.previewSeed, workspace.manifest.generationVersion)
  }, [workspace, region])

  if (!workspace || !region || !generated) return <div className="project-play-loading"><Gamepad2 size={30}/><strong>Starting Skillbound</strong><span>{error || 'Loading Forge project runtime…'}</span><button onClick={onBackHome}><ArrowLeft size={14}/> Back to Control Center</button></div>

  return <div className="project-play-page">
    <div className="project-play-toolbar">
      <div><span className="eyebrow">FORGE PLAY PROJECT</span><strong>{workspace.manifest.name}</strong><small>{region.name} · seed {workspace.editor.previewSeed}</small></div>
      <div><button onClick={onBackHome}><ArrowLeft size={14}/> Control Center</button><button onClick={onOpenWorld}><Globe2 size={14}/> Edit World</button></div>
    </div>
    <div className="project-play-runtime"><SkillboundPlayViewport region={generated}/></div>
  </div>
}
