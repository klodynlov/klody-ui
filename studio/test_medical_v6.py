import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import server
import medical_documentary_model as model

class MedicalV6IntegrationTests(unittest.TestCase):
    def test_changed_evaluated_artifact_blocks_inference(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'reader.py';source.write_text('original')
            p=root/model.PROFILE;p.parent.mkdir()
            p.write_text(json.dumps({'activation_allowed':True,'adapter_path':None,
                'artifact_sha256':{'reader.py':model.sha(source)},'model_files':[],
                'base_model_path':str(root)}))
            with patch.object(model,'PROFILE_SHA',model.sha(p)):
                self.assertTrue(model.profile(root)['activation_allowed'])
                source.write_text('changed')
                with self.assertRaisesRegex(ValueError,'Artefact médical modifié'):model.profile(root)

    def test_v6_report_opens_its_fixed_path(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder);report=home/'Projets/LibraryBrainMedical/reports/evaluation-medicale-v6-20260911.html'
            report.parent.mkdir(parents=True);report.write_text('<html>V6</html>')
            with patch.object(server,'HOME',home),patch.object(server.subprocess,'run') as opened:
                response=TestClient(server.app).post('/api/medical/open-evaluation',json={'version':'v6'},headers={'X-Klody-Studio':'1'})
            self.assertEqual(response.status_code,200)
            opened.assert_called_once_with(['open',str(report)],check=True,timeout=10)

    def test_source_keeps_original_context_and_snapshot_identifier(self):
        source={'id':'HAS:tdah:p1','source_id':'tdah-reco','title':'TDAH','publisher':'HAS',
                'date':'2024-07','text':'Texte','surrounding_text':'Avant Texte Après',
                'page':1,'local_path':'/tmp/tdah.pdf'}
        shown=model.display_source(source)
        self.assertEqual(shown['source_id'],'tdah-reco')
        self.assertEqual(shown['surrounding_text'],'Avant Texte Après')
        self.assertEqual(shown['page'],1)
