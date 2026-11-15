"""Orchestration of the checked-answer workers, without model, corpus or GPU."""
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import legal_grounded_worker as legal
import library_grounded_worker as library
import medical_grounded_worker as medical
from models import MODELS
from test_grounded_answer import scripted, accept

CODES = [{'legi_id': 'TRAVAIL', 'title': 'Code du travail'}, {'legi_id': 'PENAL', 'title': 'Code pénal'}]
ARTICLE = "L'employeur et le salarié peuvent convenir en commun des conditions de la rupture du contrat de travail qui les lie."


def row(ident, kind='code', number='L1237-11', text=ARTICLE):
    return {'id': ident, 'document_id': ident, 'kind': kind, 'title': 'Code du travail', 'number': number, 'text': text,
            'valid_from': '2008-06-27', 'generated_date': '2026-09-18', 'jurisdiction': 'Cour de cassation',
            'decision_date': '2025-02-01', 'fund': 'CASS', 'is_excerpt': False}


class LegalCandidates(unittest.TestCase):
    def search(self, plan):
        calls = []

        def fake(question, index, limit=5, source_ids=None):
            calls.append((question, source_ids))
            if question.startswith('article '):
                return [row('HINT')]
            if question.startswith('jurisprudence '):
                return [row('DECISION', kind='decision'), row('CODE-IN-DECISIONS')]
            return [row('BM25-' + str(len(calls)))]
        with patch.object(legal.corpus_search, 'retrieve', fake):
            found, attempts = legal.candidates(plan, 'index', CODES)
        return found, calls

    def plan(self, **extra):
        return {'original_question': 'rupture conventionnel', 'question': 'Comment fonctionne la rupture conventionnelle ?', 'recherches': ['rupture conventionnelle'],
                'codes': ['Code du travail', 'Code inconnu'], 'articles': [{'code': 'code du travail', 'numero': 'L. 1237-11'}], **extra}

    def test_hinted_article_comes_first_and_is_read_in_its_code(self):
        found, calls = self.search(self.plan())
        self.assertEqual(found[0]['id'], 'HINT')
        self.assertEqual(calls[0], ('article L1237-11', ['TRAVAIL']))

    def test_unknown_code_or_malformed_hint_is_ignored_not_guessed(self):
        found, calls = self.search(self.plan(articles=[{'code': 'Code imaginaire', 'numero': '12'}, 'L1', {'code': 'Code pénal'}]))
        self.assertFalse(any(q.startswith('article ') for q, _ in calls))
        self.assertTrue(all(ids in (['TRAVAIL'], ['TRAVAIL', 'PENAL']) for _, ids in calls))

    def test_sick_leave_is_not_a_request_for_case_law(self):
        for question in ('Arret de travail', 'arrêt maladie et salaire', 'décision de mon employeur'):
            self.assertFalse(legal.wants_decisions(question), question)
        for question in ('un arrêt de la Cour de cassation sur le harcèlement', 'jurisprudence rupture conventionnelle'):
            self.assertTrue(legal.wants_decisions(question), question)

    def test_decisions_only_when_the_question_asks_for_them(self):
        found, _ = self.search(self.plan())
        self.assertFalse(any(s['kind'] == 'decision' for s in found))
        found, _ = self.search(self.plan(jurisprudence=True))
        self.assertEqual([s['id'] for s in found if s['retrieval_origin'].startswith('jurisprudence')], ['DECISION'])


