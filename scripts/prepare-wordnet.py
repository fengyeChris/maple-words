"""Build offline CET6 synonyms from Princeton WordNet 3.0, in sense order."""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / ('resources/cet6-core' if (ROOT / 'resources/cet6-core').exists() else 'outputs/resources/cet6-core')
COMMIT = '96f9b3252457a2b97e52aec64c3dfceeb5c312d5'
SOURCE = f'https://raw.githubusercontent.com/nltk/nltk_data/{COMMIT}/packages/corpora/wordnet.zip'
EXPECTED_SHA = 'cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59'


def main():
    archive = Path(sys.argv[1]) if len(sys.argv) > 1 else DEST / 'wordnet-3.0.zip'
    raw = archive.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_SHA:
        raise ValueError('WordNet archive SHA-256 mismatch')
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError('WordNet archive CRC check failed')
        license_text = z.read('wordnet/LICENSE').decode('utf8')
        if 'WordNet Release 3.0' not in license_text:
            raise ValueError('Expected WordNet 3.0')
        indices, synsets = {}, {}
        for label in ('noun', 'verb', 'adj', 'adv'):
            index = {}
            for line in z.read('wordnet/index.' + label).decode('utf8').splitlines():
                if not line or line.startswith(' '):
                    continue
                fields = line.split()
                start = 6 + int(fields[3])
                index[fields[0]] = fields[start:start + int(fields[2])]
            indices[label] = index
            senses = {}
            for line in z.read('wordnet/data.' + label).decode('utf8').splitlines():
                if not line or line.startswith(' '):
                    continue
                fields = line.split(' | ', 1)[0].split()
                senses[fields[0]] = [fields[4 + i * 2].replace('_', ' ') for i in range(int(fields[3], 16))]
            synsets[label] = senses
    with zipfile.ZipFile(DEST / 'CET6_2.zip') as z:
        rows = [json.loads(line) for line in z.read('CET6_2.json').decode('utf8').splitlines() if line.strip()]
    entries = {}
    mapping = {'n': 'noun', 'v': 'verb', 'vt': 'verb', 'vi': 'verb', 'adj': 'adj', 'a': 'adj', 'adv': 'adv'}
    for row in rows:
        word = row['headWord']
        pos = row['content']['word']['content']['trans'][0].get('pos', '').rstrip('.')
        label = mapping.get(pos)
        terms = []
        if label:
            for offset in indices[label].get(word.lower().replace(' ', '_'), []):
                seen = {word.lower()}
                for term in synsets[label][offset]:
                    if not re.fullmatch(r"[A-Za-z][A-Za-z _'-]{0,127}", term) or term.lower() in seen:
                        continue
                    seen.add(term.lower())
                    terms.append(term)
                if terms:
                    break
        entries[word.lower()] = {'pos': pos + '.' if pos else '', 'synonyms': terms[:3]}
    result = {'schema': 'word-relations/v1', 'source': 'Princeton WordNet 3.0',
              'source_url': SOURCE, 'commit': COMMIT, 'archive_sha256': hashlib.sha256(raw).hexdigest(),
              'selection': 'First sense with synonyms in WordNet index order, matching the displayed part of speech; up to three terms. Missing entries remain empty.',
              'words': entries}
    (DEST / 'wordnet-synonyms.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    (DEST / 'WordNet-LICENSE.txt').write_text(license_text, encoding='utf8')
    (ROOT / 'public/assets/WordNet-LICENSE.txt').write_text(license_text, encoding='utf8')
    print(json.dumps({'source': result['source'], 'archive_sha256': result['archive_sha256'],
                      'words': len(entries), 'with_synonyms': sum(bool(e['synonyms']) for e in entries.values()),
                      'samples': {w: entries[w] for w in ('jewellery', 'transition', 'trade')}}, ensure_ascii=True))


if __name__ == '__main__':
    main()
