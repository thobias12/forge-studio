# Forge Studio

> **Current Forge version:** `v1.75.0`  
> **Active game project:** Skillbound  
> **Runtime:** Three.js / browser  
> **Repository:** `thobias12/forge-studio`  
> **Live build:** https://thobias12.github.io/forge-studio/  
> **Last handbook update:** 2026-09-19

Forge Studio is a browser-based game-development workspace and runtime used to build **Skillbound**. It combines world authoring, gameplay content, characters, animation, equipment, VFX, audio, UI, models, props, dungeons, validation, and the playable Three.js runtime in one project.

The long-term direction is to make Forge itself the content-production tool. The preferred workflow is **Forge Studio + ChatGPT**, with external generation tools such as Astra treated as optional references rather than a requirement for every asset.

---

# New ChatGPT conversation: read this first

If a new ChatGPT conversation is going to work on Forge Studio, use this README as the first project handoff.

A good opening instruction is:

> Read the current `README.md`, `src/version.ts`, and the relevant implementation on `main` in `thobias12/forge-studio`. Treat the README as the project handbook, but treat current source code as authoritative if they disagree. Continue the project from the current release. Inspect before editing, implement changes yourself through GitHub, build-test them, merge them, and verify the GitHub Pages deployment.

## Rules for future Forge work

1. **Inspect the current implementation before changing it.**
2. Work from the latest `main`; do not assume an older chat still reflects the repo.
3. For substantial changes, create a branch, implement the change, run a real `npm run build` in GitHub Actions, open a PR, merge it, then verify the production Pages workflow.
4. Update `src/version.ts` for product releases.
5. Keep runtime behavior deterministic where practical. Do not introduce new `Math.random()` calls into world/gameplay/VFX runtime paths when a seeded or authored value can be used instead.
6. Do not reduce visual quality, enemy counts, or authored features as a first response to performance problems. Profile or isolate the bottleneck first.
7. Avoid reopening stable systems unrelated to the requested change unless the new work truly depends on them.
8. Preserve the boundary between **Forge Runtime**, **Skillbound authored project data**, and the **Shared Asset Library**.
9. Large binary assets should normally live in the Forge Library/import workflow rather than being duplicated into Git unless there is a strong reason.
10. After a major new Forge feature, update this README so a future conversation can recover the current state quickly.

---

# Product direction

Forge started as a mocap/animation tool and has grown into the main editor and runtime environment for Skillbound.

The current goal is not to create dozens of disconnected mini-tools. The goal is one coherent production workflow:

```text
Project data
    ↓
World / gameplay / characters / equipment / VFX / audio / UI authoring
    ↓
Shared Forge Asset Library
    ↓
Forge Runtime
    ↓
Play Project / validation
```

The active project is **Skillbound**, currently configured as:

- renderer: Three.js
- mode: single-player
- generation version: 2
- project content revision: 11
- entry world: `act1`

The bundled Skillbound manifest currently includes:

- worlds
- regions
- one authored dungeon
- encounters
- a boss
- player definition
- six abilities
- enemy definitions
- items
- loot tables
- UI definition

See `public/projects/skillbound/project.forge.json` for the current manifest.

---

# Technology

- React 18
- TypeScript
- Three.js
- Vite
- IndexedDB for the local Shared Asset Library
- File System Access API where supported for connected project-source folders
- MediaPipe Tasks Vision for phone mocap
- PeerJS / WebRTC for live phone pose streaming
- GitHub Pages for production deployment
- GitHub Actions for build/deploy

