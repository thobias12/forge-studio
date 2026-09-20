import argparse
import json
import math
import os
import sys

import bpy
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


def body_frame(body):
    points = [body.matrix_world @ vertex.co for vertex in body.data.vertices]
    full_min, full_max = robust_bounds(points, 0.01, 0.99)
    size = full_max - full_min
    vertical_axis = max(range(3), key=lambda axis: size[axis])
    horizontal_axes = [axis for axis in range(3) if axis != vertical_axis]
    height = max(size[vertical_axis], 0.001)

    band_low = full_min[vertical_axis] + height * 0.48
    band_high = full_min[vertical_axis] + height * 0.80
    torso = [
        point
        for point in points
        if band_low <= point[vertical_axis] <= band_high
    ]
    if len(torso) < 64:
        torso = points

    torso_min, torso_max = robust_bounds(torso, 0.08, 0.92)
    torso_size = torso_max - torso_min
    width_axis = max(horizontal_axes, key=lambda axis: torso_size[axis])
    depth_axis = next(axis for axis in horizontal_axes if axis != width_axis)

    center = Vector((
        percentile([p.x for p in torso], 0.5),
        percentile([p.y for p in torso], 0.5),
        percentile([p.z for p in torso], 0.5),
    ))

    depth_positive = torso_max[depth_axis] - center[depth_axis]
    depth_negative = center[depth_axis] - torso_min[depth_axis]
    front_sign = 1.0 if depth_positive >= depth_negative else -1.0

    return {
        "min": full_min,
        "max": full_max,
        "height": height,
        "vertical": vertical_axis,
        "width": width_axis,
        "depth": depth_axis,
        "center": center,
        "torso_width": max(torso_size[width_axis], 0.001),
        "torso_depth": max(torso_size[depth_axis], 0.001),
        "front_sign": front_sign,
    }


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
    remove_non_armature_modifiers(obj)
    armature_modifiers = [mod for mod in obj.modifiers if mod.type == "ARMATURE"]
    if not armature_modifiers:
        mod = obj.modifiers.new("FORGE_Armature", "ARMATURE")
        mod.object = rig
    else:
        for mod in armature_modifiers:
            mod.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def delete_unwanted_vertices(obj, keep_vertex):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        vertex.select = not keep_vertex(world)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


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


def duplicate_surface(body, rig, name, mat, keep_vertex, clearance, thickness, smooth_iterations=1):
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    body.users_collection[0].objects.link(obj)

    obj.data.materials.clear()
    obj.data.materials.append(mat)

    ensure_armature(obj, rig)
    delete_unwanted_vertices(obj, keep_vertex)

    if len(obj.data.vertices) < 12:
        obj.data.user_clear()
        bpy.data.objects.remove(obj, do_unlink=True)
        return None

    outward_shell(
        obj,
        clearance,
        thickness,
        smooth_iterations=smooth_iterations,
    )
    ensure_armature(obj, rig)
    return obj


def normalized_components(point, frame):
    vertical = frame["vertical"]
    width = frame["width"]
    depth = frame["depth"]
    height = frame["height"]

    v = (point[vertical] - frame["min"][vertical]) / height
    dw = point[width] - frame["center"][width]
    dd = point[depth] - frame["center"][depth]

    half_width = max(frame["torso_width"] * 0.5, 1e-5)
    half_depth = max(frame["torso_depth"] * 0.5, 1e-5)

    return (
        v,
        dw,
        dd,
        abs(dw) / half_width,
        dd / half_depth,
    )


def tunic_predicate(frame, style):
    lower = style["length"]

    def keep(point):
        v, dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        shoulder_t = smoothstep(0.18, 0.88, width_n)
        top = (
            style["top_center"]
            + (style["top_shoulder"] - style["top_center"]) * shoulder_t
        )

        # Open armholes by narrowing the allowed torso width near the
        # underarm while still leaving a real shoulder strap at the crown.
        upper_t = smoothstep(0.62, style["top_shoulder"], v)
        width_limit = 0.93 + 0.08 * upper_t

        # Slightly flare the waist/hem so the lower edge does not bite into
        # the body when animated.
        hem_t = 1.0 - smoothstep(lower, lower + 0.07, v)
        width_limit += style["waist_flare"] * 6.0 * hem_t

        return (
            v >= lower
            and v <= top
            and width_n <= width_limit
        )

    return keep


def vest_predicate(frame, style):
    lower = style["length"] + 0.055

    def keep(point):
        v, _dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        shoulder_t = smoothstep(0.25, 0.86, width_n)
        top = 0.705 + 0.060 * shoulder_t
        width_limit = 0.79 + 0.10 * smoothstep(0.62, 0.76, v)
        return (
            v >= lower
            and v <= top
            and width_n <= width_limit
        )

    return keep


def belt_predicate(frame, style):
    center_v = style["length"] + 0.040

    def keep(point):
        v, _dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        return (
            center_v <= v <= center_v + 0.026
            and width_n <= 0.99
        )

    return keep


def hem_trim_predicate(frame, style):
    lower = style["length"]

    def keep(point):
        v, _dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        return (
            lower <= v <= lower + 0.016
            and width_n <= 0.99
        )

    return keep


def neckline_trim_predicate(frame, style):
    def keep(point):
        v, _dw, _dd, width_n, _depth_n = normalized_components(point, frame)
        shoulder_t = smoothstep(0.18, 0.88, width_n)
        top = (
            style["top_center"]
            + (style["top_shoulder"] - style["top_center"]) * shoulder_t
        )
        return (
            top - 0.018 <= v <= top + 0.004
            and width_n <= 0.99
        )

    return keep


def tabard_predicate(frame, style):
    lower = style["length"] - 0.045
    upper = style["length"] + 0.055
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
    frame = body_frame(body)

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
