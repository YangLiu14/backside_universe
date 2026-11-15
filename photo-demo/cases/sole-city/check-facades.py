"""Compare street-facing surfaces to the original Hi3D mesh, including visible holes.

Run with Blender: blender -b -P check-facades.py -- MASTER.glb WEB.glb
"""
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def load_mesh(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert len(meshes) == 1, 'This comparison expects one Hi3D mesh per building'
    obj = meshes[0]
    bounds = np.array([obj.matrix_world @ Vector(p) for p in obj.bound_box])
    graph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(obj, graph)
    inverse = obj.matrix_world.inverted()
    return bounds, tree, inverse


def views(bounds):
    for direction in [(0.0, -1.0, .06), (.72, -.85, .10), (-.86, .45, .12), (1.0, .12, .03)]:
        forward = Vector(direction).normalized()
        right = Vector((0, 0, 1)).cross(forward).normalized()
        up = forward.cross(right)
        basis = np.array([right, up, forward])
        corners = bounds @ basis.T
        low, high = corners.min(axis=0), corners.max(axis=0)
        span = max(high - low)
        stride = span / 192
        x = np.arange(low[0], high[0], stride) + stride / 2
        y = np.arange(low[1], high[1], stride) + stride / 2
        yield forward, basis, x, y, high[2] + span, span


def depths(mesh, view):
    forward, basis, x, y, z, span = view
    _, tree, inverse = mesh
    toward = (inverse.to_3x3() @ -forward).normalized()
    xv, yv = np.meshgrid(x, y)
    origins = np.stack([xv, yv, np.full_like(xv, z)], axis=-1) @ basis
    scale = (inverse.to_3x3() @ forward).length
    result = np.array([
        tree.ray_cast(inverse @ Vector(origin), toward)[3] or np.inf
        for origin in origins.reshape(-1, 3)
    ])
    return result.reshape(len(y), len(x)) / (scale * span)


master, candidate = map(Path, sys.argv[sys.argv.index('--') + 1:])
original = load_mesh(master)
angles = list(views(original[0]))
reference = [depths(original, angle) for angle in angles]
candidate_mesh = load_mesh(candidate)
failures = []
for i, (angle, ref) in enumerate(zip(angles, reference)):
    actual = depths(candidate_mesh, angle)
    # Restrict assessment to continuous opaque patches of the reference.
    center = ref[1:-1, 1:-1]
    valid = np.isfinite(center)
    with np.errstate(invalid='ignore'):
        for neighbor in (ref[2:, 1:-1], ref[:-2, 1:-1], ref[1:-1, 2:], ref[1:-1, :-2]):
            valid &= np.abs(neighbor - center) < .012
        missing = (actual[1:-1, 1:-1] - center > .025) & valid
    rate = missing.sum() / max(1, valid.sum())
    failures.append(rate)
    print(f'{candidate.name} view {i+1}: exposed or recessed {rate:.2%} of {valid.sum()} solid wall samples')
assert max(failures) < .008, 'Street-level export lost opaque facade surface'
