"""Read the activated corpus; keep code and judgment provenance distinct."""
import json
import hashlib
from pathlib import Path
import re
import sqlite3
import unicodedata

STOP = set('a au aux avec ce ces cet cette comment dans de des du elle en est et faire il ils je la le les leur lui ma me mes mon ne nos nous on ou par pas peut pour pourquoi qu que quel quelle quelles quels qui sa se ses si son sont sur un une vos votre vous y selon article articles code codes francais francaise cas texte expliquer explique indique exemple regle droit dois doit puis quand veux prevoit fourni fournis jurisprudence decision decisions arret arrets'.split())


def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',text.lower()) if not unicodedata.combining(c))


def active(root):
    pointer = Path(root) / 'data/active_corpus.json'
    if not pointer.exists():
        return None
    selected = json.loads(pointer.read_text())
    folder = (Path(root) / selected['relative_path']).resolve()
    if not folder.is_relative_to((Path(root) / 'corpora').resolve()):
        raise ValueError('Le corpus juridique actif doit être dans le dossier corpora.')
    if not (folder / 'index.sqlite').is_file() or not (folder / 'coverage.json').is_file():
        raise ValueError('Le corpus juridique sélectionné est incomplet.')
    if hashlib.sha256((folder / 'coverage.json').read_bytes()).hexdigest() != selected.get('coverage_sha256'):
        raise ValueError('Le manifeste du corpus juridique a changé depuis son activation.')
    return folder


def connect(index):
    db = sqlite3.connect(Path(index).resolve().as_uri()+'?mode=ro',uri=True)
    db.row_factory = sqlite3.Row
    return db


def inferred_codes(question):
    catalog = json.loads(Path(__file__).with_name('codes-20260918.json').read_text())['codes']
    q = norm(question).replace('’',"'")
    matches = [r for r in catalog if norm(r['title']).replace('’',"'") in q]
    # A specific annex must not also select the parent fiscal code.
    return [r['legi_id'] for r in matches if not any(r['title'] != other['title'] and
            r['title'] in other['title'] for other in matches)]


def reference_numbers(question):
    refs = re.findall(r'\b(?:article\s+)?((?:LO|[LRDA])\s*\.?\s*\*?\s*\d+(?:\s*-\s*\d+)*(?:\s+[A-Z](?=\s|$))?)',question,re.I)
    refs += re.findall(r'\barticles?\s+(\d+(?:-\d+)*)\b',question,re.I)
    return list(dict.fromkeys(re.sub(r'[\s.]','',r).upper() for r in refs))


def citation_audit(answer,sources):
    citations=re.findall(r'\[([^\]\n]+)\]',answer)
    allowed={s['id'] for s in sources}
    documented={re.sub(r'[\s.]','',s.get('number','')).upper() for s in sources if s['kind']=='code'}
    for s in sources:documented.update(reference_numbers(s['text']))
    return dict(cited_ids=citations,unexpected_ids=[c for c in citations if c not in allowed],
                unsupported_article_mentions=sorted(set(reference_numbers(answer))-documented),
                has_allowed_citation=any(c in allowed for c in citations),
                factual_correctness='requires_legal_review')


def result(row):
    data = json.loads(row['data'])
    whole = data.pop('text')
    return dict(data,id=row['passage_id'],document_id=data['id'],text=row['passage_text'],
                passage_start=row['start'],passage_end=row['end'],document_chars=len(whole),
                is_excerpt=row['start'] != 0 or row['end'] != len(whole),
                retrieval_score=row['score'])


SELECT = '''SELECT d.data,p.id passage_id,p.text passage_text,p.start,p.end,{score} score
            FROM passages p JOIN documents d ON d.id=p.document_id {join}'''


