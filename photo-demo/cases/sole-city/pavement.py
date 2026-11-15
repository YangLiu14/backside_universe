"""Project one continuous, locally repaired pour over the completed street network."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).parent
W, H = 1920, 4608
SPAN = .72


def finish_market_street(base, roughness, plan, pixel):
    """Age the different pours in place, from the west steps to the east drain."""
    x0, z0 = pixel(-.211, .064).astype(int)
    x1, z1 = pixel(.196, .357).astype(int)
    road = base[z0:z1, x0:x1]
    friction = roughness[z0:z1, x0:x1]
    rows, cols = road.shape
    y, x = np.mgrid[:rows, :cols].astype('float32')
    x = (x + x0 - W / 2) * SPAN / W
    z = (y + z0 - H / 2) * 2 / H
    rng = np.random.default_rng(303)
    def noise(step):
        grid = rng.standard_normal((rows // step + 2, cols // step + 2)).astype('float32')
        return cv2.resize(grid, (cols, rows), interpolation=cv2.INTER_CUBIC)

    mottling, fleck, silt = noise(16), noise(3), noise(54)
    scanned = road - cv2.GaussianBlur(road, (0, 0), 2.8)
    old_surface = np.clip((.29 + .19*silt + .19*mottling), 0, 1)
    # Broad era-to-era variation fades at the bounds of the detailed district.
    fade = np.clip(np.minimum.reduce([(z-.065)/.019, (.356-z)/.021,
                                      (x+.210)/.017, (.195-x)/.025]), 0, 1)
    road += fade * (5*silt + 1.6*mottling + old_surface*scanned*.33)
    friction[:] = friction - np.uint8(7*fade*old_surface)

    def stamp(points):
        return np.int32([pixel(a, b)-[x0, z0] for a,b in points])

    def patch(points, change, broom=False):
        # The edge follows the saw cut, except where a piece of old cement broke off.
        mask = np.zeros((rows, cols), np.uint8)
        corners = stamp(points)
        contour = []
        for a,b in zip(corners, np.roll(corners, -1, axis=0)):
            steps = max(2, int(np.linalg.norm(a-b) / 5))
            for t in np.linspace(0, 1, steps, endpoint=False):
                contour.append(a+(b-a)*t+rng.normal(0,.75,2))
        contour = np.int32(contour)
        cv2.fillPoly(mask, [contour], 255, lineType=cv2.LINE_AA)
        covered = cv2.GaussianBlur(mask, (3,3), .51).astype('float32')/255
        edging = np.zeros_like(mask)
        cv2.polylines(edging, [contour], True, 140, 1, cv2.LINE_AA)
        edge = cv2.GaussianBlur(edging, (3,3), .65)/255
        contrast = change - scanned*.28 + mottling*1.7
        if broom:
            # Trowelling at the stall and a stiffer transverse broom on recent infill.
            drag = noise(3)
            contrast += 5*cv2.GaussianBlur(drag, (31,3), 7, sigmaY=.48)
        road[:] += covered * contrast - edge*47
        friction[:] = np.clip(friction.astype('float32')-covered*(8 if broom else 15)-edge*17, 0, 255)

    # A large older pour at the bridge landing. The skewed edge stops at the next slab.
    patch([(-.192,.124),(-.132,.122),(-.116,.137),(-.129,.165),
           (-.172,.167),(-.179,.158),(-.193,.155)], -12)
    # A former water-main trench is visible on both sides of the rain grate.
    patch([(.059,.322),(.094,.321),(.121,.323),(.136,.321),
           (.148,.318),(.144,.324),(.119,.329),(.085,.326),(.061,.328)], -17, True)
    patch([(.145,.308),(.155,.307),(.163,.312),(.170,.314),
           (.169,.320),(.158,.318),(.146,.321)], 12, True)
    # Trapezoidal landing outside the stall, with a quieter brushed surface.
    patch([(.038,.209),(.057,.205),(.066,.222),(.061,.247),
           (.045,.246),(.037,.237)], 12, True)
    lid = min((c for c in plan['covers'] if c['type'] == 'lid'),
              key=lambda c: abs(c['z'] - .173))
    lx,lz = lid['x'],lid['z']
    patch([(lx-.011,lz-.011),(lx+.007,lz-.012),(lx+.012,lz-.007),
           (lx+.012,lz+.008),(lx+.005,lz+.012),(lx-.009,lz+.010)], 17)

    def fissure(points, strength):
        guide = stamp(points)
        line = []
        for a,b in zip(guide, guide[1:]):
            steps = max(2, int(np.linalg.norm(a-b)/4))
            for t in np.linspace(0, 1, steps, endpoint=False):
                line.append(a+(b-a)*t+rng.normal(0,.69,2))
        line.append(guide[-1])
        mask = np.zeros((rows, cols), np.uint8)
        cv2.polylines(mask, [np.int32(line)], False, 255, 1, cv2.LINE_AA)
        road[:] -= cv2.GaussianBlur(mask, (3,3), .56).astype('float32')/255*strength

    fissure([(lx+.010,lz-.006),(.019,.162),(.026,.160),(.030,.154)], 62)
    fissure([(.020,.162),(.018,.156),(.021,.153)], 45)
    fissure([(.148,.311),(.152,.315),(.156,.314),(.162,.320)], 54)
    fissure([(-.130,.163),(-.136,.173),(-.146,.177)], 48)
    fissure([(.052,.246),(.051,.252),(.056,.260)], 42)

    # The roof sheds onto the front edge of the counter. Follow its broken line,
    # then the low spot towards the existing shallow puddle on the main street.
    def strip(cx,cz,sx,sz):
        return np.exp(-((x-cx)/sx)**2-((z-cz)/sz)**2)
    pool = min((p for p in plan['pits'] if p.get('water')), key=lambda p:abs(p['z']-.20))
    ax,az,bx,bz=.053,.219,pool['x'],pool['z']
    t = np.clip(((x-ax)*(bx-ax)+(z-az)*(bz-az))/((bx-ax)**2+(bz-az)**2),0,1)
    # Water drains from the awning drip edge into the main-lane hollow. The
    # broad damp tail follows gravity and divides around the rough aggregate.
    sinuosity=np.sin(t*np.pi)*(.0016*np.sin(t*6.8)+.0006*silt)
    stream = np.exp(-((x-(ax+(bx-ax)*t))**2+(z-(az+(bz-az)*t)-sinuosity)**2)/(.004+.002*t)**2)
    grate = next(c for c in plan['covers'] if c['type']=='grate')
    # Soil compacts against the cast frame. The replaceable cement collar has
    # a few broken corners and the fine iron stain follows the drain's rotation.
    dx,dz=x-grate['x'],z-grate['z']
    ca,sa=np.cos(grate['angle']),np.sin(grate['angle'])
    frame_x=np.abs(ca*dx-sa*dz)-.775*grate['radius']
    frame_z=np.abs(sa*dx+ca*dz)-1.175*grate['radius']
    edge=np.maximum(frame_x,frame_z)
    irregular=.00042*mottling+.00026*fleck
    collar=np.exp(-((edge+irregular-.0010)/.0018)**2)
    soil=np.exp(-((edge+irregular-.00015)/.00075)**2)
    road[:] += collar*(12+7*fleck)-soil*(59+7*mottling)
    soil_rust=np.uint8(np.clip(soil*11,0,16))
    drip_x=.053+.0011*np.sin((z-.21)*164)+.00065*mottling
    runoff = .92*strip(drip_x,.224,.004,.028) + .85*stream
    runoff += .75*strip(grate['x'],grate['z']+.002,.035,.004)
    runoff += .65*strip(-.166,.144,.010,.014)
    wet = np.clip(runoff*(.82 + .18*mottling + .11*fleck),0,1)
    road[:] -= wet*(42+4*silt)
    values = np.minimum(friction, 241-164*wet)
    friction[:] = np.clip(values, 0, 255).astype('uint8')
    # Mineral staining and dark soil settle along the irregular drying front.
    road[:] += 3.2*np.exp(-((wet-.24)/.092)**2)*np.clip(runoff*3,0,1)
    return (slice(z0,z1),slice(x0,x1)),soil_rust


def age_street_pours(base, roughness, points, pixel):
    """Aprons drain toward the groove. Older aggregate and resurfaced utility cuts dry differently."""
    rng = np.random.default_rng(714)
    # Ends sit at actual frontages on the main lane, or at the lower part of a cross lane.
    for z, side, length, kind in [
        (-.887, -1, .041, 'apron'), (-.805, 1, .043, 'apron'),
        (-.7055, -1, .122, 'trench'), (-.587, -1, .037, 'apron'),
        (-.5365, 1, .105, 'trench'), (-.413, 1, .038, 'apron'),
        (-.1985, -1, .089, 'trench'), (-.092, -1, .037, 'apron'),
        (.4775, -1, .119, 'trench'), (.537, 1, .039, 'apron'),
        (.6465, 1, .088, 'trench'), (.805, -1, .040, 'apron')]:
        mid = np.interp(z, points[:, 0], points[:, 1:].mean(axis=1)) + .022*np.sin(5*z)
        start = mid + side*(.011 if kind=='trench' else .023)
        stop = start + side*length
        x0,y0 = pixel(min(start,stop)-.007,z-.040).astype(int)
        x1,y1 = pixel(max(start,stop)+.007,z+.040).astype(int)
        rows, cols = y1-y0,x1-x0
        yy,xx = np.indices((rows,cols),dtype='float32')
        x = (xx+x0-W*.5)*SPAN/W
        v = ((yy+y0-H*.5)*2/H-z)
        u = (x-start)/(stop-start)
        def noise(step):
            return cv2.resize(rng.normal(size=(rows//step+2,cols//step+2)).astype('float32'),
                              (cols,rows),interpolation=cv2.INTER_CUBIC)
        silt, fleck = noise(16),noise(3)
        face = base[y0:y1,x0:x1]
        gloss = roughness[y0:y1,x0:x1]
        if kind=='trench':
            # Offset joints and trowel marks in the narrow, hand-filled service strip.
            seam = v - .0028*np.sin(u*3.9) - .004*u
            width = .0036+.0018*(u>.46)+.00035*silt
            distance = np.maximum((abs(seam)-width), np.maximum(-u,u-1)*length)
            mask = np.clip(.5-distance/.00055,0,1)
            face += mask*(5.6+3*silt+3.3*fleck)-11*np.exp(-(distance/.00048)**2)
            gloss[:] = np.clip(gloss-mask*(12+2*silt),0,255)
        else:
            # Runoff widens near the kerbless lane. Leave the centre of the road dry.
            width = .006+.016*np.clip(1-u,0,1)
            outline = (abs(v-.005*np.sin(u*3.4))+.0016*silt)/width
            wet = np.clip((1-outline)*2.2,0,1)*np.clip(1-((u-.5)/.55)**4,0,1)
            wet *= np.clip(.76+.13*silt+.06*fleck,0,1)
            face -= wet*(20+4*silt)
            gloss[:] = np.minimum(gloss,245-80*wet)


def finish_tea_lane(base, roughness, old_seams, points, plan, pixel):
    """Hand-finished infills, settled utility collars and their surface slopes on the main lane."""
    def axis(z):
        return np.interp(z, points[:, 0], points[:, 1:].mean(axis=1)) + .022*np.sin(5*z)

    stations = np.linspace(.135, .918, 80)
    x0,z0 = pixel(axis(stations).min()-.035, stations[0]).astype(int)
    x1,z1 = pixel(axis(stations).max()+.035, stations[-1]).astype(int)
    region = np.s_[z0:z1,x0:x1]
    cement, grip = base[region], roughness[region]
    rows, cols = cement.shape
    zz, xx = np.indices((rows,cols), dtype='float32')
    x, z = (xx+x0-W*.5)*SPAN/W, (zz+z0-H*.5)*2/H
    rng = np.random.default_rng(831)

    def noise(step):
        grid = rng.standard_normal((rows//step+2,cols//step+2)).astype('float32')
        return cv2.resize(grid, (cols,rows), interpolation=cv2.INTER_CUBIC)

    pores, flint, trowel = noise(3), noise(9), noise(22)
    erased = cv2.GaussianBlur(old_seams[region],(3,3),.52)*.38
    grain = cement - cv2.GaussianBlur(cement, (0,0), 2.5)
    brush = cv2.GaussianBlur(pores,(25,3),6,sigmaY=.42)
    height = np.zeros_like(x)
    warmth = np.zeros_like(x)
    # Position the ends by their distance from the lane centre. The long slabs
    # enter from a frontage; a utility reinstatement cuts across the lane.
    repairs = [
        (.267, [(-.03,-.023),(-.006,-.021),(-.005,-.014),(.003,-.013),(.006,.015),
                (-.001,.030),(-.031,.029)],16, 1.5, True),
        (.365, [(-.014,-.012),(.024,-.019),(.031,-.014),(.027,.009),
                (.005,.014),(.003,.008),(-.012,.011)],-22, -2.2, False),
        (.452, [(-.030,-.020),(-.003,-.002),(.009,.002),(.016,.010),(.030,.014),
                (.028,.021),(.013,.016),(.007,.010),(-.006,.005),(-.030,-.011)],-12, 1.0, True),
        (.613, [(-.028,-.031),(.003,-.026),(.010,-.020),(.006,.008),
                (.010,.010),(.010,.021),(-.004,.030),(-.028,.026)],19, 2.0, True),
        (.753, [(.005,-.023),(.023,-.028),(.030,-.020),(.024,.020),
                (.010,.023),(.006,.010),(.002,.009)],-15, -1.8, False),
        (.879, [(-.027,-.010),(-.011,-.019),(.009,-.009),(.013,.002),
                (.003,.012),(.001,.009),(-.010,.017),(-.030,.016)],13, 1.1, False),
    ]
    def patch(coords, value, tint, brushed):
        vertices = [pixel(px,pz)-[x0,z0] for px,pz in coords]
        contour = []
        for a,b in zip(vertices, vertices[1:]+vertices[:1]):
            steps = max(2,round(np.linalg.norm(b-a)/4.5))
            for t in np.linspace(0,1,steps,endpoint=False):
                contour.append(a+(b-a)*t+rng.normal(0,.68,2))
        left, top = np.floor(np.min(contour,axis=0)-8).astype(int)
        right, bottom = np.ceil(np.max(contour,axis=0)+9).astype(int)
        local = np.s_[top:bottom,left:right]
        mask = np.zeros((bottom-top,right-left),np.uint8)
        cv2.fillPoly(mask,[np.int32(np.round(contour)-[left,top])],1)
        # Signed distance places the fractured joint, fines and receding surface
        # on the same boundary. Let stretches of the old joint close with dust.
        dist = (cv2.distanceTransform(mask,cv2.DIST_L2,5)-
                cv2.distanceTransform(1-mask,cv2.DIST_L2,5))*.00040
        dist += .00028*np.sign(-dist)
        grit = flint[local]
        edge = np.exp(-(dist/(.00046+.00014*np.clip(grit,-1,1)))**2)
        seam = edge*np.clip(.66+.23*grit+.13*trowel[local],.18,1.)
        coverage = np.clip(.5+dist/.00067,0,1)
        tone = (value + erased[local] + 3.7*trowel[local] + 2.4*grit +
                (4.6*brush[local]-.55*grain[local] if brushed else .33*grain[local]))
        cement[local] += coverage*tone - seam*29
        grip[local] = np.clip(grip[local]-coverage*(15 if brushed else 5)-seam*18,0,255)
        warmth[local] += coverage*tint
        height[local] += coverage*(.000065 if value>0 else -.000075)-seam*.00017
        height[local] += coverage*(.000035*brush[local] if brushed else .000037*pores[local])

    for cz, contour, change, tint, brushed in repairs:
        patch([(axis(cz+dz)+dx,cz+dz) for dx,dz in contour],change,tint,brushed)

    for lid in plan['covers']:
        if lid['type']!='lid' or not(stations[0] < lid['z'] < stations[-1]):
            continue
        dx, dz = x-lid['x'], z-lid['z']
        angle = np.arctan2(dz,dx)-lid['angle']
        radial = np.hypot(dx,dz)-lid['radius']
        # The cement around the casting has been reset with a pail of darker mix.
        # Part of the rim breaks away on the low side and exposes compacted grit.
        band = .0019+.00070*np.sin(3*angle+.6)+.00037*np.sin(7*angle)+.00028*flint
        collar = np.clip(.5+radial/.00065,0,1)*np.clip(.5+(band-radial)/.0009,0,1)
        open_joint = np.exp(-((radial-.00028)/.00052)**2)
        grit_edge = np.exp(-((radial-band)/.00062)**2)*np.clip(.48+.24*flint,0,1)
        cement += collar*(-12+7*pores+3*trowel)-open_joint*35-grit_edge*20
        grip[:] = np.clip(grip-collar*9-open_joint*18,0,255)
        warmth += collar*(1.8+.9*np.cos(angle))
        height += .000085*collar-.00021*open_joint-.00012*grit_edge

    dz,dx = np.gradient(cv2.GaussianBlur(height,(3,3),.64),2/H,SPAN/W)
    # In the road UV, +u is local +x while +v is local -z. Encoded slopes
    # supplement the fine normal tile only where one pour meets another.
    return region, warmth, -dx, dz


def build_pavement(out, profile):
    rng = np.random.default_rng(57)
    points = np.asarray(profile)
    plan = json.loads((HERE/'pavement-plan.json').read_text())
    for group in plan.values():
        for item in group:
            z = item['z']
            mid = np.interp(z, points[:, 0], points[:, 1:].mean(axis=1))
            item['x'] = round(mid + .022 * np.sin(5*z) + item.pop('offset'), 7)
    (out/'pavement.json').write_text(json.dumps(plan, separators=(',', ':')))

    def pixel(x, z):
        return np.array([(x/SPAN + .5)*W, (.5 + z/2)*H])

    def noise(rows, cols):
        grid = rng.normal(size=(rows, cols)).astype('float32')
        return cv2.resize(grid, (W,H), interpolation=cv2.INTER_CUBIC)

    # Preserve millimetre-scale grain separately in the moving ribbons' normal map.
    grain = cv2.imread(str(HERE/'cement-grain.jpg'), cv2.IMREAD_GRAYSCALE)
    y, x = np.indices((H, W), dtype='float32')
    u = (x * np.float32(SPAN/W/.035*grain.shape[1]))
    v = y * np.float32(2/H/.035*grain.shape[0])
    amount = np.clip(.48 + noise(62, 25)*.26, 0, 1)
    grain = (cv2.remap(grain, u % grain.shape[1], v % grain.shape[0], cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)*amount +
             cv2.remap(grain, (v*.87+137) % grain.shape[1], (-u*.87+63) % grain.shape[0], cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)*(1-amount))
    base = grain + noise(110, 51)*2.6 + noise(38, 17)*2.4 + noise(8, 4)*1.5
    detail = np.zeros((H,W), np.uint8)
    roughness = np.full((H,W), 240, np.uint8)

    # Poured slab joints wander a little. Many stop at an earlier pour or a frontage.
    for z in np.cumsum(rng.uniform(.070, .145, 21)) - 1.04:
        if z > 1: break
        slope = rng.uniform(-.10, .10)
        route = []
        for x0 in np.linspace(rng.uniform(-.31, -.018), rng.uniform(.025,.31), 175):
            route.append(pixel(x0, z + slope*x0 + .00027*np.sin(x0*109+z) + rng.normal(0,.00010)))
        cv2.polylines(detail, [np.int32(route)], False, int(rng.integers(30,84)), 1, cv2.LINE_AA)
    base -= cv2.GaussianBlur(detail, (3,3), .52)*.38

    for i, r in enumerate(plan['repairs']):
        cx, cz, w, h, angle = (r[k] for k in ('x','z','width','length','angle'))
        axes = np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
        corners = np.array([[-.48,-.5],[.5,-.47],[.46,.5],[-.5,.43]]) * [w,h]
        poly = []
        for a,b in zip(corners,np.roll(corners,-1,axis=0)):
            for t in np.arange(0,1,1/12):
                v = axes @ (a + (b-a)*t + rng.normal(0,.00048,2))
                poly.append(pixel(cx+v[0],cz+v[1]))
        contour = np.int32(poly)
        mask = np.zeros_like(detail)
        cv2.fillPoly(mask,[contour],255,lineType=cv2.LINE_AA)
        fade = cv2.GaussianBlur(mask,(5,5),.9)/255.
        new_tone = (base - 148)*.55 + (159,134,166,141,154,139)[i]
        base += (new_tone - base) * fade
        edge = np.zeros_like(detail)
        cv2.polylines(edge,[contour],True,255,2,cv2.LINE_AA)
        base -= cv2.GaussianBlur(edge,(3,3),.65)*.073

        # Hairline cracks can continue out of one ragged edge of an earlier repair.
        start = np.array(poly[12])
        path = [start.copy()]
        for _ in range(12):
            start += [rng.uniform(-3,2.5), rng.uniform(-3,-.8)]
            path.append(start.copy())
        edge.fill(0)
        cv2.polylines(edge,[np.int32(path)],False,110,1,cv2.LINE_AA)
        base -= edge*.18

    tea_lane,warmth,slope_x,slope_v = finish_tea_lane(base, roughness, detail, points, plan, pixel)

    # Rough, darker exposed aggregate on dry lips. The standing water has a
    # separate, level mesh inside this boundary, at the basin's water height.
    for pit in plan['pits']:
        cx, cz = pixel(pit['x'],pit['z'])
        rx, rz = pit['rx']*W/SPAN, pit['rz']*H/2
        ix0, ix1 = int(cx-1.6*rx), int(cx+1.6*rx)+1
        iz0, iz1 = int(cz-1.6*rz), int(cz+1.6*rz)+1
        dz,dx = np.indices((iz1-iz0,ix1-ix0))
        dx=(dx+ix0-cx)/rx
        dz=(dz+iz0-cz)/rz
        a=np.arctan2(dz,dx); seed=pit['seed']
        boundary=1+.13*np.sin(3*a+seed)+.065*np.sin(5*a-seed*.4)+.04*np.cos(8*a+.3*seed)
        r=np.hypot(dx,dz)/boundary
        inside=np.clip((1.06-r)/.2,0,1)
        chipped=np.exp(-((r-.89)/.16)**2)
        grain=rng.normal(0,8.0,size=r.shape)
        damp=0 if not pit.get('water') else np.clip((1.38-r)/.49,0,1)
        if pit.get('liveReflection'):
            shore=r+.09*np.sin(5*a+1.2)+.055*np.sin(7*a+2)
            edge_noise=cv2.GaussianBlur(grain.astype('float32'),(0,0),1.7)
            seep=np.clip((1.42-shore+.012*edge_noise)/.64,0,1)
            damp=seep*seep*(3-2*seep)
        base[iz0:iz1,ix0:ix1] += (-13+grain)*inside - 28*damp - 8*chipped
        grip = roughness[iz0:iz1,ix0:ix1]
        # Water in the depressions has a separate specular surface. The
        # surrounding porous cement darkens as it soaks up rain; most of its
        # microstructure remains even when saturated.
        wet_smoothing = 55 if pit.get('liveReflection') else 125
        grip[:] = np.minimum(grip,np.clip(240-wet_smoothing*damp,0,255))
    age_street_pours(base, roughness, points, pixel)
    market,iron_stain=finish_market_street(base, roughness, plan, pixel)
    # A physical-size chip detail tile supplements the street-wide survey at
    # the close viewing distance used for the rain grating. High-pass retains
    # exposed aggregate colours, without tiling the larger stains from the scan.
    scan=cv2.imread(str(HERE/'cement-grain.jpg'),cv2.IMREAD_GRAYSCALE).astype('float32')
    chips=np.clip((scan-cv2.GaussianBlur(scan,(0,0),4))*1.9+128,0,255)
    Image.fromarray(chips.astype('uint8')).save(out/'cement-minerals.jpg',quality=94)
    # Frequency matches the width of the thinnest drying fronts on this road.
    roughness = cv2.resize(roughness,(W//2,H//2),interpolation=cv2.INTER_AREA)
    response = np.zeros((H//2,W//2,3),np.uint8)
    response[:,:,1] = roughness
    for channel,slope in [(0,slope_x),(2,slope_v)]:
        survey = np.full((H,W),128,np.uint8)
        survey[tea_lane] = np.uint8(np.clip(128+127*slope,0,255))
        response[:,:,channel] = cv2.resize(survey,(W//2,H//2),interpolation=cv2.INTER_AREA)
    Image.fromarray(response).save(out/'cement-roughness.jpg',quality=96,subsampling=0)
    rgb = np.stack([base+1.2,base+.2,base-3.5],axis=2)
    rgb[tea_lane[0],tea_lane[1],0] += warmth
    rgb[tea_lane[0],tea_lane[1],2] -= warmth
    rgb[market[0],market[1],0] += iron_stain
    rgb[market[0],market[1],2] -= iron_stain*.5
    Image.fromarray(np.uint8(np.clip(rgb,0,255))).save(out/'poured-concrete.jpg',quality=91,subsampling=0)
