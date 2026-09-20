import argparse
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector


STYLES = {
    "ranger": {
        "name": "Ranger Field Vest",
        "cloth": "#314b36",
        "leather": "#3b281d",
        "trim": "#6a4a2c",
        "accent": "#6a2430",
        "metal": "#778087",
        "length": 0.485,
        "top_center": 0.720,
        "top_shoulder": 0.792,
        "waist_flare": 0.010,
        "vest": True,
        "tabard": True,
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
    "neck",
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

    keep = set()
    torso_weights = []

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

        # Require the vertex to be genuinely torso-driven. This cuts out
        # arms/hands/legs even when they share the same height band.
        if (
            torso_score >= 0.28
            and torso_score
            >= limb_score * 1.10
        ):
            keep.add(vertex.index)
            torso_weights.append(
                torso_score,
            )

    if len(keep) < 400:
        # Safe fallback for unexpected rig naming: keep a strict central
        # spatial torso region rather than reintroducing the full T-pose.
        source_world = (
            body.matrix_world.copy()
        )
        for vertex in body.data.vertices:
            point = (
                source_world
                @ vertex.co
            )
            signed_v = (
                point[
                    frame["vertical"]
                ]
                * frame[
                    "vertical_sign"
                ]
            )
            v = (
                signed_v
                - frame["vertical_min"]
            ) / frame["height"]
            width_distance = abs(
                point[frame["width"]]
                - frame["center"][
                    frame["width"]
                ]
            )
            if (
                0.43 <= v <= 0.82
                and width_distance
                <= frame["height"]
                * 0.18
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
        frame["height"] * 0.16,
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

    displace = obj.modifiers.new("FORGE_Clearance", "DISPLACE")
    displace.direction = "NORMAL"
    displace.mid_level = 0.0
    displace.strength = clearance
    apply_modifier(obj, displace)

    if smooth_iterations > 0:
        smooth = obj.modifiers.new("FORGE_SurfaceSmooth", "SMOOTH")
        smooth.factor = 0.22
        smooth.iterations = smooth_iterations
        try:
            smooth.use_x = True
            smooth.use_y = True
            smooth.use_z = True
        except Exception:
            pass
        apply_modifier(obj, smooth)

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
        style["top_center"]
        + 0.08,
    )
    pelvis = frame_fraction(
        frame,
        frame.get("pelvis_v"),
        style["length"]
        + 0.06,
    )

    # A sleeveless tunic neckline should sit below the neck joint but
    # clearly above the bust, while shoulder straps rise close to the
    # shoulder joint.
    center_top = min(
        shoulder - 0.012,
        neck - 0.035,
    )
    center_top = max(
        center_top,
        style["top_center"] + 0.045,
    )
    shoulder_top = max(
        center_top + 0.025,
        shoulder + 0.006,
    )

    hem = min(
        style["length"],
        pelvis - 0.055,
    )

    return (
        hem,
        center_top,
        shoulder_top,
    )


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
            0.18,
            0.86,
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

        # Stay inside the torso shell. The skin-weight torso mask removes
        # limb vertices; this contour shapes the armhole itself.
        upper_t = smoothstep(
            center_top - 0.05,
            shoulder_top,
            v,
        )
        width_limit = (
            0.92
            - 0.12 * upper_t
        )

        hem_t = (
            1.0
            - smoothstep(
                lower,
                lower + 0.07,
                v,
            )
        )
        width_limit += (
            style["waist_flare"]
            * 3.5
            * hem_t
        )

        return (
            v >= lower
            and v <= top
            and width_n
            <= width_limit
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
    lower += 0.045
    center_top -= 0.018
    shoulder_top -= 0.012

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
            0.24,
            0.82,
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
        width_limit = (
            0.74
            + 0.08
            * smoothstep(
                center_top - 0.08,
                shoulder_top,
                v,
            )
        )
        return (
            v >= lower
            and v <= top
            and width_n
            <= width_limit
        )

    return keep

def belt_predicate(frame, style):
    lower, _, _ = chest_landmark_fractions(
        frame,
        style,
    )
    center_v = lower + 0.040

    def keep(point):
        v, _dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        return (
            center_v <= v <= center_v + 0.026
            and width_n <= 0.99
        )

    return keep


def hem_trim_predicate(frame, style):
    lower, _, _ = chest_landmark_fractions(
        frame,
        style,
    )

    def keep(point):
        v, _dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        return (
            lower <= v <= lower + 0.016
            and width_n <= 0.99
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
            0.18,
            0.86,
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
            top - 0.014
            <= v
            <= top + 0.006
            and width_n <= 0.90
        )

    return keep

def tabard_predicate(frame, style):
    hem, _, _ = chest_landmark_fractions(
        frame,
        style,
    )
    lower = hem - 0.035
    upper = hem + 0.070
    front_sign = frame["front_sign"]

    def keep(point):
        v, _dw, dd, width_n, depth_n = normalized_components(point, frame)
        front = depth_n * front_sign
        return (
            lower <= v <= upper
            and width_n <= 0.33
            and front >= 0.28
        )

    return keep


def create_chest(body, rig, frame, style, seed):
    style = dict(style)
    variant = int(seed) % 4

    # Small deterministic changes keep "Generate Another" useful without
    # changing the fundamental fit contract of the template.
    style["length"] += [0.0, -0.008, 0.007, -0.003][variant]
    style["top_center"] += [0.0, 0.006, -0.004, 0.003][variant]
    style["waist_flare"] += [0.0, 0.004, -0.003, 0.002][variant]

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
    clearance = height * 0.0024
    cloth_thickness = height * 0.00165
    overlay_thickness = height * 0.00145

    cloth = material(
        "FORGE_Ranger_Cloth",
        style["cloth"],
        roughness=0.82,
    )
    leather = material(
        "FORGE_Ranger_Leather",
        style["leather"],
        roughness=0.66,
    )
    trim = material(
        "FORGE_Ranger_Trim",
        style["trim"],
        roughness=0.58,
    )
    accent = material(
        "FORGE_Ranger_Accent",
        style["accent"],
        roughness=0.76,
    )

    objects = []

    base = duplicate_surface(
        body,
        rig,
        "FORGE_Chest_Base",
        cloth,
        tunic_predicate(frame, style),
        clearance,
        cloth_thickness,
        smooth_iterations=1,
        allowed_indices=torso_indices,
    )
    if base:
        objects.append(base)

    if style["vest"]:
        vest = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_LeatherVest",
            leather,
            vest_predicate(frame, style),
            clearance + height * 0.0045,
            overlay_thickness,
            smooth_iterations=1,
            allowed_indices=torso_indices,
        )
        if vest:
            objects.append(vest)

    belt = duplicate_surface(
        body,
        rig,
        "FORGE_Chest_Belt",
        leather,
        belt_predicate(frame, style),
        clearance + height * 0.0062,
        overlay_thickness * 1.18,
        smooth_iterations=0,
        allowed_indices=torso_indices,
    )
    if belt:
        objects.append(belt)

    hem = duplicate_surface(
        body,
        rig,
        "FORGE_Chest_HemTrim",
        trim,
        hem_trim_predicate(frame, style),
        clearance + height * 0.0040,
        overlay_thickness * 0.85,
        smooth_iterations=0,
        allowed_indices=torso_indices,
    )
    if hem:
        objects.append(hem)

    neck = duplicate_surface(
        body,
        rig,
        "FORGE_Chest_NeckTrim",
        trim,
        neckline_trim_predicate(frame, style),
        clearance + height * 0.0041,
        overlay_thickness * 0.82,
        smooth_iterations=0,
        allowed_indices=torso_indices,
    )
    if neck:
        objects.append(neck)

    if style["tabard"]:
        tabard = duplicate_surface(
            body,
            rig,
            "FORGE_Chest_FrontTabard",
            accent,
            tabard_predicate(frame, style),
            clearance + height * 0.0060,
            overlay_thickness,
            smooth_iterations=1,
            allowed_indices=torso_indices,
        )
        if tabard:
            objects.append(tabard)

    if not objects:
        raise RuntimeError("Procedural chest generation produced no geometry.")

    return objects


def export_glb(path, objects, rig):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
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
    export_glb(config.output, generated, rig)

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
        "generator": "blender-body-aware-v1",
    }

    with open(config.output + ".json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print("FORGE_PROCEDURAL_RESULT " + json.dumps(metadata), flush=True)


if __name__ == "__main__":
    main()
