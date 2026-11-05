"""Run in the server clone. Create an auditable loader copy; upstream files stay intact."""
from pathlib import Path
import difflib
source=Path('app.py').read_text()
changes=[
 ('torch.randn(self.latent_patch_size ** 2, self.feat_dim, self.transformer.proj_out.weight.shape[1])', 'torch.randn(self.latent_patch_size ** 2, self.feat_dim, self.transformer.proj_out.weight.shape[1], device=weight.device)'),
 ('torch.zeros(self.latent_patch_size ** 2, self.feat_dim)', 'torch.zeros(self.latent_patch_size ** 2, self.feat_dim, device=bias.device)'),
 ('model_id = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"', 'model_id = os.environ["FLASHWORLD_WAN_PATH"]'),
 ('self.transformer = WanTransformer3DModel.from_pretrained(model_id, subfolder="transformer", torch_dtype=torch.float32).train().requires_grad_(False)',
  'from accelerate import init_empty_weights\n        with init_empty_weights(include_buffers=False):\n            self.transformer = WanTransformer3DModel.from_config(WanTransformer3DModel.load_config(model_id, subfolder="transformer")).train().requires_grad_(False)'),
 ('torch.load(ckpt_path, map_location="cpu", weights_only=False)', 'torch.load(ckpt_path, map_location="cpu", weights_only=False, mmap=True)'),
 ('self.transformer.load_state_dict(state_dict["transformer"])', 'assert all(v.dtype == torch.float32 for v in state_dict["transformer"].values() if v.is_floating_point()), "Checkpoint dtype differs from original FP32 destination"\n            print("Transformer strict load:", self.transformer.load_state_dict(state_dict["transformer"], strict=True, assign=True), flush=True)'),
 ('self.recon_decoder.load_state_dict(state_dict["recon_decoder"])', 'print("Decoder strict load:", self.recon_decoder.load_state_dict(state_dict["recon_decoder"], strict=True), flush=True)\n            del state_dict\n            assert not any(p.is_meta for p in self.transformer.parameters()), "Unloaded meta parameters"\n            assert not any(b.is_meta for b in self.transformer.buffers()), "Unloaded meta buffers"\n            assert all(torch.isfinite(b).all() for b in self.transformer.buffers()), "Nonfinite buffers"'),
]
patched=source
for old,new in changes:
 assert patched.count(old)==1, old
 patched=patched.replace(old,new)
Path('app_trial.py').write_text(patched)
Path('trial/loader.patch').write_text(''.join(difflib.unified_diff(source.splitlines(True),patched.splitlines(True),fromfile='app.py',tofile='app_trial.py')))
print('Created app_trial.py; strict checkpoint loading, no Wan transformer download, mmap CPU loading.')
