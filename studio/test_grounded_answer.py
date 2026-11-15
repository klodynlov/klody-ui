"""Contract of the checked answers, without any model: each control must be able to reject."""
import unittest
import grounded_answer as g

ARTICLE = ("Le consommateur dispose d'un délai de quatorze jours pour exercer son droit de rétractation d'un contrat "
           "conclu à distance, sans avoir à motiver sa décision.")
SOURCES = [{'title': 'Code de la consommation', 'reference': 'Code de la consommation · article L221-18', 'text': ARTICLE},
           {'title': 'Code pénal', 'reference': 'Code pénal · article 131-13', 'text': '4° 750 euros au plus pour les contraventions de la 4e classe ;'}]
GOOD = {'titre': 'Délai', 'affirmation': 'Selon l’article L221-18, le consommateur dispose de 14 jours pour se rétracter.',
        'source': 'S1', 'extrait': 'Le consommateur dispose d’un délai de quatorze jours pour exercer son droit de rétractation'}


def scripted(*replies):
    """A model double returning the given objects in order."""
    queue = list(replies)

    def call(system, data, max_tokens=0):
        reply = queue.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply
    call.remaining = queue
    return call


def accept(n):
    return {'verdicts': [{'n': i + 1, 'etabli': True, 'motif': ''} for i in range(n)]}


