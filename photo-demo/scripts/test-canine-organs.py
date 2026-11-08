"""Offline checks for six separately billable Tripo operations. No service calls."""
import importlib.util,json,struct,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('organs',Path(__file__).with_name('canine-organs.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Batch(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);base=Path(temp.name)
        self.posts=[];self.balance=25;self.lost=False
        for name,value in [('ROOT',base/'private'),('PUBLIC',base/'public'),('cli',self.call)]:
            patcher=patch.object(m,name,value);patcher.start();self.addCleanup(patcher.stop)
        for k in m.IDS:
            d=m.ROOT/k;d.mkdir(parents=True);(d/'reference.png').write_bytes(k.encode())
    def call(self,*cmd):
        if '--dry-run' in cmd:return {'valid':True,'generation_credits_estimate':60}
        if cmd[0]=='balance':return {'balance':self.balance}
        if cmd[0]=='make':
            self.posts.append(cmd[1].parent.name)
            if self.lost:raise TimeoutError
            return {'task_id':'vendor-id-'+self.posts[-1]}
        assert cmd[:2]==('task','watch')
        dst=cmd[cmd.index('--out')+1];doc=json.dumps({'asset':{'version':'2.0'},'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],'accessors':[{'count':3}]}).encode()
        (dst/'model.glb').write_bytes(struct.pack('<4sIIII',b'glTF',2,len(doc)+20,len(doc),0x4E4F534A)+doc)
        return {}
    def test_budget_and_resume(self):
        m.run('generate');self.assertEqual(self.posts,[])
        self.balance=360;m.run('generate');self.assertEqual(self.posts,m.IDS)
        self.balance=0;m.run('generate');self.assertEqual(self.posts,m.IDS)
        self.assertEqual({v['state'] for v in m.read(m.PUBLIC/'catalog.json')['organs'].values()},{'staged'})
    def test_lost_submit_is_not_retried(self):
        self.balance=360;self.lost=True
        with self.assertRaises(TimeoutError):m.run('generate')
        with self.assertRaisesRegex(RuntimeError,'Reconcile'):m.run('generate')
        self.assertEqual(self.posts,['heart'])
if __name__=='__main__':unittest.main()
