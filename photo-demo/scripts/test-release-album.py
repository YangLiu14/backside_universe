"""Exercise the release CLI with a small scene store, without touching project pins."""
import json
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
        self.deploy = self.root / 'deploy'
        self.deploy.mkdir()
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

    def test_update_export_and_rollback(self):
        first = self.run_cli('pack', 'sample', '--record').stdout.split()[-1]
        (self.scene / 'index.html').write_text('local draft')
        draft = self.run_cli('pack', 'sample').stdout.split()[-1]
        (self.scene / 'index.html').write_text('second')
        second = self.run_cli('pack', 'sample', '--record').stdout.split()[-1]
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
        self.run_cli('pack', 'sample', '--record')
        history = self.deploy / 'published-scenes.json'
        pins = self.deploy / 'releases.json'
        before = (history.read_bytes(), pins.read_bytes())
        (self.scene / 'cover.webp').unlink()
        self.assertNotEqual(self.run_cli('pack', 'sample', '--record', check=False).returncode, 0)
        self.assertEqual((history.read_bytes(), pins.read_bytes()), before)


if __name__ == '__main__':
    unittest.main()
