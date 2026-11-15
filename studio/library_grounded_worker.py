"""Structured answers from LibraryBrain passages for the library specialists.

Same retrieval gate as worker.py (retrieve.py, LibraryBrain relevance
thresholds, read-only). The conversation is resolved by the local 35B model and
the answer is made of claims checked against verbatim excerpts
(grounded_answer.py), instead of free generation by the 4B specialist.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import grounded_answer as grounded
from models import MODELS

RULES = '''- "recherches" : une requête en français ET une requête en anglais (la bibliothèque est bilingue), avec la terminologie standard du domaine.
'''
COMPOSE_RULES = '''- Rapporte ce que les ouvrages énoncent (méthode, définition, étapes, mise en garde). Distingue une méthode proposée par un auteur d'un fait établi.
- N'invente aucun chiffre propre à l'utilisateur, aucun rendement garanti, aucun taux légal ou fiscal actuel. Ne recommande aucun placement ni produit financier particulier : décris les notions et les critères que les sources donnent.
- Si la question demande une marche à suivre, ordonne les points comme des étapes.
'''
HINT = 'précisez le sujet, le contexte (activité, objectif, horizon) ou le titre d’un ouvrage.'


def reference(source):
    parts = [source['title']]
    if source.get('author'):
        parts.append(source['author'])
    if source.get('page'):
        parts.append('p. ' + str(source['page']))
    return ' · '.join(parts)


def retrieve(plan, category, folder, here):
    path = folder / 'query_plan.json'
    path.write_text(json.dumps(plan, ensure_ascii=False))
    command = [sys.executable, str(here / 'retrieve.py'), str(path)]
    if category:
        command.append(json.dumps(category, ensure_ascii=False))
    result = subprocess.run(command, capture_output=True, text=True, timeout=240, check=True)
    return json.loads(result.stdout)


def run(job, save, folder, call=grounded.llm, search=retrieve):
    spec = MODELS[job['model']]
    if job.get('version'):
        raise ValueError('Les réponses structurées utilisent le profil publié, pas une version candidate.')
    started = time.monotonic()
    here = Path(__file__).resolve().parent
    data = {'answer': '', 'sources': [], 'confidence': {'level': 'pending'}, 'phase': 'planning',
            'profile': spec['name'] + ' · réponses structurées vérifiées', 'parameters': '35B',
            'history_policy': 'conversation_resolved'}
    save(data)
    plan = grounded.resolve(job['question'], job.get('history', []), spec['scope'], RULES, call=call)
    data.update(resolved_question=plan['question'], search_queries=plan['recherches'], phase='retrieval')
    save(data)
    reason = grounded.refusal(plan, 'Cette question ne relève pas du domaine de ce modèle : ' + spec['description'])
    if reason:
        data.update(answer=grounded.abstention(reason, (), HINT), phase='done', abstained=True,
                    confidence={'level': 'insufficient'}, audit_notice='Aucune recherche effectuée.',
                    seconds=round(time.monotonic() - started, 1))
        save(data)
        return
    context = search({'question': plan['question'], 'queries': plan['recherches'], 'intent': 'answer',
                      'original_question': plan['original_question']}, spec['category'], folder, here)
    (folder / 'retrieval.json').write_text(json.dumps(context, ensure_ascii=False, indent=2))
    sources = context['sources'] if context['accepted_sources'] else []
    for source in sources:
        source['reference'] = reference(source)
    data.update(sources=context['sources'], confidence=context['confidence'], phase='generation',
                source_status='accepted' if sources else 'candidates')
    save(data)
    if not sources:
        missing = ('Des ouvrages liés ont été repérés, mais aucun passage n’atteint le seuil de pertinence pour répondre.'
                   if context['sources'] else 'Aucun passage exploitable n’a été retrouvé. Cela ne prouve pas que le sujet est absent de la bibliothèque.')
        data.update(answer=grounded.abstention(missing, plan['recherches'], HINT), phase='done', abstained=True,
                    audit_notice='Aucune affirmation produite : pas de passage suffisamment pertinent.',
                    seconds=round(time.monotonic() - started, 1))
        save(data)
        return
    result = grounded.compose(plan['question'], sources, COMPOSE_RULES + spec.get('compose_rules', ''), HINT,
                              plan['recherches'], call=call)
    used = [sources[i] for i in result['used']] or sources
    data.update(answer=result['answer'], sources=used, grounding=result['grounding'], abstained=result['abstained'],
                phase='done', audit_notice=grounded.notice(result) + spec.get('notice', ''),
                seconds=round(time.monotonic() - started, 1))
    save(data)


if __name__ == '__main__':
    os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    job = json.loads(Path(sys.argv[1]).read_text())
    out = Path(job['state']) / job['id']

    def save(data):
        tmp = out / 'result.tmp'
        tmp.write_text(json.dumps(data, ensure_ascii=False))
        tmp.replace(out / 'result.json')
    run(job, save, out)
