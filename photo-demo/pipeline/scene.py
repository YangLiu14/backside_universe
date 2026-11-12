"""Build the photograph's registered world and a relocatable browser package."""
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile

from release_files import check_version, version_of
from hi3d import check_glb
from exports import verified_archive
from project import APP, job_key, locked, read, roles, save, sha


def pivot_of(brief):
    x1, y1, x2, y2 = brief['box']
    return [(x1+x2)/2, (y1+y2)/2]


def room(folder, state):
    mode = 'local'
    pivot = pivot_of(state['brief'])
    source = state['source']['working_sha256']
    output = folder / 'room'
    output.mkdir(exist_ok=True)
    with locked(folder, 'room'):
        if (output / 'registration.json').exists():
            record = read(output / 'registration.json')
            if (record['pivotUV'] == pivot and record['mode'] == mode and record['source_sha256'] == source
                    and (folder / record['file']).is_file() and sha(folder / record['file']) == record['sha256']):
                return record
        cache = folder/'depth'
        command = [sys.executable, APP/'scripts/generate-gaussian-lab.py', '--photo', folder/'inputs/photo.jpg',
                   '--cache-dir', cache, '--output-dir', output, '--edge-mode', 'nearest',
                   '--process-res', '504', '--output-res', str(min(650, round(960*state['source']['size'][1]/state['source']['size'][0]))),
                   '--device', os.getenv('UNIVERSE_DEPTH_DEVICE', 'mps' if platform.system() == 'Darwin' and platform.machine() == 'arm64' else 'cpu'),
                   '--pivot-uv', *map(str, pivot)]
        if (cache/'source-da3-base.npz').is_file() and (cache/'source-da3-base.json').is_file():
            command.append('--reuse-depth')
        subprocess.run(command, check=True)
        meta = read(output/'scene.json')
        asset = output/meta['gaussian_file']
        expected = meta['ply_sha256']
        if meta['source_sha256'] != source or expected != sha(asset):
            raise ValueError('实景资产与当前输入或来源记录不一致。')
        record = {k: meta[k] for k in ('intrinsics','width','height','pivot_opencv','rawToCamera','rawCenter',
                  'world_id','matches','median_residual_px','limitations') if k in meta}
        record.update(file=str(asset.relative_to(folder)), mode=mode, sha256=expected, source_sha256=source, pivotUV=pivot)
        save(output/'registration.json', record)
        return record


def web_mesh(folder, asset, digest):
    if asset.stat().st_size <= 4_000_000:
        return asset
    script = Path(__file__).with_name('web_mesh.py')
    cache = folder / 'web-meshes'
    cache.mkdir(exist_ok=True)
    target = cache / (digest + '-' + sha(script)[:12] + '.glb')
    if not target.exists():
        partial = target.with_suffix('.partial.glb')
        blender = os.getenv('BLENDER_BIN', 'blender')
        subprocess.run([blender, '-b', '--python-exit-code', '1', '-P', script, '--', asset, partial], check=True)
        check_glb(partial)
        partial.replace(target)
    return target


def package(folder, state):
    brief = state['brief']
    registration = read(folder/'room/registration.json')
    if registration['pivotUV'] != pivot_of(brief) or registration['source_sha256'] != state['source']['working_sha256']:
        raise ValueError('先按新的主体框运行 room')
    if state['hold'] or not state['concept']:
        raise ValueError('概念图尚未就绪或正在审核')
    scene = dict(version=1, **brief, photo='photo.jpg', room=dict(registration), models={})
    assets = {scene['photo']: folder/'inputs/photo.jpg'}
    scene['room']['file'] = 'room' + Path(registration['file']).suffix
    assets[scene['room']['file']] = folder / registration['file']
    if sha(assets[scene['room']['file']]) != registration['sha256']:
        raise ValueError('实景资产校验失败')
    for role in roles(brief):
        job = state['jobs'].get(job_key(state, role), {})
        if job.get('status') != 'ready':
            raise ValueError(f'{role} 的当前版本尚未完成')
        if not verified_archive(job):
            raise ValueError(f'{role} 的旧模型来源须先在官网重新导出并运行 reuse')
        asset = folder / job['file']
        if sha(asset) != job['sha256']:
            raise ValueError(f'{role} 文件校验失败，请恢复原任务')
        filename = role + '.glb'
        assets[filename] = web_mesh(folder, asset, job['sha256'])
        scene['models'][role] = dict(file=filename, provider='Hi3D', task=job['task_id'],
            source_sha256=job['sha256'], sha256=sha(assets[filename]))
        if job.get('export'):
            scene['models'][role]['reference_sha256'] = job['export']['reference_sha256']
            scene['models'][role]['source_method'] = job['export']['method']
    parent = folder / 'releases'
    parent.mkdir(exist_ok=True)
    temp = Path(tempfile.mkdtemp(dir=parent))
    try:
        template = Path(__file__).parent / 'viewer'
        shutil.copytree(template, temp, dirs_exist_ok=True)
        if brief.get('experience'):
            case = APP/'cases'/brief['experience']
            shutil.copytree(case/'viewer',temp,dirs_exist_ok=True)
            if (case/'runtime.py').is_file():
                subprocess.run([sys.executable, case/'runtime.py', folder, temp],check=True)
        for name, asset in assets.items():
            shutil.copyfile(asset, temp/name)
        shutil.copytree(APP/'dist/vendor', temp/'vendor', ignore=shutil.ignore_patterns('abyssal','mesh-bvh'))
        for name in ('spark.module.js','SPARK-LICENSE.txt'):
            shutil.copyfile(APP/'dist/gs-lab/vendor'/name, temp/'vendor'/name)
        save(temp/'scene.json', scene)
        version = version_of(temp)
        target = parent / version
        if target.exists():
            check_version(target)
        else:
            temp.rename(target)
        save(folder/'release.json', dict(path=str(target.relative_to(folder)), version=version))
        return target
    finally:
        if temp.exists():
            shutil.rmtree(temp)
