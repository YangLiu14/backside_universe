"""Build the photograph's registered world and a relocatable browser package."""
import os
import hashlib
import json
import struct
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

sys.path.insert(0, str(APP / 'scripts'))
from glb_textures import resize as resize_embedded_textures


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


def web_mesh(folder, asset, digest, face_limit=150000):
    if type(face_limit) is not int or not 1000 <= face_limit <= 150000:
        raise ValueError('网页模型面数上限应在 1000–150000 之间')
    if face_limit == 150000 and asset.stat().st_size <= 4_000_000:
        return asset
    script = Path(__file__).with_name('web_mesh.py')
    cache = folder / 'web-meshes'
    cache.mkdir(exist_ok=True)
    target = cache / (digest + '-' + sha(script)[:12] + '-' + str(face_limit) + '.glb')
    if not target.exists():
        partial = target.with_suffix('.partial.glb')
        blender = os.getenv('BLENDER_BIN', 'blender')
        subprocess.run([blender, '-b', '--python-exit-code', '1', '-P', script, '--', asset, partial, str(face_limit)], check=True)
        check_glb(partial)
        partial.replace(target)
    return target


def textured_web_mesh(folder, asset, digest, ratio, texture_size=None, *, distant=False, preserve_uv=False):
    """Simplify the indexed GLB while keeping coincident UV boundaries connected."""
    if type(ratio) not in (float, int) or not 0 < ratio <= 1:
        raise ValueError('webMeshRatio must be greater than zero and at most one')
    if texture_size is not None and (type(texture_size) is not int or not 256 <= texture_size <= 8192):
        raise ValueError('网页模型贴图尺寸应在 256–8192 之间')
    package_dir = APP/'node_modules/gltfpack'
    if not (package_dir/'cli.js').is_file():
        raise ValueError('Install the pinned mesh converter with npm ci in photo-demo')
    options = ['-si', str(ratio), '-se', '0.006', '-gn', '65', '-sv', '-noq']
    if preserve_uv:
        # Limit vertex / shading error while retaining the original UV islands on thin facades.
        options = ['-si', str(ratio), '-se', '0.03', '-sp', '-sv', '-vp', '16', '-vt', '16', '-vn', '12', '-gn', '65']
    elif distant:
        # Highly fragmented UV islands can otherwise keep hundreds of thousands
        # of triangles in a building that is only a few dozen pixels wide.
        options.append('-sa')
    signature = hashlib.sha256((' '.join(options) + sha(package_dir/'library.wasm')).encode()).hexdigest()[:16]
    if texture_size is not None:
        signature += '-' + str(texture_size) + '-' + sha(APP/'scripts/glb_textures.py')[:8]
    cache = folder/'web-meshes'
    cache.mkdir(exist_ok=True)
    target = cache/f'{digest}-gltfpack-{signature}.glb'
    if not target.exists():
        with tempfile.TemporaryDirectory(dir=cache) as work:
            partial = Path(work)/'mesh.glb'
            subprocess.run(['node', package_dir/'cli.js', '-i', asset, '-o', partial, *options], check=True)
            if texture_size is not None:
                resized = Path(work)/'resized.glb'
                if resize_embedded_textures(partial, texture_size, output=resized):
                    resized.replace(partial)
            check_glb(partial)
            partial.replace(target)
    return target


