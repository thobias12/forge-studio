# Skillbound Phase 2.3 — authored presentation runtime

Forge v1.22 closes the remaining compatibility gap between the Skillbound vertical slice and the Forge authoring tools introduced through the v1.20–v1.21 Item Forge work.

## Item Forge is now authoritative at runtime

The Skillbound runtime no longer treats `modelAssetId` as the complete item presentation contract. It resolves the richer Item Forge visual definition through `itemVisual()` / `resolveItemModelAssetId()`:

- World drops load the configured drop model, rotation, scale, position and ground offset, including values produced by the v1.21 auto-fit workflow.
- Equipped items load the configured equipped model and local transform.
- Equipped weapons look for the selected named character socket (`RightHand`, `LeftHand`, `Back`, `HipLeft`, `HipRight`) on the bound Character Forge rig, with a safe fallback anchor when no matching bone exists.
- Item Forge generated inventory icon assets are resolved from the Shared Library and rendered in the runtime inventory.
- Missing Library assets retain the existing colored placeholder so content remains playable while art is unfinished.

The runtime save format is unchanged. Existing saves still persist item IDs and equipment state; presentation continues to come from current authored project data.

## Character and animation presentation

Character Forge / Animation Studio bindings remain optional but now carry more of the visible gameplay loop:

- Player and enemy idle / move / attack / hit animation cues continue to resolve from authored animation sets.
- `dodge`, `roll`, `evade` and `dash` clips can now drive the player dodge.
- Enemy death animation is allowed to play before the corpse visual is cleaned up instead of removing the character immediately.
- Ability-specific `animationAssetId` GLBs are loaded into the player animation mixer. Forge selects a matching clip by ability ID/name first, then falls back to attack/cast-style clips and finally the first clip.

## VFX

Existing VFX Studio bindings remain the authoritative optional presentation layer for:

- ability effects,
- enemy attack effects,
- enemy hit effects,
- enemy death effects.

Built-in pulses remain safe fallbacks when an authored VFX package is missing.

## Runtime feedback

The play HUD now includes:

- a focused enemy health bar when an enemy is attacked or begins an attack,
- Item Forge generated inventory icons,
- rarity-aware inventory frames,
- the existing UI Forge theme tokens for panels, borders, typography, density and accent treatment.

## Phase 2.3 validation loop

1. Create/bind a player and enemy through Character Forge / Gameplay Forge.
2. Bind animation sets and optional ability-specific animation assets.
3. Bind VFX packages for attacks/hits/death.
4. Create/import a weapon master model in Item Forge and use auto-fit or manual tuning for drop/equipped transforms.
5. Generate its inventory icon.
6. World Forge → Play From Here.
7. Verify the authored character, animation and VFX presentation.
8. Kill the enemy and verify the authored drop model.
9. Pick it up and verify the generated inventory icon.
10. Equip it and verify the configured character socket + transform.
11. Save/reload and verify the same item IDs/equipment state resolve against the current authored presentation.

Once this loop is proven, the next content milestone is Phase 3: procedural-region → authored dungeon transition → persistent return to the same overworld.
