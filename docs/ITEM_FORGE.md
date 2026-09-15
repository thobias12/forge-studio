# Item Forge — unified item presentation

Forge v1.18 introduces Item Forge for Skillbound. The core rule is **one authoritative item definition with one master visual**, rather than separate inventory, dropped and equipped item assets.

## Default pipeline

1. Create or select an item in Item Forge.
2. Bind one GLB from the Shared Asset Library as the master visual.
3. Item Forge derives three presentations from it:
   - Inventory: live preview plus an auto-rendered transparent 256×256 PNG icon.
   - World drop: the same model with drop rotation, scale and ground offset.
   - Equipped: the same model attached to a named character socket with local transform controls.
4. Save to the Skillbound working workspace.
5. When a source folder is connected, **Write Source** persists the item JSON and updated manifest to `public/projects/skillbound/`.

## Optional overrides

World-drop and equipped presentations can opt out of the master model and bind a separate Library GLB. This is intended for exceptional cases such as a lightweight loot mesh or a special worn variant. The item remains one gameplay definition.

## Compatibility

`modelAssetId` remains on `ForgeItemDefinition` as the Phase 2.1 compatibility binding. Item Forge writes the selected master model there as well as to `visual.masterAssetId`, so the existing runtime continues to show the authored weapon while the richer presentation schema is adopted.

## Validation

Project dependency validation tracks the master model, optional drop/equipped overrides and generated inventory icon. A referenced asset that no longer exists in the Shared Library becomes a missing dependency; an unassigned optional presentation remains a warning and uses the runtime fallback.
