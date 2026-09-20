import argparse
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree


STYLES = {
    "ranger": {
        "name": "Ranger Field Vest",
        "cloth": "#20372a",
        "leather": "#342117",
        "trim": "#6b4b2e",
        "accent": "#6b3038",
        "metal": "#7d8589",
        "length": 0.515,
        "top_center": 0.730,
        "top_shoulder": 0.800,
        "waist_flare": 0.008,
        "vest": True,
        "tabard": False,
    },
    "traveler": {
        "name": "Traveler Layered Tunic",
        "cloth": "#655640",
        "leather": "#443226",
        "trim": "#2e251f",
        "accent": "#795f3b",
        "metal": "#77736a",
        "length": 0.475,
        "top_center": 0.716,
        "top_shoulder": 0.782,
        "waist_flare": 0.016,
        "vest": True,
        "tabard": False,
    },
    "acolyte": {
        "name": "Acolyte Battle Tunic",
        "cloth": "#29344d",
        "leather": "#342d35",
        "trim": "#756448",
        "accent": "#3a2457",
        "metal": "#858c96",
        "length": 0.465,
        "top_center": 0.735,
        "top_shoulder": 0.800,
        "waist_flare": 0.012,
        "vest": True,
        "tabard": True,
    },
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--mannequin", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--body", default="female")
    parser.add_argument("--slot", default="chest")
    parser.add_argument("--style", default="ranger")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--include-body",
        action="store_true",
        help="Include the mannequin body in the exported GLB for QA only.",
    )
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [obj for obj in bpy.data.objects if obj not in before]


def primary_body(objects):
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("The Skillbound mannequin contains no mesh.")

    def score(obj):
        name = obj.name.lower()
        value = len(obj.data.vertices)
        if "body" in name:
            value += 1000000
        if any(word in name for word in ["eye", "hair", "teeth", "optional"]):
            value -= 500000
        return value

    return max(meshes, key=score)


def find_armature(objects):
    return next((obj for obj in objects if obj.type == "ARMATURE"), None)


def percentile(values, fraction):
    if not values:
        return 0.0
    ordered = sorted(values)
    position = max(0.0, min(1.0, fraction)) * (len(ordered) - 1)
    low = int(math.floor(position))
    high = int(math.ceil(position))
    if low == high:
        return ordered[low]
    blend = position - low
    return ordered[low] * (1.0 - blend) + ordered[high] * blend


def robust_bounds(points, low=0.05, high=0.95):
    return (
        Vector((
            percentile([p.x for p in points], low),
            percentile([p.y for p in points], low),
            percentile([p.z for p in points], low),
        )),
        Vector((
            percentile([p.x for p in points], high),
            percentile([p.y for p in points], high),
            percentile([p.z for p in points], high),
        )),
    )


def smoothstep(edge0, edge1, value):
    if edge1 <= edge0:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def find_pose_bone(rig, *names):
    wanted = [name.lower() for name in names]
    for bone in rig.pose.bones:
        lower = bone.name.lower()
        if any(
            lower == name
            or lower.endswith(name)
            or name in lower
            for name in wanted
        ):
            return bone
    return None


def pose_bone_world_position(rig, bone):
    if bone is None:
        return None
    return rig.matrix_world @ bone.head


def dominant_axis(vector, excluded=None):
    excluded = set(excluded or [])
    candidates = [
        axis
        for axis in range(3)
        if axis not in excluded
    ]
    if not candidates:
        raise RuntimeError(
            "Could not resolve a free body axis."
        )
    return max(
        candidates,
        key=lambda axis: abs(vector[axis]),
    )


def axis_name(axis):
    return ["X", "Y", "Z"][axis]


def body_frame(body, rig):
    points = [
        body.matrix_world @ vertex.co
        for vertex in body.data.vertices
    ]
    if not points:
        raise RuntimeError(
            "The Skillbound body has no vertices."
        )

    full_min, full_max = robust_bounds(
        points,
        0.01,
        0.99,
    )

    pelvis = pose_bone_world_position(
        rig,
        find_pose_bone(
            rig,
            "pelvis",
            "hips",
        ),
    )
    chest = pose_bone_world_position(
        rig,
        find_pose_bone(
            rig,
            "spine_03",
            "chest",
            "spine_02",
        ),
    )
    neck = pose_bone_world_position(
        rig,
        find_pose_bone(
            rig,
            "neck_01",
            "neck",
        ),
    )
    head = pose_bone_world_position(
        rig,
        find_pose_bone(
            rig,
            "head",
            "head_01",
        ),
    )
    left_shoulder = pose_bone_world_position(
        rig,
        find_pose_bone(
            rig,
            "clavicle_L",
            "upperarm_L",
        ),
    )
    right_shoulder = pose_bone_world_position(
        rig,
        find_pose_bone(
            rig,
            "clavicle_R",
            "upperarm_R",
        ),
    )

    # glTF is Y-up, while Blender is Z-up. Blender's importer converts
    # the asset, so the original Skillbound authoring axes must NOT be
    # hard-coded here. Resolve the imported frame from the skeleton.
    if pelvis is not None and head is not None:
        vertical_vector = head - pelvis
        vertical_axis = dominant_axis(
            vertical_vector,
        )
        vertical_sign = (
            1.0
            if vertical_vector[vertical_axis] >= 0
            else -1.0
        )
    elif pelvis is not None and chest is not None:
        vertical_vector = chest - pelvis
        vertical_axis = dominant_axis(
            vertical_vector,
        )
        vertical_sign = (
            1.0
            if vertical_vector[vertical_axis] >= 0
            else -1.0
        )
    else:
        spans = full_max - full_min
        vertical_axis = max(
            range(3),
            key=lambda axis: spans[axis],
        )
        vertical_sign = 1.0

    if (
        left_shoulder is not None
        and right_shoulder is not None
    ):
        shoulder_vector = (
            left_shoulder
            - right_shoulder
        )
        width_axis = dominant_axis(
            shoulder_vector,
            excluded={vertical_axis},
        )
    else:
        spans = full_max - full_min
        width_axis = max(
            [
                axis
                for axis in range(3)
                if axis != vertical_axis
            ],
            key=lambda axis: spans[axis],
        )

    depth_axis = next(
        axis
        for axis in range(3)
        if axis not in {
            vertical_axis,
            width_axis,
        }
    )

    vertical_values = [
        point[vertical_axis]
        * vertical_sign
        for point in points
    ]
    vertical_min = percentile(
        vertical_values,
        0.01,
    )
    vertical_max = percentile(
        vertical_values,
        0.99,
    )
    height = max(
        vertical_max - vertical_min,
        0.001,
    )

    center = Vector((
        percentile(
            [point.x for point in points],
            0.5,
        ),
        percentile(
            [point.y for point in points],
            0.5,
        ),
        percentile(
            [point.z for point in points],
            0.5,
        ),
    ))

    if (
        pelvis is not None
        and chest is not None
    ):
        torso_center_signed = (
            pelvis[vertical_axis]
            * vertical_sign
            + chest[vertical_axis]
            * vertical_sign
        ) * 0.5
    else:
        torso_center_signed = (
            vertical_min
            + height * 0.64
        )

    center[vertical_axis] = (
        torso_center_signed
        * vertical_sign
    )

    shoulder_half_width = None
    if (
        left_shoulder is not None
        and right_shoulder is not None
    ):
        shoulder_half_width = (
            abs(
                left_shoulder[width_axis]
                - right_shoulder[width_axis]
            )
            * 0.5
        )

    torso_band_low = (
        vertical_min
        + height * 0.46
    )
    torso_band_high = (
        vertical_min
        + height * 0.81
    )

    central_band = [
        point
        for point in points
        if (
            torso_band_low
            <= (
                point[vertical_axis]
                * vertical_sign
            )
            <= torso_band_high
        )
    ]

    if (
        shoulder_half_width is None
        or shoulder_half_width
        < height * 0.06
    ):
        width_distances = [
            abs(
                point[width_axis]
                - center[width_axis]
            )
            for point in central_band
        ]
        shoulder_half_width = max(
            percentile(
                width_distances,
                0.74,
            ),
            height * 0.11,
        )

    torso_width_limit = (
        shoulder_half_width
        * 1.12
    )

    torso = [
        point
        for point in central_band
        if (
            abs(
                point[width_axis]
                - center[width_axis]
            )
            <= torso_width_limit
        )
    ]

    if len(torso) < 64:
        torso = central_band

    if len(torso) < 64:
        raise RuntimeError(
            "Could not isolate enough Skillbound torso vertices. "
            + "Resolved axes were vertical="
            + axis_name(vertical_axis)
            + ", width="
            + axis_name(width_axis)
            + "."
        )

    torso_width_values = [
        point[width_axis]
        for point in torso
    ]
    torso_depth_values = [
        point[depth_axis]
        for point in torso
    ]

    torso_width = max(
        percentile(
            torso_width_values,
            0.96,
        )
        - percentile(
            torso_width_values,
            0.04,
        ),
        shoulder_half_width * 1.45,
        height * 0.16,
    )
    torso_depth = max(
        percentile(
            torso_depth_values,
            0.96,
        )
        - percentile(
            torso_depth_values,
            0.04,
        ),
        height * 0.08,
    )

    positive_depth = (
        percentile(
            torso_depth_values,
            0.96,
        )
        - center[depth_axis]
    )
    negative_depth = (
        center[depth_axis]
        - percentile(
            torso_depth_values,
            0.04,
        )
    )
    front_sign = (
        1.0
        if positive_depth >= negative_depth
        else -1.0
    )

    def signed_vertical(position):
        if position is None:
            return None
        return (
            position[vertical_axis]
            * vertical_sign
        )

    pelvis_v = signed_vertical(pelvis)
    chest_v = signed_vertical(chest)
    neck_v = signed_vertical(neck)
    head_v = signed_vertical(head)
    shoulder_values = [
        signed_vertical(position)
        for position in [
            left_shoulder,
            right_shoulder,
        ]
        if position is not None
    ]
    shoulder_v = (
        sum(shoulder_values)
        / len(shoulder_values)
        if shoulder_values
        else (
            vertical_min
            + height * 0.76
        )
    )

    print(
        "FORGE_FRAME "
        + json.dumps({
            "axes": {
                "width": axis_name(
                    width_axis,
                ),
                "vertical": axis_name(
                    vertical_axis,
                ),
                "verticalSign":
                    vertical_sign,
                "depth": axis_name(
                    depth_axis,
                ),
                "frontSign":
                    front_sign,
            },
            "height": round(
                height,
                5,
            ),
            "torsoWidth": round(
                torso_width,
                5,
            ),
            "torsoDepth": round(
                torso_depth,
                5,
            ),
            "shoulderHalfWidth": round(
                shoulder_half_width,
                5,
            ),
            "torsoVertices": len(
                torso,
            ),
            "bones": {
                "pelvis": (
                    list(
                        round(
                            value,
                            5,
                        )
                        for value
                        in pelvis
                    )
                    if pelvis is not None
                    else None
                ),
                "chest": (
                    list(
                        round(
                            value,
                            5,
                        )
                        for value
                        in chest
                    )
                    if chest is not None
                    else None
                ),
                "neck": (
                    list(
                        round(
                            value,
                            5,
                        )
                        for value
                        in neck
                    )
                    if neck is not None
                    else None
                ),
                "head": (
                    list(
                        round(
                            value,
                            5,
                        )
                        for value
                        in head
                    )
                    if head is not None
                    else None
                ),
            },
        }),
        flush=True,
    )

    return {
        "min": full_min,
        "max": full_max,
        "height": height,
        "vertical": vertical_axis,
        "vertical_sign": vertical_sign,
        "vertical_min": vertical_min,
        "width": width_axis,
        "depth": depth_axis,
        "center": center,
        "torso_width": torso_width,
        "torso_depth": torso_depth,
        "front_sign": front_sign,
        "pelvis_v": pelvis_v,
        "chest_v": chest_v,
        "neck_v": neck_v,
        "head_v": head_v,
        "shoulder_v": shoulder_v,
    }


