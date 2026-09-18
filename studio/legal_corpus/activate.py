"""Activate a completed edition atomically, retaining the previous pointer."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

from .download import sha, write_json


def activate(root, folder):
    root,folder=Path(root).resolve(),Path(folder).resolve()
    if not folder.is_relative_to(root/'corpora'):
        raise ValueError('Edition must be inside the project corpora directory')
    report=json.loads((folder/'coverage.json').read_text())
    if report['code_count']!=report['expected_codes'] or not report['articles'] or not report['decisions']:
        raise ValueError('Code coverage or decision corpus incomplete; inspect coverage.json')
    archives=json.loads((folder/'archives.json').read_text())['archives']
    admin=folder/'administrative-archives.json'
    if admin.is_file():archives+=json.loads(admin.read_text())['archives']
    financial=folder/'financial-archives.json'
    if financial.is_file():archives+=json.loads(financial.read_text())['archives']
    with sqlite3.connect((folder/'index.sqlite').as_uri()+'?mode=ro',uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise ValueError('Index integrity check failed')
        applied=dict(db.execute('SELECT name,sha256 FROM applied'))
        if any(applied.get(a['name'])!=a['sha256'] for a in archives):
            raise ValueError('Unapplied or changed archive')
        counts=dict(db.execute('SELECT kind,count(*) FROM documents GROUP BY kind'))
        if counts.get('code')!=report['articles'] or counts.get('decision')!=report['decisions']:
            raise ValueError('Coverage does not describe this index')
        for table in ('passages','search'):
            if db.execute('SELECT count(*) FROM '+table).fetchone()[0]!=report['passages']:
                raise ValueError('Passage search index is incomplete')
    pointer=root/'data/active_corpus.json'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup=root/'snapshots'/('corpus-pointer-'+stamp+'.json')
    backup.parent.mkdir(parents=True,exist_ok=True)
    write_json(backup,dict(previous=json.loads(pointer.read_text()) if pointer.exists() else None,
                           legacy_corpus='data/index.sqlite'))
    selected=dict(relative_path=str(folder.relative_to(root)),activated_at=stamp,
                  coverage_sha256=sha(folder/'coverage.json'),index_sha256=sha(folder/'index.sqlite'),
                  previous_pointer=str(backup.relative_to(root)),adapter_changed=False)
    write_json(pointer,selected)
    return selected


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--edition',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(activate(args.root,args.edition),indent=2))
