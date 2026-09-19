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
  Save,
  Scissors,
  Smartphone,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import Peer, { type DataConnection } from 'peerjs'
import { QRCodeSVG } from 'qrcode.react'
import AnimationCombatTestArenaV2 from '../components/AnimationCombatTestArenaV2'
import RetargetViewport from '../components/RetargetViewport'
import { downloadBlob } from '../lib/animationBake'
import {
  buildAuthoredAnimation,
  editMotionForAuthoring,
  libraryCharacterModelBlob,
  publishAuthoredAnimation,
  type AnimationAuthoringEdit,
} from '../lib/animationAuthoring'
import {
  deleteAnimationDraft,
  listAnimationDrafts,
  saveAnimationDraft,
  type AnimationDraftSettings,
  type AnimationStudioDraft,
} from '../lib/animationDrafts'
import type { RootMotionMode } from '../lib/animationEdit'
import { listAssets, saveAsset, type LibraryAsset } from '../lib/library'
import { cleanupMotion, type MotionCleanupOptions } from '../lib/motionCleanup'
import { averageVisibility, downloadJson, formatDuration } from '../lib/pose'
import type { RigInfo } from '../lib/retarget'
import {
  getActivePlayerProfileId,
  listPlayerProfiles,
  playerAnimationTargetId,
} from '../engine/playerProfiles'
import {
  FORGE_ANIMATION_ACTIONS,
  actionDefinition,
  type ForgeAnimationActionId,
  type ForgeAnimationSet,
} from '../engine/animationBindings'
import type { ForgeMotion, PeerMessage, PoseFrame } from '../types'
import '../animation-authoring.css'
import '../animation-studio-v3.css'

const BUILTIN_CHARACTER = 'Forge Mannequin'

type PublishedState = {
  action: ForgeAnimationActionId
  clipName: string
  animationAssetId: string
  set: ForgeAnimationSet
  target: LibraryAsset
  revision: number
}

