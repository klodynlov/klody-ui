import hashlib,json
from pathlib import Path
import medical_translation as translation
from medical_documentary_v8_model import profile

def run(job,save):
    if job['model']!='medical' or job['kind']!='translate':raise ValueError('Tâche de traduction médicale attendue.')
    if job['translation_revision']!=translation.revision():raise ValueError('Le traducteur a changé. Relancez la traduction.')
    profile(translation.ROOT)
    path=Path(job['state'])/job['source_job']/'result.json'
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=job['source_result_sha256']:raise ValueError('La réponse originale a changé. Relancez la traduction.')
    original=json.loads(raw)
    try:
        result=translation.translate_result(original,progress=lambda i,n:save({'phase':'translation','answer':'','sources':[],
            'confidence':{'level':'unverified'},'translation_progress':{'current':i,'total':n}}))
    except translation.TranslationRejected as exc:
        save({'phase':'failed','answer':'','sources':[],'confidence':{'level':'unverified'},'translation_error':str(exc),
              'translation_attempts':exc.attempts,'source_job':job['source_job']})
        raise
    if hashlib.sha256(path.read_bytes()).hexdigest()!=job['source_result_sha256']:raise ValueError('La réponse originale a changé pendant la traduction.')
    result.update(source_job=job['source_job'],source_result_sha256=job['source_result_sha256'])
    save(result)

if __name__=='__main__':
    import sys
    job=json.loads(Path(sys.argv[1]).read_text());out=Path(job['state'])/job['id']
    def save(result):
        temp=out/'result.tmp';temp.write_text(json.dumps(result,ensure_ascii=False));temp.replace(out/'result.json')
    run(job,save)
