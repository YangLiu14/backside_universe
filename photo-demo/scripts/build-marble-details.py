"""Fit fine Gaussian samples to photographed surfaces in the retained Marble world.

Inputs are the unmodified full-res world, its registered camera and the 2x photograph.
The two derived SPZs share the original world's raw coordinate frame. The hybrid
desktop already has a solid laptop, so only the raw Marble viewer uses the screen.
"""
import gzip
import hashlib
import importlib.util
import io
import json
import struct
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageCms
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

APP = Path(__file__).resolve().parents[1]
ASSETS = APP / "dist/marble-lab/assets"
module = importlib.util.spec_from_file_location("marble", Path(__file__).with_name("build-marble-hybrid.py"))
marble = importlib.util.module_from_spec(module)
module.loader.exec_module(marble)

# Clockwise landmarks in source-photo pixels and in a 1320 x 1739 reference
# render at the saved Marble camera, respectively. Use independent landmarks:
# the generated print and furniture do not project to exactly the photo pixels.
# Depth limits (camera metres) exclude walls behind the open book and display.
SURFACES = [
    ("print", [(1063,209),(1266,199),(1183,598),(1013,559)],
     [(1063,225),(1274,213),(1187,598),(1017,558)], (2.0,2.95), .080),
    ("left-page", [(60,1571),(188,1432),(282,1478),(148,1636)],
     [(62,1574),(184,1434),(277,1483),(147,1639)], (1.05,1.39), .018),
    ("right-page", [(148,1636),(282,1478),(377,1536),(228,1704)],
     [(147,1639),(277,1483),(377,1535),(253,1699)], (1.05,1.39), .018),
    ("screen", [(510,665),(644,644),(655,741),(524,765)],
     [(504,678),(640,655),(654,751),(520,777)], (2.01,2.3), .013),
]
OUTPUT = APP / "dist/marble-detail/assets"
SPACING = .80  # reference pixels; sample the 2x photograph between original pixels


def build_surface(surface, uv, local, alpha, camera, image):
    name, source, target, limits, tolerance = surface
    rotation, center, K, scale, ground = camera
    quad = np.float32(target)
    lo, hi = quad.min(0), quad.max(0)
    bounds = ((uv >= lo) & (uv <= hi)).all(1)
    keep = bounds & (alpha > 50) & (local[:,2] > limits[0]) & (local[:,2] < limits[1])
    hull = np.zeros((marble.H, marble.W), np.uint8)
    cv2.fillConvexPoly(hull, quad.astype(np.int32), 1)
    px = np.rint(uv[keep]).astype(int)
    points = local[keep][hull[px[:,1], px[:,0]] != 0]
    plane, _ = marble.plane_fit(points)
    # Reconstruct the local relief from neighbouring *existing* Gaussians.
    # Median depth rejects isolated floaters. Drop samples without local support.
    residual = points[:,2] - 1 / ((points/points[:,2:]) @ plane)
    consistent = np.abs(residual) < tolerance
    if consistent.sum() < 100:
        raise ValueError(f"Insufficient 3D support for {name}")
    tree = cKDTree(marble.project(points[consistent], K))
    xs = np.arange(lo[0], hi[0]+1, SPACING)
    ys = np.arange(lo[1], hi[1]+1, SPACING)
    x, y = np.meshgrid(xs, ys)
    pixels = np.stack((x,y), axis=-1).astype(np.float32)
    dist, idx = tree.query(pixels.reshape(-1,2), k=8)
    base_depth = 1 / (marble.rays(pixels.reshape(-1,2), K) @ plane)
    relief = np.median(residual[consistent][idx], axis=1).reshape(x.shape)
    relief = cv2.GaussianBlur(relief,(0,0),2.4)
    # A small forward bias seats the detail on the visible skin of the splats.
    depth = base_depth.reshape(x.shape) + relief - .004
    view = marble.rays(pixels.reshape(-1,2), K) * depth.reshape(-1,1)
    world = view @ rotation.T + center
    raw = ((world-[0,ground,0])*[1,-1,-1]/scale).reshape(*x.shape,3)

    transform = cv2.getPerspectiveTransform(quad, np.float32(source))
    photo_uv = cv2.perspectiveTransform(pixels,transform)
    # Sample RGB in sRGB display space, at matching pixel centres in the 2x file.
    photo = cv2.remap(image, 2*photo_uv+.5, None, cv2.INTER_LINEAR)
    distance = cv2.distanceTransform(hull, cv2.DIST_L2, 5)
    edge = cv2.remap(distance, pixels, None, cv2.INTER_LINEAR)
    fade = np.clip((edge-1)/4, 0, 1)*np.clip((12-dist[:,-1].reshape(x.shape))/5,0,1)
    if name == "print":
        # The brass lamp overlaps the lower edge in the source photograph.
        fade *= np.clip((575-photo_uv[:,:,1])/5,0,1)
    visible = fade > .015
    samples = surface_samples(raw, visible, fade*.97, photo)

    # Coarse original splats can sit in front of the refined samples. Adapt
    # only splats on the fitted surface, to avoid mixing two printed images.
    ids = np.flatnonzero(bounds & (alpha > 0) & (local[:,2] > limits[0]) & (local[:,2] < limits[1]))
    grid = ((uv[ids]-lo)/SPACING).T[::-1]
    near_depth = map_coordinates(depth,grid,order=1,mode="nearest")
    separation = np.abs(local[ids,2] - (near_depth+.004))
    weight = map_coordinates(fade,grid,order=1,mode="constant") * np.clip(2-separation/tolerance,0,1)
    nearby = weight > .005
    ids, weight, grid = ids[nearby], weight[nearby], grid[:,nearby]
    colors = np.stack([map_coordinates(photo[:,:,k],grid,order=1) for k in range(3)],axis=1)
    return samples, (ids, weight, colors)


