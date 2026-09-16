import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Download,
  FileUp,
  Gamepad2,
  Pause,
  Play,
  QrCode,
  Radio,
  RotateCcw,
  Scissors,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { QRCodeSVG } from 'qrcode.react'
import RetargetViewport from '../components/RetargetViewport'
import { downloadBlob } from '../lib/animationBake'
import {
  buildAuthoredAnimation,
  editMotionForAuthoring,
  libraryCharacterModelBlob,
  publishAuthoredAnimation,
  type AnimationAuthoringEdit,
} from '../lib/animationAuthoring'
import type { RootMotionMode } from '../lib/animationEdit'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import { cleanupMotion, type MotionCleanupOptions } from '../lib/motionCleanup'
import { averageVisibility, downloadJson, formatDuration } from '../lib/pose'
import type { RigInfo } from '../lib/retarget'
import {
  FORGE_ANIMATION_ACTIONS,
  actionDefinition,
  type ForgeAnimationActionId,
} from '../engine/animationBindings'
import type { ForgeMotion, PeerMessage, PoseFrame } from '../types'
import '../animation-authoring.css'

const BUILTIN_CHARACTER = 'Forge Mannequin'

type Props = {
  onTestGame?: () => void
}

type PublishedState = {
  action: ForgeAnimationActionId
  clipName: string
  animationAssetId: string
}