export default function AnimationStudioV3() {
  const [peerId, setPeerId] = useState('')
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [phoneName, setPhoneName] = useState('Phone')
  const [lastFrame, setLastFrame] = useState<PoseFrame>()
  const [recording, setRecording] = useState(false)
  const [clip, setClip] = useState<ForgeMotion>()
  const [drafts, setDrafts] = useState<AnimationStudioDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState('')
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [latency, setLatency] = useState<number | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<string>()

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
  const [rootMotion, setRootMotion] = useState<RootMotionMode>('keep')
  const [loop, setLoop] = useState(false)

  const [smoothing, setSmoothing] = useState(0.42)
  // The underlying legacy retargeter internally inverts this flag. true is the
  // corrected camera-left/right path and fixes Concept Forge arms swapping sides.
  const [mirrorX, setMirrorX] = useState(true)
  const [showRig, setShowRig] = useState(false)
  const [cleanupStrength, setCleanupStrength] = useState(0.58)
  const [repairGaps, setRepairGaps] = useState(true)
  const [footLock, setFootLock] = useState(true)
  const [groundAlign, setGroundAlign] = useState(true)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Choose a character and gameplay action, then record. Every take is autosaved.')
  const [published, setPublished] = useState<PublishedState>()
  const [testToken, setTestToken] = useState(0)
  const [activePlayerProfile] = useState(() => {
    const profiles = listPlayerProfiles()
    const activeId = getActivePlayerProfileId()
    return profiles.find((profile) => profile.id === activeId) ?? profiles[0]
  })

  const connectionRef = useRef<DataConnection | null>(null)
  const recordFramesRef = useRef<PoseFrame[]>([])
  const recordingRef = useRef(false)
  const playbackStartedRef = useRef(0)
  const playbackOffsetRef = useRef(0)
  const purposeRef = useRef<ForgeAnimationActionId>(purpose)
  const characterAssetRef = useRef<LibraryAsset | undefined>(characterAsset)
  const characterNameRef = useRef(characterName)
  const finishRecordingRef = useRef<(frames: PoseFrame[]) => void>(() => undefined)
  const skipAutosaveRef = useRef(false)

  purposeRef.current = purpose
  characterAssetRef.current = characterAsset
  characterNameRef.current = characterName

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

  const draftSettings = useMemo<AnimationDraftSettings>(() => ({
    purpose,
    edit,
    smoothing,
    mirrorX,
    cleanup: cleanupOptions,
    characterAssetId: characterAsset?.id,
    characterName,
    publishedAnimationAssetId: published?.animationAssetId,
    publishedAt: published ? new Date().toISOString() : undefined,
  }), [purpose, edit, smoothing, mirrorX, cleanupOptions, characterAsset?.id, characterName, published?.animationAssetId])

  const editedMotion = useMemo(() => clip ? editMotionForAuthoring(clip, edit) : undefined, [clip, edit])
  const cleanedPreview = useMemo(() => editedMotion ? cleanupMotion(editedMotion, cleanupOptions) : undefined, [editedMotion, cleanupOptions])
  const selectedAction = actionDefinition(purpose)
  const previewDuration = cleanedPreview?.motion.durationMs ?? 0
  const originalDuration = clip?.durationMs ?? 1
  const activePlayerTargetId = activePlayerProfile
    ? activePlayerProfile.blueprint.targetAssetId || playerAnimationTargetId(activePlayerProfile.id)
    : undefined
  const activeFoundationAssetId = activePlayerProfile?.blueprint.foundation?.bodyAssetId
  const activeFoundationAsset = activeFoundationAssetId
    ? characters.find((asset) => asset.id === activeFoundationAssetId)
    : undefined
  const selectedBelongsToActivePlayer = !!characterAsset && (
    characterAsset.id === activeFoundationAssetId ||
    characterAsset.id === activePlayerTargetId
  )
  const bakeTarget = selectedBelongsToActivePlayer && activeFoundationAsset
    ? activeFoundationAsset
    : characterAsset
  const publishingToActivePlayer = !!activePlayerProfile &&
    !!activePlayerTargetId &&
    !!activeFoundationAsset &&
    bakeTarget?.id === activeFoundationAsset.id
  const gameBindingTargetId = publishingToActivePlayer
    ? activePlayerTargetId
    : bakeTarget?.id
  const gameBindingTargetName = publishingToActivePlayer
    ? `${activePlayerProfile?.name ?? 'Player'} · Skillbound Player`
    : bakeTarget?.name
  const canBake = !!clip && !recording && !busy && !!rigInfo && rigInfo.coreMappedCount >= 8
  const canPublish = canBake && !!bakeTarget && !!gameBindingTargetId

  const loadCharacterAsset = async (asset?: LibraryAsset) => {
    if (!asset) {
      setCharacterAsset(undefined)
      setCharacterBlob(undefined)
      setCharacterUrl((current) => { if (current) URL.revokeObjectURL(current); return undefined })
      setCharacterName(BUILTIN_CHARACTER)
      setRigInfo(undefined)
      return
    }
    const blob = await libraryCharacterModelBlob(asset)
    const url = URL.createObjectURL(blob)
    setCharacterAsset(asset)
    setCharacterBlob(blob)
    setCharacterUrl((current) => { if (current) URL.revokeObjectURL(current); return url })
    setCharacterName(asset.name)
    setRigInfo(undefined)
  }

  const applyDraft = async (draft: AnimationStudioDraft, availableCharacters = characters) => {
    skipAutosaveRef.current = true
    setSelectedDraftId(draft.id)
    setClip(draft.motion)
    setPurpose(draft.settings.purpose)
    setClipName(draft.settings.edit.name)
    setTrimStartMs(draft.settings.edit.trimStartMs)
    setTrimEndMs(Math.max(1, draft.settings.edit.trimEndMs))
    setSpeed(draft.settings.edit.speed)
    setCloseLoop(draft.settings.edit.closeLoop)
    setRootMotion(draft.settings.edit.rootMotion)
    setLoop(draft.settings.edit.loop)
    setSmoothing(draft.settings.smoothing)
    setMirrorX(draft.settings.mirrorX ?? true)
    setCleanupStrength(draft.settings.cleanup.strength)
    setRepairGaps(draft.settings.cleanup.repairGaps)
    setFootLock(draft.settings.cleanup.footLock)
    setGroundAlign(draft.settings.cleanup.groundAlign)
    setPlayhead(0)
    playbackOffsetRef.current = 0
    setPlaying(false)
    setPublished(undefined)
    const target = draft.settings.characterAssetId ? availableCharacters.find((asset) => asset.id === draft.settings.characterAssetId) : undefined
    if (target) await loadCharacterAsset(target)
    setDraftSavedAt(draft.asset.updatedAt)
    setStatus(`${draft.settings.edit.name} restored from autosaved drafts.`)
    window.setTimeout(() => { skipAutosaveRef.current = false }, 0)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [items, savedDrafts] = await Promise.all([listAssets(), listAnimationDrafts()])
      if (cancelled) return
      const nextCharacters = items.filter((asset) =>
        asset.category === 'characters' &&
        (asset.kind === 'glb' || asset.mime.includes('forge-character')) &&
        !asset.tags.includes('animation-target')
      )
      const activeFoundationId = activePlayerProfile?.blueprint.foundation?.bodyAssetId
      const activeTargetId = activePlayerProfile
        ? activePlayerProfile.blueprint.targetAssetId || playerAnimationTargetId(activePlayerProfile.id)
        : undefined
      const activeFoundation = activeFoundationId
        ? nextCharacters.find((asset) => asset.id === activeFoundationId)
        : undefined
      setCharacters(nextCharacters)
      setDrafts(savedDrafts)
      if (savedDrafts[0]) {
        await applyDraft(savedDrafts[0], nextCharacters)
        const savedCharacterId = savedDrafts[0].settings.characterAssetId
        const savedBelongsToActivePlayer =
          !savedCharacterId ||
          savedCharacterId === activeTargetId ||
          savedCharacterId === activeFoundationId
        if (activeFoundation && savedBelongsToActivePlayer) {
          await loadCharacterAsset(activeFoundation)
          setStatus(`${savedDrafts[0].settings.edit.name} restored on ${activeFoundation.name}, the active Skillbound body rig.`)
        }
      } else if (activeFoundation) {
        await loadCharacterAsset(activeFoundation)
        setStatus(`${activeFoundation.name} loaded as the active Skillbound body rig. Record a take; it will save automatically.`)
      } else if (nextCharacters[0]) {
        await loadCharacterAsset(nextCharacters[0])
        setStatus(`${nextCharacters[0].name} loaded. Record a take; it will save automatically.`)
      }
    })().catch(() => setStatus('Could not read the Shared Asset Library. Import a character GLB to continue.'))
    return () => { cancelled = true }
  }, [activePlayerProfile])

  useEffect(() => () => { if (characterUrl) URL.revokeObjectURL(characterUrl) }, [characterUrl])

  finishRecordingRef.current = (captured) => {
    void (async () => {
      if (!captured.length) return
      const action = purposeRef.current
      const definition = actionDefinition(action)
      const label = definition?.label ?? 'Animation'
      const next = buildClip(captured, label)
      const nextEdit: AnimationAuthoringEdit = {
        name: label,
        trimStartMs: 0,
        trimEndMs: Math.max(1, next.durationMs),
        speed: 1,
        closeLoop: definition?.loop ?? false,
        rootMotion: action === 'walk' || action === 'run' ? 'horizontal' : 'keep',
        loop: definition?.loop ?? false,
      }
      const settings: AnimationDraftSettings = {
        purpose: action,
        edit: nextEdit,
        smoothing: 0.42,
        mirrorX: true,
        cleanup: { strength: 0.58, repairGaps: true, footLock: true, groundAlign: true, maxGapMs: 180 },
        characterAssetId: characterAssetRef.current?.id,
        characterName: characterNameRef.current,
      }
      setStatus('Saving captured take…')
      const saved = await saveAnimationDraft({ motion: next, settings })
      skipAutosaveRef.current = true
      setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)])
      setSelectedDraftId(saved.id)
      setClip(next)
      setPurpose(action)
      setClipName(nextEdit.name)
      setTrimStartMs(0)
      setTrimEndMs(nextEdit.trimEndMs)
      setSpeed(1)
      setLoop(nextEdit.loop)
      setCloseLoop(nextEdit.closeLoop)
      setRootMotion(nextEdit.rootMotion)
      setSmoothing(settings.smoothing)
      setMirrorX(true)
      setCleanupStrength(settings.cleanup.strength)
      setRepairGaps(true)
      setFootLock(true)
      setGroundAlign(true)
      setPlayhead(0)
      playbackOffsetRef.current = 0
      setPublished(undefined)
      setDraftSavedAt(saved.asset.updatedAt)
      setStatus(`${label} captured and autosaved. Playing the take now.`)
      window.setTimeout(() => {
        skipAutosaveRef.current = false
        setPlaying(true)
      }, 80)
    })().catch((error) => setStatus(error instanceof Error ? error.message : 'Could not save the recorded take.'))
  }

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
          if (!captured.length) { setStatus('Recording stopped, but no pose frames were received.'); return }
          finishRecordingRef.current(captured)
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
    if (!clip || !selectedDraftId || skipAutosaveRef.current) return
    const timer = window.setTimeout(() => {
      void saveAnimationDraft({ id: selectedDraftId, motion: clip, settings: draftSettings }).then((saved) => {
        setDrafts((current) => current.map((draft) => draft.id === saved.id ? saved : draft))
        setDraftSavedAt(saved.asset.updatedAt)
      }).catch(() => setStatus('Draft autosave failed. Your current take is still open in this tab.'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [clip, selectedDraftId, draftSettings])

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

  const selectPurpose = (next: ForgeAnimationActionId) => {
    setPurpose(next)
    const definition = actionDefinition(next)
    if (!clip && definition) {
      setClipName(definition.label)
      setLoop(definition.loop)
      setCloseLoop(definition.loop)
      setRootMotion(next === 'walk' || next === 'run' ? 'horizontal' : 'keep')
    }
    setPublished(undefined)
  }

  const selectDraft = async (draft: AnimationStudioDraft) => {
    await applyDraft(draft)
  }

  const importMotion = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as ForgeMotion
      if (parsed.format !== 'forge-motion' || !Array.isArray(parsed.frames)) throw new Error('Invalid Forge motion file')
      const next = { ...parsed, source: 'import' as const }
      const definition = actionDefinition(purpose)
      const settings: AnimationDraftSettings = {
        purpose,
        edit: { name: next.name || definition?.label || 'Imported Motion', trimStartMs: 0, trimEndMs: Math.max(1, next.durationMs), speed: 1, closeLoop: definition?.loop ?? false, rootMotion: purpose === 'walk' || purpose === 'run' ? 'horizontal' : 'keep', loop: definition?.loop ?? false },
        smoothing,
        mirrorX: true,
        cleanup: cleanupOptions,
        characterAssetId: characterAsset?.id,
        characterName,
      }
      const saved = await saveAnimationDraft({ motion: next, settings })
      setDrafts((current) => [saved, ...current])
      await applyDraft(saved)
      setStatus(`${next.name} imported and autosaved as a draft.`)
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
      setStatus(`${asset.name} imported. Your current draft will retarget to it.`)
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

  const publishCurrent = async (testAfter = false) => {
    if (!clip || !publishTarget || !canPublish) return false
    setBusy(true)
    setPlaying(false)
    const targetLabel = publishingToActivePlayer ? `${publishTarget.name} (active gameplay character)` : publishTarget.name
    setStatus(testAfter ? `Publishing ${edit.name} to ${targetLabel} and preparing the in-studio test…` : `Publishing ${edit.name} to ${targetLabel}…`)
    try {
      let effectiveTarget = publishTarget
      if (publishingToActivePlayer && activePlayerProfile) {
        const refreshed = await ensurePlayerAnimationCharacter(activePlayerProfile)
        if (refreshed) effectiveTarget = refreshed
        else {
          const freshAsset = activePlayerTargetId ? await getAsset(activePlayerTargetId).catch(() => undefined) : undefined
          if (freshAsset) effectiveTarget = freshAsset
        }
      }

      const publishBlob = effectiveTarget.id === characterAsset?.id && characterBlob
        ? characterBlob
        : await libraryCharacterModelBlob(effectiveTarget)
      const result = await publishAuthoredAnimation({
        motion: clip,
        characterBlob: publishBlob,
        edit,
        smoothing,
        mirrorX,
        cleanup: cleanupOptions,
        characterAsset: effectiveTarget,
        action: purpose,
      })
      const nextPublished: PublishedState = { action: purpose, clipName: result.built.clipName, animationAssetId: result.animationAsset.id, set: result.set, target: effectiveTarget, revision: Date.now() }
      setPublished(nextPublished)
      if (selectedDraftId) {
        const saved = await saveAnimationDraft({
          id: selectedDraftId,
          motion: clip,
          settings: { ...draftSettings, characterAssetId: effectiveTarget.id, characterName: effectiveTarget.name, publishedAnimationAssetId: result.animationAsset.id, publishedAt: new Date().toISOString() },
        })
        setDrafts((current) => current.map((draft) => draft.id === saved.id ? saved : draft))
        setDraftSavedAt(saved.asset.updatedAt)
      }
      if (testAfter) {
        setTestToken((value) => value + 1)
        setStatus(`${result.built.clipName} published to ${targetLabel}. Running the exact gameplay animation below.`)
        window.setTimeout(() => document.querySelector('.animation-studio-v3-test')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
      } else {
        setStatus(`${result.built.clipName} published as ${selectedAction?.label} to ${targetLabel}. ${publishingToActivePlayer ? 'It will be used by the active Skillbound character the next time gameplay starts.' : 'The draft remains saved for later edits.'}`)
      }
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
    } finally {
      setBusy(false)
    }
  }

  const removeSelectedDraft = async () => {
    if (!selectedDraftId) return
    const selected = drafts.find((draft) => draft.id === selectedDraftId)
    if (!window.confirm(`Delete ${selected?.settings.edit.name ?? 'this take'} draft?`)) return
    await deleteAnimationDraft(selectedDraftId)
    const remaining = drafts.filter((draft) => draft.id !== selectedDraftId)
    setDrafts(remaining)
    setSelectedDraftId('')
    setClip(undefined)
    setPlayhead(0)
    setPlaying(false)
    setPublished(undefined)
    if (remaining[0]) await applyDraft(remaining[0])
    else setStatus('Draft deleted. Record a new take when ready.')
  }

  return <div className="animation-studio-v3-shell">
    <div className="animation-authoring-layout animation-authoring-v3">
      <section className="animation-authoring-main">
        <div className="animation-authoring-toolbar">
          <div>
            <span className="eyebrow">ANIMATION STUDIO 3.0</span>
            <strong>{recording ? 'Recording…' : clip ? edit.name : characterName}</strong>
            <small>Record → autosave → replay → edit → publish → test here. No Library hopping.</small>
          </div>
          <div className="animation-authoring-toolbar-actions">
            <label className="secondary-button file-button"><FileUp size={16}/> Import character<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => void importCharacter(event.target.files?.[0])}/></label>
            <label className="secondary-button file-button"><FileUp size={16}/> Import motion<input type="file" accept=".json,.forge-motion.json" onChange={(event) => void importMotion(event.target.files?.[0])}/></label>
            <button className="primary-button" disabled={!canPublish} onClick={() => void publishCurrent(false)}><UploadCloud size={16}/>{busy ? 'Working…' : 'Publish'}</button>
            <button className="secondary-button test-game-button" disabled={!canPublish} onClick={() => void publishCurrent(true)}><Gamepad2 size={16}/> Publish + Test Here</button>
          </div>
        </div>

        <div className="animation-flow-bar animation-flow-v3">
          <div className={phoneConnected ? 'ready' : ''}><span>1</span><b>CAPTURE</b><small>{phoneConnected ? 'Phone connected' : 'Scan QR'}</small></div><i>→</i>
          <div className={selectedDraftId ? 'ready' : ''}><span>2</span><b>AUTOSAVE</b><small>{selectedDraftId ? 'Draft safe' : 'Nothing recorded'}</small></div><i>→</i>
          <div className={clip ? 'ready' : ''}><span>3</span><b>REPLAY + EDIT</b><small>{clip ? 'Take ready' : 'Record a take'}</small></div><i>→</i>
          <div className={published ? 'ready published' : ''}><span>4</span><b>TEST</b><small>{published ? 'Gameplay-ready' : 'Publish when ready'}</small></div>
        </div>

        <div className="animation-authoring-stage animation-stage-v3">
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
          {clip && !recording && <button className="animation-big-play" onClick={togglePlayback}>{playing ? <Pause size={20}/> : <Play size={20}/>}<span>{playing ? 'Pause Take' : 'Play Take'}</span></button>}
          {clip && <div className="cleanup-preview-pill">{playing ? 'PLAYBACK' : 'EDIT PREVIEW'} · {selectedAction?.label}</div>}
          <div className="viewport-stats">
            <div><span>BODY</span><strong>{activeFrame ? `${visibility}%` : '—'}</strong></div>
            <div><span>HANDS</span><strong>{activeFrame ? `${handsTracked}/2` : '—'}</strong></div>
            <div><span>FEET</span><strong>{activeFrame ? `${feetTracked}/2` : '—'}</strong></div>
            <div><span>LATENCY</span><strong>{latency === null ? '—' : `${latency} ms`}</strong></div>
            <div><span>RIG</span><strong>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal}` : '…'}</strong></div>
          </div>
        </div>

        <div className="animation-takes-bar animation-draft-bar">
          <div className="take-heading"><Save size={15}/><span>SAVED TAKES</span><b>{drafts.length}</b></div>
          <div className="take-list">
            {drafts.map((draft, index) => <button key={draft.id} className={selectedDraftId === draft.id ? 'active' : ''} onClick={() => void selectDraft(draft)}><strong>{draft.settings.edit.name || `Take ${String(index + 1).padStart(2, '0')}`}</strong><small>{formatDuration(draft.motion.durationMs)} · saved</small></button>)}
            {!drafts.length && <span className="take-empty">Your first recording will be saved here automatically.</span>}
          </div>
        </div>

        <div className="animation-authoring-timeline">
          <div className="timeline-controls">
            <button className="icon-button" disabled={!clip} onClick={() => { setPlayhead(0); playbackOffsetRef.current = 0; setPlaying(false) }}><RotateCcw size={16}/></button>
            <button className="play-button" disabled={!clip} onClick={togglePlayback}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button>
            <span className="timecode">{formatDuration(playhead)} / {formatDuration(previewDuration)}</span>
            <span className="draft-save-indicator"><CheckCircle2 size={13}/>{draftSavedAt ? `Autosaved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Autosave ready'}</span>
            <div className="timeline-spacer"/>
            {clip && <button className="icon-button danger-hover" title="Delete selected saved take" onClick={() => void removeSelectedDraft()}><Trash2 size={16}/></button>}
          </div>
          <input className="timeline-range" type="range" min={0} max={Math.max(1, previewDuration)} value={Math.min(playhead, previewDuration)} disabled={!clip} onChange={(event) => { const value = Number(event.target.value); setPlayhead(value); playbackOffsetRef.current = value; setPlaying(false) }}/>
          <div className="timeline-track"><div className="track-label">{selectedAction?.label?.toUpperCase() ?? 'ANIMATION'}</div><div className={`track-clip ${clip ? 'has-clip' : ''}`}>{clip ? `${cleanedPreview?.motion.frames.length ?? 0} frames · ${speed.toFixed(2)}× · ${rootMotion === 'keep' ? 'root motion' : rootMotion === 'horizontal' ? 'in-place X/Z' : 'root locked'}` : 'Record a take with the phone'}</div></div>
          <div className="timeline-track character-track"><div className="track-label">CHARACTER</div><div className="track-clip has-character">{characterName} · {publishTarget && publishTarget.id !== characterAsset?.id ? `game publish → ${publishTarget.name}` : characterAsset ? 'publish target' : 'preview only'}</div></div>
        </div>
      </section>

      <aside className="animation-authoring-inspector">
        <div className="authoring-section purpose-section">
          <span className="property-label">Gameplay action</span>
          <select value={purpose} onChange={(event) => selectPurpose(event.target.value as ForgeAnimationActionId)}>{FORGE_ANIMATION_ACTIONS.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}</select>
          <label><span>Clip name</span><input className="text-input" value={clipName} onChange={(event) => { setClipName(event.target.value); setPublished(undefined) }}/></label>
          <p>This saved take publishes directly into <b>{selectedAction?.label}</b>.</p>
        </div>

        <div className="authoring-section character-section">
          <span className="property-label">Character</span>
          <select value={characterAsset?.id ?? 'builtin'} onChange={(event) => { const id = event.target.value; setPublished(undefined); if (id === 'builtin') void loadCharacterAsset(undefined); else void loadCharacterAsset(characters.find((asset) => asset.id === id)) }}>
            <option value="builtin">Forge Mannequin · preview only</option>
            {characters.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.id === activePlayerTargetId ? ' · ACTIVE GAME' : ''}</option>)}
          </select>
          <div className="mini-row"><span>Rig</span><span className={rigInfo && rigInfo.coreMappedCount >= 8 ? 'status-good' : 'status-warn'}>{rigInfo ? `${rigInfo.coreMappedCount}/${rigInfo.coreTotal} core bones` : 'Scanning…'}</span></div>
          {activePlayerTarget && <p className="active-game-target-note"><b>Active game:</b> {activePlayerTarget.name}{publishTarget?.id === activePlayerTarget.id ? ' · this animation will publish here' : ''}</p>}
        </div>

        <div className="authoring-section phone-section">
          <div className="inspector-heading"><Smartphone size={16}/><span>Phone capture</span></div>
          {!phoneConnected ? <><div className="authoring-qr">{captureUrl ? <QRCodeSVG value={captureUrl} size={154} bgColor="#ffffff" fgColor="#0d1016" level="M" marginSize={2}/> : <QrCode size={34}/>}</div><p>Scan once. Stop recording on the phone and the take is saved immediately.</p></> : <div className="authoring-connected"><Radio size={15}/><div><strong>{phoneName}</strong><small>Live · {latency === null ? '—' : `${latency} ms`}</small></div></div>}
        </div>

        <div className={`authoring-section edit-section ${clip ? '' : 'disabled-section'}`}>
          <span className="property-label">Clip edit · autosaved</span>
          <div className="authoring-range-pair">
            <label><span>Trim start</span><b>{formatDuration(trimStartMs)}</b></label><input type="range" min={0} max={Math.max(1, originalDuration - 1)} step={1} value={Math.min(trimStartMs, Math.max(0, originalDuration - 1))} disabled={!clip} onChange={(event) => { setTrimStartMs(Math.min(Number(event.target.value), trimEndMs - 1)); setPublished(undefined) }}/>
            <label><span>Trim end</span><b>{formatDuration(trimEndMs)}</b></label><input type="range" min={1} max={Math.max(1, originalDuration)} step={1} value={Math.min(trimEndMs, originalDuration)} disabled={!clip} onChange={(event) => { setTrimEndMs(Math.max(Number(event.target.value), trimStartMs + 1)); setPublished(undefined) }}/>
          </div>
          <label className="range-setting"><span><b>Playback speed</b><em>{speed.toFixed(2)}×</em></span><input type="range" min="0.25" max="2.5" step="0.05" value={speed} disabled={!clip} onChange={(event) => { setSpeed(Number(event.target.value)); setPublished(undefined) }}/></label>
          <label className="authoring-select-row"><span><b>Root motion</b><small>Movement retained or made in-place.</small></span><select value={rootMotion} disabled={!clip} onChange={(event) => { setRootMotion(event.target.value as RootMotionMode); setPublished(undefined) }}><option value="keep">Keep root motion</option><option value="horizontal">Remove X/Z travel</option><option value="all">Lock root position</option></select></label>
          <label className="toggle-setting"><span><b>Loop in game</b><small>Runtime repeats this action.</small></span><input type="checkbox" checked={loop} disabled={!clip} onChange={(event) => { setLoop(event.target.checked); setPublished(undefined) }}/></label>
          <label className="toggle-setting"><span><b>Close loop</b><small>Blend the exported end pose back to the first.</small></span><input type="checkbox" checked={closeLoop} disabled={!clip} onChange={(event) => { setCloseLoop(event.target.checked); setPublished(undefined) }}/></label>
        </div>

        <div className={`authoring-section cleanup-section ${clip ? '' : 'disabled-section'}`}>
          <span className="property-label">Cleanup & retarget</span>
          <label className="range-setting"><span><b>Smoothing</b><em>{Math.round(smoothing * 100)}%</em></span><input type="range" min="0" max="0.9" step="0.05" value={smoothing} onChange={(event) => { setSmoothing(Number(event.target.value)); setPublished(undefined) }}/></label>
          <label className="range-setting"><span><b>Cleanup strength</b><em>{Math.round(cleanupStrength * 100)}%</em></span><input type="range" min="0" max="1" step="0.05" value={cleanupStrength} onChange={(event) => { setCleanupStrength(Number(event.target.value)); setPublished(undefined) }}/></label>
          <label className="toggle-setting"><span><b>Foot locking</b><small>Hold planted feet.</small></span><input type="checkbox" checked={footLock} onChange={(event) => { setFootLock(event.target.checked); setPublished(undefined) }}/></label>
          <label className="toggle-setting"><span><b>Ground alignment</b><small>Keep support feet on the floor.</small></span><input type="checkbox" checked={groundAlign} onChange={(event) => { setGroundAlign(event.target.checked); setPublished(undefined) }}/></label>
          <label className="toggle-setting"><span><b>Repair short gaps</b><small>Interpolate brief tracking dropouts.</small></span><input type="checkbox" checked={repairGaps} onChange={(event) => { setRepairGaps(event.target.checked); setPublished(undefined) }}/></label>
          <label className="toggle-setting retarget-side-fix"><span><b>Correct camera left/right</b><small>Keep enabled for Concept Forge and normal front-camera capture. Disable only if an imported rig is reversed.</small></span><input type="checkbox" checked={mirrorX} onChange={(event) => { setMirrorX(event.target.checked); setPublished(undefined) }}/></label>
          <label className="toggle-setting"><span><b>Show rig</b><small>Debug the mapped skeleton.</small></span><input type="checkbox" checked={showRig} onChange={(event) => setShowRig(event.target.checked)}/></label>
          {cleanedPreview && <div className="cleanup-report"><div><span>Foot locks</span><strong>{cleanedPreview.report.footLockedFrames}</strong></div><div><span>Repaired</span><strong>{cleanedPreview.report.repairedPoints}</strong></div><div><span>Duration</span><strong>{formatDuration(cleanedPreview.motion.durationMs)}</strong></div></div>}
        </div>

        <div className="authoring-section publish-section">
          <span className="property-label">Save / publish / test</span>
          <div className="publish-summary"><div><span>Draft</span><strong>{selectedDraftId ? 'Autosaved' : 'Record first'}</strong></div><div><span>Game target</span><strong>{publishTarget?.name ?? 'Select character'}</strong></div><div><span>Action</span><strong>{selectedAction?.label}</strong></div></div>
          <button className="primary-button authoring-publish" disabled={!canPublish} onClick={() => void publishCurrent(false)}><UploadCloud size={16}/>{busy ? 'Building…' : 'Publish to Game'}</button>
          <button className="secondary-button authoring-test" disabled={!canPublish} onClick={() => void publishCurrent(true)}><Gamepad2 size={16}/> Publish + Test Here</button>
          {published && <div className="published-confirm"><CheckCircle2 size={15}/><span>{published.clipName} is bound to {actionDefinition(published.action)?.label}.</span></div>}
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

    <div className="animation-studio-v3-test">
      {published ? <AnimationCombatTestArenaV2 key={`${published.animationAssetId}-${published.revision}`} target={published.target} animationSet={published.set} action={published.action} autoPlayToken={testToken}/> : <section className="animation-v3-test-empty"><Gamepad2 size={22}/><div><strong>In-studio gameplay test</strong><span>Press Publish + Test Here. Forge saves the draft, publishes it, and immediately plays that exact game animation here.</span></div></section>}
    </div>
  </div>
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
