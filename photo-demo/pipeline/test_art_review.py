"""Exercise art targets across briefs, immutable releases and saved review snapshots."""
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from art_review import packet, read_or_record
from project import read, save, validate


class ArtReviewTests(unittest.TestCase):
    version = '0123456789abcdef'
    targets = [
        dict(id='counter', view='从柜台前向左横移', expect='后排抽屉从立柱后显露'),
        dict(id='floor', view='从入口斜看地面', expect='低处能见侧墙倒影'),
    ]

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        save(self.folder/'run.json', {'brief': {'artTargets': self.targets}})

    def build(self, manifest, version=None):
        version = version or self.version
        site = self.folder/'releases'/version
        site.mkdir(parents=True)
        (site/'index.html').touch()
        save(site/'scene.json', manifest)
        save(self.folder/'release.json', dict(version=version, path=f'releases/{version}'))
        qa = self.folder/'qa'/version
        qa.mkdir(parents=True)
        Image.new('RGB', (16, 12), 'white').save(qa/'view.jpg')
        save(qa/'report.json', dict(version=version, errors=[], report=[{'device':'desktop'}]))
        return qa

    def observation(self, target=None, verdict='pass'):
        check = dict(subject='近看主路线', evidence=['view.jpg'], verdict=verdict,
                     note='已从入口横移并检查前后遮挡')
        if target is not None:
            check['target'] = target
        return check

    def record(self, *checks):
        return read_or_record(self.folder, dict(version=self.version, checks=list(checks)), write=True)

    def test_brief_validation(self):
        brief = dict(title='t', story='s', subject='a', conceptPrompt='c', actionResult='r',
                     actionLabel='l', box=[.1, .2, .9, .9], layout='insert', action='light')
        self.assertNotIn('artTargets', validate(brief.copy()))
        self.assertEqual(validate(dict(brief, artTargets=self.targets))['artTargets'], self.targets)
        for invalid in (None, {}, [1], [{}], [dict(id='a', expect='x')], [dict(id='a', view='x', expect='  ')],
                        [self.targets[0], dict(self.targets[0], id=' counter ')]):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, 'artTargets'):
                validate(dict(brief, artTargets=invalid))

    def test_recovery_uses_frozen_targets(self):
        before = packet(self.folder)
        self.assertEqual(before['next'], 'build')
        self.assertEqual(before['art_targets'], self.targets)
        self.assertEqual(before['missing_targets'], ['counter', 'floor'])
        self.build({'artTargets':self.targets})
        shared_view = [self.observation('counter'), self.observation('floor')]
        self.assertEqual(self.record(*shared_view)['next'], 'reviewed')
        new_targets = [dict(id='window', view='由两侧看窗洞', expect='能看到同一间内室')]
        save(self.folder/'run.json', {'brief':{'artTargets':new_targets}})
        old = packet(self.folder)
        self.assertEqual((old['next'], old['art_targets']), ('reviewed', self.targets))
        self.build({'artTargets':new_targets}, 'ba9876543210fedc')
        current = packet(self.folder)
        self.assertEqual(current['missing_targets'], ['window'])
        self.assertEqual(current['next'], 'inspect_keyframes')
        self.assertEqual(current['previous_review'], f'qa/{self.version}/art-review.json')

    def test_partial_fix_and_snapshot_replacement(self):
        self.build({'artTargets':self.targets})
        partial = self.record(self.observation(), self.observation('counter'))
        self.assertEqual((partial['next'], partial['missing_targets']), ('inspect_keyframes', ['floor']))
        fixing = self.record(self.observation('floor', 'fix'))
        self.assertEqual((fixing['next'], fixing['missing_targets']), ('repair', ['counter']))
        resolved = self.record(self.observation('floor'), self.observation('counter'), self.observation())
        self.assertEqual((resolved['next'], resolved['missing_targets']), ('reviewed', []))
        self.assertEqual(packet(self.folder)['review']['checks'], resolved['review']['checks'])

    def test_invalid_binding_or_evidence_preserves_record(self):
        self.build({'artTargets':self.targets})
        prior = self.record(self.observation('counter'))
        for check in (self.observation('typo'), self.observation([]),
                      dict(self.observation('floor'), evidence=['wrong.jpg'])):
            with self.subTest(check=check), self.assertRaises(ValueError):
                self.record(check)
        self.assertEqual(packet(self.folder)['review'], prior['review'])

    def test_changed_evidence_and_failed_qa_cannot_complete(self):
        qa = self.build({'artTargets':self.targets})
        checks = [self.observation('counter'), self.observation('floor')]
        self.record(*checks)
        Image.new('RGB', (16,12), 'black').save(qa/'view.jpg')
        stale = packet(self.folder)
        self.assertTrue(stale['stale'])
        self.assertEqual((stale['next'], stale['missing_targets']), ('inspect_keyframes', ['counter', 'floor']))
        report = read(qa/'report.json')
        report['errors'] = ['missing texture']
        save(qa/'report.json', report)
        self.assertEqual(packet(self.folder)['next'], 'run_qa')
        with self.assertRaisesRegex(ValueError, '技术验收'):
            self.record(*checks)

    def test_existing_untargeted_review(self):
        qa = self.build({})
        legacy = self.record(self.observation())['review']
        self.assertNotIn('target', read(qa/'art-review.json')['checks'][0])
        result = packet(self.folder)
        self.assertEqual((result['art_targets'], result['missing_targets'], result['next']), ([], [], 'reviewed'))
        self.assertEqual(result['review'], legacy)


if __name__ == '__main__':
    unittest.main()
