"""Local model studio. Never changes a released model or the LibraryBrain database."""
from __future__ import annotations
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

HERE = Path(__file__).resolve().parent
HOME = Path.home()
PYTHON = HOME / 'library-brain-env/bin/python'
STATE = Path(os.environ.get('KLODY_STUDIO_STATE', HOME / 'Projets/KlodyModelStudio'))
ORIGINS = ['http://localhost:1420', 'http://127.0.0.1:1420', 'http://127.0.0.1:8018', 'http://localhost:8018', 'tauri://localhost', 'http://tauri.localhost']
from models import MODELS

def read(path, fallback=None):
    try: return json.loads(Path(path).read_text())
    except FileNotFoundError: return fallback

def write(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2)); tmp.replace(path)

def sha(path):
    with Path(path).open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()

def source_root(model): return HOME / 'Projets' / MODELS[model]['project']

def model_info(model):
    spec = MODELS[model]; root = source_root(model)
    if spec.get('runtime') == 'medical_documentary_v8':
        from medical_documentary_v8_model import model_info as documentary_info
        return documentary_info(root,spec,model)
    if spec.get('runtime') == 'medical_documentary':
        from medical_documentary_model import model_info as documentary_info
        return documentary_info(root,spec,model)
    if spec.get('runtime') == 'medical_rag':
        from medical_rag_model import model_info as rag_model_info
        return rag_model_info(root,spec,model)
    if spec.get('runtime') == 'medical_reader':
        from medical_reader_model import model_info as reader_model_info
        return reader_model_info(root, spec, model)
    if spec.get('runtime') == 'medical_lora':
        from medical_model import model_info as medical_model_info
        return medical_model_info(root, spec, model)
    if spec.get('runtime') == 'legal_lora':
        from legal_model import model_info as legal_model_info
        return legal_model_info(root, spec, model)
    manifest = read(root / 'fused' / spec['release'] / 'export_manifest.json', {})
    dataset = read(root / 'data/dataset_manifest.json', {})
    comparison = read(root / 'reports/comparison.json', {})
    scores = comparison.get('models', {})
    code_metrics = read(root / 'reports/code_comparison.json', {})
    selection = read(root / 'reports/release_selection.json', {})
    return {'id': model, 'name': spec['name'], 'description': spec['description'], 'domains': spec['domains'],
        'version': 'v0.1', 'parameters': '4B', 'available': bool(manifest), 'size_gb': round(manifest.get('weights_bytes', 0)/1e9, 2),
        'category': spec['category'], 'dataset': dataset.get('counts', {}), 'metrics': scores,
        'code_metrics': code_metrics, 'validation_gate': selection.get('meets_baseline_gate'),
        'fidelity': read(root / 'reports/grounding_summary.json', {}), 'experimental': True, 'evaluated': bool(comparison) and (model != 'code' or bool(code_metrics)), 'preparation': read(root / 'runs/status.json', {})}

