"""Exercise Studio contracts without local models, private documents or GPU access.

The synthetic reader supplies only the interface used by the presentation layer.
These tests do not evaluate retrieval, clinical accuracy or translation quality.
"""
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


def unavailable(*args, **kwargs):
    raise AssertionError('A portable test must mock model inference explicitly.')


def render(sources):
    return '\n\n'.join(
        '**'+s['title']+'**\n\n'+'\n'.join('> '+line for line in s['text'].splitlines())
        for s in sources
    )


def main():
    reader=types.ModuleType('medical_v8')
    reader.MODEL='synthetic-reader-for-contract-tests'
    reader.BASE=Path('/unused-test-model')
    reader.render=render
    reader.llm=unavailable
    reader.answer=unavailable
    modules=['test_server','test_code_context','test_models','test_query_plan','test_legal_corpus',
             'test_medical_translation','test_medical_french_default']
    with patch.dict(sys.modules,{'medical_v8':reader}):
        suite=unittest.defaultTestLoader.loadTestsFromNames(modules)
        result=unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__=='__main__':sys.exit(main())
