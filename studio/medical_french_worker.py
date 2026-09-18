import json,os,sys
import time
import requests
from pathlib import Path
import medical_documentary_v8_worker as documentary

def run(job,save):
    from medical_translation import translate_result, TranslationRejected, FRENCH_POLICY
    started=time.monotonic()
    original=None
    def reader_progress(result):
        nonlocal original
        # Do not briefly publish an English answer before French is ready.
        if result.get('phase')!='done' or result.get('abstained'):
            save(result)
        if result.get('phase')=='done':original=result
    documentary.run(job,reader_progress)
    if original is None:raise ValueError('Le lecteur médical n’a pas terminé sa réponse.')
    if original.get('abstained'):return
    presentation={**original,'original_answer':original['answer'],'answer':'',
                  'phase':'translation','generation_policy':FRENCH_POLICY}
    def progress(current,total):
        save({**presentation,'translation_progress':{'current':current,'total':total}})
    progress(0,len(original['sources']))
    try:
        translated=translate_result(original,progress=progress)
    except (ValueError,TypeError,KeyError,requests.RequestException) as exc:
        # Keep the evidence available, without presenting unverified English as the answer.
        save({**presentation,'phase':'done',
              'answer':'La réponse en français n’a pas pu être préparée. Vous pouvez réessayer la traduction ou consulter les extraits originaux dans les sources.',
              'translation_error':str(exc),
              'translation_attempts':exc.attempts if isinstance(exc,TranslationRejected) else [],
              'audit_notice':'Traduction indisponible ; les sources originales sont conservées.'})
        return
    save({**presentation,'phase':'done','answer':translated['answer'],
          'translation':translated['translation'],'audit_notice':translated['audit_notice'],
          'seconds':round(time.monotonic()-started,3)})

if __name__=='__main__':
    os.environ.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
    job=json.loads(Path(sys.argv[1]).read_text());out=Path(job['state'])/job['id']
    def save(data):
        temp=out/'result.tmp';temp.write_text(json.dumps(data,ensure_ascii=False));temp.replace(out/'result.json')
    run(job,save)
