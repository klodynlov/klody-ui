import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import requests
import medical_french_worker as worker
import medical_translation as tr
import server
from test_medical_translation import sample, H


class FrenchDefaultTests(unittest.TestCase):
    def run_worker(self, result, translated=None, error=None):
        saved=[]
        def answer(question, save):
            save({**result,'phase':'selection','answer':''})
            save({**result,'phase':'done'})
            return result
        with patch.object(worker.documentary,'profile',return_value={'model_id':tr.reader.MODEL,'base_model_path':str(tr.reader.BASE)}), \
             patch.object(tr.reader,'answer',side_effect=answer), \
             patch.object(tr,'translate_result',return_value=translated,side_effect=error) as translator:
            worker.run({'model':'medical','question':'douleur aux oreilles'},saved.append)
        return saved,translator

    def test_french_answer_preserves_original_evidence_and_never_streams_english(self):
        original=sample();before=copy.deepcopy(original)
        translated={'answer':'Ceci s’applique aux adultes de ≥ 70 ans, pas aux enfants.',
                    'translation':{'target_language':'fr'},'audit_notice':'Traduction automatique locale.'}
        saved,translator=self.run_worker(original,translated)
        self.assertEqual(original,before)
        translator.assert_called_once()
        self.assertEqual(saved[-1]['answer'],translated['answer'])
        self.assertEqual(saved[-1]['original_answer'],original['answer'])
        self.assertEqual(saved[-1]['generation_policy'],tr.FRENCH_POLICY)
        self.assertEqual(saved[-1]['sources'][0]['text'],original['sources'][0]['text'])
        self.assertEqual(saved[-1]['sources'][0]['text_sha256'],original['sources'][0]['text_sha256'])
        self.assertTrue(all('This applies' not in r['answer'] for r in saved))
        self.assertIn('translation',[r['phase'] for r in saved])

    def test_refusals_remain_french_without_translation(self):
        original={**sample(),'answer':'SOURCES_INSUFFISANTES : aucun passage adapté.',
                  'sources':[],'abstained':True,'source_status':'candidates'}
        saved,translator=self.run_worker(original)
        translator.assert_not_called()
        self.assertEqual(saved[-1]['answer'],original['answer'])

    def test_rejected_or_unavailable_translation_keeps_french_status_and_original(self):
        for error in [tr.TranslationRejected('Sens modifié.',[{'error':'Sens modifié.'}]),requests.Timeout('timeout')]:
            with self.subTest(error=error):
                original=sample()
                saved,_=self.run_worker(original,error=error)
                result=saved[-1]
                self.assertIn('La réponse en français',result['answer'])
                self.assertEqual(result['original_answer'],original['answer'])
                self.assertEqual(result['phase'],'done')
                self.assertTrue(result['translation_error'])
                self.assertEqual(tr.selected_sources(result),result['sources'])

    def test_failed_automatic_translation_can_be_retried_through_api(self):
        saved,_=self.run_worker(sample(),error=tr.TranslationRejected('Sens modifié.',[]))
        with tempfile.TemporaryDirectory() as folder:
            engine=server.Engine(folder)
            job=engine.create('chat','medical',question='douleur aux oreilles')
            engine.update(job['id'],status='completed')
            path=Path(folder)/job['id']/'result.json'
            server.write(path,saved[-1]);before=path.read_bytes()
            with patch.object(server,'engine',engine),patch.object(server,'check_model'):
                response=TestClient(server.app).post('/api/medical/translate',json={'job_id':job['id']},headers=H)
            self.assertEqual(response.status_code,202,response.text)
            self.assertEqual(response.json()['source_job'],job['id'])
            self.assertEqual(path.read_bytes(),before)

    def test_tampered_original_answer_is_still_rejected_after_presentation(self):
        result={**sample(),'answer':'Français','original_answer':'unrelated','generation_policy':tr.FRENCH_POLICY}
        with self.assertRaisesRegex(ValueError,'originale'):tr.selected_sources(result)


if __name__=='__main__':unittest.main()