class LegalFollow(unittest.TestCase):
    def follow(self, result, sources):
        asked = []

        def fake(question, index, limit=5, source_ids=None):
            asked.append(question)
            return [row('NEW-' + question)]
        with patch.object(legal.corpus_search, 'retrieve', fake):
            found = legal.cited_articles(result, sources, ['TRAVAIL'], 'index')
        return asked, found

    def test_abstention_reads_the_articles_the_sources_point_to(self):
        sources = [row('A', number='L3121-18', text='durées fixées par les articles L. 3121-18 et L. 3121-27.'),
                   row('B', number='L3162-1', text='dans la limite de l\'article L. 3121-27.')]
        asked, found = self.follow({'abstained': True, 'used': [], 'missing': 'La valeur n’est pas donnée.', 'excerpts': []}, sources)
        self.assertEqual(asked, ['article L3121-27'])
        self.assertEqual(len(found), 1)

    def test_answered_question_pays_no_second_reading(self):
        sources = [row('A', text='voir l\'article L. 1237-13.')]
        for result in ({'abstained': False, 'used': [0, 1], 'missing': 'voir L. 1237-14', 'excerpts': []},
                       {'abstained': False, 'used': [0], 'missing': '', 'excerpts': ['voir l\'article L. 1237-13']}):
            self.assertEqual(self.follow(result, sources), ([], []))


class LegalRun(unittest.TestCase):
    def run_job(self, call, question='Et c’est combien ?', history=()):
        saved = []
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / 'coverage.json').write_text(json.dumps({'code_count': 2}))
            with patch.object(legal.corpus_search, 'active', lambda root: folder), \
                 patch.object(legal, 'catalog', lambda: CODES), \
                 patch.object(legal.corpus_search, 'retrieve', lambda *a, **k: [row('LEGIARTI1')]):
                legal.run({'model': 'legal', 'question': question, 'history': list(history)}, saved.append, call=call)
        return saved[-1]

    def test_conversation_is_resolved_and_only_used_sources_are_shown(self):
        seen = {}

        def call(system, data, max_tokens=0):
            if 'echanges_precedents' in data:
                seen['history'] = data['echanges_precedents']
                return {'question': 'Comment rompre un CDI d’un commun accord ?', 'recherches': ['rupture conventionnelle'], 'codes': ['Code du travail']}
            if 'sources' in data:
                seen['references'] = [s['reference'] for s in data['sources']]
                return {'points': [{'titre': 'Accord', 'affirmation': 'Selon l’article L1237-11 du Code du travail, employeur et salarié peuvent convenir de la rupture.',
                                    'source': 'S1', 'extrait': "L'employeur et le salarié peuvent convenir en commun des conditions de la rupture"}], 'en_bref': 'Un accord commun est possible.'}
            return accept(1)
        result = self.run_job(call, history=[{'role': 'user', 'content': 'rupture conventionnelle'}])
        self.assertEqual(seen['history'][0]['content'], 'rupture conventionnelle')
        self.assertEqual(seen['references'], ['Code du travail · article L1237-11'])
        self.assertEqual(result['history_policy'], 'conversation_resolved')
        self.assertEqual(result['resolved_question'], 'Comment rompre un CDI d’un commun accord ?')
        self.assertEqual((result['phase'], result['abstained'], len(result['sources'])), ('done', False, 1))
        self.assertIn('**Ce que disent les sources**', result['answer'])
        self.assertIn('pas un conseil juridique', result['audit_notice'])
        self.assertEqual(result['parameters'], '35B')

    def test_out_of_scope_is_refused_before_any_search(self):
        with patch.object(legal, 'candidates', side_effect=AssertionError('no search expected')):
            result = self.run_job(scripted({'question': 'Capitale de l’Australie ?', 'recherches': ['x'], 'hors_champ': True}))
        self.assertTrue(result['abstained'])
        self.assertIn('ne relève pas du droit français', result['answer'])

    def test_candidate_versions_are_refused(self):
        with self.assertRaises(ValueError):
            legal.run({'model': 'legal', 'question': 'q', 'version': 'a' * 32}, lambda data: None, call=scripted())


