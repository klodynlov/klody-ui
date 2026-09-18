"""Compatibility checks for the preserved V7 profile and worker."""
import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import server

class ActiveMedicalV7Tests(unittest.TestCase):
    def test_catalog_exposes_the_accepted_documentary_profile_and_its_limits(self):
        from medical_documentary_model import model_info
        info=model_info(server.source_root('medical'),{**server.MODELS['medical'],'name':'Médical V7'},'medical')
        self.assertEqual(info['version'],'v7')
        self.assertEqual(info['parameters'],'35B')
        self.assertTrue(info['available'],info)
        self.assertTrue(info['documentary_reader'])
        self.assertFalse(info['clinical_validation'])
        self.assertFalse(info['supports_training'])
        self.assertEqual(info['dataset']['train'],0)
        result=info['medical_rag_assessment']
        self.assertEqual((result['n'],result['fresh_n'],result['regression_n']),(45,8,37))
        self.assertLessEqual(result['errors'],1)

    def test_chat_routes_to_the_pinned_reader_and_training_stays_disabled(self):
        with tempfile.TemporaryDirectory() as folder:
            engine=server.Engine(folder)
            spec={**server.MODELS['medical'],'name':'Médical V7','runtime':'medical_documentary','worker':'medical_documentary_worker.py'}
            with patch.object(server,'engine',engine),patch.dict(server.MODELS,{'medical':spec}):
                client=TestClient(server.app);headers={'X-Klody-Studio':'1'}
                response=client.post('/api/chat',json={'model':'medical','question':'hernie'},headers=headers)
                self.assertEqual(response.status_code,202)
                self.assertEqual(Path(engine.commands(response.json())[0][1]).name,'medical_documentary_worker.py')
                self.assertEqual(client.post('/api/train',json={'model':'medical','name':'test','iterations':2},headers=headers).status_code,409)
                self.assertEqual(len(engine.jobs),1)
