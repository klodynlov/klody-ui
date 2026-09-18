"""Acquire the latest DILA stocks and every subsequent published update.

No credentials, browser state or third-party mirrors are used. Each completed
file has a digest; an interrupted transfer is never treated as a valid archive.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
from urllib.request import Request, urlopen

BASE = 'https://echanges.dila.gouv.fr/OPENDATA/'
FUNDS = ('LEGI', 'CONSTIT', 'CASS', 'INCA', 'CAPP', 'JADE')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def write_json(path, data):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def archive_stamp(name):
    return re.search(r'(\d{8}-\d{6})\.tar\.gz$', name).group(1)


def inventory(fund, raw):
    url = BASE + fund + '/'
    with urlopen(url, timeout=60) as response:
        listing = response.read(4 * 1024 * 1024).decode('utf-8')
    (raw / (fund + '-listing.html')).write_text(listing)
    names = sorted(set(re.findall(r'href="([A-Za-z0-9_-]+\.tar\.gz)"', listing)))
    stocks = [n for n in names if '_global_' in n]
    if not stocks:
        raise ValueError('No global stock: ' + fund)
    stock = max(stocks, key=archive_stamp)
    selected = [stock] + sorted((n for n in names if '_global_' not in n and
                                archive_stamp(n) > archive_stamp(stock)), key=archive_stamp)
    return [dict(fund=fund, name=n, url=url+n, stamp=archive_stamp(n),
                 global_stock='_global_' in n) for n in selected]


def download(row, raw):
    path = raw / row['name']
    receipt = path.with_suffix(path.suffix + '.json')
    if path.exists() and receipt.exists():
        saved = json.loads(receipt.read_text())
        if saved['url'] == row['url'] and saved['sha256'] == sha(path):
            return saved
    partial = path.with_suffix(path.suffix + '.partial')
    with urlopen(Request(row['url'], headers={'User-Agent': 'KlodyLegalCorpus/1.0'}), timeout=180) as response:
        expected = int(response.headers.get('Content-Length', '0'))
        with partial.open('wb') as out:
            shutil.copyfileobj(response, out, 1024 * 1024)
    if expected and partial.stat().st_size != expected:
        raise ValueError('Truncated transfer: ' + row['name'])
    with partial.open('rb') as f:
        expected_magic = b'PK' if row['name'].endswith('.zip') else b'\x1f\x8b'
        if f.read(2) != expected_magic:
            raise ValueError('Invalid archive header: ' + row['name'])
    partial.replace(path)
    result = dict(row, path=str(path.resolve()), bytes=path.stat().st_size,
                  sha256=sha(path), retrieved_at=datetime.now(timezone.utc).isoformat())
    write_json(receipt, result)
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--funds', nargs='+', choices=FUNDS, default=list(FUNDS))
    p.add_argument('--workers', type=int, default=3)
    args = p.parse_args()
    raw = args.output / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    rows = [r for fund in args.funds for r in inventory(fund, raw)]
    plan = dict(inventoried_at=datetime.now(timezone.utc).isoformat(), archives=rows,
                source=BASE, scope='Published DILA stocks and updates; not all French judgments')
    write_json(args.output / 'download_plan.json', plan)
    print('Planned archives:', len(rows), flush=True)
    complete, errors = [], []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        pending = {pool.submit(download, r, raw): r for r in rows}
        for future in as_completed(pending):
            row = pending[future]
            try:
                complete.append(future.result())
                print(f"{len(complete)}/{len(rows)} {row['name']}", flush=True)
            except Exception as exc:
                errors.append(dict(name=row['name'], error=str(exc)))
                print('FAILED', row['name'], str(exc), flush=True)
            write_json(args.output / 'download_status.json', dict(expected=len(rows),
                       completed=len(complete), errors=errors, bytes=sum(r['bytes'] for r in complete)))
    if errors:
        raise SystemExit('Acquisition incomplete; rerun to resume verified files')
    complete.sort(key=lambda r: (not r['global_stock'], r['stamp'], r['fund']))
    write_json(args.output / 'archives.json', dict(**{k:v for k,v in plan.items() if k != 'archives'}, archives=complete))


if __name__ == '__main__':
    main()
