// Verify the old-database upgrade and lexical fields through real HTTP APIs.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {spawn}=require('child_process'),Database=require('better-sqlite3');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'maple-lexical-'));
const dbFile=path.join(temp,'content.sqlite'),stateFile=path.join(temp,'state.json');
const base='http://127.0.0.1:'+Number(process.env.QA_PORT || 5197);
let child;
const stop=async()=>{if(child && child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}};
async function start(){
  child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(Number(process.env.QA_PORT || 5197)),CONTENT_DB:dbFile,STATE_FILE:stateFile},stdio:['ignore','pipe','inherit']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);child.stdout.on('data',d=>{if(d.toString().includes('运行于')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});child.once('error',reject);});
}
async function get(url){const r=await fetch(base+url);assert.equal(r.status,200,url);return r.json();}
async function post(pack,status=201){const r=await fetch(base+'/api/library/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pack)});assert.equal(r.status,status);return r.json();}
(async()=>{try{
  const source=new Database(path.join(root,'data/content.sqlite'),{readonly:true});await source.backup(dbFile);source.close();
  const old=new Database(dbFile);
  if(old.prepare('PRAGMA table_info(words)').all().some(c=>c.name==='synonyms_json'))old.exec('ALTER TABLE words DROP COLUMN synonyms_json');
  if(old.prepare("SELECT 1 FROM sqlite_master WHERE name='content_migrations'").get())old.exec('DELETE FROM content_migrations');
  const original=old.prepare('SELECT id,unit_id,word,meaning,phonetic,pos FROM words ORDER BY id').all();old.close();
  const fixture={users:[],progress:{'local-user:4:154':{studied_ids:[3890],correct:1,wrong:0}},actions:{'local-user:3890':{favorite:true,unknown:false,fuzzy:true}},books:[]};
  const stateText=JSON.stringify(fixture);fs.writeFileSync(stateFile,stateText);
  await start();
  const core=await get('/api/library/export/4'),words=core.units.flatMap(u=>u.words);
  assert.equal(words.length,2078);assert.equal(new Set(words.map(w=>w.word.toLowerCase())).size,2078);
  assert.equal(words.filter(w=>w.synonyms.length).length,1775);
  const jewellery=words.find(w=>w.word==='jewellery'),transition=words.find(w=>w.word==='transition');
  assert.deepEqual(jewellery.synonyms,['jewelry']);assert.deepEqual(transition.synonyms,['passage']);
  assert.deepEqual(words[0].synonyms,['merchandise']);assert.equal(words[0].id,3890);
  for(const word of words){assert.ok(word.synonyms.every(s=>s.toLowerCase()!==word.word.toLowerCase()));assert.equal(new Set(word.synonyms.map(s=>s.toLowerCase())).size,word.synonyms.length);}
  assert.deepEqual((await get('/api/words/'+jewellery.id)).synonyms,jewellery.synonyms);
  const unit=await get('/api/courses/4/units/'+jewellery.unit_id+'/words');assert.deepEqual(unit.find(w=>w.id===jewellery.id).synonyms,['jewelry']);
  assert.deepEqual((await get('/api/search?q=jewellery')).find(w=>w.id===jewellery.id).synonyms,['jewelry']);
  const upgraded=new Database(dbFile);assert.deepEqual(upgraded.prepare('SELECT id,unit_id,word,meaning,phonetic,pos FROM words ORDER BY id').all(),original);upgraded.close();
  assert.equal(fs.readFileSync(stateFile,'utf8'),stateText,'Lexical migration must leave learning records unchanged');
  const custom={schema:'wordbook/v1',book:{key:'lexical-qa',title:'Lexical QA'},units:[{key:'one',words:[{word:'Sample',meaning:'测试',phonetic:'/sɑːmpl/',pos:'n.',synonyms:['Sample','EXAMPLE','example','case','<img src=x onerror=alert(1)>']}]}]};
  const result=await post(custom);const exported=await get('/api/library/export/'+result.id);
  const imported=exported.units[0].words[0];assert.deepEqual(imported.synonyms,['EXAMPLE','case','<img src=x onerror=alert(1)>']);
  await post(exported);assert.equal((await get('/api/library/export/'+result.id)).units[0].words[0].id,imported.id);
  for(const invalid of ['not-an-array',[{}],[''],Array(31).fill('case')]){
    const bad=JSON.parse(JSON.stringify(custom));bad.units[0].words[0].synonyms=invalid;await post(bad,400);
    assert.deepEqual((await get('/api/words/'+imported.id)).synonyms,imported.synonyms,'Invalid imports must roll back');
  }
  delete custom.units[0].words[0].synonyms;await post(custom);assert.deepEqual((await get('/api/words/'+imported.id)).synonyms,[],'Old packages remain supported');
  await stop();await start();assert.equal((await get('/api/words/'+jewellery.id)).id,jewellery.id);
  assert.equal(fs.readFileSync(stateFile,'utf8'),stateText);
  const final=new Database(dbFile);assert.equal(final.prepare("SELECT COUNT(*) n FROM content_migrations WHERE key='cet6-wordnet3-v1'").get().n,1);final.close();
  console.log('PASS: old-schema migration; all 2078 IDs, meanings, phonetics, parts of speech and learning records preserved; 1775 offline synonym entries; unit/detail/search/export consistency; import round trip, normalization, backward compatibility, invalid import rollback and idempotent restart.');
}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
