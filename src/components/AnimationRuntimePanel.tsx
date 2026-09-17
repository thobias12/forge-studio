import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, RefreshCw, Save, Swords, Zap } from 'lucide-react'
import {
  FORGE_ANIMATION_ACTIONS,
  actionDefinition,
  animationBindingAssetId,
  animationSetBlob,
  createAnimationSet,
  normalizeAnimationSet,
  parseAnimationSet,
  type ForgeAnimationActionId,
  type ForgeAnimationEventKind,
  type ForgeAnimationSet,
} from '../engine/animationBindings'
import { getAsset, listAssets, saveAsset, type LibraryAsset } from '../lib/library'

const EVENT_KINDS: Array<{ id: ForgeAnimationEventKind; label: string; defaultTime: number }> = [
  { id: 'hit', label: 'Hit', defaultTime: .42 },
  { id: 'vfx', label: 'VFX', defaultTime: .36 },
  { id: 'sfx', label: 'SFX', defaultTime: .24 },
  { id: 'recovery', label: 'Recovery', defaultTime: .72 },
]

export default function AnimationRuntimePanel() {
  const [targets, setTargets] = useState<LibraryAsset[]>([])
  const [targetId, setTargetId] = useState('')
  const [set, setSet] = useState<ForgeAnimationSet>()
  const [selectedAction, setSelectedAction] = useState<ForgeAnimationActionId>('attackPrimary')
  const [status, setStatus] = useState('Loading animation targets…')
  const [saving, setSaving] = useState(false)

  const selectedTarget = useMemo(() => targets.find((asset) => asset.id === targetId), [targets, targetId])
  const binding = set?.actions[selectedAction]

  const refreshTargets = async () => {
    const assets = await listAssets()
    const next = assets.filter((asset) => asset.category === 'characters' && asset.kind === 'glb' && (
      asset.tags.includes('ForgeHumanoidV1') ||
      asset.tags.includes('animation-target') ||
      asset.tags.includes('concept-forge-2') ||
      asset.tags.includes('rigged')
    ))
    setTargets(next)
    setTargetId((current) => current && next.some((asset) => asset.id === current) ? current : next[0]?.id ?? '')
    setStatus(next.length ? 'Select an action to inspect its gameplay binding and timing.' : 'No ForgeHumanoidV1 animation targets found yet.')
  }

  useEffect(() => { void refreshTargets() }, [])

  useEffect(() => {
    if (!targetId) { setSet(undefined); return }
    let cancelled = false
    void (async () => {
      const asset = await getAsset(animationBindingAssetId(targetId)).catch(() => undefined)
      const parsed = asset ? await parseAnimationSet(asset.blob, targetId) : undefined
      if (!cancelled) setSet(parsed ?? createAnimationSet(targetId, []))
    })()
    return () => { cancelled = true }
  }, [targetId])

  const updateEvent = (kind: ForgeAnimationEventKind, time: number | undefined) => {
    setSet((current) => {
      if (!current) return current
      const currentBinding = current.actions[selectedAction] ?? {
        clip: undefined,
        loop: actionDefinition(selectedAction)?.loop ?? false,
        speed: 1,
      }
      const existing = currentBinding.events ?? []
      const events = time === undefined
        ? existing.filter((event) => event.kind !== kind)
        : [...existing.filter((event) => event.kind !== kind), { id: `${selectedAction}-${kind}`, kind, time: Math.max(0, time) }].sort((a, b) => a.time - b.time)
      return {
        ...current,
        actions: {
          ...current.actions,
          [selectedAction]: { ...currentBinding, events: events.length ? events : undefined },
        },
      }
    })
  }

  const save = async () => {
    if (!set || !selectedTarget) return
    setSaving(true)
    try {
      const normalized = normalizeAnimationSet(set, selectedTarget.id)
      await saveAsset({
        id: animationBindingAssetId(selectedTarget.id),
        name: `${selectedTarget.name} Action Bindings`,
        category: 'animations',
        kind: 'file',
        mime: 'application/x-forge-animation-set+json',
        tags: ['animation-bindings', 'ForgeHumanoidV1', selectedTarget.id],
        source: 'Forge Animation Studio · Runtime 2.0',
        blob: animationSetBlob(normalized),
      })
      setSet(normalized)
      setStatus(`Saved ${actionDefinition(selectedAction)?.label} timing for ${selectedTarget.name}.`)
    } finally {
      setSaving(false)
    }
  }

  return <section className="animation-runtime-panel">
    <header>
      <div><span className="eyebrow">ANIMATION RUNTIME 2.0</span><strong>Gameplay bindings & timing</strong><small>Everything published for the selected character in one overview.</small></div>
      <button className="secondary-button" onClick={() => void refreshTargets()}><RefreshCw size={14}/> Refresh</button>
    </header>

    <div className="animation-runtime-target-row">
      <label><span>Character / runtime target</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      {selectedTarget?.tags.includes('skillbound-player-profile') && <div className="animation-player-target-badge"><Zap size={13}/> Skillbound Player</div>}
    </div>

    <div className="animation-binding-grid">
      {FORGE_ANIMATION_ACTIONS.map((action) => {
        const item = set?.actions[action.id]
        return <button key={action.id} className={`${selectedAction === action.id ? 'active ' : ''}${item?.clip ? 'bound' : 'missing'}`} onClick={() => setSelectedAction(action.id)}>
          <span>{item?.clip ? <CheckCircle2 size={14}/> : <Clock3 size={14}/>}<strong>{action.label}</strong></span>
          <small>{item?.clip ?? 'Not authored yet'}</small>
        </button>
      })}
    </div>

    <div className="animation-event-editor">
      <div className="animation-event-heading"><Swords size={15}/><div><strong>{actionDefinition(selectedAction)?.label}</strong><small>{binding?.clip ? `Clip · ${binding.clip}` : 'Record and publish this action in Animation Studio first.'}</small></div></div>
      <div className="animation-event-list">
        {EVENT_KINDS.map((event) => {
          const current = binding?.events?.find((item) => item.kind === event.id)
          const enabled = current !== undefined
          return <div className="animation-event-row" key={event.id}>
            <label className="event-enable"><input type="checkbox" checked={enabled} onChange={(change) => updateEvent(event.id, change.target.checked ? event.defaultTime : undefined)}/><span>{event.label}</span></label>
            <input type="range" min="0" max="2.5" step="0.01" disabled={!enabled} value={current?.time ?? event.defaultTime} onChange={(change) => updateEvent(event.id, Number(change.target.value))}/>
            <input className="event-time-input" type="number" min="0" max="10" step="0.01" disabled={!enabled} value={(current?.time ?? event.defaultTime).toFixed(2)} onChange={(change) => updateEvent(event.id, Number(change.target.value))}/>
            <em>s</em>
          </div>
        })}
      </div>
      <p><b>Hit</b> controls when gameplay damage lands. VFX/SFX markers are stored now so Skill Forge can bind effects to the same animation timeline next.</p>
      <button className="primary-button" disabled={!set || !selectedTarget || saving} onClick={() => void save()}><Save size={15}/>{saving ? 'Saving…' : 'Save Gameplay Timing'}</button>
    </div>

    <footer>{status}</footer>
  </section>
}
