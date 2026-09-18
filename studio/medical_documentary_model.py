"""Pinned V7 documentary reader; activation requires its completed evaluation."""
import hashlib,json
from pathlib import Path

PROFILE='profiles/reader-v7.json'
PROFILE_SHA='826b728fedbecd1ab6c04136d0e816506bffc4d83afcaf3454376b79ad07d803'

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def profile(root,require_activation=True):
    if sha(root/PROFILE)!=PROFILE_SHA:raise ValueError('Le profil médical V7 a changé.')
    p=json.loads((root/PROFILE).read_text())
    if require_activation and not p['activation_allowed']:raise ValueError('Le lecteur V7 n’a pas satisfait son protocole.')
    if p['adapter_path'] is not None:raise ValueError('Adaptateur inattendu pour le lecteur V7.')
    for name,expected in p['artifact_sha256'].items():
        if sha(root/name)!=expected:raise ValueError('Artefact médical modifié : '+name)
    for name,expected in p.get('runtime_artifacts',{}).items():
        if sha(name)!=expected:raise ValueError('Composant de recherche modifié : '+name)
    base=Path(p['base_model_path'])
    for record in p['model_files']:
        s=(base/record['name']).stat()
        if s.st_size!=record['bytes'] or s.st_mtime_ns!=record['mtime_ns']:raise ValueError('Poids du modèle médical modifiés.')
    return p

def model_info(root,spec,ident):
    info={'id':ident,'name':spec['name'],'description':spec['description'],'domains':spec['domains'],
        'version':'v7','parameters':'35B','available':False,'size_gb':0,'category':None,'dataset':{},'metrics':{},
        'experimental':True,'clinical_validation':False,'evaluated':False,'validation_gate':None,
        'supports_training':False,'preparation':{},'documentary_reader':True,'evaluation_version':'v7'}
    try:
        p=profile(root,require_activation=False)
        report=json.loads((root/p['evaluation_report']).read_text())
        info.update(available=p['activation_allowed'],evaluated=True,validation_gate=p['activation_allowed'],
            medical_rag_assessment=report['summary'],dataset={'documents':report['catalog_documents'],'verified_snapshots':15,'train':0,'test':report['summary']['n']},
            size_gb=round(sum(r['bytes'] for r in p['model_files'])/1e9,2))
    except (OSError,ValueError,KeyError) as error:info['availability_error']=str(error)
    return info

def display_source(s):
    return {**s,'source_id':s.get('source_id'),'title':s['title']+' ['+s['id']+']',
        'author':s['publisher']+' · '+s['date']+' · '+s.get('kind','référence'),
        'page':s.get('page') if Path(s.get('local_path','')).suffix.lower()=='.pdf' else None}
