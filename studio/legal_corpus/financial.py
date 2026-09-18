"""Public historical financial judgments published by Cour des comptes.

Keep the dataset's ODbL licence; these archives do not cover recent judgments.
"""
import argparse
import csv
import io
from datetime import datetime, timezone, timedelta
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import urlopen
import xml.etree.ElementTree as ET
import zipfile

from .build import MAX_XML, value
from .download import download, sha, write_json

DATASETS = {
    '5746d29e88ee385f41d1b934':'CDC', '5afe827cc751df460ad848ca':'CDC',
    '5748310188ee38023ed1b934':'CDBF', '5afe9138c751df5e01834696':'CDBF',
    '5746f8ca88ee382b03d1b934':'CRTC', '5afe926cc751df5fd7484e70':'CRTC',
}
COURTS = {'CDC':'Cour des comptes', 'CDBF':'Cour de discipline budgétaire et financière',
          'CRTC':'Chambres régionales et territoriales des comptes'}
MONTHS = 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre'.split()


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[];self.hidden=0

    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','head'):self.hidden+=1
        if tag in ('p','div','br','tr','li'):self.parts.append('\n')

    def handle_endtag(self,tag):
        if tag in ('script','style','head'):self.hidden=max(0,self.hidden-1)
        if tag in ('p','div','tr','li'):self.parts.append('\n')

    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)


def html_text(raw):
    encoding=re.search(br'charset\s*=\s*["\s]*([\w-]+)',raw[:5000],re.I)
    codec=encoding[1].decode() if encoding else 'utf-8'
    text=raw.decode(codec)
    p=Text();p.feed(text)
    return '\n'.join(line for line in (' '.join(x.split()) for x in ''.join(p.parts).splitlines()) if line)


def office_xml(raw,name):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if z.getinfo(name).file_size>MAX_XML:raise ValueError('Oversized Office XML')
        xml=z.read(name)
    if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():raise ValueError('Unexpected Office DTD/entity')
    return ET.fromstring(xml)


def docx_text(raw):
    root=office_xml(raw,'word/document.xml')
    ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    return '\n'.join(''.join(e.text or '' for e in p.iter(ns+'t')) for p in root.iter(ns+'p'))


def spreadsheet_records(raw):
    ns='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    strings=[''.join(r.itertext()) for r in office_xml(raw,'xl/sharedStrings.xml')]
    rows=[]
    for row in office_xml(raw,'xl/worksheets/sheet2.xml').iter(ns+'row'):
        values={}
        for c in row.findall(ns+'c'):
            v=c.find(ns+'v')
            if v is None:continue
            values[re.sub(r'\d','',c.get('r'))]=strings[int(v.text)] if c.get('t')=='s' else v.text
        rows.append(values)
    if not rows:return []
    headers=rows[0]
    return [{headers[k]:v for k,v in row.items() if k in headers} for row in rows[1:]]


def acquire(output):
    raw=output/'raw-financial';raw.mkdir(parents=True,exist_ok=True)
    archives=[]
    for dataset,fund in DATASETS.items():
        data=json.loads(urlopen('https://www.data.gouv.fr/api/1/datasets/'+dataset+'/',timeout=60).read())
        write_json(raw/(dataset+'.json'),data)
        for resource in data['resources']:
            url=resource['url'];parsed=urlparse(url)
            if parsed.scheme!='https' or parsed.hostname!='static.data.gouv.fr' or not parsed.path.lower().endswith('.zip'):
                raise ValueError('Unexpected financial resource URL')
            name=dataset+'-'+Path(parsed.path).name
            row=dict(name=name,url=url,fund=fund,dataset=dataset,licence=data['license'],
                     metadata='metadonn' in resource['title'].lower(),dataset_title=data['title'])
            archives.append(download(row,raw));print(name,flush=True)
    write_json(output/'financial-archives.json',dict(archives=archives,
               inventoried_at=datetime.now(timezone.utc).isoformat()))


def metadata(archives):
    records={}
    for archive in archives:
        if sha(archive['path'])!=archive['sha256']:raise ValueError('Financial metadata digest mismatch')
        with zipfile.ZipFile(archive['path']) as z:
            for member in z.infolist():
                if '__MACOSX' in member.filename:continue
                if member.filename.lower().endswith('.csv'):
                    if member.file_size>MAX_XML:raise ValueError('Oversized financial CSV')
                    raw=z.read(member)
                    # Some historical .csv files actually contain a spreadsheet;
                    # do not decode a binary container as text.
                    if raw.startswith(b'PK'):
                        for r in spreadsheet_records(raw):
                            name=r.get('Texte intégral','').lower()
                            when=r.get('Date de lecture','') or r.get("Date d'envoi",'')
                            if not name or not when or 'rapport public' in r.get('Titre','').lower():continue
                            when=(datetime(1899,12,30)+timedelta(days=float(when))).date().isoformat()
                            records[name]=dict(id=r['Référence'],number='',title=r.get('Titre',''),
                                jurisdiction=COURTS[archive['fund']],decision_date=when,
                                date_basis='date de lecture' if r.get('Date de lecture') else "date d’envoi")
                        continue
                    try:table=raw.decode('utf-8-sig')
                    except UnicodeDecodeError:table=raw.decode('cp1252')
                    for r in csv.DictReader(io.StringIO(table),delimiter=';'):
                        ident=r.get('Clé DocJF','').strip()
                        when=r.get('Date du document','').strip()
                        if ident and when:
                            records[archive['dataset']+':'+ident]=dict(id='FIN-'+ident,number='',
                                jurisdiction=r.get('Juridiction') or COURTS[archive['fund']],title=r.get('Titre',''),
                                decision_date=datetime.strptime(when,'%d/%m/%Y').date().isoformat(),date_basis='date du document')
                    continue
                if not member.filename.endswith('.xml'):continue
                if member.file_size>MAX_XML:raise ValueError('Oversized financial metadata')
                raw=z.read(member)
                # This historical export declares an unavailable CADIC DTD.
                # Remove only the external declaration; never resolve entities.
                raw=re.sub(br'<!DOCTYPE\s+CADIC\s+SYSTEM\s+"[^"]+"\s*>',b'',raw)
                if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():raise ValueError('Unexpected DTD/entity')
                for r in ET.fromstring(raw).findall('FICHE'):
                    name=value(r,'FT_SFNAME').lower()
                    when=value(r,'DATE_LECTURE') or value(r,'DATE_DOC')
                    if not name or not when:continue
                    record=dict(id=r.get('ID'),number=value(r,'NUMERO_ARPEGES'),
                        jurisdiction=value(r,'JURIDICTION'),title=value(r,'TITRE'),
                        decision_date=datetime.strptime(when,'%d/%m/%Y').date().isoformat(),
                        date_basis='date de lecture' if value(r,'DATE_LECTURE') else 'date du document')
                    records[name]=record
                    if record['number']:records[archive['dataset']+':number:'+record['number']]=record
    return records