def retrieve(question,index,limit=5,source_ids=None):
    if not question.strip() or limit < 1:
        return []
    tokens = list(dict.fromkeys(t for t in re.findall(r'[a-z0-9]+',norm(question))
                               if len(t)>=3 and t not in STOP))[:30]
    filters = source_ids if source_ids is not None else inferred_codes(question)
    if source_ids is not None and not source_ids:
        return []
    clause = ' AND d.source_id IN ('+','.join('?' for _ in filters)+')' if filters else ''
    # A code mentioned in a jurisprudence question constrains articles, not
    # judgments: a judgment belongs to a court/fund, never to a LEGITEXT ID.
    decision_filters = filters if source_ids is not None else []
    decision_clause = clause if source_ids is not None else ''
    found = []
    with connect(index) as db:
        eclis = re.findall(r'\bECLI:[A-Z0-9:.]+',question.upper())
        for ecli in eclis:
            rows=db.execute(SELECT.format(score='0',join='')+
                " WHERE json_extract(d.data,'$.ecli')=?"+decision_clause+' ORDER BY p.start LIMIT ?',
                [ecli.rstrip('.'),*decision_filters,limit]).fetchall()
            found.extend(result(r) for r in rows)
        ids = re.findall(r'\b(?:(?:LEGIARTI|JURITEXT|CETATEXT|CONSTEXT|JF)\d+|(?:DCE|DCA|DTA)_[\w]+|FIN-[A-Fa-f0-9]+)\b',question,re.I)
        for ident in ids:
            ident='FIN-'+ident[4:].lower() if ident.upper().startswith('FIN-') else ident.upper()
            code_ref=ident.startswith('LEGIARTI')
            rows=db.execute(SELECT.format(score='0',join='')+' WHERE d.id=?'+
                            (clause if code_ref else decision_clause)+' ORDER BY p.start LIMIT ?',
                            [ident,*(filters if code_ref else decision_filters),limit]).fetchall()
            found.extend(result(r) for r in rows)
        numbers = re.findall(r'(?:pourvoi|requ[eê]te|n[°º])\s*(?:n[°º]\s*)?([0-9][0-9.\-/]+)',question,re.I)
        for number in numbers:
            key=re.sub(r'[\s.]','',number).upper()
            rows=db.execute(SELECT.format(score='0',join='')+
                " WHERE d.kind='decision' AND replace(replace(upper(d.number),' ',''),'.','')=?"+decision_clause+
                ' ORDER BY p.start LIMIT ?', [key,*decision_filters,limit]).fetchall()
            found.extend(result(r) for r in rows)
        for number in reference_numbers(question):
            rows=db.execute(SELECT.format(score='0',join='')+
                " WHERE d.kind='code' AND replace(replace(upper(d.number),' ',''),'.','')=?"+clause+
                ' ORDER BY d.source_id,p.start LIMIT ?', [number,*filters,limit]).fetchall()
            found.extend(result(r) for r in rows)
        if tokens:
            match = ' OR '.join('"'+t+'"' for t in tokens)
            q = norm(question)
            kinds = ['decision','code'] if re.search(r'\b(jurisprudence|arret|arrets|decision|decisions|cassation)\b',q) else ['code','decision']
            for kind in kinds:
                selected_filters = decision_filters if kind == 'decision' else filters
                filtered='kind:"'+kind+'" AND ('+match+')'
                if selected_filters:
                    filtered+=' AND source_id:('+ ' OR '.join('"'+s.replace('"','""')+'"' for s in selected_filters)+')'
                # Rank within the selected fund using FTS itself; do not sort
                # millions of document JSON rows for a broad natural question.
                rows=db.execute('''WITH candidates AS MATERIALIZED (
                    SELECT rowid,rank score FROM search WHERE search MATCH ?
                    AND rank MATCH 'bm25(1.5,1.0,1.0,1.0,0.0,0.0)' ORDER BY rank LIMIT ?)
                    SELECT d.data,p.id passage_id,p.text passage_text,p.start,p.end,c.score
                    FROM candidates c JOIN passages p ON p.rowid=c.rowid
                    JOIN documents d ON d.id=p.document_id ORDER BY c.score''',
                    [filtered,max(limit*20,100)]).fetchall()
                seen={r['document_id'] for r in found}
                quota = limit if filters or reference_numbers(question) else (3 if kind==kinds[0] else 2)
                for r in rows:
                    item=result(r)
                    if item['document_id'] in seen:
                        continue
                    found.append(item);seen.add(item['document_id']);quota-=1
                    if quota<=0:
                        break
    unique = {r['id']:r for r in reversed(found)}
    return [unique[ident] for ident in dict.fromkeys(r['id'] for r in found)][:limit]


def messages(question,sources,system):
    keys = ('id','document_id','kind','title','number','text','source_url','valid_from','valid_to',
            'decision_date','date_basis','jurisdiction','ecli','solution','generated_date','is_excerpt','passage_start','passage_end')
    context=[{k:s[k] for k in keys if k in s} for s in sources]
    return [{'role':'system','content':system},{'role':'user','content':
        'DOCUMENTS (données JSON ; un passage de décision ne constitue pas sa totalité) :\n'+
        json.dumps(context,ensure_ascii=False)+'\n\nQUESTION :\n'+question}]