class Engine:
    def __init__(self, state=STATE):
        self.state = Path(state); self.lock = threading.RLock(); self.q = queue.Queue()
        self.jobs = {}; self.process = None; self.stopping = False; self.thread = None

    def start(self):
        self.state.mkdir(parents=True, exist_ok=True)
        self.lease = (self.state / 'service.lock').open('w')
        fcntl.flock(self.lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.jobs = read(self.state / 'jobs.json', {})
        for job in self.jobs.values():
            if job['status'] in ('queued', 'running'):
                job.update(status='interrupted', error='Le service a été relancé. Relancez une nouvelle opération.', finished=time.time())
        self.save()
        self.thread = threading.Thread(target=self.loop, daemon=True); self.thread.start()

    def save(self): write(self.state / 'jobs.json', self.jobs)

    def update(self, ident, **values):
        with self.lock:
            self.jobs[ident].update(values); self.save()

    def create(self, kind, model, **values):
        with self.lock:
            if sum(j['status'] in ('queued', 'running') for j in self.jobs.values()) >= 8:
                raise HTTPException(429, 'La file est pleine. Attendez ou annulez une opération.')
            ident = uuid.uuid4().hex
            job = {'id': ident, 'kind': kind, 'model': model, 'status': 'queued', 'created': time.time(), **values}
            self.jobs[ident] = job; self.save(); self.q.put(ident)
            return job.copy()

    def cancel(self, ident):
        with self.lock:
            job = self.get(ident)
            if job['status'] not in ('queued', 'running'): return job
            job['status'] = 'cancelled'; job['finished'] = time.time(); self.save()
            if self.process and self.process[0] == ident:
                proc = self.process[1]
                with contextlib.suppress(ProcessLookupError): os.killpg(proc.pid, signal.SIGTERM)
                def ensure_stopped():
                    try: proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        with contextlib.suppress(ProcessLookupError): os.killpg(proc.pid, signal.SIGKILL)
                threading.Thread(target=ensure_stopped, daemon=True).start()
            return job.copy()

    def get(self, ident):
        if ident not in self.jobs: raise HTTPException(404, 'Opération introuvable.')
        return self.jobs[ident]

    def commands(self, job):
        model = job['model']; root = source_root(model)
        if job['kind'] == 'translate':
            return [[str(PYTHON), str(HERE/'medical_translation_worker.py'), str(self.state/job['id']/'request.json')]]
        if job['kind'] == 'chat':
            return [[str(PYTHON), str(HERE / MODELS[model].get('worker', 'worker.py')), str(self.state / job['id'] / 'request.json')]]
        if job['kind'] == 'train':
            target = self.state / 'versions' / job['id']
            target.mkdir(parents=True, exist_ok=False)
            # Fresh project root: pinned base, frozen reviewed data, no release overwritten.
            for script in root.glob('*.py'): shutil.copy2(script, target / script.name)
            shutil.copytree(root / 'data', target / 'data', ignore=shutil.ignore_patterns('teacher*', 'packets.jsonl', 'approved.jsonl', 'label_reviews.jsonl'))
            for directory in ['runs', 'configs', 'reports']: (target / directory).mkdir()
            manifest = read(target / 'data/dataset_manifest.json')
            for split, expected in manifest['sha256'].items():
                if sha(target / 'data' / f'{split}.jsonl') != expected: raise ValueError('Empreinte du corpus invalide.')
            for split, expected in manifest.get('coding_exercises', {}).get('sha256', {}).items():
                if sha(target / 'data' / f'code_{split}.jsonl') != expected: raise ValueError('Empreinte des exercices invalide.')
            write(target / 'studio_version.json', {'model': model, 'id': job['id'], 'name': job['name'], 'created': job['created'], 'source': str(root), 'method': 'fresh LoRA from pinned base; frozen corpus'})
            self.update(job['id'], version=job['id'])
            return [[str(PYTHON), '-u', str(target/'train.py'), '--iters', str(job['iterations'])], [str(PYTHON), '-u', str(target/'export_model.py')]]
        target = self.state / 'versions' / job['version']
        if not read(target / 'fused' / MODELS[model]['release'] / 'export_manifest.json'): raise ValueError('Version non exportée.')
        commands = [[str(PYTHON), '-u', str(target/'evaluate.py'), '--variant', variant] for variant in ['base', MODELS[model]['variant']]] + [[str(PYTHON), str(target/'evaluate.py'), '--summarize']]
        if model == 'code': commands.append([str(PYTHON), '-u', str(target/'code_benchmark.py')])
        return commands

    def loop(self):
        while not self.stopping:
            ident = self.q.get()
            if ident is None: break
            with self.lock:
                if self.jobs[ident]['status'] != 'queued': continue
                self.update(ident, status='running', started=time.time(), phase='Préparation')
                job = self.jobs[ident].copy()
            folder = self.state / ident; folder.mkdir(exist_ok=True)
            try:
                write(folder / 'request.json', {**job, 'state': str(self.state)})
                commands = self.commands(job)
                for index, command in enumerate(commands):
                    with self.lock:
                        if self.jobs[ident]['status'] == 'cancelled': break
                        self.update(ident, phase=('Recherche et réponse' if job['kind']=='chat' else f'Étape {index+1}/{len(commands)}'))
                        log = (folder / 'output.log').open('a')
                        env = {**os.environ, 'HF_HUB_OFFLINE': '1', 'HF_HUB_DISABLE_TELEMETRY': '1', 'TOKENIZERS_PARALLELISM': 'false', 'PYTHONUNBUFFERED': '1'}
                        # One process group per job, including MLX export children.
                        proc = subprocess.Popen(command, cwd=HERE, stdout=log, stderr=log, env=env, start_new_session=True)
                        self.process = (ident, proc)
                    try: code = proc.wait(timeout=7200 if job['kind'] not in ('chat','translate') else 600)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGTERM)
                        try: proc.wait(timeout=5)
                        except subprocess.TimeoutExpired: os.killpg(proc.pid, signal.SIGKILL); proc.wait()
                        raise RuntimeError('Durée maximale dépassée.')
                    finally:
                        log.close()
                        with self.lock: self.process = None
                    if self.jobs[ident]['status'] == 'cancelled': break
                    if code: raise RuntimeError('Le moteur a interrompu cette opération. Consultez le journal.')
                with self.lock:
                    if self.jobs[ident]['status'] != 'cancelled':
                        if job['kind'] == 'train':
                            manifest_path = self.state/'versions'/ident/'fused'/MODELS[job['model']]['release']/'export_manifest.json'
                            manifest = read(manifest_path)
                            manifest.update(name=job['name'], studio_version=ident, experimental=True)
                            write(manifest_path, manifest)
                        self.update(ident, status='completed', finished=time.time(), phase='Terminé')
            except Exception as exc:
                with self.lock:
                    if self.jobs[ident]['status'] != 'cancelled': self.update(ident, status='failed', error=str(exc), finished=time.time())

    def detail(self, ident):
        with self.lock: job = self.get(ident).copy()
        folder = self.state / ident
        job['result'] = read(folder/'result.json')
        log = folder/'output.log'
        if log.exists():
            with log.open('rb') as f:
                f.seek(max(0, log.stat().st_size-8000)); job['log'] = f.read().decode('utf-8', errors='replace')
        if job['kind'] == 'train': job['progress'] = read(self.state/'versions'/ident/'runs/status.json')
        return job

    def close(self):
        self.stopping = True
        with self.lock:
            if self.process: self.cancel(self.process[0])
        self.q.put(None)
        if self.thread: self.thread.join(timeout=6)
        if hasattr(self,'lease'): self.lease.close()

