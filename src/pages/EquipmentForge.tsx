import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Copy,
  Eye,
  EyeOff,
  FileUp,
  Layers3,
  PackagePlus,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Save,
  Shirt,
  Sparkles,
} from 'lucide-react'
import EquipmentForgeViewport, {
  type EquipmentForgeMaterialInfo,
} from '../components/EquipmentForgeViewport'
import {
  EQUIPMENT_FORGE_SLOTS,
  EQUIPMENT_FORGE_SLOT_LABELS,
  equipmentAssetBodyType,
  equipmentAssetSlot,
  importEquipmentForgeGlb,
  importSkillboundEquipmentPack,
  listEquipmentForgePresets,
  parseEquipmentForgePreset,
  saveEquipmentForgePreset,
  type EquipmentForgeSlot,
  type EquipmentMaterialOverride,
  type EquipmentMaterialOverrides,
} from '../engine/equipmentForge'
import {
  importOfficialSkillboundFoundationPack,
  loadOfficialSkillboundBaseAssets,
  skillboundBodyTypeFromAsset,
  type SkillboundBodyType,
} from '../lib/characterAssetRegistry'
import {
  listAssets,
  type LibraryAsset,
} from '../lib/library'
import '../equipment-forge.css'

type SlotState =
  Partial<Record<EquipmentForgeSlot, string>>

