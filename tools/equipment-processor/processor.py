import argparse
import json
import os
import sys
import math

import bpy
from mathutils import Euler, Vector
from mathutils.bvhtree import BVHTree

SLOTS = {
    "chest": (0.34, 0.69),
    "head": (0.18, 0.91),
    "legs": (0.36, 0.34),
    "boots": (0.19, 0.10),
    "gloves": (0.14, 0.58),
    "waist": (0.13, 0.51),
    "back": (0.45, 0.66),
    "main-hand": (0.45, 0.55),
    "off-hand": (0.32, 0.55),
}

MASKS = {
    "chest": ["CHEST", "BACK", "SHOULDER_L", "SHOULDER_R"],
    "head": ["HEAD"],
    "legs": ["PELVIS", "THIGH_L", "THIGH_R"],
    "boots": ["CALF_L", "CALF_R", "FOOT_L", "FOOT_R"],
    "gloves": ["FOREARM_L", "FOREARM_R", "HAND_L", "HAND_R"],
    "waist": ["PELVIS"],
    "back": [],
    "main-hand": [],
    "off-hand": [],
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--mannequin", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--body", default="female")
    parser.add_argument("--slot", default="chest")
    parser.add_argument("--fit", default="normal")
    parser.add_argument("--clearance-mm", type=float, default=4.0)
    parser.add_argument("--poly-limit", type=int, default=25000)
    return parser.parse_args(argv)


def clear():
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


def armature(objects):
    return next((obj for obj in objects if obj.type == "ARMATURE"), None)


def join_meshes(objects):
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("The equipment GLB contains no mesh.")
    if len(meshes) == 1:
        return meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    return meshes[0]


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return minimum, maximum


def apply_modifier(obj, name):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=name)
    obj.select_set(False)


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


def robust_point_bounds(points, low=0.05, high=0.95):
    if not points:
        zero = Vector((0.0, 0.0, 0.0))
        return zero.copy(), zero.copy()

    minimum = Vector((
        percentile([p.x for p in points], low),
        percentile([p.y for p in points], low),
        percentile([p.z for p in points], low),
    ))
    maximum = Vector((
        percentile([p.x for p in points], high),
        percentile([p.y for p in points], high),
        percentile([p.z for p in points], high),
    ))
    return minimum, maximum


def mesh_world_points(obj):
    return [
        obj.matrix_world @ vertex.co
        for vertex in obj.data.vertices
    ]


def apply_object_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(
        location=False,
        rotation=True,
        scale=True,
    )
    obj.select_set(False)


def chest_body_frame(body):
    points = mesh_world_points(body)
    full_min, full_max = robust_point_bounds(
        points,
        0.01,
        0.99,
    )
    full_size = full_max - full_min

    vertical_axis = max(
        range(3),
        key=lambda axis: full_size[axis],
    )
    horizontal_axes = [
        axis
        for axis in range(3)
        if axis != vertical_axis
    ]

    body_height = max(
        full_size[vertical_axis],
        0.001,
    )
    band_low = (
        full_min[vertical_axis]
        + body_height * 0.48
    )
    band_high = (
        full_min[vertical_axis]
        + body_height * 0.79
    )
    torso_points = [
        point
        for point in points
        if band_low
        <= point[vertical_axis]
        <= band_high
    ]
    if len(torso_points) < 20:
        torso_points = points

    torso_min, torso_max = robust_point_bounds(
        torso_points,
        0.10,
        0.90,
    )
    torso_size = torso_max - torso_min

    width_axis = max(
        horizontal_axes,
        key=lambda axis: torso_size[axis],
    )
    depth_axis = next(
        axis
        for axis in horizontal_axes
        if axis != width_axis
    )

    torso_center = Vector((
        percentile([p.x for p in torso_points], 0.5),
        percentile([p.y for p in torso_points], 0.5),
        percentile([p.z for p in torso_points], 0.5),
    ))

    return {
        "verticalAxis": vertical_axis,
        "widthAxis": width_axis,
        "depthAxis": depth_axis,
        "bodyHeight": body_height,
        "bodyMin": full_min,
        "torsoCenter": torso_center,
        "torsoWidth": max(torso_size[width_axis], 0.001),
        "torsoDepth": max(torso_size[depth_axis], 0.001),
    }


def candidate_rotations():
    rotations = []
    seen = set()

    quarter_turns = [
        0.0,
        math.pi * 0.5,
        math.pi,
        math.pi * 1.5,
    ]

    for x in quarter_turns:
        for y in quarter_turns:
            for z in quarter_turns:
                matrix = Euler((x, y, z), "XYZ").to_matrix()
                key = tuple(
                    round(matrix[row][column], 5)
                    for row in range(3)
                    for column in range(3)
                )
                if key in seen:
                    continue
                seen.add(key)
                rotations.append(matrix)

    return rotations


def oriented_local_points(armor, rotation):
    return [
        rotation @ vertex.co
        for vertex in armor.data.vertices
    ]


