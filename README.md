# Forge Studio

> **Current Forge version:** `v1.98.1`  
> **Active game project:** Skillbound  
> **Runtime:** Three.js / browser  
> **Repository:** `thobias12/forge-studio`  
> **Live build:** https://thobias12.github.io/forge-studio/  
> **Last handbook update:** 2026-09-20

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

Forge v1.98.1 is the second **Cathedral Environment V4 refinement pass**, made after v1.98.0 was deployed, verified on the live Pages SHA, and inspected through the production Dungeon Visual QA captures.

The production images showed four concrete problems: cathedral pilasters read as isolated bright-blue posts instead of integrated architecture; crystal clusters were too white/chunky; random floor damage still produced distracting black scratches/holes; and the underlying perimeter still read as a dark jagged slab.

Floor damage is therefore heavily reduced rather than hidden. Missing-corner events are extremely rare and much smaller, damaged stones are shallower and closer in tone to their neighbors, crack frequency drops again with shorter/lighter blue-gray marks, etched wear becomes sparser/fainter, and the base floor material receives a small readability lift with less emissive flattening.

Wall architecture is integrated more strongly into the perimeter. Pilaster bases/shafts/caps are larger and taller but use a darker wall-derived material instead of bright accent blue. Recess panels are wider/deeper, rune strips remain reserved for focal supports, and a new globally instanced **cornice layer** runs along non-cross room walls at the real ARPG wall-top height. The cornice gives rooms a continuous architectural top line that visually bridges the procedural masonry blocks.

The underlying wall face also receives a modest material/cap readability refinement so stone faces remain visible against the black void without changing global exposure.

V4 crystal clusters are now much slimmer: narrower shafts, shorter secondary shards, smaller cores, lower emissive intensity and less white/cyan clipping. They should read as environmental crystals rather than luminous debug obelisks while preserving the cold focal language.

Warm lighting is refined again from the live screenshots. Torch source intensity remains strong, but floor pools and wall washes are smaller and softer so the visible orange shape hugs the fixture instead of forming broad circular stains.

Renderer-health budgets remain unchanged. The new continuous cornice is globally instanced, so the architectural refinement is expected to cost only a small number of additional draw calls.

No combat, AI, room layout, encounter, navigation, collision or Vault Warden balance values are changed.

Forge v1.98.0 is the first **Cathedral Environment V4** pass. It moves the crypt from a readable procedural blockout toward an authored cold-cathedral environment while staying inside the same authoritative Dungeon V3 renderer.

A new globally batched cathedral architecture layer adds wall pilasters, brighter cap/trim blocks, recessed wall panels, sparse cyan rune insets and room-border floor bands. These are instanced across the whole dungeon rather than emitted as many individual meshes, so the visual structure grows without scaling draw calls linearly with room count.

The first crystal environment family is also batched globally. Boss, elite, shrine, reliquary and crossroads rooms now receive deliberate edge clusters built from faceted shafts, pointed caps, dark stone plinths and bright cyan cores. Placement is deterministic and stays outside the main combat center.

Floor noise is reduced again: random crack frequency and etched wear frequency are lower, and dark crack opacity is reduced so large rooms read as continuous stone rather than a field of black scratches.

Perimeter masonry is slightly more readable under the established lighting hierarchy. Wall face color/emissive and cap lift are increased modestly so walls retain visible blue-gray structure against the black void instead of collapsing into a solid dark silhouette.

Torch fixtures use a more cathedral-like hexagonal backplate/cup profile. Their point lights remain strong, but broad warm floor/wall pools are tighter and more localized so orange light reads as a source near the flame instead of a large airbrushed circle.

All new environment geometry is decorative/no-navigation and does not alter room dimensions, collision, encounters, combat or Vault Warden balance. Dungeon Forge Edit, Dungeon Visual QA and actual Skillbound dungeon play continue to use the same renderer.

Forge v1.97.3 is the **Deployment Integrity** release. It fixes a GitHub Actions race discovered while deploying v1.97.2 and adds live-site verification after every production Pages deploy.

The production Pages workflow and the legacy Equipment V3 preview workflow previously shared the same generic `pages` concurrency group. GitHub evaluates workflow-level concurrency before job-level `if` conditions, so a non-equipment PR finishing its normal CI could start the preview workflow, cancel an in-progress production Pages run, and only then skip all preview jobs. Production now uses the dedicated `forge-production-pages` concurrency lane and Equipment previews use `equipment-v3-preview-pages`, so skipped preview runs cannot cancel real releases.

Production QA now depends on the actual Pages deploy, not only the build artifact. The deploy job exposes its published `page_url`, and the QA job opens that live URL with Playwright after deployment. `npm run qa:live` waits through normal Pages/CDN propagation, requires the visible Forge sidebar build tag to contain the exact seven-character `github.sha`, then opens the **live** `?dungeonQa=1` route.

Live Dungeon QA must report the same expected build SHA, zero renderer errors, all six canonical Hollow Vault views, and non-empty renderer-health metrics. A stale deployment, wrong artifact, broken live route, client-side exception, missing QA view, or Pages propagation that never reaches the expected build fails production QA.

Successful verification writes `artifacts/deployment-integrity/verification.json` plus a Markdown summary, publishes the result in the GitHub Actions job summary, and uploads a 14-day `deployment-integrity` artifact. Forge automation scripts are also checked with `node --check` during PR CI because these `.mjs` scripts are outside TypeScript compilation.

This release changes deployment/validation infrastructure only. Dungeon Atmosphere V3 visuals, renderer budgets, combat, AI, navigation, collision and balance are unchanged.

Forge v1.97.2 extends **Dungeon Visual QA** into a renderer-health gate so visual upgrades cannot silently make Hollow Vault too expensive.

Each of the six deterministic Hollow Vault QA views now records renderer cost after shader/shadow/post-processing warmup: draw calls, triangles, points, lines, geometries, textures, object/mesh/instancing counts, light counts, unique materials, and eight synchronous render-time samples with average/p95/max timings. `renderer.info.autoReset` is disabled during each measured composer frame so the numbers include the full RenderPass + bloom pipeline rather than only the last post-processing pass.

The first v1.97.2 CI baseline measured a whole-dungeon peak of 703 draw calls, 89,900 triangles, 401 geometries, 15 textures, 24 lights, and one shadow-casting light. Fixed regression budgets are intentionally above that baseline to allow legitimate art growth while still catching accidental renderer explosions: 850 draw calls, 115,000 triangles, 500 geometries, 24 textures, 32 lights, and two shadow lights. Headless render timing has loose emergency ceilings of 45 ms average / 90 ms p95 plus 22 ms / 40 ms warning thresholds; timing is useful for same-environment trends, not a direct player-FPS estimate.

The QA capture also samples the final post-processed canvas and records informational visual-health metrics per view: average luminance, p10/p50/p90 luminance, contrast range, dark-space ratio, highlight ratio, warm-light ratio, and cyan-light ratio. These are deliberately **not** artistic pass/fail gates yet; they become most useful once a dungeon look is explicitly approved as the visual baseline.

`npm run qa:dungeon` now emits `performance.json` and `performance.md` alongside the contact sheet, individual PNGs and `manifest.json`. Structural/timing budget failures fail the QA step, while the PR workflow uploads the Dungeon QA artifact even on failure so the evidence remains available for diagnosis.

Forge v1.97.1 adds a **Dungeon Visual QA** pipeline so dungeon-renderer work has repeatable visual evidence instead of relying only on manual gameplay screenshots.

A dedicated capture route is available at `?dungeonQa=1`. It loads the bundled Hollow Vault package and renders six fixed views through the authoritative Dungeon V3 pipeline: full overview, Drowned Crossroads, the Crossroads→Ossuary connector, Sunken Reliquary, Ossuary Hall, and Warden Sanctum. Room views use the same 44° ARPG camera shape and the same atmosphere, lighting, shadows, tone mapping and bloom profile as the real dungeon presentation.

The capture page publishes `window.__FORGE_DUNGEON_QA_READY__` and `window.__FORGE_DUNGEON_QA__` metadata for automation. `npm run qa:dungeon` launches the production preview with Playwright, waits for all fixed views, captures a full contact sheet, writes each view as an individual PNG, and emits a JSON manifest with Forge build/version and dungeon fixture metadata.

Pull-request CI now captures and uploads `dungeon-visual-qa-fast` after the normal build and Equipment QA. Production Pages QA captures `dungeon-visual-qa` with 14-day retention. A failed renderer, missing canonical room, page error, missing image, or empty view set fails the Dungeon QA capture instead of silently publishing a broken visual build.

This is a workflow/validation release only. It does not alter Dungeon Atmosphere V3 art, combat, navigation, collision, room layout or balance.

