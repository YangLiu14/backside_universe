"""Instrument the official generator without changing its inference math."""
import argparse,hashlib,json,os,sys,time,resource
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--input',default='trial/input/desk-official.json')
p.add_argument('--output',default='trial/output/desk-official')
p.add_argument('--offload-vae',action='store_true')
p.add_argument('--seed',type=int,default=20261105)
args=p.parse_args()
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root));os.chdir(root)
paths=json.loads(Path('trial/model-paths.json').read_text())
os.environ['FLASHWORLD_WAN_PATH']=paths['wan_path']
os.environ['HF_HUB_OFFLINE']='1'
import numpy as np
import torch
from PIL import Image
from app_trial import GenerationSystem
from utils import normalize_cameras,export_gaussians,sample_from_dense_cameras
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
metadata=dict(status='loading',seed=args.seed,torch=torch.__version__,cuda=torch.version.cuda,gpu=torch.cuda.get_device_name(),offload_t5=True,offload_transformer_during_vae=True,offload_vae=args.offload_vae,source_commit='424db4487de308a39e5137afbe85e7568a96193f',model_paths=paths)
def record():
 metadata['host_peak_rss_gib']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2
 (out/'run.json').write_text(json.dumps(metadata,indent=2))
record()
torch.set_num_threads(8)
torch.manual_seed(args.seed);np.random.seed(args.seed)
t0=time.perf_counter()
model=GenerationSystem(ckpt_path=paths['checkpoint'],device=torch.device('cuda'),offload_t5=True,offload_transformer_during_vae=True,offload_vae=args.offload_vae)
torch.cuda.synchronize();metadata['model_load_seconds']=time.perf_counter()-t0
print('MODEL_LOADED',metadata['model_load_seconds'],flush=True)
data=json.loads(Path(args.input).read_text());n,h,w=data['resolution']
source=Path(data['image_prompt']);im=Image.open(source).convert('RGB');ow,oh=im.size
scale=max(h/oh,w/ow);nw,nh=int(w/scale),int(h/scale);left,top=(ow-nw)//2,(oh-nh)//2
im=im.crop((left,top,left+nw,top+nh)).resize((w,h));im.save(out/'conditioning.png')
camera_rows=[]
for c in data['cameras']:
 camera_rows.append(c['quaternion']+c['position']+[c['fx']*scale/w,c['fy']*scale/h,(c['cx']-left)*scale/w,(c['cy']-top)*scale/h])
cameras=torch.tensor(camera_rows,dtype=torch.float32)
image=torch.from_numpy(np.array(im)).float().permute(2,0,1)/255*2-1
metadata.update(status='generating',resolution=[n,h,w],image_index=data['image_index'],source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),input=data,crop_box=[left,top,left+nw,top+nh])
record()
# Reset RNG after loading to make initialization approach irrelevant to generation noise.
torch.manual_seed(args.seed);torch.cuda.manual_seed_all(args.seed)
torch.cuda.empty_cache();torch.cuda.reset_peak_memory_stats();torch.cuda.synchronize();t0=time.perf_counter()
try:
 scene,ref_w2c,T_norm=model.generate(cameras,n,image,data['text_prompt'],data['image_index'],h,w,video_path=None)
 torch.cuda.synchronize();metadata['generation_seconds']=time.perf_counter()-t0
 metadata['generation_peak_allocated_gib']=torch.cuda.max_memory_allocated()/1024**3
 metadata['generation_peak_reserved_gib']=torch.cuda.max_memory_reserved()/1024**3
 metadata.update(status='exporting',gaussian_count=scene.shape[0],ref_w2c=ref_w2c.cpu().tolist(),T_norm=T_norm.item())
 record();print('GENERATION_DONE',json.dumps(metadata),flush=True)
 # Render independently of generation timing. Render frame-by-frame to bound VRAM.
 normalized=normalize_cameras(cameras[None].cuda(),ref_w2c=ref_w2c,T_norm=T_norm)
 camera_export=normalized[0].cpu().clone();camera_export[:,4:7]*=T_norm.item()
 metadata['ply_cameras_wxyz_xyz_fxfycxcy']=camera_export.tolist()
 import imageio.v2 as imageio
 video_cameras=sample_from_dense_cameras(cameras.cuda(),torch.linspace(0,1,93,device='cuda'))[None]
 video_cameras=normalize_cameras(video_cameras,ref_w2c=ref_w2c,T_norm=T_norm)
 t0=time.perf_counter()
 with torch.no_grad(),torch.amp.autocast('cuda',dtype=torch.bfloat16):
  for i in [0,6,12,18,23]:
   rgb,_=model.recon_decoder.render([scene],normalized[:,i:i+1],h,w,bg_mode='white')
   pixels=rgb[0,0].clamp(-1,1).add(1).div(2).permute(1,2,0).mul(255).byte().cpu().numpy()
   Image.fromarray(pixels).save(out/f'view-{i:02d}.png')
  with imageio.get_writer(out/'orbit.mp4',fps=15,quality=8,macro_block_size=1) as writer:
   for i in range(video_cameras.shape[1]):
    rgb,_=model.recon_decoder.render([scene],video_cameras[:,i:i+1],h,w,bg_mode='white')
    writer.append_data(rgb[0,0].clamp(-1,1).add(1).div(2).permute(1,2,0).mul(255).byte().cpu().numpy())
 torch.cuda.synchronize();metadata['render_seconds']=time.perf_counter()-t0
 scene=scene.detach().cpu();t0=time.perf_counter()
 export_gaussians(scene,opacity_threshold=0,T_norm=T_norm,ply_path=str(out/'gaussians.ply'))
 metadata['ply_export_seconds']=time.perf_counter()-t0
 metadata['ply_bytes']=(out/'gaussians.ply').stat().st_size
 digest=hashlib.sha256()
 with (out/'gaussians.ply').open('rb') as f:
  for block in iter(lambda:f.read(8*1024**2),b''):digest.update(block)
 metadata['ply_sha256']=digest.hexdigest()
 metadata['status']='complete';record();print('COMPLETE',json.dumps(metadata),flush=True)
except Exception as e:
 metadata.update(status='failed',error=repr(e),elapsed_generation_seconds=time.perf_counter()-t0,peak_allocated_gib=torch.cuda.max_memory_allocated()/1024**3,peak_reserved_gib=torch.cuda.max_memory_reserved()/1024**3)
 record();raise
