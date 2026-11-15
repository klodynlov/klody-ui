"""Replay real questions through the Studio workers, in an isolated state folder.

    KLODY_STUDIO_SOURCE=system python evals/run_eval.py <studio dir> <output dir> [id prefixes]

Questions come from KLODY_STUDIO_EVAL_QUESTIONS (default: questions.json next to
the output folder). They are real user questions: keep that file out of this
public repository. Format: [{"id","model","q","expect","history":[[role,text]]}].

Each question runs the worker registered in models.py exactly as the service
does (one subprocess, request.json, result.json), without touching jobs.json.
Runs resume: an id already in results.jsonl is skipped. Run one bench at a
time: two share the same local model and distort each other's latency.
The verdict stays a human reading of results.jsonl against `expect`.
"""
import json,subprocess,sys,time,uuid,os
from pathlib import Path
studio=Path(sys.argv[1]); out=Path(sys.argv[2]); only=sys.argv[3] if len(sys.argv)>3 else ''
sys.path.insert(0,str(studio)); from models import MODELS
PY=Path.home()/'library-brain-env/bin/python'
state=out/'state'; state.mkdir(parents=True,exist_ok=True)
qs=json.loads(Path(os.environ.get('KLODY_STUDIO_EVAL_QUESTIONS',out.parent/'questions.json')).read_text())
res_path=out/'results.jsonl'
done={json.loads(l)['id'] for l in res_path.read_text().splitlines()} if res_path.exists() else set()
for q in qs:
    if q['id'] in done or (only and not q['id'].startswith(tuple(only.split(',')))): continue
    ident=uuid.uuid4().hex; d=state/ident; d.mkdir()
    job={'id':ident,'kind':'chat','model':q['model'],'question':q['q'],'version':None,
         'history':[{'role':r,'content':c} for r,c in q.get('history',[])],'state':str(state)}
    (d/'request.json').write_text(json.dumps(job,ensure_ascii=False))
    worker=MODELS[q['model']].get('worker','worker.py')
    env={**os.environ,'HF_HUB_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','TOKENIZERS_PARALLELISM':'false','PYTHONUNBUFFERED':'1'}
    t=time.time(); err=''
    try:
        p=subprocess.run([str(PY),str(studio/worker),str(d/'request.json')],cwd=studio,env=env,capture_output=True,text=True,timeout=600)
        code=p.returncode; err=p.stderr[-1500:] if code else ''
    except subprocess.TimeoutExpired: code=-9; err='TIMEOUT 600s'
    dt=time.time()-t
    try: r=json.loads((d/'result.json').read_text())
    except Exception: r={}
    row={**q,'code':code,'seconds':round(dt,1),'answer':r.get('answer',''),'phase':r.get('phase'),
         'sources':[{k:s.get(k) for k in ('title','number','id','page','rerank_score','retrieval_score','kind')} for s in r.get('sources',[])][:8],
         'audit':r.get('audit_notice'),'err':err,'job':ident}
    with res_path.open('a') as f: f.write(json.dumps(row,ensure_ascii=False)+'\n')
    print(q['id'],code,f'{dt:.0f}s',(r.get('answer','') or err)[:90].replace('\n',' '),flush=True)
