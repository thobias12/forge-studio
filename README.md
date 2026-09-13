# Forge Studio

Forge Studio is a shared Three.js game-asset workspace with one-phone mocap, humanoid rig mapping, live character retargeting, motion cleanup, game-ready animation export and clip editing.

## v0.5.0

- Built-in rigged Forge Mannequin for mocap testing
- Phone browser capture using MediaPipe Pose Landmarker
- Peer-to-peer pose streaming with PeerJS/WebRTC
- Automatic humanoid bone mapping for common Mixamo, Blender and Unity-style rigs
- Live retargeting, smoothing, X mirroring and skeleton preview
- Adaptive jitter cleanup, short tracking-gap interpolation, foot locking and ground alignment
- Raw and cleaned `.forge-motion.json` export
- Bake cleaned retargeted bone rotations into Three.js `AnimationClip`s
- Export character + baked animation as binary GLB
- Animation Studio with animated GLB import and 3D playback
- Per-clip trim/crop controls
- Rename, duplicate and delete clips
- Playback speed editing from 0.25x to 2.5x
- Loop preview and optional loop-closing pose match
- Root-motion controls: keep, remove horizontal X/Z travel, or lock root position
- Export the full edited animation set back to a binary GLB

Forge deliberately targets a **single-phone** mocap workflow. Multi-camera capture is not part of the plan.

## Run locally

```bash
npm install
npm run dev
```

Phone camera access requires HTTPS outside localhost. The repository deploys automatically to GitHub Pages on pushes to `main`.

## Current pipeline

`Phone -> MediaPipe pose -> WebRTC landmarks -> gap repair -> adaptive cleanup -> foot lock / ground alignment -> humanoid retarget -> cleaned preview -> bake bone keyframes -> Animation Studio -> trim / speed / loop / root-motion edit -> animated GLB export`

The next major content milestone is Texture Lab and the shared Asset Library workflow, followed by one-click Send to Game integration.
