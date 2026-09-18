"""Pinned broad medical pilot, using an existing local 35B without LoRA."""
import hashlib,json
from pathlib import Path
PROFILE='profiles/rag-v3.json'
PROFILE_SHA='7956174b5c390d5acb8d3037f223d6c9cf508afe43209a183a9b3b32f3b8cd48'

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def profile(root,require_activation=True):
    if sha(root/PROFILE)!=PROFILE_SHA:raise ValueError('Le profil médical V3 a changé.')
    data=json.loads((root/PROFILE).read_text())
    if require_activation and not data.get('activation_allowed'):raise ValueError('Le candidat médical V3 n’a pas satisfait les critères de sélection.')
    if data['adapter_path'] is not None:raise ValueError('Ce profil V3 utilise une base sans adaptateur.')
    if not Path(data['base_model_path']).is_dir():raise ValueError('La base médicale 35B est absente.')
    for name,h in data['artifact_sha256'].items():
        if sha(root/name)!=h:raise ValueError('Un artefact médical évalué a changé : '+name)
    for file in data['model_files']:
        p=Path(data['base_model_path'])/file['name']
        if not p.is_file() or p.stat().st_size!=file['bytes'] or p.stat().st_mtime_ns!=file['mtime_ns']:raise ValueError('Un fichier du modèle médical est absent ou a changé.')
    return data

def model_info(root,spec,ident):
    info={'id':ident,'name':spec['name'],'description':spec['description'],'domains':spec['domains'],
        'version':'v3','parameters':'35B','available':False,'size_gb':0,'category':None,'dataset':{},'metrics':{},
        'experimental':True,'clinical_validation':False,'evaluated':False,'validation_gate':None,'supports_training':False,'preparation':{}}
    try:
        data=profile(root,require_activation=False);report=json.loads((root/data['evaluation_report']).read_text())
        info.update(available=bool(data['activation_allowed']),evaluated=True,medical_rag_assessment=report['summary'],validation_gate=report['meets_release_gate'],
            dataset={'documents':report['catalog_documents'],'train':0,'test':report['summary']['n']},
            size_gb=round(sum(x['bytes'] for x in data['model_files'])/1e9,2))
        if not data['activation_allowed']:info['availability_error']='Candidat évalué mais non retenu : critères de qualité non atteints.'
    except (OSError,KeyError,ValueError) as e:info['availability_error']=str(e)
    return info

def display_source(s):
    return {**s,'title':f"{s['title']} [{s['id']}]",'author':f"{s['publisher']} · {s['date']} · {s['kind']}",
        'page':s['page'] if Path(s.get('local_path','')).suffix.lower()=='.pdf' else None}
