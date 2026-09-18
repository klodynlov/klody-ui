import json
import unittest
from query_plan import catalog_request, validate_plan
from retrieve import named_scope, topic_matches

class QueryPlanTests(unittest.TestCase):
    def test_explanation_cannot_become_catalog(self):
        raw={'question':'Quels ouvrages sur informatique quantique ?', 'queries':['informatique quantique','quantum computing'],'intent':'catalog'}
        p=validate_plan(json.dumps(raw),"parle moi d'ordinateur quantique")
        self.assertEqual(p['intent'],'answer')
        self.assertEqual(p['question'],'Explique : ordinateur quantique')
    def test_followup_resolves_subject_without_including_old_refusal(self):
        raw={'question':'Quels ouvrages sur informatique quantique ?', 'queries':['informatique quantique','quantum computing'],'intent':'catalog'}
        p=validate_plan(json.dumps(raw),'est ce qu’il y a des livres qui en parlent ?')
        self.assertEqual(p['intent'],'catalog')
        self.assertIn('quantique',p['question'])
    def test_explicit_topic_explanation_wins_over_prior_books(self):
        history=[{'role':'user','content':'Quels livres parlent de cinéma ?'}]
        self.assertFalse(catalog_request('Explique les ordinateurs quantiques',history))
        self.assertTrue(catalog_request('sur les ordinateurs quantiques',history))
    def test_invalid_or_unbounded_plans_rejected(self):
        for raw in ['[]','{"question":"test","queries":[123],"intent":"answer"}','{"question":"test","queries":[],"intent":"answer"}']:
            with self.assertRaises(ValueError):validate_plan(raw,'Question')
    def test_schema_placeholder_does_not_replace_real_question(self):
        raw={'question':'question autonome en français','queries':['LUFS audio','audio LUFS'],'intent':'answer'}
        original='Quel niveau LUFS as-tu mesuré sur mon fichier audio personnel ?'
        self.assertEqual(validate_plan(json.dumps(raw),original)['question'],original)
    def test_named_device_search_keeps_subject_not_network_setup(self):
        plan={'original_question':'je veux faire un kick sub sur mpc live 3'}
        scope=named_scope(plan,[{'id':217,'title':'MPC Live III User Guide'},{'id':2,'title':'MPC configuration'}])
        self.assertEqual(scope['book_ids'],[217])
        self.assertEqual(scope['query'],'kick sub')
        self.assertFalse(topic_matches('Configure the Wi-Fi network on MPC Live III',scope['query']))
        self.assertTrue(topic_matches('DrumSynth offers Kick and Snare models.',scope['query']))
    def test_broad_topic_is_not_confused_with_named_device(self):
        self.assertIsNone(named_scope({'original_question':'parle moi de quantum computing'},[{'id':1,'title':'Quantum Computing Explained'}]))
    def test_queries_remain_data(self):
        raw={'question':'Comment régler le MPC Live 3 ?', 'queries':['MPC Live 3','MPC Live 3'],'intent':'answer'}
        p=validate_plan(json.dumps(raw),'Comment régler le MPC Live 3 ?')
        self.assertEqual(p['queries'],['MPC Live 3'])
        self.assertIn('3',p['question'])

if __name__=='__main__':unittest.main()