def orientation_score(
    points,
    vertical_axis,
    width_axis,
    depth_axis,
    target_height,
    target_width,
    target_depth,
):
    minimum, maximum = robust_point_bounds(
        points,
        0.02,
        0.98,
    )
    size = maximum - minimum

    height = max(
        size[vertical_axis],
        0.00001,
    )
    width = max(
        size[width_axis],
        0.00001,
    )
    depth = max(
        size[depth_axis],
        0.00001,
    )

    source_width_ratio = width / height
    source_depth_ratio = depth / height
    target_width_ratio = target_width / target_height
    target_depth_ratio = target_depth / target_height

    return (
        abs(
            math.log(
                source_width_ratio
                / max(target_width_ratio, 0.00001)
            )
        )
        + 1.35
        * abs(
            math.log(
                source_depth_ratio
                / max(target_depth_ratio, 0.00001)
            )
        )
    )


def normalize_chest(armor, body):
    apply_object_transform(armor)
    frame = chest_body_frame(body)

    vertical_axis = frame["verticalAxis"]
    width_axis = frame["widthAxis"]
    depth_axis = frame["depthAxis"]
    body_height = frame["bodyHeight"]

    target_height = body_height * 0.34
    target_width = frame["torsoWidth"] * 1.10
    target_depth = frame["torsoDepth"] * 1.18

    best_rotation = None
    best_score = None

    for rotation in candidate_rotations():
        points = oriented_local_points(
            armor,
            rotation,
        )
        score = orientation_score(
            points,
            vertical_axis,
            width_axis,
            depth_axis,
            target_height,
            target_width,
            target_depth,
        )
        if (
            best_score is None
            or score < best_score
        ):
            best_score = score
            best_rotation = rotation

    if best_rotation is not None:
        armor.rotation_euler = (
            best_rotation.to_euler("XYZ")
        )
        apply_object_transform(armor)

    armor_points = mesh_world_points(armor)
    armor_min, armor_max = robust_point_bounds(
        armor_points,
        0.02,
        0.98,
    )
    armor_size = armor_max - armor_min

    desired = {
        vertical_axis: target_height,
        width_axis: target_width,
        depth_axis: target_depth,
    }

    scale = Vector((1.0, 1.0, 1.0))
    for axis, target in desired.items():
        current = max(
            armor_size[axis],
            0.00001,
        )
        scale[axis] = target / current

    # Prevent pathological single-view reconstructions from being
    # stretched into extreme shapes. The target torso still wins, but
    # no axis is allowed to diverge too far from the median scale.
    median_scale = sorted(
        [scale.x, scale.y, scale.z]
    )[1]
    lower = median_scale * 0.58
    upper = median_scale * 1.55
    for axis in range(3):
        scale[axis] = max(
            lower,
            min(upper, scale[axis]),
        )

    armor.scale = scale
    apply_object_transform(armor)

    armor_points = mesh_world_points(armor)
    armor_min, armor_max = robust_point_bounds(
        armor_points,
        0.02,
        0.98,
    )
    armor_center = (
        armor_min + armor_max
    ) * 0.5

    target_center = (
        frame["torsoCenter"].copy()
    )
    target_center[vertical_axis] = (
        frame["bodyMin"][vertical_axis]
        + body_height * 0.655
    )

    armor.location += (
        target_center - armor_center
    )

    bpy.context.view_layer.objects.active = armor
    armor.select_set(True)
    bpy.ops.object.transform_apply(
        location=True,
        rotation=False,
        scale=False,
    )
    armor.select_set(False)

    return body_height, {
        "mode": "chest-torso-solve",
        "orientationScore": (
            round(best_score, 6)
            if best_score is not None
            else None
        ),
        "verticalAxis": vertical_axis,
        "widthAxis": width_axis,
        "depthAxis": depth_axis,
        "targetHeight": target_height,
        "targetWidth": target_width,
        "targetDepth": target_depth,
        "scale": [
            round(scale.x, 6),
            round(scale.y, 6),
            round(scale.z, 6),
        ],
    }


def normalize_generic(armor, body, slot):
    body_min, body_max = bounds(body)
    size = body_max - body_min
    vertical = "z" if size.z >= size.y else "y"
    height = max(
        size.z if vertical == "z" else size.y,
        0.001,
    )
    target_height, center_fraction = SLOTS.get(
        slot,
        SLOTS["chest"],
    )

    armor_min, armor_max = bounds(armor)
    armor_size = armor_max - armor_min
    armor_height = (
        armor_size.z
        if vertical == "z"
        else armor_size.y
    )
    if armor_height > 1e-6:
        armor.scale *= (
            height
            * target_height
            / armor_height
        )
        apply_object_transform(armor)

    body_min, body_max = bounds(body)
    body_center = (
        body_min + body_max
    ) * 0.5
    armor_min, armor_max = bounds(armor)
    armor_center = (
        armor_min + armor_max
    ) * 0.5
    target = body_center.copy()

    if vertical == "z":
        target.z = (
            body_min.z
            + height * center_fraction
        )
    else:
        target.y = (
            body_min.y
            + height * center_fraction
        )

    armor.location += (
        target - armor_center
    )
    bpy.context.view_layer.objects.active = armor
    armor.select_set(True)
    bpy.ops.object.transform_apply(
        location=True,
        rotation=True,
        scale=True,
    )
    armor.select_set(False)

    return height, {
        "mode": "generic",
    }


