"""Offline regression checks for paid-job idempotency. Makes no network calls."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('marble', Path(__file__).with_name('marble-world.py'))
marble = importlib.util.module_from_spec(spec)
spec.loader.exec_module(marble)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        # Paid-job safeguards must also run in a clean clone without the photo.
        source = base / 'input.jpg'
        source.write_bytes(b'offline-test-photo')
        self.patches = [patch.object(marble, 'ASSETS', base/'assets'),
                        patch.object(marble, 'EVIDENCE', base/'evidence'),
                        patch.object(marble, 'STATE', base/'evidence/job.json'),
                        patch.object(marble, 'SOURCE', source),
                        patch.object(marble, 'EXPECTED_SOURCE', hashlib.sha256(source.read_bytes()).hexdigest()),
                        patch.object(marble, 'load_key', return_value='test-only-not-a-real-key'),
                        patch.object(marble, 'import_world'), patch('builtins.print')]
        for p in self.patches:
            p.start()
        self.args = argparse.Namespace(command='generate', operation_id=None)

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def test_lost_submit_response_never_resubmits(self):
        def api(route, key, payload=None):
            if route == '/credits':
                return {'remaining_credits': 2000}
            self.assertEqual(json.loads(marble.STATE.read_text())['status'], 'submitting')
            raise RuntimeError('Simulated timeout after provider accepted POST')
        with patch.object(marble, 'api_request', side_effect=api) as call:
            with self.assertRaises(RuntimeError):
                marble.run(self.args)
            with self.assertRaisesRegex(RuntimeError, 'Recover its operation ID'):
                marble.run(self.args)
            self.assertEqual(sum(c.args[0] == '/worlds:generate' for c in call.call_args_list), 1)

    def test_resume_does_not_submit_again(self):
        _, source = marble.source_record()
        marble.save_json(marble.STATE, {'source': source, 'operation_id': 'saved-operation', 'status': 'submitted'})
        with patch.object(marble, 'api_request', return_value={
            'done': True, 'response': {'world_id': 'world', 'assets': {'splats': {}}},
            'cost': {'total_credits': 1580}}) as call:
            marble.run(self.args)
            self.assertEqual([c.args[0] for c in call.call_args_list], ['/operations/saved-operation'])
            self.assertEqual(json.loads(marble.STATE.read_text())['status'], 'downloaded')

    def test_insufficient_balance_never_posts(self):
        with patch.object(marble, 'api_request', return_value={'remaining_credits': 1579}) as call:
            with self.assertRaisesRegex(RuntimeError, 'No generation submitted'):
                marble.run(self.args)
            self.assertEqual([c.args[0] for c in call.call_args_list], ['/credits'])
            self.assertFalse(marble.STATE.exists())

    def test_private_original_image_request(self):
        data, _ = marble.source_record()
        request = marble.build_request(data)
        self.assertEqual(request['model'], 'marble-1.1')
        self.assertFalse(request['permission']['public'])
        self.assertFalse(request['permission']['allow_id_access'])
        self.assertEqual(marble.base64.b64decode(request['world_prompt']['image_prompt']['data_base64']), data)
        self.assertFalse(request['world_prompt']['is_pano'])


if __name__ == '__main__':
    unittest.main()
