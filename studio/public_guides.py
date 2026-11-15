"""Official practical sheets (Service-Public.gouv.fr, DILA) as a dated, separate source.

The library holds books; it has little on French personal finance (savings
accounts, PEA, life insurance, credit) and the rules that apply to it. The DILA
publishes its practical sheets as open data under Licence Ouverte 2.0. This
module builds a small read-only index from those archives and searches it. It
never touches the LibraryBrain database, and without an activated edition the
specialist simply answers from the library as before.

    python public_guides.py build --output <edition dir> \
        --archive particuliers=<vosdroits-latest.zip> --archive entreprendre=<...zip> \
        --theme "Argent - Impôts - Consommation"
    python public_guides.py activate --root ~/Projets/BusinessPratique --edition <edition dir>

The tax doctrine in force (BOFiP-Impôts, DGFiP, same licence) is a second,
separate edition, built from the « publications en vigueur » export:

    python public_guides.py build-doctrine --output <edition dir> --export <bofip-vigueur.jsonl> \
        --download-url <export URL>
    python public_guides.py activate --root ~/Projets/BusinessPratique --edition <edition dir> --name tax_doctrine

Licence Ouverte requires naming the source, the download URL, the file and its
date: the manifest keeps them and every passage carries its sheet URL and date.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

LICENCE = 'Licence Ouverte / Open Licence 2.0'
PUBLISHER = 'Service-Public.gouv.fr (DILA)'
DOWNLOAD = {'particuliers': 'https://lecomarquage.service-public.gouv.fr/vdd/3.5/part/zip/vosdroits-latest.zip',
            'entreprendre': 'https://lecomarquage.service-public.gouv.fr/vdd/3.5/pro/zip/vosdroits-latest.zip'}
DOCTRINE = 'BOFiP-Impôts (DGFiP)'
NAMES = ('public_guides', 'tax_doctrine')
MAX_PASSAGE = 3200
# Structural containers whose own text is laid out on separate lines.
BLOCKS = {'Paragraphe', 'Item', 'Titre', 'Cas', 'Rangée', 'ASavoir', 'ANoter', 'Attention', 'Rappel', 'SousChapitre'}
STOP = set('a au aux avec ce ces cet cette comment dans de des du elle en est et faire il ils je la le les leur lui ma me '
           'mes mon ne nos nous on ou par pas peut pour pourquoi qu que quel quelle quelles quels qui sa se ses si son '
           'sont sur un une vos votre vous y the of and to in is are what how for'.split())


def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def local(tag):
    return tag.rsplit('}', 1)[-1]


def flatten(element):
    """Readable text of a sheet fragment: one line per paragraph, list item or table row."""
    lines, current = [], []

    def flush():
        text = ' '.join(' '.join(current).split())
        if text:
            lines.append(text)
        current.clear()

    def walk(node):
        tag = local(node.tag)
        block = tag in BLOCKS
        if block:
            flush()
        if node.text:
            current.append(node.text)
        for child in node:
            walk(child)
            if local(child.tag) == 'Cellule':
                current.append('|')
            if child.tail:
                current.append(child.tail)
        if block:
            flush()
    walk(element)
    flush()
    return '\n'.join(line.strip(' |') for line in lines if line.strip(' |'))


def split(text, limit=MAX_PASSAGE):
    """Exact consecutive slices on line boundaries, each within the limit."""
    pieces, current = [], ''
    for line in text.split('\n'):
        while len(line) > limit:
            if current:
                pieces.append(current)
                current = ''
            pieces.append(line[:limit])
            line = line[limit:]
        if current and len(current) + 1 + len(line) > limit:
            pieces.append(current)
            current = line
        else:
            current = (current + '\n' + line) if current else line
    if current:
        pieces.append(current)
    return pieces


def parse_sheet(raw, audience):
    """One practical sheet -> its metadata and titled passages. None when it is not a sheet."""
    if b'<!ENTITY' in raw.upper() or b'<!DOCTYPE' in raw.upper():
        raise ValueError('Entity or doctype declaration refused.')
    root = ET.fromstring(raw)
    if local(root.tag) != 'Publication':
        return None
    fields = {local(child.tag): (child.text or '').strip() for child in root if child.tag.startswith('{')}
    title, ident = fields.get('title'), root.get('ID')
    if not title or not ident:
        return None
    modified = re.search(r'\d{4}-\d{2}-\d{2}', fields.get('date', ''))
    sheet = {'id': ident, 'audience': audience, 'title': title, 'theme': fields.get('subject', ''),
             'description': fields.get('description', ''), 'url': root.get('spUrl') or '',
             'modified': modified.group() if modified else '', 'passages': []}
    intro = root.find('Introduction')
    lead = '\n'.join(part for part in [sheet['description'], flatten(intro) if intro is not None else ''] if part)
    if lead:
        sheet['passages'].append(('Présentation', lead))
    sections = [('', root.find('Texte'))]
    # A conditioned sheet keeps its whole body under one <Situation> per case (PEA: classique, PME, jeune).
    for situation in root.findall('ListeSituations/Situation'):
        label = situation.find('Titre')
        label = ' '.join(flatten(label).split()) if label is not None else ''
        opening = situation.find('Introduction')
        if opening is not None and len(flatten(opening)) >= 40:
            sheet['passages'].append((label or 'Détail', flatten(opening)))
        sections.append((label, situation.find('Texte')))
    for label, body in sections:
        if body is None:
            continue
        chapters = body.findall('Chapitre')
        for chapter in chapters:
            heading = chapter.find('Titre')
            name = ' '.join(flatten(heading).split()) if heading is not None else ''
            text = flatten(chapter)
            if name and text.startswith(name):
                text = text[len(name):].strip()
            if len(text) >= 40:
                sheet['passages'].append((' — '.join(part for part in (label, name) if part) or 'Détail', text))
        if not chapters:
            text = flatten(body)
            if len(text) >= 40:
                sheet['passages'].append((label or 'Détail', text))
    return sheet if sheet['passages'] else None


class DoctrineText(HTMLParser):
    """BOFiP HTML -> titled sections, one line per paragraph, list item or table row.

    Paragraph numbers (« 10 », « 20 ») are navigation, not content: left in the
    text they would count as figures the source « contains ».
    """
    LINES = {'p', 'li', 'tr', 'blockquote', 'caption', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections, self.lines, self.current = [], [], []
        self.titles, self.heading, self.skip, self.level = {}, 'Présentation', False, 0

    def flush(self):
        text = ' '.join(''.join(self.current).split()).strip(' |')
        self.current = []
        return text

    def close_section(self):
        line = self.flush()
        if line:
            self.lines.append(line)
        if self.lines:
            self.sections.append((self.heading, '\n'.join(self.lines)))
        self.lines = []

    def handle_starttag(self, tag, attrs):
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.close_section()
            self.level = int(tag[1])
        elif tag in self.LINES:
            line = self.flush()
            if line:
                self.lines.append(line)
            self.skip = tag == 'p' and 'numero-de-paragraphe' in (dict(attrs).get('class') or '')
        elif tag in ('td', 'th') and self.current:
            self.current.append(' | ')

    def handle_endtag(self, tag):
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6') and self.level:
            title = self.flush()
            self.titles = {k: v for k, v in self.titles.items() if k < self.level}
            self.titles[self.level] = title
            top = self.titles.get(min(self.titles))
            self.heading = ' — '.join(dict.fromkeys(t for t in (top, title) if t)) or 'Détail'
            self.level = 0
        elif tag == 'p':
            self.skip = False
            line = self.flush()
            if line:
                self.lines.append(line)

    def handle_data(self, data):
        if not self.skip:
            self.current.append(data)


def parse_doctrine(html):
    """Titled sections of one BOFiP document."""
    reader = DoctrineText()
    # The export doubles every attribute quote (class=""x""): the class would be lost.
    reader.feed((html or '').replace('""', '"'))
    reader.close()
    reader.close_section()
    return [(heading, text) for heading, text in reader.sections if len(text) >= 40]


def create_index(output):
    output = Path(output)
    if (output / 'index.sqlite').exists():
        raise ValueError('Cette édition existe déjà : choisir un nouveau dossier.')
    output.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(output / 'index.sqlite')
    db.executescript('''CREATE TABLE sheets (id TEXT PRIMARY KEY, audience TEXT, title TEXT, theme TEXT, url TEXT, modified TEXT);
        CREATE TABLE passages (id TEXT PRIMARY KEY, sheet_id TEXT, heading TEXT, text TEXT);
        CREATE VIRTUAL TABLE search USING fts5(title, heading, text, tokenize='unicode61 remove_diacritics 2');''')
    return db


def add_document(db, key, audience, title, theme, url, modified, passages):
    """Returns the number of passages written."""
    db.execute('INSERT INTO sheets VALUES (?,?,?,?,?,?)', (key, audience, title, theme, url, modified))
    number = 0
    for heading, text in passages:
        for piece in split(text):
            number += 1
            cursor = db.execute('INSERT INTO passages VALUES (?,?,?,?)', (f'{key}:p{number}', key, heading, piece))
            db.execute('INSERT INTO search(rowid,title,heading,text) VALUES (?,?,?,?)', (cursor.lastrowid, title, heading, piece))
    return number


def build_doctrine(output, export, series=None, built_at=None, download_url=''):
    """Index the doctrine in force from the « bofip-vigueur » JSON-lines export."""
    output, export = Path(output), Path(export)
    db = create_index(output)
    manifest = {'publisher': DOCTRINE, 'licence': LICENCE, 'date_label': 'en vigueur, version du',
                'built_at': built_at or datetime.now(timezone.utc).isoformat(), 'archives': [],
                'sheets': 0, 'passages': 0, 'rejected': 0, 'by_theme': {}}
    seen = set()
    with export.open(encoding='utf-8') as lines:
        for line in lines:
            try:
                row = json.loads(line)
                ident, title = row['identifiant_juridique'], row['titre']
            except (ValueError, KeyError, TypeError):
                manifest['rejected'] += 1
                continue
            theme = row.get('serie') or ''
            if row.get('type') != 'Contenu' or not ident or not title or ident in seen or (series and theme not in series):
                continue
            passages = parse_doctrine(row.get('contenu_html'))
            if not passages:
                continue
            seen.add(ident)
            manifest['passages'] += add_document(db, 'bofip:' + ident, 'bofip', ident + ' — ' + title, theme,
                                                 row.get('permalien') or '', row.get('debut_de_validite') or '', passages)
            manifest['sheets'] += 1
            manifest['by_theme'][theme] = manifest['by_theme'].get(theme, 0) + 1
    db.commit()
    db.close()
    manifest['archives'].append({'audience': 'bofip', 'file': export.name, 'sha256': sha(export), 'sheets': manifest['sheets'],
                                 'download_url': download_url, 'themes': sorted(series) if series else 'all',
                                 'file_date': datetime.fromtimestamp(export.stat().st_mtime).strftime('%Y-%m-%d')})
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


def build(output, archives, themes=None, built_at=None):
    """Index the sheets of the given archives. `themes` limits one audience: {'particuliers': {...}}."""
    output = Path(output)
    db = create_index(output)
    manifest = {'publisher': PUBLISHER, 'licence': LICENCE, 'built_at': built_at or datetime.now(timezone.utc).isoformat(),
                'archives': [], 'sheets': 0, 'passages': 0, 'rejected': 0, 'by_theme': {}}
    for audience, path in archives.items():
        wanted = (themes or {}).get(audience)
        kept = 0
        with zipfile.ZipFile(path) as archive:
            dated = max((info.date_time for info in archive.infolist()), default=None)
            for name in archive.namelist():
                if not re.fullmatch(r'F\d+\.xml', name):
                    continue
                try:
                    sheet = parse_sheet(archive.read(name), audience)
                except (ET.ParseError, ValueError):
                    manifest['rejected'] += 1
                    continue
                if sheet is None or (wanted and sheet['theme'] not in wanted):
                    continue
                key = audience + ':' + sheet['id']
                manifest['passages'] += add_document(db, key, audience, sheet['title'], sheet['theme'], sheet['url'],
                                                     sheet['modified'], sheet['passages'])
                kept += 1
                manifest['by_theme'][sheet['theme']] = manifest['by_theme'].get(sheet['theme'], 0) + 1
        manifest['sheets'] += kept
        manifest['archives'].append({'audience': audience, 'file': Path(path).name, 'sha256': sha(path), 'sheets': kept,
                                     'download_url': DOWNLOAD.get(audience, ''), 'themes': sorted(wanted) if wanted else 'all',
                                     'file_date': '%04d-%02d-%02d' % dated[:3] if dated else ''})
    db.commit()
    db.close()
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


def pointer_path(root, name):
    if name not in NAMES:
        raise ValueError('Source officielle inconnue : ' + str(name))
    return Path(root) / 'data' / f'active_{name}.json'


def activate(root, edition, name='public_guides'):
    root, edition = Path(root), Path(edition).resolve()
    if not edition.is_relative_to((root / 'corpora').resolve()):
        raise ValueError('L’édition doit être dans le dossier corpora du projet.')
    manifest = json.loads((edition / 'manifest.json').read_text())
    with sqlite3.connect((edition / 'index.sqlite').as_uri() + '?mode=ro', uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Index endommagé.')
        if db.execute('SELECT count(*) FROM passages').fetchone()[0] != manifest['passages'] or not manifest['passages']:
            raise ValueError('L’index ne correspond pas à son manifeste.')
    pointer = pointer_path(root, name)
    pointer.parent.mkdir(parents=True, exist_ok=True)
    temp = pointer.with_suffix('.tmp')
    temp.write_text(json.dumps({'relative_path': str(edition.relative_to(root.resolve())),
                                'manifest_sha256': sha(edition / 'manifest.json')}, indent=2))
    temp.replace(pointer)
    return pointer


def active(root, name='public_guides'):
    """Activated edition folder, or None. A changed manifest is an error, not a silent fallback."""
    pointer = pointer_path(root, name)
    if not pointer.exists():
        return None
    selected = json.loads(pointer.read_text())
    folder = (Path(root) / selected['relative_path']).resolve()
    if not folder.is_relative_to((Path(root) / 'corpora').resolve()):
        raise ValueError('Le corpus de fiches actif doit être dans le dossier corpora.')
    if not (folder / 'index.sqlite').is_file() or not (folder / 'manifest.json').is_file():
        raise ValueError('Le corpus de fiches sélectionné est incomplet.')
    if sha(folder / 'manifest.json') != selected.get('manifest_sha256'):
        raise ValueError('Le manifeste des fiches a changé depuis son activation.')
    return folder


def terms(text):
    return list(dict.fromkeys(t for t in re.findall(r'[a-z0-9]+', norm(text)) if len(t) >= 3 and t not in STOP))


def search(queries, folder, limit=6, needed=2, titled=0):
    """Best passages for the queries, at most two per sheet. Title words weigh most.

    BM25 has no relevance threshold: a passage is kept only if it carries at
    least two distinct query terms (one when the queries have a single term), so
    a sheet sharing one common word with the question is not offered as a source.
    `titled` asks that many of them in the title or heading: a long doctrine page
    mentions every common tax word somewhere, its title says what it is about.
    """
    wanted = list(dict.fromkeys(t for q in queries for t in terms(q)))[:24]
    if not wanted:
        return []
    match = ' OR '.join('"' + t + '"' for t in wanted)
    needed = min(needed, len(wanted))
    manifest = json.loads(Path(folder, 'manifest.json').read_text())
    publisher, dated = manifest.get('publisher', PUBLISHER), manifest.get('date_label', 'mise à jour')
    found, per_sheet = [], {}
    with sqlite3.connect(Path(folder, 'index.sqlite').resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute('''SELECT p.id, p.heading, p.text, s.title, s.theme, s.url, s.modified, s.audience,
                                    bm25(search, 6.0, 3.0, 1.0) score
                             FROM search JOIN passages p ON p.rowid = search.rowid JOIN sheets s ON s.id = p.sheet_id
                             WHERE search MATCH ? ORDER BY score LIMIT ?''', (match, limit * 12)).fetchall()
    for row in rows:
        carried = set(terms(row['title'] + ' ' + row['heading'] + ' ' + row['text'])) & set(wanted)
        sheet = row['id'].rsplit(':', 1)[0]
        named = set(terms(row['title'] + ' ' + row['heading'])) & set(wanted)
        if len(carried) < needed or len(named) < min(titled, len(wanted)) or per_sheet.get(sheet, 0) >= 2:
            continue
        per_sheet[sheet] = per_sheet.get(sheet, 0) + 1
        found.append({'id': row['id'], 'title': row['title'] + ' — ' + row['heading'], 'author': publisher,
                      'page': None, 'text': row['text'], 'category': row['theme'], 'source_url': row['url'],
                      'modified': row['modified'], 'kind': 'source officielle', 'retrieval_score': row['score'],
                      'reference': f"{row['title']} — {row['heading']} · {publisher} · {dated} {row['modified'] or 'non datée'}"})
        if len(found) >= limit:
            break
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    commands = parser.add_subparsers(dest='command', required=True)
    make = commands.add_parser('build')
    make.add_argument('--output', required=True)
    make.add_argument('--archive', action='append', required=True, metavar='AUDIENCE=ZIP')
    make.add_argument('--theme', action='append', default=[], help='Limit the « particuliers » archive to these themes.')
    doctrine = commands.add_parser('build-doctrine')
    doctrine.add_argument('--output', required=True)
    doctrine.add_argument('--export', required=True, help='JSON lines export of « bofip-vigueur ».')
    doctrine.add_argument('--series', action='append', default=[], help='Limit to these series (IR, RPPM, …).')
    doctrine.add_argument('--download-url', default='')
    use = commands.add_parser('activate')
    use.add_argument('--root', required=True)
    use.add_argument('--edition', required=True)
    use.add_argument('--name', default='public_guides', choices=NAMES)
    args = parser.parse_args()
    if args.command == 'build':
        archives = dict(item.split('=', 1) for item in args.archive)
        manifest = build(args.output, archives, {'particuliers': set(args.theme)} if args.theme else None)
        print(json.dumps({k: manifest[k] for k in ('sheets', 'passages', 'rejected', 'by_theme')}, ensure_ascii=False, indent=2))
    elif args.command == 'build-doctrine':
        manifest = build_doctrine(args.output, args.export, set(args.series) or None, download_url=args.download_url)
        print(json.dumps({k: manifest[k] for k in ('sheets', 'passages', 'rejected', 'by_theme')}, ensure_ascii=False, indent=2))
    else:
        print(activate(args.root, args.edition, args.name))


if __name__ == '__main__':
    main()
