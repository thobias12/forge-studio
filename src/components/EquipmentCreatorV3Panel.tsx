import {
  RefreshCcw,
  Shirt,
  Sparkles,
} from 'lucide-react'
import {
  applyEquipmentForgeV3StylePreset,
  createEquipmentForgeV3Recipe,
  type EquipmentForgeV3Recipe,
} from '../engine/equipmentForgeV3/types'

type Props = {
  recipe: EquipmentForgeV3Recipe
  onChange: (
    recipe: EquipmentForgeV3Recipe,
  ) => void
  onStatus?: (status: string) => void
}

export default function EquipmentCreatorV3Panel({
  recipe,
  onChange,
  onStatus,
}: Props) {
  const patch = <
    K extends keyof EquipmentForgeV3Recipe,
  >(
    key: K,
    value: EquipmentForgeV3Recipe[K],
  ) => {
    onChange({
      ...recipe,
      [key]: value,
    })
  }

  const patchMaterial = (
    key: keyof EquipmentForgeV3Recipe['materials'],
    value: string,
  ) => {
    patch('materials', {
      ...recipe.materials,
      [key]: value,
    })
  }

  return (
    <>
      <section className="ef-inspector-block ef-v3-card">
        <div className="ef-section-title">
          <Sparkles size={14} />
          Equipment Forge V3
        </div>
        <p className="ef-muted">
          Body-conforming templates inherit
          the Skillbound rig and skin
          weights instead of being assembled
          from floating primitives.
        </p>

        <label className="ef-field">
          <span>Template</span>
          <select
            value={recipe.template}
            onChange={(event) =>
              patch(
                'template',
                event.target.value as
                  EquipmentForgeV3Recipe['template'],
              )
            }
          >
            <option value="tunic_fitted">
              Fitted Tunic
            </option>
          </select>
        </label>

        <label className="ef-field">
          <span>Outfit name</span>
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

        <div className="ef-v3-badge">
          <Shirt size={13} />
          Template 01 · Fitted Tunic
        </div>

        <div className="ef-v3-choice">
          {(
            [
              'ranger',
              'traveler',
              'acolyte',
            ] as const
          ).map((preset) => (
            <button
              key={preset}
              onClick={() => {
                onChange(
                  applyEquipmentForgeV3StylePreset(
                    recipe,
                    preset,
                  ),
                )
                onStatus?.(
                  `Applied V3 ${capitalize(preset)} tunic preset.`,
                )
              }}
            >
              {capitalize(preset)}
            </button>
          ))}
        </div>
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Fit
        </div>
        <V3Range
          label="Length"
          value={recipe.length}
          min={.72}
          max={1.28}
          step={.01}
          onChange={(value) =>
            patch('length', value)
          }
        />
        <V3Range
          label="Looseness"
          value={recipe.looseness}
          min={0}
          max={.55}
          step={.01}
          onChange={(value) =>
            patch('looseness', value)
          }
        />
        <V3Range
          label="Waist taper"
          value={recipe.waistTaper}
          min={0}
          max={.65}
          step={.01}
          onChange={(value) =>
            patch('waistTaper', value)
          }
        />
        <V3Range
          label="Hem flare"
          value={recipe.hemFlare ?? .14}
          min={0}
          max={.5}
          step={.01}
          onChange={(value) =>
            patch('hemFlare', value)
          }
        />
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Cut
        </div>
        <div className="ef-v3-choice">
          {(
            [
              'high',
              'round',
              'scoop',
            ] as const
          ).map((value) => (
            <button
              key={value}
              className={
                recipe.neckline === value
                  ? 'active'
                  : ''
              }
              onClick={() =>
                patch('neckline', value)
              }
            >
              {capitalize(value)}
            </button>
          ))}
        </div>
        <div className="ef-v3-choice">
          {(
            [
              'none',
              'short',
              'long',
            ] as const
          ).map((value) => (
            <button
              key={value}
              className={
                recipe.sleeve === value
                  ? 'active'
                  : ''
              }
              onClick={() =>
                patch('sleeve', value)
              }
            >
              {capitalize(value)}
            </button>
          ))}
        </div>
      </section>

      <section className="ef-inspector-block">
        <div className="ef-section-title">
          Materials
        </div>
        <V3Color
          label="Cloth"
          value={recipe.materials.cloth}
          onChange={(value) =>
            patchMaterial(
              'cloth',
              value,
            )
          }
        />
        <V3Color
          label="Trim"
          value={recipe.materials.trim}
          onChange={(value) =>
            patchMaterial(
              'trim',
              value,
            )
          }
        />
      </section>

      <section className="ef-inspector-block">
        <button
          className="ef-primary-action"
          onClick={() => {
            onChange(
              createEquipmentForgeV3Recipe(
                recipe.bodyType,
              ),
            )
            onStatus?.(
              'V3 fitted tunic reset to its clean template defaults.',
            )
          }}
        >
          <RefreshCcw size={14} />
          Reset V3 template
        </button>
      </section>
    </>
  )
}

function V3Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
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

function V3Color({
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

function capitalize(value: string) {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  )
}
