"""Bake the Hi3D paper into the same photo rays and support plane as build-marble-hybrid.py."""
import json

import bpy
import numpy as np
from mathutils import Matrix, Quaternion
from mathutils.kdtree import KDTree


def register_paper(obj, web):
    def record(path):
        return json.loads((web / path).read_text())

    camera = record("assets/calibration.json")
    scene = record("marble-refined-lab/assets/scene.json")
    fit = scene["note"]["registration"]
    height, width = scene["height"], scene["width"]
    # Convert object-local Blender coordinates to the fitted Y-up Hi3D frame.
    mesh = obj.data
    xyz = np.empty(3 * len(mesh.vertices), np.float32)
    mesh.vertices.foreach_get("co", xyz)
    transform = np.array(obj.matrix_world)
    xyz = xyz.reshape(-1, 3) @ transform[:3, :3].T + transform[:3, 3]
    xyz = xyz[:, [0, 2, 1]] * [1, 1, -1]
    yaw = np.array(Matrix.Rotation(fit["yaw"], 3, "Y"))
    source = ((xyz - fit["sourceOrigin"]) * fit["scale"]) @ yaw.T + fit["position"]
    x, y, z, w = camera["quaternion"]
    old_basis = np.array(Quaternion((w, x, y, z)).to_matrix()) @ np.diag([1, -1, -1])
    view = (source - camera["position"]) @ old_basis
    focal = height / (2 * np.tan(np.deg2rad(camera["fov"]) / 2))
    uv = view[:, :2] / view[:, 2:] * focal + [width/2, height/2]

    image = bpy.data.images.load(str(web / "assets/objects/note-mask.png"))
    image.colorspace_settings.name = "Non-Color"
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    mask = pixels.reshape(height, width, 4)[::-1, :, 0] > .5
    ix, iy = np.rint(uv).astype(int).T
    outside = ~mask[iy.clip(0,height-1), ix.clip(0,width-1)]
    ys, xs = np.where(mask)
    tree = KDTree(len(xs))
    for i, (px, py) in enumerate(zip(xs, ys)):
        tree.insert((px, py, 0), i)
    tree.balance()
    for i in np.flatnonzero(outside):
        point, _, _ = tree.find((ix[i], iy[i], 0))
        uv[i] = point.x, point.y

    fx, fy, cx, cy = scene["intrinsics"]
    rays = np.column_stack(((uv - [cx, cy]) / [fx, fy], np.ones(len(uv))))
    plane = np.array(scene["support_plane"])
    elevation = (source[:, 1] - .006) * scene["note"]["height_scale"] + .0006
    depth = (1 - elevation * np.linalg.norm(plane)) / (rays @ plane)
    world = (rays * depth[:, None]) @ np.array(scene["source_camera_to_world"]).T + scene["source_camera_position"]
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    mesh.vertices.foreach_set("co", (world[:, [0, 2, 1]] * [1, -1, 1]).astype(np.float32).ravel())
    mesh.update()
