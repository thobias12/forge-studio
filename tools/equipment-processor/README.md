# Forge Equipment Processor

The local companion powers **Forge → Equipment Lab**.

It listens only on `http://127.0.0.1:47831` and gives the GitHub Pages build controlled access to Blender and optional local AI on the user's PC.

## Start

From the Forge repository:

```bash
npm run equipment:processor
```

Keep the terminal open while using Equipment Lab.

## v1.81.0 default: body-aware procedural equipment

The primary Equipment Lab armor workflow no longer depends on image-to-3D.

```text
Skillbound mannequin
    ↓
slot + style + variation
    ↓
Blender body-aware generator
    ↓
skinned layered garment
    ↓
GLB
    ↓
Forge preview / Asset Library
```

The first production template is **Chest**.

The processor launches:

`tools/equipment-processor/procedural_equipment.py`

The generator imports the exact Skillbound mannequin uploaded by Forge, identifies the primary body and armature, then builds the garment directly from copies of the real skinned body surface.

Current chest construction:

1. measure the real mannequin axes / torso bounds;
2. cut a fitted torso shell with shaped neckline and arm openings;
3. push the shell outward for safe body clearance;
4. add physical garment thickness;
5. build a second leather-vest surface;
6. add fitted belt, hem trim and neckline trim;
7. optionally add a front tabard;
8. retain the body's real vertex groups;
9. bind every layer to the official Skillbound armature;
10. export one GLB.

Current style presets:

- Ranger
- Traveler
- Acolyte

Variations are deterministic and intentionally small so the fit contract stays stable.

The generated GLB includes body-mask metadata for the Chest workflow.

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