export default function AnimationStudioV2({ onTestGame }: Props) {
  const [peerId, setPeerId] = useState('')
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [phoneName, setPhoneName] = useState('Phone')
  const [lastFrame, setLastFrame] = useState<PoseFrame>()
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<ForgeMotion>()
  const [takes, setTakes] = useState<ForgeMotion[]>([])
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [latency, setLatency] = useState<number | null>(null)

  const [characters, setCharacters] = useState<LibraryAsset[]>([])
  const [characterAsset, setCharacterAsset] = useState<LibraryAsset>()
  const [characterBlob, setCharacterBlob] = useState<Blob>()
  const [characterUrl, setCharacterUrl] = useState<string>()
  const [characterName, setCharacterName] = useState(BUILTIN_CHARACTER)
  const [rigInfo, setRigInfo] = useState<RigInfo>()

  const [purpose, setPurpose] = useState<ForgeAnimationActionId>('attackPrimary')
  const [clipName, setClipName] = useState('Primary Attack')
  const [trimStartMs, setTrimStartMs] = useState(0)
  const [trimEndMs, setTrimEndMs] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [closeLoop, setCloseLoop] = useState(false)
  const [rootMotion, setRootMotion] = useState<RootMotionMode>('horizontal')
  const [loop, setLoop] = useState(false)

  const [smoothing, setSmoothing] = useState(0.48)
  const [mirrorX, setMirrorX] = useState(false)
  const [showRig, setShowRig] = useState(false)
  const [cleanupStrength, setCleanupStrength] = useState(0.58)
  const [repairGaps, setRepairGaps] = useState(true)
  const [footLock, setFootLock] = useState(true)
  const [groundAlign, setGroundAlign] = useState(true)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Select a character and gameplay purpose, then record a take.')
  const [published, setPublished] = useState<PublishedState>()

  const connectionRef = useRef<DataConnection | null>(null)
  const recordFramesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const playbackStartedRef = useRef(0)
  const playbackOffsetRef = useRef(0)
  const purposeRef = useRef<ForgeAnimationActionId>(purpose)

  purposeRef.current = purpose

  const cleanupOptions = useMemo<MotionCleanupOptions>(() => ({
    strength: cleanupStrength,
    repairGaps,
    footLock,
    groundAlign,
    maxGapMs: 180,
  }), [cleanupStrength, repairGaps, footLock, groundAlign])

  const edit = useMemo<AnimationAuthoringEdit>(() => ({
    name: clipName.trim() || actionDefinition(purpose)?.label || 'Animation',
    trimStartMs,
    trimEndMs,
    speed,
    closeLoop,
    rootMotion,
    loop,
  }), [clipName, purpose, trimStartMs, trimEndMs, speed, closeLoop, rootMotion, loop])

  const editedMotion = useMemo(() => clip ? editMotionForAuthoring(clip, edit) : undefined, [clip, edit])
  const cleanedPreview = useMemo(() => editedMotion ? cleanupMotion(editedMotion, cleanupOptions) : undefined, [editedMotion, cleanupOptions])

  const loadCharacterAsset = async (asset?: LibraryAsset) => {
    if (!asset) {
      setCharacterAsset(undefined)
      setCharacterBlob(undefined)
      setCharacterUrl(undefined)
      setCharacterName(BUILTIN_CHARACTER)
      setRigInfo(undefined)
      setStatus('Forge Mannequin selected. Choose a Library character before publishing to the game.')
      return
    }
    const blob = await libraryCharacterModelBlob(asset)
    setCharacterAsset(asset)
    setCharacterBlob(blob)
    setCharacterUrl(URL.createObjectURL(blob))
    setCharacterName(asset.name)
    setRigInfo(undefined)
    setStatus(`${asset.name} loaded. Record or select a take.`)
    setPublished(undefined)
  }

  useEffect(() => {
    let cancelled = false
    void listAssets().then((items) => {
      if (cancelled) return
      const next = items.filter((asset) => asset.category === 'characters' && (asset.kind === 'glb' || asset.mime.includes('forge-character')))
      setCharacters(next)
      if (next[0]) void loadCharacterAsset(next[0])
    }).catch(() => setStatus('Could not read the Shared Asset Library. You can still import a character GLB.'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => { if (characterUrl) URL.revokeObjectURL(characterUrl) }, [characterUrl])

  useEffect(() => {
    const peer = new Peer()
    peer.on('open', (id) => setPeerId(id))
    peer.on('connection', (connection) => {
      connectionRef.current = connection
      connection.on('open', () => setPhoneConnected(true))
      connection.on('close', () => setPhoneConnected(false))
      connection.on('data', (raw) => {
        const message = raw as PeerMessage
        if (message.type === 'hello') { setPhoneName(message.device || 'Phone'); setPhoneConnected(true) }
        if (message.type === 'pose-frame') {
          setLastFrame(message.frame)
          if (recordingRef.current) recordFramesRef.current.push(message.frame)
        }
        if (message.type === 'recording-start') {
          recordingRef.current = true
          recordFramesRef.current = []
          setRecording(true)
          setPlaying(false)
          setPublished(undefined)
          setStatus('Recording body + hands + feet…')
        }
        if (message.type === 'recording-stop') {
          recordingRef.current = false
          setRecording(false)
          const captured = [...recordFramesRef.current]
          if (!captured.length) return
          const label = actionDefinition(purposeRef.current)?.label ?? 'Animation'
          const next = buildClip(captured, label)
          setClip(next)
          setTakes((current) => [...current, next])
          setClipName(label)
          setTrimStartMs(0)
          setTrimEndMs(Math.max(1, next.durationMs))
          setSpeed(1)
          setLoop(actionDefinition(purposeRef.current)?.loop ?? false)
          setCloseLoop(actionDefinition(purposeRef.current)?.loop ?? false)
          setRootMotion(purposeRef.current === 'walk' || purposeRef.current === 'run' ? 'horizontal' : 'keep')
          setPlayhead(0)
          playbackOffsetRef.current = 0
          setStatus(`Take ${takes.length + 1} recorded. Trim and tune it, then Publish to Game.`)
        }
        if (message.type === 'ping') connection.send({ type: 'pong', sentAt: message.sentAt } satisfies PeerMessage)
        if (message.type === 'pong') setLatency(Math.max(0, Math.round((performance.now() - message.sentAt) / 2)))
      })
    })
    peer.on('error', () => setPhoneConnected(false))
    const interval = window.setInterval(() => {
      const connection = connectionRef.current
      if (connection?.open) connection.send({ type: 'ping', sentAt: performance.now() } satisfies PeerMessage)
    }, 2500)
    return () => {
      window.clearInterval(interval)
      connectionRef.current?.close()
      peer.destroy()
    }
  }, [])

  useEffect(() => {
    if (!playing || !cleanedPreview?.motion.frames.length) return
    let raf = 0
    playbackStartedRef.current = performance.now()
    const tick = () => {
      const elapsed = performance.now() - playbackStartedRef.current + playbackOffsetRef.current
      const duration = cleanedPreview.motion.durationMs || 1
      if (elapsed >= duration) {
        if (loop) {
          playbackStartedRef.current = performance.now()
          playbackOffsetRef.current = 0
          setPlayhead(0)
          raf = requestAnimationFrame(tick)
          return
        }
        setPlayhead(duration)
        setPlaying(false)
        playbackOffsetRef.current = 0
        return
      }
      setPlayhead(elapsed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, cleanedPreview, loop])

  useEffect(() => {
    setPlayhead(0)
    playbackOffsetRef.current = 0
    setPlaying(false)
    setPublished(undefined)
  }, [trimStartMs, trimEndMs, speed, closeLoop, rootMotion, loop, clipName, purpose])

  const captureUrl = useMemo(() => {
    if (!peerId) return ''
    const url = new URL('.', window.location.href)
    url.hash = ''
    url.search = ''
    url.searchParams.set('capture', '1')
    url.searchParams.set('target', peerId)
    return url.toString()
  }, [peerId])

  const activeFrame = useMemo(() => {
    const previewMotion = cleanedPreview?.motion
    if (!previewMotion?.frames.length) return lastFrame
    let selected = previewMotion.frames[0]
    for (const frame of previewMotion.frames) {
      if (frame.t <= playhead) selected = frame
      else break
    }
    return selected
  }, [cleanedPreview, playhead, lastFrame])

  const visibility = activeFrame?.tracking?.bodyScore ?? Math.round(averageVisibility(activeFrame?.landmarks) * 100)
  const handsTracked = (activeFrame?.leftHandLandmarks?.length === 21 ? 1 : 0) + (activeFrame?.rightHandLandmarks?.length === 21 ? 1 : 0)
  const feetTracked = activeFrame ? ([27,29,31].filter((index) => (activeFrame.landmarks[index]?.visibility ?? 0) > .35).length >= 2 ? 1 : 0) + ([28,30,32].filter((index) => (activeFrame.landmarks[index]?.visibility ?? 0) > .35).length >= 2 ? 1 : 0) : 0
  const canBake = !!clip && !recording && !busy && !!rigInfo && rigInfo.coreMappedCount >= 8
  const canPublish = canBake && !!characterAsset && !!characterBlob

  const selectPurpose = (next: ForgeAnimationActionId) => {
    setPurpose(next)
    const definition = actionDefinition(next)
    if (definition) {
      setClipName(definition.label)
      setLoop(definition.loop)
      setCloseLoop(definition.loop)
      setRootMotion(next === 'walk' || next === 'run' ? 'horizontal' : 'keep')
    }
  }

  const selectTake = (take: ForgeMotion) => {
    setClip(take)
    setTrimStartMs(0)
    setTrimEndMs(Math.max(1, take.durationMs))
    setPlayhead(0)
    playbackOffsetRef.current = 0
    setPlaying(false)
    setPublished(undefined)
    setStatus(`${take.name} selected.`)
  }

  const importMotion = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as ForgeMotion
      if (parsed.format !== 'forge-motion' || !Array.isArray(parsed.frames)) throw new Error('Invalid Forge motion file')
      const next = { ...parsed, source: 'import' as const }
      setTakes((current) => [...current, next])
      setClip(next)
      setClipName(next.name)
      setTrimStartMs(0)
      setTrimEndMs(Math.max(1, next.durationMs))
      setPlayhead(0)
      setPlaying(false)
      setPublished(undefined)
      setStatus(`${next.name} imported as a take.`)
    } catch {
      alert('That file is not a valid Forge motion capture.')
    }
  }

  const importCharacter = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setStatus('Adding character to Forge and loading its rig…')
    try {
      const name = file.name.replace(/\.(glb|gltf)$/i, '') || 'Imported Character'
      const asset = await saveAsset({
        name,
        category: 'characters',
        kind: 'glb',
        mime: file.type || 'model/gltf-binary',
        tags: ['character', 'humanoid', 'imported'],
        source: 'Animation Studio import',
        blob: file,
      })
      const items = await listAssets()
      setCharacters(items.filter((candidate) => candidate.category === 'characters' && (candidate.kind === 'glb' || candidate.mime.includes('forge-character'))))
      await loadCharacterAsset(asset)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import that character.')
    } finally {
      setBusy(false)
    }
  }

  const togglePlayback = () => {
    if (!cleanedPreview?.motion) return
    if (playing) {
      playbackOffsetRef.current = playhead
      setPlaying(false)
      return
    }
    if (playhead >= cleanedPreview.motion.durationMs) {
      setPlayhead(0)
      playbackOffsetRef.current = 0
    } else playbackOffsetRef.current = playhead
    setPlaying(true)
  }

  const publishCurrent = async () => {
    if (!clip || !characterAsset || !characterBlob || !canPublish) return false
    setBusy(true)
    setPlaying(false)
    setStatus(`Publishing ${edit.name} to ${characterAsset.name}…`)
    try {
      const result = await publishAuthoredAnimation({
        motion: clip,
        characterBlob,
        edit,
        smoothing,
        mirrorX,
        cleanup: cleanupOptions,
        characterAsset,
        action: purpose,
      })
      setPublished({ action: purpose, clipName: result.built.clipName, animationAssetId: result.animationAsset.id })
      setStatus(`${result.built.clipName} published as ${actionDefinition(purpose)?.label}. Library + gameplay binding updated automatically.`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Animation publish failed.'
      setStatus(message)
      alert(message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const testInGame = async () => {
    if (!published || published.action !== purpose || published.clipName !== edit.name) {
      const ok = await publishCurrent()
      if (!ok) return
    }
    onTestGame?.()
  }

  const exportAnimatedGlb = async () => {
    if (!clip || !canBake) return
    setBusy(true)
    setPlaying(false)
    setStatus('Building game-ready GLB…')
    try {
      const result = await buildAuthoredAnimation({ motion: clip, characterBlob, edit, smoothing, mirrorX, cleanup: cleanupOptions })
      downloadBlob(`${safeName(characterName)}-${safeName(edit.name)}.glb`, result.blob)
      setStatus(`${result.clipName} exported · ${result.mappedBones} animated bones · ${result.sampleCount} samples`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Animation export failed.'
      setStatus(message)
      alert(message)
    } finally {
      setBusy(false)
    }
  }

  const originalDuration = clip?.durationMs ?? 1
  const previewDuration = cleanedPreview?.motion.durationMs ?? 0
  const selectedAction = actionDefinition(purpose)

  return (
    <div className="animation-authoring-layout">
      <section className="animation-authoring-main">
        <div className="animation-authoring-toolbar">
          <div>
            <span className="eyebrow">ANIMATION STUDIO 2.0</span>
            <strong>{recording ? 'Recording…' : clip ? edit.name : characterName}</strong>
            <small>Capture → edit → publish without leaving this workspace.</small>
          </div>
          <div className="animation-authoring-toolbar-actions">
            <label className="secondary-button file-button"><FileUp size={16}/> Import character<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => void importCharacter(event.target.files?.[0])}/></label>
            <label className="secondary-button file-button"><FileUp size={16}/> Import motion<input type="file" accept=".json,.forge-motion.json" onChange={(event) => void importMotion(event.target.files?.[0])}/></label>
            <button className="primary-button" disabled={!canPublish} onClick={() => void publishCurrent()}><UploadCloud size={16}/>{busy ? 'Working…' : 'Publish to Game'}</button>
            <button className="secondary-button test-game-button" disabled={!canPublish || !onTestGame} onClick={() => void testInGame()}><Gamepad2 size={16}/> Test in Game</button>
          </div>
        </div>

        <div className="animation-flow-bar">
          <div className={phoneConnected ? 'ready' : ''}><span>1</span><b>CAPTURE</b><small>{phoneConnected ? 'Phone connected' : 'Scan QR'}</small></div>
          <i>→</i>
          <div className={clip ? 'ready' : ''}><span>2</span><b>EDIT</b><small>{clip ? 'Take ready' : 'Record a take'}</small></div>
          <i>→</i>
          <div className={published ? 'ready published' : ''}><span>3</span><b>GAMEPLAY</b><small>{published ? 'Published' : 'One click publish'}</small></div>
        </div>

        <div className="animation-authoring-stage">
          <RetargetViewport
            className="mocap-viewport"
            src={characterUrl}
            landmarks={activeFrame?.landmarks}
            worldLandmarks={activeFrame?.worldLandmarks}
            leftHandLandmarks={activeFrame?.leftHandLandmarks}
            rightHandLandmarks={activeFrame?.rightHandLandmarks}
            leftHandWorldLandmarks={activeFrame?.leftHandWorldLandmarks}
            rightHandWorldLandmarks={activeFrame?.rightHandWorldLandmarks}
            smoothing={smoothing}
            mirrorX={mirrorX}
            showRig={showRig}
            onRigInfo={setRigInfo}
          />
          <div className="viewport-overlay top-left"><span className={`live-dot ${phoneConnected ? 'connected' : ''}`}/><span>{phoneConnected ? `${phoneName} connected` : 'Waiting for phone'}</span></div>
          <div className="viewport-overlay top-right"><span className="character-dot"/><span>{characterName}</span></div>
          {recording && <div className="recording-pill"><span/> REC</div>}
          {clip && <div className="cleanup-preview-pill">EDIT PREVIEW · {selectedAction?.label}</div>}
          <div className="viewport-stats">
            <div><span>BODY</span><strong>{activeFrame ? `${visibility}%` : '—'}</strong></div>
            <div><span>HANDS</span><strong>{activeFrame ? `${handsTracked}/2` : '—'}</strong></div>
            <div><span>FEET</span><strong>{activeFrame ? `${feetTracked}/2` : '—'}</strong></div>
            <div><span>LATENCY</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div>
            <div><span>RIG</span><strong>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal}` : '…'}</strong></div>
          </div>
        </div>

        <div className="animation-takes-bar">
          <div className="take-heading"><Scissors size={15}/><span>TAKES</span><b>{takes.length}</b></div>
          <div className="take-list">
            {takes.map((take, index) => <button key={`${take.createdAt}-${index}`} className={clip === take ? 'active' : ''} onClick={() => selectTake(take)}><strong>Take {String(index + 1).padStart(2, '0')}</strong><small>{formatDuration(take.durationMs)}</small></button>)}
            {!takes.length && <span className="take-empty">Recorded takes appear here automatically.</span>}
          </div>
        </div>

        <div className="animation-authoring-timeline">
          <div className="timeline-controls">
            <button className="icon-button" disabled={!clip} onClick={() => { setPlayhead(0); playbackOffsetRef.current = 0; setPlaying(false) }}><RotateCcw size={16}/></button>
            <button className="play-button" disabled={!clip} onClick={togglePlayback}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button>
            <span className="timecode">{formatDuration(playhead)} / {formatDuration(previewDuration)}</span>
            <div className="timeline-spacer"/>
            {clip && <button className="icon-button danger-hover" title="Remove selected take" onClick={() => { setTakes((items) => items.filter((item) => item !== clip)); setClip(undefined); setPlayhead(0); setPlaying(false); setPublished(undefined); setStatus('Take removed.') }}><Trash2 size={16}/></button>}
          </div>
          <input className="timeline-range" type="range" min={0} max={Math.max(1, previewDuration)} value={Math.min(playhead, previewDuration)} disabled={!clip} onChange={(event) => { const value = Number(event.target.value); setPlayhead(value); playbackOffsetRef.current = value; setPlaying(false) }}/>
          <div className="timeline-track"><div className="track-label">{selectedAction?.label?.toUpperCase() ?? 'ANIMATION'}</div><div className={`track-clip ${clip ? 'has-clip' : ''}`}>{clip ? `${cleanedPreview?.motion.frames.length ?? 0} frames · ${speed.toFixed(2)}× · ${rootMotion === 'keep' ? 'root motion' : rootMotion === 'horizontal' ? 'in-place X/Z' : 'root locked'}` : 'Record a take with the phone'}</div></div>
          <div className="timeline-track character-track"><div className="track-label">CHARACTER</div><div className="track-clip has-character">{characterName} · {characterAsset ? 'game target' : 'preview only'}</div></div>
        </div>
      </section>

      <aside className="animation-authoring-inspector">
        <div className="authoring-section purpose-section">
          <span className="property-label">Gameplay purpose</span>
          <select value={purpose} onChange={(event) => selectPurpose(event.target.value as ForgeAnimationActionId)}>
            {FORGE_ANIMATION_ACTIONS.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}
          </select>
          <label><span>Clip name</span><input className="text-input" value={clipName} onChange={(event) => setClipName(event.target.value)}/></label>
          <p>Forge will publish this take directly into the <b>{selectedAction?.label}</b> gameplay slot.</p>
        </div>

        <div className="authoring-section character-section">
          <span className="property-label">Character</span>
          <select value={characterAsset?.id ?? 'builtin'} onChange={(event) => { const id = event.target.value; if (id === 'builtin') void loadCharacterAsset(undefined); else void loadCharacterAsset(characters.find((asset) => asset.id === id)) }}>
            <option value="builtin">Forge Mannequin · preview only</option>
            {characters.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          <div className="mini-row"><span>Rig</span><span className={rigInfo && rigInfo.coreMappedCount >= 8 ? 'status-good' : 'status-warn'}>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal} core bones` : 'Scanning…'}</span></div>
          {!characterAsset && <p className="authoring-warning">Choose a Library character or import a GLB before publishing. Imported characters are added to Forge automatically.</p>}
        </div>

        <div className="authoring-section phone-section">
          <div className="inspector-heading"><Smartphone size={16}/><span>Phone capture</span></div>
          {!phoneConnected ? <>
            <div className="authoring-qr">{captureUrl ? <QRCodeSVG value={captureUrl} size={154} bgColor="#ffffff" fgColor="#0d1016" level="M" marginSize={2}/> : <QrCode size={34}/>}</div>
            <p>Scan once. Start and stop recording on the phone; every recording becomes a new take here.</p>
          </> : <div className="authoring-connected"><Radio size={15}/><div><strong>{phoneName}</strong><small>Live · {latency === null ? '—' : `${latency} ms`}</small></div></div>}
        </div>

        <div className={`authoring-section edit-section ${clip ? '' : 'disabled-section'}`}>
          <span className="property-label">Clip edit</span>
          <div className="authoring-range-pair">
            <label><span>Trim start</span><b>{formatDuration(trimStartMs)}</b></label>
            <input type="range" min={0} max={Math.max(1, originalDuration - 1)} step={1} value={Math.min(trimStartMs, Math.max(0, originalDuration - 1))} disabled={!clip} onChange={(event) => setTrimStartMs(Math.min(Number(event.target.value), trimEndMs - 1))}/>
            <label><span>Trim end</span><b>{formatDuration(trimEndMs)}</b></label>
            <input type="range" min={1} max={Math.max(1, originalDuration)} step={1} value={Math.min(trimEndMs, originalDuration)} disabled={!clip} onChange={(event) => setTrimEndMs(Math.max(Number(event.target.value), trimStartMs + 1))}/>
          </div>
          <label className="range-setting"><span><b>Playback speed</b><em>{speed.toFixed(2)}×</em></span><input type="range" min="0.25" max="2.5" step="0.05" value={speed} disabled={!clip} onChange={(event) => setSpeed(Number(event.target.value))}/></label>
          <label className="authoring-select-row"><span><b>Root motion</b><small>Choose whether movement stays in the clip.</small></span><select value={rootMotion} disabled={!clip} onChange={(event) => setRootMotion(event.target.value as RootMotionMode)}><option value="keep">Keep root motion</option><option value="horizontal">Remove X/Z travel</option><option value="all">Lock root position</option></select></label>
          <label className="toggle-setting"><span><b>Loop in game</b><small>Runtime repeats this action.</small></span><input type="checkbox" checked={loop} disabled={!clip} onChange={(event) => setLoop(event.target.checked)}/></label>
          <label className="toggle-setting"><span><b>Close loop</b><small>Force the last exported pose to meet the first.</small></span><input type="checkbox" checked={closeLoop} disabled={!clip} onChange={(event) => setCloseLoop(event.target.checked)}/></label>
        </div>

        <div className={`authoring-section cleanup-section ${clip ? '' : 'disabled-section'}`}>
          <span className="property-label">Cleanup & retarget</span>
          <label className="range-setting"><span><b>Smoothing</b><em>{Math.round(smoothing * 100)}%</em></span><input type="range" min="0" max="0.9" step="0.05" value={smoothing} onChange={(event) => setSmoothing(Number(event.target.value))}/></label>
          <label className="range-setting"><span><b>Cleanup strength</b><em>{Math.round(cleanupStrength * 100)}%</em></span><input type="range" min="0" max="1" step="0.05" value={cleanupStrength} onChange={(event) => setCleanupStrength(Number(event.target.value))}/></label>
          <label className="toggle-setting"><span><b>Foot locking</b><small>Hold planted feet.</small></span><input type="checkbox" checked={footLock} onChange={(event) => setFootLock(event.target.checked)}/></label>
          <label className="toggle-setting"><span><b>Ground alignment</b><small>Keep support feet on the floor.</small></span><input type="checkbox" checked={groundAlign} onChange={(event) => setGroundAlign(event.target.checked)}/></label>
          <label className="toggle-setting"><span><b>Repair short gaps</b><small>Interpolate brief tracking dropouts.</small></span><input type="checkbox" checked={repairGaps} onChange={(event) => setRepairGaps(event.target.checked)}/></label>
          <label className="toggle-setting"><span><b>Mirror X</b><small>Use if left/right is reversed.</small></span><input type="checkbox" checked={mirrorX} onChange={(event) => setMirrorX(event.target.checked)}/></label>
          <label className="toggle-setting"><span><b>Show rig</b><small>Debug the mapped skeleton.</small></span><input type="checkbox" checked={showRig} onChange={(event) => setShowRig(event.target.checked)}/></label>
          {cleanedPreview && <div className="cleanup-report"><div><span>Foot locks</span><strong>{cleanedPreview.report.footLockedFrames}</strong></div><div><span>Repaired</span><strong>{cleanedPreview.report.repairedPoints}</strong></div><div><span>Duration</span><strong>{formatDuration(cleanedPreview.motion.durationMs)}</strong></div></div>}
        </div>

        <div className="authoring-section publish-section">
          <span className="property-label">Gameplay output</span>
          <div className="publish-summary"><div><span>Character</span><strong>{characterAsset?.name ?? 'Select character'}</strong></div><div><span>Action</span><strong>{selectedAction?.label}</strong></div><div><span>Clip</span><strong>{edit.name}</strong></div></div>
          <button className="primary-button authoring-publish" disabled={!canPublish} onClick={() => void publishCurrent()}><UploadCloud size={16}/>{busy ? 'Building…' : 'Publish to Game'}</button>
          <button className="secondary-button authoring-test" disabled={!canPublish || !onTestGame} onClick={() => void testInGame()}><Gamepad2 size={16}/> Publish & Test in Game</button>
          {published && <div className="published-confirm"><CheckCircle2 size={15}/><span>Bound to {actionDefinition(published.action)?.label}. Skillbound can use it now.</span></div>}
          <div className={`authoring-status ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('could not') ? 'error' : ''}`}>{status}</div>
        </div>

        <details className="authoring-advanced">
          <summary><Sparkles size={14}/> Advanced / Export</summary>
          <div className="advanced-actions">
            <button disabled={!clip} onClick={() => clip && downloadJson(`${safeName(edit.name)}.forge-motion.json`, clip)}><Download size={14}/> Raw motion JSON</button>
            <button disabled={!cleanedPreview} onClick={() => cleanedPreview && downloadJson(`${safeName(edit.name)}-clean.forge-motion.json`, cleanedPreview.motion)}><Download size={14}/> Edited motion JSON</button>
            <button disabled={!canBake} onClick={() => void exportAnimatedGlb()}><Download size={14}/> Export animated GLB</button>
          </div>
        </details>
      </aside>
    </div>
  )
}

function buildClip(frames: PoseFrame[], name: string): ForgeMotion {
  const firstT = frames[0]?.t ?? 0
  const normalized = frames.map((frame) => ({ ...frame, t: frame.t - firstT }))
  const durationMs = normalized.at(-1)?.t ?? 0
  const fps = durationMs > 0 ? Math.round((normalized.length / durationMs) * 1000) : 0
  return {
    format: 'forge-motion',
    version: 2,
    name,
    createdAt: new Date().toISOString(),
    fps,
    durationMs,
    frames: normalized,
    source: 'phone',
  }
}

function safeName(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'animation'
}
