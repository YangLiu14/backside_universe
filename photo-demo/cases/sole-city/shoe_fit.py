"""Seat the shoe on its outsole and register the whole mesh with a similarity transform."""
import json
import struct

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree, Delaunay
from scipy.interpolate import LinearNDInterpolator
from PIL import Image


# Photo pixels around the physical upper. The cutout used for the Hi3D job
# includes part of the cast shadow and excludes the two long loose laces.
UPPER_OUTLINE = np.array([
    [432,388],[440,365],[450,352],[461,348],[472,348],[486,354],[503,369],
    [532,389],[555,406],[569,424],[577,437],[583,463],[588,481],[598,494],
    [616,501],[633,519],[644,536],[652,556],[662,582],[669,603],[671,619],
    [670,632],[663,645],[652,654],[636,658],[621,658],[602,656],[579,650],
    [557,642],[538,634],[522,621],[504,605],[491,583],[479,562],[469,544],
    [456,524],[447,504],[440,481],[432,455],[428,432],[427,415],[428,401],
])


def ground_outsole(points, normals, floor):
    # Compress only the excess rubber below the midsole. This monotonic map
    # has slope 1 at the seam and remains positive through the lowest tread.
    # Its strength varies smoothly between the heel, arch and ball of the foot.
    z = points[:, 2]
    seam = -.078
    depth = np.maximum(seam - points[:, 1], 0)
    def ramp(start, end):
        t = np.clip((z-start)/(end-start), 0, 1)
        return t*t*(3-2*t), 6*t*(1-t)/(end-start)
    heel_ramp, heel_slope = ramp(-.33, -.13)
    forefoot, fore_slope = ramp(.16, .32)
    heel = 1-heel_ramp
    arch = heel_ramp-forefoot
    required = 1/(seam-floor)-1/np.maximum(depth, 1.e-9)
    arch_strength = 1/(seam-floor-.006)-1/depth.max()
    strength = arch_strength*arch
    derivative = arch_strength*(heel_slope-fore_slope)
    for weight, slope in [(heel,-heel_slope), (forefoot,fore_slope)]:
        mask = weight > 1.e-8
        coefficient = ((required[mask]-strength[mask])/weight[mask]).max()
        strength += coefficient*weight
        derivative += coefficient*slope
    denom = 1+strength*depth
    if denom.min() <= 0:
        raise ValueError('Invalid outsole contact fit')
    points[:, 1] += depth-depth/denom
    # Inverse transpose of the local deformation gradient keeps the author's
    # smooth normals on the original UV seams and across the grounded sole.
    normals[:, 2] -= normals[:, 1]*depth**2*derivative
    normals[:, 1] *= denom**2
    normals /= np.linalg.norm(normals,axis=1)[:,None]


def register_pose(points, faces, anchors):
    unit = lambda value: value/np.linalg.norm(value)
    cam = np.array([0.,7.,4.4])
    back = unit(cam)
    up = np.cross(back, [1,0,0])
    half_fov = np.tan(np.radians(21))
    w,h = np.array(anchors['imageSize'])/2
    def on_floor(pixel):
        ray = -back+np.array([1,0,0])*(pixel[0]/w-1)*w/h*half_fov + up*(1-pixel[1]/h)*half_fov
        return cam-ray*cam[1]/ray[1]
    heel, toe = on_floor(anchors['heel']), on_floor(anchors['toe'])
    center, along, length = (heel+toe)/2, unit(toe-heel), np.linalg.norm(toe-heel)/2
    across = np.cross([0,1,0],along)
    def project(p, pose):
        scale, dx, dz, yaw = pose
        x,y,z = (scale*p).T
        c,s = np.cos(yaw),np.sin(yaw)
        offsets = np.outer(x*c+z*s+dx,across)+np.outer(y,[0,1,0])+np.outer(z*c-x*s+dz,along)
        off = center+length*offsets-cam
        depth = -(off@back)*half_fov
        return np.column_stack((w+h*off[:,0]/depth,h-h*(off@up)/depth))
    angles = np.linspace(0,2*np.pi,72,endpoint=False)
    directions = np.array([np.cos(angles),np.sin(angles)])
    reference = (UPPER_OUTLINE@directions).max(0)
    pose = [2.1,-.08,.11,-.06]
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15,15))
    for _ in range(4):
        uv = project(points,pose)
        raster = np.zeros((int(2*h),int(2*w)),np.uint8)
        for triangle in np.rint(uv[faces]).astype(np.int32):
            cv2.fillConvexPoly(raster,triangle,255)
        # Loose cords should not set the shoe's width. They still render intact.
        solid = cv2.morphologyEx(raster,cv2.MORPH_OPEN,kernel)
        contours = cv2.findContours(solid,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)[0]
        edge = max(contours,key=cv2.contourArea).reshape(-1,2)
        contour = points[np.unique(cKDTree(uv).query(edge)[1])]
        def error(t):
            return (project(contour,t)@directions).max(0)-reference
        pose = least_squares(error,pose,bounds=([1.75,-.4,-.4,-.36],[2.5,.4,.4,.36]),
                             loss='soft_l1',f_scale=4).x
    return pose


