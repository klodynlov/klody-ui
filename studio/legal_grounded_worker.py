"""Structured legal answers over the activated corpus, every claim checked.

Replaces the 4B LoRA reader for interactive use: the conversation resolves the
question, code articles are searched first, and the local 35B model writes
claims that the program verifies against the article text (grounded_answer.py).
The frozen V3 profile and its worker stay untouched for comparison.
"""
import json
import os
from pathlib import Path
import re
import sys
import time
import grounded_answer as grounded
from legal_model import display_source
from legal_corpus import search as corpus_search
from models import MODELS

DOMAIN = ('droit français (codes en vigueur et jurisprudence publiée). Toute question sur une règle, un droit, '
          'une obligation, une sanction, une démarche ou un litige en France en relève.')
LEGAL_RULES = '''- "codes" : 1 à 3 titres EXACTS choisis dans la liste CODES ci-dessous, les plus probables pour cette question (ex. licenciement → Code du travail ; achat à distance → Code de la consommation ; arrêt maladie → Code de la sécurité sociale et Code du travail).
- "articles" : jusqu'à 4 articles où tu penses trouver la règle, sous la forme {"code":"titre exact","numero":"L1237-11"}. Ce sont de simples pistes de recherche : le programme lira le texte réel, n'en mets que si tu es raisonnablement sûr.
- Si la question porte sur le montant d'une amende contraventionnelle, ajoute l'article 131-13 du Code pénal (montants par classe) aux pistes, en plus du texte qui fixe la classe.
- "jurisprudence" : true seulement si la question demande explicitement des décisions de justice.
- Une question sur un texte qui n'est pas un code (loi non codifiée, convention collective, droit étranger) reste dans le champ : cherche le code le plus proche.
CODES : '''
COMPOSE_RULES = '''- Domaine juridique : cite la règle telle que le texte l'énonce. Ne garantis jamais l'issue d'une procédure, ne qualifie pas la situation personnelle de l'utilisateur.
- Dans chaque affirmation, nomme l'article et le code d'où vient la règle (ils figurent dans "reference").
- Si la règle renvoie à un autre texte non fourni (montant d'une classe de contravention, décret), dis-le dans "manque" au lieu de compléter de mémoire.
'''
HINT = 'précisez le contexte (travail, consommation, route, famille…), l’article ou le code visé.'
NOTICE = ' Information documentaire, pas un conseil juridique.'


def catalog():
    return json.loads(Path(corpus_search.__file__).with_name('codes-20260918.json').read_text())['codes']


def reference(source):
    if source.get('kind') == 'decision':
        number = f" n° {source['number']}" if source.get('number') else ''
        return f"{source.get('jurisdiction', 'Décision')} · {source.get('decision_date', '')}{number}"
    return f"{source['title']} · article {source['number']}"


def wants_decisions(question):
    """« arrêt de travail » or « arrêt maladie » is not a request for case law."""
    text = re.sub(r"\barrets? (?:de travail|maladie|de bus|du vehicule|de la production)", ' ', corpus_search.norm(question))
    return bool(re.search(r'\b(jurisprudence|arret|arrets|cassation|decision de justice|decisions de justice)\b', text))


def valid_codes(plan, codes):
    by_title = {corpus_search.norm(c['title']): c['legi_id'] for c in codes}
    listed = plan.get('codes') if isinstance(plan.get('codes'), list) else []
    return [by_title[corpus_search.norm(t)] for t in listed if isinstance(t, str) and corpus_search.norm(t) in by_title][:3]


def cited_articles(result, sources, chosen, index, limit=3):
    """Articles named by the first reading (missing part, kept excerpts) and not yet read.

    Only when the first reading found almost nothing: a second composition costs
    as much as the first, and an answered question does not need it.
    """
    if not chosen or len(result['used']) > 1 or (result['used'] and not result.get('missing')):
        return []
    text = result.get('missing', '') + ' ' + ' '.join(result.get('excerpts', []))
    known = {re.sub(r'[\s.]', '', str(s.get('number', ''))).upper() for s in sources}
    found = []
    named = corpus_search.reference_numbers(text)
    if result['abstained']:
        # Nothing answered: the articles the retrieved texts point to most
        # often are the next place to read (« fixées par l'article L. 3121-27 »).
        from collections import Counter
        cited = Counter(n for s in sources for n in corpus_search.reference_numbers(s['text']))
        named += [n for n, _ in cited.most_common() if n not in named]
    for number in named:
        if number in known or len(found) >= limit:
            continue
        known.add(number)
        found += [r for r in corpus_search.retrieve('article ' + number, index, limit=1, source_ids=chosen)
                  if r['id'] not in {s['id'] for s in sources}]
    return found


