import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import medical_reader_model as mm
import medical_reader_worker as worker
import server

ROOT=Path.home()/'Projets/LibraryBrainMedical'
HEADERS={'X-Klody-Studio':'1','Origin':'http://127.0.0.1:8018'}

class MedicalIntegrationTests(unittest.TestCase):
    def test_profile_is_medical_and_clinical_validation_is_false(self):
        info=mm.model_info(ROOT,server.MODELS['medical'],'medical')
        self.assertTrue(info['available'],info)
        self.assertFalse(info['clinical_validation'])
        self.assertFalse(info['supports_training'])
        self.assertEqual(info['dataset']['train'],0)
        self.assertEqual(info['dataset']['evidence_units'],51)
        self.assertEqual(info['reader_assessment']['n'],24)
        self.assertEqual(info['reader_assessment']['correct_answers'],18)
        self.assertEqual(info['reader_assessment']['correct_abstentions'],6)
        self.assertIsNone(mm.profile(ROOT)['adapter_path'])

    def test_changed_profile_is_rejected(self):
        with patch.object(mm,'sha',return_value='wrong'),self.assertRaisesRegex(ValueError,'profil médical'):
            mm.profile(ROOT)

    def test_foreign_adapter_is_rejected(self):
        changed=json.loads((ROOT/mm.PROFILE).read_text());changed['adapter_path']=str(Path.home()/'Projets/LibraryBrainLegal/adapters')
        with patch.object(mm,'read',return_value=changed),self.assertRaisesRegex(ValueError,'Adaptateur médical'):
            mm.profile(ROOT)

    def test_api_uses_medical_worker_and_rejects_generic_training(self):
        with tempfile.TemporaryDirectory() as folder:
            engine=server.Engine(folder)
            with patch.object(server,'engine',engine),patch.dict(server.MODELS,{'medical':{**server.MODELS['medical'],'worker':'medical_reader_worker.py'}}):
                client=TestClient(server.app)
                r=client.post('/api/chat',json={'model':'medical','question':'Dénutrition et albumine ?'},headers=HEADERS)
                self.assertEqual(r.status_code,202)
                self.assertEqual(Path(engine.commands(r.json())[0][1]).name,'medical_reader_worker.py')
                r=client.post('/api/train',json={'model':'medical','name':'test','iterations':2},headers=HEADERS)
                self.assertEqual(r.status_code,409)
                self.assertEqual(len(engine.jobs),1)

    def test_missing_source_refuses_before_gpu(self):
        import sys
        sys.path.insert(0,str(ROOT));import medical_reader as reader
        saved=[]
        with patch.object(reader,'load_model') as load:
            worker.run({'model':'medical','question':'Hors périmètre'},lambda d:saved.append(dict(d)))
        load.assert_not_called();self.assertEqual(saved[-1]['phase'],'done')
        self.assertEqual(saved[-1]['confidence']['level'],'insufficient')
        self.assertEqual(saved[-1]['sources'],[])
        self.assertTrue(saved[-1]['abstained'])

    def test_source_displays_date_status_and_original(self):
        source={'id':'HAS:hta-suspendue:p1:s1','title':'HTA 2005','text':'Texte original','publisher':'HAS','date':'2005-07','status':'suspended','page':1}
        shown=mm.display_source(source)
        self.assertEqual(shown['text'],source['text']);self.assertIn('suspendue',shown['author'])
        self.assertIn('2005-07',shown['author']);self.assertIn(source['id'],shown['title'])

    def test_metadata_preserves_dates_and_never_loads_gpu(self):
        import sys
        sys.path.insert(0,str(ROOT));import medical_reader as reader
        saved=[]
        with patch.object(reader,'load_model') as load:
            worker.run({'model':'medical','question':'Compare les dates du guide douleur chronique et de sa fiche.'},lambda d:saved.append(dict(d)))
        load.assert_not_called()
        result=saved[-1]
        self.assertFalse(result['clinical_validation'])
        self.assertIsNone(result['adapter'])
        self.assertFalse(result['abstained'])
        self.assertEqual(len(result['sources']),2)
        self.assertEqual(result['generation_policy'],'model_selects_ids_program_copies_complete_units')
        for source in result['sources']:
            self.assertIn(source['date'],result['answer'])
            self.assertIn(source['text'],result['answer'])

if __name__=='__main__':unittest.main()
