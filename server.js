const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const content = require('./db');
const {mergeAnonymousProfiles,profileFromHeader} = require('./profiles');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 5173);
const stateFile = process.env.STATE_FILE || path.join(DATA, 'state.json');

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return { users: [], progress: {}, actions: {}, books: [] }; }
}
function writeState(state) {
  fs.mkdirSync(path.dirname(stateFile), {recursive:true});
  const temporary=stateFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(state,null,2),'utf8');
  fs.renameSync(temporary,stateFile);
}
let state = readState();
const migration=mergeAnonymousProfiles(state);
if(migration.mergedProfiles){
  const backupDir=path.join(path.dirname(stateFile),'backups');
  fs.mkdirSync(backupDir,{recursive:true});
  const backup=path.join(backupDir,'state-before-shared-profile-'+Date.now()+'-'+process.pid+'.json');
  fs.copyFileSync(stateFile,backup,fs.constants.COPYFILE_EXCL);
  writeState(migration.state);state=migration.state;
}
function json(res, status, body) {
  const out = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(out);
}
function parseBody(req) { return new Promise((resolve, reject) => { let text = '', bytes=0; req.on('data', c => { bytes+=c.length; if(bytes>40*1024*1024) { reject(Object.assign(new Error('导入文件不能超过40MB'),{status:413})); return; } text+=c; }); req.on('error',reject); req.on('end', () => { try { resolve(text ? JSON.parse(text) : {}); } catch (e) { reject(Object.assign(new Error('JSON格式不正确'),{status:400})); } }); }); }
function idFrom(req) { return profileFromHeader(req.headers['x-local-user'],state.users); }
function publicCourses(user) {
  return content.getCourses().map(c => {
    const units=c.units.map(u=>{ const p=state.progress[progressKey(user,c.id,u.id)]; const valid=new Set(p?.studied_ids?.length ? content.getWords(c.id,u.id).map(w=>w.id) : []); const learned=(p?.studied_ids || []).filter(id=>valid.has(id)).length; return {...u,learned,percent:Math.min(100,Math.round(learned*100/(u.total_words || 1)))}; });
    const learned=units.reduce((n,u)=>n+u.learned,0);
    return {...c,units,learned,percent:Math.min(100,Math.round(learned*100/(c.total_words || 1)))};
  });
}
function wordsFor(courseId, unitId) {
  return content.getWords(courseId, unitId);
}
function progressKey(user, course, unit) { return `${user}:${course}:${unit}`; }
function actionKey(user, wordId) { return `${user}:${wordId}`; }
function courseOverview(user, courseId) {
  const course=publicCourses(user).find(c=>c.id===courseId);
  if(!course) return null;
  const today=new Date().toLocaleDateString('en-CA');
  let todayKnown=true,correct=0,wrong=0;
  const todayIds=new Set();
  const previews=content.db.prepare('SELECT w.id,w.unit_id,w.word FROM words w JOIN units u ON u.id=w.unit_id WHERE u.book_id=? ORDER BY u.order_index,w.order_index,w.id').all(courseId);
  const valid=new Set(previews.map(w=>w.id)),byUnit=new Map();
  for(const word of previews){if(!byUnit.has(word.unit_id))byUnit.set(word.unit_id,[]);const list=byUnit.get(word.unit_id);if(list.length<5)list.push(word.word);}
  for(const unit of course.units){
    const p=state.progress[progressKey(user,courseId,unit.id)];
    unit.preview=byUnit.get(unit.id) || [];
    if(!p)continue;
    for(const id of p.daily_studied?.[today] || [])if(valid.has(id))todayIds.add(id);
    if(p.daily_incomplete?.[today] || (p.days?.includes(today) && !p.daily_studied?.[today]))todayKnown=false;
    correct+=Math.max(0,Number(p.correct)||0);wrong+=Math.max(0,Number(p.wrong)||0);
  }
  const actions=Object.values(state.actions).filter(a=>a.user===user && valid.has(a.word_id));
  return {...course,stats:{favorite:actions.filter(a=>a.favorite).length,learned:course.learned,today:todayKnown ? todayIds.size : null,accuracy:correct+wrong ? Math.round(correct*100/(correct+wrong)) : null},review:{fuzzy:actions.filter(a=>a.fuzzy).map(a=>content.getWordById(a.word_id)),unknown:actions.filter(a=>a.unknown).map(a=>content.getWordById(a.word_id))}};
}
function saveProgress(user,b) {
  const key=progressKey(user,b.course_id,b.unit_id),old=state.progress[key] || {};
  const valid=new Set(wordsFor(b.course_id,b.unit_id).map(w=>w.id));
  if(!valid.size)throw Object.assign(new Error('单元不存在'),{status:400});
  const submitted=(Array.isArray(b.studied_ids)?b.studied_ids:[]).filter(id=>valid.has(id));
  const studied_ids=[...new Set([...(old.studied_ids || []),...submitted])].filter(id=>valid.has(id));
  const day=new Date().toLocaleDateString('en-CA'),days=[...new Set([...(old.days || []),day])];
  const daily_studied={...(old.daily_studied || {})},daily_incomplete={...(old.daily_incomplete || {})};
  if((old.days || []).includes(day) && !daily_studied[day])daily_incomplete[day]=true;
  // Only the current event belongs to today; a session may span midnight.
  const eventIds=valid.has(b.event_word_id) ? [b.event_word_id] : submitted.filter(id=>!(old.studied_ids || []).includes(id));
  daily_studied[day]=[...new Set([...(daily_studied[day] || []),...eventIds])].filter(id=>valid.has(id));
  state.progress[key]={...old,course_id:Number(b.course_id),unit_id:Number(b.unit_id),mode:String(b.mode || ''),answered:Math.max(0,Number(b.answered)||0),correct:Math.max(0,Number(b.correct)||0),wrong:Math.max(0,Number(b.wrong)||0),studied_ids,days,daily_studied,daily_incomplete,user,updatedAt:Date.now()};
  writeState(state);return state.progress[key];
}
function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' };
  fs.readFile(filePath, (err, content) => { if (err) return sendFile(res, path.join(PUBLIC, 'index.html')); res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); res.end(content); });
}
function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const user = idFrom(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Local-User' }); return res.end(); }
  if (p === '/api/courses' && req.method === 'GET') return json(res, 200, publicCourses(user));
  const overviewMatch=p.match(/^\/api\/courses\/(\d+)\/overview$/);
  if(overviewMatch && req.method==='GET'){const overview=courseOverview(user,Number(overviewMatch[1]));return json(res,overview?200:404,overview || {message:'词书不存在'});}
  const bookWordsMatch=p.match(/^\/api\/courses\/(\d+)\/words$/);
  if(bookWordsMatch && req.method==='GET'){const course=content.getCourses().find(c=>c.id===Number(bookWordsMatch[1]));return json(res,course?200:404,course ? course.units.flatMap(u=>wordsFor(course.id,u.id)) : {message:'词书不存在'});}
  if (p === '/api/library/import' && req.method === 'POST') return parseBody(req).then(pack=>{ try { return json(res,201,content.importPack(pack)); } catch(e) { return json(res,400,{message:e.message}); } });
  const exportMatch=p.match(/^\/api\/library\/export\/(\d+)$/);
  if(exportMatch && req.method==='GET') { const pack=content.exportPack(exportMatch[1]); if(!pack) return json(res,404,{message:'词书不存在'}); res.setHeader('Content-Disposition',`attachment; filename="${pack.book.key}.json"`); return json(res,200,pack); }
  if (p.match(/^\/api\/courses\/\d+\/units$/) && req.method === 'GET') {
    const id = Number(p.split('/')[3]); const c = publicCourses(user).find(x => x.id === id); return json(res, 200, c ? c.units : []);
  }
  const wordsMatch = p.match(/^\/api\/courses\/(\d+)\/units\/(\d+)\/words$/);
  if (wordsMatch && req.method === 'GET') return json(res, 200, wordsFor(wordsMatch[1], wordsMatch[2]));
  const wordMatch = p.match(/^\/api\/words\/(\d+)$/);
  if (wordMatch && req.method === 'GET') {
    const word = content.getWordById(wordMatch[1]);
    return json(res, word ? 200 : 404, word || { message: '单词不存在，可能已从词书中移除' });
  }
  const statsMatch = p.match(/^\/api\/courses\/(\d+)\/units\/(\d+)\/stats$/);
  if (statsMatch && req.method === 'GET') {
    const actions = Object.values(state.actions).filter(a => a.user === user && a.courseId === Number(statsMatch[1]) && a.unitId === Number(statsMatch[2]));
    return json(res, 200, { fuzzy: actions.filter(a => a.fuzzy).map(a => a.word_id), unknown: actions.filter(a => a.unknown).map(a => a.word_id), favorite: actions.filter(a => a.favorite).map(a => a.word_id) });
  }
  if (p === '/api/me' && req.method === 'GET') return json(res, 200, { id: user, display_name: user === 'local-user' ? '本地学习者' : user, phone: '' });
  if (p === '/api/membership' || p === '/api/membership/plans') return json(res, 404, { error: 'membership_disabled' });
  if (p === '/api/auth/register' && req.method === 'POST') return parseBody(req).then(b => { if (!b.username || !b.password) return json(res, 400, { message: '请输入用户名和密码' }); if (state.users.some(x => x.username === b.username)) return json(res, 409, { message: '用户名已存在' }); const u = { id: crypto.randomUUID(), username: b.username, password: b.password, createdAt: Date.now() }; state.users.push(u); writeState(state); return json(res, 200, { access_token: u.id, user: { id: u.id, display_name: u.username } }); });
  if (p === '/api/auth/login' && req.method === 'POST') return parseBody(req).then(b => { const u = state.users.find(x => x.username === b.username && x.password === b.password); if (!u) return json(res, 401, { message: '用户名或密码不正确' }); return json(res, 200, { access_token: u.id, user: { id: u.id, display_name: u.username } }); });
  if (p === '/api/auth/logout' && req.method === 'POST') return json(res, 200, { ok: true });
  if (p === '/api/progress' && req.method === 'POST') return parseBody(req).then(b=>json(res,200,saveProgress(user,b)));
  if (p === '/api/word-actions' && req.method === 'POST') return parseBody(req).then(b => { const key = actionKey(user, b.word_id); state.actions[key] = { ...(state.actions[key] || {}), ...b, user, updatedAt: Date.now() }; writeState(state); return json(res, 200, state.actions[key]); });
  if (p === '/api/word-actions' && req.method === 'GET') { const actions = Object.values(state.actions).filter(a => a.user === user); return json(res, 200, actions.map(a => ({ ...a, word: content.getWordById(a.word_id) })).filter(a => a.word)); }
  if (p === '/api/user/books' && req.method === 'GET') return json(res, 200, state.books.filter(b => b.user === user));
  if (p === '/api/user/books' && req.method === 'POST') return parseBody(req).then(b => { const book = { id: crypto.randomUUID(), user, name: b.name || '我的词书', words: Array.isArray(b.words) ? b.words : [], createdAt: Date.now() }; state.books.push(book); writeState(state); return json(res, 201, book); });
  if (p === '/api/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim(); return json(res, 200, content.searchWords(q, 30));
  }
  if (p === '/api/dashboard' && req.method === 'GET') {
    const progress = Object.values(state.progress).filter(x => x.user === user); const actions = Object.values(state.actions).filter(x => x.user === user && content.getWordById(x.word_id)); const days=new Set(progress.flatMap(x=>x.days || [])); let streak=0,day=new Date(); if(!days.has(day.toLocaleDateString('en-CA'))) day.setDate(day.getDate()-1); while(days.has(day.toLocaleDateString('en-CA'))) { streak++;day.setDate(day.getDate()-1); } const learned=publicCourses(user).reduce((n,c)=>n+c.learned,0); const last=progress.sort((a,b)=>b.updatedAt-a.updatedAt)[0]; return json(res, 200, { streak,learned,last, favorite: actions.filter(x => x.favorite).length, fuzzy: actions.filter(x => x.fuzzy).length, unknown: actions.filter(x => x.unknown).length });
  }
  if(p.startsWith('/api/')) return json(res,404,{message:'接口不存在'});
  const file = path.join(PUBLIC, p === '/' ? 'index.html' : p.replace(/^\//, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendFile(res, path.join(PUBLIC, 'index.html'));
  return sendFile(res, file);
}

http.createServer((req, res) => { if(req.method!=='GET' && req.method!=='OPTIONS' && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return json(res,403,{message:'请从本地软件页面操作'}); Promise.resolve().then(()=>route(req, res)).catch(err => { console.error(err); if(!res.headersSent) json(res, err.status || 500, { message: err.status ? err.message : '本地服务发生错误' }); }); }).listen(PORT, '127.0.0.1', () => {
  console.log(`枫叶单词运行于 http://127.0.0.1:${PORT}`);
  if(migration.mergedProfiles) console.log('已合并 '+migration.mergedProfiles+' 份匿名浏览器记录，原记录已备份。');
});
