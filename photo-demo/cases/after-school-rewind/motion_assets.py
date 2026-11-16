"""Stage editable-source-derived character animations without changing Hi3D masters."""
import hashlib
import json
import shutil
import struct
from glb_textures import resize


def stage_motion(folder, out):
    ready = folder / 'motion-repair' / 'ready'
    manifest = json.loads((ready / 'actor-motion.json').read_text())
    for role in ('walker', 'shooter'):
        entry = manifest[role]
        source = ready / entry['file']
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != entry['sha256']:
            raise ValueError(role + ' 动作候选与制作记录不一致')
        count = struct.unpack_from('<I', data, 12)[0]
        doc = json.loads(data[20:20+count])
        clips = {a.get('name') for a in doc.get('animations', [])}
        required = {entry['clip']}
        if entry.get('companionClip'):
            required.add(entry['companionClip'])
        if not doc.get('skins') or not required <= clips:
            raise ValueError(role + ' 导出缺少骨骼绑定或动画')
        target = out / entry['file']
        shutil.copyfile(source, target)
        mobile = out / entry['touchFile']
        if not resize(source, 4096, output=mobile):
            shutil.copyfile(source, mobile)
        entry['touchSha256'] = hashlib.sha256(mobile.read_bytes()).hexdigest()
    (out / 'actor-motion.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    shutil.copyfile(ready / 'MOTION-CREDITS.md', out / 'MOTION-CREDITS.md')
