"""Run launch checks against one immutable candidate through the real album shell."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import importlib.util
from release_quality import APP, POLICY, stamp, check_contract, receipt_dir

spec=importlib.util.spec_from_file_location('album_release',Path(__file__).with_name('release-album.py'))
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('work');cli.add_argument('version');cli.add_argument('--store',type=Path,required=True)
    args=cli.parse_args();store=args.store.resolve()
    config=json.loads(release.CONFIG.read_text());pins=json.loads(release.PINS.read_text())
    if args.work not in config or not __import__('re').fullmatch('[0-9a-f]{24}',args.version):cli.error('Use a registered work and a full version hash')
    root=store/'releases'/args.work/args.version
    if release.digest_tree(root)!=args.version:raise ValueError('Candidate bytes differ from their version')
    probe=check_contract(root,config[args.work]['entry'])
    folder=receipt_dir(store,args.work,args.version);folder.mkdir(parents=True,exist_ok=True)
    # A failed or interrupted rerun invalidates earlier technical and visual approval.
    report=dict(work=args.work,version=args.version,policy=stamp(),status='running',errors=[])
    (folder/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    with tempfile.TemporaryDirectory(prefix='backside-release-') as tmp:
        candidate=Path(tmp);app=candidate/'app';scenes=candidate/'scenes';scenes.mkdir()
        release.build_app('https://backside-universe-scenes.netlify.app',app)
        (scenes/'releases').symlink_to(store/'releases',target_is_directory=True)
        (scenes/'catalog/art').mkdir(parents=True)
        pins[args.work]=args.version
        catalog,images=release.catalog_files(config,pins)
        for relative,source in images.items():shutil.copyfile(source,scenes/relative)
        (scenes/'catalog/works.json').write_text(json.dumps(catalog,ensure_ascii=False))
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        origin=f'http://127.0.0.1:{port}'
        process=subprocess.Popen(['node',str(APP/'scripts/serve.mjs'),'--album',str(app),'--scenes',str(scenes)],env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
        try:
            for attempt in range(50):
                try:
                    with urllib.request.urlopen(origin,timeout=1):break
                except OSError:time.sleep(.1)
            else:raise RuntimeError('Candidate server failed to start')
            env={**os.environ,'MARBLE_BASE_URL':origin,'RELEASE_WORK':args.work,'RELEASE_OUTPUT':str(folder),'RELEASE_POLICY':str(POLICY),
                 'RELEASE_PROBE':f'{origin}/releases/{args.work}/{args.version}/{probe}'}
            result=subprocess.run(['node',str(APP/'scripts/check-release.cjs')],env=env)
            measured=json.loads((folder/'browser-report.json').read_text())
            report.update(measured,status='pass' if result.returncode==0 and not measured['errors'] else 'fail')
        except Exception as error:
            report.update(status='fail',errors=[str(error)])
        finally:
            process.terminate();process.wait(timeout=10)
            (folder/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(folder/'report.json')
    if report['status']!='pass':raise SystemExit('Launch checks failed; current publication pins were not changed')

if __name__=='__main__':main()
