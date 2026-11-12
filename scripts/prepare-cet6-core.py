"""Restore the CET6 core book from a pinned public archive, checking cached data.

Usage: python scripts/prepare-cet6-core.py [path/to/CET6_2.zip]
This builds a wordbook/v1 package; import it using scripts/import-pack.js.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'outputs/resources/cet6-core'
COMMIT = '3992bcb94c800a2fd38a9fd6ff95b2353e755363'
SOURCE_URL = f'https://raw.githubusercontent.com/kajweb/dict/{COMMIT}/book/1524052554766_CET6_2.zip'
EXPECTED_SHA = 'fe12c5a331510e86da4a187a829d9d72e2785588e60ce45d830f349c30fc3866'


def normalize(word):
    return ' '.join(unicodedata.normalize('NFKC', word).lower().split())


def project(row):
    content = row['content']['word']['content']
    trans = content['trans'][0]
    sentences = content.get('sentence', {}).get('sentences', [])
    sentence = sentences[0] if sentences else {}
    pos = trans.get('pos', '')
    return {
        'key': row['headWord'].lower(),
        'word': row['headWord'],
        'meaning': trans['tranCn'],
        'pos': pos.rstrip('.') + '.' if pos else '',
        'phonetic': content.get('ukphone') or content.get('usphone') or content.get('phone') or '',
        'example_en': sentence.get('sContent', ''),
        'example_cn': sentence.get('sCn', ''),
        'distractors': [],
    }


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEST / 'CET6_2.zip'
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_SHA:
        raise ValueError('Source archive SHA-256 mismatch')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if archive.testzip() is not None:
            raise ValueError('Archive CRC check failed')
        rows = [json.loads(line) for line in archive.read('CET6_2.json').decode('utf-8-sig').splitlines() if line.strip()]
    if len(rows) != 2078 or [r['wordRank'] for r in rows] != list(range(1, 2079)):
        raise ValueError('Unexpected book length or order')
    if any(row['bookId'] != 'CET6_2' for row in rows):
        raise ValueError('Mixed source books')
    words = [project(row) for row in rows]
    seen = {}
    for rank, word in enumerate(words, 1):
        key = normalize(word['word'])
        if key in seen:
            raise ValueError(f"Duplicate word: {word['word']} at {seen[key]} and {rank}")
        seen[key] = rank
        if not word['meaning'].strip():
            raise ValueError(f'Missing translation at {rank}')

    # Keep the original examples, phonetics and distractors in the 400-word cache.
    # This also preserves every unit/word key used by the original local database.
    cached_units = json.loads((ROOT / 'data/course-4.json').read_text(encoding='utf-8-sig'))
    cached = [word for unit in cached_units for word in unit['words']]
    if len(cached) != 400:
        raise ValueError('Expected the original eight 50-word units')
    compared_fields = ('word', 'meaning', 'pos')
    for rank, (original, recovered) in enumerate(zip(cached, words), 1):
        for field in compared_fields:
            if original.get(field, '') != recovered.get(field, ''):
                raise ValueError(f'Original cache differs at {rank}, field {field}')
        for field in ('phonetic', 'example_en', 'example_cn', 'distractors'):
            recovered[field] = original.get(field, [] if field == 'distractors' else '')
    units = [{'key': f'u{index // 50 + 1}', 'title': f'第{index // 50 + 1}单元', 'words': words[index:index + 50]}
             for index in range(0, len(words), 50)]
    pack = {
        'schema': 'wordbook/v1',
        'book': {
            # Existing key intentionally retained so installing updates course 4.
            'key': 'original-cet6-preview',
            'title': '英语六级核心词汇',
            'version': 'CET6_2-2078-2026-11-12',
            'description': '2078个不重复词条，42单元；原缓存前400词保留，后1678词由公开CET6_2词库补齐。前400词的顺序、释义和词性已与原站缓存核对一致。',
            'source': 'beidanci365-cache+kajweb-CET6_2',
            'source_url': SOURCE_URL,
            'license': '前400词来自原项目缓存；其余来自kajweb/dict公开词库，仓库未见明确内容许可证。',
        },
        'units': units,
    }
    encoded = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
    package_file = DEST / 'cet6-core.json'
    package_file.write_text(encoded, encoding='utf-8')
    csv_file = DEST / '英语六级核心词汇-2078词.csv'
    with csv_file.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['序号', '单元', '单词', '词性', '释义', '音标', '英文例句', '中文例句'])
        for index, word in enumerate(words, 1):
            writer.writerow([index, (index - 1) // 50 + 1, word['word'], word['pos'], word['meaning'], word['phonetic'], word['example_en'], word['example_cn']])
    report = {
        'checked_at': '2026-11-12', 'book_title': pack['book']['title'],
        'source_url': SOURCE_URL, 'commit': COMMIT, 'archive_sha256': digest,
        'archive_bytes': len(raw), 'package_sha256': hashlib.sha256(encoded.encode('utf-8')).hexdigest(),
        'total_words': len(words), 'unique_normalized_words': len(seen), 'duplicates': [],
        'normalization': 'Unicode NFKC, lowercase, trim and collapse whitespace',
        'units': len(units), 'unit_sizes': [len(u['words']) for u in units],
        'cached_words_preserved': len(cached), 'recovered_words': len(words) - len(cached),
        'cache_comparison': {field: len(cached) for field in compared_fields},
        'meaning_present': sum(bool(w['meaning']) for w in words),
        'phonetic_present': sum(bool(w['phonetic']) for w in words),
        'bilingual_example_present': sum(bool(w['example_en'] and w['example_cn']) for w in words),
        'first_word': words[0]['word'], 'last_word': words[-1]['word'],
        'remote_limit': 'Original course 4 unit 162 returns HTTP 403 membership_required. Later original units were not retrieved.',
        'verification_boundary': 'All 400 accessible cached words match the public archive in order, translation and part of speech. The remaining 1678 entries are sourced from the pinned public archive; not individually verified against locked original units.',
    }
    (DEST / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (DEST / '来源说明.md').write_text(
        '# 英语六级核心词汇恢复说明\n\n'
        '原站 course_id=4 标题为“英语六级核心词汇”，接口标记2078词、42单元。'
        '原站“星火六级巧记速记（乱序版）”为2998词，是另一本书。\n\n'
        '本包保留原缓存前400词，后1678词取自公开 kajweb/dict 的 CET6_2。'
        '已逐条核对前400词的英文、顺序、释义和词性，全部一致。'
        '原站第9单元返回403会员限制，后34单元没有从原站下载，不能逐项保证与受限页面完全相同。\n\n'
        '整书2078个规范化唯一词条，无重复，无空释义；前41单元各50词，末单元28词。'
        '缺少的例句、音标留空，不生成占位内容。前400词的原例句和音标保留。\n\n'
        f'公开源固定提交：{COMMIT}\n\n下载地址：{SOURCE_URL}\n\nSHA-256：{digest}\n\n'
        '文件：cet6-core.json 可导入本地软件；CSV可人工核对；CET6_2.zip是完整上游源档；verification.json是数量、去重和一致性报告。\n\n'
        '上游仓库未见明确的词库内容许可证，保留来源记录，未认定为开放授权素材。\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('total_words', 'unique_normalized_words', 'units', 'cached_words_preserved', 'recovered_words', 'meaning_present', 'phonetic_present', 'bilingual_example_present')}, ensure_ascii=True))


if __name__ == '__main__':
    main()
