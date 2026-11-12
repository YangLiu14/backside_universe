"""Recovery, review and budget regressions; never contacts a live provider."""
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from PIL import Image

from production import advance
from project import init, read, save, set_story, validate


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)/'case'
        photo = self.root.parent/'a.png'
        Image.new('RGB',(80,60),'red').save(photo)
        init(self.root,photo,90,'api')
        self.state=read(self.root/'run.json')
        brief = dict(title='t',story='s',subject='a',conceptPrompt='c',actionResult='result',actionLabel='act',
                     box=[.1,.2,.9,.9],layout='insert',action='light')
        set_story(self.root,self.state,validate(brief))
        self.state['concept']=hashlib.sha256(b'new concept').hexdigest()
        self.client=Mock()
        self.client.balance.return_value=300
        self.client.submit.return_value='job1'
        self.client.query.return_value={'state':'processing'}

    def step(self):
        return advance(self.root,self.state,client_factory=lambda:self.client)

    def test_shell_independent_and_review_grace(self):
        self.state['hold']=True
        self.assertEqual(self.step()[1][1],'awaiting_review')
        self.state['hold']=False
        self.state['offer']=100
        with patch('production.time.time',return_value=159):
            self.assertEqual(self.step()[1][1],'review_window')
        with patch('production.time.time',return_value=160):
            self.assertEqual(self.step()[1][1],'submitted')
        self.assertEqual(self.client.submit.call_count,2)

    def test_lost_response_reserves_credits_before_submit(self):
        self.client.submit.side_effect=TimeoutError
        with self.assertRaises(TimeoutError):
            self.step()
        self.state=read(self.root/'run.json')
        self.assertEqual(self.step()[0][1],'reconcile_existing_submission')
        self.assertEqual(sum(j['credits'] for j in self.state['jobs'].values()),45)
        self.client.submit.assert_called_once()

    def test_revision_keeps_paid_shell_and_old_job(self):
        self.state['approved']=self.state['concept']
        self.step()
        keys=list(self.state['jobs'])
        self.state.update(concept='a'*64,approved='a'*64)
        self.assertEqual(self.step()[1][1],'budget_exceeded')
        self.assertEqual(list(self.state['jobs']),keys)
        self.assertEqual(self.client.submit.call_count,2)

    def test_web_uses_existing_credits_without_a_configured_cap(self):
        self.state.update(route='web', budget=None)
        result=advance(self.root,self.state,web_role='shell',web_cost=45)
        self.assertEqual(result[0][1],'web_begin_required')
        self.assertEqual(sum(j['credits'] for j in self.state['jobs'].values()),45)
        self.client.submit.assert_not_called()

    def test_web_reservation_idempotent(self):
        self.state['route']='web'
        self.assertEqual(self.step()[0][1],'open_hi3d_workspace')
        first=advance(self.root,self.state,web_role='shell',web_cost=45)
        second=advance(self.root,self.state,web_role='shell',web_cost=45)
        self.assertEqual(first[0][1],'web_begin_required')
        self.assertEqual(second, first)
        self.client.submit.assert_not_called()


if __name__=='__main__':
    unittest.main()
