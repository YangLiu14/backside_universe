"""Exercise the release CLI with a small scene store, without touching project pins."""
import json
import hashlib
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


class ReleaseWorkflow(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.cli = self.root / 'scripts/release-album.py'
        self.cli.parent.mkdir()
        shutil.copyfile(Path(__file__).with_name(self.cli.name), self.cli)
        source = Path(__file__).resolve().parents[1]
        for relative in ('scripts/release_quality.py', 'scripts/check-release.cjs', 'scripts/review-release.py',
                         'deploy/quality-policy.json', 'dist/cinema/premiere.css', 'dist/cinema/loading.js'):
            target=self.root/relative;target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source/relative,target)
        (self.root/'deploy/legacy-quality-pins.json').write_text('{}')
        self.deploy = self.root / 'deploy'
        self.deploy.mkdir(exist_ok=True)
        self.dist = self.root / 'dist'
        (self.dist / 'catalog').mkdir(parents=True)
        self.scene = self.dist / 'sample'
        self.scene.mkdir()
        (self.scene / 'index.html').write_text('first')
        (self.scene / 'cover.webp').write_bytes(b'sample cover')
        self.store = self.root / 'store'
        text = {'zh': '作品', 'en': 'Sample'}
        image = {'src': './sample/cover.webp', 'caption': text, 'alt': text}
        work = dict(id='sample', entry='./sample/index.html', title=text, theme=text,
                    description=text, front=image, back=image, strip=[])
        (self.dist / 'catalog/works.json').write_text(json.dumps({'works': [work]}))
        (self.deploy / 'scenes.json').write_text(json.dumps({
            'sample': {'entry': 'sample/index.html', 'files': ['sample/**/*']},
        }))
        for name in ('releases.json', 'published-scenes.json'):
            (self.deploy / name).write_text('{}')

    def run_cli(self, *args, check=True):
        return subprocess.run([sys.executable, self.cli, *args, '--store', self.store],
                              capture_output=True, text=True, check=check)

    def approve(self, version):
        # Synthetic passing evidence exercises the promotion guard, not browser performance.
        import sys
        sys.path.insert(0,str(self.cli.parent))
        sys.modules.pop('release_quality',None)
        import release_quality as quality
        folder=quality.receipt_dir(self.store,'sample',version);folder.mkdir(parents=True,exist_ok=True)
        report=dict(work='sample',version=version,policy=quality.stamp(),status='pass',errors=[])
        (folder/'report.json').write_text(json.dumps(report))
        checks=[]
        for name in json.loads(quality.POLICY.read_text())['requiredScreens']:
            data=('fixture '+name).encode();(folder/(name+'.png')).write_bytes(data)
            checks.append(dict(screen=name,verdict='pass',note='Fixture reviewed',sha256=hashlib.sha256(data).hexdigest()))
        (folder/'visual-review.json').write_text(json.dumps(dict(checks=checks,
            report_sha256=hashlib.sha256((folder/'report.json').read_bytes()).hexdigest())))
        sys.path.pop(0)
        return folder

    def release(self):
        version=self.run_cli('pack','sample').stdout.split()[-1]
        self.approve(version)
        self.run_cli('promote','sample',version)
        return version

    def test_update_export_and_rollback(self):
        first = self.release()
        (self.scene / 'index.html').write_text('local draft')
        draft = self.run_cli('pack', 'sample').stdout.split()[-1]
        (self.scene / 'index.html').write_text('second')
        second = self.release()
        self.run_cli('pack', 'sample', '--record')
        self.assertEqual(json.loads((self.deploy / 'published-scenes.json').read_text()),
                         {'sample': [first, second]})
        pins = self.deploy / 'releases.json'
        self.assertEqual(json.loads(pins.read_text()), {'sample': second})
        self.run_cli('catalog')
        snapshot = self.root / 'snapshot'
        self.run_cli('export-store', '--output', snapshot)
        versions = snapshot / 'releases/sample'
        self.assertEqual({path.name for path in versions.iterdir()}, {first, second})
        self.assertTrue((self.store / 'releases/sample' / draft).is_dir())
        archive = self.root / 'scenes.zip'
        self.run_cli('zip-store', '--output', archive)
        with zipfile.ZipFile(archive) as files:
            self.assertEqual(set(files.namelist()), {file.relative_to(snapshot).as_posix()
                             for file in snapshot.rglob('*') if file.is_file()})

        pins.write_text(json.dumps({'sample': first}))
        self.run_cli('catalog')
        entry = lambda base: json.loads((base / 'catalog/works.json').read_text())['works'][0]['entry']
        self.assertIn(first, entry(self.store))
        self.assertIn(second, entry(snapshot))
        (self.store / 'releases/sample' / second / 'sample/index.html').unlink()
        failed = self.root / 'incomplete'
        self.assertNotEqual(self.run_cli('export-store', '--output', failed, check=False).returncode, 0)
        self.assertFalse(failed.exists())

    def test_invalid_catalog_keeps_current_pin(self):
        self.release()
        history = self.deploy / 'published-scenes.json'
        pins = self.deploy / 'releases.json'
        before = (history.read_bytes(), pins.read_bytes())
        (self.scene / 'cover.webp').unlink()
        self.assertNotEqual(self.run_cli('pack', 'sample', '--record', check=False).returncode, 0)
        self.assertEqual((history.read_bytes(), pins.read_bytes()), before)



    def test_unreviewed_or_stale_release_cannot_promote(self):
        version=self.run_cli('pack','sample').stdout.split()[-1]
        before=(self.deploy/'releases.json').read_bytes()
        self.assertNotEqual(self.run_cli('pack','sample','--record',check=False).returncode,0)
        self.assertEqual((self.deploy/'releases.json').read_bytes(),before)
        folder=self.approve(version)
        (folder/'desktop-ready.png').write_bytes(b'changed screenshot')
        self.assertNotEqual(self.run_cli('promote','sample',version,check=False).returncode,0)
        self.approve(version)
        policy=self.deploy/'quality-policy.json';policy.write_text(policy.read_text()+'\n')
        self.assertNotEqual(self.run_cli('promote','sample',version,check=False).returncode,0)
        self.assertEqual((self.deploy/'releases.json').read_bytes(),before)

    def test_manually_changed_pin_cannot_export(self):
        self.release()
        (self.scene/'index.html').write_text('unreviewed draft')
        draft=self.run_cli('pack','sample').stdout.split()[-1]
        (self.deploy/'releases.json').write_text(json.dumps({'sample':draft}))
        history=json.loads((self.deploy/'published-scenes.json').read_text());history['sample'].append(draft)
        (self.deploy/'published-scenes.json').write_text(json.dumps(history))
        self.assertNotEqual(self.run_cli('catalog',check=False).returncode,0)
        self.assertNotEqual(self.run_cli('export-store','--output',self.root/'bad-export',check=False).returncode,0)
        self.assertFalse((self.root/'bad-export').exists())


if __name__ == '__main__':
    unittest.main()
