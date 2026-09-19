import { useEffect, useState, type ReactNode } from 'react'
import { Boxes, Check, CircleGauge, Copy, FolderSync, Library, PackageOpen, Plus, Save, Shield, Sparkles, Swords, Trash2, UserRoundCog, WandSparkles } from 'lucide-react'
import ArchetypeLoadoutEditor from '../components/ArchetypeLoadoutEditor'
import {
  loadSkillboundWorkspace,
  saveSkillboundWorkspace,
  type ForgeAbilityDefinition,
  type ForgeEnemyDefinition,
  type ForgeGameplayContent,
  type ForgeItemDefinition,
  type ForgeLootTableDefinition,
  type ForgePlayerDefinition,
  type ForgeProjectWorkspace,
} from '../engine/forgeProject'
import {
  addManagedManifestPath,
  createAbilityDefinition,
  createEnemyDefinition,
  createItemDefinition,
  createLootTableDefinition,
  duplicateName,
  findGameplayReferences,
  removeManagedManifestPath,
  slugContentId,
  uniqueContentId,
  type ManagedGameplayKind,
} from '../engine/contentManagement'
import { getSkillboundProjectConnection, saveSkillboundWorkspaceToProjectFolder } from '../engine/projectPersistence'
import { listAssets, saveAsset, type AssetCategory, type LibraryAsset } from '../lib/library'

type Tab = 'player' | 'enemies' | 'abilities' | 'items' | 'loot'
type ToolTarget = 'world' | 'characterforge' | 'animations' | 'vfx' | 'assets' | 'itemforge' | 'lootforge'
type Props = { onOpenTool: (target: ToolTarget) => void }

