import json,os,sys
from pathlib import Path
from medical_documentary_v8_model import profile,display_source
from models import MODELS

def run(job,save):
    if job['model']!='medical' or job.get('version'):raise ValueError('Profil médical V8 figé requis.')
    root=Path.home()/'Projets'/MODELS['medical']['project'];p=profile(root)
    sys.path.insert(0,str(root));import medical_v8 as reader
    if reader.MODEL!=p['model_id'] or str(reader.BASE)!=p['base_model_path']:raise ValueError('Identité du modèle médical incorrecte.')
    reader.answer(job['question'],save=lambda r:save({**r,'sources':[display_source(s) for s in r['sources']]}))

if __name__=='__main__':
    os.environ.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
    job=json.loads(Path(sys.argv[1]).read_text());out=Path(job['state'])/job['id']
    def save(data):
        temp=out/'result.tmp';temp.write_text(json.dumps(data,ensure_ascii=False));temp.replace(out/'result.json')
    run(job,save)