def parse_html(raw,member,archive,records):
    text=docx_text(raw) if member.lower().endswith('.docx') else html_text(raw)
    name=Path(member).name
    numeric=re.match(r'A(\d+)',name)
    doc_id=re.match(r'(\d+)-',name)
    row=records.get(name.lower(),{}).copy()
    if not row and numeric:row=records.get(archive['dataset']+':number:'+numeric[1],{}).copy()
    if not row and doc_id:row=records.get(archive['dataset']+':'+doc_id[1],{}).copy()
    if not row:
        # Require an explicit pronouncement/reading date, never a cited law date.
        m=re.search(r'(?:prononc[ée](?:\s+(?:en\s+audience\s+publique|le|du))?|lecture(?:\s+(?:du|le))?)\s*:?\s*(\d{1,2})(?:er)?\s+('+ '|'.join(MONTHS)+r')\s+(\d{4})',text,re.I)
        if not m:raise ValueError('No explicit judgment date or official metadata')
        when=datetime(int(m[3]),MONTHS.index(m[2].lower())+1,int(m[1])).date().isoformat()
        number=re.search(r'(?:arr[êe]t|jugement)\s*n[°ºo]\s*:?\s*([A-Z]?\s*\d[\w /-]*)',text[:5000],re.I)
        row=dict(id='FIN-'+hashlib.sha256(text.encode()).hexdigest()[:24],
                 number=number[1].strip() if number else '',decision_date=when,
                 jurisdiction=COURTS[archive['fund']],title=COURTS[archive['fund']],date_basis='date de prononcé')
    if not text or not row['id']:raise ValueError('Empty financial judgment')
    return dict(row,kind='decision',fund=archive['fund'],source_id=archive['fund'],text=text,
                outline=row['jurisdiction'],ecli='',solution='',status='published_decision',
                source_url=archive['url'],valid_from='',valid_to='',pages=[],
                number_missing=not bool(row['number']),generated_date=archive['retrieved_at'][:10],
                text_sha256=hashlib.sha256(text.encode()).hexdigest(),
                raw_sha256=hashlib.sha256(raw).hexdigest(),licence=archive['licence'],
                applicability='not_automatically_established',archive=archive['name'],
                archive_sha256=archive['sha256'],archive_member=member,acquired_at=archive['retrieved_at'],
                dataset=archive['dataset'])


def ingest_all(db,manifest,as_of):
    archives=manifest['archives'];records=metadata(archives)
    for archive in archives:
        done=db.execute('SELECT sha256 FROM applied WHERE name=?',(archive['name'],)).fetchone()
        if done:
            if done[0]!=archive['sha256']:raise ValueError('Financial archive changed')
            continue
        if sha(archive['path'])!=archive['sha256']:raise ValueError('Financial archive digest mismatch')
        count=0
        with db,zipfile.ZipFile(archive['path']) as z:
            for member in z.infolist():
                if '__MACOSX' in member.filename or Path(member.filename).name.startswith('~$'):continue
                if member.filename.lower().endswith('.doc'):
                    db.execute('INSERT INTO rejected VALUES(?,?,?)',(archive['name'],member.filename,'Legacy binary DOC requires a separate converter'))
                    continue
                if not member.filename.lower().endswith(('.html','.htm','.docx')):continue
                if member.file_size>MAX_XML:raise ValueError('Oversized financial judgment')
                try:row=parse_html(z.read(member),member.filename,archive,records)
                except (ValueError,LookupError,zipfile.BadZipFile,ET.ParseError) as exc:
                    db.execute('INSERT INTO rejected VALUES(?,?,?)',(archive['name'],member.filename,str(exc)));continue
                if row['decision_date']>as_of:continue
                db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?,?,?)',
                    (row['id'],row['kind'],row['source_id'],row['number'],row['title'],row['decision_date'],json.dumps(row,ensure_ascii=False)))
                count+=1
            db.execute('INSERT INTO applied VALUES(?,?,?)',(archive['name'],archive['sha256'],json.dumps(dict(upserted=count))))
        print(archive['name'],count,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    acquire(parser.parse_args().output)
