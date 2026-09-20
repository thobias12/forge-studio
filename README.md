# Forge Studio

> **Current Forge version:** `v1.83.4`  
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

Forge v1.81.7 keeps cursor aiming locked to the live camera even when the mouse is stationary while the player/camera moves. The runtime now reprojects the saved screen cursor every rendered frame and again at cast time, and untargeted Chain Lightning ends exactly at the resolved terrain cursor point.

Forge v1.81.6 fixes cursor-to-skill alignment in the playable runtime. Pointer projection now resolves against the actual generated terrain while staying on the camera ray, ranged/area impacts use the clamped terrain aim point, and untargeted Chain Lightning terminates at the cursor instead of one meter above it.

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

Forge v1.82.0 is the first **Dungeon Forge v2** pass. It shifts the tool toward a hybrid procedural/modular workflow aimed at large, dark ARPG interiors rather than small disconnected editor rooms.

The default crypt direction is now **Sunken Ossuary**: warm torch pools, deep surrounding darkness, running-bond brick floors, heavy brick/stone walls, stronger vignette/contrast and larger room/corridor proportions.

Dungeon generation now exposes scale, room count, corridor width and branching controls. The generator creates a turning main route, optional side rooms and loops, encounter-ready combat/elite/boss spaces, and wider traversal lanes. Generated layouts remain ordinary editable Dungeon Forge data instead of becoming a baked procedural mesh.

Manual editing remains first-class. Rooms can be click-dragged directly onto the floor and then resized with the existing edge handles. A new **Wall** tool click-drags independent brick wall segments anywhere in the layout; those segments render in the editor and ARPG preview, appear on the minimap, can be edited numerically, and participate in runtime collision.

The editor world/camera bounds were expanded for the larger layouts, while Walk and ARPG preview continue to use the same authored package. v1.82.1 separates authoring visibility from runtime mood: the editor gets a neutral fill light, reduced authoring fog and automatic layout framing, while Walk/ARPG keeps the darker torch-lit presentation without crushed blacks. v1.83.0 adds camera-aware cutaway rendering: the two room walls facing the camera fade automatically, crypt brick courses use a lower editor silhouette, the authoring grid crops around the dungeon, corridor walls are less tunnel-like, crypt floors keep a subtle shadow lift, and ARPG mode uses a higher top-down camera with active-room wall cutaways. Crypt rooms now rely on authored wall sconces instead of duplicate floating torch lights. v1.83.2 adds a persistent Brightness control (55–250%) and moves Edit, ARPG and Walk onto the same lighting profile so changing view no longer changes the authored exposure. v1.83.3 rebalances that shared profile so brightness opens neutral room/floor fill much faster than exposure, lowers torch intensity and orange wall wash, sets 135% as the useful default, and improves player readability without adding a separate gameplay light. v1.83.4 replaces top-down foreground-wall fading with true low cutaway architecture: camera-facing room walls, caps, trims, supports and corner masonry collapse to roughly waist height, active-room ARPG cutaways follow the same rule, top-down corridor walls are reduced to about 1m, while first-person Walk keeps full-height architecture.

Important source:

- `src/pages/MapStudio.tsx`
- `src/components/DungeonViewportCore.tsx`
- `src/components/ArpgDungeonViewportCombat.tsx`
- `src/lib/dungeonPackage.ts`
- `src/lib/cryptSurfacePass.ts`
- `src/lib/dungeonAtmosphere.ts`

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

## Equipment Lab

Forge v1.81.5 improves the first successful procedural Chest result. Chest generation now isolates real torso vertices from Skillbound skin weights instead of relying on a broad body-width test, recalculates torso width/depth from spine/pelvis/breast/clavicle-driven vertices, and shapes the neckline/shoulders from pelvis/chest/neck/clavicle landmarks. This removes the stray forearm/hand/leg fragments visible in the first successful Ranger test and moves the top edge from the under-bust region toward a real tunic neckline.

Forge v1.81.4 fixes the actual Blender deletion bug exposed by the v1.81.3 diagnostics. The source-body predicates were matching thousands of correct vertices, but the copied glTF mesh entered Edit Mode with selection state that caused the operator-based delete step to remove every vertex. Procedural layer cutting now uses Blender's low-level BMesh API to delete non-matching vertices directly by source index, with no UI/edit-mode selection dependency. Layer diagnostics now report both surviving vertices and polygons.

Forge v1.81.3 makes procedural garment cutting topology-driven instead of transform-driven. Each layer now evaluates its garment predicate on the untouched Skillbound body first, records the exact matching source vertex indices, then duplicates the body and keeps those same indices. This removes parent/armature/world-transform ambiguity from the cut stage. Armature re-parenting also explicitly preserves the object's world matrix. New FORGE_SOURCE_CUT diagnostics report the number of matched source vertices before any copied mesh is modified.

