# Forge Studio architecture

## v0.1 data flow

```text
Phone browser (/capture)
  ├─ Camera (getUserMedia)
  ├─ MediaPipe Pose Landmarker
  ├─ Normalized + world pose landmarks
  └─ PeerJS / WebRTC data channel
                 │
                 ▼
Desktop browser (/#/mocap)
  ├─ Live Three.js skeleton preview
  ├─ Record incoming pose frames
  ├─ Timeline playback
  └─ .forge-motion.json export/import
```

The camera image stays on the phone in v0.1. Forge transmits landmark data only.

## Motion file

`.forge-motion.json` is intentionally simple and versioned. It stores:

- clip name
- capture time
- estimated FPS
- duration
- per-frame normalized pose landmarks
- per-frame world-space landmarks when available

The next stage is a retargeter that maps these landmarks onto a reusable Forge humanoid skeleton and then bakes the result into a Three.js/glTF AnimationClip.

## Planned modules

1. Humanoid skeleton definition and bone mapper
2. Mocap cleanup (smoothing, foot lock, floor alignment)
3. GLB animation retarget + export
4. Hand tracking / upper body capture
5. Native iPhone capture for ARKit face blendshapes
6. Texture/PBR workspace
7. Local AI generation adapters
8. Shared project/asset manifest and Send to Game
