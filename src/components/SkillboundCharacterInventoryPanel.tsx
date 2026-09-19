import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Backpack,
  Coins,
  Filter,
  Shield,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import CharacterForgePreview from './CharacterForgePreview'
import {
  FORGE_EQUIPMENT_SLOTS,
  compareEquipmentChange,
  equipmentGearPower,
  equipmentItem,
  equipmentSlotLabel,
  equipmentStats,
  isItemEquipped,
  itemDefenseBonus,
  itemEquipmentSlot,
  normalizeEquipment,
  type ForgeEquipmentSlot,
  type ForgeEquipmentState,
} from '../engine/equipment'
import {
  resolveInventoryPack,
  SKILLBOUND_PACK_CELLS,
  SKILLBOUND_PACK_COLUMNS,
  SKILLBOUND_PACK_ROWS,
  type ForgeInventoryPackEntry,
  type ForgeInventoryPackLayout,
  type ForgeInventorySortMode,
} from '../engine/inventoryPack'
import { itemVisual } from '../engine/itemPresentation'
import { itemClassification } from '../engine/itemTaxonomy'
import { blueprintToConfig } from '../engine/characterBlueprint'
import { archetypeLabel, resolveGameplayForRole } from '../engine/playerLoadout'
import type {
  ForgeItemDefinition,
  ForgeProjectWorkspace,
} from '../engine/forgeProject'
import type { ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import {
  equipActiveSkillboundItem,
  equipBestActiveSkillboundGear,
  moveActiveSkillboundInventoryItem,
  sortActiveSkillboundInventory,
  unequipActiveSkillboundSlot,
} from '../engine/runtime/SkillboundRuntimeBridge'
import type { SkillboundPlayerProfile } from '../engine/playerProfiles'
import {
  gridPlacementStyle,
  normalizeUiScreens,
  type UiScreenElement,
} from '../lib/uiScreenForge'
import { getAsset, type LibraryAsset } from '../lib/library'
import '../skillbound-character-inventory.css'

type RuntimeSnapshot = ForgeRuntimeSnapshot & {
  equipment?: ForgeEquipmentState
  defense?: number
  attackBonus?: number
  gold?: number
  xp?: number
  level?: number
  xpToNext?: number
  inventoryLayout?: ForgeInventoryPackLayout
}

type Props = {
  profile: SkillboundPlayerProfile
  snapshot?: RuntimeSnapshot
  workspace: ForgeProjectWorkspace
  onClose: () => void
}

type TypeFilter = 'weapons' | 'armor' | 'offhand' | 'other'
type RarityFilter = ForgeItemDefinition['rarity']

type TooltipState = {
  item: ForgeItemDefinition
  index?: number
  x: number
  y: number
  equippedSlot?: ForgeEquipmentSlot
}

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'offhand', label: 'Off-hand' },
  { id: 'other', label: 'Other' },
]

const RARITY_FILTERS: Array<{
  id: RarityFilter
  label: string
}> = [
  { id: 'common', label: 'Common' },
  { id: 'magic', label: 'Magic' },
  { id: 'rare', label: 'Rare' },
]

