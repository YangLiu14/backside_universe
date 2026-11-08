"""Prepare, submit once, and stage six independent Tripo jobs. No automatic top-ups.
prepare is a dry-run. generate requires the quoted balance for all outstanding
jobs. A lost submit response must be reconciled via tripo history, never retried.
"""
import argparse, fcntl, hashlib, json, os, shutil, struct, subprocess, tempfile
from pathlib import Path
APP=Path(__file__).resolve().parents[1]
ROOT=APP/'evidence/canine-production/tripo'
PUBLIC=APP/'dist/canine-museum/assets/organs'
IDS='heart lungs liver stomach kidney gut'.split()
def save(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=p.parent,mode='w',delete=False) as f:
        json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
    os.replace(f.name,p)
def cli(*args):
    cmd=([os.environ['TRIPO_CLI']] if os.getenv('TRIPO_CLI') else [shutil.which('tripo')] if shutil.which('tripo') else ['npx','--offline','--yes','--package','tripo-cli@0.11.2','tripo'])
    out=subprocess.run(cmd+list(map(str,args))+['--json','--no-open'],cwd=APP,stdout=subprocess.PIPE,check=True)
    return json.loads(out.stdout)
def read(p):return json.loads(p.read_text()) if p.exists() else {}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def make(k):return ['make',ROOT/k/'reference.png','--model','tripo-v3.1','-p','geometry_quality=detailed','-p','texture_quality=detailed','-p','pbr=true','--name','canine-'+k]
def inspect_glb(p):
    b=p.read_bytes()
    if len(b)<20 or struct.unpack_from('<4sII',b)!=(b'glTF',2,len(b)):raise ValueError('Invalid GLB')
    L,t=struct.unpack_from('<II',b,12)
    if t!=0x4E4F534A:raise ValueError('Missing glTF JSON')
    d=json.loads(b[20:20+L])
    prim=[x for m in d['meshes'] for x in m['primitives'] if x.get('mode',4)==4]
    if not prim or not all('POSITION' in x['attributes'] for x in prim):raise ValueError('No triangle surfaces')
    return sum(d['accessors'][x.get('indices',x['attributes']['POSITION'])]['count']//3 for x in prim)
def run(action):
    prior=read(PUBLIC/'catalog.json').get('organs',{})
    jobs={k:read(ROOT/k/'job.json') for k in IDS}
    for k in IDS:
        d=ROOT/k;ref=d/'reference.png';digest=sha(ref)
        plan=cli(*make(k),'--dry-run')
        if not plan.get('valid') or plan.get('warnings') or plan.get('errors') or plan.get('generation_credits_estimate',0)<=0:raise ValueError(k+' has no valid plan')
        plan['reference_sha256']=digest;save(d/'plan.json',plan)
        if jobs[k] and jobs[k]['reference_sha256']!=digest:raise RuntimeError(k+' input changed after submission')
    todo=[k for k in IDS if not jobs[k]]
    estimate=sum(read(ROOT/k/'plan.json')['generation_credits_estimate'] for k in todo)
    balance=cli('balance')['balance']
    print(f'{len(todo)} unsubmitted jobs: {estimate} credits; available: {balance}',flush=True)
    def publish():
        organs={}
        for k in IDS:
            j=jobs[k];old=prior.get(k,{})
            organs[k]={'provider':'Tripo3D','state':j.get('state','unsubmitted'),'reference_sha256':read(ROOT/k/'plan.json')['reference_sha256']}
            if j.get('task_id'):organs[k]['task_id']=j['task_id']
            # Publication is explicitly gated on a human/artist checking the
            # internal geometry in two oblique views of this exact artifact.
            if old.get('state')=='approved' and old.get('task_id') and old['task_id']==j.get('task_id') and old.get('sha256')==sha(PUBLIC/(k+'.glb')):organs[k]=old
        save(PUBLIC/'catalog.json',{'organs':organs})
    publish()
    if action=='prepare':return
    if any(j and not j.get('task_id') for j in jobs.values()):raise RuntimeError('Reconcile prior submit in tripo history before issuing any new jobs')
    if balance<estimate:todo=[]  # Resume existing paid work even with insufficient new credits.
    for k in todo:
        d=ROOT/k;j={'state':'submitting','reference_sha256':sha(d/'reference.png')};save(d/'job.json',j);jobs[k]=j
        result=cli(*make(k),'--no-wait');save(d/'submit.json',result)
        tid=result.get('task_id') or (result.get('task_ids') or [None])[0]
        if not tid:raise RuntimeError(f'Recover {k} ID from submit.json or tripo history')
        j.update(state='submitted',task_id=tid);save(d/'job.json',j);publish()
    for k,j in jobs.items():
        if not j or j.get('state')=='staged':continue
        if not j.get('task_id'):raise RuntimeError(f'Recover {k} task ID before resuming')
        d=ROOT/k;raw=d/'raw';raw.mkdir(exist_ok=True)
        cli('task','watch',j['task_id'],'--download','--out',raw,'--timeout',3600)
        files=sorted(raw.rglob('*.glb'),key=lambda p:p.stat().st_size,reverse=True)
        if not files:raise RuntimeError('No GLB: '+k)
        model=files[0];j.update(state='staged',triangles=inspect_glb(model),raw_sha256=sha(model));shutil.copy2(model,PUBLIC/(k+'.glb'));save(d/'job.json',j);publish()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['prepare','generate'])
    arg=p.parse_args();ROOT.mkdir(exist_ok=True,parents=True)
    with (ROOT/'run.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);run(arg.action)
