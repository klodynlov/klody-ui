"""Isolated, offline GPU worker for the medical documentary pilot."""
import json
import os
from pathlib import Path
import sys
from medical_model import profile,display_source,audit_notice,sha
from models import MODELS

def run(job,save):
    if job['model']!='medical' or job.get('version'):raise ValueError('Ce moteur accepte uniquement le profil médical V1 figé.')
    root=Path.home()/'Projets'/MODELS['medical']['project'];selected=profile(root)
    sys.path.insert(0,str(root))
    from medical import BASE_MODEL,SYSTEM,retrieve,load_model,messages,audit
    if str(BASE_MODEL)!=selected['base_model'] or SYSTEM!=selected['system_prompt']:
        raise ValueError('Le moteur ne correspond pas au profil médical évalué.')
    data={'answer':'','sources':[],'confidence':{'level':'unverified'},'phase':'retrieval',
          'source_status':'retrieved','history_policy':'independent_questions','profile':selected['name'],
          'adapter':selected['adapter_path'],'adapter_sha256':selected['adapter_sha256'],
          'system_prompt_sha256':selected['system_prompt_sha256'],'base_model':selected['base_model'],
          'experimental':True,'clinical_validation':False}
    save(data);sources=retrieve(job['question'],limit=4)
    data['sources']=[display_source(s) for s in sources]
    if not sources:
        data.update(answer='SOURCES_INSUFFISANTES: aucun passage pertinent dans ce pilote. Précisez un thème couvert : bronchiolite, diabète de type 2, information au patient, tabac, HTA, dénutrition, TDAH ou douleur chronique.',
                    phase='done',confidence={'level':'insufficient'},audit_notice='Corpus limité à 15 documents HAS datés. Chaque question est indépendante.')
        save(data);return
    for s in sources:
        if sha(s['pdf_path'])!=s['pdf_sha256']:raise ValueError('Le document source a changé : '+s['source_id'])
    data['phase']='generation';save(data)
    model,tokenizer=load_model(adapter=selected['adapter_path'])
    prompt=tokenizer.apply_chat_template(messages(job['question'],sources),tokenize=False,add_generation_prompt=True)
    data['prompt_tokens']=len(tokenizer.encode(prompt,add_special_tokens=False))
    if data['prompt_tokens']>10000:raise ValueError('Contexte trop long : préciser la question documentaire.')
    from mlx_lm import stream_generate
    from mlx_lm.sample_utils import make_sampler
    for chunk in stream_generate(model,tokenizer,prompt=prompt,max_tokens=600,sampler=make_sampler(temp=0.0)):
        data['answer']+=chunk.text
        if chunk.finish_reason:data['finish_reason']=chunk.finish_reason
        save(data)
    data['evidence_audit']=audit(data['answer'],sources);data['audit_notice']=audit_notice(data['evidence_audit'])+' '+selected['known_limitation']
    if data.get('finish_reason')=='length':data['audit_notice']+=' Réponse arrêtée à la limite de longueur.'
    data['phase']='done';save(data)

if __name__=='__main__':
    os.environ.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
    job=json.loads(Path(sys.argv[1]).read_text());out=Path(job['state'])/job['id']
    def save(data):
        tmp=out/'result.tmp';tmp.write_text(json.dumps(data,ensure_ascii=False));tmp.replace(out/'result.json')
    run(job,save)