def surface_samples(raw, visible, opacity, colors):
    # Two surface tangents form a covariance ellipse. Its short third axis
    # follows the normal, so a print remains thin when viewed obliquely.
    du, dv = np.gradient(raw, axis=1), np.gradient(raw, axis=0)
    tangent = np.stack((du[visible],dv[visible]),axis=-1)
    basis, axes, _ = np.linalg.svd(tangent,full_matrices=False)
    normal = np.cross(basis[:,:,0],basis[:,:,1])
    quat = Rotation.from_matrix(np.dstack((basis,normal))).as_quat(canonical=True)
    sizes = np.column_stack((axes*.74, np.maximum(axes[:,1]*.13,.00008)))
    return raw[visible], opacity[visible], colors[visible], sizes, quat


def build_carpet(uv, local, height, alpha, packed_rgb, camera, image):
    rotation, center, K, scale, ground = camera
    top, spacing = 1000, 1.3  # reference pixels
    inside = ((uv[:,0] >= 0) & (uv[:,0] < marble.W-1)
              & (uv[:,1] >= top) & (uv[:,1] < marble.H-1) & (local[:,2] > 0))
    # The original floor has a small amount of relief. Only trust existing
    # splats in its surveyed height band; never fit through chair legs.
    floor_ids = np.flatnonzero(inside & (alpha > 55) & (height > -.042) & (height < .006))
    if len(floor_ids) < 100:
        raise ValueError("Missing reconstructed carpet floor")
    x, y = np.meshgrid(np.arange(0, marble.W, spacing), np.arange(top, marble.H, spacing))
    pixels = np.stack((x,y), axis=-1).astype(np.float32)
    distance, neighbours = cKDTree(uv[floor_ids]).query(pixels.reshape(-1,2), k=8)
    ids = floor_ids[neighbours]
    weights = 1 / (distance**2 + 2)
    weights /= weights.sum(axis=1,keepdims=True)
    base = np.sum(packed_rgb[ids]*weights[:,:,None], axis=1).reshape(*x.shape,3)
    base = np.clip((base-127.5)*(.28209479/.15)+127.5, 0, 255)
    surface_y = np.median(height[ids],axis=1).reshape(x.shape)
    surface_y = cv2.GaussianBlur(surface_y,(0,0),2) + .006
    rays = (marble.rays(pixels.reshape(-1,2), K) @ rotation.T).reshape(*x.shape,3)
    depth = (surface_y-center[1]) / rays[:,:,1]
    raw = (center+rays*depth[:,:,None]-[0,ground,0])*[1,-1,-1]/scale

    # A blue fibre must be present in both the photo and the reconstructed
    # floor. Their stripe edges and furniture silhouettes differ slightly.
    def blue_rug(rgb):
        r, g, b = np.moveaxis(rgb.astype(np.float32),-1,0)
        return ((b-r > 3) & (b-g > 2) & (r < 90)).astype(np.uint8)

    source = cv2.resize(image,(marble.W,marble.H),interpolation=cv2.INTER_AREA)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
    source_mask = cv2.morphologyEx(blue_rug(source), cv2.MORPH_CLOSE, kernel)
    chair = np.asarray(Image.open(APP/'dist/assets/objects/chair-mask.png').convert('L'))
    source_mask[chair > 24] = 0
    source_edge = cv2.distanceTransform(source_mask,cv2.DIST_L2,5)
    # Reject nearer geometry in the actual Marble world as well. Limit
    # occluders to points between the camera and the carpet on the same ray.
    above = np.flatnonzero(inside & (alpha > 45) & (height > .018))
    occupied = np.zeros((marble.H,marble.W), np.uint8)
    p = np.rint(uv[above]).astype(int)
    occupied[p[:,1],p[:,0]] = 1
    clearance = cv2.distanceTransform(1-cv2.dilate(occupied,kernel),cv2.DIST_L2,5)
    target = blue_rug(base)
    target *= (distance[:,-1].reshape(x.shape) < 15)
    target_edge = cv2.distanceTransform(target,cv2.DIST_L2,5) * spacing
    fade = np.minimum(target_edge,cv2.remap(np.minimum(source_edge,clearance),
                      pixels,None,cv2.INTER_LINEAR))
    fade = np.clip((fade-2)/8,0,1)

    # Remove source illumination and stripe colours. The bilateral low pass
    # keeps strong stripe edges out of the fibre signal. Work only on the
    # lower part of the 2x photograph and keep pixel-centre registration.
    luma = cv2.cvtColor(image[2*top:],cv2.COLOR_RGB2GRAY).astype(np.float32)
    low = cv2.bilateralFilter(luma,15,13,4)
    coords = (pixels-[0,top]).astype(np.float32)*2+.5
    fibre = cv2.remap(luma-low,coords,None,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    fibre = np.clip(fibre,-19,19)
    color = np.clip(base + 2.5*fibre[:,:,None],0,255)
    visible = (fade > .05) & (np.abs(fibre) > 1.5)
    samples = surface_samples(raw,visible,fade*.92,color)
    print(f'carpet: {visible.sum():,} supported fibre samples')
    return samples, None  # retain all original stripes, contact shadows and furniture


def write_spz(path, base, surfaces):
    parts, updates = zip(*surfaces)
    xyz, opacity, rgb, size, quat = [np.concatenate(a) for a in zip(*parts)]
    count, = struct.unpack_from('<I',base,8)
    assert len(base)==16+count*19
    header = bytearray(base[:16])
    fractional = header[13]
    struct.pack_into('<I',header,8,count+len(xyz))
    old = []
    offset = 16
    for stride in [9,1,3,3,3]:
        old.append(bytearray(base[offset:offset+count*stride]))
        offset += count*stride
    old_alpha = np.frombuffer(old[1],np.uint8)
    old_rgb = np.frombuffer(old[2],np.uint8).reshape(-1,3)
    for update in updates:
        if update is None:
            continue
        ids, weight, colors = update
        # A zero-alpha point in the hybrid scene must always stay deleted.
        keep = old_alpha[ids] > 0
        ids, weight, colors = ids[keep],weight[keep],colors[keep]
        rgb_weight = weight[:,None]
        encoded = (colors.astype(float)-127.5)*(.15/.28209479)+127.5
        old_rgb[ids] = np.rint(old_rgb[ids]*(1-rgb_weight)+encoded*rgb_weight)
        old_alpha[ids] = np.rint(old_alpha[ids]*(1-.82*weight))
    # Same SPZ v2 degree-zero layout as the source (signed 24-bit positions).
    pos = np.rint(xyz*(1<<fractional)).astype('<i4')
    if np.abs(pos).max() >= 1<<23:
        raise ValueError("Position cannot be represented in SPZ v2")
    def byte(data):
        return np.clip(np.rint(data),0,255).astype(np.uint8).tobytes()
    buffers = [pos.view(np.uint8).reshape(-1,4)[:,:3].tobytes(),byte(opacity*255),
               byte((rgb.astype(float)-127.5)*(.15/.28209479)+127.5),
               byte((np.log(size)+10)*16), byte((quat[:,:3]+1)*127.5)]
    payload = gzip.compress(header+b''.join(chunk for pair in zip(old,buffers) for chunk in pair), compresslevel=6, mtime=0)
    path.write_bytes(payload)
    print(f'{path.name}: {len(xyz):,} additional splats, {len(payload):,} bytes')


def main():
    meta = json.loads((ASSETS/'scene.json').read_text())
    base = ASSETS/meta['variants']['full_res']['file']
    if hashlib.sha256(base.read_bytes()).hexdigest() != meta['variants']['full_res']['sha256']:
        raise ValueError("Marble world differs from the surveyed scene")
    with Image.open(APP/'dist/assets/desk-super-resolution-2x.jpg') as img:
        if img.size != (marble.W*2,marble.H*2):
            raise ValueError("Expected the full uncropped 2x photograph")
        image = np.asarray(ImageCms.profileToProfile(img, ImageCms.ImageCmsProfile(io.BytesIO(img.info['icc_profile'])),
                                                      ImageCms.createProfile('sRGB'),outputMode='RGB'))
    raw, xyz, alpha, packed_rgb, *_ = marble.read_spz(base)
    rotation, center, K = marble.camera(meta)
    scale = meta['semantics_metadata']['metric_scale_factor']
    ground = meta['semantics_metadata']['ground_plane_offset']
    local = (xyz*scale*[1,-1,-1]+[0,ground,0]-center) @ rotation
    uv = marble.project(local,K)
    camera = rotation, center, K, scale, ground
    carpet = build_carpet(uv, local, ground-xyz[:,1]*scale, alpha, packed_rgb, camera, image)
    layers = [carpet] + [build_surface(s,uv,local,alpha,camera,image) for s in SURFACES]
    OUTPUT.mkdir(parents=True,exist_ok=True)
    write_spz(OUTPUT/'desk-detail.spz',raw,layers)
    hybrid = gzip.decompress((APP/'dist/marble-refined-lab/assets/room-without-objects.spz').read_bytes())
    assert raw[:16+len(xyz)*9] == hybrid[:16+len(xyz)*9] and raw[16+len(xyz)*10:] == hybrid[16+len(xyz)*10:]
    write_spz(OUTPUT/'room-detail.spz',hybrid,layers[:-1])


if __name__ == '__main__':
    main()
