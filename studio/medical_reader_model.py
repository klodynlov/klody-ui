"""Pinned V2 reader. The active selector is the base 4B, not the archived LoRA."""
import hashlib
import json
from pathlib import Path
from medical_model import display_source

PROFILE='profiles/reader-v2.json'
PROFILE_SHA='b0a0dcf06fa108e53581d2d55ff8b4b63219c36e4756425b0f68503ff801a133'
REVISION='0e42af58449718de7931ee04f28191fbe6c43a56'

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text())

def profile(root):
    if sha(root/PROFILE)!=PROFILE_SHA:raise ValueError('Le profil médical épuré a changé.')
    data=read(root/PROFILE);base=Path(data['base_model'])
    expected=Path.home()/'.cache/huggingface/hub/models--mlx-community--Qwen3-4B-Instruct-2507-8bit/snapshots'/REVISION
    if base.resolve()!=expected.resolve() or not (base/'config.json').is_file() or not list(base.glob('*.safetensors')):
        raise ValueError('La base médicale 4B figée est indisponible.')
    if data['adapter_path'] is not None:raise ValueError('Adaptateur médical inattendu : le lecteur V2 utilise la base évaluée.')
    for name,expected_hash in data['artifact_sha256'].items():
        if sha(root/name)!=expected_hash:raise ValueError('Un élément du lecteur médical évalué a changé : '+name)
    if hashlib.sha256(data['system_prompt'].encode()).hexdigest()!=data['system_prompt_sha256']:
        raise ValueError('Les consignes de sélection ont changé.')
    return data

def model_info(root,spec,ident):
    info={'id':ident,'name':spec['name'],'description':spec['description'],'domains':spec['domains'],
        'version':'v2','parameters':'4B','available':False,'size_gb':0,'category':None,'dataset':{},'metrics':{},
        'experimental':True,'clinical_validation':False,'evaluated':False,'validation_gate':None,
        'supports_training':False,'preparation':{}}
    try:
        data=profile(root);report=read(root/'experiments/20260910-reader-v2/release_decision.json')
        info.update(available=True,evaluated=True,reader_assessment=report['summary'],
                    validation_gate=report['goal_met_on_frozen_test'],
                    dataset={'train':0,'evidence_units':51,'valid':24,'test':24},
                    size_gb=round(sum(p.stat().st_size for p in Path(data['base_model']).glob('*.safetensors'))/1e9,2))
    except (OSError,ValueError,KeyError) as exc:info['availability_error']=str(exc)
    # Keep the active V2 score and the newer candidate's score distinct.
    if (root/'profiles/rag-v3.json').is_file():
        try:
            from medical_rag_model import profile as candidate_profile
            candidate=candidate_profile(root,require_activation=False)
            assessment=read(root/candidate['evaluation_report'])
            info['medical_candidate_assessment']={'summary':assessment['summary'],'accepted':candidate['activation_allowed']}
            info['coverage_audit']=assessment['v2_routing_assessment']
        except (OSError,ValueError,KeyError):
            info['candidate_assessment_unavailable']=True
    return info
