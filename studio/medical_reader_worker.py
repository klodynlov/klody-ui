"""Run the V2 medical reader and publish only verified documentary units."""
import json
import os
from pathlib import Path
import sys
from medical_reader_model import profile,display_source,sha
from models import MODELS

def run(job,save):
    if job['model']!='medical' or job.get('version'):raise ValueError('Ce moteur accepte uniquement le lecteur médical V2 figé.')
    root=Path.home()/'Projets'/MODELS['medical']['project'];selected=profile(root)
    sys.path.insert(0,str(root))
    import medical_reader as reader
    if reader.SYSTEM!=selected['system_prompt'] or str(reader.BASE_MODEL)!=selected['base_model']:
        raise ValueError('Le moteur ne correspond pas au lecteur médical évalué.')
    data={'answer':'','sources':[],'confidence':{'level':'unverified'},'phase':'retrieval',
        'source_status':'selected','history_policy':'independent_questions','profile':selected['name'],
        'adapter':None,'adapter_sha256':None,'base_model':selected['base_model'],
        'system_prompt_sha256':selected['system_prompt_sha256'],'clinical_validation':False,
        'generation_policy':'model_selects_ids_program_copies_complete_units','experimental':True}
    save(data);route=reader.plan(job['question'])
    data['candidate_ids']=[u['id'] for u in route['candidates']]
    # Metadata/refusals are deterministic. A GPU is loaded only for selection.
    if route['mode']=='clinical':
        data['phase']='selection';save(data)
        model,tok=reader.load_model(adapter=None)
        ids,telemetry=reader.select(route,model,tok)
    elif route['mode']=='metadata':ids=[u['id'] for u in route['candidates']];telemetry={}
    else:ids=[];telemetry={}
    result=reader.render(route,ids,telemetry)
    for s in result['sources']:
        if sha(s['pdf_path'])!=s['pdf_sha256']:raise ValueError('Le PDF source a changé : '+s['source_id'])
    data.update(result)
    data['sources']=[display_source(s) for s in result['sources']]
    data['confidence']={'level':'insufficient' if result['abstained'] else 'unverified'}
    data['phase']='done';save(data)

if __name__=='__main__':
    os.environ.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
    job=json.loads(Path(sys.argv[1]).read_text());out=Path(job['state'])/job['id']
    def save(data):
        temp=out/'result.tmp';temp.write_text(json.dumps(data,ensure_ascii=False));temp.replace(out/'result.json')
    run(job,save)
