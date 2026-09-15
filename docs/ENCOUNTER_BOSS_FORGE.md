# Encounter Forge + Boss Forge

Forge now separates dungeon geometry from reusable combat authoring.

## Ownership

- **Map Studio** owns rooms, corridors, encounter trigger markers, spawn markers, encounter gates, reward markers and completion portals.
- **Encounter Forge** owns reusable enemy-pack composition: enemy definition, count, elite chance, difficulty, optional intro text and optional reward loot table.
- **Boss Forge** owns reusable boss presentation/gameplay values: base enemy, health/damage/movement/cooldown multipliers, character scale, rewards and health-driven phases.
- **Skillbound project data** binds Map Studio encounters to reusable Forge profiles through `encounterProfileId` and `bossProfileId`.

## Runtime

The Skillbound dungeon runtime resolves authored profile IDs before it spawns an encounter. Existing inline Map Studio values remain valid fallbacks, so old dungeon packages continue to run.

Boss phases are evaluated from current health percentage. A phase can:

- change damage, movement, attack cooldown and telegraph wind-up;
- show an authored message;
- trigger a VFX Studio asset or the built-in phase pulse;
- summon authored enemy definitions into the same encounter;
- keep the encounter locked until the boss and its remaining summoned adds are defeated.

Boss Forge reward settings feed the existing guaranteed boss-drop runtime. `guaranteedItemId` takes priority over the dungeon reward marker item, followed by the configured reward loot table and normal enemy loot fallback.

## Project source

`project.forge.json` can now list:

- `encounters/*.encounter.json`
- `bosses/*.boss.json`

The connected project-folder workflow reads and writes both types, and Project Validation checks the references from dungeons → profiles → enemies / loot / items / VFX.

The browser workspace schema is v4. Migration preserves existing World Forge and dungeon edits while filling missing Encounter Forge / Boss Forge bindings from the bundled project by stable dungeon encounter ID.

## Hollow Vault

Hollow Vault is the first consumer:

- Drowned Crossroads → `hollow-vault-ambush`
- Ossuary Hall → `ossuary-guard`
- Vault Warden → `vault-warden`

The Vault Warden currently has three reusable Boss Forge phases at 100%, 65% and 30% health. Later dungeons can reuse the same Forge systems without adding dungeon-specific runtime code.
