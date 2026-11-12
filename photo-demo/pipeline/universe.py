#!/usr/bin/env python3
"""Case runner for the Backside Universe creative skill. All paths are case-local."""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageOps

import hi3d_mcp
import mcp_jobs
from exports import import_web, reuse as reuse_model
from drive import album_installer, drive, verify
from production import advance, begin_click, check_account, release_web
from project import APP, config, identifier, init, release_stale_reservations, roles, locked, normalized_image, read, save, set_story, validate
from scene import package, room
from release_files import check_version


def parser():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--root', type=Path, default=APP/'evidence/universes')
    cli.add_argument('case', type=identifier)
    commands = cli.add_subparsers(dest='cmd', required=True)
    new = commands.add_parser('init')
    new.add_argument('photo', type=Path)
    new.add_argument('--via', choices=('mcp','web','api'), default='mcp')
    new.add_argument('--budget', type=int, default=os.getenv('UNIVERSE_HI3D_BUDGET') or None)
    commands.add_parser('story').add_argument('file', type=Path)
    for name in ('concept', 'shell-image'):
        commands.add_parser(name).add_argument('image', type=Path)
    part = commands.add_parser('part-image')
    part.add_argument('role',type=identifier)
    part.add_argument('image',type=Path)
    review = commands.add_parser('review')
    review.add_argument('decision', choices=('offered','hold','continue'))
    review.add_argument('--revision', help='Concept digest shown to the user')
    commands.add_parser('budget').add_argument('credits', help='作品可用的积分数，或 unlimited')
    real = commands.add_parser('room')
    real.add_argument('--method', choices=('local',), default='local')
    run = commands.add_parser('run')
    run.add_argument('--method', choices=('local',), default='local')
    commands.add_parser('tick')
    commands.add_parser('mcp-recent',help='List recent task receipts for recovery')
    commands.add_parser('mcp-account', help='Read the international personal account; works before init')
    paid = commands.add_parser('mcp-submit',help='Submit only after the user confirms this specific quote')
    paid.add_argument('key')
    paid.add_argument('quote_id')
    recover = commands.add_parser('mcp-recover',help='Match an uncertain submission to its original quote')
    recover.add_argument('key')
    recover.add_argument('task_id')
    web = commands.add_parser('web-reserve')
    web.add_argument('role', type=identifier)
    web.add_argument('--account', help='Email verified in the hi3d.ai workspace')
    web.add_argument('credits', type=int, help='Price displayed for this submission')
    begin = commands.add_parser('web-begin')
    begin.add_argument('key')
    begin.add_argument('attempt')
    begin.add_argument('credits', type=int)
    begin.add_argument('--account')
    release = commands.add_parser('web-release')
    release.add_argument('key')
    release.add_argument('attempt')
    release.add_argument('--rejected', help='Explicit website rejection of this submission')
    attach = commands.add_parser('attach-task')
    attach.add_argument('key', help='Reservation key returned by tick/web-reserve')
    attach.add_argument('task_id')
    attach.add_argument('--attempt', help='Current website click attempt')
    finish = commands.add_parser('web-result')
    finish.add_argument('key')
    finish.add_argument('file', type=Path, nargs='?')
    reuse = commands.add_parser('reuse')
    reuse.add_argument('role', type=identifier)
    reuse.add_argument('file', type=Path, nargs='?')
    origin = reuse.add_mutually_exclusive_group(required=True)
    origin.add_argument('--task', help='Task ID from a recorded international website export')
    origin.add_argument('--source', help='International Hi3D model URL including task ID')
    origin.add_argument('--catalog-id', help='Verified local Hi3D entry in the historical holiday asset catalog')
    commands.add_parser('status')
    commands.add_parser('build')
    commands.add_parser('qa')
    preview = commands.add_parser('preview')
    preview.add_argument('--port', type=int, default=9989)
    return cli


