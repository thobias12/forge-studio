import { withGeneratedItems } from '../engine/skillboundItems'
import { resolveItemIcon } from '../engine/itemIcons'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BarChart3, Backpack, Coins, Footprints, Heart, ListFilter, Shield, Sparkles, Swords, WandSparkles, Zap } from 'lucide-react'
import CharacterForgePreview from './CharacterForgePreview'
import { blueprintToConfig } from '../engine/characterBlueprint'
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
  itemRuntimeDescription,
  normalizeEquipment,
  unequipItemFromState,
  type ForgeEquipmentSlot,
  type ForgeEquipmentState,
} from '../engine/equipment'
import { itemVisual } from '../engine/itemPresentation'
import { itemClassification } from '../engine/itemTaxonomy'
import { archetypeLabel, resolveGameplayForRole } from '../engine/playerLoadout'
import type { ForgeProjectWorkspace, ForgeItemDefinition } from '../engine/forgeProject'
import type { ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import {
  equipActiveSkillboundItem,
  equipBestActiveSkillboundGear,
  unequipActiveSkillboundSlot,
} from '../engine/runtime/SkillboundRuntimeBridge'
import type { SkillboundPlayerProfile } from '../engine/playerProfiles'
import { getAsset } from '../lib/library'
import '../skillbound-runtime-panels.css'

type RuntimeSnapshot = ForgeRuntimeSnapshot & {
  equipment?: ForgeEquipmentState
  defense?: number
  attackBonus?: number
  gold?: number
  xp?: number
  level?: number
  xpToNext?: number
}

type CommonProps = {
  profile: SkillboundPlayerProfile
  snapshot?: RuntimeSnapshot
  workspace: ForgeProjectWorkspace
}

export function SkillboundCharacterRuntimePanel({ profile, snapshot, workspace }: CommonProps) {
  const config = useMemo(() => blueprintToConfig(profile.blueprint), [profile.blueprint])
  const gameplay = useMemo(() => resolveGameplayForRole(withGeneratedItems(workspace.gameplay, snapshot?.generatedItems), profile.blueprint.role), [workspace.gameplay, profile.blueprint.role, snapshot?.generatedItems])
  const equipment = normalizeEquipment(snapshot?.equipment, snapshot?.equippedWeaponId)
  const stats = equipmentStats(gameplay, equipment)
  const primary = gameplay.abilities.find((ability) => ability.id === gameplay.player.basicAbility)
  const active = gameplay.abilities.find((ability) => ability.id === gameplay.player.activeAbilities[0])
  const attack = Math.round((primary?.damage ?? 0) + (snapshot?.attackBonus ?? stats.damageBonus))
  const defense = snapshot?.defense ?? stats.defense
  const level = snapshot?.level ?? profile.blueprint.level ?? 1

  return <div className="pause-sheet runtime-character-sheet">
    <header className="runtime-sheet-header">
      <div><span>CHARACTER</span><h2>{profile.name}</h2></div>
      <div className="runtime-currency"><Coins size={14}/><strong>{(snapshot?.gold ?? 0).toLocaleString()}</strong><small>Gold</small></div>
    </header>

    <div className="runtime-character-layout">
      <section className="runtime-character-preview">
        <CharacterForgePreview conceptMode config={config} animation="Idle" playing showRig={false} showHitbox={false} cameraMode="studio"/>
        <div className="runtime-character-caption"><span>LEVEL {level}</span><strong>{archetypeLabel(profile.blueprint.role)}</strong><small>{profile.blueprint.combat.weaponProfile.replaceAll('-', ' ')}</small></div>
      </section>

      <section className="runtime-paper-doll">
        <span className="runtime-section-label">EQUIPMENT</span>
        <div className="paper-doll-grid">
          {FORGE_EQUIPMENT_SLOTS.map((slot) => {
            const equipped = equipmentItem(gameplay, equipment, slot)
            return <div key={slot} className={`paper-doll-slot ${equipped ? 'filled' : ''}`}>
              <small>{equipmentSlotLabel(slot)}</small>
              {equipped ? <>
                <RuntimeItemIcon item={equipped}/>
                <strong>{equipped.name}</strong>
                <em>{equipped.damageBonus ? `+${equipped.damageBonus} attack` : itemDefenseBonus(equipped) ? `+${itemDefenseBonus(equipped)} defense` : 'Equipped'}</em>
              </> : <><i/><span>Empty</span></>}
            </div>
          })}
        </div>
      </section>

      <section className="runtime-character-stats">
        <span className="runtime-section-label">COMBAT STATS</span>
        <div className="runtime-stat-cards">
          <RuntimeStat icon={<Swords size={15}/>} label="Attack" value={attack}/>
          <RuntimeStat icon={<Shield size={15}/>} label="Defense" value={defense}/>
          <RuntimeStat icon={<Sparkles size={15}/>} label="Skill Power" value={Math.round(active?.damage ?? 0)}/>
          <RuntimeStat icon={<Heart size={15}/>} label="Health" value={`${Math.ceil(snapshot?.health ?? gameplay.player.maxHealth)} / ${snapshot?.maxHealth ?? gameplay.player.maxHealth}`}/>
          <RuntimeStat icon={<Footprints size={15}/>} label="Move Speed" value={gameplay.player.moveSpeed.toFixed(1)}/>
          <RuntimeStat icon={<Zap size={15}/>} label="Dodge" value={`${gameplay.player.dodgeDistance.toFixed(1)}m · ${gameplay.player.dodgeCooldown.toFixed(2)}s`}/>
        </div>
        <div className="runtime-archetype-summary">
          <span>{archetypeLabel(profile.blueprint.role).toUpperCase()}</span>
          <strong>{primary?.name ?? 'Primary attack'} · {active?.name ?? 'No active skill'}</strong>
          <small>{gameplay.player.maxHealth} base HP · {gameplay.player.moveSpeed.toFixed(1)} move · {stats.damageBonus} gear attack · {defense} defense</small>
        </div>
        <div className="runtime-progress-summary">
          <span><b>Experience</b><em>{snapshot?.xp ?? 0} / {snapshot?.xpToNext ?? 100}</em></span>
          <i><b style={{ width: `${Math.max(0, Math.min(100, (snapshot?.xp ?? 0) / Math.max(1, snapshot?.xpToNext ?? 100) * 100))}%` }}/></i>
        </div>
      </section>
    </div>
  </div>
}

export function SkillboundInventoryRuntimePanel({ profile, snapshot, workspace }: CommonProps) {
  const gameplay = useMemo(
    () => resolveGameplayForRole(
      withGeneratedItems(workspace.gameplay, snapshot?.generatedItems),
      profile.blueprint.role,
    ),
    [workspace.gameplay, profile.blueprint.role, snapshot?.generatedItems],
  )
  const equipment = normalizeEquipment(
    snapshot?.equipment,
    snapshot?.equippedWeaponId,
  )
  const allItems = snapshot?.inventory
    .map((id, index) => ({
      item: gameplay.items.find(
        (candidate) => candidate.id === id,
      ),
      index,
    }))
    .filter(
      (entry): entry is {
        item: ForgeItemDefinition
        index: number
      } => Boolean(entry.item),
    ) ?? []

  const [selectedKey, setSelectedKey] = useState('')
  const [filter, setFilter] = useState<
    'all' | 'weapons' | 'armor' | 'offhand'
  >('all')
  const [rarity, setRarity] = useState<
    'all' | ForgeItemDefinition['rarity']
  >('all')
  const [sort, setSort] = useState<
    'recent' | 'type' | 'rarity' | 'power'
  >('recent')
  const [showStats, setShowStats] = useState(false)

  const filteredItems = useMemo(() => {
    const rarityRank = {
      common: 1,
      magic: 2,
      rare: 3,
    } as const
    const next = allItems.filter(({ item }) => {
      const classification = itemClassification(item)
      const filterMatch =
        filter === 'all' ||
        (filter === 'weapons' &&
          classification.itemType === 'weapon') ||
        (filter === 'armor' &&
          classification.itemType === 'armor') ||
        (filter === 'offhand' &&
          classification.itemType === 'offhand')
      const rarityMatch =
        rarity === 'all' || item.rarity === rarity
      return filterMatch && rarityMatch
    })

    return [...next].sort((a, b) => {
      if (sort === 'recent') return b.index - a.index
      if (sort === 'rarity') {
        return (
          rarityRank[b.item.rarity] -
          rarityRank[a.item.rarity] ||
          a.item.name.localeCompare(b.item.name)
        )
      }
      if (sort === 'power') {
        const power = (item: ForgeItemDefinition) =>
          Math.max(0, Number(item.damageBonus) || 0) * 3 +
          itemDefenseBonus(item)
        return (
          power(b.item) -
          power(a.item) ||
          a.item.name.localeCompare(b.item.name)
        )
      }
      const aSlot = itemEquipmentSlot(a.item) ?? 'ZZ'
      const bSlot = itemEquipmentSlot(b.item) ?? 'ZZ'
      return (
        aSlot.localeCompare(bSlot) ||
        a.item.name.localeCompare(b.item.name)
      )
    })
  }, [allItems, filter, rarity, sort])

  const selectedEquipmentSlot =
    selectedKey.startsWith('equipment:')
      ? selectedKey.slice('equipment:'.length) as ForgeEquipmentSlot
      : undefined
  const selectedMatch = filteredItems.find(
    (entry) =>
      `${entry.item.id}:${entry.index}` === selectedKey,
  )
  const selectedFromEquipment = selectedEquipmentSlot
    ? equipmentItem(
        gameplay,
        equipment,
        selectedEquipmentSlot,
      )
    : undefined
  const selectedEntry =
    selectedMatch ??
    (!selectedEquipmentSlot ? filteredItems[0] : undefined)
  const selected =
    selectedFromEquipment ?? selectedEntry?.item

  useEffect(() => {
    if (selectedEquipmentSlot) {
      if (!selectedFromEquipment) setSelectedKey('')
      return
    }
    if (!filteredItems.length) {
      if (selectedKey) setSelectedKey('')
      return
    }
    if (!selectedMatch) {
      setSelectedKey(
        `${filteredItems[0].item.id}:${filteredItems[0].index}`,
      )
    }
  }, [
    filteredItems,
    selectedKey,
    selectedMatch,
    selectedEquipmentSlot,
    selectedFromEquipment,
  ])

  const currentStats = equipmentStats(gameplay, equipment)
  const selectedEquipped =
    selected ? isItemEquipped(equipment, selected.id) : false
  const selectedSlot =
    selectedEquipmentSlot ??
    (selected ? itemEquipmentSlot(selected) : undefined)
  const equippedInSelectedSlot = selectedSlot
    ? equipmentItem(gameplay, equipment, selectedSlot)
    : undefined

  const comparison =
    selected && selectedSlot && !selectedEquipped
      ? compareEquipmentChange(gameplay, equipment, selected)
      : undefined

  const unequipPreview =
    selectedSlot && selectedEquipped
      ? equipmentStats(
          gameplay,
          unequipItemFromState(equipment, selectedSlot),
        )
      : undefined

  const replacedNames = comparison?.replaced.map(
    ({ slot, itemId }) => {
      const replaced = gameplay.items.find(
        (item) => item.id === itemId,
      )
      return `${equipmentSlotLabel(slot)}: ${replaced?.name ?? itemId}`
    },
  ) ?? []

  const equip = (item: ForgeItemDefinition) => {
    if (!itemEquipmentSlot(item)) return
    equipActiveSkillboundItem(item.id)
  }

  const unequip = (slot?: ForgeEquipmentSlot) => {
    if (!slot) return
    unequipActiveSkillboundSlot(slot)
  }

  const primary = gameplay.abilities.find(
    (ability) => ability.id === gameplay.player.basicAbility,
  )
  const active = gameplay.abilities.find(
    (ability) =>
      ability.id === gameplay.player.activeAbilities[0],
  )
  const currentAttack =
    (primary?.damage ?? 0) +
    (snapshot?.attackBonus ?? currentStats.damageBonus)

  return <div className="pause-sheet runtime-inventory-sheet runtime-inventory-v2">
    <header className="runtime-sheet-header runtime-inventory-header">
      <div>
        <span>CHARACTER & INVENTORY</span>
        <h2>{profile.name}</h2>
      </div>
      <div className="runtime-inventory-header-actions">
        <button
          type="button"
          className={showStats ? 'active' : ''}
          onClick={() => setShowStats((value) => !value)}
        >
          <BarChart3 size={14}/>
          Stats
        </button>
        <button
          type="button"
          onClick={() => equipBestActiveSkillboundGear()}
        >
          <WandSparkles size={14}/>
          Equip Best
        </button>
        <div className="runtime-currency">
          <Coins size={14}/>
          <strong>{(snapshot?.gold ?? 0).toLocaleString()}</strong>
          <small>Gold</small>
        </div>
      </div>
    </header>

    <div className="runtime-inventory-v2-layout">
      <aside className="runtime-equipment-column">
        <div className="runtime-inventory-column-title">
          <Shield size={14}/>
          <span>Equipment</span>
          <em>{equipmentGearPower(gameplay, equipment)} power</em>
        </div>
        <div className="runtime-equipment-stack">
          {FORGE_EQUIPMENT_SLOTS.map((slot) => {
            const equipped = equipmentItem(
              gameplay,
              equipment,
              slot,
            )
            const isSelected =
              selectedKey === `equipment:${slot}`
            return <button
              type="button"
              key={slot}
              className={`runtime-equipment-row ${equipped ? 'filled' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() =>
                setSelectedKey(`equipment:${slot}`)
              }
              disabled={!equipped}
            >
              <span className="runtime-equipment-slot-label">
                {equipmentSlotLabel(slot)}
              </span>
              {equipped ? <>
                <RuntimeItemIcon item={equipped}/>
                <span className="runtime-equipment-copy">
                  <strong>{equipped.name}</strong>
                  <small>{itemRuntimeDescription(equipped)}</small>
                </span>
                <em>Equipped</em>
              </> : <>
                <i className="runtime-empty-slot"/>
                <span className="runtime-equipment-copy">
                  <strong>Empty</strong>
                  <small>No item equipped</small>
                </span>
              </>}
            </button>
          })}
        </div>
        <div className="runtime-equipment-totals">
          <div>
            <span>Gear attack</span>
            <strong>{currentStats.damageBonus}</strong>
          </div>
          <div>
            <span>Defense</span>
            <strong>{currentStats.defense}</strong>
          </div>
          <div>
            <span>Gear power</span>
            <strong>
              {equipmentGearPower(gameplay, equipment)}
            </strong>
          </div>
        </div>
      </aside>

      <section className="runtime-inventory-list runtime-inventory-browser">
        <div className="runtime-inventory-toolbar">
          <div className="runtime-inventory-title">
            <Backpack size={14}/>
            <span>{allItems.length} item{allItems.length === 1 ? '' : 's'}</span>
          </div>
          <div className="runtime-inventory-filter-line">
            <ListFilter size={13}/>
            {(['all', 'weapons', 'armor', 'offhand'] as const).map(
              (value) => <button
                type="button"
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value === 'all'
                  ? 'All'
                  : value === 'offhand'
                    ? 'Off-hand'
                    : value[0].toUpperCase() + value.slice(1)}
              </button>,
            )}
          </div>
          <div className="runtime-inventory-filter-line rarity-line">
            {(['all', 'common', 'magic', 'rare', 'epic', 'legendary', 'unique'] as const).map(
              (value) => <button
                type="button"
                key={value}
                className={`${rarity === value ? 'active' : ''} ${value === 'all' ? '' : `rarity-${value}`}`}
                onClick={() => setRarity(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>,
            )}
          </div>
          <label className="runtime-inventory-sort">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as typeof sort)
              }
            >
              <option value="recent">Recent</option>
              <option value="type">Type</option>
              <option value="rarity">Rarity</option>
              <option value="power">Power</option>
            </select>
          </label>
        </div>

        <div className="runtime-item-grid runtime-item-grid-v2">
          {filteredItems.map(({ item, index }) => {
            const key = `${item.id}:${index}`
            const equipped = isItemEquipped(
              equipment,
              item.id,
            )
            const change = compareEquipmentChange(
              gameplay,
              equipment,
              item,
            )
            return <button
              key={key}
              className={`runtime-item-card rarity-${item.rarity} ${selectedKey === key ? 'selected' : ''} ${equipped ? 'equipped' : ''}`}
              onClick={() => setSelectedKey(key)}
              onDoubleClick={() => {
                if (equipped) {
                  const slot = itemEquipmentSlot(item)
                  if (slot) unequip(slot)
                } else {
                  equip(item)
                }
              }}
            >
              <RuntimeItemIcon item={item}/>
              <span>
                <strong>{item.name}</strong>
                <small>{itemRuntimeDescription(item)}</small>
              </span>
              {equipped
                ? <em>Equipped</em>
                : itemEquipmentSlot(item) &&
                  <em className={deltaClass(
                    change.damageDelta +
                    change.defenseDelta,
                  )}>
                    {compactDelta(change)}
                  </em>}
            </button>
          })}
          {!filteredItems.length && <div className="runtime-inventory-empty">
            <Backpack size={26}/>
            <strong>
              {allItems.length
                ? 'No items match these filters'
                : 'Your pack is empty'}
            </strong>
            <span>
              {allItems.length
                ? 'Change the type or rarity filter.'
                : 'Defeat encounters and collect dropped items.'}
            </span>
          </div>}
        </div>
      </section>

      <aside className="runtime-item-inspector runtime-item-inspector-v2">
        {selected ? <>
          <div className={`runtime-item-hero rarity-${selected.rarity}`}>
            <RuntimeItemIcon item={selected}/>
          </div>
          <span>
            {selected.rarity.toUpperCase()} · {
              selectedSlot
                ? equipmentSlotLabel(selectedSlot).toUpperCase()
                : 'NOT EQUIPPABLE'
            }
          </span>
          <h3>{selected.name}</h3>

          <div className="runtime-item-properties">
            <div>
              <small>Attack</small>
              <strong>+{selected.damageBonus}</strong>
            </div>
            <div>
              <small>Defense</small>
              <strong>+{itemDefenseBonus(selected)}</strong>
            </div>
          </div>

          {selectedSlot && <div className="runtime-side-by-side-compare">
            <span>COMPARE</span>
            <div className="runtime-compare-cards">
              <div className="runtime-compare-card current">
                <small>Equipped</small>
                {equippedInSelectedSlot ? <>
                  <strong>{equippedInSelectedSlot.name}</strong>
                  <em>
                    +{equippedInSelectedSlot.damageBonus} ATK · +{
                      itemDefenseBonus(equippedInSelectedSlot)
                    } DEF
                  </em>
                </> : <>
                  <strong>Empty slot</strong>
                  <em>No bonuses</em>
                </>}
              </div>
              <div className="runtime-compare-card candidate">
                <small>{selectedEquipped ? 'Selected' : 'Candidate'}</small>
                <strong>{selected.name}</strong>
                <em>
                  +{selected.damageBonus} ATK · +{
                    itemDefenseBonus(selected)
                  } DEF
                </em>
              </div>
            </div>

            {comparison && !selectedEquipped && <>
              <ComparisonRow
                label="Total gear attack"
                before={comparison.before.damageBonus}
                after={comparison.after.damageBonus}
              />
              <ComparisonRow
                label="Total defense"
                before={comparison.before.defense}
                after={comparison.after.defense}
              />
              <div className="runtime-replacement-note">
                <small>Replaces</small>
                <strong>
                  {replacedNames.length
                    ? replacedNames.join(' · ')
                    : `Empty ${equipmentSlotLabel(selectedSlot)} slot`}
                </strong>
              </div>
            </>}

            {unequipPreview && <div className="runtime-unequip-preview">
              <small>If unequipped</small>
              <span>
                {currentStats.damageBonus} → <strong>{
                  unequipPreview.damageBonus
                }</strong> gear attack
              </span>
              <span>
                {currentStats.defense} → <strong>{
                  unequipPreview.defense
                }</strong> defense
              </span>
            </div>}
          </div>}

          <button
            className={`runtime-equip-button ${selectedEquipped ? 'unequip' : ''}`}
            disabled={!selectedSlot}
            onClick={() => {
              if (!selectedSlot) return
              if (selectedEquipped) unequip(selectedSlot)
              else equip(selected)
            }}
          >
            {selectedEquipped
              ? `Unequip · ${equipmentSlotLabel(selectedSlot!)}`
              : selectedSlot
                ? `Equip · ${equipmentSlotLabel(selectedSlot)}`
                : 'Not Equippable'}
          </button>
          <p>
            Double-click an inventory item to equip it. Selecting an
            equipped slot shows the same item details and lets you
            unequip it.
          </p>
        </> : <div className="runtime-item-inspector-empty">
          <Sparkles size={24}/>
          <strong>Select an item or equipment slot</strong>
          <span>Comparison and equipment actions appear here.</span>
        </div>}
      </aside>
    </div>

    {showStats && <div className="runtime-stats-overlay">
      <div className="runtime-stats-overlay-backdrop"
        onClick={() => setShowStats(false)}
      />
      <section className="runtime-stats-card">
        <header>
          <div>
            <span>CHARACTER DETAILS</span>
            <h3>Effective stats</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowStats(false)}
          >
            Close
          </button>
        </header>

        <div className="runtime-detailed-stats">
          <DetailedStat
            label="Primary attack"
            value={Math.round(currentAttack)}
            detail={`${primary?.damage ?? 0} base + ${snapshot?.attackBonus ?? currentStats.damageBonus} gear`}
          />
          <DetailedStat
            label="Gear attack"
            value={currentStats.damageBonus}
            detail="Sum of equipped attack bonuses"
          />
          <DetailedStat
            label="Defense"
            value={snapshot?.defense ?? currentStats.defense}
            detail="Reduces incoming physical damage"
          />
          <DetailedStat
            label="Health"
            value={`${Math.ceil(snapshot?.health ?? gameplay.player.maxHealth)} / ${snapshot?.maxHealth ?? gameplay.player.maxHealth}`}
            detail="Current / maximum health"
          />
          <DetailedStat
            label="Skill power"
            value={Math.round(active?.damage ?? 0)}
            detail={active?.name ?? 'No active skill'}
          />
          <DetailedStat
            label="Move speed"
            value={gameplay.player.moveSpeed.toFixed(1)}
            detail="World units per second"
          />
          <DetailedStat
            label="Dodge distance"
            value={`${gameplay.player.dodgeDistance.toFixed(1)} m`}
            detail={`${gameplay.player.dodgeCooldown.toFixed(2)} s cooldown`}
          />
          <DetailedStat
            label="Gear power"
            value={equipmentGearPower(gameplay, equipment)}
            detail="Forge summary of equipped attack and defense"
          />
        </div>

        {comparison && !selectedEquipped && <div className="runtime-stats-selected-preview">
          <span>SELECTED ITEM PREVIEW</span>
          <strong>{selected?.name}</strong>
          <div>
            <ComparisonRow
              label="Gear attack"
              before={comparison.before.damageBonus}
              after={comparison.after.damageBonus}
            />
            <ComparisonRow
              label="Defense"
              before={comparison.before.defense}
              after={comparison.after.defense}
            />
          </div>
        </div>}
      </section>
    </div>}
  </div>
}

function DetailedStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return <div className="runtime-detailed-stat">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>
}

function ComparisonRow({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before
  return <div className="runtime-comparison-row"><small>{label}</small><span>{before} → <strong>{after}</strong></span><em className={deltaClass(delta)}>{signed(delta)}</em></div>
}

function RuntimeStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <div className="runtime-stat-card"><i>{icon}</i><span>{label}</span><strong>{value}</strong></div>
}

function RuntimeItemIcon({ item }: { item: ForgeItemDefinition }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let cancelled = false
    let url = ''
    setSrc(undefined)
    void resolveItemIcon(item).then((blob) => {
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setSrc(url)
    }).catch(() => { if (!cancelled) setSrc(undefined) })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [item.id, item.visual?.inventory.iconAssetId, JSON.stringify(item.procedural)])
  return <div className="runtime-item-icon">{src ? <img src={src} alt=""/> : <i style={{ background: item.color }}/>}</div>
}

function compactDelta(change: { damageDelta: number; defenseDelta: number }) {
  const parts = [change.damageDelta ? `${signed(change.damageDelta)} ATK` : '', change.defenseDelta ? `${signed(change.defenseDelta)} DEF` : ''].filter(Boolean)
  return parts.join(' · ') || 'No stat change'
}

function signed(value: number) {
  return value > 0 ? `+${value}` : `${value}`
}

function deltaClass(value: number) {
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
}
