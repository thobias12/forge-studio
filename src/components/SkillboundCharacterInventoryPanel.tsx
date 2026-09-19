import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
import { createPortal } from 'react-dom'
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
  inventoryFootprintCells,
  itemInventoryFootprint,
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

type DragSource =
  | {
      kind: 'bag'
      index: number
      item: ForgeItemDefinition
      grabX: number
      grabY: number
    }
  | {
      kind: 'equipment'
      index: number
      slot: ForgeEquipmentSlot
      item: ForgeItemDefinition
      grabX: 0
      grabY: 0
    }

type TooltipAnchor = {
  left: number
  right: number
  top: number
  bottom: number
}

type TooltipState = {
  item: ForgeItemDefinition
  index?: number
  anchor: TooltipAnchor
  equippedSlot?: ForgeEquipmentSlot
}

type PackDropPreview = {
  cell: number
  valid: boolean
  footprint: {
    width: number
    height: number
  }
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
  const equippedInventoryIndexes = useMemo(() => {
    const used = new Set<number>()
    const inventory = snapshot?.inventory ?? []
    for (const slot of FORGE_EQUIPMENT_SLOTS) {
      const itemId = equipment[slot]
      if (!itemId) continue
      const index = inventory.findIndex(
        (candidate, candidateIndex) =>
          candidate === itemId &&
          !used.has(candidateIndex),
      )
      if (index >= 0) used.add(index)
    }
    return used
  }, [equipment, snapshot?.inventory])
  const bagInventory = useMemo(
    () =>
      (snapshot?.inventory ?? []).map(
        (itemId, index) =>
          equippedInventoryIndexes.has(index)
            ? `__equipped__:${index}:${itemId}`
            : itemId,
      ),
    [snapshot?.inventory, equippedInventoryIndexes],
  )
  const layout = useMemo(
    () => normalizeUiScreens(workspace.ui.screens).inventory,
    [workspace.ui.screens],
  )
  const packed = useMemo(
    () =>
      resolveInventoryPack(
        gameplay,
        bagInventory,
        snapshot?.inventoryLayout,
      ),
    [
      gameplay,
      bagInventory,
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
  const [dragSource, setDragSource] =
    useState<DragSource>()
  const [dropPreview, setDropPreview] =
    useState<PackDropPreview>()

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

  useEffect(() => {
    const closeTooltip = () =>
      setTooltip(undefined)
    const clearDrag = () => {
      setDragSource(undefined)
      setDropPreview(undefined)
    }
    window.addEventListener(
      'resize',
      closeTooltip,
    )
    window.addEventListener(
      'scroll',
      closeTooltip,
      true,
    )
    window.addEventListener('blur', clearDrag)
    return () => {
      window.removeEventListener(
        'resize',
        closeTooltip,
      )
      window.removeEventListener(
        'scroll',
        closeTooltip,
        true,
      )
      window.removeEventListener(
        'blur',
        clearDrag,
      )
    }
  }, [])

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
    setTooltip({
      item,
      index,
      equippedSlot,
      anchor: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
    })
  }

  const resolvePackDrop = (
    pack: HTMLDivElement,
    clientX: number,
    clientY: number,
  ): PackDropPreview | undefined => {
    if (!dragSource) return undefined

    const cells = pack.querySelectorAll<HTMLElement>(
      '.skillbound-pack-cell',
    )
    const first = cells[0]?.getBoundingClientRect()
    const second =
      cells[1]?.getBoundingClientRect()
    const nextRow =
      cells[
        SKILLBOUND_PACK_COLUMNS
      ]?.getBoundingClientRect()
    if (!first) return undefined

    const pitchX =
      second && second.left > first.left
        ? second.left - first.left
        : first.width
    const pitchY =
      nextRow && nextRow.top > first.top
        ? nextRow.top - first.top
        : first.height

    const column =
      Math.floor(
        (clientX - first.left) /
          Math.max(1, pitchX),
      ) - dragSource.grabX
    const row =
      Math.floor(
        (clientY - first.top) /
          Math.max(1, pitchY),
      ) - dragSource.grabY

    if (
      column < 0 ||
      row < 0 ||
      column >= SKILLBOUND_PACK_COLUMNS ||
      row >= SKILLBOUND_PACK_ROWS
    ) {
      return undefined
    }

    const cell =
      row * SKILLBOUND_PACK_COLUMNS + column
    const footprint =
      itemInventoryFootprint(dragSource.item)
    const targetCells = inventoryFootprintCells(
      footprint,
      cell,
    )
    if (!targetCells) return undefined

    const occupied = new Set<number>()
    for (const entry of packed.entries) {
      if (
        entry.index === dragSource.index ||
        entry.cell === undefined ||
        entry.overflow
      ) {
        continue
      }
      inventoryFootprintCells(
        entry.footprint,
        entry.cell,
      )?.forEach((value) => occupied.add(value))
    }

    return {
      cell,
      footprint,
      valid: targetCells.every(
        (value) => !occupied.has(value),
      ),
    }
  }

  const updateDropPreview = (
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!dragSource) return
    const next = resolvePackDrop(
      event.currentTarget,
      event.clientX,
      event.clientY,
    )
    setDropPreview((current) => {
      if (
        current?.cell === next?.cell &&
        current?.valid === next?.valid &&
        current?.footprint.width ===
          next?.footprint.width &&
        current?.footprint.height ===
          next?.footprint.height
      ) {
        return current
      }
      return next
    })
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        next?.valid ? 'move' : 'none'
    }
    if (next?.valid) event.preventDefault()
  }

  const placeDraggedItem = (
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    if (!dragSource) return
    const next = resolvePackDrop(
      event.currentTarget,
      event.clientX,
      event.clientY,
    )
    if (!next?.valid) {
      setDropPreview(undefined)
      return
    }

    event.preventDefault()
    let moved = false
    if (dragSource.kind === 'equipment') {
      const unequipped =
        unequipActiveSkillboundSlot(
          dragSource.slot,
        )
      if (unequipped) {
        moved = moveActiveSkillboundInventoryItem(
          dragSource.index,
          next.cell,
        )
        if (!moved) {
          equipActiveSkillboundItem(
            dragSource.item.id,
          )
        }
      }
    } else {
      moved = moveActiveSkillboundInventoryItem(
        dragSource.index,
        next.cell,
      )
    }

    setTooltip(undefined)
    setDropPreview(undefined)
    setDragSource(undefined)
  }

  const endItemDrag = () => {
    setDragSource(undefined)
    setDropPreview(undefined)
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
                  paperDoll
                  config={config}
                  animation="Idle"
                  playing={false}
                  showRig={false}
                  showHitbox={false}
                  cameraMode="studio"
                  bodyAsset={bodyAsset}
                  equipmentItems={Object.fromEntries(
                    FORGE_EQUIPMENT_SLOTS.map(
                      (slot) => [
                        slot,
                        equipmentItem(
                          gameplay,
                          equipment,
                          slot,
                        ),
                      ],
                    ).filter(
                      (
                        entry,
                      ): entry is [
                        ForgeEquipmentSlot,
                        ForgeItemDefinition,
                      ] => Boolean(entry[1]),
                    ),
                  )}
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
                const itemIndex = item
                  ? findEquippedInventoryIndex(
                      snapshot?.inventory ?? [],
                      equipment,
                      slot,
                    )
                  : undefined
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
                    onDismiss={() =>
                      setTooltip(undefined)
                    }
                    onUnequip={() =>
                      unequipActiveSkillboundSlot(slot)
                    }
                    onDropBagItem={(index) => {
                      const itemId =
                        snapshot?.inventory[index]
                      const candidate = itemId
                        ? gameplay.items.find(
                            (entry) =>
                              entry.id === itemId,
                          )
                        : undefined
                      if (
                        !candidate ||
                        itemEquipmentSlot(candidate) !==
                          slot
                      ) {
                        return
                      }
                      equipActiveSkillboundItem(
                        candidate.id,
                      )
                    }}
                    onDragStart={
                      itemIndex === undefined ||
                      !item
                        ? undefined
                        : () => {
                            setTooltip(undefined)
                            setDropPreview(undefined)
                            setDragSource({
                              kind: 'equipment',
                              index: itemIndex,
                              slot,
                              item,
                              grabX: 0,
                              grabY: 0,
                            })
                          }
                    }
                    onDragEnd={endItemDrag}
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
              className={`skillbound-tetris-pack${dragSource ? ' is-item-dragging' : ''}`}
              onDragEnter={updateDropPreview}
              onDragOver={updateDropPreview}
              onDragLeave={(event) => {
                const next =
                  event.relatedTarget
                if (
                  !(next instanceof Node) ||
                  !event.currentTarget.contains(next)
                ) {
                  setDropPreview(undefined)
                }
              }}
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

              {dropPreview && (
                <i
                  className={`skillbound-pack-placement${dropPreview.valid ? '' : ' is-invalid'}`}
                  style={{
                    gridColumn: `${(dropPreview.cell % SKILLBOUND_PACK_COLUMNS) + 1} / span ${dropPreview.footprint.width}`,
                    gridRow: `${Math.floor(dropPreview.cell / SKILLBOUND_PACK_COLUMNS) + 1} / span ${dropPreview.footprint.height}`,
                  }}
                />
              )}

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
                    onDismiss={() =>
                      setTooltip(undefined)
                    }
                    onQuickToggle={() =>
                      quickToggleItem(entry.item)
                    }
                    onDragStart={(
                      grabX,
                      grabY,
                    ) => {
                      setTooltip(undefined)
                      setDropPreview(undefined)
                      setDragSource({
                        kind: 'bag',
                        index: entry.index,
                        item: entry.item,
                        grabX,
                        grabY,
                      })
                    }}
                    onDragEnd={endItemDrag}
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

      {tooltip &&
        createPortal(
          <ItemTooltip
            key={`${tooltip.item.id}:${tooltip.index ?? tooltip.equippedSlot ?? ''}`}
            state={tooltip}
            gameplay={gameplay}
            equipment={equipment}
          />,
          document.querySelector(
            '.skillbound-game-menu-layer',
          ) ?? document.body,
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
  onDismiss,
  onUnequip,
  onDropBagItem,
  onDragStart,
  onDragEnd,
}: {
  slot: ForgeEquipmentSlot
  item?: ForgeItemDefinition
  onInspect: (
    item: ForgeItemDefinition,
    target: HTMLElement,
  ) => void
  onDismiss: () => void
  onUnequip: () => void
  onDropBagItem: (index: number) => void
  onDragStart?: () => void
  onDragEnd: () => void
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
      draggable={Boolean(item && onDragStart)}
      className={`skillbound-equipment-slot slot-${slot.toLowerCase()} ${item ? 'filled' : ''}`}
      disabled={!item}
      onMouseEnter={(event) => {
        if (item)
          onInspect(item, event.currentTarget)
      }}
      onMouseLeave={onDismiss}
      onFocus={(event) => {
        if (item)
          onInspect(item, event.currentTarget)
      }}
      onBlur={onDismiss}
      onDoubleClick={() => item && onUnequip()}
      onDragOver={(event) => {
        if (!item) event.preventDefault()
        else event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const raw =
          event.dataTransfer.getData('text/plain')
        const index = Number(raw)
        if (Number.isInteger(index)) {
          onDropBagItem(index)
        }
      }}
      onDragStart={(event) => {
        if (!item || !onDragStart) {
          event.preventDefault()
          return
        }
        event.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
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
  onDismiss,
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
  onDismiss: () => void
  onQuickToggle: () => void
  onDragStart: (
    grabX: number,
    grabY: number,
  ) => void
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
      onMouseLeave={onDismiss}
      onFocus={(
        event: ReactFocusEvent<HTMLButtonElement>,
      ) =>
        onInspect(
          entry.item,
          event.currentTarget,
        )
      }
      onBlur={onDismiss}
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
        const bounds =
          event.currentTarget.getBoundingClientRect()
        const cellWidth =
          bounds.width /
          Math.max(1, entry.footprint.width)
        const cellHeight =
          bounds.height /
          Math.max(1, entry.footprint.height)
        const grabX = Math.min(
          entry.footprint.width - 1,
          Math.max(
            0,
            Math.floor(
              (event.clientX - bounds.left) /
                Math.max(1, cellWidth),
            ),
          ),
        )
        const grabY = Math.min(
          entry.footprint.height - 1,
          Math.max(
            0,
            Math.floor(
              (event.clientY - bounds.top) /
                Math.max(1, cellHeight),
            ),
          ),
        )
        onDragStart(grabX, grabY)
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
}: {
  state: TooltipState
  gameplay: ReturnType<typeof resolveGameplayForRole>
  equipment: ForgeEquipmentState
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    left: number
    top: number
  }>()

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

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const rect = host.getBoundingClientRect()
    const viewportWidth =
      document.documentElement.clientWidth
    const viewportHeight =
      document.documentElement.clientHeight
    const margin = 12
    const gap = 10
    const maxLeft = Math.max(
      margin,
      viewportWidth - rect.width - margin,
    )
    const maxTop = Math.max(
      margin,
      viewportHeight - rect.height - margin,
    )

    const right =
      state.anchor.right + gap
    const left =
      state.anchor.left - gap - rect.width
    const fitsRight =
      right + rect.width <=
      viewportWidth - margin
    const fitsLeft = left >= margin

    let nextLeft = fitsRight
      ? right
      : fitsLeft
        ? left
        : viewportWidth -
              state.anchor.right >=
            state.anchor.left
          ? right
          : left
    nextLeft = Math.min(
      maxLeft,
      Math.max(margin, nextLeft),
    )

    let nextTop = Math.min(
      maxTop,
      Math.max(margin, state.anchor.top),
    )

    const overlapsAnchor =
      nextLeft < state.anchor.right &&
      nextLeft + rect.width >
        state.anchor.left
    if (overlapsAnchor) {
      const below = state.anchor.bottom + gap
      const above =
        state.anchor.top - gap - rect.height
      if (
        below + rect.height <=
        viewportHeight - margin
      ) {
        nextTop = below
      } else if (above >= margin) {
        nextTop = above
      }
    }

    setPosition({
      left: nextLeft,
      top: nextTop,
    })
  }, [
    state.item.id,
    state.index,
    state.equippedSlot,
    state.anchor.left,
    state.anchor.right,
    state.anchor.top,
    state.anchor.bottom,
    equipped?.id,
  ])

  return (
    <div
      ref={hostRef}
      className="skillbound-item-tooltip-stack"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position
          ? 'visible'
          : 'hidden',
      }}
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

function findEquippedInventoryIndex(
  inventory: string[],
  equipment: ForgeEquipmentState,
  targetSlot: ForgeEquipmentSlot,
) {
  const used = new Set<number>()
  for (const slot of FORGE_EQUIPMENT_SLOTS) {
    const itemId = equipment[slot]
    if (!itemId) continue
    const index = inventory.findIndex(
      (candidate, candidateIndex) =>
        candidate === itemId &&
        !used.has(candidateIndex),
    )
    if (index < 0) continue
    used.add(index)
    if (slot === targetSlot) return index
  }
  return undefined
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
