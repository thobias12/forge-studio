import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Box,
  Copy,
  Dice5,
  FolderSync,
  Landmark,
  Link2,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import {
  loadSkillboundWorkspace,
  saveSkillboundWorkspace,
  type ForgeLootEntry,
  type ForgeLootRewardRange,
  type ForgeLootRollMode,
  type ForgeLootTableDefinition,
  type ForgeProjectWorkspace,
} from '../engine/forgeProject'
import {
  addManagedManifestPath,
  createLootTableDefinition,
  duplicateName,
  findGameplayReferences,
  removeManagedManifestPath,
  slugContentId,
  uniqueContentId,
} from '../engine/contentManagement'
import {
  rollLootTable,
  simulateLootTable,
} from '../engine/lootForge'
import {
  getSkillboundProjectConnection,
  saveSkillboundWorkspaceToProjectFolder,
} from '../engine/projectPersistence'
import {
  loadPropPrefabs,
  savePropPrefabs,
  touchPropPrefab,
  type PropPrefab,
} from '../lib/propPrefab'
import {
  loadPoiPrefabs,
  savePoiPrefabs,
  touchPoiPrefab,
  type PoiPrefab,
} from '../lib/poiPrefab'
import '../loot-forge.css'

const PREVIEW_RUNS = 250

