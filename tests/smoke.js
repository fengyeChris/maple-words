// Run with the same Node version used to install better-sqlite3.
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert/strict');
const {spawn} = require('child_process');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maple-words-test-'));
const port = Number(process.env.QA_PORT || 5193);
const base = `http://127.0.0.1:${port}`;
let child;
(async()=>{
 try {
  const source = new Database(path.join(root, 'data/content.sqlite'), {readonly:true});
  await source.backup(path.join(temp, 'content.sqlite')); source.close();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),CONTENT_DB:path.join(temp,'content.sqlite'),STATE_FILE:path.join(temp,'state.json')},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
   const timeout = setTimeout(()=>reject(new Error('Server startup timed out')),15000);
   child.stdout.on('data', data=>{if(data.toString().includes('运行于')){clearTimeout(timeout);resolve();}});
   child.once('error', e=>{clearTimeout(timeout);reject(e);});
   child.once('exit', code=>{clearTimeout(timeout);reject(new Error('Server exited '+code));});
   child.stderr.on('data', data=>process.stderr.write(data));
  });
  const get = async url=>{const res=await fetch(base+url);assert.equal(res.status,200,url);return res.json();};
  const courses = await get('/api/courses'); assert.equal(courses.length,6);
  const core = courses.find(c=>c.id===4); assert.equal(core.total_words,2078); assert.equal(core.units.length,42);
  assert.equal(core.learned,0);
  const words=[];
  for(const u of core.units){assert.equal(u.membership_locked,false);const batch=await get(`/api/courses/4/units/${u.id}/words`);assert.equal(batch.length,u.total_words);words.push(...batch);}
  assert.equal(words.length,2078);
  assert.equal(new Set(words.map(w=>w.word.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim())).size,2078);
  assert.equal(words[0].word,'trade'); assert.equal(words[0].id,3890); assert.equal(words.at(-1).word,'allowance');
  for(const page of ['/', '/flashCard.html', '/writeItInEnglish.html', '/englishToMeaning.html', '/wordMatchGame.html', '/myNotes.html']){
   const res=await fetch(base+page);assert.equal(res.status,200);assert.match(await res.text(),/枫叶单词/);
  }
  for(const [url,type] of [['/favicon.ico','image/x-icon'],['/assets/maple-icon-192.png','image/png'],['/manifest.webmanifest','application/manifest+json']]){
   const res=await fetch(base+url);assert.equal(res.status,200);assert.ok(res.headers.get('content-type').startsWith(type));assert.ok((await res.arrayBuffer()).byteLength>100);
  }
  const exportPack=await get('/api/library/export/4');assert.equal(exportPack.schema,'wordbook/v1');
  assert.equal(exportPack.units.reduce((n,u)=>n+u.words.length,0),2078);
  assert.equal(fs.existsSync(path.join(temp,'state.json')),false,'Read-only tests must not create learning records');
  console.log('PASS: isolated runtime + SQLite, six books, 2078 unique core words / 42 units, blank progress, export, pages, icons and manifest.');
 } finally {
  if(child && child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