def overview_from_detail(folder, asset, texture_size, face_limit, *, preserve_uv=False, draco=False):
    if type(face_limit) is not int or face_limit < 1000:
        raise ValueError('远景面数上限须为至少 1000 的整数')
    with asset.open('rb') as model:
        _, _, _, json_size, _ = struct.unpack('<4sIIII', model.read(20))
        document = json.loads(model.read(json_size))
    triangles = sum(document['accessors'][p['indices']]['count'] // 3
                    for mesh in document['meshes'] for p in mesh['primitives'])
    ratio = min(1, face_limit / max(triangles, 1))
    if preserve_uv:
        geometry = textured_web_mesh(folder, asset, sha(asset), ratio, texture_size, preserve_uv=True)
        if not draco:
            return geometry
        script = Path(__file__).with_name('compress_overview.py')
        target = geometry.parent/f'{sha(geometry)}-{sha(script)[:16]}-draco.glb'
        if not target.exists():
            with tempfile.TemporaryDirectory(dir=geometry.parent) as work:
                partial = Path(work)/'compressed.glb'
                subprocess.run([os.getenv('BLENDER_BIN', 'blender'), '-b', '-t', '4', '--python-exit-code', '1',
                                '-P', script, '--', geometry, partial], check=True)
                check_glb(partial)
                partial.replace(target)
        return target
    geometry = textured_web_mesh(folder, asset, sha(asset), ratio, texture_size, distant=True)
    # Aggressive simplification of these scanned walls crosses UV islands. A
    # smaller copy of the old photo then pulls dark windows across large walls.
    # Transfer the high-detail material into new islands on the finished LOD.
    script = Path(__file__).with_name('bake_overview_material.py')
    pack = APP/'node_modules/gltfpack'
    options = ['-vp', '16', '-vt', '16', '-vn', '12', '-gn', '65']
    key = hashlib.sha256((' '.join(options) + sha(geometry) + sha(asset) + sha(script)
                          + sha(pack/'library.wasm')).encode()).hexdigest()
    target = geometry.parent/f'{key}-surface.glb'
    if not target.exists():
        with tempfile.TemporaryDirectory(dir=geometry.parent) as work:
            baked, partial = Path(work)/'baked.glb', Path(work)/'packed.glb'
            subprocess.run([os.getenv('BLENDER_BIN', 'blender'), '-b', '-t', '4', '--python-exit-code', '1',
                            '-P', script, '--', asset, geometry, baked, str(texture_size)], check=True)
            subprocess.run(['node', pack/'cli.js', '-i', baked, '-o', partial, *options], check=True)
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
        detail = brief.get('webDetailModels', {}).get(role)
        overview_size = detail.get('overviewTextureSize') if detail else None
        near_name = role + '-detail.glb'
        if overview_size:
            assets[near_name] = textured_web_mesh(folder, asset, job['sha256'], detail['ratio'], detail['textureSize'])
        if overview_size and detail.get('overviewFaceLimit'):
            assets[filename] = overview_from_detail(folder, assets[near_name], overview_size, detail['overviewFaceLimit'],
                                                   preserve_uv=detail.get('overviewPreserveUV', False),
                                                   draco=detail.get('overviewDraco', False))
        elif detail and not overview_size:
            assets[filename] = textured_web_mesh(folder, asset, job['sha256'], detail['ratio'], detail['textureSize'])
        elif 'webMeshRatio' in brief:
            assets[filename] = textured_web_mesh(folder, asset, job['sha256'], brief['webMeshRatio'], overview_size)
        else:
            assets[filename] = web_mesh(folder, asset, job['sha256'], brief.get('webFaceLimits', {}).get(role, 150000))
        scene['models'][role] = dict(file=filename, provider='Hi3D', task=job['task_id'],
            source_sha256=job['sha256'], sha256=sha(assets[filename]))
        if overview_size:
            scene['models'][role]['detail'] = dict(file=near_name, sha256=sha(assets[near_name]))
        if job.get('export'):
            scene['models'][role]['reference_sha256'] = job['export']['reference_sha256']
            scene['models'][role]['source_method'] = job['export']['method']
    parent = folder / 'releases'
    parent.mkdir(exist_ok=True)
    temp = Path(tempfile.mkdtemp(dir=parent))
    try:
        template = Path(__file__).parent / 'viewer'
        shutil.copytree(template, temp, dirs_exist_ok=True)
        for name, asset in assets.items():
            shutil.copyfile(asset, temp/name)
        if brief.get('experience'):
            case = APP/'cases'/brief['experience']
            shutil.copytree(case/'viewer',temp,dirs_exist_ok=True)
            if (case/'runtime.py').is_file():
                subprocess.run([sys.executable, case/'runtime.py', folder, temp],check=True)
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
