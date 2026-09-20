# Forest presentation

## Atmosphere pass

Live trees now use four crown profiles: slender fir, spreading oak, upright leafy tree,
and asymmetric windswept pine. The existing generated variant selects the same profile in both renderers.
Dead trees now use four complete bent-trunk meshes with attached tapered limbs, broken tops,
and brown/charcoal vertex-colored bark. This replaces the separate pale cylinder sections.
Editor dead trees use four instanced buckets; gameplay shares the same geometry factories.
Tree placement and collision centers are unchanged; dead-tree camera fade radius covers the wider limbs.

The latest revision replaces rounded foliage blobs with closed, folded leaf geometry (80 leaves per crown),
adds flared trunks with six tapered boughs, and shades canopy leaves with vertex colors.
Roads use layered noise for compacted wear, grit and irregular mossy margins rather than repeating sine bands.
Water UVs now track cumulative stream distance, so moving ripples follow the river rather than a fixed world diagonal.
Deep center/shallow bank colors and restrained normal variation provide depth cues without changing river geometry.
Close-up tree/road/water inspection and gameplay were checked in addition to the geometry tests.
The per-prop geometry check now allows 3,200 vertices to cover folded leaves (2,880 vertices per crown).

Live crowns now use separated, rounded foliage clusters instead of solid cone tiers.
Dead branches include tapered forks and twigs. Existing tree anchors and navigation obstacles stay fixed.
Shared road materials feather UV edges with world-space grain; runtime ribbons now carry the same UVs as the editor.
The shared opaque water material adds moving highlights and bank foam using the existing environment clock;
river geometry, crossing clearance and hydrology are unchanged.
Forest Classic layouts receive sheltered mist too. Teal fireflies and warm lanterns have depth-tested soft glows,
and up to three additional trail lanterns use existing terrain/river/POI exclusions. These lanterns have no shadow maps.
Normal/Deadwood fog and fill colors use cooler tones while daylight remains readable.

Validated editor Classic and Exploration views and gameplay on seed 8472152. Browser console had no shader errors.
This remains a stylized 3D interpretation, not a reproduction of the reference's pixel artwork.

Original procedural geometry shared by World Forge and gameplay lives in `forestGeometry.ts`.
Conifers use irregular overlapping boughs; broadleaf crowns use five offset lobes.
Rocks have weathered, flattened silhouettes. Logs separate bark and exposed wood with vertex color.
Ferns use spreading leaflets. Grass uses nine curved blades per tuft with shaded roots and lighter tips.
The terrain material adds world-space mottling and distance-filtered fine grain without image downloads.

Ambient grass uses the existing seeded terrain, river and POI exclusion checks. A medium Deadwood
map has 4,451 tufts (120,177 triangles) in one instanced draw. The cap is 6,500 tufts.
Grass receives shadows and uses the existing wind system; it does not cast additional shadows.
World generation, navigation, save identities, equipment and collision placement are unchanged.

Deadwood daylight exposure and material brightness are lifted to preserve visible foliage detail.
Night, weather and the existing localized mist remain active.

Validation: `npm run build`, `npm run qa:world`, `npm run qa:forest`.
Browser smoke-tested World Forge and a fresh local gameplay character on seed 8472152.
No device-wide FPS benchmark or long combat soak test has been performed.