engine = Engine()
@asynccontextmanager
async def lifespan(app):
    engine.start()
    yield
    engine.close()

app = FastAPI(title='Klody Model Studio', lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['GET','POST'], allow_headers=['Content-Type','X-Klody-Studio'])

@app.middleware('http')
async def local_guard(request: Request, call_next):
    if request.url.path.startswith('/api/') and request.method != 'OPTIONS':
        if request.headers.get('origin') not in [None, *ORIGINS] or request.headers.get('X-Klody-Studio') != '1':
            return JSONResponse({'detail':'Origine non autorisée.'}, status_code=403)
    return await call_next(request)

class Chat(BaseModel):
    model: str
    question: str = Field(min_length=2, max_length=4000)
    version: str | None = None
    history: list[dict[str,str]] = Field(default_factory=list, max_length=12)

class Training(BaseModel):
    model: str
    name: str = Field(min_length=1, max_length=64)
    iterations: int = Field(ge=2, le=300)

class Evaluation(BaseModel):
    version: str

class Feedback(BaseModel):
    job: str
    correction: str = Field(min_length=5, max_length=6000)

def check_model(model):
    if model not in MODELS: raise HTTPException(422,'Modèle inconnu.')
    info = model_info(model)
    if not info['available']:
        raise HTTPException(409, info.get('availability_error') or 'Le modèle n’est pas encore exporté.')

