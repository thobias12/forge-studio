# Forge Studio

Forge Studio is a shared Three.js game-asset workspace with live phone mocap.

## v0.1

- Desktop mocap receiver with QR pairing
- Phone browser capture using MediaPipe Pose Landmarker
- Peer-to-peer live pose streaming with PeerJS/WebRTC
- Record and export `.forge-motion.json`
- Import/play Forge motion captures
- GLB/GLTF model viewer
- Shared asset-library shell

## Run

```bash
npm install
npm run dev
```

Camera access on phones requires HTTPS. Deploy the app to an HTTPS host (for example Vercel), open Mocap on the PC, then scan the QR code with the phone.

## Architecture

The phone performs pose inference locally and streams pose landmark frames to the desktop studio over a PeerJS/WebRTC data channel. Camera video is not sent to the PC in v0.1.

See `docs/ARCHITECTURE.md` and `docs/DEPLOY.md`.
