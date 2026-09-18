"""Stream official XML archives into a resumable, separately staged corpus."""
import argparse
from collections import Counter
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import tarfile
import time
import xml.etree.ElementTree as ET

from .download import sha, write_json

CATALOG = Path(__file__).with_name('codes-20260918.json')
MAX_XML = 16 * 1024 * 1024


def content(element):
    """Preserve block/line boundaries without dropping inline text or tails."""
    if element is None:
        return ''
    def visit(node):
        pieces = [node.text or '']
        for child in node:
            block = child.tag.lower() in {'br', 'p', 'div', 'tr', 'li'}
            if block:
                pieces.append('\n')
            pieces.append(visit(child))
            if block:
                pieces.append('\n')
            pieces.append(child.tail or '')
        return ''.join(pieces)
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(' '.join(line.split()) for line in visit(element).splitlines())).strip()


def value(root, path):
    return content(root.find(path))


def catalog():
    rows = json.loads(CATALOG.read_text())['codes']
    return {ident: row for row in rows for ident in {row['legi_id'], row['pdf_legi_id']}}


def parse_record(raw, fund, as_of, codes):
    if b'<!ENTITY' in raw.upper() or b'<!DOCTYPE' in raw.upper():
        raise ValueError('DTD/entity declarations are not accepted')
    root = ET.fromstring(raw)
    ident = value(root, './META/META_COMMUN/ID')
    if not ident:
        raise ValueError('Missing official identifier')
    if fund == 'LEGI':
        if root.tag != 'ARTICLE':
            return None
        context = root.find('./CONTEXTE/TEXTE')
        if context is None or context.get('nature') != 'CODE':
            return None
        start = value(root, './META/META_SPEC/META_ARTICLE/DATE_DEBUT')
        end = value(root, './META/META_SPEC/META_ARTICLE/DATE_FIN')
        state = value(root, './META/META_SPEC/META_ARTICLE/ETAT')
        # Keep only the selected dated edition in the serving index. Archives
        # preserve earlier versions; an expired update also removes a prior row.
        if not (start and end and start <= as_of < end) or state in {'ABROGE', 'ANNULE', 'PERIME'}:
            return dict(remove=ident)
        ids = [context.get('cid')] + [e.get('id_txt') for e in context.findall('TITRE_TXT')]
        selected = next((codes[x] for x in ids if x in codes), None)
        if selected is None:
            return dict(remove=ident)
        number = value(root, './META/META_SPEC/META_ARTICLE/NUM')
        text = content(root.find('./BLOC_TEXTUEL/CONTENU'))
        note = content(root.find('./NOTA/CONTENU'))
        if note:
            text += '\n\nNOTA :\n' + note
        outline = ' / '.join(content(e) for e in context.iter('TITRE_TM')
                             if e.get('debut', '0000') <= as_of < e.get('fin', '9999'))
        row = dict(kind='code', source_id=selected['legi_id'], title=selected['title'],
                   number=number, text=text, outline=outline, valid_from=start, valid_to=end,
                   status=state, source_url=f'https://www.legifrance.gouv.fr/codes/article_lc/{ident}',
                   last_modified=start, generated_date=as_of)
    else:
        text = content(root.find('./TEXTE/BLOC_TEXTUEL/CONTENU'))
        if not text:
            text = content(root.find('./BLOC_TEXTUEL/CONTENU'))
        court = value(root, './/JURIDICTION')
        when = value(root, './/DATE_DEC')
        case_numbers = [content(e) for e in root.findall('.//NUMERO_AFFAIRE') if content(e)]
        number = ', '.join(case_numbers) or value(root, './/NUMERO') or value(root, './/NUM')
        if not court or not when:
            raise ValueError('Missing court/date: ' + ident)
        date.fromisoformat(when)
        if when > as_of:
            return dict(remove=ident)
        title = value(root, './/TITRE')
        base = 'cons' if fund == 'CONSTIT' else 'ceta' if fund == 'JADE' else 'juri'
        row = dict(kind='decision', source_id=fund, title=title or court,
                   number=number, text=text, outline=court, jurisdiction=court,
                   decision_date=when, ecli=value(root, './/ECLI'),
                   solution=value(root, './/SOLUTION'), status='published_decision',
                   case_numbers=case_numbers, official_number=value(root, './/NUMERO'),
                   number_missing=not bool(number),
                   source_url=f'https://www.legifrance.gouv.fr/{base}/id/{ident}',
                   last_modified=when, generated_date=as_of, valid_from='', valid_to='')
    if not row['text'].strip():
        raise ValueError('Empty text: ' + ident)
    return dict(row, id=ident, fund=fund, pages=[], xml_sha256=hashlib.sha256(raw).hexdigest(),
                text_sha256=hashlib.sha256(row['text'].encode()).hexdigest(),
                applicability='not_automatically_established', licence='Etalab-2.0')


