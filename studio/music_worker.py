"""Runs in Studio's existing serial queue, using the existing local LLM server."""
import json
from pathlib import Path
import re
import sys

from music_assistant import MODEL, build_messages, duration_reference, local_request, method_context


def generated_duration(answer):
    return bool(re.search(r'\b\d+(?:[.,:]\d+)?\s*(?:secondes?|secs?|s|minutes?|mins?|min)\b', answer, re.I))


def run(request_path):
    job = json.loads(Path(request_path).read_text())
    out = Path(job['state']) / job['id']
    data = {'answer': '', 'sources': [], 'confidence': {'level': 'unverified'},
            'source_status': 'method_references', 'phase': 'selection', 'parameters': '35B',
            'audio_analyzed': False, 'model': MODEL, 'project_revision': job['music_project']['revision']}

    def save():
        tmp = out / 'result.tmp'
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        tmp.replace(out / 'result.json')

    save()
    try:
        method, sources = method_context(job['music_mode'])
        sources += job.get('music_evidence', {}).get('sources', [])
        if job['music_mode'] == 'documents' and not any(s['id'].startswith('D') for s in sources):
            raise ValueError('Importez un document contenant du texte dans ce projet avant de demander son analyse.')
        data.update(sources=sources, method=method, phase='generation')
        data['audio_analyzed'] = any(s['id'].startswith('A') for s in sources)
        data['document_coverage'] = job.get('music_evidence', {}).get('coverage')
        save()
        payload = {
            'model': MODEL, 'messages': build_messages(job, method, sources),
            'temperature': 0.25, 'max_tokens': 1800, 'stream': False,
            'chat_template_kwargs': {'enable_thinking': False},
        }
        for attempt in range(2):
            response = local_request('/chat/completions', payload, timeout=240)
            choice = response['choices'][0]
            answer = choice['message']['content']
            if job['music_mode'] != 'structure' or not isinstance(answer, str) or not generated_duration(answer):
                break
            if attempt:
                raise ValueError('Le modèle a ajouté des durées non vérifiées. La réponse est retenue ; reformulez en nombres de mesures.')
            payload['messages'].append({'role': 'user', 'content': 'Réponds à la demande uniquement en nombres de mesures. Aucune seconde ni minute chiffrée : les durées sont calculées séparément par l’application.'})
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError('Le moteur a renvoyé une réponse vide.')
        if re.search(r'<think>|<tool_call>', answer):
            raise ValueError('Le moteur a renvoyé une réponse mal formée. Relancez la demande.')
        cited = [ident for group in re.findall(r'\[([^\]]+)\]', answer) for ident in re.findall(r'\b[SDA]\d+\b', group)]
        if set(cited) - {s['id'] for s in sources}:
            raise ValueError('La réponse contient une référence inconnue. Relancez la demande.')
        data.update(answer=answer.strip(), phase='done', finish_reason=choice.get('finish_reason'))
        data['duration_policy'] = 'computed_separately'
        if job['music_mode'] == 'structure':
            data['duration_reference'] = duration_reference(job['music_project'])
        if choice.get('finish_reason') == 'length':
            data['answer'] += '\n\n*Réponse interrompue à sa limite de longueur ; demandez de poursuivre.*'
        save()
    except Exception as exc:
        data.update(phase='failed', error='Réponse non terminée : ' + str(exc))
        save()
        raise


if __name__ == '__main__':
    run(sys.argv[1])
