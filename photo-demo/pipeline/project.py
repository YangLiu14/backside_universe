"""Persist the photo, the selected story, review state and immutable inputs."""
import contextlib
from datetime import datetime
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import time

from PIL import Image, ImageOps

APP = Path(__file__).resolve().parents[1]
ROLES = ('shell', 'interior', 'world')


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def identifier(value):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', value):
        raise ValueError('作品 ID 使用小写字母、数字和短横线。')
    return value


def read(path):
    return json.loads(path.read_text())


def save(path, data):
    tmp = path.with_suffix('.tmp')
    with tmp.open('w') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    tmp.replace(path)


@contextlib.contextmanager
def locked(folder, name='run'):
    with (folder / (name + '.lock')).open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def config():
    for line in (APP / '.env.local').read_text().splitlines() if (APP / '.env.local').exists() else ():
        key, sep, value = line.strip().partition('=')
        if sep and key in ('HI3D_CLIENT_ID', 'HI3D_CLIENT_SECRET', 'HI3D_ACCOUNT_EMAIL', 'HI3D_MCP_USER_SHA256', 'UNIVERSE_HI3D_BUDGET'):
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def number(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def validate(brief):
    for key in ('title', 'story', 'subject', 'conceptPrompt', 'actionLabel', 'actionResult'):
        if not isinstance(brief.get(key), str) or not brief[key].strip():
            raise ValueError(f'创作规格缺少 {key}')
    box = brief.get('box')
    if not isinstance(box, list) or len(box) != 4 or not all(number(v, 0, 1) for v in box):
        raise ValueError('box must contain four normalized coordinates')
    if box[2] - box[0] < .015 or box[3] - box[1] < .015:
        raise ValueError('主体框太小或方向错误')
    if brief.get('layout') not in ('whole', 'insert'):
        raise ValueError('layout 须为 whole 或 insert')
    if brief.get('experience'):
        identifier(brief.get('action') or '')
    elif brief.get('action') not in ('light', 'chime', 'turn'):
        raise ValueError('通用播放器支持 light、chime 和 turn；专属动作用 experience 指定对应播放器')
    for key, default, low, high in [('revealDeg', 135, -180, 180), ('handoffDeg', 5, 1, 25),
                                     ('yaw', 0, -360, 360), ('pitch', 0, -90, 90), ('roll', 0, -180, 180),
                                     ('insertYaw', 0, -360, 360), ('insertScale', .55, .02, 1.5)]:
        brief.setdefault(key, default)
        if not number(brief[key], low, high):
            raise ValueError(f'invalid {key}')
    if abs(brief['revealDeg']) < brief['handoffDeg'] * 2:
        raise ValueError('揭示角度须给实景交接留出空间')
    brief.setdefault('focus', [0, 0, -.28])
    if len(brief['focus']) != 3 or not all(number(v, -1, 1) for v in brief['focus']):
        raise ValueError('focus is a three-component offset in subject-height units')
    parts = brief.get('props', [])
    if not isinstance(parts,list) or any(not isinstance(k,str) or k in ROLES or identifier(k)!=k for k in parts) or len(set(parts))!=len(parts):
        raise ValueError('props 必须是各不重复的模型 ID')
    experience = brief.get('experience')
    if experience is not None:
        if not isinstance(experience, str):
            raise ValueError('experience 须为已安装的案例名')
        case = APP/'cases'/identifier(experience)
        if not (case/'viewer/index.html').is_file() or not (case/'check.cjs').is_file():
            raise ValueError('专属案例需要 viewer/index.html 和 check.cjs')
    if parts and not experience:
        raise ValueError('独立活动道具需要对应的案例播放器')
    return brief


def init(folder, photo, budget, route):
    if budget is not None and budget < 0:
        raise ValueError('积分上限须大于或等于 0')
    folder.mkdir(parents=True, exist_ok=True)
    with locked(folder):
        digest = sha(photo)
        if (folder / 'run.json').exists():
            state = read(folder / 'run.json')
            if state['source']['sha256'] != digest:
                raise ValueError('此作品 ID 已关联另一张原照')
            return
        (folder / 'inputs').mkdir(exist_ok=True)
        shutil.copyfile(photo, folder / 'inputs' / 'original')
        with Image.open(photo) as opened:
            image = ImageOps.exif_transpose(opened).convert('RGB')
            if opened.format == 'JPEG' and opened.mode == 'RGB' and opened.getexif().get(274,1) == 1:
                shutil.copyfile(photo, folder / 'inputs/photo.jpg')
            else:
                image.save(folder / 'inputs/photo.jpg', quality=96, subsampling=0)
        save(folder / 'run.json', dict(version=1, source=dict(sha256=digest, size=image.size,
             working_sha256=sha(folder / 'inputs/photo.jpg')), route=route, budget=budget, account=os.getenv('HI3D_ACCOUNT_EMAIL'),
             **({'mcp_fingerprint': os.getenv('HI3D_MCP_USER_SHA256')} if route == 'mcp' else {}),
             jobs={}, concept=None, hold=False, offer=None, approved=None))


def normalized_image(folder, image):
    import io
    image.thumbnail((1600, 1600))
    output = io.BytesIO()
    image.save(output, 'PNG')
    data = output.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    path = folder / 'inputs' / (digest + '.png')
    if not path.exists():
        path.write_bytes(data)
    return digest


def set_story(folder, state, brief):
    old = state.get('brief', {})
    if any(old.get(k) != brief[k] for k in ('conceptPrompt', 'layout', 'subject', 'box')):
        state.update(concept=None, offer=None, approved=None)
    if old.get('box') != brief['box'] or not state.get('shell'):
        with Image.open(folder / 'inputs/photo.jpg') as photo:
            x1, y1, x2, y2 = brief['box']
            crop = photo.crop((int(x1*photo.width), int(y1*photo.height),
                               math.ceil(x2*photo.width), math.ceil(y2*photo.height)))
            state['shell'] = normalized_image(folder, crop)
    # The brief in run.json is authoritative across a crash between writes.
    state['brief'] = brief
    # Changing the creative input cancels only work that has not entered the website.
    release_stale_reservations(state, time.time())
    save(folder / 'run.json', state)
    save(folder / 'brief.json', brief)


def roles(brief):
    core = ('world',) if brief['layout'] == 'whole' else ('shell', 'interior')
    return core + tuple(brief.get('props', []))


def model_input(state, role):
    if role not in roles(state['brief']):
        raise ValueError('此作品没有这个模型分件')
    if role == 'shell':
        return state['shell']
    by_role = state.get('references',{}).get(state['concept'],{})
    return by_role.get(role, state['concept'] if role in ROLES else None)


def job_key(state, role):
    digest = model_input(state, role)
    if not digest:
        raise ValueError('须先保存概念图')
    return role + '-' + digest


def permitted(state, role, now):
    if role == 'shell':
        return True
    return bool(state['concept'] and not state['hold'] and
                (state['approved'] == state['concept'] or
                 state['offer'] is not None and now >= state['offer'] + 60))


def release_reservation(state, key, reason):
    job = state['jobs'].pop(key)
    state.setdefault('released', []).append(dict(job, key=key, reason=reason, released_at=time.time()))


def quote_expiry(value):
    if not isinstance(value,str):
        raise ValueError('MCP 报价未给出有效期')
    when = datetime.fromisoformat(value.replace('Z','+00:00'))
    if not when.tzinfo:
        raise ValueError('MCP 报价缺少时区')
    return when.timestamp()


def release_stale_reservations(state, now):
    for key, job in list(state['jobs'].items()):
        if job['status'] not in ('reserved','quoted'):
            continue
        if job['status'] == 'quoted':
            if quote_expiry(job['expires_at']) <= now:
                release_reservation(state, key, 'MCP 报价已过期')
                continue
        role = job['role']
        if (role not in roles(state['brief']) or model_input(state, role) != job['input']
                or not permitted(state, role, now)):
            release_reservation(state, key, '作品输入或审核状态已改变')
