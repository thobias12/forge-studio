import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, FolderSync, HardDrive, Link2, Search, ShieldCheck } from 'lucide-react'
import {
  entryStatus,
  registryStats,
  searchForgeRegistry,
  type ForgeContentEntry,
  type ForgeContentPage,
  type ForgeReadiness,
} from '../engine/contentRegistry'
import { loadSkillboundWorkspace, saveSkillboundWorkspace, type ForgeProjectWorkspace } from '../engine/forgeProject'
import { buildProjectDependencies, summarizeDependencies, type ForgeDependencyEdge } from '../engine/projectDependencies'
import { auditEntryStatus, buildSkillboundContentAudit, summarizeSkillboundContentAudit } from '../engine/contentAudit'
import {
  loadBundledSkillboundProjectAssetIndex,
  syncSkillboundProjectAssetsToConnectedSource,
} from '../engine/projectAssetSync'
import {
  getSkillboundProjectConnection,
  saveSkillboundWorkspaceToProjectFolder,
  type ForgeProjectConnectionInfo,
} from '../engine/projectPersistence'
import { listAssets, type LibraryAsset } from '../lib/library'
import '../project-persistence.css'
import '../content-audit.css'

export default function ProjectValidation({ registry, onNavigate }: { registry: ForgeContentEntry[]; onNavigate: (page: ForgeContentPage) => void }) {
  const [query, setQuery] = useState('')
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [sourceAssetIds, setSourceAssetIds] = useState<Set<string>>(new Set())
  const [connection, setConnection] = useState<ForgeProjectConnectionInfo>()
  const [dependencies, setDependencies] = useState<ForgeDependencyEdge[]>([])
  const [dependencyStatus, setDependencyStatus] = useState('Reading Skillbound dependency graph…')
  const [syncStatus, setSyncStatus] = useState('Project assets are checked against the deployed Skillbound source index.')
  const [syncing, setSyncing] = useState(false)
  const stats = useMemo(() => registryStats(registry), [registry])
  const entries = useMemo(() => searchForgeRegistry(registry, query), [registry, query])
  const dependencyStats = useMemo(() => summarizeDependencies(dependencies), [dependencies])
  const auditEntries = useMemo(() => workspace ? buildSkillboundContentAudit(workspace, assets, sourceAssetIds) : [], [workspace, assets, sourceAssetIds])
  const auditStats = useMemo(() => summarizeSkillboundContentAudit(auditEntries), [auditEntries])
  const visibleAuditEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return auditEntries
    return auditEntries.filter((entry) => `${entry.id} ${entry.name} ${entry.kind} ${entry.tool} ${entry.checks.map((check) => `${check.label} ${check.detail}`).join(' ')}`.toLowerCase().includes(needle))
  }, [auditEntries, query])
  const visibleDependencies = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle ? dependencies.filter((edge) => `${edge.sourceId} ${edge.targetId} ${edge.label} ${edge.detail}`.toLowerCase().includes(needle)) : dependencies
    const rank = { missing: 0, warning: 1, ready: 2 }
    return [...filtered].sort((a, b) => rank[a.status] - rank[b.status] || a.sourceId.localeCompare(b.sourceId))
  }, [dependencies, query])
  const sourceConnected = Boolean(connection && connection.permission !== 'denied' && connection.permission !== 'unsupported')

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      loadSkillboundWorkspace(),
      listAssets().catch(() => []),
      loadBundledSkillboundProjectAssetIndex().catch(() => undefined),
      getSkillboundProjectConnection().catch(() => undefined),
    ]).then(([nextWorkspace, nextAssets, sourceIndex, nextConnection]) => {
      if (cancelled) return
      setWorkspace(nextWorkspace)
      setAssets(nextAssets)
      setSourceAssetIds(new Set(sourceIndex?.assets.map((asset) => asset.id) ?? []))
      setConnection(nextConnection)
      const graph = buildProjectDependencies(nextWorkspace, nextAssets)
      setDependencies(graph)
      const summary = summarizeDependencies(graph)
      setDependencyStatus(summary.missing ? `${summary.missing} broken reference${summary.missing === 1 ? '' : 's'} must be fixed.` : summary.warnings ? 'All concrete references resolve; optional presentation bindings remain.' : 'Every project and Library dependency resolves.')
    }).catch((error) => {
      if (!cancelled) setDependencyStatus(error instanceof Error ? error.message : 'Could not build project dependencies.')
    })
    return () => { cancelled = true }
  }, [registry])

  const syncProjectSource = async () => {
    if (!workspace || syncing) return
    setSyncing(true)
    try {
      setSyncStatus('Writing Skillbound definitions and all bound Library assets to the connected source…')
      const written = await saveSkillboundWorkspaceToProjectFolder(workspace)
      const report = await syncSkillboundProjectAssetsToConnectedSource(written, assets)
      const saved = saveSkillboundWorkspace(written)
      setWorkspace(saved)
      setSourceAssetIds(new Set(report.syncedIds))
      setConnection(await getSkillboundProjectConnection().catch(() => connection))
      const graph = buildProjectDependencies(saved, assets)
      setDependencies(graph)
      const missingText = report.missingIds.length ? ` ${report.missingIds.length} bound asset ID${report.missingIds.length === 1 ? '' : 's'} could not be found in this browser Library.` : ''
      setSyncStatus(`Source sync complete · ${report.syncedIds.length} bound asset${report.syncedIds.length === 1 ? '' : 's'} + project definitions written.${missingText}`)
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Could not sync Skillbound project source.')
    } finally {
      setSyncing(false)
    }
  }

  return <div className="page-scroll validation-page">
    <header className="validation-hero">
      <div><span className="eyebrow">SKILLBOUND · PROJECT VALIDATION</span><h1>Runtime readiness</h1><p>Forge validates project references, presentation completeness and whether bound Library assets are portable with the Skillbound source instead of existing only in this browser.</p></div>
      <div className="validation-score"><ShieldCheck size={25}/><strong>{stats.missing || dependencyStats.missing || auditStats.missing ? 'Needs work' : stats.warnings || dependencyStats.warnings || auditStats.warnings ? 'Healthy' : 'Ready'}</strong><span>{auditStats.completeEntries}/{auditEntries.length || 0} gameplay content entries fully source-backed</span></div>
    </header>

    <div className="validation-summary">
      <Summary label="Registered content" value={stats.total}/>
      <Summary label="Content checks" value={auditStats.total}/>
      <Summary label="Source-backed ready" value={auditStats.ready}/>
      <Summary label="Broken references" value={dependencyStats.missing + auditStats.missing}/>
    </div>

    <label className="validation-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter content, presentation binding, dependency or asset…"/></label>

    <section className="content-audit-panel">
      <header>
        <div><HardDrive size={16}/><span><strong>Skillbound content completion</strong><small>{syncStatus}</small></span></div>
        <div className="content-audit-header-actions">
          <div className="dependency-totals"><b className="ready">{auditStats.ready} ready</b><b className="warning">{auditStats.warnings} incomplete/local</b><b className="missing">{auditStats.missing} broken</b></div>
          <button className="source-sync-button" disabled={!sourceConnected || syncing || !workspace} onClick={() => void syncProjectSource()}><FolderSync size={14}/>{syncing ? 'Syncing…' : 'Sync project source'}</button>
        </div>
      </header>
      <div className={`content-source-state ${sourceConnected ? 'ready' : 'warning'}`}><i/><span><strong>{sourceConnected ? 'Connected source available' : 'Source folder not connected'}</strong><small>{sourceConnected ? 'Sync writes project JSON plus every currently bound Character / Animation / VFX / SFX / icon / item model into public/projects/skillbound/assets/library.' : 'Connect the forge-studio repository in Project Manager to make browser Library assets portable.'}</small></span></div>
      <div className="content-audit-grid">
        {visibleAuditEntries.map((entry) => <article className={`content-audit-card ${auditEntryStatus(entry)}`} key={entry.id}>
          <header><StatusIcon status={auditEntryStatus(entry)}/><span><strong>{entry.name}</strong><small>{entry.id}</small></span><em>{entry.tool}</em></header>
          <div>{entry.checks.map((check) => <div className={`content-audit-check ${check.status}`} key={check.id}><StatusIcon status={check.status}/><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div>
        </article>)}
        {!visibleAuditEntries.length && <div className="content-audit-empty">No content completion entries match this filter.</div>}
      </div>
    </section>

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
