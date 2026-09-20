# Forge Equipment Processor

The local companion powers **Forge → Equipment Lab**.

It listens only on `http://127.0.0.1:47831` and gives the GitHub Pages build controlled access to Blender and optional local AI on the user's PC.

## Start

From the Forge repository:

```bash
npm run equipment:processor
```

Keep the terminal open while using Equipment Lab.

## v1.84.0 default: recipe-driven equipment grammar

The production Equipment Lab workflow is now a reusable generator rather than a hand-authored Ranger mesh.

```text
Skillbound mannequin
    ↓
body envelope + rig landmarks
    ↓
style recipe + variation seed
    ↓
garment shell
    ↓
panels / straps / belt / trims / accents
    ↓
automatic Skillbound skin weights
    ↓
GLB
    ↓
Forge preview / Asset Library
```

The first production slot is **Chest**, but the architecture is intentionally split into reusable stages so the same recipe system can later drive head, legs, boots, gloves, waist, back and weapon slots.

`tools/equipment-processor/procedural_equipment.py` now separates:

1. **Body Fit Engine** — derives orientation, torso mask, body envelope and rig landmarks from the real Skillbound mannequin.
2. **Recipe Grammar** — describes silhouette, neckline, armholes, material layers, panel profiles, straps, belt, trim and accent rules.
3. **Variation Resolver** — deterministically modifies recipe values from the selected seed instead of loading a separately modeled asset.
4. **Geometry Builder** — interprets the recipe against the sampled body envelope.
5. **Skinning / Export** — transfers nearby Skillbound weights, binds generated layers to the official armature and exports GLB.

Current Chest recipes:

- **Ranger** — fitted field vest, layered leather panels, diagonal utility strap and narrow belt.
- **Traveler** — layered travel jerkin, lighter leather coverage and broad utility belt.
- **Acolyte** — high-neck battle tunic, symmetric framing and central accent panel.

All four Equipment Lab variations are generated from the same recipe using deterministic seed changes. They are not separately hand-modeled meshes.


## Why this is now the default

The earlier TripoSR and SPAR3D experiments proved the local pipeline could generate, process and preview 3D, but generic single-image reconstruction is not reliable enough for wearable armor. The generator can interpret a chest reference as a solid torso-shaped sculpture, and Blender cannot recover garment openings/topology that were never generated.

Body-aware construction removes that ambiguity: armor starts on the actual character instead of being fitted after the fact.

## Existing imported-GLB processing

Manual GLB processing remains available.

That path still uses `processor.py` to:

1. normalize imported equipment;
2. solve Chest orientation / proportions against the mannequin;
3. apply a polygon budget;
4. detect contact regions;
5. shrink-fit body-facing vertices;
6. transfer Skillbound weights;
7. export a processed GLB.

## Experimental SPAR3D

SPAR3D remains available as an optional image-to-3D experiment for asset categories where generic object reconstruction may work better than clothing, especially weapons / props.

Forge's SPAR3D compatibility layer includes:

- managed Python 3.11;
- separate CLIP / AlphaCLIP setup;
- geometry-only Windows mode;
- headless rembg-backed background removal;
- Hugging Face gated model access;
- resilient localhost job polling.

It is not required for the body-aware procedural Chest generator.

## Legacy TripoSR

TripoSR remains as a legacy fallback only.

The procedural equipment workflow requires only the normal Equipment Processor + Blender connection.

## v1.81.1 Skillbound axis / torso fix

The first live procedural Chest attempt exposed a bad assumption in the Blender generator: it inferred the vertical axis from whichever overall mannequin dimension was largest. On a T-pose character the arm span can exceed body height, causing X to be mistaken for vertical and every torso cut to miss the garment region.

The generator now uses the official SkillboundHumanoidV1 convention directly: X = left/right, Y = up, +Z = forward. It uses pelvis/spine and upper-arm/clavicle bones for torso/shoulder measurements, excludes most arm vertices from torso width/depth sampling, cleans up rejected layer copies without forcing Blender mesh user counts, and prints `FORGE_FRAME` / `FORGE_LAYER` diagnostics to the processor console.

## v1.81.2 imported skeleton frame

The v1.81.1 live log showed that Blender had already converted the glTF coordinate system: the hard-coded Y span was only ~0.43 while the Z span was ~1.62. The procedural generator now derives the imported frame from the rig itself. Pelvis→head selects the vertical axis and direction, shoulder-to-shoulder selects width, and the remaining axis becomes depth. All garment vertical normalization uses the detected signed axis, so the generator no longer depends on the source glTF authoring axes after Blender import.

## v1.81.3 source-index garment cuts

Procedural layer predicates are now evaluated against the untouched Skillbound source body. Forge records the matching vertex indices, duplicates the body mesh, and deletes every copied vertex whose source index was not selected. This avoids any dependence on the duplicate's parenting or evaluated world transform before cutting. Rebinding to the armature preserves the existing world matrix explicitly. The processor console now prints `FORGE_SOURCE_CUT <layer> matched=N/TOTAL` before each layer is created.

## v1.81.4 deterministic BMesh cuts

Live diagnostics proved the garment predicates were correct (for example 2715 source vertices matched the base chest) while the copied layer still ended with zero vertices. The remaining fault was Blender Edit Mode selection state on duplicated glTF meshes.

Forge now cuts procedural layers with `bmesh` directly: load the copied mesh datablock, delete every BMesh vertex whose original index is not in the source-body keep set, write the BMesh back, and update the mesh. No Edit Mode or selection flags are involved. `FORGE_LAYER` diagnostics now include both vertex and polygon counts.

## v1.81.5 torso-weight mask and landmark neckline

The first successful procedural Ranger chest revealed that pure geometric height/width cuts could still select unrelated arm, hand and pelvis vertices. Forge now builds a torso mask from the source body's skin weights. Vertices driven by spine/pelvis/chest/breast/clavicle groups are allowed; vertices dominated by arm/hand/leg/head groups are rejected. A strict central spatial fallback is used only if an unexpected rig naming scheme leaves too few weighted torso vertices.

The torso width/depth frame is then recalculated from the masked vertices. Chest top/hem contours are anchored to the imported pelvis/chest/neck/shoulder landmarks rather than fixed whole-body fractions. This produces a higher neckline, narrower armholes and prevents chest accessories from appearing on forearms, hands or thighs.