def normalize(armor, body, slot):
    if slot == "chest":
        return normalize_chest(
            armor,
            body,
        )
    return normalize_generic(
        armor,
        body,
        slot,
    )

def decimate(armor, limit):
    before = len(armor.data.polygons)
    if limit > 0 and before > limit:
        mod = armor.modifiers.new("FORGE_PolyBudget", "DECIMATE")
        mod.ratio = max(0.05, min(1.0, limit / before))
        apply_modifier(armor, mod.name)
    return before, len(armor.data.polygons)


def contact_group(armor, body, height):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body.evaluated_get(depsgraph), depsgraph)
    group = armor.vertex_groups.new(name="FORGE_CONTACT")
    near = height * 0.008
    far = height * 0.07

    for vertex in armor.data.vertices:
        world = armor.matrix_world @ vertex.co
        nearest = bvh.find_nearest(world)
        if not nearest:
            continue
        distance = (world - nearest[0]).length
        if distance >= far:
            continue
        t = 1.0 - max(0.0, min(1.0, (distance - near) / max(1e-6, far - near)))
        weight = t * t * (3.0 - 2.0 * t)
        if weight > 0.001:
            group.add([vertex.index], weight, "REPLACE")
    return group


def fit_mesh(armor, body, group, fit, clearance_mm):
    strength = {"tight": 1.0, "normal": 0.72, "loose": 0.48}.get(fit, 0.72)
    for vertex in armor.data.vertices:
        current = next((entry for entry in vertex.groups if entry.group == group.index), None)
        if current:
            group.add([vertex.index], current.weight * strength, "REPLACE")

    mod = armor.modifiers.new("FORGE_AutoFit", "SHRINKWRAP")
    mod.target = body
    mod.vertex_group = group.name
    mod.wrap_method = "NEAREST_SURFACEPOINT"
    mod.offset = clearance_mm / 1000.0
    try:
        mod.wrap_mode = "ABOVE_SURFACE"
    except Exception:
        pass
    apply_modifier(armor, mod.name)


def weights(armor, body, rig):
    if rig is None:
        raise RuntimeError("The Skillbound mannequin has no armature.")

    for source_group in body.vertex_groups:
        if armor.vertex_groups.get(source_group.name) is None:
            armor.vertex_groups.new(name=source_group.name)

    mod = armor.modifiers.new("FORGE_Weights", "DATA_TRANSFER")
    mod.object = body
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    mod.mix_mode = "REPLACE"
    mod.mix_factor = 1.0
    apply_modifier(armor, mod.name)

    for existing in list(armor.modifiers):
        if existing.type == "ARMATURE":
            armor.modifiers.remove(existing)

    arm = armor.modifiers.new("FORGE_Armature", "ARMATURE")
    arm.object = rig
    armor.parent = rig
    armor.matrix_parent_inverse = rig.matrix_world.inverted()


def export(output, armor, rig):
    bpy.ops.object.select_all(action="DESELECT")
    armor.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = armor
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_skins=True,
        export_animations=False,
        export_materials="EXPORT",
    )


def main():
    config = args()
    clear()

    mannequin_objects = import_glb(config.mannequin)
    body = primary_body(mannequin_objects)
    rig = armature(mannequin_objects)
    if rig is None:
        raise RuntimeError("The Skillbound mannequin has no armature.")

    armor = join_meshes(import_glb(config.input))
    armor.name = "FORGE_Equipment_" + config.slot

    height, normalization = normalize(
        armor,
        body,
        config.slot,
    )
    before, after = decimate(
        armor,
        config.poly_limit,
    )
    group = contact_group(armor, body, height)

    if config.slot not in {"main-hand", "off-hand"}:
        fit_mesh(armor, body, group, config.fit, config.clearance_mm)
        weights(armor, body, rig)
    else:
        armor.parent = rig

    os.makedirs(os.path.dirname(config.output), exist_ok=True)
    export(config.output, armor, rig)

    metadata = {
        "format": "forge-equipment-processed",
        "version": 1,
        "body": config.body,
        "slot": config.slot,
        "fit": config.fit,
        "clearanceMm": config.clearance_mm,
        "polyLimit": config.poly_limit,
        "polygonsBefore": before,
        "polygonsAfter": after,
        "bodyMask": MASKS.get(config.slot, []),
        "armature": rig.name,
        "bodyMesh": body.name,
        "equipmentMesh": armor.name,
        "normalization": normalization,
    }
    with open(config.output + ".json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    print("FORGE_EQUIPMENT_RESULT " + json.dumps(metadata))


if __name__ == "__main__":
    main()
