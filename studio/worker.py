"""Resolve the question, retrieve evidence, then answer. Each GPU runtime is isolated."""
import json
import os
from pathlib import Path
import subprocess
import sys
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
job=json.loads(Path(sys.argv[1]).read_text())
state=Path(job['state']); out=state/job['id']; here=Path(__file__).resolve().parent
from models import MODELS
from code_context import provided_code_context, coding_question, specification_messages, is_python_function_request, repeated_protocol_markup
spec=MODELS[job['model']]
project=spec['project']
root=Path.home()/'Projets'/project
sys.path.insert(0,str(root))
from research import RELEASE_MODEL, messages, render_prompt, citation, SYSTEM

def save(data):
    tmp=out/'result.tmp'; tmp.write_text(json.dumps(data,ensure_ascii=False)); tmp.replace(out/'result.json')

code_context = provided_code_context(job['question'],job.get('history',[])) if job['model']=='code' else None
user_code = code_context is not None
data={'answer':'','sources':[],'confidence':{'level':'pending'},'phase':'planning'};save(data)
if user_code:
    # A provided program/specification is sufficient input; preserve it verbatim.
    plan={'question':code_context,'intent':'answer','queries':[],'input':'user_code_specification'}
    context={'sources':[],'accepted_sources':[],'confidence':{'level':'user_provided'}}
else:
    result=subprocess.run([sys.executable,str(here/'query_plan.py'),sys.argv[1]],capture_output=True,text=True,timeout=120,check=True)
    plan=json.loads(result.stdout)
    (out/'query_plan.json').write_text(json.dumps(plan,ensure_ascii=False))
    data.update(phase='retrieval',resolved_question=plan['question']);save(data)
    command=[sys.executable,str(here/'retrieve.py'),str(out/'query_plan.json')]
    if spec['category']:command.append(json.dumps(spec['category'],ensure_ascii=False))
    result=subprocess.run(command,capture_output=True,text=True,timeout=240,check=True)
    context=json.loads(result.stdout)
(out/'query_plan.json').write_text(json.dumps(plan,ensure_ascii=False))
(out/'retrieval.json').write_text(json.dumps(context,ensure_ascii=False,indent=2))
data.update(sources=context['sources'],confidence=context['confidence'],phase='generation',resolved_question=plan['question'],search_queries=plan['queries'],source_status='user_context' if user_code else 'accepted' if context['accepted_sources'] else 'candidates')
save(data)
if context['confidence']['level']=='insufficient' and not user_code:
    if context['sources']:
        answer='J’ai repéré des documents liés à votre recherche, mais les passages retrouvés ne suffisent pas à répondre précisément à cette question. Ils restent consultables dans le panneau des passages repérés. Vous pouvez préciser le point à expliquer ou le chapitre à chercher.'
    else:
        answer='Cette recherche n’a pas retrouvé de passage exploitable. Cela ne prouve pas que le sujet est absent de votre bibliothèque. Essayez de préciser le sujet ou le titre d’un ouvrage.'
    data.update(answer=answer,phase='done');save(data);sys.exit(0)
if plan['intent']=='catalog' and not user_code:
    seen=set();items=[]
    for source in context['sources']:
        if source['book_id'] not in seen:
            seen.add(source['book_id']);items.append('- '+citation(source))
    data.update(answer='Oui. J’ai retrouvé des passages sur ce sujet dans les ouvrages suivants :\n\n'+'\n'.join(items)+'\n\nCette sélection n’est pas un inventaire exhaustif de la bibliothèque.',phase='done');save(data);sys.exit(0)
import mlx.core as mx
from mlx_lm import load, stream_generate
from mlx_lm.sample_utils import make_sampler
mx.set_cache_limit(1024**3)
model_path=state/'versions'/job['version']/'fused'/RELEASE_MODEL.name if job.get('version') else RELEASE_MODEL
model,tokenizer=load(str(model_path))
# History has already resolved the question; old refusals are not evidence for the answer.
sources=context['sources']
question=code_context if user_code else coding_question(job['question'],plan['question']) if job['model']=='code' else plan['question']
instructions=None
if user_code and is_python_function_request(question):
    from code_tasks import RESTRICTIONS
    instructions=RESTRICTIONS if 'solve' in question else RESTRICTIONS.replace('nommée solve','avec le nom demandé dans la spécification')
prompt=render_prompt(tokenizer,specification_messages(SYSTEM,question,instructions) if user_code else messages(question,sources))
while len(tokenizer.encode(prompt))>8192 and len(sources)>1:
    sources=sources[:-1];prompt=render_prompt(tokenizer,messages(question,sources))
if len(tokenizer.encode(prompt))>8192:raise ValueError('Le contexte dépasse la capacité de ce pilote.')
data['sources']=sources;save(data)
for chunk in stream_generate(model,tokenizer,prompt=prompt,max_tokens=spec.get('max_output_tokens',700),sampler=make_sampler(temp=0.0)):
    data['answer']+=chunk.text
    repeated_at=repeated_protocol_markup(data['answer'])
    if repeated_at is not None:
        (out/'malformed_generation.txt').write_text(data['answer'])
        data['answer']=data['answer'][:repeated_at].rstrip()+'\n\n*Réponse interrompue : le modèle a produit une répétition invalide. Cette proposition doit être vérifiée.*'
        data['finish_reason']='invalid_generation';save(data);break
    if chunk.finish_reason:
        data['finish_reason']=chunk.finish_reason
        if chunk.finish_reason=='length':data['answer']+='\n\n*La réponse a atteint sa limite de longueur. Vous pouvez demander de préciser un point.*'
    save(data)
data['phase']='done';save(data)
