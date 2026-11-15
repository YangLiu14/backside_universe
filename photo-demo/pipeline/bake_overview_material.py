"""Project the detail GLB's PBR maps onto a simplified, independently unwrapped mesh."""
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

near_path, proxy_path, output_path, size = sys.argv[sys.argv.index('--') + 1:]
size = int(size)
bpy.ops.wm.read_factory_settings(use_empty=True)


def import_mesh(path):
    previous = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in set(bpy.data.objects) - previous if obj.type == 'MESH']
    if not meshes:
        raise ValueError(f'No surfaces in {path}')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return meshes[0]


proxy = import_mesh(proxy_path)
source = import_mesh(near_path)
bpy.ops.object.select_all(action='DESELECT')
proxy.select_set(True)
bpy.context.view_layer.objects.active = proxy
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
# The reduced triangles have lost the high-poly UV island boundaries. Pack
# a fresh atlas so even a triangle spanning old islands samples one material.
bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=3 / size,
                         correct_aspect=True, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.margin = 5
scene.render.bake.margin_type = 'EXTEND'
world = [source.matrix_world @ Vector(corner) for corner in source.bound_box]
extent = max(max(p[i] for p in world) - min(p[i] for p in world) for i in range(3))
scene.render.bake.cage_extrusion = .002 * extent
scene.render.bake.max_ray_distance = .012 * extent

# The scanned building supplies color and packed roughness/metalness as
# separate images. Bake emission to transfer data without relighting it.
transfers = []
for material in {slot.material for slot in source.material_slots}:
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    base = shader.inputs['Base Color'].links[0].from_node
    roughness = shader.inputs['Roughness'].links[0].from_node
    packed = roughness.inputs[0].links[0].from_node
    if base.type != 'TEX_IMAGE' or packed.type != 'TEX_IMAGE':
        raise ValueError('Expected textured base color and packed roughness/metalness')
    emission = nodes.new('ShaderNodeEmission')
    output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
    links.new(emission.outputs[0], output.inputs['Surface'])
    transfers.append((links, emission, {'base': base, 'orm': packed}))

destination = bpy.data.materials.new('Hi3D street surface')
destination.use_nodes = True
destination.use_backface_culling = all(slot.material.use_backface_culling for slot in source.material_slots)
proxy.data.materials.clear()
proxy.data.materials.append(destination)
for face in proxy.data.polygons:
    face.material_index = 0
source.select_set(True)
nodes, links = destination.node_tree.nodes, destination.node_tree.links
shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
for channel in ('base', 'orm'):
    image = bpy.data.images.new(channel, size, size, alpha=False)
    image.colorspace_settings.name = 'sRGB' if channel == 'base' else 'Non-Color'
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    for source_links, emission, textures in transfers:
        source_links.new(textures[channel].outputs['Color'], emission.inputs['Color'])
    bpy.ops.object.bake(type='EMIT')
    if channel == 'base':
        links.new(target.outputs['Color'], shader.inputs['Base Color'])
    else:
        separate = nodes.new('ShaderNodeSeparateColor')
        links.new(target.outputs['Color'], separate.inputs['Color'])
        links.new(separate.outputs['Green'], shader.inputs['Roughness'])
        links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
    image.pack()

source.select_set(False)
bpy.ops.export_scene.gltf(filepath=str(Path(output_path)), use_selection=True, export_format='GLB',
                          export_image_format='JPEG', export_jpeg_quality=92)
