import { Box, Clapperboard, Layers3, ScanLine, Sparkles, WandSparkles } from 'lucide-react'

const tools = [
  { icon: ScanLine, title: 'Phone Mocap', text: 'Pair your phone, capture movement and record Forge motion clips.', badge: 'Working now' },
  { icon: Box, title: 'Model Lab', text: 'Inspect GLB/GLTF assets, scale, animation and scene fit.', badge: 'Working now' },
  { icon: Clapperboard, title: 'Animation Studio', text: 'Clean, trim, loop, blend and retarget animation clips.', badge: 'Foundation ready' },
  { icon: Layers3, title: 'Texture Lab', text: 'Create and inspect PBR material sets and reusable texture presets.', badge: 'Next' },
  { icon: WandSparkles, title: 'AI Workshop', text: 'Connect local image-to-3D and texture generation to your GPU.', badge: 'Planned' },
  { icon: Sparkles, title: 'Asset Library', text: 'One reusable library shared by every Three.js game you build.', badge: 'Foundation ready' },
]

export default function Dashboard({ onOpenMocap }: { onOpenMocap: () => void }) {
  return (
    <div className="page-scroll dashboard-page">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">FORGE WORKSPACE</div>
          <h1>Build game assets once.<br />Use them everywhere.</h1>
          <p>Models, animation, phone mocap and reusable content for your Three.js projects in one studio.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenMocap}><ScanLine size={17} /> Start phone mocap</button>
            <span className="hero-note">v0.1 · live peer-to-peer capture</span>
          </div>
        </div>
        <div className="hero-orb">
          <div className="orb-ring orb-ring-a" />
          <div className="orb-ring orb-ring-b" />
          <div className="orb-core">F</div>
        </div>
      </section>

      <div className="section-heading">
        <div><span className="eyebrow">WORKBENCH</span><h2>Studio tools</h2></div>
        <span className="muted">Designed as one shared pipeline for every game.</span>
      </div>

      <div className="tool-grid">
        {tools.map(({ icon: Icon, title, text, badge }) => (
          <article className="tool-card" key={title}>
            <div className="tool-icon"><Icon size={20} /></div>
            <span className="tool-badge">{badge}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
