import argparse
import json
import os
import sys

import bpy
from mathutils import Vector
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


def normalize(armor, body, slot):
    body_min, body_max = bounds(body)
    size = body_max - body_min
    vertical = "z" if size.z >= size.y else "y"
    height = max(size.z if vertical == "z" else size.y, 0.001)
    target_height, center_fraction = SLOTS.get(slot, SLOTS["chest"])

    armor_min, armor_max = bounds(armor)
    armor_size = armor_max - armor_min
    armor_height = armor_size.z if vertical == "z" else armor_size.y
    if armor_height > 1e-6:
        armor.scale *= (height * target_height) / armor_height
        bpy.context.view_layer.objects.active = armor
        armor.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        armor.select_set(False)

    body_min, body_max = bounds(body)
    body_center = (body_min + body_max) * 0.5
    armor_min, armor_max = bounds(armor)
    armor_center = (armor_min + armor_max) * 0.5
    target = body_center.copy()
    if vertical == "z":
        target.z = body_min.z + height * center_fraction
    else:
        target.y = body_min.y + height * center_fraction

    armor.location += target - armor_center
    bpy.context.view_layer.objects.active = armor
    armor.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    armor.select_set(False)
    return height


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

    height = normalize(armor, body, config.slot)
    before, after = decimate(armor, config.poly_limit)
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
    }
    with open(config.output + ".json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    print("FORGE_EQUIPMENT_RESULT " + json.dumps(metadata))


if __name__ == "__main__":
    main()