TORSO_GROUP_TOKENS = (
    "spine",
    "pelvis",
    "hips",
    "chest",
    "breast",
    "clavicle",
)

LIMB_GROUP_TOKENS = (
    "upperarm",
    "lowerarm",
    "forearm",
    "hand",
    "thumb",
    "index",
    "middle",
    "ring",
    "pinky",
    "finger",
    "thigh",
    "calf",
    "shin",
    "foot",
    "toe",
    "head",
)


def build_torso_vertex_mask(
    body,
    frame,
):
    group_names = {
        group.index:
            group.name.lower()
        for group
        in body.vertex_groups
    }

    source_world = (
        body.matrix_world.copy()
    )
    keep = set()
    spatial_added = 0

    width_axis = frame["width"]
    depth_axis = frame["depth"]
    vertical_axis = frame["vertical"]
    center = frame["center"]
    height = frame["height"]

    # The skin weights remain the first safety filter, but a pure
    # torso-dominance test is too conservative around breasts, ribs and
    # armpits because those vertices commonly blend with clavicle/arm
    # groups. Expand the mask inside a strict central torso volume so the
    # garment can cover the actual chest without ever reaching hands,
    # forearms, thighs or the head.
    for vertex in body.data.vertices:
        torso_score = 0.0
        limb_score = 0.0

        for assignment in vertex.groups:
            name = group_names.get(
                assignment.group,
                "",
            )
            if any(
                token in name
                for token
                in TORSO_GROUP_TOKENS
            ):
                torso_score += (
                    assignment.weight
                )
            if any(
                token in name
                for token
                in LIMB_GROUP_TOKENS
            ):
                limb_score += (
                    assignment.weight
                )

        point = (
            source_world
            @ vertex.co
        )
        signed_v = (
            point[vertical_axis]
            * frame["vertical_sign"]
        )
        v = (
            signed_v
            - frame["vertical_min"]
        ) / height
        width_distance = abs(
            point[width_axis]
            - center[width_axis]
        )
        depth_distance = abs(
            point[depth_axis]
            - center[depth_axis]
        )

        inside_torso_volume = (
            0.435 <= v <= 0.845
            and width_distance
            <= height * 0.195
            and depth_distance
            <= height * 0.260
        )

        strongly_torso_driven = (
            inside_torso_volume
            and torso_score >= 0.20
            and torso_score
            >= limb_score * 0.72
        )

        safe_spatial_fill = (
            inside_torso_volume
            and (
                torso_score >= 0.055
                or limb_score < 0.62
            )
            and not (
                limb_score >= 0.82
                and torso_score < 0.10
            )
        )

        if (
            strongly_torso_driven
            or safe_spatial_fill
        ):
            keep.add(
                vertex.index,
            )
            if (
                safe_spatial_fill
                and not strongly_torso_driven
            ):
                spatial_added += 1

    if len(keep) < 900:
        # Unexpected rig naming should still produce a torso rather than
        # falling back to the whole T-pose. This fallback is intentionally
        # spatially strict and cannot reach distal limbs.
        for vertex in body.data.vertices:
            point = (
                source_world
                @ vertex.co
            )
            signed_v = (
                point[vertical_axis]
                * frame["vertical_sign"]
            )
            v = (
                signed_v
                - frame["vertical_min"]
            ) / height
            width_distance = abs(
                point[width_axis]
                - center[width_axis]
            )
            depth_distance = abs(
                point[depth_axis]
                - center[depth_axis]
            )
            if (
                0.45 <= v <= 0.83
                and width_distance
                <= height * 0.18
                and depth_distance
                <= height * 0.240
            ):
                keep.add(
                    vertex.index,
                )

    print(
        "FORGE_TORSO_MASK "
        + "vertices="
        + str(len(keep))
        + "/"
        + str(len(body.data.vertices))
        + " spatialAdded="
        + str(spatial_added)
        + " groups="
        + ",".join(
            sorted({
                name
                for name
                in group_names.values()
                if any(
                    token in name
                    for token
                    in TORSO_GROUP_TOKENS
                )
            })[:18]
        ),
        flush=True,
    )

    return keep


