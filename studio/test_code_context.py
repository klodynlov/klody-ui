import unittest
from code_context import has_user_code_spec,coding_question,provided_code_context,specification_messages,is_python_function_request,repeated_protocol_markup

class CodeContextTest(unittest.TestCase):
    def test_explicit_function_spec(self):
        self.assertTrue(has_user_code_spec('Écris une fonction Python qui enlève les doublons en conservant leur ordre.'))
    def test_fenced_code(self):
        self.assertTrue(has_user_code_spec('Pourquoi ceci échoue ?\n```python\ndef solve(x):\n    return x + 1\n```'))
    def test_absent_repository_is_not_a_provided_spec(self):
        for q in ['Quels tests as-tu exécutés dans mon dépôt ?', 'Corrige mon application', 'Comment fonctionne un RAG ?', 'Quelle est la dernière version de Python ?']:
            self.assertFalse(has_user_code_spec(q))
    def test_original_code_survives_query_rewriting(self):
        q='```python\ndef f(x):\n    return x + 1\n```'
        self.assertIn(q,coding_question(q,'Comment écrire une fonction ?'))

    def test_code_followup_keeps_last_proposal(self):
        history=[{'role':'user','content':'Écris une fonction Python qui retourne les entiers pairs d’une liste.'},{'role':'assistant','content':'```python\ndef solve(values):\n    return [x for x in values if x % 2 == 0]\n```'}]
        result=provided_code_context('Ajoute la prise en charge de None.',history)
        self.assertIn(history[-1]['content'],result)
        self.assertIn('None',result)
        self.assertIsNone(provided_code_context('Comment fonctionne un RAG ?',history))

    def test_explicit_spec_does_not_get_empty_source_refusal_cue(self):
        chat=specification_messages('system','Écris une fonction Python qui retourne les nombres pairs.')
        self.assertTrue(chat[1]['content'].startswith('SPÉCIFICATION FOURNIE PAR L’UTILISATEUR :'))
        self.assertNotIn('Aucun passage',chat[1]['content'])
        self.assertEqual(chat[0],{'role':'system','content':'system'})

    def test_python_function_instructions_keep_language_scope(self):
        self.assertTrue(is_python_function_request('Écris une fonction Python qui enlève les doublons.'))
        self.assertFalse(is_python_function_request('Écris une fonction JavaScript qui enlève les doublons.'))
        self.assertFalse(is_python_function_request('Explique cette architecture Python.'))
        self.assertTrue(specification_messages('system','spec','instructions')[1]['content'].endswith('instructions'))

    def test_protocol_repetition_stops_without_hiding_single_mention(self):
        self.assertIsNone(repeated_protocol_markup('Le token <tool_call> est décrit ici.'))
        self.assertEqual(repeated_protocol_markup('code\n<tool_call>\n<tool_call>\n<tool_call>'),5)

if __name__=='__main__':unittest.main()
