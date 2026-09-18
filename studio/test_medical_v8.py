"""Run after the reviewed V8 profile is selected."""
import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import server

class ActiveMedicalV8Tests(unittest.TestCase):
    def test_catalog_reports_actual_profile_and_evaluation_scope(self):
        info=server.model_info('medical')
        self.assertEqual(info['version'],'v8')
        self.assertEqual(info['parameters'],'35B')
        self.assertTrue(info['available'],info)
        self.assertTrue(info['documentary_reader'])
        self.assertFalse(info['clinical_validation'])
        self.assertFalse(info['supports_training'])
        self.assertEqual(info['dataset']['train'],0)
        result=info['medical_rag_assessment']
        self.assertEqual((result['n'],result['fresh_n'],result['regression_n']),(57,4,53))
        self.assertLessEqual(result['errors'],1)

    def test_chat_uses_v8_worker_without_changing_training_policy(self):
        with tempfile.TemporaryDirectory() as folder:
            engine=server.Engine(folder)
            with patch.object(server,'engine',engine):
                client=TestClient(server.app);headers={'X-Klody-Studio':'1'}
                response=client.post('/api/chat',json={'model':'medical','question':'hernie'},headers=headers)
                self.assertEqual(response.status_code,202)
                self.assertEqual(Path(engine.commands(response.json())[0][1]).name,'medical_french_worker.py')
                self.assertEqual(client.post('/api/train',json={'model':'medical','name':'test','iterations':2},headers=headers).status_code,409)
                self.assertEqual(len(engine.jobs),1)

    def test_report_version_resolves_only_to_the_fixed_local_file(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder);report=home/'Projets/LibraryBrainMedical/reports/evaluation-medicale-v8-20260912.html'
            report.parent.mkdir(parents=True);report.write_text('<html>V8</html>')
            with patch.object(server,'HOME',home),patch.object(server.subprocess,'run') as opened:
                client=TestClient(server.app);headers={'X-Klody-Studio':'1'}
                response=client.post('/api/medical/open-evaluation',json={'version':'v8'},headers=headers)
                self.assertEqual(response.status_code,200)
                opened.assert_called_once_with(['open',str(report)],check=True,timeout=10)
                response=client.post('/api/medical/open-evaluation',json={'version':'../../secret'},headers=headers)
                self.assertEqual(response.status_code,422)

    def test_previous_reader_profile_remains_intact(self):
        from medical_documentary_model import profile
        previous=profile(server.source_root('medical'))
        self.assertEqual(previous['name'],'Médical V7 · lecteur documentaire')