def handoff_texture(out):
    # Image correspondences from the registered, stationary source camera:
    # native render on the left, photographed shoe on the right. Both the
    # floor and the shoe sample this same 2D displacement through the handoff.
    # An identity border keeps the other shoe and surrounding boards fixed.
    crop = np.array([400,320])
    landmarks = np.array([
        [[57,34],[64,29]], [[29,67],[32,67]], [[26,121],[29,121]],
        [[92,42],[92,40]], [[146,95],[146,82]], [[166,133],[177,113]],
        [[79,173],[88,149]], [[145,132],[153,109]], [[88,193],[99,167]],
        [[154,160],[159,140]], [[102,219],[111,188]], [[170,178],[175,154]],
        [[116,229],[125,207]], [[180,201],[188,176]],
        [[127,246],[139,224]], [[192,218],[200,197]],
        [[148,264],[157,249]], [[199,233],[207,217]],
        [[163,282],[174,269]], [[214,244],[218,228]],
        [[245,312],[249,306]], [[211,343],[222,337]], [[254,330],[258,331]],
        [[267,306],[271,302]], [[263,250],[256,249]], [[237,206],[235,201]],
        [[154,324],[158,322]], [[111,277],[114,284]], [[84,227],[79,240]],
        [[78,201],[86,179]], [[78,244],[76,256]], [[81,272],[89,318]],
        [[95,281],[131,322]],
        [[191,133],[194,119]], [[217,153],[218,145]],
        [[255,187],[261,191]], [[292,231],[325,260]],
    ])+crop
    # The final part of the loose left lace fades with its photographed shadow.
    # Fixed timber samples stop that long strand from pulling the wood grain.
    wood = np.array([[30,350],[100,392],[170,396],[10,300],[195,384],[280,374],
                     [340,301],[332,72],[41,18],[-1,180]])+crop
    left,top,width,height = 385,308,379,416
    corners=np.array([[left,top],[left+width-1,top],[left+width-1,top+height-1],[left,top+height-1]])
    start = np.vstack([landmarks[:,0],wood,corners])
    end = np.vstack([landmarks[:,1],wood,corners])
    # Interpolate the inverse image lookup on triangles following both sets
    # of landmarks, including the small triangular region around each lace.
    triangles = Delaunay(start)
    def signed_area(p):
        t = p[triangles.simplices]
        return np.linalg.det(t[:,1:]-t[:,:1])
    if np.any(signed_area(start)*signed_area(end) <= 0):
        raise ValueError('Photo registration doubles back at a landmark')
    y,x = np.mgrid[top:top+height,left:left+width]
    pixels = np.stack([x,y],axis=-1)
    displacement = LinearNDInterpolator(triangles,end-start)(pixels)
    encoded = np.uint8(np.clip(np.rint(displacement)+128,0,255))
    image = np.dstack([encoded,np.zeros_like(x,dtype=np.uint8)])
    Image.fromarray(image).save(out/'shoe-handoff.png',optimize=True)
    return dict(file='shoe-handoff.png',rect=[left,top,width,height])


def fit_web_shoe(out, registration, anchors):
    raw = (out/'shell.glb').read_bytes()
    size = struct.unpack_from('<I',raw,12)[0]
    doc = json.loads(raw[20:20+size])
    binary = bytearray(raw[28+size:])
    primitive = doc['meshes'][0]['primitives'][0]
    def attribute(index,columns):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']])
        return np.ndarray((a['count'],columns),dtype=dtype,buffer=binary,
            offset=view.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(view.get('byteStride',columns*dtype.itemsize),dtype.itemsize))
    attrs = primitive['attributes']
    positions = attribute(attrs['POSITION'],3)
    normals = attribute(attrs['NORMAL'],3)
    faces = attribute(primitive['indices'],1).reshape(-1,3)
    axes = np.array(registration['orientations']['shell'])
    points = positions@axes.T
    directions = normals@axes.T
    ground_outsole(points,directions,registration['shellBottomY'])
    midpoint = (points.min(0)+points.max(0))/2
    midpoint[1] = points[:,1].min()
    points -= midpoint
    pose = register_pose(points,faces,anchors)
    registration['shoeFit'] = dict(model='running-shoe.glb',handoff=handoff_texture(out),scale=pose[0],offsetX=pose[1],
            offsetZ=pose[2],yaw=pose[3],length=float(np.ptp(points[:,2])))
    positions[:] = points
    normals[:] = directions
    bounds = doc['accessors'][attrs['POSITION']]
    bounds.update(min=positions.min(0).tolist(), max=positions.max(0).tolist())
    header = json.dumps(doc,separators=(',',':')).encode()
    header += b' '*(-len(header)%4)
    glb = struct.pack('<4sIIII',b'glTF',2,28+len(header)+len(binary),len(header),0x4e4f534a)
    (out/'running-shoe.glb').write_bytes(glb+header+struct.pack('<II',len(binary),0x004e4942)+binary)