export default function SkillboundCharacterInventoryPanel({
  profile,
  snapshot,
  workspace,
  onClose,
}: Props) {
  const gameplay = useMemo(
    () =>
      resolveGameplayForRole(
        workspace.gameplay,
        profile.blueprint.role,
      ),
    [workspace.gameplay, profile.blueprint.role],
  )
  const equipment = normalizeEquipment(
    snapshot?.equipment,
    snapshot?.equippedWeaponId,
  )
  const stats = equipmentStats(gameplay, equipment)
  const layout = useMemo(
    () => normalizeUiScreens(workspace.ui.screens).inventory,
    [workspace.ui.screens],
  )
  const packed = useMemo(
    () =>
      resolveInventoryPack(
        gameplay,
        snapshot?.inventory ?? [],
        snapshot?.inventoryLayout,
      ),
    [
      gameplay,
      snapshot?.inventory,
      snapshot?.inventoryLayout,
    ],
  )
  const [bodyAsset, setBodyAsset] =
    useState<LibraryAsset>()
  const [showTools, setShowTools] = useState(false)
  const [types, setTypes] = useState<Set<TypeFilter>>(
    () => new Set(),
  )
  const [rarities, setRarities] =
    useState<Set<RarityFilter>>(() => new Set())
  const [tooltip, setTooltip] =
    useState<TooltipState>()
  const [dragIndex, setDragIndex] =
    useState<number>()

  useEffect(() => {
    let cancelled = false
    const assetId =
      profile.blueprint.foundation?.bodyAssetId
    if (!assetId) {
      setBodyAsset(undefined)
      return () => {
        cancelled = true
      }
    }
    void getAsset(assetId)
      .then((asset) => {
        if (!cancelled) setBodyAsset(asset)
      })
      .catch(() => {
        if (!cancelled) setBodyAsset(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [profile.blueprint.foundation?.bodyAssetId])

  const visibleElements = new Map(
    layout.elements
      .filter((element) => element.visible)
      .map((element) => [element.id, element]),
  )

  const config = useMemo(
    () => blueprintToConfig(profile.blueprint),
    [profile.blueprint],
  )
  const primary = gameplay.abilities.find(
    (ability) =>
      ability.id === gameplay.player.basicAbility,
  )
  const active = gameplay.abilities.find(
    (ability) =>
      ability.id === gameplay.player.activeAbilities[0],
  )
  const totalAttack = Math.round(
    (primary?.damage ?? 0) +
      (snapshot?.attackBonus ?? stats.damageBonus),
  )
  const xpPercent = Math.max(
    0,
    Math.min(
      100,
      ((snapshot?.xp ?? 0) /
        Math.max(1, snapshot?.xpToNext ?? 100)) *
        100,
    ),
  )

  const toggleType = (value: TypeFilter) => {
    setTypes((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }
  const toggleRarity = (value: RarityFilter) => {
    setRarities((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const filtered = (item: ForgeItemDefinition) => {
    if (
      types.size &&
      !types.has(inventoryTypeFilter(item))
    ) {
      return false
    }
    if (
      rarities.size &&
      !rarities.has(item.rarity)
    ) {
      return false
    }
    return true
  }

  const quickToggleItem = (
    item: ForgeItemDefinition,
  ) => {
    const slot = itemEquipmentSlot(item)
    if (!slot) return
    if (isItemEquipped(equipment, item.id)) {
      unequipActiveSkillboundSlot(slot)
    } else {
      equipActiveSkillboundItem(item.id)
    }
  }

  const showItemTooltip = (
    item: ForgeItemDefinition,
    target: HTMLElement,
    index?: number,
    equippedSlot?: ForgeEquipmentSlot,
  ) => {
    const rect = target.getBoundingClientRect()
    const x = Math.min(
      rect.right + 10,
      window.innerWidth - 570,
    )
    const y = Math.max(
      12,
      Math.min(rect.top, window.innerHeight - 430),
    )
    setTooltip({
      item,
      index,
      equippedSlot,
      x,
      y,
    })
  }

  const placeDraggedItem = (
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (dragIndex === undefined) return
    event.preventDefault()
    const bounds =
      event.currentTarget.getBoundingClientRect()
    const x = Math.max(
      0,
      Math.min(
        bounds.width - 1,
        event.clientX - bounds.left,
      ),
    )
    const y = Math.max(
      0,
      Math.min(
        bounds.height - 1,
        event.clientY - bounds.top,
      ),
    )
    const column = Math.min(
      SKILLBOUND_PACK_COLUMNS - 1,
      Math.floor(
        (x / bounds.width) *
          SKILLBOUND_PACK_COLUMNS,
      ),
    )
    const row = Math.min(
      SKILLBOUND_PACK_ROWS - 1,
      Math.floor(
        (y / bounds.height) *
          SKILLBOUND_PACK_ROWS,
      ),
    )
    const cell =
      row * SKILLBOUND_PACK_COLUMNS + column
    moveActiveSkillboundInventoryItem(
      dragIndex,
      cell,
    )
    setDragIndex(undefined)
  }

  return (
    <section
      className="skillbound-character-window"
      style={
        {
          '--pack-columns':
            SKILLBOUND_PACK_COLUMNS,
          '--pack-rows':
            SKILLBOUND_PACK_ROWS,
        } as CSSProperties
      }
    >
      <div
        className="skillbound-character-grid"
        style={{
          gridTemplateColumns: `repeat(${layout.grid.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.grid.rows}, minmax(0, 1fr))`,
          gap: `${layout.grid.gap}%`,
          padding: `${layout.grid.margin}%`,
        }}
      >
        {visibleElements.get('title') && (
          <CharacterHeader
            element={visibleElements.get('title')!}
            profile={profile}
            gold={snapshot?.gold ?? 0}
            showTools={showTools}
            onToggleTools={() =>
              setShowTools((value) => !value)
            }
            onEquipBest={() =>
              equipBestActiveSkillboundGear()
            }
            onClose={onClose}
          />
        )}

        {visibleElements.get('equipment') && (
          <section
            className="skillbound-character-equipment"
            style={gridPlacementStyle(
              visibleElements.get('equipment')!
                .placement,
            )}
          >
            <div className="skillbound-section-heading">
              <span>Equipment</span>
              <em>
                {equipmentGearPower(
                  gameplay,
                  equipment,
                )}{' '}
                power
              </em>
            </div>

            <div className="skillbound-paperdoll">
              <div className="skillbound-paperdoll-model">
                <CharacterForgePreview
                  conceptMode
                  config={config}
                  animation="Idle"
                  playing={false}
                  showRig={false}
                  showHitbox={false}
                  cameraMode="studio"
                  bodyAsset={bodyAsset}
                  baseClothingVisible={
                    profile.blueprint.foundation
                      ?.baseClothingVisible ?? true
                  }
                />
              </div>
              {FORGE_EQUIPMENT_SLOTS.map((slot) => {
                const item = equipmentItem(
                  gameplay,
                  equipment,
                  slot,
                )
                return (
                  <EquipmentSlot
                    key={slot}
                    slot={slot}
                    item={item}
                    onInspect={(
                      candidate,
                      target,
                    ) =>
                      showItemTooltip(
                        candidate,
                        target,
                        undefined,
                        slot,
                      )
                    }
                    onUnequip={() =>
                      unequipActiveSkillboundSlot(slot)
                    }
                  />
                )
              })}
            </div>

            <div className="skillbound-paperdoll-metrics">
              <div>
                <span>Gear attack</span>
                <strong>{stats.damageBonus}</strong>
              </div>
              <div>
                <span>Defense</span>
                <strong>{stats.defense}</strong>
              </div>
            </div>
          </section>
        )}

        {visibleElements.get('bag') && (
          <section
            className="skillbound-character-inventory"
            style={gridPlacementStyle(
              visibleElements.get('bag')!.placement,
            )}
          >
            <div className="skillbound-section-heading inventory-heading">
              <div>
                <Backpack size={15}/>
                <span>Inventory</span>
              </div>
              <small>
                {packed.entries.length} items
              </small>
            </div>

            {showTools && (
              <div className="skillbound-pack-tools">
                <div className="skillbound-pack-sort">
                  <button
                    onClick={() =>
                      sortActiveSkillboundInventory(
                        'compact',
                      )
                    }
                  >
                    Auto-sort
                  </button>
                  {(
                    [
                      'type',
                      'rarity',
                      'recent',
                    ] as ForgeInventorySortMode[]
                  ).map((mode) => (
                    <button
                      key={mode}
                      onClick={() =>
                        sortActiveSkillboundInventory(
                          mode,
                        )
                      }
                    >
                      {mode[0].toUpperCase() +
                        mode.slice(1)}
                    </button>
                  ))}
                </div>

                <fieldset>
                  <legend>Type</legend>
                  <button
                    className={
                      types.size ? '' : 'active'
                    }
                    onClick={() =>
                      setTypes(new Set())
                    }
                  >
                    All
                  </button>
                  {TYPE_FILTERS.map((entry) => (
                    <button
                      key={entry.id}
                      className={
                        types.has(entry.id)
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        toggleType(entry.id)
                      }
                    >
                      {entry.label}
                    </button>
                  ))}
                </fieldset>

                <fieldset>
                  <legend>Rarity</legend>
                  <button
                    className={
                      rarities.size ? '' : 'active'
                    }
                    onClick={() =>
                      setRarities(new Set())
                    }
                  >
                    All
                  </button>
                  {RARITY_FILTERS.map((entry) => (
                    <button
                      key={entry.id}
                      className={`${rarities.has(entry.id) ? 'active' : ''} rarity-${entry.id}`}
                      onClick={() =>
                        toggleRarity(entry.id)
                      }
                    >
                      {entry.label}
                    </button>
                  ))}
                </fieldset>
              </div>
            )}

            <div
              className="skillbound-tetris-pack"
              onDragOver={(event) =>
                event.preventDefault()
              }
              onDrop={placeDraggedItem}
            >
              {Array.from({
                length: SKILLBOUND_PACK_CELLS,
              }).map((_, cell) => (
                <i
                  className="skillbound-pack-cell"
                  key={cell}
                  style={{
                    gridColumn:
                      (cell %
                        SKILLBOUND_PACK_COLUMNS) +
                      1,
                    gridRow:
                      Math.floor(
                        cell /
                          SKILLBOUND_PACK_COLUMNS,
                      ) + 1,
                  }}
                />
              ))}

              {packed.entries
                .filter(
                  (
                    entry,
                  ): entry is ForgeInventoryPackEntry & {
                    cell: number
                  } =>
                    entry.cell !== undefined &&
                    !entry.overflow,
                )
                .map((entry) => (
                  <PackItem
                    key={entry.index}
                    entry={entry}
                    dimmed={!filtered(entry.item)}
                    equipped={isItemEquipped(
                      equipment,
                      entry.item.id,
                    )}
                    onInspect={(
                      item,
                      target,
                    ) =>
                      showItemTooltip(
                        item,
                        target,
                        entry.index,
                      )
                    }
                    onQuickToggle={() =>
                      quickToggleItem(entry.item)
                    }
                    onDragStart={() =>
                      setDragIndex(entry.index)
                    }
                    onDragEnd={() =>
                      setDragIndex(undefined)
                    }
                  />
                ))}
            </div>

            {!!packed.overflow.length && (
              <div className="skillbound-pack-overflow">
                <span>Pack overflow</span>
                <small>
                  Make room and auto-sort these items.
                </small>
                <div>
                  {packed.overflow.map((entry) => (
                    <button
                      key={entry.index}
                      onMouseEnter={(event) =>
                        showItemTooltip(
                          entry.item,
                          event.currentTarget,
                          entry.index,
                        )
                      }
                      onMouseLeave={() =>
                        setTooltip(undefined)
                      }
                      onDoubleClick={() =>
                        quickToggleItem(entry.item)
                      }
                    >
                      <RuntimeItemIcon
                        item={entry.item}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {visibleElements.get('stats') && (
          <section
            className="skillbound-character-stats-panel"
            style={gridPlacementStyle(
              visibleElements.get('stats')!.placement,
            )}
          >
            <div className="skillbound-section-heading">
              <span>Character</span>
              <em>
                Level {snapshot?.level ?? 1}
              </em>
            </div>

            <div className="skillbound-character-identity">
              <strong>{profile.name}</strong>
              <small>
                {archetypeLabel(
                  profile.blueprint.role,
                )}
                {' · '}
                {profile.blueprint.combat.weaponProfile.replaceAll(
                  '-',
                  ' ',
                )}
              </small>
            </div>

            <dl className="skillbound-character-stat-list">
              <StatRow
                label="Primary attack"
                value={totalAttack}
              />
              <StatRow
                label="Gear attack"
                value={stats.damageBonus}
              />
              <StatRow
                label="Defense"
                value={
                  snapshot?.defense ??
                  stats.defense
                }
              />
              <StatRow
                label="Health"
                value={`${Math.ceil(
                  snapshot?.health ??
                    gameplay.player.maxHealth,
                )} / ${snapshot?.maxHealth ?? gameplay.player.maxHealth}`}
              />
              <StatRow
                label="Skill power"
                value={Math.round(
                  active?.damage ?? 0,
                )}
              />
              <StatRow
                label="Move speed"
                value={gameplay.player.moveSpeed.toFixed(
                  1,
                )}
              />
              <StatRow
                label="Dodge"
                value={`${gameplay.player.dodgeDistance.toFixed(1)}m / ${gameplay.player.dodgeCooldown.toFixed(2)}s`}
              />
              <StatRow
                label="Gear power"
                value={equipmentGearPower(
                  gameplay,
                  equipment,
                )}
              />
            </dl>
          </section>
        )}

        {visibleElements.get('footer') && (
          <footer
            className="skillbound-character-footer"
            style={gridPlacementStyle(
              visibleElements.get('footer')!
                .placement,
            )}
          >
            <div>
              <span>Experience</span>
              <em>
                {snapshot?.xp ?? 0} /{' '}
                {snapshot?.xpToNext ?? 100}
              </em>
            </div>
            <i>
              <b
                style={{
                  width: `${xpPercent}%`,
                }}
              />
            </i>
            <small>
              C / I Character · Shift-click or
              double-click equip · drag items to
              arrange pack · Esc close
            </small>
          </footer>
        )}
      </div>

      {tooltip && (
        <ItemTooltip
          state={tooltip}
          gameplay={gameplay}
          equipment={equipment}
          onClose={() => setTooltip(undefined)}
        />
      )}
    </section>
  )
}

function CharacterHeader({
  element,
  profile,
  gold,
  showTools,
  onToggleTools,
  onEquipBest,
  onClose,
}: {
  element: UiScreenElement
  profile: SkillboundPlayerProfile
  gold: number
  showTools: boolean
  onToggleTools: () => void
  onEquipBest: () => void
  onClose: () => void
}) {
  return (
    <header
      className="skillbound-character-header"
      style={gridPlacementStyle(element.placement)}
    >
      <div>
        <span>CHARACTER</span>
        <strong>{profile.name}</strong>
      </div>
      <div className="skillbound-character-header-actions">
        <button
          className={showTools ? 'active' : ''}
          onClick={onToggleTools}
          title="Sort & filter"
        >
          <Filter size={15}/>
          <span>Sort & Filter</span>
        </button>
        <button
          onClick={onEquipBest}
          title="Equip Best"
        >
          <WandSparkles size={15}/>
          <span>Equip Best</span>
        </button>
        <div className="skillbound-character-gold">
          <Coins size={14}/>
          <strong>{gold.toLocaleString()}</strong>
        </div>
        <button
          className="close"
          onClick={onClose}
          aria-label="Close character window"
        >
          <X size={16}/>
        </button>
      </div>
    </header>
  )
}

function EquipmentSlot({
  slot,
  item,
  onInspect,
  onUnequip,
}: {
  slot: ForgeEquipmentSlot
  item?: ForgeItemDefinition
  onInspect: (
    item: ForgeItemDefinition,
    target: HTMLElement,
  ) => void
  onUnequip: () => void
}) {
  const handleKey = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (
      !item ||
      (event.key !== 'Enter' &&
        event.key !== ' ')
    ) {
      return
    }
    event.preventDefault()
    onUnequip()
  }

  return (
    <button
      type="button"
      className={`skillbound-equipment-slot slot-${slot.toLowerCase()} ${item ? 'filled' : ''}`}
      disabled={!item}
      onMouseEnter={(event) => {
        if (item)
          onInspect(item, event.currentTarget)
      }}
      onMouseLeave={() => undefined}
      onFocus={(event) => {
        if (item)
          onInspect(item, event.currentTarget)
      }}
      onDoubleClick={() => item && onUnequip()}
      onClick={(event) => {
        if (item && event.shiftKey) onUnequip()
      }}
      onKeyDown={handleKey}
      aria-label={
        item
          ? `${equipmentSlotLabel(slot)}: ${item.name}`
          : `${equipmentSlotLabel(slot)}: empty`
      }
    >
      <small>{equipmentSlotLabel(slot)}</small>
      {item ? (
        <RuntimeItemIcon item={item}/>
      ) : (
        <i/>
      )}
    </button>
  )
}

function PackItem({
  entry,
  dimmed,
  equipped,
  onInspect,
  onQuickToggle,
  onDragStart,
  onDragEnd,
}: {
  entry: ForgeInventoryPackEntry & {
    cell: number
  }
  dimmed: boolean
  equipped: boolean
  onInspect: (
    item: ForgeItemDefinition,
    target: HTMLElement,
  ) => void
  onQuickToggle: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const row = Math.floor(
    entry.cell / SKILLBOUND_PACK_COLUMNS,
  )
  const column =
    entry.cell % SKILLBOUND_PACK_COLUMNS

  const activate = (
    event:
      | ReactMouseEvent<HTMLButtonElement>
      | ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if ('shiftKey' in event && event.shiftKey) {
      event.preventDefault()
      onQuickToggle()
    }
  }

  return (
    <button
      type="button"
      draggable
      className={`skillbound-pack-item rarity-${entry.item.rarity} ${dimmed ? 'filtered-out' : ''} ${equipped ? 'equipped' : ''}`}
      style={{
        gridColumn: `${column + 1} / span ${entry.footprint.width}`,
        gridRow: `${row + 1} / span ${entry.footprint.height}`,
      }}
      onMouseEnter={(event) =>
        onInspect(
          entry.item,
          event.currentTarget,
        )
      }
      onFocus={(
        event: ReactFocusEvent<HTMLButtonElement>,
      ) =>
        onInspect(
          entry.item,
          event.currentTarget,
        )
      }
      onClick={activate}
      onDoubleClick={onQuickToggle}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault()
          onQuickToggle()
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(
          'text/plain',
          String(entry.index),
        )
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      aria-label={entry.item.name}
    >
      <RuntimeItemIcon item={entry.item}/>
      {equipped && <em>Equipped</em>}
    </button>
  )
}

function ItemTooltip({
  state,
  gameplay,
  equipment,
  onClose,
}: {
  state: TooltipState
  gameplay: ReturnType<typeof resolveGameplayForRole>
  equipment: ForgeEquipmentState
  onClose: () => void
}) {
  const slot =
    state.equippedSlot ??
    itemEquipmentSlot(state.item)
  const equipped =
    slot
      ? equipmentItem(
          gameplay,
          equipment,
          slot,
        )
      : undefined
  const isEquipped = isItemEquipped(
    equipment,
    state.item.id,
  )
  const comparison =
    slot && !isEquipped
      ? compareEquipmentChange(
          gameplay,
          equipment,
          state.item,
        )
      : undefined

  return (
    <div
      className="skillbound-item-tooltip-stack"
      style={{
        left: state.x,
        top: state.y,
      }}
      onMouseLeave={onClose}
    >
      {equipped &&
        equipped.id !== state.item.id && (
          <TooltipCard
            item={equipped}
            label="Equipped"
          />
        )}
      <TooltipCard
        item={state.item}
        label={isEquipped ? 'Equipped' : 'Item'}
        comparison={comparison}
      />
    </div>
  )
}

function TooltipCard({
  item,
  label,
  comparison,
}: {
  item: ForgeItemDefinition
  label: string
  comparison?: ReturnType<
    typeof compareEquipmentChange
  >
}) {
  return (
    <article
      className={`skillbound-item-tooltip rarity-${item.rarity}`}
    >
      <header>
        <span>{label}</span>
        <strong>{item.name}</strong>
        <small>
          {item.rarity.toUpperCase()}
          {' · '}
          {itemEquipmentSlot(item)
            ? equipmentSlotLabel(
                itemEquipmentSlot(item)!,
              )
            : 'Item'}
        </small>
      </header>
      <div className="skillbound-tooltip-stats">
        <div>
          <span>Attack</span>
          <strong>+{item.damageBonus}</strong>
        </div>
        <div>
          <span>Defense</span>
          <strong>
            +{itemDefenseBonus(item)}
          </strong>
        </div>
      </div>
      {comparison && (
        <div className="skillbound-tooltip-comparison">
          <span>ON EQUIP</span>
          <TooltipDelta
            label="Gear attack"
            before={comparison.before.damageBonus}
            after={comparison.after.damageBonus}
          />
          <TooltipDelta
            label="Defense"
            before={comparison.before.defense}
            after={comparison.after.defense}
          />
        </div>
      )}
      <footer>
        Shift-click / double-click to{' '}
        {comparison ? 'equip' : 'unequip'}
      </footer>
    </article>
  )
}

function TooltipDelta({
  label,
  before,
  after,
}: {
  label: string
  before: number
  after: number
}) {
  const delta = after - before
  return (
    <div>
      <span>{label}</span>
      <strong>
        {before} → {after}
      </strong>
      <em
        className={
          delta > 0
            ? 'gain'
            : delta < 0
              ? 'loss'
              : 'neutral'
        }
      >
        {delta > 0 ? '+' : ''}
        {delta}
      </em>
    </div>
  )
}

function RuntimeItemIcon({
  item,
}: {
  item: ForgeItemDefinition
}) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let cancelled = false
    let url = ''
    const iconId =
      itemVisual(item).inventory.iconAssetId
    if (!iconId) {
      setSrc(undefined)
      return
    }
    void getAsset(iconId)
      .then((asset) => {
        if (!asset || cancelled) return
        url = URL.createObjectURL(asset.blob)
        setSrc(url)
      })
      .catch(() => setSrc(undefined))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [
    item.id,
    item.visual?.inventory.iconAssetId,
  ])
  return (
    <div className="skillbound-runtime-item-icon">
      {src ? (
        <img src={src} alt=""/>
      ) : (
        <i style={{ background: item.color }}/>
      )}
    </div>
  )
}

function StatRow({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function inventoryTypeFilter(
  item: ForgeItemDefinition,
): TypeFilter {
  const classification =
    itemClassification(item)
  if (classification.itemType === 'weapon') {
    return 'weapons'
  }
  if (classification.itemType === 'armor') {
    return 'armor'
  }
  if (classification.itemType === 'offhand') {
    return 'offhand'
  }
  return 'other'
}
