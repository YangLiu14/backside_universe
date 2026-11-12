"""Advance one provider operation. Never resubmit an uncertain paid request."""
from contextlib import ExitStack
import time
from uuid import uuid4

import hi3d
import hi3d_mcp
import mcp_jobs
from exports import verified_archive
from project import job_key, model_input, permitted, release_reservation, release_stale_reservations, roles, save, sha


def check_account(state, account):
    if state.get('account') and (account or '').casefold() != state['account'].casefold():
        raise ValueError('官网登录邮箱与本作品指定账号不符')


def web_attempt(state, key, attempt):
    job = state['jobs'].get(key)
    if not job or job['route'] != 'web' or job.get('attempt', 'legacy') != attempt:
        raise ValueError('官网预留记录已失效，请重新读取当前任务')
    return job


def begin_click(state, key, attempt, cost, account):
    check_account(state, account)
    job = web_attempt(state, key, attempt)
    if job['status'] != 'reserved':
        raise ValueError('当前任务已进入提交阶段，请核对官网回执')
    if (job['role'] not in roles(state['brief']) or model_input(state, job['role']) != job['input']
            or not permitted(state, job['role'], time.time())):
        raise ValueError('作品已变化，请重新运行 tick')
    total = sum(j['credits'] for j in state['jobs'].values())
    if cost <= 0 or cost != job['credits'] or (state['budget'] is not None and total > state['budget']):
        raise ValueError('价格或预算已变化，请释放预留并按官网当前价格重新登记')
    job.update(status='submitting', click_started_at=time.time())


def release_web(state, key, attempt, rejected):
    job = web_attempt(state, key, attempt)
    if job['status'] == 'reserved':
        release_reservation(state, key, '点击前撤销')
    elif job['status'] == 'submitting' and rejected and rejected.strip():
        release_reservation(state, key, '官网已明确拒绝本次提交：' + rejected.strip())
    else:
        raise ValueError('只可撤销未开始点击的预留，或登记官网明确拒绝提交的回执')


def advance(folder, state, *, web_role=None, web_cost=None, client_factory=hi3d.Client, mcp_connect=hi3d_mcp.connect):
    # Open Codex only when an eligible role actually needs an MCP operation.
    with ExitStack() as stack:
        session = None
        def mcp_call(tool, **args):
            nonlocal session
            if session is None:
                session = stack.enter_context(mcp_connect())
            return session(tool, **args)
        return _advance(folder,state,web_role,web_cost,client_factory,mcp_call)


def _advance(folder, state, web_role, web_cost, client_factory, mcp_call):
    if state['route'] not in ('mcp','web','api') or (web_role and state['route'] != 'web'):
        raise ValueError('作品使用的 Hi3D 路径不匹配')
    if web_role and web_role not in roles(state['brief']):
        raise ValueError('此作品没有这个模型分件')
    before = len(state['jobs'])
    release_stale_reservations(state, time.time())
    if len(state['jobs']) != before:
        save(folder/'run.json', state)
    client = None
    result = []
    for role in roles(state['brief']):
        if web_role and role != web_role:
            continue
        digest = model_input(state, role)
        if not digest:
            result.append([role, 'needs_concept'])
            continue
        key = job_key(state, role)
        jobs = state['jobs']
        job = jobs.get(key)
        if job and job.get('status') == 'ready':
            if not verified_archive(job):
                result.append([role, 'verify_website_export', job['task_id']])
                continue
            path = folder / job['file']
            if path.exists() and sha(path) == job['sha256']:
                result.append([role, 'ready'])
                continue
            if job['route'] not in ('api','mcp'):
                raise ValueError(f'{role} 本地资产缺失或校验失败，请从同一 Hi3D 任务重新导入。')
            job['status'] = 'submitted'
        if not job:
            if not permitted(state, role, time.time()):
                result.append([role, 'awaiting_review' if state['hold'] else 'review_window'])
                continue
            if state['route'] == 'mcp':
                result.append(mcp_jobs.quote_step(folder,state,role,key,digest,mcp_call))
                continue
            if state['route'] == 'web' and not web_role:
                result.append([role, 'open_hi3d_workspace', str(folder / 'inputs' / (digest + '.png'))])
                continue
            cost = web_cost if web_role else hi3d.LIST_CREDITS
            if type(cost) is not int or cost <= 0:
                raise ValueError('需记录 Hi3D 当前显示的积分数')
            reserved = sum(item['credits'] for item in jobs.values())
            if state['budget'] is not None and reserved + cost > state['budget']:
                result.append([role, 'budget_exceeded', cost, state['budget'] - reserved])
                continue
            if not web_role:
                client = client or client_factory()
                if client.balance() < cost:
                    result.append([role, 'insufficient_hi3d_balance'])
                    continue
            job = dict(role=role, input=digest, route=state['route'], credits=cost, status='submitting')
            if web_role:
                job.update(status='reserved', attempt=uuid4().hex, reserved_at=time.time())
            jobs[key] = job
            save(folder / 'run.json', state)
            if web_role:
                result.append([role, 'web_begin_required', key, job['attempt']])
                continue
            job['task_id'] = client.submit(folder / 'inputs' / (digest + '.png'))
            job['status'] = 'submitted'
            save(folder / 'run.json', state)
        if job['route'] == 'mcp' and job['status'] == 'quoted':
            result.append(mcp_jobs.offer(state,key,job))
        elif job['route'] == 'mcp' and job['status'] == 'submitted':
            if job.get('poll_at',0) > time.time():
                result.append([role,'submitted',job['task_id']])
            else:
                result.append(mcp_jobs.poll(folder,state,key,job,mcp_call))
        elif job['status'] == 'reserved':
            result.append([role, 'web_begin_required', key, job['attempt']])
        elif job['status'] == 'submitting':
            step = [role, 'reconcile_existing_submission', key]
            if job['route'] == 'web':
                step.append(job.get('attempt', 'legacy'))
            elif job['route'] == 'mcp':
                step.append(job['quote_id'])
            result.append(step)
        elif job['status'] == 'failed':
            result.append([role, 'hi3d_failed', job['task_id']])
        elif job['route'] == 'web':
            result.append([role, 'resume_website_task', job['task_id']])
        elif job['route'] == 'api':
            client = client or client_factory()
            data = client.query(job['task_id'])
            status = data['state']
            if status == 'success':
                path = folder / 'models' / (key + '.glb')
                path.parent.mkdir(exist_ok=True)
                hi3d.download(data['url'], path)
                job.update(status='ready', file=str(path.relative_to(folder)), sha256=sha(path))
            elif status == 'failed':
                job['status'] = 'failed'
            elif status not in ('created', 'queueing', 'processing'):
                raise ValueError(f'Hi3D 返回未知状态 {status}')
            save(folder / 'run.json', state)
            result.append([role, job['status'], job['task_id']])
        else:
            raise ValueError('未知的 Hi3D 任务路径或状态')
    return result
