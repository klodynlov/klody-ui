"""Acquire every monthly ZIP linked by the official administrative portal."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urljoin
from urllib.request import urlopen
import xml.etree.ElementTree as ET
import zipfile

from .download import download, write_json, sha
from .build import content, value, MAX_XML

BASE = 'https://opendata.justice-administrative.fr/'


def acquire(output):
    raw = output / 'raw-administrative'
    raw.mkdir(parents=True,exist_ok=True)
    archives=[]
    for fund in ('DCE','DCA','DTA'):
        listing=urlopen(BASE+fund+'/',timeout=60).read().decode('utf-8-sig')
        (raw/(fund+'-listing.html')).write_text(listing)
        for href in re.findall(r'href="([^"]+\.zip)"',listing):
            if not re.fullmatch(r'/'+fund+r'/\d{4}/\d{2}/[A-Z]+_\d{6}\.zip',href):
                raise ValueError('Unexpected archive link')
            archives.append(dict(fund=fund,name=Path(href).name,url=urljoin(BASE,href)))
    write_json(output/'administrative-plan.json',dict(archives=archives,inventoried_at=datetime.now(timezone.utc).isoformat()))
    complete=[]
    with ThreadPoolExecutor(max_workers=2) as pool:
        for f in as_completed([pool.submit(download,r,raw) for r in archives]):
            row=f.result();complete.append(row)
            print(len(complete),'/',len(archives),row['name'],flush=True)
    write_json(output/'administrative-archives.json',dict(archives=sorted(complete,key=lambda r:r['name']),
                inventoried_at=datetime.now(timezone.utc).isoformat()))


def parse_administrative(raw,archive):
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('DTD/entity declarations are not accepted')
    root=ET.fromstring(raw)
    ident=value(root,'.//Identification').removesuffix('.xml')
    court=value(root,'.//Nom_Juridiction')
    code=value(root,'.//Code_Juridiction')
    number=value(root,'.//Numero_Dossier')
    when=value(root,'.//Date_Lecture')
    text=content(root.find('.//Texte_Integral'))
    if not all((ident,court,number,when,text)):
        raise ValueError('Incomplete administrative decision')
    date.fromisoformat(when)
    if code=='CE':
        court='Conseil d’État · '+court
    return dict(id=ident,kind='decision',fund=archive['fund'],source_id=archive['fund'],
                title=court+' · '+when+' · n° '+number,number=number,text=text,outline=court,
                jurisdiction=court,decision_date=when,ecli=value(root,'.//Numero_ECLI'),
                solution=value(root,'.//Solution'),status='published_decision',
                source_url=archive['url'],last_modified=value(root,'.//Date_Mise_Jour'),
                generated_date=archive['retrieved_at'][:10],valid_from='',valid_to='',pages=[],
                xml_sha256=hashlib.sha256(raw).hexdigest(),text_sha256=hashlib.sha256(text.encode()).hexdigest(),
                applicability='not_automatically_established',licence='Etalab-2.0',
                archive=archive['name'],archive_sha256=archive['sha256'],acquired_at=archive['retrieved_at'])


def ingest(db,archive,as_of):
    done=db.execute('SELECT sha256 FROM applied WHERE name=?',(archive['name'],)).fetchone()
    if done:
        if done[0]!=archive['sha256']:
            raise ValueError('Administrative archive changed; use a new snapshot')
        return
    if sha(archive['path'])!=archive['sha256']:
        raise ValueError('Administrative archive digest mismatch')
    count=0
    with db,zipfile.ZipFile(archive['path']) as z:
        for member in z.infolist():
            if member.is_dir() or not member.filename.endswith('.xml'):
                continue
            if member.file_size>MAX_XML:
                raise ValueError('Oversized administrative XML')
            try:
                row=parse_administrative(z.read(member),archive)
            except (ET.ParseError,ValueError) as exc:
                db.execute('INSERT INTO rejected VALUES(?,?,?)',(archive['name'],member.filename,str(exc)))
                continue
            if row['decision_date']>as_of:
                continue
            row['archive_member']=member.filename
            # When ECLI is available, prefer the fuller official open-data
            # record over its selected JADE duplicate (index created once).
            if row['ecli']:
                old=db.execute("SELECT id FROM documents WHERE json_extract(data,'$.ecli')=? AND source_id='JADE'",(row['ecli'],)).fetchall()
                for (ident,) in old:
                    db.execute('DELETE FROM documents WHERE id=?',(ident,))
            db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?,?,?)',
                (row['id'],row['kind'],row['source_id'],row['number'],row['title'],row['decision_date'],json.dumps(row,ensure_ascii=False)))
            count+=1
        db.execute('INSERT INTO applied VALUES(?,?,?)',(archive['name'],archive['sha256'],json.dumps(dict(upserted=count))))
    print(archive['name'],count,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    acquire(parser.parse_args().output)