def refine_frame_from_torso_mask(
    body,
    frame,
    torso_indices,
):
    source_world = (
        body.matrix_world.copy()
    )
    points = [
        source_world @ vertex.co
        for vertex
        in body.data.vertices
        if vertex.index
        in torso_indices
    ]

    if len(points) < 64:
        return frame

    width_axis = frame["width"]
    depth_axis = frame["depth"]

    width_values = [
        point[width_axis]
        for point in points
    ]
    depth_values = [
        point[depth_axis]
        for point in points
    ]

    frame["center"][
        width_axis
    ] = percentile(
        width_values,
        0.5,
    )
    frame["center"][
        depth_axis
    ] = percentile(
        depth_values,
        0.5,
    )
    frame["torso_width"] = max(
        percentile(
            width_values,
            0.96,
        )
        - percentile(
            width_values,
            0.04,
        ),
        # The weighted torso core is intentionally conservative. Use a
        # body-height floor so chest/breast vertices are normalized
        # against the real garment envelope rather than that narrow core.
        frame["height"] * 0.285,
    )
    frame["torso_depth"] = max(
        percentile(
            depth_values,
            0.96,
        )
        - percentile(
            depth_values,
            0.04,
        ),
        frame["height"] * 0.08,
    )

    # Imported glTF axis conversion can make depth extent an unreliable
    # way to decide which side is the character's front. Female Skillbound
    # bodies provide dedicated breast weights, so use their weighted
    # surface position as a semantic forward landmark when available.
    group_names = {
        group.index:
            group.name.lower()
        for group
        in body.vertex_groups
    }
    breast_depths = []
    for vertex in body.data.vertices:
        breast_weight = sum(
            assignment.weight
            for assignment
            in vertex.groups
            if "breast"
            in group_names.get(
                assignment.group,
                "",
            )
        )
        if breast_weight >= 0.20:
            point = (
                source_world
                @ vertex.co
            )
            breast_depths.append(
                point[depth_axis]
            )

    if len(breast_depths) >= 12:
        breast_depth = percentile(
            breast_depths,
            0.5,
        )
        frame["front_sign"] = (
            1.0
            if breast_depth
            >= frame["center"][
                depth_axis
            ]
            else -1.0
        )

    print(
        "FORGE_TORSO_REFINED "
        + json.dumps({
            "width": round(
                frame["torso_width"],
                5,
            ),
            "depth": round(
                frame["torso_depth"],
                5,
            ),
            "frontSign": frame[
                "front_sign"
            ],
            "breastSamples": len(
                breast_depths,
            ),
        }),
        flush=True,
    )

    return frame


def hex_rgb(value):
    value = value.lstrip("#")
    return (
        int(value[0:2], 16) / 255.0,
        int(value[2:4], 16) / 255.0,
        int(value[4:6], 16) / 255.0,
        1.0,
    )