Forge v1.97.0 is the **Dungeon Atmosphere V3** presentation pass. It follows the supplied cathedral references and the user's v1.96 gameplay/editor screenshots, with the goal of making the dungeon feel authored and atmospheric rather than simply brighter.

The **material/wall pass** reduces procedural noise first. Floor bricks use broader courses, substantially rarer missing/damaged pieces and low-frequency tonal variation so the floor reads as one crafted stone surface instead of repeated black cuts. Sparse cracks/etched marks remain, but their frequency and size are reduced. Large soft deterministic shadow/lift patches add broad material variation without adding clutter. Floor emissive flattening is reduced so local light can shape the surface.

Perimeter masonry is smoother and less voxel-like. Row staggering is much smaller, damage gaps are far rarer, shortened bricks retain most of their length, wall depth is slightly reduced and row heights are more consistent. Wall emissive fill is reduced so torch/cyan light can model the face, and a subtle dark wall-foot strip anchors the perimeter to the floor without changing geometry or collision.

The **lighting hierarchy pass** restores actual bloom to the shared dungeon presentation. Test Dungeon now renders through an EffectComposer + UnrealBloomPass using each dungeon theme's existing bloom profile; Dungeon Forge Edit uses the same pass and settings. This makes warm flames and cyan relics emit the soft luminous halos that were missing from runtime while keeping the HTML HUD unaffected. Composer resources are disposed on exit/rebuild paths.

Crypt global ambient/fill is deliberately reduced from v1.96 so the scene is no longer one evenly illuminated blue surface. Room bounce and local room point lights are smaller/more focused, producing readable centers with darker edges. Torch/cyan fixtures remain the brightest visual anchors. The player-follow readability light is reduced so environment lighting—not a hidden player halo—defines the mood.

The **room staging pass** keeps combat floor space open while adding authored structure. Boss/elite/shrine/treasure/crossroads rooms receive subtle geometric floor inlays, burial/ossuary spaces receive wall-attached plaques, large spaces get deliberate perimeter rhythm, and corridors receive sparse threshold lines. These are all decorative/no-collision overlays. Existing Cold Cathedral ward stones/beacons remain the primary physical focal language.

Dungeon Forge Edit and Test Dungeon continue to use the same authoritative ARPG V3 renderer. The new floor material, wall smoothing, bloom, lighting hierarchy and staging therefore appear in both rather than creating a separate editor look.

This release changes presentation only: no enemy AI, damage, encounter counts, loot, navigation, collision, room layout or Vault Warden balance values were changed.

Forge v1.96.0 is the **Cold Cathedral Presentation v2** pass, driven by direct comparison between the supplied Rime Cathedral references and screenshots of v1.95.0.

The main correction is luminance hierarchy. The previous build had the right hue family but the playable floor rendered at roughly half the visual brightness of the references. Crypt floor/sky/fill values are therefore lifted while the outside void is pushed even closer to black. The goal is a clearly readable blue-gray floor floating in darkness, not a globally brighter scene.

Floor masonry is also less noisy. Bricks are slightly larger and almost fully close their previous gaps, so the floor reads as broad staggered stone courses instead of dense black vertical striping. The floor carries a stronger restrained blue emissive base while cracks and sparse etched lines remain visible above it.

Atmosphere v2 now adds one soft non-shadowing cool fill light per room in the shared ARPG renderer. These lights are local to the authored room bounds, so props/walls receive the same blue illumination as the floor while corridors and the exterior void can still fall away into darkness. Additive room-bounce planes are larger and stronger, and mist/dust remain deliberately restrained.

ARPG perimeter walls are visually reduced from the very tall v1.95 silhouette to a 1.75–2.15 m presentation range. Collision and dungeon navigation are unchanged. This makes the walls read as a strong dark masonry frame around the room rather than giant boxes hiding the playable floor. Wall caps are brighter so the perimeter remains legible from the steeper camera.

Warm sconces now use stronger point lights, larger floor pools, larger wall washes and slightly larger flames. Cyan ward stones likewise use brighter emissive stone, larger blue floor pools and stronger local lights. A second compact **cold beacon** prop family adds low pedestals with glowing cyan relics to boss/elite/shrine/large rooms, filling oversized rooms with intentional focal rhythm without adding collision.

Test Dungeon uses a dungeon-specific camera shape instead of changing the shared world camera. The dungeon camera is substantially steeper and uses a tighter 44° FOV, creating a flatter isometric composition closer to the references while leaving World Forge/overworld gameplay unchanged.

This release is still visual presentation only: no enemy AI, damage, encounter-count, navigation, collision, loot or Vault Warden balance values were changed.

Forge v1.95.0 is the **Cold Cathedral dungeon art-direction pass**, based on the supplied visual references and implemented through Forge's own procedural geometry/material language.

The crypt palette is rebuilt around a near-black void, cool blue-gray masonry, dark navy seams and a brighter readable stone floor. Global fog is reduced and the ambient/key mix is cooler and more restrained so the room reads through local light sources instead of a flat gray fill.

Warm sconces now provide stronger orange islands around the room perimeter while remaining the same shared fixture system in Edit and Test Dungeon. Torch hardware is shifted into dark blue steel so the fire color is the focal point rather than brown brackets.

Floor masonry uses slightly broader rectangular courses with less muddy damage contrast. Cracks are cool dark-blue instead of brown/black, and sparse long pale-blue etched wear lines break up large floors without turning them into noisy procedural scatter.

Atmosphere v2 is sharpened rather than made foggier. Room bounce colors now stay within a coherent cool-blue family, visible low mist is reduced to one or two restrained pockets, and airborne dust is subtler. Boss/elite/shrine/treasure rooms still vary, but they no longer switch to unrelated red/green/brown floor moods.

A new **cold ward-stone** presentation provides the second lighting family visible in the references: faceted blue-gray monuments with cyan rune cores, soft additive floor pools and a tightly capped set of non-shadowing cyan point lights. They are staged sparsely at room edges in boss/elite/shrine/large spaces and are explicitly decorative rather than collision geometry.

Existing humanoid crypt statues are replaced with abstract faceted cathedral markers so environmental props share one graphic language. The shrine relic is now a bright cyan magical focal with a small local light, and the Warden dais uses a restrained cold-blue seal/ring treatment.

All of this lives in the shared Dungeon V3 renderer introduced in v1.94.0, so Dungeon Forge Edit and the real Skillbound/Test Dungeon runtime receive the same materials, fixtures, ward stones, atmosphere and dressing. This release does not change enemy AI, combat damage, encounter counts, navigation rules or Vault Warden phase tuning.

Forge v1.94.1 refines the **Dungeon Forge authoring overview** after the v1.94.0 renderer unification.

The actual dungeon world renderer is unchanged. Edit, Test Dungeon and Skillbound still share the same ARPG V3 geometry, materials, props, walls, lighting, fog and exposure.

The editor camera now starts much closer to a true top-down authoring angle so full-height runtime walls no longer hide as much of adjacent rooms. OrbitControls are constrained to useful authoring angles while still allowing rotation and panning.

The overview framing is tighter around authored dungeon bounds, and the editor grid is now less dense, lower contrast and more local to the dungeon instead of visually dominating the surrounding void.

This is an editor-camera/grid usability patch only. No dungeon art, lighting, combat, encounter, navigation or gameplay values changed.

Forge v1.94.0 is the **Dungeon Forge Unified Preview** release. Dungeon authoring now follows one visual authority: the creator overview, Test Dungeon and actual Skillbound dungeon play all render the same authored world presentation.

The old first-person **Walk** mode has been removed from Dungeon Forge. Test Dungeon remains the only playable preview and continues to launch the real `SkillboundDungeonPlayViewport` / `ForgeDungeonRuntime` used by Skillbound.

For crypts, the creator now calls `addDungeonMasonryV3(..., 'arpg')`, exactly like the Skillbound runtime. Editor mode no longer substitutes the lower `editor` wall treatment or the full-height `walk` treatment. Tall walls, room architecture, fixtures, dressing, Atmosphere v2, mist/dust and torch presentation therefore come from the same renderer in Edit and runtime.

The interaction-only `crypt-interaction` visual LOD has been removed. Dragging or resizing a room no longer swaps the dungeon to a reduced-detail theme, so what is visible while editing remains the actual authored presentation.

Dungeon Forge no longer adds editor-only bloom or a second legacy crypt atmosphere-particle layer. Its Hemisphere/Ambient/Directional lighting positions, intensities, fog and tone-mapping exposure use the same `dungeonLightingProfile` and runtime light rig. The overview camera is intentionally different for authoring, but the world being viewed is the same.