Forge v1.81.2 fixes the remaining coordinate conversion bug in procedural Chest generation. Blender's glTF importer converts the Skillbound asset into Blender coordinates, so the generator now derives its imported frame from the actual skeleton: pelvis→head resolves vertical, right-shoulder→left-shoulder resolves width, and the remaining axis becomes depth. Vertical direction is normalized as well, so sign flips are safe. This removes all hard-coded Y-up assumptions from the garment predicates.

Forge v1.81.1 fixes the first body-aware Chest runtime failure. SkillboundHumanoidV1 now uses its canonical axes directly (X left/right, Y up, +Z forward) instead of guessing the vertical axis from overall mannequin dimensions. The old heuristic could mistake a T-pose arm span for character height and cut every garment layer outside the torso. The procedural generator now also measures shoulder width from the real upper-arm/clavicle bones, excludes T-pose arms from torso measurements, removes failed temporary meshes safely, and prints per-layer vertex diagnostics.

Forge v1.81.0 changes Equipment Lab from an image-to-3D-first experiment into a **body-aware automatic equipment factory**.

The default armor path no longer asks for a concept image or external 3D generation. Instead Blender receives the exact Skillbound mannequin and constructs the garment directly from the skinned body surface.

Current production proof:

```text
Skillbound body
    ↓
slot + style + variation
    ↓
Blender duplicates/cuts the real skinned body surface
    ↓
outward clearance + garment thickness
    ↓
cloth / leather / trim / tabard layers
    ↓
inherited Skillbound vertex groups + armature
    ↓
game-ready GLB
    ↓
Forge preview / Asset Library
```

### Current automatic template

The first production template is **Chest**.

Available style presets:

- Ranger
- Traveler
- Acolyte

The body-aware chest generator currently creates:

- fitted cloth torso shell
- real neckline opening
- real arm openings
- layered leather vest shell
- fitted waist belt
- hem trim
- neckline trim
- optional front tabard
- material colors per style
- deterministic variation presets
- inherited body weights from the official Skillbound rig
- body-mask metadata for Chest / Back / Shoulders
- GLB export ready for Forge Library

Because the garment is cut from the actual Skillbound body mesh, it starts at the correct scale, orientation, proportions and skeleton instead of reconstructing a detached object and trying to force-fit it afterward.

### Equipment Lab UI

The primary controls are now:

- Skillbound body
- Equipment slot
- Style
- Variation
- **Generate Equipment**

No reference image is required for the primary path.

The current proof intentionally enables body-aware generation only for **Chest** until the generated chest passes visual QA. The same architecture is intended to expand to:

- Head
- Legs
- Boots
- Gloves
- Waist
- Back / Cape
- Main Hand
- Off Hand

### Experimental image-to-3D

SPAR3D and the existing manual raw-GLB import remain available below the automatic workflow as experimental/fallback paths.

SPAR3D is no longer the recommended armor path after real Ranger tests showed that generic single-image reconstruction can produce closed torso/bust-like meshes that are unsuitable as wearable garments even when the downstream fitting code is correct.

### Important source

- `src/pages/EquipmentLab.tsx`
- `src/lib/equipmentProcessorClient.ts`
- `tools/equipment-processor/server.mjs`
- `tools/equipment-processor/procedural_equipment.py`
- `tools/equipment-processor/processor.py`

## Equipment Forge

Equipment Forge is now transitioning from the older primitive-based **Equipment Creator v2** into **Equipment Forge V3**, a body-conforming equipment authoring system built around the official Skillbound male/female rigs.

The active priority is the **Skillbound Female Base v1** Ranger outfit, because it is being used as the reference case for solving garment fit, attachment, layering, deformation, and visual quality before expanding the system to more equipment families.

### Equipment Forge V3 architecture

V3 is deliberately different from the old V2 approach.

Instead of assembling clothing from floating boxes/primitives, V3:

- samples the real body mesh
- creates fitted garment surfaces from the body contour
- reuses the official Skillbound skeleton
- inherits skin weights from the source body/garment surfaces
- masks covered body geometry where needed
- builds modular garment layers on top of a fitted base
- keeps fit diagnostics available through a dedicated QA workflow

Current V3 source:

- `src/engine/equipmentForgeV3/types.ts`
- `src/engine/equipmentForgeV3/templateRegistry.ts`
- `src/engine/equipmentForgeV3/conform.ts`
- `src/engine/equipmentForgeV3/assembler.ts`
- `src/engine/equipmentForgeV3/bodyMasking.ts`
- `src/engine/equipmentForgeV3/fitDiagnostics.ts`
- `src/components/EquipmentCreatorV3Panel.tsx`
- `src/pages/EquipmentQaCapture.tsx`

### Current V3 garment capabilities

The current V3 fitted-tunic system includes:

- fitted torso garment generated from the real body surface
- round / scoop / high neckline options
- none / short / long sleeves
- shoulder-to-sleeve bridge geometry
- sleeve body masking
- smooth arm-axis sleeve fitting
- tunic looseness
- waist taper
- hem flare
- neckline trim
- sleeve cuff trim
- modular split leather vest
- fitted belt
- front tabard
- cape / back layer
- cloth / trim / leather / accent / metal materials
- Ranger / Traveler / Acolyte starting presets

### Fit and collision work

The v1.77.x work has focused heavily on eliminating the problems seen in the old procedural approach:

- torso clearance is intentionally tighter
- sleeves sample the outer arm surface rather than using a rough primitive cylinder
- body geometry underneath sleeves can be masked to prevent z-fighting
- shoulder bridge geometry visually joins sleeves to the torso
- tabard attachment follows several fitted torso points instead of one floating anchor
- cape attachment follows the fitted back contour across its top edge
- cape vertices sample the real rear body surface to avoid penetrating the back
- cape back-gap clearance is adjustable
- QA has a dedicated upper-cape/back collision zone

### 360° + close-up Equipment QA

Forge now has a dedicated Equipment V3 QA page.

Direct QA URL:

`https://thobias12.github.io/forge-studio/?equipmentQa=1&body=female&model=library`

The QA workflow renders fixed images sequentially through one WebGL renderer rather than keeping many simultaneous live WebGL canvases.

Current QA coverage includes:

- 8 fixed full-body views around the character
- left/right close side views
- left/right underarm views
- chest/neckline close-up
- back/shoulder close-up
- left/right waist/hem close-ups
- dedicated rear-45 cape/back-gap close-ups

The QA page also calculates body-to-garment diagnostics:

- average clearance
- 95th-percentile clearance
- clipping sample percentage
- floating sample percentage
- separate torso fit
- separate left/right sleeve fit
- upper cape/back fit

Fit diagnostics are opt-in for QA so the normal Equipment Forge editor does not pay the extra analysis cost.

### v1.77.4 authored-looking Ranger pass

The Ranger reference has continued through **Forge v1.77.6**. v1.77.5 added deeper fitted construction, and v1.77.6 corrects the upper cape drape/front vest detail while adding dedicated top-down QA.

The latest pass moved the Ranger outfit further away from a plain procedural shell by adding/refining:

- fitted tunic seam details
- asymmetric leather vest panel construction
- additional vest edge/hem/shoulder detailing
- belt construction details
- belt pouches
- belt studs / metal details
- split and trimmed tabard treatment
- additional cape construction detail
- cape yoke / borders / fasteners
- extra QA close-ups for the authored-looking layers

### v1.77.6 cape/top corrective pass

The latest corrective pass focuses on problems visible from above:

- upper cape anti-float protection now fades out smoothly near the shoulders rather than constraining half the cape
- cape folds begin below the attachment edge instead of rippling the top row
- the narrow diagonal vest reinforcement that read as a rope/cord was replaced by a broader fitted leather shoulder reinforcement
- Equipment QA now includes dedicated top-down, high-front, high-back/cape, and elevated shoulder views

### v1.77.7 autonomous Equipment QA

Equipment Forge V3 now has a deterministic, remotely inspectable female QA fixture derived from the official **Skillbound Female Base v1** body. The fixture is QA-only: it preserves the reference body geometry and 62-bone rig needed for fit/conform validation while omitting unrelated character assets.

Every GitHub Pages deployment now:

- reconstructs the QA fixture during CI
- builds Forge Studio
- renders the complete Equipment V3 QA page headlessly with Playwright
- publishes the full contact sheet plus every named angle under `/qa/equipment-v3/female/`
- keeps the QA foundation available at `/qa-foundation/__qa-base.glb`

Useful deployed inspection URLs:

- `?equipmentQa=1&body=female&model=fixture` — interactive deterministic QA page
- `/qa/equipment-v3/female/equipment-v3-female-360.png` — full contact sheet
- `/qa/equipment-v3/female/manifest.json` — build, recipe, views and fit diagnostics
- individual PNGs such as `front.png`, `top-down-shoulders.png`, `top-back-cape.png`, and `cape-profile-tight.png`