class LiteralControls(unittest.TestCase):
    def test_excerpt_survives_typography_but_not_invention(self):
        self.assertTrue(g.excerpt_found('Le consommateur dispose d’un délai  de quatorze jours', ARTICLE))
        self.assertTrue(g.excerpt_found('Le consommateur dispose d\'un délai […] sans avoir à motiver sa décision', ARTICLE))
        self.assertFalse(g.excerpt_found('Le consommateur dispose d\'un délai de trente jours', ARTICLE))
        self.assertFalse(g.excerpt_found('délai', ARTICLE))
        # A short excerpt has no room for extraction noise: it is literal or refused.
        self.assertFalse(g.excerpt_found("Le consommateur disposa d'un délai", ARTICLE))

    def test_pdf_damage_is_tolerated_but_a_rewrite_or_a_changed_figure_is_not(self):
        damaged = ('les ETF (Exchange Traded Funds) ou trackers sont des titres \ue01fnanciers de nouvelle génération qui '
                   'reproduisent \ue01fdèlement la performance d’un indice. Ils sont apparus en France en 2001 pour les parti- culiers.')
        self.assertTrue(g.excerpt_found('les ETF (Exchange Traded Funds) ou trackers sont des titres financiers de nouvelle génération qui reproduisent fidèlement la performance d’un indice', damaged))
        self.assertTrue(g.excerpt_found('Ils sont apparus en France en 2001 pour les particuliers', damaged))
        self.assertFalse(g.excerpt_found('Ils sont apparus en France en 2011 pour les particuliers et les entreprises', damaged))
        self.assertFalse(g.excerpt_found('les ETF sont des produits risqués de nouvelle génération qui dépassent toujours la performance d’un indice', damaged))

    def test_the_quotation_shown_is_cut_from_the_source_not_from_the_model_copy(self):
        damaged = ('Avant. Les ETF ou trackers sont des titres \ue01fnanciers de nouvelle génération qui reproduisent '
                   '\ue01fdèlement la performance d’un indice. Après.')
        copy = 'les ETF ou trackers sont des titres financiers de nouvelle génération qui reproduisent fidèlement la performance d’un indice'
        quoted = g.locate(copy, damaged)
        self.assertIn('titres \ue01fnanciers', quoted)
        self.assertNotIn('financiers', quoted)
        self.assertTrue(quoted.startswith('Les ETF') and quoted.endswith('indice.'))
        # An abridged copy is located too, and it is the full source wording that is shown.
        abridged = 'les ETF sont des titres financiers de nouvelle génération qui reproduisent la performance d’un indice'
        self.assertIn('ou trackers', g.locate(abridged, damaged))
        kept, _ = g.verify([{'titre': 't', 'affirmation': 'Un ETF reproduit la performance d’un indice.', 'source': 'S1', 'extrait': abridged}],
                           [{'title': 'Livre', 'text': damaged}], 'ETF ?')
        self.assertIn('\ue01fdèlement', kept[0]['extrait'])

    def test_a_figure_in_words_in_the_claim_is_controlled_too(self):
        claim = {**GOOD, 'affirmation': 'Le consommateur dispose de quinze jours pour se rétracter.'}
        self.assertEqual(g.verify([claim], SOURCES, 'q')[0], [])
        claim = {**GOOD, 'affirmation': 'Le consommateur dispose d’un délai de quatorze jours, sans motif.'}
        self.assertEqual(len(g.verify([claim], SOURCES, 'q')[0]), 1)

    def test_tolerance_never_covers_a_figure_written_in_words(self):
        long_article = ARTICLE + ' Ce délai court à compter de la réception du bien par le consommateur ou un tiers désigné par lui.'
        good = 'Le consommateur dispose d’un délai de quatorze jours pour exercer son droit de rétractation d’un contrat conclu à distance'
        self.assertTrue(g.excerpt_found(good, long_article))
        self.assertFalse(g.excerpt_found(good.replace('quatorze', 'quinze'), long_article))

    def test_gap_description_cannot_smuggle_a_figure_from_memory(self):
        draft = {'points': [], 'manque': 'La valeur normale (inférieure à 1,10 g/L selon l’OMS) n’est pas dans les textes.'}
        result = g.compose('glycémie normale ?', SOURCES, call=scripted(draft))
        self.assertNotIn('1,10', result['answer'])
        self.assertTrue(result['grounding']['missing_replaced'])
        kept = g.compose('q', SOURCES, call=scripted({'points': [], 'manque': 'Le délai de 14 jours ne concerne pas ce cas.'}))
        self.assertIn('14 jours', kept['answer'])

    def test_ordinals_support_abbreviated_classes(self):
        self.assertIn('4', g.numbers('contraventions de la quatrième classe', words=True))
        self.assertIn('9', g.numbers('neuvième', words=True))

    def test_numbers_read_digits_and_words(self):
        self.assertEqual(g.numbers('45 000 euros et 2,5 jours, 1.10 g/L'), {'45000', '2.5', '1.1'})
        self.assertIn('14', g.numbers('quatorze jours', words=True))
        self.assertIn('95', g.numbers('quatre-vingt-quinze', words=True))
        self.assertNotIn('14', g.numbers('quatorze jours'))

    def test_claim_is_kept_only_with_a_literal_excerpt_and_supported_figures(self):
        kept, rejected = g.verify([GOOD], SOURCES, 'droit de rétractation')
        self.assertEqual((len(kept), rejected), (1, []))
        wrong_figure = {**GOOD, 'affirmation': 'Le consommateur dispose de 30 jours pour se rétracter.'}
        invented = {**GOOD, 'extrait': 'Le délai de rétractation est de trente jours ouvrables.'}
        wrong_source = {**GOOD, 'source': 'S2'}
        unknown = {**GOOD, 'source': 'S9'}
        kept, rejected = g.verify([wrong_figure, invented, wrong_source, unknown], SOURCES, 'droit de rétractation')
        self.assertEqual(kept, [])
        self.assertEqual([r['motif'].split(' :')[0] for r in rejected],
                         ['chiffre absent de la source', 'extrait introuvable dans la source citée',
                          'extrait introuvable dans la source citée', 'source inconnue'])

    def test_a_figure_from_the_question_is_not_an_invention(self):
        claim = {**GOOD, 'affirmation': 'Après 70 ans, le consommateur dispose de 14 jours.'}
        self.assertEqual(len(g.verify([claim], SOURCES, 'et après 70 ans ?')[0]), 1)
        self.assertEqual(len(g.verify([claim], SOURCES, 'et après ?')[0]), 0)


