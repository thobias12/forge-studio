import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HardDriveUpload,
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
  processEquipment,
  uploadEquipmentMannequin,
  type EquipmentLabSlot,
  type EquipmentProcessorHealth,
} from '../lib/equipmentProcessorClient'

const BODY_MASKS:
  Record<
    EquipmentLabSlot,
    string[]
  > = {
    chest: [
      'CHEST',
      'BACK',
      'SHOULDER_L',
      'SHOULDER_R',
    ],
    head: [
      'HEAD',
    ],
    legs: [
      'PELVIS',
      'THIGH_L',
      'THIGH_R',
    ],
    boots: [
      'CALF_L',
      'CALF_R',
      'FOOT_L',
      'FOOT_R',
    ],
    gloves: [
      'FOREARM_L',
      'FOREARM_R',
      'HAND_L',
      'HAND_R',
    ],
    waist: [
      'PELVIS',
    ],
    back: [],
    'main-hand': [],
    'off-hand': [],
  }

const SLOT_LABELS:
  Array<{
    id: EquipmentLabSlot
    label: string
  }> = [
    {
      id: 'chest',
      label: 'Chest',
    },
    {
      id: 'head',
      label: 'Head',
    },
    {
      id: 'legs',
      label: 'Legs',
    },
    {
      id: 'boots',
      label: 'Boots',
    },
    {
      id: 'gloves',
      label: 'Gloves',
    },
    {
      id: 'waist',
      label: 'Waist',
    },
    {
      id: 'back',
      label: 'Back / Cape',
    },
    {
      id: 'main-hand',
      label: 'Main Hand',
    },
    {
      id: 'off-hand',
      label: 'Off Hand',
    },
  ]

type ProcessState =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'

