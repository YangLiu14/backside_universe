"""Persist one free quote per input and submit it only after explicit quote approval."""
import os
import time
from urllib.parse import urlsplit

import hi3d
import hi3d_mcp as mcp
from project import model_input, permitted, quote_expiry, roles, save, sha


def checked(call, state, job=None):
    acct = mcp.account(call)
    pin = state.get('mcp_fingerprint') or os.getenv('HI3D_MCP_USER_SHA256')
    if not pin or (state.get('account') and state['account'].casefold() != os.getenv('HI3D_ACCOUNT_EMAIL','').casefold()):
        raise ValueError('未绑定本作品指定账户：先运行 mcp-account 并按执行手册核对国际站邮箱')
    if acct['fingerprint'] != pin or (job and job.get('principal') != pin):
        raise ValueError('当前国际站 MCP 账户与已核对的账户不一致')
    return acct


def remaining_budget(state):
    return None if state['budget'] is None else state['budget'] - sum(
        j['credits'] for j in state['jobs'].values() if j['status'] != 'quoted')


def quote_step(folder,state,role,key,digest,call):
    remaining = remaining_budget(state)
    if remaining is not None and remaining <= 0:
        return [role,'budget_exceeded',0,remaining]
    acct = checked(call,state)
    q = mcp.quote(call,folder/'inputs'/(digest+'.png'),digest)
    cost = q.get('estimated_points')
    if type(cost) != int or cost <= 0 or not q.get('quote_id') or quote_expiry(q['expires_at']) <= time.time():
        raise ValueError('MCP 未返回有效报价')
    job = dict(role=role,input=digest,route='mcp',status='quoted',credits=cost,principal=acct['fingerprint'],
               quote_id=q['quote_id'],expires_at=q['expires_at'],can_submit=q.get('can_submit') is True)
    state['jobs'][key] = job
    save(folder/'run.json',state)
    return offer(state,key,job)


def offer(state,key,job):
    remaining = remaining_budget(state)
    if remaining is not None and job['credits'] > remaining:
        return [job['role'],'budget_exceeded',job['credits'],remaining]
    if not job['can_submit']:
        return [job['role'],'insufficient_hi3d_balance',job['credits']]
    return [job['role'],'confirm_mcp_quote',key,job['quote_id'],job['credits'],job['expires_at']]


def submit(folder,state,key,quote_id,call):
    job = state['jobs'].get(key,{})
    if job.get('route') != 'mcp' or job.get('status') != 'quoted' or job.get('quote_id') != quote_id:
        raise ValueError('不是当前待确认的 MCP 报价，请运行 tick')
    role = job['role']
    if (role not in roles(state['brief']) or job['input'] != model_input(state,role)
            or not permitted(state,role,time.time()) or quote_expiry(job['expires_at']) <= time.time()):
        raise ValueError('报价已过期或建模输入、审核状态已改变，请运行 tick')
    if not job['can_submit']:
        raise ValueError('Hi3D 标记此报价不可提交')
    remaining = remaining_budget(state)
    if remaining is not None and job['credits'] > remaining:
        raise ValueError('本次 MCP 报价超过作品预算')
    if checked(call,state,job)['available_points'] < job['credits']:
        raise ValueError('Hi3D 个人积分不足')
    job.update(status='submitting',confirmed_at=time.time())
    save(folder/'run.json',state)
    result = call('create_generation',quote_id=quote_id,confirmed=True)
    task = result.get('task_id')
    if (not isinstance(task,str) or not task or result.get('quote_id',quote_id) != quote_id or
            any(j.get('task_id') == task for j in state['jobs'].values())):
        raise ValueError('MCP 提交回执缺少匹配的任务 ID；请按原报价对账')
    job.update(status='submitted',task_id=task)
    save(folder/'run.json',state)
    return dict(next='run',task_id=task)


def recover(folder,state,key,task,call):
    job = state['jobs'][key]
    if job.get('route') != 'mcp' or job.get('status') != 'submitting':
        raise ValueError('此记录不需要恢复 MCP 提交')
    checked(call,state,job)
    info = call('get_task',task_id=task)
    if info.get('task_id') != task:
        raise ValueError('国际站任务 ID 不符')
    linked = info.get('quote_id')
    if not linked:
        records = call('list_tasks',limit=20).get('tasks',[])
        linked = next((x.get('quote_id') for x in records if x.get('task_id')==task),None)
    if linked != job['quote_id'] or any(j.get('task_id')==task for j in state['jobs'].values()):
        raise ValueError('无法从国际站回执唯一核对任务与原报价，保留记录，不重新提交')
    job.update(status='submitted',task_id=task)
    save(folder/'run.json',state)
    return dict(next='run',task_id=task)


def glb_url(data):
    # Only consume the task's model/download fields, never thumbnails or viewer pages.
    queue = [data]
    while queue:
        container = queue.pop(0)
        if isinstance(container,list):
            queue.extend(container)
            continue
        if not isinstance(container,dict):
            continue
        for key in ('model_download_url','download_url','glb_url','model_glb_url','model_url','url'):
            url = container.get(key)
            if not isinstance(url,str) or urlsplit(url).scheme != 'https':
                continue
            if key == 'url' and not (urlsplit(url).path.lower().endswith('.glb')
                    or str(container.get('format','')).lower()=='glb'):
                continue
            return url
        queue.extend(container.get(key) for key in ('outputs','result','models','files','model') if key in container)
    raise ValueError('MCP 任务未返回 GLB 下载地址，请核对原任务的 get_task_outputs')


def poll(folder,state,key,job,call):
    task = job['task_id']
    checked(call,state,job)
    data = call('get_task',task_id=task)
    if data.get('task_id') != task:
        raise ValueError('MCP 回执与原任务号不一致')
    status = str(data.get('status',data.get('state',''))).lower()
    if status in ('success','succeeded','completed','done'):
        outputs = call('get_task_outputs',task_id=task)
        if outputs.get('task_id',task) != task:
            raise ValueError('MCP 模型与原任务号不符')
        dest = folder/'models'/(key+'.glb')
        dest.parent.mkdir(exist_ok=True)
        stage = dest.with_suffix('.download')
        try:
            hi3d.download(glb_url(outputs),stage)
            digest = sha(stage)
            if job.get('sha256',digest) != digest:
                raise ValueError('同一 MCP 任务返回了与已归档原件不同的文件')
            stage.replace(dest)
        finally:
            stage.unlink(missing_ok=True)
            stage.with_suffix('.part').unlink(missing_ok=True)
        job.update(status='ready',file=str(dest.relative_to(folder)),sha256=digest,
                   export=dict(method='hi3d-intl-mcp',task=task,reference_sha256=job['input'],sha256=digest))
    elif status in ('failure','failed','error','canceled','cancelled'):
        job['status'] = 'failed'
    elif status in ('created','queued','queueing','pending','processing','running','submitted','in_progress','waiting'):
        delay = data.get('next_poll_after',8)
        if type(delay) in (int,float) and delay >= 0:
            job['poll_at'] = time.time()+max(delay,1)
        elif isinstance(delay,str):
            job['poll_at'] = quote_expiry(delay)
    else:
        raise ValueError(f'MCP 返回未知状态 {status[:32]}，请核对原任务')
    save(folder/'run.json',state)
    return [job['role'],job['status'],task]
