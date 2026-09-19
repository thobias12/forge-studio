import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, RefreshCw, Save as SaveIcon, Swords } from 'lucide-react'
import {
  FORGE_ANIMATION_ACTIONS,
  actionDefinition,
  type ForgeAnimationActionId,
  type ForgeAnimationEventKind,
} from '../engine/animationBindings'
import {
  forgeAnimationV3Blob,
  parseForgeAnimationProfileV3,
  parseForgeAnimationV3,
  type ForgeAnimationClipV3,
  type ForgeAnimationProfileV3,
} from '../engine/animationV3'
import { getAsset, listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import AnimationCombatTestArenaV3 from './AnimationCombatTestArenaV3'

const EVENT_KINDS: Array<{ id: ForgeAnimationEventKind; label: string; defaultTime: number }> = [
  { id: 'hit', label: 'Hit', defaultTime: .42 },
  { id: 'vfx', label: 'VFX', defaultTime: .36 },
  { id: 'sfx', label: 'SFX', defaultTime: .24 },
  { id: 'recovery', label: 'Recovery', defaultTime: .72 },
]

export default function AnimationRuntimePanel() {
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [profileAssets, setProfileAssets] = useState<LibraryAsset[]>([])
  const [profileAssetId, setProfileAssetId] = useState('')
  const [profile, setProfile] = useState<ForgeAnimationProfileV3>()
  const [selectedAction, setSelectedAction] = useState<ForgeAnimationActionId>('attackPrimary')
  const [animation, setAnimation] = useState<ForgeAnimationClipV3>()
  const [status, setStatus] = useState('Loading Runtime 3 animation profiles…')
  const [saving, setSaving] = useState(false)

  const selectedProfileAsset = useMemo(
    () => profileAssets.find((asset) => asset.id === profileAssetId),
    [profileAssets, profileAssetId],
  )
  const bodyTarget = useMemo(
    () => profile?.sourceBodyAssetId
      ? assets.find((asset) => asset.id === profile.sourceBodyAssetId)
      : undefined,
    [assets, profile?.sourceBodyAssetId],
  )
  const actionBinding = profile?.actions[selectedAction]
  const vfxAssets = useMemo(() => assets.filter((asset) => asset.category === 'vfx'), [assets])
  const audioAssets = useMemo(() => assets.filter((asset) => asset.category === 'audio'), [assets])
  const timelineMax = useMemo(
    () => Math.max(1.25, ...(animation?.events ?? []).map((event) => event.time + .12)),
    [animation?.events],
  )

  const refreshTargets = async () => {
    const library = await listAssets()
    const nextProfiles = library.filter((asset) =>
      asset.category === 'animations' && (
        asset.tags.includes('forge-animation-profile-v3') ||
        asset.mime === 'application/x-forge-animation-profile+json'
      ),
    )
    setAssets(library)
    setProfileAssets(nextProfiles)
    setProfileAssetId((current) =>
      current && nextProfiles.some((asset) => asset.id === current)
        ? current
        : nextProfiles[0]?.id ?? '',
    )
    setStatus(
      nextProfiles.length
        ? 'Select a Runtime 3 profile and authored action.'
        : 'No Runtime 3 animation profiles yet. Publish an action above first.',
    )
  }

  useEffect(() => { void refreshTargets() }, [])

  useEffect(() => {
    if (!profileAssetId) {
      setProfile(undefined)
      return
    }
    let cancelled = false
    void (async () => {
      const asset = await getAsset(profileAssetId).catch(() => undefined)
      const parsed = asset ? await parseForgeAnimationProfileV3(asset.blob) : undefined
      if (!cancelled) setProfile(parsed)
    })()
    return () => { cancelled = true }
  }, [profileAssetId])

  useEffect(() => {
    const assetId = profile?.actions[selectedAction]?.assetId
    if (!assetId) {
      setAnimation(undefined)
      return
    }
    let cancelled = false
    void (async () => {
      const asset = await getAsset(assetId).catch(() => undefined)
      const parsed = asset ? await parseForgeAnimationV3(asset.blob) : undefined
      if (!cancelled) setAnimation(parsed)
    })()
    return () => { cancelled = true }
  }, [profile, selectedAction])

  const updateEvent = (kind: ForgeAnimationEventKind, time: number | undefined) => {
    setAnimation((current) => {
      if (!current) return current
      const existing = current.events ?? []
      const previous = existing.find((event) => event.kind === kind)
      const events = time === undefined
        ? existing.filter((event) => event.kind !== kind)
        : [
            ...existing.filter((event) => event.kind !== kind),
            {
              id: `${selectedAction}-${kind}`,
              kind,
              time: Math.max(0, time),
              assetId: previous?.assetId,
            },
          ].sort((a, b) => a.time - b.time)
      return { ...current, events: events.length ? events : undefined }
    })
  }

  const updateEventAsset = (kind: ForgeAnimationEventKind, assetId: string | undefined) => {
    setAnimation((current) => {
      if (!current) return current
      return {
        ...current,
        events: (current.events ?? []).map((event) =>
          event.kind === kind
            ? { ...event, assetId: assetId || undefined }
            : event,
        ),
      }
    })
  }

  const saveSequence = async () => {
    if (!animation || !profile || !actionBinding) return
    setSaving(true)
    try {
      await saveAsset({
        id: actionBinding.assetId,
        name: `${profile.name} · ${actionDefinition(selectedAction)?.label ?? selectedAction}`,
        category: 'animations',
        kind: 'file',
        mime: 'application/x-forge-animation+json',
        tags: [
          'forge-animation-v3',
          'ForgeHumanoidV2',
          profile.targetId,
          `action:${selectedAction}`,
          ...(profile.sourceBodyAssetId ? [`source-character:${profile.sourceBodyAssetId}`] : []),
        ],
        source: 'Forge Animation Studio Runtime 3',
        blob: forgeAnimationV3Blob(animation),
      })
      setStatus(
        `Saved ${actionDefinition(selectedAction)?.label} timing + presentation events to the Runtime 3 action asset.`,
      )
    } finally {
      setSaving(false)
    }
  }

  return <section className="animation-runtime-panel">
    <header>
      <div>
        <span className="eyebrow">ANIMATION RUNTIME 3.0</span>
        <strong>Semantic actions, timing & effects</strong>
        <small>Events live directly on each .forgeanim action used by Studio and gameplay.</small>
      </div>
      <button className="secondary-button" onClick={() => void refreshTargets()}><RefreshCw size={14}/> Refresh</button>
    </header>

    <div className="animation-runtime-target-row">
      <label>
        <span>Animation profile</span>
        <select value={profileAssetId} onChange={(event) => setProfileAssetId(event.target.value)}>
          {profileAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </label>
      {profile && <div className="animation-player-target-badge">Runtime 3 · {profile.targetId}</div>}
    </div>

    <div className="animation-binding-grid">
      {FORGE_ANIMATION_ACTIONS.map((action) => {
        const item = profile?.actions[action.id]
        return <button
          key={action.id}
          className={`${selectedAction === action.id ? 'active ' : ''}${item?.assetId ? 'bound' : 'missing'}`}
          onClick={() => setSelectedAction(action.id)}
        >
          <span>{item?.assetId ? <CheckCircle2 size={14}/> : <Clock3 size={14}/>}<strong>{action.label}</strong></span>
          <small>{item?.assetId ? 'Authored .forgeanim' : 'Not authored yet'}</small>
        </button>
      })}
    </div>

    <div className="animation-event-editor">
      <div className="animation-event-heading">
        <Swords size={15}/>
        <div>
          <strong>{actionDefinition(selectedAction)?.label}</strong>
          <small>{animation ? `Action · ${animation.name}` : 'Record and publish this action in Animation Studio first.'}</small>
        </div>
      </div>

      <div className="animation-event-timeline">
        <div className="animation-event-ruler"><span>0.00s</span><span>{timelineMax.toFixed(2)}s</span></div>
        <div className="animation-event-track">
          <div className="animation-event-clip-fill"/>
          {(animation?.events ?? []).map((event) => <div
            key={event.id}
            className={`animation-event-marker marker-${event.kind}`}
            style={{ left: `${Math.min(100, event.time / timelineMax * 100)}%` }}
            title={`${event.kind.toUpperCase()} · ${event.time.toFixed(2)}s`}
          ><i/><b>{event.kind.toUpperCase()}</b></div>)}
        </div>
      </div>

      <div className="animation-event-list">
        {EVENT_KINDS.map((event) => {
          const current = animation?.events?.find((item) => item.kind === event.id)
          const enabled = current !== undefined
          const choices = event.id === 'vfx' ? vfxAssets : event.id === 'sfx' ? audioAssets : []
          return <div className={`animation-event-row event-row-${event.id}`} key={event.id}>
            <label className="event-enable">
              <input type="checkbox" disabled={!animation} checked={enabled} onChange={(change) => updateEvent(event.id, change.target.checked ? event.defaultTime : undefined)}/>
              <span>{event.label}</span>
            </label>
            <input type="range" min="0" max="2.5" step="0.01" disabled={!enabled} value={current?.time ?? event.defaultTime} onChange={(change) => updateEvent(event.id, Number(change.target.value))}/>
            <input className="event-time-input" type="number" min="0" max="10" step="0.01" disabled={!enabled} value={(current?.time ?? event.defaultTime).toFixed(2)} onChange={(change) => updateEvent(event.id, Number(change.target.value))}/>
            <em>s</em>
            {(event.id === 'vfx' || event.id === 'sfx') ? <select
              className="animation-event-asset"
              disabled={!enabled}
              value={current?.assetId ?? ''}
              onChange={(change) => updateEventAsset(event.id, change.target.value || undefined)}
            >
              <option value="">{event.id === 'vfx' ? 'Choose VFX…' : 'Choose sound…'}</option>
              {choices.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select> : <span className="animation-event-gameplay-label">{event.id === 'hit' ? 'Damage lands here' : 'Action can recover here'}</span>}
          </div>
        })}
      </div>

      <p><b>Hit</b>, <b>VFX</b>, <b>SFX</b> and <b>Recovery</b> are stored on the same semantic action that Runtime 3 plays.</p>
      <button className="primary-button" disabled={!animation || !profile || !actionBinding || saving} onClick={() => void saveSequence()}>
        <SaveIcon size={15}/>{saving ? 'Saving…' : 'Save Runtime 3 Sequence'}
      </button>
    </div>

    <AnimationCombatTestArenaV3
      target={bodyTarget}
      animationProfile={profile}
      action={selectedAction}
    />
    <footer>{selectedProfileAsset ? status : 'Publish an action above to create a Runtime 3 profile.'}</footer>
  </section>
}
