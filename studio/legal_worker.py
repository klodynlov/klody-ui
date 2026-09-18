"""Run the evaluated legal profile, without the coding agent or other corpora."""
import json
import os
from pathlib import Path
import sys
from legal_model import profile, display_source, audit_notice
from models import MODELS
from legal_corpus import search as corpus_search


def retrieve_sources(root, question):
    expanded = corpus_search.active(root)
    if expanded:
        return corpus_search.retrieve(question, expanded / 'index.sqlite', limit=5)
    from legal import retrieve
    return retrieve(question, limit=5)


def run(job, save):
    if job['model'] != 'legal' or job.get('version'):
        raise ValueError('Ce moteur accepte uniquement le profil juridique V3 figé.')
    root = Path.home() / 'Projets' / MODELS['legal']['project']
    selected = profile(root)
    sys.path.insert(0, str(root))
    from legal import BASE_MODEL, retrieve, load_model, messages, citation_audit
    from evidence_audit import excerpt_audit
    if BASE_MODEL.resolve() != Path(selected['base_model']).resolve():
        raise ValueError('Le moteur juridique ne correspond pas au profil.')
    data = {'answer': '', 'sources': [], 'confidence': {'level': 'unverified'}, 'phase': 'retrieval',
            'source_status': 'retrieved', 'history_policy': 'independent_questions', 'profile': selected['name'],
            'adapter': selected['adapter_path'], 'adapter_sha256': selected['adapter_sha256'],
            'system_prompt_sha256': selected['system_prompt_sha256'], 'base_model': selected['base_model'],
            'experimental': True}
    save(data)
    sources = retrieve_sources(root, job['question'])
    expanded = corpus_search.active(root)
    if expanded:
        data['corpus'] = json.loads((expanded / 'coverage.json').read_text())
    data['sources'] = [display_source(s) for s in sources]
    if not sources:
        data.update(answer='SOURCES_INSUFFISANTES: aucun texte retrouvé. Précisez la question, le code ou la référence de la décision.',
                    phase='done', confidence={'level': 'insufficient'})
        save(data)
        return
    data['phase'] = 'generation'; save(data)
    model, tokenizer = load_model(adapter=selected['adapter_path'])
    turns = (corpus_search.messages(job['question'], sources, selected['system_prompt'])
             if expanded else messages(job['question'], sources))
    turns[0]['content'] = selected['system_prompt']
    prompt = tokenizer.apply_chat_template(turns, tokenize=False, add_generation_prompt=True)
    data['prompt_tokens'] = len(tokenizer.encode(prompt, add_special_tokens=False))
    while expanded and data['prompt_tokens'] > 10000 and len(sources) > 1:
        sources.pop()
        turns=corpus_search.messages(job['question'],sources,selected['system_prompt'])
        prompt=tokenizer.apply_chat_template(turns,tokenize=False,add_generation_prompt=True)
        data['prompt_tokens']=len(tokenizer.encode(prompt,add_special_tokens=False))
    data['sources']=[display_source(s) for s in sources]
    if data['prompt_tokens'] > 10000:
        raise ValueError('Ces sources dépassent le contexte du pilote. Posez une question plus ciblée avec une référence précise.')
    from mlx_lm import stream_generate
    from mlx_lm.sample_utils import make_sampler
    for chunk in stream_generate(model, tokenizer, prompt=prompt, max_tokens=500, sampler=make_sampler(temp=0.0)):
        data['answer'] += chunk.text
        if chunk.finish_reason:
            data['finish_reason'] = chunk.finish_reason
        save(data)
    data['citation_audit'] = (corpus_search.citation_audit(data['answer'],sources) if expanded
                              else citation_audit(data['answer'], sources))
    data['excerpt_audit'] = excerpt_audit(data['answer'], sources)
    data['audit_notice'] = audit_notice(data['citation_audit'], data['excerpt_audit'])
    if data.get('finish_reason') == 'length':
        data['audit_notice'] += ' Réponse arrêtée à la limite de longueur.'
    data['phase'] = 'done'; save(data)


if __name__ == '__main__':
    os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
    job = json.loads(Path(sys.argv[1]).read_text())
    out = Path(job['state']) / job['id']
    def save(data):
        tmp = out / 'result.tmp'
        tmp.write_text(json.dumps(data, ensure_ascii=False))
        tmp.replace(out / 'result.json')
    run(job, save)
