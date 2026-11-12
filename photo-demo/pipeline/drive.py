"""Run the independent photo and mesh work, then package and exercise the release."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import sys
import time

from release_files import check_version
from hi3d import Client
from production import advance
from project import APP, locked, permitted, read
from scene import package, pivot_of, room


def verify(folder, site):
    out = folder / 'qa' / site.name
    with locked(folder, 'qa-' + site.name):
        out.mkdir(parents=True, exist_ok=True)
        (out/'report.json').unlink(missing_ok=True)
        check_version(site)
        subprocess.run(['node',Path(__file__).with_name('verify.cjs'),site,out],check=True)
    return out/'report.json'


def album_installer(folder):
    if folder.parent != APP/'evidence/universes':
        return None
    script = APP/'cases'/folder.name/'install-album.py'
    return script if script.is_file() else None


def drive(folder):
    initial = read(folder/'run.json')
    if not initial.get('brief'):
        raise ValueError('先保存已选故事')
    client = None
    def service():
        nonlocal client
        if client is None:
            client = Client()
        return client
    with ThreadPoolExecutor(max_workers=1) as worker:
        reconstruction = worker.submit(room,folder,initial)
        while True:
            if reconstruction.done():
                reconstruction.result()
            with locked(folder):
                state = read(folder/'run.json')
                steps = advance(folder,state,client_factory=service)
                pending = {step[1] for step in steps if step[1]!='ready'}
                if state['hold']:
                    pending.add('awaiting_review')
                elif state['concept'] and state['offer'] is None and not state['approved']:
                    pending.add('invite_concept_review')
                elif state['concept'] and not permitted(state,'world',time.time()):
                    pending.add('review_window')
            if not pending:
                reconstruction.result()
                with locked(folder):
                    latest = read(folder/'run.json')
                    if latest != state:
                        continue
                    if pivot_of(latest['brief']) != pivot_of(initial['brief']):
                        return dict(next='run',reason='主体位置已修改，重新计算实景')
                    site = package(folder,latest)
                report = verify(folder,site)
                with locked(folder):
                    if read(folder/'run.json') != latest or folder/read(folder/'release.json')['path'] != site:
                        return dict(next='run',reason='验收期间作品已更新')
                    installer = album_installer(folder)
                    if installer:
                        subprocess.run([sys.executable,installer,'--project',folder],check=True)
                return dict(site=str(site),qa=str(report),next='inspect_keyframes')
            if not pending <= {'submitted','review_window'}:
                return dict(next=sorted(pending),tasks=steps)
            time.sleep(3 if 'review_window' in pending else 8)