def check_version(version, model=None):
    if not re.fullmatch(r'[a-f0-9]{32}', version): raise HTTPException(422,'Version invalide.')
    meta = read(engine.state/'versions'/version/'studio_version.json')
    if not meta or (model and meta['model']!=model): raise HTTPException(404,'Version introuvable pour ce modèle.')
    if not read(engine.state/'versions'/version/'fused'/MODELS[meta['model']]['release']/'export_manifest.json'):
        raise HTTPException(409,'La version n’est pas encore exportée.')
    return meta

@app.get('/api/catalog')
def catalog():
    versions=[]
    for path in (engine.state/'versions').glob('*/studio_version.json'):
        meta=read(path); root=path.parent; spec=MODELS[meta['model']]
        meta['available']=bool(read(root/'fused'/spec['release']/'export_manifest.json'))
        meta['evaluation']=read(root/'reports/comparison.json')
        meta['code_metrics']=read(root/'reports/code_comparison.json', {})
        if meta['model']=='code' and not meta['code_metrics']: meta['evaluation']=None
        versions.append(meta)
    return {'models':[model_info(m) for m in MODELS], 'versions':versions, 'local':True, 'feedback_count':len(list((engine.state/'feedback').glob('*.json')))}

@app.get('/api/jobs')
def jobs():
    with engine.lock: return sorted(engine.jobs.values(), key=lambda j:j['created'], reverse=True)

@app.get('/api/jobs/{ident}')
def detail(ident: str): return engine.detail(ident)

@app.post('/api/jobs/{ident}/cancel')
def cancel(ident: str): return engine.cancel(ident)

@app.post('/api/chat', status_code=202)
def chat(body: Chat):
    check_model(body.model)
    if not body.question.strip(): raise HTTPException(422,'Écrivez une question.')
    if body.version: check_version(body.version,body.model)
    if any(m.get('role') not in ('user','assistant') or len(m.get('content',''))>6000 for m in body.history):
        raise HTTPException(422,'Historique invalide.')
    return engine.create('chat', body.model, question=body.question.strip(), version=body.version, history=body.history)

class MedicalTranslation(BaseModel):
    job_id: str = Field(pattern=r'^[a-f0-9]{32}$')

@app.post('/api/medical/translate', status_code=202)
def translate_medical(body: MedicalTranslation):
    check_model('medical')
    with engine.lock:
        original=engine.get(body.job_id)
        if original['kind']!='chat' or original['model']!='medical' or original['status']!='completed':
            raise HTTPException(409,'Choisissez une réponse médicale terminée.')
        path=engine.state/body.job_id/'result.json'
        try:
            raw=path.read_bytes();result=json.loads(raw)
            from medical_translation import selected_sources, revision
            selected_sources(result)
        except (OSError,ValueError,KeyError,TypeError) as exc:
            raise HTTPException(409,'Cette réponse ne peut pas être traduite : '+str(exc)) from exc
        fingerprint=hashlib.sha256(raw).hexdigest();translator_revision=revision()
        for job in sorted(engine.jobs.values(),key=lambda j:j['created'],reverse=True):
            if (job['kind']=='translate' and job.get('source_job')==body.job_id and
                job.get('source_result_sha256')==fingerprint and job.get('translation_revision')==translator_revision and job['status'] in ('queued','running','completed')):
                return engine.detail(job['id'])
        job=engine.create('translate','medical',source_job=body.job_id,source_result_sha256=fingerprint,
                          translation_revision=translator_revision,name='Traduction française',question=original['question'])
        return job

class MedicalDocument(BaseModel):
    book_id: int | None = Field(default=None,gt=0)
    source_id: str | None = Field(default=None,min_length=1,max_length=80)

def medical_snapshot_path(source_id):
    root=HOME/'Projets/LibraryBrainMedical'
    docs=read(root/'data/source_manifest.json',{}).get('documents',[])
    doc=next((d for d in docs if d['id']==source_id),None)
    if not doc:raise HTTPException(404,'Publication médicale introuvable.')
    path=Path(doc['pdf_path']).resolve()
    if not path.is_relative_to((root/'snapshots').resolve()) or path.suffix.lower()!='.pdf' or not path.is_file():raise HTTPException(404,'PDF vérifié indisponible.')
    if sha(path)!=doc['pdf_sha256']:raise HTTPException(409,'Le PDF a changé depuis sa vérification.')
    return path