Built-in dungeon props in the creator now use the same runtime prop renderer. Library GLB props share one fitting/loading helper for identical normalization, scale, floor alignment and shadow setup in Edit and Skillbound. Authored manual walls likewise use the shared `addDungeonManualWallV3` geometry in both places.

The only creator-specific visuals are authoring overlays: the grid, room outlines, resize handles, marker/prop labels, selection rings and selection wireframes. These overlays do not replace or simplify the underlying dungeon world.

This release is editor/runtime presentation architecture only. Combat behavior, encounters, Vault Warden tuning, navigation rules and authored dungeon data are unchanged.

Forge v1.93.1 is the **ARPG Wall Cutaway Polish** follow-up based on recorded gameplay of v1.93.0.

The cutaway footprint is now much tighter. Direct camera-blocking wall chunks target ~5.5% opacity so they read as a clean cutaway instead of a translucent overlay. The immediate neighbor ring is reduced to ~4.6 m and targets ~46% opacity, while a small outer feather reaches only ~6.8 m at ~76% opacity. Wall chunks farther than ~9 m from the player are excluded from neighbor fading.

Fade-out remains quick, with the direct blocker responding fastest, but wall restoration is substantially faster once a chunk is no longer in front of the camera. This reduces the lingering ghost-wall effect visible in the v1.93.0 gameplay clip while preserving readability around corners.

No wall geometry, lighting, combat, collision, navigation, encounter pacing or Vault Warden tuning changes are included in this patch.

Forge v1.93.0 is the **ARPG Wall Readability & Cutaway Occlusion pass**. It keeps the v1.92.7+ architectural wall height while addressing the large dark foreground wall masses exposed by live gameplay.

ARPG perimeter chunks now publish stable chunk centers for camera presentation. The dungeon camera still raycasts directly to the player, but a directly blocking wall chunk now creates a feathered local cutaway pocket instead of fading as an isolated slice: the direct blocker targets ~12% opacity, nearby foreground chunks within ~7.2 m target ~34%, and a second feather ring out to ~10.5 m targets ~58%. Candidate chunks behind the player or far from the player are excluded, so the rest of the dungeon keeps its full wall silhouette.

Cutaway transitions use tier-specific response speeds for a smoother opening around the player and a slightly slower restore, reducing hard popping as the camera/player move past corners. Existing non-wall occluders still use the direct-block fade behavior.

Tall masonry readability has also been improved without changing wall geometry. Brick shade variation now changes by vertical row instead of repeating the same value up the full wall, upper rows receive a small lift, and cap stones are more visibly separated. ARPG perimeter emissive fill is modestly increased so wall faces do not collapse into black slabs.

The crypt palette receives a restrained visibility lift: slightly brighter cool ambient/key fill, lighter wall and dark-stone values, lower fog multiplier, and a very small exposure increase. Warm torch color/intensity is unchanged so torch pools remain the primary atmospheric contrast.

This remains presentation-only: wall height, collision/navigation, enemy behavior, encounter pacing and Vault Warden balance are unchanged.

Forge v1.92.9 is the **ARPG Crypt Pillar Cleanup** hotfix based on live gameplay feedback.

The freestanding ARPG corridor supports and doorway goalpost frames introduced in v1.92.8 have been removed. Procedural connection points can sit slightly inside a room, which made those pieces read as loose pillars/furniture rather than wall architecture from the isometric camera.

ARPG now keeps only architecture that is visually anchored to the dungeon perimeter: tall masonry walls, wall-integrated Warden buttresses, framed wall recesses, torch wall washes, candle accents and environmental atmosphere. Full corridor arches and doorway post/lintel assemblies remain available in Walk mode, where the lower camera can read them as part of the architectural shell.

This is a presentation-only cleanup: collision/navigation, enemy behavior, encounter pacing and Vault Warden balance are unchanged.

Forge v1.92.8 is the **Crypt Architectural Depth pass**. It builds on the v1.92.7 tall-wall baseline and remains presentation-only: combat, Vault Warden balance, navigation and collision are unchanged.

ARPG mode now renders the crypt architecture that was previously restricted to Walk mode. Corridor support buttresses, recessed masonry backs and mid-corridor arch lintels are enabled at ARPG-appropriate heights. Room connections now receive visible stone doorway posts, capitals, lintels and wedge stones so passages read as authored openings rather than simple gaps in the perimeter.

Large Warden spaces gain more structural rhythm. The Warden Sanctum uses four wall-integrated buttresses instead of two, the Warden Hall gains opposing supports, and boss/warden/ossuary spaces receive shallow framed wall recesses. Warden recesses use a restrained muted-red interior glow to reinforce room identity without resembling combat telegraphs.

New ARPG architecture is deliberately excluded from `dungeonArtCollidersV3`. Tall doorway/support meshes are marked for the existing Skillbound camera occlusion ray, so foreground architectural pieces fade when they block the player instead of introducing new movement obstacles.

Torch presentation now has a vertical wall-light wash in addition to the existing floor pool and flame VFX. A tiny local drifting-dust system catches the light around each sconce, with boss-room fixtures using a slightly broader wash. No additional dynamic light budget is consumed by these washes or dust motes.

The Warden Sanctum also receives two restrained candle clusters near its far side to strengthen the arena focal composition without changing encounter geometry or spawn positions.

Forge v1.92.7 is the **Tall Crypt Walls & Atmosphere Visibility follow-up** based on live Dungeon Atmosphere v2 gameplay feedback.

The previous ARPG V3 perimeter deliberately used a 0.98 m silhouette wall, which made the crypt read like a flat tabletop. ARPG walls now derive from authored room height and clamp to roughly 2.35–2.9 m, while Dungeon Forge editor mode keeps a lower editing silhouette and Walk mode keeps full architectural height.

Tall ARPG perimeter masonry is split into local ~6.4 m instanced chunks and marked for the existing Skillbound camera occlusion system. When a foreground section falls between the camera and player, only that local wall chunk fades; the rest of the dungeon keeps its full-height silhouette. Collision/navigation geometry is unchanged.

Atmosphere v2 room bounce is intentionally more visible at gameplay camera distance: boss/Warden, elite, shrine, reliquary, crossroads, ossuary and ordinary-room mood opacity has been raised, pools cover more of each room, and low mist pockets are larger/more numerous. Drifting dust is also slightly easier to see while remaining lightweight.

This is still a presentation-only update: no enemy AI, HP, damage, encounter pacing, Vault Warden phase tuning, player movement, art colliders or navigation rules are changed.

Forge v1.92.6 is the **Dungeon Atmosphere v2 pass**. It changes presentation only: Combat v4 behavior, enemy counts, encounter timing, Vault Warden HP/phase thresholds/transition timing and navigation collision remain unchanged.

The shared Dungeon Forge V3 renderer now adds a second atmosphere layer after structural geometry, fixtures and room dressing. Every Skillbound crypt room receives a restrained room-identity bounce pool: Warden spaces lean muted blood-red, shrine spaces cool green, reliquaries warm stone/amber, crossroads cool slate, and ordinary burial spaces stay neutral. These are low-opacity additive light pools rather than new gameplay telegraphs.

Rooms also receive deterministic low mist pockets and a single shared drifting-dust particle system. Mist uses soft radial planes with slow opacity breathing; dust rises gently with tiny lateral drift. Density scales with room size/type and stays deliberately low so combat silhouettes and telegraphs remain readable.

Small edge stone chips now age the floor perimeter without cluttering the playable center. They are rendered as one instanced decorative mesh named `DungeonV3AtmosphereDebrisNoCollision`, explicitly excluded from `dungeonArtCollidersV3`, so atmosphere debris never changes movement or causes wall-sticking.

The crypt lighting palette has been rebalanced around warm torch pools and readable cool fill: slightly brighter stone/sky fill, warmer stronger torches, lower global fog multiplier, and a modest exposure/bloom lift. The intent is atmospheric and cozy without returning to the earlier too-dark dungeon problem.

Because Atmosphere v2 lives inside `addDungeonMasonryV3`, Dungeon Forge's shared V3 renderer and actual Skillbound dungeon play receive the same environment treatment instead of maintaining a separate runtime-only art pass.

Forge v1.92.5 is the **Combat Audio & Encounter Feedback pass**. It leaves Combat v4 balance, Vault Warden HP/phase thresholds/timing, enemy counts and attack timing unchanged.

Combat audio is now event-driven instead of being tied directly to specific sound assets. The shared dungeon runtime exposes semantic cues for player attack/cast release, dodge, enemy role attack release, projectile launch/impact, melee/area impact, poise break, normal/elite death, Channeler Grave Zone, Vault Warden phase shift, encounter start/wave/clear, boss awakening/defeat and return-portal activation.

