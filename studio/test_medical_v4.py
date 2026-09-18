import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import server

HEADERS={'X-Klody-Studio':'1'}

class V4IntegrationTests(unittest.TestCase):
    def test_snapshot_open_is_by_verified_manifest_id_only(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder);root=home/'Projets/LibraryBrainMedical'
            p=root/'snapshots/test.pdf';p.parent.mkdir(parents=True);p.write_bytes(b'%PDF-test')
            (root/'data').mkdir()
            doc={'id':'tdah-reco','pdf_path':str(p),'pdf_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
            (root/'data/source_manifest.json').write_text(json.dumps({'documents':[doc]}))
            with patch.object(server,'HOME',home),patch.object(server.subprocess,'run') as opened:
                client=TestClient(server.app)
                self.assertEqual(client.post('/api/medical/open-document',json={'source_id':'tdah-reco'},headers=HEADERS).status_code,200)
                opened.assert_called_once_with(['open',str(p.resolve())],check=True,timeout=10)
                p.write_bytes(b'changed')
                self.assertEqual(client.post('/api/medical/open-document',json={'source_id':'tdah-reco'},headers=HEADERS).status_code,409)
                self.assertEqual(client.post('/api/medical/open-document',json={'source_id':'../../arbitrary'},headers=HEADERS).status_code,404)
                self.assertEqual(client.post('/api/medical/open-document',json={'book_id':1,'source_id':'tdah-reco'},headers=HEADERS).status_code,422)

    def test_report_version_cannot_be_an_arbitrary_path(self):
        with patch.object(server.subprocess,'run') as opened:
            result=TestClient(server.app).post('/api/medical/open-evaluation',json={'version':'../../foo'},headers=HEADERS)
        self.assertEqual(result.status_code,422);opened.assert_not_called()

    def test_new_worker_rejects_unvalidated_profile_before_loading_model(self):
        import medical_documentary_worker as worker
        with patch.object(worker,'profile',side_effect=ValueError('not accepted')):
            with self.assertRaises(ValueError):worker.run({'model':'medical','question':'hernie'},lambda _:None)

if __name__=='__main__':unittest.main()