class LibraryRun(unittest.TestCase):
    SOURCE = {'book_id': 1, 'chunk_id': 2, 'title': 'Finance pour tous', 'author': 'A. Auteur', 'page': 12,
              'text': 'Une obligation est un titre de créance émis par une entreprise ou un État.'}

    def run_job(self, context, call):
        saved = []
        with tempfile.TemporaryDirectory() as temp:
            library.run({'model': 'business', 'question': 'obligation ?', 'history': []}, saved.append, Path(temp), call=call,
                        search=lambda plan, category, folder, here: context)
        return saved[-1]

    def test_business_scope_now_reads_finance_shelves(self):
        self.assertEqual(MODELS['business']['worker'], 'library_grounded_worker.py')
        for shelf in ('Business', 'Économie', 'Finance_quantitative', 'Crypto_Finance'):
            self.assertIn(shelf, MODELS['business']['category'])
        self.assertNotIn('Musique', MODELS['business']['category'])

    def test_passages_below_the_relevance_gate_never_reach_the_model(self):
        context = {'sources': [self.SOURCE], 'accepted_sources': 0, 'confidence': {'level': 'insufficient'}}
        result = self.run_job(context, scripted({'question': 'Qu’est-ce qu’une obligation ?', 'recherches': ['obligation']}))
        self.assertTrue(result['abstained'])
        self.assertIn('seuil de pertinence', result['answer'])

    def test_accepted_passage_gives_a_checked_answer_with_its_notice(self):
        context = {'sources': [dict(self.SOURCE)], 'accepted_sources': 1, 'confidence': {'level': 'high'}}
        draft = {'points': [{'titre': 'Définition', 'affirmation': 'Une obligation est un titre de créance.', 'source': 'S1',
                             'extrait': 'Une obligation est un titre de créance émis par une entreprise ou un État.'}], 'en_bref': ''}
        result = self.run_job(context, scripted({'question': 'Qu’est-ce qu’une obligation ?', 'recherches': ['obligation', 'bond']}, draft, accept(1)))
        self.assertFalse(result['abstained'])
        self.assertIn('- [1] Finance pour tous · A. Auteur · p. 12', result['answer'])
        self.assertIn('pas un conseil en investissement', result['audit_notice'])


class MedicalCandidates(unittest.TestCase):
    def reader(self):
        reader = types.SimpleNamespace()
        reader.medical = types.SimpleNamespace(norm=lambda text: text.lower(), FAMILIES={'bronchiolite': ['bronchiolite']})
        reader.primary_search = lambda question: [{'id': 'HAS1', 'text': 'has'}]
        reader.dictionary_search = lambda plan: [{'id': 'DICT', 'text': 'dict'}]
        reader.global_search = lambda plan: ([{'id': 'REF1', 'text': 'ref'}, {'id': 'VET', 'text': 'chien'}], {'attempts': []})
        reader.safe_source = lambda source, question: source['id'] != 'VET'
        return reader

    def plan(self, question):
        return {'question': question, 'original_question': question, 'recherches': ['fr', 'en'],
                'sujets': [{'fr': 'prééclampsie', 'en': 'preeclampsia'}]}

    def test_dated_publications_only_join_on_their_own_themes(self):
        found, audit = medical.candidates(self.reader(), self.plan('Qu’est-ce que la prééclampsie ?'))
        self.assertEqual([s['id'] for s in found], ['DICT', 'REF1'])
        self.assertEqual(audit['dated_families'], [])
        found, audit = medical.candidates(self.reader(), self.plan('Prise en charge de la bronchiolite'))
        self.assertEqual([s['id'] for s in found], ['HAS1', 'DICT', 'REF1'])

    def test_unsafe_sources_are_never_candidates(self):
        found, _ = medical.candidates(self.reader(), self.plan('x'))
        self.assertNotIn('VET', [s['id'] for s in found])

    def test_registry_points_to_checked_workers(self):
        self.assertEqual(MODELS['medical']['worker'], 'medical_grounded_worker.py')
        self.assertEqual(MODELS['legal']['worker'], 'legal_grounded_worker.py')
        for worker in ('medical_grounded_worker.py', 'legal_grounded_worker.py', 'library_grounded_worker.py'):
            self.assertTrue((Path(__file__).with_name(worker)).is_file())


if __name__ == '__main__':
    unittest.main()
