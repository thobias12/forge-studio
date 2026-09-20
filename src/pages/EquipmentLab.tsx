import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDriveUpload,
  ImagePlus,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Save,
  Shield,
  Upload,
  WandSparkles,
} from 'lucide-react'
import EquipmentLabViewer from '../components/EquipmentLabViewer'
import {
  OFFICIAL_SKILLBOUND_BASE_IDS,
  type SkillboundBodyType,
} from '../lib/characterAssetRegistry'
import {
  getAsset,
  saveAsset,
} from '../lib/library'
import {
  checkEquipmentProcessor,
  getEquipmentProcessorJob,
  getLocal3DGenerationResult,
  processEquipment,
  saveGeneratorAccessToken,
  startLocal3DGeneration,
  startLocalGeneratorSetup,
  startProceduralEquipmentGeneration,
  uploadEquipmentMannequin,
  type EquipmentGeneratorJob,
  type EquipmentLabSlot,
  type EquipmentProcessorHealth,
} from '../lib/equipmentProcessorClient'

const BODY_MASKS: Record<EquipmentLabSlot, string[]> = {
  chest: ['CHEST', 'BACK', 'SHOULDER_L', 'SHOULDER_R'],
  head: ['HEAD'],
  legs: ['PELVIS', 'THIGH_L', 'THIGH_R'],
  boots: ['CALF_L', 'CALF_R', 'FOOT_L', 'FOOT_R'],
  gloves: ['FOREARM_L', 'FOREARM_R', 'HAND_L', 'HAND_R'],
  waist: ['PELVIS'],
  back: [],
  'main-hand': [],
  'off-hand': [],
}

const SLOT_LABELS: Array<{ id: EquipmentLabSlot; label: string }> = [
  { id: 'chest', label: 'Chest' },
  { id: 'head', label: 'Head' },
  { id: 'legs', label: 'Legs' },
  { id: 'boots', label: 'Boots' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'waist', label: 'Waist' },
  { id: 'back', label: 'Back / Cape' },
  { id: 'main-hand', label: 'Main Hand' },
  { id: 'off-hand', label: 'Off Hand' },
]

type ProcessState =
  | 'idle'
  | 'installing'
  | 'generating'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'

