import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import server as s
import music_assistant as music

HEADERS = {'X-Klody-Studio': '1', 'Origin': 'http://127.0.0.1:8018'}


class MusicTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = s.Engine(self.temp.name)
        self.patch = patch.object(s, 'engine', self.engine)
        self.patch.start()
        self.client = TestClient(s.app, headers=HEADERS)

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def project(self, title='Morceau A'):
        response = self.client.post('/api/music/projects', json={'title': title, 'style': 'R&B', 'bpm': 90})
        self.assertEqual(response.status_code, 201)
        return response.json()

    def chat(self, project, key='a', question='Propose deux structures.'):
        return self.client.post('/api/music/chat', json={'project_id': project['id'], 'mode': 'structure',
                                                        'question': question, 'request_id': key*32})

    def test_project_survives_new_engine_and_rejects_stale_save(self):
        project = self.project()
        with patch.object(music, 'model_status', return_value={'available': False}), patch.object(s, 'engine', s.Engine(self.temp.name)):
            self.assertEqual(self.client.get('/api/music').json()['projects'][0], project)
        response = self.client.post('/api/music/projects/'+project['id'], json={**project, 'title': 'Version 2'})
        self.assertEqual(response.json()['revision'], 2)
        response = self.client.post('/api/music/projects/'+project['id'], json={**project, 'title': 'Ancienne fenêtre'})
        self.assertEqual(response.status_code, 409)
        self.assertIn('Version 2', (Path(self.temp.name)/'music-projects.json').read_text())

    def test_chat_snapshot_history_isolation_and_idempotency(self):
        a, b = self.project(), self.project('Morceau B')
        response = self.chat(a)
        self.assertEqual(response.status_code, 202)
        job = response.json()
        self.assertEqual(self.chat(a).json()['id'], job['id'])
        self.assertEqual(len(self.engine.jobs), 1)
        self.assertEqual(self.chat(a, 'b').status_code, 409)
        self.engine.update(job['id'], status='completed')
        s.write(Path(self.temp.name)/job['id']/'result.json', {'answer': 'Proposition propre au morceau A.', 'sources': []})
        updated = self.client.post('/api/music/projects/'+a['id'], json={**a, 'goal': 'Nouveau but'}).json()
        self.assertEqual(self.engine.jobs[job['id']]['music_project']['goal'], '')
        followup = self.chat(updated, 'b', 'Développe la seconde version.').json()
        self.assertIn('Proposition propre', followup['history'][1]['content'])
        self.assertEqual(followup['music_project']['revision'], 2)
        other = self.chat(b, 'c').json()
        self.assertEqual(other['history'], [])
        self.assertEqual(len(self.client.get('/api/music/projects/'+b['id']+'/conversation').json()), 1)
        self.assertEqual(len(self.client.get('/api/music/projects/'+a['id']+'/conversation').json()), 2)
        commands = self.engine.commands(followup)
        self.assertEqual(Path(commands[0][1]).name, 'music_worker.py')

    def test_scope_validation_and_private_reads(self):
        self.assertEqual(self.client.post('/api/music/projects', json={'title': '  '}).status_code, 422)
        self.assertEqual(self.client.post('/api/music/projects', json={'title': 'A', 'bpm': 900}).status_code, 422)
        project = self.project()
        payload = {'project_id': project['id'], 'mode': 'diagnostic', 'question': 'bonjour', 'request_id': 'a'*32}
        self.assertEqual(self.client.post('/api/music/chat', json=payload).status_code, 422)
        self.assertEqual(self.client.post('/api/music/chat', json={**payload, 'mode': 'balance', 'question': '  '}).status_code, 422)
        self.assertEqual(self.client.get('/api/music', headers={'Origin': 'https://example.com'}).status_code, 403)
        self.assertEqual(self.client.get('/api/music/projects/missing/conversation').status_code, 404)
        self.assertEqual(self.chat(project).status_code, 202)
        self.assertEqual(self.chat(project, question='Autre question.').status_code, 409)

    def test_sources_fail_closed_when_reference_changes(self):
        import sqlite3
        db = Path(self.temp.name)/'library.db'
        with sqlite3.connect(db) as conn:
            conn.execute('CREATE TABLE chunks(id INTEGER,book_id INTEGER,text TEXT,page INTEGER)')
            conn.execute('INSERT INTO chunks VALUES(509822,2441,"modified",13)')
        with self.assertRaisesRegex(ValueError, 'changé'):
            music.method_context('structure', db)

    def test_durations_use_meter_and_quarter_note_tempo(self):
        timing = music.duration_reference({'bpm': 90, 'meter': '4/4'})
        values = {v['bars']: v['seconds'] for v in timing['values']}
        self.assertEqual(values[24], 64)
        self.assertEqual(values[28], 74.7)
        self.assertEqual(music.duration_reference({'bpm': 90, 'meter': '6/8'})['values'][0]['seconds'], 8)
        self.assertIsNone(music.duration_reference({'bpm': 90}))
        self.assertIsNone(music.duration_reference({'meter': '4/4'}))
        self.assertEqual(music.duration_reference({'bpm': 90, 'notes': 'Mesure 4/4. Piano.'})['meter'], '4/4')
        self.assertIsNone(music.duration_reference({'bpm': 90, 'notes': 'Mon évaluation : 4/4'}))

    def test_sleeping_gateway_model_remains_available_without_loading(self):
        with patch.object(music, 'local_request', return_value={'data': [{'id': music.MODEL, 'running': False}]}) as request:
            status = music.model_status()
            self.assertTrue(status['available'])
            self.assertFalse(status['running'])
            request.assert_called_once_with('/models')
        self.assertEqual(music.ENDPOINT, 'http://127.0.0.1:8090/v1')

    def test_worker_preserves_unverified_status_and_original_sources(self):
        import music_worker
        project = self.project()
        job = self.chat(project).json()
        folder = Path(self.temp.name)/job['id']; folder.mkdir()
        request_path = folder/'request.json'
        request_path.write_text(json.dumps({**job, 'state': self.temp.name}))
        sources = [{'id': 'S1', 'text': 'Original text', 'title': 'Reference'}]
        response = {'choices': [{'message': {'content': 'Voici une hypothèse à essayer [S1].'}, 'finish_reason': 'stop'}]}
        with patch.object(music_worker, 'method_context', return_value=({'id': 'M3'}, sources)), patch.object(music_worker, 'local_request', return_value=response) as request:
            music_worker.run(request_path)
            self.assertEqual(request.call_args.args[0], '/chat/completions')
            self.assertEqual(request.call_args.args[1]['model'], music.MODEL)
        result = json.loads((folder/'result.json').read_text())
        self.assertEqual(result['sources'], sources)
        self.assertFalse(result['audio_analyzed'])
        self.assertEqual(result['confidence']['level'], 'unverified')
        response['choices'][0]['message']['content'] = 'Source inventée [S1, S9].'
        with patch.object(music_worker, 'method_context', return_value=({'id': 'M3'}, sources)), patch.object(music_worker, 'local_request', return_value=response):
            with self.assertRaisesRegex(ValueError, 'référence inconnue'):
                music_worker.run(request_path)
        result = json.loads((folder/'result.json').read_text())
        self.assertEqual(result['phase'], 'failed')
        self.assertEqual(result['answer'], '')

    def test_worker_retries_then_blocks_unverified_numeric_durations(self):
        import music_worker
        job = self.chat(self.project()).json()
        folder = Path(self.temp.name)/job['id']; folder.mkdir()
        request_path = folder/'request.json'
        request_path.write_text(json.dumps({**job, 'state': self.temp.name}))
        response = {'choices': [{'message': {'content': '24 mesures représentent 16 secondes.'}, 'finish_reason': 'stop'}]}
        with patch.object(music_worker, 'method_context', return_value=({'id': 'M3'}, [])), patch.object(music_worker, 'local_request', return_value=response) as request:
            with self.assertRaisesRegex(ValueError, 'durées non vérifiées'):
                music_worker.run(request_path)
            self.assertEqual(request.call_count, 2)
        result = json.loads((folder/'result.json').read_text())
        self.assertEqual(result['answer'], '')
        self.assertEqual(result['phase'], 'failed')


if __name__ == '__main__':
    unittest.main()