class Composition(unittest.TestCase):
    def draft(self, *points, summary='Le délai est de 14 jours.', missing=''):
        return {'suffisant': True, 'points': list(points), 'en_bref': summary, 'manque': missing}

    def test_checked_answer_is_structured_and_cites_only_used_sources(self):
        result = g.compose('droit de rétractation', SOURCES, call=scripted(self.draft(GOOD), accept(1)))
        self.assertFalse(result['abstained'])
        self.assertEqual(result['used'], [0])
        for part in ('**En bref**', '**Ce que disent les sources**', '[1]', '> « Le consommateur', '**Sources**',
                     '- [1] Code de la consommation · article L221-18'):
            self.assertIn(part, result['answer'])
        self.assertNotIn('Code pénal', result['answer'])

    def test_no_supported_claim_is_an_abstention_not_prose(self):
        invented = {**GOOD, 'extrait': 'Texte qui ne figure dans aucune source fournie ici.'}
        result = g.compose('q', SOURCES, hint='précisez', searched=['rétractation'], call=scripted(self.draft(invented), {'points': []}))
        self.assertTrue(result['abstained'])
        self.assertIn('Je ne peux pas répondre précisément', result['answer'])
        self.assertIn('Recherches effectuées : rétractation', result['answer'])
        self.assertNotIn('14 jours', result['answer'])

    def test_second_reading_removes_a_claim_and_its_summary(self):
        other = {'titre': 'Amende', 'affirmation': 'L’amende est de 750 euros au plus.', 'source': 'S2',
                 'extrait': '750 euros au plus pour les contraventions de la 4e classe'}
        verdicts = {'verdicts': [{'n': 1, 'etabli': True}, {'n': 2, 'etabli': False, 'motif': 'hors sujet'}]}
        result = g.compose('q', SOURCES, call=scripted(self.draft(GOOD, other, summary='14 jours et 750 euros.'), verdicts))
        self.assertNotIn('750', result['answer'])
        self.assertEqual(result['grounding']['claims_kept'], 1)
        self.assertTrue(result['grounding']['summary_replaced'])
        self.assertIn('retirée', g.notice(result))

    def test_refused_claim_gets_one_repair_round_then_the_same_controls(self):
        mixed = {**GOOD, 'affirmation': 'Le délai est de 14 jours et l’amende de 750 euros.'}
        fine = {'titre': 'Amende', 'affirmation': 'L’amende est de 750 euros au plus.', 'source': 'S2',
                'extrait': '750 euros au plus pour les contraventions de la 4e classe'}
        seen = {}

        def call(system, data, max_tokens=0):
            if 'a_corriger' in data:
                seen['motif'] = data['a_corriger'][0]['motif']
                return {'points': [GOOD, fine]}
            if 'elements' in data:
                return accept(len(data['elements']))
            return self.draft(mixed, summary='14 jours et 750 euros.')
        result = g.compose('q', SOURCES, call=call)
        self.assertIn('chiffre absent de la source', seen['motif'])
        self.assertEqual((result['grounding']['claims_kept'], result['grounding']['claims_repaired']), (2, 2))
        self.assertEqual(result['grounding']['claims_rejected'], [])
        self.assertIn('750 euros au plus', result['answer'])
        # A repair that invents again is refused again, and said.
        invented = {**GOOD, 'extrait': 'Phrase absente de toutes les sources fournies ici.'}
        result = g.compose('q', SOURCES, call=scripted(self.draft(invented), {'points': [invented]}))
        self.assertTrue(result['abstained'])

    def test_gap_text_hides_internal_labels_without_losing_its_meaning(self):
        self.assertEqual(g.plain_gap('Le montant n’est pas mentionné (S1 à S11). S12 fixe un autre cas.'),
                         'Le montant n’est pas mentionné. une des sources fixe un autre cas.')
        self.assertEqual(g.plain_gap('La source S12 indique un autre cas.'), 'une des sources indique un autre cas.')
        draft = {'points': [], 'manque': 'Le capital minimum n’est pas mentionné dans les articles fournis (S1 à S11).'}
        result = g.compose('capital ?', SOURCES, call=scripted(draft))
        self.assertIn('Le capital minimum n’est pas mentionné dans les articles fournis.', result['answer'])
        self.assertNotIn('missing_replaced', result['grounding'])

    def test_summary_after_a_refusal_comes_from_the_second_reading_under_figure_control(self):
        other = {'titre': 'Amende', 'affirmation': 'L’amende est de 750 euros au plus.', 'source': 'S2',
                 'extrait': '750 euros au plus pour les contraventions de la 4e classe'}

        def reading(summary):
            return {'verdicts': [{'n': 1, 'etabli': True}, {'n': 2, 'etabli': False, 'motif': 'hors sujet'}], 'en_bref': summary}
        result = g.compose('q', SOURCES, call=scripted(self.draft(GOOD, other, summary='14 jours et 750 euros.'), reading('Le délai est de 14 jours.')))
        self.assertIn('**En bref**\n\nLe délai est de 14 jours.', result['answer'])
        result = g.compose('q', SOURCES, call=scripted(self.draft(GOOD, other, summary='14 jours et 750 euros.'), reading('Le délai est de 30 jours.')))
        self.assertNotIn('**En bref**', result['answer'])
        self.assertNotIn('30 jours', result['answer'])
        for meta in ('L’affirmation est établie : le délai est de 14 jours.', 'Les affirmations 1 et 2 sont justes.', 'Selon l’extrait, 14 jours.'):
            result = g.compose('q', SOURCES, call=scripted(self.draft(GOOD, other, summary='14 jours et 750 euros.'), reading(meta)))
            self.assertNotIn('**En bref**', result['answer'], meta)

    def test_summary_with_an_unsupported_figure_is_replaced(self):
        result = g.compose('q', SOURCES, call=scripted(self.draft(GOOD, summary='Le délai est de 30 jours.'), accept(1)))
        self.assertNotIn('30 jours', result['answer'])

    def test_missing_second_reading_is_said_not_hidden(self):
        result = g.compose('q', SOURCES, call=scripted(self.draft(GOOD), g.LLMError('indisponible')))
        self.assertFalse(result['abstained'])
        self.assertFalse(result['grounding']['second_reading'])
        self.assertIn('relecture automatique n’a pas pu être effectuée', g.notice(result))

    def test_model_failure_is_a_clear_message_never_an_exception(self):
        result = g.compose('q', SOURCES, call=scripted(g.LLMError('Le modèle local est momentanément indisponible')))
        self.assertTrue(result['abstained'] and result['failed'])
        self.assertIn('momentanément indisponible', result['answer'])

    def test_no_source_never_calls_the_model(self):
        call = scripted()
        self.assertTrue(g.compose('q', [], call=call)['abstained'])


