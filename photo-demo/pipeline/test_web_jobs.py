import json
import sqlite3
import struct
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

from chrome_export import completed_download
from exports import verified_archive
from project import init, read, save, set_story, sha, validate
from universe import execute, parser


class WebJobs(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.folder = self.root/'work'
        photo = self.root/'photo.png'
        Image.new('RGB',(64,48),'red').save(photo)
        init(self.folder, photo, 45, 'web')
        state = read(self.folder/'run.json')
        state['account'] = 'example@example.test'
        set_story(self.folder, state, validate(dict(title='t',story='s',subject='a',conceptPrompt='c',
            actionResult='r',actionLabel='a',box=[.1,.1,.9,.9],layout='whole',action='light')))
        self.rev = self.cmd('concept',str(photo))['revision']
        self.cmd('review','continue','--revision',self.rev)

    def cmd(self, *args):
        return execute(parser().parse_args(['--root',str(self.root),'work',*args]))

    def reserve(self):
        _, step, key, attempt = self.cmd('web-reserve','world','45','--account','example@example.test')[0]
        self.assertEqual(step,'web_begin_required')
        return key, attempt

    def begin(self, key, attempt):
        return self.cmd('web-begin',key,attempt,'45','--account','example@example.test')

    def test_crash_before_and_after_click_and_concurrent_resume(self):
        key, attempt = self.reserve()
        self.assertEqual(self.reserve(), (key, attempt))
        program = [sys.executable,str(Path(__file__).with_name('universe.py')),'--root',str(self.root),
                   'work','web-begin',key,attempt,'45','--account','example@example.test']
        def agent(_):
            result = subprocess.run(program,capture_output=True,text=True)
            return result.returncode == 0 and json.loads(result.stdout)['next']=='click_generate_once'
        with ThreadPoolExecutor(2) as workers:
            self.assertEqual(sorted(workers.map(agent,range(2))), [False,True])
        self.assertEqual(self.cmd('tick')[0][1],'reconcile_existing_submission')
        with self.assertRaises(ValueError):
            self.cmd('web-release',key,attempt)
        self.assertEqual(sum(j['credits'] for j in self.cmd('status')['jobs'].values()),45)
        self.cmd('attach-task',key,'pot','--attempt',attempt)
        self.assertEqual(self.cmd('tick')[0][1:],[ 'resume_website_task','pot'])
        with self.assertRaises(ValueError):
            self.begin(key,attempt)

    def test_hold_releases_preclick_and_fences_old_attempt_after_rejection(self):
        key, old = self.reserve()
        self.cmd('review','hold')
        self.assertFalse(self.cmd('status')['jobs'])
        self.cmd('review','continue','--revision',self.rev)
        _, current = self.reserve()
        with self.assertRaises(ValueError):
            self.begin(key,old)
        self.begin(key,current)
        self.cmd('web-release',key,current,'--rejected','本次提交被官网明确拒绝，未创建任务或扣款')
        _, retry = self.reserve()
        self.assertNotEqual(retry,current)
        with self.assertRaises(ValueError):
            self.cmd('web-release',key,current,'--rejected','重复送达的旧回执')
        with self.assertRaises(ValueError):
            self.cmd('attach-task',key,'old','--attempt',current)
        self.assertEqual(len(self.cmd('status')['released']),2)

    def test_legacy_submitting_is_uncertain_and_price_account_budget_are_rechecked(self):
        key, attempt = self.reserve()
        for price, account in [('60','example@example.test'),('45','other@example.test')]:
            with self.assertRaises(ValueError):
                self.cmd('web-begin',key,attempt,price,'--account',account)
        self.cmd('budget','0')
        with self.assertRaises(ValueError):
            self.begin(key, attempt)
        self.cmd('budget','unlimited')
        self.assertIsNone(self.cmd('status')['budget'])
        self.assertEqual(self.begin(key,attempt)['next'],'click_generate_once')
        state = self.cmd('status')
        state['jobs'][key].pop('attempt')
        state['jobs'][key]['status']='submitting'
        save(self.folder/'run.json',state)
        self.assertEqual(self.cmd('tick')[0][1:],[ 'reconcile_existing_submission',key,'legacy'])
        with self.assertRaises(ValueError):
            self.begin(key,'legacy')
        self.cmd('attach-task',key,'past')
        self.assertEqual(self.cmd('tick')[0][1:],[ 'resume_website_task','past'])

    def export_fixture(self, task):
        directory = self.root/'.hi3d-exports'/task
        directory.mkdir(parents=True)
        original = directory/'original.glb'
        payload = json.dumps({'asset':{'version':'2.0','generator':task}}).encode()
        payload += b' ' * (-len(payload)%4)
        original.write_bytes(struct.pack('<4sII I4s',b'glTF',2,20+len(payload),len(payload),b'JSON')+payload)
        save(directory/'receipt.json',dict(method='hi3d-workspace-download',task=task,
             reference_sha256=self.rev,sha256=sha(original)))
        return original

    def test_only_download_for_attached_task_is_accepted(self):
        pot, bowl = [self.export_fixture(t) for t in ['pot','bowl']]
        key, attempt = self.reserve()
        self.begin(key,attempt)
        self.cmd('attach-task',key,'pot','--attempt',attempt)
        with self.assertRaisesRegex(ValueError,'哈希'):
            self.cmd('web-result',key,str(bowl))
        self.assertEqual(self.cmd('status')['jobs'][key]['status'],'submitted')
        self.cmd('web-result',key)
        self.cmd('attach-task',key,'pot','--attempt',attempt)
        self.assertEqual(self.cmd('status')['jobs'][key]['sha256'],sha(pot))
        self.assertEqual(self.cmd('tick'),[['world','ready']])

    def test_link_without_proof_wrong_file_and_unverified_legacy_record(self):
        pot, bowl = [self.export_fixture(t) for t in ['pot','bowl']]
        with self.assertRaisesRegex(ValueError,'缺少'):
            self.cmd('reuse','world',str(bowl),'--source','https://www.hi3d.ai/3d-model/other')
        url = 'https://www.hi3d.ai/3d-model/pot'
        with self.assertRaisesRegex(ValueError,'哈希'):
            self.cmd('reuse','world',str(bowl),'--source',url)
        self.assertFalse(self.cmd('status')['jobs'])
        state = self.cmd('status')
        state['jobs']['world-'+self.rev]=dict(status='ready',route='archive',file=str(bowl),credits=0,
                        input=self.rev,role='world',task_id='pot',source=url,sha256=sha(bowl))
        save(self.folder/'run.json',state)
        self.assertEqual(self.cmd('tick'),[['world','verify_website_export','pot']])
        self.cmd('reuse','world','--task','pot')
        job = self.cmd('status')['jobs']['world-'+self.rev]
        self.assertTrue(verified_archive(job))
        self.assertEqual(job['sha256'],sha(pot))

    def test_chrome_download_is_scoped_to_completed_export_in_exact_tab(self):
        db = self.root/'history'
        pot = self.export_fixture('pot')
        with sqlite3.connect(db) as c:
            c.execute('CREATE TABLE downloads(id,tab_url,target_path,state,received_bytes,total_bytes)')
            c.execute('CREATE TABLE downloads_url_chains(id,chain_index,url)')
            def row(i,ticket,status):
                c.execute('INSERT INTO downloads VALUES(?,?,?,?,?,?)',(i,
                    'https://www.hi3d.ai/zh/workspace?backside_export='+ticket,str(pot),status,
                    pot.stat().st_size,pot.stat().st_size))
                c.execute('INSERT INTO downloads_url_chains VALUES(?,0,?)',(i,'blob:https://www.hi3d.ai/example'))
            row(1,'other',1)
            row(2,'ticket',0)
            c.commit()
            self.assertIsNone(completed_download([db],'ticket'))
            c.execute('UPDATE downloads SET state=1 WHERE id=2')
            c.commit()
            self.assertEqual(completed_download([db],'ticket'),str(pot))
            row(3,'ticket',1)
            c.commit()
            with self.assertRaises(ValueError):
                completed_download([db],'ticket')


if __name__ == '__main__':
    unittest.main()
