"""Bevelled timber, tapered rods and UV-mapped materials for the island details."""
import math

import bpy
import numpy as np
from mathutils import Vector

V = Vector
UP = V((0, 1, 0))

def linear(value):
    return ((value + .055) / 1.055) ** 2.4 if value > .04045 else value / 12.92


def material(name, rgb, roughness, metal=0, grain=False, clay=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*[linear(c/255) for c in rgb], 1)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = mat.diffuse_color
    bs.inputs["Roughness"].default_value = roughness
    bs.inputs["Metallic"].default_value = metal
    if grain or clay:
        y, x = np.mgrid[:192, :512] / np.array([192, 512])[:, None, None]
        rng = np.random.default_rng(147)
        if clay:
            # A baked, tileable fired surface: broad iron stains and pale
            # inclusions with darker pores. The stair lip catches real light.
            val = .96 + rng.normal(0,.037,x.shape)
            for k,l,amount in [(2,1,.044),(-3,4,.036),(9,3,.019),(13,-18,.014)]:
                val += amount*np.sin(2*np.pi*(k*x+l*y)+rng.uniform(0,2*np.pi))
            pits = rng.random(x.shape)>.973
            val -= .26*pits + .11*np.roll(pits,1,axis=0)
            val += .17*(rng.random(x.shape)>.966)
        else:
            # Ring lines run along each cut member's own length.
            bend = y + .029*np.sin(2*np.pi*x) + .012*np.sin(2*np.pi*(2*x+y))
            waves = np.cos(2*np.pi*(15*bend+.32*np.sin(2*np.pi*bend)))
            fibre = np.sin(2*np.pi*(57*bend+.4*np.cos(2*np.pi*x)))
            val = .99 - .13*np.maximum(0,waves)**5 + .045*fibre + rng.normal(0,.024,x.shape)
        rgba = np.ones((*x.shape,4),np.float32)
        rgba[:,:,:3] = np.clip(val[:,:,None] * (np.array(rgb)/255), 0, 1)
        img = bpy.data.images.new(name,512,192,alpha=False)
        img.pixels.foreach_set(rgba.ravel()); img.pack()
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    return mat


class Part:
    """Batch the small physical parts into one GLB primitive per material."""
    def __init__(self, name, mat):
        self.name, self.mat = name, mat
        self.points, self.faces, self.uvs = [], [], []

    def face(self, points, uv=None):
        start = len(self.points)
        self.points.extend((p.x,-p.z,p.y) for p in points)
        self.faces.append(tuple(range(start,start+len(points))))
        self.uvs.extend(uv or [(0,0)]*len(points))

    def beam(self, a, b, width, thick, side=None):
        axis = (b-a).normalized()
        side = side if side is not None else (UP if abs(axis.y)<.86 else V((0,0,1)))
        side = (side-axis*axis.dot(side)).normalized()
        other = axis.cross(side)
        w,h = width/2,thick/2
        bevel = min(w,h)*.23
        profile = [(w-bevel,h),(-w+bevel,h),(-w,h-bevel),(-w,-h+bevel),
                   (-w+bevel,-h),(w-bevel,-h),(w,-h+bevel),(w,h-bevel)]
        corners = [side*x+other*y for x,y in profile]
        length = (b-a).length
        for i,p in enumerate(corners):
            q = corners[(i+1)%8]
            self.face([a+p,a+q,b+q,b+p],[(0,.07*i),(0,.07*i+.17),(length*42,.07*i+.17),(length*42,.07*i)])
        end_uv=[(.5+x*30,.5+y*30) for x,y in profile]
        self.face([a+p for p in reversed(corners)],list(reversed(end_uv)))
        self.face([b+p for p in corners],end_uv)

    def twig(self, a, b, ra, rb, sides=7):
        z=(b-a).normalized()
        x=z.cross(UP if abs(z.y)<.8 else V((1,0,0))).normalized()
        y=z.cross(x)
        ring=[x*math.cos(i*math.tau/sides)+y*math.sin(i*math.tau/sides) for i in range(sides)]
        for i,p in enumerate(ring):
            q=ring[(i+1)%sides]
            self.face([a+ra*p,a+ra*q,b+rb*q,b+rb*p])
        self.face([b+rb*p for p in ring])

    def finish(self):
        mesh=bpy.data.meshes.new(self.name); mesh.from_pydata(self.points,[],self.faces)
        if self.uvs:
            mesh.uv_layers.new().data.foreach_set('uv',np.asarray(self.uvs,np.float32).ravel())
        ob=bpy.data.objects.new(self.name,mesh);bpy.context.collection.objects.link(ob)
        mesh.materials.append(self.mat)
