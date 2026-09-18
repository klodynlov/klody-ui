import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient
import legal_model as lm
import legal_worker as worker
import server

ROOT = Path.home() / 'Projets/LibraryBrainLegal'
HEADERS = {'X-Klody-Studio': '1', 'Origin': 'http://127.0.0.1:8018'}


class LegalIntegrationTests(unittest.TestCase):
    def test_catalog_uses_legal_profile_and_distinct_review_metrics(self):
        info = server.model_info('legal')
        self.assertTrue(info['available'], info)
        self.assertEqual(info['version'], 'v3')
        self.assertFalse(info['validation_gate'])
        self.assertFalse(info['supports_training'])
        self.assertEqual(info['metrics'], {})
        self.assertEqual(info['legal_assessment']['v3']['incorrect'], 3)

    def test_changed_evaluated_prompt_is_rejected(self):
        changed = json.loads((ROOT / lm.PROFILE).read_text())
        changed['system_prompt'] = 'Different prompt'
        with patch.object(lm, 'read', return_value=changed), self.assertRaisesRegex(ValueError, 'consignes'):
            lm.profile(ROOT)

    def test_foreign_adapter_is_rejected(self):
        changed = json.loads((ROOT / lm.PROFILE).read_text())
        changed['adapter_path'] = str(Path.home() / 'Projets/KlodyCode/adapters')
        with patch.object(lm, 'read', return_value=changed), self.assertRaisesRegex(ValueError, 'LoRA juridique V3'):
            lm.profile(ROOT)

    def test_api_routes_to_legal_worker_and_disables_incompatible_training(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = server.Engine(folder)
            with patch.object(server, 'engine', engine):
                client = TestClient(server.app)
                response = client.post('/api/chat', json={'model': 'legal', 'question': 'Article R415-5 ?'}, headers=HEADERS)
                self.assertEqual(response.status_code, 202)
                self.assertEqual(Path(engine.commands(response.json())[0][1]).name, 'legal_worker.py')
                response = client.post('/api/train', json={'model': 'legal', 'name': 'test', 'iterations': 2}, headers=HEADERS)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(len(engine.jobs), 1)

    def test_wrong_candidate_is_rejected_by_worker(self):
        with self.assertRaises(ValueError):
            worker.run({'model': 'legal', 'version': 'foreign'}, Mock())

    def test_sources_keep_original_article_and_provenance(self):
        source = {'title': 'Code de la route', 'number': 'R415-5', 'id': 'route:R415-5',
                  'generated_date': '2026-09-07', 'last_modified': '2026-08-20', 'pages': [460], 'text': 'Texte entier'}
        displayed = lm.display_source(source)
        self.assertEqual(displayed['text'], source['text'])
        self.assertEqual(displayed['page'], 460)
        self.assertIn('[route:R415-5]', displayed['title'])
        self.assertIn('2026-09-07', displayed['author'])

    def test_missing_sources_refuse_without_loading_gpu(self):
        import sys
        sys.path.insert(0, str(ROOT))
        import legal
        saved = []
        with patch.object(worker, 'retrieve_sources', return_value=[]), patch.object(legal, 'load_model') as load:
            worker.run({'model': 'legal', 'question': 'Question sans source', 'history': []}, lambda data: saved.append(dict(data)))
        load.assert_not_called()
        self.assertIn('SOURCES_INSUFFISANTES', saved[-1]['answer'])
        self.assertEqual(saved[-1]['phase'], 'done')

    def test_literal_match_never_claims_legal_validation(self):
        note = lm.audit_notice({'unexpected_ids': [], 'unsupported_article_mentions': []},
                              {'excerpts': [{}], 'unmatched_excerpts': 0, 'uncited_or_misattributed_excerpts': 0})
        self.assertIn('ne valide pas', note)


if __name__ == '__main__':
    unittest.main()
