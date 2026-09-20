# Forest presentation

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