A new `ForgeCombatAudio` runtime provides lightweight procedural WebAudio fallbacks so every cue is audible even before final authored assets exist. Role-aware pitch and intensity distinguish Brute, Arbalist, Channeler and skirmisher events; small deterministic pitch variation keeps repeated cues from sounding identical. Spatial stereo panning uses the event's world X position relative to the player.

Combat audio is bounded: per-cue cooldowns suppress accidental duplicates and attack/impact/movement/stinger concurrency limits prevent large encounters from becoming an audio wall. All procedural sounds reuse Forge's shared AudioContext.

`ForgeDungeonRuntimeOptions.combatAudioCues` accepts a semantic cue → Library audio asset id map. When a mapped asset exists it replaces the procedural fallback for that event without changing combat code, providing the handoff point for future Audio Studio authoring.

Forge v1.92.4 is the **Combat Feel & Feedback pass**. It deliberately leaves Vault Warden health, thresholds, phase timing and encounter balance from v1.92.3 unchanged so the next gameplay recording can still evaluate that tuning cleanly.

Meaningful hits now receive stronger presentation without making every light hit freeze the game: poise breaks, lethal hits and attacks that remove a large fraction of an enemy's health receive a modest hit-stop/camera floor while ordinary attacks keep their existing values. Existing role hit reactions remain the animation authority rather than adding a competing combat animation layer.

Dungeon death presentation now uses deterministic fall/settle motion with role-sensitive duration, pitch, roll, lift and shrink instead of a mostly flat slide/fade. The update no longer allocates a temporary drift vector every frame.

Transient combat presentation FX are bounded to 48 active effects. Spark bursts cap at 14 particles and share one geometry/material per burst, and disposal de-duplicates shared GPU resources. This specifically reduces allocation/disposal pressure during multi-enemy deaths, caster impacts and burst-damage sequences.

Vault Warden phase shifts now receive a boss-centered 3D transition treatment: an expanding emissive shell with rising orbiting wisps follows the Warden for the existing phase-lock duration. It avoids introducing another floor telegraph/ring and does not alter the v1.92.3 phase thresholds, HP multiplier or phase timing.

Forge v1.92.3 is the **Combat v4 boss-pacing pass** based on the latest Hollow Vault gameplay recording. The floor-height/VFX corrections from v1.92.2 are holding up in motion; the main issue exposed by the clip was that the Vault Warden was burning through Iron Flood, Gravebound and Last Oath within only a few seconds, compressing the intended four-phase fight into one burst window.

Boss phases now advance **sequentially only**. Burst damage can no longer jump directly from Warden Awakens into Gravebound or Last Oath. Each threshold starts a short phase-shift lockout (1.35s for Iron Flood/Gravebound, 1.05s for Last Oath) during which the Warden cannot move into a signature attack or begin a normal attack. Telegraphs are cleared, Combat v4 signature state is cancelled, and the HUD surfaces `PHASE SHIFT` so the transition reads as intentional rather than AI hesitation.

The phase gate is time-based rather than a hidden health heal: damage is not restored when a threshold is crossed. If the player has already pushed below the following threshold, the next phase still waits for the current phase-shift window to finish before advancing, guaranteeing each phase/add package a readable beat.

Vault Warden durability is increased from 5.2× to 8.8× base Crypt Brute health so the phase kits have enough time to matter. Boss damage is slightly reduced from 1.62× to 1.58× and the global cooldown multiplier relaxed from 0.94× to 0.96× so the extra fight duration adds mechanics rather than simply multiplying unavoidable damage. Skillbound content revision is now 15 so cached projects receive the revised boss tuning.

Forge v1.92.2 fixes dungeon ground-target and combat VFX height against Dungeon Forge V3 floor geometry. The rendered crypt masonry sits above the navigation floor, while several newer Combat v4 effects were still using small local offsets such as 0.035–0.05. That could place telegraphs, grave zones, dash/charge lines and caster impact discs partially inside the floor.

Combat-ground presentation now resolves the actual runtime `floorHeightAt(x, z)` and applies a shared 0.16m visual clearance. This is used by Combat v4 dash/charge line cues, persistent Grave Zones, melee slash arcs, caster impact discs and enemy-arrival runes. Area/projectile telegraphs now resolve the floor at the captured target position in world space before converting back into the enemy's local transform, so remote target circles also sit correctly on floors with differing height.

Legacy dungeon enemy telegraphs are lifted to the same clearance and receive polygon offset plus a higher render order to avoid z-fighting against detailed floor meshes. The shared pulse system used by dodge, skills, hits, boss transitions and other transient rings is also standardized at the same height. Authored library VFX continue to use their existing floor-aware clamp.

Forge v1.92.1 is the **Combat v4 gameplay-video polish** pass. Review of a full Hollow Vault run showed three presentation problems that were technically working but reading poorly in motion.

Enemy wave arrivals no longer use the tall translucent cylinder that looked like a debug teleport volume. Dungeon enemies now announce a spawn with a restrained ground rune, small rising additive wisps and a brief light pulse, then rise out of the floor. The arrival still prevents attacks until the enemy is fully present, so waves remain readable without enemies popping into existence.

The locked sanctum return portal has also been redesigned. The previous portal used two horizontal red rings, which looked almost identical to attack/skill telegraphs and appeared to be stale combat circles during the Warden fight. The locked portal is now a very dim upright doorway with a subdued floor disc; after the Warden is cleared it becomes a bright green upright portal with an illuminated core.

The Vault Warden spawn marker was moved away from the generated central sanctum centerpiece so the boss no longer emerges through the altar. Boss-phase summons now arrive on a wider 4.2–5.8m formation around the Warden instead of the old 2.3–3.5m ring, preventing boss + adds from collapsing into one unreadable melee pile. Skillbound content revision is now 14 so cached workspaces receive the corrected sanctum spawn position.

Forge v1.92.0 is the **Combat v4 — Enemy Identity & Encounters** release. It keeps the Combat v3 spacing, poise, telegraph and presentation foundation, but gives each Skillbound enemy role a signature gameplay kit instead of relying on one normal attack loop.

**Road Wretch — pressure / dash-slash.** Wretches still orbit at short range, but now periodically commit to a clearly telegraphed dash line from mid-range. After a short anticipation they burst along the captured direction and can connect with a fast dash-slash before entering recovery. A poise break interrupts the dash for normal Wretches, so aggressive melee play can stop the pressure rather than only dodging it.

**Crypt Brute — charge / slam.** Brutes can now telegraph a long forward charge from outside melee range, commit to that line, then finish with a radial mace slam. The slam has a larger hit zone and heavier presentation than the Brute's normal swing. Poise breaks can interrupt non-boss Brutes during the commitment. The Vault Warden inherits the same kit with boss-specific range, timing and escalation.

**Bone Arbalist — volley / reposition.** Arbalists maintain range as before, but every special cycle converts the next aimed shot into a multi-bolt fan volley. After firing they actively reposition laterally/backward before resuming normal aim-fire behavior. The volley uses the same physical bolt system introduced in v1.91.0 and is visible in the target HUD as `VOLLEY` during the committed windup.

**Grave Channeler — grave zone / support.** A special Channeler cast now leaves a persistent grave zone at the captured target location. The zone remains dangerous for several seconds and deals periodic damage if the player stays inside it. The same cast empowers nearby encounter allies for a short window, accelerating their attack recovery and special-cycle pressure. Empowered enemies are surfaced in the target HUD and receive a stronger violet fallback-rig accent.

Combat v4 special actions respect the dungeon attack-slot director so a mixed pack cannot all commit signature attacks at once. Wretch/Brute special actions are also integrated with poise-break interrupts, death cleanup, arrival lockout and the existing shared runtime fault isolation. The same role kits run in overworld combat, Combat Lab and Dungeon Forge → Test Dungeon.

**Encounter pacing was rebuilt around those identities.** Drowned Crossroads now teaches the Wretch dash first, introduces Arbalist ranged pressure second, then combines Brute + Channeler + Wretch in the final wave. Ossuary Guard uses a frontline wave, a dedicated ranged/control kill-zone wave, and an elite mixed last stand instead of simply escalating enemy count.

**Vault Warden is now a four-phase Combat v4 boss.** Warden Awakens establishes the charge/slam language. Iron Flood starts at 72% health and adds Arbalists while increasing pressure. Gravebound starts at 42% and adds Channelers while Warden slams begin leaving short grave shock zones. Last Oath starts at 16% health, further shortens the Warden's signature cooldown and increases slam radius/damage for the final burn phase. The target HUD displays the current boss phase beside the boss name.

