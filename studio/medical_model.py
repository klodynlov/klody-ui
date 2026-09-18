"""Pinned experimental medical documentation profile; no clinical validation claim."""
import hashlib
import json
from pathlib import Path

PROFILE='profiles/lora-v1-experimental.json'
PROFILE_SHA='9a1b5f1c4259cee5284e5a6786865433ab3e86e4b4220e10c398d193fb6ba43a'
EXPERIMENT='experiments/20260910-lora-v1b'
REVISION='0e42af58449718de7931ee04f28191fbe6c43a56'

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text())

def profile(root):
    if sha(root/PROFILE)!=PROFILE_SHA:raise ValueError('Le profil médical évalué a changé.')
    data=read(root/PROFILE);base=Path(data['base_model']);adapter=Path(data['adapter_path'])
    expected=Path.home()/'.cache/huggingface/hub/models--mlx-community--Qwen3-4B-Instruct-2507-8bit/snapshots'/REVISION
    if base.resolve()!=expected.resolve() or not (base/'config.json').is_file() or not list(base.glob('*.safetensors')):
        raise ValueError('La base médicale 4B figée est indisponible.')
    if adapter.resolve()!=(root/EXPERIMENT/'adapters/best').resolve():raise ValueError('Adaptateur médical inattendu.')
    if sha(adapter/'adapters.safetensors')!=data['adapter_sha256']:raise ValueError('Les poids médicaux ont changé.')
    if Path(read(adapter/'adapter_config.json')['model']).resolve()!=base.resolve():raise ValueError('Adaptateur et base incompatibles.')
    for path,expected_hash in data['artifact_sha256'].items():
        if sha(root/path)!=expected_hash:raise ValueError('Un élément évalué du moteur médical a changé : '+path)
    if hashlib.sha256(data['system_prompt'].encode()).hexdigest()!=data['system_prompt_sha256']:
        raise ValueError('Les consignes médicales évaluées ont changé.')
    return data

def model_info(root,spec,ident):
    info={'id':ident,'name':spec['name'],'description':spec['description'],'domains':spec['domains'],
        'version':'v1','parameters':'4B','available':False,'size_gb':0,'category':None,'dataset':{},'metrics':{},
        'experimental':True,'clinical_validation':False,'evaluated':False,'validation_gate':None,
        'supports_training':False,'preparation':{}}
    try:
        data=profile(root);decision=read(root/EXPERIMENT/'release_decision.json')
        info.update(available=True,evaluated=True,medical_assessment=decision['heldout_counts'],
            validation_gate=decision['meets_documentary_gain_gate'],
            dataset=read(root/EXPERIMENT/'data/manifest.json')['counts'],
            size_gb=round((sum(p.stat().st_size for p in Path(data['base_model']).glob('*.safetensors'))+
                    (Path(data['adapter_path'])/'adapters.safetensors').stat().st_size)/1e9,2))
    except (OSError,ValueError,KeyError) as exc:info['availability_error']=str(exc)
    return info

def display_source(s):
    status={'preparatory':'cadrage préparatoire','suspended':'recommandation suspendue',
            'published_dated_snapshot':'document daté'}[s['status']]
    return {**s,'title':f"{s['title']} [{s['id']}]",'author':f"{s['publisher']} · {s['date']} · {status}"}

def audit_notice(a):
    if a['unknown_citations'] or a['unmatched_excerpts'] or a['uncited_or_misattributed_excerpts']:
        return 'Une citation ou un extrait est absent ou ne correspond pas à la source. Vérifiez le document.'
    if not a['excerpts']:return 'Pas d’extrait littéral contrôlable. Consultez les sources et les limites de la réponse.'
    return 'Extrait retrouvé dans la source citée. La synthèse médicale reste à vérifier par un professionnel.'