export default function EquipmentForge() {
  const [assets, setAssets] = useState<
    LibraryAsset[]
  >([])
  const [bases, setBases] = useState<
    LibraryAsset[]
  >([])
  const [presets, setPresets] = useState<
    LibraryAsset[]
  >([])
  const [bodyType, setBodyType] =
    useState<SkillboundBodyType>('female')
  const [slots, setSlots] =
    useState<SlotState>({})
  const [selectedSlot, setSelectedSlot] =
    useState<EquipmentForgeSlot>('Chest')
  const [
    materialOverrides,
    setMaterialOverrides,
  ] = useState<EquipmentMaterialOverrides>({})
  const [materials, setMaterials] = useState<
    EquipmentForgeMaterialInfo[]
  >([])
  const [
    selectedMaterialKey,
    setSelectedMaterialKey,
  ] = useState('')
  const [animate, setAnimate] =
    useState(false)
  const [
    baseClothingVisible,
    setBaseClothingVisible,
  ] = useState(false)
  const [status, setStatus] = useState(
    'Opening Equipment Forge…',
  )
  const [busy, setBusy] = useState(false)
  const [presetName, setPresetName] =
    useState('New Outfit')
  const [presetId, setPresetId] =
    useState('')
  const [recipeText, setRecipeText] =
    useState('')
  const basePackInput =
    useRef<HTMLInputElement>(null)
  const equipmentPackInput =
    useRef<HTMLInputElement>(null)
  const slotInput =
    useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const [library, official, savedPresets] =
      await Promise.all([
        listAssets(),
        loadOfficialSkillboundBaseAssets(),
        listEquipmentForgePresets(),
      ])
    setAssets(library)
    setBases(official)
    setPresets(savedPresets)
    setStatus(
      official.length === 2
        ? 'Skillbound foundation ready. Import an equipment pack or choose individual slot assets.'
        : 'Install the Skillbound base character pack to begin.',
    )
  }

  useEffect(() => {
    void refresh().catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not open Equipment Forge.',
      ),
    )
  }, [])

  const bodyAsset = bases.find(
    (asset) =>
      skillboundBodyTypeFromAsset(asset) ===
      bodyType,
  )

  const equipmentAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.tags.includes(
            'equipment-forge',
          ) &&
          asset.kind === 'glb',
      ),
    [assets],
  )

  const equippedAssets = useMemo(() => {
    const next: Partial<
      Record<EquipmentForgeSlot, LibraryAsset>
    > = {}
    for (const slot of EQUIPMENT_FORGE_SLOTS) {
      const id = slots[slot]
      const asset = id
        ? assets.find((entry) => entry.id === id)
        : undefined
      if (asset) {
        const target =
          equipmentAssetBodyType(asset)
        if (!target || target === bodyType) {
          next[slot] = asset
        }
      }
    }
    return next
  }, [assets, slots, bodyType])

  const selectedAssetId = slots[selectedSlot]
  const selectedAsset = selectedAssetId
    ? assets.find(
        (asset) => asset.id === selectedAssetId,
      )
    : undefined

  const slotOptions = useMemo(
    () =>
      equipmentAssets.filter((asset) => {
        if (
          equipmentAssetSlot(asset) !==
          selectedSlot
        ) {
          return false
        }
        const target =
          equipmentAssetBodyType(asset)
        return !target || target === bodyType
      }),
    [
      equipmentAssets,
      selectedSlot,
      bodyType,
    ],
  )

  const slotMaterials = materials.filter(
    (entry) =>
      entry.slot === selectedSlot &&
      (!selectedAssetId ||
        entry.assetId === selectedAssetId),
  )

  const activeMaterial =
    slotMaterials.find(
      (entry) =>
        entry.key === selectedMaterialKey,
    ) ?? slotMaterials[0]

  useEffect(() => {
    if (
      activeMaterial &&
      activeMaterial.key !==
        selectedMaterialKey
    ) {
      setSelectedMaterialKey(
        activeMaterial.key,
      )
    }
  }, [
    activeMaterial?.key,
    selectedMaterialKey,
  ])

  const installFoundation = async (
    file?: File,
  ) => {
    if (!file) return
    setBusy(true)
    setStatus(
      'Installing Skillbound male and female foundations…',
    )
    try {
      await importOfficialSkillboundFoundationPack(
        file,
      )
      await refresh()
      setStatus(
        'Skillbound base characters installed. Female is ready for the current armor pack.',
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not install the foundation pack.',
      )
    } finally {
      setBusy(false)
      if (basePackInput.current) {
        basePackInput.current.value = ''
      }
    }
  }

  const importPack = async (
    file?: File,
  ) => {
    if (!file) return
    setBusy(true)
    setStatus(
      'Unpacking equipment slots and adding them to the Forge Library…',
    )
    try {
      const imported =
        await importSkillboundEquipmentPack(
          file,
        )
      const nextSlots = { ...slots }
      for (const asset of imported) {
        const slot = equipmentAssetSlot(asset)
        if (slot) nextSlots[slot] = asset.id
      }
      setSlots(nextSlots)
      const inferred =
        imported
          .map(equipmentAssetBodyType)
          .find(Boolean)
      if (inferred) setBodyType(inferred)
      await refresh()
      setStatus(
        `Imported ${imported.length} equipment slots from ${file.name} and equipped them.`,
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not import that equipment pack.',
      )
    } finally {
      setBusy(false)
      if (equipmentPackInput.current) {
        equipmentPackInput.current.value = ''
      }
    }
  }

  const importSingleSlot = async (
    file?: File,
  ) => {
    if (!file) return
    setBusy(true)
    setStatus(
      `Importing ${EQUIPMENT_FORGE_SLOT_LABELS[selectedSlot]}…`,
    )
    try {
      const asset =
        await importEquipmentForgeGlb(
          file,
          selectedSlot,
          bodyType,
        )
      setSlots((current) => ({
        ...current,
        [selectedSlot]: asset.id,
      }))
      await refresh()
      setStatus(
        `${asset.name} imported and equipped to ${EQUIPMENT_FORGE_SLOT_LABELS[selectedSlot]}.`,
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not import that slot model.',
      )
    } finally {
      setBusy(false)
      if (slotInput.current) {
        slotInput.current.value = ''
      }
    }
  }

  const patchMaterial = (
    patch: Partial<EquipmentMaterialOverride>,
  ) => {
    if (!activeMaterial) return
    const current =
      materialOverrides[
        activeMaterial.assetId
      ]?.[activeMaterial.name] ?? {
        color: activeMaterial.color,
        roughness:
          activeMaterial.roughness,
        metalness:
          activeMaterial.metalness,
      }
    setMaterialOverrides((all) => ({
      ...all,
      [activeMaterial.assetId]: {
        ...(all[activeMaterial.assetId] ??
          {}),
        [activeMaterial.name]: {
          ...current,
          ...patch,
        },
      },
    }))
  }

  const activeOverride =
    activeMaterial
      ? materialOverrides[
          activeMaterial.assetId
        ]?.[activeMaterial.name] ?? {
          color: activeMaterial.color,
          roughness:
            activeMaterial.roughness,
          metalness:
            activeMaterial.metalness,
        }
      : undefined

  const resetActiveMaterial = () => {
    if (!activeMaterial) return
    setMaterialOverrides((all) => {
      const assetOverrides = {
        ...(all[activeMaterial.assetId] ??
          {}),
      }
      delete assetOverrides[
        activeMaterial.name
      ]
      const next = { ...all }
      if (
        Object.keys(assetOverrides).length
      ) {
        next[activeMaterial.assetId] =
          assetOverrides
      } else {
        delete next[
          activeMaterial.assetId
        ]
      }
      return next
    })
  }

  const savePreset = async () => {
    if (!bodyAsset) {
      setStatus(
        'Install a base body before saving an outfit.',
      )
      return
    }
    setBusy(true)
    try {
      const result =
        await saveEquipmentForgePreset({
          name:
            presetName.trim() ||
            'Skillbound Outfit',
          bodyAssetId: bodyAsset.id,
          bodyType,
          slots,
          materialOverrides,
        })
      setPresetId(result.asset.id)
      await refresh()
      setStatus(
        `${result.preset.name} saved to the Forge Library.`,
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not save the outfit preset.',
      )
    } finally {
      setBusy(false)
    }
  }

  const loadPreset = async () => {
    const asset = presets.find(
      (entry) => entry.id === presetId,
    )
    if (!asset) return
    setBusy(true)
    try {
      const preset =
        await parseEquipmentForgePreset(
          asset,
        )
      const base = assets.find(
        (entry) =>
          entry.id === preset.bodyAssetId,
      )
      const nextType =
        preset.bodyType ??
        skillboundBodyTypeFromAsset(base)
      if (nextType) setBodyType(nextType)
      setSlots(preset.slots)
      setMaterialOverrides(
        preset.materialOverrides ?? {},
      )
      setPresetName(preset.name)
      setStatus(
        `${preset.name} loaded from the Forge Library.`,
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not load that outfit.',
      )
    } finally {
      setBusy(false)
    }
  }

  const copyRecipe = async () => {
    const recipe = {
      format: 'forge-equipment-recipe',
      version: 1,
      bodyType,
      slots,
      materialOverrides,
    }
    const text = JSON.stringify(
      recipe,
      null,
      2,
    )
    setRecipeText(text)
    await navigator.clipboard
      ?.writeText(text)
      .catch(() => undefined)
    setStatus(
      'Current recipe copied. You can paste it into ChatGPT and ask for a new material/style variant.',
    )
  }

  const applyRecipe = () => {
    try {
      const recipe = JSON.parse(recipeText) as {
        bodyType?: SkillboundBodyType
        slots?: SlotState
        materialOverrides?: EquipmentMaterialOverrides
      }
      if (
        recipe.bodyType === 'male' ||
        recipe.bodyType === 'female'
      ) {
        setBodyType(recipe.bodyType)
      }
      if (recipe.slots) {
        const valid: SlotState = {}
        for (const slot of EQUIPMENT_FORGE_SLOTS) {
          const id = recipe.slots[slot]
          if (
            id &&
            assets.some(
              (asset) => asset.id === id,
            )
          ) {
            valid[slot] = id
          }
        }
        setSlots(valid)
      }
      if (recipe.materialOverrides) {
        setMaterialOverrides(
          recipe.materialOverrides,
        )
      }
      setStatus(
        'ChatGPT recipe applied to the live preview.',
      )
    } catch {
      setStatus(
        'Recipe JSON is invalid. Paste a Forge equipment recipe and try again.',
      )
    }
  }

  return (
    <div className="equipment-forge">
      <aside className="equipment-forge-library">
        <header>
          <span className="eyebrow">
            SKILLBOUND
          </span>
          <h2>Equipment Forge</h2>
          <p>
            Assemble, recolor and save
            equipment directly on your
            official player rigs.
          </p>
        </header>

        <section className="ef-section">
          <div className="ef-section-title">
            <Shirt size={14} />
            Foundation
          </div>
          <div className="ef-body-switch">
            {(
              ['female', 'male'] as const
            ).map((type) => {
              const installed = bases.some(
                (asset) =>
                  skillboundBodyTypeFromAsset(
                    asset,
                  ) === type,
              )
              return (
                <button
                  key={type}
                  className={
                    bodyType === type
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setBodyType(type)
                  }
                  disabled={!installed}
                >
                  <strong>
                    {type === 'female'
                      ? 'Female'
                      : 'Male'}
                  </strong>
                  <span>
                    {installed
                      ? 'Installed'
                      : 'Missing'}
                  </span>
                </button>
              )
            })}
          </div>
          {bases.length < 2 && (
            <label className="ef-import-button">
              <FileUp size={14} />
              Install base character pack
              <input
                ref={basePackInput}
                type="file"
                accept=".zip,application/zip"
                onChange={(event) =>
                  void installFoundation(
                    event.target.files?.[0],
                  )
                }
              />
            </label>
          )}
          <label className="ef-check">
            <input
              type="checkbox"
              checked={baseClothingVisible}
              onChange={(event) =>
                setBaseClothingVisible(
                  event.target.checked,
                )
              }
            />
            Show base underwear/clothing
          </label>
        </section>

        <section className="ef-section">
          <div className="ef-section-title">
            <Layers3 size={14} />
            Equipment pack
          </div>
          <label className="ef-import-button primary">
            <PackagePlus size={14} />
            Import equipment ZIP
            <input
              ref={equipmentPackInput}
              type="file"
              accept=".zip,application/zip"
              onChange={(event) =>
                void importPack(
                  event.target.files?.[0],
                )
              }
            />
          </label>
          <small className="ef-help">
            Your Female Adventurer Armor
            ZIP works directly here. Forge
            extracts each EQ_* slot and
            stores it in the local Asset
            Library.
          </small>
        </section>

        <section className="ef-section ef-slots">
          <div className="ef-section-title">
            <Shirt size={14} />
            Slots
          </div>
          {EQUIPMENT_FORGE_SLOTS.map(
            (slot) => {
              const assetId = slots[slot]
              const asset = assetId
                ? assets.find(
                    (entry) =>
                      entry.id === assetId,
                  )
                : undefined
              return (
                <button
                  key={slot}
                  className={
                    selectedSlot === slot
                      ? 'ef-slot active'
                      : 'ef-slot'
                  }
                  onClick={() =>
                    setSelectedSlot(slot)
                  }
                >
                  <span>
                    <strong>
                      {
                        EQUIPMENT_FORGE_SLOT_LABELS[
                          slot
                        ]
                      }
                    </strong>
                    <small>
                      {asset?.name ??
                        'Empty'}
                    </small>
                  </span>
                  <i
                    className={
                      asset
                        ? 'equipped'
                        : ''
                    }
                  />
                </button>
              )
            },
          )}
        </section>
      </aside>

      <main className="equipment-forge-main">
        <header className="ef-toolbar">
          <div>
            <span className="eyebrow">
              EQUIPMENT FORGE · MVP 1
            </span>
            <strong>
              {bodyAsset?.name ??
                'No base character'}
            </strong>
          </div>
          <div className="ef-toolbar-actions">
            <button
              onClick={() =>
                setBaseClothingVisible(
                  (value) => !value,
                )
              }
            >
              {baseClothingVisible ? (
                <Eye size={14} />
              ) : (
                <EyeOff size={14} />
              )}
              Base clothing
            </button>
            <button
              onClick={() =>
                setAnimate(
                  (value) => !value,
                )
              }
            >
              {animate ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
              {animate
                ? 'Pause pose test'
                : 'Pose test'}
            </button>
          </div>
        </header>

        <div className="ef-viewport-wrap">
          <EquipmentForgeViewport
            bodyAsset={bodyAsset}
            slots={equippedAssets}
            overrides={materialOverrides}
            animate={animate}
            baseClothingVisible={
              baseClothingVisible
            }
            onMaterials={setMaterials}
            onStatus={setStatus}
          />
          {!bodyAsset && (
            <div className="ef-empty">
              <Shirt size={38} />
              <h2>
                Install the Skillbound
                foundation
              </h2>
              <p>
                Equipment Forge uses your
                existing male/female
                Skillbound rigs instead of
                generating new characters.
              </p>
              <label className="ef-import-button primary">
                <FileUp size={14} />
                Choose base character ZIP
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) =>
                    void installFoundation(
                      event.target.files?.[0],
                    )
                  }
                />
              </label>
            </div>
          )}
        </div>

        <footer className="ef-status">
          <span />
          {status}
        </footer>
      </main>

      <aside className="equipment-forge-inspector">
        <section className="ef-inspector-block">
          <div className="ef-section-title">
            <Shirt size={14} />
            {
              EQUIPMENT_FORGE_SLOT_LABELS[
                selectedSlot
              ]
            }
          </div>
          <label className="ef-field">
            <span>Equipped asset</span>
            <select
              value={selectedAssetId ?? ''}
              onChange={(event) =>
                setSlots((current) => {
                  const next = {
                    ...current,
                  }
                  if (event.target.value) {
                    next[selectedSlot] =
                      event.target.value
                  } else {
                    delete next[selectedSlot]
                  }
                  return next
                })
              }
            >
              <option value="">
                Empty slot
              </option>
              {slotOptions.map((asset) => (
                <option
                  key={asset.id}
                  value={asset.id}
                >
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <div className="ef-inline-actions">
            <label className="ef-small-button">
              <FileUp size={13} />
              Import GLB
              <input
                ref={slotInput}
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(event) =>
                  void importSingleSlot(
                    event.target.files?.[0],
                  )
                }
              />
            </label>
            <button
              className="ef-small-button"
              disabled={!selectedAsset}
              onClick={() =>
                setSlots((current) => {
                  const next = {
                    ...current,
                  }
                  delete next[selectedSlot]
                  return next
                })
              }
            >
              Remove
            </button>
          </div>
        </section>

        <section className="ef-inspector-block">
          <div className="ef-section-title">
            <Palette size={14} />
            Materials
          </div>
          {!slotMaterials.length ? (
            <p className="ef-muted">
              Equip a skinned slot to edit
              its PBR materials.
            </p>
          ) : (
            <>
              <div className="ef-material-list">
                {slotMaterials.map(
                  (material) => (
                    <button
                      key={material.key}
                      className={
                        material.key ===
                        activeMaterial?.key
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        setSelectedMaterialKey(
                          material.key,
                        )
                      }
                    >
                      <i
                        style={{
                          background:
                            materialOverrides[
                              material.assetId
                            ]?.[
                              material.name
                            ]?.color ??
                            material.color,
                        }}
                      />
                      <span>
                        {material.name}
                      </span>
                    </button>
                  ),
                )}
              </div>
              {activeMaterial &&
                activeOverride && (
                  <div className="ef-material-editor">
                    <label className="ef-field">
                      <span>Color</span>
                      <div className="ef-color-row">
                        <input
                          type="color"
                          value={
                            activeOverride.color
                          }
                          onChange={(event) =>
                            patchMaterial({
                              color:
                                event.target
                                  .value,
                            })
                          }
                        />
                        <input
                          value={
                            activeOverride.color
                          }
                          onChange={(event) =>
                            patchMaterial({
                              color:
                                event.target
                                  .value,
                            })
                          }
                        />
                      </div>
                    </label>
                    <RangeField
                      label="Roughness"
                      value={
                        activeOverride.roughness
                      }
                      onChange={(value) =>
                        patchMaterial({
                          roughness: value,
                        })
                      }
                    />
                    <RangeField
                      label="Metalness"
                      value={
                        activeOverride.metalness
                      }
                      onChange={(value) =>
                        patchMaterial({
                          metalness: value,
                        })
                      }
                    />
                    <button
                      className="ef-reset"
                      onClick={
                        resetActiveMaterial
                      }
                    >
                      <RotateCcw
                        size={13}
                      />
                      Reset material
                    </button>
                  </div>
                )}
            </>
          )}
        </section>

        <section className="ef-inspector-block">
          <div className="ef-section-title">
            <Save size={14} />
            Outfit preset
          </div>
          <label className="ef-field">
            <span>Name</span>
            <input
              value={presetName}
              onChange={(event) =>
                setPresetName(
                  event.target.value,
                )
              }
            />
          </label>
          <button
            className="ef-primary-action"
            disabled={!bodyAsset || busy}
            onClick={() =>
              void savePreset()
            }
          >
            <Save size={14} />
            Save to Forge Library
          </button>
          <div className="ef-load-preset">
            <select
              value={presetId}
              onChange={(event) =>
                setPresetId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Saved outfits…
              </option>
              {presets.map((preset) => (
                <option
                  key={preset.id}
                  value={preset.id}
                >
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              disabled={!presetId || busy}
              onClick={() =>
                void loadPreset()
              }
            >
              Load
            </button>
          </div>
        </section>

        <section className="ef-inspector-block ef-chatgpt">
          <div className="ef-section-title">
            <Sparkles size={14} />
            ChatGPT recipe
          </div>
          <p className="ef-muted">
            Copy the current recipe, ask
            ChatGPT to restyle the
            materials, then paste the
            edited JSON back here.
          </p>
          <textarea
            value={recipeText}
            onChange={(event) =>
              setRecipeText(
                event.target.value,
              )
            }
            placeholder='{"format":"forge-equipment-recipe", ...}'
          />
          <div className="ef-inline-actions">
            <button
              className="ef-small-button"
              onClick={() =>
                void copyRecipe()
              }
            >
              <Copy size={13} />
              Copy current
            </button>
            <button
              className="ef-small-button"
              disabled={!recipeText.trim()}
              onClick={applyRecipe}
            >
              <Sparkles size={13} />
              Apply recipe
            </button>
          </div>
        </section>
      </aside>
    </div>
  )
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="ef-range">
      <span>
        {label}
        <strong>
          {value.toFixed(2)}
        </strong>
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) =>
          onChange(
            Number(event.target.value),
          )
        }
      />
    </label>
  )
}
