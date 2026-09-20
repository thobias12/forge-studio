# Forge Equipment Processor

The local companion powers **Forge → Equipment Lab**.

It listens only on `http://127.0.0.1:47831` and lets the GitHub Pages build use Blender and local AI on the user's PC.

## Start

From the Forge repository:

```bash
npm run equipment:processor
```

Keep the terminal open while using Equipment Lab.

## v1.80.0 recommended pipeline

```text
reference image
    ↓
SPAR3D point-aware local reconstruction
    ↓
raw GLB
    ↓
Blender processing
    ↓
Skillbound fit + skin
    ↓
processed GLB
```

SPAR3D is the recommended backend. TripoSR remains as a legacy fallback because it successfully proves the end-to-end system, but its single-view geometry quality was not strong enough for the Ranger chest target.

### Why Forge uses SPAR3D geometry-only mode

The official SPAR3D project includes native texture-baker and UV-unwrapper extensions. Those extensions normally require native compiler tooling on Windows.

Forge avoids that requirement:

- the SPAR3D neural reconstruction and point diffusion still run on CUDA/NVIDIA;
- Forge supplies lightweight import shims for the optional native texture/UV modules;
- the Forge SPAR3D adapter stops after geometry reconstruction;
- generated point-cloud color is transferred to mesh vertex colors;
- Blender then performs the game-specific normalization, fitting, decimation and skinning.

This keeps the setup realistic for a normal game-development PC without forcing Visual Studio Build Tools or a full CUDA compiler toolchain.

## One-time model access

SPAR3D model weights are hosted in Stability AI's gated Hugging Face repository.

Equipment Lab exposes:

- **Accept model access**
- **Create read token**
- local token field
- **Save token locally**

The token is stored at:

`tools/equipment-processor/work/generators/.hf-token`

The entire `tools/equipment-processor/work/` tree is ignored by Git.

Never commit or share this token.

## Managed Python

Forge continues to manage its own compatible Python runtime. A newer system Python (for example Python 3.13) can bootstrap uv, and uv supplies Python 3.11 privately for the generator environments. The user's normal Python installation is not replaced or downgraded.

## Blender processing

After local generation (or manual GLB import), the processor:

1. receives the official Skillbound mannequin from Forge Library;
2. normalizes equipment orientation and slot placement;
3. for Chest, measures the actual torso and solves height / width / depth independently;
4. applies the requested polygon budget;
5. identifies body-facing contact vertices;
6. fits contact regions toward the mannequin;
7. transfers Skillbound vertex-group weights;
8. binds the equipment to the Skillbound armature;
9. returns the processed GLB directly to Forge.

The chest solver also evaluates axis-aligned rotations because image-to-3D generators do not guarantee Blender/Skillbound axis conventions.

## Legacy TripoSR

The existing TripoSR environment is intentionally preserved as a fallback.

Forge's TripoSR compatibility work includes:

- private Python 3.11 management;
- pip repair/seeding;
- explicit NumPy and ONNX runtime setup;
- a Windows-safe scikit-image marching-cubes replacement for native torchmcubes;
- runtime import validation;
- automatic invalidation of incomplete installations.

It is no longer the primary Equipment Lab generator.

## v1.80.1 CLIP / AlphaCLIP installation

The upstream SPAR3D requirements install OpenAI CLIP and AlphaCLIP directly from GitHub. AlphaCLIP's setup.py imports `pkg_resources`, but pip's isolated build environment may not include setuptools/pkg_resources, causing metadata generation to fail on Windows.

Forge now removes both Git dependencies from the bulk requirements file, installs OpenAI CLIP first, then installs AlphaCLIP with `--no-build-isolation` after PyTorch and setuptools are already available in the private SPAR3D environment. Runtime validation now checks both `clip` and `alpha_clip` imports before writing the SPAR3D ready marker.

## v1.80.2 headless background removal

SPAR3D imports `Remover` from `transparent_background`, but that package imports its Flet GUI at module import time. Newer Flet releases can break the GUI API even though Equipment Lab never uses it.

Forge now removes `transparent-background` from the SPAR3D requirements and supplies a local `transparent_background.Remover` compatibility shim backed by `rembg`. This keeps background removal fully headless and eliminates Flet from the local generator runtime path.