def candidates(plan, index, codes):
    """Hinted articles, then the probable codes, then every code. Decisions on request."""
    by_title = {corpus_search.norm(c['title']): c['legi_id'] for c in codes}
    chosen = valid_codes(plan, codes)
    found, attempts = [], []

    def add(rows, origin):
        attempts.append({'origin': origin, 'results': len(rows)})
        for row in rows:
            if row['id'] not in {s['id'] for s in found}:
                found.append({**row, 'retrieval_origin': origin})

    for hint in plan.get('articles', [])[:4] if isinstance(plan.get('articles'), list) else []:
        if not isinstance(hint, dict):
            continue
        code = by_title.get(corpus_search.norm(str(hint.get('code', ''))))
        number = re.sub(r'[^A-Za-z0-9*-]', '', str(hint.get('numero', '')))
        if code and number:
            add(corpus_search.retrieve('article ' + number, index, limit=2, source_ids=[code]), 'article ' + number)
    queries = list(dict.fromkeys([*plan['recherches'], plan['question']]))[:4]
    for query in queries:
        if chosen:
            add(corpus_search.retrieve(query, index, limit=4, source_ids=chosen), 'codes probables : ' + query)
    every = [c['legi_id'] for c in codes]
    for query in queries[:2]:
        add(corpus_search.retrieve(query, index, limit=3, source_ids=every), 'tous les codes : ' + query)
    if plan.get('jurisprudence') is True or wants_decisions(plan['original_question']):
        rows = [r for r in corpus_search.retrieve('jurisprudence ' + queries[0], index, limit=5) if r.get('kind') == 'decision']
        add(rows[:3], 'jurisprudence : ' + queries[0])
    return found[:grounded.MAX_SOURCES], attempts


def run(job, save, call=grounded.llm):
    if job['model'] != 'legal' or job.get('version'):
        raise ValueError('Ce moteur accepte uniquement le profil juridique.')
    started = time.monotonic()
    root = Path.home() / 'Projets' / MODELS['legal']['project']
    corpus = corpus_search.active(root)
    if not corpus:
        raise ValueError('Le corpus juridique étendu n’est pas activé.')
    data = {'answer': '', 'sources': [], 'confidence': {'level': 'unverified'}, 'phase': 'planning',
            'source_status': 'retrieved', 'history_policy': 'conversation_resolved',
            'profile': 'Juridique · réponses structurées vérifiées', 'parameters': '35B', 'experimental': True,
            'corpus': json.loads((corpus / 'coverage.json').read_text())}
    save(data)
    codes = catalog()
    plan = grounded.resolve(job['question'], job.get('history', []), DOMAIN,
                            LEGAL_RULES + ' ; '.join(c['title'] for c in codes), call=call)
    reason = grounded.refusal(plan, 'Cette question ne relève pas du droit français couvert par ce modèle.')
    if not valid_codes(plan, codes) and not reason:
        # Without a probable code the search falls back on generic words
        # (« travail ») across 76 codes: ask once more for the codes alone.
        again = grounded.resolve(plan['question'], [], DOMAIN, LEGAL_RULES + ' ; '.join(c['title'] for c in codes) +
                                 '\nRAPPEL : "codes" est obligatoire (1 à 3 titres exacts de la liste).', call=call)
        plan.update(codes=again.get('codes', []), articles=plan.get('articles') or again.get('articles', []))
    data.update(resolved_question=plan['question'], search_queries=plan['recherches'], phase='retrieval')
    save(data)
    if reason:
        data.update(answer=grounded.abstention(reason, (), HINT), phase='done', confidence={'level': 'insufficient'},
                    abstained=True, audit_notice='Aucune recherche effectuée.', seconds=round(time.monotonic() - started, 1))
        save(data)
        return
    sources, attempts = candidates(plan, corpus / 'index.sqlite', codes)
    for source in sources:
        source['reference'] = reference(source)
    data.update(sources=[display_source(s) for s in sources], retrieval=attempts, phase='generation')
    save(data)
    result = grounded.compose(plan['question'], sources, COMPOSE_RULES, HINT, plan['recherches'], call=call)
    followed = cited_articles(result, sources, valid_codes(plan, codes), corpus / 'index.sqlite')
    if followed:
        # One hop: a rule often lives in the article the first texts point to
        # (« l'amende prévue pour les contraventions de la quatrième classe »).
        for source in followed:
            source['reference'] = reference(source)
        kept = [sources[i] for i in result['used']]
        sources = (kept + followed + [s for s in sources if s not in kept])[:grounded.MAX_SOURCES]
        data.update(sources=[display_source(s) for s in sources], followed_references=[s['reference'] for s in followed])
        save(data)
        result = grounded.compose(plan['question'], sources, COMPOSE_RULES, HINT, plan['recherches'], call=call)
    used = [sources[i] for i in result['used']] or sources
    data.update(answer=result['answer'], sources=[display_source(s) for s in used], grounding=result['grounding'],
                abstained=result['abstained'], phase='done',
                confidence={'level': 'insufficient' if result['abstained'] else 'unverified'},
                source_status='selected' if result['used'] else 'candidates',
                audit_notice=grounded.notice(result) + NOTICE, seconds=round(time.monotonic() - started, 1))
    save(data)


if __name__ == '__main__':
    os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    job = json.loads(Path(sys.argv[1]).read_text())
    out = Path(job['state']) / job['id']

    def save(data):
        tmp = out / 'result.tmp'
        tmp.write_text(json.dumps(data, ensure_ascii=False))
        tmp.replace(out / 'result.json')
    run(job, save)
