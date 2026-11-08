#!/usr/bin/env python3
"""One authorized Marble 1.1 job; durable resume, no automatic paid retries.

python3 scripts/marble-world.py prepare    # offline, no API call
python3 scripts/marble-world.py generate   # first submission, or resume saved job
python3 scripts/marble-world.py resume --operation-id ID
"""
import argparse
import base64
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

APP = Path(__file__).resolve().parents[1]
SOURCE = APP / 'dist/assets/desk-original.jpg'
EXPECTED_SOURCE = 'a5a2ad89c596347fb97f38b9741b2d5e831f657cefa33b4150d7709c8d9365a0'
ASSETS = APP / 'dist/marble-lab/assets'
EVIDENCE = APP / 'evidence/marble-lab'
STATE = EVIDENCE / 'job.json'
API = 'https://api.worldlabs.ai/marble/v1'
EXPECTED_CREDITS = 1580
MODEL = 'marble-1.1'
LABEL = 'Complete Desk'
STEM = 'desk'
SEED = 20261104
SIZE = (1320, 1739)
SOURCE_URL = '../../assets/desk-original.jpg'
SOURCE_PATH = 'dist/assets/desk-original.jpg'


def configure_canine():
    global SOURCE, EXPECTED_SOURCE, ASSETS, EVIDENCE, STATE, LABEL, STEM, SEED, SIZE, SOURCE_URL, SOURCE_PATH
    SOURCE_PATH = 'dist/canine-museum/assets/original.jpg'
    SOURCE = APP / SOURCE_PATH
    EXPECTED_SOURCE = '1c1a19fd7ba6aa9a0f7c538b1b3f94b1da02cdae1261f4f4e46fefa956f3ef0b'
    ASSETS = APP / 'dist/canine-museum/assets/marble'
    EVIDENCE = APP / 'evidence/canine-production/marble'
    STATE = EVIDENCE / 'job.json'
    LABEL, STEM, SEED, SIZE = 'Canine Museum', 'canine', 20261108, (1706, 1279)
    SOURCE_URL = '../original.jpg'


