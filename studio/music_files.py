"""Private, bounded project imports. Originals are immutable and never sent online."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import time
import unicodedata
import uuid
import xml.etree.ElementTree as ET
import zipfile

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, Response

MAX_BYTES = 60 * 1024 * 1024
DOCS = {'.txt', '.md', '.pdf', '.docx'}
AUDIO = {'.wav', '.mp3', '.m4a', '.flac', '.aiff', '.aif', '.ogg'}


def program(name):
    return shutil.which(name) or (str(Path('/opt/homebrew/bin')/name) if (Path('/opt/homebrew/bin')/name).is_file() else None)


def read(path, fallback=None):
    return json.loads(path.read_text()) if path.exists() else fallback


def write(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def asset_folder(state, ident):
    if not re.fullmatch(r'[a-f0-9]{32}', ident):
        raise ValueError('Identifiant de fichier invalide.')
    return Path(state) / 'music-assets' / ident


def asset_record(state, ident, project_id):
    folder = asset_folder(state, ident)
    asset = read(folder / 'asset.json')
    if not asset or asset['project_id'] != project_id:
        raise ValueError('Fichier introuvable dans ce projet.')
    return folder, asset


def project_assets(engine, project_id):
    result = []
    for file in (engine.state/'music-assets').glob('*/asset.json'):
        asset = read(file)
        if asset['project_id'] != project_id:
            continue
        analysis = read(file.parent/'analysis.json', {})
        job = engine.jobs.get(asset.get('job_id'), {})
        result.append({**asset, 'status': job.get('status', 'failed'),
                       'error': analysis.get('error') or job.get('error'),
                       'analysis': {k: v for k, v in analysis.items() if k != 'chunks'}})
    return sorted(result, key=lambda a: a['created'])


def extract_document(path):
    truncated = False
    if path.suffix == '.pdf':
        tool = program('pdftotext')
        if not tool:
            raise ValueError('La lecture PDF locale nécessite pdftotext.')
        output = path.with_name('extracted.txt')
        subprocess.run([tool, '-f', '1', '-l', '100', '-layout', '-enc', 'UTF-8', str(path), str(output)],
                       timeout=40, check=True, capture_output=True)
        with output.open() as stream:
            text = stream.read(200001)
        truncated = len(text) > 200000
        pages = text[:200000].split('\f')
        coverage = '100 premières pages au maximum ; texte disponible uniquement, sans OCR.'
    elif path.suffix == '.docx':
        with zipfile.ZipFile(path) as archive:
            entry = archive.getinfo('word/document.xml')
            if entry.file_size > 8 * 1024 * 1024:
                raise ValueError('Le texte décompressé du document dépasse la limite locale.')
            root = ET.fromstring(archive.read(entry))
        paragraphs = [''.join(p.itertext()) for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')]
        text = '\n\n'.join(paragraphs)
        truncated = len(text) > 200000
        pages = [text[:200000]]
        coverage = 'Texte des paragraphes DOCX ; images, commentaires et mise en page exclus.'
    else:
        text = path.read_text(encoding='utf-8-sig')
        truncated = len(text) > 200000
        pages = [text[:200000]]
        coverage = 'Texte UTF-8.'
    chunks = []
    for page, text in enumerate(pages, 1):
        for start in range(0, len(text), 1000):
            excerpt = text[start:start+1000].strip()
            if excerpt:
                chunks.append({'page': page if path.suffix == '.pdf' else None,
                               'passage': len(chunks)+1, 'text': excerpt})
    if not chunks:
        raise ValueError('Aucun texte exploitable. Pour un PDF scanné, ajoutez une version contenant du texte.')
    return {'kind': 'document', 'chunks': chunks, 'passages': len(chunks),
            'characters': sum(len(c['text']) for c in chunks), 'truncated': truncated,
            'coverage': coverage + (' Lecture limitée à 200 000 caractères.' if truncated else '')}


def measure_audio(path):
    ffprobe, ffmpeg = program('ffprobe'), program('ffmpeg')
    if not ffprobe or not ffmpeg:
        raise ValueError('L’analyse audio locale nécessite FFmpeg.')
    probe = subprocess.run([ffprobe, '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,flac,aiff,ogg', '-select_streams', 'a:0',
                            '-show_entries', 'format=duration:stream=sample_rate,channels,codec_name', '-of', 'json', str(path)],
                           capture_output=True, text=True, timeout=20, check=True)
    meta = json.loads(probe.stdout)
    if not meta.get('streams'):
        raise ValueError('Ce fichier ne contient pas de piste audio lisible.')
    duration = float(meta['format']['duration'])
    if not math.isfinite(duration) or not 0 < duration <= 900:
        raise ValueError('Ajoutez un extrait audio de 15 minutes au maximum.')
    measured = subprocess.run([ffmpeg, '-nostdin', '-hide_banner', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,flac,aiff,ogg',
                               '-i', str(path), '-map', '0:a:0', '-vn', '-af',
                               'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                              capture_output=True, text=True, timeout=120, check=True)
    block = re.search(r'\{\s*"input_i"[\s\S]*?\}', measured.stderr)
    if not block:
        raise ValueError('La mesure de sonie n’a pas abouti.')
    values = json.loads(block.group())
    def finite(key):
        value = float(values[key])
        return value if math.isfinite(value) else None
    stream = meta['streams'][0]
    return {'kind': 'audio', 'duration_seconds': round(duration, 3), 'sample_rate': int(stream['sample_rate']),
            'channels': stream['channels'], 'codec': stream['codec_name'],
            'integrated_lufs': finite('input_i'), 'true_peak_dbtp': finite('input_tp'), 'loudness_range_lu': finite('input_lra'),
            'measurement': 'FFmpeg loudnorm, mesures input ; fichier original inchangé.',
            'limitations': 'Mesures globales uniquement. Aucun BPM, tonalité, instrument ou jugement musical déduit.'}


def import_asset(job):
    folder, asset = asset_record(job['state'], job['music_asset_id'], job['music_project_id'])
    path = folder / ('original' + asset['extension'])
    try:
        with path.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != asset['sha256']:
                raise ValueError('Le fichier importé a changé.')
        result = measure_audio(path) if asset['kind'] == 'audio' else extract_document(path)
        write(folder/'analysis.json', result)
    except Exception as exc:
        write(folder/'analysis.json', {'error': 'Import non terminé : ' + str(exc)})
        raise


def project_evidence(engine, project_id, question):
    def words(text):
        text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
        return set(re.findall(r'[a-z]{4,}', text)) - {'dans', 'pour', 'avec', 'quelle', 'quelles', 'comment', 'document', 'fichier'}
    query = words(question)
    candidates, sources, overview = [], [], []
    for asset in project_assets(engine, project_id):
        if asset['status'] != 'completed':
            continue
        folder = asset_folder(engine.state, asset['id'])
        result = read(folder/'analysis.json', {})
        overview.append({'name': asset['name'], 'kind': asset['kind'], 'coverage': result.get('coverage', result.get('limitations'))})
        if asset['kind'] == 'audio':
            if sum(s['id'].startswith('A') for s in sources) >= 3:
                continue
            sources.append({'id': f"A{sum(s['id'].startswith('A') for s in sources)+1}", 'title': asset['name'],
                            'author': 'Mesures locales FFmpeg', 'page': None, 'asset_id': asset['id'], 'sha256': asset['sha256'],
                            'text': json.dumps(result, ensure_ascii=False)})
        else:
            for chunk in result.get('chunks', []):
                score = len(query & words(chunk['text'])) + (3 if words(asset['name']) & query else 0)
                candidates.append((score, asset, chunk))
    ranked = sorted(candidates, key=lambda entry: -entry[0])
    selected, seen_files, seen_passages = [], set(), set()
    for candidate in ranked:
        _, asset, chunk = candidate
        if asset['id'] not in seen_files and len(selected) < 10:
            selected.append(candidate); seen_files.add(asset['id']); seen_passages.add((asset['id'], chunk['passage']))
    for candidate in ranked:
        _, asset, chunk = candidate
        if (asset['id'], chunk['passage']) not in seen_passages and len(selected) < 10:
            selected.append(candidate); seen_passages.add((asset['id'], chunk['passage']))
    for i, (_, asset, chunk) in enumerate(selected, 1):
        sources.append({'id': f'D{i}', 'title': asset['name'], 'author': 'Document du projet', 'page': chunk['page'],
                        'passage': chunk['passage'], 'asset_id': asset['id'], 'sha256': asset['sha256'], 'text': chunk['text']})
    return {'sources': sources, 'files': overview,
            'coverage': f'{len(selected)} passages sélectionnés sur {len(candidates)} ; au maximum 3 analyses audio.'}


def register_routes(app, get_engine, project_loader):
    def owned(engine, project_id, asset_id):
        project_loader(engine, project_id)
        try:
            return asset_record(engine.state, asset_id, project_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.get('/api/music/projects/{ident}/assets')
    def assets(ident: str):
        engine = get_engine()
        with engine.lock:
            project_loader(engine, ident)
            return project_assets(engine, ident)

    @app.post('/api/music/projects/{ident}/assets', status_code=202)
    async def upload(ident: str, request: Request, filename: str):
        engine = get_engine()
        with engine.lock:
            project_loader(engine, ident)
            if len(project_assets(engine, ident)) >= 30:
                raise HTTPException(409, 'Ce dossier contient déjà 30 fichiers. Créez un autre projet.')
        name = Path(filename.replace('\\', '/')).name[:180]
        extension = Path(name).suffix.lower()
        if extension not in DOCS | AUDIO:
            raise HTTPException(422, 'Formats : PDF texte, DOCX, TXT, MD ; WAV, MP3, M4A, FLAC, AIFF, OGG.')
        asset_id = uuid.uuid4().hex
        folder = asset_folder(engine.state, asset_id); folder.mkdir(parents=True)
        path = folder/('original'+extension)
        size = 0; digest = hashlib.sha256()
        try:
            with path.open('xb') as stream:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, 'Fichier trop volumineux : 60 Mo maximum.')
                    stream.write(chunk); digest.update(chunk)
            if not size:
                raise HTTPException(422, 'Le fichier est vide.')
            with engine.lock:
                for previous in project_assets(engine, ident):
                    if previous['sha256'] == digest.hexdigest() and previous['status'] in ('queued', 'running', 'completed'):
                        shutil.rmtree(folder)
                        return previous
                asset = {'id': asset_id, 'project_id': ident, 'name': name, 'extension': extension,
                         'kind': 'audio' if extension in AUDIO else 'document', 'bytes': size,
                         'sha256': digest.hexdigest(), 'created': time.time()}
                job = engine.create('music_import', 'music', name='Import : '+name, music_project_id=ident, music_asset_id=asset_id)
                asset['job_id'] = job['id']
                write(folder/'asset.json', asset)
            return {**asset, 'status': 'queued'}
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise

    @app.get('/api/music/projects/{ident}/assets/{asset_id}/file')
    def original_file(ident: str, asset_id: str):
        engine = get_engine()
        with engine.lock:
            folder, asset = owned(engine, ident, asset_id)
        return FileResponse(folder/('original'+asset['extension']), filename=asset['name'], media_type='application/octet-stream')

    @app.get('/api/music/projects/{ident}/export')
    def export(ident: str):
        engine = get_engine()
        with engine.lock:
            _, project = project_loader(engine, ident)
            lines = ['# '+project['title'], '', 'Dossier musical local — propositions à vérifier à l’écoute.', '']
            for label, key in [('Style', 'style'), ('Tempo déclaré à la noire', 'bpm'), ('Mesure', 'meter'), ('Tonalité déclarée', 'key'), ('Intention', 'goal'), ('Contexte et décisions', 'notes')]:
                if project.get(key):
                    lines.extend(['## '+label, '', str(project[key]), ''])
            for asset in project_assets(engine, ident):
                lines.extend(['## Fichier : '+asset['name'], '', 'État : '+asset['status'], '', json.dumps(asset['analysis'], ensure_ascii=False, indent=2), ''])
            for job in sorted(engine.jobs.values(), key=lambda j: j['created']):
                if job.get('music_project_id') != ident or job['kind'] != 'chat':
                    continue
                result = engine.detail(job['id']).get('result') or {}
                lines.extend(['## Demande', '', job['question'], '', '### Réponse', '', result.get('answer') or job['status'], ''])
                if job.get('music_mode') == 'structure' and result.get('answer') and not result.get('duration_policy'):
                    lines.extend(['Attention : réponse antérieure au contrôle des durées ; ses conversions en secondes ne sont pas vérifiées.', ''])
                if result.get('duration_reference'):
                    lines.extend(['Repères calculés : '+json.dumps(result['duration_reference'], ensure_ascii=False), ''])
                for source in result.get('sources', []):
                    lines.extend([f"[{source['id']}] {source['title']} — {source.get('author', '')}" + (f" — p. {source['page']}" if source.get('page') else ''), source['text'], ''])
        return Response('\n'.join(lines), media_type='text/markdown; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="dossier-musique.md"'})
