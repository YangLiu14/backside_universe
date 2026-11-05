"""Compile/load the CUDA renderer before measuring generation."""
import torch
from gsplat import rasterization
means=torch.tensor([[0.,0.,3.]],device='cuda')
quats=torch.tensor([[1.,0.,0.,0.]],device='cuda')
scales=torch.full((1,3),.1,device='cuda')
opacity=torch.ones(1,device='cuda')
colors=torch.ones((1,3),device='cuda')
view=torch.eye(4,device='cuda')[None]
K=torch.tensor([[[50.,0.,32.],[0.,50.,32.],[0.,0.,1.]]],device='cuda')
r,a,_=rasterization(means,quats,scales,opacity,colors,view,K,64,64)
torch.cuda.synchronize()
assert r.shape==(1,64,64,3) and torch.isfinite(r).all() and a.max()>.5
print('CUDA rasterizer passed:', r.shape, 'max alpha', a.max().item())
