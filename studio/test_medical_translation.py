import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import medical_translation as tr
import medical_translation_worker as worker
import server

H={'X-Klody-Studio':'1'}

def sample(text='This applies to adults aged ≥ 70 years, not children.'):
    source={'id':'TEST:1','title':'Original title','publisher':'Test','date':'2026','text':text,'text_sha256':tr.digest(text)}
    return {'answer':tr.reader.render([source]),'sources':[source],'abstained':False,'source_status':'selected',
            'generation_policy':'model_selects_ids_program_copies_contextual_passages'}

class TranslationTests(unittest.TestCase):
    def test_numeric_localization_preserves_values_and_occurrences(self):
        tr.validate_numbers('50,000; 500,000; 3.5; 70 and 70','50 000 ; 500\u202f000 ; 3,5 ; 70 et 70')
        for text in ['50 000 ; 500 000 ; 3,5 ; 70','50 000 ; 500 000 ; 35 ; 70 et 70']:
            with self.assertRaises(ValueError):tr.validate_numbers('50,000; 500,000; 3.5; 70 and 70',text)
    def test_tampered_source_or_answer_rejected(self):
        for key in ['text','text_sha256']:
            r=sample();r['sources'][0][key]='tampered'
            with self.assertRaises(ValueError):tr.selected_sources(r)
        r=sample();r['answer']='unrelated'
        with self.assertRaises(ValueError):tr.selected_sources(r)
    def test_refused_or_unsourced_response_not_translatable(self):
        for changes in [{'abstained':True},{'source_status':'candidates'},{'generation_policy':'free_generation'},{'sources':[]}]:
            with self.assertRaises(ValueError):tr.selected_sources({**sample(),**changes})
    def test_source_is_data_and_original_stays_immutable(self):
        original=sample();before=copy.deepcopy(original)
        french='Ceci s’applique aux adultes âgés de ≥ 70 ans, pas aux enfants.'
        with patch.object(tr.reader,'llm',side_effect=[({'source_language':'en','french':french},{'model':'test'}),({'valid':True,'reason':'Fidèle.'},{})]) as llm:
            result=tr.translate_result(original)
        self.assertEqual(original,before)
        self.assertEqual(llm.call_args_list[0].args[1]['passage'],original['sources'][0]['text'])
        self.assertIn(french,result['answer']);self.assertEqual(result['sources'],[])
        self.assertEqual(result['source_status'],'translation');self.assertFalse(result['translation']['clinical_validation'])
        self.assertEqual(result['translation']['sources'][0]['original_sha256'],original['sources'][0]['text_sha256'])
    def test_changed_number_blocked_before_model_review(self):
        with patch.object(tr.reader,'llm',return_value=({'source_language':'en','french':'Adultes de 60 ans.'},{})) as llm:
            with self.assertRaisesRegex(ValueError,'numérique'):tr.translate_result(sample())
        self.assertEqual(llm.call_count,2)
    def test_model_review_rejects_negation_or_population_error(self):
        for french in ['Ceci ne s’applique pas aux adultes âgés de ≥ 70 ans.', 'Ceci s’applique aux enfants âgés de ≥ 70 ans.']:
            with patch.object(tr.reader,'llm',side_effect=[({'source_language':'en','french':french},{}),({'valid':False,'reason':'Sens modifié.'},{})]*2):
                with self.assertRaisesRegex(ValueError,'Sens modifié'):tr.translate_result(sample())
    def test_incomplete_review_is_not_accepted(self):
        with patch.object(tr.reader,'llm',side_effect=[({'source_language':'en','french':'Adultes de ≥ 70 ans, pas les enfants.'},{}),({'valid':'true'}, {})]*2):
            with self.assertRaises(ValueError):tr.translate_result(sample())
    def test_repair_is_bounded_and_records_rejected_proposal(self):
        french='Adultes de ≥ 70 ans, pas les enfants.'
        with patch.object(tr.reader,'llm',side_effect=[({'source_language':'en','french':'Adultes de 60 ans.'},{}),({'source_language':'en','french':french},{}),({'valid':True,'reason':'Fidèle.'},{})]) as llm:
            result=tr.translate_result(sample())
        attempts=result['translation']['sources'][0]['audit']['attempts']
        self.assertEqual(len(attempts),2);self.assertIn('numérique',attempts[0]['error'])
        self.assertIn('correction_needed',llm.call_args_list[1].args[1])
        self.assertEqual(result['translation']['sources'][0]['french'],french)
    def test_invalid_translation_format_rejected(self):
        for response in [{},{'source_language':'en','french':''},{'source_language':'unknown','french':'Texte'}]:
            with patch.object(tr.reader,'llm',return_value=(response,{})):
                with self.assertRaises(ValueError):tr.translate_result(sample())
    def test_french_passage_must_remain_exact(self):
        original=sample('Le diagnostic ne suffit pas.\n')
        with patch.object(tr.reader,'llm',side_effect=[({'source_language':'fr','french':original['sources'][0]['text'].strip()},{}),({'valid':True,'reason':'Identique.'},{})]):
            result=tr.translate_result(original)
        self.assertEqual(result['translation']['sources'][0]['french'],original['sources'][0]['text'])
        with patch.object(tr.reader,'llm',side_effect=[({'source_language':'fr','french':'Le diagnostic suffit.'},{}),({'valid':True,'reason':'Identique.'},{})]):
            result=tr.translate_result(original)
        self.assertEqual(result['translation']['sources'][0]['french'],original['sources'][0]['text'])
    def test_failed_second_source_never_emits_partial_translation(self):
        r=sample();r['sources']*=2;r['answer']=tr.reader.render(r['sources']);progress=[]
        with patch.object(tr,'translate_source',side_effect=[{'french':'Premier passage.'},ValueError('Second passage refusé')]):
            with self.assertRaises(ValueError):tr.translate_result(r,lambda i,n:progress.append((i,n)))
        self.assertEqual(progress,[(1,2),(2,2)])

class TranslationApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.engine=server.Engine(self.temp.name)
        self.engine_patch=patch.object(server,'engine',self.engine);self.engine_patch.start()
        self.model_patch=patch.object(server,'check_model');self.model_patch.start()
        self.client=TestClient(server.app)
        self.original=self.engine.create('chat','medical',question='Existing question')
        self.engine.update(self.original['id'],status='completed')
        self.path=Path(self.temp.name)/self.original['id']/'result.json'
        server.write(self.path,sample())
    def tearDown(self):self.model_patch.stop();self.engine_patch.stop();self.temp.cleanup()
    def post(self,ident=None):return self.client.post('/api/medical/translate',json={'job_id':ident or self.original['id']},headers=H)
    def test_reuse_persisted_translation_and_preserve_original_job(self):
        before=self.path.read_bytes();original=copy.deepcopy(self.engine.jobs[self.original['id']])
        first=self.post();self.assertEqual(first.status_code,202)
        job=first.json();self.assertEqual(self.post().json()['id'],job['id'])
        self.assertEqual(job['source_result_sha256'],hashlib.sha256(before).hexdigest())
        self.assertEqual(Path(self.engine.commands(job)[0][1]).name,'medical_translation_worker.py')
        self.engine.update(job['id'],status='completed')
        server.write(Path(self.temp.name)/job['id']/'result.json',{'answer':'French','translation':{'target_language':'fr'}})
        cached=self.post().json();self.assertEqual(cached['result']['answer'],'French')
        self.assertEqual(self.path.read_bytes(),before);self.assertEqual(self.engine.jobs[self.original['id']],original)
        self.assertEqual(server.read(Path(self.temp.name)/'jobs.json')[job['id']]['source_job'],self.original['id'])
    def test_cancelled_translation_can_be_retried(self):
        first=self.post().json();self.engine.cancel(first['id'])
        self.assertNotEqual(self.post().json()['id'],first['id'])
    def test_changed_original_or_translator_invalidates_cache(self):
        first=self.post().json();self.engine.update(first['id'],status='completed')
        r=sample('Another passage.');server.write(self.path,r)
        second=self.post().json();self.assertNotEqual(second['id'],first['id'])
        with patch.object(tr,'revision',return_value='new-revision'):
            self.assertNotEqual(self.post().json()['id'],second['id'])
    def test_invalid_nonmedical_and_refused_jobs_rejected(self):
        self.assertEqual(self.post('../bad').status_code,422)
        self.engine.update(self.original['id'],model='music');self.assertEqual(self.post().status_code,409)
        self.engine.update(self.original['id'],model='medical',status='running');self.assertEqual(self.post().status_code,409)
        self.engine.update(self.original['id'],status='completed');server.write(self.path,{**sample(),'abstained':True})
        self.assertEqual(self.post().status_code,409)
    def test_worker_rejects_changed_source_before_or_during_translation(self):
        job={**self.post().json(),'state':self.temp.name}
        self.path.write_text('{}')
        with patch.object(worker,'profile'),patch.object(tr,'translate_result') as translated:
            with self.assertRaisesRegex(ValueError,'originale a changé'):worker.run(job,lambda r:None)
            translated.assert_not_called()
        server.write(self.path,sample());job['source_result_sha256']=hashlib.sha256(self.path.read_bytes()).hexdigest()
        def mutate(*args,**kwargs):self.path.write_text('{}');return {'answer':'Translated'}
        saved=[]
        with patch.object(worker,'profile'),patch.object(tr,'translate_result',side_effect=mutate):
            with self.assertRaisesRegex(ValueError,'pendant'):worker.run(job,saved.append)
        self.assertEqual(saved,[])

if __name__=='__main__':unittest.main()
