# Item Forge — unified item presentation

Item Forge uses **one authoritative item definition with one master visual**, rather than separate inventory, dropped and equipped item assets.

## Forge v1.20 master-model workflow

A finished GLB is no longer required before creating an item. Item Forge owns the whole first-mile workflow:

1. Create or select an item.
2. Create its master model in one of four ways:
   - **Create starter model** generates an immediate low-poly GLB so the item is usable while art is unfinished.
   - **Build in Model Creator** opens Forge Model Creator in an item handoff session; saving returns to Item Forge and assigns the result automatically.
   - **Import GLB** or drag/drop a `.glb` directly into Item Forge.
   - Choose an existing GLB from the Shared Asset Library.
3. The master is stored under a stable per-item Library ID (`skillbound:item-master:<item-id>` when created or imported through Item Forge).
4. Item Forge derives three presentations from that one model:
   - Inventory: live preview plus an auto-rendered transparent 256×256 PNG icon.
   - World drop: the same model with drop rotation, scale and ground offset.
   - Equipped: the same model attached to a named character socket with local transform controls.
5. Save to the Skillbound working workspace.
6. When a source folder is connected, **Write Source** persists the item JSON and updated manifest to `public/projects/skillbound/`.

New weapon items currently receive a starter sword model automatically. Existing items such as Rusted Sword can create one from the Master 3D Model workbench with one click.

## Optional overrides

World-drop and equipped presentations can opt out of the master model and bind a separate Library GLB. This is intended for exceptional cases such as a lightweight loot mesh or a special worn variant. The item remains one gameplay definition.

## Compatibility

`modelAssetId` remains on `ForgeItemDefinition` as the current runtime compatibility binding. Item Forge mirrors the master model into both `modelAssetId` and `visual.masterAssetId`, so existing Skillbound runtime code keeps working while the richer presentation schema is adopted.

## Persistence note

The item definition is project source. Shared Library GLB bytes are still workstation/browser Library assets unless they are explicitly exported or sent into a connected project asset folder. Dependency validation will report a referenced Library asset as missing on a workstation that does not contain it.

## Validation

Project dependency validation tracks the master model, optional drop/equipped overrides and generated inventory icon. A referenced asset that no longer exists in the Shared Library becomes a missing dependency; an unassigned optional presentation remains a warning and uses the runtime fallback.