Combat v4 tuning is authored through new optional enemy definition fields: `specialCooldown`, `dashDistance`, `chargeDistance`, `volleyCount`, `hazardDuration`, and `hazardTickDamage`. Skillbound content revision is now 13 so existing cached workspaces advance to the new enemy tuning, encounter pacing and boss profile.

Forge v1.91.0 is the **Combat v3 Presentation Polish** release. It keeps the existing Combat v3 mechanics and focuses on making enemy actions readable and satisfying in both normal Skillbound play and Dungeon Forge → Test Dungeon.

The old featureless cylinder fallback enemies are replaced by articulated low-poly role rigs whenever no authored enemy character asset is attached. Road Wretches use a lean dual-blade silhouette, Crypt Brutes use a broad armored torso and mace, Bone Arbalists use a hood/quiver/crossbow silhouette, and Grave Channelers use a robe, hood and glowing staff orb. Elite fallback enemies also gain a small role-colored crown cue. These rigs are still procedural fallbacks rather than final authored enemy assets, but they now read as actual combatants instead of debug capsules.

Fallback rigs now animate from the real combat state: walking drives a simple stride, melee windups pull weapons back, Brutes raise for a heavy slam, Arbalists aim before firing, Channelers raise the staff and intensify the orb, attack release produces a fast follow-through, and stagger/hit events kick the body off balance. Bound authored enemy assets continue using their animation bindings while the fallback rig stays hidden.

Enemy telegraphs and attacks are also more role-specific. Melee ground warnings are directional arcs instead of full circles. Wretch releases produce a quick slash arc, Brute releases add a heavier shock/spark response, and Arbalists now fire a physical low-poly bolt with shaft, metal tip, fletching and a short luminous streak instead of a glowing sphere. Bolt impacts produce compact sparks. Channeler area attacks now erupt with a brief role-colored ground disc, rising magical shards and an impact burst in addition to any authored VFX binding.

Hit presentation now layers directional body recoil and spark bursts on top of the existing knockback/hit-stop. Poise breaks receive a stronger gold-toned burst so a break is visually distinct from a normal hit. Dungeon deaths now carry their incoming momentum, tip/fall, sink slightly, shrink and fade while shedding role-colored fragments before the runtime hides the corpse. Channelers get a small magical collapse treatment; Brutes and bosses use heavier bursts.

The presentation effects are driven by the shared Combat v3 runtime, so the same enemy pose, projectile, caster-impact, hit and death behavior is used in overworld combat and the shared dungeon runtime wherever the relevant role exists.

Forge v1.90.4 fixes a shared dungeon runtime stall exposed by Combat v3 encounter spawning. Encounter Forge/Boss Forge's enemy spawn path predated the newer combat state and did not initialize `knockback`, `staggerRemaining`, or `recoveryRemaining`. The Combat v3 dungeon update then attempted to call `enemy.knockback.lengthSq()`, throwing every frame. The camera/render loop remained alive by design, which made the failure look like several unrelated bugs: enemies stood still and never attacked, attack/dodge/skill rings stopped expiring, and lethal hits could leave an enemy white and standing because the damage handler threw before `killEnemy()`.

All dungeon enemy spawn paths now initialize the complete mechanical combat state, and Combat v3 also normalizes those fields defensively before every decorated enemy enters shared AI. Legacy or future authored spawn paths therefore receive a valid `THREE.Vector3` knockback accumulator plus finite stagger/recovery/windup timers automatically.

The dungeon frame loop is also more fault-isolated. Player/encounter updates, enemy AI, transient VFX/loot/portal updates, and camera/rendering run in separate guarded stages. Temporary attack, dodge and skill effects are aged out before secondary runtime systems, so a future enemy/loot/VFX error cannot strand ground rings in the scene. With the underlying exception removed, hit emissive now decays normally, enemy AI resumes after arrival lockout, lethal hits reach the real death flow, and dead enemies disappear after their death presentation.

Forge v1.90.3 adds a proper **Dungeon Wave Arrival** presentation so encounter enemies no longer pop into existence when a trigger activates.

Each newly spawned dungeon enemy now begins with a compact role-colored arrival cue at its authored/formation position. The body remains hidden during a short anticipation window, then rises from below the floor and scales smoothly into place. Individual enemies receive a small deterministic delay offset so a wave materializes as an event rather than every enemy appearing on the same frame. Boss arrivals use a longer, larger version of the same treatment.

Enemies are combat-locked for the entire arrival sequence: they cannot move, wind up, fire, cast or collide into an attack while materializing. Once the emergence completes, the cue cleans itself up, the enemy returns to its intended authored scale/height, and normal Combat v3 behavior resumes. This works for Dungeon Forge → Test Dungeon and normal Skillbound dungeon play because both now share the same runtime.

Forge v1.90.2 is a Dungeon Combat readability/hotfix pass based on the first shared-runtime Dungeon Forge test.

Dungeon Forge starter and auto-created Skillbound crypt encounters now bind directly to the authored Combat v3 profiles instead of the legacy `undead` / `crypt-warden` fallbacks. Standard combat rooms default to **Drowned Crossroads Ambush**, elite rooms to **Ossuary Guard**, and boss rooms to **Vault Warden**. The Dungeon Forge Encounter inspector now exposes the active Encounter Forge or Boss Forge profile and shows its authored wave/phase count, so a room can no longer silently look like a production encounter while actually running a manual one-wave fallback.

Dungeon Runs v2 wave spawning now uses role-aware formations. Centered spawn markers distribute melee enemies around the encounter perimeter while Arbalists and Channelers prefer the outer ring; explicit off-center spawn markers remain respected. Spawn candidates avoid appearing directly on top of the player and validate against dungeon navigation where possible.

Dungeon combat crowding is also stricter. Enemies have role-aware soft spacing plus a hard overlap floor, with extra room reserved for Brutes. The runtime limits simultaneous attack commitments so a whole pack cannot enter windup at once: normal melee pressure is capped at two committed attackers, with projectile and area attackers paced separately. Ground telegraphs are thinner and less opaque, while world-space enemy health bars are hidden because they rotated with enemies and appeared as floating rods in the isometric camera. Target health/poise remains in the HUD.

Until authored enemy character assets are attached, the fallback enemy silhouettes now carry simple role cues: Brutes gain shoulder/plate mass, Arbalists a crossbow silhouette, Channelers a staff/orb, and Skirmishers paired blades. These are testing fallbacks, not final enemy art.

Forge v1.90.1 removes the split between Dungeon Forge's old Quick ARPG combat simulator and the real Skillbound dungeon runtime. **Dungeon Forge → Test Dungeon** now snapshots the dungeon currently open in the editor and launches it through the same `SkillboundDungeonPlayViewport` / `ForgeDungeonRuntime` path used by normal Skillbound dungeon play.

That means Dungeon Forge testing now exercises the same Combat v3 enemy roles, poise and elite modifiers, ranged projectiles, caster area telegraphs, Dungeon Runs v2 wave director, Encounter Forge/Boss Forge profiles, boss phases, rewards, player skills/equipment, HUD, shared camera, collision and return-portal flow as the actual game. Changes tested there no longer need to be duplicated into a separate preview combat implementation.

The **Walk** button remains intentionally lightweight and is only for geometry, collision, scale and navigation inspection. The previous **Quick ARPG** button is removed so it cannot be mistaken for production combat behavior.

Forge v1.90.0 is the first **Combat v3 + Dungeon Runs v2** release.

**Combat v3 / Enemy Combat Foundation** replaces the one-behavior enemy loop with four authored combat roles that share the same runtime in overworld and dungeon play. `Road Wretch` is now a fast skirmisher that pressures and orbits melee range, `Crypt Brute` is a slower high-poise frontliner, `Bone Arbalist` maintains distance and fires dodgeable projectiles, and `Grave Channeler` maintains distance and telegraphs ground-targeted area attacks. Ranged and caster attacks snapshot a visible target during windup so moving or dodging out of the telegraph is meaningful instead of the attack silently tracking the player.

Enemies now have **poise** in addition to health. Normal hits can produce small reactions without permanently stun-locking tougher enemies, while sustained pressure or a heavier finisher breaks poise and opens a stronger stagger window. Poise recovers after a short no-hit delay. Elite enemies receive a deterministic modifier based on their runtime identity: **Bulwark** increases poise, **Relentless** attacks more aggressively, and **Swift** moves faster. Target HUDs identify the enemy role/modifier and render a gold poise bar under health. Dungeon deaths also gain a directional collapse/drift instead of remaining perfectly static until removal.

The Play Project now includes a **Combat Lab** panel for repeatable tuning without changing saved encounter progress. It can spawn mixed packs or individual archetypes around the current hero, clear all lab enemies, toggle invulnerability, and run combat at 1×, 0.5× or 0.25× simulation speed for inspecting telegraphs, dodges, combo contact, poise breaks and stagger timing. Lab enemies are transient and do not count as authored encounter progress.

