# Forge Studio

Forge Studio is a shared Three.js game-asset workspace with one-phone mocap, humanoid rig mapping and live GLB character retargeting.

## v0.2

- Desktop mocap receiver with QR pairing
- Phone browser capture using MediaPipe Pose Landmarker
- Peer-to-peer live pose streaming with PeerJS/WebRTC
- Automatic humanoid bone mapping for common Mixamo, Blender and Unity-style rigs
- Import a rigged GLB character directly inside Mocap Studio
- Live body retargeting from the phone onto the imported character
- Smoothing, X mirroring and skeleton-helper controls
- Record and export `.forge-motion.json`
- Replay a recorded Forge motion clip on the imported character
- Model Lab humanoid-rig inspection
- Shared asset-library foundation

Forge deliberately targets a **single-phone** mocap workflow. Multi-camera capture is not part of the plan.

## Run locally

```bash
npm install
npm run dev
```

Phone camera access requires HTTPS outside localhost. The repository deploys automatically to GitHub Pages on pushes to `main`. Open Forge on the PC, enter Mocap, then scan the generated QR code with the phone.

## Current pipeline

`Phone -> MediaPipe pose -> WebRTC landmarks -> smoothing -> humanoid bone mapper -> Three.js GLB rig -> live preview / recording`

The next animation milestone is baking the retargeted bone rotations into a real reusable glTF/GLB animation clip, followed by foot locking and motion cleanup.

See `docs/ARCHITECTURE.md` and `docs/DEPLOY.md`.
