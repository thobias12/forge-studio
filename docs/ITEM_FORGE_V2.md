# Item Forge v2 — taxonomy and armor authoring

Forge v1.24 adds an explicit item taxonomy so Item Forge no longer has to infer every presentation only from a model name or proportions.

## Item taxonomy

Item definitions can now carry authoring metadata for:

- item type: weapon, armor, offhand, consumable, material, quest or misc,
- subtype: sword, dagger, axe, mace, staff, spear, bow, helmet, chest, gloves, legs, boots, shield, focus and non-equipment variants,
- equip slot: MainHand, OffHand, Head, Chest, Hands, Legs, Feet or None,
- armor fit mode: rigid or skinned,
- armor body-mask regions,
- optional defense bonus authoring data.

Older items remain compatible. If the new fields are absent, Item Forge infers a sensible classification from the existing item data and name.

## One master model still drives everything

The v1.20–v1.23 one-item/one-master-model design remains intact. The explicit classification now controls:

1. which starter GLB Forge generates,
2. how Auto Setup fits the inventory presentation,
3. how the item is laid out as a world drop,
4. where the equipped preview is framed and fitted.

## Armor pipeline

Armor supports five Skillbound categories:

- helmet / hood,
- chest,
- gloves,
- legs,
- boots.

Each category has a generated low-poly starter model and a mannequin fitting target. Armor authoring also stores the intended ForgeHumanoidV1 fit mode and body-mask regions while continuing to reuse the same master model for inventory and world-drop presentation.

The equipped Item Forge preview is slot-aware: helmets focus the head, chest armor focuses the torso, gloves focus both hands, leg armor focuses the lower body and boots focus the feet. Auto Setup scales and centers the master model against that target, after which the normal transform controls remain available for fine tuning.

## Compatibility

Forge Runtime Phase 2.3 item presentation remains unchanged for the existing weapon loop. v1.24 intentionally concentrates on the editor/authoring contract so it can be developed alongside Skillbound Phase 3 without rewriting the current dungeon/world runtime work.
