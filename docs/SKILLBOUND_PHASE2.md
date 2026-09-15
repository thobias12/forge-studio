# Skillbound Phase 2 — First ARPG Vertical Slice

Phase 2 proves the Forge project-data -> Forge Runtime gameplay loop before the project expands into more biomes, towns, dungeons, enemies, or items.

## Runtime loop

World Forge still generates the deterministic region. `Play From Here` now runs that exact generated region through `ForgePlayRuntime` and loads gameplay definitions from the Skillbound Forge project.

Implemented loop:

1. Camera-relative WASD movement.
2. World collision against Forge runtime dressing obstacles and region bounds.
3. Mouse-facing character controller.
4. LMB `Iron Cleave` basic attack.
5. Q `Ember Burst` active skill.
6. Space dodge with cooldown and brief attack avoidance.
7. `Road Wretch` enemy type with aggro, chase, melee attack, health, and death.
8. Data-driven loot table.
9. Walk-over loot pickup.
10. Runtime inventory and weapon equip.
11. Equipped weapon damage contributes to abilities.
12. Runtime HUD for health, skill cooldowns, dodge cooldown, encounter state, inventory, and save state.
13. Persistent local runtime save keyed by project + region + world seed + generation version.
14. Defeated enemies, outstanding loot, inventory, equipped weapon, player health, and player position survive reloads.

## Controls

- WASD — camera-relative movement
- Mouse — aim/facing
- LMB — Iron Cleave
- Q — Ember Burst
- Space — dodge
- Mouse wheel — camera zoom
- Walk over loot — pick up
- Inventory item — click to equip

## Skillbound project data

The values used by the runtime live under `public/projects/skillbound/` rather than being authored directly in the renderer:

- `players/skillbound-player.player.json`
- `abilities/iron-cleave.ability.json`
- `abilities/ember-burst.ability.json`
- `enemies/road-wretch.enemy.json`
- `items/rusted-sword.item.json`
- `loot/road-wretch.loot.json`

`project.forge.json` references those files, and `forgeProject.ts` loads them into the active Forge workspace.

This is the contract we want future Forge editors to write. Enemy Forge, Ability Forge, Item Forge, and Loot Forge can later edit the same definitions without changing the runtime implementation.

## Save model

Runtime saves do not store regenerated map geometry. The save key includes:

- project id
- region id
- world seed
- generation version

The save stores only mutable gameplay state: player position/health, inventory/equipment, defeated stable enemy ids, and outstanding loot drops. This keeps procedural geography deterministic while preserving player interactions.

## Deliberate Phase 2 limits

The models, animation, VFX, audio, enemy navigation, item visuals, and combat presentation are still development placeholders. There is one enemy archetype, two abilities, and one weapon because the goal is to prove architecture and the complete loop first.

The next phase should improve feel and authoring rather than add dozens of content entries: connect Character Forge/Animation/VFX assets, create data editors for gameplay definitions, improve enemy navigation and hit feedback, and then expand the vertical slice into a dungeon/town transition.
