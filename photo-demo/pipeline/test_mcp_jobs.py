"""Production transitions against a deterministic MCP, never a paid service."""
import base64
import hashlib
import struct
import tempfile
import unittest
from contextlib import nullcontext
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import mcp_jobs
from production import advance
from project import init, job_key, read, set_story, validate
from universe import parser


class Jobs(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.folder = Path(temp.name)/'case'
        self.img = self.folder.parent/'test.png'
        Image.new('RGB',(32,40),'teal').save(self.img)
        self.uid = 'intl-user'
        self.pin = hashlib.sha256(self.uid.encode()).hexdigest()
        env = patch.dict('os.environ',dict(HI3D_ACCOUNT_EMAIL='fixture@example.org',HI3D_MCP_USER_SHA256=self.pin))
        env.start()
        self.addCleanup(env.stop)
        args = parser().parse_args(['case','init',str(self.img)])
        self.assertEqual(args.via,'mcp')
        init(self.folder,self.img,90,args.via)
        self.state = read(self.folder/'run.json')
        set_story(self.folder,self.state,validate(dict(title='Tea',story='s',subject='cup',conceptPrompt='c',
                  actionLabel='on',actionResult='lit',box=[0,0,1,1],layout='insert',action='light')))
        self.key = job_key(self.state,'shell')
        self.calls = []
        self.task = dict(task_id='model-1',status='succeeded',quote_id='quote-1')
        self.timeout = False
        self.points = 885

    def call(self,name,**params):
        self.calls.append(name)
        if name == 'get_account_context':
            return dict(user_id=self.uid,nickname='fixture',available_points=self.points,billing_source='main_site_personal_points')
        if name == 'upload_input':
            self.assertEqual(base64.b64decode(params['image_base64']), (self.folder/'inputs'/(self.state['shell']+'.png')).read_bytes())
            return {'file_token':'temporary'}
        if name == 'quote_generation':
            self.assertEqual(params['file_tokens'],['temporary'])
            return dict(quote_id='quote-'+str(self.calls.count(name)),estimated_points=45,can_submit=True,
                        expires_at=(datetime.now(timezone.utc)+timedelta(minutes=10)).isoformat())
        if name == 'create_generation':
            self.assertEqual(params,dict(quote_id='quote-1',confirmed=True))
            self.assertEqual(read(self.folder/'run.json')['jobs'][self.key]['status'],'submitting')
            if self.timeout:
                raise TimeoutError
            return dict(task_id='model-1')
        if name == 'get_task':
            return self.task
        if name == 'get_task_outputs':
            return dict(task_id='model-1',outputs={'model_download_url':'https://cdn.example/model.glb'})
        self.fail(name)

    def tick(self):
        return advance(self.folder,self.state,mcp_connect=lambda:nullcontext(self.call),
                       client_factory=lambda:self.fail('unexpected API fallback'))

    def submit(self,quote='quote-1'):
        return mcp_jobs.submit(self.folder,self.state,self.key,quote,self.call)

    def test_new_default_and_existing_routes(self):
        for route in ('web','api'):
            self.assertEqual(parser().parse_args(['case','init',str(self.img),'--via',route]).via,route)
            folder=self.folder.parent/route
            init(folder,self.img,50,route)
            init(folder,self.img,1,'mcp')
            self.assertEqual((read(folder/'run.json')['route'],read(folder/'run.json')['budget']),(route,50))

    def test_current_quote_only_once_and_no_auto_submit(self):
        first = self.tick()[0]
        self.assertEqual(first[1:5],['confirm_mcp_quote',self.key,'quote-1',45])
        self.state = read(self.folder/'run.json')
        self.assertEqual(self.tick()[0],first)
        with self.assertRaises(ValueError):
            self.submit('older-quote')
        self.assertEqual(self.calls.count('quote_generation'),1)
        self.assertNotIn('create_generation',self.calls)

    def test_wrong_account_budget_balance_and_expiry(self):
        self.uid = 'different'
        with self.assertRaises(ValueError):
            self.tick()
        self.assertNotIn('upload_input',self.calls)
        self.uid = 'intl-user'
        self.tick()
        self.state['budget'] = 40
        self.assertEqual(self.tick()[0][1],'budget_exceeded')
        with self.assertRaises(ValueError):
            self.submit()
        self.state['budget'] = 45
        self.points = 1
        with self.assertRaises(ValueError):
            self.submit()
        self.points = 885
        self.state['jobs'][self.key]['expires_at']='2000-01-01T00:00:00Z'
        with self.assertRaises(ValueError):
            self.submit()
        self.assertEqual(self.tick()[0][3],'quote-2')
        self.assertNotIn('create_generation',self.calls)

    def test_hold_invalidates_interior_quote(self):
        self.state.update(concept=self.state['shell'],approved=self.state['shell'])
        self.assertEqual([x[1] for x in self.tick()],['confirm_mcp_quote']*2)
        key=job_key(self.state,'interior')
        self.state['hold']=True
        with self.assertRaises(ValueError):
            mcp_jobs.submit(self.folder,self.state,key,'quote-2',self.call)
        self.assertEqual(self.tick()[1][1],'awaiting_review')
        self.assertNotIn(key,self.state['jobs'])
        self.assertIn(self.key,self.state['jobs'])

    def test_lost_receipt_never_resubmitted(self):
        self.tick()
        self.timeout=True
        with self.assertRaises(TimeoutError):
            self.submit()
        self.state=read(self.folder/'run.json')
        self.assertEqual(self.tick()[0][1],'reconcile_existing_submission')
        with self.assertRaises(ValueError):
            self.submit()
        self.task['quote_id']='other'
        with self.assertRaises(ValueError):
            mcp_jobs.recover(self.folder,self.state,self.key,'model-1',self.call)
        self.task['quote_id']='quote-1'
        mcp_jobs.recover(self.folder,self.state,self.key,'model-1',self.call)
        self.assertEqual(read(self.folder/'run.json')['jobs'][self.key]['task_id'],'model-1')
        self.assertEqual(self.calls.count('create_generation'),1)

    def test_poll_and_restore_by_original_task_and_hash(self):
        self.tick()
        self.submit()
        with self.assertRaises(ValueError):
            self.submit()
        self.task['status']='running'
        self.task['next_poll_after']=30
        self.tick()
        self.tick()
        self.assertEqual(self.calls.count('get_task'),1)
        self.state['jobs'][self.key]['poll_at']=0
        self.task['status']='completed'
        def download(url,target):
            self.assertEqual(url,'https://cdn.example/model.glb')
            target.write_bytes(struct.pack('<4sII',b'glTF',2,12))
        with patch('mcp_jobs.hi3d.download',side_effect=download):
            self.assertEqual(self.tick()[0][1],'ready')
            job=self.state['jobs'][self.key]
            (self.folder/job['file']).unlink()
            self.assertEqual(self.tick()[0][1],'ready')
            self.assertEqual(job['export']['reference_sha256'],self.state['shell'])
        self.assertEqual(self.calls.count('create_generation'),1)
