"""Structured French medical answers from the V8 reader's sources, every claim checked.

Retrieval is the evaluated V8 one (dated HAS snapshots, then the approved
reference pool). The presentation changes: instead of copying then translating
whole passages, the local model writes short French claims, each anchored to a
verbatim excerpt that the program verifies (grounded_answer.py). The original
passages stay in the source panel. This is documentary reading, not clinical
validation, and it never individualises a diagnosis or a dosage.
"""
import json
import os
from pathlib import Path
import re
import sys
import time
import grounded_answer as grounded
from medical_documentary_v8_model import profile, display_source
from models import MODELS

DOMAIN = ('médecine et santé humaine (définitions, symptômes, diagnostic, prise en charge, prévention, '
          'recommandations). Toute question de santé humaine en relève, même formulée en langage courant.')
MEDICAL_RULES = '''- Formule la question autonome comme une question documentaire générale, sans la rattacher à une personne et sans élargir la demande : un terme seul (« hernie ») devient « Qu'est-ce qu'une hernie ? » ; un symptôme (« j'ai mal au genou ») devient « Quelles sont les causes d'une douleur du genou ? » ; une demande de traitement reste une demande de traitement.
- "recherches" : une requête en français médical ET une requête en anglais médical (la bibliothèque de référence est surtout anglophone).
- "sujets" : 1 ou 2 sujets principaux sous la forme {"fr":"nom médical français","en":"English medical name"}, sans sous-type inventé.
'''
COMPOSE_RULES = '''- Domaine médical : rapporte ce que la source énonce (définition, signes, causes, conduite décrite), avec sa population et ses conditions. N'ajoute aucun conseil personnel, aucun diagnostic pour une personne, aucune posologie individualisée.
- Si la source est un document préparatoire ou suspendu ("reference" le signale), ne la présente pas comme une recommandation en vigueur.
- Un ouvrage de référence (StatPearls, dictionnaire) n'est pas une recommandation française : écris « selon cet ouvrage de référence », jamais « il est recommandé » en ton nom.
- Préfère une source française datée (HAS) quand elle répond ; sinon une source de référence en anglais, traduite fidèlement dans l'affirmation.
- Traduis les termes médicaux avec précision ; en cas de doute, garde le terme original entre parenthèses.
- Si la question décrit un symptôme, commence par ce que la source dit des causes ou de l'évaluation, puis de la prise en charge.
'''
HINT = 'précisez la maladie, le symptôme, la population (âge, grossesse…) ou la publication visée.'
NOTICE = ' Information documentaire : elle ne remplace pas l’avis d’un professionnel de santé. En cas d’urgence, appelez le 15.'


def reference(source):
    status = {'preparatory': ' · document préparatoire', 'suspended': ' · document suspendu'}.get(source.get('status'), '')
    return f"{source.get('label') or source['title']} · {source['publisher']} · {source['date']}{status}"


def candidates(reader, plan):
    """Dated French publications first, then definitions and the reference pool."""
    question = plan['question']
    topics = [t for t in plan.get('sujets', []) if isinstance(t, dict) and set(t) == {'fr', 'en'}
              and all(isinstance(v, str) and 1 < len(v) < 100 for v in t.values())][:2] if isinstance(plan.get('sujets'), list) else []
    search = {'question': question, 'original_question': plan['original_question'], 'queries': plan['recherches'][:2],
              'topics': topics, 'intent': 'answer', 'broad': False}
    found, audit = [], {}
    # The dated HAS overlay answers only its own themes; elsewhere its tables
    # match incidental words and crowd out the reference pool.
    normalized = reader.medical.norm(question + ' ' + plan['original_question'])
    families = [f for f, words in reader.medical.FAMILIES.items() if any(re.search(r'\b' + re.escape(w), normalized) for w in words)]
    audit['dated_families'] = families
    if families:
        found += reader.primary_search(question)[:4]
    if len(topics) == 1:
        found += reader.dictionary_search({**search, 'broad': True})[:2]
    reference_pool, audit['reference_pool'] = reader.global_search(search)
    found += reference_pool
    unique = {}
    for source in found:
        if reader.safe_source(source, question):
            unique.setdefault(source['id'], source)
    return list(unique.values())[:grounded.MAX_SOURCES], audit


def run(job, save, call=grounded.llm):
    if job['model'] != 'medical' or job.get('version'):
        raise ValueError('Profil médical figé requis.')
    started = time.monotonic()
    root = Path.home() / 'Projets' / MODELS['medical']['project']
    profile(root)
    sys.path.insert(0, str(root))
    import medical_v8 as reader
    from medical_v3 import exclusion
    # The evaluated reader reserves "prise en charge" questions to dated HAS
    # snapshots, which cover 15 publications. Here the reference pool may also
    # answer them: each claim names its source and never speaks as a guideline.
    # Only this process is affected; the frozen module file is unchanged.
    reader.recommendation_request = lambda question: False
    data = {'answer': '', 'sources': [], 'phase': 'planning', 'confidence': {'level': 'unverified'},
            'profile': 'Médical · réponses structurées vérifiées', 'parameters': '35B', 'adapter': None,
            'clinical_validation': False, 'history_policy': 'conversation_resolved', 'source_status': 'candidates'}
    save(data)
    plan = grounded.resolve(job['question'], job.get('history', []), DOMAIN, MEDICAL_RULES, call=call)
    data.update(resolved_question=plan['question'], search_queries=plan['recherches'], phase='retrieval')
    save(data)
    # Dosage and "latest recommendation" stay out of scope, as in the evaluated reader.
    reason = grounded.refusal(plan, 'Cette question ne relève pas de la documentation médicale couverte par ce modèle.')
    if not reason:
        excluded = exclusion(plan['question'])
        if excluded and 'personne particulière' not in excluded:
            reason = excluded
    if reason:
        data.update(answer=grounded.abstention(reason, (), HINT), phase='done', abstained=True, reason=reason,
                    confidence={'level': 'insufficient'}, audit_notice='Aucune recherche effectuée.' + NOTICE,
                    seconds=round(time.monotonic() - started, 1))
        save(data)
        return
    sources, audit = candidates(reader, plan)
    for source in sources:
        source['reference'] = reference(source)
    data.update(sources=[display_source(s) for s in sources], telemetry=audit, phase='generation')
    save(data)
    result = grounded.compose(plan['question'], sources, COMPOSE_RULES, HINT, plan['recherches'], call=call)
    used = [sources[i] for i in result['used']] or sources
    data.update(answer=result['answer'], sources=[display_source(s) for s in used], grounding=result['grounding'],
                abstained=result['abstained'], phase='done', selected_ids=[s['id'] for s in used] if result['used'] else [],
                confidence={'level': 'insufficient' if result['abstained'] else 'unverified'},
                source_status='selected' if result['used'] else 'candidates',
                generation_policy=result['grounding']['policy'],
                audit_notice=grounded.notice(result) + NOTICE, seconds=round(time.monotonic() - started, 1))
    save(data)


if __name__ == '__main__':
    os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    job = json.loads(Path(sys.argv[1]).read_text())
    out = Path(job['state']) / job['id']

    def save(data):
        temp = out / 'result.tmp'
        temp.write_text(json.dumps(data, ensure_ascii=False))
        temp.replace(out / 'result.json')
    run(job, save)
