# Forge Equipment Processor

The local companion powers **Forge → Equipment Lab**.

It listens only on `http://127.0.0.1:47831` and lets the GitHub Pages build use software on your own PC.

## Start

From the Forge repository:

```bash
npm run equipment:processor
```

Keep that terminal open while using Equipment Lab.

## End-to-end Equipment Lab flow

Forge v1.79.0 supports:

```text
reference image
    ↓
free local TripoSR generation
    ↓
raw GLB
    ↓
Blender processing
    ↓
Skillbound fit + skin
    ↓
processed GLB
```

### Blender

The processor automatically scans the normal Windows Blender installation folders. If Blender is elsewhere, set `BLENDER_PATH`.

### Free local 3D generator

Equipment Lab has an **Install Free Local Generator** button. The processor installs TripoSR into:

`tools/equipment-processor/work/generators/triposr`

That folder is ignored by Git.

Setup:

1. finds a compatible Python runtime (Python 3.11 preferred)
2. clones the official VAST-AI-Research/TripoSR repository
3. creates an isolated virtual environment
4. installs PyTorch CUDA 12.8 on Windows
5. installs TripoSR requirements
6. verifies whether CUDA/NVIDIA GPU access is available

TripoSR model weights are downloaded locally on first generation.

If Python is missing, install Python 3.11 and retry. Some Windows Python packages may require Microsoft Visual C++ build tools.

## Blender processing

After generation (or manual GLB import), the processor:

1. receives the official Skillbound mannequin from Forge Library
2. normalizes equipment scale and slot placement
3. applies the requested polygon budget
4. identifies body-facing vertices with a proximity contact group
5. fits only those contact vertices toward the mannequin
6. transfers Skillbound vertex-group weights
7. binds the equipment to the Skillbound armature
8. returns the processed GLB directly to Forge

Weapons still use the raw normalized path in this proof stage; automatic grip/socket authoring is a later milestone.