class Resolution(unittest.TestCase):
    def test_follow_up_uses_the_model_and_keeps_the_original(self):
        plan = g.resolve('Et c’est combien l’amende', [{'role': 'user', 'content': 'rouler sans contrôle technique'}],
                         'droit', call=scripted({'question': 'Montant de l’amende pour défaut de contrôle technique',
                                                 'recherches': ['amende contrôle technique', 'amende contrôle technique']}))
        self.assertEqual(plan['question'], 'Montant de l’amende pour défaut de contrôle technique')
        self.assertEqual(plan['recherches'], ['amende contrôle technique'])
        self.assertEqual(plan['original_question'], 'Et c’est combien l’amende')
        self.assertFalse(plan['hors_champ'] or plan['trop_vague'])

    def test_unusable_plan_falls_back_to_the_literal_question(self):
        for reply in (g.LLMError('x'), {'question': 5, 'recherches': 'non'}):
            plan = g.resolve('hernie', [], 'médecine', call=scripted(reply))
            self.assertEqual((plan['question'], plan['recherches']), ('hernie', ['hernie']))

    def test_personal_data_question_is_refused_with_its_reason(self):
        plan = g.resolve('Quel CA ai-je fait ?', [], 'd', call=scripted({'question': 'Quel CA ai-je fait ?', 'recherches': ['ca'], 'donnee_personnelle': True}))
        self.assertIn('vos propres données', g.refusal(plan, 'hors champ'))
        plan = g.resolve('q ?', [], 'd', call=scripted({'donnee_personnelle': 'oui', 'hors_champ': True}))
        self.assertEqual(g.refusal(plan, 'hors champ'), 'hors champ')
        self.assertIsNone(g.refusal(g.resolve('q ?', [], 'd', call=scripted({})), 'hors champ'))

    def test_out_of_scope_needs_an_explicit_true(self):
        self.assertFalse(g.resolve('q ?', [], 'd', call=scripted({'hors_champ': 'true'}))['hors_champ'])
        self.assertTrue(g.resolve('q ?', [], 'd', call=scripted({'hors_champ': True}))['hors_champ'])