export default function EquipmentLab() {
  const [
    bodyType,
    setBodyType,
  ] =
    useState<
      SkillboundBodyType
    >('female')
  const [
    slot,
    setSlot,
  ] =
    useState<
      EquipmentLabSlot
    >('chest')
  const [
    fit,
    setFit,
  ] =
    useState<
      'tight' |
      'normal' |
      'loose'
    >('normal')
  const [
    clearanceMm,
    setClearanceMm,
  ] =
    useState(4)
  const [
    polyLimit,
    setPolyLimit,
  ] =
    useState(25000)
  const [
    rawFile,
    setRawFile,
  ] =
    useState<File>()
  const [
    rawUrl,
    setRawUrl,
  ] =
    useState<string>()
  const [
    mannequinBlob,
    setMannequinBlob,
  ] =
    useState<Blob>()
  const [
    mannequinUrl,
    setMannequinUrl,
  ] =
    useState<string>()
  const [
    processedBlob,
    setProcessedBlob,
  ] =
    useState<Blob>()
  const [
    processedUrl,
    setProcessedUrl,
  ] =
    useState<string>()
  const [
    health,
    setHealth,
  ] =
    useState<
      EquipmentProcessorHealth
      | undefined
    >()
  const [
    state,
    setState,
  ] =
    useState<ProcessState>(
      'idle',
    )
  const [
    error,
    setError,
  ] =
    useState('')
  const [
    saved,
    setSaved,
  ] =
    useState('')

  const maskRegions =
    BODY_MASKS[slot]

  const assetName =
    useMemo(() => {
      if (!rawFile) {
        return 'New equipment'
      }
      return rawFile.name
        .replace(
          /\.glb$/i,
          '',
        )
        .replace(
          /[-_]+/g,
          ' ',
        )
    }, [rawFile])

  useEffect(() => {
    let cancelled = false
    let objectUrl:
      | string
      | undefined

    const load = async () => {
      const asset =
        await getAsset(
          OFFICIAL_SKILLBOUND_BASE_IDS[
            bodyType
          ],
        )

      if (
        cancelled
      ) {
        return
      }

      setMannequinBlob(
        asset?.blob,
      )

      if (asset?.blob) {
        objectUrl =
          URL.createObjectURL(
            asset.blob,
          )
        setMannequinUrl(
          objectUrl,
        )
      } else {
        setMannequinUrl(
          undefined,
        )
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl,
        )
      }
    }
  }, [bodyType])

  useEffect(() => {
    let cancelled = false
    const controller =
      new AbortController()

    const check = async () => {
      try {
        const next =
          await checkEquipmentProcessor(
            controller.signal,
          )
        if (!cancelled) {
          setHealth(next)
        }
      } catch {
        if (!cancelled) {
          setHealth(undefined)
        }
      }
    }

    void check()
    const timer =
      window.setInterval(
        () => void check(),
        5000,
      )

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(
        timer,
      )
    }
  }, [])

  const selectFile = (
    file?: File,
  ) => {
    setError('')
    setSaved('')
    setProcessedBlob(
      undefined,
    )
    setState('idle')

    if (processedUrl) {
      URL.revokeObjectURL(
        processedUrl,
      )
      setProcessedUrl(
        undefined,
      )
    }

    if (!file) {
      setRawFile(
        undefined,
      )
      return
    }

    if (
      !file.name
        .toLowerCase()
        .endsWith('.glb')
    ) {
      setError(
        'Equipment Lab currently accepts self-contained .glb files.',
      )
      return
    }

    if (rawUrl) {
      URL.revokeObjectURL(
        rawUrl,
      )
    }

    setRawFile(file)
    setRawUrl(
      URL.createObjectURL(
        file,
      ),
    )
  }

  const refreshProcessor =
    async () => {
      try {
        setHealth(
          await checkEquipmentProcessor(),
        )
      } catch {
        setHealth(undefined)
      }
    }

  const runProcessor =
    async () => {
      if (!rawFile) {
        setError(
          'Choose a raw equipment GLB first.',
        )
        return
      }

      if (!mannequinBlob) {
        setError(
          'The Skillbound ' +
            bodyType +
            ' foundation is not installed in Forge Library yet.',
        )
        return
      }

      if (
        !health?.ok ||
        !health.blenderAvailable
      ) {
        setError(
          'Forge Equipment Processor is not connected with Blender available.',
        )
        return
      }

      setError('')
      setSaved('')
      setState(
        'uploading',
      )

      try {
        await uploadEquipmentMannequin(
          bodyType,
          mannequinBlob,
        )

        setState(
          'processing',
        )

        const result =
          await processEquipment(
            rawFile,
            {
              bodyType,
              slot,
              fit,
              clearanceMm,
              polyLimit,
              fileName:
                rawFile.name,
            },
          )

        if (processedUrl) {
          URL.revokeObjectURL(
            processedUrl,
          )
        }

        setProcessedBlob(
          result.blob,
        )
        setProcessedUrl(
          URL.createObjectURL(
            result.blob,
          ),
        )
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

  const saveProcessed =
    async () => {
      if (!processedBlob) {
        return
      }

      const next =
        await saveAsset({
          name:
            assetName +
            ' · ' +
            slot,
          category:
            'characters',
          kind: 'glb',
          mime:
            'model/gltf-binary',
          source:
            'Forge Equipment Lab',
          tags: [
            'equipment',
            'equipment-lab',
            'processed:blender',
            'body-type:' +
              bodyType,
            'equipment-slot:' +
              slot,
            ...maskRegions.map(
              (region) =>
                'body-mask:' +
                region.toLowerCase(),
            ),
          ],
          blob:
            processedBlob,
        })

      setSaved(
        'Saved to Forge Library as ' +
          next.name +
          '.',
      )
    }

  const connected =
    Boolean(
      health?.ok &&
      health.blenderAvailable,
    )

  return (
    <div className="page-scroll equipment-lab-page">
      <section className="equipment-lab-hero">
        <div>
          <span className="eyebrow">
            SKILLBOUND ASSET PIPELINE
          </span>
          <h1>
            Equipment Lab
          </h1>
          <p>
            Convert a real imported GLB into fitted, skinned Skillbound equipment instead of generating clothing topology in Three.js.
          </p>
        </div>

        <button
          className={
            'equipment-processor-pill ' +
            (connected
              ? 'online'
              : 'offline')
          }
          onClick={
            refreshProcessor
          }
        >
          <Cpu size={17} />
          <span>
            <strong>
              {connected
                ? 'Processor connected'
                : 'Processor offline'}
            </strong>
            <small>
              {connected
                ? 'Blender ready'
                : 'localhost:47831'}
            </small>
          </span>
          <RefreshCw size={14} />
        </button>
      </section>

      <div className="equipment-lab-layout">
        <aside className="equipment-lab-panel equipment-lab-controls">
          <header>
            <span className="eyebrow">
              INPUT
            </span>
            <h2>
              Raw equipment
            </h2>
          </header>

          <label className="equipment-lab-field">
            <span>
              Skillbound body
            </span>
            <select
              value={bodyType}
              onChange={
                (event) =>
                  setBodyType(
                    event.target.value as
                      SkillboundBodyType,
                  )
              }
            >
              <option value="female">
                Female
              </option>
              <option value="male">
                Male
              </option>
            </select>
          </label>

          <label className="equipment-lab-field">
            <span>
              Equipment slot
            </span>
            <select
              value={slot}
              onChange={
                (event) =>
                  setSlot(
                    event.target.value as
                      EquipmentLabSlot,
                  )
              }
            >
              {SLOT_LABELS.map(
                (entry) => (
                  <option
                    value={entry.id}
                    key={entry.id}
                  >
                    {entry.label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="equipment-lab-upload">
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={
                (event) =>
                  selectFile(
                    event.target
                      .files?.[0],
                  )
              }
            />
            <Upload size={20} />
            <span>
              <strong>
                {rawFile
                  ? rawFile.name
                  : 'Choose raw GLB'}
              </strong>
              <small>
                {rawFile
                  ? formatBytes(
                      rawFile.size,
                    )
                  : 'AI generated or authored equipment'}
              </small>
            </span>
          </label>

          <div className="equipment-lab-divider" />

          <header>
            <span className="eyebrow">
              AUTO PROCESS
            </span>
            <h2>
              Fit settings
            </h2>
          </header>

          <label className="equipment-lab-field">
            <span>
              Fit
            </span>
            <select
              value={fit}
              onChange={
                (event) =>
                  setFit(
                    event.target.value as
                      'tight' |
                      'normal' |
                      'loose',
                  )
              }
            >
              <option value="tight">
                Tight
              </option>
              <option value="normal">
                Normal
              </option>
              <option value="loose">
                Loose
              </option>
            </select>
          </label>

          <label className="equipment-lab-field">
            <span>
              Surface clearance
              <b>
                {clearanceMm} mm
              </b>
            </span>
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={clearanceMm}
              onChange={
                (event) =>
                  setClearanceMm(
                    Number(
                      event.target.value,
                    ),
                  )
              }
            />
          </label>

          <label className="equipment-lab-field">
            <span>
              Polygon budget
            </span>
            <select
              value={polyLimit}
              onChange={
                (event) =>
                  setPolyLimit(
                    Number(
                      event.target.value,
                    ),
                  )
              }
            >
              <option value={12000}>
                12k
              </option>
              <option value={25000}>
                25k
              </option>
              <option value={50000}>
                50k
              </option>
            </select>
          </label>

          <button
            className="primary-button equipment-lab-process"
            disabled={
              !rawFile ||
              !connected ||
              state ===
                'processing' ||
              state ===
                'uploading'
            }
            onClick={
              runProcessor
            }
          >
            {state ===
              'processing' ||
            state ===
              'uploading' ? (
              <LoaderCircle
                className="spin"
                size={16}
              />
            ) : (
              <WandSparkles
                size={16}
              />
            )}
            {state ===
            'uploading'
              ? 'Preparing mannequin…'
              : state ===
                  'processing'
                ? 'Blender processing…'
                : 'Process Equipment'}
          </button>

          {!mannequinBlob && (
            <div className="equipment-lab-warning">
              <AlertTriangle
                size={16}
              />
              <span>
                Install the official Skillbound {bodyType} foundation in Forge Library first.
              </span>
            </div>
          )}

          {error && (
            <div className="equipment-lab-error">
              <AlertTriangle
                size={16}
              />
              <span>
                {error}
              </span>
            </div>
          )}
        </aside>

        <main className="equipment-lab-workspace">
          <div className="equipment-lab-view-grid">
            <article className="equipment-lab-preview-card">
              <header>
                <div>
                  <span>
                    RAW
                  </span>
                  <strong>
                    Source mesh
                  </strong>
                </div>
                {rawFile && (
                  <CheckCircle2
                    size={16}
                  />
                )}
              </header>
              <div className="equipment-lab-preview">
                {rawUrl ? (
                  <EquipmentLabViewer
                    equipmentSrc={
                      rawUrl
                    }
                    rawOnly
                  />
                ) : (
                  <PreviewEmpty
                    icon={
                      <HardDriveUpload
                        size={24}
                      />
                    }
                    title="No raw GLB"
                    detail="Choose a generated chest, boot, weapon or other equipment asset."
                  />
                )}
              </div>
            </article>

            <article className="equipment-lab-preview-card processed">
              <header>
                <div>
                  <span>
                    PROCESSED
                  </span>
                  <strong>
                    Skillbound fit
                  </strong>
                </div>
                {state ===
                  'ready' && (
                  <CheckCircle2
                    size={16}
                  />
                )}
              </header>
              <div className="equipment-lab-preview">
                {processedUrl &&
                mannequinUrl ? (
                  <EquipmentLabViewer
                    bodySrc={
                      mannequinUrl
                    }
                    equipmentSrc={
                      processedUrl
                    }
                  />
                ) : (
                  <PreviewEmpty
                    icon={
                      <Shield
                        size={24}
                      />
                    }
                    title="Ready for processing"
                    detail="The fitted result will appear on the real Skillbound mannequin."
                  />
                )}
              </div>
            </article>
          </div>

          <section className="equipment-lab-panel equipment-lab-pipeline">
            <header>
              <div>
                <span className="eyebrow">
                  PIPELINE
                </span>
                <h2>
                  Game-ready checks
                </h2>
              </div>
              {state ===
                'ready' && (
                <span className="equipment-lab-ready">
                  <PackageCheck
                    size={15}
                  />
                  Processed
                </span>
              )}
            </header>

            <div className="equipment-lab-steps">
              <PipelineStep
                label="Raw GLB"
                detail="Imported mesh"
                done={
                  Boolean(rawFile)
                }
              />
              <PipelineStep
                label="Normalize"
                detail="Scale + orientation"
                done={
                  state ===
                  'ready'
                }
              />
              <PipelineStep
                label="Fit"
                detail={
                  fit +
                  ' · ' +
                  clearanceMm +
                  ' mm'
                }
                done={
                  state ===
                  'ready'
                }
              />
              <PipelineStep
                label="Skin"
                detail="Skillbound weights"
                done={
                  state ===
                  'ready'
                }
              />
              <PipelineStep
                label="Mask"
                detail={
                  maskRegions.length
                    ? maskRegions.join(
                        ' · ',
                      )
                    : 'No body mask'
                }
                done={
                  state ===
                  'ready'
                }
              />
              <PipelineStep
                label="Export"
                detail="GLB"
                done={
                  state ===
                  'ready'
                }
              />
            </div>

            <div className="equipment-lab-actions">
              <button
                className="secondary-button"
                disabled={
                  !processedBlob
                }
                onClick={
                  saveProcessed
                }
              >
                <Save size={15} />
                Save to Asset Library
              </button>
            </div>

            {saved && (
              <div className="equipment-lab-saved">
                <CheckCircle2
                  size={15}
                />
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
    <div
      className={
        'equipment-lab-step ' +
        (done
          ? 'done'
          : '')
      }
    >
      <i>
        {done ? (
          <CheckCircle2
            size={14}
          />
        ) : null}
      </i>
      <span>
        <strong>
          {label}
        </strong>
        <small>
          {detail}
        </small>
      </span>
    </div>
  )
}

function PreviewEmpty({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
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

function formatBytes(
  bytes: number,
) {
  if (bytes < 1024) {
    return bytes + ' B'
  }
  const kb =
    bytes / 1024
  if (kb < 1024) {
    return kb.toFixed(1) +
      ' KB'
  }
  return (
    kb / 1024
  ).toFixed(1) + ' MB'
}
