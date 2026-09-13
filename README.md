# Forge Studio

Forge Studio is a shared Three.js game-asset workspace with one-phone mocap, humanoid rig mapping and live character retargeting.

## v0.2.1

- Built-in rigged Forge Mannequin, so Mocap works immediately without importing a character
- Desktop mocap receiver with QR pairing
- Phone browser capture using MediaPipe Pose Landmarker
- Peer-to-peer live pose streaming with PeerJS/WebRTC
- Automatic humanoid bone mapping for common Mixamo, Blender and Unity-style rigs
- Optional custom rigged GLB/GLTF import directly inside Mocap Studio
- Live body retargeting from the phone onto the built-in or imported character
- Smoothing, X mirroring and skeleton-helper controls
- Record and export `.forge-motion.json`
- Replay recorded Forge motion on the character

Forge deliberately targets a **single-phone** mocap workflow. Multi-camera capture is not part of the plan.

## Run locally

```bash
npm install
npm run dev
```

Phone camera access requires HTTPS outside localhost. The repository deploys automatically to GitHub Pages on pushes to `main`.

## Current pipeline

`Phone -> MediaPipe pose -> WebRTC landmarks -> smoothing -> humanoid bone mapper -> Forge Mannequin / custom GLB rig -> live preview / recording`

The next animation milestone is baking the retargeted bone rotations into a real reusable glTF/GLB animation clip, followed by foot locking and motion cleanup.
