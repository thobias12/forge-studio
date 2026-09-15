import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Globe2,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  RECENT_FORGE_CHANGES,
  SKILLBOUND_PIPELINE,
  entryStatus,
  registryStats,
  searchForgeRegistry,
  summarizeProjectHealth,
  type ForgeContentEntry,
  type ForgeContentPage,
  type ForgeReadiness,
} from '../engine/contentRegistry'

type Props = {
  registry: ForgeContentEntry[]
  onNavigate: (page: ForgeContentPage) => void
}

export default function Dashboard({ registry, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const health = useMemo(() => summarizeProjectHealth(registry), [registry])
  const stats = useMemo(() => registryStats(registry), [registry])
  const results = useMemo(() => searchForgeRegistry(registry, query).slice(0, 8), [registry, query])

  return (
    <div className="page-scroll control-center-page">
      <section className="control-hero">
        <div>
          <div className="eyebrow">ACTIVE FORGE PROJECT</div>
          <div className="control-title-row">
            <div>
              <h1>Skillbound</h1>
              <p>Forge project · Act I · single-player runtime</p>
            </div>
            <span className="control-project-state"><i /> ACTIVE</span>
          </div>
          <p className="control-hero-copy">One cockpit for the project, runtime and authoring pipeline. Forge now shows what is ready, what is still being integrated, and where to work next.</p>
          <div className="control-hero-actions">
            <button className="primary-button" onClick={() => onNavigate('play')}><Play size={16}/> Play Project</button>
            <button className="secondary-button" onClick={() => onNavigate('world')}><Globe2 size={16}/> Open World Forge</button>
            <button className="secondary-button" onClick={() => onNavigate('validation')}><ShieldCheck size={16}/> Validate Project</button>
          </div>
        </div>
        <div className="control-phase-card">
          <span>CURRENT DEVELOPMENT</span>
          <strong>Phase 2 complete · Authoring & feel</strong>
          <div className="control-phase-flow"><b>Characters</b><i>→</i><b>Animation</b><i>→</i><b>VFX</b><i>→</i><b>Audio</b><i>→</i><b>Dungeon</b></div>
          <small>The vertical slice works. Next, connect authored Forge assets and improve combat presentation instead of adding breadth.</small>
        </div>
      </section>

      <section className="control-grid control-grid-top">
        <article className="control-panel control-health-panel">
          <header><div><span className="eyebrow">PROJECT HEALTH</span><h2>What is ready?</h2></div><button onClick={() => onNavigate('validation')}>Full validation <ChevronRight size={13}/></button></header>
          <div className="control-health-grid">
            {health.map((item) => <button key={item.id} onClick={() => onNavigate(item.page)} className={`health-card ${item.status}`}>
              <StatusIcon status={item.status}/>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <ChevronRight size={13}/>
            </button>)}
          </div>
        </article>

        <article className="control-panel control-overview-panel">
          <header><div><span className="eyebrow">REGISTRY</span><h2>Project content</h2></div><Boxes size={18}/></header>
          <div className="control-stat-grid">
            <ProjectNumber label="Registered" value={stats.total}/>
            <ProjectNumber label="Ready checks" value={stats.ready}/>
            <ProjectNumber label="Warnings" value={stats.warnings}/>
            <ProjectNumber label="Missing" value={stats.missing}/>
          </div>
          <div className="control-kind-list">
            {Object.entries(stats.byKind).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([kind, count]) => <div key={kind}><span>{kind}</span><strong>{count}</strong></div>)}
          </div>
        </article>
      </section>

      <section className="control-panel control-pipeline-panel">
        <header><div><span className="eyebrow">SKILLBOUND PIPELINE</span><h2>Integration status</h2></div><Activity size={18}/></header>
        <div className="control-pipeline">
          {SKILLBOUND_PIPELINE.map((stage, index) => <div className={`pipeline-stage ${stage.status}`} key={stage.id}>
            <div className="pipeline-node"><StatusIcon status={stage.status}/></div>
            <strong>{stage.label}</strong>
            <small>{stage.detail}</small>
            {index < SKILLBOUND_PIPELINE.length - 1 && <i className="pipeline-link"/>}
          </div>)}
        </div>
      </section>

      <section className="control-grid control-grid-bottom">
        <article className="control-panel control-search-panel">
          <header><div><span className="eyebrow">CONTENT REGISTRY</span><h2>Find anything in Forge</h2></div><Search size={18}/></header>
          <label className="control-search">
            <Search size={15}/>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search IDs, assets, regions, UI, characters…"/>
          </label>
          <div className="control-search-results">
            {results.map((entry) => <button key={entry.id} onClick={() => onNavigate(entry.page)}>
              <StatusIcon status={entryStatus(entry)}/>
              <span><strong>{entry.name}</strong><small>{entry.id} · {entry.source}</small></span>
              <em>{entry.kind}</em>
              <ChevronRight size={13}/>
            </button>)}
            {!results.length && <div className="control-empty"><Search size={18}/><span>No Forge content matches that search.</span></div>}
          </div>
        </article>

        <article className="control-panel control-recent-panel">
          <header><div><span className="eyebrow">RECENT CHANGES</span><h2>Forge milestones</h2></div><Clock3 size={18}/></header>
          <div className="control-recent-list">
            {RECENT_FORGE_CHANGES.map((item) => <div key={item.version}>
              <span className="recent-version">v{item.version}</span>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </div>)}
          </div>
          <button className="control-project-manager" onClick={() => onNavigate('projects')}><Sparkles size={14}/> Open Project Manager <ChevronRight size={13}/></button>
        </article>
      </section>
    </div>
  )
}

function StatusIcon({ status }: { status: ForgeReadiness }) {
  if (status === 'ready') return <CheckCircle2 className="status-icon" size={15}/>
  if (status === 'warning') return <AlertTriangle className="status-icon" size={15}/>
  return <Circle className="status-icon" size={15}/>
}

function ProjectNumber({ label, value }: { label: string; value: number }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}
