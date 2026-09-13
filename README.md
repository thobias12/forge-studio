# Forge Studio

Forge Studio is a shared Three.js game-asset workspace with one-phone mocap, humanoid rig mapping, live character retargeting, motion cleanup and game-ready animation export.

## v0.4.0

- Built-in rigged Forge Mannequin, so Mocap works immediately without importing a character
- Desktop mocap receiver with QR pairing
- Phone browser capture using MediaPipe Pose Landmarker
- Peer-to-peer live pose streaming with PeerJS/WebRTC
- Automatic humanoid bone mapping for common Mixamo, Blender and Unity-style rigs
- Optional custom rigged GLB/GLTF import directly inside Mocap Studio
- Live body retargeting from the phone onto the built-in or imported character
- Retarget smoothing, X mirroring and skeleton-helper controls
- Offline adaptive jitter cleanup for recorded takes
- Short tracking-gap interpolation up to 180 ms
- Foot-contact detection and planted-foot locking
- Support-plane / ground alignment for detected feet
- Cleaned take preview before export
- Raw and cleaned `.forge-motion.json` export
- Bake cleaned retargeted bone rotations into a real Three.js `AnimationClip`
- Export the character plus baked animation as a binary `.glb`
- Preserve existing animation clips when exporting an imported character

Forge deliberately targets a **single-phone** mocap workflow. Multi-camera capture is not part of the plan.

## Run locally

```bash
npm install
npm run dev
```

Phone camera access requires HTTPS outside localhost. The repository deploys automatically to GitHub Pages on pushes to `main`.

## Current pipeline

`Phone -> MediaPipe pose -> WebRTC landmarks -> gap repair -> adaptive cleanup -> foot lock / ground alignment -> humanoid retarget -> cleaned preview -> bake bone keyframes -> animated GLB export`

The next milestone is the dedicated Animation Studio: trim/crop, loop tools, naming, playback speed, clip management and root-motion controls.