Local development:

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run build
```

The GitHub Pages workflow is `.github/workflows/deploy-pages.yml`. Every push to `main` builds the app, uploads `dist`, and deploys it to Pages.

---

# Forge navigation and tools

The sidebar is grouped into **Project**, **World**, **Characters**, **Gameplay**, **Assets**, and **Engine**.

## Project

### Control Center

The Control Center is the top-level Skillbound cockpit.

It provides:

- active project state
- project health
- content registry statistics
- integration pipeline status
- global content search
- shortcuts into Play Project, World Forge, and Validation
- readiness/warning/missing status across project systems

Important source:

- `src/pages/Dashboard.tsx`
- `src/engine/contentRegistry.ts`

### Project Manager

Project Manager owns the Forge/Skillbound data boundary.

It supports:

- loading the bundled Skillbound project
- browser working-copy persistence
- restoring bundled defaults
- connecting the real Skillbound project source folder
- reading project JSON from the connected folder
- writing authored changes back to the connected folder
- project manifest/world/region/gameplay overview
- content revision tracking

Important source:

- `src/pages/ProjectManager.tsx`
- `src/engine/forgeProject.ts`
- `src/engine/projectPersistence.ts`
- `public/projects/skillbound/`

### World Forge

World Forge authors and previews seeded Skillbound regions.

Current capabilities include:

- guided seeded world generation
- region grammar
- size/mood controls
- elevation
- cliffs
- water
- forest density
- open-space balance
- exploration
- loops
- secret paths
- verticality
- POI density
- biome selection
- generation-layer seeds
- locks for terrain/routes/POIs/dressing
- route/branch/landmark/biome/boundary debug layers
- river debugging
- POI prefab integration
- play-mode handoff

Current biome/mood work includes darker variants such as Deadwood/bleak presentation.

Important source:

- `src/pages/WorldForge.tsx`
- `src/components/WorldForgeViewport.tsx`
- `src/engine/guidedWorld.ts`

### Play Project

This is the playable Skillbound runtime using the same authored Forge project data.

It is not a separate mock game. World, enemies, abilities, items, loot, UI, saves, character assets, animation, and VFX are consumed by Forge Runtime.

Important source:

- `src/pages/ProjectPlay.tsx`
- `src/engine/runtime/ForgePlayRuntime.ts`

---

# World tools

## POI Forge

POI Forge creates reusable authored landmarks and encounter spaces.

Current capabilities include:

- prefab creation
- starter POIs
- camp / settlement
- shrine / ritual
- ruins
- watchtower
- graveyard
- natural den
- custom POIs
- modular primitive/prop parts
- translate/rotate/scale workflows
- top-down view
- gameplay sockets
- interaction sockets
- prop-prefab reuse
- validation
- JSON import/export
- authored POI overrides used by World Forge

Important source:

- `src/pages/PoiForge.tsx`
- `src/lib/poiPrefab.ts`
- `src/engine/gameplaySockets.ts`

## Dungeon Forge

Dungeon Forge is the Map Studio workflow for authored dungeon layouts.

It has been developed around Skillbound dungeon creation and supports room/layout editing, placement workflows, first-person inspection, lighting/atmosphere work, and authored dungeon package integration.

Important source:

- `src/pages/MapStudio.tsx`
- dungeon/map helpers under `src/lib/` and `src/components/`

## Destruction Lab

Destruction Lab is the dedicated workspace for destruction experiments and destructible-environment authoring.

Important source:

- `src/pages/DestructionLab.tsx`

---

# Character tools

## Concept Forge

Concept Forge is the character/concept workspace used to develop visual directions and reusable character content.

It includes the dedicated **Crypt Skeleton** workflow registered in project health as a validated humanoid enemy concept with:

- curated model
- shared humanoid rig
- Idle / Walk / Attack / Death animation set
- runtime hitbox preview
- dark ARPG material direction

Important source:

- `src/pages/ConceptForge.tsx`

## Character Creator

Character Creator is the Forge character-authoring workflow for body/head/hair style character assets and Skillbound base-character standards.

The official Skillbound foundation currently uses male and female bodies with a shared **SkillboundHumanoidV1** skeleton.

Important source:

- `src/pages/CharacterForge.tsx`
- `src/lib/characterAssetRegistry.ts`

### Skillbound base-character standard

Current official base asset IDs:

- `skillbound-male-base-v1`
- `skillbound-female-base-v1`

The current male/female foundation pack uses the same **62-bone skeleton**, common proportions/scale conventions, and common gameplay sockets.

The official foundation ZIP can be imported into Forge rather than committing the GLBs directly into the repository.

The female body also has support for subtle spring-based secondary motion in the runtime binding.

## Equipment Forge

Equipment Forge is now both an **assembler** and the beginning of a native **equipment creator**.

Current version: **Equipment Creator v2**, introduced in Forge v1.75.0.

### Assemble mode

Assemble mode supports:

- official male/female Skillbound foundation selection
- installation of the Skillbound base-character ZIP
- equipment-pack ZIP import
- individual equipment GLB import
- live 3D character preview
- orbit/zoom
- pose/deformation test
- imported skinned-mesh rebinding to the active Skillbound skeleton by bone name
- body compatibility filtering
- base clothing visibility
- per-material color
- roughness
- metalness
- outfit preset save/load
- Shared Asset Library persistence

Equipment Forge authoring slots:

- Head
- Chest
- Gloves
- Legs
- Boots
- Waist
- Cape / Back
- Main Hand
- Off Hand

For the current armor standard, **shoulders are part of Chest**, not a separate equipment slot.

The current Female Adventurer Armor test pack uses slot files such as:

- `EQ_Chest.glb`
- `EQ_Gloves.glb`
- `EQ_Legs.glb`
- `EQ_Boots.glb`
- `EQ_Waist.glb`
- `EQ_Cape.glb`

### Create mode

Forge v1.75.0 added the first procedural equipment-generation layer so new designs can be created without requiring Astra for every item.

Current procedural components:

- fitted tunic/chest shell
- leather vest layer
- breastplate
- lower armor plate
- integrated left/right shoulder armor
- shoulder asymmetry
- collar
- chest straps
- waist belt
- buckle
- pouches
- tabard
- shaped cape
- cape clasps

Current editable parameters include:

- chest width
- chest depth
- chest length
- looseness
- leather vest toggle
- plate coverage
- shoulder size
- shoulder asymmetry
- collar height
- strap count
- belt width
- pouch count
- tabard length
- tabard width
- cape length
- cape width
- cape flare
- cloth color
- leather color
- metal color
- accent/cape color

Starting creator styles:

- Ranger
- Guard
- Battlemage
- Raider

Other creator features:

- deterministic **Random Variant**
- reset to style
- imported armor can be toggled as a visual reference
- generated geometry updates without reparsing the base GLB on each slider movement
- generated parts attach to Skillbound skeleton bones
- editable procedural sets can be saved to the Forge Library
- outfit presets can persist the procedural recipe
- complete creator recipes can be copied to ChatGPT, edited, pasted back, and applied

### Important Equipment Creator limitation

The procedural creator is still an early geometry system. It currently focuses on **Chest + Waist + Cape/Back** construction and does **not yet bake/export the generated set as a final standalone skinned equipment GLB**.

That export/bake step, more advanced garment geometry, gloves/boots/legs/head generation, weapon generation, and stronger body-conforming topology are future work.

Important source:

- `src/pages/EquipmentForge.tsx`
- `src/components/EquipmentForgeViewport.tsx`
- `src/components/EquipmentCreatorPanel.tsx`
- `src/engine/equipmentForge.ts`
- `src/engine/equipmentForgeProcedural.ts`

## Animation Studio

Animation Studio is the current character-animation and mocap workspace.

Forge deliberately targets a **single-phone mocap workflow**. Multi-camera capture is not part of the current plan.

Core capabilities developed across the animation stack include:

- phone browser capture
- MediaPipe Pose Landmarker
- PeerJS/WebRTC pose streaming
- humanoid rig mapping
- live retargeting
- smoothing
- mirroring
- skeleton preview
- jitter cleanup
- tracking-gap interpolation
- foot locking
- ground alignment
- motion recording
- `.forge-motion.json`
- animation clip editing
- trim/crop
- rename/duplicate/delete
- playback speed
- loop preview
- root-motion controls
- GLB animation export

### Animation Runtime 3

Forge v1.73.0 replaced the older live character-animation stack with **Runtime 3**.

Runtime 3 uses:

- semantic `.forgeanim` data
- ForgeHumanoidV2 semantic bone roles
- rest-relative quaternion animation data
- a Rig Adapter mapping semantic roles to the live target rig
- persistent locomotion states
- one-shot action states
- the same runtime controller in Animation Studio and gameplay

Current semantic animation profiles include:

- idle
- walk
- run
- attackPrimary
- cast
- dodge
- hit
- death

The live Skillbound player uses the official Male/Female body rig rather than hidden duplicate animation-target character GLBs.

---

# Gameplay authoring

## Gameplay Forge

Gameplay Forge is the high-level editor/entry point for Skillbound gameplay content and links into specialized gameplay tools.

The active runtime loop already supports:

- movement
- enemy AI
- attacks
- active abilities
- dodge
- damage
- death
- loot drops
- pickup
- inventory
- equipment
- HUD
- persistence

## Skill Forge

Skill Forge authors Skillbound abilities consumed directly by Forge Runtime.

The current Skillbound manifest includes:

- Iron Cleave
- Shield Bash
- Quick Shot
- Volley
- Arc Bolt / Chain Lightning
- Ember Burst

Important source:

- `src/pages/SkillForge.tsx`
- `public/projects/skillbound/abilities/`

## Chain Lightning

Chain Lightning received several focused releases in Forge v1.73.x.

Current behavior includes:

- chained multi-target delivery
- configurable maximum jumps
- jump radius
- delay
- damage falloff
- repeat controls
- nearest-unused-target selection
- authored bolt lifetime
- arc amplitude
- branch count
- glow width
- local light flash
- per-hop damage timing

Forge v1.73.5 moved the presentation closer to the Evergrow reference while preserving the v1.73.4 performance work.

Current presentation includes:

- leader arc visibly traveling from the caster to the first enemy
- target-to-target sequential travel
- damage on leader arrival
- bright white-hot core
- blue/violet glow layers
- deterministic jagged reshaping
- forked filaments
- moving leader-tip glow/light
- stronger target flashes
- sparks
- expanding impact halos
- previous hops persisting briefly so the chain remains readable

The current Skillbound tuning for Arc Bolt uses the authored chain configuration in:

- `public/projects/skillbound/abilities/arc-bolt.ability.json`

Important source:

- `src/engine/runtime/ForgeChainLightningRuntime.ts`
- `src/engine/runtime/ForgePlayRuntime.ts`

## Encounter Forge

Encounter Forge authors enemy/encounter compositions used by Skillbound.

The project manifest currently includes:

- Hollow Vault Ambush
- Ossuary Guard

Important source:

- `src/pages/EncounterForge.tsx`
- `public/projects/skillbound/encounters/`

## Boss Forge

Boss Forge authors boss definitions.

The current Skillbound manifest includes:

- Vault Warden

Important source:

- `src/pages/BossForge.tsx`
- `public/projects/skillbound/bosses/`

## Enemy population controls

Forge v1.73.2 added world-level enemy population/group controls.

Current authored group presets:

- Low: 2–4
- Medium: 4–6
- High: 6–9
- Horde: 9–12

World authoring can also control group range, spacing, and respawn behavior.

Play Project includes a real transient enemy test pack workflow used for combat/performance testing without polluting defeated-enemy persistence.

## Item Forge

Item Forge authors item definitions and is connected to the model-authoring workflow.

The current model handoff can open Models to create an item's master model, save it to the Library, and return to Item Forge.

Current Skillbound items include examples such as:

- Rusted Sword
- Worn Buckler
- Hunter Bow
- Ash Staff
- Road-Worn Chest
- Marsh Hood
- Gripwrap Gloves
- Drowned Greaves
- Trail Boots

Important source:

- `src/pages/ItemForge.tsx`
- `src/engine/itemMasterModel.ts`
- `public/projects/skillbound/items/`

## Loot & Containers

Loot Forge authors loot tables and container/drop behavior.

Current Skillbound loot tables include:

- Road Wretch
- World Cache

Important source:

- `src/pages/LootForge.tsx`
- `public/projects/skillbound/loot/`

---

# Inventory and equipment runtime

The playable runtime has a tetris-style inventory/equipment direction inspired by the project's current Skillbound UI work.

Runtime systems include:

- item pickup
- inventory persistence
- equip/unequip
- equipment comparison
- equipment stats
- two-handed/off-hand conflict handling
- best-equipment helpers
- runtime equipment visual binding
- save persistence

Important source:

- `src/engine/equipment.ts`
- `src/engine/runtime/ForgeEquipmentVisuals.ts`
- `src/engine/runtime/ForgePlayRuntime.ts`

The **Equipment Forge authoring slot set** is newer and broader than the older runtime equipment taxonomy. Do not assume every creator slot is already fully represented in live game equipment logic; continue integrating them deliberately.

---

# Runtime performance work

Forge v1.73.4 was a dedicated combat/runtime optimization pass, especially for enemy-death hitches.

Important changes include:

- enemy death autosaves are deferred/coalesced instead of repeatedly doing synchronous full save serialization on the kill frame
- lethal hits avoid spawning redundant hit + death VFX
- library VFX are preloaded/parsing is moved away from first-use kill frames
- VFX emitter geometry is shared/cached where possible
- Chain Lightning preallocates segment meshes and updates transforms rather than recreating geometry during flicker
- distant enemies use throttled simulation/animation updates
- enemy hot-loop temporary allocations were reduced
- corpses disappear immediately while expensive hierarchy disposal is deferred
- loot fallback appears immediately while nicer GLB work can be deferred
- damage textures are cached
- ring geometries are reused
- transient arrays use reverse-index in-place removal rather than clone/indexOf/splice patterns
- runtime scratch vectors are reused

If combat hitching is reported again, the preferred next step is **profiling/instrumentation**, not immediately removing visual effects or enemies.

---

# UI Forge

UI Forge is the Skillbound UI design-system workspace.

The current registered UI system covers:

- HUD
- inventory
- character
- skills
- shared design tokens
- responsive viewport testing
- compact / desktop / ultrawide presentation
- runtime HUD integration

Important source:

- `src/pages/UIForge.tsx`
- `public/projects/skillbound/ui/`

---

# VFX Studio

VFX Studio is a live particle/effect authoring environment.

Current capabilities include:

- preset library
- Epic/combat/magic/environment/stylized group filtering
- multiple emitters
- play/pause/restart
- grid/background preview
- duration
- looping
- emitter enable/disable
- copy/delete
- shapes:
  - point
  - cone
  - sphere
  - box
  - ring
  - sphere shell
  - arc
  - line/beam
  - spiral
  - vortex
  - ground circle
- styles:
  - soft
  - spark
  - square
  - ring
  - diamond
  - star
  - streak
  - flare
  - smoke
  - rune
  - shockwave
  - ember
  - mist
- additive/normal blend
- spawn rate
- burst
- particle limits
- lifetime
- speed
- spread
- drag
- spawn radius
- inner radius
- line length
- arc angle
- spiral turns
- radial force
- orbit/swirl
- turbulence
- delay
- color-over-life
- size-over-life
- alpha-over-life
- gravity/direction/position
- Shared Library save/load
- Forge VFX export
- undo/redo

Important source:

- `src/pages/VfxStudio.tsx`
- VFX package/runtime helpers under `src/lib/` and `src/engine/runtime/`

---

# Voice & Audio

Voice & Audio currently contains two workspaces:

- Recorder & Sound Designer
- Layer Mixer

It is intended to support authored game SFX/audio packages for Skillbound rather than relying on runtime placeholders.

Important source:

- `src/pages/AudioStudioWorkspace.tsx`
- `src/pages/AudioStudio.tsx`
- `src/pages/AudioLayerMixer.tsx`

---

# Asset tools

## Prop Forge

Prop Forge creates reusable environment/gameplay props from modular geometry.

Current capabilities include:

- reusable prop prefabs
- category filtering
- primitive part library
- box
- cylinder
- sphere
- rock
- cone
- plank
- post
- wheel
- ring
- transform tools
- collision preview
- pivot preview
- top-down/full preview modes
- gameplay sockets
- validation
- thumbnail/capture workflow
- JSON import/export
- reuse inside POI Forge

Important source:

- `src/pages/PropForge.tsx`
- `src/lib/propPrefab.ts`

## Models

Models is Forge's built-in mesh/model editor.

Current capabilities include:

- cube
- sphere
- cylinder
- plane
- object mode
- vertex mode
- face mode
- translate/rotate/scale
- snapping
- flat shading
- face operations including extrude/inset/bevel
- undo/redo
- GLB export
- save to Shared Asset Library
- Item Forge master-model handoff

Important source:

- `src/pages/Models.tsx`
- `src/components/ModelCreatorViewport.tsx`
- `src/lib/modelCreator.ts`

## Textures

Texture Lab is Forge's texture/material workspace.

Important source:

- `src/pages/TextureLab.tsx`
- texture/material helpers under `src/lib/`

## Shared Asset Library

The Shared Asset Library is backed by IndexedDB and stores reusable local Forge assets.

Current categories include:

- characters
- animations
- props
- materials
- textures
- environment
- audio
- VFX

Asset kinds include:

- GLB
- motion
- image
- audio
- generic file/package

The library is deliberately used for large/generated/imported content so the repository does not need to carry every working binary asset.

Important source:

- `src/pages/AssetLibrary.tsx`
- `src/lib/library.ts`

## Asset Preview

Asset Preview is the game-style preview/testing workspace for library assets.

Important source:

- `src/pages/GamePreview.tsx`

---

# Validation

Validation provides project-level readiness checks over the same content registry used by the Control Center.

The registry tracks project/world/region/player/ability/enemy/item/loot/UI/runtime/library content and reports:

- ready
- warning
- missing

Important source:

- `src/pages/ProjectValidation.tsx`
- `src/engine/contentRegistry.ts`

---

# Skillbound runtime architecture

Forge has three important layers.

## 1. Forge Runtime

Responsible for runtime mechanics and presentation systems such as:

- Three.js rendering
- input
- movement
- camera
- A* navigation
- enemy simulation
- combat execution
- gameplay feedback
- animation runtime
- VFX runtime
- equipment visuals
- inventory/UI runtime
- gameplay save/load

## 2. Skillbound project data

Authored project JSON describes content rather than hard-coding it into the runtime.

Examples:

- worlds
- regions
- dungeons
- encounters
- bosses
- player
- abilities
- enemies
- items
- loot
- UI

Bundled data is under:

`public/projects/skillbound/`

## 3. Shared Asset Library

Stores reusable working assets such as:

- character GLBs
- equipment GLBs
- animation packages
- materials
- VFX
- models
- audio
- procedural Equipment Creator recipes

This separation is intentional. Do not casually collapse all three layers into one file or one runtime module.

---

# Saving and persistence

There are several persistence layers and they serve different purposes.

### Browser project workspace

Used for fast active Skillbound authoring between page/tool changes.

### Connected source folder

Project Manager can connect to the real Skillbound source folder where the browser supports the File System Access API. This allows reading/writing source-controlled Forge project JSON.

### Shared Asset Library

IndexedDB stores imported/generated assets and Forge packages.

### Gameplay save

Play Project persists runtime gameplay state separately, scoped by project/region/seed.

Do not confuse project-authoring state, asset-library state, and gameplay save state.

---

# Current release history

## v1.75.0 — Equipment Creator v2

- Create / Assemble modes in Equipment Forge
- native procedural Chest / Waist / Cape generation
- Ranger / Guard / Battlemage / Raider creator styles
- deterministic variants
- editable geometry/material parameters
- saved creator recipes
- creator data inside outfit presets
- full ChatGPT recipe round-trip for procedural parameters

## v1.74.0 — Equipment Forge MVP

- official Skillbound base-rig selection
- equipment ZIP import
- slot GLB import
- skinned equipment rebinding
- live material editing
- outfit presets
- ChatGPT material recipe workflow

## v1.73.5 — Chain Lightning presentation

- Evergrow-inspired traveling leader
- sequential hop presentation
- arrival-timed damage
- white/blue/violet layered bolt
- stronger forks/impact/light

## v1.73.4 — Runtime performance

- combat/death hitch optimization pass
- deferred save/disposal work
- VFX preloading/caching
- pooled Chain Lightning geometry
- enemy simulation throttling
- allocation reductions

## v1.73.3 — Chain Lightning polish

- stronger deterministic bolt presentation
- hand-origin improvements
- branching/glow/impact polish

## v1.73.2 — Enemy population controls

- authored enemy group sizes
- spacing/range/respawn settings
- real transient test packs

## v1.73.1 — Chain Lightning

- chain delivery type
- multi-target bounce configuration
- Arc Bolt converted to Chain Lightning behavior without changing its content ID

## v1.73.0 — Animation Runtime 3

- semantic animation runtime
- shared Runtime 3 controller between editor and gameplay
- official body rigs used directly for live Skillbound characters

For exact history beyond this point, use Git history.

---

# Current priorities

At the time of this README update, the main immediate areas are:

1. **Visually test and refine Equipment Creator v2** on the official female/male bodies.
2. Improve procedural clothing/armor geometry so it looks intentionally authored rather than primitive.
3. Add the missing procedural equipment families:
   - gloves
   - boots
   - legs
   - head
4. Add a native **Weapon Forge** using reusable blade/guard/grip/pommel or staff/bow part systems.
5. Add bake/export so a procedural creator design becomes a final reusable game-ready equipment asset.
6. Extend the same Forge + ChatGPT approach toward:
   - humanoid NPCs
   - enemy factions
   - animals
   - monsters/creature families
   - environment asset generators
7. Continue visual/performance refinement of Skillbound without regressing stable world/runtime systems.

Astra should not become a mandatory per-asset cost. The preferred future is:

```text
ChatGPT design intent
        ↓
