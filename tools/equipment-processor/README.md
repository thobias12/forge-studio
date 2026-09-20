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

1. detects any existing Python 3.8+ runtime
2. if that Python is newer than TripoSR supports (for example Python 3.13), Forge creates a private bootstrap virtual environment
3. installs uv inside that private bootstrap
4. uv downloads and manages Python 3.11 for Forge only
5. clones the official VAST-AI-Research/TripoSR repository
6. creates the isolated generator environment
7. installs PyTorch CUDA 12.8 on Windows
8. installs TripoSR requirements
9. verifies whether CUDA/NVIDIA GPU access is available

The Forge-managed Python lives under `tools/equipment-processor/work/generators/.forge-python`. It does not replace, downgrade or modify the user's normal Python installation.

TripoSR model weights are downloaded locally on first generation.

If no Python runtime exists at all, install any current Python release once and retry. Some Windows Python packages may require Microsoft Visual C++ build tools.

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

## v1.79.2 setup validation

Forge no longer considers the generator ready merely because the virtual environment exists. Setup now validates imports for NumPy, rembg, torch, xatlas, Pillow and TripoSR itself before writing a ready marker. Missing runtime packages are repaired automatically where possible. uv-created environments are seeded with pip, and a missing pip installation is repaired with ensurepip.

## v1.79.3 Windows marching-cubes fallback

The upstream TripoSR requirements install torchmcubes from GitHub. Modern torchmcubes must be compiled against the installed PyTorch and requires a C++20 compiler (and CUDA toolkit for its GPU extension). Forge avoids making those developer tools a prerequisite on Windows.

During setup Forge now creates a filtered requirements file without torchmcubes, installs scikit-image from a wheel, and writes a local torchmcubes compatibility module inside the TripoSR checkout. TripoSR inference still uses PyTorch/CUDA on the NVIDIA GPU. Only the final marching-cubes surface extraction runs through the portable scikit-image CPU implementation.
