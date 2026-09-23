import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import wave
import zipfile

from fastapi.testclient import TestClient
import music_files as files
import server as s

HEADERS = {'X-Klody-Studio': '1', 'Origin': 'http://127.0.0.1:8018'}


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = s.Engine(self.temp.name)
        self.patch = patch.object(s, 'engine', self.engine); self.patch.start()
        self.python_patch = patch.object(s, 'PYTHON', Path(sys.executable))
        self.python_patch.start()
        self.addCleanup(self.python_patch.stop)
        self.client = TestClient(s.app, headers=HEADERS)
        self.project = self.client.post('/api/music/projects', json={'title': 'Import test'}).json()

    def tearDown(self):
        self.patch.stop(); self.temp.cleanup()

    def upload(self, content, filename='brief.txt', project=None):
        return self.client.post('/api/music/projects/'+(project or self.project)['id']+'/assets',
                                params={'filename': filename}, content=content,
                                headers={'Content-Type': 'application/octet-stream'})

    def finish_import(self, response):
        self.assertEqual(response.status_code, 202, response.text)
        asset = response.json(); job = self.engine.jobs[asset['job_id']]
        files.import_asset({**job, 'state': self.temp.name})
        self.engine.update(job['id'], status='completed')
        return asset

    def test_text_import_citations_snapshot_download_and_isolation(self):
        text = 'Le refrain doit rester intime. Le piano répond à la voix. Décision : supprimer le pad.'
        asset = self.finish_import(self.upload(text.encode()))
        self.assertEqual(asset['sha256'], hashlib.sha256(text.encode()).hexdigest())
        repeated = self.upload(text.encode()).json()
        self.assertEqual(repeated['id'], asset['id'])
        evidence = files.project_evidence(self.engine, self.project['id'], 'Quelle décision pour le pad ?')
        self.assertEqual(evidence['sources'][0]['text'], text)
        self.assertEqual(evidence['sources'][0]['id'], 'D1')
        other = self.client.post('/api/music/projects', json={'title': 'Autre'}).json()
        self.assertEqual(files.project_evidence(self.engine, other['id'], 'pad')['sources'], [])
        path = '/api/music/projects/'+self.project['id']+'/assets/'+asset['id']+'/file'
        self.assertEqual(self.client.get(path).content, text.encode())
        self.assertEqual(self.client.get(path.replace(self.project['id'], other['id'])).status_code, 404)
        self.assertEqual(self.client.get('/api/music/projects/'+self.project['id']+'/conversation').json(), [])
        job = self.client.post('/api/music/chat', json={'project_id': self.project['id'], 'mode': 'documents',
                'question': 'Quelle décision pour le pad ?', 'request_id': 'e'*32}).json()
        self.assertEqual(job['music_evidence']['sources'][0]['text'], text)
        self.assertEqual(job['history'], [])
        exported = self.client.get('/api/music/projects/'+self.project['id']+'/export')
        self.assertEqual(exported.status_code, 200)
        self.assertIn('brief.txt', exported.text)

    def test_limits_and_failed_import_do_not_destroy_original(self):
        self.assertEqual(self.upload(b'hello', 'unsafe.exe').status_code, 422)
        self.assertEqual(self.upload(b'').status_code, 422)
        with patch.object(files, 'MAX_BYTES', 4):
            self.assertEqual(self.upload(b'12345').status_code, 413)
        response = self.upload(b'not a pdf', '../../brief.pdf')
        asset = response.json(); job = self.engine.jobs[asset['job_id']]
        with self.assertRaises(Exception):
            files.import_asset({**job, 'state': self.temp.name})
        folder = files.asset_folder(self.temp.name, asset['id'])
        self.assertEqual((folder/'original.pdf').read_bytes(), b'not a pdf')
        self.assertIn('error', files.read(folder/'analysis.json'))
        self.assertEqual(asset['name'], 'brief.pdf')

    def test_known_audio_is_measured_without_changing_samples(self):
        sample_rate = 48000; seconds = 4
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as audio:
            audio.setparams((1, 2, sample_rate, 0, 'NONE', 'not compressed'))
            audio.writeframes(b''.join(struct.pack('<h', int(3276*math.sin(2*math.pi*440*i/sample_rate))) for i in range(sample_rate*seconds)))
        original = buffer.getvalue()
        asset = self.finish_import(self.upload(original, 'tone.wav'))
        result = files.read(files.asset_folder(self.temp.name, asset['id'])/'analysis.json')
        self.assertAlmostEqual(result['duration_seconds'], 4, places=2)
        self.assertAlmostEqual(result['true_peak_dbtp'], -20, delta=.3)
        self.assertTrue(-30 < result['integrated_lufs'] < -15)
        self.assertEqual(result['channels'], 1)
        self.assertEqual((files.asset_folder(self.temp.name, asset['id'])/'original.wav').read_bytes(), original)
        evidence = files.project_evidence(self.engine, self.project['id'], 'Quelles mesures ?')
        self.assertEqual(evidence['sources'][0]['id'], 'A1')
        self.assertNotIn('bpm', result)

    def test_docx_and_pdf_extract_real_text(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Conserver la voix proche.</w:t></w:r></w:p></w:body></w:document>')
        docx = self.finish_import(self.upload(buffer.getvalue(), 'brief.docx'))
        self.assertIn('voix proche', files.read(files.asset_folder(self.temp.name, docx['id'])/'analysis.json')['chunks'][0]['text'])
        stream = b'BT /F1 12 Tf 40 740 Td (Un refrain ouvert, une voix proche.) Tj ET'
        objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
                   b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
                   b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
        pdf = b'%PDF-1.4\n'; offsets = [0]
        for i, obj in enumerate(objects, 1):
            offsets.append(len(pdf)); pdf += str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        xref = len(pdf); pdf += b'xref\n0 6\n0000000000 65535 f \n'
        pdf += b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets[1:])
        pdf += b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
        asset = self.finish_import(self.upload(pdf, 'brief.pdf'))
        result = files.read(files.asset_folder(self.temp.name, asset['id'])/'analysis.json')
        self.assertIn('refrain ouvert', result['chunks'][0]['text'])
        self.assertEqual(result['chunks'][0]['page'], 1)

    def test_preferences_are_explicit_revisioned_and_snapshotted(self):
        response = self.client.post('/api/music/preferences', json={'instructions': 'Réponds brièvement. Ableton Live.', 'revision': 0})
        self.assertEqual(response.json()['revision'], 1)
        self.assertEqual(self.client.post('/api/music/preferences', json={'instructions': 'Ancienne fenêtre', 'revision': 0}).status_code, 409)
        job = self.client.post('/api/music/chat', json={'project_id': self.project['id'], 'mode': 'balance',
            'question': 'Propose un essai.', 'request_id': 'f'*32}).json()
        self.assertEqual(job['music_preferences'], 'Réponds brièvement. Ableton Live.')

    def test_import_runs_through_actual_serial_engine_process(self):
        self.engine.start()
        try:
            response = self.upload(b'Le refrain garde une voix proche.', 'integration.txt')
            self.assertEqual(response.status_code, 202)
            job_id = response.json()['job_id']
            for _ in range(50):
                if self.engine.get(job_id)['status'] not in ('queued', 'running'):
                    break
                time.sleep(.1)
            self.assertEqual(self.engine.get(job_id)['status'], 'completed', self.engine.detail(job_id))
            evidence = files.project_evidence(self.engine, self.project['id'], 'refrain')
            self.assertIn('voix proche', evidence['sources'][0]['text'])
        finally:
            self.engine.close()


if __name__ == '__main__':
    unittest.main()
