import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Search, ShieldCheck } from 'lucide-react'
import {
  entryStatus,
  registryStats,
  searchForgeRegistry,
  type ForgeContentEntry,
  type ForgeContentPage,
  type ForgeReadiness,
} from '../engine/contentRegistry'

export default function ProjectValidation({ registry, onNavigate }: { registry: ForgeContentEntry[]; onNavigate: (page: ForgeContentPage) => void }) {
  const [query, setQuery] = useState('')
  const stats = useMemo(() => registryStats(registry), [registry])
  const entries = useMemo(() => searchForgeRegistry(registry, query), [registry, query])

  return <div className="page-scroll validation-page">
    <header className="validation-hero">
      <div><span className="eyebrow">SKILLBOUND · PROJECT VALIDATION</span><h1>Runtime readiness</h1><p>Every registered piece of content gets stable IDs and explicit checks. Warnings are integration work; missing checks block a clean runtime-ready state.</p></div>
      <div className="validation-score"><ShieldCheck size={25}/><strong>{stats.missing ? 'Needs work' : stats.warnings ? 'Healthy' : 'Ready'}</strong><span>{stats.ready} ready · {stats.warnings} warnings · {stats.missing} missing</span></div>
    </header>

    <div className="validation-summary">
      <Summary label="Registered content" value={stats.total}/>
      <Summary label="Ready checks" value={stats.ready}/>
      <Summary label="Warnings" value={stats.warnings}/>
      <Summary label="Missing checks" value={stats.missing}/>
    </div>

    <label className="validation-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by content ID, type, tag or tool…"/></label>

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
