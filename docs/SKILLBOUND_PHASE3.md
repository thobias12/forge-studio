# Skillbound Phase 3 — overworld to authored dungeon bridge

Forge v1.23 makes Map Studio dungeon packages first-class Skillbound project content and proves the first campaign transition.

## First route

`Drowned March -> Hollow Vault -> Drowned March`

- Drowned March now has an explicit `linkedDungeonId`.
- Guided generation creates a deterministic reachable landmark for the linked dungeon.
- Hollow Vault is stored under `public/projects/skillbound/dungeons/` and is referenced by the project manifest and Act I graph.
- Entering the dungeon disposes the overworld runtime, which performs its normal save.
- Returning remounts the exact same region seed + generation version, so the overworld runtime reloads position, health, defeated enemies, outstanding loot, inventory and equipment.

## Project persistence

`ForgeProjectWorkspace` now owns authored dungeons. Connected project-folder load/write includes dungeon JSON alongside worlds, regions, gameplay and UI source.

The workspace schema moved to v3. Existing v2/v1 browser workspaces migrate forward; authored world/region tuning is retained while the new project-level dungeon link is merged into older cached region definitions.

## Map Studio runtime reuse

Hollow Vault uses the existing `forge-dungeon-package` / `DungeonWithProps` contract and the existing ARPG Map Studio runtime. Phase 3 does not introduce a second dungeon geometry or encounter format.

The first bridge intentionally keeps the Map Studio combat playtest inside the dungeon. The next Phase 3 pass should unify the dungeon player/combat/inventory runtime with the overworld ForgePlayRuntime and make the authored completion portal perform the return transition directly.
