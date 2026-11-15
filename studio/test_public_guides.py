"""Official sheets index: built from a synthetic archive, no download, no local corpus."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

import public_guides as g


def sheet(ident='F1', title='Livret A', theme='Argent - Impôts - Consommation', body=None, modified='2026-08-01'):
    body = body or '''<Chapitre><Titre><Paragraphe>Quel est le plafond du livret A ?</Paragraphe></Titre>
        <Paragraphe>Le plafond du livret A est de <Valeur>22 950 €</Valeur> pour une personne physique.</Paragraphe>
        <Liste><Item><Paragraphe>Versement minimum : 10 €</Paragraphe></Item><Item><Paragraphe>Un seul livret par personne</Paragraphe></Item></Liste>
        <Tableau><Rangée><Cellule>Taux</Cellule><Cellule>1,5 %</Cellule></Rangée></Tableau></Chapitre>'''
    return f'''<?xml version="1.0" encoding="UTF-8"?><Publication xmlns:dc="http://purl.org/dc/elements/1.1/" ID="{ident}"
        spUrl="https://www.service-public.gouv.fr/particuliers/vosdroits/{ident}"><dc:title>{title}</dc:title>
        <dc:subject>{theme}</dc:subject><dc:description>Le livret A est un compte d'épargne réglementé.</dc:description>
        <dc:date>modified {modified}</dc:date><Introduction><Texte><Paragraphe>Vous voulez placer votre épargne sans risque ?</Paragraphe></Texte></Introduction>
        <Texte>{body}</Texte></Publication>'''.encode()


class PublicGuides(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'corpora').mkdir()
        self.archive = self.root / 'vosdroits-latest.zip'
        with zipfile.ZipFile(self.archive, 'w') as z:
            z.writestr('F1.xml', sheet())
            z.writestr('F2.xml', sheet('F2', 'Passeport', 'Papiers - Citoyenneté - Élections',
                                       '<Chapitre><Titre><Paragraphe>Demande</Paragraphe></Titre><Paragraphe>Le passeport se demande en mairie avec une pièce justificative.</Paragraphe></Chapitre>'))
            z.writestr('F3.xml', b'<!DOCTYPE x [<!ENTITY e "boom">]><Publication ID="F3"/>')
            z.writestr('N1.xml', b'<Noeud/>')
            z.writestr('menu.xml', b'<Menu/>')

    def build(self, themes=None):
        return g.build(self.root / 'corpora/edition', {'particuliers': self.archive}, themes, built_at='2026-11-15T00:00:00+00:00')

    def test_sheet_keeps_values_lists_rows_date_and_url(self):
        parsed = g.parse_sheet(sheet(), 'particuliers')
        self.assertEqual((parsed['title'], parsed['modified']), ('Livret A', '2026-08-01'))
        self.assertTrue(parsed['url'].endswith('/F1'))
        headings = [h for h, _ in parsed['passages']]
        self.assertEqual(headings, ['Présentation', 'Quel est le plafond du livret A ?'])
        text = parsed['passages'][1][1]
        self.assertIn('Le plafond du livret A est de 22 950 € pour une personne physique.', text)
        self.assertIn('Versement minimum : 10 €\nUn seul livret par personne', text)
        self.assertIn('Taux | 1,5 %', text)
        self.assertNotIn('Quel est le plafond', text)

    def test_conditioned_sheet_keeps_each_situation_body(self):
        raw = sheet(body=' ').decode().replace('<Texte> </Texte>', """<ListeSituations><Situation><Titre>PEA classique</Titre>
            <Introduction><Texte><Paragraphe>Le PEA classique accueille des actions de grandes entreprises.</Paragraphe></Texte></Introduction>
            <Texte><Chapitre><Titre><Paragraphe>Plafond</Paragraphe></Titre><Paragraphe>Les versements sont limités à 150 000 € sur le plan.</Paragraphe></Chapitre></Texte></Situation>
            <Situation><Titre>PEA jeune</Titre><Texte><Paragraphe>Les versements sont limités à 20 000 € pour un jeune rattaché.</Paragraphe></Texte></Situation></ListeSituations>""").encode()
        self.assertIn(b'ListeSituations', raw)
        passages = dict(g.parse_sheet(raw, 'particuliers')['passages'])
        self.assertEqual(passages['PEA classique — Plafond'], 'Les versements sont limités à 150 000 € sur le plan.')
        self.assertEqual(passages['PEA classique'], 'Le PEA classique accueille des actions de grandes entreprises.')
        self.assertEqual(passages['PEA jeune'], 'Les versements sont limités à 20 000 € pour un jeune rattaché.')

    def test_declared_entities_are_refused_and_counted(self):
        with self.assertRaises(ValueError):
            g.parse_sheet(b'<!DOCTYPE x [<!ENTITY e "boom">]><Publication ID="F3"/>', 'particuliers')
        self.assertEqual(self.build()['rejected'], 1)

    def test_theme_filter_and_manifest_carry_what_the_licence_requires(self):
        manifest = self.build({'particuliers': {'Argent - Impôts - Consommation'}})
        self.assertEqual((manifest['sheets'], manifest['by_theme']), (1, {'Argent - Impôts - Consommation': 1}))
        archive = manifest['archives'][0]
        self.assertEqual(manifest['licence'], 'Licence Ouverte / Open Licence 2.0')
        self.assertEqual(archive['file'], 'vosdroits-latest.zip')
        self.assertEqual(len(archive['sha256']), 64)
        self.assertTrue(archive['download_url'].startswith('https://lecomarquage.service-public.gouv.fr/'))
        self.assertRegex(archive['file_date'], r'^\d{4}-\d{2}-\d{2}$')
        with self.assertRaises(ValueError):
            self.build()

    def test_search_returns_dated_sourced_passages_and_nothing_on_one_shared_word(self):
        self.build()
        folder = self.root / 'corpora/edition'
        found = g.search(['plafond du livret A'], folder)
        self.assertEqual(found[0]['title'], 'Livret A — Quel est le plafond du livret A ?')
        self.assertIn('22 950 €', found[0]['text'])
        self.assertEqual(found[0]['source_url'], 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1')
        self.assertIn('mise à jour 2026-08-01', found[0]['reference'])
        self.assertIn('Service-Public.gouv.fr (DILA)', found[0]['reference'])
        self.assertLessEqual(len({s['id'] for s in found}), 2)
        # « demande » alone is in the passport sheet: one shared word is not a source.
        self.assertEqual(g.search(['demande de prêt immobilier'], folder), [])
        self.assertEqual(g.search(['capitale Australie'], folder), [])
        self.assertEqual(g.search(['le la de'], folder), [])
        self.assertEqual(g.search(['passeport'], folder)[0]['title'], 'Passeport — Demande')

    def test_long_chapter_is_cut_in_exact_consecutive_slices(self):
        text = '\n'.join(f'Ligne {n} avec une condition.' for n in range(400))
        pieces = g.split(text, 500)
        self.assertEqual('\n'.join(pieces), text)
        self.assertTrue(all(len(p) <= 500 for p in pieces))

    def test_activation_checks_the_index_and_detects_a_changed_manifest(self):
        self.assertIsNone(g.active(self.root))
        self.build()
        edition = self.root / 'corpora/edition'
        with self.assertRaises(ValueError):
            g.activate(self.root, self.temp.name)
        g.activate(self.root, edition)
        self.assertEqual(g.active(self.root), edition.resolve())
        manifest = json.loads((edition / 'manifest.json').read_text())
        manifest['sheets'] = 99
        (edition / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'manifeste'):
            g.active(self.root)

    DOCTRINE = ('<p class=""commentaire-de-tableau-western""><strong>Actualité liée : </strong>18/08/2025</p>'
                '<p class=""numero-de-paragraphe-western"" id=""1_00"">1</p>'
                '<p class=""paragraphe-western"">Les gains nets de cession de valeurs mobilières sont imposés à l’impôt sur le revenu.</p>'
                '<h1 id=""I"">I. Règles de droit commun</h1><h2>A. Taux forfaitaire de 12,8&nbsp;%</h2>'
                '<p class=""numero-de-paragraphe-western"">10</p>'
                '<p class=""paragraphe-western"">L’impôt est établi par application d’un taux forfaitaire de 12,8&nbsp;% à l’assiette imposable.</p>'
                '<ul><li>premier cas visé par le texte</li><li>second cas</li></ul>'
                '<table><tr><th>Durée</th><th>Abattement</th></tr><tr><td>Deux ans</td><td>50 %</td></tr></table>'
                '<h2>B. Option pour le barème</h2><p>Le contribuable peut opter pour le barème progressif de l’impôt sur le revenu.</p>')

    def doctrine_export(self, rows):
        path = self.root / 'bofip.jsonl'
        path.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\nnot json\n')
        return path

    def doctrine_row(self, ident='BOI-RPPM-PVBMI-30-20', serie='RPPM', kind='Contenu', title='RPPM - Plus-values sur biens meubles incorporels'):
        return {'type': kind, 'titre': title, 'serie': serie, 'identifiant_juridique': ident, 'debut_de_validite': '2025-08-18',
                'permalien': 'https://bofip.impots.gouv.fr/bofip/3623-PGP.html/identifiant=' + ident, 'contenu_html': self.DOCTRINE}

    def test_doctrine_sections_follow_headings_and_drop_paragraph_numbers(self):
        sections = dict(g.parse_doctrine(self.DOCTRINE))
        self.assertEqual(list(sections), ['Présentation', 'I. Règles de droit commun — A. Taux forfaitaire de 12,8 %',
                                          'I. Règles de droit commun — B. Option pour le barème'])
        self.assertEqual(sections['Présentation'], 'Actualité liée : 18/08/2025\n'
                         'Les gains nets de cession de valeurs mobilières sont imposés à l’impôt sur le revenu.')
        body = sections['I. Règles de droit commun — A. Taux forfaitaire de 12,8 %']
        self.assertEqual(body.split('\n'), ['L’impôt est établi par application d’un taux forfaitaire de 12,8 % à l’assiette imposable.',
                                            'premier cas visé par le texte', 'second cas', 'Durée | Abattement', 'Deux ans | 50 %'])

    def test_doctrine_edition_is_separate_dated_filtered_and_searched_by_title(self):
        export = self.doctrine_export([self.doctrine_row(), self.doctrine_row(), self.doctrine_row('BOI-REC-1', 'REC'),
                                       self.doctrine_row('BOI-ACTU', kind='Actualité'),
                                       self.doctrine_row('BOI-IR-1', 'IR', title='IR - Liquidation')])
        folder = self.root / 'corpora/bofip'
        manifest = g.build_doctrine(folder, export, {'RPPM', 'IR'}, built_at='2026-11-15T00:00:00+00:00', download_url='https://data.example/export')
        self.assertEqual((manifest['sheets'], manifest['rejected'], manifest['by_theme']), (2, 1, {'RPPM': 1, 'IR': 1}))
        self.assertEqual(manifest['publisher'], 'BOFiP-Impôts (DGFiP)')
        self.assertEqual((manifest['archives'][0]['download_url'], len(manifest['archives'][0]['sha256'])), ('https://data.example/export', 64))
        found = g.search(['taux forfaitaire des plus-values'], folder, limit=2, needed=3, titled=2)
        self.assertEqual(found[0]['reference'], 'BOI-RPPM-PVBMI-30-20 — RPPM - Plus-values sur biens meubles incorporels — I. Règles de droit commun'
                         ' — A. Taux forfaitaire de 12,8 % · BOFiP-Impôts (DGFiP) · en vigueur, version du 2025-08-18')
        self.assertTrue(found[0]['source_url'].endswith('BOI-RPPM-PVBMI-30-20'))
        self.assertNotIn('\n10\n', found[0]['text'])
        # The body of every document has these words; only a title naming the subject is offered.
        self.assertEqual(g.search(['assiette imposable application'], folder, limit=2, needed=3, titled=2), [])
        self.assertTrue(g.search(['assiette imposable application'], folder, limit=2, needed=3))
        # Two editions live side by side, each behind its own pointer.
        self.build()
        g.activate(self.root, self.root / 'corpora/edition')
        g.activate(self.root, folder, 'tax_doctrine')
        self.assertEqual(g.active(self.root).name, 'edition')
        self.assertEqual(g.active(self.root, 'tax_doctrine').name, 'bofip')
        with self.assertRaises(ValueError):
            g.active(self.root, '../other')

    def test_index_missing_passages_cannot_be_activated(self):
        self.build()
        edition = self.root / 'corpora/edition'
        with sqlite3.connect(edition / 'index.sqlite') as db:
            db.execute('DELETE FROM passages')
        with self.assertRaisesRegex(ValueError, 'manifeste'):
            g.activate(self.root, edition)


if __name__ == '__main__':
    unittest.main()
