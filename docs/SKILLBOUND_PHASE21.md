# Skillbound Phase 2.1 — authoring and combat feel

Forge v1.16.0 keeps Skillbound inside the Forge project/runtime boundary and completes the first usable content-authoring loop around the Phase 2 combat slice.

## Gameplay Forge

`Gameplay Forge` edits the active Skillbound working project directly. It exposes player movement/survivability, enemy stats and attack wind-up, abilities, items and loot tables. Edits are live-saved to the same browser workspace that World Forge Play Mode loads.

The editor can bind Shared Asset Library IDs to runtime definitions:

- Player/enemy `characterAssetId` → a Character Forge package.
- Player/enemy `animationAssetId` → an animated GLB from the Animation Studio / Library.
- Ability and enemy attack/hit/death VFX IDs → Forge VFX packages.
- Item `modelAssetId` → a GLB prop in the Library.

All bindings are optional. Missing assets retain the primitive runtime fallback, so content logic remains testable before final art exists.

Animation Studio now has **Save to Library** in addition to GLB download. Gameplay Forge also supports direct animation-GLB import for a fast authoring loop.

## Runtime combat improvements

The Skillbound runtime now includes reusable engine systems instead of Road Wretch-specific hacks:

- `ForgeNavigationGrid`: obstacle-aware A* navigation with line-of-sight path smoothing and diagonal corner protection.
- Enemy separation and periodic repathing so groups do not pile into the same obstacle.
- Readable attack wind-up with a red telegraph ring; damage resolves after the wind-up, allowing a real dodge response window.
- Knockback, hit-stop, camera impact, damage numbers and fallback impact pulses.
- Shared Character/Animation binding with animation cue matching (`idle`, `move`, `attack`, `hit`, `death`).
- Shared VFX package playback for combat bursts, with the built-in pulse kept as a safe fallback.
- Optional equipped item model binding.

## Persistence boundary

Runtime save data is unchanged: seed/generation identity, position, health, defeated enemy IDs, loot, inventory and equipment are stored separately from authored project content.

Gameplay Forge working edits are stored in the browser workspace (`forge-project:skillbound:v2`). Phase 1 world edits are migrated from the older workspace key where possible. Source-controlled JSON under `public/projects/skillbound/` remains the bundled project baseline; direct connected-folder/source-file editing is still a later project-persistence step and is not claimed as complete here.

## Development loop

1. Create or edit a character in Character Forge and save it to the Shared Library.
2. Edit its clips in Animation Studio and save the animation GLB to the Shared Library.
3. Create combat effects in VFX Studio and save them to the Shared Library.
4. Open Gameplay Forge and bind those assets to the player, enemy or ability definition.
5. Tune combat values; changes live-save to the working Skillbound project.
6. Open World Forge → Play From Here and test the exact working project data.