**Dungeon Runs v2** changes Hollow Vault from a set of pre-spawned rooms into a directed run. Encounter Forge profiles can now author mixed enemy waves with their own messages and timing. The runtime activates encounters in authored run order, locks encounter doors as appropriate, spawns only the active wave, waits for it to be cleared, announces reinforcements, and only completes the room after the final wave. The HUD shows dungeon-run progress plus current wave state.

The bundled Hollow Vault now uses that director. Drowned Crossroads is a three-wave escalation from skirmishers into ranged/caster crossfire and a brute-backed final push. Ossuary Guard is a three-wave elite encounter with brutes, arbalists and channelers. The Vault Warden is now based on the Crypt Brute combat identity and keeps the existing Boss Forge phase system: later phases call in Bone Arbalists and then Grave Channelers before the final reward/return-portal flow. Encounter reward profiles, boss guaranteed rewards, door state, XP/gold rewards and the shared v1.89.4 gameplay camera remain integrated.

Combat v3 runtime extensions live in `src/engine/runtime/ForgeEnemyCombatRuntime.ts`. Dungeon wave/run sequencing lives in `src/engine/runtime/ForgeDungeonRunRuntime.ts`. Enemy role fields are part of `ForgeEnemyDefinition`, Encounter Forge profiles can author `waves`, and dungeon encounters now expose `encounterProfileId` / `bossProfileId` as first-class package fields. Bundled Skillbound content revision is now 12 so existing workspaces can advance to the new four-enemy roster.

Forge v1.89.4 fixes the dungeon-only camera freeze and makes playable camera behavior shared instead of mode-specific. The overworld and full dungeon runtime now call the same `ForgeGameplayCamera.ts` implementation for framing, follow smoothing, velocity look-ahead, cursor aim look-ahead, camera shake, zoom response, offset angle and look-at height. Dungeon FOV, default distance, zoom limits and wheel step now come from the same `FORGE_WORLD_SCALE` camera contract as overworld play.

The dungeon frame loop also isolates camera/occlusion updates from combat and encounter simulation. A gameplay exception can still be logged without preventing the camera from following the player on that frame, removing the failure mode where the dungeon remained rendered and movable while the camera appeared frozen. Dungeon Forge's Quick ARPG preview now uses the same camera FOV, offset, follow math and movement look-ahead so its framing stays aligned with Play Project.

Forge v1.89.3 is the Combat v2 readability/spacing pass based directly on recorded Wanderer gameplay. Melee lunges now stop at a front-facing contact distance instead of carrying the player through enemies, and the three combo arcs are tightened so primary attacks read as forward cleaves rather than near-360-degree hits. Hit 3 keeps the strongest lunge/impact presentation but is still contact-clamped.

Combatants now maintain active spacing during chase, stagger, windup, and recovery. Enemies push away from the player when they get too close, push apart from nearby encounter members, and dungeon enemies blend separation plus a small deterministic tangential bias into their approach so packs spread around the player instead of stacking in one point. Dungeon enemy movement also refuses steps that would move farther inside the player spacing radius.

Routine hit flash is now a short warm emissive accent instead of the strong white wash, damage numbers use smaller staggered lanes and shorter lifetimes to reduce pile-up, and the three melee impact pulses scale progressively so the third strike reads more clearly as the finisher.

Forge v1.89.0 introduces the first Combat v2 foundation pass. Primary melee now chains through three mechanically distinct hits instead of repeating one cadence: each step has its own windup, active frame, recovery, arc width, forward lunge, damage weight, knockback, hit-stop and stagger, with the third swing acting as the finisher. The combo resets after a short pause and uses a wider buffered-input window for cleaner click chaining.

Melee damage resolves on the active/contact frame after the lunge. Dodge can cancel once a hit has committed (active/recovery) but cannot erase the windup commitment. Enemy reactions now include directional recoil, stagger windows, explicit post-attack recovery, and clearer growing telegraphs. Dungeon elites and bosses resist stagger/knockback so they cannot be permanently locked down, and dungeon enemy hits now add player recoil plus a short hit-stop. Overworld and dungeon runtimes share the same Combat v2 tuning in `ForgeGameplayFeel.ts`.

Forge v1.88.3 refines reward feedback around the latest dungeon-lighting build. Gold now drops as one stylized four-coin pile per defeated enemy instead of three separate pickup objects. The pile uses overlapping embossed coins, bright additive rims, a warm ground aura, small glints, a compact launch/settle and a fast magnet pull so it reads clearly and feels more valuable on dark terrain.

Gold audio plays only when the pile is actually collected. The cue is a short softer bell-like chime and is no longer delayed until the HUD arrival. XP is fully silent: kills still grant XP immediately and keep the violet world/HUD animation, but routine XP feedback does not play pickup or level-up audio from this reward path.

Forge v1.88.1 refines reward feel after the v1.88.0 gameplay overhaul. XP is no longer a physical world pickup: kills grant XP immediately, show a short violet ring/mote burst at the defeated enemy, emit the HUD XP feedback immediately and preserve level-up handling/save persistence. Gold remains physical but now uses three cleaner coins, a tighter low scatter, at most one tiny bounce and an early high-acceleration magnet snap instead of the previous float-heavy drop.

Reward HUD flights are shorter and more responsive. XP gain text appears immediately at the kill location while the XP-bar arrival follows quickly; gold counter impacts land in roughly half the previous time. Pickup audio was simplified around the Evergrow reward philosophy: gold uses a restrained ascending metallic phrase across rapid pickups, XP uses a quiet rising two-tone cue, and noisy transient/body layers were removed.

Forge v1.88.0 is a full gameplay-feel pass for Skillbound's playable runtime. Overworld and dungeon play now share fast acceleration/deceleration, stepped collision sliding, attack input buffering, held-primary repeat, explicit windup/impact/recovery phases, attack-phase movement, predictive velocity/aim camera look-ahead, and smooth target-based wheel zoom. Dodge can cancel recovery but not an uncommitted attack, keeping actions readable without making movement feel locked.

Reward collection was rebuilt alongside combat. Enemy gold and XP now launch physically, bounce, settle, then accelerate into the player; gold renders as small multi-coin piles and XP has a separate violet crystal/halo language. Collected rewards use longer curved HUD flights with trails and stronger target impacts. Pickup audio is layered Web Audio rather than a single ping: gold combines body/transient/metallic partials, XP uses a rising harmonic shimmer, and level-up adds an ascending accent.

Shared feel tuning lives in `src/engine/runtime/ForgeGameplayFeel.ts`. Physical reward behavior lives in `src/engine/runtime/ForgeRewardPickupRuntime.ts`, HUD flights in `src/components/HudPickupFlights.tsx`, and reward synthesis in `src/lib/pickupFeedbackAudio.ts`.

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

The editor world/camera bounds were expanded for the larger layouts, while Walk and ARPG preview continue to use the same authored package. v1.82.1 separates authoring visibility from runtime mood: the editor gets a neutral fill light, reduced authoring fog and automatic layout framing, while Walk/ARPG keeps the darker torch-lit presentation without crushed blacks. v1.83.0 adds camera-aware cutaway rendering: the two room walls facing the camera fade automatically, crypt brick courses use a lower editor silhouette, the authoring grid crops around the dungeon, corridor walls are less tunnel-like, crypt floors keep a subtle shadow lift, and ARPG mode uses a higher top-down camera with active-room wall cutaways. Crypt rooms now rely on authored wall sconces instead of duplicate floating torch lights. v1.83.2 adds a persistent Brightness control (55–250%) and moves Edit, ARPG and Walk onto the same lighting profile so changing view no longer changes the authored exposure. v1.83.3 rebalances that shared profile so brightness opens neutral room/floor fill much faster than exposure, lowers torch intensity and orange wall wash, sets 135% as the useful default, and improves player readability without adding a separate gameplay light. v1.83.4 replaces top-down foreground-wall fading with true low cutaway architecture: camera-facing room walls, caps, trims, supports and corner masonry collapse to roughly waist height, active-room ARPG cutaways follow the same rule, top-down corridor walls are reduced to about 1m, while first-person Walk keeps full-height architecture. v1.83.5 adds staged generation progress, prevents authoring tools from being intercepted by OrbitControls, previews room/prop movement and room resizing locally during drag and commits once on release, and restores full-height brick courses/cornices on far walls while keeping camera-facing walls cut away.

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

## v1.89.2 — Dungeon live-test render stability