class Transport(unittest.TestCase):
    class Reply:
        def __init__(self, status, content=''):
            self.status_code = status
            self.content = content

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(self.status_code)

        def json(self):
            return {'choices': [{'message': {'content': self.content}}]}

    def test_memory_refusal_is_retried_then_reported_in_french(self):
        import time
        calls = []
        original = time.sleep
        time.sleep = lambda s: None
        try:
            def busy(*a, **k):
                calls.append(k['headers'])
                return self.Reply(503)
            with self.assertRaises(g.LLMError) as error:
                g.llm('s', {}, post=busy)
            self.assertEqual(len(calls), 3)
            self.assertIn('momentanément indisponible', str(error.exception))
            self.assertEqual(calls[0]['X-Klody-App'], 'klody-studio')
            replies = [self.Reply(503), self.Reply(200, '```json\n{"ok": true}\n```')]
            self.assertEqual(g.llm('s', {}, post=lambda *a, **k: replies.pop(0)), {'ok': True})
        finally:
            time.sleep = original

    def test_cut_or_malformed_object_is_asked_again_with_more_room(self):
        sizes = []

        class Cut(self.Reply):
            def json(inner):
                return {'choices': [{'finish_reason': 'length', 'message': {'content': '{"points": [{"titre": "x'}}]}
        replies = [Cut(200), self.Reply(200, '{"ok": 1}')]

        def post(url, json=None, **k):
            sizes.append(json['max_tokens'])
            return replies.pop(0)
        self.assertEqual(g.llm('s', {}, max_tokens=100, post=post), {'ok': 1})
        self.assertEqual(sizes, [100, 200])
        with self.assertRaises(g.LLMError):
            g.llm('s', {}, post=lambda *a, **k: self.Reply(200, 'prose sans objet'))

    def test_complete_claims_of_a_cut_object_are_kept(self):
        cut = '{"suffisant": true, "points": [' + __import__('json').dumps(GOOD) + ', {"titre": "Suite", "affirmation": "Phrase interrompue'
        value = g.parse_object(cut)
        self.assertEqual((len(value['points']), value['salvaged']), (1, True))
        result = g.compose('q', SOURCES, call=scripted(value, accept(1)))
        self.assertFalse(result['abstained'])
        self.assertTrue(result['grounding']['summary_replaced'])
        self.assertIsNone(g.salvage('{"points": [{"titre": "x'))

    def test_prose_instead_of_an_object_is_an_error(self):
        with self.assertRaises(g.LLMError):
            g.parse_object('Voici ma réponse.')
        with self.assertRaises(g.LLMError):
            g.parse_object('[1, 2]')


if __name__ == '__main__':
    unittest.main()