export default function GameplayForge({ onOpenTool }: Props) {
  const [workspace, setWorkspace] = useState<ForgeProjectWorkspace>()
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [tab, setTab] = useState<Tab>('enemies')
  const [selectedEnemy, setSelectedEnemy] = useState('')
  const [selectedAbility, setSelectedAbility] = useState('')
  const [selectedItem, setSelectedItem] = useState('')
  const [selectedLoot, setSelectedLoot] = useState('')
  const [sourceConnected, setSourceConnected] = useState(false)
  const [status, setStatus] = useState('Loading Skillbound gameplay…')

  const refreshAssets = async () => setAssets(await listAssets())

  useEffect(() => {
    void Promise.all([loadSkillboundWorkspace(), listAssets(), getSkillboundProjectConnection().catch(() => undefined)]).then(([project, library, connection]) => {
      setWorkspace(project)
      setAssets(library)
      setSelectedEnemy(project.gameplay.enemies[0]?.id ?? '')
      setSelectedAbility(project.gameplay.abilities[0]?.id ?? '')
      setSelectedItem(project.gameplay.items[0]?.id ?? '')
      setSelectedLoot(project.gameplay.lootTables[0]?.id ?? '')
      setSourceConnected(connection?.permission === 'granted' || connection?.permission === 'prompt')
      setStatus('Live save enabled · archetype loadouts, definitions and equipment content are authored from the active Skillbound project.')
    }).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Gameplay Forge.'))
  }, [])

  const commitWorkspace = (next: ForgeProjectWorkspace, message = 'Saved to the active Skillbound workspace.') => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    setStatus(message)
    return saved
  }

  const commitGameplay = (gameplay: ForgeGameplayContent, message?: string) => {
    if (!workspace) return
    return commitWorkspace({ ...workspace, gameplay }, message)
  }

  const patchPlayer = (patch: Partial<ForgePlayerDefinition>) => workspace && commitGameplay({ ...workspace.gameplay, player: { ...workspace.gameplay.player, ...patch } }, 'Player and archetype runtime settings updated.')
  const patchEnemy = (id: string, patch: Partial<ForgeEnemyDefinition>) => workspace && commitGameplay({ ...workspace.gameplay, enemies: workspace.gameplay.enemies.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const patchAbility = (id: string, patch: Partial<ForgeAbilityDefinition>) => workspace && commitGameplay({ ...workspace.gameplay, abilities: workspace.gameplay.abilities.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const patchItem = (id: string, patch: Partial<ForgeItemDefinition>) => workspace && commitGameplay({ ...workspace.gameplay, items: workspace.gameplay.items.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const patchLoot = (id: string, patch: Partial<ForgeLootTableDefinition>) => workspace && commitGameplay({ ...workspace.gameplay, lootTables: workspace.gameplay.lootTables.map((item) => item.id === id ? { ...item, ...patch } : item) })

  const createEnemy = () => {
    if (!workspace) return
    const name = promptName('Enemy name', 'New Enemy')
    if (!name) return
    const id = uniqueContentId(slugContentId(name), workspace.gameplay.enemies.map((entry) => entry.id))
    const created = createEnemyDefinition(name, id, workspace)
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'enemy', id), gameplay: { ...workspace.gameplay, enemies: [...workspace.gameplay.enemies, created] } }, `${created.name} created.`)
    setSelectedEnemy(id)
    setWorkspace(next)
  }

  const duplicateEnemy = () => {
    if (!workspace) return
    const source = workspace.gameplay.enemies.find((entry) => entry.id === selectedEnemy)
    if (!source) return
    const id = uniqueContentId(`${source.id}-copy`, workspace.gameplay.enemies.map((entry) => entry.id))
    const copy = { ...source, id, name: duplicateName(source.name) }
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'enemy', id), gameplay: { ...workspace.gameplay, enemies: [...workspace.gameplay.enemies, copy] } }, `${copy.name} duplicated from ${source.name}.`)
    setSelectedEnemy(id)
    setWorkspace(next)
  }

  const deleteEnemy = () => deleteDefinition('enemy', selectedEnemy, workspace?.gameplay.enemies.find((entry) => entry.id === selectedEnemy)?.name, () => {
    if (!workspace) return
    const remaining = workspace.gameplay.enemies.filter((entry) => entry.id !== selectedEnemy)
    commitWorkspace({ ...workspace, manifest: removeManagedManifestPath(workspace.manifest, 'enemy', selectedEnemy), gameplay: { ...workspace.gameplay, enemies: remaining } }, 'Enemy removed from the Skillbound project.')
    setSelectedEnemy(remaining[0]?.id ?? '')
  })

  const createAbility = () => {
    if (!workspace) return
    const name = promptName('Ability name', 'New Ability')
    if (!name) return
    const id = uniqueContentId(slugContentId(name), workspace.gameplay.abilities.map((entry) => entry.id))
    const created = createAbilityDefinition(name, id)
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'ability', id), gameplay: { ...workspace.gameplay, abilities: [...workspace.gameplay.abilities, created] } }, `${created.name} created. Assign it from the Player archetype editor when you want it in a class loadout.`)
    setSelectedAbility(id)
    setWorkspace(next)
  }

  const duplicateAbility = () => {
    if (!workspace) return
    const source = workspace.gameplay.abilities.find((entry) => entry.id === selectedAbility)
    if (!source) return
    const id = uniqueContentId(`${source.id}-copy`, workspace.gameplay.abilities.map((entry) => entry.id))
    const copy = { ...source, id, name: duplicateName(source.name) }
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'ability', id), gameplay: { ...workspace.gameplay, abilities: [...workspace.gameplay.abilities, copy] } }, `${copy.name} duplicated from ${source.name}.`)
    setSelectedAbility(id)
    setWorkspace(next)
  }

  const deleteAbility = () => deleteDefinition('ability', selectedAbility, workspace?.gameplay.abilities.find((entry) => entry.id === selectedAbility)?.name, () => {
    if (!workspace) return
    const remaining = workspace.gameplay.abilities.filter((entry) => entry.id !== selectedAbility)
    commitWorkspace({ ...workspace, manifest: removeManagedManifestPath(workspace.manifest, 'ability', selectedAbility), gameplay: { ...workspace.gameplay, abilities: remaining } }, 'Ability removed from the Skillbound project.')
    setSelectedAbility(remaining[0]?.id ?? '')
  })

  const createItem = () => {
    if (!workspace) return
    const name = promptName('Item name', 'New Item')
    if (!name) return
    const id = uniqueContentId(slugContentId(name), workspace.gameplay.items.map((entry) => entry.id))
    const created = createItemDefinition(name, id)
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'item', id), gameplay: { ...workspace.gameplay, items: [...workspace.gameplay.items, created] } }, `${created.name} created. Open Item Forge to build its model and presentations.`)
    setSelectedItem(id)
    setWorkspace(next)
  }

  const duplicateItem = () => {
    if (!workspace) return
    const source = workspace.gameplay.items.find((entry) => entry.id === selectedItem)
    if (!source) return
    const id = uniqueContentId(`${source.id}-copy`, workspace.gameplay.items.map((entry) => entry.id))
    const copy = cloneDefinition(source, id, duplicateName(source.name))
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'item', id), gameplay: { ...workspace.gameplay, items: [...workspace.gameplay.items, copy] } }, `${copy.name} duplicated. It currently shares any assigned Library presentation assets.`)
    setSelectedItem(id)
    setWorkspace(next)
  }

  const deleteItem = () => deleteDefinition('item', selectedItem, workspace?.gameplay.items.find((entry) => entry.id === selectedItem)?.name, () => {
    if (!workspace) return
    const remaining = workspace.gameplay.items.filter((entry) => entry.id !== selectedItem)
    commitWorkspace({ ...workspace, manifest: removeManagedManifestPath(workspace.manifest, 'item', selectedItem), gameplay: { ...workspace.gameplay, items: remaining } }, 'Item removed from the Skillbound project. Shared Library assets were left intact.')
    setSelectedItem(remaining[0]?.id ?? '')
  })

  const openItemForge = () => onOpenTool('itemforge')

  const createLoot = () => {
    if (!workspace) return
    const name = promptName('Loot table name', 'New Loot Table')
    if (!name) return
    const id = uniqueContentId(slugContentId(name), workspace.gameplay.lootTables.map((entry) => entry.id))
    const created = createLootTableDefinition(name, id, workspace)
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'loot', id), gameplay: { ...workspace.gameplay, lootTables: [...workspace.gameplay.lootTables, created] } }, `${created.name} created.`)
    setSelectedLoot(id)
    setWorkspace(next)
  }

  const duplicateLoot = () => {
    if (!workspace) return
    const source = workspace.gameplay.lootTables.find((entry) => entry.id === selectedLoot)
    if (!source) return
    const id = uniqueContentId(`${source.id}-copy`, workspace.gameplay.lootTables.map((entry) => entry.id))
    const copy = cloneDefinition(source, id, duplicateName(source.name))
    const next = commitWorkspace({ ...workspace, manifest: addManagedManifestPath(workspace.manifest, 'loot', id), gameplay: { ...workspace.gameplay, lootTables: [...workspace.gameplay.lootTables, copy] } }, `${copy.name} duplicated from ${source.name}.`)
    setSelectedLoot(id)
    setWorkspace(next)
  }

  const deleteLoot = () => deleteDefinition('loot', selectedLoot, workspace?.gameplay.lootTables.find((entry) => entry.id === selectedLoot)?.name, () => {
    if (!workspace) return
    const remaining = workspace.gameplay.lootTables.filter((entry) => entry.id !== selectedLoot)
    commitWorkspace({ ...workspace, manifest: removeManagedManifestPath(workspace.manifest, 'loot', selectedLoot), gameplay: { ...workspace.gameplay, lootTables: remaining } }, 'Loot table removed from the Skillbound project.')
    setSelectedLoot(remaining[0]?.id ?? '')
  })

  const deleteDefinition = (kind: ManagedGameplayKind, id: string, name: string | undefined, remove: () => void) => {
    if (!workspace || !id || !name) return
    const references = findGameplayReferences(workspace, kind, id)
    if (references.length) {
      setStatus(`Cannot delete ${name}. Still used by: ${references.join(' · ')}`)
      return
    }
    if (!window.confirm(`Delete ${name} from the Skillbound project?`)) return
    remove()
  }

  const writeSource = async () => {
    if (!workspace) return
    try {
      setStatus('Writing Gameplay Forge definitions, archetype loadouts and project manifest to connected source…')
      const written = await saveSkillboundWorkspaceToProjectFolder(workspace)
      const saved = saveSkillboundWorkspace(written)
      setWorkspace(saved)
      setStatus(`Source written · project content revision ${written.manifest.contentRevision ?? 1}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not write project source.')
    }
  }

  if (!workspace) return <div className="gameplay-forge-loading"><Swords size={28}/><strong>Opening Gameplay Forge</strong><span>{status}</span></div>

  const enemy = workspace.gameplay.enemies.find((item) => item.id === selectedEnemy) ?? workspace.gameplay.enemies[0]
  const ability = workspace.gameplay.abilities.find((item) => item.id === selectedAbility) ?? workspace.gameplay.abilities[0]
  const item = workspace.gameplay.items.find((entry) => entry.id === selectedItem) ?? workspace.gameplay.items[0]
  const loot = workspace.gameplay.lootTables.find((entry) => entry.id === selectedLoot) ?? workspace.gameplay.lootTables[0]

  return <div className="gameplay-forge-page">
    <header className="gameplay-forge-toolbar">
      <div><span className="eyebrow">SKILLBOUND / RUNTIME CONTENT</span><strong>Gameplay Forge</strong><small>Author the player, archetypes and reusable combat content here → runtime consumes the same project data</small></div>
      <div className="gameplay-forge-toolbar-actions">
        <button onClick={() => void refreshAssets()}><Library size={14}/> Refresh Library</button>
        <button onClick={() => onOpenTool('world')}><CircleGauge size={14}/> Play in World Forge</button>
        <button onClick={() => { setWorkspace(saveSkillboundWorkspace(workspace)); setStatus('Skillbound gameplay workspace saved.') }}><Save size={14}/> Save Workspace</button>
        <button className="primary" disabled={!sourceConnected} onClick={() => void writeSource()}><FolderSync size={14}/> Write Source</button>
      </div>
    </header>

    <div className="gameplay-forge-layout">
      <aside className="gameplay-forge-tabs">
        <TabButton icon={UserRoundCog} label="Player" active={tab === 'player'} onClick={() => setTab('player')}/>
        <TabButton icon={Shield} label="Enemies" count={workspace.gameplay.enemies.length} active={tab === 'enemies'} onClick={() => setTab('enemies')}/>
        <TabButton icon={WandSparkles} label="Abilities" count={workspace.gameplay.abilities.length} active={tab === 'abilities'} onClick={() => setTab('abilities')}/>
        <TabButton icon={PackageOpen} label="Items" count={workspace.gameplay.items.length} active={tab === 'items'} onClick={() => setTab('items')}/>
        <TabButton icon={Sparkles} label="Loot" count={workspace.gameplay.lootTables.length} active={tab === 'loot'} onClick={() => setTab('loot')}/>
        <div className="gameplay-forge-tool-links">
          <span>AUTHORING TOOLS</span>
          <button onClick={() => onOpenTool('characterforge')}>Character Forge</button>
          <button onClick={() => onOpenTool('animations')}>Animation Studio</button>
          <button onClick={() => onOpenTool('vfx')}>VFX Studio</button>
          <button onClick={() => onOpenTool('itemforge')}>Item Forge</button>
          <button onClick={() => onOpenTool('lootforge')}>Loot & Container Forge</button>
          <button onClick={() => onOpenTool('assets')}>Asset Library</button>
        </div>
      </aside>

      <main className="gameplay-forge-editor">
        {tab === 'player' && <PlayerEditor value={workspace.gameplay.player} gameplay={workspace.gameplay} assets={assets} onPatch={patchPlayer} onImportAnimation={async (file) => { const saved = await importAnimation(file); await refreshAssets(); patchPlayer({ animationAssetId: saved.id }); setStatus(`${saved.name} imported and assigned to the player.`) }}/>} 
        {tab === 'enemies' && <><ContentPicker label="ENEMY DEFINITIONS" items={workspace.gameplay.enemies} value={enemy?.id ?? ''} onChange={setSelectedEnemy}/><DefinitionActions onNew={createEnemy} onDuplicate={enemy ? duplicateEnemy : undefined} onDelete={enemy ? deleteEnemy : undefined}/>{enemy ? <EnemyEditor value={enemy} gameplay={workspace.gameplay} assets={assets} onPatch={(patch) => patchEnemy(enemy.id, patch)}/> : <EmptyDefinition label="enemy" onCreate={createEnemy}/>}</>}
        {tab === 'abilities' && <><ContentPicker label="ABILITY DEFINITIONS" items={workspace.gameplay.abilities} value={ability?.id ?? ''} onChange={setSelectedAbility}/><DefinitionActions onNew={createAbility} onDuplicate={ability ? duplicateAbility : undefined} onDelete={ability ? deleteAbility : undefined}/>{ability ? <AbilityEditor value={ability} assets={assets} onPatch={(patch) => patchAbility(ability.id, patch)}/> : <EmptyDefinition label="ability" onCreate={createAbility}/>}</>}
        {tab === 'items' && <><ContentPicker label="ITEM DEFINITIONS" items={workspace.gameplay.items} value={item?.id ?? ''} onChange={setSelectedItem}/><DefinitionActions onNew={createItem} onDuplicate={item ? duplicateItem : undefined} onDelete={item ? deleteItem : undefined} extra={<button onClick={openItemForge}><PackageOpen size={13}/> Open Item Forge</button>}/>{item ? <ItemEditor value={item} assets={assets} onPatch={(patch) => patchItem(item.id, patch)}/> : <EmptyDefinition label="item" onCreate={createItem}/>}</>}
        {tab === 'loot' && <><ContentPicker label="LOOT TABLES" items={workspace.gameplay.lootTables} value={loot?.id ?? ''} onChange={setSelectedLoot}/><DefinitionActions onNew={createLoot} onDuplicate={loot ? duplicateLoot : undefined} onDelete={loot ? deleteLoot : undefined} extra={<button onClick={() => onOpenTool('lootforge')}><PackageOpen size={13}/> Open Loot Forge</button>}/>{loot ? <LootEditor value={loot} gameplay={workspace.gameplay} onPatch={(patch) => patchLoot(loot.id, patch)}/> : <EmptyDefinition label="loot table" onCreate={createLoot}/>}</>}
      </main>

      <aside className="gameplay-forge-diagnostics">
        <div className="gameplay-forge-panel-title"><Check size={14}/> RUNTIME BINDINGS</div>
        <BindingRow label="Player character" bound={Boolean(workspace.gameplay.player.characterAssetId)}/>
        <BindingRow label="Player animations" bound={Boolean(workspace.gameplay.player.animationAssetId)}/>
        <BindingRow label="Archetype loadouts" bound={Boolean(workspace.gameplay.player.archetypeLoadouts && Object.keys(workspace.gameplay.player.archetypeLoadouts).length === 3)}/>
        <BindingRow label="Enemy characters" bound={workspace.gameplay.enemies.some((entry) => Boolean(entry.characterAssetId))}/>
        <BindingRow label="Enemy animations" bound={workspace.gameplay.enemies.some((entry) => Boolean(entry.animationAssetId))}/>
        <BindingRow label="Ability VFX" bound={workspace.gameplay.abilities.some((entry) => Boolean(entry.vfxAssetId))}/>
        <BindingRow label="Enemy VFX" bound={workspace.gameplay.enemies.some((entry) => Boolean(entry.attackVfxAssetId || entry.hitVfxAssetId || entry.deathVfxAssetId))}/>
        <BindingRow label="Item models" bound={workspace.gameplay.items.some((entry) => Boolean(entry.modelAssetId))}/>
        <div className="gameplay-forge-runtime-note"><strong>Archetype resolution</strong><p>Vanguard, Ranger and Arcanist resolve their authored HP, movement, dodge, LMB, Q and starting gear before entering either overworld or dungeon runtime.</p></div>
        <div className="gameplay-forge-runtime-note"><strong>Safe deletion</strong><p>Forge blocks deletion while another player, archetype, encounter, boss or loot definition still references the selected content.</p></div>
        <div className="gameplay-forge-library-count"><Boxes size={15}/><span><strong>{assets.length}</strong> shared Library assets</span></div>
      </aside>
    </div>

    <footer className="gameplay-forge-status"><span>{status}</span><strong>{sourceConnected ? 'Connected source folder available' : 'Workspace mode · connect source folder in Project Manager to write JSON'}</strong></footer>
  </div>
}

function DefinitionActions({ onNew, onDuplicate, onDelete, extra }: { onNew: () => void; onDuplicate?: () => void; onDelete?: () => void; extra?: ReactNode }) {
  return <div className="gameplay-definition-actions"><button className="primary" onClick={onNew}><Plus size={13}/> New</button><button disabled={!onDuplicate} onClick={onDuplicate}><Copy size={13}/> Duplicate</button><button className="danger" disabled={!onDelete} onClick={onDelete}><Trash2 size={13}/> Delete</button>{extra}</div>
}

function EmptyDefinition({ label, onCreate }: { label: string; onCreate: () => void }) {
  return <section className="gameplay-empty-definition"><Plus size={24}/><strong>No {label} definitions</strong><span>Create the first one without touching project JSON.</span><button className="primary" onClick={onCreate}><Plus size={13}/> Create {label}</button></section>
}

function PlayerEditor({ value, gameplay, assets, onPatch, onImportAnimation }: { value: ForgePlayerDefinition; gameplay: ForgeGameplayContent; assets: LibraryAsset[]; onPatch: (patch: Partial<ForgePlayerDefinition>) => void; onImportAnimation: (file: File) => Promise<void> }) {
  const abilityOptions = gameplay.abilities.map((ability) => [ability.id, ability.name] as [string, string])
  const itemOptions = gameplay.items.map((item) => [item.id, item.name] as [string, string])
  return <EditorSection title="Player runtime" subtitle="Base fallback values plus three fully authored playable archetypes. Character roles resolve these loadouts at runtime.">
    <FieldGrid>
      <TextField label="Name" value={value.name} onChange={(name) => onPatch({ name })}/>
      <NumberField label="Fallback max health" value={value.maxHealth} min={1} max={5000} step={5} onChange={(maxHealth) => onPatch({ maxHealth })}/>
      <NumberField label="Fallback move speed" value={value.moveSpeed} min={1} max={30} step={0.1} onChange={(moveSpeed) => onPatch({ moveSpeed })}/>
      <NumberField label="Fallback dodge distance" value={value.dodgeDistance} min={1} max={15} step={0.1} onChange={(dodgeDistance) => onPatch({ dodgeDistance })}/>
      <NumberField label="Fallback dodge cooldown" value={value.dodgeCooldown} min={0.1} max={10} step={0.05} onChange={(dodgeCooldown) => onPatch({ dodgeCooldown })}/>
      <SelectField label="Fallback primary · LMB" value={value.basicAbility} options={abilityOptions} onChange={(basicAbility) => onPatch({ basicAbility })}/>
      <SelectField label="Fallback active · Q" value={value.activeAbilities[0] ?? ''} options={[["","None"], ...abilityOptions]} onChange={(abilityId) => onPatch({ activeAbilities: abilityId ? [abilityId] : [] })}/>
      <SelectField label="Fallback starting item" value={value.startingItems[0] ?? ''} options={[["","None"], ...itemOptions]} onChange={(itemId) => onPatch({ startingItems: itemId ? [itemId] : [] })}/>
    </FieldGrid>
    <ArchetypeLoadoutEditor player={value} gameplay={gameplay} onPatch={onPatch}/>
    <AssetBinding title="Character Forge rig" value={value.characterAssetId} assets={assets} categories={['characters']} onChange={(characterAssetId) => onPatch({ characterAssetId })}/>
    <AssetBinding title="Animation set" value={value.animationAssetId} assets={assets} categories={['animations']} onChange={(animationAssetId) => onPatch({ animationAssetId })}>
      <label className="gameplay-inline-upload">Import animation GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImportAnimation(file); event.currentTarget.value = '' }}/></label>
    </AssetBinding>
  </EditorSection>
}

function EnemyEditor({ value, gameplay, assets, onPatch }: { value: ForgeEnemyDefinition; gameplay: ForgeGameplayContent; assets: LibraryAsset[]; onPatch: (patch: Partial<ForgeEnemyDefinition>) => void }) {
  return <EditorSection title={value.name} subtitle="AI tuning and authored presentation. Wind-up directly controls dodge readability.">
    <FieldGrid>
      <TextField label="Name" value={value.name} onChange={(name) => onPatch({ name })}/>
      <NumberField label="Health" value={value.maxHealth} min={1} max={10000} step={5} onChange={(maxHealth) => onPatch({ maxHealth })}/>
      <NumberField label="Move speed" value={value.moveSpeed} min={0.5} max={25} step={0.1} onChange={(moveSpeed) => onPatch({ moveSpeed })}/>
      <NumberField label="Aggro range" value={value.aggroRange} min={1} max={80} step={0.5} onChange={(aggroRange) => onPatch({ aggroRange })}/>
      <NumberField label="Attack range" value={value.attackRange} min={0.5} max={12} step={0.1} onChange={(attackRange) => onPatch({ attackRange })}/>
      <NumberField label="Attack damage" value={value.attackDamage} min={1} max={1000} step={1} onChange={(attackDamage) => onPatch({ attackDamage })}/>
      <NumberField label="Attack cooldown" value={value.attackCooldown} min={0.1} max={10} step={0.05} onChange={(attackCooldown) => onPatch({ attackCooldown })}/>
      <NumberField label="Attack wind-up" value={value.attackWindup ?? 0.42} min={0.12} max={1.5} step={0.02} onChange={(attackWindup) => onPatch({ attackWindup })}/>
      <ColorField label="Fallback color" value={value.color} onChange={(color) => onPatch({ color })}/>
      <SelectField label="Loot table" value={value.lootTable} options={gameplay.lootTables.map((table) => [table.id, table.name] as [string, string])} onChange={(lootTable) => onPatch({ lootTable })}/>
    </FieldGrid>
    <AssetBinding title="Character Forge rig" value={value.characterAssetId} assets={assets} categories={['characters']} onChange={(characterAssetId) => onPatch({ characterAssetId })}/>
    <AssetBinding title="Animation set" value={value.animationAssetId} assets={assets} categories={['animations']} onChange={(animationAssetId) => onPatch({ animationAssetId })}/>
    <div className="gameplay-vfx-bindings"><AssetBinding title="Attack wind-up VFX" value={value.attackVfxAssetId} assets={assets} categories={['vfx']} onChange={(attackVfxAssetId) => onPatch({ attackVfxAssetId })}/><AssetBinding title="Hit VFX" value={value.hitVfxAssetId} assets={assets} categories={['vfx']} onChange={(hitVfxAssetId) => onPatch({ hitVfxAssetId })}/><AssetBinding title="Death VFX" value={value.deathVfxAssetId} assets={assets} categories={['vfx']} onChange={(deathVfxAssetId) => onPatch({ deathVfxAssetId })}/></div>
  </EditorSection>
}

function AbilityEditor({ value, assets, onPatch }: { value: ForgeAbilityDefinition; assets: LibraryAsset[]; onPatch: (patch: Partial<ForgeAbilityDefinition>) => void }) {
  return <EditorSection title={value.name} subtitle="Combat numbers, hit shape, animation cue and Forge VFX binding.">
    <FieldGrid><TextField label="Name" value={value.name} onChange={(name) => onPatch({ name })}/><SelectField label="Kind" value={value.kind} options={[["melee","Melee"],["area","Area"]]} onChange={(kind) => onPatch({ kind: kind as ForgeAbilityDefinition['kind'] })}/><SelectField label="Input" value={value.input} options={[["primary","LMB / Primary"],["skill-1","Q / Skill 1"]]} onChange={(input) => onPatch({ input: input as ForgeAbilityDefinition['input'] })}/><NumberField label="Damage" value={value.damage} min={0} max={5000} step={1} onChange={(damage) => onPatch({ damage })}/><NumberField label="Cooldown" value={value.cooldown} min={0} max={30} step={0.05} onChange={(cooldown) => onPatch({ cooldown })}/><NumberField label="Range" value={value.range} min={0.5} max={30} step={0.1} onChange={(range) => onPatch({ range })}/><NumberField label="Radius" value={value.radius} min={0.2} max={20} step={0.1} onChange={(radius) => onPatch({ radius })}/><ColorField label="Fallback VFX color" value={value.color} onChange={(color) => onPatch({ color })}/></FieldGrid>
    <AssetBinding title="VFX Studio effect" value={value.vfxAssetId} assets={assets} categories={['vfx']} onChange={(vfxAssetId) => onPatch({ vfxAssetId })}/>
  </EditorSection>
}

function ItemEditor({ value, assets, onPatch }: { value: ForgeItemDefinition; assets: LibraryAsset[]; onPatch: (patch: Partial<ForgeItemDefinition>) => void }) {
  return <EditorSection title={value.name} subtitle="Quick stat editing here; use Item Forge for taxonomy, defense, master model, icon, drop and equipped presentation."><FieldGrid><TextField label="Name" value={value.name} onChange={(name) => onPatch({ name })}/><SelectField label="Rarity" value={value.rarity} options={[["common","Common"],["magic","Magic"],["rare","Rare"]]} onChange={(rarity) => onPatch({ rarity: rarity as ForgeItemDefinition['rarity'] })}/><NumberField label="Damage bonus" value={value.damageBonus} min={0} max={2000} step={1} onChange={(damageBonus) => onPatch({ damageBonus })}/><ColorField label="Drop color" value={value.color} onChange={(color) => onPatch({ color })}/></FieldGrid><AssetBinding title="Compatibility model" value={value.modelAssetId} assets={assets} categories={['props']} onChange={(modelAssetId) => onPatch({ modelAssetId })}/></EditorSection>
}

function LootEditor({ value, gameplay, onPatch }: { value: ForgeLootTableDefinition; gameplay: ForgeGameplayContent; onPatch: (patch: Partial<ForgeLootTableDefinition>) => void }) {
  return <EditorSection title={value.name} subtitle="Visual loot authoring. Every row independently rolls its configured drop chance."><FieldGrid><TextField label="Name" value={value.name} onChange={(name) => onPatch({ name })}/></FieldGrid><div className="gameplay-loot-list">{value.entries.map((entry, index) => <div className="gameplay-loot-row" key={`${entry.itemId}-${index}`}><select value={entry.itemId} onChange={(event) => { const entries = [...value.entries]; entries[index] = { ...entry, itemId: event.target.value }; onPatch({ entries }) }}>{gameplay.items.map((gameItem) => <option key={gameItem.id} value={gameItem.id}>{gameItem.name}</option>)}</select><input type="range" min="0" max="1" step="0.05" value={entry.chance} onChange={(event) => { const entries = [...value.entries]; entries[index] = { ...entry, chance: Number(event.target.value) }; onPatch({ entries }) }}/><b>{Math.round(entry.chance * 100)}%</b><button onClick={() => onPatch({ entries: value.entries.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>)}<button className="gameplay-add-row" disabled={!gameplay.items.length} onClick={() => onPatch({ entries: [...value.entries, { itemId: gameplay.items[0].id, chance: 0.5 }] })}>+ Add loot entry</button></div></EditorSection>
}

function ContentPicker({ label, items, value, onChange }: { label: string; items: Array<{ id: string; name: string }>; value: string; onChange: (value: string) => void }) { return <div className="gameplay-content-picker"><span>{label}</span>{items.map((entry) => <button key={entry.id} className={entry.id === value ? 'active' : ''} onClick={() => onChange(entry.id)}>{entry.name}<small>{entry.id}</small></button>)}</div> }
function AssetBinding({ title, value, assets, categories, onChange, children }: { title: string; value?: string; assets: LibraryAsset[]; categories: AssetCategory[]; onChange: (value: string | undefined) => void; children?: ReactNode }) { const options = assets.filter((asset) => categories.includes(asset.category)); return <section className="gameplay-asset-binding"><div><strong>{title}</strong><small>{value ? 'Bound to Shared Asset Library' : 'Runtime placeholder / fallback'}</small></div><select value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}><option value="">None / fallback</option>{options.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>{children}</section> }
function EditorSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) { return <section className="gameplay-editor-card"><header><div><span className="eyebrow">ACTIVE DEFINITION</span><h2>{title}</h2><p>{subtitle}</p></div></header>{children}</section> }
function FieldGrid({ children }: { children: ReactNode }) { return <div className="gameplay-field-grid">{children}</div> }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="gameplay-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)}/></label> }
function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) { return <label className="gameplay-field"><span>{label}</span><input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}/></label> }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="gameplay-field gameplay-color-field"><span>{label}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)}/><code>{value}</code></div></label> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string,string]>; onChange: (value: string) => void }) { return <label className="gameplay-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label> }
function BindingRow({ label, bound }: { label: string; bound: boolean }) { return <div className={bound ? 'gameplay-binding-row bound' : 'gameplay-binding-row'}><i/><span>{label}</span><strong>{bound ? 'Bound' : 'Fallback'}</strong></div> }
function TabButton({ icon: Icon, label, count, active, onClick }: { icon: typeof Swords; label: string; count?: number; active: boolean; onClick: () => void }) { return <button className={active ? 'active' : ''} onClick={onClick}><Icon size={15}/><span>{label}</span>{count !== undefined && <b>{count}</b>}</button> }
async function importAnimation(file: File) { return await saveAsset({ name: file.name.replace(/\.glb$/i, ''), category: 'animations', kind: 'glb', mime: file.type || 'model/gltf-binary', tags: ['animation', 'skillbound'], source: 'Gameplay Forge animation import', blob: file }) }
function promptName(label: string, fallback: string) { const value = window.prompt(label, fallback)?.trim(); return value || undefined }
function cloneDefinition<T extends { id: string; name: string }>(value: T, id: string, name: string): T { return { ...JSON.parse(JSON.stringify(value)) as T, id, name } }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)) }