This removes the previous dependence on one browser's IndexedDB for visual review and lets future equipment refinement use the exact same QA body and fixed angles on every build.

### v1.77.8 Ranger geometry rebuild

This release is the first Equipment Forge pass driven by the autonomous 28-angle visual QA output rather than code-only inspection.

Ranger changes:

- rebuilt the cape root as a dedicated smooth shoulder/back attachment curve instead of inheriting the tunic neckline contour
- simplified the oversized cape yoke into a narrow shoulder yoke with smaller fasteners and a cleaner lower seam
- removed the diagonal cape yoke strips that read as rigid polygonal braces
- replaced the chunky asymmetric vest reinforcement with narrower mirrored fitted side leather panels
- softened the shoulder bridge profile to reduce triangular humps and underarm pinching
- widened and lifted the neckline trim for a cleaner intentional edge

The goal of this pass is silhouette and construction cleanup first. Subsequent passes should continue from visual QA renders, not revert to the older patch-heavy construction.

### v1.77.9 Ranger fit and silhouette refinement

Follow-up driven by the v1.77.8 28-angle renders:

- corrected the shoulder bridge to sample the torso-facing half of each sleeve ring; the old sign was reversed and caused visible underarm holes
- raised the default round neckline and reduced the trim thickness
- widened the Ranger vest front opening so leather reads as side/back reinforcement instead of bulky chest slabs
- broadened and lengthened the Ranger cape for a proper cape silhouette rather than a narrow sash
- added variable-width fitted detail strips so cape borders and center seam can be much slimmer than one full grid cell
- reduced cape hardware footprint with inset fitted patches

### v1.77.10 Ranger finishing pass

Third visual pass after reviewing the v1.77.9 QA artifact:

- moved short/long sleeve roots closer to the upper-arm joint and expanded shoulder-bridge coverage to close the remaining underarm slit
- tightened the Ranger round neckline into a much smaller opening and adjusted the collar trim
- rebuilt tabard details to remove the oversized H-shaped leather/trim overlays
- narrowed the tabard center slit and strengthened the two pointed tails
- retained only thin tabard edge trim plus a small fitted leather top hanger
- reduced and balanced the hip pouch footprint so the waist is less blocky

### v1.77.11 shoulder-shell / armhole correction

Fourth visual pass after inspecting the v1.77.10 top and underarm QA renders:

- torso conformance now blends toward the source body's true surface normal around the upper shoulder crown instead of forcing all clearance horizontally
- added dedicated shoulder clearance so upward-facing body polygons no longer poke through the tunic shell
- moved sleeve roots slightly inside the shoulder joint and added root-only sleeve coverage
- shoulder bridge endpoints now overlap the torso/sleeve surfaces instead of meeting edge-to-edge
- shoulder bridges use a dedicated double-sided cloth material so mirrored/back-facing underarm triangles cannot disappear from close views

### Current visual status / important handoff

The user is **not satisfied with the outfit yet**. Do not treat v1.77.4 as finished.

The desired direction is a much more authored, game-ready ARPG outfit while keeping the V3 body-conforming workflow.

The next conversation should:

1. inspect the actual current `main` implementation and live v1.77.4 result before editing;
2. use the Equipment QA close-ups to inspect side spacing, underarms, shoulders, waist, cape/back clearance, and clipping;
3. keep refining silhouette, layering, seams, leather panels, belt/pouches, tabard, cape construction, thickness, and asymmetry;
4. prefer fitted/skinned detail geometry over floating primitives;
5. keep cape clearance measured so it neither intersects the back nor floats visibly far behind it;
6. continue until the outfit looks intentionally authored rather than merely procedurally valid.

### Equipment slots

Equipment Forge authoring slots are:

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

### Longer-term Equipment Forge direction

Once the reference Ranger outfit is genuinely strong, expand the same native Forge + ChatGPT workflow into:

- more chest/cloth/armor templates
- gloves
- boots
- legs
- headgear
- capes/backpacks/quivers
- weapons
- bake/export to final reusable skinned assets

The goal remains to make Astra optional rather than requiring external generation for every new armor piece, weapon, NPC, monster, animal, or environment asset.

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

## v1.83.1 — Equipment Lab production upgrade

- ports the tested Equipment Lab workflow onto the current v1.83.0 main
- production flow is Female / Male → Chest → style → variation → Generate Equipment
- unsupported slots are marked as coming later
- SPAR3D, reference-image generation and raw-GLB fitting are hidden behind experimental/import tools
- primary generated-equipment preview expands to a large single Skillbound viewport
- clean native-model QA renders the generated GLB without legacy V3 armor overlays
- Female → Chest → Ranger → variation 01 uses an authored procedural garment mesh
- Ranger construction includes cloth shell, split front leather panels, back panel, diagonal strap, wrap belt, buckle, keepers, neckline/armhole trim and hem trim
- authored pieces inherit nearby Skillbound skin weights and bind to the official armature
- procedural generator metadata uses `blender-body-aware-v2`


