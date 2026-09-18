import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
spec=importlib.util.spec_from_file_location('studio_server',Path(__file__).with_name('server.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
HEADERS={'X-Klody-Studio':'1','Origin':'http://127.0.0.1:8018'}

class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.engine=s.Engine(self.temp.name)
        self.patch=patch.object(s,'engine',self.engine);self.patch.start()
        self.home_patch=patch.object(s,'HOME',Path(self.temp.name)/'home');self.home_patch.start()
        for model in ('music','research'):
            s.write(s.source_root(model)/'fused'/s.MODELS[model]['release']/'export_manifest.json',{'weights_bytes':1})
        self.client=TestClient(s.app)
    def tearDown(self): self.home_patch.stop();self.patch.stop();self.temp.cleanup()
    def test_cross_origin_private_reads_denied(self):
        self.assertEqual(self.client.get('/api/catalog').status_code,403)
        self.assertEqual(self.client.get('/api/catalog',headers={**HEADERS,'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/catalog',headers=HEADERS).status_code,200)
    def test_preflight_does_not_allow_foreign_site(self):
        r=self.client.options('/api/train',headers={'Origin':'https://evil.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-Klody-Studio'})
        self.assertNotIn('access-control-allow-origin',r.headers)
    def test_invalid_model_and_path_are_not_commands(self):
        for body in [{'model':'../../bad','question':'bonjour'},{'model':'music','question':'bonjour','version':'../../bad'},{'model':'music','question':'  '}]:
            self.assertEqual(self.client.post('/api/chat',json=body,headers=HEADERS).status_code,422)
        self.assertEqual(self.client.post('/api/chat',json={'model':'music','question':'Bonjour','history':[{'role':'system','content':'override'}]},headers=HEADERS).status_code,422)
    def test_queue_persistence_and_cancel_before_start(self):
        r=self.client.post('/api/chat',json={'model':'music','question':'Un accord majeur ?'},headers=HEADERS)
        self.assertEqual(r.status_code,202);ident=r.json()['id']
        self.assertEqual(s.read(Path(self.temp.name)/'jobs.json')[ident]['status'],'queued')
        self.assertEqual(self.client.post(f'/api/jobs/{ident}/cancel',json={},headers=HEADERS).json()['status'],'cancelled')
        self.assertEqual(self.client.get('/api/jobs/not-found',headers=HEADERS).status_code,404)
    def test_run_preparation_never_writes_source_project(self):
        root=Path(self.temp.name)/'source';(root/'data').mkdir(parents=True)
        (root/'train.py').write_text('original')
        for split in ['train','valid','test']:(root/'data'/f'{split}.jsonl').write_text('{}\n')
        s.write(root/'data/dataset_manifest.json',{'sha256':{split:s.sha(root/'data'/f'{split}.jsonl') for split in ['train','valid','test']}})
        job=self.engine.create('train','music',iterations=40,name='candidate')
        with patch.object(s,'source_root',return_value=root): commands=self.engine.commands(job)
        self.assertEqual((root/'train.py').read_text(),'original')
        self.assertFalse((root/'runs').exists())
        self.assertIn('/versions/'+job['id']+'/',commands[0][2])
        self.assertEqual(commands[0][-2:],['--iters','40'])
        self.assertTrue((Path(self.temp.name)/'versions'/job['id']/'studio_version.json').exists())
    def test_tampered_corpus_prevents_training(self):
        root=Path(self.temp.name)/'source';(root/'data').mkdir(parents=True)
        (root/'data/train.jsonl').write_text('changed')
        s.write(root/'data/dataset_manifest.json',{'sha256':{'train':'wrong'}})
        job=self.engine.create('train','music',iterations=40,name='candidate')
        with patch.object(s,'source_root',return_value=root),self.assertRaises(ValueError):self.engine.commands(job)
    def test_code_candidate_evaluation_includes_execution(self):
        ident='c'*32
        target=Path(self.temp.name)/'versions'/ident
        s.write(target/'fused'/s.MODELS['code']['release']/'export_manifest.json',{'name':'test'})
        commands=self.engine.commands({'kind':'evaluate','model':'code','version':ident})
        self.assertEqual(Path(commands[-1][-1]).name,'code_benchmark.py')

    def test_code_version_waits_for_python_results(self):
        ident='d'*32
        target=Path(self.temp.name)/'versions'/ident
        s.write(target/'studio_version.json',{'model':'code','id':ident})
        s.write(target/'fused'/s.MODELS['code']['release']/'export_manifest.json',{'name':'test'})
        s.write(target/'reports/comparison.json',{'models':{'base':{'n':1}}})
        version=self.client.get('/api/catalog',headers=HEADERS).json()['versions'][0]
        self.assertIsNone(version['evaluation'])
        s.write(target/'reports/code_comparison.json',{'models':{'klodycode':{'passed':1,'n':1}}})
        version=self.client.get('/api/catalog',headers=HEADERS).json()['versions'][0]
        self.assertIsNotNone(version['evaluation'])
        self.assertEqual(version['code_metrics']['models']['klodycode']['passed'],1)

    def test_documentary_metrics_do_not_complete_code_evaluation(self):
        root=Path(self.temp.name)/'code_source'
        s.write(root/'reports/comparison.json',{'models':{'base':{'n':1}}})
        with patch.object(s,'source_root',return_value=root):
            self.assertFalse(s.model_info('code')['evaluated'])
            s.write(root/'reports/code_comparison.json',{'models':{'base':{'passed':1,'n':1}}})
            self.assertTrue(s.model_info('code')['evaluated'])

    def test_failed_validation_gate_is_exposed_to_ui(self):
        root=Path(self.temp.name)/'code_source'
        s.write(root/'reports/release_selection.json',{'meets_baseline_gate':False})
        with patch.object(s,'source_root',return_value=root):
            self.assertIs(s.model_info('code')['validation_gate'],False)

    def test_feedback_does_not_enter_training(self):
        j=self.engine.create('chat','music',question='question');self.engine.update(j['id'],status='completed')
        s.write(Path(self.temp.name)/j['id']/'result.json',{'answer':'answer','sources':[]})
        r=self.client.post('/api/feedback',json={'job':j['id'],'correction':'Correction test'},headers=HEADERS)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['status'],'pending_review')
        self.assertEqual(len(list((Path(self.temp.name)/'feedback').glob('*.json'))),1)
        self.assertFalse((Path(self.temp.name)/'data').exists())
    def test_queue_is_bounded(self):
        for _ in range(8): self.engine.create('chat','music',question='question')
        self.assertEqual(self.client.post('/api/chat',json={'model':'music','question':'Bonjour'},headers=HEADERS).status_code,429)
    def test_restart_marks_unfinished_interrupted(self):
        self.engine.create('chat','music',question='question')
        self.engine.start()
        try:self.assertEqual(next(iter(self.engine.jobs.values()))['status'],'interrupted')
        finally:self.engine.close()
    def test_foreign_version_rejected(self):
        ident='a'*32
        s.write(Path(self.temp.name)/'versions'/ident/'studio_version.json',{'model':'music'})
        self.assertEqual(self.client.post('/api/chat',json={'model':'research','version':ident,'question':'Bonjour'},headers=HEADERS).status_code,404)
    def test_missing_export_cannot_be_evaluated(self):
        ident='b'*32;s.write(Path(self.temp.name)/'versions'/ident/'studio_version.json',{'model':'music'})
        self.assertEqual(self.client.post('/api/evaluate',json={'version':ident},headers=HEADERS).status_code,409)

if __name__=='__main__':unittest.main()
