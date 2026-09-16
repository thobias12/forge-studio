import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Backpack, Coins, Footprints, Heart, Shield, Sparkles, Swords, Zap } from 'lucide-react'
import CharacterForgePreview from './CharacterForgePreview'
import { blueprintToConfig } from '../engine/characterBlueprint'
import {
  FORGE_EQUIPMENT_SLOTS,
  equipmentItem,
  equipmentSlotLabel,
  equipmentStats,
  isItemEquipped,
  itemDefenseBonus,
  itemEquipmentSlot,
  itemRuntimeDescription,
  normalizeEquipment,
  type ForgeEquipmentState,
} from '../engine/equipment'
import { itemVisual } from '../engine/itemPresentation'
import { resolveGameplayForRole } from '../engine/playerLoadout'
import type { ForgeProjectWorkspace, ForgeItemDefinition } from '../engine/forgeProject'
import type { ForgeRuntimeSnapshot } from '../engine/runtime/ForgePlayRuntime'
import { equipActiveSkillboundItem } from '../engine/runtime/SkillboundRuntimeBridge'
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
  const gameplay = useMemo(() => resolveGameplayForRole(workspace.gameplay, profile.blueprint.role), [workspace.gameplay, profile.blueprint.role])
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
        <div className="runtime-character-caption"><span>LEVEL {level}</span><strong>{profile.blueprint.role}</strong><small>{profile.blueprint.combat.weaponProfile.replaceAll('-', ' ')}</small></div>
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
          <RuntimeStat icon={<Zap size={15}/>} label="Dodge" value={`${gameplay.player.dodgeCooldown.toFixed(1)}s`}/>
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
  const gameplay = useMemo(() => resolveGameplayForRole(workspace.gameplay, profile.blueprint.role), [workspace.gameplay, profile.blueprint.role])
  const equipment = normalizeEquipment(snapshot?.equipment, snapshot?.equippedWeaponId)
  const items = snapshot?.inventory.map((id, index) => ({ item: gameplay.items.find((candidate) => candidate.id === id), index })).filter((entry): entry is { item: ForgeItemDefinition; index: number } => Boolean(entry.item)) ?? []
  const [selectedKey, setSelectedKey] = useState('')
  const selectedMatch = items.find((entry) => `${entry.item.id}:${entry.index}` === selectedKey)
  const selectedEntry = selectedMatch ?? items[0]
  const selected = selectedEntry?.item

  useEffect(() => {
    if (!items.length) {
      if (selectedKey) setSelectedKey('')
      return
    }
    if (!selectedMatch) setSelectedKey(`${items[0].item.id}:${items[0].index}`)
  }, [items.length, selectedKey, selectedMatch])

  const equip = (item: ForgeItemDefinition) => {
    if (!itemEquipmentSlot(item)) return
    equipActiveSkillboundItem(item.id)
  }

  const selectedEquipped = selected ? isItemEquipped(equipment, selected.id) : false
  const selectedSlot = selected ? itemEquipmentSlot(selected) : undefined

  return <div className="pause-sheet runtime-inventory-sheet">
    <header className="runtime-sheet-header">
      <div><span>INVENTORY</span><h2>{profile.name}'s pack</h2></div>
      <div className="runtime-currency"><Coins size={14}/><strong>{(snapshot?.gold ?? 0).toLocaleString()}</strong><small>Gold</small></div>
    </header>

    <div className="runtime-inventory-layout">
      <section className="runtime-inventory-list">
        <div className="runtime-inventory-title"><Backpack size={14}/><span>{items.length} item{items.length === 1 ? '' : 's'} · {snapshot?.defense ?? equipmentStats(gameplay, equipment).defense} defense</span></div>
        <div className="runtime-item-grid">
          {items.map(({ item, index }) => {
            const key = `${item.id}:${index}`
            const equipped = isItemEquipped(equipment, item.id)
            return <button key={key} className={`runtime-item-card rarity-${item.rarity} ${selectedKey === key ? 'selected' : ''} ${equipped ? 'equipped' : ''}`} onClick={() => setSelectedKey(key)}>
              <RuntimeItemIcon item={item}/>
              <span><strong>{item.name}</strong><small>{itemRuntimeDescription(item)}</small></span>
              {equipped && <em>Equipped</em>}
            </button>
          })}
          {!items.length && <div className="runtime-inventory-empty"><Backpack size={26}/><strong>Your pack is empty</strong><span>Defeat encounters and collect dropped items.</span></div>}
        </div>
      </section>

      <aside className="runtime-item-inspector">
        {selected ? <>
          <div className={`runtime-item-hero rarity-${selected.rarity}`}><RuntimeItemIcon item={selected}/></div>
          <span>{selected.rarity.toUpperCase()} · {selectedSlot ? equipmentSlotLabel(selectedSlot).toUpperCase() : 'NOT EQUIPPABLE'}</span>
          <h3>{selected.name}</h3>
          <div className="runtime-item-stat"><small>Attack bonus</small><strong>+{selected.damageBonus}</strong></div>
          <div className="runtime-item-stat"><small>Defense bonus</small><strong>+{itemDefenseBonus(selected)}</strong></div>
          <div className="runtime-item-stat"><small>Equipped</small><strong>{selectedEquipped ? 'Yes' : 'No'}</strong></div>
          <button className="runtime-equip-button" disabled={!selectedSlot || selectedEquipped} onClick={() => equip(selected)}>{selectedEquipped ? 'Currently Equipped' : selectedSlot ? `Equip · ${equipmentSlotLabel(selectedSlot)}` : 'Not Equippable'}</button>
          <p>Item Forge is the source of truth for slot, stats, master model, icon, world drop and equipped presentation.</p>
        </> : <div className="runtime-item-inspector-empty"><Sparkles size={24}/><strong>Select an item</strong><span>Its live runtime details will appear here.</span></div>}
      </aside>
    </div>
  </div>
}

function RuntimeStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <div className="runtime-stat-card"><i>{icon}</i><span>{label}</span><strong>{value}</strong></div>
}

function RuntimeItemIcon({ item }: { item: ForgeItemDefinition }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let cancelled = false
    let url = ''
    const iconId = itemVisual(item).inventory.iconAssetId
    if (!iconId) { setSrc(undefined); return }
    void getAsset(iconId).then((asset) => {
      if (!asset || cancelled) return
      url = URL.createObjectURL(asset.blob)
      setSrc(url)
    }).catch(() => setSrc(undefined))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [item.id, item.visual?.inventory.iconAssetId])
  return <div className="runtime-item-icon">{src ? <img src={src} alt=""/> : <i style={{ background: item.color }}/>}</div>
}
