import argparse
import os

import numpy as np
import torch
import trimesh
from PIL import Image
from transparent_background import Remover

from spar3d.system import SPAR3D
from spar3d.utils import (
    create_intrinsic_from_fov_rad,
    default_cond_c2w,
    foreground_crop,
    get_device,
    normalize_pc_bbox,
    remove_background,
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--quality",
        choices=["draft", "standard", "high"],
        default="standard",
    )
    parser.add_argument(
        "--low-vram",
        action="store_true",
    )
    return parser.parse_args()


def apply_output_rotation(mesh):
    rotation_x = trimesh.transformations.rotation_matrix(
        np.radians(-90.0),
        [1.0, 0.0, 0.0],
    )
    rotation_y = trimesh.transformations.rotation_matrix(
        np.radians(90.0),
        [0.0, 1.0, 0.0],
    )
    mesh.apply_transform(rotation_y @ rotation_x)


def nearest_point_colors(vertices, pointcloud):
    points = pointcloud[:, :3].astype(np.float32)
    colors = pointcloud[:, 3:6].astype(np.float32)

    if colors.size == 0:
        return np.full(
            (len(vertices), 4),
            200,
            dtype=np.uint8,
        )

    # SPAR3D point colors are normally in [0, 1].
    if np.nanmax(colors) <= 1.5:
        colors = colors * 255.0
    colors = np.clip(colors, 0.0, 255.0)

    result = np.zeros(
        (len(vertices), 4),
        dtype=np.uint8,
    )
    result[:, 3] = 255

    chunk_size = 4096
    for start in range(0, len(vertices), chunk_size):
        end = min(
            len(vertices),
            start + chunk_size,
        )
        chunk = vertices[start:end].astype(np.float32)
        distances = (
            chunk[:, None, :]
            - points[None, :, :]
        )
        distances = np.einsum(
            "ijk,ijk->ij",
            distances,
            distances,
        )
        nearest = np.argmin(
            distances,
            axis=1,
        )
        result[start:end, :3] = (
            colors[nearest]
            .round()
            .astype(np.uint8)
        )

    return result


def prepare_image(path, device):
    print("FORGE_STAGE background", flush=True)
    image = Image.open(path).convert("RGBA")
    remover = Remover(device=device)
    image = remove_background(
        image,
        remover,
    )
    return foreground_crop(
        image,
        1.18,
    )


def create_batch(model, image):
    mask_cond, rgb_cond = model.prepare_image(image)
    batch_size = 1

    c2w_cond = default_cond_c2w(
        model.cfg.default_distance,
    ).to(model.device)
    intrinsic, intrinsic_normed = (
        create_intrinsic_from_fov_rad(
            model.cfg.default_fovy_rad,
            model.cfg.cond_image_size,
            model.cfg.cond_image_size,
        )
    )

    batch = {
        "rgb_cond": rgb_cond,
        "mask_cond": mask_cond,
        "c2w_cond": (
            c2w_cond
            .view(1, 1, 4, 4)
            .repeat(
                batch_size,
                1,
                1,
                1,
            )
        ),
        "intrinsic_cond": (
            intrinsic
            .to(model.device)
            .view(1, 1, 3, 3)
            .repeat(
                batch_size,
                1,
                1,
                1,
            )
        ),
        "intrinsic_normed_cond": (
            intrinsic_normed
            .to(model.device)
            .view(1, 1, 3, 3)
            .repeat(
                batch_size,
                1,
                1,
                1,
            )
        ),
    }

    batch["rgb_cond"] = model.image_processor(
        batch["rgb_cond"],
        model.cfg.cond_image_size,
    )
    batch["mask_cond"] = model.image_processor(
        batch["mask_cond"],
        model.cfg.cond_image_size,
    )
    return batch


def infer_geometry(model, batch):
    print("FORGE_STAGE pointcloud", flush=True)
    cond_tokens = model.forward_pdiff_cond(batch)
    sample_iter = model.sampler.sample_batch_progressive(
        1,
        cond_tokens,
        device=model.device,
    )
    samples = None
    for step in sample_iter:
        samples = step["xstart"]

    if samples is None:
        raise RuntimeError(
            "SPAR3D did not produce a point cloud."
        )

    denoised_pc = (
        samples
        .permute(0, 2, 1)
        .float()
    )
    batch["pc_cond"] = normalize_pc_bbox(
        denoised_pc,
    )

    print("FORGE_STAGE mesh", flush=True)
    scene_codes, _ = model.get_scene_codes(batch)
    meshes = model.triplane_to_meshes(
        scene_codes,
    )
    if not meshes:
        raise RuntimeError(
            "SPAR3D did not produce a mesh."
        )

    return (
        meshes[0],
        batch["pc_cond"][0]
        .detach()
        .cpu()
        .numpy(),
    )


def main():
    args = parse_args()
    device = get_device()

    if device == "cpu":
        raise RuntimeError(
            "SPAR3D requires CUDA for the Forge Equipment Lab workflow."
        )

    image = prepare_image(
        args.input,
        device,
    )

    print("FORGE_STAGE model", flush=True)
    model = SPAR3D.from_pretrained(
        "stabilityai/stable-point-aware-3d",
        config_name="config.yaml",
        weight_name="model.safetensors",
        low_vram_mode=args.low_vram,
    )
    model.to(device)
    model.eval()

    with torch.no_grad():
        mesh_data, pointcloud = infer_geometry(
            model,
            create_batch(
                model,
                image,
            ),
        )

    vertices = (
        mesh_data.v_pos
        .detach()
        .cpu()
        .numpy()
        .astype(np.float32)
    )
    faces = (
        mesh_data.t_pos_idx
        .detach()
        .cpu()
        .numpy()
        .astype(np.int32)
    )

    print("FORGE_STAGE color", flush=True)
    vertex_colors = nearest_point_colors(
        vertices,
        pointcloud,
    )

    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors,
        process=False,
    )
    apply_output_rotation(mesh)

    # Keep source topology for Blender. Equipment Lab applies its own
    # polygon budget after body alignment, which is safer for armor.
    os.makedirs(
        os.path.dirname(args.output),
        exist_ok=True,
    )

    print("FORGE_STAGE export", flush=True)
    mesh.export(args.output)
    print(
        "FORGE_RESULT "
        + args.output,
        flush=True,
    )


if __name__ == "__main__":
    main()
