"""Bake sky and display-light visibility from the measured Hi3D meshes, in glTF space."""
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'dist/canine-museum/assets/digestion/light'
CELLS = 48
EXTENT = .54


def shell_voxels(path):
    with path.open('rb') as source:
        source.seek(12)
        length, _ = struct.unpack('<II', source.read(8))
        model = json.loads(source.read(length))
        source.read(8)
        content = source.read()
    primitive = model['meshes'][0]['primitives'][0]

    def array(accessor, dtype):
        description = model['accessors'][accessor]
        view = model['bufferViews'][description['bufferView']]
        start = view.get('byteOffset', 0) + description.get('byteOffset', 0)
        return np.frombuffer(content, dtype, view['byteLength']//np.dtype(dtype).itemsize, start)

    points = array(primitive['attributes']['POSITION'], '<f4').reshape(-1, 3)
    triangles = array(primitive['indices'], '<u4').reshape(-1, 3)
    field = np.zeros((CELLS, CELLS, CELLS), bool)

    def stamp(samples):
        cells = np.floor((samples + EXTENT)*(CELLS/(2*EXTENT))).astype(int)
        field[tuple(cells.T)] = True

    stamp(points)
    for start in range(0,len(triangles),100000):
        tri = points[triangles[start:start+100000]]
        stamp(tri.mean(axis=1))
        for a,b in ((0,1),(1,2),(2,0)):
            stamp((tri[:,a]+tri[:,b])*.5)
    return field


def visibility(occupied):
    # Trace once per voxel, independently of any visitor camera. Ignore the first
    # couple of cells: the surface shader also offsets its sample along the normal.
    size = len(occupied)
    rays = []
    for i in range(32):
        height = (i+.5)/32
        angle = 2*np.pi*i*.61803398875
        width = np.sqrt(1-height*height)
        rays.append([np.cos(angle)*width,height,np.sin(angle)*width])
    sky = np.zeros(occupied.shape, np.float32)
    for direction in rays:
        open_distance = np.ones_like(sky)
        for step in (2.5,4,6,9,13,18,25,34):
            dx,dy,dz = np.rint(np.multiply(direction,step)).astype(int)
            # Destination cells map to their shifted occluders; samples beyond
            # this object's volume face the open room.
            delta=(dx,dy,dz)
            target=tuple(slice(max(0,-d),min(size,size-d)) for d in delta)
            origin=tuple(slice(max(0,d),min(size,size+d)) for d in delta)
            weight=.46+.45*np.exp(-step/15)
            np.minimum(open_distance[target],1-weight*occupied[origin],out=open_distance[target])
        sky += open_distance / len(rays)

    # The display key is a broad softbox over the open +Z face, offset to
    # camera left. Separate its four corners to retain penumbrae behind the props.
    key = np.zeros_like(sky)
    for direction in ((-.52,.73,.52),(-.41,.65,.64),(-.15,.84,.52),(-.28,.55,.79)):
        visibility = np.ones_like(sky)
        for step in range(3,50,2):
            delta=np.rint(np.multiply(direction,step)).astype(int)
            target=tuple(slice(max(0,-d),min(size,size-d)) for d in delta)
            origin=tuple(slice(max(0,d),min(size,size+d)) for d in delta)
            visibility[target] *= ~occupied[origin]
        key += .25*visibility
    return gaussian_filter(sky,.58),gaussian_filter(key,.8)


def clay_finish():
    # Periodic height and roughness data for pressed and fired slip. The cloudy
    # slip and the fine pits work at different scales; no baked highlights.
    rng = np.random.default_rng(2416)
    uniform = rng.standard_normal((256, 256))
    def noise(width):
        field = gaussian_filter(uniform, width, mode='wrap')
        return field / field.std()
    pits = gaussian_filter((rng.random(uniform.shape) > .993).astype(float), 1.15, mode='wrap')
    height = np.clip(.53 + .075*noise(1.15) + .10*noise(7) - pits*2.2, 0, 1)
    rough = np.clip(.51 + .10*noise(2.5) + .09*noise(13) + pits, 0, 1)
    shape = np.stack((height, rough, height), axis=-1)
    Image.fromarray(np.uint8(255*shape+.5)).save(OUTPUT/'clay-finish.png', optimize=True)


def main():
    OUTPUT.mkdir(exist_ok=True)
    clay_finish()
    sources = {
      'gallery': ROOT/'evidence/canine-production/hi3d-organs',
      'channel': ROOT/'evidence/canine-production/hi3d-tract/animated/models'
    }
    for kind,folder in sources.items():
        for f in sorted(folder.glob('*/original.glb')):
            fields=visibility(shell_voxels(f))
            atlas=np.zeros((CELLS*6,CELLS*8,3),np.uint8)
            for plane in range(CELLS):
                x=(plane%8)*CELLS
                y=(plane//8)*CELLS
                for channel,field in enumerate(fields):
                    atlas[y:y+CELLS,x:x+CELLS,channel]=np.uint8(255*np.clip(field[:,:,plane].T,0,1)+.5)
            # Shared unused blue channel adopts sky for efficient PNG filtering.
            atlas[:,:,2]=atlas[:,:,0]
            target=OUTPUT/(kind+'-'+f.parent.name+'.png')
            Image.fromarray(atlas).save(target,optimize=True)
            print(target.name,flush=True)


if __name__ == '__main__':
    main()