def material(name, color, roughness=0.7, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    rgba = hex_rgb(color)
    mat.diffuse_color = rgba
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def remove_non_armature_modifiers(obj):
    for modifier in list(obj.modifiers):
        if modifier.type != "ARMATURE":
            obj.modifiers.remove(modifier)


def ensure_armature(obj, rig):
    world_matrix = obj.matrix_world.copy()

    remove_non_armature_modifiers(obj)
    armature_modifiers = [
        mod
        for mod in obj.modifiers
        if mod.type == "ARMATURE"
    ]
    if not armature_modifiers:
        mod = obj.modifiers.new(
            "FORGE_Armature",
            "ARMATURE",
        )
        mod.object = rig
    else:
        for mod in armature_modifiers:
            mod.object = rig

    obj.parent = rig
    obj.matrix_parent_inverse = (
        rig.matrix_world.inverted()
    )
    obj.matrix_world = world_matrix


def delete_unwanted_vertices(
    obj,
    keep_indices,
):
    # Do not use edit-mode selection + bpy.ops.mesh.delete here.
    # A duplicated glTF mesh can carry selection state into Edit Mode,
    # causing Blender to delete every vertex regardless of the object-mode
    # vertex.select flags. BMesh edits the mesh datablock directly and is
    # deterministic in background/headless Blender.
    mesh = obj.data
    bm = bmesh.new()

    try:
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()

        delete_verts = [
            vertex
            for vertex in bm.verts
            if vertex.index
            not in keep_indices
        ]

        bmesh.ops.delete(
            bm,
            geom=delete_verts,
            context="VERTS",
        )

        bm.to_mesh(mesh)
        mesh.update()
    finally:
        bm.free()


def apply_modifier(obj, modifier):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def outward_shell(obj, clearance, thickness, smooth_iterations=1):
    if len(obj.data.vertices) == 0:
        return

    # A wearable garment should follow the body envelope without copying
    # every anatomical bump. Smooth the cut surface first, preserving
    # volume and protecting open borders, then push the simplified garment
    # outward for reliable body clearance.
    if smooth_iterations > 0:
        smooth = obj.modifiers.new(
            "FORGE_GarmentSurface",
            "LAPLACIANSMOOTH",
        )
        smooth.lambda_factor = 0.30
        smooth.lambda_border = 0.025
        smooth.iterations = smooth_iterations
        try:
            smooth.use_volume_preserve = True
            smooth.use_normalized = True
        except Exception:
            pass
        apply_modifier(obj, smooth)

    displace = obj.modifiers.new("FORGE_Clearance", "DISPLACE")
    displace.direction = "NORMAL"
    displace.mid_level = 0.0
    displace.strength = clearance
    apply_modifier(obj, displace)

    solidify = obj.modifiers.new("FORGE_Thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 1.0
    solidify.use_rim = True
    solidify.use_quality_normals = True
    apply_modifier(obj, solidify)

    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def duplicate_surface(
    body,
    rig,
    name,
    mat,
    keep_vertex,
    clearance,
    thickness,
    smooth_iterations=1,
    allowed_indices=None,
):
    # Decide the garment cut on the untouched source body before copying.
    # The copied mesh has identical vertex indices, so this avoids any
    # ambiguity from parent transforms, glTF import transforms or armature
    # state on the duplicate.
    source_world = body.matrix_world.copy()
    keep_indices = {
        vertex.index
        for vertex in body.data.vertices
        if (
            (
                allowed_indices is None
                or vertex.index
                in allowed_indices
            )
            and keep_vertex(
                source_world
                @ vertex.co
            )
        )
    }

    print(
        "FORGE_SOURCE_CUT "
        + name
        + " matched="
        + str(len(keep_indices))
        + "/"
        + str(len(body.data.vertices)),
        flush=True,
    )

    if len(keep_indices) < 12:
        return None

    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    body.users_collection[0].objects.link(
        obj,
    )
    obj.matrix_world = source_world

    obj.data.materials.clear()
    obj.data.materials.append(mat)

    delete_unwanted_vertices(
        obj,
        keep_indices,
    )

    vertex_count = len(
        obj.data.vertices,
    )
    polygon_count = len(
        obj.data.polygons,
    )
    print(
        "FORGE_LAYER "
        + name
        + " vertices="
        + str(vertex_count)
        + " polygons="
        + str(polygon_count),
        flush=True,
    )

    if vertex_count < 12:
        mesh_data = obj.data
        bpy.data.objects.remove(
            obj,
            do_unlink=True,
        )
        if mesh_data.users == 0:
            bpy.data.meshes.remove(
                mesh_data,
            )
        return None

    outward_shell(
        obj,
        clearance,
        thickness,
        smooth_iterations=smooth_iterations,
    )
    ensure_armature(
        obj,
        rig,
    )
    return obj


def normalized_components(point, frame):
    vertical = frame["vertical"]
    width = frame["width"]
    depth = frame["depth"]
    height = frame["height"]

    signed_vertical = (
        point[vertical]
        * frame["vertical_sign"]
    )
    v = (
        signed_vertical
        - frame["vertical_min"]
    ) / height
    dw = (
        point[width]
        - frame["center"][width]
    )
    dd = (
        point[depth]
        - frame["center"][depth]
    )

    half_width = max(
        frame["torso_width"] * 0.5,
        1e-5,
    )
    half_depth = max(
        frame["torso_depth"] * 0.5,
        1e-5,
    )

    return (
        v,
        dw,
        dd,
        abs(dw) / half_width,
        dd / half_depth,
    )


def frame_fraction(
    frame,
    signed_value,
    fallback,
):
    if signed_value is None:
        return fallback
    return (
        signed_value
        - frame["vertical_min"]
    ) / frame["height"]


def chest_landmark_fractions(
    frame,
    style,
):
    shoulder = frame_fraction(
        frame,
        frame.get("shoulder_v"),
        style["top_shoulder"],
    )
    neck = frame_fraction(
        frame,
        frame.get("neck_v"),
        style["top_center"] + 0.08,
    )
    pelvis = frame_fraction(
        frame,
        frame.get("pelvis_v"),
        style["length"] + 0.04,
    )

    # The shoulder bone on the Skillbound fixture sits much lower than
    # the visual collar line, so do not let it drag the neckline down
    # into the bust. Anchor the center opening primarily to the neck and
    # use the shoulder landmark only to guarantee enough strap height.
    center_top = max(
        style["top_center"] + 0.070,
        neck - 0.105,
    )
    shoulder_top = max(
        center_top + 0.038,
        shoulder + 0.014,
    )

    # Chest pieces should finish around the upper hip, not continue down
    # into a bodysuit/crotch silhouette.
    hem = max(
        style["length"] + 0.030,
        pelvis + 0.022,
    )
    hem = min(
        hem,
        center_top - 0.155,
    )

    return (
        hem,
        center_top,
        shoulder_top,
    )


def normalized_signed_width(
    point,
    frame,
):
    (
        _v,
        dw,
        _dd,
        _width_n,
        _depth_n,
    ) = normalized_components(
        point,
        frame,
    )
    half_width = max(
        frame["torso_width"] * 0.5,
        1e-5,
    )
    return dw / half_width


def front_component(
    point,
    frame,
):
    (
        _v,
        _dw,
        _dd,
        _width_n,
        depth_n,
    ) = normalized_components(
        point,
        frame,
    )
    return (
        depth_n
        * frame["front_sign"]
    )


def any_predicate(*predicates):
    def keep(point):
        return any(
            predicate(point)
            for predicate
            in predicates
        )
    return keep


def tunic_predicate(frame, style):
    (
        lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )

        shoulder_t = smoothstep(
            0.16,
            0.88,
            width_n,
        )
        top = (
            center_top
            + (
                shoulder_top
                - center_top
            )
            * shoulder_t
        )

        # Broader body coverage than the earlier harness-like cut. The
        # upper taper is reserved for the armhole region only.
        upper_t = smoothstep(
            center_top - 0.070,
            shoulder_top,
            v,
        )
        width_limit = (
            0.985
            - 0.115 * upper_t
        )

        hem_t = (
            1.0
            - smoothstep(
                lower,
                lower + 0.075,
                v,
            )
        )
        width_limit += (
            style["waist_flare"]
            * 2.8
            * hem_t
        )

        return (
            v >= lower
            and v <= top
            and width_n <= width_limit
        )

    return keep


def vest_predicate(frame, style):
    (
        lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )
    lower += 0.055

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        shoulder_t = smoothstep(
            0.22,
            0.82,
            width_n,
        )
        top = (
            center_top
            - 0.018
            + (
                shoulder_top
                - center_top
            )
            * shoulder_t
        )
        return (
            v >= lower
            and v <= top
            and width_n <= 0.82
        )

    return keep


def ranger_front_panels_predicate(
    frame,
    style,
):
    (
        lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        w = normalized_signed_width(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        shoulder_t = smoothstep(
            0.24,
            0.80,
            width_n,
        )
        top = (
            center_top
            - 0.020
            + (
                shoulder_top
                - center_top
            )
            * shoulder_t
        )
        opening = (
            0.175
            + 0.055
            * smoothstep(
                center_top - 0.060,
                shoulder_top,
                v,
            )
        )
        outer = (
            0.755
            - 0.045
            * smoothstep(
                center_top - 0.025,
                shoulder_top,
                v,
            )
        )
        return (
            front >= 0.08
            and lower + 0.060 <= v <= top
            and opening <= abs(w) <= outer
        )

    return keep


def ranger_back_panel_predicate(
    frame,
    style,
):
    (
        lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        top = (
            center_top
            + 0.020
            + (
                shoulder_top
                - center_top
            )
            * smoothstep(
                0.35,
                0.78,
                width_n,
            )
        )
        return (
            front <= -0.10
            and lower + 0.078 <= v <= top
            and width_n <= 0.735
        )

    return keep


def ranger_side_panels_predicate(
    frame,
    style,
):
    (
        lower,
        center_top,
        _shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        return (
            lower + 0.075 <= v <= center_top - 0.018
            and 0.735 <= width_n <= 0.915
            and -0.82 <= front <= 0.82
        )

    return keep


def ranger_shoulder_predicate(
    frame,
    style,
):
    (
        _lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        return (
            center_top - 0.014 <= v <= shoulder_top + 0.008
            and 0.575 <= width_n <= 0.855
            and -0.82 <= front <= 0.82
        )

    return keep


def ranger_diagonal_strap_predicate(
    frame,
    style,
):
    (
        lower,
        _center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )
    start_v = lower + 0.105
    end_v = shoulder_top - 0.012
    span = max(
        end_v - start_v,
        0.05,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        if not (
            front >= 0.16
            and start_v <= v <= end_v
            and width_n <= 0.86
        ):
            return False

        t = (
            v - start_v
        ) / span
        target_w = (
            -0.57
            + 1.14 * t
        )
        w = normalized_signed_width(
            point,
            frame,
        )
        return abs(
            w - target_w
        ) <= 0.105

    return keep


def belt_predicate(frame, style):
    lower, _, _ = chest_landmark_fractions(
        frame,
        style,
    )
    center_v = lower + 0.047

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        return (
            center_v - 0.014 <= v <= center_v + 0.018
            and width_n <= 1.01
        )

    return keep


def ranger_buckle_predicate(
    frame,
    style,
):
    lower, _, _ = chest_landmark_fractions(
        frame,
        style,
    )
    center_v = lower + 0.049

    def keep(point):
        (
            v,
            _dw,
            _dd,
            _width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        w = normalized_signed_width(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        return (
            front >= 0.28
            and abs(w) <= 0.145
            and center_v - 0.020 <= v <= center_v + 0.024
        )

    return keep


def ranger_belt_keepers_predicate(
    frame,
    style,
):
    lower, _, _ = chest_landmark_fractions(
        frame,
        style,
    )
    center_v = lower + 0.049

    def keep(point):
        (
            v,
            _dw,
            _dd,
            _width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        w = normalized_signed_width(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )
        keeper = min(
            abs(w - 0.43),
            abs(w + 0.43),
        )
        return (
            front >= 0.08
            and keeper <= 0.035
            and center_v - 0.032 <= v <= center_v + 0.034
        )

    return keep


def hem_trim_predicate(frame, style):
    lower, _, _ = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        return (
            lower <= v <= lower + 0.014
            and width_n <= 0.98
        )

    return keep


def neckline_trim_predicate(frame, style):
    (
        _lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        shoulder_t = smoothstep(
            0.16,
            0.88,
            width_n,
        )
        top = (
            center_top
            + (
                shoulder_top
                - center_top
            )
            * shoulder_t
        )
        return (
            top - 0.012 <= v <= top + 0.006
            and width_n <= 0.90
        )

    return keep


def armhole_trim_predicate(frame, style):
    (
        _lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        upper_t = smoothstep(
            center_top - 0.070,
            shoulder_top,
            v,
        )
        edge = (
            0.985
            - 0.115 * upper_t
        )
        return (
            center_top - 0.075 <= v <= shoulder_top + 0.004
            and edge - 0.040 <= width_n <= edge + 0.012
        )

    return keep


def ranger_panel_trim_predicate(
    frame,
    style,
):
    (
        lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            _depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        w = normalized_signed_width(
            point,
            frame,
        )
        front = front_component(
            point,
            frame,
        )

        front_outer = (
            front >= 0.10
            and lower + 0.070 <= v <= center_top + 0.020
            and 0.745 <= width_n <= 0.790
        )
        front_opening = (
            front >= 0.10
            and lower + 0.085 <= v <= center_top - 0.005
            and 0.085 <= abs(w) <= 0.125
        )
        back_spine = (
            front <= -0.12
            and lower + 0.105 <= v <= shoulder_top - 0.020
            and abs(w) <= 0.030
        )
        return (
            front_outer
            or front_opening
            or back_spine
        )

    return keep


def tabard_predicate(frame, style):
    hem, _, _ = chest_landmark_fractions(
        frame,
        style,
    )
    lower = hem - 0.015
    upper = hem + 0.060
    front_sign = frame["front_sign"]

    def keep(point):
        (
            v,
            _dw,
            _dd,
            width_n,
            depth_n,
        ) = normalized_components(
            point,
            frame,
        )
        front = (
            depth_n
            * front_sign
        )
        return (
            lower <= v <= upper
            and width_n <= 0.30
            and front >= 0.30
        )

    return keep



def profile_sample(points, t):
    t = max(0.0, min(1.0, t))
    if t <= points[0][0]:
        return points[0][1]
    for index in range(1, len(points)):
        left_t, left_value = points[index - 1]
        right_t, right_value = points[index]
        if t <= right_t:
            span = max(right_t - left_t, 1e-6)
            blend = (t - left_t) / span
            return (
                left_value * (1.0 - blend)
                + right_value * blend
            )
    return points[-1][1]


def ranger_profile(
    frame,
    style,
    v,
):
    (
        lower,
        center_top,
        _shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )
    span = max(
        center_top - lower,
        0.10,
    )
    t = max(
        0.0,
        min(
            1.0,
            (v - lower) / span,
        ),
    )

    height = frame["height"]
    half_width = max(
        frame["torso_width"] * 0.5,
        height * 0.125,
    )
    half_depth = max(
        frame["torso_depth"] * 0.5,
        height * 0.070,
    )

    width_scale = profile_sample(
        (
            (0.00, 0.91),
            (0.20, 0.86),
            (0.42, 0.83),
            (0.66, 0.92),
            (0.86, 1.00),
            (1.00, 0.93),
        ),
        t,
    )
    front_scale = profile_sample(
        (
            (0.00, 0.87),
            (0.22, 0.83),
            (0.48, 0.96),
            (0.72, 1.08),
            (0.88, 1.12),
            (1.00, 0.94),
        ),
        t,
    )
    back_scale = profile_sample(
        (
            (0.00, 0.87),
            (0.30, 0.84),
            (0.62, 0.91),
            (0.84, 0.94),
            (1.00, 0.90),
        ),
        t,
    )

    return (
        half_width * width_scale,
        half_depth * front_scale,
        half_depth * back_scale,
    )


def frame_world_point(
    frame,
    v,
    width_offset,
    signed_depth,
):
    point = frame["center"].copy()
    point[
        frame["width"]
    ] += width_offset
    point[
        frame["depth"]
    ] += (
        signed_depth
        * frame["front_sign"]
    )
    point[
        frame["vertical"]
    ] = (
        frame["vertical_min"]
        + v * frame["height"]
    ) * frame["vertical_sign"]
    return point


def angular_distance(a, b):
    return abs(
        math.atan2(
            math.sin(a - b),
            math.cos(a - b),
        )
    )


def build_ranger_surface_samples(
    body,
    frame,
    torso_indices,
    style,
):
    source_world = (
        body.matrix_world.copy()
    )
    (
        lower,
        _center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    samples = []
    width_axis = frame["width"]
    depth_axis = frame["depth"]
    vertical_axis = frame["vertical"]
    center = frame["center"]
    height = frame["height"]
    front_sign = frame["front_sign"]

    for vertex in body.data.vertices:
        if vertex.index not in torso_indices:
            continue

        point = (
            source_world
            @ vertex.co
        )
        signed_vertical = (
            point[vertical_axis]
            * frame["vertical_sign"]
        )
        v = (
            signed_vertical
            - frame["vertical_min"]
        ) / height
        if not (
            lower - 0.045
            <= v
            <= shoulder_top + 0.040
        ):
            continue

        width_offset = (
            point[width_axis]
            - center[width_axis]
        )
        signed_depth = (
            point[depth_axis]
            - center[depth_axis]
        ) * front_sign

        radius = math.sqrt(
            width_offset * width_offset
            + signed_depth * signed_depth
        )
        if radius <= height * 0.018:
            continue

        angle = math.atan2(
            signed_depth,
            width_offset,
        )

        # Distal limb points can share torso-ish skin weights around the
        # shoulder. A strict radius cap removes them while retaining the
        # true chest/waist silhouette.
        if radius > height * 0.235:
            continue

        samples.append((
            v,
            angle,
            radius,
        ))

    print(
        "FORGE_RANGER_ENVELOPE_SAMPLES "
        + str(len(samples)),
        flush=True,
    )

    return samples


def sample_ranger_radius(
    surface_samples,
    frame,
    style,
    v,
    angle,
):
    height = frame["height"]
    candidates = []

    for sample_v, sample_angle, radius in surface_samples:
        dv = abs(sample_v - v)
        if dv > 0.046:
            continue

        da = angular_distance(
            sample_angle,
            angle,
        )
        if da > 0.26:
            continue

        weight = (
            (1.0 - dv / 0.046)
            * (
                1.0
                - da / 0.26
            )
        )
        if weight <= 0.0:
            continue

        candidates.append((
            radius,
            weight,
        ))

    if candidates:
        candidates.sort(
            key=lambda entry: entry[0],
        )
        # Use an upper-middle quantile rather than the maximum. This wraps
        # the body reliably without tracing nipples, scapula edges or an
        # occasional shoulder/arm outlier.
        target_index = int(
            round(
                (len(candidates) - 1)
                * 0.72
            )
        )
        measured = candidates[
            max(
                0,
                min(
                    len(candidates) - 1,
                    target_index,
                ),
            )
        ][0]

        # Blend neighboring angular sectors and vertical levels to create
        # a garment envelope rather than a scan-like anatomical copy.
        neighbor_values = [
            entry[0]
            for entry
            in candidates
            if abs(
                entry[0] - measured
            ) <= height * 0.035
        ]
        if neighbor_values:
            measured = sum(
                neighbor_values
            ) / len(
                neighbor_values
            )

        return measured

    width_radius, front_depth, back_depth = (
        ranger_profile(
            frame,
            style,
            v,
        )
    )
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    depth_radius = (
        front_depth
        if sin_a >= 0.0
        else back_depth
    )
    denominator = math.sqrt(
        (
            cos_a
            / max(width_radius, 1e-5)
        ) ** 2
        + (
            sin_a
            / max(depth_radius, 1e-5)
        ) ** 2
    )
    return (
        1.0 / max(
            denominator,
            1e-5,
        )
    )


def ranger_angle_point(
    frame,
    style,
    surface_samples,
    v,
    angle,
    radial_offset=0.0,
):
    radius = sample_ranger_radius(
        surface_samples,
        frame,
        style,
        v,
        angle,
    )

    # Smooth body-following clearance. The waist gets a little less ease,
    # the upper chest a little more, which avoids the barrel silhouette.
    (
        lower,
        center_top,
        _shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )
    torso_t = max(
        0.0,
        min(
            1.0,
            (
                v - lower
            )
            / max(
                center_top - lower,
                0.10,
            ),
        ),
    )
    ease = (
        frame["height"]
        * (
            0.0035
            + 0.0015
            * smoothstep(
                0.58,
                0.92,
                torso_t,
            )
        )
    )

    radius += (
        radial_offset
        + ease
    )

    return frame_world_point(
        frame,
        v,
        math.cos(angle) * radius,
        math.sin(angle) * radius,
    )


def ranger_surface_point(
    frame,
    style,
    surface_samples,
    v,
    width_n,
    side,
    radial_offset=0.0,
):
    width_n = max(
        -0.94,
        min(
            0.94,
            width_n,
        ),
    )
    angle = math.acos(
        width_n,
    )
    if side == "back":
        angle = -angle

    return ranger_angle_point(
        frame,
        style,
        surface_samples,
        v,
        angle,
        radial_offset,
    )


def transfer_nearest_body_weights(
    body,
    obj,
):
    source_world = (
        body.matrix_world.copy()
    )
    tree = KDTree(
        len(body.data.vertices),
    )
    for vertex in body.data.vertices:
        tree.insert(
            source_world
            @ vertex.co,
            vertex.index,
        )
    tree.balance()

    destination_groups = {}
    for source_group in body.vertex_groups:
        destination_groups[
            source_group.index
        ] = obj.vertex_groups.new(
            name=source_group.name,
        )

    object_world = (
        obj.matrix_world.copy()
    )
    for vertex in obj.data.vertices:
        (
            _position,
            source_index,
            _distance,
        ) = tree.find(
            object_world
            @ vertex.co,
        )
        source_vertex = (
            body.data.vertices[
                source_index
            ]
        )
        for assignment in source_vertex.groups:
            group = (
                destination_groups.get(
                    assignment.group,
                )
            )
            if group is not None:
                group.add(
                    [vertex.index],
                    assignment.weight,
                    "REPLACE",
                )


def create_authored_mesh(
    body,
    rig,
    name,
    mat,
    vertices,
    faces,
    thickness,
):
    if (
        len(vertices) < 3
        or not faces
    ):
        return None

    mesh = bpy.data.meshes.new(
        name + "_Mesh",
    )
    mesh.from_pydata(
        [
            tuple(point)
            for point
            in vertices
        ],
        [],
        faces,
    )
    mesh.update()

    obj = bpy.data.objects.new(
        name,
        mesh,
    )
    collection = (
        body.users_collection[0]
        if body.users_collection
        else bpy.context.scene.collection
    )
    collection.objects.link(obj)
    obj.data.materials.append(mat)

    transfer_nearest_body_weights(
        body,
        obj,
    )

    if thickness > 0:
        solidify = obj.modifiers.new(
            "FORGE_Thickness",
            "SOLIDIFY",
        )
        solidify.thickness = thickness
        solidify.offset = 0.35
        solidify.use_rim = True
        solidify.use_quality_normals = True
        apply_modifier(
            obj,
            solidify,
        )

    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    ensure_armature(
        obj,
        rig,
    )
    return obj


def ranger_top_fraction(
    frame,
    style,
    angle,
):
    (
        _lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    side_n = abs(
        math.cos(angle)
    )
    front_n = max(
        0.0,
        math.sin(angle),
    )
    back_n = max(
        0.0,
        -math.sin(angle),
    )

    # Narrow shoulder straps with a lower front scoop and slightly higher
    # back collar. At the exact side, dip into a clean armhole instead of
    # wrapping a rectangular tube up into the armpit.
    shoulder_band = (
        smoothstep(
            0.30,
            0.72,
            side_n,
        )
        * (
            1.0
            - smoothstep(
                0.86,
                1.0,
                side_n,
            )
        )
    )
    armhole_dip = (
        0.030
        * smoothstep(
            0.82,
            1.0,
            side_n,
        )
    )

    return (
        center_top
        + (
            shoulder_top
            - center_top
        ) * shoulder_band
        + 0.018 * back_n
        - 0.010 * front_n
        - armhole_dip
    )


def build_ranger_shell_mesh(
    frame,
    style,
    surface_samples,
    radial_offset,
    segments=48,
):
    (
        lower,
        center_top,
        _shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    ring_v = [
        lower,
        lower + 0.036,
        lower + 0.075,
        lower + 0.118,
        lower + 0.158,
        center_top - 0.075,
        center_top - 0.038,
        center_top - 0.014,
    ]

    vertices = []
    rings = []

    for v in ring_v:
        ring = []
        for segment in range(
            segments
        ):
            angle = (
                2.0
                * math.pi
                * segment
                / segments
            )
            ring.append(
                len(vertices)
            )
            vertices.append(
                ranger_angle_point(
                    frame,
                    style,
                    surface_samples,
                    v,
                    angle,
                    radial_offset,
                )
            )
        rings.append(ring)

    top_ring = []
    for segment in range(
        segments
    ):
        angle = (
            2.0
            * math.pi
            * segment
            / segments
        )
        v = ranger_top_fraction(
            frame,
            style,
            angle,
        )
        top_ring.append(
            len(vertices)
        )
        vertices.append(
            ranger_angle_point(
                frame,
                style,
                surface_samples,
                v,
                angle,
                radial_offset,
            )
        )
    rings.append(top_ring)

    faces = []
    for ring_index in range(
        len(rings) - 1
    ):
        current = rings[
            ring_index
        ]
        next_ring = rings[
            ring_index + 1
        ]
        for segment in range(
            segments
        ):
            following = (
                segment + 1
            ) % segments
            faces.append((
                current[segment],
                current[following],
                next_ring[following],
                next_ring[segment],
            ))

    return (
        vertices,
        faces,
    )


def build_surface_patch(
    frame,
    style,
    surface_samples,
    side,
    rows,
    columns,
    radial_offset,
    top_values=None,
):
    vertices = []
    faces = []
    column_count = len(columns)

    for row_index, v in enumerate(
        rows
    ):
        for column_index, width_n in enumerate(
            columns
        ):
            point_v = v
            if (
                top_values is not None
                and row_index
                == len(rows) - 1
            ):
                point_v = top_values[
                    column_index
                ]
            vertices.append(
                ranger_surface_point(
                    frame,
                    style,
                    surface_samples,
                    point_v,
                    width_n,
                    side,
                    radial_offset,
                )
            )

    for row in range(
        len(rows) - 1
    ):
        for column in range(
            column_count - 1
        ):
            a = (
                row * column_count
                + column
            )
            b = a + 1
            c = (
                (row + 1)
                * column_count
                + column
                + 1
            )
            d = c - 1
            # Curved body patches produce non-planar quads. Explicit
            # triangles avoid Blender choosing a bow-tie diagonal that
            # opens visible holes across the chest/back panels.
            faces.append((
                a,
                b,
                c,
            ))
            faces.append((
                a,
                c,
                d,
            ))

    return (
        vertices,
        faces,
    )


def build_ranger_ring_strip(
    frame,
    style,
    surface_samples,
    v_low,
    v_high,
    radial_offset,
    segments=48,
):
    vertices = []
    faces = []

    for v in [
        v_low,
        v_high,
    ]:
        for segment in range(
            segments
        ):
            angle = (
                2.0
                * math.pi
                * segment
                / segments
            )
            vertices.append(
                ranger_angle_point(
                    frame,
                    style,
                    surface_samples,
                    v,
                    angle,
                    radial_offset,
                )
            )

    for segment in range(
        segments
    ):
        following = (
            segment + 1
        ) % segments
        faces.append((
            segment,
            following,
            segments + following,
            segments + segment,
        ))

    return (
        vertices,
        faces,
    )


def build_ranger_top_trim(
    frame,
    style,
    surface_samples,
    radial_offset,
    segments=48,
):
    vertices = []
    faces = []

    for row in range(2):
        for segment in range(
            segments
        ):
            angle = (
                2.0
                * math.pi
                * segment
                / segments
            )
            top_v = ranger_top_fraction(
                frame,
                style,
                angle,
            )
            v = (
                top_v
                - row * 0.006
            )
            vertices.append(
                ranger_angle_point(
                    frame,
                    style,
                    surface_samples,
                    v,
                    angle,
                    radial_offset,
                )
            )

    for segment in range(
        segments
    ):
        following = (
            segment + 1
        ) % segments
        faces.append((
            segment,
            following,
            segments + following,
            segments + segment,
        ))

    return (
        vertices,
        faces,
    )


def build_ranger_cross_strap(
    frame,
    style,
    surface_samples,
    radial_offset,
):
    (
        lower,
        _center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )
    vertices = []
    faces = []
    samples = 22

    for sample in range(
        samples
    ):
        t = (
            sample
            / (
                samples - 1
            )
        )
        v = (
            lower + 0.075
            + t
            * (
                shoulder_top
                - lower
                - 0.100
            )
        )
        center_w = (
            -0.53
            + 1.06 * t
        )
        strap_half = (
            0.035
            + 0.004
            * math.sin(
                math.pi * t
            )
        )

        for offset in [
            -strap_half,
            strap_half,
        ]:
            vertices.append(
                ranger_surface_point(
                    frame,
                    style,
                    surface_samples,
                    v,
                    center_w + offset,
                    "front",
                    radial_offset,
                )
            )

    for sample in range(
        samples - 1
    ):
        a = sample * 2
        faces.append((
            a,
            a + 1,
            a + 3,
            a + 2,
        ))

    return (
        vertices,
        faces,
    )


def create_ranger_authored_chest(
    body,
    rig,
    frame,
    style,
    torso_indices,
    cloth,
    leather,
    trim,
    metal,
):
    height = frame["height"]
    (
        lower,
        center_top,
        shoulder_top,
    ) = chest_landmark_fractions(
        frame,
        style,
    )

    surface_samples = (
        build_ranger_surface_samples(
            body,
            frame,
            torso_indices,
            style,
        )
    )

    objects = []

    shell_vertices, shell_faces = (
        build_ranger_shell_mesh(
            frame,
            style,
            surface_samples,
            height * 0.0010,
        )
    )
    shell = create_authored_mesh(
        body,
        rig,
        "FORGE_Chest_RangerClothShell",
        cloth,
        shell_vertices,
        shell_faces,
        height * 0.00135,
    )
    if shell:
        objects.append(shell)

    # Layered front leather panels leave the cloth visible at center and
    # sides. Their upper outer corners rise toward the shoulder straps.
    for side_sign, side_name in [
        (-1.0, "L"),
        (1.0, "R"),
    ]:
        columns = [
            side_sign * 0.20,
            side_sign * 0.40,
            side_sign * 0.62,
        ]
        if side_sign < 0:
            columns = list(
                reversed(columns)
            )

        rows = [
            lower + 0.055,
            lower + 0.095,
            lower + 0.135,
            lower + 0.172,
            center_top - 0.045,
            center_top - 0.006,
        ]

        panel_vertices, panel_faces = (
            build_surface_patch(
                frame,
                style,
                surface_samples,
                "front",
                rows,
                columns,
                height * 0.0055,
            )
        )
        panel = create_authored_mesh(
            body,
            rig,
            "FORGE_Chest_RangerFrontPanel_"
            + side_name,
            leather,
            panel_vertices,
            panel_faces,
            height * 0.00140,
        )
        if panel:
            objects.append(panel)

    # Split back construction avoids the previous giant rectangular plate.
    for side_sign, side_name in [
        (-1.0, "L"),
        (1.0, "R"),
    ]:
        columns = [
            side_sign * 0.10,
            side_sign * 0.34,
            side_sign * 0.62,
        ]
        if side_sign < 0:
            columns = list(
                reversed(columns)
            )

        back_vertices, back_faces = (
            build_surface_patch(
                frame,
                style,
                surface_samples,
                "back",
                [
                    lower + 0.060,
                    lower + 0.105,
                    lower + 0.150,
                    center_top - 0.050,
                    center_top - 0.012,
                ],
                columns,
                height * 0.0050,
            )
        )
        back_panel = create_authored_mesh(
            body,
            rig,
            "FORGE_Chest_RangerBackPanel_"
            + side_name,
            leather,
            back_vertices,
            back_faces,
            height * 0.00135,
        )
        if back_panel:
            objects.append(
                back_panel,
            )

    strap_vertices, strap_faces = (
        build_ranger_cross_strap(
            frame,
            style,
            surface_samples,
            height * 0.0070,
        )
    )
    strap = create_authored_mesh(
        body,
        rig,
        "FORGE_Chest_RangerCrossStrap",
        leather,
        strap_vertices,
        strap_faces,
        height * 0.00135,
    )
    if strap:
        objects.append(strap)

    belt_center = (
        lower + 0.026
    )
    belt_vertices, belt_faces = (
        build_ranger_ring_strip(
            frame,
            style,
            surface_samples,
            belt_center - 0.011,
            belt_center + 0.012,
            height * 0.0055,
        )
    )
    belt = create_authored_mesh(
        body,
        rig,
        "FORGE_Chest_RangerBelt",
        leather,
        belt_vertices,
        belt_faces,
        height * 0.00145,
    )
    if belt:
        objects.append(belt)

    top_trim_vertices, top_trim_faces = (
        build_ranger_top_trim(
            frame,
            style,
            surface_samples,
            height * 0.0033,
        )
    )
    top_trim = create_authored_mesh(
        body,
        rig,
        "FORGE_Chest_RangerNeckArmTrim",
        trim,
        top_trim_vertices,
        top_trim_faces,
        height * 0.00072,
    )
    if top_trim:
        objects.append(top_trim)

    hem_vertices, hem_faces = (
        build_ranger_ring_strip(
            frame,
            style,
            surface_samples,
            lower,
            lower + 0.006,
            height * 0.0028,
        )
    )
    hem = create_authored_mesh(
        body,
        rig,
        "FORGE_Chest_RangerHemTrim",
        trim,
        hem_vertices,
        hem_faces,
        height * 0.00070,
    )
    if hem:
        objects.append(hem)

    buckle_vertices, buckle_faces = (
        build_surface_patch(
            frame,
            style,
            surface_samples,
            "front",
            [
                belt_center - 0.020,
                belt_center + 0.021,
            ],
            [
                -0.090,
                0.090,
            ],
            height * 0.0110,
        )
    )
    buckle = create_authored_mesh(
        body,
        rig,
        "FORGE_Chest_RangerBuckle",
        metal,
        buckle_vertices,
        buckle_faces,
        height * 0.00185,
    )
    if buckle:
        objects.append(buckle)

    for side_sign, side_name in [
        (-1.0, "L"),
        (1.0, "R"),
    ]:
        keeper_center = (
            side_sign * 0.40
        )
        keeper_vertices, keeper_faces = (
            build_surface_patch(
                frame,
                style,
                surface_samples,
                "front",
                [
                    belt_center - 0.020,
                    belt_center + 0.022,
                ],
                [
                    keeper_center - 0.026,
                    keeper_center + 0.026,
                ],
                height * 0.0090,
            )
        )
        keeper = create_authored_mesh(
            body,
            rig,
            "FORGE_Chest_RangerBeltKeeper_"
            + side_name,
            trim,
            keeper_vertices,
            keeper_faces,
            height * 0.00120,
        )
        if keeper:
            objects.append(keeper)

    if not objects:
        raise RuntimeError(
            "Authored Ranger chest generation produced no geometry."
        )

    print(
        "FORGE_RANGER_AUTHORED "
        + json.dumps({
            "objects": [
                obj.name
                for obj
                in objects
            ],
            "vertices": sum(
                len(obj.data.vertices)
                for obj
                in objects
            ),
            "polygons": sum(
                len(obj.data.polygons)
                for obj
                in objects
            ),
            "surfaceSamples": len(
                surface_samples,
            ),
        }),
        flush=True,
    )

    return objects


def create_chest(body, rig, frame, style, seed):
    style = dict(style)
    variant = int(seed) % 4

    # Keep variations subtle. Variation 01 (seed 0) is the reference look.
    style["length"] += [
        0.0,
        -0.006,
        0.006,
        -0.002,
    ][variant]
    style["top_center"] += [
        0.0,
        0.004,
        -0.003,
        0.002,
    ][variant]
    style["waist_flare"] += [
        0.0,
        0.003,
        -0.002,
        0.001,
    ][variant]

    torso_indices = build_torso_vertex_mask(
        body,
        frame,
    )
    refine_frame_from_torso_mask(
        body,
        frame,
        torso_indices,
    )

    height = frame["height"]
    clearance = height * 0.0046
    cloth_thickness = height * 0.00185
    overlay_thickness = height * 0.00150

    cloth = material(
        "FORGE_Ranger_Cloth",
        style["cloth"],
        roughness=0.84,
    )
    leather = material(
        "FORGE_Ranger_Leather",
        style["leather"],
        roughness=0.64,
    )
    trim = material(
        "FORGE_Ranger_Trim",
        style["trim"],
        roughness=0.58,
    )
    accent = material(
        "FORGE_Ranger_Accent",
        style["accent"],
        roughness=0.74,
    )
    metal = material(
        "FORGE_Ranger_Metal",
        style["metal"],
        roughness=0.34,
        metallic=0.72,
    )

    is_ranger = (
        style["name"]
        == "Ranger Field Vest"
    )

    if is_ranger:
        return create_ranger_authored_chest(
            body,
            rig,
            frame,
            style,
            torso_indices,
            cloth,
            leather,
            trim,
            metal,
        )

    objects = []
    ranger_surface_indices = (
        torso_indices
    )

    base = duplicate_surface(
        body,
        rig,
        "FORGE_Chest_ClothUnderlayer",
        cloth,
        tunic_predicate(
            frame,
            style,
        ),
        clearance,
        cloth_thickness,
        smooth_iterations=3,
        allowed_indices=ranger_surface_indices,
    )
    if base:
        objects.append(base)

    if False:
        main_leather = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_RangerLeatherPanels",
            leather,
            any_predicate(
                ranger_front_panels_predicate(
                    frame,
                    style,
                ),
                ranger_back_panel_predicate(
                    frame,
                    style,
                ),
                ranger_side_panels_predicate(
                    frame,
                    style,
                ),
            ),
            clearance + height * 0.0042,
            overlay_thickness,
            smooth_iterations=5,
            allowed_indices=ranger_surface_indices,
        )
        if main_leather:
            objects.append(
                main_leather,
            )

        shoulders = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_RangerShoulderReinforcement",
            leather,
            ranger_shoulder_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0058,
            overlay_thickness * 1.06,
            smooth_iterations=3,
            allowed_indices=ranger_surface_indices,
        )
        if shoulders:
            objects.append(
                shoulders,
            )

        strap = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_RangerCrossStrap",
            leather,
            ranger_diagonal_strap_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0072,
            overlay_thickness * 1.12,
            smooth_iterations=0,
            allowed_indices=ranger_surface_indices,
        )
        if strap:
            objects.append(
                strap,
            )

        trims = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_RangerTrimsAndSeams",
            trim,
            any_predicate(
                neckline_trim_predicate(
                    frame,
                    style,
                ),
                armhole_trim_predicate(
                    frame,
                    style,
                ),
                hem_trim_predicate(
                    frame,
                    style,
                ),
                ranger_panel_trim_predicate(
                    frame,
                    style,
                ),
            ),
            clearance + height * 0.0064,
            overlay_thickness * 0.72,
            smooth_iterations=0,
            allowed_indices=ranger_surface_indices,
        )
        if trims:
            objects.append(
                trims,
            )
    elif style["vest"]:
        vest = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_LeatherVest",
            leather,
            vest_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0045,
            overlay_thickness,
            smooth_iterations=1,
            allowed_indices=torso_indices,
        )
        if vest:
            objects.append(vest)

        neck = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_NeckTrim",
            trim,
            neckline_trim_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0041,
            overlay_thickness * 0.82,
            smooth_iterations=0,
            allowed_indices=torso_indices,
        )
        if neck:
            objects.append(neck)

        hem = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_HemTrim",
            trim,
            hem_trim_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0040,
            overlay_thickness * 0.85,
            smooth_iterations=0,
            allowed_indices=torso_indices,
        )
        if hem:
            objects.append(hem)

    belt = duplicate_surface(
        body,
        rig,
        "FORGE_Chest_Belt",
        leather,
        belt_predicate(
            frame,
            style,
        ),
        clearance + height * 0.0074,
        overlay_thickness * 1.22,
        smooth_iterations=0,
        allowed_indices=ranger_surface_indices,
    )
    if belt:
        objects.append(belt)

    if is_ranger:
        buckle = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_RangerBuckle",
            metal,
            ranger_buckle_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0094,
            overlay_thickness * 1.08,
            smooth_iterations=0,
            allowed_indices=ranger_surface_indices,
        )
        if buckle:
            objects.append(
                buckle,
            )

        keepers = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_RangerBeltKeepers",
            trim,
            ranger_belt_keepers_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0085,
            overlay_thickness * 0.88,
            smooth_iterations=0,
            allowed_indices=ranger_surface_indices,
        )
        if keepers:
            objects.append(
                keepers,
            )

    if style["tabard"]:
        tabard = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_FrontTabard",
            accent,
            tabard_predicate(
                frame,
                style,
            ),
            clearance + height * 0.0060,
            overlay_thickness,
            smooth_iterations=1,
            allowed_indices=torso_indices,
        )
        if tabard:
            objects.append(tabard)

    if not objects:
        raise RuntimeError(
            "Procedural chest generation produced no geometry."
        )

    return objects


def export_glb(
    path,
    objects,
    rig,
    body=None,
):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if body is not None:
        body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_skins=True,
        export_animations=False,
        export_materials="EXPORT",
    )


def main():
    config = parse_args()
    clear_scene()

    mannequin = import_glb(config.mannequin)
    body = primary_body(mannequin)
    rig = find_armature(mannequin)
    if rig is None:
        raise RuntimeError("The Skillbound mannequin has no armature.")

    if config.slot != "chest":
        raise RuntimeError(
            "The procedural Equipment Lab proof currently supports Chest. "
            "Other equipment slots will use the same generator after the chest template passes QA."
        )

    style = STYLES.get(config.style, STYLES["ranger"])
    frame = body_frame(
        body,
        rig,
    )

    print("FORGE_STAGE template", flush=True)
    generated = create_chest(
        body,
        rig,
        frame,
        style,
        config.seed,
    )

    print("FORGE_STAGE skin", flush=True)
    for obj in generated:
        ensure_armature(obj, rig)

    print("FORGE_STAGE export", flush=True)
    export_glb(
        config.output,
        generated,
        rig,
        body=(
            body
            if config.include_body
            else None
        ),
    )

    polygons = sum(len(obj.data.polygons) for obj in generated)
    vertices = sum(len(obj.data.vertices) for obj in generated)

    metadata = {
        "format": "forge-procedural-equipment",
        "version": 1,
        "body": config.body,
        "slot": config.slot,
        "style": config.style,
        "styleName": style["name"],
        "seed": config.seed,
        "objects": [obj.name for obj in generated],
        "vertices": vertices,
        "polygons": polygons,
        "bodyMask": ["CHEST", "BACK", "SHOULDER_L", "SHOULDER_R"],
        "armature": rig.name,
        "bodyMesh": body.name,
        "generator": "blender-body-aware-v2",
        "qaIncludesBody": bool(
            config.include_body,
        ),
    }

    with open(config.output + ".json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print("FORGE_PROCEDURAL_RESULT " + json.dumps(metadata), flush=True)


if __name__ == "__main__":
    main()
