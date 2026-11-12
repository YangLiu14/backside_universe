"""Call the project's international Hi3D MCP through Codex's existing OAuth session."""
import base64
import contextlib
import hashlib
import json
import queue
import re
import subprocess
import threading
import time

from project import APP, sha

SERVER = 'hi3d_intl'
ENDPOINT = 'https://agent.hi3d.ai/mcp'
PARAMS = dict(version='v3.0', model_type='high_quality', generation_type='model_with_texture',
              license='private', pbr=True)


@contextlib.contextmanager
def connect():
    cwd = APP.parent
    conf = subprocess.run(['codex','mcp','get',SERVER,'--json'],cwd=cwd,capture_output=True,timeout=15)
    if conf.returncode or (json.loads(conf.stdout).get('transport') or {}).get('url') != ENDPOINT:
        raise ValueError('请在此项目配置 hi3d_intl 为 https://agent.hi3d.ai/mcp')
    p = subprocess.Popen(['codex','app-server'],cwd=cwd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL,text=True)
    replies = queue.Queue()
    def collect():
        try:
            for line in p.stdout:
                message = json.loads(line)
                if 'id' in message:
                    replies.put(message)
        finally:
            replies.put(None)
    reader = threading.Thread(target=collect,daemon=True)
    reader.start()
    seq = 0
    def send(data):
        p.stdin.write(json.dumps(data)+'\n')
        p.stdin.flush()
    def request(method, params):
        nonlocal seq
        seq += 1
        send(dict(id=seq,method=method,params=params))
        deadline = time.monotonic()+100
        while True:
            try:
                msg = replies.get(timeout=max(0,deadline-time.monotonic()))
            except queue.Empty:
                raise ValueError(f'国际站 MCP {method} 超时，请从原记录续跑') from None
            if msg is None:
                raise ValueError('Codex MCP 连接中断，请从原记录续跑')
            if msg.get('id') == seq:
                if 'error' in msg:
                    raise ValueError(f'国际站 MCP {method} 失败，请核实 hi3d_intl 的 OAuth 连接')
                return msg['result']
    try:
        request('initialize',dict(clientInfo=dict(name='backside_universe',version='1'),
                                  capabilities=dict(experimentalApi=True)))
        send(dict(method='initialized'))
        thread = request('thread/start',dict(cwd=str(cwd),ephemeral=True))['thread']['id']
        inventory = request('mcpServerStatus/list',dict(threadId=thread,serverName=SERVER))
        if not any(s['name']==SERVER and 'get_account_context' in s['tools'] for s in inventory['data']):
            raise ValueError('国际站 MCP 未连接；在仓库根目录运行 codex mcp login hi3d_intl')
        def call(tool, **args):
            r = request('mcpServer/tool/call',dict(threadId=thread,server=SERVER,tool=tool,arguments=args))
            data = r.get('structuredContent')
            if not isinstance(data,dict) or not data:
                for block in r.get('content',[]):
                    if block.get('type') == 'text':
                        try:
                            data = json.loads(block['text'])
                        except ValueError:
                            continue
                        if isinstance(data,dict):
                            break
            if not isinstance(data,dict) or r.get('isError') or data.get('code'):
                code = data.get('code') if isinstance(data,dict) else None
                tag = code if isinstance(code,str) and re.fullmatch(r'[A-Z_0-9]{1,64}',code) else '无有效回执'
                raise ValueError(f'Hi3D MCP {tool}: {tag}')
            return data
        yield call
    finally:
        p.terminate()
        try:
            p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()
        reader.join(timeout=3)
        p.stdin.close()
        p.stdout.close()


def account(call):
    data = call('get_account_context')
    uid = data.get('user_id')
    if not uid or data.get('billing_source') != 'main_site_personal_points' or type(data.get('available_points')) != int:
        raise ValueError('Hi3D 没有返回可核对的个人账户与余额')
    return dict(fingerprint=hashlib.sha256(str(uid).encode()).hexdigest(),nickname=data['nickname'],
                available_points=data['available_points'])


def quote(call, image, expected_sha):
    if image.stat().st_size > 10*1024*1024 or sha(image) != expected_sha:
        raise ValueError('MCP 建模输入哈希不符或超过 10 MiB')
    upload = call('upload_input',image_base64=base64.b64encode(image.read_bytes()).decode(),mime_type='image/png')
    return call('quote_generation',file_tokens=[upload['file_token']],**PARAMS)