structured Forge recipe
        ↓
native Forge generator/editor
        ↓
Forge Library
        ↓
Skillbound runtime
```

---

# Known boundaries / do not assume

- Equipment Creator v2 is **not yet a complete replacement for a full DCC/modeling package**.
- Procedural creator output is not yet baked into final standalone skinned GLBs.
- The broader Equipment Forge slot model is ahead of some older runtime equipment taxonomy; integrate new slots deliberately.
- Not every project-health warning means the runtime feature is missing; some warnings specifically mean final authored presentation assets are still placeholders.
- Shared Asset Library content is local browser data unless explicitly exported or written into a project workflow.
- The README is a handoff document, not a substitute for checking current source. If `src/version.ts`, Git history, or implementation code is newer, source wins.

---

# Important repository paths

```text
src/
  App.tsx                         Main navigation / workspace shell
  version.ts                     Current Forge version/build label

  pages/
    Dashboard.tsx                Control Center
    ProjectManager.tsx           Project/source management
    WorldForge.tsx               World authoring
    ProjectPlay.tsx              Play Project
    PoiForge.tsx                 POI authoring
    MapStudio.tsx                Dungeon Forge
    DestructionLab.tsx           Destruction experiments
    ConceptForge.tsx             Concept/character direction
    CharacterForge.tsx           Character Creator
    EquipmentForge.tsx           Equipment Forge
    AnimationStudioRuntime2.tsx  Animation Studio UI
    GameplayForge.tsx            Gameplay authoring hub
    SkillForge.tsx               Ability authoring
    EncounterForge.tsx           Encounter authoring
    BossForge.tsx                Boss authoring
    ItemForge.tsx                Item authoring
    LootForge.tsx                Loot/container authoring
    UIForge.tsx                  UI system authoring
    VfxStudio.tsx                VFX authoring
    AudioStudioWorkspace.tsx     Audio tools
    PropForge.tsx                Prop authoring
    Models.tsx                   Model editor
    TextureLab.tsx               Texture/material tools
    AssetLibrary.tsx             Shared Asset Library
    GamePreview.tsx              Asset Preview
    ProjectValidation.tsx        Validation

  engine/
    forgeProject.ts              Skillbound project schema/load/save
    guidedWorld.ts               Seeded/guided world generation
    contentRegistry.ts           Project registry/health/search
    equipment.ts                 Runtime equipment state/stats
    equipmentForge.ts            Equipment Forge assets/presets/import
    equipmentForgeProcedural.ts  Equipment Creator v2 generator
    runtime/
      ForgePlayRuntime.ts        Main playable runtime
      ForgeAssetRuntime.ts       Character/model/runtime bindings
      ForgeEquipmentVisuals.ts   Runtime equipment visuals
      ForgeChainLightningRuntime.ts
                                  Chain Lightning presentation/runtime

  components/
    EquipmentForgeViewport.tsx   Live equipment preview
    EquipmentCreatorPanel.tsx    Procedural Equipment Creator controls
    WorldForgeViewport.tsx       World preview
    ModelCreatorViewport.tsx     Mesh editor viewport

  lib/
    library.ts                   IndexedDB Shared Asset Library
    characterAssetRegistry.ts    Character standards/base pack
    project/asset package helpers

