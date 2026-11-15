"""Align the actual generated meshes; fit the designated shoe to its photo mask."""
import hashlib,json,subprocess
from pathlib import Path
import numpy as np

REGISTRATION_ROLES = ('shell','interior','gate','bridge','shops')

def unit(v):
    return v/np.linalg.norm(v)
def horizontal_axes(points,role):
    up=np.array([0.,1.,0.])
    if role=='interior':
        _,axes=np.linalg.eigh(np.cov(points.T))
        up=axes[:,0]*np.sign(axes[1,0] or 1)
        direction=axes[:,-1]
    else:
        _,vectors=np.linalg.eigh(np.cov(points[:,[0,2]].T))
        direction=np.array([vectors[0,-1],0.,vectors[1,-1]])
    right=unit(np.cross(up,direction))
    mass=points@np.stack([right,up,direction]).T
    pos=(mass[:,2]-mass[:,2].min())/np.ptp(mass[:,2])
    low=mass[(pos>.14)&(pos<.30)]
    high=mass[(pos>.70)&(pos<.86)]
    if role=='shell':
        # The toe box is lower than the collar; the toe points toward local +Z.
        reverse=np.percentile(high[:,1],90)>np.percentile(low[:,1],90)
    elif role=='interior':
        # Forefoot is broader than heel on the generated last.
        reverse=np.ptp(high[:,0])<np.ptp(low[:,0])
    else:
        # Asset's longest horizontal axis must cross the road.
        sign=1 if direction[0]>=0 else -1
        return np.stack([direction*sign,up,-right*sign])
    if reverse:right,direction=-right,-direction
    return np.stack([right,up,direction])

def calibrate(folder):
    jobs=json.loads((folder/'run.json').read_text())['jobs']
    assets=sorted(j['sha256'] for j in jobs.values() if j['role'] in REGISTRATION_ROLES and j['status']=='ready')
    digest=hashlib.sha256(''.join(assets).encode()).hexdigest()[:14]
    sample=folder/('model-points-'+digest+'.npz')
    if not sample.exists():
        subprocess.run(['blender','-b','--python-exit-code','1','--python',Path(__file__).with_name('model-points.py'),'--',folder,sample],check=True)
    data=np.load(sample)
    rotations={}
    for role in REGISTRATION_ROLES:
        R=horizontal_axes(data[role],role)
        rotations[role]=R.round(8).tolist()
    shell_axes=np.array(rotations['shell'])
    p=data['shell']@shell_axes.T
    zmin,zmax=np.percentile(p[:,2],[.1,99.9])
    z=(p[:,2]-zmin)/(zmax-zmin)
    # Align on the two real load-bearing contact patches. The generated model has
    # excess rubber under the arch, below the plane passing through heel and forefoot.
    bands=[p[np.abs(z-u)<.035] for u in (.17,.83)]
    slope=(np.percentile(bands[1][:,1],3)-np.percentile(bands[0][:,1],3))/(bands[1][:,2].mean()-bands[0][:,2].mean())
    level=np.stack([[1,0,0],unit(np.array([0,1,-slope])),unit(np.array([0,slope,1]))])
    rotations['shell']=(level@shell_axes).tolist()
    bottom=np.mean([np.percentile((band@level.T)[:,1],3) for band in bands])
    sole=data['interior']@np.array(rotations['interior']).T
    sole=(sole-sole.min(axis=0))/np.ptp(sole,axis=0)-[.5,0,.5]
    x,z=sole[:,0]*.62,sole[:,2]*2
    profile=[]
    for station in np.linspace(-1,1,45):
        section=x[np.abs(z-station)<.026]
        if len(section)<6:
            section=x[np.argsort(np.abs(z-station))[:16]]
        l,r=np.percentile(section,[2,98])
        profile.append([float(station),float(l),float(r)])
    return {'orientations':rotations,'shellBottomY':float(bottom),'outsoleProfile':profile}
