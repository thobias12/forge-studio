# Skillbound equipment generation v1

This replaces the old exported-model-first generator with original, deterministic 3D construction. Existing character foundations are retained. Existing equipment definitions receive new procedural presentations once when a workspace without `itemSystemVersion: 1` loads; IDs, authored stats and loot-table entries remain intact. Saving the workspace persists that migration. Old library files are not deleted.

## Authoring

Open **Item Forge → Procedural Generator**. Choose an item family, seed, rarity, level, palette and armor construction. Switch between item, ground-drop and equipped previews, and between **Skillbound Male Base v1** and **Skillbound Female Base v1**. Both official bases must be imported in Character Creator for the corresponding fitting/export views. Missing foundations produce an actionable message instead of substituting a new body.

**Save item** adds or updates the item definition in the current project. Add that definition to a Gameplay Forge loot table to roll its family. Restart an active play session after editing content. GLB export produces a static handheld model or body-fitted armor with its skeleton; it excludes character-body meshes. PNG and recipe JSON exports are also available.

The catalogue contains 23 families: sword, dagger, axe, mace, staff, spear, bow, shield, grimoire, orb, helmet, chest, gloves, legs, boots, cloak, waist, amulet, ring, charm, pickaxe, hatchet and sickle. The last three are original Skillbound equipment additions, not a claim that Evergrow has a harvesting system.

## One item, three presentations

- `procedural` stores the versioned seed, family, material palette, construction, proportions, variant, trim and wear. No global random source controls a saved item's appearance.
- Inventory thumbnails render the generated 3D model. Requests are serialized and cached to avoid a separate simultaneous WebGL context for every inventory cell.
- Ground drops build that same recipe, apply the drop transform and sit on the local ground surface. Colored markers are only loading/error fallbacks.
- Equipped weapons attach at hand sockets. Armor is rebuilt against the actual character's skinned body, retaining its proportions and bone indices/weights. Male and female versions share the design recipe, not a stretched universal mesh.
- Runtime rolls have independent IDs, levels and effective damage/defense affixes. Saves and dungeon transfers retain the complete rolled definitions. Reloading does not reroll equipment.

Armor shells preserve source UVs and skin weights, add clearance and thickness, and close the selected surface boundaries. Chest owns shoulder reinforcement. Waist owns belt accessories. The cape is separate and has no hood. Optional chest-secondary-motion weights are retained wherever present on the body. Cape vertices currently follow the chest; cloth physics/secondary chains are not simulated here.

## Research and deliberate differences

The architectural reference is Evergrow's [item generator](https://github.com/Dimillian/Evergrow/blob/main/game/src/items.ts), [shared item art](https://github.com/Dimillian/Evergrow/blob/main/game/src/item-art.ts), [materials](https://github.com/Dimillian/Evergrow/blob/main/game/src/item-materials.ts), and [roll definitions](https://github.com/Dimillian/Evergrow/blob/main/game/src/item-roll-content.ts). Evergrow saves item identity/recipe/appearance, derives inventory and drop art from that appearance, and maps equipped items into its character artwork. Skillbound follows that separation using generated 3D geometry and an existing humanoid rig. No Evergrow assets or implementation code are included.

This is an equipment-generation foundation, not complete Evergrow gameplay parity. Six rarity labels are supported, but `unique` currently denotes a rarity/stat budget, not an authored item-specific skill. Only damage and defense affixes are generated because those stats are consumed by Skillbound combat. Evergrow's full affix catalogue, unique powers, crafting/improvement economy and inventory-tool behavior have not been ported. Pickaxe/hatchet/sickle models do not add resource-harvesting gameplay.

## Validation status

TypeScript compilation was checked. Gameplay, animation deformation, rendering quality and performance were not tested in this change, following the request to avoid test runs. These procedural armor shells are a starting construction method, not artist-approved production outfits; fitting tolerances and material boundaries should be reviewed on both existing bodies in movement before treating the generated assets as final.