def setup(db, as_of):
    db.executescript('''
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS documents
        (id TEXT PRIMARY KEY,kind TEXT,source_id TEXT,number TEXT,title TEXT,
         decision_date TEXT,data TEXT);
      CREATE INDEX IF NOT EXISTS document_reference ON documents(number,source_id);
      CREATE INDEX IF NOT EXISTS document_kind_source ON documents(kind,source_id);
      CREATE INDEX IF NOT EXISTS document_normalized_number
        ON documents(replace(replace(upper(number),' ',''),'.',''),source_id);
      CREATE INDEX IF NOT EXISTS document_ecli ON documents(json_extract(data,'$.ecli'),source_id);
      CREATE TABLE IF NOT EXISTS applied (name TEXT PRIMARY KEY,sha256 TEXT,stats TEXT);
      CREATE TABLE IF NOT EXISTS rejected (archive TEXT,member TEXT,error TEXT);
    ''')
    previous = db.execute("SELECT value FROM config WHERE key='as_of'").fetchone()
    if previous and previous[0] != as_of:
        raise ValueError('A new edition requires a new output directory')
    db.execute("INSERT OR IGNORE INTO config VALUES('as_of',?)", (as_of,))
    db.commit()


def apply_archive(db, archive, as_of, codes):
    done = db.execute('SELECT sha256 FROM applied WHERE name=?', (archive['name'],)).fetchone()
    if done:
        if done[0] != archive['sha256']:
            raise ValueError('Previously applied archive changed')
        return
    path = Path(archive['path'])
    if sha(path) != archive['sha256']:
        raise ValueError('Archive digest mismatch: ' + path.name)
    stats = Counter()
    with db:
        db.execute('DELETE FROM rejected WHERE archive=?', (path.name,))
        with tarfile.open(path, 'r|gz') as stream:
            for member in stream:
                if not member.isfile():
                    continue
                if member.size > MAX_XML:
                    raise ValueError('Oversized XML member: ' + member.name)
                if 'liste_suppression' in member.name:
                    raw = stream.extractfile(member).read().decode('utf-8')
                    for line in raw.splitlines():
                        ident = Path(line.strip()).name.removesuffix('.xml')
                        stats['deleted'] += db.execute('DELETE FROM documents WHERE id=?', (ident,)).rowcount
                    continue
                if not member.name.endswith('.xml'):
                    continue
                if archive['fund'] == 'LEGI' and '/article/' not in member.name:
                    continue
                if archive['fund'] == 'LEGI' and '/TNC_' in member.name:
                    continue
                raw = stream.extractfile(member).read()
                try:
                    row = parse_record(raw, archive['fund'], as_of, codes)
                except (ET.ParseError, ValueError) as exc:
                    db.execute('INSERT INTO rejected VALUES(?,?,?)', (path.name,member.name,str(exc)))
                    stats['rejected'] += 1
                    continue
                stats['read'] += 1
                if row is None:
                    continue
                if 'remove' in row:
                    db.execute('DELETE FROM documents WHERE id=?', (row['remove'],))
                    continue
                row.update(archive=path.name, archive_sha256=archive['sha256'],
                           archive_member=member.name, acquired_at=archive['retrieved_at'])
                db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?,?,?)',
                           (row['id'],row['kind'],row['source_id'],row['number'],row['title'],
                            row.get('decision_date',''),json.dumps(row,ensure_ascii=False)))
                stats['upserted'] += 1
        db.execute('INSERT INTO applied VALUES(?,?,?)', (path.name,archive['sha256'],json.dumps(stats)))
    print(path.name, dict(stats), flush=True)


