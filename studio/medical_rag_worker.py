"""Stream phase/result state from the pinned medical V3 pipeline."""
import json,os,sys
from pathlib import Path
from medical_rag_model import profile,display_source
from models import MODELS

def run(job,save):
    if job['model']!='medical' or job.get('version'):raise ValueError('Profil médical V3 figé requis.')
    root=Path.home()/'Projets'/MODELS['medical']['project'];selected=profile(root)
    sys.path.insert(0,str(root));import medical_v3 as medical
    if medical.MODEL!=selected['model_id'] or str(medical.BASE)!=selected['base_model_path']:
        raise ValueError('Le moteur local ne correspond pas au profil évalué.')
    def publish(result):
        save({**result,'sources':[display_source(s) for s in result['sources']]})
    medical.answer(job['question'],save=publish)

if __name__=='__main__':
    os.environ.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
    job=json.loads(Path(sys.argv[1]).read_text());out=Path(job['state'])/job['id']
    def save(data):
        p=out/'result.tmp';p.write_text(json.dumps(data,ensure_ascii=False));p.replace(out/'result.json')
    run(job,save)
