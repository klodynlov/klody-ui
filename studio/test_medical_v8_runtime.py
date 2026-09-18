import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import medical_documentary_v8_model as model
import medical_v8_runtime as runtime
import server


class MedicalV8RuntimeTests(unittest.TestCase):
    def test_shared_updates_do_not_disable_reader_but_snapshot_tampering_does(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            live = root / 'shared/klody_memory/retriever.py'
            live.parent.mkdir(parents=True)
            live.write_text('evaluated code')
            with patch.object(runtime, 'LIBRARY_ROOT', root / 'shared'):
                frozen = runtime.runtime_path(root, live)
                frozen.parent.mkdir(parents=True)
                frozen.write_bytes(live.read_bytes())
                data = {'activation_allowed': True, 'adapter_path': None,
                        'artifact_sha256': {}, 'base_model_path': str(root),
                        'model_files': [], 'runtime_artifacts': {str(live): model.sha(live)}}
                profile = root / model.PROFILE
                profile.parent.mkdir(parents=True)
                profile.write_text(json.dumps(data))
                with patch.object(model, 'PROFILE_SHA', model.sha(profile)):
                    live.write_text('later LibraryBrain change')
                    self.assertTrue(model.profile(root, require_activation=False)['activation_allowed'])
                    frozen.write_text('changed frozen code')
                    with self.assertRaisesRegex(ValueError, 'Composant de recherche modifié'):
                        model.profile(root, require_activation=False)
                    frozen.unlink()
                    with self.assertRaises(FileNotFoundError):
                        model.profile(root, require_activation=False)

    def test_worker_imports_evaluated_files_even_when_shared_path_is_first(self):
        script = '''
import json,sys
from pathlib import Path
from medical_documentary_v8_model import profile
root=Path.home()/'Projets/LibraryBrainMedical'
p=profile(root)
sys.path.insert(0,str(Path.home()/'library-brain'))
import klody_memory,klody_memory.retriever,klody_memory.generator
from core import config
expected=root/'runtime/reader-v8/library-brain'
for module in [klody_memory,klody_memory.retriever,klody_memory.generator,config]:
    assert Path(module.__file__).is_relative_to(expected),module.__file__
assert config.get_config().db_path == Path.home()/'library_brain.db'
print('isolated imports and live user configuration verified')
'''
        result = subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).parent,
                                text=True, capture_output=True, timeout=40)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_catalog_verification_does_not_install_import_hooks(self):
        before = list(sys.meta_path)
        self.assertTrue(server.model_info('medical')['available'])
        self.assertEqual(before, sys.meta_path)

    def test_conflicting_loaded_runtime_is_rejected(self):
        from types import SimpleNamespace
        root = Path('/tmp/medical-runtime-test')
        original = runtime.LIBRARY_ROOT / 'klody_memory/__init__.py'
        with patch.dict(sys.modules, {'klody_memory': SimpleNamespace(__file__=str(original))}):
            with self.assertRaisesRegex(ValueError, 'déjà chargée hors du runtime V8'):
                runtime.activate_runtime(root, {'runtime_artifacts': {str(original): 'unused'}})

    def test_unavailable_model_explains_actual_blocker_and_does_not_queue(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = server.Engine(folder)
            with patch.object(server, 'engine', engine), patch.object(server, 'model_info',
                    return_value={'available': False, 'availability_error': 'Composant de recherche modifié : test.py'}):
                response = TestClient(server.app).post('/api/chat', headers={'X-Klody-Studio': '1'},
                                                       json={'model': 'medical', 'question': 'hernie'})
                self.assertEqual(response.status_code, 409)
                self.assertIn('Composant de recherche modifié', response.json()['detail'])
                self.assertEqual(engine.jobs, {})