def execute(args):
    folder = args.root.resolve() / args.case
    if args.cmd == 'mcp-account':
        with hi3d_mcp.connect() as call:
            acct = hi3d_mcp.account(call)
        return dict(server=hi3d_mcp.SERVER,endpoint=hi3d_mcp.ENDPOINT,**acct,
                    matches_local_pin=acct['fingerprint']==os.getenv('HI3D_MCP_USER_SHA256'))
    if args.cmd == 'init':
        init(folder, args.photo, args.budget, args.via)
        return dict(project=str(folder), next='story')
    if not (folder/'run.json').is_file():
        raise ValueError('请先运行 init')
    if args.cmd == 'run':
        return drive(folder)
    if args.cmd == 'room':
        return room(folder, read(folder/'run.json'))
    if args.cmd in ('preview','qa'):
        release = read(folder/'release.json')
        site = folder/release['path']
        if args.cmd == 'qa':
            return dict(report=str(verify(folder,site)))
        check_version(site)
        installer = album_installer(folder)
        if installer:
            with locked(folder):
                subprocess.run([sys.executable,installer,'--project',folder],check=True)
            site = APP/'dist'
        os.execl(sys.executable,sys.executable,'-m','http.server',str(args.port),'--bind','127.0.0.1','--directory',str(site))
    with locked(folder):
        state = read(folder/'run.json')
        cmd = args.cmd
        if cmd == 'status':
            return state
        if cmd == 'story':
            set_story(folder, state, validate(read(args.file)))
            return dict(next='room + concept',shell=str(folder/'inputs'/(state['shell']+'.png')))
        if cmd == 'budget':
            credits = None if args.credits == 'unlimited' else int(args.credits)
            if credits is not None and credits < 0:
                raise ValueError('积分上限不能为负')
            state['budget'] = credits
        elif cmd in ('concept','shell-image','part-image'):
            if not state.get('brief'):
                raise ValueError('先保存已选故事')
            with Image.open(args.image) as img:
                digest = normalized_image(folder, ImageOps.exif_transpose(img).convert('RGBA'))
            if cmd == 'concept' and digest != state['concept']:
                state.update(concept=digest,offer=None,approved=None)
            elif cmd == 'part-image':
                if not state['concept'] or args.role not in roles(state['brief']) or args.role=='shell':
                    raise ValueError('请先保存概念图并选择内景组件')
                state.setdefault('references',{}).setdefault(state['concept'],{})[args.role]=digest
            elif cmd == 'shell-image':
                state['shell'] = digest
            release_stale_reservations(state, time.time())
            save(folder/'run.json', state)
            return dict(revision=digest, image=str(folder/'inputs'/(digest+'.png')))
        elif cmd == 'review':
            if args.revision and args.revision != state['concept']:
                raise ValueError('反馈引用旧概念图，请匹配当前版本')
            if args.decision == 'hold':
                state['hold'] = True
            elif not state['concept']:
                raise ValueError('尚无概念图')
            elif args.decision == 'offered' and state['offer'] is None:
                state['offer'] = time.time()
            elif args.decision == 'continue':
                state.update(hold=False, approved=state['concept'])
        elif cmd in ('mcp-submit','mcp-recover','mcp-recent'):
            if state['route'] != 'mcp':
                raise ValueError('本作品未选择 MCP 路径')
            with hi3d_mcp.connect() as call:
                if cmd == 'mcp-recent':
                    mcp_jobs.checked(call,state)
                    return [{k:t[k] for k in ('task_id','quote_id','status','created_at') if k in t}
                            for t in call('list_tasks',limit=20)['tasks']]
                if cmd == 'mcp-submit':
                    return mcp_jobs.submit(folder,state,args.key,args.quote_id,call)
                return mcp_jobs.recover(folder,state,args.key,args.task_id,call)
        elif cmd in ('tick','web-reserve'):
            if 'brief' not in state:
                raise ValueError('先选故事')
            if cmd == 'web-reserve' and state['route'] != 'web':
                raise ValueError('本作品未选择官网 web 路径')
            if cmd == 'web-reserve':
                check_account(state, args.account)
            return advance(folder,state,web_role=getattr(args,'role',None),web_cost=getattr(args,'credits',None))
        elif cmd == 'web-begin':
            begin_click(state, args.key, args.attempt, args.credits, args.account)
            save(folder/'run.json', state)
            return dict(next='click_generate_once', key=args.key, attempt=args.attempt)
        elif cmd == 'web-release':
            release_web(state, args.key, args.attempt, args.rejected)
        elif cmd == 'attach-task':
            job = state['jobs'][args.key]
            if job['route'] == 'mcp':
                raise ValueError('MCP 提交请用 mcp-recover 核对原报价和任务')
            if job.get('attempt') and job['attempt'] != args.attempt:
                raise ValueError('回执与本次官网提交不一致')
            if job['route'] == 'web' and any(k != args.key and j.get('route') == 'web'
                    and j.get('task_id') == args.task_id for k,j in state['jobs'].items()):
                raise ValueError('官网任务已绑定其他提交')
            if (job['status'] not in ('submitting','submitted','ready') or
                    job.get('task_id',args.task_id) != args.task_id or
                    not re.fullmatch(r'[a-zA-Z0-9._-]{1,200}', args.task_id)):
                raise ValueError('任务记录不匹配')
            if job['status'] != 'ready':
                job.update(status='submitted',task_id=args.task_id)
        elif cmd == 'web-result':
            import_web(folder, state, args.key, args.file)
        elif cmd == 'reuse':
            reuse_model(folder, state, args)
        elif cmd == 'build':
            return dict(site=str(package(folder,state)))
        release_stale_reservations(state, time.time())
        save(folder/'run.json',state)
        return dict(project=args.case,command=cmd,concept=state['concept'],held=state['hold'])


if __name__ == '__main__':
    config()
    try:
        print(json.dumps(execute(parser().parse_args()), ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        sys.exit('universe: '+str(error))
