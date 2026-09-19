import {
  Dices,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react'
import {
  PROCEDURAL_EQUIPMENT_STYLES,
  applyProceduralStyle,
  createProceduralEquipmentRecipe,
  listProceduralEquipmentRecipes,
  parseProceduralEquipmentRecipe,
  randomizeProceduralEquipmentRecipe,
  saveProceduralEquipmentRecipe,
  type ProceduralEquipmentRecipe,
} from '../engine/equipmentForgeProcedural'
import { useEffect, useState } from 'react'
import type { LibraryAsset } from '../lib/library'

type Props = {
  recipe: ProceduralEquipmentRecipe
  onChange: (recipe: ProceduralEquipmentRecipe) => void
  onStatus?: (status: string) => void
}

export default function EquipmentCreatorPanel({
  recipe,
  onChange,
  onStatus,
}: Props) {
  const [saved, setSaved] = useState<
    LibraryAsset[]
  >([])
  const [selectedId, setSelectedId] =
    useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setSaved(
      await listProceduralEquipmentRecipes(),
    )
  }

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [])

  const patch = <
    K extends keyof ProceduralEquipmentRecipe,
  >(
    key: K,
    value: ProceduralEquipmentRecipe[K],
  ) => {
    onChange({
      ...recipe,
      [key]: value,
    })
  }

  const patchChest = (
    value: Partial<
      ProceduralEquipmentRecipe['chest']
    >,
  ) => {
    patch('chest', {
      ...recipe.chest,
      ...value,
    })
  }

  const patchWaist = (
    value: Partial<
      ProceduralEquipmentRecipe['waist']
    >,
  ) => {
    patch('waist', {
      ...recipe.waist,
      ...value,
    })
  }

  const patchCape = (
    value: Partial<
      ProceduralEquipmentRecipe['cape']
    >,
  ) => {
    patch('cape', {
      ...recipe.cape,
      ...value,
    })
  }

  const patchMaterials = (
    value: Partial<
      ProceduralEquipmentRecipe['materials']
    >,
  ) => {
    patch('materials', {
      ...recipe.materials,
      ...value,
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      const asset =
        await saveProceduralEquipmentRecipe(
          recipe,
        )
      await refresh()
      setSelectedId(asset.id)
      onStatus?.(
        `${recipe.name} saved as an editable Equipment Creator recipe.`,
      )
    } catch (error) {
      onStatus?.(
        error instanceof Error
          ? error.message
          : 'Could not save the creator recipe.',
      )
    } finally {
      setBusy(false)
    }
  }

  const load = async () => {
    const asset = saved.find(
      (entry) => entry.id === selectedId,
    )
    if (!asset) return
    setBusy(true)
    try {
      const loaded =
        await parseProceduralEquipmentRecipe(
          asset,
        )
      onChange(loaded)
      onStatus?.(
        `${loaded.name} loaded into Equipment Creator.`,
      )
    } catch (error) {
      onStatus?.(
        error instanceof Error
          ? error.message
          : 'Could not load that creator recipe.',
      )
    } finally {
      setBusy(false)
    }
  }

  const resetStyle = () => {
    onChange(
      createProceduralEquipmentRecipe(
        recipe.bodyType,
        recipe.style,
      ),
    )
    onStatus?.(
      'Creator parameters reset to the current style preset.',
    )
  }

  return (
    <>
      <section className="ef-inspector-block ef-creator-panel">
        <div className="ef-section-title">
          <Sparkles size={14} />
          Equipment Creator
        </div>
        <p className="ef-muted">
          Forge builds these pieces locally
          from reusable geometry. No Astra
          generation is used.
        </p>

        <label className="ef-field">
          <span>Set name</span>
          <input
            value={recipe.name}
            onChange={(event) =>
              patch(
                'name',
                event.target.value,
              )
            }
          />
        </label>

        <div className="ef-creator-styles">
          {PROCEDURAL_EQUIPMENT_STYLES.map(
            (style) => (
              <button
                key={style.id}
                className={
                  recipe.style === style.id
                    ? 'active'
                    : ''
                }
                title={style.description}
                onClick={() =>
                  onChange(
                    applyProceduralStyle(
                      recipe,
                      style.id,
                    ),
                  )
                }
              >
                <strong>
                  {style.label}
                </strong>
                <small>
                  {style.description}
                </small>
              </button>
            ),
          )}
        </div>

        <div className="ef-inline-actions">
          <button
            className="ef-small-button"
            onClick={() => {
              onChange(
                randomizeProceduralEquipmentRecipe(
                  recipe,
                ),
              )
              onStatus?.(
                'Created a deterministic variation of the current style.',
              )
            }}
          >
            <Dices size={13} />
            Random variant
          </button>
          <button
            className="ef-small-button"
            onClick={resetStyle}
          >
            <RotateCcw size={13} />
            Reset style
          </button>
        </div>
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Chest
        </div>
        <ToggleField
          label="Generate chest"
          value={recipe.chest.enabled}
          onChange={(enabled) =>
            patchChest({ enabled })
          }
        />
        <ToggleField
          label="Leather vest layer"
          value={recipe.chest.leatherVest}
          onChange={(leatherVest) =>
            patchChest({ leatherVest })
          }
        />
        <CreatorRange
          label="Width"
          value={recipe.chest.width}
          min={.86}
          max={1.14}
          step={.01}
          onChange={(width) =>
            patchChest({ width })
          }
        />
        <CreatorRange
          label="Depth"
          value={recipe.chest.depth}
          min={.86}
          max={1.15}
          step={.01}
          onChange={(depth) =>
            patchChest({ depth })
          }
        />
        <CreatorRange
          label="Length"
          value={recipe.chest.length}
          min={.68}
          max={1.2}
          step={.01}
          onChange={(length) =>
            patchChest({ length })
          }
        />
        <CreatorRange
          label="Looseness"
          value={recipe.chest.looseness}
          min={0}
          max={.22}
          step={.01}
          onChange={(looseness) =>
            patchChest({ looseness })
          }
        />
        <CreatorRange
          label="Plate coverage"
          value={
            recipe.chest.plateCoverage
          }
          min={0}
          max={1}
          step={.01}
          onChange={(plateCoverage) =>
            patchChest({
              plateCoverage,
            })
          }
        />
        <CreatorRange
          label="Shoulder armor"
          value={
            recipe.chest.shoulderSize
          }
          min={0}
          max={.46}
          step={.01}
          onChange={(shoulderSize) =>
            patchChest({ shoulderSize })
          }
        />
        <CreatorRange
          label="Asymmetry"
          value={
            recipe.chest
              .shoulderAsymmetry
          }
          min={0}
          max={1}
          step={.01}
          onChange={(
            shoulderAsymmetry,
          ) =>
            patchChest({
              shoulderAsymmetry,
            })
          }
        />
        <CreatorRange
          label="Collar"
          value={
            recipe.chest.collarHeight
          }
          min={0}
          max={.55}
          step={.01}
          onChange={(collarHeight) =>
            patchChest({ collarHeight })
          }
        />
        <CreatorRange
          label="Straps"
          value={recipe.chest.strapCount}
          min={0}
          max={4}
          step={1}
          digits={0}
          onChange={(strapCount) =>
            patchChest({
              strapCount: Math.round(
                strapCount,
              ),
            })
          }
        />
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Waist
        </div>
        <ToggleField
          label="Generate waist"
          value={recipe.waist.enabled}
          onChange={(enabled) =>
            patchWaist({ enabled })
          }
        />
        <CreatorRange
          label="Belt width"
          value={recipe.waist.beltWidth}
          min={.05}
          max={.14}
          step={.005}
          onChange={(beltWidth) =>
            patchWaist({ beltWidth })
          }
        />
        <CreatorRange
          label="Pouches"
          value={recipe.waist.pouchCount}
          min={0}
          max={4}
          step={1}
          digits={0}
          onChange={(pouchCount) =>
            patchWaist({
              pouchCount: Math.round(
                pouchCount,
              ),
            })
          }
        />
        <CreatorRange
          label="Tabard length"
          value={
            recipe.waist.tabardLength
          }
          min={0}
          max={.85}
          step={.01}
          onChange={(tabardLength) =>
            patchWaist({ tabardLength })
          }
        />
        <CreatorRange
          label="Tabard width"
          value={recipe.waist.tabardWidth}
          min={.26}
          max={.58}
          step={.01}
          onChange={(tabardWidth) =>
            patchWaist({ tabardWidth })
          }
        />
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Cape / Back
        </div>
        <ToggleField
          label="Generate cape"
          value={recipe.cape.enabled}
          onChange={(enabled) =>
            patchCape({ enabled })
          }
        />
        <CreatorRange
          label="Length"
          value={recipe.cape.length}
          min={0}
          max={.9}
          step={.01}
          onChange={(length) =>
            patchCape({ length })
          }
        />
        <CreatorRange
          label="Width"
          value={recipe.cape.width}
          min={.36}
          max={.72}
          step={.01}
          onChange={(width) =>
            patchCape({ width })
          }
        />
        <CreatorRange
          label="Flare"
          value={recipe.cape.flare}
          min={0}
          max={.34}
          step={.01}
          onChange={(flare) =>
            patchCape({ flare })
          }
        />
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Creator materials
        </div>
        <CreatorColor
          label="Cloth"
          value={recipe.materials.cloth}
          onChange={(cloth) =>
            patchMaterials({ cloth })
          }
        />
        <CreatorColor
          label="Leather"
          value={recipe.materials.leather}
          onChange={(leather) =>
            patchMaterials({ leather })
          }
        />
        <CreatorColor
          label="Metal"
          value={recipe.materials.metal}
          onChange={(metal) =>
            patchMaterials({ metal })
          }
        />
        <CreatorColor
          label="Accent / cape"
          value={recipe.materials.accent}
          onChange={(accent) =>
            patchMaterials({ accent })
          }
        />
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          <Save size={14} />
          Creator library
        </div>
        <button
          className="ef-primary-action"
          disabled={busy}
          onClick={() => void save()}
        >
          <Save size={14} />
          Save editable set
        </button>
        <div className="ef-load-preset">
          <select
            value={selectedId}
            onChange={(event) =>
              setSelectedId(
                event.target.value,
              )
            }
          >
            <option value="">
              Created sets…
            </option>
            {saved.map((asset) => (
              <option
                key={asset.id}
                value={asset.id}
              >
                {asset.name}
              </option>
            ))}
          </select>
          <button
            disabled={!selectedId || busy}
            onClick={() => void load()}
          >
            Load
          </button>
        </div>
      </section>
    </>
  )
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="ef-creator-toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) =>
          onChange(event.target.checked)
        }
      />
      <span>{label}</span>
    </label>
  )
}

function CreatorRange({
  label,
  value,
  min,
  max,
  step,
  digits = 2,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  digits?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="ef-range">
      <span>
        {label}
        <strong>
          {value.toFixed(digits)}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
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

function CreatorColor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="ef-field ef-creator-color">
      <span>{label}</span>
      <div className="ef-color-row">
        <input
          type="color"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
        <input
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      </div>
    </label>
  )
}
