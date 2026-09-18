"""Resolve the evaluated V8 dependencies without following LibraryBrain updates.

The original release profile remains the authority for every SHA-256. Only the
location changes; Studio's frozen worker and the medical artifacts stay pinned.
"""
import importlib.abc
import importlib.util
from pathlib import Path
import sys

LIBRARY_ROOT = Path.home() / 'library-brain'


def runtime_path(root, original):
    original = Path(original)
    if original.is_relative_to(LIBRARY_ROOT):
        return root / 'runtime/reader-v8/library-brain' / original.relative_to(LIBRARY_ROOT)
    return original


class PinnedMedicalRuntime(importlib.abc.MetaPathFinder):
    def __init__(self, modules):
        self.modules = modules

    def find_spec(self, fullname, path=None, target=None):
        source = self.modules.get(fullname)
        if source is not None:
            return importlib.util.spec_from_file_location(fullname, source)
        return None


def activate_runtime(root, profile):
    """Install only in an inference process, after profile verification succeeds."""
    modules = {}
    for original in profile.get('runtime_artifacts', {}):
        original = Path(original)
        if not original.is_relative_to(LIBRARY_ROOT):
            continue
        relative = original.relative_to(LIBRARY_ROOT).with_suffix('')
        parts = relative.parts[:-1] if relative.name == '__init__' else relative.parts
        modules['.'.join(parts)] = runtime_path(root, original).resolve()
    if not modules:
        return
    # Do not replace modules already in use by another consumer in this process.
    for name, expected in modules.items():
        loaded = sys.modules.get(name)
        if loaded is not None and Path(getattr(loaded, '__file__', '')).resolve() != expected:
            raise ValueError('Dépendance médicale déjà chargée hors du runtime V8 : ' + name)
    for finder in sys.meta_path:
        if isinstance(finder, PinnedMedicalRuntime):
            if finder.modules != modules:
                raise ValueError('Un autre runtime médical est déjà chargé.')
            return
    sys.meta_path.insert(0, PinnedMedicalRuntime(modules))
