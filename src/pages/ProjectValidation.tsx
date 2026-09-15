import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Link2, Search, ShieldCheck } from 'lucide-react'
import {
  entryStatus,
  registryStats,
  searchForgeRegistry,
  type ForgeContentEntry,
  type ForgeContentPage,
  type ForgeReadiness,
} from '../engine/contentRegistry'
import { loadSkillboundWorkspace } from '../engine/forgeProject'
import { buildProjectDependencies, summarizeDependencies, type ForgeDependencyEdge } from '../engine/projectDependencies'
import { listAssets } from '../lib/library'
import '../project-persistence.css'

export default function ProjectValidation({ registry, onNavigate }: { registry: ForgeContentEntry[]; onNavigate: (page: ForgeContentPage) => void }) {
  const [query, setQuery] = useState('')
  const [dependencies, setDependencies] = useState<ForgeDependencyEdge[]>([])
  const [dependencyStatus, setDependencyStatus] = useState('Reading Skillbound dependency graph…')
  const stats = useMemo(() => registryStats(registry), [registry])
  const entries = useMemo(() => searchForgeRegistry(registry, query), [registry, query])
  const dependencyStats = useMemo(() => summarizeDependencies(dependencies), [dependencies])
  const visibleDependencies = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle ? dependencies.filter((edge) => `${edge.sourceId} ${edge.targetId} ${edge.label} ${edge.detail}`.toLowerCase().includes(needle)) : dependencies
    const rank = { missing: 0, warning: 1, ready: 2 }
    return [...filtered].sort((a, b) => rank[a.status] - rank[b.status] || a.sourceId.localeCompare(b.sourceId))
  }, [dependencies, query])

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadSkillboundWorkspace(), listAssets().catch(() => [])]).then(([workspace, assets]) => {
      if (cancelled) return
      const graph = buildProjectDependencies(workspace, assets)
      setDependencies(graph)
      const summary = summarizeDependencies(graph)
      setDependencyStatus(summary.missing ? `${summary.missing} broken reference${summary.missing === 1 ? '' : 's'} must be fixed.` : summary.warnings ? 'All concrete references resolve; optional presentation bindings remain.' : 'Every project and Library dependency resolves.')
    }).catch((error) => {
      if (!cancelled) setDependencyStatus(error instanceof Error ? error.message : 'Could not build project dependencies.')
    })
    return () => { cancelled = true }
  }, [registry])

  return <div className="page-scroll validation-page">
    <header className="validation-hero">
      <div><span className="eyebrow">SKILLBOUND · PROJECT VALIDATION</span><h1>Runtime readiness</h1><p>Forge validates registered content and now follows the actual dependency graph between worlds, gameplay definitions and Shared Library assets. Broken IDs are treated as blocking references instead of being discovered later in Play Mode.</p></div>
      <div className="validation-score"><ShieldCheck size={25}/><strong>{stats.missing || dependencyStats.missing ? 'Needs work' : stats.warnings || dependencyStats.warnings ? 'Healthy' : 'Ready'}</strong><span>{stats.ready + dependencyStats.ready} ready · {stats.warnings + dependencyStats.warnings} warnings · {stats.missing + dependencyStats.missing} missing</span></div>
    </header>

    <div className="validation-summary">
      <Summary label="Registered content" value={stats.total}/>
      <Summary label="Ready checks" value={stats.ready}/>
      <Summary label="Dependency edges" value={dependencyStats.total}/>
      <Summary label="Broken references" value={dependencyStats.missing}/>
    </div>

    <label className="validation-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by content ID, dependency, type, tag or tool…"/></label>

    <section className="dependency-panel">
      <header><div><Link2 size={15}/><span><strong>Dependency graph</strong><small>{dependencyStatus}</small></span></div><div className="dependency-totals"><b className="ready">{dependencyStats.ready} ready</b><b className="warning">{dependencyStats.warnings} optional</b><b className="missing">{dependencyStats.missing} broken</b></div></header>
      <div className="dependency-list">
        {visibleDependencies.map((edge) => <div className={`dependency-edge ${edge.status}`} key={edge.id}>
          <StatusIcon status={edge.status}/>
          <span className="dependency-source">{edge.sourceId}</span>
          <i>→</i>
          <span className="dependency-target">{edge.targetId}</span>
          <span className="dependency-label"><strong>{edge.label}</strong><small>{edge.detail}</small></span>
          <em>{edge.kind}{edge.required ? ' · required' : ' · optional'}</em>
        </div>)}
        {!visibleDependencies.length && <div className="dependency-empty">No dependency edges match this filter.</div>}
      </div>
    </section>

    <div className="validation-list">
      {entries.map((entry) => <article className={`validation-entry ${entryStatus(entry)}`} key={entry.id}>
        <header>
          <StatusIcon status={entryStatus(entry)}/>
          <div><strong>{entry.name}</strong><code>{entry.id}</code></div>
          <span>{entry.kind}</span>
          <button onClick={() => onNavigate(entry.page)}>Open in {entry.source}</button>
        </header>
        <div className="validation-checks">
          {entry.checks.map((check) => <div key={check.id} className={check.status}>
            <StatusIcon status={check.status}/>
            <span><strong>{check.label}</strong><small>{check.detail}</small></span>
          </div>)}
        </div>
      </article>)}
    </div>
  </div>
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}

function StatusIcon({ status }: { status: ForgeReadiness }) {
  if (status === 'ready') return <CheckCircle2 size={15}/>
  if (status === 'warning') return <AlertTriangle size={15}/>
  return <Circle size={15}/>
}
