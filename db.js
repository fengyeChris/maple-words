const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const DATA = path.join(__dirname, 'data');
const dbPath = process.env.CONTENT_DB || path.join(DATA, 'content.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec([
"CREATE TABLE IF NOT EXISTS books(id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, total_words INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '', cover_url TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'local', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE, key TEXT NOT NULL, order_index INTEGER NOT NULL, start_index INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, total_words INTEGER NOT NULL DEFAULT 0, membership_locked INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'local', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(book_id,order_index))",
"CREATE TABLE IF NOT EXISTS words(id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE, word TEXT NOT NULL, meaning TEXT NOT NULL DEFAULT '', phonetic TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '', example_en TEXT NOT NULL DEFAULT '', example_cn TEXT NOT NULL DEFAULT '', distractors_json TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'local', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
"CREATE INDEX IF NOT EXISTS idx_words_word ON words(word)",
"CREATE INDEX IF NOT EXISTS idx_words_unit ON words(unit_id)"
].join(';'));
function addColumn(table, name, definition) {
  if (!db.prepare('PRAGMA table_info('+table+')').all().some(c => c.name === name)) db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition);
}
for (const name of ['version', 'source_url', 'license']) addColumn('books', name, "TEXT NOT NULL DEFAULT ''");
addColumn('words', 'external_key', "TEXT NOT NULL DEFAULT ''");
addColumn('words', 'order_index', 'INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE TABLE IF NOT EXISTS id_counters(kind TEXT PRIMARY KEY,last_id INTEGER NOT NULL)');
function nextId(table) {
  const last=db.prepare('SELECT last_id FROM id_counters WHERE kind=?').get(table)?.last_id || 0;
  const value=Math.max(last,db.prepare('SELECT COALESCE(MAX(id),0) n FROM '+table).get().n)+1;
  db.prepare('INSERT INTO id_counters(kind,last_id) VALUES(?,?) ON CONFLICT(kind) DO UPDATE SET last_id=excluded.last_id').run(table,value);
  return value;
}
db.transaction(() => {
  db.prepare("DELETE FROM units WHERE source='legacy-json' AND NOT (book_id=4 AND id BETWEEN 154 AND 161)").run();
  db.prepare("DELETE FROM books WHERE source='legacy-json' AND id<>4").run();
  db.prepare("UPDATE books SET key='original-cet6-preview', title='英语六级核心词汇 · 已缓存8单元', description='原项目缓存的400词；此版本未导入完整词书。', total_words=(SELECT COUNT(*) FROM words w JOIN units u ON w.unit_id=u.id WHERE u.book_id=4) WHERE id=4 AND source='legacy-json'").run();
})();
function textField(value, field, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('词书格式错误：'+field);
  return value.trim();
}
function validatePack(pack) {
  if (!pack || pack.schema !== 'wordbook/v1' || !pack.book || !Array.isArray(pack.units) || !pack.units.length || pack.units.length > 4000) throw new Error('请选择有效的 wordbook/v1 JSON 词书包');
  const book = {};
  for (const [f, max, required] of [['key',120,true],['title',200,true],['description',2000,false],['version',100,false],['source_url',1000,false],['license',1000,false],['source',200,false]]) book[f] = textField(pack.book[f], 'book.'+f, max, required);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(book.key)) throw new Error('词书 key 只支持字母、数字、点、横线和下划线');
  const unitKeys = new Set(), bookWords = new Map(); let total = 0;
  const units = pack.units.map((u, i) => {
    if (!u || !Array.isArray(u.words) || !u.words.length || u.words.length > 1000) throw new Error('第'+(i+1)+'单元词条数量无效');
    const key = textField(u.key, 'unit.key', 120, true);
    if (unitKeys.has(key)) throw new Error('单元 key 重复'); unitKeys.add(key);
    const wordKeys = new Set();
    const words = u.words.map(w => {
      if (!w || typeof w !== 'object') throw new Error('词条格式错误');
      const result = {};
      for (const [f,max,required] of [['word',200,true],['meaning',12000,true],['phonetic',500,false],['pos',200,false],['example_en',6000,false],['example_cn',6000,false]]) result[f] = textField(w[f], f, max, required);
      const normalizedWord = result.word.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
      if (bookWords.has(normalizedWord)) throw new Error('词书有重复单词：'+result.word+'（单元 '+bookWords.get(normalizedWord)+' 和 '+key+'）');
      bookWords.set(normalizedWord, key);
      result.key = textField(w.key ?? result.word.toLowerCase(), 'word.key', 300, true);
      if (wordKeys.has(result.key)) throw new Error('单元 '+key+' 的词条 key 重复'); wordKeys.add(result.key);
      if (w.distractors != null && (!Array.isArray(w.distractors) || w.distractors.length > 10)) throw new Error('干扰项格式错误');
      result.distractors = (w.distractors || []).map(s => textField(s, 'distractor', 12000, true));
      return result;
    });
    total += words.length;
    return {key, title:textField(u.title || '第'+(i+1)+'单元', 'unit.title', 200, true), words};
  });
  if (total > 120000) throw new Error('单个词书最多120000词');
  return {book, units, total};
}
const importTransaction = db.transaction(({book, units, total}) => {
  let row = db.prepare('SELECT id FROM books WHERE key=?').get(book.key);
  if (!row) {row={id:nextId('books')};db.prepare('INSERT INTO books(id,key,title,sort_order) VALUES(?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM books))').run(row.id,book.key,book.title);}
  const id = row.id;
  db.prepare('UPDATE books SET title=@title,description=@description,version=@version,source_url=@source_url,license=@license,source=@source,total_words=@total,updated_at=CURRENT_TIMESTAMP WHERE id=@id').run({...book,total,id});
  const oldUnits = db.prepare('SELECT id,key FROM units WHERE book_id=?').all(id);
  db.prepare('UPDATE units SET order_index=-id WHERE book_id=?').run(id);
  const keptUnits = new Set(); let start=0;
  for (let i=0;i<units.length;i++) {
    const u=units[i]; let ur=oldUnits.find(x=>x.key===u.key);
    if (!ur) {ur={id:nextId('units')};db.prepare('INSERT INTO units(id,book_id,key,order_index,title) VALUES(?,?,?,?,?)').run(ur.id,id,u.key,i+1,u.title);}
    keptUnits.add(ur.id);
    db.prepare('UPDATE units SET order_index=?,start_index=?,title=?,total_words=?,source=?,membership_locked=0 WHERE id=?').run(i+1,start,u.title,u.words.length,book.source,ur.id);
    const oldWords=db.prepare('SELECT id,external_key,word FROM words WHERE unit_id=?').all(ur.id);
    const oldMap=new Map(oldWords.map(w=>[w.external_key || w.word.toLowerCase(),w.id]));
    const keptWords=new Set();
    for (let j=0;j<u.words.length;j++) {
      const w=u.words[j]; let wid=oldMap.get(w.key);
      if (!wid) {wid=nextId('words');db.prepare('INSERT INTO words(id,unit_id,word) VALUES(?,?,?)').run(wid,ur.id,w.word);}
      keptWords.add(wid);
      db.prepare('UPDATE words SET external_key=@key,word=@word,meaning=@meaning,phonetic=@phonetic,pos=@pos,example_en=@example_en,example_cn=@example_cn,distractors_json=@distractors_json,order_index=@order_index,source=@source,updated_at=CURRENT_TIMESTAMP WHERE id=@id').run({...w,distractors_json:JSON.stringify(w.distractors),order_index:j,source:book.source,id:wid});
    }
    for (const w of oldWords) if (!keptWords.has(w.id)) db.prepare('DELETE FROM words WHERE id=?').run(w.id);
    start+=u.words.length;
  }
  for (const u of oldUnits) if (!keptUnits.has(u.id)) db.prepare('DELETE FROM units WHERE id=?').run(u.id);
  return {id,key:book.key,title:book.title,total_words:total,unit_count:units.length};
});
function importPack(pack) { return importTransaction(validatePack(pack)); }
function mapWord(row) {
  if (!row) return null;
  const {distractors_json, ...rest}=row;
  return {...rest,distractors:JSON.parse(distractors_json || '[]')};
}
function getUnits(id) { return db.prepare('SELECT * FROM units WHERE book_id=? ORDER BY order_index').all(Number(id)).map(u=>({...u,membership_locked:false})); }
function getCourses() { return db.prepare('SELECT * FROM books ORDER BY sort_order,id').all().map(b=>({...b,units:getUnits(b.id)})); }
const wordSelect='SELECT w.*,u.book_id AS course_id FROM words w JOIN units u ON u.id=w.unit_id';
function getWords(bookId,unitId) { return db.prepare(wordSelect+' WHERE u.book_id=? AND u.id=? ORDER BY w.order_index,w.id').all(Number(bookId),Number(unitId)).map(mapWord); }
function getWordById(id) { return mapWord(db.prepare(wordSelect+' WHERE w.id=?').get(Number(id))); }
function searchWords(query,limit=30) {
  const q=String(query || '').trim(); if(!q) return [];
  const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  return db.prepare(wordSelect+" WHERE w.word LIKE ? ESCAPE '\\' OR w.meaning LIKE ? ESCAPE '\\' ORDER BY CASE WHEN lower(w.word)=lower(?) THEN 0 ELSE 1 END,w.word LIMIT ?").all(like,like,q,limit).map(mapWord);
}
function exportPack(id) {
  const book=db.prepare('SELECT * FROM books WHERE id=?').get(Number(id)); if(!book) return null;
  return {schema:'wordbook/v1',book,units:getUnits(id).map(u=>({key:u.key,title:u.title,words:getWords(id,u.id).map(w=>({...w,key:w.external_key || w.word.toLowerCase()}))}))};
}
if (!db.prepare('SELECT COUNT(*) n FROM books').get().n && !process.env.CONTENT_DB) {
  const cached=JSON.parse(fs.readFileSync(path.join(DATA,'course-4.json'),'utf8'));
  db.transaction(()=>{
    db.prepare("INSERT INTO books(id,key,title,total_words,description,source) VALUES(4,'original-cet6-preview','英语六级核心词汇 · 已缓存8单元',400,'原项目缓存的400词；此版本未导入完整词书。','legacy-json')").run();
    for(let i=0;i<cached.length;i++) {
      const u=cached[i]; db.prepare("INSERT INTO units(id,book_id,key,order_index,title,total_words,source) VALUES(?,4,?,?,?,?,'legacy-json')").run(u.unit_id,'u'+(i+1),i+1,'第'+(i+1)+'单元',u.words.length);
      for(let j=0;j<u.words.length;j++) { const w=u.words[j]; db.prepare('INSERT INTO words(id,unit_id,word,meaning,phonetic,pos,example_en,example_cn,distractors_json,order_index) VALUES(?,?,?,?,?,?,?,?,?,?)').run(w.id,u.unit_id,w.word,w.meaning,w.phonetic||'',w.pos||'',w.example_en||'',w.example_cn||'',JSON.stringify(w.distractors||[]),j); }
    }
  })();
  const corePack = [path.join(__dirname,'resources','cet6-core','cet6-core.json'),path.join(__dirname,'outputs','resources','cet6-core','cet6-core.json')].find(file=>fs.existsSync(file));
  if(corePack) importPack(JSON.parse(fs.readFileSync(corePack,'utf8')));
}
module.exports={dbPath,db,getCourses,getUnits,getWords,getWordById,searchWords,importPack,exportPack,validatePack};
