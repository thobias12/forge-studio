# Skillbound Phase 3.1 — Seamless Hollow Vault traversal

Phase 3.1 replaces the temporary Map Studio preview bridge with an actual Skillbound dungeon runtime.

## Runtime contract

- Drowned March remains the authoritative overworld save keyed by project, region, seed and generation version.
- Approaching the generated Hollow Vault landmark exposes an `E` interaction; there is no always-available enter button.
- Entering saves the overworld synchronously and carries health, inventory and equipped weapon into the dungeon session.
- Hollow Vault consumes the same Skillbound player stats, abilities, Character Forge binding, Animation binding, VFX bindings and Item Forge equipped/drop presentation.
- The dungeon camera uses the same Skillbound ARPG camera contract as the overworld: FOV 48, elevated 0.58/0.74/0.58 offset, wheel zoom 23–43 and camera-relative WASD.
- Foreground dungeon architecture fades when it blocks the player.
- The completion portal remains sealed until the encounter referenced by `requiresEncounterId` is cleared.
- Pressing `E` at an active completion portal merges dungeon health/inventory/equipment back into the exact overworld save and remounts Drowned March at the previously saved position.

## Hollow Vault gameplay

The runtime reads the authored Map Studio package for rooms, corridors, markers, encounter triggers, gates, boss reward and completion portal. Combat uses the normal Skillbound LMB basic ability, Q active ability and Space dodge rather than Map Studio's preview-only fixed attack values.

This phase intentionally keeps dungeon encounter progress session-local. Campaign player state and overworld persistence are authoritative; durable dungeon-instance persistence can be added when dungeon reset/respawn policy is designed.