- fixes a Play Project live-test failure where the HUD could remain visible while the Three.js dungeon canvas rendered nothing
- removes the extra real PointLight that v1.89.1 added to every sconce for warm bounce; the same cozy bounce remains represented by the enlarged additive floor/wall glow instead of doubling shader light count
- adds a hard budget of 10 V3 dynamic torch PointLights so generated dungeons cannot create an unbounded number of real-time lights
- fixtures beyond the light budget still keep their animated flame, ember VFX and warm additive pool, so visual dressing remains intact without increasing shader complexity
- replaces the player-follow SpotLight with a small local neutral PointLight to simplify the live shader while keeping character readability
- Quick ARPG uses the same simplified player readability light
- live Dungeon Runtime now isolates gameplay/update exceptions from rendering: a frame-update error is logged once, but the already-built dungeon continues to render instead of disappearing behind the HUD
- keeps the v1.89.1 readable materials, larger soft torch pools and restored scene depth


## v1.89.1 — Cozy depth lighting pass

- preserves the brighter crypt stone/material values from the readability pass so floors and walls stay visible
- reduces broad neutral ambient/fill slightly to restore depth instead of making the whole dungeon uniformly grey
- keeps a cool neutral indirect baseline so geometry between torches remains readable
- expands the visible torch/candle light pools and softens their falloff
- adds a second wide, low-intensity warm bounce light to sconces so nearby walls and floors pick up cozy reflected warmth without turning the whole scene orange
- boss/special-room fixtures get a slightly broader bounce radius while ordinary sconces remain restrained
- replaces the wide player-follow PointLight with a localized soft neutral SpotLight aimed at the character and nearby floor, preserving player readability without flattening the room
- Quick ARPG uses the same localized readability spotlight so editor combat preview and Play Project live testing stay visually aligned
- animated flames, ember particles, dark iron sconces, readable stone and black exterior void remain unchanged
- rebased cleanly on top of Forge v1.89.0 Combat v2


## v1.88.4 — High-readability crypt lighting without losing atmosphere

- significantly raises the physical albedo of crypt floor/wall/corridor stone instead of relying only on stronger global lights, preventing black-crushed masonry while preserving warm/cool separation
- keeps the outside void nearly black so the dungeon silhouette and exploration mood remain intact
- raises neutral hemisphere, fill, key and exposure modestly on top of the brighter stone palette
- increases the subtle V3 floor/wall self-fill so brick shapes remain legible in areas between sconces without looking emissive
- adds a soft neutral **player readability light** to the real Play Project dungeon runtime; it follows the character, has no shadows and is deliberately weaker/desaturated compared with torch light
- adds the same player-centered readability light to Quick ARPG so both gameplay test modes read consistently
- player readability light scales with the existing Dungeon Forge brightness setting rather than using a fixed hard-coded brightness
- warm sconces/candles, flame VFX, embers and local radial light pools from v1.88.1 remain unchanged and continue to provide the dungeon's primary atmosphere


## v1.88.2 — Crypt readability rebalance

- keeps the new local torch/candle flame VFX and warm light pools from v1.88.1 unchanged
- raises the neutral crypt hemisphere/ambient contribution so floors, walls, enemies and the player remain readable between fixtures
- increases neutral fill light substantially without reintroducing the old global orange/brown wash
- restores a stronger neutral directional/key contribution so brick relief and silhouettes remain visible in unlit areas
- slightly raises crypt exposure at normal brightness while preserving darker black voids outside the authored dungeon
- the existing Dungeon Forge brightness slider still scales the shared lighting profile across Editor, Walk, Quick ARPG and Play Project live testing


## v1.88.1 — Cozy dungeon lighting, door removal and smooth wall sliding

- temporarily removes Door from Dungeon Forge authoring and hides legacy door markers in Editor, Quick ARPG and Play Project live testing while the gate/transition system is redesigned
- legacy door markers no longer block player movement, and encounter gate UI clearly reports that the old door system is disabled
- replaces centre-only / margin-shrunk wall collision with a circular 12-point player-footprint check against the unified V3 floor union
- adds a shared angled slide resolver so Play Project live testing, Quick ARPG and Walk flow naturally along straight, curved and concave walls instead of sticking on corners
- keeps the collision footprint close to the visible character while still preventing the character from standing inside wall space
- limits default prop collision to substantial physical props; torches, rubble and floor-detail/spike props are decorative/non-blocking
- rebalances Crypt lighting so global ambient/fill/key light is darker and more neutral while local warm fixtures provide the atmosphere
- rebuilds V3 wall lights as dark iron sconces with wall plates, brackets and cups instead of simple primitive torch posts
- adds animated two-layer flame VFX, additive flame glow, deterministic intensity flicker and rising ember particles to dungeon sconces
- rotates corridor sconces inward toward the playable path and spaces them more deliberately
- adds soft radial floor-light pools beneath sconces to create warm local pools and stronger light/dark rhythm inspired by the Evergrow reference
- adds sparse candle clusters to entrance, reliquary and shrine room templates; candles have animated flame/ember VFX and never add collision
- preserves the Dungeon Forge brightness control so global readability can still be adjusted without flattening the local torch contrast


## v1.87.4 — Neutral crypt palette + surface wall collision

- replaces the brown/gold crypt wash with a neutral charcoal/grey-brown masonry palette; warmth now comes primarily from local torch light instead of the entire ambient/key/fill rig
- removes the fixed warm ambient-fill color from Dungeon Forge, Quick ARPG and the real Play Project dungeon runtime; fill now follows the neutral crypt sky color
- top-down/ARPG no longer renders procedural corridor buttresses, special-room support columns or doorway jamb stacks; those architectural extras are reserved for Walk mode
- lowers and thins the top-down perimeter wall silhouette so it reads more like Evergrow-style low masonry rather than chunky freestanding blocks
- moves V3 perimeter wall geometry outward from the logical floor boundary so the wall no longer occupies the player's navigation surface
- replaces radius-inflated wall collision with **surface-boundary navigation**: the player's centre stays on the authored walkable floor union instead of shrinking every room/corridor by the capsule radius
- this removes the invisible safety ring and greatly reduces snagging on concave corners/curved corridor edges while still preventing the player centre from crossing into the void
- Play Project live testing, Quick ARPG and Walk now all use the same surface-boundary wall rule
- substantial prop collision and explicit manual-wall collision remain separate and unchanged


## v1.87.3 — Dungeon prop density + collision cleanup

- removes the bright/golden treasure material treatment from physical dungeon props; reliquary accents now use muted aged stone/bronze instead of saturated gold
- cuts procedural dressing density significantly so rooms keep large clean combat/readability areas instead of being filled with scattered props
- Crossroads no longer uses a solid broken-plinth obstacle; small rubble/bones/urns remain purely decorative floor detail
- art collision is now limited to genuinely substantial freestanding objects: sarcophagi, statues, shrine/reliquary structures, boss dais, large crate stacks and sealed tombs
- doorway jambs, wall-attached buttresses, torches and decorative floor clutter no longer add extra circular blockers
- special-room wall supports are reduced again; ordinary rooms have none and Warden Sanctum/Warden Hall only use sparse structural accents
- doorway masonry is slimmer and reads as part of the wall instead of freestanding columns
- V3 wall clearance drops from 0.30 to 0.06 beyond the normal player radius, allowing the player to walk naturally close to walls without entering them or snagging early
- the same wall-clearance rule is shared by Play Project live testing, Quick ARPG and Walk


## v1.87.2 — Sparse Evergrow-style dungeon architecture

- removes the dense freestanding-column treatment from ordinary rooms and corridors; regular crypt spaces now read primarily as brick walls/floors with sparse structural accents
- ordinary rooms no longer receive automatic corner pillars; only Warden Hall, Shrine Hall and Warden Sanctum templates get limited wall-integrated supports
- corridor support spacing is reduced dramatically and supports alternate sides instead of appearing in pairs every few metres
- structural accents are now shallow wall buttresses/recesses rather than bright freestanding square pillars
- doorway posts/capitals are slimmer and visually integrated into the wall opening
- trim/cap stone is darker, rougher and less saturated so warm torch light no longer turns every support into a gold column
- collision is intentionally limited to substantial objects: sarcophagi, statues, altars/reliquaries, boss dais, crate stacks, doorway posts and the sparse structural buttresses
- decorative ground clutter such as rubble, bones, urns, floor cracks/damp patches and freestanding torches no longer blocks movement
- art collision continues to share deterministic placements with the renderer so large visible objects remain physically trustworthy


## v1.87.1 — Live dungeon VFX + wall collision

