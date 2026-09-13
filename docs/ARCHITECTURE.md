# Forge Studio architecture

## v0.2 data flow

```text
Single phone browser (Capture mode)
  ├─ Camera (getUserMedia)
  ├─ MediaPipe Pose Landmarker
  ├─ Normalized + world pose landmarks
  └─ PeerJS / WebRTC data channel
                 │
                 ▼
Desktop browser (Mocap Studio)
  ├─ Live pose / GLB preview
  ├─ Pose smoothing
  ├─ Humanoid bone mapper
  ├─ Live GLB retargeter
  ├─ Record incoming pose frames
  ├─ Timeline playback on the character
  └─ .forge-motion.json export/import
```

The camera image stays on the phone. Forge transmits landmark data only.

Forge intentionally targets a **single-phone** body-mocap workflow. There is no multi-camera capture plan. Better results from one phone will come from smoothing, joint constraints, IK, foot locking and cleanup rather than requiring extra devices.

## Humanoid retargeting

Forge scans imported GLB/glTF skeletons and maps common Mixamo, Blender and Unity-style names to a small semantic humanoid rig: hips, spine/chest, head/neck, upper/lower arms, hands, upper/lower legs and feet.

The live retargeter:

1. converts MediaPipe pose landmarks into Forge's Y-up coordinate space,
2. smooths incoming landmark motion,
3. orients the hips/chest from hip and shoulder body axes,
4. aims limb bones toward the tracked elbow/wrist/knee/ankle directions,
5. preserves the imported rig's rest-pose offsets,
6. lets the same recorded motion be played back on the imported character.

Models with unusual/custom bone names may need a manual bone-map UI later. GLB is preferred because a single file contains the mesh, textures, skeleton and animations without external buffer paths.

## Motion file

`.forge-motion.json` is intentionally simple and versioned. It stores:

- clip name
- capture time
- estimated FPS
- duration
- per-frame normalized pose landmarks
- per-frame world-space landmarks when available

The next animation milestone is baking the retargeted bone rotations into a real Three.js/glTF `AnimationClip`, then exporting that animation with the character.

## Planned modules

1. Animation baking / GLB export
2. Mocap cleanup (foot lock, floor alignment, joint limits)
3. Timeline trim / loop / key cleanup
4. Manual bone-map overrides for unusual rigs
5. Same-phone face capture as a separate take
6. Texture/PBR workspace
7. Local AI generation adapters
8. Shared project/asset manifest and Send to Game