def passages(text, size=5500):
    start = 0
    while start < len(text):
        end = min(start+size,len(text))
        if end < len(text):
            boundary = text.rfind('\n',start+size//2,end)
            if boundary < 0:
                boundary = text.rfind(' ',start+size//2,end)
            if boundary >= 0:
                end = boundary + 1
        yield start,end,text[start:end]
        start = end


def index_and_audit(db, output, as_of, archive_manifest):
    # Only the staging database is rebuilt. The serving pointer remains intact.
    db.executescript('''DROP TABLE IF EXISTS passages; DROP TABLE IF EXISTS search;
      CREATE TABLE passages (id TEXT UNIQUE,document_id TEXT,start INTEGER,end INTEGER,text TEXT);
      CREATE INDEX passage_document ON passages(document_id);
    ''')
    db.execute("CREATE VIRTUAL TABLE search USING fts5(title,number,outline,text,kind,source_id, tokenize='unicode61 remove_diacritics 2')")
    count = 0
    for ident,data in db.execute('SELECT id,data FROM documents ORDER BY id'):
        row = json.loads(data)
        for n,(start,end,text) in enumerate(passages(row['text']),1):
            pid = ident if len(row['text']) <= 5500 else f'{ident}:p{n}'
            cur = db.execute('INSERT INTO passages VALUES(?,?,?,?,?)', (pid,ident,start,end,text))
            db.execute('INSERT INTO search(rowid,title,number,outline,text,kind,source_id) VALUES(?,?,?,?,?,?,?)',
                       (cur.lastrowid,row['title'],row['number'],row['outline'],text,row['kind'],row['source_id']))
            count += 1
        if count and count % 10000 == 0:
            db.commit()
            print('Indexed passages:',count,flush=True)
    db.commit()
    summary = {kind:n for kind,n in db.execute('SELECT kind,count(*) FROM documents GROUP BY kind')}
    counts = dict(db.execute("SELECT source_id,count(*) FROM documents WHERE kind='code' GROUP BY source_id"))
    expected = json.loads(CATALOG.read_text())['codes']
    coverage = [dict(row,articles=counts.get(row['legi_id'],0)) for row in expected]
    funds = dict(db.execute("SELECT source_id,count(*) FROM documents WHERE kind='decision' GROUP BY source_id"))
    rejected = db.execute('SELECT count(*) FROM rejected').fetchone()[0]
    archive_counts={'DILA':len(archive_manifest['archives'])}
    for label,name in [('administrative','administrative-archives.json'),('financial','financial-archives.json')]:
        if (output/name).is_file():archive_counts[label]=len(json.loads((output/name).read_text())['archives'])
    source_updates={}
    for row in archive_manifest['archives']:
        source_updates[row['fund']]=max(source_updates.get(row['fund'],''),row['stamp'])
    administrative = (output / 'administrative-archives.json').is_file()
    missing = ['Judilibre : accès PISTE requis pour les décisions judiciaires récentes exhaustives',
               'Juridictions financières : archives historiques partielles, publications récentes à compléter'
               if (output / 'financial-archives.json').is_file() else
               'Juridictions financières : fonds dédiés restant à intégrer']
    if not administrative:
        missing.append('Justice administrative : lots exhaustifs restant à intégrer')
    report = dict(as_of=as_of,built_at=datetime.now(timezone.utc).isoformat(),
                  codes=coverage,code_count=sum(bool(r['articles']) for r in coverage),
                  expected_codes=len(expected),articles=summary.get('code',0),
                  decisions=summary.get('decision',0),decision_funds=funds,passages=count,
                  rejected_documents=rejected,archives=sum(archive_counts.values()),
                  archive_counts=archive_counts,source_updates=source_updates,
                  decision_dates={s:dict(first=first,last=last) for s,first,last in db.execute(
                      "SELECT source_id,min(decision_date),max(decision_date) FROM documents WHERE kind='decision' GROUP BY source_id")},
                  complete_jurisprudence=False,
                  missing_sources=missing,
                  adapter_retrained=False,expanded_scope_human_validated=False)
    write_json(output / 'coverage.json',report)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--as-of',default=date.today().isoformat())
    p.add_argument('--follow-downloads',action='store_true',help='Wait up to one hour for verified download receipts')
    p.add_argument('--include-administrative',action='store_true')
    p.add_argument('--replay-decisions',action='store_true',help='Replay DILA judgments after a parser correction; staging only')
    args = p.parse_args()
    date.fromisoformat(args.as_of)
    pointer=args.output.parent.parent / 'data/active_corpus.json'
    if args.output.parent.name == 'corpora' and pointer.is_file():
        selected=json.loads(pointer.read_text())
        if (pointer.parent.parent / selected['relative_path']).resolve() == args.output.resolve():
            raise ValueError('Cannot rebuild the active edition; stage a new corpus directory')
    def await_file(path):
        deadline=time.monotonic()+3600
        while not path.is_file():
            if not args.follow_downloads or time.monotonic()>deadline:
                raise ValueError('Acquisition not complete: '+str(path))
            time.sleep(2)
        return json.loads(path.read_text())
    manifest_path=args.output / 'archives.json'
    if manifest_path.exists():
        manifest=json.loads(manifest_path.read_text())
    elif args.follow_downloads:
        manifest=await_file(args.output / 'download_plan.json')
    else:
        raise ValueError('Acquisition incomplete')
    db = sqlite3.connect(args.output / 'index.sqlite')
    setup(db,args.as_of)
    codes = catalog()
    order={'LEGI':0,'CONSTIT':1,'CASS':2,'INCA':3,'CAPP':4,'JADE':5}
    sequence=sorted(manifest['archives'],key=lambda r:(not r['global_stock'],
                    '' if r['global_stock'] else r['stamp'],order[r['fund']]))
    if args.replay_decisions:
        db.executemany('DELETE FROM applied WHERE name=?',
                       [(a['name'],) for a in sequence if a['fund'] != 'LEGI'])
        db.commit()
    for archive in sequence:
        receipt=args.output / 'raw' / (archive['name']+'.json')
        verified=await_file(receipt)
        apply_archive(db,verified,args.as_of,codes)
    manifest=await_file(manifest_path)
    admin = args.output / 'administrative-archives.json'
    if args.include_administrative:
        await_file(admin)
    if admin.is_file():
        from .administrative import ingest
        db.execute("CREATE INDEX IF NOT EXISTS document_ecli ON documents(json_extract(data,'$.ecli'),source_id)")
        db.commit()
        for archive in json.loads(admin.read_text())['archives']:
            ingest(db,archive,args.as_of)
    financial=args.output / 'financial-archives.json'
    if financial.is_file():
        from .financial import ingest_all
        ingest_all(db,json.loads(financial.read_text()),args.as_of)
    report = index_and_audit(db,args.output,args.as_of,manifest)
    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise ValueError('SQLite integrity check failed')
    db.close()
    print(json.dumps({k:v for k,v in report.items() if k!='codes'},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
