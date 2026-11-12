"""Download a pinned ECDICT revision and build offline wordbook/v1 packs."""
import csv, hashlib, io, json, pathlib, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'outputs' / 'resources' / 'ecdict'
DEST.mkdir(parents=True, exist_ok=True)

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'LocalEnglishLibrary/1.1'})
    with urllib.request.urlopen(req, timeout=180) as res:
        return res.read()

revision_file = DEST / 'revision.json'
if not revision_file.exists():
    revision_file.write_bytes(fetch('https://api.github.com/repos/skywind3000/ECDICT/commits/master'))
revision = json.loads(revision_file.read_text('utf-8'))['sha']
base = f'https://raw.githubusercontent.com/skywind3000/ECDICT/{revision}'
for filename in ['LICENSE', 'README.md', 'ecdict.csv']:
    target = DEST / filename
    if not target.exists():
        print('Downloading', filename, flush=True)
        if filename == 'ecdict.csv':
            # Independent byte ranges allow retrying a slow or interrupted transfer.
            probe = urllib.request.Request(f'{base}/{filename}?probe=1', headers={'Range': 'bytes=0-0'})
            with urllib.request.urlopen(probe, timeout=60) as res:
                if res.status != 206:
                    raise RuntimeError('Source does not support validated range downloads')
                size = int(res.headers['Content-Range'].split('/')[-1])
            chunk_size = 2 * 1024 * 1024
            count = (size + chunk_size - 1) // chunk_size
            def download_part(i):
                start, end = i * chunk_size, min(size, (i+1)*chunk_size)-1
                part = DEST / f'ecdict.part{i}'
                if part.exists() and part.stat().st_size == end-start+1:
                    return
                request = urllib.request.Request(f'{base}/{filename}?part={i}', headers={'Range': f'bytes={start}-{end}'})
                for attempt in range(3):
                    try:
                        with urllib.request.urlopen(request, timeout=90) as res:
                            if res.headers.get('Content-Range') != f'bytes {start}-{end}/{size}':
                                raise RuntimeError('Invalid response byte range')
                            data = res.read()
                        if len(data) != end-start+1:
                            raise RuntimeError('Incomplete chunk')
                        part.write_bytes(data)
                        print('Chunk', i+1, '/', count, flush=True)
                        return
                    except Exception:
                        if attempt == 2:
                            raise
            with ThreadPoolExecutor(max_workers=12) as pool:
                list(pool.map(download_part, range(count)))
            partial = target.with_suffix('.csv.partial')
            with partial.open('wb') as out:
                for i in range(count):
                    out.write((DEST / f'ecdict.part{i}').read_bytes())
            partial.replace(target)
            continue
        req = urllib.request.Request(f'{base}/{filename}', headers={'User-Agent': 'LocalEnglishLibrary/1.1', 'Accept-Encoding': 'identity'})
        partial = target.with_suffix(target.suffix + '.partial')
        with urllib.request.urlopen(req, timeout=90) as res, partial.open('wb') as out:
            size = 0
            while True:
                chunk = res.read(1024*1024)
                if not chunk:
                    break
                out.write(chunk)
                size += len(chunk)
                if size % (5*1024*1024) == 0:
                    print('Downloaded', size // 1024 // 1024, 'MB', flush=True)
        partial.replace(target)
rows = list(csv.DictReader(io.StringIO((DEST / 'ecdict.csv').read_text('utf-8-sig'))))
print('Rows', len(rows), 'tags', Counter(t for r in rows for t in r.get('tag', '').split()), flush=True)
manifest = []
for tag, title in [('cet4', '大学英语四级'), ('cet6', '大学英语六级'), ('ky', '考研英语'), ('ielts', '雅思英语'), ('toefl', '托福英语')]:
    seen, words = set(), []
    for row in rows:
        word = row['word'].strip()
        meaning = row.get('translation', '').replace('\\n', '\n').strip()
        if tag not in row.get('tag', '').split() or not meaning or not word or word.lower() in seen:
            continue
        seen.add(word.lower())
        words.append({'key': word.lower(), 'word': word, 'meaning': meaning, 'phonetic': row.get('phonetic', ''), 'pos': row.get('pos', ''), 'example_en': '', 'example_cn': ''})
    words.sort(key=lambda w: w['word'].lower())
    pack = {'schema': 'wordbook/v1', 'book': {'key': 'ecdict-' + tag, 'title': title + ' · ECDICT', 'version': revision[:12], 'description': '基于 ECDICT 标签整理，按字母排序；不对应特定出版社版本。', 'source_url': 'https://github.com/skywind3000/ECDICT', 'license': 'MIT (see bundled LICENSE)', 'source': 'ECDICT', 'revision': revision}, 'units': [{'key': f'u{i // 50 + 1}', 'title': f'第{i // 50 + 1}单元', 'words': words[i:i+50]} for i in range(0, len(words), 50)]}
    filename = 'ecdict-' + tag + '.json'
    (DEST / filename).write_text(json.dumps(pack, ensure_ascii=False, indent=2), 'utf-8')
    manifest.append({'file': filename, 'title': pack['book']['title'], 'words': len(words), 'units': len(pack['units'])})
result = {'revision': revision, 'source_url': 'https://github.com/skywind3000/ECDICT', 'csv_sha256': hashlib.sha256((DEST / 'ecdict.csv').read_bytes()).hexdigest(), 'packs': manifest}
(DEST / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(result, ensure_ascii=False), flush=True)
