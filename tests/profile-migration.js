const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const {spawn} = require('child_process');
const Database = require('better-sqlite3');
const {mergeAnonymousProfiles,profileFromHeader,LOCAL_PROFILE} = require('../profiles');
const root = path.resolve(__dirname,'..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'maple-profiles-test-'));
const stateFile = path.join(temp,'state.json');
const port = Number(process.env.QA_PROFILE_PORT || 5194);
const base = `http://127.0.0.1:${port}`;
let child;

async function start() {
  child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),CONTENT_DB:path.join(temp,'content.sqlite'),STATE_FILE:stateFile},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server startup timed out')),15000);
    child.stdout.on('data',data=>{if(data.toString().includes('运行于')){clearTimeout(timer);resolve();}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code));});
    child.stderr.on('data',data=>process.stderr.write(data));
  });
}
async function stop() {
  if(child && child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
}
async function request(url,user,body) {
  const headers={'Content-Type':'application/json'};
  if(user) headers['X-Local-User']=user;
  const res=await fetch(base+url,{headers,...(body ? {method:'POST',body:JSON.stringify(body)} : {})});
  assert.ok(res.ok,url+' '+res.status);return res.json();
}

(async()=>{try{
  const source=new Database(path.join(root,'data/content.sqlite'),{readonly:true});
  const [a,b,c]=source.prepare('SELECT id FROM words WHERE unit_id=154 ORDER BY id LIMIT 3').all().map(w=>w.id);
  await source.backup(path.join(temp,'content.sqlite'));source.close();
  const progress=(user,ids,time,days)=>({user,course_id:4,unit_id:154,studied_ids:ids,updatedAt:time,days,correct:time,mode:'flash'});
  const action=(user,flags,time)=>({user,word_id:a,courseId:4,unitId:154,updatedAt:time,...flags});
  const initial={users:[{id:'account-test',username:'test',password:'test'}],progress:{
    'local-one:4:154':progress('local-one',[a,b],1,['2026-11-10']),
    'local-two:4:154':progress('local-two',[b,c],3,['2026-11-11']),
    'local-user:4:154':progress(LOCAL_PROFILE,[a],2,['2026-11-10']),
    'account-test:4:154':progress('account-test',[b],4,['2026-11-12'])
  },actions:{
    ['local-one:'+a]:action('local-one',{favorite:true,unknown:false},1),
    ['local-two:'+a]:action('local-two',{favorite:false,unknown:true,fuzzy:true},3),
    ['account-test:'+a]:action('account-test',{favorite:false},4)
  },books:[{id:'book-a',user:'local-book',name:'book',words:[a]},{id:'book-b',user:'account-test',name:'private',words:[b]}]};
  const before=JSON.stringify(initial,null,2);
  const merged=mergeAnonymousProfiles(initial);
  assert.equal(JSON.stringify(initial,null,2),before,'Migration must not mutate source');
  assert.equal(merged.mergedProfiles,3);
  assert.deepEqual(new Set(merged.state.progress['local-user:4:154'].studied_ids),new Set([a,b,c]));
  assert.deepEqual(merged.state.progress['local-user:4:154'].days,['2026-11-10','2026-11-11']);
  assert.equal(merged.state.progress['local-user:4:154'].correct,3,'Use latest score metadata');
  assert.deepEqual(merged.state.progress['account-test:4:154'],initial.progress['account-test:4:154']);
  assert.deepEqual(merged.state.users,initial.users);
  for(const flag of ['favorite','unknown','fuzzy']) assert.equal(merged.state.actions['local-user:'+a][flag],true);
  assert.equal(merged.state.books[0].user,LOCAL_PROFILE);
  assert.equal(merged.state.books[1].user,'account-test');
  assert.equal(mergeAnonymousProfiles(merged.state).mergedProfiles,0,'Migration is one-time');
  const registeredLegacy={users:[{id:'local-account'}],progress:{'local-account:4:154':progress('local-account',[a],1,[])},actions:{},books:[]};
  assert.equal(mergeAnonymousProfiles(registeredLegacy).mergedProfiles,0,'Registered IDs cannot be merged');
  assert.equal(profileFromHeader('local-account',registeredLegacy.users),'local-account');
  assert.equal(profileFromHeader('local-browser',[]),LOCAL_PROFILE);
  assert.equal(profileFromHeader(undefined,[]),LOCAL_PROFILE);
  assert.equal(profileFromHeader('qa-test',[]),'qa-test');
  const noOwner={users:[],progress:{'local-old:4:154':{studied_ids:[a]}},actions:{['local-old:'+a]:{favorite:true}},books:[]};
  assert.deepEqual(mergeAnonymousProfiles(noOwner).state.progress['local-user:4:154'].studied_ids,[a]);

  fs.writeFileSync(stateFile,before);
  await start();
  const backups=fs.readdirSync(path.join(temp,'backups'));
  assert.equal(backups.length,1);
  assert.equal(fs.readFileSync(path.join(temp,'backups',backups[0]),'utf8'),before,'Backup must preserve original bytes');
  for(const id of [undefined,LOCAL_PROFILE,'local-one','local-two','local-newbrowser']){
    assert.equal((await request('/api/me',id)).id,LOCAL_PROFILE);
    assert.equal((await request('/api/dashboard',id)).learned,3);
    assert.equal((await request('/api/word-actions',id))[0].favorite,true);
  }
  assert.equal((await request('/api/dashboard','account-test')).learned,1);
  assert.equal((await request('/api/word-actions','account-test'))[0].favorite,false);
  await request('/api/word-actions','local-one',{word_id:a,favorite:false});
  assert.equal((await request('/api/word-actions','local-two'))[0].favorite,false,'Old open pages share flags');
  await request('/api/progress','local-two',{course_id:4,unit_id:154,studied_ids:[a,b,c,a]});
  assert.equal((await request('/api/dashboard')).learned,3,'Repeated words cannot inflate progress');
  await stop();await start();
  assert.equal(fs.readdirSync(path.join(temp,'backups')).length,1,'Restart must not migrate again');
  assert.equal((await request('/api/word-actions'))[0].favorite,false,'Removed marks must not reappear');
  assert.equal((await request('/api/dashboard','account-test')).learned,1,'Account stays independent');
  console.log('PASS: anonymous history union, exact backup, registered account isolation, old/new browser identity, deduplication, restart and mark removal.');
}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
