import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import server
import medical_rag_model as model

HEADERS={'X-Klody-Studio':'1','Origin':'http://127.0.0.1:8018'}

class MedicalV3BoundaryTests(unittest.TestCase):
    def test_archived_reader_keeps_candidate_results_separate(self):
        import medical_reader_model
        info=medical_reader_model.model_info(Path.home()/'Projets/LibraryBrainMedical',server.MODELS['medical'],'medical')
        report=json.loads((Path.home()/'Projets/LibraryBrainMedical/experiments/20260911-medical-v3/release_decision.json').read_text())
        self.assertEqual(info['version'],'v2');self.assertEqual(info['parameters'],'4B')
        self.assertFalse(info['medical_candidate_assessment']['accepted'])
        self.assertEqual(info['medical_candidate_assessment']['summary'],report['summary'])
        self.assertEqual(info['coverage_audit']['rejected_before_model'],26)

    def test_real_rejected_candidate_worker_is_blocked(self):
        import medical_rag_worker
        saved=[]
        with self.assertRaisesRegex(ValueError,'critères de sélection'):
            medical_rag_worker.run({'model':'medical','question':'hernie'},saved.append)
        self.assertEqual(saved,[])

    def test_rejected_candidate_cannot_be_loaded_for_inference(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);p=root/model.PROFILE;p.parent.mkdir(parents=True)
            p.write_text(json.dumps({'activation_allowed':False}))
            with patch.object(model,'PROFILE_SHA',model.sha(p)),self.assertRaisesRegex(ValueError,'critères de sélection'):
                model.profile(root)

    def test_source_keeps_reference_status_and_no_fake_markdown_page(self):
        s={'id':'LB:1:2','title':'Chapter','publisher':'StatPearls','date':'non vérifiée','kind':'chapitre de référence',
           'page':3,'local_path':'/tmp/chapter.md','text':'Source intacte'}
        shown=model.display_source(s)
        self.assertIsNone(shown['page'])
        self.assertEqual(shown['text'],s['text'])
        self.assertIn('non vérifiée',shown['author'])
        self.assertIn('LB:1:2',shown['title'])

    def test_open_document_requires_local_header(self):
        client=TestClient(server.app)
        self.assertEqual(client.post('/api/medical/open-document',json={'book_id':15484}).status_code,403)
        self.assertEqual(client.post('/api/medical/open-evaluation',json={}).status_code,403)

    def test_evaluation_opens_only_the_fixed_local_report(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder);p=home/'Projets/LibraryBrainMedical/reports/evaluation-medicale-v3-20260911.html'
            p.parent.mkdir(parents=True);p.write_text('<html>Rapport local</html>')
            with patch.object(server,'HOME',home),patch.object(server.subprocess,'run') as execute:
                r=TestClient(server.app).post('/api/medical/open-evaluation',json={'path':'/tmp/ignored.app'},headers=HEADERS)
            self.assertEqual(r.status_code,200)
            execute.assert_called_once_with(['open',str(p)],check=True,timeout=10)

    def test_open_document_does_not_take_an_arbitrary_path(self):
        client=TestClient(server.app)
        r=client.post('/api/medical/open-document',json={'path':'/tmp/arbitrary.app'},headers=HEADERS)
        self.assertEqual(r.status_code,422)

    def test_unknown_book_not_opened(self):
        client=TestClient(server.app)
        with patch.object(server.subprocess,'run') as execute:
            r=client.post('/api/medical/open-document',json={'book_id':999999999},headers=HEADERS)
        self.assertEqual(r.status_code,404);execute.assert_not_called()

    def test_known_medical_document_opens_exact_resolved_file(self):
        client=TestClient(server.app)
        path=server.medical_document_path(15484)
        with patch.object(server.subprocess,'run') as execute:
            r=client.post('/api/medical/open-document',json={'book_id':15484},headers=HEADERS)
        self.assertEqual(r.status_code,200)
        execute.assert_called_once_with(['open',str(path)],check=True,timeout=10)

if __name__=='__main__':unittest.main()
