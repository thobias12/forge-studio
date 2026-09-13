# Forge Studio

Forge Studio is a shared Three.js game-asset workspace with one-phone mocap, humanoid rig mapping, live character retargeting and game-ready animation export.

## v0.3.0

- Built-in rigged Forge Mannequin, so Mocap works immediately without importing a character
- Desktop mocap receiver with QR pairing
- Phone browser capture using MediaPipe Pose Landmarker
- Peer-to-peer live pose streaming with PeerJS/WebRTC
- Automatic humanoid bone mapping for common Mixamo, Blender and Unity-style rigs
- Optional custom rigged GLB/GLTF import directly inside Mocap Studio
- Live body retargeting from the phone onto the built-in or imported character
- Smoothing, X mirroring and skeleton-helper controls
- Record and export raw `.forge-motion.json`
- Replay recorded Forge motion on the character
- Bake recorded retargeted bone rotations into a real Three.js `AnimationClip`
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

`Phone -> MediaPipe pose -> WebRTC landmarks -> smoothing -> humanoid bone mapper -> Forge Mannequin / custom GLB rig -> live preview -> record -> bake bone keyframes -> animated GLB export`

The next animation milestone is foot locking, ground alignment, missing-frame cleanup and a dedicated Animation Studio for trimming, loops and clip management.
