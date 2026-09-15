# Skillbound 2 inside Forge Studio

## Decision

Skillbound 2 is a **Forge project**, not a separate Three.js prototype that happens to import Forge assets.

Forge is split into two responsibilities:

- **Forge Studio** authors project data: worlds, regions, scenes, dungeons, UI, characters, enemies, abilities, items, loot, VFX, audio and materials.
- **Forge Runtime** consumes that project data and owns reusable game-side systems: rendering, scene/entity loading, input, ARPG movement, animation, abilities, world generation, streaming and persistence.

Skillbound-specific React pages must not become the place where engine systems live. React is editor chrome. Runtime/gameplay code belongs below the editor in reusable engine modules.

## Existing Forge systems we keep

Forge already has useful authoring/runtime pieces:

- asset library and connected-project export flow
- character packages and rig/attachment tooling
- animation/mocap tooling
- material and texture tooling
- VFX packages plus a reusable Three.js VFX runtime
- Map Studio dungeon packages, validation, encounters, doors, triggers, props and an ARPG playtest viewport
- UI Forge design-system work
- game-like asset preview

These are not discarded. Later phases move their output behind a common Forge project contract.

## Project layout

The first real project lives under `public/projects/skillbound/`:

```text
projects/skillbound/
  project.forge.json
  worlds/
    act1.world.json
  regions/
    deadwood.region.json
    drowned-march.region.json
```

Future project folders are intentionally reserved for:

```text
scenes/
dungeons/
characters/
enemies/
abilities/
items/
loot/
ui/
vfx/
audio/
materials/
```

The editor can keep unsaved/working overrides locally, but the bundled JSON files define the project baseline and are the shape a source-controlled Forge project uses.

## Guided procedural world

Generation follows this hierarchy:

```text
world seed + generation version
        ↓
campaign/world graph
        ↓
region grammar
        ↓
guaranteed entry → exit route
        ↓
optional exploration branches
        ↓
landmarks + encounter spaces
        ↓
biome/local dressing
```

The Phase 1 generator deliberately validates connectivity before visual dressing. It is deterministic from `worldSeed + generationVersion + regionId`.

A generation version is part of world identity. Future algorithm changes must either preserve old generation behavior or explicitly migrate persisted discovered geography.

## Persistence model

Do not save regenerated geometry as the primary source of truth. Save:

- world seed
- generation version
- character/game progression
- stable IDs for persistent discoveries/interactions
- explicit permanent changes (waypoint discovered, unique chest opened, event completed, shrine activated, boss killed, etc.)

Renewable enemies/resources get separate respawn rules.

## Phase 1 implemented

1. Forge Project Manager recognizes Skillbound as an active Forge project.
2. World Forge loads project/world/region definitions.
3. Seeded guided generation produces a guaranteed main route, side branches, landmarks and an encounter marker.
4. The editor exposes generation controls and visual overlays.
5. Navigation validation proves Entry can reach Exit.
6. Save writes the editor workspace.
7. Play From Here renders the exact same generated runtime data through reusable `ForgePlayRuntime` in a 3D Three.js ARPG-style view with WASD, mouse aiming and zoom.

That proves the critical loop:

```text
FORGE PROJECT
  → EDIT / GENERATE
  → SAVE
  → PLAY FROM HERE
  → FORGE RUNTIME USES THE SAME CONTENT
```

## Phase 2

Phase 2 should make the vertical slice playable rather than broadening editor scope:

- expand `ForgePlayRuntime` into the reusable gameplay runtime with collision, entities, systems and scene lifecycle
- introduce entity/component definitions (Transform, Model, Collider, Stats, EnemyAI, AbilitySet, LootTable, Interactable)
- placeholder player entity + ARPG movement/collision
- one enemy entity + simple AI
- one basic attack, one active skill and one dodge
- one loot item + small inventory/equipment data model
- Forge-authored HUD runtime definition (not a visual-only mockup)
- persistent world save containing seed/version plus one completed interaction
- let Map Studio dungeon packages become first-class `dungeons/*.dungeon.json` project content

Do **not** add multiplayer during these phases. Keep system boundaries deterministic/data-driven so networking is not architecturally impossible later, but optimize for the single-player runtime first.