## v1.77.4 — Authored-looking Ranger construction

- fitted tunic seam refinement
- asymmetric vest panels
- belt pouches and studs
- split/trimmed tabard
- additional cape construction detail
- extra close QA views for new authored-looking layers

## v1.77.3 — Cape collision + detail refinement

- sampled rear-body cape collision guard
- adjustable cape back gap
- upper-cape/back fit diagnostics
- dedicated cape/back QA close-ups
- vest trim/seams
- belt buckle
- cape border/yoke/fasteners
- metal detail material

## v1.77.2 — Garment fit refinement

- tighter fitted-tunic clearance
- outer-arm sleeve surface sampling
- improved vest opening/position
- fitted belt clearance
- tabard top follows torso contour
- cape top follows fitted back contour
- stricter QA clearance thresholds

## v1.77.1 — Equipment fit QA

- 8 full-body 360° QA angles
- close side/underarm/chest/back/waist fit views
- sequential PNG capture using one renderer
- body-to-garment gap/clipping/floating diagnostics

## v1.77.0 — Equipment Forge V3

- body-conforming fitted tunic foundation
- shoulder/sleeve joining
- sleeve masking
- hem flare
- modular vest/belt/tabard/cape layers
- cloth/trim/leather/accent materials
- Ranger / Traveler / Acolyte presets
- V3 360° QA workflow

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

The immediate priority is **Equipment Forge V3 visual quality**.

1. Continue refining the v1.77.4 Ranger reference outfit until it looks authored and game-ready, not like a procedural shell.
2. Use the built-in 360° + close-up QA views to inspect:
   - body/clothing side clearance
   - shoulders
   - underarms
   - chest/neckline
   - waist/hem
   - cape/back clearance
   - clipping / floating layers
3. Improve garment construction detail:
   - layered leather panels
   - shaped seams
   - believable thickness
   - belt construction
   - pouches / straps / studs
   - tabard shaping
   - cape yoke / anchors / borders
   - controlled asymmetry
4. Preserve the body-conforming/skinned V3 approach. Do not fall back to large detached boxes or floating V2-style primitives.
5. After the Ranger reference reaches the target quality, add the missing procedural equipment families:
   - gloves
   - boots
   - legs
   - head
6. Add a native **Weapon Forge** using reusable blade/guard/grip/pommel or staff/bow construction systems.
7. Add bake/export so a native Forge equipment design can become a final reusable game-ready equipment asset.
8. Extend the same Forge + ChatGPT workflow toward:
   - humanoid NPCs
   - enemy factions
   - animals
   - monsters/creature families
   - environment asset generators
9. Continue Skillbound visual/performance refinement without regressing stable world/runtime systems.

Astra should not become a mandatory per-asset cost. The preferred future remains:

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
    EquipmentQaCapture.tsx        V3 360° / close-up fit QA
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
    equipmentForgeProcedural.ts  Legacy Equipment Creator v2 generator
    equipmentForgeV3/             Body-conforming V3 equipment system
    runtime/
      ForgePlayRuntime.ts        Main playable runtime
      ForgeAssetRuntime.ts       Character/model/runtime bindings
      ForgeEquipmentVisuals.ts   Runtime equipment visuals
      ForgeChainLightningRuntime.ts
                                  Chain Lightning presentation/runtime

  components/
    EquipmentForgeViewport.tsx   Live equipment preview
    EquipmentCreatorPanel.tsx    Legacy V2 creator controls
    EquipmentCreatorV3Panel.tsx  V3 fitted garment/layer controls
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

**Forge Studio v1.83.0** is the React/TypeScript/Three.js browser editor/runtime for **Skillbound**. The latest major addition is **Dungeon Forge v2**, which combines larger procedural ARPG layouts with fully editable rooms, corridors, props, gameplay markers and independent click-drawn brick walls. The crypt visual target is the Sunken Ossuary direction: running-bond brick floors, heavy masonry, warm local torch pools and deep surrounding darkness. Generation exposes scale, room count, corridor width and branching while keeping the result as normal authored dungeon data. Equipment Lab remains on the body-aware Blender procedural workflow introduced through v1.81.x. Use GitHub directly: inspect current source, branch, implement, run a real build, merge, and verify Pages deployment. Do not tell the user to manually push changes when GitHub access is available.
