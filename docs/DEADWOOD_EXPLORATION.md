# Deadwood exploration pass

World Forge → Layout → Exploration enables the `journey-v1` generation profile. Fresh Deadwood projects use it; existing saved project definitions without that field retain Classic routes. Switching profiles produces a distinct generated seed and runtime save key. Existing character progress is not deleted. Returning to Classic restores the original geography for the same settings and layer seeds.

Exploration keeps bounded, connected campaign regions. Three seeded broad route shapes and eight orientations replace the fixed east-west presentation. Clearing sizes alternate between open spaces and tighter passages. A named Fallen Sanctuary uses the existing ruins prefab and two warm lanterns; this is not a new bespoke chapel asset.

The Loops slider requests zero to two reconnecting trails. Candidates must clear landmarks, other routes, region edges and the full river corridor. Both segments are accepted together after river/main-road stabilization and before terrain/dressing generation. Unsuitable candidates are skipped rather than forced across water. The slider controls the requested maximum, not a guarantee for every seed. Classic retains its prior behavior.

Woodland dressing has stronger seeded grove/glade contrast while retaining the existing population budget. Low terrain-following mist patches are limited to twelve sheltered micro-biome sites outside clearing centers. The shared ambient module serves editor and gameplay; weather and night affect mist strength. The editor alone caps fog optical depth relative to camera distance, leaving gameplay fog unchanged.

## Verification

`npm run qa:world` checks eight seeds for deterministic output, baseline Classic hashes, separate save namespaces, finite terrain, valid navigation, complete loop pairs and the loops-off control. It also checks twelve small/large, dry/wet combinations. Golden hashes were captured from commit `3bfbabbff5e59780953d520b0cdb6bfe067ab72a`; they do not require Git history at test time.

`npm run build` checks TypeScript and creates the production bundle. Browser review covered seeds 8472152 and 7319, the map overview, and entering gameplay with a local test hero. No browser console errors were observed. Full combat playthroughs and device performance benchmarking remain outside this pass. The build retains the existing large-bundle warning.

No infinite streaming system, campaign replacement or remote deployment is included. Map topology can still vary in quality beyond the tested seeds; the existing runtime/nav constraints remain authoritative. Larger authored POI kits, soundscapes and more elaborate layout families can build on this profile.