public/
  projects/
    skillbound/
      project.forge.json         Active bundled project manifest
      worlds/
      regions/
      dungeons/
      encounters/
      bosses/
      players/
      abilities/
      enemies/
      items/
      loot/
      ui/

.github/
  workflows/
    deploy-pages.yml             Production build/deploy
```

---

# How to continue safely in a new chat

When implementing a new feature:

1. Read this README.
2. Read `src/version.ts`.
3. Fetch the relevant files from current `main`.
4. Check recent commits if the topic changed recently.
5. State a short implementation plan.
6. Create a feature branch.
7. Implement the feature.
8. Use a temporary branch CI workflow when there is no existing PR build check, or otherwise obtain a real `npm run build`.
9. Fix build/type errors before merging.
10. Remove temporary CI-only files.
11. Open a PR.
12. Merge after validation.
13. Inspect the GitHub Pages Actions run for the exact merged commit.
14. If deployment fails, inspect job logs and fix it rather than handing deployment back to the user.
15. Update this README when the change materially alters the project state.

---

# Quick handoff summary

If only a short summary is needed:

**Forge Studio v1.75.0** is a React/TypeScript/Three.js browser game-development suite and the active editor/runtime for **Skillbound**. It includes Control Center, Project Manager, World Forge, Play Project, POI Forge, Dungeon Forge, Destruction Lab, Concept Forge, Character Creator, Equipment Forge + procedural Equipment Creator v2, Animation Studio/one-phone mocap, Gameplay Forge, Skill/Encounter/Boss/Item/Loot Forge, UI Forge, VFX Studio, Voice & Audio, Prop Forge, built-in Models editor, Texture Lab, Shared Asset Library, Asset Preview, and Validation. Skillbound uses authored JSON project data, a shared runtime, and IndexedDB-backed library assets. Animation Runtime 3 is active. Chain Lightning has Evergrow-inspired traveling/forked presentation. Runtime performance received a dedicated enemy-death/combat optimization pass. The current content-production direction is **Forge + ChatGPT**, reducing dependence on Astra by building native reusable asset generators, starting with equipment and then weapons/NPCs/creatures/environment.