export default function EquipmentLab() {
  const [bodyType, setBodyType] = useState<SkillboundBodyType>('female')
  const [slot, setSlot] = useState<EquipmentLabSlot>('chest')
  const [fit, setFit] = useState<'tight' | 'normal' | 'loose'>('normal')
  const [clearanceMm, setClearanceMm] = useState(4)
  const [polyLimit, setPolyLimit] = useState(25000)
  const [generationQuality, setGenerationQuality] =
    useState<'draft' | 'standard' | 'high'>('standard')
  const [proceduralStyle, setProceduralStyle] =
    useState<'ranger' | 'traveler' | 'acolyte'>('ranger')
  const [proceduralSeed, setProceduralSeed] = useState(0)
  const [proceduralResult, setProceduralResult] = useState(false)
  const [showExperimental, setShowExperimental] = useState(false)
  const [generatorToken, setGeneratorToken] = useState('')
  const [savingGeneratorToken, setSavingGeneratorToken] = useState(false)

  const [referenceFile, setReferenceFile] = useState<File>()
  const [referenceUrl, setReferenceUrl] = useState<string>()
  const [rawFile, setRawFile] = useState<File>()
  const [rawUrl, setRawUrl] = useState<string>()
  const [mannequinBlob, setMannequinBlob] = useState<Blob>()
  const [mannequinUrl, setMannequinUrl] = useState<string>()
  const [processedBlob, setProcessedBlob] = useState<Blob>()
  const [processedUrl, setProcessedUrl] = useState<string>()

  const [health, setHealth] = useState<EquipmentProcessorHealth>()
  const [generatorJob, setGeneratorJob] = useState<EquipmentGeneratorJob>()
  const [state, setState] = useState<ProcessState>('idle')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const maskRegions = BODY_MASKS[slot]
  const connected = Boolean(health?.ok && health.blenderAvailable)
  const generatorReady = Boolean(health?.generator?.ready)
  const busy =
    state === 'installing'
    || state === 'generating'
    || state === 'uploading'
    || state === 'processing'

  const assetName = useMemo(() => {
    if (proceduralResult) {
      return {
        ranger: 'Ranger Field Vest',
        traveler: 'Traveler Layered Tunic',
        acolyte: 'Acolyte Battle Tunic',
      }[proceduralStyle]
    }

    const source = rawFile ?? referenceFile
    if (!source) return 'New equipment'
    return source.name
      .replace(/\.(glb|png|jpe?g|webp)$/i, '')
      .replace(/[-_]+/g, ' ')
  }, [
    rawFile,
    referenceFile,
    proceduralResult,
    proceduralStyle,
  ])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined

    void getAsset(OFFICIAL_SKILLBOUND_BASE_IDS[bodyType]).then((asset) => {
      if (cancelled) return
      setMannequinBlob(asset?.blob)
      if (asset?.blob) {
        objectUrl = URL.createObjectURL(asset.blob)
        setMannequinUrl(objectUrl)
      } else {
        setMannequinUrl(undefined)
      }
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [bodyType])

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const next = await checkEquipmentProcessor()
        if (!cancelled) setHealth(next)
      } catch {
        if (!cancelled) setHealth(undefined)
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const refreshProcessor = async () => {
    try {
      setHealth(await checkEquipmentProcessor())
    } catch {
      setHealth(undefined)
    }
  }

  const waitForJob = async (jobId: string) => {
    let connectionFailures = 0

    for (;;) {
      try {
        const next =
          await getEquipmentProcessorJob(
            jobId,
          )

        connectionFailures = 0
        setGeneratorJob(next)

        if (
          next.status ===
          'completed'
        ) {
          return next
        }

        if (
          next.status ===
          'failed'
        ) {
          throw new Error(
            next.error ||
            next.message ||
            'Local generator job failed.',
          )
        }
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : String(cause)

        if (
          !message.includes(
            'Temporarily lost the local Equipment Processor connection',
          )
        ) {
          throw cause
        }

        connectionFailures += 1

        setGeneratorJob(
          (current) => ({
            id: jobId,
            kind:
              current?.kind ??
              'generate',
            status: 'running',
            progress:
              current?.progress ??
              0,
            message:
              'Local generation is still running · reconnecting to the processor…',
          }),
        )

        if (
          connectionFailures >=
          30
        ) {
          throw new Error(
            'The local Equipment Processor has been unreachable for about a minute. ' +
            'Check that the processor CMD window is still open. The local Blender/3D job may still be running there.',
          )
        }
      }

      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            2000,
          ),
      )
    }
  }

  const clearProcessed = () => {
    setProcessedBlob(undefined)
    setSaved('')
    if (processedUrl) {
      URL.revokeObjectURL(processedUrl)
      setProcessedUrl(undefined)
    }
  }

  const selectReference = (file?: File) => {
    setError('')
    setGeneratorJob(undefined)
    setProceduralResult(false)
    clearProcessed()

    if (referenceUrl) {
      URL.revokeObjectURL(referenceUrl)
      setReferenceUrl(undefined)
    }

    if (!file) {
      setReferenceFile(undefined)
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Choose a PNG, JPG or WEBP reference image.')
      return
    }

    setReferenceFile(file)
    setReferenceUrl(URL.createObjectURL(file))
    setState('idle')
  }

  const setRawAsset = (file?: File) => {
    clearProcessed()
    if (rawUrl) {
      URL.revokeObjectURL(rawUrl)
      setRawUrl(undefined)
    }
    setRawFile(file)
    if (file) setRawUrl(URL.createObjectURL(file))
  }

  const selectRawFile = (file?: File) => {
    setError('')
    setProceduralResult(false)
    if (!file) {
      setRawAsset(undefined)
      return
    }
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setError('Equipment Lab currently accepts self-contained .glb files.')
      return
    }
    setRawAsset(file)
    setState('idle')
  }

  const saveSparAccess = async () => {
    const token = generatorToken.trim()
    if (!token) {
      setError('Paste your Hugging Face read token first.')
      return
    }

    setError('')
    setSavingGeneratorToken(true)
    try {
      await saveGeneratorAccessToken(token)
      setGeneratorToken('')
      await refreshProcessor()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSavingGeneratorToken(false)
    }
  }

  const installGenerator = async () => {
    if (!connected) {
      setError('Start the Forge Equipment Processor first.')
      return
    }

    setError('')
    setGeneratorJob(undefined)
    setState('installing')

    try {
      const started = await startLocalGeneratorSetup('spar3d')
      await waitForJob(started.jobId)
      await refreshProcessor()
      setState('idle')
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const generateProcedural =
    async () => {
      if (!mannequinBlob) {
        setError(
          'The Skillbound ' +
          bodyType +
          ' foundation is not installed in Forge Library yet.',
        )
        return
      }

      if (!connected) {
        setError(
          'Start the Forge Equipment Processor first.',
        )
        return
      }

      if (slot !== 'chest') {
        setError(
          'The first body-aware generator is Chest. The remaining equipment slots come after this chest template passes QA.',
        )
        return
      }

      setError('')
      setSaved('')
      setGeneratorJob(undefined)
      clearProcessed()
      setState('uploading')

      try {
        await uploadEquipmentMannequin(
          bodyType,
          mannequinBlob,
        )

        setState('generating')
        const started =
          await startProceduralEquipmentGeneration(
            {
              bodyType,
              slot,
              style:
                proceduralStyle,
              seed:
                proceduralSeed,
            },
          )

        await waitForJob(
          started.jobId,
        )

        const result =
          await getLocal3DGenerationResult(
            started.jobId,
          )

        if (processedUrl) {
          URL.revokeObjectURL(
            processedUrl,
          )
        }

        setProcessedBlob(result)
        setProcessedUrl(
          URL.createObjectURL(
            result,
          ),
        )
        setProceduralResult(true)
        setState('ready')
      } catch (cause) {
        setState('error')
        setError(
          cause instanceof Error
            ? cause.message
            : String(cause),
        )
      }
    }

  const processRawFile = async (sourceFile: File) => {
    if (!mannequinBlob) {
      throw new Error(
        'The Skillbound ' + bodyType + ' foundation is not installed in Forge Library yet.',
      )
    }
    if (!connected) {
      throw new Error(
        'Forge Equipment Processor is not connected with Blender available.',
      )
    }

    setState('uploading')
    await uploadEquipmentMannequin(bodyType, mannequinBlob)

    setState('processing')
    const result = await processEquipment(sourceFile, {
      bodyType,
      slot,
      fit,
      clearanceMm,
      polyLimit,
      fileName: sourceFile.name,
    })

    if (processedUrl) URL.revokeObjectURL(processedUrl)
    setProcessedBlob(result.blob)
    setProcessedUrl(URL.createObjectURL(result.blob))
    setState('ready')
  }

  const runProcessor = async () => {
    if (!rawFile) {
      setError('Choose a raw equipment GLB first.')
      return
    }

    setError('')
    setSaved('')
    try {
      await processRawFile(rawFile)
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const generateAndProcess = async () => {
    if (!referenceFile) {
      setError('Choose a reference image first.')
      return
    }
    if (!generatorReady) {
      setError('Install the free local 3D generator first.')
      return
    }

    setError('')
    setSaved('')
    setGeneratorJob(undefined)
    setProceduralResult(false)
    clearProcessed()
    setState('generating')

    try {
      const started = await startLocal3DGeneration(referenceFile, {
        fileName: referenceFile.name,
        quality: generationQuality,
        backend: 'spar3d',
      })

      await waitForJob(started.jobId)
      const generatedBlob = await getLocal3DGenerationResult(started.jobId)
      const generatedFile = new File(
        [generatedBlob],
        assetName.replace(/\s+/g, '-').toLowerCase() + '-raw.glb',
        { type: 'model/gltf-binary' },
      )

      setRawAsset(generatedFile)
      await processRawFile(generatedFile)
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const saveProcessed = async () => {
    if (!processedBlob) return

    const next = await saveAsset({
      name: assetName + ' · ' + slot,
      category: 'characters',
      kind: 'glb',
      mime: 'model/gltf-binary',
      source: proceduralResult
        ? 'Forge Equipment Lab · Body-aware procedural'
        : referenceFile
          ? 'Forge Equipment Lab · Local AI'
          : 'Forge Equipment Lab',
      tags: [
        'equipment',
        'equipment-lab',
        'processed:blender',
        ...(proceduralResult
          ? [
              'generated:procedural',
              'generator:blender-body-aware-v2',
              'style:' + proceduralStyle,
              'seed:' + proceduralSeed,
            ]
          : referenceFile
            ? ['generated:local-ai', 'generator:spar3d']
            : []),
        'body-type:' + bodyType,
        'equipment-slot:' + slot,
        ...maskRegions.map((region) => 'body-mask:' + region.toLowerCase()),
      ],
      blob: processedBlob,
    })

    setSaved('Saved to Forge Library as ' + next.name + '.')
  }

  return (
    <div className="page-scroll equipment-lab-page">
      <section className="equipment-lab-hero">
        <div>
          <span className="eyebrow">SKILLBOUND ASSET FACTORY</span>
          <h1>Equipment Lab</h1>
          <p>
            Generate body-aware equipment directly around the Skillbound character
            with Blender. No reference image, paid service or manual fitting required.
          </p>
        </div>

        <button
          className={'equipment-processor-pill ' + (connected ? 'online' : 'offline')}
          onClick={refreshProcessor}
        >
          <Cpu size={17} />
          <span>
            <strong>{connected ? 'Processor connected' : 'Processor offline'}</strong>
            <small>
              {connected
                ? generatorReady
                  ? 'Blender + Procedural + SPAR3D ready'
                  : 'Blender + Procedural ready'
                : 'localhost:47831'}
            </small>
          </span>
          <RefreshCw size={14} />
        </button>
      </section>

      <div className="equipment-lab-layout">
        <aside className="equipment-lab-panel equipment-lab-controls">
          <header>
            <span className="eyebrow">AUTOMATIC</span>
            <h2>Generate equipment</h2>
          </header>

          <label className="equipment-lab-field">
            <span>Skillbound body</span>
            <select
              value={bodyType}
              onChange={(event) =>
                setBodyType(event.target.value as SkillboundBodyType)}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>

          <label className="equipment-lab-field">
            <span>Equipment slot</span>
            <select
              value={slot}
              onChange={(event) => setSlot(event.target.value as EquipmentLabSlot)}
            >
              {SLOT_LABELS.map((entry) => (
                <option
                  value={entry.id}
                  key={entry.id}
                  disabled={entry.id !== 'chest'}
                >
                  {entry.label}
                  {entry.id !== 'chest' ? ' · coming later' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="equipment-lab-field">
            <span>Style</span>
            <select
              value={proceduralStyle}
              onChange={(event) =>
                setProceduralStyle(
                  event.target.value as
                    | 'ranger'
                    | 'traveler'
                    | 'acolyte',
                )}
            >
              <option value="ranger">Ranger</option>
              <option value="traveler">Traveler</option>
              <option value="acolyte">Acolyte</option>
            </select>
          </label>

          <label className="equipment-lab-field">
            <span>Variation</span>
            <select
              value={proceduralSeed}
              onChange={(event) =>
                setProceduralSeed(
                  Number(event.target.value),
                )}
            >
              <option value={0}>01 · balanced</option>
              <option value={1}>02 · alternate</option>
              <option value={2}>03 · alternate</option>
              <option value={3}>04 · alternate</option>
            </select>
          </label>

          <button
            className="primary-button equipment-lab-process"
            disabled={
              !connected ||
              !mannequinBlob ||
              busy ||
              slot !== 'chest'
            }
            onClick={generateProcedural}
          >
            {state === 'generating' && !referenceFile
              ? <LoaderCircle className="spin" size={16} />
              : <WandSparkles size={16} />}
            {state === 'uploading' && !referenceFile
              ? 'Preparing Skillbound body…'
              : state === 'generating' && !referenceFile
                ? 'Building equipment…'
                : proceduralResult
                  ? 'Regenerate Equipment'
                  : 'Generate Equipment'}
          </button>

          {slot !== 'chest' && (
            <div className="equipment-lab-warning">
              <AlertTriangle size={16} />
              <span>
                Body-aware Chest generation is the first production template.
                Other slots stay visible so the same workflow can expand after
                this template passes visual QA.
              </span>
            </div>
          )}

          <button
            className="secondary-button equipment-lab-experimental-toggle"
            onClick={() => setShowExperimental((value) => !value)}
            type="button"
          >
            {showExperimental
              ? 'Hide experimental / import tools'
              : 'Show experimental / import tools'}
          </button>

          {showExperimental && (
            <div className="equipment-lab-experimental">
            <div className="equipment-lab-or">
              <span>EXPERIMENTAL IMAGE → 3D</span>
            </div>
  
            <label className="equipment-lab-reference">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => selectReference(event.target.files?.[0])}
              />
              {referenceUrl ? (
                <img src={referenceUrl} alt="Equipment reference" />
              ) : (
                <ImagePlus size={22} />
              )}
              <span>
                <strong>{referenceFile ? referenceFile.name : 'Choose reference image'}</strong>
                <small>One clean object on a simple background works best</small>
              </span>
            </label>
  
            <label className="equipment-lab-field">
              <span>Local generation quality</span>
              <select
                value={generationQuality}
                onChange={(event) =>
                  setGenerationQuality(
                    event.target.value as 'draft' | 'standard' | 'high',
                  )}
              >
                <option value="draft">Draft · fastest</option>
                <option value="standard">Standard · recommended</option>
                <option value="high">High · slower</option>
              </select>
            </label>
  
            {health?.generator?.needsAccessToken && (
              <div className="equipment-lab-access">
                <strong>One-time SPAR3D model access</strong>
                <p>
                  SPAR3D is free for this non-commercial workflow, but Stability AI
                  requires accepting its model license on Hugging Face once.
                </p>
                <div className="equipment-lab-access-links">
                  {health.generator.modelAccessUrl && (
                    <a
                      href={health.generator.modelAccessUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      1. Accept model access
                    </a>
                  )}
                  {health.generator.tokenUrl && (
                    <a
                      href={health.generator.tokenUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      2. Create read token
                    </a>
                  )}
                </div>
                <input
                  type="password"
                  value={generatorToken}
                  onChange={(event) => setGeneratorToken(event.target.value)}
                  placeholder="hf_…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="secondary-button"
                  disabled={!generatorToken.trim() || savingGeneratorToken}
                  onClick={saveSparAccess}
                >
                  {savingGeneratorToken
                    ? <LoaderCircle className="spin" size={15} />
                    : <Save size={15} />}
                  Save token locally
                </button>
                <small>
                  The token is written only to the local Equipment Processor work
                  folder. Do not paste it into chat.
                </small>
              </div>
            )}
  
            {!generatorReady ? (
              <button
                className="secondary-button equipment-lab-process"
                disabled={!connected || busy || Boolean(health?.generator?.needsAccessToken)}
                onClick={installGenerator}
              >
                {state === 'installing'
                  ? <LoaderCircle className="spin" size={16} />
                  : <HardDriveUpload size={16} />}
                {state === 'installing'
                  ? 'Installing local generator…'
                  : health?.generator?.needsAccessToken
                    ? 'Add SPAR3D access above'
                    : 'Install Better Local 3D'}
              </button>
            ) : (
              <button
                className="primary-button equipment-lab-process"
                disabled={!referenceFile || !connected || busy}
                onClick={generateAndProcess}
              >
                {busy
                  ? <LoaderCircle className="spin" size={16} />
                  : <WandSparkles size={16} />}
                {state === 'generating'
                  ? 'Generating 3D locally…'
                  : state === 'uploading'
                    ? 'Preparing mannequin…'
                    : state === 'processing'
                      ? 'Blender fitting…'
                      : 'Generate + Process'}
              </button>
            )}
  
            {generatorJob && (
              <div className="equipment-generator-progress">
                <div>
                  <strong>{generatorJob.message}</strong>
                  <span>{Math.round(generatorJob.progress)}%</span>
                </div>
                <i>
                  <b style={{ width: generatorJob.progress + '%' }} />
                </i>
              </div>
            )}
  
            <div className="equipment-lab-or"><span>OR IMPORT EXISTING 3D</span></div>
  
            <label className="equipment-lab-upload">
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(event) => selectRawFile(event.target.files?.[0])}
              />
              <Upload size={20} />
              <span>
                <strong>{rawFile ? rawFile.name : 'Choose raw GLB'}</strong>
                <small>
                  {rawFile
                    ? formatBytes(rawFile.size)
                    : 'Manual fallback for an existing 3D model'}
                </small>
              </span>
            </label>
  
  
            </div>
          )}

          {showExperimental && (
            <div className="equipment-lab-experimental-fit">
            <div className="equipment-lab-divider" />
  
            <header>
              <span className="eyebrow">AUTO PROCESS</span>
              <h2>Fit settings</h2>
            </header>
  
            <label className="equipment-lab-field">
              <span>Fit</span>
              <select
                value={fit}
                onChange={(event) =>
                  setFit(event.target.value as 'tight' | 'normal' | 'loose')}
              >
                <option value="tight">Tight</option>
                <option value="normal">Normal</option>
                <option value="loose">Loose</option>
              </select>
            </label>
  
            <label className="equipment-lab-field">
              <span>Surface clearance <b>{clearanceMm} mm</b></span>
              <input
                type="range"
                min="1"
                max="12"
                step="1"
                value={clearanceMm}
                onChange={(event) => setClearanceMm(Number(event.target.value))}
              />
            </label>
  
            <label className="equipment-lab-field">
              <span>Polygon budget</span>
              <select
                value={polyLimit}
                onChange={(event) => setPolyLimit(Number(event.target.value))}
              >
                <option value={12000}>12k</option>
                <option value={25000}>25k</option>
                <option value={50000}>50k</option>
              </select>
            </label>
  
            <button
              className="secondary-button equipment-lab-process"
              disabled={!rawFile || !connected || busy}
              onClick={runProcessor}
            >
              {state === 'uploading' || state === 'processing'
                ? <LoaderCircle className="spin" size={16} />
                : <WandSparkles size={16} />}
              Process Raw GLB Only
            </button>
  
  
            </div>
          )}

          {!mannequinBlob && (
            <div className="equipment-lab-warning">
              <AlertTriangle size={16} />
              <span>
                Install the official Skillbound {bodyType} foundation in Forge
                Library first.
              </span>
            </div>
          )}

          {health?.generator && !generatorReady && !health.generator.pythonAvailable && (
            <div className="equipment-lab-warning">
              <AlertTriangle size={16} />
              <span>
                Local generation needs Python once so Forge can manage its
                private runtime. Blender processing still works without it.
              </span>
            </div>
          )}

          {error && (
            <div className="equipment-lab-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
        </aside>

        <main className="equipment-lab-workspace">
          <div
            className={
              'equipment-lab-view-grid ' +
              (!showExperimental ? 'single' : '')
            }
          >
            {showExperimental && (
            <article className="equipment-lab-preview-card">
              <header>
                <div><span>RAW</span><strong>Generated / imported mesh</strong></div>
                {rawFile && <CheckCircle2 size={16} />}
              </header>
              <div className="equipment-lab-preview">
                {rawUrl ? (
                  <EquipmentLabViewer
                    equipmentSrc={rawUrl}
                    rawOnly
                    slot={slot}
                  />
                ) : (
                  <PreviewEmpty
                    icon={<HardDriveUpload size={24} />}
                    title={proceduralResult ? 'No raw intermediate' : 'No raw 3D yet'}
                    detail={
                      proceduralResult
                        ? 'Body-aware generation builds directly from the Skillbound mannequin, so there is no detached raw mesh to fit afterward.'
                        : 'Image-to-3D and manual imports appear here before Blender fitting.'
                    }
                  />
                )}
              </div>
            </article>
            )}

            <article className="equipment-lab-preview-card processed">
              <header>
                <div><span>PROCESSED</span><strong>Skillbound fit</strong></div>
                {state === 'ready' && <CheckCircle2 size={16} />}
              </header>
              <div className="equipment-lab-preview">
                {processedUrl && mannequinUrl ? (
                  <EquipmentLabViewer
                    bodySrc={mannequinUrl}
                    equipmentSrc={processedUrl}
                  />
                ) : (
                  <PreviewEmpty
                    icon={<Shield size={24} />}
                    title="Waiting for final asset"
                    detail="Click Generate Equipment. Blender builds the selected chest directly on this Skillbound body and the finished result appears here."
                  />
                )}
              </div>
            </article>
          </div>

          <section className="equipment-lab-panel equipment-lab-pipeline">
            <header>
              <div>
                <span className="eyebrow">PIPELINE</span>
                <h2>
                  {proceduralResult
                    ? 'Generated chest → Skillbound'
                    : showExperimental
                      ? 'Reference → Skillbound'
                      : 'Equipment generator'}
                </h2>
              </div>
              {state === 'ready' && (
                <span className="equipment-lab-ready">
                  <PackageCheck size={15} /> Game asset ready for review
                </span>
              )}
            </header>

            <div className="equipment-lab-steps equipment-lab-steps-seven">
              <PipelineStep
                label={proceduralResult ? 'Design' : 'Reference'}
                detail={
                  proceduralResult
                    ? proceduralStyle
                    : 'PNG / JPG / WEBP'
                }
                done={
                  proceduralResult ||
                  Boolean(referenceFile) ||
                  Boolean(rawFile)
                }
              />
              <PipelineStep
                label={proceduralResult ? 'Build' : 'Generate'}
                detail={
                  proceduralResult
                    ? 'Body-aware Blender'
                    : referenceFile
                      ? 'Local SPAR3D'
                      : 'Imported GLB'
                }
                done={
                  proceduralResult ||
                  Boolean(rawFile)
                }
              />
              <PipelineStep
                label="Normalize"
                detail={
                  proceduralResult
                    ? 'Native Skillbound scale'
                    : 'Scale + orientation'
                }
                done={state === 'ready'}
              />
              <PipelineStep
                label="Fit"
                detail={
                  proceduralResult
                    ? 'Built on body surface'
                    : fit + ' · ' + clearanceMm + ' mm'
                }
                done={state === 'ready'}
              />
              <PipelineStep
                label="Skin"
                detail={
                  proceduralResult
                    ? 'Inherited body weights'
                    : 'Skillbound weights'
                }
                done={state === 'ready'}
              />
              <PipelineStep
                label="Mask"
                detail={maskRegions.length ? maskRegions.join(' · ') : 'No body mask'}
                done={state === 'ready'}
              />
              <PipelineStep label="Export" detail="GLB" done={state === 'ready'} />
            </div>

            <div className="equipment-lab-actions">
              <button
                className="secondary-button"
                disabled={!processedBlob}
                onClick={saveProcessed}
              >
                <Save size={15} /> Save to Asset Library
              </button>
            </div>

            {saved && (
              <div className="equipment-lab-saved">
                <CheckCircle2 size={15} />
                {saved}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function PipelineStep({
  label,
  detail,
  done,
}: {
  label: string
  detail: string
  done: boolean
}) {
  return (
    <div className={'equipment-lab-step ' + (done ? 'done' : '')}>
      <i>{done ? <CheckCircle2 size={14} /> : null}</i>
      <span><strong>{label}</strong><small>{detail}</small></span>
    </div>
  )
}

function PreviewEmpty({
  icon,
  title,
  detail,
}: {
  icon: ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="equipment-lab-empty">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(1) + ' KB'
  return (kb / 1024).toFixed(1) + ' MB'
}