def medical_document_path(book_id):
    import sqlite3
    with sqlite3.connect((HOME/'library_brain.db').as_uri()+'?mode=ro',uri=True) as conn:
        row=conn.execute('SELECT file_path FROM books WHERE id=? AND category IN (?,?,?)',
            (book_id,'Santé','Mèdecine','Pédiatrie')).fetchone()
    if not row:raise HTTPException(404,'Document médical introuvable.')
    path=Path(row[0]).resolve()
    if not path.is_file() or path.suffix.lower() not in ('.pdf','.epub','.md','.txt'):
        raise HTTPException(404,'Document local indisponible.')
    return path

@app.post('/api/medical/open-document')
def open_medical_document(body: MedicalDocument):
    if (body.book_id is None)==(body.source_id is None):raise HTTPException(422,'Précisez un seul identifiant de document.')
    path=medical_document_path(body.book_id) if body.book_id is not None else medical_snapshot_path(body.source_id)
    subprocess.run(['open',str(path)],check=True,timeout=10)
    return {'opened':True,'name':path.name}

class MedicalEvaluationReport(BaseModel):
    version: str = 'v3'

@app.post('/api/medical/open-evaluation')
def open_medical_evaluation(body: MedicalEvaluationReport = MedicalEvaluationReport()):
    if body.version not in ('v3','v4','v5','v6','v7','v8'):raise HTTPException(422,'Version de rapport inconnue.')
    date='20260912' if body.version=='v8' else '20260911'
    path=HOME/f'Projets/LibraryBrainMedical/reports/evaluation-medicale-{body.version}-{date}.html'
    if not path.is_file():raise HTTPException(404,'Le rapport médical n’est pas encore disponible.')
    subprocess.run(['open',str(path)],check=True,timeout=10)
    return {'opened':True,'name':path.name}

@app.post('/api/train', status_code=202)
def train(body: Training):
    check_model(body.model)
    if MODELS[body.model].get('supports_training') is False:
        raise HTTPException(409, 'Ce profil spécialisé se compare et se prépare dans son projet dédié. L’entraînement générique du Studio est désactivé.')
    if shutil.disk_usage(engine.state).free < 8*1024**3: raise HTTPException(409,'Au moins 8 Go libres sont nécessaires pour cette version.')
    return engine.create('train', body.model, name=body.name.strip(), iterations=body.iterations)

@app.post('/api/evaluate', status_code=202)
def evaluate(body: Evaluation):
    meta=check_version(body.version)
    with engine.lock:
        for j in engine.jobs.values():
            if j['kind']=='evaluate' and j.get('version')==body.version and j['status'] in ('queued','running'):
                raise HTTPException(409,'Cette évaluation est déjà en cours.')
    return engine.create('evaluate',meta['model'],version=body.version)

@app.post('/api/feedback')
def feedback(body: Feedback):
    job=engine.get(body.job)
    if job['kind']!='chat' or job['status']!='completed': raise HTTPException(409,'Attendez la réponse complète.')
    result=read(engine.state/body.job/'result.json')
    if not result: raise HTTPException(409,'Réponse introuvable.')
    ident=uuid.uuid4().hex
    write(engine.state/'feedback'/f'{ident}.json',{'id':ident,'model':job['model'],'question':job['question'],'answer':result,'correction':body.correction,'status':'pending_review','created':time.time()})
    return {'id':ident,'status':'pending_review'}

@app.get('/{path:path}')
def frontend(path: str):
    dist=HERE.parent/'dist'; target=(dist/path).resolve()
    if not target.is_relative_to(dist.resolve()): raise HTTPException(404)
    if target.is_file(): return FileResponse(target)
    if path.startswith('api/'): raise HTTPException(404)
    return FileResponse(dist/'index.html')

if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=8018)
