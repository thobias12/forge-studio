# Forge Equipment Processor

This is the local geometry-processing companion for Forge -> Equipment Lab.

It lets the GitHub Pages version of Forge hand a raw GLB to Blender on your own computer without requiring you to open Blender manually.

## Requirements

- Node.js (the same machine used for Forge development)
- Blender 4.x

On Windows the processor automatically scans C:\Program Files\Blender Foundation.
If Blender is elsewhere, set the BLENDER_PATH environment variable before starting it.

## Start

From the Forge repository run:

npm run equipment:processor

Keep the terminal open while using Equipment Lab. The local service only listens on http://127.0.0.1:47831.

## Proof-of-concept pipeline

1. Forge sends the installed official Skillbound mannequin from the browser Library.
2. Forge sends the raw equipment GLB.
3. Blender normalizes scale and slot placement.
4. A proximity contact group identifies body-facing vertices.
5. Only that group is shrink-fitted, preserving raised plates and details.
6. Skillbound vertex-group weights are transferred from the body.
7. The equipment is bound to the Skillbound armature.
8. A processed GLB is returned directly to Forge for preview and Library storage.

Weapons are normalized in this first pass but grip sockets are the next milestone after the Ranger chest fit is proven.