export default function LootForge() {
  const [workspace, setWorkspace] =
    useState<ForgeProjectWorkspace>()
  const [props, setProps] = useState<PropPrefab[]>([])
  const [pois, setPois] = useState<PoiPrefab[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [previewSeed, setPreviewSeed] = useState(1)
  const [sourceConnected, setSourceConnected] =
    useState(false)
  const [status, setStatus] = useState(
    'Opening Loot & Container Forge…',
  )

  useEffect(() => {
    void Promise.all([
      loadSkillboundWorkspace(),
      getSkillboundProjectConnection().catch(
        () => undefined,
      ),
    ])
      .then(([project, connection]) => {
        setWorkspace(project)
        setProps(loadPropPrefabs())
        setPois(loadPoiPrefabs())
        setSelectedId(
          project.gameplay.lootTables.find(
            (table) => table.id === 'world-cache',
          )?.id ??
            project.gameplay.lootTables[0]?.id ??
            '',
        )
        setSourceConnected(
          connection?.permission === 'granted' ||
            connection?.permission === 'prompt',
        )
        setStatus(
          'Loot tables, container sockets and enemy drops share the same runtime data.',
        )
      })
      .catch((error) =>
        setStatus(
          error instanceof Error
            ? error.message
            : 'Could not open Loot Forge.',
        ),
      )
  }, [])

  const active = workspace?.gameplay.lootTables.find(
    (table) => table.id === selectedId,
  ) ?? workspace?.gameplay.lootTables[0]

  const simulation = useMemo(
    () =>
      active
        ? simulateLootTable(
            active,
            PREVIEW_RUNS,
            `${active.id}:preview:${previewSeed}`,
          )
        : undefined,
    [active, previewSeed],
  )

  const singleRoll = useMemo(
    () =>
      active
        ? rollLootTable(
            active,
            `${active.id}:single:${previewSeed}`,
          )
        : undefined,
    [active, previewSeed],
  )

  const containerBindings = useMemo(() => {
    const rows: Array<{
      scope: 'prop' | 'poi'
      prefabId: string
      prefabName: string
      socketId: string
      socketName: string
      targetRef?: string
    }> = []

    for (const prefab of props) {
      for (const socket of prefab.sockets) {
        if (
          socket.kind !== 'loot' &&
          socket.action !== 'container'
        ) {
          continue
        }
        rows.push({
          scope: 'prop',
          prefabId: prefab.id,
          prefabName: prefab.name,
          socketId: socket.id,
          socketName: socket.name,
          targetRef: socket.targetRef,
        })
      }
    }

    for (const prefab of pois) {
      for (const socket of prefab.sockets) {
        if (
          socket.kind !== 'loot' &&
          socket.action !== 'container'
        ) {
          continue
        }
        rows.push({
          scope: 'poi',
          prefabId: prefab.id,
          prefabName: prefab.name,
          socketId: socket.id,
          socketName: socket.name,
          targetRef: socket.targetRef,
        })
      }
    }

    return rows
  }, [props, pois])

  if (!workspace) {
    return (
      <div className="loot-forge-loading">
        <PackageOpen size={28}/>
        <strong>Loot & Container Forge</strong>
        <span>{status}</span>
      </div>
    )
  }

  const commitWorkspace = (
    next: ForgeProjectWorkspace,
    message?: string,
  ) => {
    const saved = saveSkillboundWorkspace(next)
    setWorkspace(saved)
    if (message) setStatus(message)
    return saved
  }

  const patchTable = (
    patch: Partial<ForgeLootTableDefinition>,
    message?: string,
  ) => {
    if (!active) return
    commitWorkspace(
      {
        ...workspace,
        gameplay: {
          ...workspace.gameplay,
          lootTables:
            workspace.gameplay.lootTables.map(
              (table) =>
                table.id === active.id
                  ? { ...table, ...patch }
                  : table,
            ),
        },
      },
      message,
    )
  }

  const createTable = () => {
    const name =
      window
        .prompt('Loot table name', 'New Loot Table')
        ?.trim() || ''
    if (!name) return
    const id = uniqueContentId(
      slugContentId(name),
      workspace.gameplay.lootTables.map(
        (table) => table.id,
      ),
    )
    const table = createLootTableDefinition(
      name,
      id,
      workspace,
    )
    const next = commitWorkspace(
      {
        ...workspace,
        manifest: addManagedManifestPath(
          workspace.manifest,
          'loot',
          id,
        ),
        gameplay: {
          ...workspace.gameplay,
          lootTables: [
            ...workspace.gameplay.lootTables,
            table,
          ],
        },
      },
      `${table.name} created.`,
    )
    setWorkspace(next)
    setSelectedId(id)
    setPreviewSeed((value) => value + 1)
  }

  const duplicateTable = () => {
    if (!active) return
    const id = uniqueContentId(
      `${active.id}-copy`,
      workspace.gameplay.lootTables.map(
        (table) => table.id,
      ),
    )
    const copy = {
      ...JSON.parse(
        JSON.stringify(active),
      ) as ForgeLootTableDefinition,
      id,
      name: duplicateName(active.name),
    }
    const next = commitWorkspace(
      {
        ...workspace,
        manifest: addManagedManifestPath(
          workspace.manifest,
          'loot',
          id,
        ),
        gameplay: {
          ...workspace.gameplay,
          lootTables: [
            ...workspace.gameplay.lootTables,
            copy,
          ],
        },
      },
      `${copy.name} duplicated.`,
    )
    setWorkspace(next)
    setSelectedId(id)
    setPreviewSeed((value) => value + 1)
  }

  const deleteTable = () => {
    if (!active) return
    const gameplayRefs = findGameplayReferences(
      workspace,
      'loot',
      active.id,
    )
    const socketRefs = containerBindings
      .filter((row) => row.targetRef === active.id)
      .map(
        (row) =>
          `${row.scope === 'prop' ? 'Prop' : 'POI'} · ${row.prefabName} · ${row.socketName}`,
      )
    const refs = [...gameplayRefs, ...socketRefs]
    if (refs.length) {
      setStatus(
        `Cannot delete ${active.name}. Still used by: ${refs.join(' · ')}`,
      )
      return
    }
    if (
      !window.confirm(
        `Delete ${active.name} from the Skillbound project?`,
      )
    ) {
      return
    }
    const remaining =
      workspace.gameplay.lootTables.filter(
        (table) => table.id !== active.id,
      )
    const next = commitWorkspace(
      {
        ...workspace,
        manifest: removeManagedManifestPath(
          workspace.manifest,
          'loot',
          active.id,
        ),
        gameplay: {
          ...workspace.gameplay,
          lootTables: remaining,
        },
      },
      'Loot table deleted.',
    )
    setWorkspace(next)
    setSelectedId(remaining[0]?.id ?? '')
  }

  const patchEntry = (
    index: number,
    patch: Partial<ForgeLootEntry>,
  ) => {
    if (!active) return
    const entries = active.entries.map(
      (entry, entryIndex) =>
        entryIndex === index
          ? { ...entry, ...patch }
          : entry,
    )
    patchTable({ entries })
  }

  const addEntry = () => {
    if (!active || !workspace.gameplay.items.length) {
      return
    }
    const item = workspace.gameplay.items[0]
    patchTable({
      entries: [
        ...active.entries,
        {
          itemId: item.id,
          chance: .35,
          weight: 25,
          minQuantity: 1,
          maxQuantity: 1,
        },
      ],
    })
  }

  const removeEntry = (index: number) => {
    if (!active) return
    patchTable({
      entries: active.entries.filter(
        (_, entryIndex) => entryIndex !== index,
      ),
    })
  }

  const bindContainer = (
    scope: 'prop' | 'poi',
    prefabId: string,
    socketId: string,
    tableId: string,
  ) => {
    if (scope === 'prop') {
      const next = props.map((prefab) =>
        prefab.id === prefabId
          ? touchPropPrefab({
              ...prefab,
              sockets: prefab.sockets.map((socket) =>
                socket.id === socketId
                  ? {
                      ...socket,
                      targetRef:
                        tableId || undefined,
                    }
                  : socket,
              ),
            })
          : prefab,
      )
      setProps(next)
      savePropPrefabs(next)
    } else {
      const next = pois.map((prefab) =>
        prefab.id === prefabId
          ? touchPoiPrefab({
              ...prefab,
              sockets: prefab.sockets.map((socket) =>
                socket.id === socketId
                  ? {
                      ...socket,
                      targetRef:
                        tableId || undefined,
                    }
                  : socket,
              ),
            })
          : prefab,
      )
      setPois(next)
      savePoiPrefabs(next)
    }
    setStatus(
      tableId
        ? 'Container socket bound to an authored loot table.'
        : 'Container socket loot binding cleared.',
    )
  }

  const bindEnemy = (
    enemyId: string,
    tableId: string,
  ) => {
    commitWorkspace(
      {
        ...workspace,
        gameplay: {
          ...workspace.gameplay,
          enemies: workspace.gameplay.enemies.map(
            (enemy) =>
              enemy.id === enemyId
                ? {
                    ...enemy,
                    lootTable: tableId,
                  }
                : enemy,
          ),
        },
      },
      'Enemy drop table updated.',
    )
  }

  const writeSource = async () => {
    try {
      setStatus(
        'Writing Loot Forge tables to the connected Skillbound source…',
      )
      const written =
        await saveSkillboundWorkspaceToProjectFolder(
          workspace,
        )
      const saved =
        saveSkillboundWorkspace(written)
      setWorkspace(saved)
      setStatus(
        `Source written · project content revision ${written.manifest.contentRevision ?? 1}.`,
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not write Loot Forge source.',
      )
    }
  }

  return (
    <div className="loot-forge-page">
      <header className="loot-forge-toolbar">
        <div>
          <span>SKILLBOUND / GAMEPLAY ECONOMY</span>
          <strong>Loot & Container Forge</strong>
          <small>
            Author drop tables once, then bind them to
            enemies, chests, ruins and POI loot sockets.
          </small>
        </div>
        <div>
          <button
            onClick={() => {
              setProps(loadPropPrefabs())
              setPois(loadPoiPrefabs())
              setStatus(
                'Prop and POI container bindings refreshed.',
              )
            }}
          >
            <RefreshCw size={14}/>
            Refresh sockets
          </button>
          <button
            onClick={() => {
              setWorkspace(
                saveSkillboundWorkspace(workspace),
              )
              setStatus('Loot Forge workspace saved.')
            }}
          >
            <Save size={14}/>
            Save
          </button>
          <button
            className="primary"
            disabled={!sourceConnected}
            onClick={() => void writeSource()}
          >
            <FolderSync size={14}/>
            Write Source
          </button>
        </div>
      </header>

      <div className="loot-forge-layout">
        <aside className="loot-forge-library">
          <header>
            <span>LOOT TABLES</span>
            <button
              className="primary"
              onClick={createTable}
            >
              <Plus size={12}/>
              New
            </button>
          </header>

          <div className="loot-forge-table-list">
            {workspace.gameplay.lootTables.map(
              (table) => (
                <button
                  key={table.id}
                  className={
                    table.id === active?.id
                      ? 'active'
                      : ''
                  }
                  onClick={() => {
                    setSelectedId(table.id)
                    setPreviewSeed(
                      (value) => value + 1,
                    )
                  }}
                >
                  <i/>
                  <span>
                    <strong>{table.name}</strong>
                    <small>
                      {table.rollMode ??
                        'independent'}{' '}
                      · {table.entries.length} entries
                    </small>
                  </span>
                </button>
              ),
            )}
          </div>

          {active && (
            <div className="loot-forge-library-actions">
              <button onClick={duplicateTable}>
                <Copy size={12}/>
                Duplicate
              </button>
              <button
                className="danger"
                onClick={deleteTable}
              >
                <Trash2 size={12}/>
                Delete
              </button>
            </div>
          )}
        </aside>

        <main className="loot-forge-editor">
          {!active ? (
            <div className="loot-forge-empty">
              <PackageOpen size={28}/>
              <strong>No loot table selected</strong>
              <button
                className="primary"
                onClick={createTable}
              >
                <Plus size={13}/>
                Create loot table
              </button>
            </div>
          ) : (
            <>
              <section className="loot-forge-card loot-forge-definition">
                <header>
                  <div>
                    <span>ACTIVE DEFINITION</span>
                    <h2>{active.name}</h2>
                    <code>{active.id}</code>
                  </div>
                  <div className="loot-forge-mode-pill">
                    {active.rollMode ??
                      'independent'}
                  </div>
                </header>

                <div className="loot-forge-fields">
                  <LootTextField
                    label="Name"
                    value={active.name}
                    onChange={(name) =>
                      patchTable({ name })
                    }
                  />
                  <label>
                    <span>Roll mode</span>
                    <select
                      value={
                        active.rollMode ??
                        'independent'
                      }
                      onChange={(event) =>
                        patchTable({
                          rollMode:
                            event.target
                              .value as ForgeLootRollMode,
                        })
                      }
                    >
                      <option value="independent">
                        Independent chances
                      </option>
                      <option value="weighted">
                        Weighted pool
                      </option>
                    </select>
                  </label>
                  <LootNumberField
                    label="Min rolls"
                    value={active.rolls?.[0] ?? 1}
                    min={1}
                    max={20}
                    step={1}
                    onChange={(value) =>
                      patchTable({
                        rolls: [
                          value,
                          Math.max(
                            value,
                            active.rolls?.[1] ??
                              value,
                          ),
                        ],
                      })
                    }
                  />
                  <LootNumberField
                    label="Max rolls"
                    value={active.rolls?.[1] ?? 1}
                    min={
                      active.rolls?.[0] ?? 1
                    }
                    max={20}
                    step={1}
                    onChange={(value) =>
                      patchTable({
                        rolls: [
                          active.rolls?.[0] ?? 1,
                          value,
                        ],
                      })
                    }
                  />
                  <LootNumberField
                    label="Scatter radius"
                    value={
                      active.scatterRadius ?? .85
                    }
                    min={.2}
                    max={4}
                    step={.05}
                    onChange={(scatterRadius) =>
                      patchTable({
                        scatterRadius,
                      })
                    }
                  />
                  {(active.rollMode ??
                    'independent') ===
                    'weighted' && (
                    <>
                      <LootNumberField
                        label="Empty weight"
                        value={
                          active.nothingWeight ?? 0
                        }
                        min={0}
                        max={1000}
                        step={1}
                        onChange={(
                          nothingWeight,
                        ) =>
                          patchTable({
                            nothingWeight,
                          })
                        }
                      />
                      <label className="loot-check">
                        <input
                          type="checkbox"
                          checked={
                            active.allowDuplicates ??
                            true
                          }
                          onChange={(event) =>
                            patchTable({
                              allowDuplicates:
                                event.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>
                            Allow duplicate picks
                          </strong>
                          <small>
                            One item can be selected
                            multiple times in the same
                            opening.
                          </small>
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </section>

              <section className="loot-forge-card">
                <header>
                  <div>
                    <span>ITEM POOL</span>
                    <h3>
                      {active.entries.length} drop
                      entries
                    </h3>
                  </div>
                  <button
                    className="primary"
                    disabled={
                      !workspace.gameplay.items
                        .length
                    }
                    onClick={addEntry}
                  >
                    <Plus size={12}/>
                    Add item
                  </button>
                </header>

                <div className="loot-entry-header">
                  <span>Item</span>
                  <span>
                    {(active.rollMode ??
                      'independent') ===
                    'weighted'
                      ? 'Weight'
                      : 'Chance'}
                  </span>
                  <span>Qty min</span>
                  <span>Qty max</span>
                  <span/>
                </div>

                <div className="loot-entry-list">
                  {active.entries.map(
                    (entry, index) => (
                      <div
                        className="loot-entry-row"
                        key={`${entry.itemId}:${index}`}
                      >
                        <select
                          value={entry.itemId}
                          onChange={(event) =>
                            patchEntry(index, {
                              itemId:
                                event.target.value,
                            })
                          }
                        >
                          {workspace.gameplay.items.map(
                            (item) => (
                              <option
                                key={item.id}
                                value={item.id}
                              >
                                {item.name}
                              </option>
                            ),
                          )}
                        </select>

                        {(active.rollMode ??
                          'independent') ===
                        'weighted' ? (
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            value={
                              entry.weight ??
                              Math.max(
                                1,
                                Math.round(
                                  entry.chance *
                                    100,
                                ),
                              )
                            }
                            onChange={(event) =>
                              patchEntry(index, {
                                weight: clamp(
                                  Number(
                                    event.target
                                      .value,
                                  ),
                                  0,
                                  10000,
                                ),
                              })
                            }
                          />
                        ) : (
                          <div className="loot-chance-control">
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={.01}
                              value={
                                entry.chance
                              }
                              onChange={(
                                event,
                              ) =>
                                patchEntry(index, {
                                  chance: clamp(
                                    Number(
                                      event.target
                                        .value,
                                    ),
                                    0,
                                    1,
                                  ),
                                })
                              }
                            />
                            <b>
                              {Math.round(
                                entry.chance *
                                  100,
                              )}
                              %
                            </b>
                          </div>
                        )}

                        <input
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          value={
                            entry.minQuantity ?? 1
                          }
                          onChange={(event) => {
                            const value = clamp(
                              Number(
                                event.target.value,
                              ),
                              1,
                              99,
                            )
                            patchEntry(index, {
                              minQuantity: value,
                              maxQuantity: Math.max(
                                value,
                                entry.maxQuantity ??
                                  value,
                              ),
                            })
                          }}
                        />
                        <input
                          type="number"
                          min={
                            entry.minQuantity ?? 1
                          }
                          max={99}
                          step={1}
                          value={
                            entry.maxQuantity ??
                            entry.minQuantity ??
                            1
                          }
                          onChange={(event) =>
                            patchEntry(index, {
                              maxQuantity: clamp(
                                Number(
                                  event.target
                                    .value,
                                ),
                                entry.minQuantity ??
                                  1,
                                99,
                              ),
                            })
                          }
                        />
                        <button
                          className="danger icon"
                          title="Remove entry"
                          onClick={() =>
                            removeEntry(index)
                          }
                        >
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </section>

              <section className="loot-forge-card">
                <header>
                  <div>
                    <span>BONUS REWARDS</span>
                    <h3>Gold & experience</h3>
                  </div>
                </header>
                <div className="loot-reward-grid">
                  <RewardEditor
                    title="Gold"
                    value={active.gold}
                    onChange={(gold) =>
                      patchTable({ gold })
                    }
                  />
                  <RewardEditor
                    title="Experience"
                    value={active.xp}
                    onChange={(xp) =>
                      patchTable({ xp })
                    }
                  />
                </div>
              </section>
            </>
          )}
        </main>

        <aside className="loot-forge-right">
          {active && simulation && singleRoll && (
            <section className="loot-forge-preview">
              <header>
                <div>
                  <span>ROLL PREVIEW</span>
                  <strong>
                    {PREVIEW_RUNS} simulated
                    openings
                  </strong>
                </div>
                <button
                  onClick={() =>
                    setPreviewSeed(
                      (value) => value + 1,
                    )
                  }
                >
                  <Dice5 size={13}/>
                  Reroll
                </button>
              </header>

              <div className="loot-preview-sample">
                <span>NEXT SAMPLE</span>
                {singleRoll.items.length ? (
                  singleRoll.items.map(
                    (rolled) => {
                      const item =
                        workspace.gameplay.items.find(
                          (candidate) =>
                            candidate.id ===
                            rolled.itemId,
                        )
                      return (
                        <div
                          key={rolled.itemId}
                        >
                          <i
                            style={{
                              background:
                                item?.color ??
                                '#718077',
                            }}
                          />
                          <strong>
                            {item?.name ??
                              rolled.itemId}
                          </strong>
                          <b>
                            ×{rolled.quantity}
                          </b>
                        </div>
                      )
                    },
                  )
                ) : (
                  <small>No item drop</small>
                )}
                {(singleRoll.gold > 0 ||
                  singleRoll.xp > 0) && (
                  <small>
                    {singleRoll.gold > 0
                      ? `${singleRoll.gold} gold`
                      : ''}
                    {singleRoll.gold > 0 &&
                    singleRoll.xp > 0
                      ? ' · '
                      : ''}
                    {singleRoll.xp > 0
                      ? `${singleRoll.xp} XP`
                      : ''}
                  </small>
                )}
              </div>

              <div className="loot-preview-metrics">
                <Metric
                  value={simulation.averageItems.toFixed(
                    2,
                  )}
                  label="avg items"
                />
                <Metric
                  value={simulation.averageGold.toFixed(
                    1,
                  )}
                  label="avg gold"
                />
                <Metric
                  value={simulation.averageXp.toFixed(
                    1,
                  )}
                  label="avg XP"
                />
                <Metric
                  value={`${Math.round(
                    simulation.emptyRuns /
                      simulation.runs *
                      100,
                  )}%`}
                  label="empty"
                />
              </div>

              <div className="loot-preview-results">
                {simulation.rows.map((row) => {
                  const item =
                    workspace.gameplay.items.find(
                      (candidate) =>
                        candidate.id === row.itemId,
                    )
                  const hitPercent =
                    row.hitRuns /
                    simulation.runs *
                    100
                  return (
                    <div key={row.itemId}>
                      <span>
                        <i
                          style={{
                            background:
                              item?.color ??
                              '#718077',
                          }}
                        />
                        <strong>
                          {item?.name ??
                            row.itemId}
                        </strong>
                      </span>
                      <em>
                        {hitPercent.toFixed(1)}%
                        {' · '}
                        {row.totalQuantity} total
                      </em>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="loot-forge-bindings">
            <header>
              <Link2 size={14}/>
              <div>
                <span>CONTAINER BINDINGS</span>
                <strong>
                  {containerBindings.length} loot
                  sockets
                </strong>
              </div>
            </header>

            <div className="loot-binding-list">
              {containerBindings.map((row) => (
                <div
                  key={`${row.scope}:${row.prefabId}:${row.socketId}`}
                >
                  <span className="loot-binding-icon">
                    {row.scope === 'prop' ? (
                      <Box size={13}/>
                    ) : (
                      <Landmark size={13}/>
                    )}
                  </span>
                  <span>
                    <strong>
                      {row.prefabName}
                    </strong>
                    <small>{row.socketName}</small>
                  </span>
                  <select
                    value={row.targetRef ?? ''}
                    onChange={(event) =>
                      bindContainer(
                        row.scope,
                        row.prefabId,
                        row.socketId,
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Unassigned
                    </option>
                    {workspace.gameplay.lootTables.map(
                      (table) => (
                        <option
                          key={table.id}
                          value={table.id}
                        >
                          {table.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              ))}
              {!containerBindings.length && (
                <p>
                  Add a Loot/Container socket in Prop
                  Forge or POI Forge and it will appear
                  here.
                </p>
              )}
            </div>
          </section>

          <section className="loot-forge-bindings">
            <header>
              <PackageOpen size={14}/>
              <div>
                <span>ENEMY DROPS</span>
                <strong>
                  {workspace.gameplay.enemies.length}{' '}
                  enemies
                </strong>
              </div>
            </header>
            <div className="loot-binding-list enemy">
              {workspace.gameplay.enemies.map(
                (enemy) => (
                  <div key={enemy.id}>
                    <span className="loot-binding-icon enemy">
                      <PackageOpen size={13}/>
                    </span>
                    <span>
                      <strong>{enemy.name}</strong>
                      <small>{enemy.id}</small>
                    </span>
                    <select
                      value={enemy.lootTable}
                      onChange={(event) =>
                        bindEnemy(
                          enemy.id,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        No table
                      </option>
                      {workspace.gameplay.lootTables.map(
                        (table) => (
                          <option
                            key={table.id}
                            value={table.id}
                          >
                            {table.name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                ),
              )}
            </div>
          </section>
        </aside>
      </div>

      <footer className="loot-forge-status">
        <span>{status}</span>
        <strong>
          {sourceConnected
            ? 'Connected source available'
            : 'Workspace mode · source write requires a connected project folder'}
        </strong>
      </footer>
    </div>
  )
}

function RewardEditor({
  title,
  value,
  onChange,
}: {
  title: string
  value?: ForgeLootRewardRange
  onChange: (
    value: ForgeLootRewardRange | undefined,
  ) => void
}) {
  const enabled = Boolean(value)
  const current = value ?? {
    min: 1,
    max: 5,
    chance: .5,
  }
  return (
    <div className="loot-reward-editor">
      <header>
        <strong>{title}</strong>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? current
                  : undefined,
              )
            }
          />
          Enabled
        </label>
      </header>
      <div>
        <LootNumberField
          label="Min"
          value={current.min}
          min={0}
          max={100000}
          step={1}
          disabled={!enabled}
          onChange={(min) =>
            onChange({
              ...current,
              min,
              max: Math.max(min, current.max),
            })
          }
        />
        <LootNumberField
          label="Max"
          value={current.max}
          min={current.min}
          max={100000}
          step={1}
          disabled={!enabled}
          onChange={(max) =>
            onChange({ ...current, max })
          }
        />
        <label>
          <span>Chance</span>
          <div className="loot-reward-chance">
            <input
              type="range"
              min={0}
              max={1}
              step={.01}
              disabled={!enabled}
              value={current.chance}
              onChange={(event) =>
                onChange({
                  ...current,
                  chance: clamp(
                    Number(event.target.value),
                    0,
                    1,
                  ),
                })
              }
            />
            <b>
              {Math.round(current.chance * 100)}%
            </b>
          </div>
        </label>
      </div>
    </div>
  )
}

function LootTextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
      />
    </label>
  )
}

function LootNumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            clamp(
              Number(event.target.value),
              min,
              max,
            ),
          )
        }
      />
    </label>
  )
}

function Metric({
  value,
  label,
}: {
  value: string
  label: string
}) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(
      max,
      Number.isFinite(value) ? value : min,
    ),
  )
}