- fixes Play Project skill effects being hidden inside the V3 brick floor by lifting bound VFX and fallback pulses above the authored masonry surface
- preloads ability/enemy VFX in the real dungeon runtime so the first cast/hit does not wait on library parsing
- preloads VFX referenced by Animation Studio events on the active character
- authored Dodge/Dash animation VFX/SFX events now fire through the shared player runtime in both normal Play Project and Dungeon Forge live testing
- brings the shared Chain Lightning runtime into dungeons, including animated chained bolts, impact timing, branching arcs and linked impact VFX
- Dungeon Play now uses semantic Animation V3 attack/cast actions just like the outdoor Play runtime
- adds extra perimeter clearance for the player capsule so V3 room/corridor walls cannot be visually entered or crossed
- applies the same V3 wall-thickness clearance to Quick ARPG and Walk tests for consistent collision between all Dungeon Forge test modes


## v1.87.0 — Dungeon Forge × Play Project live runtime

- adds a new **Play Project** button directly to Dungeon Forge; it launches the currently-authored dungeon through the same Skillbound dungeon gameplay runtime used by the real Play Project
- uses the active Skillbound player profile/Character Forge blueprint instead of the grey Dungeon Forge capsule, including the actual body/character binding and equipped weapon runtime
- uses the role-resolved Play Project gameplay loadout, real primary attack, 1–5 skill hotbar, mana, dodge, encounter/boss combat, loot, inventory and equipment runtime
- renders the real Skillbound HUD theme/layout in the Dungeon Forge live test, including health/resource orbs, hotbar, XP, gold, target bars, interaction prompts and inventory modules
- live tests use an isolated test state with the active character's configured starting loadout so Dungeon Forge testing does not overwrite the player's adventure save
- the Play Project dungeon runtime now consumes the same Dungeon Forge V3 crypt geometry, room shapes, curved corridors, authored art collision and brightness profile as Editor/Quick ARPG
- removes the legacy hidden crypt collision injection from the real dungeon runtime
- adds V3 art collision/manual wall collision to real Play Project dungeon movement and uses V3 floor heights/room silhouettes for player and enemy movement
- Dungeon Forge expands to a full-width gameplay test surface while Play Project live test is active; Exit Live Test returns immediately to authoring without discarding edits


## v1.86.1 — Dungeon V3 art collision pass

- derives gameplay collision from the same deterministic room/corridor placements used by the V3 art renderer instead of a separate partial obstacle list
- sarcophagi, reliquaries, shrine altars, boss dais pieces, statues, crate stacks and crossroads plinths now block player movement
- modular room corner supports, doorway posts and corridor support pillars now have matching collision
- freestanding corridor torches receive small physical collision so visible fixtures can no longer be walked through
- corridor support spacing is now identical in ARPG and Walk so visible architecture and collision stay one-to-one
- collision data is cached per dungeon state to keep movement checks inexpensive


## v1.86.0 — Dungeon Forge V3 art pass

- turns the V3 structural remake into an authored crypt kit instead of a bare procedural blockout
- generated rooms now carry explicit art templates: Threshold, Burial Chamber, Crossroads, Ossuary Gallery, Warden Hall, Reliquary, Shrine Hall, Warden Sanctum, Sealed Ossuary, and Storage Vault
- room templates are editable directly from the Dungeon Forge inspector alongside room shape
- perimeter masonry now has heavier base courses, brighter cap stones, seeded damaged/broken segments, and clearer silhouette layering
- doorway connections get modular posts, capitals, frames and walk-mode lintels instead of reading as holes cut into generic walls
- room/corridor edges gain modular support pillars, damaged supports, corridor recesses and periodic arch structure
- corridors receive seeded freestanding torch fixtures and bounded point-light coverage, matching the authored lighting rhythm used in Evergrow-style crypt spaces
- floor masonry now has chipped/dropped stones, subtle rotation/height variation, seeded cracks and damp patches while remaining instanced
- room dressing is template-aware: sarcophagi, bone piles, reliquaries, shrine altars, statues, banners, boss dais pieces, urns, rubble and storage stacks
- large visible dressing pieces share deterministic ARPG/Walk collision so visible art and movement agree
- central shrine/reward/boss interaction spaces stay approachable rather than being blocked by decoration collision
- all dressing remains deterministic from dungeon seed/room id and does not require authored external assets


## v1.85.2 — Dungeon V3 gameplay cleanup

- removes the persistent ground ring around the ARPG player that appeared as bright broken streaks while moving across the brick floor
- moves the melee attack FX off the ground into a short raised forward slash so attacks no longer flash/light the floor
- ignores legacy hidden `__crypt-collision-*` helper props from pre-V3 saves, removing invisible blockers around rooms
- visible/user-authored props remain collision-authoritative; V3 structural movement continues to use the visible walkable dungeon surface


## v1.85.1 — Dungeon Forge V3 visual QA pass

- fixes the huge orange radial/pizza artifacts in the editor by replacing trigger wireframe cylinders with clean radius outlines
- hides trigger/checkpoint authoring markers from ARPG gameplay
- brightens the V3 staggered masonry baseline so rooms and curved corridors remain readable between torch pools
- makes top-down perimeter masonry thicker, taller and easier to read against the void
- expands torch dressing to four visible wall fixtures per room while keeping real point-light count bounded
- widens and strengthens warm torch pools without changing the user's brightness control


## v1.85.0 — Dungeon Forge V3 structural remake

- replaces the crypt's stacked room-box/corridor renderer with one shared walkable-surface system inspired by the architecture used in Evergrow's dungeon tooling
- floor rendering, perimeter detection and movement now consume the same room/corridor geometry instead of overlapping independent boxes
- curved passages connect real room-wall openings and eliminate the old rectangular black bars at room/corridor overlaps
- top-down and ARPG use a low masonry perimeter silhouette; Walk reuses the same floor geometry with full-height masonry
- staggered brick floors and perimeter brick courses are instanced for substantially lower rebuild cost
- generated combat rooms can use rectangular, cross and octagonal silhouettes; boss arenas default to octagonal
- the minimap now follows the same curved passages and semantic room silhouettes
- V3 corridor geometry is cached per dungeon state so moving/resizing a room no longer recomputes corridor curves for every surface sample
- the legacy crypt wall/cap/cutaway stack is bypassed in Editor, ARPG and Walk, removing the source of the giant slab/black-strip artifacts


## v1.84.0 — Recipe-driven Equipment Lab

- pivots Equipment Lab from polishing one manually authored Ranger prototype to a reusable procedural equipment grammar
- one generator now drives Ranger, Traveler and Acolyte Chest styles
- style recipes describe silhouette, body profile, front/back panel rules, straps, belts, trims, accents and material roles
- variation seeds deterministically change recipe cuts/proportions instead of selecting separately modeled armor
- Body Fit Engine still samples the real Skillbound mannequin and transfers official skin weights automatically
- output metadata identifies `blender-equipment-grammar-v1`, recipe id and variation
- Equipment Lab UI shows the recipe-driven pipeline directly
- processor health exposes the Equipment Grammar capability
- Blender QA successfully generated all 3 styles × all 4 variations


## v1.83.4 — Ranger body-envelope fit

- replaces the rectangular analytic Ranger torso with an envelope sampled from the real Skillbound mannequin
- keeps waist/chest/back curvature while smoothing away scan-like anatomical detail
- raises the chest hem above the butt/hip break
- narrows shoulder/armhole contours
- stabilizes curved leather overlay topology and face normals
- tapers front/back leather panels instead of using rectangular slabs
- refines Ranger belt, strap and trim proportions
- preserves automatic nearest-body weight transfer and official armature binding


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

The immediate priority is **Equipment Lab as a general one-click asset generator**, not hand-authoring individual armor pieces.

1. Improve the shared Chest grammar itself: garment silhouettes, neckline/armhole families, panel grammar, seams/trims, straps/belts/hardware, controlled asymmetry and detail density.
2. Keep Ranger / Traveler / Acolyte as **recipes**, not separately modeled assets.
3. Make variations meaningfully different while preserving deterministic output and body fit.
4. Expand the same generator architecture to head, legs, boots, gloves, waist and back/cape.
5. Add a native Weapon Forge grammar for reusable blade/guard/grip/pommel, staff and bow construction.
6. Add stronger automatic validation for clipping, disconnected pieces, malformed faces, excessive floating clearance and bad weights.
7. Keep the production workflow:

```text
body + slot + style + variation
           ↓
    Generate Equipment
           ↓
    automatic Blender build
           ↓
    automatic fit + skin
           ↓
    Forge preview / Library
```

8. SPAR3D/reference-image reconstruction remains experimental and should not become the required path for wearable equipment.

The preferred future remains:

```text
ChatGPT / user design intent
        ↓
structured Forge recipe
        ↓
native Forge generator
        ↓
automatic validation
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