def save_json(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w') as f:
        if private:
            os.fchmod(f.fileno(), 0o600)
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def load_key():
    value = os.environ.get('WORLD_LABS_API_KEY', '').strip()
    if not value:
        path = APP / '.env.local'
        if path.exists():
            for line in path.read_text().splitlines():
                match = re.fullmatch(r'\s*(?:export\s+)?WORLD_LABS_API_KEY\s*=\s*(.*?)\s*', line)
                if match:
                    value = match[1].strip().strip('\"\'')
    if not value or value.lower() in ('your-key', 'your_api_key', 'replace-me'):
        raise RuntimeError('Configure WORLD_LABS_API_KEY in photo-demo/.env.local; do not send the key in chat.')
    return value


def api_request(route, key, payload=None):
    # API credentials go ONLY to the fixed official API, never asset-download URLs.
    req = Request(API + route, data=None if payload is None else json.dumps(payload).encode(),
                  headers={'WLT-Api-Key': key, 'Content-Type': 'application/json'},
                  method='GET' if payload is None else 'POST')
    try:
        with urlopen(req, timeout=60) as response:
            return json.load(response)
    except HTTPError as error:
        # Avoid printing provider error bodies which could echo request contents.
        raise RuntimeError(f'World Labs HTTP {error.code}; no automatic POST retry.') from None
    except (URLError, TimeoutError):
        raise RuntimeError('World Labs network error; no automatic POST retry. Resume the saved operation.') from None


def source_record():
    data = SOURCE.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED_SOURCE:
        raise RuntimeError('Source photo differs from the registered source photo.')
    if len(data) > 7_000_000:
        raise RuntimeError('Source exceeds this runner’s inline upload limit.')
    return data, {'sha256': digest, 'bytes': len(data), 'path': SOURCE_PATH}


def build_request(data):
    return {
        'display_name': f'Backside Universe - {LABEL} - Marble 1.1',
        'model': MODEL, 'seed': SEED,
        'permission': {'public': False, 'allow_id_access': False, 'allowed_readers': [], 'allowed_writers': []},
        'world_prompt': {'type': 'image', 'is_pano': False,
                         'image_prompt': {'source': 'data_base64', 'extension': 'jpg',
                                          'data_base64': base64.b64encode(data).decode()}}
    }


def public_status(status, message):
    save_json(ASSETS / 'status.json', {'status': status, 'message': message})


def download(url, name):
    if not isinstance(url, str) or not url.startswith('https://'):
        raise RuntimeError('Expected an HTTPS asset URL from World Labs.')
    target = ASSETS / name
    if not target.exists():
        partial = target.with_suffix(target.suffix + '.part')
        with urlopen(Request(url), timeout=60) as response, partial.open('wb') as output:
            expected_size = response.headers.get('Content-Length')
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if partial.stat().st_size == 0:
            raise RuntimeError('Received an empty asset.')
        if expected_size and partial.stat().st_size != int(expected_size):
            raise RuntimeError('Asset download incomplete. Resume the same job to retry downloading.')
        partial.replace(target)
    return {'file': name, 'bytes': target.stat().st_size,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}


def import_world(world, state):
    assets = world.get('assets') or {}
    splats = assets.get('splats') or {}
    urls = splats.get('spz_urls') or {}
    if not urls:
        raise RuntimeError('Completed world has no SPZ assets; preserve response and inspect before continuing.')
    semantics = splats.get('semantics_metadata') or {}
    scale, ground = semantics.get('metric_scale_factor'), semantics.get('ground_plane_offset')
    if not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0:
        raise RuntimeError('Missing/invalid metric scale. Do not guess scene scale.')
    if not isinstance(ground, (int, float)) or not math.isfinite(ground):
        raise RuntimeError('Missing/invalid ground-plane offset.')
    variants = {}
    for variant in ('full_res', '500k'):
        if urls.get(variant):
            variants[variant] = download(urls[variant], f'{STEM}-{variant}.spz')
    if not variants:
        raise RuntimeError('No recognized full_res/500k variant in response.')
    extras = {}
    for name, url, filename in [
        ('panorama', (assets.get('imagery') or {}).get('pano_url'), 'world-pano.jpg'),
        ('collider', (assets.get('mesh') or {}).get('collider_mesh_url'), 'world-collider.glb')]:
        if url:
            extras[name] = download(url, filename)
    manifest = {
        'status': 'generated', 'model': MODEL, 'source_sha256': state['source']['sha256'],
        'source_image': SOURCE_URL, 'width': SIZE[0], 'height': SIZE[1],
        'seed': SEED, 'input': 'complete unedited photo',
        'world_id': world.get('world_id'), 'operation_id': state['operation_id'],
        'cost': state.get('cost'), 'variants': variants, 'extras': extras,
        'semantics_metadata': semantics, 'coordinate_system': 'marble_raw_opencv',
        'calibration': None,
        'limitations': ['Generated unseen content is not observed ground truth.',
                       'Camera registration is required before judging source-view alignment.']
    }
    prior = ASSETS / 'scene.json'
    if prior.exists():
        old = json.loads(prior.read_text())
        if old.get('world_id') == manifest['world_id']:
            for field in ('calibration', 'renderer', 'review', 'limitations'):
                if field in old:
                    manifest[field] = old[field]
    save_json(prior, manifest)
    public_status('generated', '场景已生成，已载入本地配准记录。' if manifest['calibration'] else '场景已生成，等待原图机位校准。')


def validate_operation_id(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value or ''):
        raise RuntimeError('Invalid operation ID.')
    return value


def run(args):
    ASSETS.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    data, source = source_record()
    if args.command == 'prepare':
        request = build_request(data)
        request['world_prompt']['image_prompt']['data_base64'] = '[omitted; exact source SHA256 recorded]'
        save_json(EVIDENCE / 'request-preview.json', {'request': request, 'source': source,
                  'expected_credits': EXPECTED_CREDITS}, private=True)
        if not STATE.exists():
            public_status('awaiting_key', '尚未提交生成，等待本机配置 API key。')
        print('Offline request prepared. No upload or charge.')
        return
    key = load_key()
    state = json.loads(STATE.read_text()) if STATE.exists() else {'source': source, 'model': MODEL}
    if state['source']['sha256'] != source['sha256']:
        raise RuntimeError('Saved job belongs to another source. Refusing reuse or replacement.')
    if args.command == 'resume':
        operation_id = validate_operation_id(args.operation_id)
        if state.get('operation_id') not in (None, operation_id):
            raise RuntimeError('Saved job uses a different operation ID.')
        state.update(operation_id=operation_id, status='submitted')
        save_json(STATE, state, private=True)
    if not state.get('operation_id'):
        if state.get('status'):
            raise RuntimeError('A previous submission may have been accepted. Recover its operation ID from the platform; do not resubmit.')
        balance = api_request('/credits', key)['remaining_credits']
        if balance < EXPECTED_CREDITS:
            raise RuntimeError(f'Need at least {EXPECTED_CREDITS} API credits. No generation submitted.')
        state.update(status='submitting', submitted_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                     credits_before=balance, expected_credits=EXPECTED_CREDITS)
        save_json(STATE, state, private=True)  # Persist BEFORE the only paid POST.
        public_status('generating', '完整照片正在生成 Marble 1.1 场景。')
        operation = api_request('/worlds:generate', key, build_request(data))
        state.update(operation_id=validate_operation_id(operation.get('operation_id')), status='submitted')
        save_json(STATE, state, private=True)
        save_json(EVIDENCE / 'operation.json', operation, private=True)
        print('One generation submitted. Future invocations resume this operation.', flush=True)
    operation_id = validate_operation_id(state['operation_id'])
    for _ in range(180):
        operation = api_request('/operations/' + operation_id, key)
        save_json(EVIDENCE / 'operation.json', operation, private=True)
        if operation.get('done'):
            if operation.get('error'):
                state['status'] = 'failed'
                save_json(STATE, state, private=True)
                public_status('failed', '生成任务未成功，请检查本机任务记录。没有自动重试。')
                raise RuntimeError('Generation failed; no automatic new job. Details retained in private evidence.')
            world = operation.get('response') or {}
            if not world.get('assets') and world.get('world_id'):
                world = api_request('/worlds/' + validate_operation_id(world['world_id']), key)
            state.update(status='generated', world_id=world.get('world_id'), cost=operation.get('cost'))
            save_json(STATE, state, private=True)
            save_json(EVIDENCE / 'world-response.json', world, private=True)
            public_status('downloading', '场景已生成，正在下载本地资产。')
            import_world(world, state)
            state['status'] = 'downloaded'
            save_json(STATE, state, private=True)
            print(json.dumps({'status': 'downloaded', 'model': MODEL, 'cost': state.get('cost')}, ensure_ascii=False))
            return
        print('Generation in progress; polling existing operation.', flush=True)
        time.sleep(10)
    raise RuntimeError('Polling window ended. Run generate again to resume; no new paid job will be submitted.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'generate', 'resume'])
    parser.add_argument('--operation-id')
    parser.add_argument('--case', choices=['desk', 'canine'], default='desk')
    args = parser.parse_args()
    if args.case == 'canine':
        configure_canine()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with (EVIDENCE / 'runner.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another runner is active. Refusing a concurrent submission.') from None
        run(args)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print full HTTP request/response objects or a credentials-bearing traceback.
        print(str(error) if isinstance(error, RuntimeError) else f'{type(error).__name__}; inspect local files before resuming.', file=sys.stderr)
        sys.exit(1)
