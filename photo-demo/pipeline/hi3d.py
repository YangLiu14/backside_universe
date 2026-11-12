"""Hi3D international Open Platform. Credentials stay on the fixed API origin."""
import math
import os
import struct
from urllib.parse import urlsplit


API = 'https://api.hitem3d.ai/open-api/v1'
PARAMETERS = dict(model='hi3dv3.0', resolution='2048quality', request_type='3', pbr='1', format='2')
# hi3d.ai international API pricing, geometry + texture + PBR, 2026-11-11.
LIST_CREDITS = 45


def check_glb(path):
    with path.open('rb') as source:
        head = source.read(12)
    if len(head) != 12 or struct.unpack('<4sII', head) != (b'glTF', 2, path.stat().st_size):
        raise ValueError('下载文件不是完整的 GLB 2.0。')


def api_http():
    try:
        import requests
    except ImportError as error:
        raise ValueError('开放平台 API 需要 Python requests。') from error
    return requests


class Client:
    def __init__(self):
        key, secret = os.getenv('HI3D_CLIENT_ID'), os.getenv('HI3D_CLIENT_SECRET')
        if not key or not secret:
            raise ValueError('尚未配置国际站开放平台 HI3D_CLIENT_ID / HI3D_CLIENT_SECRET。官网工作区可使用 web 模式。')
        self.http = api_http()
        self.session = self.http.Session()
        data = self.request('POST', '/auth/token', json={}, auth=(key, secret))
        self.session.headers['Authorization'] = 'Bearer ' + data['accessToken']

    def request(self, method, route, **kwargs):
        try:
            result = self.session.request(method, API + route, timeout=(10, 90),
                                          allow_redirects=False, **kwargs)
        except self.http.RequestException as error:
            raise ValueError(f'Hi3D {route} 接口请求失败（{type(error).__name__}）') from error
        if result.status_code != 200:
            raise ValueError(f'Hi3D {route} HTTP {result.status_code}')
        body = result.json()
        if str(body.get('code')) != '200':
            raise ValueError(f"Hi3D {route} code {body.get('code')}")
        return body['data']

    def balance(self):
        amount = float(self.request('GET', '/balance')['totalBalance'])
        if not math.isfinite(amount) or amount < 0:
            raise ValueError('Hi3D returned an invalid balance')
        return amount

    def submit(self, image):
        if image.stat().st_size > 20 * 1024 * 1024:
            raise ValueError('单张建模输入超过 20 MiB')
        with image.open('rb') as source:
            data = self.request('POST', '/submit-task', data=PARAMETERS,
                                files={'images': ('reference.png', source, 'image/png')})
        task = data.get('task_id')
        if not isinstance(task, str) or not task.strip():
            raise ValueError('提交回执缺少 task_id，需要在平台核对')
        return task

    def query(self, task):
        data = self.request('GET', '/query-task', params={'task_id': task})
        if data.get('task_id') != task:
            raise ValueError('Hi3D returned a different task')
        return data


def download(url, target):
    if urlsplit(url).scheme != 'https':
        raise ValueError('Hi3D did not return an HTTPS download URL')
    # Signed asset URLs use a fresh, unauthenticated request.
    partial = target.with_suffix('.part')
    http = api_http()
    try:
        with http.get(url, stream=True, timeout=(15, 120)) as result:
            result.raise_for_status()
            with partial.open('wb') as output:
                for chunk in result.iter_content(1024 * 1024):
                    output.write(chunk)
    except http.RequestException as error:
        raise ValueError(f'Hi3D 模型下载失败（{type(error).__name__}）') from error
    check_glb(partial)
    partial.replace(target)
